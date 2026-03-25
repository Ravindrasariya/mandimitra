import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireAdmin, hashPassword, comparePasswords } from "./auth";
import { format } from "date-fns";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "./db";
import { transactions, bids, buyers, lots, farmers, cashEntries, transactionEditHistory, lotEditHistory, insertAssetSchema, insertLiabilitySchema, type Farmer, type Transaction, type CashEntry } from "@shared/schema";
import { eq, and, inArray, notInArray, sql, isNull } from "drizzle-orm";
import { addSseClient, removeSseClient, broadcastBusinessEvent } from "./sse";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files are allowed"));
  },
  limits: { fileSize: 200 * 1024 * 1024 },
});

function paramId(val: string | string[]): number {
  return parseInt(Array.isArray(val) ? val[0] : val);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);

  app.get("/api/recaptcha-config", (_req, res) => {
    res.json({ siteKey: process.env.RECAPTCHA_SITE_KEY || null });
  });

  app.get("/api/events", requireAuth, (req, res) => {
    const businessId = req.user!.businessId;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    addSseClient(businessId, res);

    const heartbeat = setInterval(() => {
      try { res.write(":heartbeat\n\n"); } catch { clearInterval(heartbeat); }
    }, 30_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeSseClient(businessId, res);
    });
  });

  async function seedDefaultBusiness() {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.log("No ADMIN_PASSWORD env variable set. Please set ADMIN_PASSWORD.");
      return;
    }
    const existingUser = await storage.getUserByUsername("admin");
    if (!existingUser) {
      const merchantId = await storage.getNextMerchantId();
      const biz = await storage.createBusiness({ merchantId, name: "System", address: "", phone: "", status: "active" });
      const hashed = await hashPassword(adminPassword);
      await storage.createUser({
        username: "admin",
        name: "System Administrator",
        password: hashed,
        phone: "",
        businessId: biz.id,
        role: "system_admin",
        mustChangePassword: false,
      });
    } else {
      const passwordMatch = await comparePasswords(adminPassword, existingUser.password);
      if (!passwordMatch) {
        const hashed = await hashPassword(adminPassword);
        await storage.updateUserPassword(existingUser.id, hashed);
      }
    }
  }
  await seedDefaultBusiness();

  async function backfillFarmerIds() {
    const { db } = await import("./db");
    const { farmers } = await import("@shared/schema");
    const { eq, and, ilike, sql } = await import("drizzle-orm");
    const missing = await db.select().from(farmers).where(eq(farmers.farmerId, ""));
    for (const farmer of missing) {
      const today = farmer.createdAt || new Date();
      const dateStr = today.getFullYear().toString() +
        (today.getMonth() + 1).toString().padStart(2, "0") +
        today.getDate().toString().padStart(2, "0");
      const prefix = `FM${dateStr}`;
      const [result] = await db.select({ count: sql<string>`count(*)` })
        .from(farmers)
        .where(and(eq(farmers.businessId, farmer.businessId), ilike(farmers.farmerId, `${prefix}%`)));
      const seq = parseInt(result?.count || "0", 10) + 1;
      const farmerId = `${prefix}${seq}`;
      await db.update(farmers).set({ farmerId }).where(eq(farmers.id, farmer.id));
      console.log(`Backfilled farmer ${farmer.id} with ID ${farmerId}`);
    }
  }
  await backfillFarmerIds();

  app.get("/api/admin/businesses", requireAdmin, async (_req, res) => {
    const result = await storage.getAllBusinesses();
    res.json(result);
  });

  app.post("/api/admin/businesses", requireAdmin, async (req, res) => {
    try {
      const merchantId = await storage.getNextMerchantId();
      const data = { ...req.body, merchantId, status: "active" };
      const biz = await storage.createBusiness(data);
      res.status(201).json(biz);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/admin/businesses/:id", requireAdmin, async (req, res) => {
    const updated = await storage.updateBusiness(paramId(req.params.id), req.body);
    if (!updated) return res.status(404).json({ message: "Business not found" });
    res.json(updated);
  });

  app.post("/api/admin/businesses/:id/toggle-status", requireAdmin, async (req, res) => {
    const { adminPassword } = req.body;
    const admin = await storage.getUser(req.user!.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const isValid = await comparePasswords(adminPassword, admin.password);
    if (!isValid) return res.status(400).json({ message: "Invalid admin password" });

    const biz = await storage.getBusiness(paramId(req.params.id));
    if (!biz) return res.status(404).json({ message: "Business not found" });

    const newStatus = biz.status === "active" ? "inactive" : "active";
    const updated = await storage.updateBusiness(biz.id, { status: newStatus });
    res.json(updated);
  });

  app.post("/api/admin/businesses/:id/archive", requireAdmin, async (req, res) => {
    const { adminPassword } = req.body;
    const admin = await storage.getUser(req.user!.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const isValid = await comparePasswords(adminPassword, admin.password);
    if (!isValid) return res.status(400).json({ message: "Invalid admin password" });

    const biz = await storage.getBusiness(paramId(req.params.id));
    if (!biz) return res.status(404).json({ message: "Business not found" });

    const newStatus = biz.status === "archived" ? "active" : "archived";
    const updated = await storage.updateBusiness(biz.id, { status: newStatus });
    res.json(updated);
  });

  app.post("/api/admin/businesses/:id/reset", requireAdmin, async (req, res) => {
    const { adminPassword, resetPassword } = req.body;
    const admin = await storage.getUser(req.user!.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const isValidAdmin = await comparePasswords(adminPassword, admin.password);
    if (!isValidAdmin) return res.status(400).json({ message: "Invalid admin password" });

    const envResetPassword = process.env.RESET_PASSWORD;
    if (!envResetPassword) return res.status(400).json({ message: "RESET_PASSWORD is not configured. Please contact the system administrator." });

    if (resetPassword !== envResetPassword) return res.status(400).json({ message: "Invalid reset password" });

    const biz = await storage.getBusiness(paramId(req.params.id));
    if (!biz) return res.status(404).json({ message: "Business not found" });

    await storage.resetBusinessData(biz.id);
    res.json({ message: "Business data has been reset successfully" });
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const result = await storage.getAllUsers();
    const safe = result.map(({ password, resetPasswordHash, ...rest }) => rest);
    res.json(safe);
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const hashed = await hashPassword("password123");
      const data = {
        username: req.body.username,
        name: req.body.name || "",
        password: hashed,
        phone: req.body.phone || "",
        businessId: req.body.businessId,
        role: "user",
        mustChangePassword: true,
        accessLevel: req.body.accessLevel || "edit",
      };
      const user = await storage.createUser(data);
      const { password, ...safe } = user;
      res.status(201).json(safe);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const { name, phone, businessId, username, accessLevel } = req.body;
    const userId = req.params.id as string;
    const updated = await storage.updateUser(userId, { name, phone, businessId, username, accessLevel });
    if (!updated) return res.status(404).json({ message: "User not found" });
    const { password, ...safe } = updated;
    res.json(safe);
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const userId = req.params.id as string;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "system_admin") return res.status(400).json({ message: "Cannot delete system admin" });
    await storage.deleteUser(userId);
    res.json({ message: "User deleted" });
  });

  app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
    const userId = req.params.id as string;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const hashed = await hashPassword("password123");
    await storage.updateUserPassword(user.id, hashed);
    await storage.updateUser(user.id, { mustChangePassword: true });
    res.json({ message: "Password reset to default" });
  });

  app.get("/api/admin/receipt-templates/:businessId", requireAdmin, async (req, res) => {
    const businessId = paramId(req.params.businessId);
    const templates = await storage.listReceiptTemplates(businessId);
    res.json(templates);
  });

  app.post("/api/admin/receipt-templates/:businessId", requireAdmin, async (req, res) => {
    const businessId = paramId(req.params.businessId);
    const { templateType, crop, templateHtml } = req.body;
    if (!templateType || !templateHtml) return res.status(400).json({ message: "templateType and templateHtml required" });
    const tmpl = await storage.upsertReceiptTemplate(businessId, templateType, crop || "", templateHtml);
    res.json(tmpl);
  });

  app.delete("/api/admin/receipt-templates/:businessId/:id", requireAdmin, async (req, res) => {
    const businessId = paramId(req.params.businessId);
    const id = paramId(req.params.id);
    await storage.deleteReceiptTemplate(id, businessId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/receipt-templates", requireAuth, async (req, res) => {
    const templates = await storage.listReceiptTemplates(req.user!.businessId);
    res.json(templates);
  });

  app.get("/api/farmers", requireAuth, async (req, res) => {
    const search = req.query.search as string | undefined;
    const result = await storage.getFarmers(req.user!.businessId, search);
    res.json(result);
  });

  app.get("/api/farmers/locations", requireAuth, async (req, res) => {
    const locations = await storage.getFarmerLocations(req.user!.businessId);
    res.json(locations);
  });

  app.get("/api/farmers/:id", requireAuth, async (req, res) => {
    const farmer = await storage.getFarmer(paramId(req.params.id), req.user!.businessId);
    if (!farmer) return res.status(404).json({ message: "Farmer not found" });
    res.json(farmer);
  });

  app.post("/api/farmers", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const data = { ...req.body, businessId };
      const farmer = await storage.createFarmer(data);
      broadcastBusinessEvent(businessId);
      res.status(201).json(farmer);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  const farmerUpdateSchema = z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    village: z.string().optional(),
    tehsil: z.string().optional(),
    district: z.string().optional(),
    state: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    ifscCode: z.string().optional(),
    openingBalance: z.string().optional(),
    redFlag: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  }).strict();

  app.patch("/api/farmers/:id", requireAuth, async (req, res) => {
    const farmerId = paramId(req.params.id);
    const businessId = req.user!.businessId;
    const existing = await storage.getFarmer(farmerId, businessId);
    if (!existing) return res.status(404).json({ message: "Farmer not found" });

    const parsed = farmerUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid fields", errors: parsed.error.flatten() });

    const data = parsed.data;
    const trackFields = ["name", "phone", "village", "bankName", "bankAccountNumber", "ifscCode", "redFlag", "isArchived"] as const;
    for (const field of trackFields) {
      if (data[field] !== undefined && String(data[field]) !== String(existing[field] ?? "")) {
        await storage.createFarmerEditHistory({
          farmerId,
          businessId,
          fieldChanged: field,
          oldValue: String(existing[field] ?? ""),
          newValue: String(data[field]),
          changedBy: req.user!.username,
        });
      }
    }

    const updated = await storage.updateFarmer(farmerId, businessId, data);

    if (data.isArchived !== undefined && data.isArchived !== existing.isArchived) {
      const farmerLots = await db.select({ id: lots.id }).from(lots)
        .where(and(eq(lots.farmerId, farmerId), eq(lots.businessId, businessId)));
      for (const lot of farmerLots) {
        await db.update(lots).set({ isArchived: data.isArchived }).where(and(eq(lots.id, lot.id), eq(lots.businessId, businessId)));
        await storage.cascadeArchiveToLot(lot.id, businessId, data.isArchived);
      }
    }

    broadcastBusinessEvent(businessId);
    res.json(updated);
  });

  app.post("/api/lots/bulk-archive", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const { lotIds, isArchived } = req.body;
      if (!Array.isArray(lotIds) || lotIds.length === 0 || typeof isArchived !== "boolean") {
        return res.status(400).json({ message: "lotIds (non-empty array) and isArchived (boolean) required" });
      }
      for (const lotId of lotIds) {
        await db.update(lots).set({ isArchived }).where(and(eq(lots.id, lotId), eq(lots.businessId, businessId)));
        await storage.cascadeArchiveToLot(lotId, businessId, isArchived);
      }
      broadcastBusinessEvent(businessId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/farmers-with-dues", requireAuth, async (req, res) => {
    const search = req.query.search as string | undefined;
    const result = await storage.getFarmersWithDues(req.user!.businessId, search);
    res.json(result);
  });

  app.get("/api/farmer-edit-history/:farmerId", requireAuth, async (req, res) => {
    const history = await storage.getFarmerEditHistory(paramId(req.params.farmerId), req.user!.businessId);
    res.json(history);
  });

  app.post("/api/farmer-edit-history", requireAuth, async (req, res) => {
    const entry = { ...req.body, businessId: req.user!.businessId, changedBy: req.user!.username };
    const created = await storage.createFarmerEditHistory(entry);
    res.status(201).json(created);
  });

  app.get("/api/lot-edit-history/:lotId", requireAuth, async (req, res) => {
    const history = await storage.getLotEditHistory(paramId(req.params.lotId), req.user!.businessId);
    res.json(history);
  });

  app.get("/api/lot-edit-history-bulk", requireAuth, async (req, res) => {
    try {
      const lotIdsStr = req.query.lotIds as string;
      if (!lotIdsStr) return res.json([]);
      const lotIds = lotIdsStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
      if (lotIds.length === 0) return res.json([]);
      const history = await storage.getLotEditHistoryBulk(lotIds, req.user!.businessId);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/transaction-edit-history/:transactionId", requireAuth, async (req, res) => {
    const history = await storage.getTransactionEditHistory(paramId(req.params.transactionId), req.user!.businessId);
    res.json(history);
  });

  app.post("/api/farmers/check-duplicate", requireAuth, async (req, res) => {
    const { name, phone, village, excludeId } = req.body;
    const allFarmers = await storage.getFarmers(req.user!.businessId);
    const duplicate = allFarmers.find(f =>
      f.id !== excludeId &&
      f.name.toLowerCase() === name?.toLowerCase() &&
      f.phone === phone &&
      (f.village || "").toLowerCase() === (village || "").toLowerCase()
    );
    res.json({ duplicate: duplicate || null });
  });

  app.post("/api/farmers/merge", requireAuth, async (req, res) => {
    try {
      const { keepId, mergeId } = req.body;
      const result = await storage.mergeFarmers(req.user!.businessId, keepId, mergeId, req.user!.username);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/buyers/check-duplicate", requireAuth, async (req, res) => {
    const { name, phone, excludeId } = req.body;
    const allBuyers = await storage.getBuyers(req.user!.businessId);
    const duplicate = allBuyers.find(b =>
      b.id !== excludeId &&
      b.name.toLowerCase() === name?.toLowerCase() &&
      (b.phone || "") === (phone || "")
    );
    res.json({ duplicate: duplicate || null });
  });

  app.post("/api/buyers/merge", requireAuth, async (req, res) => {
    try {
      const { keepId, mergeId } = req.body;
      const result = await storage.mergeBuyers(req.user!.businessId, keepId, mergeId, req.user!.username);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/buyers", requireAuth, async (req, res) => {
    const search = req.query.search as string | undefined;
    const withDues = req.query.withDues === "true";
    if (withDues) {
      const result = await storage.getBuyersWithDues(req.user!.businessId, search);
      return res.json(result);
    }
    const result = await storage.getBuyers(req.user!.businessId, search);
    res.json(result);
  });

  app.get("/api/buyers/:id", requireAuth, async (req, res) => {
    const buyer = await storage.getBuyer(paramId(req.params.id), req.user!.businessId);
    if (!buyer) return res.status(404).json({ message: "Buyer not found" });
    res.json(buyer);
  });

  app.post("/api/buyers", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const buyerId = await storage.getNextBuyerId(businessId);
      const data = {
        ...req.body,
        businessId,
        buyerId,
      };
      const buyer = await storage.createBuyer(data);
      broadcastBusinessEvent(businessId);
      res.status(201).json(buyer);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/buyers/:id", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const buyerDbId = paramId(req.params.id);
      const existing = await storage.getBuyer(buyerDbId, businessId);
      if (!existing) return res.status(404).json({ message: "Buyer not found" });

      const fieldsToTrack: Record<string, string> = {
        name: "Name",
        phone: "Contact",
        address: "Address",
        licenceNo: "Licence No",
        redFlag: "Red Flag",
        isActive: "Active Status",
        openingBalance: "Opening Balance",
        aadhatCommissionPercent: "Aadhat Commission %",
        limitAmount: "Credit Limit",
      };

      const changedBy = req.user!.name || req.user!.username;

      for (const [field, label] of Object.entries(fieldsToTrack)) {
        if (req.body[field] !== undefined) {
          const oldVal = String((existing as any)[field] ?? "");
          const newVal = String(req.body[field] ?? "");
          if (oldVal !== newVal) {
            await storage.createBuyerEditHistory({
              buyerId: buyerDbId,
              businessId,
              fieldChanged: label,
              oldValue: oldVal,
              newValue: newVal,
              changedBy,
            });
          }
        }
      }

      const updated = await storage.updateBuyer(buyerDbId, businessId, req.body);
      broadcastBusinessEvent(businessId);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/buyers/:id/edit-history", requireAuth, async (req, res) => {
    const result = await storage.getBuyerEditHistory(paramId(req.params.id), req.user!.businessId);
    res.json(result);
  });

  app.get("/api/buyers/:id/pending-transactions", requireAuth, async (req, res) => {
    try {
      const result = await storage.getBuyerPendingTransactions(req.user!.businessId, paramId(req.params.id));
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/farmers/:id/pending-transactions", requireAuth, async (req, res) => {
    try {
      const result = await storage.getFarmerPendingTransactions(req.user!.businessId, paramId(req.params.id));
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/vehicles/:vehicleNumber/drivers", requireAuth, async (req, res) => {
    const vehicleNumber = req.params.vehicleNumber;
    if (!vehicleNumber || vehicleNumber.trim().length < 3) {
      return res.json([]);
    }
    const drivers = await storage.getDriversByVehicleNumber(req.user!.businessId, vehicleNumber.trim());
    res.json(drivers);
  });

  app.get("/api/lots", requireAuth, async (req, res) => {
    const filters = {
      crop: req.query.crop as string | undefined,
      date: req.query.date as string | undefined,
      search: req.query.search as string | undefined,
    };
    const result = await storage.getLots(req.user!.businessId, filters);
    res.json(result);
  });

  app.get("/api/stock-cards", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const allLots = await storage.getLots(businessId);

      interface StockCardBid {
        bidId: number;
        buyerId: number;
        buyerName: string;
        pricePerKg: string;
        numberOfBags: number;
        paymentType: string;
        advanceAmount: string | null;
        transaction: {
          txnId: number;
          transactionId: string;
          netWeight: string | null;
          numberOfBags: number | null;
          totalWeight: string | null;
          pricePerKg: string | null;
          extraChargesFarmer: string | null;
          extraChargesBuyer: string | null;
          extraPerKgFarmer: string | null;
          extraPerKgBuyer: string | null;
          extraTulaiFarmer: string | null;
          extraBharaiFarmer: string | null;
          extraKhadiKaraiFarmer: string | null;
          extraThelaBhadaFarmer: string | null;
          extraOthersFarmer: string | null;
          hammaliCharges: string | null;
          freightCharges: string | null;
          aadhatCharges: string | null;
          mandiCharges: string | null;
          muddatAnyaCharges: string | null;
          aadhatFarmerPercent: string | null;
          mandiFarmerPercent: string | null;
          muddatAnyaFarmerPercent: string | null;
          aadhatBuyerPercent: string | null;
          mandiBuyerPercent: string | null;
          muddatAnyaBuyerPercent: string | null;
          hammaliFarmerPerBag: string | null;
          hammaliBuyerPerBag: string | null;
          totalPayableToFarmer: string | null;
          totalReceivableFromBuyer: string | null;
          date: string | null;
          isReversed: boolean;
          paymentStatus: string;
          farmerPaymentStatus: string;
        } | null;
      }

      interface StockCardLot {
        dbId: number;
        lotId: string;
        crop: string;
        variety: string | null;
        numberOfBags: number;
        size: string | null;
        bagMarka: string | null;
        
        remainingBags: number;
        isArchived: boolean;
        bids: StockCardBid[];
      }

      const cardMap = new Map<string, {
        farmer: Farmer;
        date: string;
        vehicleNumber: string | null;
        driverName: string | null;
        driverContact: string | null;
        vehicleBhadaRate: string | null;
        freightType: string | null;
        totalBagsInVehicle: number | null;
        farmerAdvanceAmount: string | null;
        farmerAdvanceMode: string | null;
        latestCreatedAt: Date;
        cropMap: Map<string, { lots: StockCardLot[]; srNumber: string }>;
      }>();

      for (const lotRow of allLots) {
        const { farmer, hasPendingBids, ...lot } = lotRow;
        const vn = lot.vehicleNumber || "";
        const cardKey = `${lot.farmerId}-${lot.date}-${vn}`;

        if (!cardMap.has(cardKey)) {
          cardMap.set(cardKey, {
            farmer,
            date: lot.date,
            vehicleNumber: lot.vehicleNumber,
            driverName: lot.driverName,
            driverContact: lot.driverContact,
            vehicleBhadaRate: lot.vehicleBhadaRate,
            freightType: lot.freightType,
            totalBagsInVehicle: lot.totalBagsInVehicle,
            farmerAdvanceAmount: lot.farmerAdvanceAmount,
            farmerAdvanceMode: lot.farmerAdvanceMode,
            latestCreatedAt: lot.createdAt,
            cropMap: new Map(),
          });
        }

        const card = cardMap.get(cardKey)!;
        if (lot.createdAt > card.latestCreatedAt) {
          card.latestCreatedAt = lot.createdAt;
        }

        const cropKey = lot.crop;
        if (!card.cropMap.has(cropKey)) {
          card.cropMap.set(cropKey, {
            lots: [],
            srNumber: lot.serialNumber.toString(),
          });
        }
        card.cropMap.get(cropKey)!.lots.push({
          dbId: lot.id,
          lotId: lot.lotId,
          crop: lot.crop,
          variety: lot.variety,
          numberOfBags: lot.numberOfBags,
          size: lot.size,
          bagMarka: lot.bagMarka,
          remainingBags: lot.remainingBags,
          isArchived: lot.isArchived,
          bids: [],
        });
      }

      const allLotIds = allLots.map(l => l.id);
      if (allLotIds.length > 0) {
        const allBids = await db.select({
          bid: bids,
          buyerName: buyers.name,
        }).from(bids)
          .innerJoin(buyers, eq(bids.buyerId, buyers.id))
          .where(and(eq(bids.businessId, businessId), inArray(bids.lotId, allLotIds)));

        const allTxns = await db.select().from(transactions)
          .where(and(eq(transactions.businessId, businessId), inArray(transactions.lotId, allLotIds), eq(transactions.isReversed, false)));

        const txnByBidId = new Map<number, typeof allTxns[0]>();
        for (const txn of allTxns) {
          txnByBidId.set(txn.bidId, txn);
        }

        const bidsByLotId = new Map<number, StockCardBid[]>();
        for (const { bid, buyerName } of allBids) {
          if (!bidsByLotId.has(bid.lotId)) bidsByLotId.set(bid.lotId, []);
          const txn = txnByBidId.get(bid.id);
          bidsByLotId.get(bid.lotId)!.push({
            bidId: bid.id,
            buyerId: bid.buyerId,
            buyerName,
            pricePerKg: bid.pricePerKg,
            numberOfBags: bid.numberOfBags,
            paymentType: bid.paymentType,
            advanceAmount: bid.advanceAmount,
            transaction: txn ? {
              txnId: txn.id,
              transactionId: txn.transactionId,
              netWeight: txn.netWeight,
              numberOfBags: txn.numberOfBags,
              totalWeight: txn.totalWeight,
              pricePerKg: txn.pricePerKg,
              extraChargesFarmer: txn.extraChargesFarmer,
              extraChargesBuyer: txn.extraChargesBuyer,
              extraPerKgFarmer: txn.extraPerKgFarmer,
              extraPerKgBuyer: txn.extraPerKgBuyer,
              extraTulaiFarmer: txn.extraTulaiFarmer,
              extraBharaiFarmer: txn.extraBharaiFarmer,
              extraKhadiKaraiFarmer: txn.extraKhadiKaraiFarmer,
              extraThelaBhadaFarmer: txn.extraThelaBhadaFarmer,
              extraOthersFarmer: txn.extraOthersFarmer,
              hammaliCharges: txn.hammaliCharges,
              freightCharges: txn.freightCharges,
              aadhatCharges: txn.aadhatCharges,
              mandiCharges: txn.mandiCharges,
              muddatAnyaCharges: txn.muddatAnyaCharges,
              aadhatFarmerPercent: txn.aadhatFarmerPercent,
              mandiFarmerPercent: txn.mandiFarmerPercent,
              muddatAnyaFarmerPercent: txn.muddatAnyaFarmerPercent,
              aadhatBuyerPercent: txn.aadhatBuyerPercent,
              mandiBuyerPercent: txn.mandiBuyerPercent,
              muddatAnyaBuyerPercent: txn.muddatAnyaBuyerPercent,
              hammaliFarmerPerBag: txn.hammaliFarmerPerBag,
              hammaliBuyerPerBag: txn.hammaliBuyerPerBag,
              totalPayableToFarmer: txn.totalPayableToFarmer,
              totalReceivableFromBuyer: txn.totalReceivableFromBuyer,
              date: txn.date,
              isReversed: txn.isReversed,
              paymentStatus: txn.paymentStatus,
              farmerPaymentStatus: txn.farmerPaymentStatus,
              farmerPaidAmount: txn.farmerPaidAmount,
              paidAmount: txn.paidAmount,
            } : null,
          });
        }

        for (const card of Array.from(cardMap.values())) {
          for (const group of Array.from(card.cropMap.values())) {
            for (const lot of group.lots) {
              lot.bids = bidsByLotId.get(lot.dbId) || [];
            }
          }
        }
      }

      const cards = Array.from(cardMap.entries()).map(([cardKey, card]) => {
        const cropGroups = Array.from(card.cropMap.entries()).map(([crop, group]) => ({
          crop,
          srNumber: group.srNumber,
          isArchived: group.lots.every((l) => l.isArchived),
          lots: group.lots,
        }));

        return {
          cardKey,
          farmer: card.farmer,
          date: card.date,
          vehicleNumber: card.vehicleNumber,
          driverName: card.driverName,
          driverContact: card.driverContact,
          vehicleBhadaRate: card.vehicleBhadaRate,
          freightType: card.freightType,
          totalBagsInVehicle: card.totalBagsInVehicle,
          farmerAdvanceAmount: card.farmerAdvanceAmount,
          farmerAdvanceMode: card.farmerAdvanceMode,
          _sortTs: card.latestCreatedAt.getTime(),
          latestCreatedAt: card.latestCreatedAt.toISOString(),
          cropGroups,
        };
      });

      cards.sort((a, b) => {
        const da = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== da) return dateB - da;
        return b._sortTs - a._sortTs;
      });

      res.json(cards.map(({ _sortTs, ...rest }) => rest));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/lots/:id", requireAuth, async (req, res) => {
    const lot = await storage.getLot(paramId(req.params.id), req.user!.businessId);
    if (!lot) return res.status(404).json({ message: "Lot not found" });
    res.json(lot);
  });

  app.post("/api/lots", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const dateStr = req.body.date || format(new Date(), "yyyy-MM-dd");
      const crop = req.body.crop;

      const serialNum = await storage.getNextSerialNumber(businessId, dateStr);
      const lotSeq = await storage.getNextLotSequence(businessId, crop, dateStr);

      const cropPrefix = crop === "Potato" ? "POT" : crop === "Onion" ? "ONI" : "GAR";
      const dateFormatted = dateStr.replace(/-/g, "");
      const lotId = `${cropPrefix}${dateFormatted}${lotSeq}`;

      const data = {
        businessId,
        lotId,
        serialNumber: serialNum,
        date: dateStr,
        farmerId: req.body.farmerId,
        crop,
        variety: req.body.variety || null,
        numberOfBags: parseInt(req.body.numberOfBags),
        actualNumberOfBags: parseInt(req.body.numberOfBags),
        remainingBags: parseInt(req.body.numberOfBags),
        size: req.body.size || null,
        bagMarka: req.body.bagMarka || null,
        vehicleNumber: req.body.vehicleNumber ? req.body.vehicleNumber.toUpperCase() : null,
        vehicleBhadaRate: req.body.vehicleBhadaRate || null,
        driverName: req.body.driverName || null,
        driverContact: req.body.driverContact || null,
        freightType: req.body.freightType || null,
        totalBagsInVehicle: req.body.totalBagsInVehicle ? parseInt(req.body.totalBagsInVehicle) : null,
      };

      const lot = await storage.createLot(data);
      broadcastBusinessEvent(businessId);
      res.status(201).json(lot);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/lots/check-card-conflict", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const { farmerId, date, vehicleNumber, excludeLotIds } = req.body;
      if (!farmerId || !date) return res.json({ conflict: false });
      const incomingVehicle = vehicleNumber ? vehicleNumber.toUpperCase().trim() : null;
      const baseConditions = and(
        eq(lots.businessId, businessId),
        eq(lots.farmerId, parseInt(farmerId)),
        eq(lots.date, date),
        incomingVehicle ? eq(lots.vehicleNumber, incomingVehicle) : isNull(lots.vehicleNumber)
      );
      const idsToExclude: number[] = Array.isArray(excludeLotIds) ? excludeLotIds.filter((id: unknown) => typeof id === "number") : [];
      const existing = await db
        .select({ id: lots.id })
        .from(lots)
        .where(idsToExclude.length > 0 ? and(baseConditions, notInArray(lots.id, idsToExclude)) : baseConditions)
        .limit(1);
      res.json({ conflict: existing.length > 0 });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/lots/batch", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const { farmerId, date, vehicleNumber, driverName, driverContact, vehicleBhadaRate, freightType, totalBagsInVehicle, farmerAdvanceAmount, farmerAdvanceMode, isAddingToExistingCard, lots: lotItems } = req.body;
      const dateStr = date || format(new Date(), "yyyy-MM-dd");

      if (!lotItems || !Array.isArray(lotItems) || lotItems.length === 0) {
        return res.status(400).json({ message: "At least one lot is required" });
      }

      const totalLotBags = lotItems.reduce((sum: number, l: any) => sum + parseInt(l.numberOfBags || 0), 0);
      if (totalBagsInVehicle && totalLotBags > parseInt(totalBagsInVehicle)) {
        return res.status(400).json({ message: "Sum of lot bags exceeds total bags in vehicle" });
      }

      const incomingVehicle = vehicleNumber ? vehicleNumber.toUpperCase().trim() : null;
      const existingForCard = await db
        .select({ id: lots.id })
        .from(lots)
        .where(and(
          eq(lots.businessId, businessId),
          eq(lots.farmerId, parseInt(farmerId)),
          eq(lots.date, dateStr),
          incomingVehicle ? eq(lots.vehicleNumber, incomingVehicle) : isNull(lots.vehicleNumber)
        ))
        .limit(1);
      const cardAlreadyExists = existingForCard.length > 0;
      if (cardAlreadyExists && !isAddingToExistingCard) {
        return res.status(409).json({ message: "A card for this farmer already exists on this date with the same vehicle number." });
      }

      const baseSerial = await storage.getNextSerialNumber(businessId, dateStr);
      const dateFormatted = dateStr.replace(/-/g, "");
      const createdLots = [];

      // Assign a unique SR# per unique crop, in order of first appearance
      const cropSerialMap: Record<string, number> = {};
      let serialOffset = 0;
      for (const item of lotItems) {
        if (!(item.crop in cropSerialMap)) {
          cropSerialMap[item.crop] = baseSerial + serialOffset;
          serialOffset++;
        }
      }

      for (const item of lotItems) {
        const crop = item.crop;
        const lotSeq = await storage.getNextLotSequence(businessId, crop, dateStr);
        const cropPrefix = crop === "Potato" ? "POT" : crop === "Onion" ? "ONI" : "GAR";
        const lotId = `${cropPrefix}${dateFormatted}${lotSeq}`;
        const bags = parseInt(item.numberOfBags);

        const data = {
          businessId,
          lotId,
          serialNumber: cropSerialMap[crop],
          date: dateStr,
          farmerId: parseInt(farmerId),
          crop,
          variety: item.variety || null,
          numberOfBags: bags,
          actualNumberOfBags: bags,
          remainingBags: bags,
          size: item.size || null,
          bagMarka: item.bagMarka || null,
          vehicleNumber: vehicleNumber ? vehicleNumber.toUpperCase() : null,
          vehicleBhadaRate: vehicleBhadaRate || null,
          driverName: driverName || null,
          driverContact: driverContact || null,
          freightType: freightType || null,
          totalBagsInVehicle: totalBagsInVehicle ? parseInt(totalBagsInVehicle) : null,
          farmerAdvanceAmount: farmerAdvanceAmount || null,
          farmerAdvanceMode: farmerAdvanceMode || null,
        };

        const lot = await storage.createLot(data);
        createdLots.push(lot);
      }

      broadcastBusinessEvent(businessId);
      res.status(201).json(createdLots);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/lots/:id", requireAuth, async (req, res) => {
    const lotId = paramId(req.params.id);
    const businessId = req.user!.businessId;
    const data = { ...req.body };

    const lot = await storage.getLot(lotId, businessId);
    if (!lot) return res.status(404).json({ message: "Lot not found" });

    const oldActual = lot.actualNumberOfBags ?? lot.numberOfBags;

    // Compute soldBags from actual active transactions (source of truth).
    // Using actualNumberOfBags - remainingBags can exceed numberOfBags when
    // there are data inconsistencies, causing false validation failures.
    const txTotalResult = await db
      .select({ total: sql<number>`COALESCE(SUM(${transactions.numberOfBags}), 0)` })
      .from(transactions)
      .where(and(eq(transactions.lotId, lotId), eq(transactions.businessId, businessId), eq(transactions.isReversed, false), eq(transactions.isArchived, false)));
    const soldBags = Math.min(Number(txTotalResult[0]?.total || 0), lot.numberOfBags);

    const newOriginal = data.numberOfBags ?? lot.numberOfBags;

    if (data.numberOfBags != null) {
      // Check (a): total sibling lot bags must not exceed vehicle capacity
      const effectiveTBIV = data.totalBagsInVehicle ?? lot.totalBagsInVehicle;
      if (effectiveTBIV != null && effectiveTBIV > 0) {
        const siblingLots = await db
          .select({ id: lots.id, numberOfBags: lots.numberOfBags })
          .from(lots)
          .where(and(
            eq(lots.farmerId, lot.farmerId),
            eq(lots.date, lot.date),
            eq(lots.businessId, businessId),
            eq(lots.isArchived, false)
          ));
        const newTotal = siblingLots.reduce((s, l) => s + (l.id === lotId ? data.numberOfBags : l.numberOfBags), 0);
        if (newTotal > effectiveTBIV) {
          return res.status(400).json({ message: `Total lot bags (${newTotal}) would exceed vehicle capacity (${effectiveTBIV})` });
        }
      }

      // Check (b): only reject if the user is actively REDUCING bags below already-allocated bid bags.
      // If the lot already has a pre-existing inconsistency (bid bags > lot bags), we allow saving
      // as long as the user is not making it worse (i.e. not reducing further).
      if (data.numberOfBags < lot.numberOfBags) {
        const lotBids = await db
          .select({ numberOfBags: bids.numberOfBags })
          .from(bids)
          .where(and(eq(bids.lotId, lotId), eq(bids.businessId, businessId)));
        const totalBidBags = lotBids.reduce((s, b) => s + (b.numberOfBags || 0), 0);
        if (totalBidBags > data.numberOfBags) {
          return res.status(400).json({ message: `Cannot reduce lot bags below already allocated bid bags (${totalBidBags})` });
        }
      }

      if (data.actualNumberOfBags == null) {
        const effectiveActual = Math.min(oldActual, data.numberOfBags);
        data.actualNumberOfBags = effectiveActual;
        data.remainingBags = Math.max(0, effectiveActual - soldBags);
      }
    }

    if (data.actualNumberOfBags != null) {
      if (data.actualNumberOfBags > newOriginal) {
        data.actualNumberOfBags = newOriginal;
      }
      data.remainingBags = Math.max(0, data.actualNumberOfBags - soldBags);
    }

    const trackFields = ["numberOfBags", "actualNumberOfBags", "crop", "variety", "size", "bagMarka", "vehicleNumber", "vehicleBhadaRate", "farmerAdvanceAmount", "farmerAdvanceMode"];
    const changedBy = req.user!.username;
    for (const field of trackFields) {
      if (data[field] !== undefined) {
        const oldVal = String(lot[field as keyof typeof lot] ?? "");
        const newVal = String(data[field] ?? "");
        if (oldVal !== newVal) {
          await storage.createLotEditHistory({
            lotId: lot.id,
            businessId,
            fieldChanged: field,
            oldValue: oldVal,
            newValue: newVal,
            changedBy,
          });
        }
      }
    }

    const updated = await storage.updateLot(lotId, businessId, data);
    if (!updated) return res.status(404).json({ message: "Lot not found" });

    if (data.isArchived !== undefined && data.isArchived !== lot.isArchived) {
      await storage.cascadeArchiveToLot(lotId, businessId, data.isArchived);
    }

    if (data.farmerId != null && data.farmerId !== lot.farmerId) {
      await db.update(transactions)
        .set({ farmerId: data.farmerId })
        .where(and(
          eq(transactions.lotId, lotId),
          eq(transactions.businessId, businessId),
          eq(transactions.isReversed, false),
          eq(transactions.isArchived, false)
        ));
    }

    broadcastBusinessEvent(businessId);
    res.json(updated);
  });

  app.get("/api/bids", requireAuth, async (req, res) => {
    const lotId = req.query.lotId ? parseInt(req.query.lotId as string) : undefined;
    const result = await storage.getBids(req.user!.businessId, lotId);
    res.json(result);
  });

  app.post("/api/bids", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const data = { ...req.body, businessId };
      const bid = await storage.createBid(data);
      broadcastBusinessEvent(businessId);
      res.status(201).json(bid);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/bids/:id", requireAuth, async (req, res) => {
    const bidId = paramId(req.params.id);
    const businessId = req.user!.businessId;
    const updated = await storage.updateBid(bidId, businessId, req.body);
    if (!updated) return res.status(404).json({ message: "Bid not found" });
    broadcastBusinessEvent(businessId);
    res.json(updated);
  });

  app.delete("/api/bids/:id", requireAuth, async (req, res) => {
    try {
      const bidId = paramId(req.params.id);
      const businessId = req.user!.businessId;
      const username = req.user!.username;

      const [bid] = await db.select().from(bids).where(and(eq(bids.id, bidId), eq(bids.businessId, businessId)));
      if (!bid) return res.status(404).json({ message: "Bid not found" });

      const [buyer] = await db.select({ name: buyers.name }).from(buyers).where(eq(buyers.id, bid.buyerId));
      const buyerName = buyer?.name || "";

      const [tx] = await db.select().from(transactions)
        .where(and(eq(transactions.bidId, bidId), eq(transactions.businessId, businessId)))
        .limit(1);

      const auditValue: Record<string, any> = {
        buyerName,
        numberOfBags: bid.numberOfBags,
        pricePerKg: bid.pricePerKg,
      };

      if (tx) {
        const [activeCashEntry] = await db.select({ id: cashEntries.id })
          .from(cashEntries)
          .where(and(
            eq(cashEntries.transactionId, tx.id),
            eq(cashEntries.businessId, businessId),
            eq(cashEntries.isReversed, false)
          ))
          .limit(1);
        if (activeCashEntry) {
          return res.status(400).json({ message: "Cannot delete bid: payments exist against this transaction. Please reverse all payments first." });
        }

        const [farmer] = await db.select({ name: farmers.name }).from(farmers).where(eq(farmers.id, tx.farmerId));
        auditValue.transactionId = tx.transactionId;
        auditValue.totalPayableToFarmer = tx.totalPayableToFarmer;
        auditValue.totalReceivableFromBuyer = tx.totalReceivableFromBuyer;
        auditValue.txnDate = tx.date;
        auditValue.farmerName = farmer?.name || "";

        await db.delete(transactionEditHistory).where(eq(transactionEditHistory.transactionId, tx.id));
        await db.delete(cashEntries).where(eq(cashEntries.transactionId, tx.id));
        await db.delete(transactions).where(eq(transactions.id, tx.id));
      }

      await storage.createLotEditHistory({
        lotId: bid.lotId,
        businessId,
        fieldChanged: "bid_deleted",
        oldValue: JSON.stringify(auditValue),
        newValue: null,
        changedBy: username,
      });

      await storage.deleteBid(bidId, businessId);
      broadcastBusinessEvent(businessId);
      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/lots/:id", requireAuth, async (req, res) => {
    try {
      const lotId = paramId(req.params.id);
      const businessId = req.user!.businessId;
      const username = req.user!.username;

      const lot = await storage.getLot(lotId, businessId);
      if (!lot) return res.status(404).json({ message: "Lot not found" });

      const lotBids = await db.select({
        id: bids.id,
        numberOfBags: bids.numberOfBags,
        pricePerKg: bids.pricePerKg,
        buyerName: buyers.name,
      }).from(bids)
        .innerJoin(buyers, eq(bids.buyerId, buyers.id))
        .where(and(eq(bids.lotId, lotId), eq(bids.businessId, businessId)));

      const lotTxns = await db.select({
        id: transactions.id,
        transactionId: transactions.transactionId,
        numberOfBags: transactions.numberOfBags,
        pricePerKg: transactions.pricePerKg,
        totalPayableToFarmer: transactions.totalPayableToFarmer,
        totalReceivableFromBuyer: transactions.totalReceivableFromBuyer,
        date: transactions.date,
        buyerName: buyers.name,
        farmerName: farmers.name,
      }).from(transactions)
        .innerJoin(bids, eq(transactions.bidId, bids.id))
        .innerJoin(buyers, eq(transactions.buyerId, buyers.id))
        .innerJoin(farmers, eq(transactions.farmerId, farmers.id))
        .where(and(eq(transactions.lotId, lotId), eq(transactions.businessId, businessId)));

      if (lotTxns.length > 0) {
        const txnIds = lotTxns.map(t => t.id);
        const [activeCashEntry] = await db.select({ id: cashEntries.id })
          .from(cashEntries)
          .where(and(
            inArray(cashEntries.transactionId, txnIds),
            eq(cashEntries.businessId, businessId),
            eq(cashEntries.isReversed, false)
          ))
          .limit(1);
        if (activeCashEntry) {
          return res.status(400).json({ message: "Cannot delete lot: payments exist against transactions in this lot. Please reverse all payments first." });
        }
      }

      await db.transaction(async (tx) => {
        // Write audit snapshot only when there is meaningful data to record
        if (lotBids.length > 0 || lotTxns.length > 0) {
          const auditValue = {
            numberOfBags: lot.numberOfBags,
            bids: lotBids.map(b => ({ buyerName: b.buyerName, numberOfBags: b.numberOfBags, pricePerKg: b.pricePerKg })),
            transactions: lotTxns.map(t => ({
              buyerName: t.buyerName,
              farmerName: t.farmerName,
              numberOfBags: t.numberOfBags,
              pricePerKg: t.pricePerKg,
              totalPayableToFarmer: t.totalPayableToFarmer,
              totalReceivableFromBuyer: t.totalReceivableFromBuyer,
              txnDate: t.date,
            })),
          };
          await tx.insert(lotEditHistory).values({
            lotId,
            businessId,
            fieldChanged: "lot_deleted",
            oldValue: JSON.stringify(auditValue),
            newValue: null,
            changedBy: username,
          });
        }

        // Null out lotId FK on ALL lot_edit_history rows so the lot can be deleted.
        // lot_edit_history.lotId is nullable; audit rows are preserved after lot removal.
        await tx.update(lotEditHistory)
          .set({ lotId: null })
          .where(eq(lotEditHistory.lotId, lotId));

        // Cascade-delete child records
        if (lotTxns.length > 0) {
          const txnIds = lotTxns.map(t => t.id);
          await tx.delete(transactionEditHistory).where(inArray(transactionEditHistory.transactionId, txnIds));
          await tx.delete(cashEntries).where(inArray(cashEntries.transactionId, txnIds));
          await tx.delete(transactions).where(inArray(transactions.id, txnIds));
        }
        if (lotBids.length > 0) {
          const bidIds = lotBids.map(b => b.id);
          await tx.delete(bids).where(inArray(bids.id, bidIds));
        }
        await tx.delete(lots).where(and(eq(lots.id, lotId), eq(lots.businessId, businessId)));
      });

      broadcastBusinessEvent(businessId);
      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/transactions", requireAuth, async (req, res) => {
    const filters = {
      farmerId: req.query.farmerId ? parseInt(req.query.farmerId as string) : undefined,
      buyerId: req.query.buyerId ? parseInt(req.query.buyerId as string) : undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
    };
    const result = await storage.getTransactions(req.user!.businessId, filters);
    res.json(result);
  });

  app.get("/api/transactions/:id", requireAuth, async (req, res) => {
    const tx = await storage.getTransaction(paramId(req.params.id), req.user!.businessId);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    res.json(tx);
  });

  app.post("/api/transactions", requireAuth, async (req, res) => {
    try {
      const data = { ...req.body, businessId: req.user!.businessId };
      const tx = await storage.createTransaction(data);
      await storage.recalculateBuyerPaymentStatus(req.user!.businessId, tx.buyerId);
      await storage.recalculateFarmerPaymentStatus(req.user!.businessId, tx.farmerId);
      await storage.createTransactionEditHistory({
        transactionId: tx.id,
        businessId: req.user!.businessId,
        fieldChanged: "created",
        oldValue: null,
        newValue: `Transaction ${tx.transactionId} created`,
        changedBy: req.user!.username,
      });
      broadcastBusinessEvent(req.user!.businessId);
      res.status(201).json(tx);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/transactions/:id", requireAuth, async (req, res) => {
    const txId = paramId(req.params.id);
    const businessId = req.user!.businessId;
    const oldTx = await storage.getTransaction(txId, businessId);
    if (!oldTx) return res.status(404).json({ message: "Transaction not found" });

    const txTrackFields = ["numberOfBags", "extraChargesFarmer", "extraTulaiFarmer", "extraBharaiFarmer", "extraKhadiKaraiFarmer", "extraThelaBhadaFarmer", "extraOthersFarmer", "extraChargesBuyer", "extraPerKgFarmer", "extraPerKgBuyer", "netWeight", "pricePerKg", "totalPayableToFarmer", "totalReceivableFromBuyer", "hammaliCharges", "freightCharges", "aadhatCharges", "mandiCharges", "muddatAnyaCharges"];
    const hasFieldChange = txTrackFields.some(f => {
      if (req.body[f] === undefined) return false;
      return String(req.body[f] ?? "") !== String((oldTx as any)[f] ?? "");
    });
    if (hasFieldChange) {
      const [activeCashEntry] = await db.select({ id: cashEntries.id })
        .from(cashEntries)
        .where(and(
          eq(cashEntries.transactionId, txId),
          eq(cashEntries.businessId, businessId),
          eq(cashEntries.isReversed, false)
        ))
        .limit(1);
      if (activeCashEntry) {
        return res.status(400).json({ message: "Cannot edit transaction: payments exist. Please reverse all payments first." });
      }
    }

    const changedBy = req.user!.username;
    const updated = await storage.updateTransaction(txId, businessId, req.body);
    if (!updated) return res.status(404).json({ message: "Transaction not found" });

    for (const field of txTrackFields) {
      const oldVal = String((oldTx as any)[field] ?? "");
      const newVal = String((updated as any)[field] ?? "");
      if (oldVal !== newVal) {
        await storage.createTransactionEditHistory({
          transactionId: txId,
          businessId,
          fieldChanged: field,
          oldValue: oldVal,
          newValue: newVal,
          changedBy,
        });
      }
    }

    broadcastBusinessEvent(businessId);
    res.json(updated);
  });

  app.get("/api/bank-accounts", requireAuth, async (req, res) => {
    const result = await storage.getBankAccounts(req.user!.businessId);
    res.json(result);
  });

  app.post("/api/bank-accounts", requireAuth, async (req, res) => {
    try {
      const data = { ...req.body, businessId: req.user!.businessId };
      const account = await storage.createBankAccount(data);
      res.status(201).json(account);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/bank-accounts/:id", requireAuth, async (req, res) => {
    try {
      const result = await storage.updateBankAccount(paramId(req.params.id), req.user!.businessId, req.body);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/bank-accounts/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteBankAccount(paramId(req.params.id), req.user!.businessId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/charge-settings", requireAuth, async (req, res) => {
    const result = await storage.getBusinessChargeSettings(req.user!.businessId);
    res.json(result || {
      mandiCommissionFarmerPercent: "0",
      mandiCommissionBuyerPercent: "1",
      aadhatCommissionFarmerPercent: "0",
      aadhatCommissionBuyerPercent: "2",
      muddatAnyaFarmerPercent: "0",
      muddatAnyaBuyerPercent: "0",
      hammaliFarmerPerBag: "0",
      hammaliBuyerPerBag: "0",
    });
  });

  app.put("/api/charge-settings", requireAuth, async (req, res) => {
    try {
      const result = await storage.upsertBusinessChargeSettings(req.user!.businessId, {
        mandiCommissionFarmerPercent: req.body.mandiCommissionFarmerPercent,
        mandiCommissionBuyerPercent: req.body.mandiCommissionBuyerPercent,
        aadhatCommissionFarmerPercent: req.body.aadhatCommissionFarmerPercent,
        aadhatCommissionBuyerPercent: req.body.aadhatCommissionBuyerPercent,
        muddatAnyaFarmerPercent: req.body.muddatAnyaFarmerPercent,
        muddatAnyaBuyerPercent: req.body.muddatAnyaBuyerPercent,
        hammaliFarmerPerBag: req.body.hammaliFarmerPerBag,
        hammaliBuyerPerBag: req.body.hammaliBuyerPerBag,
      });
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/charge-settings/history", requireAuth, async (req, res) => {
    const history = await storage.getChargeSettingsHistory(req.user!.businessId);
    res.json(history);
  });

  app.get("/api/cash-settings", requireAuth, async (req, res) => {
    const result = await storage.getCashSettings(req.user!.businessId);
    res.json(result || { cashInHandOpening: "0" });
  });

  app.post("/api/cash-settings", requireAuth, async (req, res) => {
    try {
      const result = await storage.upsertCashSettings(req.user!.businessId, req.body.cashInHandOpening || "0");
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/cash-entries", requireAuth, async (req, res) => {
    const filters = {
      category: req.query.category as string | undefined,
      outflowType: req.query.outflowType as string | undefined,
      farmerId: req.query.farmerId ? parseInt(req.query.farmerId as string) : undefined,
      buyerId: req.query.buyerId ? parseInt(req.query.buyerId as string) : undefined,
      month: req.query.month as string | undefined,
      year: req.query.year as string | undefined,
    };
    const result = await storage.getCashEntries(req.user!.businessId, filters);
    res.json(result);
  });

  app.post("/api/cash-entries", requireAuth, async (req, res) => {
    try {
      const { allocations, ...rest } = req.body;
      const data = { ...rest, businessId: req.user!.businessId };

      if (data.bankAccountId != null) {
        const parsedBankAcctId = parseInt(data.bankAccountId);
        if (isNaN(parsedBankAcctId)) {
          data.bankAccountId = null;
        } else {
          data.bankAccountId = parsedBankAcctId;
          const accts = await storage.getBankAccounts(req.user!.businessId);
          if (!accts.some(a => a.id === parsedBankAcctId)) {
            data.bankAccountId = null;
          }
        }
      }

      const isBuyerInward = allocations && Array.isArray(allocations) && allocations.length > 0 && data.category === "inward" && data.buyerId;
      const isFarmerOutward = allocations && Array.isArray(allocations) && allocations.length > 0 && data.category === "outward" && data.farmerId;

      if (isBuyerInward || isFarmerOutward) {
        const expandedAllocations: { transactionId: number | null; amount: string; discount: string; pettyAdj: string }[] = [];
        for (const a of allocations) {
          if (a.transactionIds && Array.isArray(a.transactionIds) && a.transactionIds.length > 0) {
            const groupAmount = parseFloat(a.amount || "0");
            const txnDues = a.transactionIds as { id: number; due: number }[];
            const totalDue = txnDues.reduce((s: number, t: { due: number }) => s + t.due, 0);
            if (totalDue <= 0 || groupAmount <= 0) continue;
            let remaining = groupAmount;
            for (let i = 0; i < txnDues.length; i++) {
              const share = Math.min(remaining, txnDues[i].due);
              if (share > 0) {
                expandedAllocations.push({
                  transactionId: txnDues[i].id,
                  amount: share.toFixed(2),
                  discount: "0",
                  pettyAdj: "0",
                });
                remaining = Math.round((remaining - share) * 100) / 100;
              }
            }
          } else {
            expandedAllocations.push({
              transactionId: a.transactionId || null,
              amount: String(a.amount || "0"),
              discount: String(a.discount || "0"),
              pettyAdj: String(a.pettyAdj || "0"),
            });
          }
        }
        const entries = await storage.createCashEntryBatch(data, expandedAllocations);
        broadcastBusinessEvent(req.user!.businessId);
        res.status(201).json(entries);
      } else {
        const entry = await storage.createCashEntry(data);
        broadcastBusinessEvent(req.user!.businessId);
        res.status(201).json(entry);
      }
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/cash-entries/:id/reverse", requireAuth, async (req, res) => {
    try {
      const reason = req.body?.reason || null;
      const result = await storage.reverseCashEntry(paramId(req.params.id), req.user!.businessId, reason);
      if (!result) return res.status(404).json({ message: "Entry not found" });
      broadcastBusinessEvent(req.user!.businessId);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/transaction-aggregates", requireAuth, async (req, res) => {
    try {
      const result = await storage.getTransactionAggregates(req.user!.businessId);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/farmer-ledger/:farmerId", requireAuth, async (req, res) => {
    try {
      const result = await storage.getFarmerLedger(
        req.user!.businessId,
        paramId(req.params.farmerId),
        req.query.dateFrom as string | undefined,
        req.query.dateTo as string | undefined,
      );
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/buyer-ledger/:buyerId", requireAuth, async (req, res) => {
    try {
      const result = await storage.getBuyerLedger(
        req.user!.businessId,
        paramId(req.params.buyerId),
        req.query.dateFrom as string | undefined,
        req.query.dateTo as string | undefined,
      );
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/buyers/:id/ledger", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const buyerId = paramId(req.params.id);

      const business = await storage.getBusiness(businessId);

      const today = new Date();
      const fyYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      const fyStart = `${fyYear}-04-01`;
      const fyEnd = `${fyYear + 1}-03-31`;

      const ledger = await storage.getBuyerLedger(businessId, buyerId, fyStart, fyEnd);
      const { buyer, transactions: txns, cashEntries: cash } = ledger;

      const filteredTxns = txns.filter((t: Transaction) => !t.isReversed && !t.isArchived);
      const filteredCash = cash.filter((c: CashEntry) => !c.isReversed && !c.isArchived);

      type LedgerEntry = {
        date: string;
        refCode: string;
        particulars: string;
        dr: number;
        cr: number;
        sourceType: "transaction" | "payment";
        sourceId: number;
      };

      const entries: LedgerEntry[] = [
        ...filteredTxns.map((t: Transaction) => ({
          date: t.date || fyStart,
          refCode: t.transactionId,
          particulars: "Purchase",
          dr: parseFloat(t.totalReceivableFromBuyer || "0"),
          cr: 0,
          sourceType: "transaction" as const,
          sourceId: t.id,
        })),
        ...filteredCash.map((c: CashEntry) => ({
          date: c.date,
          refCode: c.cashFlowId || `CE${c.id}`,
          particulars: `Payment (${c.paymentMode || "Cash"})`,
          dr: 0,
          cr: parseFloat(c.amount || "0"),
          sourceType: "payment" as const,
          sourceId: c.id,
        })),
      ];

      entries.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.sourceType === b.sourceType) return 0;
        return a.sourceType === "transaction" ? -1 : 1;
      });

      res.json({
        buyerName: buyer.name,
        buyerId: buyer.buyerId,
        businessName: business?.name || "",
        businessAddress: business?.address || "",
        openingBalance: parseFloat(buyer.openingBalance || "0"),
        fyStart,
        fyEnd,
        entries,
      });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/buyers/:id/paana", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const buyerId = paramId(req.params.id);
      const business = await storage.getBusiness(businessId);
      const buyer = await storage.getBuyer(buyerId, businessId);
      if (!buyer) return res.status(404).json({ message: "Buyer not found" });

      const allTxns = await storage.getTransactions(businessId);
      const buyerTxns = allTxns
        .filter(t => t.buyerId === buyerId && !t.isReversed)
        .map(t => ({
          id: t.id,
          date: t.date,
          crop: t.lot.crop,
          lotId: t.lot.lotId,
          numberOfBags: t.numberOfBags,
          totalReceivableFromBuyer: t.totalReceivableFromBuyer,
          paidAmount: t.paidAmount,
          paymentStatus: t.paymentStatus,
        }));

      res.json({
        businessName: business?.name || "Mandi Mitra",
        businessAddress: business?.address || "",
        buyer: { id: buyer.id, buyerId: buyer.buyerId, name: buyer.name, address: buyer.address, phone: buyer.phone, openingBalance: buyer.openingBalance },
        transactions: buyerTxns,
      });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const business = await storage.getBusiness(businessId);

      const [allLots, allTxns, farmersWithDues, buyersWithDues, txAggregates] = await Promise.all([
        storage.getLots(businessId),
        storage.getTransactions(businessId),
        storage.getFarmersWithDues(businessId),
        storage.getBuyersWithDues(businessId),
        storage.getTransactionAggregates(businessId),
      ]);

      res.json({
        businessName: business?.name || "Mandi Mitra",
        lots: allLots.map(l => ({
          id: l.id, lotId: l.lotId, crop: l.crop, date: l.date,
          numberOfBags: l.numberOfBags, actualNumberOfBags: l.actualNumberOfBags, remainingBags: l.remainingBags,
          farmerId: l.farmerId, farmerName: l.farmer.name,
        })),
        transactions: allTxns.map(t => ({
          id: t.id, transactionId: t.transactionId, date: t.date,
          crop: t.lot.crop, lotId: t.lot.lotId,
          farmerId: t.farmerId, farmerName: t.farmer.name,
          buyerId: t.buyerId, buyerName: t.buyer.name,
          totalPayableToFarmer: t.totalPayableToFarmer,
          totalReceivableFromBuyer: t.totalReceivableFromBuyer,
          paidAmount: t.paidAmount, farmerPaidAmount: t.farmerPaidAmount,
          mandiCharges: t.mandiCharges, aadhatCharges: t.aadhatCharges,
          hammaliCharges: t.hammaliCharges, extraChargesFarmer: t.extraChargesFarmer, extraChargesBuyer: t.extraChargesBuyer,
          netWeight: t.netWeight, numberOfBags: t.numberOfBags,
          isReversed: t.isReversed,
        })),
        farmersWithDues: farmersWithDues.map(f => ({
          id: f.id, name: f.name, totalPayable: f.totalPayable, totalDue: f.totalDue, totalAdvance: f.totalAdvance, advanceEntries: f.advanceEntries,
        })),
        buyersWithDues: buyersWithDues.map(b => ({
          id: b.id, name: b.name, receivableDue: b.receivableDue, overallDue: b.overallDue, openingBalance: b.openingBalance,
        })),
        txAggregates,
      });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Demo Videos
  app.post("/api/admin/demo-videos", requireAdmin, (req, res) => {
    videoUpload.single("video")(req, res, async (err) => {
      if (err) {
        console.error("Multer upload error:", err);
        return res.status(400).json({ message: err.message || "Upload failed" });
      }
      try {
        if (!req.file) return res.status(400).json({ message: "No video file uploaded" });
        console.log(`Video upload received: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`);
        const caption = req.body.caption || "Demo Video";
        const { db } = await import("./db");
        const { demoVideos } = await import("@shared/schema");
        const [video] = await db.insert(demoVideos).values({
          filename: req.file.filename,
          originalName: req.file.originalname,
          caption,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
        }).returning();
        res.json(video);
      } catch (e: any) {
        console.error("Video save error:", e);
        res.status(400).json({ message: e.message });
      }
    });
  });

  app.get("/api/demo-videos", requireAuth, async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { demoVideos } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      const videos = await db.select({
        id: demoVideos.id,
        caption: demoVideos.caption,
        originalName: demoVideos.originalName,
        mimeType: demoVideos.mimeType,
        fileSize: demoVideos.fileSize,
        uploadedAt: demoVideos.uploadedAt,
      }).from(demoVideos).orderBy(desc(demoVideos.uploadedAt));
      res.json(videos);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/demo-videos/:id/stream", requireAuth, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { demoVideos } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [video] = await db.select().from(demoVideos).where(eq(demoVideos.id, paramId(req.params.id)));
      if (!video) return res.status(404).json({ message: "Video not found" });

      const filePath = path.join(uploadsDir, video.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Video file not found" });

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": video.mimeType,
        });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": video.mimeType,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/admin/demo-videos/:id", requireAdmin, async (req, res) => {
    try {
      const { caption } = req.body;
      if (!caption) return res.status(400).json({ message: "Caption is required" });
      const { db } = await import("./db");
      const { demoVideos } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(demoVideos).set({ caption }).where(eq(demoVideos.id, paramId(req.params.id))).returning();
      if (!updated) return res.status(404).json({ message: "Video not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/admin/demo-videos/:id", requireAdmin, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { demoVideos } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [video] = await db.select().from(demoVideos).where(eq(demoVideos.id, paramId(req.params.id)));
      if (!video) return res.status(404).json({ message: "Video not found" });

      const filePath = path.join(uploadsDir, video.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      await db.delete(demoVideos).where(eq(demoVideos.id, video.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ============ Capital Expense (Cash + Asset) ============
  app.post("/api/capital-expense", requireAuth, async (req, res) => {
    try {
      const { assetName, category, depreciationRate, amount, date, paymentMode, bankAccountId, remarks } = req.body;
      const businessId = req.user!.businessId;

      if (!assetName || !category || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "Asset name, category, and valid amount are required" });
      }

      const entryDate = date || format(new Date(), "yyyy-MM-dd");

      const cashEntry = await storage.createCashEntry({
        businessId,
        category: "outward",
        type: "cash_out",
        outflowType: "Capital Expense",
        amount: String(amount),
        date: entryDate,
        paymentMode: paymentMode || "Cash",
        bankAccountId: bankAccountId || null,
        notes: remarks || null,
        farmerId: null,
        buyerId: null,
        transactionId: null,
        partyName: assetName,
        discount: "0",
        pettyAdj: "0",
      });

      const asset = await storage.createAsset({
        businessId,
        name: assetName,
        category,
        purchaseDate: entryDate,
        originalCost: String(amount),
        currentBookValue: String(amount),
        depreciationRate: String(depreciationRate || "10"),
        assetType: "purchased",
      });

      broadcastBusinessEvent(businessId);
      res.json({ cashEntry, asset });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ============ Books: Assets ============
  app.get("/api/assets", requireAuth, async (req, res) => {
    try {
      const assetList = await storage.getAssets(req.user!.businessId);
      res.json(assetList);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/assets", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const parsed = insertAssetSchema.parse({ ...req.body, businessId });
      const asset = await storage.createAsset(parsed);
      broadcastBusinessEvent(businessId);
      res.json(asset);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.put("/api/assets/:id", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const updated = await storage.updateAsset(paramId(req.params.id), businessId, req.body);
      if (!updated) return res.status(404).json({ message: "Asset not found" });
      broadcastBusinessEvent(businessId);
      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/assets/:id", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      await storage.deleteAsset(paramId(req.params.id), businessId);
      broadcastBusinessEvent(businessId);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.get("/api/assets/:id/depreciation", requireAuth, async (req, res) => {
    try {
      const logs = await storage.getAssetDepreciationLog(paramId(req.params.id), req.user!.businessId);
      res.json(logs);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/assets/depreciation", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const { fy } = req.body;
      if (!fy) return res.status(400).json({ message: "Financial year is required" });
      const results = await storage.runDepreciation(businessId, fy);
      broadcastBusinessEvent(businessId);
      res.json(results);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ============ Books: Liabilities ============
  app.get("/api/liabilities", requireAuth, async (req, res) => {
    try {
      const list = await storage.getLiabilities(req.user!.businessId);
      res.json(list);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/liabilities", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const parsed = insertLiabilitySchema.parse({ ...req.body, businessId });
      const created = await storage.createLiability(parsed);
      broadcastBusinessEvent(businessId);
      res.json(created);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.put("/api/liabilities/:id", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const updated = await storage.updateLiability(paramId(req.params.id), businessId, req.body);
      if (!updated) return res.status(404).json({ message: "Liability not found" });
      broadcastBusinessEvent(businessId);
      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.delete("/api/liabilities/:id", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      await storage.deleteLiability(paramId(req.params.id), businessId);
      broadcastBusinessEvent(businessId);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.get("/api/liabilities/:id/payments", requireAuth, async (req, res) => {
    try {
      const payments = await storage.getLiabilityPayments(paramId(req.params.id), req.user!.businessId);
      res.json(payments);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/liabilities/:id/payments", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const payment = await storage.createLiabilityPayment({ ...req.body, liabilityId: paramId(req.params.id), businessId });
      broadcastBusinessEvent(businessId);
      res.json(payment);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/liabilities/:id/payments/:paymentId/reverse", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const reversed = await storage.reverseLiabilityPayment(paramId(req.params.paymentId), businessId);
      if (!reversed) return res.status(404).json({ message: "Payment not found" });
      broadcastBusinessEvent(businessId);
      res.json(reversed);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/liabilities/:id/settle", requireAuth, async (req, res) => {
    try {
      const businessId = req.user!.businessId;
      const settled = await storage.settleLiability(paramId(req.params.id), businessId);
      if (!settled) return res.status(404).json({ message: "Liability not found" });
      broadcastBusinessEvent(businessId);
      res.json(settled);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // ============ Books: Balance Sheet & P&L ============
  app.get("/api/books/balance-sheet", requireAuth, async (req, res) => {
    try {
      const fy = (req.query.fy as string) || getCurrentFY();
      const data = await storage.getBalanceSheet(req.user!.businessId, fy);
      res.json(data);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/buyer-receipt-serial", requireAuth, async (req, res) => {
    try {
      const { buyerId, date, crop } = z.object({ buyerId: z.number(), date: z.string(), crop: z.string() }).parse(req.body);
      const buyer = await storage.getBuyer(buyerId, req.user!.businessId);
      if (!buyer) return res.status(403).json({ message: "Buyer not found" });
      const serialNumber = await storage.getOrCreateBuyerReceiptSerial(req.user!.businessId, buyerId, date, crop);
      res.json({ serialNumber });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.get("/api/books/profit-and-loss", requireAuth, async (req, res) => {
    try {
      const fy = (req.query.fy as string) || getCurrentFY();
      const data = await storage.getProfitAndLoss(req.user!.businessId, fy);
      res.json(data);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  return httpServer;
}

function getCurrentFY(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${(year + 1).toString().slice(2)}`;
}

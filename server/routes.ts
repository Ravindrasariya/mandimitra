import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireAdmin, hashPassword, comparePasswords } from "./auth";
import { format } from "date-fns";

function paramId(val: string | string[]): number {
  return parseInt(Array.isArray(val) ? val[0] : val);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

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
      };
      const user = await storage.createUser(data);
      const { password, ...safe } = user;
      res.status(201).json(safe);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const { name, phone, businessId, username } = req.body;
    const userId = req.params.id as string;
    const updated = await storage.updateUser(userId, { name, phone, businessId, username });
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

  app.get("/api/farmers", requireAuth, async (req, res) => {
    const search = req.query.search as string | undefined;
    const result = await storage.getFarmers(req.user!.businessId, search);
    res.json(result);
  });

  app.get("/api/farmers/:id", requireAuth, async (req, res) => {
    const farmer = await storage.getFarmer(paramId(req.params.id), req.user!.businessId);
    if (!farmer) return res.status(404).json({ message: "Farmer not found" });
    res.json(farmer);
  });

  app.post("/api/farmers", requireAuth, async (req, res) => {
    try {
      const data = { ...req.body, businessId: req.user!.businessId };
      const farmer = await storage.createFarmer(data);
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
    openingBalance: z.string().optional(),
    negativeFlag: z.boolean().optional(),
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
    const trackFields = ["name", "phone", "village", "negativeFlag", "isArchived"] as const;
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
    res.json(updated);
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
        buyerCode: "Buyer Code",
        negativeFlag: "Negative Flag",
        isActive: "Active Status",
        openingBalance: "Opening Balance",
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
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/buyers/:id/edit-history", requireAuth, async (req, res) => {
    const result = await storage.getBuyerEditHistory(paramId(req.params.id), req.user!.businessId);
    res.json(result);
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

      const serialNum = await storage.getNextSerialNumber(businessId, crop, dateStr);

      const cropPrefix = crop === "Potato" ? "POT" : crop === "Onion" ? "ONI" : "GAR";
      const dateFormatted = dateStr.replace(/-/g, "");
      const lotId = `${cropPrefix}${dateFormatted}${serialNum}`;

      const data = {
        businessId,
        lotId,
        serialNumber: serialNum,
        date: dateStr,
        farmerId: req.body.farmerId,
        crop,
        variety: req.body.variety || null,
        numberOfBags: parseInt(req.body.numberOfBags),
        remainingBags: parseInt(req.body.numberOfBags),
        size: req.body.size,
        bagMarka: req.body.bagMarka || null,
        vehicleNumber: req.body.vehicleNumber ? req.body.vehicleNumber.toUpperCase() : null,
        vehicleBhadaRate: req.body.vehicleBhadaRate || null,
        initialTotalWeight: req.body.initialTotalWeight || null,
      };

      const lot = await storage.createLot(data);
      res.status(201).json(lot);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/lots/:id", requireAuth, async (req, res) => {
    const updated = await storage.updateLot(paramId(req.params.id), req.user!.businessId, req.body);
    if (!updated) return res.status(404).json({ message: "Lot not found" });
    res.json(updated);
  });

  app.post("/api/lots/:id/return", requireAuth, async (req, res) => {
    try {
      const lotId = paramId(req.params.id);
      const businessId = req.user!.businessId;
      const lot = await storage.getLot(lotId, businessId);
      if (!lot) return res.status(404).json({ message: "Lot not found" });
      if (lot.isReturned) return res.status(400).json({ message: "Lot is already returned" });

      const soldBags = lot.numberOfBags - lot.remainingBags;

      if (soldBags > 0) {
        await storage.updateLot(lotId, businessId, {
          numberOfBags: soldBags,
          remainingBags: 0,
          isReturned: true,
        } as any);
      } else {
        await storage.updateLot(lotId, businessId, {
          isReturned: true,
        } as any);
      }

      res.json({ message: "Lot returned successfully", soldBags });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/bids", requireAuth, async (req, res) => {
    const lotId = req.query.lotId ? parseInt(req.query.lotId as string) : undefined;
    const result = await storage.getBids(req.user!.businessId, lotId);
    res.json(result);
  });

  app.post("/api/bids", requireAuth, async (req, res) => {
    try {
      const data = { ...req.body, businessId: req.user!.businessId };
      const bid = await storage.createBid(data);
      res.status(201).json(bid);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/bids/:id", requireAuth, async (req, res) => {
    const updated = await storage.updateBid(paramId(req.params.id), req.user!.businessId, req.body);
    if (!updated) return res.status(404).json({ message: "Bid not found" });
    res.json(updated);
  });

  app.delete("/api/bids/:id", requireAuth, async (req, res) => {
    await storage.deleteBid(paramId(req.params.id), req.user!.businessId);
    res.json({ message: "Deleted" });
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
      res.status(201).json(tx);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/transactions/:id", requireAuth, async (req, res) => {
    const updated = await storage.updateTransaction(paramId(req.params.id), req.user!.businessId, req.body);
    if (!updated) return res.status(404).json({ message: "Transaction not found" });
    res.json(updated);
  });

  app.post("/api/transactions/:id/reverse", requireAuth, async (req, res) => {
    try {
      const txId = paramId(req.params.id);
      const businessId = req.user!.businessId;
      const tx = await storage.getTransaction(txId, businessId);
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      if (tx.isReversed) return res.status(400).json({ message: "Transaction is already reversed" });

      const bagsToReturn = tx.numberOfBags || 0;

      const lot = await storage.getLot(tx.lotId, businessId);
      if (!lot) return res.status(404).json({ message: "Lot not found" });

      const newNumberOfBags = lot.isReturned ? lot.numberOfBags + bagsToReturn : lot.numberOfBags;
      const newRemaining = Math.min(lot.remainingBags + bagsToReturn, newNumberOfBags);
      const updateData: any = { remainingBags: newRemaining, numberOfBags: newNumberOfBags };
      await storage.updateLot(lot.id, businessId, updateData);
      await storage.updateTransaction(txId, businessId, { isReversed: true } as any);

      res.json({ message: "Transaction reversed successfully", bagsReturned: bagsToReturn });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
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
      partyType: req.query.partyType as string | undefined,
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
      const data = { ...req.body, businessId: req.user!.businessId };
      const entry = await storage.createCashEntry(data);
      res.status(201).json(entry);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/cash-entries/:id/reverse", requireAuth, async (req, res) => {
    try {
      const result = await storage.reverseCashEntry(paramId(req.params.id), req.user!.businessId);
      if (!result) return res.status(404).json({ message: "Entry not found" });
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

  return httpServer;
}

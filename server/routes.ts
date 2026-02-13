import type { Express } from "express";
import { createServer, type Server } from "http";
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
    const existingUser = await storage.getUserByUsername("admin");
    if (!existingUser) {
      const merchantId = await storage.getNextMerchantId();
      const biz = await storage.createBusiness({ merchantId, name: "System", address: "", phone: "", status: "active" });
      const hashed = await hashPassword("admin123");
      await storage.createUser({
        username: "admin",
        name: "System Administrator",
        password: hashed,
        phone: "",
        businessId: biz.id,
        role: "system_admin",
        mustChangePassword: true,
      });
    }
  }
  await seedDefaultBusiness();

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

    const isValidReset = await comparePasswords(resetPassword, admin.password);
    if (!isValidReset) return res.status(400).json({ message: "Invalid reset confirmation password" });

    const biz = await storage.getBusiness(paramId(req.params.id));
    if (!biz) return res.status(404).json({ message: "Business not found" });

    await storage.resetBusinessData(biz.id);
    res.json({ message: "Business data has been reset successfully" });
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const result = await storage.getAllUsers();
    const safe = result.map(({ password, ...rest }) => rest);
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

  app.patch("/api/farmers/:id", requireAuth, async (req, res) => {
    const updated = await storage.updateFarmer(paramId(req.params.id), req.user!.businessId, req.body);
    if (!updated) return res.status(404).json({ message: "Farmer not found" });
    res.json(updated);
  });

  app.get("/api/buyers", requireAuth, async (req, res) => {
    const search = req.query.search as string | undefined;
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
      const data = { ...req.body, businessId: req.user!.businessId };
      const buyer = await storage.createBuyer(data);
      res.status(201).json(buyer);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/buyers/:id", requireAuth, async (req, res) => {
    const updated = await storage.updateBuyer(paramId(req.params.id), req.user!.businessId, req.body);
    if (!updated) return res.status(404).json({ message: "Buyer not found" });
    res.json(updated);
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

      const lotNum = await storage.getNextLotNumber(businessId, dateStr);
      const serialNum = await storage.getNextSerialNumber(businessId, crop, dateStr);

      const cropPrefix = crop === "Potato" ? "POT" : crop === "Onion" ? "ONI" : "GAR";
      const dateFormatted = dateStr.replace(/-/g, "");
      const lotId = `${cropPrefix}${dateFormatted}${lotNum}`;

      const avgWeight = req.body.sampleBagWeight1 && req.body.sampleBagWeight2
        ? ((parseFloat(req.body.sampleBagWeight1) + parseFloat(req.body.sampleBagWeight2)) / 2).toFixed(2)
        : req.body.sampleBagWeight1 || req.body.sampleBagWeight2 || null;

      const estimatedWeight = avgWeight && req.body.numberOfBags
        ? (parseFloat(avgWeight) * parseInt(req.body.numberOfBags)).toFixed(2)
        : null;

      const data = {
        ...req.body,
        businessId,
        lotId,
        serialNumber: serialNum,
        date: dateStr,
        remainingBags: req.body.numberOfBags,
        averageBagWeight: avgWeight,
        estimatedWeight,
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

  app.get("/api/cash-entries", requireAuth, async (req, res) => {
    const filters = {
      type: req.query.type as string | undefined,
      farmerId: req.query.farmerId ? parseInt(req.query.farmerId as string) : undefined,
      buyerId: req.query.buyerId ? parseInt(req.query.buyerId as string) : undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
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

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, hashPassword } from "./auth";
import { format } from "date-fns";

function paramId(val: string | string[]): number {
  return parseInt(Array.isArray(val) ? val[0] : val);
}
function queryStr(val: unknown): string | undefined {
  if (typeof val === "string") return val;
  return undefined;
}
function queryInt(val: unknown): number | undefined {
  const s = queryStr(val);
  return s ? parseInt(s) : undefined;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  async function seedDefaultBusiness() {
    const existingUser = await storage.getUserByUsername("admin");
    if (!existingUser) {
      const biz = await storage.createBusiness({ name: "Mandi Mitra Business", address: "Ujjain, MP", phone: "9999999999" });
      const hashed = await hashPassword("admin123");
      await storage.createUser({
        username: "admin",
        password: hashed,
        phone: "9999999999",
        businessId: biz.id,
        role: "admin",
        mustChangePassword: true,
      });
    }
  }
  await seedDefaultBusiness();

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

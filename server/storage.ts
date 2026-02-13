import {
  type User, type InsertUser,
  type Business, type InsertBusiness,
  type Farmer, type InsertFarmer,
  type Buyer, type InsertBuyer,
  type Lot, type InsertLot,
  type Bid, type InsertBid,
  type Transaction, type InsertTransaction,
  type CashEntry, type InsertCashEntry,
  users, businesses, farmers, buyers, lots, bids, transactions, cashEntries,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike, or, sql, desc, asc, gte, lte, ne } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: string, password: string): Promise<void>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  getAllUsers(): Promise<(User & { business: Business })[]>;

  createBusiness(business: InsertBusiness): Promise<Business>;
  getBusiness(id: number): Promise<Business | undefined>;
  getAllBusinesses(): Promise<Business[]>;
  updateBusiness(id: number, data: Partial<InsertBusiness>): Promise<Business | undefined>;
  getNextMerchantId(): Promise<string>;
  resetBusinessData(businessId: number): Promise<void>;

  getFarmers(businessId: number, search?: string): Promise<Farmer[]>;
  getFarmer(id: number, businessId: number): Promise<Farmer | undefined>;
  createFarmer(farmer: InsertFarmer): Promise<Farmer>;
  updateFarmer(id: number, businessId: number, data: Partial<InsertFarmer>): Promise<Farmer | undefined>;

  getBuyers(businessId: number, search?: string): Promise<Buyer[]>;
  getBuyer(id: number, businessId: number): Promise<Buyer | undefined>;
  createBuyer(buyer: InsertBuyer): Promise<Buyer>;
  updateBuyer(id: number, businessId: number, data: Partial<InsertBuyer>): Promise<Buyer | undefined>;

  getLots(businessId: number, filters?: { crop?: string; date?: string; search?: string }): Promise<(Lot & { farmer: Farmer })[]>;
  getLot(id: number, businessId: number): Promise<(Lot & { farmer: Farmer }) | undefined>;
  createLot(lot: InsertLot): Promise<Lot>;
  updateLot(id: number, businessId: number, data: Partial<InsertLot>): Promise<Lot | undefined>;
  getNextSerialNumber(businessId: number, crop: string, date: string): Promise<number>;
  getNextLotNumber(businessId: number, date: string): Promise<number>;

  getBids(businessId: number, lotId?: number): Promise<(Bid & { buyer: Buyer; lot: Lot })[]>;
  createBid(bid: InsertBid): Promise<Bid>;
  updateBid(id: number, businessId: number, data: Partial<InsertBid>): Promise<Bid | undefined>;
  deleteBid(id: number, businessId: number): Promise<void>;

  getTransactions(businessId: number, filters?: { farmerId?: number; buyerId?: number; dateFrom?: string; dateTo?: string }): Promise<(Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid })[]>;
  getTransaction(id: number, businessId: number): Promise<(Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid }) | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, businessId: number, data: Partial<InsertTransaction>): Promise<Transaction | undefined>;

  getCashEntries(businessId: number, filters?: { type?: string; farmerId?: number; buyerId?: number; dateFrom?: string; dateTo?: string }): Promise<CashEntry[]>;
  createCashEntry(entry: InsertCashEntry): Promise<CashEntry>;

  getFarmerLedger(businessId: number, farmerId: number, dateFrom?: string, dateTo?: string): Promise<{ transactions: Transaction[]; cashEntries: CashEntry[]; farmer: Farmer }>;
  getBuyerLedger(businessId: number, buyerId: number, dateFrom?: string, dateTo?: string): Promise<{ transactions: Transaction[]; cashEntries: CashEntry[]; buyer: Buyer }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUserPassword(id: string, password: string): Promise<void> {
    await db.update(users).set({ password, mustChangePassword: false }).where(eq(users.id, id));
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<(User & { business: Business })[]> {
    const results = await db.select({
      user: users,
      business: businesses,
    }).from(users)
      .innerJoin(businesses, eq(users.businessId, businesses.id))
      .orderBy(asc(users.username));
    return results.map(r => ({ ...r.user, business: r.business }));
  }

  async createBusiness(business: InsertBusiness): Promise<Business> {
    const [created] = await db.insert(businesses).values(business).returning();
    return created;
  }

  async getBusiness(id: number): Promise<Business | undefined> {
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, id));
    return biz;
  }

  async getAllBusinesses(): Promise<Business[]> {
    return db.select().from(businesses).orderBy(desc(businesses.createdAt));
  }

  async updateBusiness(id: number, data: Partial<InsertBusiness>): Promise<Business | undefined> {
    const [updated] = await db.update(businesses).set(data).where(eq(businesses.id, id)).returning();
    return updated;
  }

  async getNextMerchantId(): Promise<string> {
    const today = new Date();
    const dateStr = today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, "0") +
      today.getDate().toString().padStart(2, "0");
    const prefix = `BU${dateStr}`;
    const [result] = await db.select({ count: sql<string>`count(*)` })
      .from(businesses)
      .where(ilike(businesses.merchantId, `${prefix}%`));
    const seq = parseInt(result?.count || "0", 10) + 1;
    return `${prefix}${seq}`;
  }

  async resetBusinessData(businessId: number): Promise<void> {
    await db.delete(cashEntries).where(eq(cashEntries.businessId, businessId));
    await db.delete(transactions).where(eq(transactions.businessId, businessId));
    await db.delete(bids).where(eq(bids.businessId, businessId));
    await db.delete(lots).where(eq(lots.businessId, businessId));
    await db.delete(farmers).where(eq(farmers.businessId, businessId));
    await db.delete(buyers).where(eq(buyers.businessId, businessId));
  }

  async getFarmers(businessId: number, search?: string): Promise<Farmer[]> {
    if (search) {
      return db.select().from(farmers).where(
        and(
          eq(farmers.businessId, businessId),
          or(
            ilike(farmers.name, `%${search}%`),
            ilike(farmers.phone, `%${search}%`),
            ilike(farmers.village, `%${search}%`)
          )
        )
      ).orderBy(asc(farmers.name));
    }
    return db.select().from(farmers).where(eq(farmers.businessId, businessId)).orderBy(asc(farmers.name));
  }

  async getFarmer(id: number, businessId: number): Promise<Farmer | undefined> {
    const [farmer] = await db.select().from(farmers).where(and(eq(farmers.id, id), eq(farmers.businessId, businessId)));
    return farmer;
  }

  async createFarmer(farmer: InsertFarmer): Promise<Farmer> {
    const [created] = await db.insert(farmers).values(farmer).returning();
    return created;
  }

  async updateFarmer(id: number, businessId: number, data: Partial<InsertFarmer>): Promise<Farmer | undefined> {
    const [updated] = await db.update(farmers).set(data).where(and(eq(farmers.id, id), eq(farmers.businessId, businessId))).returning();
    return updated;
  }

  async getBuyers(businessId: number, search?: string): Promise<Buyer[]> {
    if (search) {
      return db.select().from(buyers).where(
        and(
          eq(buyers.businessId, businessId),
          or(
            ilike(buyers.name, `%${search}%`),
            ilike(buyers.phone, `%${search}%`)
          )
        )
      ).orderBy(asc(buyers.name));
    }
    return db.select().from(buyers).where(eq(buyers.businessId, businessId)).orderBy(asc(buyers.name));
  }

  async getBuyer(id: number, businessId: number): Promise<Buyer | undefined> {
    const [buyer] = await db.select().from(buyers).where(and(eq(buyers.id, id), eq(buyers.businessId, businessId)));
    return buyer;
  }

  async createBuyer(buyer: InsertBuyer): Promise<Buyer> {
    const [created] = await db.insert(buyers).values(buyer).returning();
    return created;
  }

  async updateBuyer(id: number, businessId: number, data: Partial<InsertBuyer>): Promise<Buyer | undefined> {
    const [updated] = await db.update(buyers).set(data).where(and(eq(buyers.id, id), eq(buyers.businessId, businessId))).returning();
    return updated;
  }

  async getLots(businessId: number, filters?: { crop?: string; date?: string; search?: string }): Promise<(Lot & { farmer: Farmer })[]> {
    let conditions = [eq(lots.businessId, businessId)];
    if (filters?.crop) conditions.push(eq(lots.crop, filters.crop));
    if (filters?.date) conditions.push(eq(lots.date, filters.date));
    
    const results = await db.select({
      lot: lots,
      farmer: farmers,
    }).from(lots)
      .innerJoin(farmers, eq(lots.farmerId, farmers.id))
      .where(and(...conditions))
      .orderBy(desc(lots.createdAt));

    let mapped = results.map(r => ({ ...r.lot, farmer: r.farmer }));

    if (filters?.search) {
      const s = filters.search.toLowerCase();
      mapped = mapped.filter(l =>
        l.lotId.toLowerCase().includes(s) ||
        l.serialNumber.toString().includes(s) ||
        l.farmer.name.toLowerCase().includes(s) ||
        l.farmer.phone.toLowerCase().includes(s)
      );
    }

    return mapped;
  }

  async getLot(id: number, businessId: number): Promise<(Lot & { farmer: Farmer }) | undefined> {
    const [result] = await db.select({
      lot: lots,
      farmer: farmers,
    }).from(lots)
      .innerJoin(farmers, eq(lots.farmerId, farmers.id))
      .where(and(eq(lots.id, id), eq(lots.businessId, businessId)));
    
    return result ? { ...result.lot, farmer: result.farmer } : undefined;
  }

  async createLot(lot: InsertLot): Promise<Lot> {
    const [created] = await db.insert(lots).values(lot).returning();
    return created;
  }

  async updateLot(id: number, businessId: number, data: Partial<InsertLot>): Promise<Lot | undefined> {
    const [updated] = await db.update(lots).set(data).where(and(eq(lots.id, id), eq(lots.businessId, businessId))).returning();
    return updated;
  }

  async getNextSerialNumber(businessId: number, crop: string, date: string): Promise<number> {
    const [result] = await db.select({ max: sql<string>`coalesce(max(${lots.serialNumber}), 0)` })
      .from(lots)
      .where(and(eq(lots.businessId, businessId), eq(lots.crop, crop), eq(lots.date, date)));
    return parseInt(result?.max || "0", 10) + 1;
  }

  async getNextLotNumber(businessId: number, date: string): Promise<number> {
    const [result] = await db.select({ count: sql<string>`count(*)` })
      .from(lots)
      .where(and(eq(lots.businessId, businessId), eq(lots.date, date)));
    return parseInt(result?.count || "0", 10) + 1;
  }

  async getBids(businessId: number, lotId?: number): Promise<(Bid & { buyer: Buyer; lot: Lot })[]> {
    let conditions = [eq(bids.businessId, businessId)];
    if (lotId) conditions.push(eq(bids.lotId, lotId));

    const results = await db.select({
      bid: bids,
      buyer: buyers,
      lot: lots,
    }).from(bids)
      .innerJoin(buyers, eq(bids.buyerId, buyers.id))
      .innerJoin(lots, eq(bids.lotId, lots.id))
      .where(and(...conditions))
      .orderBy(desc(bids.createdAt));

    return results.map(r => ({ ...r.bid, buyer: r.buyer, lot: r.lot }));
  }

  async createBid(bid: InsertBid): Promise<Bid> {
    const [created] = await db.insert(bids).values(bid).returning();
    await db.update(lots).set({
      remainingBags: sql`${lots.remainingBags} - ${bid.numberOfBags}`
    }).where(eq(lots.id, bid.lotId));
    return created;
  }

  async updateBid(id: number, businessId: number, data: Partial<InsertBid>): Promise<Bid | undefined> {
    const [existing] = await db.select().from(bids).where(and(eq(bids.id, id), eq(bids.businessId, businessId)));
    if (!existing) return undefined;

    if (data.numberOfBags && data.numberOfBags !== existing.numberOfBags) {
      const diff = existing.numberOfBags - data.numberOfBags;
      await db.update(lots).set({
        remainingBags: sql`${lots.remainingBags} + ${diff}`
      }).where(eq(lots.id, existing.lotId));
    }

    const [updated] = await db.update(bids).set(data).where(and(eq(bids.id, id), eq(bids.businessId, businessId))).returning();
    return updated;
  }

  async deleteBid(id: number, businessId: number): Promise<void> {
    const [existing] = await db.select().from(bids).where(and(eq(bids.id, id), eq(bids.businessId, businessId)));
    if (existing) {
      await db.update(lots).set({
        remainingBags: sql`${lots.remainingBags} + ${existing.numberOfBags}`
      }).where(eq(lots.id, existing.lotId));
      await db.delete(bids).where(and(eq(bids.id, id), eq(bids.businessId, businessId)));
    }
  }

  async getTransactions(businessId: number, filters?: { farmerId?: number; buyerId?: number; dateFrom?: string; dateTo?: string }): Promise<(Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid })[]> {
    let conditions = [eq(transactions.businessId, businessId)];
    if (filters?.farmerId) conditions.push(eq(transactions.farmerId, filters.farmerId));
    if (filters?.buyerId) conditions.push(eq(transactions.buyerId, filters.buyerId));
    if (filters?.dateFrom) conditions.push(gte(transactions.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(transactions.date, filters.dateTo));

    const results = await db.select({
      transaction: transactions,
      farmer: farmers,
      buyer: buyers,
      lot: lots,
      bid: bids,
    }).from(transactions)
      .innerJoin(farmers, eq(transactions.farmerId, farmers.id))
      .innerJoin(buyers, eq(transactions.buyerId, buyers.id))
      .innerJoin(lots, eq(transactions.lotId, lots.id))
      .innerJoin(bids, eq(transactions.bidId, bids.id))
      .where(and(...conditions))
      .orderBy(desc(transactions.createdAt));

    return results.map(r => ({ ...r.transaction, farmer: r.farmer, buyer: r.buyer, lot: r.lot, bid: r.bid }));
  }

  async getTransaction(id: number, businessId: number): Promise<(Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid }) | undefined> {
    const [result] = await db.select({
      transaction: transactions,
      farmer: farmers,
      buyer: buyers,
      lot: lots,
      bid: bids,
    }).from(transactions)
      .innerJoin(farmers, eq(transactions.farmerId, farmers.id))
      .innerJoin(buyers, eq(transactions.buyerId, buyers.id))
      .innerJoin(lots, eq(transactions.lotId, lots.id))
      .innerJoin(bids, eq(transactions.bidId, bids.id))
      .where(and(eq(transactions.id, id), eq(transactions.businessId, businessId)));

    return result ? { ...result.transaction, farmer: result.farmer, buyer: result.buyer, lot: result.lot, bid: result.bid } : undefined;
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [created] = await db.insert(transactions).values(transaction).returning();
    return created;
  }

  async updateTransaction(id: number, businessId: number, data: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    const [updated] = await db.update(transactions).set(data).where(and(eq(transactions.id, id), eq(transactions.businessId, businessId))).returning();
    return updated;
  }

  async getCashEntries(businessId: number, filters?: { type?: string; farmerId?: number; buyerId?: number; dateFrom?: string; dateTo?: string }): Promise<CashEntry[]> {
    let conditions = [eq(cashEntries.businessId, businessId)];
    if (filters?.type) conditions.push(eq(cashEntries.type, filters.type));
    if (filters?.farmerId) conditions.push(eq(cashEntries.farmerId, filters.farmerId));
    if (filters?.buyerId) conditions.push(eq(cashEntries.buyerId, filters.buyerId));
    if (filters?.dateFrom) conditions.push(gte(cashEntries.date, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(cashEntries.date, filters.dateTo));

    return db.select().from(cashEntries).where(and(...conditions)).orderBy(desc(cashEntries.createdAt));
  }

  async createCashEntry(entry: InsertCashEntry): Promise<CashEntry> {
    const [created] = await db.insert(cashEntries).values(entry).returning();
    return created;
  }

  async getFarmerLedger(businessId: number, farmerId: number, dateFrom?: string, dateTo?: string) {
    const farmer = await this.getFarmer(farmerId, businessId);
    if (!farmer) throw new Error("Farmer not found");

    let txConditions = [eq(transactions.businessId, businessId), eq(transactions.farmerId, farmerId)];
    if (dateFrom) txConditions.push(gte(transactions.date, dateFrom));
    if (dateTo) txConditions.push(lte(transactions.date, dateTo));

    const txns = await db.select().from(transactions).where(and(...txConditions)).orderBy(asc(transactions.date));

    let cashConditions = [eq(cashEntries.businessId, businessId), eq(cashEntries.farmerId, farmerId)];
    if (dateFrom) cashConditions.push(gte(cashEntries.date, dateFrom));
    if (dateTo) cashConditions.push(lte(cashEntries.date, dateTo));

    const cash = await db.select().from(cashEntries).where(and(...cashConditions)).orderBy(asc(cashEntries.date));

    return { transactions: txns, cashEntries: cash, farmer };
  }

  async getBuyerLedger(businessId: number, buyerId: number, dateFrom?: string, dateTo?: string) {
    const buyer = await this.getBuyer(buyerId, businessId);
    if (!buyer) throw new Error("Buyer not found");

    let txConditions = [eq(transactions.businessId, businessId), eq(transactions.buyerId, buyerId)];
    if (dateFrom) txConditions.push(gte(transactions.date, dateFrom));
    if (dateTo) txConditions.push(lte(transactions.date, dateTo));

    const txns = await db.select().from(transactions).where(and(...txConditions)).orderBy(asc(transactions.date));

    let cashConditions = [eq(cashEntries.businessId, businessId), eq(cashEntries.buyerId, buyerId)];
    if (dateFrom) cashConditions.push(gte(cashEntries.date, dateFrom));
    if (dateTo) cashConditions.push(lte(cashEntries.date, dateTo));

    const cash = await db.select().from(cashEntries).where(and(...cashConditions)).orderBy(asc(cashEntries.date));

    return { transactions: txns, cashEntries: cash, buyer };
  }
}

export const storage = new DatabaseStorage();

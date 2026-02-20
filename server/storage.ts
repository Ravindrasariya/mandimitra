import {
  type User, type InsertUser,
  type Business, type InsertBusiness,
  type Farmer, type InsertFarmer,
  type FarmerEditHistory, type InsertFarmerEditHistory,
  type Buyer, type InsertBuyer,
  type BuyerEditHistory, type InsertBuyerEditHistory,
  type Lot, type InsertLot,
  type Bid, type InsertBid,
  type Transaction, type InsertTransaction,
  type BankAccount, type InsertBankAccount,
  type CashSettings, type InsertCashSettings,
  type CashEntry, type InsertCashEntry,
  type BusinessChargeSettings, type InsertBusinessChargeSettings,
  users, businesses, farmers, farmerEditHistory, buyers, buyerEditHistory, lots, bids, transactions, bankAccounts, cashSettings, cashEntries, businessChargeSettings,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike, or, sql, desc, asc, gte, lte, ne, isNotNull } from "drizzle-orm";

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
  getFarmersWithDues(businessId: number, search?: string): Promise<(Farmer & { totalPayable: string; totalDue: string; salesCount: number })[]>;
  getFarmerEditHistory(farmerId: number, businessId: number): Promise<FarmerEditHistory[]>;
  createFarmerEditHistory(entry: InsertFarmerEditHistory): Promise<FarmerEditHistory>;
  mergeFarmers(businessId: number, keepId: number, mergeId: number, changedBy: string): Promise<Farmer>;

  getNextFarmerId(businessId: number): Promise<string>;
  getFarmerLocations(businessId: number): Promise<{ villages: string[]; tehsils: string[] }>;

  getBuyers(businessId: number, search?: string): Promise<Buyer[]>;
  getBuyer(id: number, businessId: number): Promise<Buyer | undefined>;
  createBuyer(buyer: InsertBuyer): Promise<Buyer>;
  updateBuyer(id: number, businessId: number, data: Partial<InsertBuyer>): Promise<Buyer | undefined>;
  getNextBuyerId(businessId: number): Promise<string>;
  getBuyerEditHistory(buyerId: number, businessId: number): Promise<BuyerEditHistory[]>;
  createBuyerEditHistory(entry: InsertBuyerEditHistory): Promise<BuyerEditHistory>;
  getBuyersWithDues(businessId: number, search?: string): Promise<(Buyer & { receivableDue: string; overallDue: string; bidDates: string[] })[]>;

  getLots(businessId: number, filters?: { crop?: string; date?: string; search?: string }): Promise<(Lot & { farmer: Farmer })[]>;
  getLot(id: number, businessId: number): Promise<(Lot & { farmer: Farmer }) | undefined>;
  createLot(lot: InsertLot): Promise<Lot>;
  updateLot(id: number, businessId: number, data: Partial<InsertLot>): Promise<Lot | undefined>;
  getNextSerialNumber(businessId: number, crop: string, date: string): Promise<number>;
  getBids(businessId: number, lotId?: number): Promise<(Bid & { buyer: Buyer; lot: Lot; farmer: Farmer })[]>;
  createBid(bid: InsertBid): Promise<Bid>;
  updateBid(id: number, businessId: number, data: Partial<InsertBid>): Promise<Bid | undefined>;
  deleteBid(id: number, businessId: number): Promise<void>;

  getTransactions(businessId: number, filters?: { farmerId?: number; buyerId?: number; dateFrom?: string; dateTo?: string }): Promise<(Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid })[]>;
  getTransaction(id: number, businessId: number): Promise<(Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid }) | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, businessId: number, data: Partial<InsertTransaction>): Promise<Transaction | undefined>;

  getBankAccounts(businessId: number): Promise<BankAccount[]>;
  createBankAccount(account: InsertBankAccount): Promise<BankAccount>;
  updateBankAccount(id: number, businessId: number, data: Partial<InsertBankAccount>): Promise<BankAccount | undefined>;
  deleteBankAccount(id: number, businessId: number): Promise<void>;

  getBusinessChargeSettings(businessId: number): Promise<BusinessChargeSettings | undefined>;
  upsertBusinessChargeSettings(businessId: number, data: Partial<InsertBusinessChargeSettings>): Promise<BusinessChargeSettings>;

  getCashSettings(businessId: number): Promise<CashSettings | undefined>;
  upsertCashSettings(businessId: number, cashInHandOpening: string): Promise<CashSettings>;

  getCashEntries(businessId: number, filters?: { category?: string; outflowType?: string; farmerId?: number; buyerId?: number; month?: string; year?: string }): Promise<CashEntry[]>;
  createCashEntry(entry: InsertCashEntry): Promise<CashEntry>;
  reverseCashEntry(id: number, businessId: number, reason?: string | null): Promise<CashEntry | undefined>;

  recalculateBuyerPaymentStatus(businessId: number, buyerId: number): Promise<void>;
  recalculateFarmerPaymentStatus(businessId: number, farmerId: number): Promise<void>;

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
    await db.delete(farmerEditHistory).where(eq(farmerEditHistory.businessId, businessId));
    await db.delete(farmers).where(eq(farmers.businessId, businessId));
    await db.delete(buyerEditHistory).where(eq(buyerEditHistory.businessId, businessId));
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
            ilike(farmers.village, `%${search}%`),
            ilike(farmers.farmerId, `%${search}%`)
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

  async getNextFarmerId(businessId: number): Promise<string> {
    const today = new Date();
    const dateStr = today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, "0") +
      today.getDate().toString().padStart(2, "0");
    const prefix = `FM${dateStr}`;
    const [result] = await db.select({ count: sql<string>`count(*)` })
      .from(farmers)
      .where(and(eq(farmers.businessId, businessId), ilike(farmers.farmerId, `${prefix}%`)));
    const seq = parseInt(result?.count || "0", 10) + 1;
    return `${prefix}${seq}`;
  }

  async getFarmerLocations(businessId: number): Promise<{ villages: string[]; tehsils: string[] }> {
    const villageRows = await db.selectDistinct({ village: farmers.village })
      .from(farmers)
      .where(and(eq(farmers.businessId, businessId), isNotNull(farmers.village), sql`${farmers.village} != ''`))
      .orderBy(asc(farmers.village));
    const tehsilRows = await db.selectDistinct({ tehsil: farmers.tehsil })
      .from(farmers)
      .where(and(eq(farmers.businessId, businessId), isNotNull(farmers.tehsil), sql`${farmers.tehsil} != ''`))
      .orderBy(asc(farmers.tehsil));
    return {
      villages: villageRows.map(r => r.village!),
      tehsils: tehsilRows.map(r => r.tehsil!),
    };
  }

  async createFarmer(farmer: InsertFarmer): Promise<Farmer> {
    const farmerId = await this.getNextFarmerId(farmer.businessId);
    const [created] = await db.insert(farmers).values({ ...farmer, farmerId }).returning();
    return created;
  }

  async updateFarmer(id: number, businessId: number, data: Partial<InsertFarmer>): Promise<Farmer | undefined> {
    const [updated] = await db.update(farmers).set(data).where(and(eq(farmers.id, id), eq(farmers.businessId, businessId))).returning();
    return updated;
  }

  async getFarmersWithDues(businessId: number, search?: string): Promise<(Farmer & { totalPayable: string; totalDue: string; salesCount: number })[]> {
    let farmerList: Farmer[];
    if (search) {
      farmerList = await db.select().from(farmers).where(
        and(
          eq(farmers.businessId, businessId),
          or(
            ilike(farmers.name, `%${search}%`),
            ilike(farmers.phone, `%${search}%`),
            ilike(farmers.village, `%${search}%`),
            ilike(farmers.farmerId, `%${search}%`)
          )
        )
      ).orderBy(asc(farmers.id));
    } else {
      farmerList = await db.select().from(farmers).where(eq(farmers.businessId, businessId)).orderBy(asc(farmers.id));
    }

    const results: (Farmer & { totalPayable: string; totalDue: string; salesCount: number })[] = [];
    for (const farmer of farmerList) {
      const [txSum] = await db.select({
        total: sql<string>`coalesce(sum(cast(${transactions.totalPayableToFarmer} as numeric)), 0)`,
        count: sql<number>`count(*)`,
      }).from(transactions).where(and(eq(transactions.businessId, businessId), eq(transactions.farmerId, farmer.id), eq(transactions.isReversed, false)));

      const [cashSum] = await db.select({
        total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
      }).from(cashEntries).where(and(eq(cashEntries.businessId, businessId), eq(cashEntries.farmerId, farmer.id), eq(cashEntries.isReversed, false)));

      const totalPayable = parseFloat(txSum?.total || "0");
      const totalPaid = parseFloat(cashSum?.total || "0");
      const openingBal = parseFloat(farmer.openingBalance || "0");
      const totalDue = openingBal + totalPayable - totalPaid;
      const salesCount = Number(txSum?.count || 0);

      results.push({
        ...farmer,
        totalPayable: totalPayable.toFixed(2),
        totalDue: totalDue.toFixed(2),
        salesCount,
      });
    }
    return results;
  }

  async getFarmerEditHistory(farmerId: number, businessId: number): Promise<FarmerEditHistory[]> {
    return db.select().from(farmerEditHistory)
      .where(and(eq(farmerEditHistory.farmerId, farmerId), eq(farmerEditHistory.businessId, businessId)))
      .orderBy(desc(farmerEditHistory.createdAt));
  }

  async createFarmerEditHistory(entry: InsertFarmerEditHistory): Promise<FarmerEditHistory> {
    const [created] = await db.insert(farmerEditHistory).values(entry).returning();
    return created;
  }

  async mergeFarmers(businessId: number, keepId: number, mergeId: number, changedBy: string): Promise<Farmer> {
    const keepFarmer = await this.getFarmer(keepId, businessId);
    const mergeFarmer = await this.getFarmer(mergeId, businessId);
    if (!keepFarmer || !mergeFarmer) throw new Error("Farmer not found");

    await db.update(lots).set({ farmerId: keepId }).where(and(eq(lots.farmerId, mergeId), eq(lots.businessId, businessId)));
    await db.update(transactions).set({ farmerId: keepId }).where(and(eq(transactions.farmerId, mergeId), eq(transactions.businessId, businessId)));
    await db.update(cashEntries).set({ farmerId: keepId }).where(and(eq(cashEntries.farmerId, mergeId), eq(cashEntries.businessId, businessId)));

    const mergeOpeningBal = parseFloat(mergeFarmer.openingBalance || "0");
    const keepOpeningBal = parseFloat(keepFarmer.openingBalance || "0");
    const newOpeningBal = (keepOpeningBal + mergeOpeningBal).toFixed(2);

    await db.update(farmers).set({ openingBalance: newOpeningBal }).where(and(eq(farmers.id, keepId), eq(farmers.businessId, businessId)));

    await this.createFarmerEditHistory({
      farmerId: keepId,
      businessId,
      fieldChanged: "merge",
      oldValue: `Farmer ID ${mergeId} (${mergeFarmer.name})`,
      newValue: `Merged with opening balance ₹${mergeOpeningBal}`,
      changedBy,
    });

    await db.update(farmerEditHistory).set({ farmerId: keepId }).where(and(eq(farmerEditHistory.farmerId, mergeId), eq(farmerEditHistory.businessId, businessId)));

    await db.delete(farmers).where(and(eq(farmers.id, mergeId), eq(farmers.businessId, businessId)));

    const [updated] = await db.select().from(farmers).where(and(eq(farmers.id, keepId), eq(farmers.businessId, businessId)));
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

  async getNextBuyerId(businessId: number): Promise<string> {
    const today = new Date();
    const dateStr = today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, "0") +
      today.getDate().toString().padStart(2, "0");
    const prefix = `BY${dateStr}`;
    const [result] = await db.select({ count: sql<string>`count(*)` })
      .from(buyers)
      .where(and(eq(buyers.businessId, businessId), ilike(buyers.buyerId, `${prefix}%`)));
    const seq = parseInt(result?.count || "0", 10) + 1;
    return `${prefix}${seq}`;
  }

  async getBuyerEditHistory(buyerId: number, businessId: number): Promise<BuyerEditHistory[]> {
    return db.select().from(buyerEditHistory)
      .where(and(eq(buyerEditHistory.buyerId, buyerId), eq(buyerEditHistory.businessId, businessId)))
      .orderBy(desc(buyerEditHistory.createdAt));
  }

  async createBuyerEditHistory(entry: InsertBuyerEditHistory): Promise<BuyerEditHistory> {
    const [created] = await db.insert(buyerEditHistory).values(entry).returning();
    return created;
  }

  async getBuyersWithDues(businessId: number, search?: string): Promise<(Buyer & { receivableDue: string; overallDue: string; bidDates: string[] })[]> {
    let buyerList: Buyer[];
    if (search) {
      buyerList = await db.select().from(buyers).where(
        and(
          eq(buyers.businessId, businessId),
          or(
            ilike(buyers.name, `%${search}%`),
            ilike(buyers.phone, `%${search}%`),
            ilike(buyers.buyerId, `%${search}%`)
          )
        )
      ).orderBy(asc(buyers.name));
    } else {
      buyerList = await db.select().from(buyers).where(eq(buyers.businessId, businessId)).orderBy(asc(buyers.name));
    }

    const allBidDates = await db.select({
      buyerId: bids.buyerId,
      bidDate: sql<string>`to_char(${bids.createdAt}, 'YYYY-MM-DD')`
    }).from(bids).where(eq(bids.businessId, businessId));

    const bidDateMap = new Map<number, Set<string>>();
    for (const row of allBidDates) {
      if (!bidDateMap.has(row.buyerId)) bidDateMap.set(row.buyerId, new Set());
      bidDateMap.get(row.buyerId)!.add(row.bidDate);
    }

    const results: (Buyer & { receivableDue: string; overallDue: string; bidDates: string[] })[] = [];
    for (const buyer of buyerList) {
      const [txSum] = await db.select({
        total: sql<string>`coalesce(sum(cast(${transactions.totalReceivableFromBuyer} as numeric)), 0)`
      }).from(transactions).where(and(eq(transactions.businessId, businessId), eq(transactions.buyerId, buyer.id), eq(transactions.isReversed, false)));

      const [cashSum] = await db.select({
        total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
      }).from(cashEntries).where(and(eq(cashEntries.businessId, businessId), eq(cashEntries.buyerId, buyer.id), eq(cashEntries.isReversed, false)));

      const totalReceivable = parseFloat(txSum?.total || "0");
      const totalPaid = parseFloat(cashSum?.total || "0");
      const openingBal = parseFloat(buyer.openingBalance || "0");
      const receivableDue = (totalReceivable - totalPaid).toFixed(2);
      const overallDue = (openingBal + totalReceivable - totalPaid).toFixed(2);

      const buyerBidDates = bidDateMap.get(buyer.id);
      results.push({ ...buyer, receivableDue, overallDue, bidDates: buyerBidDates ? Array.from(buyerBidDates) : [] });
    }
    return results;
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

  async getBids(businessId: number, lotId?: number): Promise<(Bid & { buyer: Buyer; lot: Lot; farmer: Farmer })[]> {
    let conditions: any[] = [eq(bids.businessId, businessId)];
    if (lotId) conditions.push(eq(bids.lotId, lotId));

    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM ${transactions} WHERE ${transactions.bidId} = ${bids.id} AND ${transactions.businessId} = ${businessId} AND ${transactions.isReversed} = true)`
    );

    const results = await db.select({
      bid: bids,
      buyer: buyers,
      lot: lots,
      farmer: farmers,
    }).from(bids)
      .innerJoin(buyers, eq(bids.buyerId, buyers.id))
      .innerJoin(lots, eq(bids.lotId, lots.id))
      .innerJoin(farmers, eq(lots.farmerId, farmers.id))
      .where(and(...conditions))
      .orderBy(desc(bids.createdAt));

    return results.map(r => ({ ...r.bid, buyer: r.buyer, lot: r.lot, farmer: r.farmer }));
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
    const txDate = transaction.date ? new Date(transaction.date + "T00:00:00") : new Date();
    const dateStr = `${txDate.getFullYear()}${String(txDate.getMonth() + 1).padStart(2, "0")}${String(txDate.getDate()).padStart(2, "0")}`;
    const prefix = `TX${dateStr}`;

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await db.select({ transactionId: transactions.transactionId })
        .from(transactions)
        .where(and(
          eq(transactions.businessId, transaction.businessId),
          sql`${transactions.transactionId} like ${prefix + "%"}`
        ));

      let maxSeq = 0;
      for (const row of existing) {
        const suffix = row.transactionId.substring(prefix.length);
        const num = parseInt(suffix, 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }

      const seq = maxSeq + 1;
      const transactionId = `${prefix}${seq}`;

      try {
        const [created] = await db.insert(transactions).values({ ...transaction, transactionId }).returning();
        return created;
      } catch (e: any) {
        if (e.code === "23505" && attempt < 4) continue;
        throw e;
      }
    }
    throw new Error("Failed to generate unique transaction ID after retries");
  }

  async updateTransaction(id: number, businessId: number, data: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    const [updated] = await db.update(transactions).set(data).where(and(eq(transactions.id, id), eq(transactions.businessId, businessId))).returning();
    return updated;
  }

  async getBankAccounts(businessId: number): Promise<BankAccount[]> {
    return db.select().from(bankAccounts).where(eq(bankAccounts.businessId, businessId)).orderBy(asc(bankAccounts.createdAt));
  }

  async createBankAccount(account: InsertBankAccount): Promise<BankAccount> {
    const [created] = await db.insert(bankAccounts).values(account).returning();
    return created;
  }

  async updateBankAccount(id: number, businessId: number, data: Partial<InsertBankAccount>): Promise<BankAccount | undefined> {
    const [updated] = await db.update(bankAccounts).set(data).where(and(eq(bankAccounts.id, id), eq(bankAccounts.businessId, businessId))).returning();
    return updated;
  }

  async deleteBankAccount(id: number, businessId: number): Promise<void> {
    await db.delete(bankAccounts).where(and(eq(bankAccounts.id, id), eq(bankAccounts.businessId, businessId)));
  }

  async getBusinessChargeSettings(businessId: number): Promise<BusinessChargeSettings | undefined> {
    const [settings] = await db.select().from(businessChargeSettings).where(eq(businessChargeSettings.businessId, businessId));
    return settings;
  }

  async upsertBusinessChargeSettings(businessId: number, data: Partial<InsertBusinessChargeSettings>): Promise<BusinessChargeSettings> {
    const existing = await this.getBusinessChargeSettings(businessId);
    if (existing) {
      const [updated] = await db.update(businessChargeSettings).set(data).where(eq(businessChargeSettings.businessId, businessId)).returning();
      return updated;
    }
    const [created] = await db.insert(businessChargeSettings).values({ businessId, ...data }).returning();
    return created;
  }

  async getCashSettings(businessId: number): Promise<CashSettings | undefined> {
    const [settings] = await db.select().from(cashSettings).where(eq(cashSettings.businessId, businessId));
    return settings;
  }

  async upsertCashSettings(businessId: number, cashInHandOpening: string): Promise<CashSettings> {
    const existing = await this.getCashSettings(businessId);
    if (existing) {
      const [updated] = await db.update(cashSettings).set({ cashInHandOpening }).where(eq(cashSettings.businessId, businessId)).returning();
      return updated;
    }
    const [created] = await db.insert(cashSettings).values({ businessId, cashInHandOpening }).returning();
    return created;
  }

  async getCashEntries(businessId: number, filters?: { category?: string; outflowType?: string; farmerId?: number; buyerId?: number; month?: string; year?: string }): Promise<CashEntry[]> {
    let conditions = [eq(cashEntries.businessId, businessId)];
    if (filters?.category) conditions.push(eq(cashEntries.category, filters.category));
    if (filters?.outflowType) conditions.push(eq(cashEntries.outflowType, filters.outflowType));
    if (filters?.farmerId) conditions.push(eq(cashEntries.farmerId, filters.farmerId));
    if (filters?.buyerId) conditions.push(eq(cashEntries.buyerId, filters.buyerId));
    if (filters?.year) {
      const yearNum = parseInt(filters.year);
      if (filters?.month) {
        const monthNum = parseInt(filters.month);
        const startDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-01`;
        const endDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-${new Date(yearNum, monthNum, 0).getDate()}`;
        conditions.push(gte(cashEntries.date, startDate));
        conditions.push(lte(cashEntries.date, endDate));
      } else {
        conditions.push(gte(cashEntries.date, `${yearNum}-01-01`));
        conditions.push(lte(cashEntries.date, `${yearNum}-12-31`));
      }
    }

    return db.select().from(cashEntries).where(and(...conditions)).orderBy(desc(cashEntries.createdAt));
  }

  async createCashEntry(entry: InsertCashEntry): Promise<CashEntry> {
    const txDate = entry.date ? new Date(entry.date + "T00:00:00") : new Date();
    const dateStr = `${txDate.getFullYear()}${String(txDate.getMonth() + 1).padStart(2, "0")}${String(txDate.getDate()).padStart(2, "0")}`;
    const prefix = `CF${dateStr}`;

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await db.select({ cashFlowId: cashEntries.cashFlowId })
        .from(cashEntries)
        .where(and(
          eq(cashEntries.businessId, entry.businessId),
          sql`${cashEntries.cashFlowId} like ${prefix + "%"}`
        ));

      let maxSeq = 0;
      for (const row of existing) {
        const suffix = (row.cashFlowId || "").substring(prefix.length);
        const num = parseInt(suffix, 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }

      const seq = maxSeq + 1;
      const cashFlowId = `${prefix}${seq}`;

      try {
        const [created] = await db.insert(cashEntries).values({ ...entry, cashFlowId }).returning();
        if (created.buyerId && created.category === "inward") {
          await this.recalculateBuyerPaymentStatus(entry.businessId, created.buyerId);
        }
        if (created.farmerId && created.category === "outward") {
          await this.recalculateFarmerPaymentStatus(entry.businessId, created.farmerId);
        }
        return created;
      } catch (e: any) {
        if (e.code === "23505" && attempt < 4) continue;
        throw e;
      }
    }
    throw new Error("Failed to generate unique cash flow ID after retries");
  }

  async reverseCashEntry(id: number, businessId: number, reason?: string | null): Promise<CashEntry | undefined> {
    const [existing] = await db.select().from(cashEntries).where(and(eq(cashEntries.id, id), eq(cashEntries.businessId, businessId)));
    if (!existing) return undefined;
    if (existing.isReversed) throw new Error("Entry is already reversed");
    const updateData: any = { isReversed: true, reversedAt: new Date() };
    if (reason) {
      updateData.notes = existing.notes ? `${existing.notes} | ${reason}` : reason;
    }
    const [updated] = await db.update(cashEntries)
      .set(updateData)
      .where(and(eq(cashEntries.id, id), eq(cashEntries.businessId, businessId)))
      .returning();
    if (updated && updated.buyerId && updated.category === "inward") {
      await this.recalculateBuyerPaymentStatus(businessId, updated.buyerId);
    }
    if (updated && updated.farmerId && updated.category === "outward") {
      await this.recalculateFarmerPaymentStatus(businessId, updated.farmerId);
    }
    return updated;
  }

  async recalculateBuyerPaymentStatus(businessId: number, buyerId: number): Promise<void> {
    const buyerTxns = await db.select()
      .from(transactions)
      .where(and(
        eq(transactions.businessId, businessId),
        eq(transactions.buyerId, buyerId),
        eq(transactions.isReversed, false)
      ))
      .orderBy(transactions.date, transactions.id);

    const [cashSum] = await db.select({
      total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
    }).from(cashEntries).where(and(
      eq(cashEntries.businessId, businessId),
      eq(cashEntries.buyerId, buyerId),
      eq(cashEntries.category, "inward"),
      eq(cashEntries.isReversed, false)
    ));

    let remaining = parseFloat(cashSum?.total || "0");

    for (const txn of buyerTxns) {
      const receivable = parseFloat(txn.totalReceivableFromBuyer || "0");
      let paidForThis = 0;

      if (remaining >= receivable) {
        paidForThis = receivable;
        remaining -= receivable;
      } else if (remaining > 0) {
        paidForThis = remaining;
        remaining = 0;
      }

      const status = paidForThis >= receivable ? "paid" : paidForThis > 0 ? "partial" : "due";

      await db.update(transactions)
        .set({
          paidAmount: paidForThis.toFixed(2),
          paymentStatus: status,
        })
        .where(eq(transactions.id, txn.id));
    }
  }

  async recalculateFarmerPaymentStatus(businessId: number, farmerId: number): Promise<void> {
    const farmerTxns = await db.select()
      .from(transactions)
      .where(and(
        eq(transactions.businessId, businessId),
        eq(transactions.farmerId, farmerId),
        eq(transactions.isReversed, false)
      ))
      .orderBy(transactions.date, transactions.id);

    const [cashSum] = await db.select({
      total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
    }).from(cashEntries).where(and(
      eq(cashEntries.businessId, businessId),
      eq(cashEntries.farmerId, farmerId),
      eq(cashEntries.category, "outward"),
      eq(cashEntries.isReversed, false)
    ));

    let remaining = parseFloat(cashSum?.total || "0");

    for (const txn of farmerTxns) {
      const payable = parseFloat(txn.totalPayableToFarmer || "0");
      let paidForThis = 0;

      if (remaining >= payable) {
        paidForThis = payable;
        remaining -= payable;
      } else if (remaining > 0) {
        paidForThis = remaining;
        remaining = 0;
      }

      const status = paidForThis >= payable ? "paid" : paidForThis > 0 ? "partial" : "due";

      await db.update(transactions)
        .set({
          farmerPaidAmount: paidForThis.toFixed(2),
          farmerPaymentStatus: status,
        })
        .where(eq(transactions.id, txn.id));
    }
  }

  async getTransactionAggregates(businessId: number): Promise<{
    totalHammali: number;
    totalExtraCharges: number;
    totalMandiCommission: number;
    paidHammali: number;
    paidExtraCharges: number;
    paidMandiCommission: number;
  }> {
    const [txAgg] = await db.select({
      totalHammali: sql<number>`coalesce(sum(cast(${transactions.hammaliCharges} as numeric)), 0)`,
      totalExtraCharges: sql<number>`coalesce(sum(cast(${transactions.extraChargesFarmer} as numeric)) + sum(cast(${transactions.extraChargesBuyer} as numeric)), 0)`,
      totalMandiCommission: sql<number>`coalesce(sum(cast(${transactions.mandiCharges} as numeric)), 0)`,
    }).from(transactions).where(and(
      eq(transactions.businessId, businessId),
      eq(transactions.isReversed, false)
    ));

    const paidHammaliResult = await db.select({
      total: sql<number>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
    }).from(cashEntries).where(and(
      eq(cashEntries.businessId, businessId),
      eq(cashEntries.outflowType, "Hammali"),
      eq(cashEntries.category, "outward"),
      eq(cashEntries.isReversed, false)
    ));

    const paidExtraChargesResult = await db.select({
      total: sql<number>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
    }).from(cashEntries).where(and(
      eq(cashEntries.businessId, businessId),
      eq(cashEntries.outflowType, "Extra Charges"),
      eq(cashEntries.category, "outward"),
      eq(cashEntries.isReversed, false)
    ));

    const paidMandiResult = await db.select({
      total: sql<number>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
    }).from(cashEntries).where(and(
      eq(cashEntries.businessId, businessId),
      eq(cashEntries.outflowType, "Mandi Commission"),
      eq(cashEntries.category, "outward"),
      eq(cashEntries.isReversed, false)
    ));

    return {
      totalHammali: Number(txAgg.totalHammali) || 0,
      totalExtraCharges: Number(txAgg.totalExtraCharges) || 0,
      totalMandiCommission: Number(txAgg.totalMandiCommission) || 0,
      paidHammali: Number(paidHammaliResult[0]?.total) || 0,
      paidExtraCharges: Number(paidExtraChargesResult[0]?.total) || 0,
      paidMandiCommission: Number(paidMandiResult[0]?.total) || 0,
    };
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

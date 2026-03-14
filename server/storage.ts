import {
  type User, type InsertUser,
  type Business, type InsertBusiness,
  type Farmer, type InsertFarmer,
  type FarmerEditHistory, type InsertFarmerEditHistory,
  type Buyer, type InsertBuyer,
  type BuyerEditHistory, type InsertBuyerEditHistory,
  type LotEditHistory, type InsertLotEditHistory,
  type TransactionEditHistory, type InsertTransactionEditHistory,
  type Lot, type InsertLot,
  type Bid, type InsertBid,
  type Transaction, type InsertTransaction,
  type BankAccount, type InsertBankAccount,
  type CashSettings, type InsertCashSettings,
  type CashEntry, type InsertCashEntry,
  type BusinessChargeSettings, type InsertBusinessChargeSettings,
  type Asset, type InsertAsset,
  type AssetDepreciationLog, type InsertAssetDepreciationLog,
  type Liability, type InsertLiability,
  type LiabilityPayment, type InsertLiabilityPayment,
  type ReceiptTemplate,
  users, businesses, farmers, farmerEditHistory, buyers, buyerEditHistory, lotEditHistory, transactionEditHistory, lots, bids, transactions, bankAccounts, cashSettings, cashEntries, businessChargeSettings,
  assets, assetDepreciationLog, liabilities, liabilityPayments,
  receiptTemplates, buyerReceiptSerials,
  ASSET_DEPRECIATION_RATES,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike, or, sql, desc, asc, gte, lte, ne, isNotNull } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsersByUsername(username: string): Promise<(User & { business: Business })[]>;
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
  getFarmersWithDues(businessId: number, search?: string): Promise<(Farmer & { totalPayable: string; totalDue: string; salesCount: number; bidDates: string[] })[]>;
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
  mergeBuyers(businessId: number, keepId: number, mergeId: number, changedBy: string): Promise<Buyer>;
  getBuyersWithDues(businessId: number, search?: string): Promise<(Buyer & { receivableDue: string; overallDue: string; bidDates: string[] })[]>;

  getLotEditHistory(lotId: number, businessId: number): Promise<LotEditHistory[]>;
  createLotEditHistory(entry: InsertLotEditHistory): Promise<LotEditHistory>;
  getTransactionEditHistory(transactionId: number, businessId: number): Promise<TransactionEditHistory[]>;
  createTransactionEditHistory(entry: InsertTransactionEditHistory): Promise<TransactionEditHistory>;

  getDriversByVehicleNumber(businessId: number, vehicleNumber: string): Promise<{ driverName: string; driverContact: string }[]>;
  getLots(businessId: number, filters?: { crop?: string; date?: string; search?: string }): Promise<(Lot & { farmer: Farmer; hasPendingBids?: boolean })[]>;
  getLot(id: number, businessId: number): Promise<(Lot & { farmer: Farmer }) | undefined>;
  createLot(lot: InsertLot): Promise<Lot>;
  updateLot(id: number, businessId: number, data: Partial<InsertLot>): Promise<Lot | undefined>;
  getNextSerialNumber(businessId: number, date: string): Promise<number>;
  getNextLotSequence(businessId: number, crop: string, date: string): Promise<number>;
  getBids(businessId: number, lotId?: number): Promise<(Bid & { buyer: Buyer; lot: Lot; farmer: Farmer; hasTransaction: boolean })[]>;
  getBid(id: number, businessId: number): Promise<Bid | undefined>;
  createBid(bid: InsertBid): Promise<Bid>;
  updateBid(id: number, businessId: number, data: Partial<InsertBid>): Promise<Bid | undefined>;
  deleteBid(id: number, businessId: number): Promise<void>;

  getBuyerPendingTransactions(businessId: number, buyerId: number): Promise<any[]>;
  getFarmerPendingTransactions(businessId: number, farmerId: number): Promise<any[]>;
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

  getAssets(businessId: number): Promise<Asset[]>;
  getAsset(id: number, businessId: number): Promise<Asset | undefined>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: number, businessId: number, data: Partial<InsertAsset>): Promise<Asset | undefined>;
  deleteAsset(id: number, businessId: number): Promise<void>;
  getAssetDepreciationLog(assetId: number, businessId: number): Promise<AssetDepreciationLog[]>;
  runDepreciation(businessId: number, fy: string): Promise<AssetDepreciationLog[]>;

  getLiabilities(businessId: number): Promise<Liability[]>;
  getLiability(id: number, businessId: number): Promise<Liability | undefined>;
  createLiability(liability: InsertLiability): Promise<Liability>;
  updateLiability(id: number, businessId: number, data: Partial<InsertLiability>): Promise<Liability | undefined>;
  deleteLiability(id: number, businessId: number): Promise<void>;
  getLiabilityPayments(liabilityId: number, businessId: number): Promise<LiabilityPayment[]>;
  createLiabilityPayment(payment: InsertLiabilityPayment): Promise<LiabilityPayment>;
  reverseLiabilityPayment(id: number, businessId: number): Promise<LiabilityPayment | undefined>;
  settleLiability(id: number, businessId: number): Promise<Liability | undefined>;

  getBalanceSheet(businessId: number, fy: string): Promise<any>;
  getProfitAndLoss(businessId: number, fy: string): Promise<any>;

  listReceiptTemplates(businessId: number): Promise<ReceiptTemplate[]>;
  getReceiptTemplate(businessId: number, templateType: string, crop: string): Promise<ReceiptTemplate | undefined>;
  upsertReceiptTemplate(businessId: number, templateType: string, crop: string, templateHtml: string): Promise<ReceiptTemplate>;
  deleteReceiptTemplate(id: number, businessId: number): Promise<void>;

  getOrCreateBuyerReceiptSerial(businessId: number, buyerId: number, date: string, crop: string): Promise<number>;
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

  async getUsersByUsername(username: string): Promise<(User & { business: Business })[]> {
    const results = await db.select({ user: users, business: businesses })
      .from(users)
      .innerJoin(businesses, eq(users.businessId, businesses.id))
      .where(eq(users.username, username))
      .orderBy(asc(businesses.name));
    return results.map(r => ({ ...r.user, business: r.business }));
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
    await db.delete(transactionEditHistory).where(eq(transactionEditHistory.businessId, businessId));
    await db.delete(transactions).where(eq(transactions.businessId, businessId));
    await db.delete(bids).where(eq(bids.businessId, businessId));
    await db.delete(lotEditHistory).where(eq(lotEditHistory.businessId, businessId));
    await db.delete(lots).where(eq(lots.businessId, businessId));
    await db.delete(farmerEditHistory).where(eq(farmerEditHistory.businessId, businessId));
    await db.delete(farmers).where(eq(farmers.businessId, businessId));
    await db.delete(buyerEditHistory).where(eq(buyerEditHistory.businessId, businessId));
    await db.delete(buyers).where(eq(buyers.businessId, businessId));
    await db.delete(bankAccounts).where(eq(bankAccounts.businessId, businessId));
    await db.delete(cashSettings).where(eq(cashSettings.businessId, businessId));
    await db.delete(businessChargeSettings).where(eq(businessChargeSettings.businessId, businessId));
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

  async getFarmersWithDues(businessId: number, search?: string): Promise<(Farmer & { totalPayable: string; totalDue: string; salesCount: number; bidDates: string[] })[]> {
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

    const allLotDates = await db.select({
      farmerId: lots.farmerId,
      lotDate: lots.date,
    }).from(lots)
      .where(eq(lots.businessId, businessId));

    const lotDateMap = new Map<number, Set<string>>();
    for (const row of allLotDates) {
      if (!lotDateMap.has(row.farmerId)) lotDateMap.set(row.farmerId, new Set());
      lotDateMap.get(row.farmerId)!.add(row.lotDate);
    }

    const results: (Farmer & { totalPayable: string; totalDue: string; salesCount: number; bidDates: string[] })[] = [];
    for (const farmer of farmerList) {
      const txnRows = await db.select({
        payable: sql<string>`cast(${transactions.totalPayableToFarmer} as numeric)`,
        paid: sql<string>`cast(${transactions.farmerPaidAmount} as numeric)`,
      }).from(transactions).where(and(eq(transactions.businessId, businessId), eq(transactions.farmerId, farmer.id), eq(transactions.isReversed, false)));

      const totalPayable = txnRows.reduce((s, r) => s + parseFloat(r.payable || "0"), 0);
      const totalTxnPaid = txnRows.reduce((s, r) => s + parseFloat(r.paid || "0"), 0);
      const txnDue = Math.max(0, totalPayable - totalTxnPaid);
      const salesCount = txnRows.length;

      const advanceRows = await db.select({
        advance: sql<string>`coalesce(${lots.farmerAdvanceAmount}, '0')`,
        sn: lots.serialNumber,
        dt: lots.date,
      }).from(lots).where(and(eq(lots.businessId, businessId), eq(lots.farmerId, farmer.id)));
      const seenSr = new Set<string>();
      let totalAdvance = 0;
      for (const r of advanceRows) {
        const key = `${r.dt}-${r.sn}`;
        if (!seenSr.has(key)) {
          seenSr.add(key);
          totalAdvance += parseFloat(r.advance || "0");
        }
      }

      const openingBal = parseFloat(farmer.openingBalance || "0");
      let openingDue = 0;
      if (openingBal > 0) {
        const openingPaidSum = await db.select({
          total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
        }).from(cashEntries).where(and(
          eq(cashEntries.businessId, businessId),
          eq(cashEntries.farmerId, farmer.id),
          eq(cashEntries.category, "outward"),
          eq(cashEntries.isReversed, false),
          sql`${cashEntries.transactionId} IS NULL`,
        ));
        openingDue = Math.max(0, openingBal - parseFloat(openingPaidSum[0]?.total || "0"));
      }

      const totalDue = Math.max(0, txnDue + openingDue - totalAdvance);

      const farmerLotDates = lotDateMap.get(farmer.id);
      results.push({
        ...farmer,
        totalPayable: totalPayable.toFixed(2),
        totalDue: totalDue.toFixed(2),
        salesCount,
        bidDates: farmerLotDates ? Array.from(farmerLotDates) : [],
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

  async mergeBuyers(businessId: number, keepId: number, mergeId: number, changedBy: string): Promise<Buyer> {
    const keepBuyer = await this.getBuyer(keepId, businessId);
    const mergeBuyer = await this.getBuyer(mergeId, businessId);
    if (!keepBuyer || !mergeBuyer) throw new Error("Buyer not found");

    await db.update(bids).set({ buyerId: keepId }).where(and(eq(bids.buyerId, mergeId), eq(bids.businessId, businessId)));
    await db.update(transactions).set({ buyerId: keepId }).where(and(eq(transactions.buyerId, mergeId), eq(transactions.businessId, businessId)));
    await db.update(cashEntries).set({ buyerId: keepId }).where(and(eq(cashEntries.buyerId, mergeId), eq(cashEntries.businessId, businessId)));

    const mergeOpeningBal = parseFloat(mergeBuyer.openingBalance || "0");
    const keepOpeningBal = parseFloat(keepBuyer.openingBalance || "0");
    const newOpeningBal = (keepOpeningBal + mergeOpeningBal).toFixed(2);

    await db.update(buyers).set({ openingBalance: newOpeningBal }).where(and(eq(buyers.id, keepId), eq(buyers.businessId, businessId)));

    await this.createBuyerEditHistory({
      buyerId: keepId,
      businessId,
      fieldChanged: "merge",
      oldValue: `Buyer ID ${mergeId} (${mergeBuyer.name})`,
      newValue: `Merged with opening balance ₹${mergeOpeningBal}`,
      changedBy,
    });

    await db.update(buyerEditHistory).set({ buyerId: keepId }).where(and(eq(buyerEditHistory.buyerId, mergeId), eq(buyerEditHistory.businessId, businessId)));

    await db.delete(buyers).where(and(eq(buyers.id, mergeId), eq(buyers.businessId, businessId)));

    const [updated] = await db.select().from(buyers).where(and(eq(buyers.id, keepId), eq(buyers.businessId, businessId)));
    return updated;
  }

  async getLotEditHistory(lotId: number, businessId: number): Promise<LotEditHistory[]> {
    return db.select().from(lotEditHistory)
      .where(and(eq(lotEditHistory.lotId, lotId), eq(lotEditHistory.businessId, businessId)))
      .orderBy(desc(lotEditHistory.createdAt));
  }

  async createLotEditHistory(entry: InsertLotEditHistory): Promise<LotEditHistory> {
    const [created] = await db.insert(lotEditHistory).values(entry).returning();
    return created;
  }

  async getTransactionEditHistory(transactionId: number, businessId: number): Promise<TransactionEditHistory[]> {
    return db.select().from(transactionEditHistory)
      .where(and(eq(transactionEditHistory.transactionId, transactionId), eq(transactionEditHistory.businessId, businessId)))
      .orderBy(desc(transactionEditHistory.createdAt));
  }

  async createTransactionEditHistory(entry: InsertTransactionEditHistory): Promise<TransactionEditHistory> {
    const [created] = await db.insert(transactionEditHistory).values(entry).returning();
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
      const txnRows = await db.select({
        receivable: sql<string>`cast(${transactions.totalReceivableFromBuyer} as numeric)`,
        paid: sql<string>`cast(${transactions.paidAmount} as numeric)`,
      }).from(transactions).where(and(eq(transactions.businessId, businessId), eq(transactions.buyerId, buyer.id), eq(transactions.isReversed, false)));

      const totalReceivable = txnRows.reduce((s, r) => s + parseFloat(r.receivable || "0"), 0);
      const totalTxnPaid = txnRows.reduce((s, r) => s + parseFloat(r.paid || "0"), 0);
      const receivableDue = Math.max(0, totalReceivable - totalTxnPaid).toFixed(2);

      const openingBal = parseFloat(buyer.openingBalance || "0");
      let openingDue = 0;
      if (openingBal > 0) {
        const openingPaidSum = await db.select({
          total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric) + cast(${cashEntries.discount} as numeric) + cast(${cashEntries.pettyAdj} as numeric)), 0)`
        }).from(cashEntries).where(and(
          eq(cashEntries.businessId, businessId),
          eq(cashEntries.buyerId, buyer.id),
          eq(cashEntries.category, "inward"),
          eq(cashEntries.isReversed, false),
          sql`${cashEntries.transactionId} IS NULL`,
        ));
        openingDue = Math.max(0, openingBal - parseFloat(openingPaidSum[0]?.total || "0"));
      }

      const overallDue = (parseFloat(receivableDue) + openingDue).toFixed(2);

      const buyerBidDates = bidDateMap.get(buyer.id);
      results.push({ ...buyer, receivableDue, overallDue, bidDates: buyerBidDates ? Array.from(buyerBidDates) : [] });
    }
    return results;
  }

  async getDriversByVehicleNumber(businessId: number, vehicleNumber: string): Promise<{ driverName: string; driverContact: string }[]> {
    const results = await db
      .selectDistinct({
        driverName: lots.driverName,
        driverContact: lots.driverContact,
      })
      .from(lots)
      .where(
        and(
          eq(lots.businessId, businessId),
          sql`UPPER(${lots.vehicleNumber}) = UPPER(${vehicleNumber})`,
          isNotNull(lots.driverName),
          sql`${lots.driverName} != ''`
        )
      );
    return results.map(r => ({
      driverName: r.driverName || "",
      driverContact: r.driverContact || "",
    }));
  }

  async getLots(businessId: number, filters?: { crop?: string; date?: string; search?: string }): Promise<(Lot & { farmer: Farmer; hasPendingBids?: boolean })[]> {
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

    const lotIds = results.map(r => r.lot.id);
    let pendingBidLotIds = new Set<number>();
    if (lotIds.length > 0) {
      const allBidsForLots = await db.select({ lotId: bids.lotId, bidId: bids.id }).from(bids)
        .where(and(eq(bids.businessId, businessId), sql`${bids.lotId} IN (${sql.join(lotIds.map(id => sql`${id}`), sql`, `)})`));
      const bidIds = allBidsForLots.map(b => b.bidId);
      let transactedBidIds = new Set<number>();
      if (bidIds.length > 0) {
        const activeTransactions = await db.select({ bidId: transactions.bidId }).from(transactions)
          .where(and(eq(transactions.businessId, businessId), eq(transactions.isReversed, false), sql`${transactions.bidId} IN (${sql.join(bidIds.map(id => sql`${id}`), sql`, `)})`));
        transactedBidIds = new Set(activeTransactions.map(t => t.bidId));
      }
      for (const b of allBidsForLots) {
        if (!transactedBidIds.has(b.bidId)) {
          pendingBidLotIds.add(b.lotId);
        }
      }
    }

    let mapped = results.map(r => ({ ...r.lot, farmer: r.farmer, hasPendingBids: pendingBidLotIds.has(r.lot.id) }));

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

  async getNextSerialNumber(businessId: number, date: string): Promise<number> {
    const d = new Date(date);
    const month = d.getMonth(); // 0-indexed, April = 3
    const year = d.getFullYear();
    const fyStart = month >= 3 ? `${year}-04-01` : `${year - 1}-04-01`;
    const fyEnd = month >= 3 ? `${year + 1}-03-31` : `${year}-03-31`;
    const [result] = await db.select({ max: sql<string>`coalesce(max(${lots.serialNumber}), 0)` })
      .from(lots)
      .where(and(eq(lots.businessId, businessId), gte(lots.date, fyStart), lte(lots.date, fyEnd)));
    return parseInt(result?.max || "0", 10) + 1;
  }

  async getNextLotSequence(businessId: number, crop: string, date: string): Promise<number> {
    const cropPrefix = crop === "Potato" ? "POT" : crop === "Onion" ? "ONI" : "GAR";
    const dateFormatted = date.replace(/-/g, "");
    const pattern = `${cropPrefix}${dateFormatted}%`;
    const startPos = cropPrefix.length + dateFormatted.length + 1;
    const [result] = await db.select({ max: sql<string>`coalesce(max(cast(substr(${lots.lotId}, ${startPos}) as integer)), 0)` })
      .from(lots)
      .where(and(eq(lots.businessId, businessId), sql`${lots.lotId} like ${pattern}`));
    return parseInt(result?.max || "0", 10) + 1;
  }

  async getBids(businessId: number, lotId?: number): Promise<(Bid & { buyer: Buyer; lot: Lot; farmer: Farmer; hasTransaction: boolean })[]> {
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
      hasTransaction: sql<boolean>`EXISTS (SELECT 1 FROM ${transactions} WHERE ${transactions.bidId} = ${bids.id} AND ${transactions.businessId} = ${businessId} AND ${transactions.isReversed} = false)`.as("has_transaction"),
    }).from(bids)
      .innerJoin(buyers, eq(bids.buyerId, buyers.id))
      .innerJoin(lots, eq(bids.lotId, lots.id))
      .innerJoin(farmers, eq(lots.farmerId, farmers.id))
      .where(and(...conditions))
      .orderBy(desc(bids.createdAt));

    return results.map(r => ({ ...r.bid, buyer: r.buyer, lot: r.lot, farmer: r.farmer, hasTransaction: r.hasTransaction }));
  }

  async createBid(bid: InsertBid): Promise<Bid> {
    const [created] = await db.insert(bids).values(bid).returning();
    await db.update(lots).set({
      remainingBags: sql`${lots.remainingBags} - ${bid.numberOfBags}`
    }).where(eq(lots.id, bid.lotId));
    return created;
  }

  async getBid(id: number, businessId: number): Promise<Bid | undefined> {
    const [bid] = await db.select().from(bids).where(and(eq(bids.id, id), eq(bids.businessId, businessId)));
    return bid;
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

  async getBuyerPendingTransactions(businessId: number, buyerId: number): Promise<any[]> {
    const results = await db.select({
      transaction: transactions,
      lot: lots,
      bid: bids,
    }).from(transactions)
      .innerJoin(lots, eq(transactions.lotId, lots.id))
      .innerJoin(bids, eq(transactions.bidId, bids.id))
      .where(and(
        eq(transactions.businessId, businessId),
        eq(transactions.buyerId, buyerId),
        eq(transactions.isReversed, false),
      ))
      .orderBy(transactions.date, transactions.id);

    const pendingTxns = results
      .map(r => {
        const receivable = parseFloat(r.transaction.totalReceivableFromBuyer || "0");
        const paid = parseFloat(r.transaction.paidAmount || "0");
        const due = receivable - paid;
        return {
          id: r.transaction.id,
          transactionId: r.transaction.transactionId,
          serialNumber: r.lot.serialNumber,
          date: r.transaction.date,
          numberOfBags: r.transaction.numberOfBags,
          crop: r.lot.crop,
          totalReceivableFromBuyer: r.transaction.totalReceivableFromBuyer,
          paidAmount: r.transaction.paidAmount,
          due: due.toFixed(2),
          bidCreatedAt: r.bid.createdAt,
        };
      })
      .filter(t => parseFloat(t.due) > 0);

    const buyer = await this.getBuyer(buyerId, businessId);
    const openingBal = parseFloat(buyer?.openingBalance || "0");
    if (openingBal > 0) {
      const totalCashEntries = await db.select({
        total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric) + cast(${cashEntries.discount} as numeric) + cast(${cashEntries.pettyAdj} as numeric)), 0)`
      }).from(cashEntries).where(and(
        eq(cashEntries.businessId, businessId),
        eq(cashEntries.buyerId, buyerId),
        eq(cashEntries.category, "inward"),
        eq(cashEntries.isReversed, false),
        sql`${cashEntries.transactionId} IS NULL`,
      ));
      const paidTowardsOpening = parseFloat(totalCashEntries[0]?.total || "0");
      const openingDue = Math.max(0, openingBal - paidTowardsOpening);
      if (openingDue > 0) {
        pendingTxns.unshift({
          id: 0,
          transactionId: "PY_OPENING",
          serialNumber: 0,
          date: "Previous Year",
          numberOfBags: 0,
          crop: "",
          totalReceivableFromBuyer: openingBal.toFixed(2),
          paidAmount: paidTowardsOpening.toFixed(2),
          due: openingDue.toFixed(2),
          bidCreatedAt: new Date(0),
        });
      }
    }

    return pendingTxns;
  }

  async getFarmerPendingTransactions(businessId: number, farmerId: number): Promise<any[]> {
    const results = await db.select({
      transaction: transactions,
      lot: lots,
      bid: bids,
    }).from(transactions)
      .innerJoin(lots, eq(transactions.lotId, lots.id))
      .innerJoin(bids, eq(transactions.bidId, bids.id))
      .where(and(
        eq(transactions.businessId, businessId),
        eq(transactions.farmerId, farmerId),
        eq(transactions.isReversed, false),
      ))
      .orderBy(transactions.date, transactions.id);

    const txnItems = results
      .map(r => {
        const payable = parseFloat(r.transaction.totalPayableToFarmer || "0");
        const paid = parseFloat(r.transaction.farmerPaidAmount || "0");
        const due = payable - paid;
        return {
          id: r.transaction.id,
          serialNumber: r.lot.serialNumber,
          date: r.transaction.date,
          numberOfBags: r.transaction.numberOfBags,
          crop: r.lot.crop,
          totalPayableToFarmer: payable,
          farmerPaidAmount: paid,
          due,
        };
      })
      .filter(t => t.due > 0.005);

    const grouped: Record<string, {
      serialNumber: number;
      date: string;
      crops: string[];
      totalBags: number;
      totalPayable: number;
      totalPaid: number;
      totalDue: number;
      transactionIds: { id: number; due: number }[];
    }> = {};

    for (const t of txnItems) {
      const key = `${t.serialNumber}_${t.date || ""}`;
      if (!grouped[key]) {
        grouped[key] = {
          serialNumber: t.serialNumber,
          date: t.date || "",
          crops: [],
          totalBags: 0,
          totalPayable: 0,
          totalPaid: 0,
          totalDue: 0,
          transactionIds: [],
        };
      }
      const g = grouped[key];
      if (t.crop && !g.crops.includes(t.crop)) g.crops.push(t.crop);
      g.totalBags += t.numberOfBags || 0;
      g.totalPayable += t.totalPayableToFarmer;
      g.totalPaid += t.farmerPaidAmount;
      g.totalDue += t.due;
      g.transactionIds.push({ id: t.id, due: t.due });
    }

    const pendingGroups = Object.values(grouped)
      .filter(g => g.totalDue > 0.005)
      .map(g => ({
        groupKey: `${g.serialNumber}_${g.date}`,
        serialNumber: g.serialNumber,
        date: g.date,
        crops: g.crops.join(", "),
        numberOfBags: g.totalBags,
        totalPayableToFarmer: g.totalPayable.toFixed(2),
        farmerPaidAmount: g.totalPaid.toFixed(2),
        due: g.totalDue.toFixed(2),
        transactionIds: g.transactionIds,
      }));

    pendingGroups.sort((a, b) => a.date.localeCompare(b.date) || a.serialNumber - b.serialNumber);

    const farmer = await this.getFarmer(farmerId, businessId);
    const openingBal = parseFloat(farmer?.openingBalance || "0");
    if (openingBal > 0) {
      const totalCashEntries = await db.select({
        total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
      }).from(cashEntries).where(and(
        eq(cashEntries.businessId, businessId),
        eq(cashEntries.farmerId, farmerId),
        eq(cashEntries.category, "outward"),
        eq(cashEntries.isReversed, false),
        sql`${cashEntries.transactionId} IS NULL`,
      ));
      const paidTowardsOpening = parseFloat(totalCashEntries[0]?.total || "0");
      const openingDue = Math.max(0, openingBal - paidTowardsOpening);
      if (openingDue > 0) {
        pendingGroups.unshift({
          groupKey: "PY_OPENING",
          serialNumber: 0,
          date: "Previous Year",
          crops: "",
          numberOfBags: 0,
          totalPayableToFarmer: openingBal.toFixed(2),
          farmerPaidAmount: paidTowardsOpening.toFixed(2),
          due: openingDue.toFixed(2),
          transactionIds: [],
        });
      }
    }

    return pendingGroups;
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

  private async validateAllocationDues(
    txDb: typeof db,
    businessId: number,
    allocationsToCheck: { transactionId: number | null; amount: string; discount: string; pettyAdj: string }[],
    isBuyerInward: boolean,
  ): Promise<void> {
    const txnAllocMap = new Map<number, number>();
    for (const alloc of allocationsToCheck) {
      if (alloc.transactionId == null) continue;
      const allocTotal = Math.round((parseFloat(alloc.amount || "0") + parseFloat(alloc.discount || "0") + parseFloat(alloc.pettyAdj || "0")) * 100) / 100;
      txnAllocMap.set(alloc.transactionId, Math.round(((txnAllocMap.get(alloc.transactionId) || 0) + allocTotal) * 100) / 100);
    }

    for (const [txnId, newPayment] of txnAllocMap) {
      const [lockedTxn] = await txDb.select({
        id: transactions.id,
        totalReceivableFromBuyer: transactions.totalReceivableFromBuyer,
        totalPayableToFarmer: transactions.totalPayableToFarmer,
        isReversed: transactions.isReversed,
      }).from(transactions)
        .where(and(eq(transactions.id, txnId), eq(transactions.businessId, businessId)))
        .for("update");

      if (!lockedTxn) throw new Error(`Transaction #${txnId} not found`);
      if (lockedTxn.isReversed) throw new Error(`Transaction #${txnId} has been reversed`);

      const totalOwed = isBuyerInward
        ? parseFloat(lockedTxn.totalReceivableFromBuyer || "0")
        : parseFloat(lockedTxn.totalPayableToFarmer || "0");

      const [existingSum] = await txDb.select({
        total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric) + cast(${cashEntries.discount} as numeric) + cast(${cashEntries.pettyAdj} as numeric)), 0)`
      }).from(cashEntries).where(and(
        eq(cashEntries.businessId, businessId),
        eq(cashEntries.transactionId, txnId),
        eq(cashEntries.category, isBuyerInward ? "inward" : "outward"),
        eq(cashEntries.isReversed, false)
      ));

      const alreadyPaid = parseFloat(existingSum?.total || "0");
      const remainingDue = Math.round((totalOwed - alreadyPaid) * 100) / 100;

      if (newPayment > remainingDue + 0.01) {
        if (remainingDue <= 0) {
          throw new Error(`Transaction has already been fully paid. Please refresh and try again.`);
        }
        throw new Error(`Payment exceeds remaining due (₹${remainingDue.toFixed(2)}). Another payment may have been made. Please refresh and try again.`);
      }
    }
  }

  async createCashEntry(entry: InsertCashEntry): Promise<CashEntry> {
    const txDate = entry.date ? new Date(entry.date + "T00:00:00") : new Date();
    const dateStr = `${txDate.getFullYear()}${String(txDate.getMonth() + 1).padStart(2, "0")}${String(txDate.getDate()).padStart(2, "0")}`;
    const prefix = `CF${dateStr}`;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const created = await db.transaction(async (tx) => {
          if (entry.transactionId) {
            const isBuyerInward = !!(entry.buyerId && entry.category === "inward");
            const isFarmerOutward = !!(entry.farmerId && entry.category === "outward");
            if (isBuyerInward || isFarmerOutward) {
              await this.validateAllocationDues(tx as unknown as typeof db, entry.businessId, [{
                transactionId: entry.transactionId,
                amount: entry.amount || "0",
                discount: entry.discount || "0",
                pettyAdj: entry.pettyAdj || "0",
              }], isBuyerInward);
            }
          }

          const existing = await tx.select({ cashFlowId: cashEntries.cashFlowId })
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

          const cashFlowId = `${prefix}${maxSeq + 1}`;
          const [result] = await tx.insert(cashEntries).values({ ...entry, cashFlowId }).returning();
          return result;
        });

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

  async createCashEntryBatch(baseEntry: InsertCashEntry, allocations: { transactionId: number | null; amount: string; discount: string; pettyAdj: string }[]): Promise<CashEntry[]> {
    const txDate = baseEntry.date ? new Date(baseEntry.date + "T00:00:00") : new Date();
    const dateStr = `${txDate.getFullYear()}${String(txDate.getMonth() + 1).padStart(2, "0")}${String(txDate.getDate()).padStart(2, "0")}`;
    const prefix = `CF${dateStr}`;

    return await db.transaction(async (tx) => {
      const isBuyerInward = !!(baseEntry.buyerId && baseEntry.category === "inward");
      const isFarmerOutward = !!(baseEntry.farmerId && baseEntry.category === "outward");
      if (isBuyerInward || isFarmerOutward) {
        await this.validateAllocationDues(tx as unknown as typeof db, baseEntry.businessId, allocations, isBuyerInward);
      }

      const existing = await tx.select({ cashFlowId: cashEntries.cashFlowId })
        .from(cashEntries)
        .where(and(
          eq(cashEntries.businessId, baseEntry.businessId),
          sql`${cashEntries.cashFlowId} like ${prefix + "%"}`
        ));

      let maxSeq = 0;
      for (const row of existing) {
        const suffix = (row.cashFlowId || "").substring(prefix.length);
        const num = parseInt(suffix, 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }

      const cashFlowId = `${prefix}${maxSeq + 1}`;
      const created: CashEntry[] = [];

      for (const alloc of allocations) {
        const [entry] = await tx.insert(cashEntries).values({
          ...baseEntry,
          cashFlowId,
          transactionId: alloc.transactionId,
          amount: alloc.amount,
          discount: alloc.discount,
          pettyAdj: alloc.pettyAdj,
        }).returning();
        created.push(entry);
      }

      return created;
    }).then(async (created) => {
      if (baseEntry.buyerId) {
        await this.recalculateBuyerPaymentStatus(baseEntry.businessId, baseEntry.buyerId);
      }
      if (baseEntry.farmerId) {
        await this.recalculateFarmerPaymentStatus(baseEntry.businessId, baseEntry.farmerId);
      }
      return created;
    });
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
    const buyer = await this.getBuyer(buyerId, businessId);
    if (!buyer) return;

    const buyerTxns = await db.select()
      .from(transactions)
      .where(and(
        eq(transactions.businessId, businessId),
        eq(transactions.buyerId, buyerId),
        eq(transactions.isReversed, false)
      ))
      .orderBy(transactions.date, transactions.id);

    for (const txn of buyerTxns) {
      const receivable = parseFloat(txn.totalReceivableFromBuyer || "0");

      const [entrySum] = await db.select({
        total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric) + cast(${cashEntries.discount} as numeric) + cast(${cashEntries.pettyAdj} as numeric)), 0)`
      }).from(cashEntries).where(and(
        eq(cashEntries.businessId, businessId),
        eq(cashEntries.buyerId, buyerId),
        eq(cashEntries.transactionId, txn.id),
        eq(cashEntries.category, "inward"),
        eq(cashEntries.isReversed, false)
      ));

      const paidForThis = parseFloat(entrySum?.total || "0");
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
    const farmer = await this.getFarmer(farmerId, businessId);
    if (!farmer) return;

    const farmerTxns = await db.select()
      .from(transactions)
      .where(and(
        eq(transactions.businessId, businessId),
        eq(transactions.farmerId, farmerId),
        eq(transactions.isReversed, false)
      ))
      .orderBy(transactions.date, transactions.id);

    for (const txn of farmerTxns) {
      const payable = parseFloat(txn.totalPayableToFarmer || "0");

      const [entrySum] = await db.select({
        total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
      }).from(cashEntries).where(and(
        eq(cashEntries.businessId, businessId),
        eq(cashEntries.farmerId, farmerId),
        eq(cashEntries.transactionId, txn.id),
        eq(cashEntries.category, "outward"),
        eq(cashEntries.isReversed, false)
      ));

      const paidForThis = parseFloat(entrySum?.total || "0");
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

  async getAssets(businessId: number): Promise<Asset[]> {
    return db.select().from(assets).where(eq(assets.businessId, businessId)).orderBy(desc(assets.createdAt));
  }

  async getAsset(id: number, businessId: number): Promise<Asset | undefined> {
    const [asset] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.businessId, businessId)));
    return asset;
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    const [created] = await db.insert(assets).values(asset).returning();
    return created;
  }

  async updateAsset(id: number, businessId: number, data: Partial<InsertAsset>): Promise<Asset | undefined> {
    const [updated] = await db.update(assets).set(data).where(and(eq(assets.id, id), eq(assets.businessId, businessId))).returning();
    return updated;
  }

  async deleteAsset(id: number, businessId: number): Promise<void> {
    await db.delete(assetDepreciationLog).where(and(eq(assetDepreciationLog.assetId, id), eq(assetDepreciationLog.businessId, businessId)));
    await db.delete(assets).where(and(eq(assets.id, id), eq(assets.businessId, businessId)));
  }

  async getAssetDepreciationLog(assetId: number, businessId: number): Promise<AssetDepreciationLog[]> {
    return db.select().from(assetDepreciationLog).where(and(eq(assetDepreciationLog.assetId, assetId), eq(assetDepreciationLog.businessId, businessId))).orderBy(asc(assetDepreciationLog.financialYear));
  }

  async runDepreciation(businessId: number, fy: string): Promise<AssetDepreciationLog[]> {
    const parts = fy.split("-");
    const fyStartYear = parseInt(parts[0]);
    const fyStart = new Date(fyStartYear, 3, 1);
    const fyEnd = new Date(fyStartYear + 1, 2, 31);

    const allAssets = await db.select().from(assets).where(and(eq(assets.businessId, businessId), eq(assets.isDisposed, false)));

    const results: AssetDepreciationLog[] = [];
    for (const asset of allAssets) {
      const purchaseDate = new Date(asset.purchaseDate);
      if (purchaseDate > fyEnd) continue;

      const existingLog = await db.select().from(assetDepreciationLog)
        .where(and(eq(assetDepreciationLog.assetId, asset.id), eq(assetDepreciationLog.financialYear, fy)));

      const prevLogs = await db.select().from(assetDepreciationLog)
        .where(and(eq(assetDepreciationLog.assetId, asset.id), eq(assetDepreciationLog.businessId, businessId)))
        .orderBy(desc(assetDepreciationLog.financialYear));

      let openingValue = parseFloat(asset.originalCost || "0");
      if (prevLogs.length > 0) {
        const latestBefore = prevLogs.find(l => l.financialYear < fy);
        if (latestBefore) openingValue = parseFloat(latestBefore.closingValue || "0");
      }

      if (openingValue <= 0) continue;

      let monthsUsed = 12;
      if (purchaseDate >= fyStart && purchaseDate <= fyEnd) {
        const purchaseMonth = purchaseDate.getMonth();
        const fyMonthIndex = purchaseMonth >= 3 ? purchaseMonth - 3 : purchaseMonth + 9;
        monthsUsed = 12 - fyMonthIndex;
        monthsUsed = Math.max(1, Math.min(12, monthsUsed));
      }

      const rate = parseFloat(asset.depreciationRate || "10");
      const depAmount = Math.round((openingValue * rate / 100 * monthsUsed / 12) * 100) / 100;
      const closingValue = Math.round((openingValue - depAmount) * 100) / 100;

      if (existingLog.length > 0) {
        const [updated] = await db.update(assetDepreciationLog).set({
          openingValue: openingValue.toFixed(2),
          depreciationAmount: depAmount.toFixed(2),
          closingValue: closingValue.toFixed(2),
          monthsUsed,
        }).where(eq(assetDepreciationLog.id, existingLog[0].id)).returning();
        results.push(updated);
      } else {
        const [created] = await db.insert(assetDepreciationLog).values({
          assetId: asset.id,
          businessId,
          financialYear: fy,
          openingValue: openingValue.toFixed(2),
          depreciationAmount: depAmount.toFixed(2),
          closingValue: closingValue.toFixed(2),
          monthsUsed,
        }).returning();
        results.push(created);
      }

      await db.update(assets).set({ currentBookValue: closingValue.toFixed(2) }).where(eq(assets.id, asset.id));
    }

    return results;
  }

  async getLiabilities(businessId: number): Promise<Liability[]> {
    return db.select().from(liabilities).where(eq(liabilities.businessId, businessId)).orderBy(desc(liabilities.createdAt));
  }

  async getLiability(id: number, businessId: number): Promise<Liability | undefined> {
    const [liability] = await db.select().from(liabilities).where(and(eq(liabilities.id, id), eq(liabilities.businessId, businessId)));
    return liability;
  }

  async createLiability(liability: InsertLiability): Promise<Liability> {
    const [created] = await db.insert(liabilities).values(liability).returning();
    return created;
  }

  async updateLiability(id: number, businessId: number, data: Partial<InsertLiability>): Promise<Liability | undefined> {
    const [updated] = await db.update(liabilities).set(data).where(and(eq(liabilities.id, id), eq(liabilities.businessId, businessId))).returning();
    return updated;
  }

  async deleteLiability(id: number, businessId: number): Promise<void> {
    await db.delete(liabilityPayments).where(and(eq(liabilityPayments.liabilityId, id), eq(liabilityPayments.businessId, businessId)));
    await db.delete(liabilities).where(and(eq(liabilities.id, id), eq(liabilities.businessId, businessId)));
  }

  async getLiabilityPayments(liabilityId: number, businessId: number): Promise<LiabilityPayment[]> {
    return db.select().from(liabilityPayments).where(and(eq(liabilityPayments.liabilityId, liabilityId), eq(liabilityPayments.businessId, businessId))).orderBy(desc(liabilityPayments.paymentDate));
  }

  async createLiabilityPayment(payment: InsertLiabilityPayment): Promise<LiabilityPayment> {
    const [created] = await db.insert(liabilityPayments).values(payment).returning();
    const amount = parseFloat(payment.principalAmount?.toString() || "0");
    if (amount > 0) {
      const liability = await this.getLiability(payment.liabilityId, payment.businessId);
      if (liability) {
        const newOutstanding = Math.max(0, parseFloat(liability.outstandingAmount || "0") - amount);
        await db.update(liabilities).set({ outstandingAmount: newOutstanding.toFixed(2) }).where(eq(liabilities.id, payment.liabilityId));
      }
    }
    return created;
  }

  async reverseLiabilityPayment(id: number, businessId: number): Promise<LiabilityPayment | undefined> {
    const [payment] = await db.select().from(liabilityPayments).where(and(eq(liabilityPayments.id, id), eq(liabilityPayments.businessId, businessId)));
    if (!payment || payment.isReversed) return payment;

    const [updated] = await db.update(liabilityPayments).set({ isReversed: true }).where(eq(liabilityPayments.id, id)).returning();
    const principalAmount = parseFloat(payment.principalAmount || "0");
    if (principalAmount > 0) {
      const liability = await this.getLiability(payment.liabilityId, businessId);
      if (liability) {
        const newOutstanding = parseFloat(liability.outstandingAmount || "0") + principalAmount;
        await db.update(liabilities).set({ outstandingAmount: newOutstanding.toFixed(2) }).where(eq(liabilities.id, payment.liabilityId));
      }
    }
    return updated;
  }

  async settleLiability(id: number, businessId: number): Promise<Liability | undefined> {
    const today = new Date().toISOString().split("T")[0];
    const [updated] = await db.update(liabilities).set({ isSettled: true, settledDate: today, outstandingAmount: "0" }).where(and(eq(liabilities.id, id), eq(liabilities.businessId, businessId))).returning();
    return updated;
  }

  async getBalanceSheet(businessId: number, fy: string): Promise<any> {
    const parts = fy.split("-");
    const fyEndYear = parseInt(parts[0]) + 1;

    const allAssets = await db.select().from(assets).where(and(eq(assets.businessId, businessId), eq(assets.isDisposed, false)));
    const fixedAssetsByCategory: Record<string, number> = {};
    for (const a of allAssets) {
      const cat = a.category;
      fixedAssetsByCategory[cat] = (fixedAssetsByCategory[cat] || 0) + parseFloat(a.currentBookValue || "0");
    }
    const totalFixedAssets = Object.values(fixedAssetsByCategory).reduce((s, v) => s + v, 0);

    const cashSetting = await this.getCashSettings(businessId);
    const cashInHand = parseFloat(cashSetting?.cashInHandOpening || "0");

    const bankAccts = await this.getBankAccounts(businessId);
    let totalBankBalance = 0;
    const bankDetails: { name: string; balance: number }[] = [];
    for (const ba of bankAccts) {
      const opening = parseFloat(ba.openingBalance || "0");
      const inwardResult = await db.select({
        total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
      }).from(cashEntries).where(and(eq(cashEntries.businessId, businessId), eq(cashEntries.bankAccountId, ba.id), eq(cashEntries.category, "inward"), eq(cashEntries.isReversed, false)));
      const outwardResult = await db.select({
        total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
      }).from(cashEntries).where(and(eq(cashEntries.businessId, businessId), eq(cashEntries.bankAccountId, ba.id), or(eq(cashEntries.category, "outward"), eq(cashEntries.category, "expense")), eq(cashEntries.isReversed, false)));
      const balance = opening + parseFloat(inwardResult[0]?.total || "0") - parseFloat(outwardResult[0]?.total || "0");
      if (ba.accountType === "Limit" && balance < 0) {
        bankDetails.push({ name: ba.name, balance: 0 });
      } else {
        bankDetails.push({ name: ba.name, balance });
        totalBankBalance += Math.max(0, balance);
      }
    }

    const farmersWithDues = await this.getFarmersWithDues(businessId);
    const farmerReceivable = farmersWithDues.reduce((s, f) => s + parseFloat(f.totalDue || "0"), 0);

    const buyersWithDues = await this.getBuyersWithDues(businessId);
    const buyerReceivable = buyersWithDues.reduce((s, b) => s + parseFloat(b.receivableDue || "0"), 0);

    const totalCurrentAssets = cashInHand + totalBankBalance + farmerReceivable + buyerReceivable;
    const totalAssets = totalFixedAssets + totalCurrentAssets;

    const allLiabilities = await this.getLiabilities(businessId);
    const longTermLiabilities = allLiabilities.filter(l => !l.isSettled);
    const totalLongTerm = longTermLiabilities.reduce((s, l) => s + parseFloat(l.outstandingAmount || "0"), 0);

    let limitOutstanding = 0;
    for (const ba of bankAccts) {
      if (ba.accountType === "Limit") {
        const opening = parseFloat(ba.openingBalance || "0");
        const inwardResult = await db.select({
          total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
        }).from(cashEntries).where(and(eq(cashEntries.businessId, businessId), eq(cashEntries.bankAccountId, ba.id), eq(cashEntries.category, "inward"), eq(cashEntries.isReversed, false)));
        const outwardResult = await db.select({
          total: sql<string>`coalesce(sum(cast(${cashEntries.amount} as numeric)), 0)`
        }).from(cashEntries).where(and(eq(cashEntries.businessId, businessId), eq(cashEntries.bankAccountId, ba.id), or(eq(cashEntries.category, "outward"), eq(cashEntries.category, "expense")), eq(cashEntries.isReversed, false)));
        const balance = opening + parseFloat(inwardResult[0]?.total || "0") - parseFloat(outwardResult[0]?.total || "0");
        if (balance < 0) limitOutstanding += Math.abs(balance);
      }
    }

    const totalLiabilities = totalLongTerm + limitOutstanding;
    const ownersEquity = totalAssets - totalLiabilities;

    return {
      fy,
      fixedAssets: { byCategory: fixedAssetsByCategory, total: totalFixedAssets },
      currentAssets: {
        cashInHand,
        bankBalances: bankDetails,
        totalBankBalance,
        farmerReceivable,
        buyerReceivable,
        total: totalCurrentAssets,
      },
      totalAssets,
      longTermLiabilities: longTermLiabilities.map(l => ({ name: l.name, type: l.type, outstanding: parseFloat(l.outstandingAmount || "0") })),
      totalLongTermLiabilities: totalLongTerm,
      currentLiabilities: { limitOutstanding },
      totalLiabilities,
      ownersEquity,
    };
  }

  async getProfitAndLoss(businessId: number, fy: string): Promise<any> {
    const parts = fy.split("-");
    const fyStartYear = parseInt(parts[0]);
    const fyStartDate = `${fyStartYear}-04-01`;
    const fyEndDate = `${fyStartYear + 1}-03-31`;

    const txnRows = await db.select({
      aadhat: sql<string>`coalesce(sum(cast(${transactions.aadhatCharges} as numeric)), 0)`,
      mandi: sql<string>`coalesce(sum(cast(${transactions.mandiCharges} as numeric)), 0)`,
      hammali: sql<string>`coalesce(sum(cast(${transactions.hammaliCharges} as numeric)), 0)`,
      extraFarmer: sql<string>`coalesce(sum(cast(${transactions.extraChargesFarmer} as numeric)), 0)`,
      extraBuyer: sql<string>`coalesce(sum(cast(${transactions.extraChargesBuyer} as numeric)), 0)`,
    }).from(transactions).where(and(
      eq(transactions.businessId, businessId),
      eq(transactions.isReversed, false),
      gte(transactions.date, fyStartDate),
      lte(transactions.date, fyEndDate),
    ));

    const aadhatIncome = parseFloat(txnRows[0]?.aadhat || "0");
    const mandiIncome = parseFloat(txnRows[0]?.mandi || "0");
    const hammaliIncome = parseFloat(txnRows[0]?.hammali || "0");
    const extraCharges = parseFloat(txnRows[0]?.extraFarmer || "0") + parseFloat(txnRows[0]?.extraBuyer || "0");
    const totalIncome = aadhatIncome + mandiIncome + hammaliIncome + extraCharges;

    const depLogs = await db.select({
      total: sql<string>`coalesce(sum(cast(${assetDepreciationLog.depreciationAmount} as numeric)), 0)`
    }).from(assetDepreciationLog).where(and(eq(assetDepreciationLog.businessId, businessId), eq(assetDepreciationLog.financialYear, fy)));
    const depreciation = parseFloat(depLogs[0]?.total || "0");

    const interestResult = await db.select({
      total: sql<string>`coalesce(sum(cast(${liabilityPayments.interestAmount} as numeric)), 0)`
    }).from(liabilityPayments).where(and(
      eq(liabilityPayments.businessId, businessId),
      eq(liabilityPayments.isReversed, false),
      gte(liabilityPayments.paymentDate, fyStartDate),
      lte(liabilityPayments.paymentDate, fyEndDate),
    ));
    const interestOnLiabilities = parseFloat(interestResult[0]?.total || "0");

    const totalExpenses = depreciation + interestOnLiabilities;
    const netProfitLoss = totalIncome - totalExpenses;

    return {
      fy,
      income: {
        aadhatCommission: aadhatIncome,
        mandiCommission: mandiIncome,
        hammaliIncome,
        extraCharges,
        total: totalIncome,
      },
      expenses: {
        depreciation,
        interestOnLiabilities,
        total: totalExpenses,
      },
      netProfitLoss,
    };
  }

  async listReceiptTemplates(businessId: number): Promise<ReceiptTemplate[]> {
    return db.select().from(receiptTemplates).where(eq(receiptTemplates.businessId, businessId));
  }

  async getReceiptTemplate(businessId: number, templateType: string, crop: string): Promise<ReceiptTemplate | undefined> {
    const [tmpl] = await db.select().from(receiptTemplates).where(
      and(
        eq(receiptTemplates.businessId, businessId),
        eq(receiptTemplates.templateType, templateType),
        eq(receiptTemplates.crop, crop)
      )
    );
    return tmpl;
  }

  async upsertReceiptTemplate(businessId: number, templateType: string, crop: string, templateHtml: string): Promise<ReceiptTemplate> {
    const existing = await this.getReceiptTemplate(businessId, templateType, crop);
    if (existing) {
      const [updated] = await db.update(receiptTemplates)
        .set({ templateHtml, updatedAt: new Date() })
        .where(eq(receiptTemplates.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(receiptTemplates)
      .values({ businessId, templateType, crop, templateHtml })
      .returning();
    return created;
  }

  async deleteReceiptTemplate(id: number, businessId: number): Promise<void> {
    await db.delete(receiptTemplates).where(
      and(eq(receiptTemplates.id, id), eq(receiptTemplates.businessId, businessId))
    );
  }

  async getOrCreateBuyerReceiptSerial(businessId: number, buyerId: number, date: string, crop: string): Promise<number> {
    const d = new Date(date);
    const month = d.getMonth();
    const year = d.getFullYear();
    const fyStart = month >= 3 ? `${year}-04-01` : `${year - 1}-04-01`;
    const fyEnd = month >= 3 ? `${year + 1}-03-31` : `${year}-03-31`;

    const result = await db.execute<{ serial_number: number }>(sql`
      INSERT INTO buyer_receipt_serials (business_id, buyer_id, date, crop, serial_number)
      SELECT ${businessId}, ${buyerId}, ${date}::date, ${crop},
             COALESCE((SELECT MAX(serial_number) FROM buyer_receipt_serials
                       WHERE business_id = ${businessId}
                         AND date >= ${fyStart}::date
                         AND date <= ${fyEnd}::date), 0) + 1
      ON CONFLICT (business_id, buyer_id, date, crop) DO NOTHING
      RETURNING serial_number
    `);

    const inserted = result.rows[0];
    if (inserted) return inserted.serial_number;

    const [existing] = await db.select({ serialNumber: buyerReceiptSerials.serialNumber })
      .from(buyerReceiptSerials)
      .where(and(
        eq(buyerReceiptSerials.businessId, businessId),
        eq(buyerReceiptSerials.buyerId, buyerId),
        eq(buyerReceiptSerials.date, date),
        eq(buyerReceiptSerials.crop, crop)
      ));
    return existing!.serialNumber;
  }
}

export const storage = new DatabaseStorage();

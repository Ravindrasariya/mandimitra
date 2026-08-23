import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, date, timestamp, serial, uniqueIndex, index, json, bigint } from "drizzle-orm/pg-core";

/*
 * A note on the indexes declared below.
 *
 * Every query in this app is scoped to one business, so businessId leads almost every index — an index
 * starting with businessId also serves a lookup that filters on businessId alone. The remaining columns are
 * the ones the app actually filters, joins or sorts by; columns that are only read back (amounts, names on
 * a detail screen) are deliberately not indexed, because each index costs a little on every insert and
 * update.
 *
 * Flag columns such as isReversed and isArchived are left out on purpose: nearly every row shares the same
 * value, so they narrow almost nothing while adding write cost.
 */
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
});

export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").notNull().unique(),
  name: text("name").notNull(),
  initials: text("initials"),
  address: text("address"),
  phone: text("phone"),
  licenceNo: text("licence_no"),
  shopNo: text("shop_no"),
  receiptHeaderImage: text("receipt_header_image"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Each new business counts today's merchant IDs; a "starts with" match on the lower-cased value.
  merchantIdPatternIdx: index("businesses_merchant_id_pattern_idx")
    .on(sql`lower(${table.merchantId}) text_pattern_ops`),
}));

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull(),
  name: text("name").notNull().default(""),
  password: text("password").notNull(),
  resetPasswordHash: text("reset_password_hash"),
  phone: text("phone"),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  role: text("role").notNull().default("user"),
  accessLevel: text("access_level").notNull().default("edit"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Login looks a user up by name alone; the admin screens list them per business.
  usernameIdx: index("users_username_idx").on(table.username),
  businessIdx: index("users_business_idx").on(table.businessId),
}));

export const farmers = pgTable("farmers", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  farmerId: text("farmer_id").notNull().default(""),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  village: text("village"),
  tehsil: text("tehsil"),
  district: text("district"),
  state: text("state").default("Madhya Pradesh"),
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  ifscCode: text("ifsc_code"),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).default("0"),
  redFlag: boolean("negative_flag").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueFarmerPerBusiness: uniqueIndex("farmers_business_farmer_id_unique").on(table.businessId, table.farmerId),
  // Farmers are always listed for one business in name order.
  businessNameIdx: index("farmers_business_name_idx").on(table.businessId, table.name),
  // Each new farmer counts today's IDs to pick the next one. That is a "starts with" match on the
  // lower-cased ID, so the index has to be built the same way to be usable.
  businessFarmerIdPatternIdx: index("farmers_business_farmer_id_pattern_idx")
    .on(table.businessId, sql`lower(${table.farmerId}) text_pattern_ops`),
}));

export const buyers = pgTable("buyers", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  buyerId: text("buyer_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  licenceNo: text("licence_no"),
  redFlag: boolean("negative_flag").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).default("0"),
  aadhatCommissionPercent: decimal("aadhat_commission_percent", { precision: 5, scale: 2 }),
  limitAmount: bigint("limit_amount", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueBuyerPerBusiness: uniqueIndex("buyers_business_buyer_id_unique").on(table.businessId, table.buyerId),
  businessNameIdx: index("buyers_business_name_idx").on(table.businessId, table.name),
  businessBuyerIdPatternIdx: index("buyers_business_buyer_id_pattern_idx")
    .on(table.businessId, sql`lower(${table.buyerId}) text_pattern_ops`),
}));

export const farmerEditHistory = pgTable("farmer_edit_history", {
  id: serial("id").primaryKey(),
  farmerId: integer("farmer_id").notNull().references(() => farmers.id),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // History is only ever read for one row at a time, newest first.
  businessFarmerIdx: index("farmer_edit_history_business_farmer_idx").on(table.businessId, table.farmerId, table.createdAt),
}));

export const buyerEditHistory = pgTable("buyer_edit_history", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull().references(() => buyers.id),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  businessBuyerIdx: index("buyer_edit_history_business_buyer_idx").on(table.businessId, table.buyerId, table.createdAt),
}));

export const lotEditHistory = pgTable("lot_edit_history", {
  id: serial("id").primaryKey(),
  lotId: integer("lot_id").references(() => lots.id),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  businessLotIdx: index("lot_edit_history_business_lot_idx").on(table.businessId, table.lotId, table.createdAt),
}));

export const transactionEditHistory = pgTable("transaction_edit_history", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  businessTransactionIdx: index("transaction_edit_history_business_txn_idx").on(table.businessId, table.transactionId, table.createdAt),
}));

export const lots = pgTable("lots", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  lotId: text("lot_id").notNull(),
  serialNumber: integer("serial_number").notNull(),
  billBookNumber: integer("bill_book_number").notNull().default(1),
  farmerId: integer("farmer_id").notNull().references(() => farmers.id),
  date: date("date").notNull(),
  crop: text("crop").notNull(),
  variety: text("variety"),
  numberOfBags: integer("number_of_bags").notNull(),
  actualNumberOfBags: integer("actual_number_of_bags"),
  remainingBags: integer("remaining_bags").notNull(),
  size: text("size"),
  bagMarka: text("bag_marka"),
  vehicleNumber: text("vehicle_number"),
  vehicleBhadaRate: decimal("vehicle_bhada_rate", { precision: 10, scale: 2 }),
  driverName: text("driver_name"),
  driverContact: text("driver_contact"),
  totalBagsInVehicle: integer("total_bags_in_vehicle"),
  farmerAdvanceAmount: decimal("farmer_advance_amount", { precision: 10, scale: 2 }).default("0"),
  farmerAdvanceMode: text("farmer_advance_mode"),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueLotPerBusiness: uniqueIndex("lots_business_lot_id_unique").on(table.businessId, table.lotId),
  // The stock register reads a business's lots by date; the farmer card (and its bhada) is farmer + date.
  businessDateIdx: index("lots_business_date_idx").on(table.businessId, table.date),
  businessFarmerDateIdx: index("lots_business_farmer_date_idx").on(table.businessId, table.farmerId, table.date),
  businessCreatedIdx: index("lots_business_created_idx").on(table.businessId, table.createdAt),
  // Every new lot scans for the day's highest lot number. Same "starts with" match as the cash flow
  // number, so it needs the same text_pattern_ops treatment to use an index at all.
  businessLotIdPatternIdx: index("lots_business_lot_id_pattern_idx")
    .on(table.businessId, table.lotId.op("text_pattern_ops")),
  // Duplicate-bill checks and the next serial number sweep a whole financial year of the business's lots
  // for one bill book, and each new lot triggers them.
  businessBillBookSerialIdx: index("lots_business_bill_book_serial_idx")
    .on(table.businessId, table.billBookNumber, table.serialNumber, table.date),
  // Typing a vehicle number recalls its driver. The match ignores upper/lower case, so the index has to be
  // built on the upper-cased value — an index on the column as stored would simply be skipped.
  businessVehicleUpperIdx: index("lots_business_vehicle_upper_idx")
    .on(table.businessId, sql`upper(${table.vehicleNumber})`),
}));

export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  buyerId: integer("buyer_id").notNull().references(() => buyers.id),
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }).notNull(),
  numberOfBags: integer("number_of_bags").notNull(),
  grade: text("grade").default("Large"),
  haste: text("haste").default("KHUD"),
  paymentType: text("payment_type").default("Credit").notNull(),
  advanceAmount: decimal("advance_amount", { precision: 10, scale: 2 }).default("0"),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Bids are fetched for one lot at a time, and listed newest first for the business.
  businessLotIdx: index("bids_business_lot_idx").on(table.businessId, table.lotId),
  businessBuyerIdx: index("bids_business_buyer_idx").on(table.businessId, table.buyerId),
  businessCreatedIdx: index("bids_business_created_idx").on(table.businessId, table.createdAt),
}));

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  transactionId: text("transaction_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  bidId: integer("bid_id").notNull().references(() => bids.id),
  buyerId: integer("buyer_id").notNull().references(() => buyers.id),
  farmerId: integer("farmer_id").notNull().references(() => farmers.id),
  totalWeight: decimal("total_weight", { precision: 12, scale: 2 }),
  numberOfBags: integer("number_of_bags"),
  haste: text("haste").default("KHUD"),
  hammaliCharges: decimal("hammali_charges", { precision: 10, scale: 2 }).default("0"),
  extraChargesFarmer: decimal("extra_charges_farmer", { precision: 10, scale: 2 }).default("0"),
  extraTulaiFarmer: decimal("extra_tulai_farmer", { precision: 10, scale: 2 }).default("0"),
  extraBharaiFarmer: decimal("extra_bharai_farmer", { precision: 10, scale: 2 }).default("0"),
  extraKhadiKaraiFarmer: decimal("extra_khadi_karai_farmer", { precision: 10, scale: 2 }).default("0"),
  extraThelaBhadaFarmer: decimal("extra_thela_bhada_farmer", { precision: 10, scale: 2 }).default("0"),
  extraOthersFarmer: decimal("extra_others_farmer", { precision: 10, scale: 2 }).default("0"),
  extraChargesBuyer: decimal("extra_charges_buyer", { precision: 10, scale: 2 }).default("0"),
  freightCharges: decimal("freight_charges", { precision: 10, scale: 2 }).default("0"),
  netWeight: decimal("net_weight", { precision: 12, scale: 2 }),
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }),
  extraPerKgFarmer: decimal("extra_per_kg_farmer", { precision: 10, scale: 2 }).default("0"),
  extraPerKgBuyer: decimal("extra_per_kg_buyer", { precision: 10, scale: 2 }).default("0"),
  aadhatCharges: decimal("aadhat_charges", { precision: 10, scale: 2 }).default("0"),
  mandiCharges: decimal("mandi_charges", { precision: 10, scale: 2 }).default("0"),
  muddatAnyaCharges: decimal("muddat_anya_charges", { precision: 10, scale: 2 }).default("0"),
  aadhatFarmerPercent: decimal("aadhat_farmer_percent", { precision: 5, scale: 2 }).default("0"),
  mandiFarmerPercent: decimal("mandi_farmer_percent", { precision: 5, scale: 2 }).default("0"),
  muddatAnyaFarmerPercent: decimal("muddat_anya_farmer_percent", { precision: 5, scale: 2 }).default("0"),
  aadhatBuyerPercent: decimal("aadhat_buyer_percent", { precision: 5, scale: 2 }).default("0"),
  mandiBuyerPercent: decimal("mandi_buyer_percent", { precision: 5, scale: 2 }).default("0"),
  muddatAnyaBuyerPercent: decimal("muddat_anya_buyer_percent", { precision: 5, scale: 2 }).default("0"),
  hammaliFarmerPerBag: decimal("hammali_farmer_per_bag", { precision: 10, scale: 2 }).default("0"),
  hammaliBuyerPerBag: decimal("hammali_buyer_per_bag", { precision: 10, scale: 2 }).default("0"),
  totalPayableToFarmer: decimal("total_payable_to_farmer", { precision: 12, scale: 2 }).default("0"),
  totalReceivableFromBuyer: decimal("total_receivable_from_buyer", { precision: 12, scale: 2 }).default("0"),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  paymentStatus: text("payment_status").default("due").notNull(),
  farmerPaidAmount: decimal("farmer_paid_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  farmerPaymentStatus: text("farmer_payment_status").default("due").notNull(),
  date: date("date"),
  isReversed: boolean("is_reversed").default(false).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueTransactionPerBusiness: uniqueIndex("transactions_business_transaction_id_unique").on(table.businessId, table.transactionId),
  // The ledgers read one party's transactions by date; the guards and receipts read them by lot or bid.
  businessFarmerDateIdx: index("transactions_business_farmer_date_idx").on(table.businessId, table.farmerId, table.date),
  businessBuyerDateIdx: index("transactions_business_buyer_date_idx").on(table.businessId, table.buyerId, table.date),
  businessLotIdx: index("transactions_business_lot_idx").on(table.businessId, table.lotId),
  businessBidIdx: index("transactions_business_bid_idx").on(table.businessId, table.bidId),
  businessDateIdx: index("transactions_business_date_idx").on(table.businessId, table.date),
  businessCreatedIdx: index("transactions_business_created_idx").on(table.businessId, table.createdAt),
  // Same "starts with today's date" scan when a new transaction number is allocated.
  businessTransactionIdPatternIdx: index("transactions_business_txn_id_pattern_idx")
    .on(table.businessId, table.transactionId.op("text_pattern_ops")),
}));

export const businessChargeSettings = pgTable("business_charge_settings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  mandiCommissionFarmerPercent: decimal("mandi_commission_farmer_percent", { precision: 5, scale: 2 }).default("0"),
  mandiCommissionBuyerPercent: decimal("mandi_commission_buyer_percent", { precision: 5, scale: 2 }).default("1"),
  aadhatCommissionFarmerPercent: decimal("aadhat_commission_farmer_percent", { precision: 5, scale: 2 }).default("0"),
  aadhatCommissionBuyerPercent: decimal("aadhat_commission_buyer_percent", { precision: 5, scale: 2 }).default("2"),
  muddatAnyaFarmerPercent: decimal("muddat_anya_farmer_percent", { precision: 5, scale: 2 }).default("0"),
  muddatAnyaBuyerPercent: decimal("muddat_anya_buyer_percent", { precision: 5, scale: 2 }).default("0"),
  hammaliFarmerPerBag: decimal("hammali_farmer_per_bag", { precision: 10, scale: 2 }).default("0"),
  hammaliBuyerPerBag: decimal("hammali_buyer_per_bag", { precision: 10, scale: 2 }).default("0"),
  tulaiFarmerPerBag: decimal("tulai_farmer_per_bag", { precision: 10, scale: 2 }).default("0"),
  khadiKaraiFarmerPerBag: decimal("khadi_karai_farmer_per_bag", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Only the latest settings row per business is read, with the whole history shown on demand.
  businessUpdatedIdx: index("business_charge_settings_business_updated_idx").on(table.businessId, table.updatedAt),
}));

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  accountType: text("account_type").notNull().default("Current"),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  businessIdx: index("bank_accounts_business_idx").on(table.businessId),
}));

/**
 * One counter per business, bumped every time anything in that business changes.
 *
 * Two screens open at once can only stay in step if a browser can ask "has anything changed since I
 * last looked?" cheaply. The live push handles the normal case; this counter is what lets a browser
 * catch up after its live connection was dropped or blocked, and it works no matter which server
 * copy answers the request.
 */
export const businessRevisions = pgTable("business_revisions", {
  businessId: integer("business_id").primaryKey().references(() => businesses.id),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cashSettings = pgTable("cash_settings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id).unique(),
  cashInHandOpening: decimal("cash_in_hand_opening", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cashEntries = pgTable("cash_entries", {
  id: serial("id").primaryKey(),
  cashFlowId: text("cash_flow_id"),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  category: text("category").notNull().default("inward"),
  type: text("type").notNull(),
  outflowType: text("outflow_type"),
  farmerId: integer("farmer_id").references(() => farmers.id),
  buyerId: integer("buyer_id").references(() => buyers.id),
  transactionId: integer("transaction_id").references(() => transactions.id),
  bankAccountId: integer("bank_account_id").references(() => bankAccounts.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0"),
  pettyAdj: decimal("petty_adj", { precision: 12, scale: 2 }).default("0"),
  paymentMode: text("payment_mode").notNull().default("Cash"),
  chequeNumber: text("cheque_number"),
  chequeDate: date("cheque_date"),
  bankName: text("bank_name"),
  date: date("date").notNull(),
  // Freight/Bhada payouts settle a farmer card, which has no row of its own — it is just the lots
  // sharing a farmer and a stock entry date. Vehicle number and driver are optional, so the card is
  // identified by farmerId + this stock date. Null on every other kind of entry (and on Freight
  // payments recorded before bhada tracking existed, which therefore settle nothing).
  stockDate: date("stock_date"),
  partyName: text("party_name"),
  notes: text("notes"),
  splitLog: text("split_log"),
  advanceAmount: decimal("advance_amount", { precision: 12, scale: 2 }).default("0"),
  isReversed: boolean("is_reversed").default(false).notNull(),
  reversedAt: timestamp("reversed_at"),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // The ledgers read one party's entries by date; the payment guards read them by transaction.
  businessFarmerDateIdx: index("cash_entries_business_farmer_date_idx").on(table.businessId, table.farmerId, table.date),
  businessBuyerDateIdx: index("cash_entries_business_buyer_date_idx").on(table.businessId, table.buyerId, table.date),
  businessTransactionIdx: index("cash_entries_business_transaction_idx").on(table.businessId, table.transactionId),
  // What a farmer card still owes in Freight/Bhada, recalculated every time the Cash page opens.
  businessFarmerStockDateIdx: index("cash_entries_business_farmer_stock_date_idx").on(table.businessId, table.farmerId, table.stockDate),
  businessBankAccountIdx: index("cash_entries_business_bank_account_idx").on(table.businessId, table.bankAccountId),
  businessDateIdx: index("cash_entries_business_date_idx").on(table.businessId, table.date),
  businessCategoryOutflowIdx: index("cash_entries_business_category_outflow_idx").on(table.businessId, table.category, table.outflowType),
  // Every new entry scans for the day's highest cash flow number before it can pick the next one. That
  // lookup is a "starts with today's date" match, and Postgres can only use an index for that when the
  // index is built with text_pattern_ops — a plain one is ignored and the whole table is read instead.
  businessCashFlowIdIdx: index("cash_entries_business_cash_flow_id_idx")
    .on(table.businessId, table.cashFlowId.op("text_pattern_ops")),
}));

export const insertBusinessSchema = createInsertSchema(businesses).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertFarmerSchema = createInsertSchema(farmers).omit({ id: true, createdAt: true });
export const insertFarmerEditHistorySchema = createInsertSchema(farmerEditHistory).omit({ id: true, createdAt: true });
export const insertBuyerSchema = createInsertSchema(buyers).omit({ id: true, createdAt: true });
export const insertBuyerEditHistorySchema = createInsertSchema(buyerEditHistory).omit({ id: true, createdAt: true });
export const insertLotEditHistorySchema = createInsertSchema(lotEditHistory).omit({ id: true, createdAt: true });
export const insertTransactionEditHistorySchema = createInsertSchema(transactionEditHistory).omit({ id: true, createdAt: true });
export const insertLotSchema = createInsertSchema(lots).omit({ id: true, createdAt: true });
export const insertBidSchema = createInsertSchema(bids).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, transactionId: true, createdAt: true });
export const insertBankAccountSchema = createInsertSchema(bankAccounts).omit({ id: true, createdAt: true });
export const insertBusinessChargeSettingsSchema = createInsertSchema(businessChargeSettings).omit({ id: true, createdAt: true });
export const insertCashSettingsSchema = createInsertSchema(cashSettings).omit({ id: true, createdAt: true });
export const insertCashEntrySchema = createInsertSchema(cashEntries).omit({ id: true, cashFlowId: true, createdAt: true });

export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Farmer = typeof farmers.$inferSelect;
export type InsertFarmer = z.infer<typeof insertFarmerSchema>;
export type FarmerEditHistory = typeof farmerEditHistory.$inferSelect;
export type InsertFarmerEditHistory = z.infer<typeof insertFarmerEditHistorySchema>;
export type Buyer = typeof buyers.$inferSelect;
export type InsertBuyer = z.infer<typeof insertBuyerSchema>;
export type BuyerEditHistory = typeof buyerEditHistory.$inferSelect;
export type InsertBuyerEditHistory = z.infer<typeof insertBuyerEditHistorySchema>;
export type LotEditHistory = typeof lotEditHistory.$inferSelect;
export type InsertLotEditHistory = z.infer<typeof insertLotEditHistorySchema>;
export type TransactionEditHistory = typeof transactionEditHistory.$inferSelect;
export type InsertTransactionEditHistory = z.infer<typeof insertTransactionEditHistorySchema>;
export type Lot = typeof lots.$inferSelect;
export type InsertLot = z.infer<typeof insertLotSchema>;
export type Bid = typeof bids.$inferSelect;
export type InsertBid = z.infer<typeof insertBidSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BusinessChargeSettings = typeof businessChargeSettings.$inferSelect;
export type InsertBusinessChargeSettings = z.infer<typeof insertBusinessChargeSettingsSchema>;
export type CashSettings = typeof cashSettings.$inferSelect;
export type InsertCashSettings = z.infer<typeof insertCashSettingsSchema>;
export type CashEntry = typeof cashEntries.$inferSelect;
export type InsertCashEntry = z.infer<typeof insertCashEntrySchema>;

export const demoVideos = pgTable("demo_videos", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  caption: text("caption").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertDemoVideoSchema = createInsertSchema(demoVideos).omit({ id: true, uploadedAt: true });
export type DemoVideo = typeof demoVideos.$inferSelect;
export type InsertDemoVideo = z.infer<typeof insertDemoVideoSchema>;

export const ASSET_CATEGORIES = ["Building", "Plant & Machinery", "Furniture & Fixtures", "Vehicles", "Computers", "Electrical Fittings", "Other"] as const;
export const ASSET_DEPRECIATION_RATES: Record<string, number> = {
  "Building": 10,
  "Plant & Machinery": 15,
  "Furniture & Fixtures": 10,
  "Vehicles": 15,
  "Computers": 40,
  "Electrical Fittings": 10,
  "Other": 10,
};

export const LIABILITY_TYPES = ["Bank Loan", "Equipment Loan", "Credit Line", "Outstanding Payable", "Other"] as const;

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  purchaseDate: date("purchase_date").notNull(),
  originalCost: decimal("original_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  currentBookValue: decimal("current_book_value", { precision: 12, scale: 2 }).notNull().default("0"),
  depreciationRate: decimal("depreciation_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  assetType: text("asset_type").notNull().default("opening"),
  isDisposed: boolean("is_disposed").notNull().default(false),
  disposalDate: date("disposal_date"),
  disposalAmount: decimal("disposal_amount", { precision: 12, scale: 2 }),
  disposalReason: text("disposal_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  businessIdx: index("assets_business_idx").on(table.businessId),
}));

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, createdAt: true });
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;

export const assetDepreciationLog = pgTable("asset_depreciation_log", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  financialYear: text("financial_year").notNull(),
  openingValue: decimal("opening_value", { precision: 12, scale: 2 }).notNull(),
  depreciationAmount: decimal("depreciation_amount", { precision: 12, scale: 2 }).notNull(),
  closingValue: decimal("closing_value", { precision: 12, scale: 2 }).notNull(),
  monthsUsed: integer("months_used").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Depreciation is read per asset, and per financial year when the books are built.
  businessAssetIdx: index("asset_depreciation_log_business_asset_idx").on(table.businessId, table.assetId),
  assetFinancialYearIdx: index("asset_depreciation_log_asset_fy_idx").on(table.assetId, table.financialYear),
}));

export const insertAssetDepreciationLogSchema = createInsertSchema(assetDepreciationLog).omit({ id: true, createdAt: true });
export type AssetDepreciationLog = typeof assetDepreciationLog.$inferSelect;
export type InsertAssetDepreciationLog = z.infer<typeof insertAssetDepreciationLogSchema>;

export const liabilities = pgTable("liabilities", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  originalAmount: decimal("original_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  outstandingAmount: decimal("outstanding_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  emiAmount: decimal("emi_amount", { precision: 12, scale: 2 }),
  startDate: date("start_date").notNull(),
  isSettled: boolean("is_settled").notNull().default(false),
  settledDate: date("settled_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  businessIdx: index("liabilities_business_idx").on(table.businessId),
}));

export const insertLiabilitySchema = createInsertSchema(liabilities).omit({ id: true, createdAt: true });
export type Liability = typeof liabilities.$inferSelect;
export type InsertLiability = z.infer<typeof insertLiabilitySchema>;

export const liabilityPayments = pgTable("liability_payments", {
  id: serial("id").primaryKey(),
  liabilityId: integer("liability_id").notNull().references(() => liabilities.id),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  paymentDate: date("payment_date").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  principalAmount: decimal("principal_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  interestAmount: decimal("interest_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  isReversed: boolean("is_reversed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  businessLiabilityIdx: index("liability_payments_business_liability_idx").on(table.businessId, table.liabilityId),
  businessPaymentDateIdx: index("liability_payments_business_payment_date_idx").on(table.businessId, table.paymentDate),
}));

export const insertLiabilityPaymentSchema = createInsertSchema(liabilityPayments).omit({ id: true, createdAt: true });
export type LiabilityPayment = typeof liabilityPayments.$inferSelect;
export type InsertLiabilityPayment = z.infer<typeof insertLiabilityPaymentSchema>;

export const DISTRICTS = [
  "Agar Malwa", "Dewas", "Dhar", "Indore", "Jhabua", "Khargoan",
  "Mandsaur", "Neemuch", "Rajgarh", "Ratlam", "Sagar", "Shajapur", "Ujjain"
] as const;

export const CROPS = ["Garlic", "Onion", "Potato"] as const;
export const SIZES = ["Large", "Medium", "Small", "Chhatan"] as const;
export const PAYMENT_MODES = ["Cash", "Online", "Cheque"] as const;

export const receiptTemplates = pgTable("receipt_templates", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  templateType: text("template_type").notNull(),
  crop: text("crop").notNull().default(""),
  templateHtml: text("template_html").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueTemplate: uniqueIndex("receipt_templates_business_type_crop_unique").on(table.businessId, table.templateType, table.crop),
}));

export const insertReceiptTemplateSchema = createInsertSchema(receiptTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type ReceiptTemplate = typeof receiptTemplates.$inferSelect;
export type InsertReceiptTemplate = z.infer<typeof insertReceiptTemplateSchema>;

export const buyerReceiptSerials = pgTable("buyer_receipt_serials", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  buyerId: integer("buyer_id").notNull().references(() => buyers.id),
  date: date("date").notNull(),
  crop: text("crop").notNull().default(""),
  serialNumber: integer("serial_number").notNull(),
  billBookNumber: integer("bill_book_number").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueBuyerReceiptSerial: uniqueIndex("buyer_receipt_serials_business_buyer_date_crop_unique").on(table.businessId, table.buyerId, table.date, table.crop),
  // Duplicate-serial checks sweep a whole financial year for the business.
  businessDateIdx: index("buyer_receipt_serials_business_date_idx").on(table.businessId, table.date),
}));

export type BuyerReceiptSerial = typeof buyerReceiptSerials.$inferSelect;

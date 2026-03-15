import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, date, timestamp, serial, uniqueIndex, json } from "drizzle-orm/pg-core";
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
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
});

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
  isActive: boolean("is_active").notNull().default(true),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).default("0"),
  aadhatCommissionPercent: decimal("aadhat_commission_percent", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueBuyerPerBusiness: uniqueIndex("buyers_business_buyer_id_unique").on(table.businessId, table.buyerId),
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
});

export const buyerEditHistory = pgTable("buyer_edit_history", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull().references(() => buyers.id),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lotEditHistory = pgTable("lot_edit_history", {
  id: serial("id").primaryKey(),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transactionEditHistory = pgTable("transaction_edit_history", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lots = pgTable("lots", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  lotId: text("lot_id").notNull(),
  serialNumber: integer("serial_number").notNull(),
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
  freightType: text("freight_type"),
  totalBagsInVehicle: integer("total_bags_in_vehicle"),
  initialTotalWeight: decimal("initial_total_weight", { precision: 12, scale: 2 }),
  farmerAdvanceAmount: decimal("farmer_advance_amount", { precision: 10, scale: 2 }).default("0"),
  farmerAdvanceMode: text("farmer_advance_mode"),
  isReturned: boolean("is_returned").default(false).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueLotPerBusiness: uniqueIndex("lots_business_lot_id_unique").on(table.businessId, table.lotId),
}));

export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  buyerId: integer("buyer_id").notNull().references(() => buyers.id),
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }).notNull(),
  numberOfBags: integer("number_of_bags").notNull(),
  grade: text("grade").default("Large"),
  paymentType: text("payment_type").default("Credit").notNull(),
  advanceAmount: decimal("advance_amount", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  aadhatFarmerPercent: decimal("aadhat_farmer_percent", { precision: 5, scale: 2 }).default("0"),
  mandiFarmerPercent: decimal("mandi_farmer_percent", { precision: 5, scale: 2 }).default("0"),
  aadhatBuyerPercent: decimal("aadhat_buyer_percent", { precision: 5, scale: 2 }).default("0"),
  mandiBuyerPercent: decimal("mandi_buyer_percent", { precision: 5, scale: 2 }).default("0"),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueTransactionPerBusiness: uniqueIndex("transactions_business_transaction_id_unique").on(table.businessId, table.transactionId),
}));

export const businessChargeSettings = pgTable("business_charge_settings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id).unique(),
  mandiCommissionFarmerPercent: decimal("mandi_commission_farmer_percent", { precision: 5, scale: 2 }).default("0"),
  mandiCommissionBuyerPercent: decimal("mandi_commission_buyer_percent", { precision: 5, scale: 2 }).default("1"),
  aadhatCommissionFarmerPercent: decimal("aadhat_commission_farmer_percent", { precision: 5, scale: 2 }).default("0"),
  aadhatCommissionBuyerPercent: decimal("aadhat_commission_buyer_percent", { precision: 5, scale: 2 }).default("2"),
  hammaliFarmerPerBag: decimal("hammali_farmer_per_bag", { precision: 10, scale: 2 }).default("0"),
  hammaliBuyerPerBag: decimal("hammali_buyer_per_bag", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  accountType: text("account_type").notNull().default("Current"),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  partyName: text("party_name"),
  notes: text("notes"),
  splitLog: text("split_log"),
  isReversed: boolean("is_reversed").default(false).notNull(),
  reversedAt: timestamp("reversed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
});

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
});

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
});

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
});

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueBuyerReceiptSerial: uniqueIndex("buyer_receipt_serials_business_buyer_date_crop_unique").on(table.businessId, table.buyerId, table.date, table.crop),
}));

export type BuyerReceiptSerial = typeof buyerReceiptSerials.$inferSelect;

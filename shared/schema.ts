import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, date, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  name: text("name").notNull().default(""),
  password: text("password").notNull(),
  resetPasswordHash: text("reset_password_hash"),
  phone: text("phone"),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  role: text("role").notNull().default("user"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const farmers = pgTable("farmers", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  village: text("village"),
  tehsil: text("tehsil"),
  district: text("district"),
  state: text("state").default("Madhya Pradesh"),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const buyers = pgTable("buyers", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).default("0"),
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
  remainingBags: integer("remaining_bags").notNull(),
  size: text("size").notNull(),
  bagMarka: text("bag_marka"),
  vehicleNumber: text("vehicle_number"),
  vehicleBhadaRate: decimal("vehicle_bhada_rate", { precision: 10, scale: 2 }),
  initialTotalWeight: decimal("initial_total_weight", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  buyerId: integer("buyer_id").notNull().references(() => buyers.id),
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }).notNull(),
  numberOfBags: integer("number_of_bags").notNull(),
  grade: text("grade").default("Large"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  bidId: integer("bid_id").notNull().references(() => bids.id),
  buyerId: integer("buyer_id").notNull().references(() => buyers.id),
  farmerId: integer("farmer_id").notNull().references(() => farmers.id),
  totalWeight: decimal("total_weight", { precision: 12, scale: 2 }),
  numberOfBags: integer("number_of_bags"),
  hammaliCharges: decimal("hammali_charges", { precision: 10, scale: 2 }).default("0"),
  gradingCharges: decimal("grading_charges", { precision: 10, scale: 2 }).default("0"),
  netWeight: decimal("net_weight", { precision: 12, scale: 2 }),
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }),
  aadhatCommissionPercent: decimal("aadhat_commission_percent", { precision: 5, scale: 2 }).default("0"),
  mandiCommissionPercent: decimal("mandi_commission_percent", { precision: 5, scale: 2 }).default("0"),
  aadhatCharges: decimal("aadhat_charges", { precision: 10, scale: 2 }).default("0"),
  mandiCharges: decimal("mandi_charges", { precision: 10, scale: 2 }).default("0"),
  chargedTo: text("charged_to").default("Buyer"),
  totalPayableToFarmer: decimal("total_payable_to_farmer", { precision: 12, scale: 2 }).default("0"),
  totalReceivableFromBuyer: decimal("total_receivable_from_buyer", { precision: 12, scale: 2 }).default("0"),
  date: date("date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cashEntries = pgTable("cash_entries", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  type: text("type").notNull(),
  farmerId: integer("farmer_id").references(() => farmers.id),
  buyerId: integer("buyer_id").references(() => buyers.id),
  transactionId: integer("transaction_id").references(() => transactions.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMode: text("payment_mode").notNull().default("Cash"),
  chequeNumber: text("cheque_number"),
  chequeDate: date("cheque_date"),
  bankName: text("bank_name"),
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBusinessSchema = createInsertSchema(businesses).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertFarmerSchema = createInsertSchema(farmers).omit({ id: true, createdAt: true });
export const insertBuyerSchema = createInsertSchema(buyers).omit({ id: true, createdAt: true });
export const insertLotSchema = createInsertSchema(lots).omit({ id: true, createdAt: true });
export const insertBidSchema = createInsertSchema(bids).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export const insertCashEntrySchema = createInsertSchema(cashEntries).omit({ id: true, createdAt: true });

export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Farmer = typeof farmers.$inferSelect;
export type InsertFarmer = z.infer<typeof insertFarmerSchema>;
export type Buyer = typeof buyers.$inferSelect;
export type InsertBuyer = z.infer<typeof insertBuyerSchema>;
export type Lot = typeof lots.$inferSelect;
export type InsertLot = z.infer<typeof insertLotSchema>;
export type Bid = typeof bids.$inferSelect;
export type InsertBid = z.infer<typeof insertBidSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type CashEntry = typeof cashEntries.$inferSelect;
export type InsertCashEntry = z.infer<typeof insertCashEntrySchema>;

export const DISTRICTS = [
  "Agar Malwa", "Dewas", "Dhar", "Indore", "Jhabua", "Khargoan",
  "Mandsaur", "Neemuch", "Rajgarh", "Ratlam", "Sagar", "Shajapur", "Ujjain"
] as const;

export const CROPS = ["Garlic", "Onion", "Potato"] as const;
export const SIZES = ["Large", "Medium", "Small", "Chhatan"] as const;
export const PAYMENT_MODES = ["Cash", "Online", "Cheque"] as const;

# Mandi Mitra - Agricultural Marketplace Manager

## Overview
Mandi Mitra is a multi-tenant agricultural commodity trading management system that handles end-to-end processes from stock entry to billing. It covers farmer onboarding, lot management, bidding, transactions, cash management, and ledger tracking. The system admin (app owner) can onboard businesses and users through an Admin Panel.

## Architecture
- **Frontend**: React + TypeScript with Tailwind CSS and Shadcn UI components
- **Backend**: Express.js REST API with session-based authentication (Passport.js)
- **Database**: PostgreSQL with Drizzle ORM
- **Multi-Tenant**: Data isolation via `businessId` foreign key on all tables

## User Roles
- **system_admin**: App owner, accesses Admin Panel to manage businesses and users
- **user**: Business user, accesses Mandi Mitra trading app (stock entry, bidding, etc.)

## Key Features
1. **Dashboard** - Business overview with summary cards, pie charts (receivables by crop, buyer dues), line charts (farmer dues, buyer dues, avg volume, aadhat value by date), multi-select filters (crop, year, month, day)
2. **Admin Panel** - System admin manages merchants (businesses) and users
   - Merchants: Add, edit, activate/deactivate, archive, reset (wipe user data)
   - Users: Add, edit, reset password, delete
   - Demo Videos: Upload multiple videos with captions, edit captions, delete videos
   - Business status controls: inactive/archived prevents user login
   - Merchant ID format: BU + YYYYMMDD + sequence (e.g., BU202602131)
   - Default user password: password123
2. **Stock Entry** - Vehicle-centric entry: Farmer → Vehicle Info → Multiple Lots
   - Vehicle section: Vehicle #, Driver Name, Driver Contact, Freight/Bhada (mandatory), Advance/Credit dropdown (mandatory), Total # of Bags (mandatory)
   - Lot section: Each lot has Crop (mandatory), # of Bags (mandatory), Size (optional), Variety, Bag Marka, Initial Total Weight
   - Multiple lots per vehicle, sum of lot bags ≤ total bags in vehicle
   - All lots in a batch share one serial number (unified per business+date, crop-agnostic)
   - Lot IDs remain per-crop: POT/ONI/GAR prefix + YYYYMMDD + per-crop sequence
   - Batch creation via POST /api/lots/batch
3. **Stock Register** - Lots grouped by serial number with card layout:
   - Row 1: SR # badge + group status badge (Sold Out if all lots sold)
   - Row 2: Vehicle info (Vehicle #, Driver Name, Bhada, Advance/Credit, Driver Contact — shown if provided)
   - Row 3: Farmer Name, Contact, Village, Total # of Bags
   - Row 4: Date, common Variety/Size (if shared across lots)
   - Row 5+: Per-lot rows with Crop, Bags, Remaining, Marka, individual status badge
   - No Lot ID on cards (backend/CSV only)
   - Edit dialog: shared vehicle fields + per-lot editable fields
   - Filters: Crop (with "All" default), Farmer search, Year/Month/Day, Sale status
4. **Bidding** - Lots grouped by serial number, "All" default for Crop and Size filters, bids target individual lots
5. **Transactions** - Calculate net weight, commissions (aadhat + mandi), payable/receivable amounts
6. **Cash Management** - Track Cash In (from buyers) and Cash Out (to farmers) with payment modes
7. **Farmer Ledger** - Opening balance, transactions, payments, current dues, edit/merge/archive
8. **Buyer Ledger** - Same structure for buyer tracking, edit/merge/archive
   - Buyer merge: On edit, if name+phone matches another buyer, prompts to merge (keeps lower ID, transfers all bids/transactions/cash entries/edit history, combines opening balances, deletes duplicate)

## Project Structure
```
shared/schema.ts       - Database schema, types, and validation schemas
server/
  index.ts             - Express server setup
  db.ts                - PostgreSQL connection pool
  auth.ts              - Passport.js authentication (requireAuth, requireAdmin)
  routes.ts            - All API routes (admin + user)
  storage.ts           - Database storage interface
client/src/
  App.tsx              - Main app with routing and responsive layout
  lib/auth.tsx         - Auth context provider
  pages/
    login.tsx          - Login page
    change-password.tsx - First-time password change (requires mobile + new password)
    admin.tsx          - Admin panel (merchants + users tabs)
    dashboard.tsx      - Dashboard with charts and summary
    stock-entry.tsx    - Stock entry form
    stock-register.tsx - Stock register view
    bidding.tsx        - Bidding interface
    transactions.tsx   - Transaction calculations (grouped by lot, hammali per bag, print receipts)
    cash.tsx           - Cash management
    farmer-ledger.tsx  - Farmer ledger (tabular view with summary cards, filters, edit/merge/archive)
    buyer-ledger.tsx   - Buyer ledger view
    demo-videos.tsx    - Demo videos gallery for users
```

## Authentication
- Session-based auth with PostgreSQL session store
- System admin: username `admin`, password from ADMIN_PASSWORD env secret (synced on startup)
- New users: default password `password123`, must change on first login
- Change password requires registered mobile number verification
- Business status (active/inactive/archived) checked on every request
- Inactive/archived business blocks user login and ongoing sessions

## Mobile-First Design
- Bottom navigation on mobile/tablet (< 768px)
- Desktop sidebar with collapse toggle
- 44px minimum touch targets
- Touch-optimized forms with proper input modes (numeric, decimal, tel)

## Database
- PostgreSQL with Drizzle ORM
- Schema push: `npm run db:push`
- Tables: businesses, users, farmers, farmer_edit_history, buyers, buyer_edit_history, lot_edit_history, transaction_edit_history, lots, bids, transactions, bank_accounts, cash_settings, cash_entries, business_charge_settings, demo_videos
- LotEditHistory: tracks lot field changes (numberOfBags, actualNumberOfBags, crop, variety, size, bagMarka, vehicleNumber, vehicleBhadaRate, initialTotalWeight) with old/new values, changedBy, timestamp
- TransactionEditHistory: tracks transaction lifecycle (created, reversed) and field changes (totalWeight, extraCharges, etc.) with old/new values, changedBy username, timestamp
- Farmer fields: farmerId (auto-generated FM+YYYYMMDD+seq, unique per business), name, phone, village, tehsil, district, state, openingBalance, redFlag (business-level red flag warning — indicates caution, not related to credit/debit), isArchived
- Business fields: merchantId (unique), name, phone, address, status (active/inactive/archived)
- User fields: username, name, phone, password, businessId, role (system_admin/user), mustChangePassword
- Buyer fields: buyerId (auto-generated BY+YYYYMMDD+seq), name, phone, address, buyerCode, redFlag (business-level red flag warning — indicates caution, not related to credit/debit), isActive, openingBalance
- Bid fields: lotId, buyerId, pricePerKg, numberOfBags, grade, paymentType (Cash/Credit, default Credit), advanceAmount (decimal, default 0 — only for Cash bids), createdAt
- Lot fields: lotId (auto POT/ONI/GAR+YYYYMMDD+seq), serialNumber (unified per business+date, crop-agnostic), crop, variety, numberOfBags (original, fixed at entry), actualNumberOfBags (editable, defaults to numberOfBags, can be reduced for damaged/graded harvest), remainingBags (= actualNumberOfBags - sold), size (nullable), bagMarka, vehicleNumber, vehicleBhadaRate, driverName, driverContact, freightType (Advance/Credit), totalBagsInVehicle, initialTotalWeight
- BuyerEditHistory: tracks field changes with old/new values, changedBy, timestamp
- BusinessChargeSettings: per-business charge rates (unique on businessId) with separate Farmer/Buyer fields for each charge type: mandiCommissionFarmerPercent, mandiCommissionBuyerPercent, aadhatCommissionFarmerPercent, aadhatCommissionBuyerPercent, hammaliFarmerPerBag, hammaliBuyerPerBag. Defaults: Mandi Buyer 1%, Aadhat Buyer 2%, all others 0%. Settings dialog on Dashboard (gear icon).
- Transaction fields: transactionId (auto-generated TX+YYYYMMDD+seq, unique per business+date, not displayed in UI), paidAmount (decimal, tracks allocated buyer payment via amount+discount+pettyAdj), farmerPaidAmount (decimal, tracks allocated farmer payment via linked cash entries), paymentStatus/farmerPaymentStatus (due/partial/paid, auto-calculated on cash entry create/reverse), includes split charge fields (aadhatFarmerPercent, aadhatBuyerPercent, mandiFarmerPercent, mandiBuyerPercent, hammaliFarmerPerBag, hammaliBuyerPerBag) auto-populated from business charge settings. Extra charges: extraChargesFarmer and extraChargesBuyer (editable per-transaction, not from settings). Extra Per Kg: extraPerKgFarmer and extraPerKgBuyer (per-transaction, modifies gross independently — farmer gross = netWeight × (bidPrice + extraPerKgFarmer), buyer gross = netWeight × (bidPrice + extraPerKgBuyer), commissions levied on respective gross). Stored totals: hammaliCharges, extraChargesFarmer, extraChargesBuyer, freightCharges, aadhatCharges, mandiCharges. Freight/Bhada: vehicleBhadaRate is total freight amount (not per-bag), auto-calculated proportionate share per transaction as (totalBhada × bidBags / actualBags), deducted from farmer.
- Transactions grouped by lot: pending bids and completed transactions are grouped by lot
- Print receipts: Farmer Receipt in Hindi, Buyer Receipt in English (opens in print window), Buyer Paana (outstanding dues statement per buyer with per-lot breakdown, FIFO payment allocation)
- WhatsApp sharing: All receipts share as PDF files via Web Share API (mobile) or download PDF (desktop). Uses html2canvas + jsPDF (CDN-loaded in print windows). PDF is pre-generated on window open; button shows "Preparing PDF..." then "Share via WhatsApp" when ready. Falls back to print dialog if CDN fails.
- BankAccount fields: name, accountType (Limit/Current/Saving), openingBalance
- CashSettings: cashInHandOpening (per business, upserted)
- CashEntry fields: cashFlowId (auto-generated CF+YYYYMMDD+seq, shared across batch allocations), category (inward/expense/transfer), type, partyType (Buyer/Farmer/Others/Transfer), bankAccountId, transactionId (links to specific transaction for buyer allocations), discount (decimal, default 0), pettyAdj (decimal, default 0), isReversed, reversedAt
- Cash Management: 3-tab layout (Inward/Expense/Transfer), summary cards, filter bar, cash flow history with CSV export
- Buyer Inward Payment: Manual transaction-level allocation (not FIFO). User selects specific transactions and enters amount/discount/pettyAdj per transaction. Multiple cash entries created per submission sharing one cashFlowId. Payment status (due/partial/paid) computed as sum(amount+discount+pettyAdj) of linked entries per transaction.
- Farmer Outward Payment (Harvest Sale): Manual transaction-level allocation (not FIFO). User selects specific transactions (SR#) and enters amount per transaction. Multiple cash entries created per submission sharing one cashFlowId. Farmer payment status (due/partial/paid) computed as sum(amount) of linked entries per transaction. No discount/pettyAdj for farmer payments.

## Running
- `npm run dev` starts both Express backend and Vite frontend on port 5000

## Districts Supported
Agar Malwa, Dewas, Dhar, Indore, Jhabua, Khargoan, Mandsaur, Neemuch, Rajgarh, Ratlam, Sagar, Shajapur, Ujjain

## Crops Supported
Garlic, Onion, Potato

## Environment Secrets
- **ADMIN_PASSWORD**: Admin login password (synced to DB on each server start)
- **RESET_PASSWORD**: Separate password required for data reset actions (compared directly from env, not stored in DB)
- **SESSION_SECRET**: Session encryption key

## Admin Actions
- **Toggle Status**: Activate/deactivate business (requires admin password)
- **Archive**: Archive/reinstate business (requires admin password)
- **Reset**: Wipe all user-entered data for a business (requires admin password + RESET_PASSWORD from env)
- **Reset User Password**: Reset user password to default (password123)
- **Delete User**: Remove user account (cannot delete system admin)

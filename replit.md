# Mandi Mitra - Agricultural Marketplace Manager

## Overview
Mandi Mitra is a multi-tenant agricultural commodity trading management system that handles end-to-end processes from stock entry to billing. It covers farmer onboarding, lot management, bidding, transactions, cash management, and ledger tracking.

## Architecture
- **Frontend**: React + TypeScript with Tailwind CSS and Shadcn UI components
- **Backend**: Express.js REST API with session-based authentication (Passport.js)
- **Database**: PostgreSQL with Drizzle ORM
- **Multi-Tenant**: Data isolation via `businessId` foreign key on all tables

## Key Features
1. **Stock Entry** - Register farmers and create lots with auto-generated Lot IDs (POT/ONI/GAR prefix + YYYYMMDD + sequence)
2. **Stock Register** - View all lots with card layout, crop toggle, search/filter, edit capability
3. **Bidding** - Multiple buyers can bid on available lots, grade selection (Large/Medium, Small, Chhatan)
4. **Transactions** - Calculate net weight, commissions (aadhat + mandi), payable/receivable amounts
5. **Cash Management** - Track Cash In (from buyers) and Cash Out (to farmers) with payment modes
6. **Farmer Ledger** - Opening balance, transactions, payments, current dues
7. **Buyer Ledger** - Same structure for buyer tracking

## Project Structure
```
shared/schema.ts       - Database schema, types, and validation schemas
server/
  index.ts             - Express server setup
  db.ts                - PostgreSQL connection pool
  auth.ts              - Passport.js authentication setup
  routes.ts            - All API routes
  storage.ts           - Database storage interface
client/src/
  App.tsx              - Main app with routing and responsive layout
  lib/auth.tsx         - Auth context provider
  pages/
    login.tsx          - Login page
    change-password.tsx - First-time password change
    stock-entry.tsx    - Stock entry form
    stock-register.tsx - Stock register view
    bidding.tsx        - Bidding interface
    transactions.tsx   - Transaction calculations
    cash.tsx           - Cash management
    farmer-ledger.tsx  - Farmer ledger view
    buyer-ledger.tsx   - Buyer ledger view
```

## Authentication
- Session-based auth with PostgreSQL session store
- Default admin: username `admin`, password `admin123`
- Forced password change on first login
- Multi-tenant: each user belongs to a business

## Mobile-First Design
- Bottom navigation on mobile/tablet (< 768px)
- Desktop sidebar with collapse toggle
- 44px minimum touch targets
- Touch-optimized forms with proper input modes (numeric, decimal, tel)

## Database
- PostgreSQL with Drizzle ORM
- Schema push: `npm run db:push`
- Tables: businesses, users, farmers, buyers, lots, bids, transactions, cash_entries

## Running
- `npm run dev` starts both Express backend and Vite frontend on port 5000

## Districts Supported
Agar Malwa, Dewas, Dhar, Indore, Jhabua, Khargoan, Mandsaur, Neemuch, Rajgarh, Ratlam, Sagar, Shajapur, Ujjain

## Crops Supported
Garlic, Onion, Potato

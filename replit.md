# Mandi Mitra - Agricultural Marketplace Manager

## Overview
Mandi Mitra is a multi-tenant agricultural commodity trading management system designed to streamline end-to-end operations from stock entry to billing. It caters to farmer onboarding, lot management, bidding, transaction processing, cash management, and ledger tracking. The system's primary goal is to empower agricultural businesses by providing a comprehensive, efficient, and transparent platform for commodity trading.

## User Preferences
I prefer clear and direct communication. I like to see iterative development with frequent, small updates. For any major architectural changes or significant feature implementations, please ask for my approval before proceeding. Ensure all user-facing features are intuitive and mobile-friendly. Prioritize robust error handling and data integrity.

## System Architecture
The system employs a modern web stack:
-   **Frontend**: Built with React and TypeScript, utilizing Tailwind CSS for styling and Shadcn UI components for a consistent design system. The UI/UX prioritizes a mobile-first approach with responsive layouts, including bottom navigation for smaller screens and a collapsable sidebar for desktop. Touch-optimized forms with appropriate input modes are implemented.
-   **Backend**: A robust Express.js REST API handles business logic and data interactions. Session-based authentication is managed using Passport.js.
-   **Database**: PostgreSQL serves as the primary data store, with Drizzle ORM facilitating database interactions and schema management.
-   **Multi-Tenancy**: Data isolation is achieved by enforcing a `businessId` foreign key across all relevant tables, ensuring each business operates within its segregated data environment.
-   **Authentication**: Session-based authentication with a PostgreSQL session store. Users (including an initial `admin` user) have their passwords managed, with new users requiring a password change on first login, which includes mobile number verification.
-   **Key Features**:
    -   **Dashboard**: Provides a business overview with summary cards, various charts (pie, line), and multi-select filters.
    -   **Admin Panel**: Allows `system_admin` to manage businesses (merchants) and users, including activation, deactivation, archiving, data resets, and user password management. It also supports uploading and managing demo videos.
    -   **Stock Entry**: Vehicle-centric entry for lots, including farmer details, vehicle information, and multiple lots per vehicle. Lots are grouped by a unified serial number.
    -   **Stock Register**: Displays lots grouped by serial number with comprehensive vehicle and farmer details.
    -   **Bidding**: Interface for managing bids on individual lots.
    -   **Transactions**: Handles net weight calculation, commission application (aadhat, mandi), and management of payable/receivable amounts. It supports customizable business charge settings.
    -   **Cash Management**: Tracks cash inflows and outflows, categorizing expenses (Revenue/Capital) and supporting payment allocations. Payment creation uses database transactions with row-level locking (`SELECT ... FOR UPDATE`) to prevent concurrent duplicate/overpayments against the same transaction.
    -   **Ledgers (Farmer & Buyer)**: Comprehensive tracking of opening balances, transactions, payments, and current dues. Includes functionality for editing, merging, and archiving ledger entries. Buyer merging intelligently consolidates duplicate buyer records.
    -   **Books (Beta)**: An accounting module comprising:
        -   **Asset Register**: CRUD for fixed assets with categories, WDV depreciation engine (Indian FY), and disposal tracking.
        -   **Liability Register**: CRUD for liabilities, payment recording with principal/interest split, and settlement.
        -   **Balance Sheet**: FY-based financial position reporting with CSV export.
        -   **Profit & Loss**: FY-based income/expense reporting with CSV export.
    -   **Reporting**: Generation and sharing of Farmer Receipts (Hindi), Buyer Receipts (English), and Buyer Paana (outstanding dues) with WhatsApp sharing capability (PDF export).

## External Dependencies
-   **PostgreSQL**: Relational database for all persistent data.
-   **Drizzle ORM**: Object-Relational Mapper for database interactions.
-   **React**: Frontend JavaScript library.
-   **TypeScript**: Statically typed superset of JavaScript.
-   **Tailwind CSS**: Utility-first CSS framework.
-   **Shadcn UI**: Reusable UI components.
-   **Express.js**: Backend web application framework.
-   **Passport.js**: Authentication middleware for Node.js.
-   **html2canvas**: JavaScript HTML renderer for PDF generation.
-   **jsPDF**: JavaScript library for generating PDFs.
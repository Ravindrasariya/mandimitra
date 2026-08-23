import { sql } from "drizzle-orm";
import { db } from "./db";

/*
 * The lookup indexes declared in shared/schema.ts only reach a database that someone has run
 * `npm run db:push` against. The published app starts from a built bundle and never runs that, so an
 * already-deployed database would keep every screen on a full-table read as the years of data build up.
 *
 * This applies the same index set at startup. Every statement is IF NOT EXISTS, so on an already-indexed
 * database the whole pass is a no-op costing a few milliseconds, and CONCURRENTLY means the first run on a
 * large live table builds the index without blocking anyone from saving a bill in the meantime.
 *
 * The pass runs in the background rather than in front of the port: on a database with years of data the
 * first build can take minutes, and holding the app shut until then would turn a routine publish into an
 * outage. Until it finishes the screens are merely as slow as they were before.
 *
 * Keep this list in step with shared/schema.ts: an index added there must be added here too.
 */
const INDEX_STATEMENTS = [
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS asset_depreciation_log_asset_fy_idx ON asset_depreciation_log (asset_id, financial_year)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS asset_depreciation_log_business_asset_idx ON asset_depreciation_log (business_id, asset_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS assets_business_idx ON assets (business_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS bank_accounts_business_idx ON bank_accounts (business_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS bids_business_buyer_idx ON bids (business_id, buyer_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS businesses_merchant_id_pattern_idx ON businesses (lower(merchant_id) text_pattern_ops)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS bids_business_created_idx ON bids (business_id, created_at)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS bids_business_lot_idx ON bids (business_id, lot_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS business_charge_settings_business_updated_idx ON business_charge_settings (business_id, updated_at)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS buyer_edit_history_business_buyer_idx ON buyer_edit_history (business_id, buyer_id, created_at)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS buyer_receipt_serials_business_date_idx ON buyer_receipt_serials (business_id, date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS buyers_business_name_idx ON buyers (business_id, name)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS buyers_business_buyer_id_pattern_idx ON buyers (business_id, lower(buyer_id) text_pattern_ops)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS cash_entries_business_bank_account_idx ON cash_entries (business_id, bank_account_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS cash_entries_business_buyer_date_idx ON cash_entries (business_id, buyer_id, date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS cash_entries_business_cash_flow_id_idx ON cash_entries (business_id, cash_flow_id text_pattern_ops)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS cash_entries_business_category_outflow_idx ON cash_entries (business_id, category, outflow_type)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS cash_entries_business_date_idx ON cash_entries (business_id, date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS cash_entries_business_farmer_date_idx ON cash_entries (business_id, farmer_id, date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS cash_entries_business_farmer_stock_date_idx ON cash_entries (business_id, farmer_id, stock_date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS cash_entries_business_transaction_idx ON cash_entries (business_id, transaction_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS farmer_edit_history_business_farmer_idx ON farmer_edit_history (business_id, farmer_id, created_at)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS farmers_business_name_idx ON farmers (business_id, name)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS farmers_business_farmer_id_pattern_idx ON farmers (business_id, lower(farmer_id) text_pattern_ops)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS liabilities_business_idx ON liabilities (business_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS liability_payments_business_liability_idx ON liability_payments (business_id, liability_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS liability_payments_business_payment_date_idx ON liability_payments (business_id, payment_date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS lot_edit_history_business_lot_idx ON lot_edit_history (business_id, lot_id, created_at)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS lots_business_created_idx ON lots (business_id, created_at)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS lots_business_date_idx ON lots (business_id, date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS lots_business_farmer_date_idx ON lots (business_id, farmer_id, date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS lots_business_lot_id_pattern_idx ON lots (business_id, lot_id text_pattern_ops)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS lots_business_bill_book_serial_idx ON lots (business_id, bill_book_number, serial_number, date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS lots_business_vehicle_upper_idx ON lots (business_id, upper(vehicle_number))",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS transaction_edit_history_business_txn_idx ON transaction_edit_history (business_id, transaction_id, created_at)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_business_bid_idx ON transactions (business_id, bid_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_business_buyer_date_idx ON transactions (business_id, buyer_id, date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_business_created_idx ON transactions (business_id, created_at)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_business_date_idx ON transactions (business_id, date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_business_farmer_date_idx ON transactions (business_id, farmer_id, date)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_business_lot_idx ON transactions (business_id, lot_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_business_txn_id_pattern_idx ON transactions (business_id, transaction_id text_pattern_ops)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS users_business_idx ON users (business_id)",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS users_username_idx ON users (username)",
];

/**
 * An interrupted concurrent build leaves an index behind that Postgres refuses to use and that
 * IF NOT EXISTS will happily skip forever, so the screen it was meant to speed up stays slow with no sign
 * of why. Dropping the remains here lets the pass below rebuild it. Only our own lookup indexes are
 * touched, never a primary key or a uniqueness rule.
 */
async function dropUnusableIndexes(): Promise<void> {
  const unusable = await db.execute(sql`
    SELECT c.relname AS name
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT i.indisvalid
      AND NOT i.indisprimary
      AND NOT i.indisunique
      AND c.relname LIKE '%\\_idx'
  `);

  for (const row of unusable.rows as { name: string }[]) {
    try {
      await db.execute(sql.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${row.name}"`));
      console.warn(`[indexes] removed unusable leftover ${row.name}; rebuilding it`);
    } catch (error) {
      console.warn(`[indexes] could not remove unusable ${row.name}:`, (error as Error).message);
    }
  }
}

async function applyIndexes(): Promise<void> {
  const failed: string[] = [];

  await dropUnusableIndexes();

  for (const statement of INDEX_STATEMENTS) {
    try {
      // CREATE INDEX CONCURRENTLY cannot run inside a transaction, so each statement is issued on its own.
      await db.execute(sql.raw(statement));
    } catch (error) {
      // A missing index makes a screen slow; it must never stop the app from running. One likely cause is
      // two app instances starting together, where the second finds the first already building the index.
      failed.push(`${statement} -> ${(error as Error).message}`);
    }
  }

  // Anything still unusable after the rebuild attempt has to be named rather than left to be discovered
  // later as unexplained slowness.
  const invalid = await db.execute(sql`
    SELECT c.relname AS name
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT i.indisvalid
  `);
  const invalidNames = (invalid.rows as { name: string }[]).map((r) => r.name);

  if (failed.length === 0 && invalidNames.length === 0) {
    console.log(`[indexes] all ${INDEX_STATEMENTS.length} lookup indexes are in place`);
    return;
  }
  for (const line of failed) console.warn("[indexes] could not apply:", line);
  if (invalidNames.length > 0) {
    console.warn(
      "[indexes] left unusable by an interrupted build, drop and let the next start rebuild:",
      invalidNames.join(", "),
    );
  }
  console.warn(
    `[indexes] ${failed.length} statement(s) failed and ${invalidNames.length} index(es) are unusable; affected screens will stay slow until this is resolved`,
  );
}

/**
 * Starts the index pass in the background. Returns immediately so the app can begin serving.
 */
export function ensureIndexes(): void {
  void applyIndexes().catch((error) => {
    console.warn("[indexes] index pass could not run:", (error as Error).message);
  });
}

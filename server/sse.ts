import type { Response } from "express";
import pg from "pg";
import { pool, db } from "./db";
import { businessRevisions } from "@shared/schema";
import { sql } from "drizzle-orm";

const clients = new Map<number, Set<Response>>();

/**
 * The Postgres channel every server copy listens on.
 *
 * The published app can run as more than one copy of the server, and a browser's live connection is
 * held by whichever copy answered it. A change saved on one copy must therefore travel through
 * something both copies can see — the database they already share — or the second user is simply
 * never told. This is the whole reason a change made by one person used to need the other person to
 * hard-refresh.
 */
const CHANNEL = "business_changed";

/** Identifies this server copy, so it can ignore the echo of its own notification. */
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

export function addSseClient(businessId: number, res: Response): void {
  if (!clients.has(businessId)) clients.set(businessId, new Set());
  clients.get(businessId)!.add(res);
}

export function removeSseClient(businessId: number, res: Response): void {
  const set = clients.get(businessId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(businessId);
}

/** Push to the browsers connected to *this* copy of the server. */
function deliverLocally(businessId: number, eventType: string): void {
  const set = clients.get(businessId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify({ type: eventType })}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
    }
  }
}

/**
 * Bump the business's change counter.
 *
 * A browser that missed the live push entirely — connection dropped, phone asleep, proxy blocking the
 * stream — compares this number against the one it last saw and refreshes when it has moved. Failure
 * to bump it must never fail the user's save, so errors are swallowed: the live push is the primary
 * path and this is the safety net.
 */
async function bumpRevision(businessId: number): Promise<void> {
  try {
    await db
      .insert(businessRevisions)
      .values({ businessId, revision: 1 })
      .onConflictDoUpdate({
        target: businessRevisions.businessId,
        set: { revision: sql`${businessRevisions.revision} + 1`, updatedAt: sql`now()` },
      });
  } catch {
  }
}

/**
 * Make sure the counter table exists.
 *
 * The published app starts from a built bundle and never runs a schema push, so an already-deployed
 * database would not have this table and the catch-up path would silently do nothing — exactly the
 * failure this feature exists to prevent, and an invisible one.
 */
export async function ensureRevisionTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS business_revisions (
        business_id integer PRIMARY KEY REFERENCES businesses(id),
        revision bigint NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
  } catch (error) {
    console.warn("[live] change counter table unavailable:", (error as Error).message);
  }
}

/** Read the current change counter. Zero means nothing has changed since the server last started fresh. */
export async function getBusinessRevision(businessId: number): Promise<number> {
  const rows = await db
    .select({ revision: businessRevisions.revision })
    .from(businessRevisions)
    .where(sql`${businessRevisions.businessId} = ${businessId}`);
  return rows[0]?.revision ?? 0;
}

/**
 * Saving one stock card fires a whole run of separate writes — lots, bids, transactions — and each one
 * announces itself. Announcing all of them would make every other screen refetch everything a dozen
 * times over for a single save, so a burst is collapsed into one announcement.
 */
const COALESCE_MS = 400;
const pendingBroadcasts = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Tell every browser of this business that something changed.
 *
 * Stays synchronous for its callers — a route must never wait on, or fail because of, a notification.
 * The announcement follows a moment later, once the burst of writes behind it has settled.
 */
export function broadcastBusinessEvent(businessId: number, eventType: string = "data-changed"): void {
  const key = `${businessId}|${eventType}`;
  if (pendingBroadcasts.has(key)) return;
  pendingBroadcasts.set(key, setTimeout(() => {
    pendingBroadcasts.delete(key);
    // Counter first, then the announcement. A browser reacting to the announcement immediately asks
    // for the counter; reading a pre-bump value would leave it convinced it is already up to date and
    // then refresh a second time when the poll notices. That applies to the other server copies too,
    // so the notification also waits.
    void (async () => {
      await bumpRevision(businessId);
      deliverLocally(businessId, eventType);
      try {
        await pool.query("SELECT pg_notify($1, $2)", [
          CHANNEL,
          JSON.stringify({ businessId, eventType, from: INSTANCE_ID }),
        ]);
      } catch {
      }
    })();
  }, COALESCE_MS));
}

/**
 * Listen for changes announced by the other server copies.
 *
 * Uses its own connection rather than one from the pool: a listening connection is held open for the
 * lifetime of the process, and borrowing a pooled connection for that would quietly starve the pool.
 * If the connection drops it is rebuilt with a backoff, because a listener that dies silently would
 * put us straight back to the original bug with no visible symptom.
 */
export function startBusinessEventListener(): void {
  let attempt = 0;
  let client: pg.Client | null = null;

  const connect = async () => {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", msg => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        const { businessId, eventType, from } = JSON.parse(msg.payload);
        // Our own change was already pushed to our browsers; delivering the echo too would make every
        // screen refetch twice for one save.
        if (from === INSTANCE_ID) return;
        if (typeof businessId === "number") deliverLocally(businessId, eventType || "data-changed");
      } catch {
      }
    });
    client.on("error", () => { void reconnect(); });
    client.on("end", () => { void reconnect(); });
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    attempt = 0;
  };

  let reconnecting = false;
  const reconnect = async () => {
    if (reconnecting) return;
    reconnecting = true;
    try { await client?.end(); } catch {}
    client = null;
    const delay = Math.min(30_000, 1000 * 2 ** attempt++);
    setTimeout(() => {
      reconnecting = false;
      connect().catch(() => { void reconnect(); });
    }, delay);
  };

  connect().catch(() => { void reconnect(); });
}

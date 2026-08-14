/**
 * Payment-aware edit guards reject with a machine-readable `code` plus the values that appear
 * inside the sentence, so the message can be rebuilt in the user's language instead of showing
 * the server's English text. Anything without a recognised code falls back to `err.message`.
 */

const GUARD_CODE_KEYS: Record<string, string> = {
  GUARD_LOT_FARMER_CHANGE: "guard.farmerChange",
  GUARD_LOT_VEHICLE: "guard.vehicle",
  GUARD_BID_BUYER_CHANGE: "guard.buyerChange",
  GUARD_CORE: "guard.core",
  GUARD_FARMER_EXTRAS: "guard.farmerExtras",
  GUARD_BUYER_EXTRAS: "guard.buyerExtras",
  // Delete and archive blocks. Unlike the edit guards above they are not party-scoped — any
  // un-reversed payment blocks them — but they still name whoever actually paid.
  GUARD_ARCHIVE_LOT: "guard.archiveLot",
  GUARD_ARCHIVE_LOTS: "guard.archiveLots",
  GUARD_ARCHIVE_FARMER: "guard.archiveFarmer",
  GUARD_DELETE_BID: "guard.deleteBid",
  GUARD_DELETE_LOT: "guard.deleteLot",
  GUARD_PAYMENT_BLOCKED: "guard.paymentBlocked",
};

const PARTY_PHRASE_KEYS: Record<string, string> = {
  farmer: "guard.partiesFarmer",
  buyer: "guard.partiesBuyer",
  both: "guard.partiesBoth",
};

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export function translateApiError(err: unknown, t: Translate): string {
  const e = err as { code?: string; params?: Record<string, string | number>; message?: string } | null;
  const fallback = e?.message ?? String(err);
  const key = e?.code ? GUARD_CODE_KEYS[e.code] : undefined;
  if (!key) return fallback;

  const params: Record<string, string | number> = { ...(e?.params ?? {}) };
  const parties = typeof params.parties === "string" ? params.parties : undefined;
  if (parties && PARTY_PHRASE_KEYS[parties]) {
    // A farmer payment is the harder one to reverse, so it wins when both parties have paid.
    params.how = t(parties === "buyer" ? "guard.reverseBuyer" : "guard.reverseFarmer");
    params.parties = t(PARTY_PHRASE_KEYS[parties]);
  }
  return t(key, params);
}

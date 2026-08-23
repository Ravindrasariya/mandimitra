/**
 * Deciding whether a stock card is genuinely unsaved.
 *
 * Two people work the same register at once, so a card on screen is compared, constantly, against the
 * last thing the server said. That comparison has to ignore everything that is not the user's own
 * data: browser-only reference numbers regenerated on every refresh, list order, view flags, and the
 * payment and charge figures the server maintains by itself. Anything less and a card nobody touched
 * starts claiming it has unsaved changes.
 */

import type { BidRow, CropGroup, FarmerCard, LotRow } from "@/pages/stock";

/**
 * Two answers from the server can carry the same figure in different shapes — a rate as a number one
 * time and as text the next, a field absent one time and blank the next — so every value is flattened
 * to a comparable form before anything is compared. Otherwise an untouched card looks edited.
 */
export function normaliseValue(v: any): any {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(normaliseValue);
  if (typeof v === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(v).sort()) out[k] = normaliseValue(v[k]);
    return out;
  }
  return String(v);
}

export function getDataFingerprint(card: FarmerCard): string {
  // Payment status, paid amounts and the charge/total figures frozen at save time all belong to the
  // server and cannot be edited here, so they must never make a card look edited.
  const stripBid = ({
    id, bidDbId, buyerId, txnDbId, bidOpen, txn,
    paymentStatus, farmerPaymentStatus, paidAmount, farmerPaidAmount,
    savedCharges, savedBuyerReceivable, savedFarmerPayable,
    savedAadhatCharges, savedMuddatAnyaCharges, savedFreightCharges,
    ...b
  }: BidRow) => ({
    ...b,
    bidDbId, buyerId, txnDbId,
    txn: (({ showWeightCalc, showExtraBreakdown, ...t }) => t)(txn),
  });
  // Filtering the register rebuilds a card with its hidden crop groups moved to the end, so the order
  // of these lists carries no meaning and must not count as a change.
  const byContent = (items: any[]) =>
    items.map(normaliseValue).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const stripLot = ({ id, dbId, lotOpen, bids, ...l }: LotRow) => ({ ...l, bids: byContent(bids.map(stripBid)) });
  // The group's id is a browser-only reference, freshly generated every time cards are rebuilt from
  // the server, so comparing it would make an open card look edited after any background refresh.
  const stripGroup = ({ id, groupOpen, editHistory, persisted, lots, ...g }: CropGroup) => ({
    ...g, lots: byContent(lots.map(stripLot)),
  });
  const { cardOpen, farmerOpen, vehicleOpen, savedAt, farmerId, touched, cropGroups, ...rest } = card;
  return JSON.stringify(normaliseValue({ ...rest, cropGroups: byContent(cropGroups.map(stripGroup)) }));
}

/**
 * Archiving or reinstating takes effect on the server immediately, so the saved entry must follow it.
 * Only the archive flags are carried across: the live card can also hold edits this user has not saved
 * yet, and writing the whole card into the saved entry would make those edits look already saved and
 * let the next refresh throw them away.
 */
export function applyArchiveState(prev: FarmerCard | undefined, updated: FarmerCard): FarmerCard {
  if (!prev) return updated;
  const updatedGroups = new Map(updated.cropGroups.map(g => [g.id, g]));
  return {
    ...prev,
    archived: updated.archived,
    cropGroups: prev.cropGroups.map(g => {
      const u = updatedGroups.get(g.id);
      if (!u) return g;
      const updatedLots = new Map(u.lots.map(l => [l.id, l]));
      return {
        ...g,
        archived: u.archived,
        lots: g.lots.map(l => {
          const ul = updatedLots.get(l.id);
          return ul ? { ...l, isArchived: ul.isArchived } : l;
        }),
      };
    }),
  };
}

/** A card is unsaved only when this user touched it and its values really differ from the saved entry. */
export function hasUnsavedEdits(card: FarmerCard, saved: FarmerCard | undefined | null): boolean {
  if (!saved) return false;
  if (!card.touched) return false;
  return getDataFingerprint(card) !== getDataFingerprint(saved);
}

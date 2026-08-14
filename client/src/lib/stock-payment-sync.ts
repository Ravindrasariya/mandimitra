/**
 * Keeping the stock page's Due badges honest while a card is open.
 *
 * The stock page loads its cards into local editable state exactly once, so that a card someone is
 * part-way through editing is never clobbered by a background refetch. Payment status is the one
 * thing that must still get through: it is server-owned, the user cannot edit it on this page, and
 * it changes underneath an open card whenever a payment is recorded — the Farmer Pay shortcut sits
 * on the stock page itself.
 *
 * These helpers copy across only the payment fields, matched by transaction id.
 */

import type { BidRow, FarmerCard } from "@/pages/stock";

/** The server-owned payment fields on a bid — recalculated whenever a payment is recorded. */
export type BidPaymentFields = Pick<BidRow, "paymentStatus" | "farmerPaymentStatus" | "paidAmount" | "farmerPaidAmount">;

/** Index the payment fields of every saved bid across a set of cards, by transaction id. */
export function collectBidPayments(cards: FarmerCard[]): Map<number, BidPaymentFields> {
  const byTxnId = new Map<number, BidPaymentFields>();
  for (const card of cards) {
    for (const g of card.cropGroups) {
      for (const l of g.lots) {
        for (const b of l.bids) {
          if (b.txnDbId == null) continue;
          byTxnId.set(b.txnDbId, {
            paymentStatus: b.paymentStatus,
            farmerPaymentStatus: b.farmerPaymentStatus,
            paidAmount: b.paidAmount,
            farmerPaidAmount: b.farmerPaidAmount,
          });
        }
      }
    }
  }
  return byTxnId;
}

/**
 * Copy fresh payment status onto a card's bids, leaving every other field exactly as the user left
 * it. Bids with no matching transaction id — unsaved ones — are left alone.
 *
 * Returns the card by identity when nothing differs, so callers can skip the state update. That
 * matters: this runs on every refetch, and the card state drives both re-renders and the draft
 * autosave, which decides whether a card counts as having unsaved edits.
 */
export function syncBidPayments(card: FarmerCard, fresh: Map<number, BidPaymentFields>): FarmerCard {
  let cardChanged = false;
  const cropGroups = card.cropGroups.map(g => {
    let groupChanged = false;
    const lots = g.lots.map(l => {
      let lotChanged = false;
      const bids = l.bids.map(b => {
        const f = b.txnDbId == null ? undefined : fresh.get(b.txnDbId);
        if (!f) return b;
        if (
          b.paymentStatus === f.paymentStatus &&
          b.farmerPaymentStatus === f.farmerPaymentStatus &&
          b.paidAmount === f.paidAmount &&
          b.farmerPaidAmount === f.farmerPaidAmount
        ) return b;
        lotChanged = true;
        return { ...b, ...f };
      });
      if (!lotChanged) return l;
      groupChanged = true;
      return { ...l, bids };
    });
    if (!groupChanged) return g;
    cardChanged = true;
    return { ...g, lots };
  });
  return cardChanged ? { ...card, cropGroups } : card;
}

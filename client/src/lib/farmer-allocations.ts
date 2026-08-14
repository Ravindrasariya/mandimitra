/**
 * Farmer payment allocations: the rows a user picks in the Cash tab when paying a farmer.
 *
 * The picked rows are persisted in the browser so a half-filled payment survives a reload, which
 * means they can outlive a change to how the server groups pending bills. Reconciliation below
 * re-anchors them to the current grouping.
 */

/** One outstanding bill, as returned by `GET /api/farmers/:id/pending-transactions`. */
export type FarmerPendingGroupRow = {
  groupKey: string;
  serialNumber: number;
  billBookNumber: number;
  /** The bill's stock register date — what the user looks up in the book, not a transaction date. */
  registerDate: string;
  numberOfBags: number;
  crops: string;
  totalPayableToFarmer: string;
  farmerPaidAmount: string;
  due: string;
  transactionIds: { id: number; due: number }[];
};

/**
 * A bill the user has selected to pay, held in persisted state.
 *
 * `date` holds the bill's stock register date. The key is left as `date` rather than renamed to
 * match the server, because renaming a persisted key blanks the date on allocations a user had
 * already picked before the change shipped.
 */
export type FarmerAllocation = {
  groupKey: string;
  txnLabel: string;
  serialNumber: number;
  billBookNumber: number;
  date: string;
  numberOfBags: number;
  crops: string;
  due: number;
  amount: string;
  transactionIds: { id: number; due: number }[];
};

export const PY_OPENING_KEY = "PY_OPENING";

export function farmerAllocationLabel(g: Pick<FarmerPendingGroupRow, "groupKey" | "billBookNumber" | "serialNumber">): string {
  return g.groupKey === PY_OPENING_KEY ? "PY Opening Balance" : `BB#${g.billBookNumber} SR#${g.serialNumber}`;
}

/** Build a fresh allocation for a bill the user just picked, pre-filled with the full due. */
export function allocationFromGroup(g: FarmerPendingGroupRow): FarmerAllocation {
  return {
    groupKey: g.groupKey,
    txnLabel: farmerAllocationLabel(g),
    serialNumber: g.serialNumber,
    billBookNumber: g.billBookNumber,
    date: g.registerDate,
    numberOfBags: g.numberOfBags,
    crops: g.crops,
    due: parseFloat(g.due),
    amount: g.due,
    transactionIds: g.transactionIds,
  };
}

const sameTxnIds = (a: { id: number; due: number }[], b: { id: number; due: number }[]) =>
  a.length === b.length && a.every((t, i) => t.id === b[i].id && t.due === b[i].due);

/**
 * Re-anchor persisted allocations onto the bills that are currently outstanding.
 *
 * Matching is by transaction id first, and only falls back to the group key for the opening-balance
 * row (which owns no transactions). Group keys are not stable across releases — they encode how
 * bills are grouped, and bills were previously split by transaction date rather than kept whole on
 * their stock register date — so a stale key must neither strand an allocation nor let the same
 * bill be offered for selection a second time.
 *
 * Returns `changed: false` when nothing needed rewriting, so the caller can skip a state update.
 */
export function reconcileFarmerAllocations(
  allocations: FarmerAllocation[],
  groups: FarmerPendingGroupRow[],
): { changed: boolean; next: FarmerAllocation[] } {
  const byTxnId = new Map<number, FarmerPendingGroupRow>();
  for (const g of groups) {
    for (const t of g.transactionIds) byTxnId.set(t.id, g);
  }
  const byKey = new Map(groups.map(g => [g.groupKey, g]));

  let changed = false;
  const merged = new Map<string, FarmerAllocation>();

  for (const a of allocations) {
    const g = a.transactionIds.map(t => byTxnId.get(t.id)).find(Boolean) ?? byKey.get(a.groupKey);
    if (!g) {
      // Bill is settled, reversed or archived — it is no longer payable.
      changed = true;
      continue;
    }

    const due = parseFloat(g.due);
    const previous = merged.get(g.groupKey);

    // Keep the amount the user typed exactly as typed. It is only rewritten when two stale rows
    // turn out to be one bill (combine what was entered rather than silently dropping half of it)
    // or when the bill's due has since shrunk below it.
    let amount = a.amount;
    if (previous) {
      const sum = parseFloat(previous.amount || "0") + parseFloat(a.amount || "0");
      amount = sum > 0 ? Math.min(sum, due).toFixed(2) : "";
    } else if (parseFloat(a.amount || "0") > due) {
      amount = due > 0 ? due.toFixed(2) : "";
    }

    const next: FarmerAllocation = {
      groupKey: g.groupKey,
      txnLabel: farmerAllocationLabel(g),
      serialNumber: g.serialNumber,
      billBookNumber: g.billBookNumber,
      date: g.registerDate,
      numberOfBags: g.numberOfBags,
      crops: g.crops,
      due,
      amount,
      transactionIds: g.transactionIds,
    };

    if (
      previous ||
      a.groupKey !== next.groupKey ||
      a.txnLabel !== next.txnLabel ||
      a.date !== next.date ||
      a.numberOfBags !== next.numberOfBags ||
      a.crops !== next.crops ||
      a.due !== next.due ||
      a.amount !== next.amount ||
      !sameTxnIds(a.transactionIds, next.transactionIds)
    ) {
      changed = true;
    }

    merged.set(g.groupKey, next);
  }

  return { changed, next: Array.from(merged.values()) };
}

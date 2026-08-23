/**
 * Outstanding labour (hammali), extra charges and vehicle bhada, for the summary strips.
 *
 * These three are paid out against a stock date — and, for bhada, a farmer and stock date — never
 * against one buyer or one crop. So a due can only be worked out for a whole day (or a whole farmer
 * card), and when a buyer or crop filter narrows the totals on screen the day's due is shown in the
 * same proportion as the part of that day still visible. That share is an estimate and must be
 * labelled as one; the unfiltered figure is exact.
 */

/** How much of a scope (a stock date, or a farmer's card) has already been paid out. */
export type PaidByScope = Map<string, number>;

export type ScopeDue = {
  /** Money still to be paid for what is currently on screen. Never negative. */
  due: number;
  /** True when a buyer or crop filter forced part of the figure to be a proportional share. */
  approximate: boolean;
};

/**
 * @param fullTotals   every scope's total charge, ignoring the buyer/crop filters
 * @param shownTotals  the same totals limited to what the screen is currently showing
 * @param paid         how much has been paid out per scope
 */
export function scopeDue(fullTotals: Map<string, number>, shownTotals: Map<string, number>, paid: PaidByScope): ScopeDue {
  let due = 0;
  let approximate = false;
  for (const [key, shown] of Array.from(shownTotals.entries())) {
    const full = fullTotals.get(key) ?? shown;
    if (full <= 0) continue;
    const scopeOwing = Math.max(0, full - (paid.get(key) || 0));
    if (scopeOwing <= 0) continue;
    const share = Math.min(1, Math.max(0, shown / full));
    due += scopeOwing * share;
    if (share < 0.999) approximate = true;
  }
  return { due, approximate };
}

export function addTo(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) || 0) + amount);
}

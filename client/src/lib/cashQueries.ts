import { queryClient } from "@/lib/queryClient";

/**
 * Invalidate every cache a cash entry can affect.
 *
 * A cash entry never updates just one figure: the server recalculates farmer/buyer payment
 * status, and dues, aggregates, dashboard tiles, stock cards and the books are all derived
 * from the same rows. Any screen that writes a cash entry must invalidate the identical set,
 * or two entry points drift and one of them leaves stale numbers on screen. Shared by the
 * Cash page and the Farmer Pay shortcut on the stock page so they cannot fall out of step.
 */
export function invalidateCashQueries() {
  queryClient.invalidateQueries({ refetchType: 'all', predicate: (query) => {
    const key = query.queryKey[0];
    return typeof key === "string" && key.startsWith("/api/cash-entries");
  }});
  queryClient.invalidateQueries({ refetchType: 'all', predicate: (query) => {
    const key = query.queryKey[0];
    return typeof key === "string" && key.startsWith("/api/buyers");
  }});
  queryClient.invalidateQueries({ refetchType: 'all', predicate: (query) => {
    const key = query.queryKey[0];
    return typeof key === "string" && key.startsWith("/api/farmers");
  }});
  queryClient.invalidateQueries({ refetchType: 'all', queryKey: ["/api/transactions"] });
  queryClient.invalidateQueries({ refetchType: 'all', queryKey: ["/api/transaction-aggregates"] });
  queryClient.invalidateQueries({ refetchType: 'all', queryKey: ["/api/hammali-breakdown"] });
  queryClient.invalidateQueries({ refetchType: 'all', queryKey: ["/api/bank-accounts"] });
  queryClient.invalidateQueries({ refetchType: 'all', queryKey: ["/api/dashboard"] });
  queryClient.invalidateQueries({ refetchType: 'all', queryKey: ["/api/stock-cards"] });
  queryClient.invalidateQueries({ refetchType: 'all', predicate: (query) => {
    const key = query.queryKey[0];
    return typeof key === "string" && (key.startsWith("/api/books/balance-sheet") || key.startsWith("/api/books/profit-and-loss"));
  }});
}

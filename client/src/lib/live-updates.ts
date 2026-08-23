import { queryClient } from "@/lib/queryClient";

/**
 * Keeping a browser's figures current while other people are working in the same business.
 *
 * The server pushes a "something changed" nudge over a long-lived connection. That connection is the
 * fast path, but it is also the fragile one: phones sleep, networks drop, proxies close idle streams.
 * Everything the app fetches is held indefinitely and is never re-fetched on its own, so a single
 * missed nudge used to leave a screen showing yesterday's figures until the user hard-refreshed.
 *
 * So the nudge is backed by three safety nets, each covering a case the others miss:
 *   - reconnect the stream, and refresh on every reconnect, because whatever happened while it was
 *     down was never announced;
 *   - refresh when the user returns to the tab or the device comes back online;
 *   - poll a single cheap counter, which is the only thing that still works if the stream is blocked
 *     outright by a network or proxy.
 */

/** How often the counter is checked while the tab is in front of the user. */
const POLL_MS = 25_000;

/** Longest wait between reconnection attempts. */
const MAX_BACKOFF_MS = 30_000;

/**
 * Refresh everything currently on screen, collapsing a burst into one pass.
 *
 * Several nudges can land within a moment of each other — a save that writes a card and its bills, or a
 * nudge arriving at the same time as the counter check notices it. Refetching every screen once per
 * nudge would make a busy day feel slow for no gain.
 */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function refreshAll() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    queryClient.invalidateQueries();
  }, 300);
}

/**
 * Start keeping this browser in step. Returns a function that tears everything down again — call it on
 * logout or when the signed-in business changes, or the old stream keeps feeding a different business's
 * changes into the cache.
 */
export function startLiveUpdates(): () => void {
  let stopped = false;
  let source: EventSource | null = null;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  // Undefined until the first successful read.
  let lastRevision: number | undefined;
  let everConnected = false;
  let checking = false;
  // The screens start loading at the same moment as this does, and the stream may not be up yet. A
  // change landing in that gap would be baked into the first counter reading and never noticed, so the
  // first reading refreshes as well as establishing the baseline.
  let baselineTaken = false;

  /**
   * Ask the server how many changes this business has seen, and refresh if the number moved.
   *
   * Cheap enough to run on a timer — one small row — and it is the fallback that works even when the
   * live stream never arrives at all.
   */
  const checkRevision = async (opts: { refreshAnyway?: boolean } = {}) => {
    if (stopped || checking) return;
    checking = true;
    try {
      const res = await fetch("/api/revision", { credentials: "include" });
      if (!res.ok) return;
      const { revision } = await res.json();
      if (typeof revision !== "number") return;
      const moved = lastRevision !== undefined && revision !== lastRevision;
      const first = !baselineTaken;
      baselineTaken = true;
      lastRevision = revision;
      if (moved || first || opts.refreshAnyway) refreshAll();
    } catch {
      // Offline or mid-restart. The next tick, or the reconnect, will catch up.
    } finally {
      checking = false;
    }
  };

  const connect = () => {
    if (stopped) return;
    const es = new EventSource("/api/events", { withCredentials: true });
    source = es;

    es.onopen = () => {
      const recovered = everConnected || attempt > 0;
      attempt = 0;
      everConnected = true;
      // Refresh whenever the stream comes up after having been down — including a first connection that
      // only succeeded after failed attempts, during which changes went unannounced.
      if (recovered) void checkRevision({ refreshAnyway: true });
    };

    es.onmessage = () => {
      refreshAll();
      // Keep the baseline in step, so the poll does not then report a phantom change.
      void checkRevision();
    };

    es.onerror = () => {
      // The browser retries by itself, but only while it believes the stream is recoverable, and it
      // never tells us to catch up. Taking over the retry keeps both the backoff and the catch-up in
      // our hands.
      es.close();
      if (source === es) source = null;
      if (stopped) return;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++);
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    void checkRevision();
    // A tab that was asleep may also be holding a stream the server has long since dropped.
    if (!source) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      attempt = 0;
      connect();
    }
  };

  const onOnline = () => {
    void checkRevision();
    if (!source) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      attempt = 0;
      connect();
    }
  };

  void checkRevision();
  connect();
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") void checkRevision();
  }, POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pollTimer) clearInterval(pollTimer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    source?.close();
    source = null;
  };
}

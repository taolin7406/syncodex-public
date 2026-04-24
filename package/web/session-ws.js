export function connectSessionSocket(sessionId, handlers) {
  const normalizedSessionId = String(sessionId || "").trim();
  let closed = false;
  let timerId = 0;
  let cursor = 0;
  let initialized = false;
  let retryDelayMs = 1500;

  function endpoint(params = {}) {
    const search = new URLSearchParams(params);
    const query = search.toString();
    return `/api/sessions/${encodeURIComponent(normalizedSessionId)}/events${query ? `?${query}` : ""}`;
  }

  function schedule(delayMs = 1500) {
    if (closed) {
      return;
    }
    timerId = window.setTimeout(poll, delayMs);
  }

  async function fetchEvents(params) {
    const response = await fetch(endpoint(params), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Session event polling failed: ${response.status}`);
    }
    return response.json();
  }

  async function poll() {
    if (closed || !normalizedSessionId) {
      return;
    }

    try {
      if (!initialized) {
        const data = await fetchEvents({ limit: "1" });
        const items = Array.isArray(data?.items) ? data.items : [];
        const latestSeq = Number(data?.afterCursor || items[items.length - 1]?.seq || 0);
        cursor = Number.isFinite(latestSeq) ? latestSeq : 0;
        initialized = true;
        handlers.onStateChange?.("polling");
      } else {
        const data = await fetchEvents(cursor > 0 ? { after: String(cursor) } : {});
        const items = Array.isArray(data?.items) ? data.items : [];
        items
          .slice()
          .sort((a, b) => Number(a?.seq || 0) - Number(b?.seq || 0))
          .forEach((event) => {
            const seq = Number(event?.seq || 0);
            if (Number.isFinite(seq) && seq > cursor) {
              cursor = seq;
            }
            handlers.onEvent?.(event);
          });
        handlers.onStateChange?.("polling");
      }
      retryDelayMs = 1500;
      schedule(retryDelayMs);
    } catch (error) {
      handlers.onError?.(error);
      handlers.onStateChange?.("reconnecting");
      retryDelayMs = Math.min(Math.round(retryDelayMs * 1.5), 10000);
      schedule(retryDelayMs);
    }
  }

  window.setTimeout(poll, 0);
  return {
    close() {
      closed = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    },
  };
}

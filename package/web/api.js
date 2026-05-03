const headers = {
  "Content-Type": "application/json",
};

const SEND_MESSAGE_TIMEOUT_MS = 75_000;
const GET_RETRY_DELAYS_MS = [350, 900];
const ATTACHMENT_UPLOAD_RETRY_DELAYS_MS = [700, 1600];

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isTransientFetchError(error) {
  return (
    error?.name === "TypeError" &&
    String(error?.message || "").toLowerCase().includes("failed to fetch")
  );
}

function isTransientRequestError(error) {
  return isTransientFetchError(error) || error?.code === "request_timeout";
}

function shouldRetryRequest(options, error, attempt, retryDelaysMs) {
  const method = String(options.method || "GET").toUpperCase();
  const delays = Array.isArray(retryDelaysMs) ? retryDelaysMs : method === "GET" ? GET_RETRY_DELAYS_MS : [];
  return attempt < delays.length && isTransientRequestError(error);
}

async function request(path, options = {}) {
  const { timeoutMs = 0, retryDelaysMs = null, ...fetchOptions } = options;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestOnce(path, { timeoutMs, ...fetchOptions });
    } catch (error) {
      const delays = Array.isArray(retryDelaysMs)
        ? retryDelaysMs
        : String(fetchOptions.method || "GET").toUpperCase() === "GET"
          ? GET_RETRY_DELAYS_MS
          : [];
      if (!shouldRetryRequest(fetchOptions, error, attempt, delays)) {
        throw error;
      }
      await sleep(delays[attempt]);
    }
  }
}

async function requestOnce(path, options = {}) {
  const { timeoutMs = 0, ...fetchOptions } = options;
  const controller =
    timeoutMs > 0 && typeof AbortController !== "undefined"
      ? new AbortController()
      : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : 0;
  let response;

  try {
    response = await fetch(path, {
      ...fetchOptions,
      signal: controller?.signal ?? fetchOptions.signal,
      headers: {
        ...headers,
        ...(fetchOptions.headers ?? {}),
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createApiError("request_timeout", "request_timeout");
    }
    throw error;
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }

  if (!response.ok) {
    const data = await safeJson(response);
    throw createApiError(
      data?.error || "request_failed",
      data?.message || data?.error || `Request failed: ${response.status}`,
      data,
    );
  }

  return safeJson(response);
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function createApiError(code, message, data = null) {
  const error = new Error(message || code || "request_failed");
  error.code = code || "request_failed";
  error.data = data;
  return error;
}

function assertMessageSent(result) {
  if (result?.status === "failed" || result?.ok === false) {
    const stderr = typeof result?.stderr === "string" ? result.stderr.trim() : "";
    const errorText = result?.error || result?.message || stderr || "send_failed";
    throw createApiError("send_failed", errorText, result);
  }
  return result;
}

export function getProjects() {
  return request("/api/projects");
}

export function createProject(payload) {
  return request("/api/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function browseProjectDirectories(pathValue = "") {
  const query = pathValue ? `?path=${encodeURIComponent(pathValue)}` : "";
  return request(`/api/projects/browse${query}`);
}

export function getSessions() {
  return request("/api/sessions");
}

export function createSession(payload) {
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function importCodexSession(payload) {
  return request("/api/sessions/import-codex", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSession(sessionId) {
  return request(`/api/sessions/${sessionId}`);
}

export function updateSession(sessionId, payload) {
  return request(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function syncImportedSession(sessionId) {
  return request(`/api/sessions/${sessionId}/sync`, {
    method: "POST",
  });
}

export function getSessionEvents(sessionId, options = 0) {
  const search = new URLSearchParams();

  if (typeof options === "number") {
    if (options > 0) {
      search.set("after", String(options));
    }
  } else if (options && typeof options === "object") {
    if (options.after) {
      search.set("after", String(options.after));
    }
    if (options.before) {
      search.set("before", String(options.before));
    }
    if (options.limit) {
      search.set("limit", String(options.limit));
    }
  }

  const query = search.toString();
  return request(`/api/sessions/${sessionId}/events${query ? `?${query}` : ""}`);
}

export function getSessionTimeline(sessionId, options = 0) {
  const search = new URLSearchParams();

  if (typeof options === "number") {
    if (options > 0) {
      search.set("after", String(options));
    }
  } else if (options && typeof options === "object") {
    if (options.after) {
      search.set("after", String(options.after));
    }
    if (options.before) {
      search.set("before", String(options.before));
    }
    if (options.limit) {
      search.set("limit", String(options.limit));
    }
  }

  const query = search.toString();
  return request(`/api/sessions/${sessionId}/timeline${query ? `?${query}` : ""}`);
}

export function getSessionTimelineEvents(sessionId, options = 0) {
  return getSessionTimeline(sessionId, options);
}

export function sendMessage(sessionId, payload) {
  return request(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: SEND_MESSAGE_TIMEOUT_MS,
  }).then(assertMessageSent);
}

export function getSessionQueue(sessionId) {
  return request(`/api/sessions/${sessionId}/queue`);
}

export function queueMessage(sessionId, payload) {
  return request(`/api/sessions/${sessionId}/queue`, {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: SEND_MESSAGE_TIMEOUT_MS,
  }).then(assertMessageSent);
}

export function steerMessage(sessionId, payload) {
  return request(`/api/sessions/${sessionId}/steer`, {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: SEND_MESSAGE_TIMEOUT_MS,
  }).then(assertMessageSent);
}

export function updateQueuedMessage(sessionId, itemId, payload) {
  return request(`/api/sessions/${sessionId}/queue/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    timeoutMs: SEND_MESSAGE_TIMEOUT_MS,
  }).then(assertMessageSent);
}

export function deleteQueuedMessage(sessionId, itemId) {
  return request(`/api/sessions/${sessionId}/queue/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    timeoutMs: SEND_MESSAGE_TIMEOUT_MS,
  }).then(assertMessageSent);
}

export function uploadSessionAttachments(sessionId, attachments) {
  return request(`/api/sessions/${sessionId}/attachments`, {
    method: "POST",
    body: JSON.stringify({ attachments }),
    timeoutMs: SEND_MESSAGE_TIMEOUT_MS,
    retryDelaysMs: ATTACHMENT_UPLOAD_RETRY_DELAYS_MS,
  });
}

export function deleteSessionAttachments(sessionId, attachments) {
  return request(`/api/sessions/${sessionId}/attachments`, {
    method: "DELETE",
    body: JSON.stringify({ attachments }),
    timeoutMs: SEND_MESSAGE_TIMEOUT_MS,
  });
}

export function createTtsAudio(text) {
  return request("/api/tts", {
    method: "POST",
    body: JSON.stringify({ text }),
    timeoutMs: SEND_MESSAGE_TIMEOUT_MS,
  });
}

export function stopSession(sessionId) {
  return request(`/api/sessions/${sessionId}/stop`, {
    method: "POST",
  });
}

export function resolveSessionApproval(sessionId, requestId, decision) {
  return request(`/api/sessions/${sessionId}/approvals/${encodeURIComponent(requestId)}`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export function retrySessionApproval(sessionId, requestId, payload = {}) {
  return request(`/api/sessions/${sessionId}/approvals/${encodeURIComponent(requestId)}/retry`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getHealth() {
  return request("/health");
}

export function getCodexUiOptions() {
  return request("/api/codex/mode");
}

export function getCodexStatus(params = {}) {
  const search = new URLSearchParams();
  if (params.sessionId) {
    search.set("sessionId", params.sessionId);
  }
  if (params.threadId) {
    search.set("threadId", params.threadId);
  }
  if (params.cwd) {
    search.set("cwd", params.cwd);
  }

  const query = search.toString();
  return request(`/api/codex/status${query ? `?${query}` : ""}`);
}

export function getCodexQuota(sessionId) {
  return request(`/api/codex/quota?sessionId=${encodeURIComponent(sessionId)}`);
}

export function getCodexHosts() {
  return request("/api/codex/hosts");
}

export function getImportableCodexSessions() {
  return request("/api/codex/importable-sessions");
}

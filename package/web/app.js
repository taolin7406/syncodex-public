import {
  browseProjectDirectories,
  createTtsAudio,
  createProject,
  importCodexSession,
  createSession,
  getCodexHosts,
  getImportableCodexSessions,
  getCodexQuota,
  getCodexUiOptions,
  getCodexStatus,
  getHealth,
  getProjects,
  getSession,
  getSessionEvents,
  getSessionTimelineEvents,
  getSessions,
  resolveSessionApproval,
  retrySessionApproval,
  sendMessage,
  stopSession,
  syncImportedSession,
  uploadSessionAttachments,
} from "./api.js";
import {
  CLIENT_FALLBACK_CODEX_UI_OPTIONS,
  adjustComposerHeight,
  bindComposerInputControls,
  buildCodexLaunchPayload,
  loadCodexLaunchPrefs,
  normalizeCodexLaunchAgainstUi,
  renderComposerInput,
} from "./components/composer.js";
import { renderSessionTopBar } from "./components/session-workbench.js";
import {
  normalizeRawSessionEvent,
  normalizeRawSessionEvents,
} from "./session-event-adapter.js";
import { renderRichText as renderMessageRichText } from "./message-rich-text.js";
import {
  formatInlineList,
  getCurrentLocale,
  getIntlLocale,
  listSupportedLocales,
  setCurrentLocale,
  t,
} from "./i18n/index.js";
import {
  buildTimelineView,
  createEmptyTimelineState,
  reduceTimeline,
  reduceTimelineBatch,
} from "./session-timeline-reducer.js";
import { renderTimeline, renderTimelineList } from "./session-timeline-renderer.js";
import { connectSessionSocket } from "./session-ws.js";

const app = document.querySelector("#app");
const SESSION_VIEW_STORAGE_KEY = "remote-agent-console.sessions.view";
const SESSION_DETAIL_CACHE_STORAGE_PREFIX = "remote-agent-console.sessionDetailCache.v1:";
const SESSION_DETAIL_CACHE_INDEX_STORAGE_KEY = "remote-agent-console.sessionDetailCache.index.v1";
const CODEX_QUOTA_CACHE_PREFIX = "remote-agent-console.codexQuota:";
const COMPOSER_DRAFT_STORAGE_PREFIX = "remote-agent-console.composerDraft:";
const MOBILE_SEND_QUEUE_STORAGE_KEY = "remote-agent-console.mobileSendQueue.v1";
const MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY = "remote-agent-console.mobileSendQueue.lock.v1";
const WORKSPACE_UI_STORAGE_KEY = "remote-agent-console.workspace.ui";
const WORKSPACE_UNREAD_STORAGE_KEY = "remote-agent-console.workspace.unread";
const COMPLETION_ALERT_STORAGE_KEY = "remote-agent-console.completionAlerts.v1";
const COMPLETION_ACTION_STORAGE_KEY = "remote-agent-console.completionActions.v1";
const COMPLETION_ACTION_MIGRATION_STORAGE_KEY = "remote-agent-console.completionActions.migrations.v1";
const COMPLETION_SPEECH_FLOAT_STORAGE_KEY = "remote-agent-console.completionSpeechFloat.v1";
const CREATE_SESSION_PREF_STORAGE_KEY = "remote-agent-console.createSessionPrefs.v1";
const TASK_PLAN_PANEL_STORAGE_KEY = "remote-agent-console.taskPlanPanel.v1";
const SLOW_COMMAND_SECONDS = 5;
const LONG_RUNNING_COMMAND_SECONDS = 10;
const COMMAND_PREVIEW_HEAD_LINES = 3;
const COMMAND_PREVIEW_TAIL_LINES = 2;
const COMMAND_PREVIEW_MATCH_CONTEXT_LINES = 1;
const COMMAND_RUNNING_PREVIEW_LINES = 3;
const COMMAND_COLLAPSED_SUMMARY_MAX = 120;
const COMMAND_EXPANDED_OUTPUT_MAX_LINES = 80;
const INITIAL_DETAIL_EVENT_PAGE_LIMIT = 200;
const INITIAL_DETAIL_MIN_TURNS = 4;
const INITIAL_DETAIL_MAX_PAGES = 5;
const SESSION_DETAIL_CACHE_MAX_SESSIONS = 12;
const SESSION_DETAIL_CACHE_MAX_RAW_EVENTS = 180;
const DETAIL_RENDER_BATCH_MS = 0;
const COMPLETION_NOTICE_MS = 9000;
const COMPLETION_ACTION_READ_MAX_CHARS = 1200;
const COMPLETION_ACTION_READ_SUMMARY_MAX_CHARS = 200;
const COMPLETION_AUTO_CONTINUE_PROMPT = "\u81ea\u52a8\u4e0b\u4e00\u6b65";
const COMPLETION_MANUAL_CONTINUE_PROMPT = "\u7ee7\u7eed\u4e0b\u4e00\u6b65";
const COMPLETION_SUMMARY_PROMPT =
  "\u8bf7\u7528\u7b80\u77ed\u4e2d\u6587\u603b\u7ed3\u521a\u624d\u5b8c\u6210\u7684\u5185\u5bb9\u3001\u4fee\u6539\u4e86\u54ea\u4e9b\u6587\u4ef6\u3001\u4e0b\u4e00\u6b65\u5efa\u8bae\u505a\u4ec0\u4e48\u3002";
const COMPOSER_ATTACHMENT_MAX_COUNT = 8;
const COMPOSER_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
const COMPOSER_ATTACHMENT_TOTAL_MAX_BYTES = 60 * 1024 * 1024;
const COMPOSER_SEND_DEDUPE_WINDOW_MS = 4000;
const MOBILE_SEND_QUEUE_LOCK_MS = 90_000;
const WORKSPACE_UNREAD_BADGE_MAX = 99;
const WORKSPACE_SESSIONS_REFRESH_MS = 10000;
const CLIENT_INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let lastToastMessage = "";
let lastToastAt = 0;
let completionAudioElement = null;
let lastCompletionAudioError = "";
let completionAudioUnavailableForCjk = false;
let messageCopyMenuListenersBound = false;
const MESSAGE_COPY_TAP_MAX_DURATION_MS = 260;
const MESSAGE_COPY_TAP_MAX_MOVE_PX = 10;
const MESSAGE_COPY_TAP_CLICK_WINDOW_MS = 700;
const MESSAGE_COPY_SELECTION_SUPPRESS_MS = 900;
let messageCopyTapCandidate = null;
let pendingMessageCopyTap = null;
let messageCopySelectionSuppressUntil = 0;
let composerSendGuard = {
  key: "",
  active: false,
  finishedAt: 0,
};

stripMobileAccessTokenFromAddressBar();

function stripMobileAccessTokenFromAddressBar() {
  if (typeof window === "undefined" || !window.history?.replaceState) {
    return;
  }
  try {
    const url = new URL(window.location.href);
    let changed = false;
    ["syncodex_token", "access", "token"].forEach((name) => {
      if (url.searchParams.has(name)) {
        url.searchParams.delete(name);
        changed = true;
      }
    });
    if (changed) {
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    /* ignore URL cleanup failures */
  }
}

function buildComposerSendGuardKey(sessionId, content, attachments = []) {
  const attachmentKey = attachments
    .map((item) => [item?.path || "", item?.name || "", item?.size || ""].join(":"))
    .join("|");
  return `${sessionId}\0${content}\0${attachmentKey}`;
}

function createClientMessageId(prefix = "msg") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${CLIENT_INSTANCE_ID}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function ensurePayloadClientMessageId(payload, prefix = "msg") {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const clientMessageId = String(source.clientMessageId || source.client_message_id || "").trim() || createClientMessageId(prefix);
  return {
    ...source,
    clientMessageId,
  };
}

function acquireComposerSendGuard(key) {
  const now = Date.now();
  if (
    composerSendGuard.key === key &&
    (composerSendGuard.active || now - composerSendGuard.finishedAt < COMPOSER_SEND_DEDUPE_WINDOW_MS)
  ) {
    return false;
  }

  composerSendGuard = {
    key,
    active: true,
    finishedAt: 0,
  };
  return true;
}

function releaseComposerSendGuard(key) {
  if (composerSendGuard.key !== key) {
    return;
  }
  composerSendGuard = {
    key,
    active: false,
    finishedAt: Date.now(),
  };
}

const GENERIC_SESSION_TITLES = new Set([
  "未命名会话",
  "新会话",
  "Untitled session",
  "New session",
]);
const DEFAULT_SESSIONS_VIEW = {
  keyword: "",
  status: "all",
  projectId: "all",
  thread: "all",
  sort: "activity_desc",
  page: 1,
  pageSize: 8,
};
const DEFAULT_DETAIL_VIEW = {
  filter: "all",
  severity: "all",
  search: "",
  autoScroll: true,
  rawStdoutBuckets: {},
};

function renderAppChrome({
  variant,
  title,
  subtitle,
  backHref,
  bodyHtml,
  routeClass = "",
}) {
  const nav = `<nav class="app-top-nav" aria-label="${escapeHtml(t("nav.sessions"))}">
    <a href="#/projects" class="app-nav-link">${escapeHtml(t("nav.projects"))}</a>
    <a href="#/sessions" class="app-nav-link">${escapeHtml(t("nav.sessions"))}</a>
  </nav>`;

  if (variant === "marketing") {
    return `
      <div class="route-stack">
        <header class="hero app-hero-marketing">
          <div>
            <p class="eyebrow">Syncodex</p>
            <h1>${escapeHtml(t("marketing.headline"))}</h1>
            <p class="hero-copy">
              ${escapeHtml(t("marketing.copy"))}
            </p>
          </div>
          ${nav}
        </header>
        ${bodyHtml}
      </div>
    `;
  }

  const titles =
    title || subtitle
      ? `<div class="app-header-titles">
          ${title ? `<h1 class="app-header-title">${escapeHtml(title)}</h1>` : ""}
          ${subtitle ? `<p class="app-header-sub">${escapeHtml(subtitle)}</p>` : ""}
        </div>`
      : "";

  return `
    <div class="route-stack route-stack--compact ${escapeHtml(routeClass)}">
      <header class="app-header-compact">
        ${
          backHref
            ? `<a href="${escapeHtml(backHref)}" class="app-back-link">${escapeHtml(t("generic.back"))}</a>`
            : ""
        }
        <div class="app-header-compact-main">
          ${titles}
          ${nav}
        </div>
      </header>
      ${bodyHtml}
    </div>
  `;
}

function isMobileWorkspaceViewport() {
  return window.matchMedia("(max-width: 759px)").matches;
}

function readWorkspaceUiState() {
  try {
    const raw = window.localStorage?.getItem(WORKSPACE_UI_STORAGE_KEY);
    if (!raw) {
      return { sidebarCollapsed: false, collapsedProjectIds: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      sidebarCollapsed: Boolean(parsed?.sidebarCollapsed),
      collapsedProjectIds: Array.isArray(parsed?.collapsedProjectIds)
        ? parsed.collapsedProjectIds.map((id) => String(id)).filter(Boolean)
        : [],
    };
  } catch {
    return { sidebarCollapsed: false, collapsedProjectIds: [] };
  }
}

function readWorkspaceUnreadState() {
  try {
    const raw = window.localStorage?.getItem(WORKSPACE_UNREAD_STORAGE_KEY);
    if (!raw) {
      return { readEventCounts: {} };
    }

    const parsed = JSON.parse(raw);
    const readEventCounts = {};
    const source =
      parsed && typeof parsed.readEventCounts === "object" && parsed.readEventCounts
        ? parsed.readEventCounts
        : {};
    Object.entries(source).forEach(([sessionId, value]) => {
      const normalizedSessionId = String(sessionId || "").trim();
      const count = Number(value || 0);
      if (normalizedSessionId && Number.isFinite(count) && count >= 0) {
        readEventCounts[normalizedSessionId] = Math.floor(count);
      }
    });
    return { readEventCounts };
  } catch {
    return { readEventCounts: {} };
  }
}

function readCompletionAlertPrefs() {
  try {
    const raw = window.localStorage?.getItem(COMPLETION_ALERT_STORAGE_KEY);
    if (!raw) {
      return { enabled: false, browser: false, vibration: false };
    }

    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed?.enabled),
      browser: Boolean(parsed?.browser),
      vibration: Boolean(parsed?.vibration),
    };
  } catch {
    return { enabled: false, browser: false, vibration: false };
  }
}

function defaultCompletionActionPrefs() {
  return {
    showMenu: true,
    autoRead: true,
    autoContinue: false,
    autoContinueMaxRuns: 3,
  };
}

function normalizeCompletionActionPrefs(value) {
  const base = defaultCompletionActionPrefs();
  const rawMax = Number(value?.autoContinueMaxRuns);
  const maxRuns = Number.isFinite(rawMax) ? Math.max(1, Math.min(20, Math.floor(rawMax))) : base.autoContinueMaxRuns;
  return {
    showMenu: value?.showMenu !== false,
    autoRead: Boolean(value?.autoRead),
    autoContinue: Boolean(value?.autoContinue),
    autoContinueMaxRuns: maxRuns,
  };
}

function normalizeCompletionActionThreadPrefs(value, fallback = null) {
  const merged = normalizeCompletionActionPrefs({
    ...(fallback || defaultCompletionActionPrefs()),
    ...(value && typeof value === "object" ? value : {}),
  });
  return {
    autoRead: merged.autoRead,
    autoContinue: merged.autoContinue,
    autoContinueMaxRuns: merged.autoContinueMaxRuns,
  };
}

function readCompletionActionState() {
  try {
    const raw = window.localStorage?.getItem(COMPLETION_ACTION_STORAGE_KEY);
    if (!raw) {
      return { prefs: defaultCompletionActionPrefs(), threadRuns: {} };
    }

    const parsed = JSON.parse(raw);
    const threadRuns =
      parsed?.threadRuns && typeof parsed.threadRuns === "object" && !Array.isArray(parsed.threadRuns)
        ? parsed.threadRuns
        : {};
    return {
      prefs: normalizeCompletionActionPrefs(parsed?.prefs || parsed),
      threadRuns,
    };
  } catch {
    return { prefs: defaultCompletionActionPrefs(), threadRuns: {} };
  }
}

function applyCompletionActionMigrations(value) {
  const nextValue = {
    prefs: normalizeCompletionActionPrefs(value?.prefs || value),
    threadRuns:
      value?.threadRuns && typeof value.threadRuns === "object" && !Array.isArray(value.threadRuns)
        ? value.threadRuns
        : {},
  };

  try {
    const raw = window.localStorage?.getItem(COMPLETION_ACTION_MIGRATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const autoReadEnabledOnce = Boolean(parsed?.autoReadEnabledOnce);
    if (!autoReadEnabledOnce && !nextValue.prefs.autoRead) {
      nextValue.prefs = {
        ...nextValue.prefs,
        autoRead: true,
      };
      window.localStorage?.setItem(
        COMPLETION_ACTION_STORAGE_KEY,
        JSON.stringify(nextValue),
      );
    }
    window.localStorage?.setItem(
      COMPLETION_ACTION_MIGRATION_STORAGE_KEY,
      JSON.stringify({
        ...(parsed && typeof parsed === "object" ? parsed : {}),
        autoReadEnabledOnce: true,
      }),
    );
  } catch {
    /* ignore migration persistence failures */
  }

  return nextValue;
}

function readCompletionSpeechFloatPosition() {
  try {
    const raw = window.localStorage?.getItem(COMPLETION_SPEECH_FLOAT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  } catch {
    return null;
  }
}

function writeCompletionSpeechFloatPosition(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  const nextPosition = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) };
  state.detail.speechFloatPosition = nextPosition;
  try {
    window.localStorage?.setItem(COMPLETION_SPEECH_FLOAT_STORAGE_KEY, JSON.stringify(nextPosition));
  } catch {
    /* ignore */
  }
}

function readTaskPlanPanelCollapsed() {
  try {
    return window.localStorage?.getItem(TASK_PLAN_PANEL_STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function writeTaskPlanPanelCollapsed(collapsed) {
  state.workspace.taskPlanCollapsed = Boolean(collapsed);
  try {
    window.localStorage?.setItem(
      TASK_PLAN_PANEL_STORAGE_KEY,
      collapsed ? "collapsed" : "expanded",
    );
  } catch {
    /* ignore */
  }
}

function writeCompletionActionState() {
  try {
    window.localStorage?.setItem(
      COMPLETION_ACTION_STORAGE_KEY,
      JSON.stringify(state.workspace.completionActions || { prefs: defaultCompletionActionPrefs(), threadRuns: {} }),
    );
  } catch {
    /* ignore */
  }
}

function getCompletionThreadRunEntry(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return {};
  }
  const rawEntry = state.workspace.completionActions?.threadRuns?.[normalizedSessionId];
  return rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry) ? rawEntry : {};
}

function getCompletionActionPrefsForSession(sessionId, fallbackPrefs = null) {
  const globalPrefs = normalizeCompletionActionPrefs(fallbackPrefs || state.workspace.completionActions?.prefs || {});
  const threadEntry = getCompletionThreadRunEntry(sessionId);
  const threadPrefs = normalizeCompletionActionThreadPrefs(threadEntry?.prefs || {}, globalPrefs);
  return {
    ...globalPrefs,
    ...threadPrefs,
    showMenu: globalPrefs.showMenu,
  };
}

function normalizeCreateSessionStartMode(value) {
  return value === "custom" ? "custom" : "project";
}

function readCreateSessionPrefs() {
  try {
    const raw = window.localStorage?.getItem(CREATE_SESSION_PREF_STORAGE_KEY);
    if (!raw) {
      return { startMode: "project", cwd: "", modelId: "", reasoningId: "" };
    }

    const parsed = JSON.parse(raw);
    return {
      startMode: normalizeCreateSessionStartMode(parsed?.startMode || parsed?.mode),
      cwd: typeof parsed?.cwd === "string" ? parsed.cwd : "",
      modelId: typeof parsed?.modelId === "string" ? parsed.modelId : "",
      reasoningId: typeof parsed?.reasoningId === "string" ? parsed.reasoningId : "",
    };
  } catch {
    return { startMode: "project", cwd: "", modelId: "", reasoningId: "" };
  }
}

function writeCreateSessionPrefsFromDialog() {
  const dialogState = state.workspace.createDialog;
  try {
    window.localStorage?.setItem(
      CREATE_SESSION_PREF_STORAGE_KEY,
      JSON.stringify({
        startMode: normalizeCreateSessionStartMode(dialogState.startMode),
        cwd: String(dialogState.customCwd || "").trim(),
        modelId: String(dialogState.modelId || "").trim(),
        reasoningId: String(dialogState.reasoningId || "").trim(),
      }),
    );
  } catch {
    /* ignore */
  }
}

function writeCompletionAlertPrefs() {
  try {
    window.localStorage?.setItem(
      COMPLETION_ALERT_STORAGE_KEY,
      JSON.stringify(state.workspace.completionAlerts || {}),
    );
  } catch {
    /* ignore */
  }
}

function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return window.Notification.permission || "default";
}

function canUseVibration() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function getComposerDraftStorageKey(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  return normalizedSessionId ? `${COMPOSER_DRAFT_STORAGE_PREFIX}${normalizedSessionId}` : "";
}

function readComposerDraft(sessionId) {
  const key = getComposerDraftStorageKey(sessionId);
  if (!key) {
    return "";
  }

  try {
    return String(window.localStorage?.getItem(key) || "");
  } catch {
    return "";
  }
}

function writeComposerDraft(sessionId, value) {
  const key = getComposerDraftStorageKey(sessionId);
  if (!key) {
    return;
  }

  try {
    const text = String(value || "");
    if (text) {
      window.localStorage?.setItem(key, text);
    } else {
      window.localStorage?.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

function clearComposerDraft(sessionId) {
  writeComposerDraft(sessionId, "");
}

function normalizeMobileQueuedItem(item) {
  const content = String(item?.content || item?.text || item?.payload?.content || "").trim();
  const attachments = Array.isArray(item?.attachments)
    ? item.attachments
    : Array.isArray(item?.payload?.attachments)
      ? item.payload.attachments
      : [];
  if (!content && attachments.length <= 0) {
    return null;
  }
  const payload =
    item?.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
      ? { ...item.payload, content }
      : { content };
  const clientMessageId =
    String(item?.clientMessageId || payload.clientMessageId || payload.client_message_id || "").trim() ||
    createClientMessageId("queue");
  payload.clientMessageId = clientMessageId;
  if (attachments.length > 0) {
    payload.attachments = attachments;
  }
  return {
    id: String(item?.id || `mobile-queue:${Date.now()}:${Math.random().toString(16).slice(2)}`),
    clientMessageId,
    origin: String(item?.origin || "syncodex_mobile").trim() || "syncodex_mobile",
    startsAutoContinueSequence: Boolean(item?.startsAutoContinueSequence),
    autoContinueMaxRuns: Math.max(0, Math.floor(Number(item?.autoContinueMaxRuns || 0))),
    content: content || attachments.map((attachment) => attachment.name || attachment.path || "attachment").join(", "),
    payload,
    createdAt: String(item?.createdAt || new Date().toISOString()),
  };
}

function readMobileSendQueueState() {
  try {
    const raw = window.localStorage?.getItem(MOBILE_SEND_QUEUE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    const queueBySession = {};
    Object.entries(source).forEach(([sessionId, value]) => {
      const normalizedSessionId = String(sessionId || "").trim();
      if (!normalizedSessionId || !Array.isArray(value)) {
        return;
      }
      const items = value.map(normalizeMobileQueuedItem).filter(Boolean);
      if (items.length > 0) {
        queueBySession[normalizedSessionId] = items;
      }
    });
    return queueBySession;
  } catch {
    return {};
  }
}

function writeMobileSendQueueState() {
  try {
    window.localStorage?.setItem(
      MOBILE_SEND_QUEUE_STORAGE_KEY,
      JSON.stringify(state.workspace.mobileSendQueue || {}),
    );
  } catch {
    /* ignore */
  }
}

function syncMobileSendQueueStateFromStorage() {
  state.workspace.mobileSendQueue = readMobileSendQueueState();
}

function tryAcquireMobileQueueFlushLock(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return "";
  }

  const now = Date.now();
  const owner = `${CLIENT_INSTANCE_ID}:${normalizedSessionId}:${now}`;
  try {
    const raw = window.localStorage?.getItem(MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY);
    const current = raw ? JSON.parse(raw) : null;
    if (
      current &&
      String(current.sessionId || "") === normalizedSessionId &&
      String(current.owner || "") !== owner &&
      Number(current.expiresAt || 0) > now
    ) {
      return "";
    }

    window.localStorage?.setItem(
      MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY,
      JSON.stringify({
        sessionId: normalizedSessionId,
        owner,
        expiresAt: now + MOBILE_SEND_QUEUE_LOCK_MS,
      }),
    );
    const storedRaw = window.localStorage?.getItem(MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY);
    const stored = storedRaw ? JSON.parse(storedRaw) : null;
    return String(stored?.owner || "") === owner ? owner : "";
  } catch {
    return owner;
  }
}

function releaseMobileQueueFlushLock(owner) {
  const normalizedOwner = String(owner || "").trim();
  if (!normalizedOwner) {
    return;
  }

  try {
    const raw = window.localStorage?.getItem(MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY);
    const current = raw ? JSON.parse(raw) : null;
    if (String(current?.owner || "") === normalizedOwner) {
      window.localStorage?.removeItem(MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function getMobileQueuedMessages(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return [];
  }
  const items = state.workspace.mobileSendQueue?.[normalizedSessionId];
  return Array.isArray(items) ? items : [];
}

function setMobileQueuedMessages(sessionId, items) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }
  const normalizedItems = (Array.isArray(items) ? items : []).map(normalizeMobileQueuedItem).filter(Boolean);
  state.workspace.mobileSendQueue = {
    ...(state.workspace.mobileSendQueue || {}),
  };
  if (normalizedItems.length > 0) {
    state.workspace.mobileSendQueue[normalizedSessionId] = normalizedItems;
  } else {
    delete state.workspace.mobileSendQueue[normalizedSessionId];
  }
  writeMobileSendQueueState();
}

function enqueueMobileMessage(sessionId, item, options = {}) {
  const queuedItem = normalizeMobileQueuedItem(item);
  if (!queuedItem) {
    return 0;
  }
  const nextItems = options.toFront
    ? [queuedItem, ...getMobileQueuedMessages(sessionId)]
    : [...getMobileQueuedMessages(sessionId), queuedItem];
  setMobileQueuedMessages(sessionId, nextItems);
  return nextItems.length;
}

function isAutoContinueQueuedItem(item) {
  return String(item?.origin || "").trim() === "syncodex_auto_continue";
}

function hasQueuedAutoContinueMessage(sessionId) {
  return getMobileQueuedMessages(sessionId).some(isAutoContinueQueuedItem);
}

function removeAutoContinueQueuedMessages(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return 0;
  }
  const items = getMobileQueuedMessages(normalizedSessionId);
  const nextItems = items.filter((item) => !isAutoContinueQueuedItem(item));
  const removedCount = items.length - nextItems.length;
  if (removedCount > 0) {
    setMobileQueuedMessages(normalizedSessionId, nextItems);
  }
  return removedCount;
}

function clearAllAutoContinueQueuedMessages() {
  const queueBySession = state.workspace.mobileSendQueue || {};
  let changed = false;
  const nextQueue = {};
  Object.entries(queueBySession).forEach(([sessionId, items]) => {
    const normalizedItems = (Array.isArray(items) ? items : []).filter((item) => !isAutoContinueQueuedItem(item));
    if (normalizedItems.length !== (Array.isArray(items) ? items.length : 0)) {
      changed = true;
    }
    if (normalizedItems.length > 0) {
      nextQueue[sessionId] = normalizedItems;
    }
  });
  if (!changed) {
    return 0;
  }
  state.workspace.mobileSendQueue = nextQueue;
  writeMobileSendQueueState();
  return 1;
}

function shiftMobileQueuedMessage(sessionId) {
  const items = getMobileQueuedMessages(sessionId);
  const [nextItem, ...remaining] = items;
  setMobileQueuedMessages(sessionId, remaining);
  return nextItem || null;
}

function removeMobileQueuedMessage(sessionId, itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId) {
    return false;
  }
  const items = getMobileQueuedMessages(sessionId);
  const nextItems = items.filter((item) => String(item?.id || "") !== normalizedItemId);
  if (nextItems.length === items.length) {
    return false;
  }
  setMobileQueuedMessages(sessionId, nextItems);
  return true;
}

function updateMobileQueuedMessage(sessionId, itemId, content) {
  const normalizedItemId = String(itemId || "").trim();
  const nextContent = String(content || "").trim();
  if (!normalizedItemId || !nextContent) {
    return false;
  }
  let changed = false;
  const nextItems = getMobileQueuedMessages(sessionId).map((item) => {
    if (String(item?.id || "") !== normalizedItemId) {
      return item;
    }
    const payload =
      item?.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
        ? { ...item.payload }
        : {};
    payload.content = nextContent;
    if ("text" in payload) {
      payload.text = nextContent;
    }
    if ("message" in payload) {
      payload.message = nextContent;
    }
    if ("prompt" in payload) {
      payload.prompt = nextContent;
    }
    changed = true;
    return {
      ...item,
      content: nextContent,
      payload,
    };
  });
  if (!changed) {
    return false;
  }
  setMobileQueuedMessages(sessionId, nextItems);
  return true;
}

function moveMobileQueuedMessageToFront(sessionId, itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId) {
    return false;
  }
  const items = getMobileQueuedMessages(sessionId);
  const index = items.findIndex((item) => String(item?.id || "") === normalizedItemId);
  if (index <= 0) {
    return false;
  }
  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.unshift(item);
  setMobileQueuedMessages(sessionId, nextItems);
  return true;
}

function getMobileQueueStatusText(sessionId) {
  const localCount = getMobileQueuedMessages(sessionId).length;
  const officialCount =
    state.detail.session?.sessionId === sessionId ? getOfficialQueuedMessages(state.detail.session).length : 0;
  if (officialCount > 0 && localCount > 0) {
    return t("composer.queueAfterOfficial", { official: officialCount, local: localCount });
  }
  if (officialCount > 0) {
    return t("composer.officialQueued", { count: officialCount });
  }
  if (localCount <= 0) {
    return "";
  }
  if (state.detail.mobileQueueSending) {
    return t("composer.queueSending", { count: localCount });
  }
  return t("composer.queued", { count: localCount });
}

function normalizeOfficialQueuedItem(item, index = 0) {
  const text = String(item?.text || item?.content || "").trim();
  if (!text) {
    return null;
  }
  return {
    id: String(item?.id || `official-queue:${index}`),
    origin: "official_codex",
    label: t("queue.originOfficial"),
    text,
    cwd: String(item?.cwd || ""),
    createdAt: String(item?.createdAt || ""),
    createdAtMs: Number(item?.createdAtMs || 0) || 0,
  };
}

function getOfficialQueuedMessages(session = state.detail.session) {
  const items = Array.isArray(session?.officialQueuedFollowUps)
    ? session.officialQueuedFollowUps
    : Array.isArray(session?.officialQueuedFollowUpsPreview)
      ? session.officialQueuedFollowUpsPreview
      : [];
  return items.map(normalizeOfficialQueuedItem).filter(Boolean);
}

function getOfficialQueueCount(session = state.detail.session) {
  const count = Number(session?.officialQueueCount ?? session?.officialQueuedFollowupCount ?? 0);
  if (Number.isFinite(count) && count > 0) {
    return count;
  }
  return getOfficialQueuedMessages(session).length;
}

function hasOfficialQueuedMessages(session = state.detail.session) {
  return getOfficialQueueCount(session) > 0;
}

function getUnifiedQueuedMessages(session = state.detail.session) {
  const sessionId = String(session?.sessionId || "").trim();
  const officialItems = getOfficialQueuedMessages(session).map((item) => ({
    ...item,
    origin: "official_codex",
    label: t("queue.originOfficial"),
  }));
  const localItems = getMobileQueuedMessages(sessionId).map((item, index) => ({
    id: item.id || `mobile-queue:${index}`,
    origin: item.origin === "syncodex_auto_continue" ? "syncodex_auto_continue" : "syncodex_mobile",
    label: item.origin === "syncodex_auto_continue" ? t("queue.originAutoContinue") : t("queue.originSyncodex"),
    text: item.content || "",
    cwd: "",
    createdAt: item.createdAt || "",
    createdAtMs: 0,
  }));
  return [...officialItems, ...localItems];
}

function formatAttachmentSize(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(value >= 10 * 1024 ? 0 : 1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function setForceComposerRender() {
  state.detail.forceComposerRender = true;
  state.detail.lastComposerHtml = "";
}

function clearComposerAttachments() {
  (state.detail.composerAttachments || []).forEach((item) => {
    if (item.previewUrl) {
      try {
        URL.revokeObjectURL(item.previewUrl);
      } catch {
        /* ignore */
      }
    }
  });
  state.detail.composerAttachments = [];
  state.detail.composerUploadingAttachments = false;
  setForceComposerRender();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function getImageExtensionFromMime(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return "jpg";
  }
  if (mime.includes("webp")) {
    return "webp";
  }
  if (mime.includes("gif")) {
    return "gif";
  }
  if (mime.includes("bmp")) {
    return "bmp";
  }
  if (mime.includes("svg")) {
    return "svg";
  }
  return "png";
}

function getPastedImageName(index, mimeType, source = "") {
  const pathName = (() => {
    try {
      const url = new URL(source, window.location.href);
      return decodeURIComponent(url.pathname.split("/").pop() || "");
    } catch {
      return "";
    }
  })();
  if (pathName && /\.[a-z0-9]{2,5}$/i.test(pathName)) {
    return pathName.slice(0, 120);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `pasted-image-${stamp}-${index}.${getImageExtensionFromMime(mimeType)}`;
}

function normalizeClipboardImageFile(file, index) {
  const mimeType = String(file?.type || "");
  if (!file || !mimeType.startsWith("image/")) {
    return null;
  }
  const name = String(file.name || "").trim() || getPastedImageName(index, mimeType);
  try {
    return new File([file], name, {
      type: mimeType,
      lastModified: file.lastModified || Date.now(),
    });
  } catch {
    return file;
  }
}

function getDirectClipboardImageFiles(clipboardData) {
  const files = [];
  const seen = new Set();
  Array.from(clipboardData?.items || []).forEach((item, index) => {
    if (item?.kind !== "file" || !String(item.type || "").startsWith("image/")) {
      return;
    }
    const file = item.getAsFile?.();
    const normalized = normalizeClipboardImageFile(file, index + 1);
    if (!normalized) {
      return;
    }
    const key = `${normalized.name}:${normalized.size}:${normalized.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      files.push(normalized);
    }
  });
  Array.from(clipboardData?.files || []).forEach((file, index) => {
    const normalized = normalizeClipboardImageFile(file, files.length + index + 1);
    if (!normalized) {
      return;
    }
    const key = `${normalized.name}:${normalized.size}:${normalized.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      files.push(normalized);
    }
  });
  return files;
}

function getClipboardHtmlImageSources(clipboardData) {
  const html = String(clipboardData?.getData?.("text/html") || "");
  if (!html || !html.includes("<img")) {
    return [];
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.querySelectorAll("img"))
    .map((img) => String(img.getAttribute("src") || "").trim())
    .filter((src) => src && !src.startsWith("blob:") && !src.startsWith("cid:"))
    .slice(0, COMPOSER_ATTACHMENT_MAX_COUNT);
}

async function readImageFileFromSource(src, index) {
  try {
    const response = await fetch(src, { credentials: "omit" });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    const mimeType = String(blob.type || response.headers.get("content-type") || "");
    if (!mimeType.startsWith("image/")) {
      return null;
    }
    return new File([blob], getPastedImageName(index, mimeType, src), {
      type: mimeType,
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

function getComposerAttachmentPayloads() {
  return (state.detail.composerAttachments || [])
    .filter((item) => item.status === "ready" && item.path)
    .map((item) => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      path: item.path,
      isImage: item.isImage,
    }));
}

function restoreComposerAttachmentsFromPayload(payload) {
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
  const restored = attachments
    .map((item) => {
      const path = String(item?.path || "").trim();
      if (!path) {
        return null;
      }
      return {
        id: String(item?.id || `attachment:${Date.now()}:${Math.random().toString(16).slice(2)}`),
        name: String(item?.name || path.split(/[\\/]/).pop() || "attachment"),
        mimeType: String(item?.mimeType || item?.type || ""),
        size: Number(item?.size || 0) || 0,
        path,
        isImage: Boolean(item?.isImage) || String(item?.mimeType || item?.type || "").startsWith("image/"),
        previewUrl: "",
        status: "ready",
      };
    })
    .filter(Boolean);
  if (!restored.length) {
    return;
  }

  const existing = state.detail.composerAttachments || [];
  const existingIds = new Set(existing.map((item) => String(item.id || "")));
  state.detail.composerAttachments = [
    ...existing,
    ...restored.filter((item) => !existingIds.has(String(item.id || ""))),
  ];
  state.detail.composerUploadingAttachments = state.detail.composerAttachments.some(
    (item) => item.status === "uploading",
  );
  setForceComposerRender();
}

function getComposerAttachmentStatusText() {
  const items = state.detail.composerAttachments || [];
  if (state.detail.composerUploadingAttachments || items.some((item) => item.status === "uploading")) {
    return t("composer.attachments.uploading");
  }
  if (items.some((item) => item.status === "failed")) {
    return t("composer.attachments.failed");
  }
  return "";
}

function hasFailedComposerAttachment() {
  return (state.detail.composerAttachments || []).some((item) => item.status === "failed");
}

function getComposerPlaceholderHint(session, options = {}) {
  if (!session || state.detail.composerSendError || hasFailedComposerAttachment()) {
    return "";
  }
  if (state.detail.composerStopping) {
    return t("composer.stopping");
  }
  const attachmentStatusText =
    typeof options.attachmentStatusText === "string"
      ? options.attachmentStatusText
      : getComposerAttachmentStatusText();
  if (attachmentStatusText) {
    return attachmentStatusText;
  }
  const queuedStatus =
    typeof options.queuedStatus === "string"
      ? options.queuedStatus
      : getMobileQueueStatusText(session.sessionId);
  if (queuedStatus) {
    return queuedStatus;
  }
  const currentBusy =
    typeof options.currentBusy === "boolean" ? options.currentBusy : isSessionLiveBusy(session);
  if (currentBusy && isMobileWorkspaceViewport()) {
    return t("composer.queueHint");
  }
  return "";
}

async function addComposerFiles(fileList, sessionId) {
  const files = Array.from(fileList || []);
  if (!files.length || !sessionId) {
    return;
  }

  const existing = state.detail.composerAttachments || [];
  if (existing.length + files.length > COMPOSER_ATTACHMENT_MAX_COUNT) {
    showToast(t("composer.attachments.tooMany", { count: COMPOSER_ATTACHMENT_MAX_COUNT }));
    return;
  }

  const existingBytes = existing.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const nextBytes = files.reduce((sum, file) => sum + file.size, existingBytes);
  if (nextBytes > COMPOSER_ATTACHMENT_TOTAL_MAX_BYTES) {
    showToast(t("composer.attachments.totalTooLarge"));
    return;
  }

  const validFiles = [];
  for (const file of files) {
    if (file.size > COMPOSER_ATTACHMENT_MAX_BYTES) {
      showToast(t("composer.attachments.tooLarge", { name: file.name }));
      continue;
    }
    validFiles.push(file);
  }
  if (!validFiles.length) {
    return;
  }

  const records = validFiles.map((file) => ({
    id: `attachment:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    name: file.name || "attachment",
    mimeType: file.type || "",
    size: file.size,
    isImage: String(file.type || "").startsWith("image/"),
    previewUrl: String(file.type || "").startsWith("image/") ? URL.createObjectURL(file) : "",
    status: "uploading",
    path: "",
  }));

  state.detail.composerAttachments = [...existing, ...records];
  state.detail.composerUploadingAttachments = true;
  setForceComposerRender();
  scheduleSessionDetailRender();

  try {
    const attachments = await Promise.all(
      validFiles.map(async (file, index) => ({
        id: records[index].id,
        name: file.name || records[index].name,
        mimeType: file.type || "",
        size: file.size,
        data: await fileToDataUrl(file),
      })),
    );
    const result = await uploadSessionAttachments(sessionId, attachments);
    const savedById = new Map((result.items || result.attachments || []).map((item) => [String(item.id), item]));
    state.detail.composerAttachments = (state.detail.composerAttachments || []).map((item) => {
      const saved = savedById.get(String(item.id));
      if (!saved) {
        return item.status === "uploading" ? { ...item, status: "failed" } : item;
      }
      return {
        ...item,
        name: saved.name || item.name,
        mimeType: saved.mimeType || item.mimeType,
        size: saved.size || item.size,
        path: saved.path || "",
        isImage: Boolean(saved.isImage) || item.isImage,
        status: "ready",
      };
    });
    showToast(t("composer.attachments.added", { count: records.length }));
  } catch (error) {
    state.detail.composerAttachments = (state.detail.composerAttachments || []).map((item) =>
      records.some((record) => record.id === item.id) ? { ...item, status: "failed" } : item,
    );
    showToast(messageOf(error));
  } finally {
    state.detail.composerUploadingAttachments = false;
    setForceComposerRender();
    scheduleSessionDetailRender();
  }
}

function removeComposerAttachment(attachmentId) {
  const id = String(attachmentId || "");
  const items = state.detail.composerAttachments || [];
  const removed = items.find((item) => item.id === id);
  if (removed?.previewUrl) {
    try {
      URL.revokeObjectURL(removed.previewUrl);
    } catch {
      /* ignore */
    }
  }
  state.detail.composerAttachments = items.filter((item) => item.id !== id);
  state.detail.composerUploadingAttachments = state.detail.composerAttachments.some(
    (item) => item.status === "uploading",
  );
  setForceComposerRender();
  scheduleSessionDetailRender();
}

async function handleComposerPasteImages(event, sessionId) {
  const clipboardData = event.clipboardData;
  if (!clipboardData || !sessionId) {
    return false;
  }

  const directFiles = getDirectClipboardImageFiles(clipboardData);
  if (directFiles.length > 0) {
    event.preventDefault();
    await addComposerFiles(directFiles, sessionId);
    return true;
  }

  const imageSources = getClipboardHtmlImageSources(clipboardData);
  if (!imageSources.length) {
    return false;
  }

  event.preventDefault();
  showToast(t("composer.attachments.pasting"));
  const fetchedFiles = (
    await Promise.all(imageSources.map((src, index) => readImageFileFromSource(src, index + 1)))
  ).filter(Boolean);
  if (!fetchedFiles.length) {
    showToast(t("composer.attachments.pasteFailed"));
    return true;
  }
  await addComposerFiles(fetchedFiles, sessionId);
  return true;
}

function writeWorkspaceUiState() {
  try {
    window.localStorage?.setItem(
      WORKSPACE_UI_STORAGE_KEY,
      JSON.stringify({
        sidebarCollapsed: Boolean(state.workspace.sidebarCollapsed),
        collapsedProjectIds: Array.from(state.workspace.collapsedProjectIds || []),
      }),
    );
  } catch {
    /* ignore */
  }
}

function writeWorkspaceUnreadState() {
  try {
    window.localStorage?.setItem(
      WORKSPACE_UNREAD_STORAGE_KEY,
      JSON.stringify({
        readEventCounts: state.workspace.readEventCounts || {},
      }),
    );
  } catch {
    /* ignore */
  }
}

function getCurrentPageHost() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  return typeof hostname === "string" ? hostname.trim() : "";
}

function applyDocumentLocale() {
  const locale = getCurrentLocale();
  document.documentElement.lang = locale;
  document.title = t("app.name");
}

function syncWorkspaceShellState() {
  const shell = document.querySelector(".workspace-shell");
  if (shell instanceof HTMLElement) {
    shell.classList.toggle("workspace-shell-collapsed", state.workspace.sidebarCollapsed);
  }

  const toggleButton = document.querySelector("#workspace-sidebar-toggle");
  if (toggleButton instanceof HTMLButtonElement) {
    toggleButton.setAttribute("aria-expanded", state.workspace.sidebarCollapsed ? "false" : "true");
    toggleButton.setAttribute(
      "aria-label",
      state.workspace.sidebarCollapsed ? t("workspace.openSidebar") : t("workspace.closeSidebar"),
    );
  }

  const overlay = document.querySelector("#workspace-sidebar-overlay");
  if (overlay instanceof HTMLElement) {
    overlay.classList.toggle("workspace-sidebar-overlay-visible", !state.workspace.sidebarCollapsed);
  }
}

function renderWorkspaceShell({ sidebarHtml = "", mainHtml = "" }) {
  return `
    <div class="workspace-shell ${state.workspace.sidebarCollapsed ? "workspace-shell-collapsed" : ""}">
      <div
        id="workspace-sidebar-overlay"
        class="workspace-sidebar-overlay ${state.workspace.sidebarCollapsed ? "" : "workspace-sidebar-overlay-visible"}"
      ></div>
      <aside id="workspace-sidebar" class="workspace-sidebar">
        ${sidebarHtml}
      </aside>
      <section class="workspace-main-frame">
        <div class="workspace-main-header">
          <button
            id="workspace-sidebar-toggle"
            type="button"
            class="workspace-sidebar-fab"
            aria-label="${escapeHtml(state.workspace.sidebarCollapsed ? t("workspace.openSidebar") : t("workspace.closeSidebar"))}"
            aria-expanded="${state.workspace.sidebarCollapsed ? "false" : "true"}"
            aria-controls="workspace-sidebar"
          >
            ☰
          </button>
        </div>
        <section id="workspace-main-slot" class="workspace-main-slot">
          ${mainHtml}
        </section>
      </section>
      <div id="workspace-modal-slot">
        ${renderWorkspaceModalSlot()}
      </div>
    </div>
  `;
}

function groupConversationTurns(items) {
  const turns = [];
  let current = null;

  const pushTurn = () => {
    if (current && (current.user || current.body.length > 0)) {
      turns.push(current);
    }
    current = null;
  };

  for (const item of items) {
    if (item.type === "user") {
      pushTurn();
      current = { user: item, body: [] };
    } else {
      if (!current) {
        current = { user: null, body: [] };
      }
      current.body.push(item);
    }
  }

  pushTurn();
  return turns;
}

function getTaskContainerElementId(taskKey) {
  return `task-${sanitizeDomIdSegment(taskKey || "unknown")}`;
}

// LEGACY: old task-block detail helpers are intentionally retained only as
// fallback utilities for side panels / incremental cleanup. The main session
// detail render path must stay on:
// rawEvents -> normalize -> reduce timeline -> buildTimelineView -> renderTimeline
// Do not reconnect these helpers to renderSessionDetail().
function groupEventTurns(events) {
  const turns = [];
  let current = null;

  const pushTurn = () => {
    if (current?.userEvent) {
      turns.push(current);
    }
    current = null;
  };

  events.forEach((event) => {
    if (event.type === "message.user") {
      pushTurn();
      current = { userEvent: event, events: [] };
      return;
    }

    if (!current) {
      return;
    }

    current.events.push(event);
  });

  pushTurn();
  return turns;
}

function buildTaskBlocks(events, options = {}) {
  const turns = groupEventTurns(events);
  const tasks = [];
  const lastUserTurnIndex = turns.reduce(
    (lastIndex, turn, index) => (turn.userEvent ? index : lastIndex),
    -1,
  );

  turns.forEach((turn, index) => {
    if (!turn.userEvent) {
      return;
    }

    if (!taskTurnMatchesOptions(turn, options)) {
      return;
    }

    tasks.push(
      buildTaskBlock(turn, {
        index: tasks.length,
        isLastTask: index === lastUserTurnIndex,
        sessionStatus: options.sessionStatus || "idle",
      }),
    );
  });

  return tasks;
}

function countUserTurns(events) {
  return events.reduce((count, event) => {
    const normalized = normalizeRawSessionEvent(event);
    return normalized?.kind === "user_message" ? count + 1 : count;
  }, 0);
}

function getLatestUserTaskKey(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "message.user" && event.id) {
      return `task:${event.id}`;
    }
  }

  return "";
}

async function loadInitialSessionEvents(sessionId) {
  const firstPage = await getSessionTimelineEvents(sessionId, {
    limit: INITIAL_DETAIL_EVENT_PAGE_LIMIT,
  });
  let items = Array.isArray(firstPage.items) ? [...firstPage.items] : [];
  let beforeCursor = firstPage.beforeCursor || 0;
  let hasMoreBefore = Boolean(firstPage.hasMoreBefore);
  let pagesLoaded = 1;

  while (
    hasMoreBefore &&
    beforeCursor > 1 &&
    countUserTurns(items) < INITIAL_DETAIL_MIN_TURNS &&
    pagesLoaded < INITIAL_DETAIL_MAX_PAGES
  ) {
    const nextPage = await getSessionTimelineEvents(sessionId, {
      before: beforeCursor,
      limit: INITIAL_DETAIL_EVENT_PAGE_LIMIT,
    });

    if (!Array.isArray(nextPage.items) || nextPage.items.length === 0) {
      hasMoreBefore = false;
      break;
    }

    items = [...nextPage.items, ...items];
    beforeCursor = nextPage.beforeCursor || beforeCursor;
    hasMoreBefore = Boolean(nextPage.hasMoreBefore);
    pagesLoaded += 1;
  }

  return {
    items,
    nextCursor: firstPage.nextCursor || 0,
    beforeCursor,
    hasMoreBefore,
    lastSeq: firstPage.lastSeq || firstPage.nextCursor || 0,
  };
}

function buildTimelineStateFromRawEvents(rawEvents) {
  const timelineState = createEmptyTimelineState();
  reduceTimelineBatch(timelineState, normalizeRawSessionEvents(rawEvents));
  return timelineState;
}

function replaceDetailTimelineRawEvents(rawEvents) {
  state.detail.rawEvents = [...rawEvents].sort((a, b) => (a.seq || 0) - (b.seq || 0));
  state.detail.timelineState = buildTimelineStateFromRawEvents(state.detail.rawEvents);
  state.detail.timelineItems = buildTimelineView(state.detail.timelineState);
  syncSessionRuntimeFromTimeline();
  maybeClearOptimisticSendFromTimeline();
  schedulePersistActiveSessionDetailCache();
}

function clearOptimisticSend(options = {}) {
  const optimistic = state.detail.optimisticSend;
  if (!optimistic) {
    return;
  }

  const {
    restoreDraft = null,
    restoreSession = false,
    restoreTitle = false,
  } = options;

  state.detail.optimisticSend = null;

  if (restoreSession && state.detail.session) {
    state.detail.session.status = optimistic.previousStatus || "waiting_input";
    state.detail.session.liveBusy = Boolean(optimistic.previousLiveBusy);
    state.detail.session.updatedAt = optimistic.previousUpdatedAt || state.detail.session.updatedAt;
  }

  if (restoreTitle && optimistic.titleWasUpdated && state.detail.session) {
    state.detail.session.title = optimistic.previousTitle || "";
    state.sessions.items = state.sessions.items.map((item) =>
      item.sessionId === optimistic.sessionId ? { ...item, title: optimistic.previousTitle || "" } : item,
    );
  }

  if (typeof restoreDraft === "string") {
    state.detail.draft = restoreDraft;
    const composerTextarea = document.querySelector('textarea[name="content"]');
    if (composerTextarea instanceof HTMLTextAreaElement) {
      composerTextarea.value = restoreDraft;
      adjustComposerHeight(composerTextarea);
      window.requestAnimationFrame(() => adjustComposerHeight(composerTextarea));
      composerTextarea.focus();
    }
  }
}

function maybeClearOptimisticSendFromTimeline() {
  const optimistic = state.detail.optimisticSend;
  if (!optimistic?.confirmed) {
    return;
  }

  const hasRealUser = state.detail.timelineItems.some((item) => isMatchingOptimisticUserItem(item, optimistic));
  if (hasRealUser) {
    state.detail.optimisticSend = null;
    return;
  }

  if (!state.detail.session?.liveBusy) {
    state.detail.optimisticSend = null;
    return;
  }

  const turnId = optimistic.turnId;
  if (!turnId) {
    return;
  }

  const hasFollowupItem = state.detail.timelineItems.some(
    (item) => item.turnId === turnId && item.type !== "user",
  );
  const turn = state.detail.timelineState?.turnsById?.[turnId] || null;

  if (
    hasFollowupItem ||
    turn?.status === "running" ||
    turn?.status === "completed" ||
    turn?.status === "failed" ||
    turn?.status === "aborted"
  ) {
    state.detail.optimisticSend = null;
  }
}

function normalizeTimelineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function timelineTextMatchesOptimistic(itemText, optimisticText) {
  if (!itemText || !optimisticText) {
    return false;
  }
  if (itemText === optimisticText) {
    return true;
  }
  if (itemText.startsWith(`${optimisticText} Syncodex attachments uploaded`)) {
    return true;
  }
  if (itemText.includes(optimisticText)) {
    const extraText = itemText.replace(optimisticText, "").trim();
    return !extraText || extraText.startsWith("Syncodex attachments uploaded");
  }
  return false;
}

function isMatchingOptimisticUserItem(item, optimistic) {
  if (!item || item.type !== "user" || !optimistic) {
    return false;
  }

  if (optimistic.turnId && item.turnId === optimistic.turnId) {
    return true;
  }

  const itemText = normalizeTimelineText(item.text);
  const optimisticText = normalizeTimelineText(optimistic.text);
  if (!timelineTextMatchesOptimistic(itemText, optimisticText)) {
    return false;
  }

  const itemMs = Date.parse(String(item.timestamp || ""));
  const optimisticMs = Date.parse(String(optimistic.createdAt || ""));
  if (!Number.isFinite(itemMs) || !Number.isFinite(optimisticMs)) {
    return true;
  }

  return Math.abs(itemMs - optimisticMs) <= 30000;
}

function getDisplayTimelineItems() {
  const optimistic = state.detail.optimisticSend;
  const items = state.detail.timelineItems.filter(
    (item) => !(item.synthetic && item.type === "reasoning" && item.status === "thinking"),
  );
  const session = state.detail.session;
  if (!optimistic) {
    if (!isSessionLiveBusy(session)) {
      return items;
    }

    const activeTurn = getActiveTimelineTurn(session);
    const lastSeq = Number(items[items.length - 1]?.seq || 0);
    const lastTimestamp =
      activeTurn?.startedAt ||
      session?.updatedAt ||
      items[items.length - 1]?.timestamp ||
      new Date().toISOString();
    const placeholderTurnId =
      activeTurn?.id ||
      items[items.length - 1]?.turnId ||
      `turn:thinking:${session?.sessionId || "detail"}`;

    return [
      ...items,
      {
        id: `thinking:${placeholderTurnId}`,
        type: "reasoning",
        turnId: placeholderTurnId,
        seq: lastSeq + 0.001,
        timestamp: lastTimestamp,
        status: "thinking",
        summary: t("timeline.thinking"),
        text: "",
        synthetic: true,
      },
    ];
  }

  const displayItems = [...items];
  const optimisticTurnId = optimistic.turnId || optimistic.tempTurnId;
  const optimisticTimestamp = optimistic.createdAt || new Date().toISOString();
  const hasRealUser = displayItems.some((item) => isMatchingOptimisticUserItem(item, optimistic));

  if (!hasRealUser) {
    const lastSeq = Number(displayItems[displayItems.length - 1]?.seq || 0);
    displayItems.push({
      id: optimistic.userItemId,
      type: "user",
      turnId: optimisticTurnId,
      seq: lastSeq + 0.001,
      timestamp: optimisticTimestamp,
      role: "user",
      text: optimistic.text,
      optimistic: true,
    });
  }

  const shouldShowThinking = Boolean(optimistic) || isSessionLiveBusy(session);
  if (shouldShowThinking) {
    const activeTurn = getActiveTimelineTurn(session);
    const lastSeq = Number(displayItems[displayItems.length - 1]?.seq || 0);
    const placeholderTurnId =
      activeTurn?.id ||
      optimisticTurnId ||
      displayItems[displayItems.length - 1]?.turnId ||
      `turn:thinking:${session?.sessionId || "detail"}`;
    displayItems.push({
      id: optimistic.thinkingItemId || `thinking:${placeholderTurnId}`,
      type: "reasoning",
      turnId: placeholderTurnId,
      seq: lastSeq + 0.001,
      timestamp:
        activeTurn?.startedAt ||
        session?.updatedAt ||
        optimisticTimestamp,
      status: "thinking",
      summary: t("timeline.thinking"),
      text: "",
      synthetic: true,
      optimistic: Boolean(optimistic),
    });
  }

  return displayItems;
}

function getPendingApprovalFromTimelineState(timelineState) {
  if (!timelineState || !timelineState.approvalsByRequestId) {
    return null;
  }
  const sessionId = String(state.detail.session?.sessionId || state.workspace.activeSessionId || "").trim();

  const pendingApproval = Object.values(timelineState.approvalsByRequestId)
    .filter(
      (item) =>
        item?.status === "pending" &&
        !isApprovalDismissed(sessionId, item?.requestId) &&
        !isApprovalSuppressed(sessionId, item?.requestId),
    )
    .sort((left, right) => Number(right?.seq || 0) - Number(left?.seq || 0))[0];

  if (!pendingApproval) {
    return null;
  }

  return {
    requestId: pendingApproval.requestId,
    callId: pendingApproval.callId || null,
    title: localizeApprovalTitle(pendingApproval.title),
    reason: pendingApproval.reason || "",
    command: pendingApproval.command || "",
    cwd: pendingApproval.cwd || "",
    resumable: pendingApproval.resumable !== false,
  };
}

function resolveDetailPendingApproval(session, timelineState) {
  const timelinePending = getPendingApprovalFromTimelineState(timelineState);
  const sessionPending = session?.pendingApproval || null;
  const liveBusy = session?.liveBusy === true;
  const sessionId = String(session?.sessionId || "").trim();
  const canResolve = liveBusy && sessionPending?.resumable !== false;

  if (!timelinePending) {
    return sessionPending &&
      !isApprovalDismissed(sessionId, sessionPending.requestId, sessionPending.callId) &&
      !isApprovalSuppressed(sessionId, sessionPending.requestId, sessionPending.callId)
      ? sessionPending
      : null;
  }

  return {
    ...timelinePending,
    ...(sessionPending && sessionPending.requestId === timelinePending.requestId ? sessionPending : {}),
    resumable: canResolve,
  };
}

function isApprovalSuppressed(sessionId, requestId, callId = "") {
  const suppressedSessionId = String(state.detail.resolvingApprovalSessionId || "").trim();
  const suppressedRequestId = String(state.detail.resolvingApprovalRequestId || "").trim();
  const suppressedCallId = String(state.detail.resolvingApprovalCallId || "").trim();
  const nextSessionId = String(sessionId || "").trim();
  const nextRequestId = String(requestId || "").trim();
  const nextCallId = String(callId || "").trim();

  if (!suppressedSessionId || !suppressedRequestId || !nextSessionId || !nextRequestId) {
    return false;
  }
  if (suppressedSessionId !== nextSessionId || suppressedRequestId !== nextRequestId) {
    return false;
  }
  if (suppressedCallId && nextCallId) {
    return suppressedCallId === nextCallId;
  }
  return true;
}

function getApprovalDismissalKey(sessionId, requestId) {
  return `${String(sessionId || "").trim()}:${String(requestId || "").trim()}`;
}

function isApprovalDismissed(sessionId, requestId) {
  const key = getApprovalDismissalKey(sessionId, requestId);
  if (!key || key === ":") {
    return false;
  }
  return Boolean(state.detail.dismissedApprovalKeys?.[key]);
}

function dismissApproval(sessionId, requestId) {
  const key = getApprovalDismissalKey(sessionId, requestId);
  if (!key || key === ":") {
    return;
  }
  state.detail.dismissedApprovalKeys = {
    ...(state.detail.dismissedApprovalKeys || {}),
    [key]: true,
  };
}

function isTerminalApprovalError(error) {
  const message = messageOf(error);
  return (
    message === "Approval request not found." ||
    message === "Approval request can no longer be resumed."
  );
}

function clearResolvingApprovalState() {
  state.detail.resolvingApprovalRequestId = "";
  state.detail.resolvingApprovalSessionId = "";
  state.detail.resolvingApprovalCallId = "";
}

function syncDetailPendingApproval(session = state.detail.session, timelineState = state.detail.timelineState) {
  state.detail.pendingApproval = resolveDetailPendingApproval(session, timelineState);

  const suppressedSessionId = String(state.detail.resolvingApprovalSessionId || "").trim();
  const suppressedRequestId = String(state.detail.resolvingApprovalRequestId || "").trim();
  if (!suppressedSessionId || !suppressedRequestId) {
    return state.detail.pendingApproval;
  }

  const sessionPending = session?.pendingApproval || null;
  const timelinePending = timelineState?.approvalsByRequestId
    ? Object.values(timelineState.approvalsByRequestId).some(
        (item) =>
          item?.status === "pending" &&
          !isApprovalDismissed(session?.sessionId, item?.requestId) &&
          isApprovalSuppressed(session?.sessionId, item?.requestId),
      )
    : false;
  const detailPending =
    state.detail.pendingApproval &&
    isApprovalSuppressed(
      session?.sessionId,
      state.detail.pendingApproval.requestId,
      state.detail.pendingApproval.callId,
    );
  const sessionStillPending =
    sessionPending &&
    !isApprovalDismissed(session?.sessionId, sessionPending.requestId, sessionPending.callId) &&
    isApprovalSuppressed(session?.sessionId, sessionPending.requestId, sessionPending.callId);

  if (!timelinePending && !detailPending && !sessionStillPending) {
    clearResolvingApprovalState();
  }

  return state.detail.pendingApproval;
}

function mergeDetailTimelineRawEvents(nextRawEvents, options = {}) {
  if (!Array.isArray(nextRawEvents) || nextRawEvents.length === 0) {
    return;
  }

  const activeSessionId = getActiveDetailSessionId();
  if (!activeSessionId) {
    return;
  }

  const filteredRawEvents = nextRawEvents.filter((rawEvent) => {
    const eventSessionId = String(rawEvent?.sessionId || rawEvent?.session_id || "").trim();
    return !eventSessionId || eventSessionId === activeSessionId;
  });

  if (filteredRawEvents.length === 0) {
    return;
  }

  const existingIds = new Set(state.detail.rawEvents.map((event) => event.id));
  const currentMaxSeq = state.detail.rawEvents.reduce(
    (maxSeq, event) => Math.max(maxSeq, Number(event?.seq || 0)),
    0,
  );
  const appended = [];
  let canApplyIncrementally = true;

  filteredRawEvents.forEach((rawEvent) => {
    if (!rawEvent?.id || existingIds.has(rawEvent.id)) {
      return;
    }

    existingIds.add(rawEvent.id);
    appended.push(rawEvent);
    if (Number(rawEvent.seq || 0) < currentMaxSeq) {
      canApplyIncrementally = false;
    }
  });

  if (appended.length === 0) {
    return;
  }

  const wasBusy = Object.prototype.hasOwnProperty.call(options, "wasBusy")
    ? Boolean(options.wasBusy)
    : isSessionLiveBusy(state.detail.session);
  const previousAssistantText = getLatestAssistantText();
  if (appended.some(isTurnStartRawEvent)) {
    state.detail.completionSpeechBaselineText = previousAssistantText;
    armCompletionNoticeForActiveSession();
  }
  state.detail.rawEvents = [...state.detail.rawEvents, ...appended].sort(
    (a, b) => (a.seq || 0) - (b.seq || 0),
  );

  if (!canApplyIncrementally) {
    state.detail.timelineState = buildTimelineStateFromRawEvents(state.detail.rawEvents);
    state.detail.timelineItems = buildTimelineView(state.detail.timelineState);
    syncSessionRuntimeFromTimeline();
    maybeClearOptimisticSendFromTimeline();
    syncDetailPendingApproval(state.detail.session, state.detail.timelineState);
    schedulePersistActiveSessionDetailCache();
    maybeShowCompletionNotice(appended, { wasBusy, previousAssistantText });
    maybeQueueAutoContinueFromCompletion(appended);
    void maybeFlushMobileSendQueue("timeline-rebuild");
    return;
  }

  const normalizedAppended = normalizeRawSessionEvents(appended);
  reduceTimelineBatch(state.detail.timelineState, normalizedAppended);
  state.detail.timelineItems = buildTimelineView(state.detail.timelineState);
  syncSessionRuntimeFromTimeline();
  maybeClearOptimisticSendFromTimeline();
  syncDetailPendingApproval(state.detail.session, state.detail.timelineState);
  schedulePersistActiveSessionDetailCache();
  maybeShowCompletionNotice(appended, { wasBusy, previousAssistantText });
  maybeQueueAutoContinueFromCompletion(appended);
  void maybeFlushMobileSendQueue("timeline-append");
}

function isTurnStartRawEvent(event) {
  const payloadType = String(event?.payload?.type || "");
  return event?.type === "turn.started" || payloadType === "task_started";
}

function isCompletionRawEvent(event) {
  const payloadType = String(event?.payload?.type || "");
  return event?.type === "turn.completed" || payloadType === "task_complete";
}

function getCompletionEventKey(event) {
  const sessionId = String(event?.sessionId || event?.session_id || getActiveDetailSessionId() || "").trim();
  const turnId =
    event?.turnId ||
    event?.turn_id ||
    event?.payload?.turn_id ||
    event?.payload?.turnId ||
    "";
  return `${sessionId}:${turnId || event?.id || event?.seq || Date.now()}`;
}

function getCompletionEventTurnId(event) {
  const explicitTurnId = String(
    event?.turnId || event?.turn_id || event?.payload?.turn_id || event?.payload?.turnId || "",
  ).trim();
  if (explicitTurnId) {
    return explicitTurnId;
  }
  return String(getLatestTimelineTurn()?.id || state.detail.timelineState?.activeTurnId || "").trim();
}

function markCompletionEventsSeen(events) {
  const nextSeen = { ...(state.detail.seenCompletionEventKeys || {}) };
  let changed = false;
  (Array.isArray(events) ? events : []).forEach((event) => {
    if (!isCompletionRawEvent(event)) {
      return;
    }
    const key = getCompletionEventKey(event);
    if (!key || nextSeen[key]) {
      return;
    }
    nextSeen[key] = true;
    changed = true;
  });
  if (changed) {
    state.detail.seenCompletionEventKeys = nextSeen;
  }
}

function armCompletionNoticeForActiveSession() {
  if (!state.detail.session?.sessionId) {
    return;
  }
  state.detail.completionNoticeArmed = true;
}

function disarmCompletionNoticeForActiveSession() {
  state.detail.completionNoticeArmed = false;
}

function maybeShowCompletionNotice(events, options = {}) {
  if (!state.detail.session) {
    markCompletionEventsSeen(events);
    return;
  }

  const completionEvents = (Array.isArray(events) ? events : []).filter(isCompletionRawEvent);
  if (completionEvents.length === 0) {
    return;
  }

  const shouldTrigger = Boolean(options.wasBusy) || Boolean(state.detail.completionNoticeArmed);
  if (!shouldTrigger) {
    markCompletionEventsSeen(events);
    return;
  }

  const event = completionEvents[completionEvents.length - 1];
  const key = getCompletionEventKey(event);
  if (!key || state.detail.seenCompletionEventKeys?.[key]) {
    return;
  }

  state.detail.seenCompletionEventKeys = {
    ...(state.detail.seenCompletionEventKeys || {}),
    [key]: true,
  };
  disarmCompletionNoticeForActiveSession();
  showCompletionNotice({
    key,
    sessionId: state.detail.session.sessionId,
    turnId: getCompletionEventTurnId(event),
    title: state.detail.session.title || t("workspace.session.untitled"),
    completedAt: event.timestamp || new Date().toISOString(),
    previousAssistantText:
      state.detail.completionSpeechBaselineText || options.previousAssistantText || "",
  });
}

function maybeQueueAutoContinueFromCompletion(events) {
  const sessionId = String(state.detail.session?.sessionId || "").trim();
  if (!sessionId) {
    return;
  }

  const prefs = getCompletionActionPrefsForSession(sessionId);
  if (!prefs.autoContinue) {
    return;
  }

  const completionEvents = (Array.isArray(events) ? events : []).filter(isCompletionRawEvent);
  if (completionEvents.length <= 0) {
    return;
  }

  const blockReason = getAutoContinueBlockReason();
  if (blockReason) {
    clearCompletionAutoContinueSequence(sessionId);
    return;
  }

  if (hasQueuedAutoContinueMessage(sessionId)) {
    return;
  }

  const remaining = getCompletionAutoContinueRemaining(sessionId);
  if (remaining <= 0) {
    return;
  }

  const event = completionEvents[completionEvents.length - 1];
  const completionKey = getCompletionEventKey(event);
  if (!completionKey || completionKey === getCompletionAutoContinueLastEventKey(sessionId)) {
    return;
  }

  const codex = buildCodexLaunchPayload(state.detail.codexLaunch, state.detail.codexUiOptions);
  const payload = ensurePayloadClientMessageId(
    codex ? { content: COMPLETION_AUTO_CONTINUE_PROMPT, codex } : { content: COMPLETION_AUTO_CONTINUE_PROMPT },
    "auto-continue",
  );
  enqueueMobileMessage(
    sessionId,
    {
      origin: "syncodex_auto_continue",
      content: COMPLETION_AUTO_CONTINUE_PROMPT,
      payload,
      createdAt: new Date().toISOString(),
    },
    { toFront: true },
  );
  setCompletionAutoContinueLastEventKey(sessionId, completionKey);
  if (state.detail.completionNotice?.sessionId === sessionId) {
    state.detail.completionNotice.actionStatus = t("completionActions.autoQueued");
  }
  scheduleSessionDetailRender();
  void maybeFlushMobileSendQueue("auto-continue-queued");
}

function showCompletionNotice(notice) {
  cleanupCompletionNoticeTimer();
  const key = String(notice?.key || Date.now());
  const noticeSessionId = notice?.sessionId || state.detail.session?.sessionId || "";
  const prefs = getCompletionActionPrefsForSession(noticeSessionId);
  state.detail.completionNotice = {
    key,
    sessionId: noticeSessionId,
    turnId: String(notice?.turnId || ""),
    title: notice?.title || t("workspace.session.untitled"),
    completedAt: notice?.completedAt || new Date().toISOString(),
    previousAssistantText: String(notice?.previousAssistantText || ""),
    expiresAt: prefs.showMenu ? 0 : Date.now() + COMPLETION_NOTICE_MS,
    actionStatus: "",
    autoContinueRuns: getCompletionAutoContinueRuns(noticeSessionId),
    autoContinueMaxRuns: prefs.autoContinueMaxRuns,
  };
  triggerCompletionExternalAlert(state.detail.completionNotice);
  runCompletionAutomaticActions(state.detail.completionNotice);
  if (!prefs.showMenu) {
    state.detail.completionNoticeTimerId = window.setTimeout(() => {
      if (state.detail.completionNotice?.key === key) {
        state.detail.completionNotice = null;
        state.detail.completionNoticeTimerId = 0;
        scheduleSessionDetailRender();
      }
    }, COMPLETION_NOTICE_MS);
  }
}

function getCompletionAutoContinueRuns(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return 0;
  }
  const runs = Number(state.workspace.completionActions?.threadRuns?.[normalizedSessionId]?.autoContinueRuns || 0);
  return Number.isFinite(runs) && runs > 0 ? Math.floor(runs) : 0;
}

function getCompletionAutoContinueRemaining(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return 0;
  }
  const remaining = Number(state.workspace.completionActions?.threadRuns?.[normalizedSessionId]?.autoContinueRemaining || 0);
  return Number.isFinite(remaining) && remaining > 0 ? Math.floor(remaining) : 0;
}

function getCompletionAutoContinueLastEventKey(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return "";
  }
  return String(state.workspace.completionActions?.threadRuns?.[normalizedSessionId]?.autoContinueLastEventKey || "");
}

function updateCompletionThreadRunState(sessionId, patch = {}) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }
  state.workspace.completionActions = {
    prefs: normalizeCompletionActionPrefs(state.workspace.completionActions?.prefs || {}),
    threadRuns: {
      ...(state.workspace.completionActions?.threadRuns || {}),
      [normalizedSessionId]: {
        ...(state.workspace.completionActions?.threadRuns?.[normalizedSessionId] || {}),
        ...patch,
      },
    },
  };
  writeCompletionActionState();
}

function setCompletionAutoContinueRuns(sessionId, runs) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }
  const nextRuns = Math.max(0, Math.floor(Number(runs || 0)));
  updateCompletionThreadRunState(normalizedSessionId, { autoContinueRuns: nextRuns });
}

function setCompletionAutoContinueRemaining(sessionId, remaining) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }
  const nextRemaining = Math.max(0, Math.floor(Number(remaining || 0)));
  updateCompletionThreadRunState(normalizedSessionId, { autoContinueRemaining: nextRemaining });
}

function setCompletionAutoContinueLastEventKey(sessionId, key) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }
  updateCompletionThreadRunState(normalizedSessionId, {
    autoContinueLastEventKey: String(key || ""),
  });
}

function resetCompletionAutoContinueSequence(sessionId, maxRuns = 0) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }
  const nextMaxRuns = Math.max(0, Math.floor(Number(maxRuns || 0)));
  removeAutoContinueQueuedMessages(normalizedSessionId);
  updateCompletionThreadRunState(normalizedSessionId, {
    autoContinueRuns: 0,
    autoContinueRemaining: nextMaxRuns,
    autoContinueLastEventKey: "",
  });
  if (state.detail.completionNotice?.sessionId === normalizedSessionId) {
    state.detail.completionNotice.autoContinueRuns = 0;
    state.detail.completionNotice.autoContinueMaxRuns =
      getCompletionActionPrefsForSession(normalizedSessionId).autoContinueMaxRuns;
  }
}

function clearCompletionAutoContinueSequence(sessionId) {
  resetCompletionAutoContinueSequence(sessionId, 0);
}

function clearAllCompletionAutoContinueSequences() {
  const threadRuns = state.workspace.completionActions?.threadRuns || {};
  const nextThreadRuns = Object.fromEntries(
    Object.entries(threadRuns).map(([sessionId, value]) => [
      sessionId,
      {
        ...(value && typeof value === "object" ? value : {}),
        autoContinueRuns: 0,
        autoContinueRemaining: 0,
        autoContinueLastEventKey: "",
      },
    ]),
  );
  state.workspace.completionActions = {
    prefs: normalizeCompletionActionPrefs(state.workspace.completionActions?.prefs || {}),
    threadRuns: nextThreadRuns,
  };
  writeCompletionActionState();
  clearAllAutoContinueQueuedMessages();
}

function getLatestAssistantText() {
  const items = Array.isArray(state.detail.timelineItems) ? state.detail.timelineItems : [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.type === "assistant_final") {
      const text = String(item.text || "").trim();
      if (text) {
        return text;
      }
    }
    if (item?.type === "assistant") {
      const text = (Array.isArray(item.events) ? item.events : [])
        .map((event) => event.content || "")
        .join("")
        .trim();
      if (text) {
        return text;
      }
    }
    if (item?.type === "task") {
      const text = String(item.task?.assistantMessage?.mainText || item.assistantMessage?.mainText || "").trim();
      if (text) {
        return text;
      }
    }
  }

  return String(state.detail.session?.lastAssistantContent || "").trim();
}

function getAssistantTextForTurn(turnId) {
  const normalizedTurnId = String(turnId || "").trim();
  if (!normalizedTurnId) {
    return "";
  }
  const timelineItems = Array.isArray(state.detail.timelineItems) ? state.detail.timelineItems : [];
  for (let index = timelineItems.length - 1; index >= 0; index -= 1) {
    const item = timelineItems[index];
    if (item?.turnId !== normalizedTurnId) {
      continue;
    }
    if (item?.type === "assistant_final") {
      const text = String(item.text || "").trim();
      if (text) {
        return text;
      }
    }
    if (item?.type === "task") {
      const text = String(item.task?.assistantMessage?.mainText || item.assistantMessage?.mainText || "").trim();
      if (text) {
        return text;
      }
    }
  }
  const timelineState = state.detail.timelineState;
  const turn = timelineState?.turnsById?.[normalizedTurnId] || null;
  const messages = Object.values(timelineState?.messagesById || {});
  const messageIds = Array.isArray(turn?.messageIds) ? turn.messageIds : [];
  const candidates = [
    turn?.finalMessageId,
    ...messageIds.slice().reverse(),
  ].filter(Boolean);
  for (const itemId of candidates) {
    const message = messages.find((item) => item?.id === itemId);
    if (message?.type === "assistant_final") {
      const text = String(message.text || "").trim();
      if (text) {
        return text;
      }
    }
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.turnId === normalizedTurnId && message?.type === "assistant_final") {
      const text = String(message.text || "").trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function normalizeCompletionSpeechText(sourceText) {
  return String(sourceText || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|\s)([-*]|\d+\.)\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompletionSpeechLine(sourceLine) {
  return String(sourceLine || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/g, "")
    .replace(/^\s*[-*+]\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCompletionSpeechOutline(sourceText, maxChars = COMPLETION_ACTION_READ_SUMMARY_MAX_CHARS) {
  const rawLines = String(sourceText || "")
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\r?\n/)
    .map((line) => normalizeCompletionSpeechLine(line))
    .filter(Boolean)
    .filter((line) => !/^[-=]{3,}$/.test(line));

  if (!rawLines.length) {
    return "";
  }

  const firstLine = rawLines[0];
  const numberedLines = rawLines.filter(
    (line, index) => index > 0 && /^[1-5]\s*[.)]\s*\S+/.test(line),
  );
  const selectedLines = [firstLine];

  for (const line of numberedLines) {
    if (!selectedLines.includes(line)) {
      selectedLines.push(line);
    }
  }

  let outline = "";
  for (const line of selectedLines) {
    const next = outline ? `${outline}, ${line}` : line;
    if (next.length > maxChars) {
      break;
    }
    outline = next;
  }
  return outline.trim();
}

function splitCompletionSpeechSentences(sourceText) {
  const text = normalizeCompletionSpeechText(sourceText);
  if (!text) {
    return [];
  }
  return text.match(/[^\u3002\uFF01\uFF1F\uFF1B!?]+[\u3002\uFF01\uFF1F\uFF1B!?]?/g) || [text];
}

function findCompletionSpeechDigest(sourceText, maxChars = COMPLETION_ACTION_READ_SUMMARY_MAX_CHARS) {
  const conclusionPatterns = {
    starts: [
      /^(?:\u5df2\u5b8c\u6210|\u5df2\u4fee\u590d|\u5df2\u66f4\u65b0|\u5df2\u5904\u7406|\u5df2\u5b9e\u73b0|\u5df2\u6dfb\u52a0|\u5df2\u89e3\u51b3|\u5df2\u540c\u6b65|\u5df2\u5207\u6362|\u5df2\u6539\u4e3a|\u5df2\u652f\u6301|\u5df2\u6062\u590d|\u5f53\u524d\u7ed3\u679c|\u5f53\u524d\u72b6\u6001|\u76ee\u524d\u7ed3\u679c|\u76ee\u524d\u72b6\u6001|\u672c\u8f6e\u7ed3\u679c|\u8fd9\u6b21\u7ed3\u679c|\u73b0\u5728\u7ed3\u679c|\u73b0\u5728\u72b6\u6001|\u4e00\u53e5\u8bdd\u603b\u7ed3|\u603b\u7ed3\u5c31\u662f\u4e00\u53e5\u8bdd|\u7b80\u5355\u603b\u7ed3|\u603b\u7ed3\u5982\u4e0b|\u6839\u56e0\u662f|\u539f\u56e0\u662f|\u5173\u952e\u662f|\u6838\u5fc3\u662f|\u7ed3\u8bba\u662f|\u95ee\u9898\u70b9\u662f)/,
      /^(?:\u6211(?:\u5df2\u7ecf|\u5df2)|\u8fd9\u6b21(?:\u5df2\u7ecf|\u5df2)?|\u5df2\u7ecf\u628a|\u8fd9\u8fb9\u5df2\u7ecf|\u6211\u8fd9\u8fb9\u5df2\u7ecf|\u6211\u521a\u521a\u5df2\u7ecf)/,
      /^(?:completed|fixed|updated|implemented|added|resolved|current result|current status|one-line summary|summary:|in short|root cause|key point|conclusion)/i,
      /^(?:i(?:'ve| have)|this round|this time|we(?:'ve| have))/i,
    ],
    contains: [
      /(?:\u5df2\u5b8c\u6210|\u5df2\u4fee\u590d|\u5df2\u66f4\u65b0|\u5df2\u5904\u7406|\u5df2\u89e3\u51b3|\u5df2\u6062\u590d|\u5df2\u652f\u6301|\u4e00\u53e5\u8bdd\u603b\u7ed3|\u6839\u56e0|\u539f\u56e0|\u95ee\u9898\u70b9|\u5173\u952e|\u6838\u5fc3|\u7ed3\u8bba)/,
      /(?:completed|fixed|updated|implemented|resolved|root cause|summary|conclusion)/i,
    ],
  };
  const resultPatterns = {
    starts: [
      /^(?:\u73b0\u5728|\u76ee\u524d|\u5f53\u524d|\u5df2\u7ecf|\u4e0d\u4f1a\u518d|\u4f1a\u81ea\u52a8|\u53ef\u4ee5|\u53ef\u76f4\u63a5|\u5df2\u6062\u590d|\u5df2\u5f00\u542f|\u5df2\u652f\u6301|\u5df2\u6062\u590d\u6b63\u5e38|\u9875\u9762\u5df2|\u624b\u673a\u7aef|\u8fd9\u6837|\u56e0\u6b64|\u73b0\u5728\u53ef\u4ee5|\u76ee\u524d\u53ef\u4ee5)/,
      /^(?:now|currently|it now|this now|can now|will now|restored|available|works|working|you can now)/i,
    ],
    contains: [
      /(?:\u73b0\u5728\u53ef\u4ee5|\u5df2\u6062\u590d|\u4e0d\u4f1a\u518d|\u5df2\u652f\u6301|\u53ef\u4ee5\u76f4\u63a5|\u624b\u673a\u7aef|\u9875\u9762\u5df2)/,
      /(?:can now|is now|restored|available|works|working)/i,
    ],
  };
  const verificationPatterns = {
    starts: [
      /^(?:\u5df2\u91cd\u65b0\u6253\u5305|\u5df2\u91cd\u542f|\u5df2\u542f\u52a8|\u5df2\u9a8c\u8bc1|\u6d4b\u8bd5\u901a\u8fc7|health \u6b63\u5e38|\/health|\u53ef\u5237\u65b0\u6d4b\u8bd5|\u53ef\u76f4\u63a5\u6d4b\u8bd5|\u53ef\u76f4\u63a5\u5237\u65b0)/i,
      /^(?:rebuilt|restarted|verified|tested|health|\/health|ready to test|can refresh)/i,
    ],
    contains: [
      /(?:\u5df2\u91cd\u65b0\u6253\u5305|\u5df2\u91cd\u542f|health \u6b63\u5e38|\/health|\u6d4b\u8bd5\u901a\u8fc7|\u53ef\u76f4\u63a5\u5237\u65b0)/i,
      /(?:rebuilt|restarted|verified|tested|health|can refresh)/i,
    ],
  };
  const nextStepPatterns = {
    starts: [
      /^(?:\u4e0b\u4e00\u6b65|\u540e\u9762|\u63a5\u4e0b\u6765|\u7ee7\u7eed|\u8fd8\u53ef\u4ee5|\u53ef\u4ee5\u7ee7\u7eed|\u540e\u7eed\u53ef\u4ee5|\u4e4b\u540e\u53ef\u4ee5|\u540e\u9762\u53ef\u4ee5|\u518d\u4e0b\u6765|\u4e0b\u4e00\u6b65\u53ef\u4ee5|\u6211\u4eec\u540e\u9762\u53ef\u4ee5|\u73b0\u5728\u53ef\u4ee5\u7ee7\u7eed)/,
      /^(?:next step|next we can|next,|you can next|we can next|after this|from here|continue with|can continue)/i,
    ],
    contains: [
      /(?:\u4e0b\u4e00\u6b65|\u540e\u7eed\u53ef\u4ee5|\u6211\u4eec\u540e\u9762\u53ef\u4ee5|\u73b0\u5728\u53ef\u4ee5\u7ee7\u7eed|\u63a5\u4e0b\u6765)/,
      /(?:next step|after this|from here|continue with|can continue)/i,
    ],
  };

  const rawLines = String(sourceText || "")
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\r?\n/)
    .map((line) => normalizeCompletionSpeechLine(line))
    .filter(Boolean)
    .filter((line) => {
      const sentenceBreaks = line.match(/[\u3002\uFF01\uFF1F\uFF1B!?]/g) || [];
      return sentenceBreaks.length <= 1;
    });
  const sentences = splitCompletionSpeechSentences(sourceText).map((sentence) => sentence.trim()).filter(Boolean);
  const candidates = [...sentences, ...rawLines].filter((item, index, array) => array.indexOf(item) === index);
  const selected = [];
  const normalizeDigestPart = (value) => String(value || "").trim().replace(/[\u3002\uFF01\uFF1F\uFF1B!?]+$/u, "");

  const pickBestMatch = (patternSet) => {
    let bestMatch = "";
    let bestScore = -1;

    candidates.forEach((candidate, index) => {
      if (selected.includes(candidate) || candidate.length > maxChars) {
        return;
      }

      const startsMatched = (patternSet?.starts || []).some((pattern) => pattern.test(candidate));
      const containsMatched = startsMatched || (patternSet?.contains || []).some((pattern) => pattern.test(candidate));
      if (!containsMatched) {
        return;
      }

      let score = startsMatched ? 120 : 80;
      if (candidate.length >= 12 && candidate.length <= 90) {
        score += 18;
      } else if (candidate.length <= 140) {
        score += 8;
      } else {
        score -= 12;
      }
      score -= Math.min(index, 16);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    });

    return bestMatch;
  };

  const addMatch = (patternSet) => {
    const match = pickBestMatch(patternSet);
    if (!match) {
      return;
    }
    const nextText = [...selected, match].map((item) => normalizeDigestPart(item)).join("\uFF1B");
    if (nextText.length <= maxChars) {
      selected.push(match);
    }
  };

  addMatch(conclusionPatterns);
  addMatch(resultPatterns);
  addMatch(verificationPatterns);
  addMatch(nextStepPatterns);

  return selected.map((item) => normalizeDigestPart(item)).join("\uFF1B");
}

function summarizeCompletionSpeechText(sourceText, maxChars = COMPLETION_ACTION_READ_SUMMARY_MAX_CHARS) {
  const digest = findCompletionSpeechDigest(sourceText, maxChars);
  if (digest) {
    return digest;
  }

  const outline = buildCompletionSpeechOutline(sourceText, maxChars);
  if (outline) {
    return outline;
  }

  const text = normalizeCompletionSpeechText(sourceText);
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }

  const sentences = splitCompletionSpeechSentences(text);
  let summary = "";
  for (const sentence of sentences) {
    const next = `${summary}${sentence}`.trim();
    if (!next) {
      continue;
    }
    if (next.length > maxChars) {
      break;
    }
    summary = next;
    if (summary.length >= Math.floor(maxChars * 0.7)) {
      break;
    }
  }
  if (summary) {
    return summary;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function formatReadableCompletionText(sourceText) {
  const text = summarizeCompletionSpeechText(sourceText);
  if (!text) {
    return "";
  }
  return text.length <= COMPLETION_ACTION_READ_MAX_CHARS
    ? text
    : text.slice(0, COMPLETION_ACTION_READ_MAX_CHARS);
}

function getReadableLatestAssistantTextIfChanged(previousAssistantText) {
  const latestText = getLatestAssistantText();
  if (!latestText) {
    return "";
  }
  if (normalizeCompletionSpeechText(latestText) === normalizeCompletionSpeechText(previousAssistantText)) {
    return "";
  }
  return formatReadableCompletionText(latestText);
}

function getReadableCompletionText({ turnId = "", allowFallback = true } = {}) {
  const turnText = getAssistantTextForTurn(turnId);
  const sourceText = turnText || (allowFallback ? getLatestAssistantText() : "");
  return formatReadableCompletionText(sourceText);
}

function isLatestPlanAllDone() {
  const plan = state.detail.timelineState?.latestPlan || state.detail.session?.latestPlan || null;
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  if (tasks.length === 0) {
    return false;
  }
  return tasks.every((item) => normalizePlanStatus(item.status) === "completed");
}

function getAutoContinueBlockReason() {
  const status = String(state.detail.session?.status || "").toLowerCase();
  if (status === "failed" || status === "error" || status === "aborted") {
    return t("completionActions.autoStoppedFailure");
  }
  if (state.detail.pendingApproval) {
    return t("completionActions.autoStoppedApproval");
  }
  if (isLatestPlanAllDone()) {
    return t("completionActions.autoStoppedPlanDone");
  }
  return "";
}

function getCompletionManualActionBlockReason() {
  if (state.detail.completionActionSending) {
    return t("completionActions.sending");
  }
  if (isSessionLiveBusy(state.detail.session)) {
    return t("completionActions.waitForIdle");
  }
  if (
    hasOfficialQueuedMessages(state.detail.session) ||
    getMobileQueuedMessages(state.detail.session?.sessionId).length > 0
  ) {
    return t("completionActions.waitForQueue");
  }
  return "";
}

async function sendCompletionActionMessage(content, source = "manual") {
  const sessionId = state.detail.session?.sessionId;
  const text = String(content || "").trim();
  if (!sessionId || !text || state.detail.completionActionSending) {
    return false;
  }
  if (source === "manual") {
    const blockReason = getCompletionManualActionBlockReason();
    if (blockReason) {
      if (state.detail.completionNotice) {
        state.detail.completionNotice.actionStatus = blockReason;
      }
      showToast(blockReason);
      scheduleSessionDetailRender();
      return false;
    }
  }

  const previousSessionState = state.detail.session
    ? {
        status: state.detail.session.status,
        liveBusy: state.detail.session.liveBusy,
        updatedAt: state.detail.session.updatedAt,
      }
    : null;
  state.detail.completionActionSending = true;
  if (state.detail.completionNotice) {
    state.detail.completionNotice.actionStatus = t("completionActions.sending");
  }
  scheduleSessionDetailRender();

  try {
    const codex = buildCodexLaunchPayload(state.detail.codexLaunch, state.detail.codexUiOptions);
    const payload = ensurePayloadClientMessageId(codex ? { content: text, codex } : { content: text }, "action");
    if (state.detail.session) {
      state.detail.session.status = "running";
      state.detail.session.liveBusy = true;
      state.detail.session.updatedAt = new Date().toISOString();
    }
    armCompletionNoticeForActiveSession();
    await sendMessage(sessionId, payload);
    await catchUpSessionEvents(sessionId, state.detail.cursor || 0).catch(() => null);
    if (state.detail.completionNotice) {
      state.detail.completionNotice.actionStatus = t("completionActions.sent");
    }
    scheduleSessionDetailRender();
    return true;
  } catch (error) {
    const errorMessage = messageOf(error);
    if (state.detail.session && previousSessionState) {
      state.detail.session.status = previousSessionState.status;
      state.detail.session.liveBusy = previousSessionState.liveBusy;
      state.detail.session.updatedAt = previousSessionState.updatedAt;
    }
    if (state.detail.completionNotice) {
      state.detail.completionNotice.actionStatus = errorMessage;
    }
    showToast(errorMessage);
    scheduleSessionDetailRender();
    return false;
  } finally {
    state.detail.completionActionSending = false;
    scheduleSessionDetailRender();
  }
}

function shouldHoldMobileMessageForQueue() {
  return (
    isMobileWorkspaceViewport() &&
    !state.detail.detailSyncing &&
    isSessionLiveBusy(state.detail.session) &&
    !state.detail.composerSending &&
    !state.detail.mobileQueueSending
  );
}

function queueMobileComposerMessage(sessionId, content, payload) {
  const prefs = getCompletionActionPrefsForSession(sessionId);
  const count = enqueueMobileMessage(sessionId, {
    content,
    payload,
    origin: "syncodex_mobile",
    startsAutoContinueSequence: prefs.autoContinue,
    autoContinueMaxRuns: prefs.autoContinue ? prefs.autoContinueMaxRuns : 0,
    createdAt: new Date().toISOString(),
  });
  state.detail.mobileQueueLastError = "";
  state.detail.draft = "";
  clearComposerDraft(sessionId);
  showToast(t("composer.queued", { count }));
  scheduleSessionDetailRender();
  return count;
}

async function maybeFlushMobileSendQueue(reason = "idle") {
  const session = state.detail.session;
  const sessionId = session?.sessionId || "";
  syncMobileSendQueueStateFromStorage();
  if (
    !sessionId ||
    state.detail.mobileQueueSending ||
    state.detail.composerSending ||
    state.detail.completionActionSending ||
    state.detail.pendingApproval ||
    hasOfficialQueuedMessages(session) ||
    isSessionLiveBusy(session)
  ) {
    return false;
  }

  const status = String(session?.status || "").toLowerCase();
  if (status === "failed" || status === "error" || status === "aborted") {
    return false;
  }

  const queueLockOwner = tryAcquireMobileQueueFlushLock(sessionId);
  if (!queueLockOwner) {
    return false;
  }

  let queuedItem = null;

  try {
    syncMobileSendQueueStateFromStorage();
    queuedItem = shiftMobileQueuedMessage(sessionId);
    if (!queuedItem) {
      return false;
    }

    state.detail.mobileQueueSending = true;
    state.detail.mobileQueueLastError = "";
    scheduleSessionDetailRender();

    if (state.detail.session?.sessionId === sessionId) {
      state.detail.session.status = "running";
      state.detail.session.liveBusy = true;
      state.detail.session.updatedAt = new Date().toISOString();
    }
    armCompletionNoticeForActiveSession();
    if (!isAutoContinueQueuedItem(queuedItem)) {
      resetCompletionAutoContinueSequence(
        sessionId,
        queuedItem.startsAutoContinueSequence ? queuedItem.autoContinueMaxRuns : 0,
      );
    }
    await sendMessage(sessionId, queuedItem.payload || { content: queuedItem.content });
    if (isAutoContinueQueuedItem(queuedItem)) {
      const nextRuns = getCompletionAutoContinueRuns(sessionId) + 1;
      const nextRemaining = Math.max(0, getCompletionAutoContinueRemaining(sessionId) - 1);
      setCompletionAutoContinueRuns(sessionId, nextRuns);
      setCompletionAutoContinueRemaining(sessionId, nextRemaining);
      if (state.detail.completionNotice?.sessionId === sessionId) {
        state.detail.completionNotice.autoContinueRuns = nextRuns;
        state.detail.completionNotice.autoContinueMaxRuns =
          getCompletionActionPrefsForSession(sessionId).autoContinueMaxRuns;
        state.detail.completionNotice.actionStatus = t("completionActions.autoSent");
      }
    }
    await catchUpSessionEvents(sessionId, state.detail.cursor || 0).catch(() => null);
    showToast(t("composer.queueSent"));
    state.detail.mobileQueueSending = false;
    scheduleSessionDetailRender();
    return true;
  } catch (error) {
    const errorMessage = messageOf(error);
    state.detail.mobileQueueSending = false;
    state.detail.mobileQueueLastError = errorMessage;
    if (isAutoContinueQueuedItem(queuedItem)) {
      enqueueMobileMessage(sessionId, queuedItem, { toFront: true });
      if (state.detail.completionNotice?.sessionId === sessionId) {
        state.detail.completionNotice.actionStatus = errorMessage;
      }
    } else {
      writeComposerDraft(sessionId, queuedItem.content);
      clearCompletionAutoContinueSequence(sessionId);
      if (state.detail.session?.sessionId === sessionId) {
        state.detail.draft = queuedItem.content;
        restoreComposerAttachmentsFromPayload(queuedItem.payload);
      }
    }
    showToast(errorMessage);
    scheduleSessionDetailRender();
    void resumeActiveSessionDetail(`mobile-queue-error:${reason}`);
    return false;
  } finally {
    releaseMobileQueueFlushLock(queueLockOwner);
  }
}

async function runCompletionAutomaticActions(notice) {
  const prefs = getCompletionActionPrefsForSession(notice?.sessionId || state.detail.session?.sessionId || "");
  if (!notice || notice.sessionId !== state.detail.session?.sessionId) {
    return;
  }

  if (prefs.autoRead) {
    const started = await speakCompletionResult({ automatic: true, notice });
    if (!started) {
      notice.actionStatus = t("completionActions.autoReadFailed");
      scheduleSessionDetailRender();
    }
  }
}

function triggerCompletionExternalAlert(notice) {
  const prefs = state.workspace.completionAlerts || {};
  if (!prefs.enabled || !notice) {
    return;
  }

  const title = t("completionNotice.title");
  const body = t("completionNotice.detail", { title: shortenText(notice.title, 80) });

  if (prefs.vibration && canUseVibration()) {
    try {
      navigator.vibrate([180, 80, 180]);
    } catch {
      /* ignore vibration failures */
    }
  }

  const shouldShowBrowserNotification =
    prefs.browser &&
    getNotificationPermission() === "granted" &&
    (document.visibilityState !== "visible" || !document.hasFocus());
  if (!shouldShowBrowserNotification) {
    return;
  }

  try {
    const notification = new window.Notification(title, {
      body,
      tag: `syncodex-completion:${notice.sessionId || ""}`,
      renotify: false,
      silent: false,
    });
    notification.onclick = () => {
      window.focus();
      if (notice.sessionId) {
        window.location.hash = buildSessionDetailHash(
          notice.sessionId,
          state.detail.filter,
          state.detail.severity,
          state.detail.search,
          state.detail.autoScroll,
        );
      }
      notification.close();
    };
  } catch {
    /* ignore notification failures */
  }
}

function clearCompletionAudioElement() {
  if (!completionAudioElement) {
    return;
  }
  try {
    completionAudioElement.pause();
    completionAudioElement.removeAttribute("src");
    completionAudioElement.load();
  } catch {
    /* ignore audio cleanup failures */
  }
  completionAudioElement = null;
}

function containsCjkText(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function pickCompletionSpeechVoice(text) {
  if (!isCompletionSpeechSupported()) {
    return null;
  }
  const synth = window.speechSynthesis;
  if (!synth || typeof synth.getVoices !== "function") {
    return null;
  }
  const voices = synth.getVoices() || [];
  if (!Array.isArray(voices) || voices.length <= 0) {
    return null;
  }
  const locale = String(getIntlLocale() || "").toLowerCase();
  const localePrefix = locale.split("-")[0] || "";
  const needsCjk = containsCjkText(text);
  if (locale) {
    const exact = voices.find((voice) => String(voice?.lang || "").toLowerCase() === locale);
    if (exact) {
      return exact;
    }
  }
  if (localePrefix) {
    const prefix = voices.find((voice) => String(voice?.lang || "").toLowerCase().startsWith(`${localePrefix}-`));
    if (prefix) {
      return prefix;
    }
  }
  if (needsCjk) {
    const zhVoice = voices.find((voice) => String(voice?.lang || "").toLowerCase().startsWith("zh"));
    if (zhVoice) {
      return zhVoice;
    }
  }
  return voices[0] || null;
}

function resetCompletionSpeechState() {
  state.detail.speechActive = false;
  state.detail.speechPaused = false;
  state.detail.speechText = "";
  state.detail.speechCharIndex = 0;
  state.detail.speechChunks = [];
  state.detail.speechChunkIndex = 0;
  state.detail.speechTransport = "";
}

function isAudioAutoplayBlocked(error) {
  const name = String(error?.name || "").toLowerCase();
  const message = String(messageOf(error) || "").toLowerCase();
  return (
    name === "notallowederror" ||
    message.includes("notallowed") ||
    message.includes("user gesture") ||
    message.includes("play()")
  );
}

async function playCompletionAudioText(text, { automatic = false } = {}) {
  const sourceText = String(text || "").trim();
  if (!sourceText) {
    return false;
  }
  if (completionAudioUnavailableForCjk && containsCjkText(sourceText)) {
    return false;
  }
  state.detail.completionAudioError = "";
  lastCompletionAudioError = "";

  let audioPayload = null;
  try {
    audioPayload = await createTtsAudio(sourceText);
  } catch (error) {
    state.detail.completionAudioError = messageOf(error);
    lastCompletionAudioError = state.detail.completionAudioError;
    if (/no audio was generated/i.test(lastCompletionAudioError) && containsCjkText(sourceText)) {
      completionAudioUnavailableForCjk = true;
    }
    return false;
  }

  const audioUrl = String(audioPayload?.audioUrl || "").trim();
  if (!audioUrl) {
    return false;
  }

  try {
    state.detail.speechRunId = Number(state.detail.speechRunId || 0) + 1;
    const runId = state.detail.speechRunId;
    try {
      window.speechSynthesis?.cancel?.();
    } catch {
      /* ignore browser speech cleanup failures */
    }
    clearCompletionAudioElement();
    const audio = new Audio(audioUrl);
    completionAudioElement = audio;
    audio.preload = "auto";
    audio.onplay = () => {
      if (state.detail.speechRunId !== runId) {
        return;
      }
      state.detail.speechTransport = "audio";
      state.detail.speechActive = true;
      state.detail.speechPaused = false;
      scheduleSessionDetailRender();
    };
    audio.onpause = () => {
      if (state.detail.speechRunId !== runId || audio.ended) {
        return;
      }
      state.detail.speechTransport = "audio";
      state.detail.speechActive = true;
      state.detail.speechPaused = true;
      scheduleSessionDetailRender();
    };
    audio.onended = () => {
      if (state.detail.speechRunId !== runId) {
        return;
      }
      clearCompletionAudioElement();
      resetCompletionSpeechState();
      scheduleSessionDetailRender();
    };
    audio.onerror = () => {
      if (state.detail.speechRunId !== runId) {
        return;
      }
      clearCompletionAudioElement();
      resetCompletionSpeechState();
      scheduleSessionDetailRender();
    };
    state.detail.speechTransport = "audio";
    state.detail.speechText = sourceText;
    state.detail.speechActive = true;
    state.detail.speechPaused = false;
    await audio.play();
    lastCompletionAudioError = "";
    if (!automatic) {
      showToast(t("completionActions.readingStarted"));
    }
    scheduleSessionDetailRender();
    return true;
  } catch (error) {
    if (isAudioAutoplayBlocked(error) && completionAudioElement) {
      state.detail.speechTransport = "audio";
      state.detail.speechText = sourceText;
      state.detail.speechActive = true;
      state.detail.speechPaused = true;
      state.detail.completionAudioUrl = audioUrl;
      state.detail.completionAudioError = "";
      state.detail.completionAudioStatus = t("completionActions.audioReadyTapToPlay");
      showToast(t("completionActions.audioTapToPlay"));
      scheduleSessionDetailRender();
      return true;
    }
    state.detail.completionAudioError = messageOf(error);
    lastCompletionAudioError = state.detail.completionAudioError;
    clearCompletionAudioElement();
    resetCompletionSpeechState();
    scheduleSessionDetailRender();
    return false;
  }
}

function stopCompletionSpeech() {
  if (state.detail.speechTransport === "audio" || completionAudioElement) {
    state.detail.speechRunId = Number(state.detail.speechRunId || 0) + 1;
    clearCompletionAudioElement();
    resetCompletionSpeechState();
    scheduleSessionDetailRender();
    return;
  }
  if (!isCompletionSpeechSupported()) {
    resetCompletionSpeechState();
    return;
  }
  try {
    state.detail.speechRunId = Number(state.detail.speechRunId || 0) + 1;
    window.speechSynthesis.cancel();
  } catch {
    /* ignore speech failures */
  }
  resetCompletionSpeechState();
  scheduleSessionDetailRender();
}

function splitCompletionSpeechText(text) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) {
    return [];
  }
  const chunks = [];
  const parts = source.match(/[^。！？!?；;]+[。！？!?；;]?|.+$/g) || [source];
  const maxChunkLength = 220;
  let buffer = "";

  parts.forEach((part) => {
    const value = String(part || "").trim();
    if (!value) {
      return;
    }
    if (value.length > maxChunkLength) {
      if (buffer) {
        chunks.push(buffer);
        buffer = "";
      }
      for (let index = 0; index < value.length; index += maxChunkLength) {
        chunks.push(value.slice(index, index + maxChunkLength));
      }
      return;
    }
    const nextBuffer = buffer ? `${buffer} ${value}` : value;
    if (nextBuffer.length > maxChunkLength && buffer) {
      chunks.push(buffer);
      buffer = value;
    } else {
      buffer = nextBuffer;
    }
  });

  if (buffer) {
    chunks.push(buffer);
  }
  return chunks.length > 0 ? chunks : [source];
}

function getCompletionSpeechCurrentChunkIndex() {
  const chunks = Array.isArray(state.detail.speechChunks) ? state.detail.speechChunks : [];
  const index = Number(state.detail.speechChunkIndex || 0);
  if (!Number.isFinite(index) || index < 0) {
    return 0;
  }
  return Math.min(Math.floor(index), Math.max(0, chunks.length - 1));
}

function startCompletionSpeechChunk(runId, { automatic = false, resumed = false } = {}) {
  const chunks = Array.isArray(state.detail.speechChunks) ? state.detail.speechChunks : [];
  const chunkIndex = getCompletionSpeechCurrentChunkIndex();
  const chunkText = String(chunks[chunkIndex] || "").trim();
  if (!chunkText || !isCompletionSpeechSupported()) {
    state.detail.speechActive = false;
    state.detail.speechPaused = false;
    state.detail.speechText = "";
    state.detail.speechCharIndex = 0;
    state.detail.speechChunks = [];
    state.detail.speechChunkIndex = 0;
    scheduleSessionDetailRender();
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(chunkText);
  const voice = pickCompletionSpeechVoice(chunkText);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = String(voice.lang || getIntlLocale());
  } else {
    utterance.lang = getIntlLocale();
  }
  utterance.rate = 1;
  utterance.onboundary = (event) => {
    if (state.detail.speechRunId !== runId) {
      return;
    }
    const charIndex = Number(event?.charIndex);
    if (Number.isFinite(charIndex) && charIndex >= 0) {
      state.detail.speechCharIndex = charIndex;
    }
  };
  utterance.onend = () => {
    if (state.detail.speechRunId !== runId || state.detail.speechPaused) {
      return;
    }
    const nextIndex = getCompletionSpeechCurrentChunkIndex() + 1;
    if (nextIndex < chunks.length) {
      state.detail.speechChunkIndex = nextIndex;
      state.detail.speechCharIndex = 0;
      startCompletionSpeechChunk(runId, { automatic: true, resumed: true });
      return;
    }
    state.detail.speechActive = false;
    state.detail.speechPaused = false;
    state.detail.speechText = "";
    state.detail.speechCharIndex = 0;
    state.detail.speechChunks = [];
    state.detail.speechChunkIndex = 0;
    scheduleSessionDetailRender();
  };
  utterance.onerror = () => {
    if (state.detail.speechRunId !== runId) {
      return;
    }
    state.detail.speechActive = false;
    state.detail.speechPaused = false;
    scheduleSessionDetailRender();
  };
  state.detail.speechActive = true;
  state.detail.speechPaused = false;
  window.speechSynthesis.speak(utterance);
  if (!automatic && !resumed) {
    showToast(t("completionActions.readingStarted"));
  }
  scheduleSessionDetailRender();
  return true;
}

function startCompletionSpeechText(text, { automatic = false, resumed = false } = {}) {
  const sourceText = String(text || "").trim();
  const existingChunks = Array.isArray(state.detail.speechChunks) ? state.detail.speechChunks : [];
  if ((!sourceText && (!resumed || existingChunks.length <= 0)) || !isCompletionSpeechSupported()) {
    return false;
  }

  try {
    state.detail.speechRunId = Number(state.detail.speechRunId || 0) + 1;
    const runId = state.detail.speechRunId;
    window.speechSynthesis.cancel();
    if (!resumed || existingChunks.length <= 0) {
      state.detail.speechText = sourceText;
      state.detail.speechChunks = splitCompletionSpeechText(sourceText);
      state.detail.speechChunkIndex = 0;
    }
    state.detail.speechCharIndex = 0;
    return startCompletionSpeechChunk(runId, { automatic, resumed });
  } catch (error) {
    state.detail.speechActive = false;
    state.detail.speechPaused = false;
    showToast(messageOf(error));
    return false;
  }
}

function toggleCompletionSpeechPause() {
  if (state.detail.speechTransport === "audio" && completionAudioElement) {
    if (completionAudioElement.paused) {
      const playResult = completionAudioElement.play();
      if (playResult && typeof playResult.then === "function") {
        playResult
          .then(() => {
            state.detail.speechActive = true;
            state.detail.speechPaused = false;
            scheduleSessionDetailRender();
          })
          .catch((error) => {
            state.detail.speechActive = true;
            state.detail.speechPaused = true;
            showToast(
              isAudioAutoplayBlocked(error)
                ? t("completionActions.audioTapToPlay")
                : messageOf(error),
            );
            scheduleSessionDetailRender();
          });
      } else {
        state.detail.speechActive = true;
        state.detail.speechPaused = false;
        scheduleSessionDetailRender();
      }
    } else {
      try {
        completionAudioElement.pause();
      } catch (error) {
        showToast(messageOf(error));
      }
      state.detail.speechActive = true;
      state.detail.speechPaused = true;
      scheduleSessionDetailRender();
    }
    return;
  }

  if (!isCompletionSpeechSupported()) {
    resetCompletionSpeechState();
    showToast(t("completionActions.speechUnsupported"));
    scheduleSessionDetailRender();
    return;
  }

  try {
    const synth = window.speechSynthesis;
    if (state.detail.speechPaused || synth.paused) {
      if (Array.isArray(state.detail.speechChunks) && state.detail.speechChunks.length > 0) {
        startCompletionSpeechText("", { resumed: true });
      } else {
        synth.resume();
      }
      state.detail.speechActive = true;
      state.detail.speechPaused = false;
      return;
    }
    if (state.detail.speechActive || synth.speaking) {
      state.detail.speechRunId = Number(state.detail.speechRunId || 0) + 1;
      synth.cancel();
      state.detail.speechActive = true;
      state.detail.speechPaused = true;
    }
  } catch (error) {
    showToast(messageOf(error));
  } finally {
    scheduleSessionDetailRender();
  }
}

function isCompletionSpeechSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function speakCompletionResult({ automatic = false, notice = state.detail.completionNotice } = {}) {
  let targetTurnId = String(notice?.turnId || "").trim();
  const previousAssistantText = String(notice?.previousAssistantText || "").trim();
  let text = "";
  if (automatic && notice?.sessionId) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await delay(attempt === 0 ? 250 : 450);
      await catchUpSessionEvents(notice.sessionId, state.detail.cursor || 0).catch(() => null);
      if (attempt >= 2) {
        const refreshedSession = await getSession(notice.sessionId).catch(() => null);
        if (refreshedSession && state.detail.session?.sessionId === notice.sessionId) {
          state.detail.session = refreshedSession;
          updateSessionListItem(refreshedSession);
        }
      }
      if (!targetTurnId) {
        targetTurnId = String(getLatestTimelineTurn()?.id || "").trim();
      }
      text = getReadableCompletionText({ turnId: targetTurnId, allowFallback: attempt >= 5 });
      if (!text && previousAssistantText) {
        text = getReadableLatestAssistantTextIfChanged(previousAssistantText);
      }
      if (text) {
        break;
      }
    }
  } else {
    if (!targetTurnId) {
      targetTurnId = String(getLatestTimelineTurn()?.id || "").trim();
    }
    text = getReadableCompletionText({ turnId: targetTurnId, allowFallback: !targetTurnId });
  }
  if (!text) {
    if (!automatic) {
      showToast(t("completionActions.noResult"));
    }
    return false;
  }

  try {
    const audioStarted = await playCompletionAudioText(text, { automatic });
    if (audioStarted) {
      return true;
    }
    const speechStarted = startCompletionSpeechText(text, { automatic });
    if (!speechStarted && !automatic && !isCompletionSpeechSupported()) {
      state.detail.speechActive = false;
      showToast(t("completionActions.speechUnsupported"));
    } else if (!speechStarted && !automatic) {
      showToast(lastCompletionAudioError || t("completionActions.audioFailed"));
    }
    return speechStarted;
  } catch (error) {
    resetCompletionSpeechState();
    showToast(messageOf(error));
    return false;
  }
}

function cleanupCompletionNoticeTimer() {
  if (state.detail.completionNoticeTimerId) {
    window.clearTimeout(state.detail.completionNoticeTimerId);
    state.detail.completionNoticeTimerId = 0;
  }
}

function dismissCompletionNotice() {
  cleanupCompletionNoticeTimer();
  state.detail.completionNotice = null;
  state.detail.completionActionSettingsOpen = false;
  scheduleSessionDetailRender();
}

function renderCompletionNotice() {
  const notice = state.detail.completionNotice;
  if (!notice || notice.sessionId !== state.detail.session?.sessionId) {
    return "";
  }
  if (Number(notice.expiresAt || 0) > 0 && Number(notice.expiresAt || 0) <= Date.now()) {
    state.detail.completionNotice = null;
    cleanupCompletionNoticeTimer();
    return "";
  }
  const prefs = getCompletionActionPrefsForSession(notice.sessionId);
  const runs = getCompletionAutoContinueRuns(notice.sessionId);
  const autoLine = prefs.autoContinue
    ? t("completionActions.autoContinueProgress", { count: runs, max: prefs.autoContinueMaxRuns })
    : "";
  const statusLine = notice.actionStatus || autoLine;
  if (!statusLine) {
    return "";
  }

  return `
    <div class="completion-notice" role="status" aria-live="polite">
      <div class="completion-notice-mark" aria-hidden="true">✓</div>
      <div class="completion-notice-copy">
        <div class="completion-notice-title">${escapeHtml(t("completionNotice.title"))}</div>
        <div class="completion-notice-detail">${escapeHtml(
          t("completionNotice.detail", { title: shortenText(notice.title, 80) }),
        )}</div>
        ${statusLine ? `<div class="completion-actions-status">${escapeHtml(statusLine)}</div>` : ""}
      </div>
      <button type="button" class="completion-notice-close" data-dismiss-completion-notice aria-label="${escapeHtml(t("generic.close"))}">×</button>
    </div>
  `;
}

function renderCompletionOptionsPanel() {
  if (!state.detail.completionActionSettingsOpen) {
    return "";
  }
  const sessionId = state.detail.session?.sessionId || "";
  const prefs = getCompletionActionPrefsForSession(sessionId);
  const runs = getCompletionAutoContinueRuns(sessionId);
  const autoLine = prefs.autoContinue
    ? t("completionActions.autoContinueProgress", { count: runs, max: prefs.autoContinueMaxRuns })
    : "";
  const audioUrl = String(state.detail.completionAudioUrl || "");
  const audioStatus = state.detail.completionAudioGenerating
    ? t("completionActions.audioGenerating")
    : state.detail.completionAudioError || state.detail.completionAudioStatus || "";

  return `
    <section class="completion-options-panel" aria-label="${escapeHtml(t("completionActions.options"))}">
      <div class="completion-options-head">
        <div>
          <div class="completion-options-title">${escapeHtml(t("completionActions.options"))}</div>
          ${autoLine ? `<div class="completion-actions-status">${escapeHtml(autoLine)}</div>` : ""}
        </div>
        <button type="button" class="completion-options-close" data-completion-options-toggle aria-label="${escapeHtml(t("generic.close"))}">×</button>
      </div>
      <div class="completion-actions-settings completion-options-settings">
        <label class="completion-actions-toggle">
          <input
            type="checkbox"
            id="completion-action-auto-read"
            ${prefs.autoRead ? "checked" : ""}
          />
          <span>${escapeHtml(t("completionActions.settingAutoRead"))}</span>
        </label>
        <label class="completion-actions-toggle">
          <input type="checkbox" id="completion-action-auto-continue" ${prefs.autoContinue ? "checked" : ""} />
          <span>${escapeHtml(t("completionActions.settingAutoContinue"))}</span>
        </label>
        <label class="completion-actions-number">
          <span>${escapeHtml(t("completionActions.settingMaxRuns"))}</span>
          <input
            id="completion-action-max-runs"
            type="number"
            min="1"
            max="20"
            step="1"
            value="${escapeHtml(prefs.autoContinueMaxRuns)}"
          />
        </label>
        ${
          prefs.autoContinue
            ? `<button type="button" class="completion-action-button completion-action-button-danger" data-completion-action="stop-auto">${escapeHtml(t("completionActions.stopAutoContinue"))}</button>`
            : ""
        }
        <div class="completion-actions-help">${escapeHtml(t("completionActions.autoContinueHelp"))}</div>
      </div>
      <div class="completion-audio-panel">
        <div class="completion-audio-head">
          <div>
            <div class="completion-audio-title">${escapeHtml(t("completionActions.audioTitle"))}</div>
            <div class="completion-audio-subtitle">${escapeHtml(t("completionActions.audioHelp"))}</div>
          </div>
          <button
            type="button"
            class="completion-action-button"
            data-completion-action="generate-audio"
            ${state.detail.completionAudioGenerating ? "disabled" : ""}
          >${escapeHtml(state.detail.completionAudioGenerating ? t("completionActions.audioGeneratingShort") : t("completionActions.generateAudio"))}</button>
        </div>
        ${
          audioUrl
            ? `
              <div class="completion-audio-player-row">
                <audio id="completion-audio-player" class="completion-audio-player" controls preload="metadata" src="${escapeHtml(audioUrl)}"></audio>
                <button type="button" class="completion-action-button completion-action-button-danger" data-completion-action="clear-audio">${escapeHtml(t("completionActions.clearAudio"))}</button>
              </div>
            `
            : ""
        }
        ${audioStatus ? `<div class="completion-actions-status">${escapeHtml(audioStatus)}</div>` : ""}
      </div>
    </section>
  `;
}

function renderCompletionSpeechControl() {
  if (
    (!isCompletionSpeechSupported() && state.detail.speechTransport !== "audio") ||
    (!state.detail.speechActive && !state.detail.speechPaused)
  ) {
    return "";
  }

  const paused = Boolean(state.detail.speechPaused);
  const toggleLabel = paused ? t("completionActions.resumeRead") : t("completionActions.pauseRead");
  const position = state.detail.speechFloatPosition || null;
  const positionStyle =
    position && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))
      ? ` style="left: ${Math.max(0, Math.round(Number(position.x)))}px; top: ${Math.max(0, Math.round(Number(position.y)))}px; right: auto; bottom: auto;"`
      : "";
  const toggleIcon = paused
    ? `
      <path fill="currentColor" d="M8.4 6.8v10.4l8.3-5.2-8.3-5.2Z" />
    `
    : `
      <rect x="8" y="7" width="2.7" height="10" rx="0.9" fill="currentColor" />
      <rect x="13.3" y="7" width="2.7" height="10" rx="0.9" fill="currentColor" />
    `;

  return `
    <div class="completion-speech-float ${paused ? "completion-speech-float-paused" : ""}" role="group" aria-label="${escapeHtml(t("completionActions.readingControl"))}"${positionStyle}>
      <button
        type="button"
        class="completion-speech-drag"
        data-completion-speech-drag
        aria-label="${escapeHtml(t("completionActions.moveReadControl"))}"
        title="${escapeHtml(t("completionActions.moveReadControl"))}"
      >
        <span></span><span></span><span></span><span></span>
      </button>
      <button
        type="button"
        class="completion-speech-button completion-speech-button-toggle"
        data-completion-speech-toggle
        aria-label="${escapeHtml(toggleLabel)}"
        title="${escapeHtml(toggleLabel)}"
      >
        <svg class="completion-speech-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M4 9.4h3.2l4.1-3.7c0.7-0.6 1.7-0.1 1.7 0.8v11c0 0.9-1 1.4-1.7 0.8l-4.1-3.7H4V9.4Z" opacity="0.82" />
          ${toggleIcon}
        </svg>
      </button>
      <button
        type="button"
        class="completion-speech-button completion-speech-button-stop"
        data-completion-speech-stop
        aria-label="${escapeHtml(t("completionActions.stopRead"))}"
        title="${escapeHtml(t("completionActions.stopRead"))}"
      >
        <svg class="completion-speech-stop-icon" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M7.1 5.7 12 10.6l4.9-4.9 1.4 1.4-4.9 4.9 4.9 4.9-1.4 1.4-4.9-4.9-4.9 4.9-1.4-1.4 4.9-4.9-4.9-4.9 1.4-1.4Z" />
        </svg>
      </button>
    </div>
  `;
}

function renderSessionQueuePanel(session) {
  const items = getUnifiedQueuedMessages(session);
  if (items.length <= 0) {
    return "";
  }

  const officialCount = getOfficialQueueCount(session);
  const mobileItems = getMobileQueuedMessages(session?.sessionId);
  const localCount = mobileItems.length;
  const autoCount = mobileItems.filter(isAutoContinueQueuedItem).length;
  const manualLocalCount = localCount - autoCount;
  const summary = t("queue.summary", { official: officialCount, local: localCount, total: items.length });
  const rowsHtml = items
    .map((item, index) => {
      const origin =
        item.origin === "official_codex"
          ? "official"
          : item.origin === "syncodex_auto_continue"
            ? "auto-continue"
            : "syncodex";
      const elapsed = item.createdAt ? formatElapsedSinceIso(item.createdAt) : "";
      const actionsMenu =
        item.origin !== "official_codex"
          ? `
            <div class="session-queue-actions" role="menu" aria-label="${escapeHtml(t("queue.actions"))}">
              <button type="button" class="session-queue-action" data-mobile-queue-action="edit" data-mobile-queue-id="${escapeHtml(item.id)}" role="menuitem">${escapeHtml(t("queue.editLocal"))}</button>
              <button type="button" class="session-queue-action" data-mobile-queue-action="remove" data-mobile-queue-id="${escapeHtml(item.id)}" role="menuitem">${escapeHtml(t("queue.removeLocalShort"))}</button>
              <button type="button" class="session-queue-action" data-mobile-queue-action="front" data-mobile-queue-id="${escapeHtml(item.id)}" role="menuitem">${escapeHtml(t("queue.moveLocalToFront"))}</button>
            </div>
          `
          : "";
      return `
        <li class="session-queue-item session-queue-item-${origin}" ${
          item.origin !== "official_codex"
            ? `data-mobile-queue-item="${escapeHtml(item.id)}" role="button" tabindex="0" aria-haspopup="menu" aria-label="${escapeHtml(t("queue.openActions"))}"`
            : ""
        }>
          <div class="session-queue-item-head">
            <span class="session-queue-index">${index + 1}</span>
            <span class="session-queue-source">${escapeHtml(item.label)}</span>
            ${elapsed && elapsed !== "--" ? `<span class="session-queue-time">${escapeHtml(t("queue.createdAgo", { value: elapsed }))}</span>` : ""}
          </div>
          <div class="session-queue-text">${escapeHtml(shortenText(item.text, 180))}</div>
          ${actionsMenu}
        </li>
      `;
    })
    .join("");

  return `
    <section class="session-queue-panel" aria-label="${escapeHtml(t("queue.title"))}">
      <div class="session-queue-panel-head">
        <div>
          <div class="session-queue-title">${escapeHtml(t("queue.title"))}</div>
          <div class="session-queue-summary">${escapeHtml(summary)}</div>
        </div>
        <div class="session-queue-legend" aria-hidden="true">
          ${officialCount > 0 ? `<span class="session-queue-legend-item session-queue-legend-official">${escapeHtml(t("queue.originOfficial"))}</span>` : ""}
          ${manualLocalCount > 0 ? `<span class="session-queue-legend-item session-queue-legend-syncodex">${escapeHtml(t("queue.originSyncodex"))}</span>` : ""}
          ${autoCount > 0 ? `<span class="session-queue-legend-item session-queue-legend-auto-continue">${escapeHtml(t("queue.originAutoContinue"))}</span>` : ""}
        </div>
      </div>
      <ol class="session-queue-list">
        ${rowsHtml}
      </ol>
    </section>
  `;
}

function updateCompletionActionPrefs(partial = {}) {
  const sessionId = String(state.detail.session?.sessionId || "").trim();
  if (!sessionId) {
    return;
  }
  const previousPrefs = getCompletionActionPrefsForSession(sessionId);
  const threadEntry = getCompletionThreadRunEntry(sessionId);
  const nextThreadPrefs = normalizeCompletionActionThreadPrefs(
    {
      ...(threadEntry?.prefs || {}),
      ...partial,
    },
    previousPrefs,
  );
  state.workspace.completionActions = {
    prefs: normalizeCompletionActionPrefs(state.workspace.completionActions?.prefs || {}),
    threadRuns: {
      ...(state.workspace.completionActions?.threadRuns || {}),
      [sessionId]: {
        ...threadEntry,
        prefs: nextThreadPrefs,
      },
    },
  };
  writeCompletionActionState();
  if (state.detail.completionNotice?.sessionId === sessionId) {
    state.detail.completionNotice.autoContinueRuns = getCompletionAutoContinueRuns(sessionId);
    state.detail.completionNotice.autoContinueMaxRuns = nextThreadPrefs.autoContinueMaxRuns;
  }
  if (previousPrefs.autoContinue && !nextThreadPrefs.autoContinue) {
    clearCompletionAutoContinueSequence(sessionId);
  }
  scheduleSessionDetailRender();
}

function scrollToCompletionResult() {
  state.detail.autoScroll = true;
  const list = document.querySelector("#event-list");
  if (list instanceof HTMLElement) {
    list.scrollTop = list.scrollHeight;
  }
}

async function copyCompletionResult() {
  const text = getLatestAssistantText();
  if (!text) {
    showToast(t("completionActions.noResult"));
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(t("completionActions.copied"));
  } catch (error) {
    showToast(messageOf(error));
  }
}

function getCompletionAudioSourceText() {
  const targetTurnId = String(state.detail.completionNotice?.turnId || getLatestTimelineTurn()?.id || "").trim();
  const turnText = getAssistantTextForTurn(targetTurnId);
  return formatReadableCompletionText(turnText || getLatestAssistantText());
}

async function generateCompletionAudio() {
  if (state.detail.completionAudioGenerating) {
    return;
  }
  const text = getCompletionAudioSourceText();
  if (!text) {
    showToast(t("completionActions.noResult"));
    return;
  }
  stopCompletionSpeech();
  state.detail.completionAudioGenerating = true;
  state.detail.completionAudioError = "";
  state.detail.completionAudioStatus = t("completionActions.audioGenerating");
  scheduleSessionDetailRender();
  try {
    const result = await createTtsAudio(text);
    const audioUrl = String(result?.audioUrl || result?.url || "");
    if (!audioUrl) {
      throw new Error(t("completionActions.audioFailed"));
    }
    state.detail.completionAudioUrl = audioUrl;
    state.detail.completionAudioStatus = result?.cached
      ? t("completionActions.audioReadyCached")
      : t("completionActions.audioReady");
    state.detail.completionAudioError = "";
    state.detail.completionAudioGenerating = false;
    scheduleSessionDetailRender();
    window.requestAnimationFrame(() => {
      const audio = document.querySelector("#completion-audio-player");
      if (audio instanceof HTMLAudioElement) {
        completionAudioElement = audio;
      }
    });
  } catch (error) {
    state.detail.completionAudioGenerating = false;
    state.detail.completionAudioError = messageOf(error);
    state.detail.completionAudioStatus = "";
    scheduleSessionDetailRender();
    showToast(messageOf(error));
  }
}

function clearCompletionAudio() {
  const audio = document.querySelector("#completion-audio-player");
  if (audio instanceof HTMLAudioElement) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  completionAudioElement = null;
  state.detail.completionAudioUrl = "";
  state.detail.completionAudioError = "";
  state.detail.completionAudioStatus = "";
  scheduleSessionDetailRender();
}

function stopAutoContinueFromCompletionMenu() {
  updateCompletionActionPrefs({ autoContinue: false });
  if (state.detail.completionNotice?.sessionId === state.detail.session?.sessionId) {
    state.detail.completionNotice.actionStatus = t("completionActions.autoStoppedByUser");
  }
  scheduleSessionDetailRender();
}

function clampCompletionSpeechFloatPosition(x, y, rect = null) {
  const margin = 10;
  const width = Number(rect?.width || 86);
  const height = Number(rect?.height || 48);
  const viewportWidth = Math.max(width + margin * 2, window.innerWidth || 360);
  const viewportHeight = Math.max(height + margin * 2, window.innerHeight || 640);
  return {
    x: Math.min(Math.max(margin, Number(x || 0)), viewportWidth - width - margin),
    y: Math.min(Math.max(margin, Number(y || 0)), viewportHeight - height - margin),
  };
}

function bindCompletionSpeechFloatControls() {
  const floatEl = document.querySelector(".completion-speech-float");
  const dragHandle = document.querySelector("[data-completion-speech-drag]");
  if (!(floatEl instanceof HTMLElement) || !(dragHandle instanceof HTMLElement)) {
    return;
  }

  dragHandle.onpointerdown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = floatEl.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    floatEl.classList.add("completion-speech-float-dragging");
    dragHandle.setPointerCapture?.(event.pointerId);

    const move = (moveEvent) => {
      moveEvent.preventDefault();
      const next = clampCompletionSpeechFloatPosition(
        moveEvent.clientX - offsetX,
        moveEvent.clientY - offsetY,
        rect,
      );
      floatEl.style.left = `${next.x}px`;
      floatEl.style.top = `${next.y}px`;
      floatEl.style.right = "auto";
      floatEl.style.bottom = "auto";
    };

    const finish = (upEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      floatEl.classList.remove("completion-speech-float-dragging");
      dragHandle.releasePointerCapture?.(event.pointerId);
      const nextRect = floatEl.getBoundingClientRect();
      const next = clampCompletionSpeechFloatPosition(nextRect.left, nextRect.top, nextRect);
      writeCompletionSpeechFloatPosition(next);
      if (upEvent?.type !== "pointercancel") {
        scheduleSessionDetailRender();
      }
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };
}

function bindCompletionActionControls() {
  document.querySelectorAll("[data-completion-options-toggle]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.onclick = () => {
      state.detail.completionActionSettingsOpen = !state.detail.completionActionSettingsOpen;
      scheduleSessionDetailRender();
    };
  });

  const completionDismissButton = document.querySelector("[data-dismiss-completion-notice]");
  if (completionDismissButton) {
    completionDismissButton.onclick = () => dismissCompletionNotice();
  }

  document.querySelectorAll("[data-completion-action]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.onclick = async () => {
      const action = button.getAttribute("data-completion-action") || "";
      if ((action === "summarize" || action === "continue") && button.disabled) {
        return;
      }
      if (action === "view") {
        scrollToCompletionResult();
      } else if (action === "read") {
        void speakCompletionResult();
      } else if (action === "stop-read") {
        stopCompletionSpeech();
      } else if (action === "copy") {
        await copyCompletionResult();
      } else if (action === "generate-audio") {
        button.disabled = true;
        await generateCompletionAudio();
      } else if (action === "clear-audio") {
        clearCompletionAudio();
      } else if (action === "summarize") {
        button.disabled = true;
        await sendCompletionActionMessage(COMPLETION_SUMMARY_PROMPT, "manual");
      } else if (action === "continue") {
        button.disabled = true;
        if (state.detail.session?.sessionId) {
          const prefs = getCompletionActionPrefsForSession(state.detail.session.sessionId);
          resetCompletionAutoContinueSequence(
            state.detail.session.sessionId,
            prefs.autoContinue ? prefs.autoContinueMaxRuns : 0,
          );
        }
        const sent = await sendCompletionActionMessage(COMPLETION_MANUAL_CONTINUE_PROMPT, "manual");
        if (!sent && state.detail.session?.sessionId) {
          clearCompletionAutoContinueSequence(state.detail.session.sessionId);
        }
      } else if (action === "stop-auto") {
        stopAutoContinueFromCompletionMenu();
      }
    };
  });

  const speechToggleButton = document.querySelector("[data-completion-speech-toggle]");
  if (speechToggleButton instanceof HTMLButtonElement) {
    speechToggleButton.onclick = () => toggleCompletionSpeechPause();
  }

  const speechStopButton = document.querySelector("[data-completion-speech-stop]");
  if (speechStopButton instanceof HTMLButtonElement) {
    speechStopButton.onclick = () => stopCompletionSpeech();
  }
  bindCompletionSpeechFloatControls();

  const autoReadInput = document.querySelector("#completion-action-auto-read");
  if (autoReadInput instanceof HTMLInputElement) {
    autoReadInput.onchange = () => {
      updateCompletionActionPrefs({ autoRead: autoReadInput.checked });
    };
  }

  const autoContinueInput = document.querySelector("#completion-action-auto-continue");
  if (autoContinueInput instanceof HTMLInputElement) {
    autoContinueInput.onchange = () => updateCompletionActionPrefs({ autoContinue: autoContinueInput.checked });
  }

  const maxRunsInput = document.querySelector("#completion-action-max-runs");
  if (maxRunsInput instanceof HTMLInputElement) {
    maxRunsInput.onchange = () => updateCompletionActionPrefs({ autoContinueMaxRuns: maxRunsInput.value });
  }
}

function getActiveDetailSessionId() {
  return String(state.workspace.activeSessionId || state.detail.session?.sessionId || "").trim();
}

function isActiveDetailSession(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  return Boolean(normalizedSessionId) && getActiveDetailSessionId() === normalizedSessionId;
}

async function catchUpSessionEvents(sessionId, afterSeq, options = {}) {
  const normalizedSessionId = String(sessionId || "").trim();
  let nextAfter = Number(afterSeq || 0);
  if (!normalizedSessionId || !nextAfter || !isActiveDetailSession(normalizedSessionId)) {
    return;
  }

  for (let page = 0; page < 10; page += 1) {
    if (!isActiveDetailSession(normalizedSessionId)) {
      return;
    }

    const payload = await getSessionEvents(normalizedSessionId, {
      after: nextAfter,
      limit: 200,
    });
    if (!isActiveDetailSession(normalizedSessionId)) {
      return;
    }

    const items = Array.isArray(payload?.items)
      ? payload.items.filter((item) => {
          const eventSessionId = String(item?.sessionId || item?.session_id || "").trim();
          return !eventSessionId || eventSessionId === normalizedSessionId;
        })
      : [];
    if (items.length === 0) {
      return;
    }

    const wasBusy = Object.prototype.hasOwnProperty.call(options, "wasBusy")
      ? Boolean(options.wasBusy)
      : isSessionLiveBusy(state.detail.session);
    trackUnseenEvents(items);
    mergeDetailTimelineRawEvents(items, { wasBusy });
    nextAfter = Number(payload?.nextCursor || nextAfter);
    state.detail.cursor = Math.max(state.detail.cursor, nextAfter);
    updateWorkspaceSessionActivityCount(normalizedSessionId, state.detail.cursor);
    markWorkspaceSessionSeen(normalizedSessionId, state.detail.cursor);

    if (items.length < 200) {
      return;
    }
  }
}

function patchTimelineListDom(list, items, options = {}) {
  if (!list) {
    return;
  }

  const template = document.createElement("template");
  template.innerHTML = renderTimelineList(items, options).trim();
  const nextList = template.content.firstElementChild;
  if (!nextList) {
    list.innerHTML = "";
    return;
  }

  const currentChildren = Array.from(list.children);
  const nextChildren = Array.from(nextList.children);
  let diffIndex = 0;

  while (diffIndex < currentChildren.length && diffIndex < nextChildren.length) {
    const currentNode = currentChildren[diffIndex];
    const nextNode = nextChildren[diffIndex];
    const currentId = currentNode.getAttribute("data-timeline-id") || "";
    const nextId = nextNode.getAttribute("data-timeline-id") || "";

    if (currentId !== nextId) {
      break;
    }

    if (currentNode.outerHTML !== nextNode.outerHTML) {
      if (!patchTimelineRowDom(currentNode, nextNode)) {
        break;
      }
    }

    diffIndex += 1;
  }

  for (let index = currentChildren.length - 1; index >= diffIndex; index -= 1) {
    currentChildren[index].remove();
  }

  for (let index = diffIndex; index < nextChildren.length; index += 1) {
    list.appendChild(nextChildren[index].cloneNode(true));
  }
}

function patchTimelineRowDom(currentNode, nextNode) {
  if (!currentNode || !nextNode) {
    return false;
  }

  const patchInner = (selector) => {
    const currentInner = currentNode.querySelector(selector);
    const nextInner = nextNode.querySelector(selector);
    if (!currentInner || !nextInner) {
      return false;
    }
    if (currentInner.innerHTML !== nextInner.innerHTML) {
      currentInner.innerHTML = nextInner.innerHTML;
    }
    return true;
  };

  if (
    currentNode.classList.contains("timeline-row-final") ||
    currentNode.classList.contains("timeline-row-commentary") ||
    currentNode.classList.contains("timeline-row-user")
  ) {
    currentNode.replaceWith(nextNode.cloneNode(true));
    return true;
  }

  if (currentNode.classList.contains("timeline-row-reasoning")) {
    currentNode.replaceWith(nextNode.cloneNode(true));
    return true;
  }

  if (
    currentNode.classList.contains("timeline-row-command") ||
    currentNode.classList.contains("timeline-row-patch")
  ) {
    const currentCard = currentNode.querySelector(".timeline-card");
    const nextCard = nextNode.querySelector(".timeline-card");
    const currentInline = currentNode.querySelector(".timeline-inline-step");
    const nextInline = nextNode.querySelector(".timeline-inline-step");
    const currentDetails = currentNode.querySelector("details");
    const nextDetails = nextNode.querySelector("details");
    const currentTitle = currentNode.querySelector(".timeline-card-title");
    const nextTitle = nextNode.querySelector(".timeline-card-title");
    const currentMeta = currentNode.querySelector(".timeline-card-meta");
    const nextMeta = nextNode.querySelector(".timeline-card-meta");
    const currentBody = currentNode.querySelector(".timeline-card-body");
    const nextBody = nextNode.querySelector(".timeline-card-body");

    if (currentInline || nextInline) {
      if (!currentInline || !nextInline) {
        currentNode.replaceWith(nextNode.cloneNode(true));
        return true;
      }

      const currentRow = currentInline.querySelector(".task-step-row");
      const nextRow = nextInline.querySelector(".task-step-row");
      const currentLabel = currentInline.querySelector(".task-step-label");
      const nextLabel = nextInline.querySelector(".task-step-label");
      const currentStepMeta = currentInline.querySelector(".task-step-meta");
      const nextStepMeta = nextInline.querySelector(".task-step-meta");
      const currentInlineDetail = currentInline.querySelector(
        ".assistant-command-item-inline-detail, .timeline-inline-detail-row",
      );
      const nextInlineDetail = nextInline.querySelector(
        ".assistant-command-item-inline-detail, .timeline-inline-detail-row",
      );

      if (!currentRow || !nextRow || !currentLabel || !nextLabel) {
        currentNode.replaceWith(nextNode.cloneNode(true));
        return true;
      }

      currentNode.className = nextNode.className;
      currentInline.className = nextInline.className;
      currentRow.className = nextRow.className;
      currentLabel.textContent = nextLabel.textContent || "";

      if (currentStepMeta && nextStepMeta) {
        currentStepMeta.textContent = nextStepMeta.textContent || "";
      } else if (!currentStepMeta && nextStepMeta) {
        currentRow.insertAdjacentHTML("beforeend", nextStepMeta.outerHTML);
      } else if (currentStepMeta && !nextStepMeta) {
        currentStepMeta.remove();
      }

      if (currentInlineDetail && nextInlineDetail) {
        if (currentInlineDetail.tagName === "DETAILS" && nextInlineDetail.tagName === "DETAILS") {
          currentInlineDetail.open = nextInlineDetail.open;
        }
        if (currentInlineDetail.innerHTML !== nextInlineDetail.innerHTML) {
          currentInlineDetail.innerHTML = nextInlineDetail.innerHTML;
        }
      } else if (!currentInlineDetail && nextInlineDetail) {
        currentInline.insertAdjacentHTML("beforeend", nextInlineDetail.outerHTML);
      } else if (currentInlineDetail && !nextInlineDetail) {
        currentInlineDetail.remove();
      }

      return true;
    }

    if (
      !currentCard ||
      !nextCard ||
      !currentDetails ||
      !nextDetails ||
      !currentTitle ||
      !nextTitle ||
      !currentMeta ||
      !nextMeta ||
      !currentBody ||
      !nextBody
    ) {
      return false;
    }

    currentCard.className = nextCard.className;
    currentDetails.open = nextDetails.open;
    currentTitle.textContent = nextTitle.textContent || "";
    currentMeta.textContent = nextMeta.textContent || "";
    if (currentBody.innerHTML !== nextBody.innerHTML) {
      currentBody.innerHTML = nextBody.innerHTML;
    }
    return true;
  }

  return false;
}

function patchTopBarDom(slot, nextHtml) {
  if (!slot) {
    return;
  }

  const template = document.createElement("template");
  template.innerHTML = nextHtml.trim();
  const nextRoot = template.content.firstElementChild;
  const currentRoot = slot.firstElementChild;

  if (!nextRoot) {
    slot.innerHTML = "";
    return;
  }

  if (!currentRoot || currentRoot.tagName !== nextRoot.tagName) {
    slot.innerHTML = nextHtml;
    return;
  }

  const selectors = [
    ".session-topbar-mobile-center",
    ".session-topbar-mobile-action",
    ".session-topbar-main",
    ".session-topbar-meta",
    ".session-topbar-action",
  ];

  selectors.forEach((selector) => {
    const currentNode = currentRoot.querySelector(selector);
    const nextNode = nextRoot.querySelector(selector);
    if (!currentNode || !nextNode) {
      return;
    }
    if (currentNode.innerHTML !== nextNode.innerHTML) {
      currentNode.innerHTML = nextNode.innerHTML;
    }
  });
}

function taskTurnMatchesOptions(turn, options = {}) {
  const allEvents = [turn.userEvent, ...turn.events].filter(Boolean);
  if (allEvents.length === 0) {
    return false;
  }

  return allEvents.some((event) => matchesEventOptions(event, options));
}

function buildTaskBlock(turn, context = {}) {
  const taskKey = `task:${turn.userEvent.id || context.index}`;
  const executionEvents = [...turn.events];
  const commandRanges = listCommandGroupRanges(executionEvents);
  const consumedIndexes = new Set();
  commandRanges.forEach(({ start, end }) => {
    for (let index = start; index <= end; index += 1) {
      consumedIndexes.add(index);
    }
  });

  const commandGroups = commandRanges.map((range) => range.group);
  const assistantEvents = executionEvents.filter(
    (event) => event.type === "cli.chunk" && event.stream === "assistant",
  );
  const statusEvents = executionEvents.filter((event) => event.type === "session.status");
  const noticeEvents = executionEvents.filter(
    (event) =>
      event.type === "system.notice" &&
      !isTranscriptMetaSkip(event) &&
      !isCommandStartNotice(event) &&
      !isCommandEndNotice(event),
  );
  const exitEvents = executionEvents.filter((event) => event.type === "cli.exit");
  const orphanStdoutEvents = executionEvents.filter(
    (event, index) =>
      event.type === "cli.chunk" &&
      event.stream === "stdout" &&
      !consumedIndexes.has(index),
  );
  const orphanStderrEvents = executionEvents.filter(
    (event, index) =>
      event.type === "cli.chunk" &&
      event.stream === "stderr" &&
      !consumedIndexes.has(index),
  );
  const finalText = assistantEvents
    .map((event) => event.content || "")
    .join("")
    .trim();
  const fallbackText = !finalText
    ? orphanStdoutEvents
        .map((event) => event.content || "")
        .join("\n")
        .trim()
    : "";
  const executionStatus = deriveTaskExecutionStatus({
    statusEvents,
    commandGroups,
    finalText: finalText || fallbackText,
    exitEvents,
    sessionStatus: context.sessionStatus,
    isLastTask: Boolean(context.isLastTask),
  });
  const steps = buildTaskSteps({
    commandGroups,
    statusEvents,
    noticeEvents,
    finalText: finalText || fallbackText,
    sessionStatus: context.sessionStatus,
    isLastTask: Boolean(context.isLastTask),
  });
  const assistantMessage = buildAssistantMessage({
    finalText,
    fallbackText,
    executionStatus,
    noticeEvents,
    steps,
  });

  return {
    key: taskKey,
    index: context.index || 0,
    user: {
      event: turn.userEvent,
      text: turn.userEvent.content || "",
    },
    executionEvents,
    commandGroups,
    statusEvents,
    noticeEvents,
    exitEvents,
    orphanStdoutEvents,
    orphanStderrEvents,
    finalText,
    assistantText: assistantMessage.mainText,
    assistantMessage,
    executionStatus,
    steps,
    startedAt: turn.userEvent.ts || 0,
  };
}

function buildAssistantMessage({
  finalText,
  fallbackText,
  executionStatus,
  noticeEvents,
  steps,
}) {
  return {
    mainText: finalText || "",
    stateLabel: getTaskExecutionLineLabelFromStatus(executionStatus.id),
    detailText: "",
    hasNaturalResponse: Boolean(finalText),
  };
}

function deriveTaskExecutionStatus({
  statusEvents,
  commandGroups,
  finalText,
  exitEvents = [],
  sessionStatus,
  isLastTask,
}) {
  const lastStatus = statusEvents.at(-1)?.status;
  let status = lastStatus || "";

  if (
    !status &&
    isLastTask &&
    sessionStatus &&
    ["waiting_input", "completed", "failed", "idle"].includes(sessionStatus)
  ) {
    status = sessionStatus;
  }

  if (!status && commandGroups.some((group) => !group.endEvent)) {
    status = isLastTask ? sessionStatus || "running" : "running";
  }

  if (!status && finalText) {
    status = "completed";
  }

  if (!status) {
    const exitCode = exitEvents.at(-1)?.exitCode;
    if (typeof exitCode === "number") {
      status = exitCode === 0 ? "completed" : "failed";
    }
  }

  if (!status && isLastTask && sessionStatus && sessionStatus !== "idle") {
    status = sessionStatus;
  }

  if (!status) {
    status = "idle";
  }

  return {
    id: status,
    label: sessionStatusLabel(status),
    className: statusClass(status),
  };
}

function buildTaskSteps({
  commandGroups,
  statusEvents,
  noticeEvents,
  finalText,
  sessionStatus,
  isLastTask,
}) {
  const steps = [];

  commandGroups.forEach((group) => {
    const exitCode = getCommandExitCode(group.endEvent);
    const timing = describeCommandTiming(group);
    const preview = describeCommandPreview(group);
    const presentation = describeCommandPresentation(group, preview);
    const baseLabel = shortenText(group.command || t("inspect.commandUnknown"), 60);
    const assumeFinishedFromSession =
      !group.endEvent && Boolean(isLastTask) && !isSessionBusy(sessionStatus);
    const commandStillRunning = !group.endEvent && !assumeFinishedFromSession;

    let label = t("task.commandExecuted", { label: baseLabel });
    if (commandStillRunning) {
      label = t("task.commandRunning", { label: baseLabel });
    } else if (exitCode && exitCode !== "0") {
      label = t("task.commandFailed", { label: baseLabel });
    }

    const meta = [];
    if (group.outputCount > 0) {
      meta.push(t("command.outputCount", { count: group.outputCount }));
    }
    if (group.stderrCount > 0) {
      meta.push(t("command.stderrCount", { count: group.stderrCount }));
    }
    if (timing) {
      meta.push(timing.label);
    }

    steps.push({
      kind: "command",
      groupId: group.id,
      group,
      label,
      meta: meta.join(" · "),
      status: commandStillRunning ? presentation.status : exitCode && exitCode !== "0" ? "error" : "success",
      previewLines: presentation.previewLines,
      collapsedSummary: presentation.collapsedSummary,
      detailSummary: presentation.detailSummary,
      defaultExpanded: commandStillRunning || (exitCode && exitCode !== "0"),
    });
  });

  noticeEvents
    .filter((event) => event.level === "error" || event.level === "warning")
    .slice(0, 2)
    .forEach((event) => {
      steps.push({
        kind: event.level === "error" ? "error" : "warning",
        label: shortenText(event.content || t("inspect.systemNotice"), 88),
        meta: "",
        status: event.level === "error" ? "error" : "warning",
        previewLines: [],
        collapsedSummary: shortenText(event.content || t("inspect.systemNotice"), 120),
        detailSummary: event.content || "",
        defaultExpanded: event.level === "error",
      });
    });

  if (steps.length === 0 && statusEvents.length > 0) {
    const lastStatus = statusEvents.at(-1);
    const statusLabel = getTaskExecutionLineLabelFromStatus(lastStatus.status);
    steps.push({
      kind: "status",
      label: statusLabel,
      meta: "",
      status: lastStatus.status || "idle",
      previewLines: [],
      collapsedSummary: statusLabel,
      detailSummary: statusLabel,
      defaultExpanded: false,
    });
  }

  return dedupeTaskSteps(steps).slice(0, 6);
}

function getTaskExecutionLineLabelFromStatus(status) {
  if (status === "failed") {
    return t("session.status.failed");
  }

  if (status === "starting" || status === "running" || status === "stopping") {
    return t("task.processing");
  }

  if (status === "waiting_input" || status === "completed" || status === "idle") {
    return t("session.status.completed");
  }

  return sessionStatusLabel(status || "idle");
}

function dedupeTaskSteps(steps) {
  const out = [];
  const seen = new Set();

  steps.forEach((step) => {
    const key = `${step.kind}:${step.label}:${step.meta}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    out.push(step);
  });

  return out;
}

const initialWorkspaceUiState = readWorkspaceUiState();
const initialWorkspaceUnreadState = readWorkspaceUnreadState();
const initialCompletionAlertPrefs = readCompletionAlertPrefs();
const initialCompletionActionState = applyCompletionActionMigrations(readCompletionActionState());
const initialTaskPlanCollapsed = readTaskPlanPanelCollapsed();
const initialMobileSendQueueState = readMobileSendQueueState();

const state = {
  route: "",
  ws: null,
  socketState: "closed",
  ui: {
    locale: getCurrentLocale(),
  },
  workspace: {
    sidebarCollapsed: initialWorkspaceUiState.sidebarCollapsed,
    collapsedProjectIds: new Set(initialWorkspaceUiState.collapsedProjectIds),
    readEventCounts: initialWorkspaceUnreadState.readEventCounts,
    completionAlerts: initialCompletionAlertPrefs,
    completionActions: initialCompletionActionState,
    mobileSendQueue: initialMobileSendQueueState,
    taskPlanCollapsed: initialTaskPlanCollapsed,
    localeMenuOpen: false,
    activeSessionId: "",
    sessionsRefreshTimerId: 0,
    sessionsRefreshInFlight: false,
    createDialog: {
      open: false,
      mode: "pick-project",
      startMode: "project",
      submitting: false,
      selectedProjectId: "",
      firstMessage: "",
      customCwd: "",
      modelId: "",
      reasoningId: "",
      projectName: "",
      projectPath: "",
      browserLoading: false,
      browserCurrentPath: "",
      browserParentPath: "",
      browserItems: [],
      error: "",
    },
    importDialog: {
      open: false,
      loading: false,
      submitting: false,
      items: [],
      query: "",
      selectedRolloutPath: "",
      error: "",
    },
  },
  sessions: {
    items: [],
    projects: [],
    ...DEFAULT_SESSIONS_VIEW,
  },
  detail: {
    session: null,
    rawEvents: [],
    timelineState: createEmptyTimelineState(),
    timelineItems: [],
    optimisticSend: null,
    cursor: 0,
    beforeCursor: 0,
    historyHasMore: false,
    historyLoading: false,
    draft: "",
    composerSending: false,
    composerSendError: "",
    composerPlaceholderHint: "",
    composerAttachments: [],
    composerUploadingAttachments: false,
    composerStopping: false,
    mobileQueueSending: false,
    mobileQueueLastError: "",
    unseenCount: 0,
    searchMatchIndex: 0,
    activeSearchResultKey: "",
    commandGroups: {},
    rawStdoutBuckets: {},
    codexLaunch: null,
    codexUiOptions: null,
    codexStatus: null,
    codexQuota: null,
    pendingApproval: null,
    dismissedApprovalKeys: {},
    resolvingApprovalRequestId: "",
    resolvingApprovalSessionId: "",
    resolvingApprovalCallId: "",
    taskDetails: {},
    remoteHosts: [],
    activeRemoteHost: "",
    activeTaskStartedAt: 0,
    liveExecutionTaskKey: "",
    liveClockId: 0,
    liveResumeTimerId: 0,
    importedSyncTimerId: 0,
    completionNotice: null,
    completionNoticeTimerId: 0,
    completionNoticeArmed: false,
    detailSyncing: false,
    detailSyncError: "",
    seenCompletionEventKeys: {},
    completionSpeechBaselineText: "",
    completionActionSettingsOpen: false,
    completionActionSending: false,
    speechActive: false,
    speechPaused: false,
    speechTransport: "",
    speechRunId: 0,
    speechText: "",
    speechCharIndex: 0,
    speechChunks: [],
    speechChunkIndex: 0,
    speechFloatPosition: readCompletionSpeechFloatPosition(),
    completionAudioUrl: "",
    completionAudioGenerating: false,
    completionAudioError: "",
    completionAudioStatus: "",
    messageContextMenu: null,
    composerEnvironmentMenuOpen: false,
    slashMenuOpen: false,
    slashCommands: [],
    slashCommandsLoading: false,
    slashQuery: "",
    slashActiveIndex: 0,
    slashExecuting: false,
    inspectDrawerOpen: false,
    inspectSelectionKey: "",
    renderTimerId: 0,
    cachePersistTimerId: 0,
    loadRequestId: 0,
    resumeSyncInFlight: false,
    lastResumeSyncAt: 0,
    ...DEFAULT_DETAIL_VIEW,
  },
};

applyDocumentLocale();
window.addEventListener("hashchange", renderRoute);
window.addEventListener("load", renderRoute);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void resumeActiveSessionDetail("visibility");
  }
});
window.addEventListener("focus", () => {
  void resumeActiveSessionDetail("focus");
});
window.addEventListener("pageshow", () => {
  void resumeActiveSessionDetail("pageshow");
});
window.addEventListener("storage", (event) => {
  if (event.key !== MOBILE_SEND_QUEUE_STORAGE_KEY) {
    return;
  }
  syncMobileSendQueueStateFromStorage();
  scheduleSessionDetailRender();
});
document.addEventListener(
  "toggle",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLDetailsElement) || target.dataset.threadTaskPlan !== "1") {
      return;
    }
    writeTaskPlanPanelCollapsed(!target.open);
  },
  true,
);

function renderRoute() {
  state.detail.loadRequestId = Number(state.detail.loadRequestId || 0) + 1;
  cleanupSocket();
  cleanupDetailClock();
  cleanupLiveResumeSync();
  cleanupCompletionNoticeTimer();
  stopCompletionSpeech();
  cleanupImportedSessionSync();
  cleanupWorkspaceSessionsRefresh();
  disconnectConversationLayoutObserver();
  if (state.detail.renderTimerId) {
    window.clearTimeout(state.detail.renderTimerId);
    state.detail.renderTimerId = 0;
  }
  if (state.detail.cachePersistTimerId) {
    window.clearTimeout(state.detail.cachePersistTimerId);
    state.detail.cachePersistTimerId = 0;
  }

  const hash = window.location.hash || "#/sessions";
  const route = parseHashRoute(hash);
  state.route = hash;

  const matched = route.path.match(/^#\/sessions\/([^/]+)$/);
  hydrateSessionsViewState("");
  if (matched) {
    hydrateSessionDetailViewState(route.query);
  } else {
    state.detail = {
      ...state.detail,
      ...DEFAULT_DETAIL_VIEW,
      optimisticSend: null,
      detailSyncing: false,
      detailSyncError: "",
    };
  }

  renderWorkspacePage(matched?.[1] || "");
}

function getWorkspaceFilteredSessions() {
  const projectMap = new Map(state.sessions.projects.map((project) => [project.projectId, project]));
  const filtered = state.sessions.items.filter((session) =>
    matchesSessionFilters(session, projectMap.get(session.projectId), state.sessions),
  );
  return sortSessions(filtered, state.sessions.sort);
}

function resolveWorkspaceSessionId(routeSessionId) {
  const availableIds = new Set(state.sessions.items.map((session) => session.sessionId));
  if (routeSessionId && availableIds.has(routeSessionId)) {
    return routeSessionId;
  }

  if (state.workspace.activeSessionId && availableIds.has(state.workspace.activeSessionId)) {
    return state.workspace.activeSessionId;
  }

  return getWorkspaceFilteredSessions()[0]?.sessionId || state.sessions.items[0]?.sessionId || "";
}

function renderWorkspaceEmptyState() {
  return `
    <section class="workspace-empty-state">
      <p class="workspace-empty-eyebrow">${escapeHtml(t("workspace.empty.eyebrow"))}</p>
      <h2>${escapeHtml(t("workspace.empty.title"))}</h2>
      <p>${escapeHtml(t("workspace.empty.subtitle"))}</p>
      <div class="workspace-empty-actions">
        <button id="workspace-empty-create-session" type="button" class="primary-button">${escapeHtml(t("workspace.empty.newSession"))}</button>
        <button id="workspace-empty-import-session" type="button" class="secondary-button">${escapeHtml(t("workspace.empty.importCodex"))}</button>
      </div>
    </section>
  `;
}

function deriveProjectNameFromPath(pathValue) {
  const normalized = String(pathValue || "").trim().replace(/[\\/]+$/, "");
  if (!normalized) {
    return "";
  }
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function joinProjectPath(basePath, projectName) {
  const normalizedBase = String(basePath || "").trim().replace(/[\\/]+$/, "");
  const normalizedName = String(projectName || "").trim().replace(/^[\\/]+/, "");
  if (!normalizedBase) {
    return normalizedName;
  }
  if (!normalizedName) {
    return normalizedBase;
  }
  return `${normalizedBase}/${normalizedName}`;
}

function normalizeProjectPathForComparison(pathValue) {
  return String(pathValue || "").trim().replace(/[\\/]+$/, "");
}

function findExistingProjectByPath(pathValue) {
  const normalizedTargetPath = normalizeProjectPathForComparison(pathValue);
  if (!normalizedTargetPath) {
    return null;
  }

  return (
    state.sessions.projects.find(
      (project) => normalizeProjectPathForComparison(project.path) === normalizedTargetPath,
    ) || null
  );
}

function getDefaultWorkspaceProjectBrowsePath() {
  return normalizeProjectPathForComparison(
    state.detail.session?.projectPath || state.sessions.projects[0]?.path || "",
  );
}

function getWorkspaceCreateCodexUiOptions() {
  const uiOptions = state.detail.codexUiOptions;
  return uiOptions &&
    Array.isArray(uiOptions.models) &&
    uiOptions.models.length > 0 &&
    Array.isArray(uiOptions.reasoningLevels) &&
    uiOptions.reasoningLevels.length > 0
    ? uiOptions
    : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
}

function getDefaultCreateSessionCodexLaunch() {
  return normalizeCodexLaunchAgainstUi(
    {
      ...loadCodexLaunchPrefs(),
      ...(state.detail.codexLaunch || {}),
    },
    getWorkspaceCreateCodexUiOptions(),
  );
}

function canSubmitWorkspaceCreateSession() {
  const dialogState = state.workspace.createDialog;
  const message = String(dialogState.firstMessage || "").trim();
  if (!message || dialogState.submitting) {
    return false;
  }

  if (normalizeCreateSessionStartMode(dialogState.startMode) === "custom") {
    return Boolean(String(dialogState.customCwd || "").trim());
  }

  return Boolean(String(dialogState.selectedProjectId || "").trim());
}

function syncWorkspaceCreateSessionSubmitButton() {
  const submitButton = document.querySelector("#workspace-create-session-submit");
  if (submitButton instanceof HTMLButtonElement) {
    submitButton.disabled = !canSubmitWorkspaceCreateSession();
  }
}

function shouldAutotitleSession(session) {
  const title = String(session?.title || "").trim();
  return !title || GENERIC_SESSION_TITLES.has(title);
}

function deriveSessionTitleFromMessage(message) {
  const normalized = String(message || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return t("workspace.session.untitled");
  }
  if (normalized.length <= 28) {
    return normalized;
  }
  return `${normalized.slice(0, 27)}…`;
}

function renderWorkspaceCreateSessionDialog() {
  const dialogState = state.workspace.createDialog;
  if (!dialogState.open) {
    return "";
  }

  const projects = Array.isArray(state.sessions.projects) ? state.sessions.projects : [];
  const selectedProject =
    projects.find((project) => project.projectId === dialogState.selectedProjectId) || projects[0] || null;
  const startMode = normalizeCreateSessionStartMode(dialogState.startMode);
  const uiOptions = getWorkspaceCreateCodexUiOptions();
  const modelOptions = Array.isArray(uiOptions.models) ? uiOptions.models : [];
  const reasoningOptions = Array.isArray(uiOptions.reasoningLevels) ? uiOptions.reasoningLevels : [];
  const selectedModelId = String(dialogState.modelId || modelOptions[0]?.id || "").trim();
  const selectedReasoningId = String(dialogState.reasoningId || "medium").trim();
  const canSubmitSession = canSubmitWorkspaceCreateSession();

  if (dialogState.mode === "pick-project") {
    return `
      <div class="workspace-modal-overlay"></div>
      <section class="workspace-dialog" aria-label="${escapeHtml(t("workspace.empty.newSession"))}">
        <div class="workspace-dialog-head">
          <div>
            <p class="workspace-dialog-eyebrow">${escapeHtml(t("workspace.create.eyebrow"))}</p>
            <h2 class="workspace-dialog-title">${escapeHtml(t("workspace.create.pickProjectTitle"))}</h2>
          </div>
          <button id="workspace-create-dialog-close" type="button" class="secondary-button">${escapeHtml(t("workspace.create.close"))}</button>
        </div>
        <div class="workspace-dialog-body">
          <div class="workspace-dialog-segmented" role="group" aria-label="${escapeHtml(t("workspace.create.startMode"))}">
            <button
              type="button"
              class="workspace-dialog-segment ${startMode === "project" ? "workspace-dialog-segment-active" : ""}"
              data-create-start-mode="project"
            >
              ${escapeHtml(t("workspace.create.startModeProject"))}
            </button>
            <button
              type="button"
              class="workspace-dialog-segment ${startMode === "custom" ? "workspace-dialog-segment-active" : ""}"
              data-create-start-mode="custom"
            >
              ${escapeHtml(t("workspace.create.startModeCustom"))}
            </button>
          </div>
          ${
            startMode === "custom"
              ? `
                <label class="workspace-dialog-field">
                  <span>${escapeHtml(t("workspace.create.customCwd"))}</span>
                  <input
                    id="workspace-create-custom-cwd"
                    class="workspace-dialog-input"
                    value="${escapeHtml(dialogState.customCwd || "")}"
                    placeholder="${escapeHtml(t("workspace.create.customCwdPlaceholder"))}"
                  />
                </label>
                <div class="workspace-dialog-help">
                  ${escapeHtml(t("workspace.create.customCwdHelp"))}
                </div>
              `
              : projects.length === 0
                ? `<div class="workspace-dialog-empty">${escapeHtml(t("workspace.create.noProjects"))}</div>`
                : `
                <div class="workspace-dialog-list">
                  ${projects
                    .map((project) => {
                      const active = project.projectId === selectedProject?.projectId;
                      return `
                        <button
                          type="button"
                          class="workspace-dialog-item ${active ? "workspace-dialog-item-active" : ""}"
                          data-select-project="${project.projectId}"
                        >
                          <div class="workspace-dialog-item-head">
                            <span class="workspace-dialog-item-title">${escapeHtml(project.name || t("workspace.project.untitled"))}</span>
                          </div>
                          <div class="workspace-dialog-item-subtle">${escapeHtml(shortenText(project.path || "", 100))}</div>
                        </button>
                      `;
                    })
                    .join("")}
                </div>
              `
          }
          <div class="workspace-dialog-grid">
            <label class="workspace-dialog-field">
              <span>${escapeHtml(t("workspace.create.model"))}</span>
              <select id="workspace-create-model" class="workspace-dialog-input">
                ${modelOptions
                  .map((modelOption) => {
                    const id = String(modelOption.id || "").trim();
                    const label = String(modelOption.label || id || t("workspace.create.defaultModel"));
                    return `
                      <option value="${escapeHtml(id)}" ${id === selectedModelId ? "selected" : ""}>
                        ${escapeHtml(label)}
                      </option>
                    `;
                  })
                  .join("")}
              </select>
            </label>
            <label class="workspace-dialog-field">
              <span>${escapeHtml(t("workspace.create.reasoning"))}</span>
              <select id="workspace-create-reasoning" class="workspace-dialog-input">
                ${reasoningOptions
                  .map((reasoningOption) => {
                    const id = String(reasoningOption.id || "").trim();
                    const label = formatReasoningEffortLabel(id || reasoningOption.label || t("workspace.create.defaultReasoning"));
                    return `
                      <option value="${escapeHtml(id)}" ${id === selectedReasoningId ? "selected" : ""}>
                        ${escapeHtml(label)}
                      </option>
                    `;
                  })
                  .join("")}
              </select>
            </label>
          </div>
          <label class="workspace-dialog-field workspace-dialog-first-message">
            <span>${escapeHtml(t("workspace.create.firstMessage"))}</span>
            <textarea
              id="workspace-create-first-message"
              class="workspace-dialog-input workspace-dialog-textarea"
              rows="5"
              placeholder="${escapeHtml(t("workspace.create.firstMessagePlaceholder"))}"
              autocomplete="on"
              autocorrect="on"
              autocapitalize="sentences"
              spellcheck="true"
              inputmode="text"
              enterkeyhint="done"
              lang="zh-CN"
            >${escapeHtml(dialogState.firstMessage || "")}</textarea>
          </label>
          <div class="workspace-dialog-help">
            ${escapeHtml(t("workspace.create.firstMessageHelp"))}
          </div>
          ${dialogState.error ? `<div class="workspace-dialog-error">${escapeHtml(dialogState.error)}</div>` : ""}
        </div>
        <div class="workspace-dialog-foot workspace-dialog-foot-split">
          <div class="workspace-dialog-secondary-actions">
            <span class="workspace-dialog-foot-note">${escapeHtml(t("workspace.create.existingProjectsOnly"))}</span>
          </div>
          <button
            id="workspace-create-session-submit"
            type="button"
            class="primary-button"
            ${canSubmitSession ? "" : "disabled"}
          >
            ${escapeHtml(dialogState.submitting ? t("workspace.create.processing") : t("workspace.create.startSession"))}
          </button>
        </div>
      </section>
    `;
  }

  const title = t("workspace.create.directoryTitle");
  const primaryLabel = dialogState.submitting ? t("workspace.create.processing") : t("workspace.create.startSession");
  const browserItems = Array.isArray(dialogState.browserItems) ? dialogState.browserItems : [];
  const browserPathValue = dialogState.browserCurrentPath || dialogState.projectPath || "";
  const canBrowseUp = Boolean(browserPathValue);

  return `
    <div class="workspace-modal-overlay"></div>
    <section class="workspace-dialog" aria-label="${escapeHtml(title)}">
      <div class="workspace-dialog-head">
        <div>
          <p class="workspace-dialog-eyebrow">${escapeHtml(t("generic.project"))}</p>
          <h2 class="workspace-dialog-title">${escapeHtml(title)}</h2>
        </div>
        <button id="workspace-create-dialog-close" type="button" class="secondary-button">${escapeHtml(t("workspace.create.close"))}</button>
      </div>
      <div class="workspace-dialog-form">
        <label class="workspace-dialog-field">
          <span>${escapeHtml(t("workspace.create.projectName"))}</span>
          <input
            id="workspace-project-name"
            class="workspace-dialog-input"
            value="${escapeHtml(dialogState.projectName)}"
            placeholder="${escapeHtml(t("workspace.create.projectNamePlaceholder"))}"
          />
        </label>
        <div class="workspace-dialog-help">
          ${escapeHtml(t("workspace.create.projectHelp"))}
        </div>
        <div class="workspace-dialog-field">
          <span>${escapeHtml(t("workspace.create.currentDirectory"))}</span>
          <div class="workspace-directory-browser">
            <div class="workspace-directory-browser-bar">
              <input
                id="workspace-project-browser-path"
                class="workspace-dialog-input workspace-directory-browser-path-input"
                value="${escapeHtml(browserPathValue)}"
                placeholder="${escapeHtml(t("workspace.create.pathPlaceholder"))}"
              />
              <div class="workspace-directory-browser-actions">
                ${
                  canBrowseUp
                    ? `<button id="workspace-project-browse-up" type="button" class="secondary-button">${escapeHtml(t("workspace.create.upOneLevel"))}</button>`
                    : ""
                }
              </div>
            </div>
            ${
              dialogState.browserLoading
                ? `<div class="workspace-dialog-empty">${escapeHtml(t("workspace.create.loadingDirectories"))}</div>`
                : browserItems.length
                  ? `
                    <div class="workspace-dialog-list workspace-directory-browser-list">
                      ${browserItems
                        .map((item) => {
                          const active = item.path === dialogState.projectPath;
                          return `
                            <button
                              type="button"
                              class="workspace-dialog-item ${active ? "workspace-dialog-item-active" : ""}"
                              data-browse-path="${escapeHtml(item.path)}"
                            >
                              <div class="workspace-dialog-item-head">
                                <span class="workspace-dialog-item-title">${escapeHtml(item.name || item.path)}</span>
                              </div>
                              <div class="workspace-dialog-item-subtle">${escapeHtml(shortenText(item.path || "", 100))}</div>
                            </button>
                          `;
                        })
                        .join("")}
                    </div>
                  `
                  : `<div class="workspace-dialog-empty">${escapeHtml(t("workspace.create.noChildDirectories"))}</div>`
            }
          </div>
        </div>
        ${dialogState.error ? `<div class="workspace-dialog-error">${escapeHtml(dialogState.error)}</div>` : ""}
      </div>
      <div class="workspace-dialog-foot workspace-dialog-foot-split">
        <button id="workspace-create-dialog-back" type="button" class="secondary-button">${escapeHtml(t("workspace.create.backToProjects"))}</button>
        <button id="workspace-project-submit" type="button" class="primary-button">${escapeHtml(primaryLabel)}</button>
      </div>
    </section>
  `;
}

function getWorkspaceImportDialogItems() {
  const query = String(state.workspace.importDialog.query || "").trim().toLowerCase();
  const items = Array.isArray(state.workspace.importDialog.items) ? state.workspace.importDialog.items : [];
  if (!query) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [
      item.title,
      item.codexSessionId,
      item.cwd,
      item.rolloutPath,
      item.importedSessionId,
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function getSelectedWorkspaceImportItem() {
  const items = Array.isArray(state.workspace.importDialog.items) ? state.workspace.importDialog.items : [];
  const selectedPath = String(state.workspace.importDialog.selectedRolloutPath || "");
  return items.find((item) => item.rolloutPath === selectedPath) || null;
}

function renderWorkspaceImportDialog() {
  const dialogState = state.workspace.importDialog;
  if (!dialogState.open) {
    return "";
  }

  const visibleItems = getWorkspaceImportDialogItems();
  const selected =
    visibleItems.find((item) => item.rolloutPath === dialogState.selectedRolloutPath) ||
    visibleItems[0] ||
    null;
  const primaryLabel = selected?.importedSessionId ? t("workspace.import.syncLatest") : t("workspace.import.importSession");

  return `
    <div class="workspace-import-dialog-overlay"></div>
    <section class="workspace-import-dialog" aria-label="${escapeHtml(t("workspace.import.title"))}">
      <div class="workspace-import-dialog-head">
        <div>
          <p class="workspace-import-dialog-eyebrow">${escapeHtml(t("workspace.import.eyebrow"))}</p>
          <h2 class="workspace-import-dialog-title">${escapeHtml(t("workspace.import.title"))}</h2>
        </div>
        <button id="workspace-import-dialog-close" type="button" class="secondary-button">${escapeHtml(t("workspace.create.close"))}</button>
      </div>
      <div class="workspace-import-dialog-toolbar">
        <input
          id="workspace-import-dialog-search"
          class="workspace-import-dialog-search"
          placeholder="${escapeHtml(t("workspace.import.searchPlaceholder"))}"
          value="${escapeHtml(dialogState.query)}"
        />
      </div>
      <div class="workspace-import-dialog-body">
        ${
          dialogState.loading
            ? `<div class="workspace-import-dialog-empty">${escapeHtml(t("workspace.import.loading"))}</div>`
            : dialogState.error
              ? `<div class="workspace-import-dialog-empty">${escapeHtml(dialogState.error)}</div>`
              : visibleItems.length === 0
                ? `<div class="workspace-import-dialog-empty">${escapeHtml(t("workspace.import.empty"))}</div>`
                : `
                  <div class="workspace-import-dialog-list">
                    ${visibleItems
                      .map((item) => {
                        const selectedItem = selected?.rolloutPath === item.rolloutPath;
                        const importedLabel = item.importedSessionId ? t("workspace.import.imported") : t("workspace.import.available");
                        const updatedLabel = item.updatedAt ? formatElapsedSinceIso(item.updatedAt) : "--";
                        return `
                          <button
                            type="button"
                            class="workspace-import-dialog-item ${selectedItem ? "workspace-import-dialog-item-active" : ""}"
                            data-import-rollout="${escapeHtml(item.rolloutPath)}"
                          >
                            <div class="workspace-import-dialog-item-head">
                              <span class="workspace-import-dialog-item-title">${escapeHtml(item.title || item.codexSessionId || t("workspace.session.untitled"))}</span>
                              <span class="pill ${item.importedSessionId ? "pill-neutral" : "pill-success"}">${escapeHtml(importedLabel)}</span>
                            </div>
                            <div class="workspace-import-dialog-item-meta">
                              <span>${escapeHtml(shortenText(item.cwd || item.rolloutPath, 72))}</span>
                              <span>${escapeHtml(updatedLabel)}</span>
                            </div>
                            <div class="workspace-import-dialog-item-subtle">${escapeHtml(shortenText(item.codexSessionId || item.rolloutPath, 90))}</div>
                          </button>
                        `;
                      })
                      .join("")}
                  </div>
                `
        }
      </div>
      <div class="workspace-import-dialog-foot">
        <div class="workspace-import-dialog-foot-note">
          ${
            selected
              ? selected.importedSessionId
                ? escapeHtml(t("workspace.import.syncToExisting", { sessionId: selected.importedSessionId }))
                : escapeHtml(t("workspace.import.importSelected", { title: selected.title || selected.codexSessionId || t("workspace.session.untitled") }))
              : escapeHtml(t("workspace.import.chooseSession"))
          }
        </div>
        <button
          id="workspace-import-dialog-submit"
          type="button"
          class="primary-button"
          ${selected && !dialogState.loading && !dialogState.submitting ? "" : "disabled"}
        >
          ${escapeHtml(dialogState.submitting ? t("workspace.create.processing") : primaryLabel)}
        </button>
      </div>
    </section>
  `;
}

function renderWorkspaceModalSlot() {
  return `${renderWorkspaceCreateSessionDialog()}${renderWorkspaceImportDialog()}`;
}

function getSessionLatestPlan(session) {
  const plan = session?.latestPlan;
  return plan && Array.isArray(plan.tasks) && plan.tasks.length > 0 ? plan : null;
}

function getSessionActivityCount(session) {
  const count = Number(session?.eventCount || session?.lastEventSeq || session?.lastSeq || 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function hasActiveSessionSummaryChanged(currentSession, nextSummary) {
  if (!currentSession || !nextSummary) {
    return false;
  }

  if (String(currentSession.status || "") !== String(nextSummary.status || "")) {
    return true;
  }
  if (Boolean(currentSession.liveBusy) !== Boolean(nextSummary.liveBusy)) {
    return true;
  }
  if (Boolean(currentSession.sourceRolloutHasOpenTurn) !== Boolean(nextSummary.sourceRolloutHasOpenTurn)) {
    return true;
  }
  if (getSessionActivityCount(nextSummary) > getSessionActivityCount(currentSession)) {
    return true;
  }
  if (
    String(nextSummary.lastEventAt || "") &&
    String(nextSummary.lastEventAt || "") !== String(currentSession.lastEventAt || "")
  ) {
    return true;
  }
  if (
    String(nextSummary.updatedAt || "") &&
    String(nextSummary.updatedAt || "") !== String(currentSession.updatedAt || "")
  ) {
    return true;
  }

  return false;
}

function reconcileWorkspaceReadMarkers(sessions = []) {
  const readEventCounts = { ...(state.workspace.readEventCounts || {}) };
  let changed = false;

  sessions.forEach((session) => {
    const sessionId = String(session?.sessionId || session?.id || "").trim();
    if (!sessionId) {
      return;
    }

    const activityCount = getSessionActivityCount(session);
    if (!Object.prototype.hasOwnProperty.call(readEventCounts, sessionId)) {
      readEventCounts[sessionId] = activityCount;
      changed = true;
      return;
    }

    const readCount = Number(readEventCounts[sessionId] || 0);
    if (!Number.isFinite(readCount) || readCount < 0 || readCount > activityCount) {
      readEventCounts[sessionId] = activityCount;
      changed = true;
    }
  });

  if (changed) {
    state.workspace.readEventCounts = readEventCounts;
    writeWorkspaceUnreadState();
  }
}

function markWorkspaceSessionSeen(sessionId, activityCount = null) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }

  const session =
    state.sessions.items.find((item) => item.sessionId === normalizedSessionId) ||
    (state.detail.session?.sessionId === normalizedSessionId ? state.detail.session : null);
  const nextCount = Math.max(
    Number(activityCount || 0),
    getSessionActivityCount(session),
    state.detail.session?.sessionId === normalizedSessionId ? Number(state.detail.cursor || 0) : 0,
  );
  const normalizedCount = Number.isFinite(nextCount) && nextCount > 0 ? Math.floor(nextCount) : 0;
  const currentCount = Number(state.workspace.readEventCounts?.[normalizedSessionId] || 0);
  if (currentCount >= normalizedCount) {
    return;
  }

  state.workspace.readEventCounts = {
    ...(state.workspace.readEventCounts || {}),
    [normalizedSessionId]: normalizedCount,
  };
  writeWorkspaceUnreadState();
}

function updateWorkspaceSessionActivityCount(sessionId, activityCount) {
  const normalizedSessionId = String(sessionId || "").trim();
  const nextCount = Number(activityCount || 0);
  if (!normalizedSessionId || !Number.isFinite(nextCount) || nextCount <= 0) {
    return;
  }

  state.sessions.items = state.sessions.items.map((item) => {
    if (item.sessionId !== normalizedSessionId) {
      return item;
    }
    return {
      ...item,
      eventCount: Math.max(getSessionActivityCount(item), Math.floor(nextCount)),
    };
  });

  if (state.detail.session?.sessionId === normalizedSessionId) {
    state.detail.session.eventCount = Math.max(
      getSessionActivityCount(state.detail.session),
      Math.floor(nextCount),
    );
  }
}

function getWorkspaceUnreadCount(session, selectedSessionId = "") {
  const sessionId = String(session?.sessionId || session?.id || "").trim();
  if (!sessionId || sessionId === selectedSessionId) {
    return 0;
  }

  const activityCount = getSessionActivityCount(session);
  const readCount = Number(state.workspace.readEventCounts?.[sessionId] || 0);
  if (!Number.isFinite(readCount) || activityCount <= readCount) {
    return 0;
  }
  return Math.max(0, activityCount - Math.max(0, Math.floor(readCount)));
}

function renderWorkspaceUnreadBadge(count) {
  const unreadCount = Number(count || 0);
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) {
    return "";
  }

  const displayCount =
    unreadCount > WORKSPACE_UNREAD_BADGE_MAX ? `${WORKSPACE_UNREAD_BADGE_MAX}+` : String(unreadCount);
  const label = t("workspace.sidebar.unreadCount", { count: unreadCount });
  return `<span class="workspace-session-unread-badge" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeHtml(displayCount)}</span>`;
}

function renderWorkspaceQueueBadges(session) {
  const officialCount = getOfficialQueueCount(session);
  const localCount = getMobileQueuedMessages(session?.sessionId).length;
  const badges = [];
  if (officialCount > 0) {
    const label = t("queue.badgeOfficial", { count: officialCount });
    badges.push(
      `<span class="workspace-session-queue-badge workspace-session-queue-badge-official" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeHtml(t("queue.badgeShortOfficial", { count: officialCount }))}</span>`,
    );
  }
  if (localCount > 0) {
    const label = t("queue.badgeSyncodex", { count: localCount });
    badges.push(
      `<span class="workspace-session-queue-badge workspace-session-queue-badge-syncodex" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeHtml(t("queue.badgeShortSyncodex", { count: localCount }))}</span>`,
    );
  }
  return badges.join("");
}

function getSessionTaskSummary(session) {
  const plan = getSessionLatestPlan(session);
  if (!plan) {
    return "";
  }

  const activeTask = plan.activeTask?.step || "";
  if (activeTask) {
    return t("workspace.sidebar.currentTask", { task: activeTask });
  }

  return t("workspace.sidebar.taskProgress", {
    completed: plan.completedCount || 0,
    total: plan.totalCount || plan.tasks.length,
  });
}

function renderWorkspaceSessionTaskIcon(session) {
  const plan = getSessionLatestPlan(session);
  if (!plan) {
    return "";
  }
  const label = t("workspace.sidebar.hasTasks");
  return `
    <span class="workspace-session-task-icon" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <path d="M5.6 4.4h6.2"></path>
        <path d="M5.6 8h6.2"></path>
        <path d="M5.6 11.6h6.2"></path>
        <path d="M2.4 4.4l.7.7 1.2-1.4"></path>
        <path d="M2.4 8l.7.7 1.2-1.4"></path>
        <path d="M2.4 11.6l.7.7 1.2-1.4"></path>
      </svg>
    </span>
  `;
}

function renderCompletionAlertToggle() {
  const prefs = state.workspace.completionAlerts || {};
  const permission = getNotificationPermission();
  const enabled = Boolean(prefs.enabled);
  const disabled = permission === "unsupported" && !canUseVibration();
  const title = enabled
    ? t("workspace.alerts.disable")
    : permission === "denied"
      ? t("workspace.alerts.denied")
      : t("workspace.alerts.enable");
  return `
    <button
      id="workspace-completion-alert-toggle"
      type="button"
      class="workspace-sidebar-alert-btn ${enabled ? "workspace-sidebar-alert-btn-active" : ""}"
      aria-label="${escapeHtml(title)}"
      title="${escapeHtml(title)}"
      aria-pressed="${enabled ? "true" : "false"}"
      ${disabled ? "disabled" : ""}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M6.8 10.2a5.2 5.2 0 0 1 10.4 0v3.5l1.4 2.4H5.4l1.4-2.4v-3.5Z"></path>
        <path d="M10 18.2a2.2 2.2 0 0 0 4 0"></path>
      </svg>
    </button>
  `;
}

function renderWorkspaceSidebar(selectedSessionId = "") {
  const projectMap = new Map(state.sessions.projects.map((project) => [project.projectId, project]));
  const filteredSessions = getWorkspaceFilteredSessions();
  const localeOptions = listSupportedLocales();
  const projectOrder = state.sessions.projects
    .map((project) => project.projectId)
    .filter((projectId) => filteredSessions.some((session) => session.projectId === projectId));
  const groupedProjectIds = new Set(projectOrder);
  const orphanProjectIds = [
    ...new Set(
      filteredSessions
        .map((session) => session.projectId)
        .filter((projectId) => projectId && !groupedProjectIds.has(projectId)),
    ),
  ];
  const sidebarGroups = [...projectOrder, ...orphanProjectIds]
    .map((projectId) => {
      const project = projectMap.get(projectId) || { name: projectId, path: "" };
      const sessions = filteredSessions.filter((session) => session.projectId === projectId);
      return { projectId, project, sessions };
    })
    .filter((group) => group.sessions.length > 0);
  const groupedSessionsHtml =
    sidebarGroups.length > 0
      ? sidebarGroups
          .map((group) => {
            const collapsed = state.workspace.collapsedProjectIds.has(group.projectId);
            return `
              <section class="workspace-session-project-group ${collapsed ? "workspace-session-project-group-collapsed" : ""}">
                <button
                  type="button"
                  class="workspace-session-project-head"
                  data-toggle-project="${escapeHtml(group.projectId)}"
                  aria-expanded="${collapsed ? "false" : "true"}"
                >
                  <span class="workspace-session-project-main">
                    <svg class="workspace-session-project-chevron" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                      <path d="M6 3.5 10.5 8 6 12.5"></path>
                    </svg>
                    <span class="workspace-session-project-title">${escapeHtml(group.project?.name || group.projectId)}</span>
                  </span>
                  <span class="workspace-session-project-count">${group.sessions.length}</span>
                </button>
                <div class="workspace-session-project-body" ${collapsed ? "hidden" : ""}>
                  ${
                    group.project?.path
                      ? `<div class="workspace-session-project-path">${escapeHtml(shortenText(group.project.path, 72))}</div>`
                      : ""
                  }
                  ${group.sessions
                    .map((session) => {
                      const displayStatus = getSessionDisplayStatus(session);
                      const showStatusPill = ["starting", "running", "stopping", "failed"].includes(displayStatus);
                      const selected = session.sessionId === selectedSessionId;
                      const unreadCount = getWorkspaceUnreadCount(session, selectedSessionId);
                      const taskSummary = getSessionTaskSummary(session);
                      const stateClass = isSessionLiveBusy(session)
                        ? "workspace-session-item-running"
                        : displayStatus === "failed"
                          ? "workspace-session-item-failed"
                          : "";
                      return `
                        <button
                          type="button"
                          class="workspace-session-item ${selected ? "workspace-session-item-active" : ""} ${stateClass}"
                          data-open-session="${session.sessionId}"
                        >
                          <div class="workspace-session-item-head">
                            <span class="workspace-session-item-title-wrap">
                              <span class="workspace-session-status-dot ${statusClass(displayStatus)}"></span>
                              <span class="workspace-session-item-title">${escapeHtml(session.title || t("workspace.session.untitled"))}</span>
                            </span>
                            <span class="workspace-session-item-badges">
                              ${renderWorkspaceUnreadBadge(unreadCount)}
                              ${renderWorkspaceQueueBadges(session)}
                              ${renderWorkspaceSessionTaskIcon(session)}
                              ${showStatusPill ? `<span class="pill ${statusClass(displayStatus)}">${escapeHtml(sessionStatusLabel(displayStatus))}</span>` : ""}
                            </span>
                          </div>
                          ${
                            taskSummary
                              ? `<div class="workspace-session-item-task">${escapeHtml(shortenText(taskSummary, 96))}</div>`
                              : ""
                          }
                          ${
                            session.lastAssistantContent
                              ? `<div class="workspace-session-item-preview">${escapeHtml(shortenText(session.lastAssistantContent, 90))}</div>`
                              : session.lastCommand
                                ? `<div class="workspace-session-item-preview">${escapeHtml(shortenText(session.lastCommand, 90))}</div>`
                                : ""
                          }
                        </button>
                      `;
                    })
                    .join("")}
                </div>
              </section>
            `;
          })
          .join("")
      : "";

  return `
    <div class="workspace-sidebar-shell">
      <div class="workspace-sidebar-head">
        <div class="workspace-sidebar-brand">
          <p class="workspace-sidebar-eyebrow">Syncodex</p>
        </div>
        <div class="workspace-sidebar-head-actions">
          ${renderCompletionAlertToggle()}
          <div class="workspace-sidebar-locale">
            <button
              id="workspace-locale-toggle"
              type="button"
              class="workspace-sidebar-locale-btn"
              aria-label="${escapeHtml(t("workspace.language.select"))}"
              title="${escapeHtml(t("workspace.language.select"))}"
              aria-expanded="${state.workspace.localeMenuOpen ? "true" : "false"}"
              aria-haspopup="menu"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <circle cx="12" cy="12" r="8"></circle>
                <path d="M4 12h16"></path>
                <path d="M12 4c2.4 2.2 3.8 5 3.8 8s-1.4 5.8-3.8 8c-2.4-2.2-3.8-5-3.8-8s1.4-5.8 3.8-8z"></path>
              </svg>
            </button>
            ${
              state.workspace.localeMenuOpen
                ? `
                  <div id="workspace-locale-menu" class="workspace-sidebar-locale-menu" role="menu" aria-label="${escapeHtml(t("workspace.language.select"))}">
                    ${localeOptions
                      .map(
                        (option) => `
                          <button
                            type="button"
                            class="workspace-sidebar-locale-option ${getCurrentLocale() === option.id ? "workspace-sidebar-locale-option-active" : ""}"
                            data-workspace-locale="${escapeHtml(option.id)}"
                            role="menuitemradio"
                            aria-checked="${getCurrentLocale() === option.id ? "true" : "false"}"
                          >
                            ${escapeHtml(option.label)}
                          </button>
                        `,
                      )
                      .join("")}
                  </div>
                `
                : ""
            }
          </div>
          <button id="workspace-import-session" type="button" class="workspace-sidebar-import-btn" title="${escapeHtml(t("workspace.sidebar.import"))}" aria-label="${escapeHtml(t("workspace.sidebar.import"))}">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M12 4v10"></path>
              <path d="M8 10l4 4 4-4"></path>
              <path d="M4 18v2h16v-2"></path>
            </svg>
          </button>
          <button id="workspace-sidebar-close" type="button" class="workspace-sidebar-close" aria-label="${escapeHtml(t("workspace.closeSidebar"))}">
            ☰
          </button>
        </div>
      </div>

      <div class="workspace-sidebar-actions">
        <button id="workspace-create-session" type="button" class="primary-button">${escapeHtml(t("workspace.sidebar.newSession"))}</button>
      </div>

      <div class="workspace-session-list" id="workspace-session-list">
        ${
          filteredSessions.length > 0
            ? groupedSessionsHtml
            : `<div class="workspace-session-empty">${escapeHtml(t("workspace.sidebar.empty"))}</div>`
        }
      </div>
    </div>
  `;
}

function patchWorkspaceSidebar(selectedSessionId = "") {
  const slot = document.querySelector("#workspace-sidebar");
  if (!(slot instanceof HTMLElement)) {
    return;
  }

  slot.innerHTML = renderWorkspaceSidebar(selectedSessionId);
  bindWorkspaceSidebarControls(selectedSessionId);
}

function cleanupWorkspaceSessionsRefresh() {
  if (state.workspace.sessionsRefreshTimerId) {
    window.clearTimeout(state.workspace.sessionsRefreshTimerId);
    state.workspace.sessionsRefreshTimerId = 0;
  }
}

function isWorkspaceSidebarControlFocused() {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return false;
  }
  if (!activeElement.closest("#workspace-sidebar")) {
    return false;
  }
  return ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement.tagName);
}

function scheduleWorkspaceSessionsRefresh(delayMs = WORKSPACE_SESSIONS_REFRESH_MS) {
  cleanupWorkspaceSessionsRefresh();
  state.workspace.sessionsRefreshTimerId = window.setTimeout(async () => {
    state.workspace.sessionsRefreshTimerId = 0;
    await refreshWorkspaceSessionsForSidebar().catch(() => null);
    if (document.querySelector("#workspace-sidebar")) {
      scheduleWorkspaceSessionsRefresh(WORKSPACE_SESSIONS_REFRESH_MS);
    }
  }, delayMs);
}

async function refreshWorkspaceSessionsForSidebar() {
  if (state.workspace.sessionsRefreshInFlight) {
    return;
  }

  state.workspace.sessionsRefreshInFlight = true;
  try {
    const sessions = await getSessions();
    if (!sessions || !Array.isArray(sessions.items)) {
      return;
    }

    state.sessions.items = sessions.items;
    reconcileWorkspaceReadMarkers(state.sessions.items);
    const selectedSessionId = state.workspace.activeSessionId || state.detail.session?.sessionId || "";
    const activeSessionSummary = sessions.items.find((item) => item.sessionId === selectedSessionId);
    if (activeSessionSummary && state.detail.session?.sessionId === selectedSessionId) {
      const previousOfficialCount = getOfficialQueueCount(state.detail.session);
      const nextOfficialCount = getOfficialQueueCount(activeSessionSummary);
      const detailNeedsRefresh =
        previousOfficialCount !== nextOfficialCount ||
        hasActiveSessionSummaryChanged(state.detail.session, activeSessionSummary);
      if (detailNeedsRefresh) {
        const wasBusyBeforeRefresh = isSessionLiveBusy(state.detail.session);
        const previousCursor = state.detail.cursor || 0;
        const refreshedSession = await getSession(selectedSessionId).catch(() => null);
        if (refreshedSession && state.detail.session?.sessionId === selectedSessionId) {
          state.detail.session = refreshedSession;
          syncDetailPendingApproval(refreshedSession, state.detail.timelineState);
          updateSessionListItem(refreshedSession);
          await catchUpSessionEvents(selectedSessionId, previousCursor, {
            wasBusy: wasBusyBeforeRefresh,
          }).catch(() => null);
          void maybeFlushMobileSendQueue("session-summary-refresh");
          scheduleSessionDetailRender();
        } else if (state.detail.session?.sessionId === selectedSessionId) {
          state.detail.session = {
            ...state.detail.session,
            status: activeSessionSummary.status,
            liveBusy: activeSessionSummary.liveBusy,
            sourceRolloutHasOpenTurn: activeSessionSummary.sourceRolloutHasOpenTurn,
            updatedAt: activeSessionSummary.updatedAt,
            lastEventAt: activeSessionSummary.lastEventAt,
            eventCount: Math.max(
              getSessionActivityCount(state.detail.session),
              getSessionActivityCount(activeSessionSummary),
            ),
            latestPlan: activeSessionSummary.latestPlan || state.detail.session.latestPlan || null,
            hasTaskPlan: Boolean(activeSessionSummary.hasTaskPlan ?? state.detail.session.hasTaskPlan),
            lastAssistantContent:
              activeSessionSummary.lastAssistantContent ?? state.detail.session.lastAssistantContent ?? "",
            lastCommand: activeSessionSummary.lastCommand ?? state.detail.session.lastCommand ?? "",
            officialQueueCount: activeSessionSummary.officialQueueCount,
            officialQueuedFollowupCount: activeSessionSummary.officialQueuedFollowupCount,
            hasOfficialQueue: activeSessionSummary.hasOfficialQueue,
            officialQueuedFollowUpsPreview: activeSessionSummary.officialQueuedFollowUpsPreview,
          };
          void maybeFlushMobileSendQueue("session-summary-fallback");
          scheduleSessionDetailRender();
        }
      } else {
        state.detail.session = {
          ...state.detail.session,
          officialQueueCount: activeSessionSummary.officialQueueCount,
          officialQueuedFollowupCount: activeSessionSummary.officialQueuedFollowupCount,
          hasOfficialQueue: activeSessionSummary.hasOfficialQueue,
          officialQueuedFollowUpsPreview: activeSessionSummary.officialQueuedFollowUpsPreview,
        };
      }
    }
    markWorkspaceSessionSeen(selectedSessionId);
    if (!isWorkspaceSidebarControlFocused()) {
      patchWorkspaceSidebar(selectedSessionId);
    }
  } finally {
    state.workspace.sessionsRefreshInFlight = false;
  }
}

function patchWorkspaceModalSlot() {
  const slot = document.querySelector("#workspace-modal-slot");
  if (!(slot instanceof HTMLElement)) {
    return;
  }

  slot.innerHTML = renderWorkspaceModalSlot();
  bindWorkspaceCreateDialogControls();
  bindWorkspaceImportDialogControls();
}

function isComposerTextareaFocused() {
  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLTextAreaElement &&
    activeElement.name === "content" &&
    Boolean(activeElement.closest("#session-composer-slot"))
  );
}

function closeWorkspaceCreateDialog() {
  state.workspace.createDialog.open = false;
  state.workspace.createDialog.mode = "pick-project";
  state.workspace.createDialog.startMode = "project";
  state.workspace.createDialog.submitting = false;
  state.workspace.createDialog.selectedProjectId = "";
  state.workspace.createDialog.projectName = "";
  state.workspace.createDialog.projectPath = "";
  state.workspace.createDialog.customCwd = "";
  state.workspace.createDialog.modelId = "";
  state.workspace.createDialog.reasoningId = "";
  state.workspace.createDialog.browserLoading = false;
  state.workspace.createDialog.browserCurrentPath = "";
  state.workspace.createDialog.browserParentPath = "";
  state.workspace.createDialog.browserItems = [];
  state.workspace.createDialog.error = "";
  patchWorkspaceModalSlot();
}

function openWorkspaceCreateSessionDialog() {
  const projects = Array.isArray(state.sessions.projects) ? state.sessions.projects : [];
  const prefs = readCreateSessionPrefs();
  const preferredProjectId =
    state.detail.session?.projectId && projects.some((project) => project.projectId === state.detail.session.projectId)
      ? state.detail.session.projectId
      : projects[0]?.projectId || "";
  const preferredProject = projects.find((project) => project.projectId === preferredProjectId) || projects[0] || null;
  const defaultLaunch = getDefaultCreateSessionCodexLaunch();
  state.workspace.createDialog.open = true;
  state.workspace.createDialog.mode = "pick-project";
  state.workspace.createDialog.startMode = normalizeCreateSessionStartMode(prefs.startMode);
  state.workspace.createDialog.submitting = false;
  state.workspace.createDialog.selectedProjectId = preferredProjectId;
  state.workspace.createDialog.firstMessage = "";
  state.workspace.createDialog.customCwd =
    prefs.cwd || state.detail.session?.projectPath || preferredProject?.path || "";
  state.workspace.createDialog.modelId = prefs.modelId || defaultLaunch.modelId || "";
  state.workspace.createDialog.reasoningId = prefs.reasoningId || defaultLaunch.reasoningId || "medium";
  state.workspace.createDialog.projectName = "";
  state.workspace.createDialog.projectPath = "";
  state.workspace.createDialog.browserLoading = false;
  state.workspace.createDialog.browserCurrentPath = "";
  state.workspace.createDialog.browserParentPath = "";
  state.workspace.createDialog.browserItems = [];
  state.workspace.createDialog.error = "";
  patchWorkspaceModalSlot();
}

async function submitWorkspaceCreateSession() {
  const dialogState = state.workspace.createDialog;
  const startMode = normalizeCreateSessionStartMode(dialogState.startMode);
  const projectId = String(dialogState.selectedProjectId || "").trim();
  const customCwd = String(dialogState.customCwd || "").trim();
  const message = String(dialogState.firstMessage || "").trim();
  if (!message) {
    state.workspace.createDialog.error = t("workspace.create.firstMessageRequired");
    patchWorkspaceModalSlot();
    return;
  }
  if (startMode === "project" && !projectId) {
    return;
  }
  if (startMode === "custom" && !customCwd) {
    state.workspace.createDialog.error = t("workspace.create.customCwdRequired");
    patchWorkspaceModalSlot();
    return;
  }

  state.workspace.createDialog.submitting = true;
  state.workspace.createDialog.error = "";
  patchWorkspaceModalSlot();

  try {
    const payload = {
      message,
      modelId: String(dialogState.modelId || "").trim(),
      reasoningId: String(dialogState.reasoningId || "").trim(),
    };
    if (startMode === "custom") {
      payload.cwd = customCwd;
    } else {
      payload.projectId = projectId;
    }
    const session = await createSession(payload);
    writeCreateSessionPrefsFromDialog();
    closeWorkspaceCreateDialog();
    window.location.hash = buildSessionDetailHash(
      session.sessionId,
      state.detail.filter,
      state.detail.severity,
      state.detail.search,
      state.detail.autoScroll,
    );
  } catch (error) {
    state.workspace.createDialog.submitting = false;
    state.workspace.createDialog.error = messageOf(error);
    patchWorkspaceModalSlot();
  }
}

async function submitWorkspaceProjectDialog() {
  const pathValue = String(state.workspace.createDialog.projectPath || "").trim();
  const requestedProjectName = String(state.workspace.createDialog.projectName || "").trim();
  const createInSelectedDirectory = Boolean(requestedProjectName);
  const nameValue = createInSelectedDirectory ? requestedProjectName : deriveProjectNameFromPath(pathValue);

  if (!pathValue) {
    state.workspace.createDialog.error = t("workspace.create.pathRequired");
    patchWorkspaceModalSlot();
    return;
  }

  state.workspace.createDialog.submitting = true;
  state.workspace.createDialog.error = "";
  patchWorkspaceModalSlot();

  try {
    const targetPath = createInSelectedDirectory ? joinProjectPath(pathValue, nameValue) : pathValue;
    const project =
      findExistingProjectByPath(targetPath) ||
      (await createProject({
        name: nameValue,
        path: targetPath,
        createMissing: createInSelectedDirectory,
      }));
    const session = await createSession({ projectId: project.projectId });
    closeWorkspaceCreateDialog();
    window.location.hash = buildSessionDetailHash(
      session.sessionId,
      state.detail.filter,
      state.detail.severity,
      state.detail.search,
      state.detail.autoScroll,
    );
  } catch (error) {
    state.workspace.createDialog.submitting = false;
    state.workspace.createDialog.error = messageOf(error);
    patchWorkspaceModalSlot();
  }
}

async function loadWorkspaceProjectBrowser(pathValue = "") {
  state.workspace.createDialog.browserLoading = true;
  state.workspace.createDialog.error = "";
  patchWorkspaceModalSlot();

  try {
    const result = await browseProjectDirectories(pathValue);
    state.workspace.createDialog.browserCurrentPath = String(result?.currentPath || "");
    state.workspace.createDialog.projectPath = String(result?.currentPath || "");
    state.workspace.createDialog.browserParentPath = String(result?.parentPath || "");
    state.workspace.createDialog.browserItems = Array.isArray(result?.items) ? result.items : [];
    state.workspace.createDialog.browserLoading = false;
  } catch (error) {
    state.workspace.createDialog.browserLoading = false;
    state.workspace.createDialog.error = messageOf(error);
  }

  patchWorkspaceModalSlot();
}

function openWorkspaceProjectCreateMode(mode) {
  state.workspace.createDialog.mode = mode;
  state.workspace.createDialog.firstMessage = "";
  state.workspace.createDialog.projectName = "";
  state.workspace.createDialog.projectPath = "";
  state.workspace.createDialog.browserLoading = false;
  state.workspace.createDialog.browserCurrentPath = "";
  state.workspace.createDialog.browserParentPath = "";
  state.workspace.createDialog.browserItems = [];
  state.workspace.createDialog.error = "";
  patchWorkspaceModalSlot();
  void loadWorkspaceProjectBrowser(getDefaultWorkspaceProjectBrowsePath());
}

function closeWorkspaceImportDialog() {
  state.workspace.importDialog.open = false;
  state.workspace.importDialog.loading = false;
  state.workspace.importDialog.submitting = false;
  state.workspace.importDialog.query = "";
  state.workspace.importDialog.selectedRolloutPath = "";
  state.workspace.importDialog.error = "";
  patchWorkspaceModalSlot();
}

async function openWorkspaceImportDialog() {
  state.workspace.importDialog.open = true;
  state.workspace.importDialog.loading = true;
  state.workspace.importDialog.submitting = false;
  state.workspace.importDialog.query = "";
  state.workspace.importDialog.selectedRolloutPath = "";
  state.workspace.importDialog.error = "";
  patchWorkspaceModalSlot();

  try {
    const importable = await getImportableCodexSessions();
    const items = Array.isArray(importable?.items) ? importable.items : [];
    state.workspace.importDialog.items = items;
    state.workspace.importDialog.loading = false;
    state.workspace.importDialog.selectedRolloutPath = items[0]?.rolloutPath || "";
  } catch (error) {
    state.workspace.importDialog.loading = false;
    state.workspace.importDialog.error = messageOf(error);
  }

  patchWorkspaceModalSlot();
}

async function submitWorkspaceImportDialog() {
  const selected = getSelectedWorkspaceImportItem();
  if (!selected) {
    return;
  }

  state.workspace.importDialog.submitting = true;
  patchWorkspaceModalSlot();

  try {
    let sessionId = selected.importedSessionId || "";
    if (sessionId) {
      await syncImportedSession(sessionId);
    } else {
      const result = await importCodexSession({ rolloutPath: selected.rolloutPath });
      sessionId = String(result?.sessionId || "").trim();
    }

    closeWorkspaceImportDialog();

    if (sessionId) {
      if (state.workspace.activeSessionId === sessionId) {
        await renderSessionDetailPage(sessionId);
        patchWorkspaceSidebar(sessionId);
      } else {
        window.location.hash = buildSessionDetailHash(
          sessionId,
          state.detail.filter,
          state.detail.severity,
          state.detail.search,
          state.detail.autoScroll,
        );
      }
    }
  } catch (error) {
    state.workspace.importDialog.submitting = false;
    state.workspace.importDialog.error = messageOf(error);
    patchWorkspaceModalSlot();
  }
}

function bindWorkspaceImportDialogControls() {
  const overlay = document.querySelector(".workspace-import-dialog-overlay");
  if (overlay instanceof HTMLElement) {
    overlay.onclick = () => {
      closeWorkspaceImportDialog();
    };
  }

  const closeButton = document.querySelector("#workspace-import-dialog-close");
  if (closeButton instanceof HTMLButtonElement) {
    closeButton.onclick = () => {
      closeWorkspaceImportDialog();
    };
  }

  const searchInput = document.querySelector("#workspace-import-dialog-search");
  if (searchInput instanceof HTMLInputElement) {
    searchInput.oninput = (event) => {
      state.workspace.importDialog.query = event.currentTarget.value;
      const visibleItems = getWorkspaceImportDialogItems();
      if (!visibleItems.some((item) => item.rolloutPath === state.workspace.importDialog.selectedRolloutPath)) {
        state.workspace.importDialog.selectedRolloutPath = visibleItems[0]?.rolloutPath || "";
      }
      patchWorkspaceModalSlot();
    };
  }

  document.querySelectorAll("[data-import-rollout]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.onclick = () => {
      state.workspace.importDialog.selectedRolloutPath = button.getAttribute("data-import-rollout") || "";
      patchWorkspaceModalSlot();
    };
  });

  const submitButton = document.querySelector("#workspace-import-dialog-submit");
  if (submitButton instanceof HTMLButtonElement) {
    submitButton.onclick = async () => {
      await submitWorkspaceImportDialog();
    };
  }
}

function bindWorkspaceCreateDialogControls() {
  const overlay = document.querySelector(".workspace-modal-overlay");
  if (overlay instanceof HTMLElement) {
    overlay.onclick = () => {
      closeWorkspaceCreateDialog();
    };
  }

  const closeButton = document.querySelector("#workspace-create-dialog-close");
  if (closeButton instanceof HTMLButtonElement) {
    closeButton.onclick = () => {
      closeWorkspaceCreateDialog();
    };
  }

  const backButton = document.querySelector("#workspace-create-dialog-back");
  if (backButton instanceof HTMLButtonElement) {
    backButton.onclick = () => {
      state.workspace.createDialog.mode = "pick-project";
      state.workspace.createDialog.projectName = "";
      state.workspace.createDialog.projectPath = "";
      state.workspace.createDialog.browserLoading = false;
      state.workspace.createDialog.browserCurrentPath = "";
      state.workspace.createDialog.browserParentPath = "";
      state.workspace.createDialog.browserItems = [];
      state.workspace.createDialog.error = "";
      patchWorkspaceModalSlot();
    };
  }

  const createProjectButton = document.querySelector("#workspace-open-project-directory");
  if (createProjectButton instanceof HTMLButtonElement) {
    createProjectButton.onclick = () => {
      openWorkspaceProjectCreateMode("project-directory");
    };
  }

  const nameInput = document.querySelector("#workspace-project-name");
  if (nameInput instanceof HTMLInputElement) {
    nameInput.oninput = (event) => {
      state.workspace.createDialog.projectName = event.currentTarget.value;
    };
  }

  const pathInput = document.querySelector("#workspace-project-browser-path");
  if (pathInput instanceof HTMLInputElement) {
    pathInput.oninput = (event) => {
      const value = event.currentTarget.value;
      state.workspace.createDialog.browserCurrentPath = value;
      state.workspace.createDialog.projectPath = value;
    };
    pathInput.onkeydown = async (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      const nextPath = String(pathInput.value || "").trim();
      if (!nextPath) {
        return;
      }
      await loadWorkspaceProjectBrowser(nextPath);
    };
  }

  const browseUpButton = document.querySelector("#workspace-project-browse-up");
  if (browseUpButton instanceof HTMLButtonElement) {
    browseUpButton.onclick = async () => {
      const nextPath =
        String(state.workspace.createDialog.browserParentPath || "").trim() ||
        "";
      await loadWorkspaceProjectBrowser(nextPath);
    };
  }

  document.querySelectorAll("[data-browse-path]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    };
    button.onclick = async () => {
      const nextPath = button.getAttribute("data-browse-path") || "";
      await loadWorkspaceProjectBrowser(nextPath);
    };
  });

  document.querySelectorAll("[data-select-project]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.onclick = () => {
      state.workspace.createDialog.selectedProjectId = button.getAttribute("data-select-project") || "";
      state.workspace.createDialog.startMode = "project";
      patchWorkspaceModalSlot();
    };
  });

  document.querySelectorAll("[data-create-start-mode]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.onclick = () => {
      state.workspace.createDialog.startMode = normalizeCreateSessionStartMode(
        button.getAttribute("data-create-start-mode"),
      );
      state.workspace.createDialog.error = "";
      patchWorkspaceModalSlot();
    };
  });

  const customCwdInput = document.querySelector("#workspace-create-custom-cwd");
  if (customCwdInput instanceof HTMLInputElement) {
    customCwdInput.oninput = (event) => {
      state.workspace.createDialog.customCwd = event.currentTarget.value;
      state.workspace.createDialog.error = "";
      syncWorkspaceCreateSessionSubmitButton();
    };
    customCwdInput.onkeydown = async (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      await submitWorkspaceCreateSession();
    };
  }

  const modelSelect = document.querySelector("#workspace-create-model");
  if (modelSelect instanceof HTMLSelectElement) {
    modelSelect.onchange = (event) => {
      state.workspace.createDialog.modelId = event.currentTarget.value;
    };
  }

  const reasoningSelect = document.querySelector("#workspace-create-reasoning");
  if (reasoningSelect instanceof HTMLSelectElement) {
    reasoningSelect.onchange = (event) => {
      state.workspace.createDialog.reasoningId = event.currentTarget.value;
    };
  }

  const firstMessageInput = document.querySelector("#workspace-create-first-message");
  if (firstMessageInput instanceof HTMLTextAreaElement) {
    firstMessageInput.oninput = (event) => {
      state.workspace.createDialog.firstMessage = event.currentTarget.value;
      state.workspace.createDialog.error = "";
      syncWorkspaceCreateSessionSubmitButton();
    };
  }

  const submitSessionButton = document.querySelector("#workspace-create-session-submit");
  if (submitSessionButton instanceof HTMLButtonElement) {
    submitSessionButton.onclick = async () => {
      await submitWorkspaceCreateSession();
    };
  }

  const submitProjectButton = document.querySelector("#workspace-project-submit");
  if (submitProjectButton instanceof HTMLButtonElement) {
    submitProjectButton.onclick = async () => {
      await submitWorkspaceProjectDialog();
    };
  }
}

async function toggleCompletionAlerts(selectedSessionId = "") {
  const current = state.workspace.completionAlerts || {};
  if (current.enabled) {
    state.workspace.completionAlerts = { enabled: false, browser: false, vibration: false };
    writeCompletionAlertPrefs();
    patchWorkspaceSidebar(selectedSessionId);
    showToast(t("workspace.alerts.disabledToast"));
    return;
  }

  let permission = getNotificationPermission();
  let browser = false;
  if (permission === "default") {
    try {
      permission = await window.Notification.requestPermission();
    } catch {
      permission = getNotificationPermission();
    }
  }
  browser = permission === "granted";
  const vibration = canUseVibration();
  const enabled = browser || vibration;

  state.workspace.completionAlerts = { enabled, browser, vibration };
  writeCompletionAlertPrefs();
  patchWorkspaceSidebar(selectedSessionId);

  if (enabled) {
    showToast(
      browser
        ? t("workspace.alerts.enabledToast")
        : t("workspace.alerts.vibrationOnlyToast"),
    );
  } else if (permission === "denied") {
    showToast(t("workspace.alerts.deniedToast"));
  } else {
    showToast(t("workspace.alerts.unsupportedToast"));
  }
}

function bindWorkspaceSidebarControls(selectedSessionId = "") {
  const toggleButton = document.querySelector("#workspace-sidebar-toggle");
  if (toggleButton instanceof HTMLButtonElement) {
    toggleButton.onclick = () => {
      state.workspace.sidebarCollapsed = !state.workspace.sidebarCollapsed;
      state.workspace.localeMenuOpen = false;
      writeWorkspaceUiState();
      syncWorkspaceShellState();
      patchWorkspaceSidebar(selectedSessionId);
    };
  }

  const overlay = document.querySelector("#workspace-sidebar-overlay");
  if (overlay instanceof HTMLElement) {
    overlay.onclick = () => {
      if (state.workspace.sidebarCollapsed) {
        return;
      }
      state.workspace.sidebarCollapsed = true;
      state.workspace.localeMenuOpen = false;
      writeWorkspaceUiState();
      syncWorkspaceShellState();
      patchWorkspaceSidebar(selectedSessionId);
    };
  }

  const closeButton = document.querySelector("#workspace-sidebar-close");
  if (closeButton instanceof HTMLButtonElement) {
    closeButton.onclick = () => {
      state.workspace.sidebarCollapsed = true;
      state.workspace.localeMenuOpen = false;
      writeWorkspaceUiState();
      syncWorkspaceShellState();
      patchWorkspaceSidebar(selectedSessionId);
    };
  }

  const localeToggle = document.querySelector("#workspace-locale-toggle");
  if (localeToggle instanceof HTMLButtonElement) {
    localeToggle.onclick = (event) => {
      event.stopPropagation();
      state.workspace.localeMenuOpen = !state.workspace.localeMenuOpen;
      patchWorkspaceSidebar(selectedSessionId);
    };
  }

  const completionAlertToggle = document.querySelector("#workspace-completion-alert-toggle");
  if (completionAlertToggle instanceof HTMLButtonElement) {
    completionAlertToggle.onclick = async (event) => {
      event.stopPropagation();
      await toggleCompletionAlerts(selectedSessionId);
    };
  }

  document.querySelectorAll("[data-workspace-locale]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.onclick = () => {
      const nextLocale = String(button.dataset.workspaceLocale || "").trim();
      if (!nextLocale) {
        return;
      }
      state.workspace.localeMenuOpen = false;
      state.ui.locale = setCurrentLocale(nextLocale);
      applyDocumentLocale();
      renderRoute();
    };
  });

  const createButton = document.querySelector("#workspace-create-session");
  if (createButton instanceof HTMLButtonElement) {
    createButton.onclick = async () => {
      state.workspace.localeMenuOpen = false;
      try {
        openWorkspaceCreateSessionDialog();
      } catch (error) {
        showToast(messageOf(error));
      }
    };
  }

  const importButton = document.querySelector("#workspace-import-session");
  if (importButton instanceof HTMLButtonElement) {
    importButton.onclick = async () => {
      state.workspace.localeMenuOpen = false;
      try {
        await handleImportCodexSession();
      } catch (error) {
        showToast(messageOf(error));
      }
    };
  }

  const emptyCreateButton = document.querySelector("#workspace-empty-create-session");
  if (emptyCreateButton instanceof HTMLButtonElement) {
    emptyCreateButton.onclick = async () => {
      try {
        openWorkspaceCreateSessionDialog();
      } catch (error) {
        showToast(messageOf(error));
      }
    };
  }

  const emptyImportButton = document.querySelector("#workspace-empty-import-session");
  if (emptyImportButton instanceof HTMLButtonElement) {
    emptyImportButton.onclick = async () => {
      try {
        await handleImportCodexSession();
      } catch (error) {
        showToast(messageOf(error));
      }
    };
  }

  const searchInput = document.querySelector("#workspace-session-search");
  if (searchInput instanceof HTMLInputElement) {
    searchInput.oninput = (event) => {
      state.sessions.keyword = event.currentTarget.value;
      patchWorkspaceSidebar(selectedSessionId);
    };
  }

  const statusSelect = document.querySelector("#workspace-session-status");
  if (statusSelect instanceof HTMLSelectElement) {
    statusSelect.onchange = (event) => {
      state.sessions.status = event.currentTarget.value;
      patchWorkspaceSidebar(selectedSessionId);
    };
  }

  const projectSelect = document.querySelector("#workspace-session-project");
  if (projectSelect instanceof HTMLSelectElement) {
    projectSelect.onchange = (event) => {
      state.sessions.projectId = event.currentTarget.value;
      patchWorkspaceSidebar(selectedSessionId);
    };
  }

  document.querySelectorAll("[data-toggle-project]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.onclick = () => {
      const projectId = String(button.dataset.toggleProject || "").trim();
      if (!projectId) {
        return;
      }
      if (state.workspace.collapsedProjectIds.has(projectId)) {
        state.workspace.collapsedProjectIds.delete(projectId);
      } else {
        state.workspace.collapsedProjectIds.add(projectId);
      }
      writeWorkspaceUiState();
      patchWorkspaceSidebar(selectedSessionId);
    };
  });

  document.querySelectorAll("[data-open-session]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.onclick = () => {
      const sessionId = button.getAttribute("data-open-session");
      if (!sessionId || sessionId === selectedSessionId) {
        return;
      }
      if (isMobileWorkspaceViewport()) {
        state.workspace.sidebarCollapsed = true;
        writeWorkspaceUiState();
        syncWorkspaceShellState();
      }
      window.location.hash = buildSessionDetailHash(
        sessionId,
        state.detail.filter,
        state.detail.severity,
        state.detail.search,
        state.detail.autoScroll,
      );
    };
  });
}

async function renderWorkspacePage(routeSessionId) {
  if (isMobileWorkspaceViewport()) {
    state.workspace.sidebarCollapsed = true;
  }

  app.innerHTML = renderWorkspaceShell({
    sidebarHtml: renderWorkspaceSidebar(""),
    mainHtml: loadingCard(t("workspace.loading.session")),
  });
  syncWorkspaceShellState();
  bindWorkspaceCreateDialogControls();
  bindWorkspaceImportDialogControls();

  try {
    const [sessions, projects] = await Promise.all([getSessions(), getProjects()]);
    state.sessions.items = sessions.items;
    state.sessions.projects = projects.items;
    reconcileWorkspaceReadMarkers(state.sessions.items);

    const selectedSessionId = resolveWorkspaceSessionId(routeSessionId);
    state.workspace.activeSessionId = selectedSessionId;
    markWorkspaceSessionSeen(selectedSessionId);

    patchWorkspaceSidebar(selectedSessionId);
    scheduleWorkspaceSessionsRefresh();

    if (!selectedSessionId) {
      const mainSlot = document.querySelector("#workspace-main-slot");
      if (mainSlot) {
        mainSlot.innerHTML = renderWorkspaceEmptyState();
      }
      bindWorkspaceSidebarControls("");
      return;
    }

    if (routeSessionId !== selectedSessionId) {
      const nextHash = buildSessionDetailHash(
        selectedSessionId,
        state.detail.filter,
        state.detail.severity,
        state.detail.search,
        state.detail.autoScroll,
      );
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState(null, "", nextHash);
        state.route = nextHash;
      } else {
        window.location.hash = nextHash;
        return;
      }
    }

    await renderSessionDetailPage(selectedSessionId);
    patchWorkspaceSidebar(selectedSessionId);
  } catch (error) {
    app.innerHTML = renderWorkspaceShell({
      sidebarHtml: renderWorkspaceSidebar(""),
      mainHtml: errorCard(messageOf(error)),
    });
    syncWorkspaceShellState();
    bindWorkspaceCreateDialogControls();
    bindWorkspaceImportDialogControls();
    bindWorkspaceSidebarControls("");
  }
}

async function renderProjectsPage() {
  app.innerHTML = renderAppChrome({
    variant: "marketing",
    bodyHtml: loadingCard(t("workspace.loading.projects")),
  });

  try {
    const [projects, health] = await Promise.all([getProjects(), getHealth()]);

    app.innerHTML = renderAppChrome({
      variant: "marketing",
      bodyHtml: `
      <section class="stack">
        <article class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">${escapeHtml(t("projects.runtimeEyebrow"))}</p>
              <h2>${escapeHtml(t("projects.healthTitle"))}</h2>
            </div>
            <span class="pill pill-success">${escapeHtml(t("generic.online"))}</span>
          </div>
          <div class="meta-grid">
            <div>
              <span class="meta-label">${escapeHtml(t("projects.codexCommand"))}</span>
              <strong>${escapeHtml(health.codexCommand)}</strong>
            </div>
            <div>
              <span class="meta-label">${escapeHtml(t("projects.executionMode"))}</span>
              <strong>${escapeHtml(health.codexMode || "unknown")}</strong>
            </div>
            <div>
              <span class="meta-label">${escapeHtml(t("projects.projectRoots"))}</span>
              <strong>${escapeHtml((health.projectRoots || []).join(", "))}</strong>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">${escapeHtml(t("projects.registryEyebrow"))}</p>
              <h2>${escapeHtml(t("projects.addTitle"))}</h2>
            </div>
          </div>
          <form id="project-form" class="form-stack">
            <label>
              <span>${escapeHtml(t("projects.name"))}</span>
              <input name="name" placeholder="${escapeHtml(t("projects.namePlaceholder"))}" required />
            </label>
            <label>
              <span>${escapeHtml(t("projects.path"))}</span>
              <input name="path" placeholder="${escapeHtml(t("projects.pathPlaceholder"))}" required />
            </label>
            <button type="submit" class="primary-button">${escapeHtml(t("projects.register"))}</button>
          </form>
        </article>

        <article class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Projects</p>
              <h2>${escapeHtml(t("projects.listTitle"))}</h2>
            </div>
            <span class="pill">${escapeHtml(t("projects.count", { count: projects.items.length }))}</span>
          </div>
          <div class="card-list">
            ${projects.items
              .map(
                (project) => `
                  <article class="record-card list-row-card">
                    <div class="record-title-row">
                      <h3>${escapeHtml(project.name)}</h3>
                      <button class="secondary-button" data-create-session="${project.projectId}">
                        ${escapeHtml(t("workspace.empty.newSession"))}
                      </button>
                    </div>
                    <p class="record-path">${escapeHtml(project.path)}</p>
                    <p class="record-meta">ID: ${escapeHtml(project.projectId)}</p>
                  </article>
                `,
              )
              .join("")}
          </div>
        </article>
      </section>
    `,
    });

    document.querySelector("#project-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);

      try {
        await createProject({
          name: String(form.get("name") || ""),
          path: String(form.get("path") || ""),
        });
        renderProjectsPage();
      } catch (error) {
        showToast(messageOf(error));
      }
    });

    document.querySelectorAll("[data-create-session]").forEach((button) => {
      button.addEventListener("click", async () => {
        const projectId = button.getAttribute("data-create-session");
        const title = window.prompt(
          t("projects.promptSessionTitle"),
          t("projects.promptSessionDefault"),
        );
        if (!projectId || !title) {
          return;
        }

        try {
          const session = await createSession({ projectId, title });
          window.location.hash = `#/sessions/${session.sessionId}`;
        } catch (error) {
          showToast(messageOf(error));
        }
      });
    });
  } catch (error) {
    app.innerHTML = renderAppChrome({
      variant: "marketing",
      bodyHtml: errorCard(messageOf(error)),
    });
  }
}

async function renderSessionsPage() {
  app.innerHTML = renderAppChrome({
    variant: "compact",
    title: t("nav.sessions"),
    subtitle: "",
    backHref: "#/projects",
    bodyHtml: loadingCard(t("workspace.loading.sessions")),
  });

  try {
    const [sessions, projects] = await Promise.all([getSessions(), getProjects()]);
    state.sessions.items = sessions.items;
    state.sessions.projects = projects.items;

    renderSessionsList();
  } catch (error) {
    app.innerHTML = renderAppChrome({
      variant: "compact",
      title: t("nav.sessions"),
      subtitle: "",
      backHref: "#/projects",
      bodyHtml: errorCard(messageOf(error)),
    });
  }
}

function promptImportableCodexSession(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const promptText = [
    t("workspace.import.promptHeader"),
    "",
    ...items.map((item, index) => {
      const title = item.title || item.codexSessionId || item.rolloutPath;
      const cwd = item.cwd ? ` · ${item.cwd}` : "";
      const imported = item.importedSessionId ? ` · ${t("workspace.import.imported")} ${item.importedSessionId}` : "";
      return `${index + 1}. ${title}${cwd}${imported}`;
    }),
  ].join("\n");

  const rawValue = window.prompt(promptText, "1");
  if (!rawValue) {
    return null;
  }

  const selectedIndex = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > items.length) {
    throw new Error(t("workspace.import.invalidPrompt"));
  }

  return items[selectedIndex - 1];
}

async function handleImportCodexSession() {
  if (document.querySelector("#workspace-modal-slot")) {
    await openWorkspaceImportDialog();
    return;
  }

  const importable = await getImportableCodexSessions();
  const items = Array.isArray(importable?.items) ? importable.items : [];
  if (items.length === 0) {
    showToast(t("workspace.import.noneAvailable"));
    return;
  }

  const selected = promptImportableCodexSession(items);
  if (!selected) {
    return;
  }

  const result = await importCodexSession({
    rolloutPath: selected.rolloutPath,
  });
  if (result?.sessionId) {
    window.location.hash = `#/sessions/${result.sessionId}`;
  }
}

function renderSessionsList() {
  const projectMap = new Map(state.sessions.projects.map((project) => [project.projectId, project]));
  const filteredSessions = state.sessions.items.filter((session) =>
    matchesSessionFilters(session, projectMap.get(session.projectId), state.sessions),
  );
  const statusOptions = getSessionStatusOptions(state.sessions.items);
  const projectOptions = getSessionProjectOptions(state.sessions.projects, state.sessions.items);
  const threadOptions = getThreadFilterOptions(state.sessions.items);
  const sortOptions = getSessionSortOptions();
  const activeFilters = countActiveSessionFilters(state.sessions);
  const sortedSessions = sortSessions(filteredSessions, state.sessions.sort);
  const totalPages = getPageCount(sortedSessions.length, state.sessions.pageSize);
  state.sessions.page = clampPage(state.sessions.page, totalPages);
  const pageStart = (state.sessions.page - 1) * state.sessions.pageSize;
  const pagedSessions = sortedSessions.slice(pageStart, pageStart + state.sessions.pageSize);
  const pageNumbers = getVisiblePageNumbers(state.sessions.page, totalPages);
  const pageEnd = sortedSessions.length
    ? Math.min(pageStart + state.sessions.pageSize, sortedSessions.length)
    : 0;
  persistSessionsViewState();

  app.innerHTML = renderAppChrome({
    variant: "compact",
    title: t("nav.sessions"),
    subtitle: `${state.sessions.items.length} ${t("nav.sessions")}`,
    backHref: "#/projects",
    bodyHtml: `
    <section class="stack sessions-page-stack">
      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Sessions</p>
            <h2>${escapeHtml(t("sessions.filterListTitle"))}</h2>
          </div>
          <div class="panel-actions">
            <button id="import-codex-session" class="secondary-button">${escapeHtml(t("workspace.import.title"))}</button>
            <button id="refresh-sessions" class="secondary-button">${escapeHtml(t("generic.refresh"))}</button>
          </div>
        </div>

        <div class="session-toolbar">
          <div class="session-filter-grid">
            <label class="session-filter-field session-filter-field-wide">
              <span>${escapeHtml(t("generic.keyword"))}</span>
              <input
                id="session-search"
                value="${escapeHtml(state.sessions.keyword)}"
                placeholder="${escapeHtml(t("sessions.searchPlaceholder"))}"
              />
            </label>
            <label class="session-filter-field">
              <span>${escapeHtml(t("generic.status"))}</span>
              <select id="session-status">
                ${statusOptions
                  .map(
                    (option) => `
                      <option value="${escapeHtml(option.value)}" ${state.sessions.status === option.value ? "selected" : ""}>
                        ${escapeHtml(option.label)}
                      </option>
                    `,
                  )
                  .join("")}
              </select>
            </label>
            <label class="session-filter-field">
              <span>${escapeHtml(t("generic.project"))}</span>
              <select id="session-project">
                ${projectOptions
                  .map(
                    (option) => `
                      <option value="${escapeHtml(option.value)}" ${state.sessions.projectId === option.value ? "selected" : ""}>
                        ${escapeHtml(option.label)}
                      </option>
                    `,
                  )
                  .join("")}
              </select>
            </label>
            <label class="session-filter-field">
              <span>${escapeHtml(t("generic.sort"))}</span>
              <select id="session-sort">
                ${sortOptions
                  .map(
                    (option) => `
                      <option value="${escapeHtml(option.value)}" ${state.sessions.sort === option.value ? "selected" : ""}>
                        ${escapeHtml(option.label)}
                      </option>
                    `,
                  )
                  .join("")}
              </select>
            </label>
          </div>

          <div class="session-filter-row">
            <div class="event-filters">
              ${threadOptions
                .map(
                  (option) => `
                    <button
                      type="button"
                      class="filter-chip ${state.sessions.thread === option.value ? "filter-chip-active" : ""}"
                      data-thread-filter="${option.value}"
                    >
                      ${escapeHtml(option.label)} · ${escapeHtml(String(option.count))}
                    </button>
                  `,
                )
                .join("")}
            </div>
            <div class="session-filter-meta">
              <span>${escapeHtml(
                t("sessions.showing", {
                  visible: filteredSessions.length,
                  total: state.sessions.items.length,
                }),
              )}</span>
              ${
                activeFilters > 0
                  ? `<button id="clear-session-filters" type="button" class="secondary-button">${escapeHtml(t("sessions.clearFilters"))}</button>`
                  : ""
              }
            </div>
          </div>
        </div>

        <div class="card-list">
          ${
            pagedSessions.length > 0
              ? pagedSessions
                  .map((session) => {
                    const project = projectMap.get(session.projectId);
                    const displayStatus = getSessionDisplayStatus(session);
                    return `
                      <article class="record-card session-card list-row-card" data-open-session="${session.sessionId}">
                        <div class="record-title-row">
                          <h3>${escapeHtml(session.title || t("workspace.session.untitled"))}</h3>
                          <span class="pill ${statusClass(displayStatus)}">${escapeHtml(sessionStatusLabel(displayStatus))}</span>
                        </div>
                        <p class="record-meta">${escapeHtml(t("sessions.projectMeta", { value: project?.name || session.projectId }))}</p>
                        <p class="record-meta">${escapeHtml(t("sessions.lastEventMeta", { value: session.lastEventAt || t("generic.none") }))}</p>
                        <div class="summary-strip">
                          <span class="summary-chip">${escapeHtml(t("sessions.eventCount", { count: session.eventCount ?? 0 }))}</span>
                          ${
                            session.codexThreadId
                              ? `<span class="summary-chip">${escapeHtml(t("sessions.threadReady"))}</span>`
                              : `<span class="summary-chip">${escapeHtml(t("sessions.threadMissing"))}</span>`
                          }
                          ${
                            session.pendingApproval
                              ? `<span class="summary-chip summary-chip-warn">${escapeHtml(t("sessions.pendingApproval"))}</span>`
                              : ""
                          }
                        </div>
                        ${
                          session.pendingApproval?.reason
                            ? `<p class="record-summary"><strong>${escapeHtml(t("sessions.pendingApprovalTitle"))}</strong> ${escapeHtml(shortenText(session.pendingApproval.reason, 120))}</p>`
                            : session.pendingApproval?.command
                              ? `<p class="record-summary"><strong>${escapeHtml(t("sessions.pendingApprovalTitle"))}</strong> ${escapeHtml(shortenText(session.pendingApproval.command, 120))}</p>`
                              : ""
                        }
                        ${
                          session.lastCommand
                            ? `<p class="record-summary"><strong>${escapeHtml(t("sessions.lastCommandTitle"))}</strong> ${escapeHtml(shortenText(session.lastCommand, 120))}</p>`
                            : ""
                        }
                        ${
                          session.lastAssistantContent
                            ? `<p class="record-summary"><strong>${escapeHtml(t("sessions.lastReplyTitle"))}</strong> ${escapeHtml(shortenText(session.lastAssistantContent, 140))}</p>`
                            : ""
                        }
                      </article>
                    `;
                  })
                  .join("")
              : `<div class="session-empty">${escapeHtml(t("sessions.emptyFiltered"))}</div>`
          }
        </div>

        ${
          sortedSessions.length > 0
            ? `
              <div class="session-pagination">
                <div class="session-page-meta">
                  <span>${escapeHtml(
                    t("sessions.pageRange", {
                      start: pageStart + 1,
                      end: pageEnd,
                      total: sortedSessions.length,
                    }),
                  )}</span>
                  <span>${escapeHtml(
                    t("sessions.pageIndex", {
                      page: state.sessions.page,
                      total: totalPages,
                    }),
                  )}</span>
                </div>
                <div class="session-page-controls">
                  <button
                    id="page-prev"
                    type="button"
                    class="page-button"
                    ${state.sessions.page <= 1 ? "disabled" : ""}
                  >
                    ${escapeHtml(t("sessions.pagePrev"))}
                  </button>
                  ${pageNumbers
                    .map(
                      (pageNumber) => `
                        <button
                          type="button"
                          class="page-button ${state.sessions.page === pageNumber ? "page-button-active" : ""}"
                          data-page-number="${pageNumber}"
                        >
                          ${escapeHtml(String(pageNumber))}
                        </button>
                      `,
                    )
                    .join("")}
                  <button
                    id="page-next"
                    type="button"
                    class="page-button"
                    ${state.sessions.page >= totalPages ? "disabled" : ""}
                  >
                    ${escapeHtml(t("sessions.pageNext"))}
                  </button>
                </div>
              </div>
            `
            : ""
        }
      </article>
    </section>
  `,
  });

  document.querySelector("#refresh-sessions")?.addEventListener("click", () => {
    renderSessionsPage();
  });

  document.querySelector("#import-codex-session")?.addEventListener("click", async () => {
    try {
      await handleImportCodexSession();
    } catch (error) {
      showToast(messageOf(error));
    }
  });

  document.querySelector("#session-search")?.addEventListener("input", (event) => {
    const searchInput = event.currentTarget;
    const nextKeyword = searchInput.value;
    const caret = searchInput.selectionStart ?? nextKeyword.length;

    state.sessions.keyword = nextKeyword;
    state.sessions.page = 1;
    renderSessionsList();

    const restoredInput = document.querySelector("#session-search");
    if (restoredInput) {
      restoredInput.focus();
      restoredInput.setSelectionRange(caret, caret);
    }
  });

  document.querySelector("#session-status")?.addEventListener("change", (event) => {
    state.sessions.status = event.currentTarget.value;
    state.sessions.page = 1;
    renderSessionsList();
  });

  document.querySelector("#session-project")?.addEventListener("change", (event) => {
    state.sessions.projectId = event.currentTarget.value;
    state.sessions.page = 1;
    renderSessionsList();
  });

  document.querySelector("#session-sort")?.addEventListener("change", (event) => {
    state.sessions.sort = event.currentTarget.value;
    state.sessions.page = 1;
    renderSessionsList();
  });

  document.querySelectorAll("[data-thread-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextThreadFilter = button.getAttribute("data-thread-filter");
      if (!nextThreadFilter || nextThreadFilter === state.sessions.thread) {
        return;
      }

      state.sessions.thread = nextThreadFilter;
      state.sessions.page = 1;
      renderSessionsList();
    });
  });

  document.querySelector("#clear-session-filters")?.addEventListener("click", () => {
    state.sessions.keyword = "";
    state.sessions.status = "all";
    state.sessions.projectId = "all";
    state.sessions.thread = "all";
    state.sessions.page = 1;
    renderSessionsList();
  });

  document.querySelector("#page-prev")?.addEventListener("click", () => {
    if (state.sessions.page <= 1) {
      return;
    }

    state.sessions.page -= 1;
    renderSessionsList();
  });

  document.querySelector("#page-next")?.addEventListener("click", () => {
    if (state.sessions.page >= totalPages) {
      return;
    }

    state.sessions.page += 1;
    renderSessionsList();
  });

  document.querySelectorAll("[data-page-number]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number.parseInt(button.getAttribute("data-page-number") || "", 10);
      if (Number.isNaN(nextPage) || nextPage === state.sessions.page) {
        return;
      }

      state.sessions.page = nextPage;
      renderSessionsList();
    });
  });

  document.querySelectorAll("[data-open-session]").forEach((card) => {
    card.addEventListener("click", () => {
      const sessionId = card.getAttribute("data-open-session");
      if (sessionId) {
        window.location.hash = `#/sessions/${sessionId}`;
      }
    });
  });
}

async function renderSessionDetailPage(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }

  const previousSessionId = String(state.detail.session?.sessionId || "").trim();
  if (previousSessionId !== normalizedSessionId) {
    clearComposerAttachments();
    state.detail.dismissedApprovalKeys = {};
    state.detail.completionNotice = null;
    state.detail.completionNoticeArmed = false;
    state.detail.completionActionSettingsOpen = false;
    state.detail.seenCompletionEventKeys = {};
    cleanupCompletionNoticeTimer();
  }

  state.workspace.activeSessionId = normalizedSessionId;
  const loadRequestId = Number(state.detail.loadRequestId || 0) + 1;
  state.detail.loadRequestId = loadRequestId;
  const isStaleDetailLoad = () =>
    state.detail.loadRequestId !== loadRequestId || state.workspace.activeSessionId !== normalizedSessionId;
  let mainSlot = document.querySelector("#workspace-main-slot");
  if (!mainSlot) {
    app.innerHTML = renderWorkspaceShell({
      sidebarHtml: renderWorkspaceSidebar(normalizedSessionId),
      mainHtml: loadingCard(t("workspace.loading.session")),
    });
    syncWorkspaceShellState();
    bindWorkspaceCreateDialogControls();
    bindWorkspaceImportDialogControls();
    bindWorkspaceSidebarControls(normalizedSessionId);
    mainSlot = document.querySelector("#workspace-main-slot");
  }
  let hydratedFromCache = false;
  if (mainSlot) {
    const cachedSnapshot = readSessionDetailCacheSnapshot(normalizedSessionId);
    if (cachedSnapshot) {
      try {
        hydratedFromCache = Boolean(hydrateSessionDetailFromCache(normalizedSessionId, cachedSnapshot));
      } catch (_error) {
        hydratedFromCache = false;
        clearSessionDetailCacheSnapshot(normalizedSessionId);
      }
    }
  }
  if (hydratedFromCache) {
    state.socketState = "connecting";
    renderSessionDetail();
  } else if (mainSlot) {
    mainSlot.innerHTML = loadingCard(t("workspace.loading.session"));
  }

  try {
    await syncImportedSession(normalizedSessionId).catch(() => null);
    if (isStaleDetailLoad()) {
      return;
    }

    const [session, eventData, uiOptionsResult, hostsResult] = await Promise.all([
      getSession(normalizedSessionId),
      loadInitialSessionEvents(normalizedSessionId),
      getCodexUiOptions().catch(() => null),
      getCodexHosts().catch(() => null),
    ]);
    if (isStaleDetailLoad()) {
      return;
    }

    const uiOptions =
      uiOptionsResult &&
      Array.isArray(uiOptionsResult.models) &&
      uiOptionsResult.models.length > 0 &&
      Array.isArray(uiOptionsResult.reasoningLevels) &&
      uiOptionsResult.reasoningLevels.length > 0
        ? uiOptionsResult
        : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
    const codexStatus = await getCodexStatus({
      sessionId: normalizedSessionId,
      threadId: session.codexThreadId || "",
      cwd: session.projectPath || "",
    }).catch(() => null);
    if (isStaleDetailLoad()) {
      return;
    }

    state.detail.session = session;
    replaceDetailTimelineRawEvents(eventData.items);
    markCompletionEventsSeen(eventData.items);
    syncDetailPendingApproval(session, state.detail.timelineState);
    state.detail.cursor = eventData.lastSeq || eventData.nextCursor || eventData.afterCursor || 0;
    state.detail.beforeCursor = eventData.beforeCursor || 0;
    state.detail.session.eventCount = Math.max(
      getSessionActivityCount(state.detail.session),
      Number(state.detail.cursor || 0),
    );
    updateSessionListItem(state.detail.session);
    markWorkspaceSessionSeen(normalizedSessionId, state.detail.cursor);
    state.detail.historyHasMore = Boolean(eventData.hasMoreBefore);
    state.detail.draft = readComposerDraft(normalizedSessionId);
    resetSessionDetailTransientUiState({
      preserveCodexUiOptions: false,
      preserveCodexLaunch: false,
      preserveRemoteHosts: false,
      preserveActiveRemoteHost: false,
    });
    state.detail.codexUiOptions = uiOptions;
    state.detail.codexLaunch = normalizeCodexLaunchAgainstUi(
      session.codexLaunch || loadCodexLaunchPrefs(),
      uiOptions,
    );
    state.detail.remoteHosts =
      hostsResult && Array.isArray(hostsResult.hosts)
        ? hostsResult.hosts.filter((item) => typeof item === "string" && item.trim())
        : [];
    if (!state.detail.remoteHosts.length) {
      const currentHost = getCurrentPageHost();
      if (currentHost) {
        state.detail.remoteHosts = [currentHost];
      }
    }
    state.detail.activeRemoteHost =
      hostsResult && typeof hostsResult.activeHost === "string" && hostsResult.activeHost.trim()
        ? hostsResult.activeHost.trim()
        : (state.detail.remoteHosts[0] || getCurrentPageHost());
    state.detail.codexQuota = readCachedCodexQuota(normalizedSessionId);
    state.detail.codexStatus = codexStatus;
    state.detail.completionNoticeArmed = isSessionLiveBusy(session);
    state.detail.detailSyncing = false;
    state.detail.detailSyncError = "";
    state.socketState = "connecting";

    const detailQuery = parseHashRoute(window.location.hash || "").query || "";
    const followParam = new URLSearchParams(detailQuery).get("follow");
    if (followParam !== "0" && followParam !== "false") {
      state.detail.autoScroll = true;
    }

    renderSessionDetail();
    void maybeFlushMobileSendQueue("detail-load");
    if (isStaleDetailLoad()) {
      return;
    }

    attachSessionSocket(normalizedSessionId);
    void catchUpSessionEvents(normalizedSessionId, state.detail.cursor)
      .then(() => {
        if (!isStaleDetailLoad()) {
          scheduleSessionDetailRender();
        }
      })
      .catch(() => null);
    scheduleImportedSessionSync(normalizedSessionId);
  } catch (error) {
    if (isStaleDetailLoad()) {
      return;
    }

    if (hydratedFromCache && state.detail.session?.sessionId === normalizedSessionId) {
      state.detail.detailSyncing = false;
      state.detail.detailSyncError = messageOf(error);
      scheduleSessionDetailRender({ immediate: true });
      showToast(messageOf(error));
      return;
    }

    const nextMainSlot = document.querySelector("#workspace-main-slot");
    if (nextMainSlot) {
      nextMainSlot.innerHTML = errorCard(messageOf(error));
    } else {
      app.innerHTML = renderWorkspaceShell({
        sidebarHtml: renderWorkspaceSidebar(normalizedSessionId),
        mainHtml: errorCard(messageOf(error)),
      });
      syncWorkspaceShellState();
      bindWorkspaceCreateDialogControls();
      bindWorkspaceImportDialogControls();
      bindWorkspaceSidebarControls(normalizedSessionId);
    }
  }
}

function renderSessionDetail() {
  const session = state.detail.session;
  if (!session) {
    const mainSlot = document.querySelector("#workspace-main-slot");
    if (mainSlot) {
      mainSlot.innerHTML = errorCard("Session not found.");
    } else {
      app.innerHTML = renderWorkspaceShell({
        sidebarHtml: renderWorkspaceSidebar(""),
        mainHtml: errorCard("Session not found."),
      });
      syncWorkspaceShellState();
      bindWorkspaceCreateDialogControls();
      bindWorkspaceImportDialogControls();
      bindWorkspaceSidebarControls("");
    }
    return;
  }

  if (state.workspace.activeSessionId !== session.sessionId) {
    state.workspace.activeSessionId = session.sessionId;
    patchWorkspaceSidebar(session.sessionId);
  }

  disconnectConversationLayoutObserver();

  const preservedScrollTop = captureEventListScrollTop();
  const preservedBottomOffset = captureAutoScrollBottomOffset();
  persistSessionDetailViewState(session.sessionId);

  const composerIsBusy = isSessionLiveBusy(session);
  const threadInfo = state.detail.codexStatus?.thread || session.thread || session || null;
  const activeTurn = getActiveTimelineTurn(session) || getOptimisticActiveTurn(session);
  const runSummary = deriveThreadRunSummary(session, activeTurn);
  const displayTimelineItems = getDisplayTimelineItems();
  state.detail.activeTaskStartedAt = getTurnStartedAtUnixSeconds(activeTurn);

  if (!state.detail.codexLaunch) {
    state.detail.codexLaunch = normalizeCodexLaunchAgainstUi(
      loadCodexLaunchPrefs(),
      state.detail.codexUiOptions,
    );
  }

  if (!state.detail.codexUiOptions) {
    state.detail.codexUiOptions = CLIENT_FALLBACK_CODEX_UI_OPTIONS;
  }

  const activeElapsedValue = activeTurn
    ? formatElapsedSinceUnixSeconds(state.detail.activeTaskStartedAt)
    : "";

  const topBarHtml = renderSessionTopBar({
    title: session.title || t("workspace.session.untitled"),
    statusCode: getSessionDisplayStatus(session),
    statusLabel: runSummary.busy || runSummary.code === "failed"
      ? runSummary.label
      : sessionStatusLabel(getSessionDisplayStatus(session)),
    statusClass: statusClass(getSessionDisplayStatus(session)),
    activityBadges: [...getSessionActivityBadges(session, activeTurn), ...getRunSummaryBadges(runSummary)],
    host: state.detail.activeRemoteHost || t("session.host.unsynced"),
    model: getSelectedModelLabel(
      state.detail.codexUiOptions,
      state.detail.codexLaunch,
      threadInfo,
    ),
    reasoning: getSelectedReasoningLabel(
      state.detail.codexUiOptions,
      state.detail.codexLaunch,
      threadInfo,
    ),
    sessionElapsedLabel: t("session.elapsed", { value: formatElapsedSinceIso(session.createdAt) }),
    activeElapsedLabel: activeElapsedValue,
    inspectOpen: state.detail.inspectDrawerOpen,
    showInspectAction: false,
    showCompletionOptionsAction: true,
    completionOptionsOpen: state.detail.completionActionSettingsOpen,
    backHref: "",
  });

  const showUnseenBanner = shouldShowJumpToBottomButton();
  const taskPlanHtml = renderThreadTaskPlanPanel(getVisibleThreadTaskPlan());
  const transcriptOptions = {
    session,
    socketState: state.socketState,
    activeElapsedLabel: activeElapsedValue,
    activeMessageCopyKey: String(state.detail.messageContextMenu?.anchorKey || "").trim(),
  };
  const transcriptHtml = `
    ${showUnseenBanner
      ? `
        <button id="event-unseen-banner" type="button" class="event-unseen-banner" aria-label="${escapeHtml(t("timeline.jumpToBottom"))}">
          ↓
        </button>
      `
      : ""}
    <div id="thread-task-plan-slot">${taskPlanHtml}</div>
    ${renderTimeline(displayTimelineItems, transcriptOptions)}
  `;

  const detailSyncing = Boolean(state.detail.detailSyncing);
  const approvalBarHtml = detailSyncing ? "" : renderPendingApprovalBar(state.detail);
  const liveStatusHtml = state.detail.detailSyncError
    ? `<div class="completion-actions-status">${escapeHtml(t("workspace.loading.sessionSyncFailed"))}</div>`
    : (detailSyncing
      ? `<div class="completion-actions-status">${escapeHtml(t("workspace.loading.sessionSyncing"))}</div>`
      : "");
  const completionOptionsHtml = renderCompletionOptionsPanel();
  const completionNoticeHtml = detailSyncing ? "" : renderCompletionNotice();
  const speechControlHtml = renderCompletionSpeechControl();
  const messageContextMenuHtml = renderMessageContextMenu();
  const queuePanelHtml = detailSyncing ? "" : renderSessionQueuePanel(session);
  state.detail.mobileQueueStatusText = detailSyncing
    ? ""
    : (
      isMobileWorkspaceViewport() ||
      getMobileQueuedMessages(session.sessionId).length > 0 ||
      hasOfficialQueuedMessages(session)
        ? getMobileQueueStatusText(session.sessionId)
        : ""
    );
  state.detail.composerPlaceholderHint = detailSyncing
    ? t("composer.syncingHint")
    : getComposerPlaceholderHint(session, {
      queuedStatus: state.detail.mobileQueueStatusText,
      currentBusy: isSessionLiveBusy(session),
    });
  const composerInputHtml = renderComposerInput({
    session,
    detailState: state.detail,
    uiOptions: state.detail.codexUiOptions,
  });

  const workspaceMainSlot = document.querySelector("#workspace-main-slot");
  const shell = document.querySelector("#session-detail-shell");
  const shellMounted = shell?.dataset.sessionId === session.sessionId;

  if (!shellMounted) {
    const shellHtml = `
      <div id="session-detail-shell" class="session-detail-layout workspace-session-detail-layout" data-session-id="${escapeHtml(session.sessionId)}">
        <div id="session-topbar-slot"></div>
        <div id="session-completion-options-slot"></div>
        <div class="session-workbench-shell">
          <article id="session-transcript-slot" class="panel conversation-panel session-transcript-panel"></article>
        </div>
        <form
          id="message-form"
          class="composer-form-chat"
          novalidate
          autocomplete="on"
          autocorrect="on"
          autocapitalize="sentences"
          spellcheck="true"
        >
          <div class="composer-panel">
            <div id="session-live-status-slot"></div>
            <div id="session-completion-notice-slot"></div>
            <div id="session-queue-slot"></div>
            <div id="session-approval-slot"></div>
            <div id="session-composer-slot"></div>
          </div>
        </form>
        <div id="message-context-menu-slot"></div>
        <div id="completion-speech-control-slot"></div>
      </div>
    `;

    if (workspaceMainSlot) {
      workspaceMainSlot.innerHTML = shellHtml;
    } else {
      app.innerHTML = renderWorkspaceShell({
        sidebarHtml: renderWorkspaceSidebar(session.sessionId),
        mainHtml: shellHtml,
      });
      syncWorkspaceShellState();
      bindWorkspaceCreateDialogControls();
      bindWorkspaceImportDialogControls();
      bindWorkspaceSidebarControls(session.sessionId);
    }
  }

  const topBarSlot = document.querySelector("#session-topbar-slot");
  const completionOptionsSlot = document.querySelector("#session-completion-options-slot");
  const messageContextMenuSlot = document.querySelector("#message-context-menu-slot");
  let speechControlSlot = document.querySelector("#completion-speech-control-slot");
  const transcriptSlot = document.querySelector("#session-transcript-slot");
  const liveStatusSlot = document.querySelector("#session-live-status-slot");
  const completionNoticeSlot = document.querySelector("#session-completion-notice-slot");
  const queueSlot = document.querySelector("#session-queue-slot");
  const approvalSlot = document.querySelector("#session-approval-slot");
  const composerSlot = document.querySelector("#session-composer-slot");
  if (!speechControlSlot) {
    document.querySelector("#session-detail-shell")?.insertAdjacentHTML(
      "beforeend",
      `<div id="completion-speech-control-slot"></div>`,
    );
    speechControlSlot = document.querySelector("#completion-speech-control-slot");
  }

  if (topBarSlot && (!shellMounted || state.detail.lastTopBarHtml !== topBarHtml)) {
    if (!shellMounted) {
      topBarSlot.innerHTML = topBarHtml;
    } else {
      patchTopBarDom(topBarSlot, topBarHtml);
    }
    state.detail.lastTopBarHtml = topBarHtml;
  }
  if (
    completionOptionsSlot &&
    (!shellMounted || state.detail.lastCompletionOptionsHtml !== completionOptionsHtml)
  ) {
    completionOptionsSlot.innerHTML = completionOptionsHtml;
    state.detail.lastCompletionOptionsHtml = completionOptionsHtml;
  }
  if (
    speechControlSlot &&
    (!shellMounted || state.detail.lastSpeechControlHtml !== speechControlHtml)
  ) {
    speechControlSlot.innerHTML = speechControlHtml;
    state.detail.lastSpeechControlHtml = speechControlHtml;
  }
  if (
    messageContextMenuSlot &&
    (!shellMounted || state.detail.lastMessageContextMenuHtml !== messageContextMenuHtml)
  ) {
    messageContextMenuSlot.innerHTML = messageContextMenuHtml;
    state.detail.lastMessageContextMenuHtml = messageContextMenuHtml;
  }
  if (transcriptSlot) {
    const existingBanner = transcriptSlot.querySelector("#event-unseen-banner");
    if (showUnseenBanner) {
      const bannerHtml = "↓";
      if (existingBanner) {
        existingBanner.textContent = bannerHtml;
      } else {
        transcriptSlot.insertAdjacentHTML(
          "afterbegin",
          `<button id="event-unseen-banner" type="button" class="event-unseen-banner" aria-label="${escapeHtml(t("timeline.jumpToBottom"))}">${bannerHtml}</button>`,
        );
      }
    } else {
      existingBanner?.remove();
    }

    const streamMain = transcriptSlot.querySelector(".session-stream-main");
    const existingList = transcriptSlot.querySelector("#event-list");
    if (!streamMain || !existingList) {
      transcriptSlot.innerHTML = transcriptHtml;
    } else {
      let taskPlanSlot = transcriptSlot.querySelector("#thread-task-plan-slot");
      if (!taskPlanSlot) {
        streamMain.insertAdjacentHTML("beforebegin", `<div id="thread-task-plan-slot"></div>`);
        taskPlanSlot = transcriptSlot.querySelector("#thread-task-plan-slot");
      }
      if (taskPlanSlot && taskPlanSlot.innerHTML !== taskPlanHtml) {
        taskPlanSlot.innerHTML = taskPlanHtml;
      }
      patchTimelineListDom(existingList, displayTimelineItems, transcriptOptions);
    }
  }
  if (approvalSlot && (!shellMounted || state.detail.lastApprovalBarHtml !== approvalBarHtml)) {
    approvalSlot.innerHTML = approvalBarHtml;
    state.detail.lastApprovalBarHtml = approvalBarHtml;
  }
  if (liveStatusSlot && (!shellMounted || state.detail.lastLiveStatusHtml !== liveStatusHtml)) {
    liveStatusSlot.innerHTML = liveStatusHtml;
    state.detail.lastLiveStatusHtml = liveStatusHtml;
  }
  if (
    completionNoticeSlot &&
    (!shellMounted || state.detail.lastCompletionNoticeHtml !== completionNoticeHtml)
  ) {
    completionNoticeSlot.innerHTML = completionNoticeHtml;
    state.detail.lastCompletionNoticeHtml = completionNoticeHtml;
  }
  if (queueSlot && (!shellMounted || state.detail.lastQueuePanelHtml !== queuePanelHtml)) {
    queueSlot.innerHTML = queuePanelHtml;
    state.detail.lastQueuePanelHtml = queuePanelHtml;
  }
  const composerFocused = isComposerTextareaFocused();
  if (
    composerSlot &&
    (!shellMounted || state.detail.lastComposerHtml !== composerInputHtml) &&
    (!shellMounted || !composerFocused || state.detail.forceComposerRender)
  ) {
    composerSlot.innerHTML = composerInputHtml;
    state.detail.lastComposerHtml = composerInputHtml;
    state.detail.forceComposerRender = false;
  }

  const composerTextarea = document.querySelector('textarea[name="content"]');
  const messageFormEl = document.querySelector("#message-form");
  const composerActionFab = document.querySelector("#composer-action");
  const composerStopFab = document.querySelector("#composer-stop-action");
  const composerAttachFab = document.querySelector("#composer-attach-action");
  const composerAttachmentInput = document.querySelector("#composer-attachment-input");
  const composerSendStatus = document.querySelector("#composer-send-status");

  function syncComposerActionState() {
    if (!composerActionFab || !composerTextarea) {
      return;
    }

    const detailSyncing = Boolean(state.detail.detailSyncing);
    const currentBusy = isSessionLiveBusy(state.detail.session);
    const hasAttachments = (state.detail.composerAttachments || []).length > 0;
    const attachmentStatusText = getComposerAttachmentStatusText();
    if (detailSyncing) {
      composerActionFab.disabled = true;
      composerActionFab.setAttribute("aria-label", t("workspace.loading.sessionSyncing"));
      composerActionFab.setAttribute("title", t("workspace.loading.sessionSyncing"));
    } else if (state.detail.composerSending) {
      composerActionFab.disabled = true;
      composerActionFab.setAttribute("aria-label", t("composer.aria.sending"));
      composerActionFab.setAttribute("title", t("composer.sending"));
    } else {
      composerActionFab.disabled =
        state.detail.composerUploadingAttachments || (!composerTextarea.value.trim() && !hasAttachments);
      composerActionFab.setAttribute("aria-label", t("composer.aria.send"));
      composerActionFab.setAttribute("title", t("composer.aria.send"));
    }
    if (composerStopFab instanceof HTMLButtonElement) {
      composerStopFab.disabled =
        detailSyncing || state.detail.composerSending || state.detail.composerStopping || !currentBusy;
      composerStopFab.classList.toggle("composer-stop-fab--pending", Boolean(state.detail.composerStopping));
      composerStopFab.setAttribute(
        "title",
        detailSyncing
          ? t("workspace.loading.sessionSyncing")
          : (state.detail.composerStopping ? t("composer.stopping") : t("composer.aria.stop")),
      );
      composerStopFab.setAttribute(
        "aria-label",
        detailSyncing
          ? t("workspace.loading.sessionSyncing")
          : (state.detail.composerStopping ? t("composer.aria.stopping") : t("composer.aria.stop")),
      );
    }
    if (composerAttachFab instanceof HTMLButtonElement) {
      composerAttachFab.disabled =
        detailSyncing || state.detail.composerSending || state.detail.composerUploadingAttachments;
    }

    if (composerSendStatus instanceof HTMLElement) {
      const queuedStatus = getMobileQueueStatusText(session.sessionId);
      state.detail.mobileQueueStatusText = queuedStatus;
      const placeholderHint = getComposerPlaceholderHint(session, {
        attachmentStatusText,
        queuedStatus,
        currentBusy,
      });
      state.detail.composerPlaceholderHint = placeholderHint;
      composerTextarea.placeholder = placeholderHint || t("composer.placeholder");
      composerTextarea.classList.toggle(
        "input-area--status-placeholder",
        Boolean(placeholderHint && !composerTextarea.value.trim()),
      );
      const statusText = state.detail.composerSendError
        ? t("composer.sendFailed")
        : (hasFailedComposerAttachment() ? t("composer.attachments.failed") : "");
      composerSendStatus.textContent = statusText;
      composerSendStatus.classList.toggle("composer-send-status-visible", Boolean(statusText));
      composerSendStatus.classList.toggle(
        "composer-send-status-error",
        Boolean(state.detail.composerSendError || hasFailedComposerAttachment()),
      );
      composerSendStatus.classList.toggle(
        "composer-send-status-waiting",
        false,
      );
    }

  }

  async function sendComposerMessage() {
    if (state.detail.detailSyncing) {
      showToast(t("workspace.loading.sessionSyncing"));
      return;
    }
    if (state.detail.composerSending) {
      return;
    }

    const content = String(composerTextarea?.value || "").trim();
    const attachmentPayloads = getComposerAttachmentPayloads();
    if (!content && attachmentPayloads.length <= 0) {
      return;
    }
    if (state.detail.composerUploadingAttachments) {
      showToast(t("composer.attachments.uploading"));
      return;
    }
    if ((state.detail.composerAttachments || []).some((item) => item.status !== "ready")) {
      showToast(t("composer.attachments.failed"));
      return;
    }
    const codex = buildCodexLaunchPayload(
      state.detail.codexLaunch,
      state.detail.codexUiOptions,
    );
    const payload = ensurePayloadClientMessageId({
      content,
      ...(codex ? { codex } : {}),
      ...(attachmentPayloads.length ? { attachments: attachmentPayloads } : {}),
    }, "composer");
    const sendGuardKey = buildComposerSendGuardKey(session.sessionId, content, attachmentPayloads);
    if (!acquireComposerSendGuard(sendGuardKey)) {
      return;
    }

    if (shouldHoldMobileMessageForQueue()) {
      queueMobileComposerMessage(session.sessionId, content, payload);
      clearComposerAttachments();
      if (composerTextarea) {
        composerTextarea.value = "";
        adjustComposerHeight(composerTextarea);
      }
      syncComposerActionState();
      releaseComposerSendGuard(sendGuardKey);
      return;
    }

    const optimisticText = content || attachmentPayloads.map((item) => item.name || item.path || "attachment").join(", ");
    const optimisticTimestamp = new Date().toISOString();
    const optimisticSend = {
      sessionId: session.sessionId,
      tempTurnId: `optimistic-turn:${Date.now()}`,
      userItemId: `optimistic-user:${Date.now()}`,
      thinkingItemId: `optimistic-thinking:${Date.now()}`,
      text: optimisticText,
      createdAt: optimisticTimestamp,
      confirmed: false,
      turnId: null,
      previousStatus: state.detail.session?.status || "waiting_input",
      previousLiveBusy: Boolean(state.detail.session?.liveBusy),
      previousUpdatedAt: state.detail.session?.updatedAt || "",
      previousTitle: state.detail.session?.title || "",
      titleWasUpdated: false,
    };

    try {
      const prefs = getCompletionActionPrefsForSession(session.sessionId);
      resetCompletionAutoContinueSequence(session.sessionId, prefs.autoContinue ? prefs.autoContinueMaxRuns : 0);
      if (state.detail.session && shouldAutotitleSession(state.detail.session)) {
        const nextTitle = deriveSessionTitleFromMessage(optimisticText);
        state.detail.session.title = nextTitle;
        state.sessions.items = state.sessions.items.map((item) =>
          item.sessionId === session.sessionId ? { ...item, title: nextTitle } : item,
        );
        optimisticSend.titleWasUpdated = true;
      }
      if (state.detail.session) {
        state.detail.session.status = "running";
        state.detail.session.liveBusy = true;
        state.detail.session.updatedAt = optimisticTimestamp;
      }
      armCompletionNoticeForActiveSession();
      state.detail.optimisticSend = optimisticSend;
      state.detail.composerSending = true;
      state.detail.composerSendError = "";
      state.detail.draft = "";
      clearComposerDraft(session.sessionId);
      if (composerTextarea) {
        composerTextarea.value = "";
        adjustComposerHeight(composerTextarea);
        window.requestAnimationFrame(() => {
          adjustComposerHeight(composerTextarea);
          if (isMobileWorkspaceViewport()) {
            try {
              composerTextarea.focus({ preventScroll: true });
            } catch {
              composerTextarea.focus();
            }
          }
        });
      }
      state.detail.autoScroll = true;
      state.detail.unseenCount = 0;
      syncComposerActionState();
      scheduleSessionDetailRender();

      const result = await sendMessage(session.sessionId, payload);
      clearComposerAttachments();
      state.detail.composerSending = false;
      state.detail.composerSendError = "";
      if (state.detail.optimisticSend?.userItemId === optimisticSend.userItemId) {
        state.detail.optimisticSend = {
          ...state.detail.optimisticSend,
          confirmed: true,
          turnId: result.turnId || state.detail.optimisticSend.turnId,
        };
      }
      await catchUpSessionEvents(session.sessionId, state.detail.cursor || 0).catch(() => null);
      syncComposerActionState();
      scheduleSessionDetailRender();
    } catch (error) {
      const errorMessage = messageOf(error);
      state.detail.composerSending = false;
      state.detail.composerSendError = errorMessage;
      clearCompletionAutoContinueSequence(session.sessionId);
      writeComposerDraft(session.sessionId, content);
      clearOptimisticSend({
        restoreDraft: content,
        restoreSession: true,
        restoreTitle: true,
      });
      syncComposerActionState();
      scheduleSessionDetailRender();
      void resumeActiveSessionDetail("send-error");
      showToast(errorMessage);
    } finally {
      releaseComposerSendGuard(sendGuardKey);
    }
  }

  async function refreshBusySessionBeforeSend() {
    if (!isSessionLiveBusy(state.detail.session)) {
      return false;
    }

    await resumeActiveSessionDetail("pre-send");
    return isSessionLiveBusy(state.detail.session);
  }

  if (composerTextarea) {
    composerTextarea.oninput = (event) => {
      state.detail.draft = event.currentTarget.value;
      state.detail.composerSendError = "";
      writeComposerDraft(session.sessionId, state.detail.draft);
      adjustComposerHeight(event.currentTarget);
      window.requestAnimationFrame(() => adjustComposerHeight(event.currentTarget));
      if (state.detail.slashMenuOpen) {
        closeSlashMenu();
      }
      syncComposerActionState();
    };
    composerTextarea.onblur = () => {
      scheduleSessionDetailRender();
    };
    composerTextarea.onpaste = (event) => {
      void handleComposerPasteImages(event, session.sessionId);
    };
  }

  if (composerTextarea) {
    composerTextarea.onkeydown = async (event) => {
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }

      if (isMobileWorkspaceViewport() && !event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();

      if (composerTextarea.value.trim() || (state.detail.composerAttachments || []).length > 0) {
        void sendComposerMessage();
      }
    };
  }

  if (composerActionFab) {
    composerActionFab.onclick = () => {
      void sendComposerMessage();
    };
  }

  if (composerAttachFab instanceof HTMLButtonElement && composerAttachmentInput instanceof HTMLInputElement) {
    composerAttachFab.onclick = () => {
      composerAttachmentInput.click();
    };
    composerAttachmentInput.onchange = () => {
      void addComposerFiles(composerAttachmentInput.files, session.sessionId).finally(() => {
        composerAttachmentInput.value = "";
      });
    };
  }

  document.querySelectorAll("[data-remove-attachment]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      removeComposerAttachment(button.getAttribute("data-remove-attachment") || "");
    });
  });

  document.querySelectorAll("[data-mobile-queue-item]").forEach((itemEl) => {
    const toggleMenu = () => {
      document.querySelectorAll(".session-queue-item-menu-open").forEach((openItem) => {
        if (openItem !== itemEl) {
          openItem.classList.remove("session-queue-item-menu-open");
        }
      });
      itemEl.classList.toggle("session-queue-item-menu-open");
    };
    itemEl.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("[data-mobile-queue-action]")) {
        return;
      }
      event.preventDefault();
      toggleMenu();
    });
    itemEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      toggleMenu();
    });
  });

  document.querySelectorAll("[data-mobile-queue-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const itemId = button.getAttribute("data-mobile-queue-id") || "";
      const action = button.getAttribute("data-mobile-queue-action") || "";
      const queuedItem = getMobileQueuedMessages(session.sessionId).find((item) => String(item?.id || "") === itemId);
      if (!queuedItem) {
        return;
      }
      if (action === "edit") {
        const nextContent = window.prompt(t("queue.editPrompt"), queuedItem.content || "");
        if (nextContent === null) {
          return;
        }
        if (updateMobileQueuedMessage(session.sessionId, itemId, nextContent)) {
          showToast(t("queue.editedLocal"));
          scheduleSessionDetailRender();
        }
        return;
      }
      if (action === "remove") {
        if (removeMobileQueuedMessage(session.sessionId, itemId)) {
          showToast(t("queue.removedLocal"));
          scheduleSessionDetailRender();
        }
        return;
      }
      if (action === "front") {
        if (moveMobileQueuedMessageToFront(session.sessionId, itemId)) {
          showToast(t("queue.movedLocalToFront"));
          scheduleSessionDetailRender();
        }
      }
    });
  });

  if (composerStopFab instanceof HTMLButtonElement) {
    composerStopFab.onclick = async () => {
      if (state.detail.composerStopping) {
        return;
      }
      if (!window.confirm(t("composer.stopConfirm"))) {
        return;
      }
      const stillBusy = await refreshBusySessionBeforeSend();
      if (stillBusy) {
        state.detail.composerStopping = true;
        syncComposerActionState();
        scheduleSessionDetailRender();
        try {
          const stoppedSession = await stopSession(session.sessionId);
          if (stoppedSession && state.detail.session?.sessionId === session.sessionId) {
            state.detail.session = stoppedSession;
            updateSessionListItem(stoppedSession);
          } else if (state.detail.session?.sessionId === session.sessionId) {
            state.detail.session.status = "waiting_input";
            state.detail.session.liveBusy = false;
            state.detail.session.sourceRolloutHasOpenTurn = false;
          }
          state.detail.optimisticSend = null;
          state.detail.composerSending = false;
          state.detail.composerSendError = "";
          state.detail.composerStopping = false;
          await catchUpSessionEvents(session.sessionId, state.detail.cursor || 0).catch(() => null);
          showToast(
            stoppedSession?.stopStatus === "official_interrupted"
              ? t("composer.stopRequested")
              : t("composer.clearBusyDone"),
          );
          scheduleSessionDetailRender();
        } catch (error) {
          state.detail.composerStopping = false;
          syncComposerActionState();
          scheduleSessionDetailRender();
          showToast(messageOf(error));
        }

        return;
      }
    };
  }

  if (messageFormEl) {
    messageFormEl.onsubmit = async (event) => {
      event.preventDefault();

      void sendComposerMessage();
    };
  }

  adjustComposerHeight(composerTextarea);
  syncComposerActionState();
  syncActiveMessageCopyTargetDom();
  bindComposerInputControls({
    detailState: state.detail,
    onRender: renderSessionDetail,
  });
  bindCompletionActionControls();
  document
    .querySelectorAll('[data-codex-pref="modelId"], [data-codex-pref="reasoningId"]')
    .forEach((el) => {
      const previousOnChange = el.onchange;
      el.onchange = (event) => {
        previousOnChange?.call(el, event);
        renderSessionDetail();
      };
    });

  document.querySelector("#event-search")?.addEventListener("input", (event) => {
    const searchInput = event.currentTarget;
    const nextSearch = searchInput.value;
    const caret = searchInput.selectionStart ?? nextSearch.length;

    state.detail.search = nextSearch;
    state.detail.searchMatchIndex = 0;
    state.detail.activeSearchResultKey = "";
    renderSessionDetail();

    const restoredInput = document.querySelector("#event-search");
    if (restoredInput) {
      restoredInput.focus();
      restoredInput.setSelectionRange(caret, caret);
    }
  });

  document.querySelector("#event-search")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    stepSearchMatch(event.shiftKey ? -1 : 1);
  });

  document.querySelector("#clear-event-search")?.addEventListener("click", () => {
    state.detail.search = "";
    state.detail.searchMatchIndex = 0;
    state.detail.activeSearchResultKey = "";
    renderSessionDetail();
  });

  document.querySelector("#search-hit-prev")?.addEventListener("click", () => {
    stepSearchMatch(-1);
  });

  document.querySelector("#search-hit-next")?.addEventListener("click", () => {
    stepSearchMatch(1);
  });

  document.querySelector("#toggle-auto-scroll")?.addEventListener("click", () => {
    state.detail.autoScroll = !state.detail.autoScroll;
    if (state.detail.autoScroll) {
      state.detail.unseenCount = 0;
    }
    renderSessionDetail();
  });

  document.querySelector("#resume-auto-scroll")?.addEventListener("click", () => {
    resumeAutoScrollToBottom();
  });

  document.querySelector("#event-unseen-banner")?.addEventListener("click", () => {
    resumeAutoScrollToBottom();
  });


  document.querySelector("#refresh-events")?.addEventListener("click", async () => {
    try {
      const payload = await getSessionEvents(session.sessionId, {
        after: state.detail.cursor,
        limit: 200,
      });
      trackUnseenEvents(payload.items);
      mergeDetailTimelineRawEvents(payload.items);
      state.detail.cursor = payload.nextCursor || state.detail.cursor;
      updateWorkspaceSessionActivityCount(session.sessionId, state.detail.cursor);
      markWorkspaceSessionSeen(session.sessionId, state.detail.cursor);
      renderSessionDetail();
    } catch (error) {
      showToast(messageOf(error));
    }
  });

  document.querySelectorAll("[data-task-step-toggle='1']").forEach((button) => {
    button.addEventListener("click", () => {
      const taskKey = button.dataset.taskKey || "";
      const stepKey = button.dataset.stepKey || "";
      if (!taskKey || !stepKey) {
        return;
      }

      const current = isTaskStepExpanded(taskKey, stepKey, false);
      setTaskStepExpanded(taskKey, stepKey, !current);
      renderSessionDetail();
    });
  });

  bindEventListAutoPause(session.sessionId);
  bindCopyButtons();
  bindMessageCopyMenus();
  bindPendingApprovalControls(session.sessionId);
  restoreEventListScrollTop(preservedScrollTop);
  restoreAutoScrollBottomOffset(preservedBottomOffset);
  ensureDetailClock();
  if (state.detail.autoScroll) {
    if (shellMounted) {
      scheduleAutoScrollAnchorRestore();
    } else {
      scheduleInitialScrollToBottom();
    }
    attachConversationLayoutScrollObserver();
  }

  scheduleLiveResumeSync(session.sessionId);
  syncSearchMatchNavigation();
}

function scheduleSessionDetailRender(options = {}) {
  if (!state.detail.session) {
    return;
  }

  const immediate = Boolean(options.immediate);
  if (state.detail.renderTimerId) {
    window.clearTimeout(state.detail.renderTimerId);
    state.detail.renderTimerId = 0;
  }

  if (immediate) {
    renderSessionDetail();
    return;
  }

  if (DETAIL_RENDER_BATCH_MS <= 0) {
    window.requestAnimationFrame(() => {
      state.detail.renderTimerId = 0;
      renderSessionDetail();
    });
    return;
  }

  state.detail.renderTimerId = window.setTimeout(() => {
    state.detail.renderTimerId = 0;
    renderSessionDetail();
  }, DETAIL_RENDER_BATCH_MS);
}

function attachSessionSocket(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }

  cleanupSocket();
  const socket = connectSessionSocket(normalizedSessionId, {
    onStateChange(nextState) {
      if (state.ws !== socket || !isActiveDetailSession(normalizedSessionId)) {
        return;
      }

      state.socketState = nextState;
      if (state.detail.session) {
        scheduleSessionDetailRender();
      }
    },
    onEvent(event) {
      const eventSessionId = String(event?.sessionId || event?.session_id || "").trim();
      if (
        state.ws !== socket ||
        !isActiveDetailSession(normalizedSessionId) ||
        (eventSessionId && eventSessionId !== normalizedSessionId)
      ) {
        return;
      }

      const wasBusyBeforeEvent = isSessionLiveBusy(state.detail.session);
      if (state.detail.session) {
        const payloadType = String(event?.payload?.type || "");
        state.detail.session.updatedAt = new Date().toISOString();
        if (event.type === "turn.started" || payloadType === "task_started") {
          state.detail.session.status = "running";
          state.detail.session.liveBusy = true;
          armCompletionNoticeForActiveSession();
        } else if (event.type === "turn.completed" || payloadType === "task_complete") {
          state.detail.session.status = "waiting_input";
          state.detail.session.liveBusy = false;
        } else if (event.type === "turn.aborted" || payloadType === "turn_aborted") {
          state.detail.session.status = "failed";
          state.detail.session.liveBusy = false;
          disarmCompletionNoticeForActiveSession();
        } else if (event.type === "error" || payloadType === "error") {
          state.detail.session.status = "failed";
          state.detail.session.liveBusy = false;
          disarmCompletionNoticeForActiveSession();
        } else if (event.type === "session.status") {
          state.detail.session.status = event.status;
          state.detail.session.liveBusy = isSessionBusy(event.status);
          if (state.detail.session.liveBusy) {
            armCompletionNoticeForActiveSession();
          } else if (String(event.status || "").toLowerCase() !== "waiting_input") {
            disarmCompletionNoticeForActiveSession();
          }
        } else if (
          event.type === "system.notice" &&
          event.content &&
          event.content.startsWith("Codex thread started: ")
        ) {
          state.detail.session.codexThreadId = event.content.slice("Codex thread started: ".length);
          refreshCodexStatus(normalizedSessionId);
        }
      }

      if ((event.type === "token_count" || event.type === "codex.quota") && state.detail.session) {
        setDetailCodexQuota(normalizedSessionId, event.payload);
      }

      trackUnseenEvents([event]);
      mergeDetailTimelineRawEvents([event], { wasBusy: wasBusyBeforeEvent });
      state.detail.cursor = Math.max(state.detail.cursor, event.seq || 0);
      updateWorkspaceSessionActivityCount(normalizedSessionId, state.detail.cursor);
      markWorkspaceSessionSeen(normalizedSessionId, state.detail.cursor);
      scheduleSessionDetailRender();
    },
  });
  state.ws = socket;
}

async function refreshCodexStatus(sessionId) {
  if (!state.detail.session) {
    return;
  }

  try {
    const status = await getCodexStatus({
      sessionId,
      threadId: state.detail.session.codexThreadId || "",
      cwd: state.detail.session.projectPath || "",
    });

    if (state.detail.session && state.detail.session.sessionId === sessionId) {
      state.detail.codexStatus = status;
      scheduleSessionDetailRender();
    }
  } catch {
    /* ignore */
  }
}

function trackUnseenEvents(nextEvents) {
  if (state.detail.autoScroll) {
    return;
  }

  const existingIds = new Set(state.detail.rawEvents.map((event) => event.id));
  let addedCount = 0;

  nextEvents.forEach((event) => {
    if (!existingIds.has(event.id)) {
      existingIds.add(event.id);
      addedCount += 1;
    }
  });

  if (addedCount > 0) {
    state.detail.unseenCount += addedCount;
  }
}

function buildCommandGroupAt(events, startIndex) {
  const startEvent = events[startIndex];
  const group = {
    type: "command-group",
    id: startEvent.id || `command-group-${startIndex}`,
    startEvent,
    command: extractCommandText(startEvent),
    events: [],
    outputCount: 0,
    stderrCount: 0,
    endEvent: null,
  };

  let cursor = startIndex + 1;
  while (cursor < events.length) {
    const next = events[cursor];
    if (isCommandStartNotice(next)) {
      break;
    }

    if (!isCommandBodyEvent(next)) {
      break;
    }

    group.events.push(next);

    if (next.type === "cli.chunk") {
      group.outputCount += 1;
      if (next.stream === "stderr") {
        group.stderrCount += 1;
      }
    }

    if (isCommandEndNotice(next)) {
      group.endEvent = next;
      cursor += 1;
      break;
    }

    cursor += 1;
  }

  return { group, endIndex: cursor - 1 };
}

function listCommandGroupRanges(events) {
  const ranges = [];
  let index = 0;

  while (index < events.length) {
    if (!isCommandStartNotice(events[index])) {
      index += 1;
      continue;
    }

    const { group, endIndex } = buildCommandGroupAt(events, index);
    ranges.push({ start: index, end: endIndex, group });
    index = endIndex + 1;
  }

  return ranges;
}

function isTranscriptMetaSkip(event) {
  if (event.type === "codex.quota") {
    return true;
  }

  if (event.type !== "system.notice" || !event.content) {
    return false;
  }

  const content = event.content;
  if (content.startsWith("Codex thread started:")) {
    return true;
  }

  if (content.startsWith("Turn completed:")) {
    return true;
  }

  if (content === "Task stopped by user.") {
    return true;
  }

  if (content === "No active runner to stop.") {
    return true;
  }

  if (content.startsWith("Process exited with code")) {
    return true;
  }

  return false;
}

function shouldShowSessionStatusItem(events, index) {
  const event = events[index];
  if (event?.type !== "session.status") {
    return false;
  }

  if (!["starting", "waiting_input", "failed", "completed", "stopping"].includes(event.status)) {
    return false;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (events[cursor].type !== "session.status") {
      continue;
    }

    return events[cursor].status !== event.status;
  }

  return true;
}

function shouldShowTranscriptNotice(event) {
  if (event.type !== "system.notice") {
    return false;
  }

  if (!event.content || isTranscriptMetaSkip(event)) {
    return false;
  }

  if (event.level === "error" || event.level === "warning") {
    return true;
  }

  return event.content === "Task stopped by user.";
}

function buildConversationItems(events, options = {}) {
  const ranges = listCommandGroupRanges(events);
  const consumed = new Set();

  ranges.forEach(({ start, end }) => {
    for (let k = start; k <= end; k += 1) {
      consumed.add(k);
    }
  });

  const items = [];
  let i = 0;

  while (i < events.length) {
    if (consumed.has(i)) {
      const rg = ranges.find((r) => i >= r.start && i <= r.end);
      if (rg && i === rg.start) {
        const group = rg.group;
        group.matchingEvents = [group.startEvent, ...group.events].filter((candidate) =>
          matchesEventOptions(candidate, options),
        );
        if (group.matchingEvents.length > 0) {
          items.push({ type: "tool", group });
        }

        i = rg.end + 1;
        continue;
      }

      if (rg && i > rg.start) {
        i += 1;
        continue;
      }
    }

    const ev = events[i];

    if (ev.type === "session.status") {
      if (shouldShowSessionStatusItem(events, i) && matchesEventOptions(ev, options)) {
        items.push({ type: "status", event: ev, id: ev.id });
      }

      i += 1;
      continue;
    }

    if (isTranscriptMetaSkip(ev)) {
      i += 1;
      continue;
    }

    if (ev.type === "message.user") {
      if (matchesEventOptions(ev, options)) {
        items.push({ type: "user", events: [ev], id: ev.id });
      }

      i += 1;
      continue;
    }

    if (ev.type === "cli.chunk" && ev.stream === "assistant") {
      const batch = [];
      let j = i;
      while (j < events.length && !consumed.has(j)) {
        const e = events[j];
        if (e.type === "cli.chunk" && e.stream === "assistant") {
          batch.push(e);
          j += 1;
        } else {
          break;
        }
      }

      if (batch.some((e) => matchesEventOptions(e, options))) {
        items.push({ type: "assistant", events: batch, id: batch[0].id });
      }

      i = j;
      continue;
    }

    if (ev.type === "system.notice" && shouldShowTranscriptNotice(ev)) {
      if (matchesEventOptions(ev, options)) {
        items.push({ type: "notice", event: ev, id: ev.id });
      }

      i += 1;
      continue;
    }

    i += 1;
  }

  return items;
}

function buildConversationSearchResults(items) {
  return items
    .map((item, index) => {
      if (item.type === "tool") {
        return buildCommandGroupSearchResult(item.group, index);
      }

      if (item.type === "user") {
        return buildUserConversationSearchResult(item, index);
      }

      if (item.type === "assistant") {
        return buildAssistantConversationSearchResult(item, index);
      }

      if (item.type === "status") {
        return buildStatusSearchResult(item, index);
      }

      if (item.type === "notice") {
        return buildEventSearchResult(item.event, index);
      }

      return null;
    })
    .filter(Boolean);
}

function buildTaskSearchResults(taskBlocks) {
  return taskBlocks.map((task) => buildTaskSearchResult(task));
}

function buildTaskSearchResult(task) {
  const keyword = normalizeSearchKeyword(state.detail.search);
  const prompt = task.user.text || "";
  const summaryCandidates = [
    task.assistantMessage?.mainText,
    ...task.steps.map((step) => [step.label, step.meta].filter(Boolean).join(" · ")),
    ...task.commandGroups.map((group) => getCommandStepSummary(group, describeCommandPreview(group))),
    ...task.noticeEvents.map((event) => event.content || ""),
  ].filter(Boolean);
  const snippet = keyword
    ? resolveTaskSearchSnippet([prompt, ...summaryCandidates], keyword)
    : summaryCandidates[0] || prompt;

  return {
    key: task.key,
    targetId: getTaskContainerElementId(task.key),
    groupId: "",
    kind: "Task",
    title: shortenText(prompt || `Task ${task.index + 1}`, 120),
    snippet: shortenText(snippet || "", 180),
    meta: task.executionStatus.label,
    ts: task.startedAt,
  };
}

function resolveTaskSearchSnippet(candidates, keyword) {
  const normalized = normalizeSearchKeyword(keyword);
  if (!normalized) {
    return candidates.find(Boolean) || "";
  }

  return (
    candidates.find((candidate) => String(candidate || "").toLowerCase().includes(normalized)) ||
    candidates.find(Boolean) ||
    ""
  );
}

function getCommandGroupInspectKey(group, index = 0) {
  return `command:${group.id || `group-${index}`}`;
}

function getUserInspectKey(item) {
  return `user:${item.id}`;
}

function getAssistantInspectKey(item) {
  return `assistant:${item.id}`;
}

function getStatusInspectKey(event, index = 0) {
  return `status:${event.id || `status-${index}`}`;
}

function getNoticeInspectKey(event, index = 0) {
  return `notice:${event.id || `notice-${index}`}`;
}

function getConversationItemInspectKey(item, index = 0) {
  if (item.type === "tool") {
    return getCommandGroupInspectKey(item.group, index);
  }

  if (item.type === "user") {
    return getUserInspectKey(item);
  }

  if (item.type === "assistant") {
    return getAssistantInspectKey(item);
  }

  if (item.type === "status") {
    return getStatusInspectKey(item.event, index);
  }

  if (item.type === "notice") {
    return getNoticeInspectKey(item.event, index);
  }

  return `item:${index}`;
}

function resolveInspectItem(items, selectionKey) {
  if (!selectionKey) {
    return null;
  }

  return (
    items.find((item, index) => getConversationItemInspectKey(item, index) === selectionKey) || null
  );
}

function resolveInspectTask(taskBlocks, selectionKey) {
  if (!selectionKey) {
    return null;
  }

  return taskBlocks.find((task) => task.key === selectionKey) || null;
}

function getSelectedModelLabel(uiOptions, launch, threadInfo) {
  const opts =
    uiOptions && Array.isArray(uiOptions.models) && uiOptions.models.length > 0
      ? uiOptions
      : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
  return (
    threadInfo?.model ||
    opts.models.find((item) => item.id === launch?.modelId)?.label ||
    opts.models[0]?.label ||
    t("session.model.unsynced")
  );
}

function getSelectedReasoningLabel(uiOptions, launch, threadInfo) {
  const opts =
    uiOptions && Array.isArray(uiOptions.reasoningLevels) && uiOptions.reasoningLevels.length > 0
      ? uiOptions
      : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
  return (
    (threadInfo?.reasoningEffort ? formatReasoningEffortLabel(threadInfo.reasoningEffort) : "") ||
    (() => {
      const selected = opts.reasoningLevels.find((item) => item.id === launch?.reasoningId);
      return selected
        ? formatReasoningEffortLabel(selected.id || selected.label)
        : "";
    })() ||
    t("session.reasoning.unsynced")
  );
}

function formatReasoningEffortLabel(value) {
  if (value === "low") {
    return t("runtime.low");
  }

  if (value === "medium") {
    return t("runtime.medium");
  }

  if (value === "high") {
    return t("runtime.high");
  }

  if (value === "xhigh") {
    return t("runtime.xhigh");
  }

  return value || t("session.reasoning.unsynced");
}

function openInspectDrawer(selectionKey = state.detail.inspectSelectionKey) {
  state.detail.inspectDrawerOpen = true;
  if (selectionKey) {
    state.detail.inspectSelectionKey = selectionKey;
  }

  if (!state.detail.codexQuota && state.detail.session?.sessionId) {
    getCodexQuota(state.detail.session.sessionId)
      .then((payload) => {
        setDetailCodexQuota(state.detail.session.sessionId, payload);
        if (state.detail.inspectDrawerOpen) {
          renderSessionDetail();
        }
      })
      .catch(() => {});
  }
}

function closeInspectDrawer() {
  if (!state.detail.inspectDrawerOpen) {
    return;
  }

  state.detail.inspectDrawerOpen = false;
  renderSessionDetail();
}

function renderInspectSearchSection({
  searchResults,
  visibleEventCount,
  filterOptions,
  severityOptions,
}) {
  return `
    <div class="inspect-search-stack">
      <label class="event-search-field inspect-search-field">
        <span>${escapeHtml(t("inspect.searchFlow"))}</span>
        <input
          id="event-search"
          value="${escapeHtml(state.detail.search)}"
          placeholder="${escapeHtml(t("inspect.searchPlaceholder"))}"
        />
      </label>
      <div class="inspect-toolbar-meta">
        <span>${escapeHtml(
          t("generic.showing", {
            visible: visibleEventCount,
            total: state.detail.rawEvents.length,
          }),
        )}</span>
        <div class="event-toolbar-actions">
          ${
            state.detail.search.trim()
              ? `
                <div class="search-hit-nav">
                  <span id="search-hit-status" class="search-hit-status">0 / 0</span>
                  <button id="search-hit-prev" type="button" class="secondary-button">${escapeHtml(t("inspect.searchPrev"))}</button>
                  <button id="search-hit-next" type="button" class="secondary-button">${escapeHtml(t("inspect.searchNext"))}</button>
                </div>
              `
              : ""
          }
          ${
            state.detail.search.trim()
              ? `<button id="clear-event-search" type="button" class="secondary-button">${escapeHtml(t("inspect.clearSearch"))}</button>`
              : ""
          }
        </div>
      </div>
      <div class="inspect-filter-group">
        <span class="meta-label">${escapeHtml(t("generic.type"))}</span>
        <div class="event-filters">
          ${filterOptions
            .map(
              (option) => `
                <button
                  type="button"
                  class="filter-chip ${state.detail.filter === option.id ? "filter-chip-active" : ""}"
                  data-event-filter="${option.id}"
                >
                  ${escapeHtml(option.label)} · ${escapeHtml(String(option.count))}
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="inspect-filter-group">
        <span class="meta-label">${escapeHtml(t("generic.level"))}</span>
        <div class="event-filters">
          ${severityOptions
            .map(
              (option) => `
                <button
                  type="button"
                  class="filter-chip ${state.detail.severity === option.id ? "filter-chip-active" : ""}"
                  data-event-severity="${option.id}"
                >
                  ${escapeHtml(option.label)} · ${escapeHtml(String(option.count))}
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="search-results-panel inspect-search-results">
        <div class="search-results-header">
          <span class="search-results-title">${escapeHtml(t("inspect.results"))}</span>
          <span class="search-results-count">${escapeHtml(t("inspect.resultCount", { count: searchResults.length }))}</span>
        </div>
        ${
          searchResults.length > 0
            ? `<div class="search-results-list">${searchResults
                .map((result) => renderSearchResultItem(result))
                .join("")}</div>`
            : `<div class="search-results-empty">${escapeHtml(t("inspect.emptySearch"))}</div>`
        }
      </div>
    </div>
  `;
}

function renderInspectQuota(detailState) {
  const quota = detailState.codexQuota?.quota;
  const hourPercent =
    typeof quota?.hour?.percent === "number" && Number.isFinite(quota.hour.percent)
      ? `${quota.hour.percent}%`
      : "--";
  const hourRemain =
    typeof quota?.hour?.remainTime === "string" && quota.hour.remainTime.trim()
      ? quota.hour.remainTime.trim()
      : "--";
  const weekPercent =
    typeof quota?.week?.percent === "number" && Number.isFinite(quota.week.percent)
      ? `${quota.week.percent}%`
      : "--";
  const weekReset =
    typeof quota?.week?.resetDate === "string" && quota.week.resetDate.trim()
      ? quota.week.resetDate.trim()
      : "--";

  return `
    <div class="inspect-quota-card">
      <p class="inspect-quota-title">${escapeHtml(t("composer.quota.remaining"))}</p>
      <p class="inspect-quota-line">${escapeHtml(t("composer.quota.hours", { percent: hourPercent, remain: hourRemain }))}</p>
      <p class="inspect-quota-line">${escapeHtml(t("composer.quota.week", { percent: weekPercent, reset: weekReset }))}</p>
    </div>
  `;
}

function renderRawEventList(events) {
  const items = [...events].slice(-80).reverse();
  if (items.length === 0) {
    return `<div class="inspect-empty">${escapeHtml(t("inspect.rawEventsEmpty"))}</div>`;
  }

  return `
    <div class="inspect-raw-list">
      ${items
        .map((event) => {
          const summary =
            event.type === "message.user"
              ? event.content || ""
              : event.type === "cli.chunk"
                ? `${event.stream || "stdout"} · ${event.content || ""}`
                : event.type === "session.status"
                  ? event.status || ""
                  : event.type === "cli.exit"
                    ? `exit ${String(event.exitCode ?? "—")}`
                    : event.content || "";

          return `
            <div class="inspect-raw-item">
              <div class="inspect-raw-head">
                <span class="inspect-raw-kind">${escapeHtml(event.type)}</span>
                <span class="inspect-raw-ts">${escapeHtml(event.ts ? formatTs(event.ts) : "—")}</span>
              </div>
              <p class="inspect-raw-summary">${escapeHtml(shortenText(summary, 160) || "—")}</p>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function formatRuntimeValue(value, fallback = t("generic.notSynced")) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function collectRuntimeHints(session) {
  const status = state.detail.codexStatus || {};
  const runtimeHints = Array.isArray(status.runtimeHints)
    ? status.runtimeHints.map((hint) => localizeRuntimeHint(hint, status.runtime))
    : [];
  const eventHints = [];
  const recentEvents = [...state.detail.rawEvents].slice(-40);

  if (
    recentEvents.some(
      (event) =>
        event.type === "cli.chunk" &&
        event.stream === "stderr" &&
        /operation not permitted|permission denied/i.test(String(event.content || "")),
    )
  ) {
    eventHints.push(t("inspect.hint.permissionsDenied"));
  }

  if (
    recentEvents.some(
      (event) =>
        event.type === "cli.chunk" &&
        event.stream === "stderr" &&
        /read-only/i.test(String(event.content || "")),
    )
  ) {
    eventHints.push(t("inspect.hint.readOnly"));
  }

  if (
    session?.status === "failed" &&
    recentEvents.some(
      (event) =>
        (event.type === "system.notice" || event.type === "cli.chunk") &&
        /sandbox|approval/i.test(String(event.content || "")),
    )
  ) {
    eventHints.push(t("inspect.hint.sandboxApproval"));
  }

  return [...new Set([...runtimeHints, ...eventHints])];
}

function localizeRuntimeHint(hint, runtime) {
  const text = String(hint || "").trim();
  if (!text) {
    return "";
  }

  if (
    text === "当前是 read-only sandbox，不能直接写文件或执行会修改环境的命令。" ||
    text === "The current runtime is using a read-only sandbox. File writes and environment-changing commands are blocked."
  ) {
    return t("inspect.hint.readOnly");
  }

  if (
    text === "当前是 workspace-write sandbox，只能写入当前 workspace roots。" ||
    text === "The current runtime is using a workspace-write sandbox. It can only write inside the current writable roots."
  ) {
    return t("inspect.hint.workspaceWrite");
  }

  if (
    text === `当前 ${runtime?.executionMode} 运行链路不支持交互审批弹窗。` ||
    text === `The current ${runtime?.executionMode} runtime path does not support interactive approval prompts.`
  ) {
    return t("inspect.hint.noInteractiveApproval", {
      mode: runtime?.executionMode || "runtime",
    });
  }

  if (
    runtime?.workspaceRoot &&
    (text === `当前 workspace root 是 ${runtime.workspaceRoot}。` ||
      text === `The current workspace root is ${runtime.workspaceRoot}.`)
  ) {
    return t("inspect.hint.workspaceRoot", {
      path: runtime.workspaceRoot,
    });
  }

  return text;
}

function localizeApprovalTitle(title) {
  const normalized = String(title || "").trim();
  if (!normalized) {
    return t("approval.required");
  }

  if (
    normalized === "命令执行需要授权" ||
    normalized === "Command execution requires approval"
  ) {
    return t("approval.commandRequired");
  }

  if (
    normalized === "文件修改需要授权" ||
    normalized === "File changes require approval"
  ) {
    return t("approval.fileChangeRequired");
  }

  if (
    normalized === "额外权限需要授权" ||
    normalized === "Extra permissions require approval"
  ) {
    return t("approval.extraPermissionRequired");
  }

  if (
    normalized === "操作需要授权" ||
    normalized === "Approval required" ||
    normalized === "Approval required for operation"
  ) {
    return t("approval.required");
  }

  return normalized;
}

function renderRuntimeRoots(roots) {
  if (!Array.isArray(roots) || roots.length === 0) {
    return `<strong>${escapeHtml(t("generic.none"))}</strong>`;
  }

  return `<strong>${roots.map((item) => escapeHtml(String(item))).join("<br>")}</strong>`;
}

function renderInspectSessionSection(session) {
  const runtime = state.detail.codexStatus?.runtime || null;
  const runtimeHints = collectRuntimeHints(session);
  const projectPath = session.projectPath || "";

  return `
    <div class="inspect-session-stack">
      ${renderInspectQuota(state.detail)}
      <div class="inspect-session-card">
        <div class="inspect-session-row"><span class="meta-label">${escapeHtml(t("inspect.session"))}</span><strong>${escapeHtml(session.sessionId)}</strong></div>
        <div class="inspect-session-row"><span class="meta-label">${escapeHtml(t("inspect.project"))}</span><strong>${escapeHtml(session.projectId)}</strong></div>
        <div class="inspect-session-row"><span class="meta-label">${escapeHtml(t("inspect.projectDirectory"))}</span><strong>${escapeHtml(projectPath || t("generic.notSynced"))}</strong></div>
        <div class="inspect-session-row"><span class="meta-label">${escapeHtml(t("inspect.currentCwd"))}</span><strong>${escapeHtml(formatRuntimeValue(runtime?.cwd, projectPath || t("generic.notSynced")))}</strong></div>
        <div class="inspect-session-row"><span class="meta-label">${escapeHtml(t("inspect.executionPath"))}</span><strong>${escapeHtml(formatRuntimeValue(runtime?.executionMode, "codex app-server"))}</strong></div>
        <div class="inspect-session-row"><span class="meta-label">Sandbox</span><strong>${escapeHtml(formatRuntimeValue(runtime?.sandboxMode))}</strong></div>
        <div class="inspect-session-row"><span class="meta-label">Approval</span><strong>${escapeHtml(formatRuntimeValue(runtime?.approvalMode))}</strong></div>
        <div class="inspect-session-row"><span class="meta-label">${escapeHtml(t("inspect.workspaceRoot"))}</span><strong>${escapeHtml(formatRuntimeValue(runtime?.workspaceRoot, projectPath || t("generic.notSynced")))}</strong></div>
        <div class="inspect-session-row inspect-session-row-multiline"><span class="meta-label">${escapeHtml(t("inspect.writableRoots"))}</span>${renderRuntimeRoots(runtime?.writableRoots)}</div>
        <div class="inspect-session-row"><span class="meta-label">WS</span><strong>${escapeHtml(state.socketState)}</strong></div>
        <div class="inspect-session-row"><span class="meta-label">${escapeHtml(t("inspect.pid"))}</span><strong>${escapeHtml(String(session.pid ?? t("generic.notStarted")))}</strong></div>
        <div class="inspect-session-row"><span class="meta-label">${escapeHtml(t("inspect.thread"))}</span><strong>${escapeHtml(session.codexThreadId || t("generic.notEstablished"))}</strong></div>
      </div>
      ${
        runtimeHints.length > 0
          ? `
            <div class="inspect-session-card inspect-session-card-hints">
              <div class="inspect-detail-head">
                <span class="inspect-detail-kind">${escapeHtml(t("inspect.runtimeHints"))}</span>
              </div>
              <div class="inspect-hint-list">
                ${runtimeHints
                  .map((hint) => `<p class="inspect-hint-item">${escapeHtml(hint)}</p>`)
                  .join("")}
              </div>
            </div>
          `
          : ""
      }
      <div class="inspect-session-actions">
        <button id="refresh-events" class="secondary-button" type="button">${escapeHtml(t("inspect.fetchHistory"))}</button>
        ${
          !state.detail.autoScroll
            ? `<button id="resume-auto-scroll" type="button" class="secondary-button toolbar-jump-button">${escapeHtml(t("inspect.followBottom"))}</button>`
            : ""
        }
        <button
          id="toggle-auto-scroll"
          type="button"
          class="secondary-button ${state.detail.autoScroll ? "toolbar-toggle-active" : ""}"
          aria-pressed="${state.detail.autoScroll ? "true" : "false"}"
        >
          ${escapeHtml(t("inspect.autoScroll", { value: t(state.detail.autoScroll ? "generic.on" : "generic.off") }))}
        </button>
      </div>
      <details class="inspect-raw-details">
        <summary class="inspect-raw-summary-toggle">${escapeHtml(t("inspect.rawEventsDebug"))}</summary>
        ${renderRawEventList(state.detail.rawEvents)}
      </details>
    </div>
  `;
}

function renderInspectDetailSection(selectedTask) {
  if (!selectedTask) {
    return `<div class="inspect-empty">${escapeHtml(t("inspect.emptySelection"))}</div>`;
  }

  const promptText = selectedTask.user.text || "";
  const assistantText = selectedTask.assistantMessage?.mainText || "";
  const finalCopyPayload = encodeCopyPayload(assistantText);

  return `
    <div class="inspect-detail-stack">
      <div class="inspect-detail-head">
        <span class="inspect-detail-kind">${escapeHtml(t("inspect.detailTitle"))}</span>
        ${
          selectedTask.startedAt
            ? `<span class="search-result-meta">${escapeHtml(formatTs(selectedTask.startedAt))}</span>`
            : ""
        }
      </div>

      <div class="inspect-detail-card inspect-detail-card-user">
        <div class="inspect-detail-head">
          <span class="inspect-detail-kind">${escapeHtml(t("inspect.userInput"))}</span>
        </div>
        <div>${renderSearchHighlight(promptText, state.detail.search)}</div>
      </div>

      <div class="inspect-detail-card">
        <div class="inspect-detail-head">
          <span class="inspect-detail-kind">${escapeHtml(t("inspect.executionDetails"))}</span>
          <span class="pill ${escapeHtml(selectedTask.executionStatus.className)}">${escapeHtml(getTaskExecutionLineLabel(selectedTask))}</span>
        </div>
        ${renderTaskStepList(selectedTask)}
        ${renderTaskExecutionDetails(selectedTask)}
      </div>

      <div class="inspect-detail-card inspect-detail-card-assistant">
        <div class="inspect-detail-head">
          <span class="inspect-detail-kind">${escapeHtml(t("inspect.assistantReply"))}</span>
          ${
            assistantText
              ? `<button type="button" class="event-copy-button" data-copy-text="${escapeHtml(finalCopyPayload)}">${escapeHtml(t("generic.copy"))}</button>`
              : ""
          }
        </div>
        <div class="msg-md">
          ${
            assistantText
              ? formatAssistantHtml(assistantText, state.detail.search)
              : `<p class="msg-md-p msg-md-empty">${escapeHtml(getTaskExecutionLineLabel(selectedTask))}</p>`
          }
        </div>
      </div>
    </div>
  `;
}

function getInspectSelectionTitle(selectedTask) {
  if (!selectedTask) {
    return t("inspect.selectionTitle");
  }

  const promptText = selectedTask.user.text || "";
  return shortenText(promptText || `Task ${selectedTask.index + 1}`, 60);
}

function buildCommandGroupSearchResult(group, index) {
  const matchCount = group.matchingEvents?.length || 0;
  const firstMatch = group.matchingEvents?.find((event) => event.id !== group.startEvent.id) || group.startEvent;

  return {
    key: getCommandGroupInspectKey(group, index),
    targetId: getCommandGroupElementId(group.id || `group-${index}`),
    groupId: group.id || `group-${index}`,
    kind: t("inspect.tool"),
    title: group.command || t("inspect.commandUnknown"),
    snippet: describeSearchResultSnippet(firstMatch),
    meta: t("inspect.resultCountMatches", { count: matchCount }),
    ts: group.startEvent.ts,
  };
}

function buildUserConversationSearchResult(item) {
  const ev = item.events[0];
  return {
    key: getUserInspectKey(item),
    targetId: getUserBubbleElementId(ev.id),
    groupId: "",
    kind: t("inspect.userKind"),
    title: ev.content || "",
    snippet: "",
    meta: ev.ts ? formatTs(ev.ts) : "",
    ts: ev.ts,
  };
}

function buildAssistantConversationSearchResult(item) {
  const text = item.events.map((e) => e.content || "").join("");
  return {
    key: getAssistantInspectKey(item),
    targetId: getAssistantBubbleElementId(item.id),
    groupId: "",
    kind: "Assistant",
    title: shortenText(text, 140),
    snippet: shortenText(text, 200),
    meta: item.events[0]?.ts ? formatTs(item.events[0].ts) : "",
    ts: item.events[0]?.ts,
  };
}

function buildStatusSearchResult(item, index) {
  return {
    key: getStatusInspectKey(item.event, index),
    targetId: getEventElementId(item.event.id || `status-${index}`),
    groupId: "",
    kind: t("inspect.statusKind"),
    title: sessionStatusLabel(item.event.status),
    snippet: "",
    meta: item.event.ts ? formatTs(item.event.ts) : "",
    ts: item.event.ts,
  };
}

function buildEventSearchResult(event, index) {
  return {
    key: getNoticeInspectKey(event, index),
    targetId: getEventElementId(event.id || `event-${index}`),
    groupId: "",
    kind: searchResultKindLabel(event),
    title: describeSearchResultTitle(event),
    snippet: describeSearchResultSnippet(event),
    meta: event.ts ? formatTs(event.ts) : "",
    ts: event.ts,
  };
}

function renderSearchResultItem(result) {
  return `
    <button
      type="button"
      class="search-result-item ${state.detail.activeSearchResultKey === result.key ? "search-result-item-active" : ""}"
      data-search-result-key="${escapeHtml(result.key)}"
      data-search-result-target="${escapeHtml(result.targetId)}"
      data-search-result-group-id="${escapeHtml(result.groupId || "")}"
    >
      <div class="search-result-head">
        <span class="search-result-kind">${escapeHtml(result.kind)}</span>
        ${
          result.meta
            ? `<span class="search-result-meta">${escapeHtml(result.meta)}</span>`
            : ""
        }
      </div>
      <strong class="search-result-title">${renderSearchHighlight(shortenText(result.title, 120), state.detail.search)}</strong>
      ${
        result.snippet && result.snippet !== result.title
          ? `<p class="search-result-snippet">${renderSearchHighlight(shortenText(result.snippet, 160), state.detail.search)}</p>`
          : ""
      }
    </button>
  `;
}

function formatAssistantHtml(text, search) {
  const raw = String(text || "");
  if (!raw.trim()) {
    return `<p class="msg-md-p msg-md-empty">${renderSearchHighlight("", search)}</p>`;
  }

  const html = renderMessageRichText(raw, {
    renderText: (value) => renderSearchHighlight(value, search),
    renderCodeText: (value) => renderSearchHighlight(value, search),
    renderCodeBlock: (block, helpers) => {
      const lang = String(block.lang || "").trim() || "code";
      const code = String(block.text || "").replace(/\n$/, "");
      const copyAttr = escapeHtml(encodeCopyPayload(code));
      return `<div class="msg-md-code-block"><div class="code-block-toolbar"><span class="code-block-lang">${escapeHtml(lang)}</span><button type="button" class="event-copy-button code-block-copy" data-copy-text="${copyAttr}">${escapeHtml(t("generic.copy"))}</button></div><pre class="msg-md-pre"><code class="msg-md-code">${helpers.renderCodeText(code)}</code></pre></div>`;
    },
  });

  return html || `<p class="msg-md-p">${renderSearchHighlight(raw.trim(), search)}</p>`;
}

function renderUserBubble(item) {
  const ev = item.events[0];
  const id = escapeHtml(getUserBubbleElementId(ev.id));
  const copyPayload = encodeCopyPayload(ev.content || "");
  const inspectKey = escapeHtml(getUserInspectKey(item));
  const copyKey = `user:${String(ev.id || item.id || inspectKey)}`;
  const selectedClass = state.detail.messageContextMenu?.anchorKey === copyKey
    ? " message-copy-target-active"
    : "";

  return `
    <div
      id="${id}"
      class="transcript-row transcript-row-user"
      data-inspect-key="${inspectKey}"
    >
      <article
        class="msg-bubble msg-user msg-user-soft transcript-inspectable${selectedClass}"
        aria-label="${escapeHtml(t("timeline.userMessage"))}"
        data-message-copy-text="${escapeHtml(copyPayload)}"
        data-message-copy-key="${escapeHtml(copyKey)}"
      >
        <div class="msg-bubble-body">${renderSearchHighlight(ev.content || "", state.detail.search)}</div>
        <div class="msg-bubble-actions">
          <button type="button" class="event-copy-button msg-copy" data-copy-text="${escapeHtml(copyPayload)}">${escapeHtml(t("generic.copy"))}</button>
        </div>
      </article>
    </div>
  `;
}

function renderAssistantBubble(item) {
  const text = item.events.map((e) => e.content || "").join("");
  const id = escapeHtml(getAssistantBubbleElementId(item.id));
  const copyPayload = encodeCopyPayload(text);
  const bodyHtml = formatAssistantHtml(text, state.detail.search);
  const inspectKey = escapeHtml(getAssistantInspectKey(item));
  const copyKey = `assistant:${String(item.id || inspectKey)}`;
  const selectedClass = state.detail.messageContextMenu?.anchorKey === copyKey
    ? " message-copy-target-active"
    : "";

  return `
    <div
      id="${id}"
      class="transcript-row transcript-row-assistant"
      data-inspect-key="${inspectKey}"
    >
      <article
        class="msg-bubble msg-assistant transcript-inspectable${selectedClass}"
        aria-label="${escapeHtml(t("timeline.assistant"))}"
        data-message-copy-text="${escapeHtml(copyPayload)}"
        data-message-copy-key="${escapeHtml(copyKey)}"
      >
        <div class="msg-bubble-body msg-md">${bodyHtml}</div>
        <div class="msg-bubble-actions">
          <button type="button" class="event-copy-button msg-copy" data-copy-text="${escapeHtml(copyPayload)}">${escapeHtml(t("generic.copy"))}</button>
        </div>
      </article>
    </div>
  `;
}

function isRawStdoutBucketExpanded(bucketId) {
  const explicit = state.detail.rawStdoutBuckets[bucketId];
  if (typeof explicit === "boolean") {
    return explicit;
  }

  return false;
}

function renderRawStdoutBucket(item) {
  const expanded = isRawStdoutBucketExpanded(item.id);
  const text = item.events.map((e) => e.content || "").join("\n");
  const id = escapeHtml(getRawStdoutElementId(item.id));
  const jsonish =
    item.events.length === 1 && String(item.events[0].content || "").trimStart().startsWith("{");

  return `
    <div id="${id}" class="transcript-row transcript-row-raw">
      <article class="raw-stdout-card ${expanded ? "raw-stdout-open" : ""} ${jsonish ? "raw-stdout-jsonish" : ""}">
        <button
          type="button"
          class="raw-stdout-toggle"
          data-raw-stdout-toggle="${escapeHtml(item.id)}"
          aria-expanded="${expanded ? "true" : "false"}"
        >
          <span class="raw-stdout-title">${escapeHtml(t("inspect.rawStdout"))}</span>
          <span class="raw-stdout-meta">${escapeHtml(t("generic.segmentCount", { count: item.events.length }))}</span>
          <span class="raw-stdout-chevron">${escapeHtml(t(expanded ? "generic.collapse" : "generic.expand"))}</span>
        </button>
        ${
          expanded
            ? `<pre class="raw-stdout-body">${renderSearchHighlight(text, state.detail.search)}</pre>`
            : ""
        }
      </article>
    </div>
  `;
}

function renderOrphanStderrBucket(item) {
  const text = item.events.map((e) => e.content || "").join("\n");
  const id = escapeHtml(getOrphanStderrElementId(item.id));
  const copyPayload = encodeCopyPayload(text);

  return `
    <div id="${id}" class="transcript-row transcript-row-stderr">
      <article class="orphan-stderr-card" aria-label="Stderr">
        <div class="orphan-stderr-head">
          <span class="orphan-stderr-label">stderr</span>
          <button type="button" class="event-copy-button msg-copy" data-copy-text="${escapeHtml(copyPayload)}">${escapeHtml(t("generic.copy"))}</button>
        </div>
        <pre class="orphan-stderr-body">${renderSearchHighlight(text, state.detail.search)}</pre>
      </article>
    </div>
  `;
}

function renderNoticeRow(item) {
  const ev = item.event;
  const id = escapeHtml(getEventElementId(ev.id));
  const levelClass =
    ev.level === "error"
      ? "msg-notice-error"
      : ev.level === "warning"
      ? "msg-notice-warning"
        : "msg-notice-info";
  const copyKey = `notice:${String(ev.id || id)}`;
  const selectedClass = state.detail.messageContextMenu?.anchorKey === copyKey
    ? " message-copy-target-active"
    : "";

  return `
    <div
      id="${id}"
      class="transcript-row transcript-row-notice"
      data-inspect-key="${escapeHtml(getNoticeInspectKey(ev))}"
    >
      <article
        class="msg-notice ${levelClass}${selectedClass}"
        role="status"
        data-message-copy-text="${escapeHtml(encodeCopyPayload(ev.content || ""))}"
        data-message-copy-key="${escapeHtml(copyKey)}"
      >
        <p class="msg-notice-text">${renderSearchHighlight(ev.content || "", state.detail.search)}</p>
      </article>
    </div>
  `;
}

function renderStatusMarker(item) {
  const event = item.event;
  const id = escapeHtml(getEventElementId(event.id));
  return `
    <div
      id="${id}"
      class="transcript-row transcript-row-status"
      data-inspect-key="${escapeHtml(getStatusInspectKey(event))}"
    >
      <div class="status-marker status-marker-${escapeHtml(event.status || "idle")}">
        <span class="status-marker-dot" aria-hidden="true"></span>
        <span class="status-marker-label">${escapeHtml(sessionStatusLabel(event.status))}</span>
      </div>
    </div>
  `;
}

function renderToolBodyEvent(event) {
  const id = escapeHtml(getEventElementId(event.id));
  const search = state.detail.search;

  if (event.type === "cli.chunk" && event.stream === "command") {
    return `
      <div id="${id}" class="tool-body-chunk tool-body-command">
        <pre>${renderSearchHighlight(event.content || "", search)}</pre>
      </div>
    `;
  }

  if (event.type === "cli.chunk" && event.stream === "stderr") {
    return `
      <div id="${id}" class="tool-body-chunk tool-body-stderr">
        <pre>${renderSearchHighlight(event.content || "", search)}</pre>
      </div>
    `;
  }

  if (event.type === "system.notice") {
    const levelClass =
      event.level === "error"
        ? "tool-body-notice-error"
        : event.level === "warning"
          ? "tool-body-notice-warning"
          : "tool-body-notice-muted";

    return `
      <div id="${id}" class="tool-body-notice ${levelClass}">
        <p>${renderSearchHighlight(event.content || "", search)}</p>
      </div>
    `;
  }

  return "";
}

function renderConversationItem(item) {
  if (item.type === "tool") {
    return renderCommandGroup(item.group);
  }

  if (item.type === "user") {
    return renderUserBubble(item);
  }

  if (item.type === "assistant") {
    return renderAssistantBubble(item);
  }

  if (item.type === "status") {
    return renderStatusMarker(item);
  }

  if (item.type === "notice") {
    return renderNoticeRow(item);
  }

  return "";
}

// LEGACY: deprecated task-block renderer. Kept temporarily during migration so
// related helper code can be removed in smaller follow-up diffs. Main detail
// rendering no longer uses this path.
function renderSessionStreamShell(taskBlocks) {
  const streamBody =
    taskBlocks.length > 0
      ? taskBlocks.map((task) => renderTaskBlock(task)).join("")
      : `<div class="event-empty">${escapeHtml(t("timeline.empty"))}</div>`;

  return `
    <div class="session-stream-shell">
      <div class="session-stream-main">
        <div id="event-list" class="event-list task-list event-list--flex">
          ${streamBody}
        </div>
      </div>
    </div>
  `;
}

function renderTaskBlock(task) {
  const promptText = task.user.text || "";
  const assistantText = task.assistantMessage?.mainText || "";
  const finalCopyPayload = encodeCopyPayload(assistantText);
  const assistantMainHtml = renderTaskAssistantMain(task);
  const userCopyKey = `task-user:${String(task.key || task.index || "unknown")}`;
  const assistantCopyKey = `task-assistant:${String(task.key || task.index || "unknown")}`;
  const assistantBubbleClass = assistantText
    ? "msg-bubble msg-assistant turn-assistant-bubble"
    : "msg-bubble msg-assistant turn-assistant-bubble turn-assistant-bubble-thinking";
  const assistantSelectedClass = state.detail.messageContextMenu?.anchorKey === assistantCopyKey
    ? " message-copy-target-active"
    : "";
  const userSelectedClass = state.detail.messageContextMenu?.anchorKey === userCopyKey
    ? " message-copy-target-active"
    : "";
  const assistantBodyClass = assistantText
    ? "msg-bubble-body msg-md assistant-main-block"
    : "msg-bubble-body msg-md assistant-main-block assistant-main-block-thinking";

  return `
    <div
      id="${escapeHtml(getTaskContainerElementId(task.key))}"
      class="turn-thread"
    >
      <div class="transcript-row transcript-row-user">
        <article
          class="msg-bubble msg-user msg-user-soft${userSelectedClass}"
          aria-label="${escapeHtml(t("timeline.userMessage"))}"
          data-message-copy-text="${escapeHtml(encodeCopyPayload(promptText))}"
          data-message-copy-key="${escapeHtml(userCopyKey)}"
        >
          <div class="msg-bubble-body">${renderSearchHighlight(promptText, state.detail.search)}</div>
        </article>
      </div>

      <div class="transcript-row transcript-row-assistant">
        <article
          class="${assistantBubbleClass}${assistantSelectedClass}"
          aria-label="${escapeHtml(t("timeline.assistant"))}"
          ${assistantText ? `data-message-copy-text="${escapeHtml(finalCopyPayload)}"` : ""}
          data-message-copy-key="${escapeHtml(assistantCopyKey)}"
        >
          <div class="${assistantBodyClass}">
            ${assistantMainHtml}
          </div>

          ${
            assistantText
              ? `
                <div class="msg-bubble-actions">
                  <button type="button" class="event-copy-button msg-copy" data-copy-text="${escapeHtml(finalCopyPayload)}">${escapeHtml(t("generic.copy"))}</button>
                </div>
              `
              : ""
          }
        </article>
      </div>
    </div>
  `;
}

function hasTaskExecutionDetails(task) {
  return (
    task.steps.length > 0 ||
    task.commandGroups.length > 0 ||
    task.orphanStdoutEvents.length > 0 ||
    task.orphanStderrEvents.length > 0 ||
    task.noticeEvents.length > 0 ||
    task.statusEvents.length > 0 ||
    task.exitEvents.length > 0
  );
}

function getTaskExecutionLineLabel(task) {
  const statusId = task.executionStatus?.id || "idle";
  return getTaskExecutionLineLabelFromStatus(statusId);
}

function renderTaskAssistantMain(task) {
  const showLiveExecutionTimeline =
    state.detail.liveExecutionTaskKey === task.key &&
    Array.isArray(task.steps) &&
    task.steps.length > 0;

  if (showLiveExecutionTimeline) {
    return renderTaskAssistantTimeline(task);
  }

  const compactStepsHtml = showLiveExecutionTimeline
    ? ""
    : renderTaskStepList(task, {
        compact: true,
        onlyActive: true,
        includeRecentWhenIdle: !task.assistantMessage?.mainText,
      });

  let mainHtml = "";
  if (task.assistantMessage?.mainText) {
    mainHtml = `${formatAssistantHtml(task.assistantMessage.mainText, state.detail.search)}`;
  } else {
    mainHtml = "";
  }

  return `
    <div class="assistant-main-stack">
      <div class="assistant-main-text">
        ${mainHtml}
      </div>
      ${compactStepsHtml}
    </div>
  `;
}

function renderTaskAssistantTimeline(task, options = {}) {
  const executionEvents = Array.isArray(task.executionEvents) ? task.executionEvents : [];
  const stepByGroupId = new Map(
    (Array.isArray(task.steps) ? task.steps : [])
      .filter((step) => step.kind === "command" && step.groupId)
      .map((step) => [step.groupId, step]),
  );
  const commandRanges = listCommandGroupRanges(executionEvents);
  const commandRangeByStart = new Map(commandRanges.map((range) => [range.start, range]));
  const blocks = [];
  let assistantBuffer = "";

  const flushAssistantBuffer = () => {
    const text = assistantBuffer.trim();
    if (!text) {
      assistantBuffer = "";
      return;
    }

    blocks.push(`
      <div class="assistant-main-text assistant-main-text-inline">
        ${formatAssistantHtml(text, state.detail.search)}
      </div>
    `);
    assistantBuffer = "";
  };

  for (let index = 0; index < executionEvents.length; index += 1) {
    const range = commandRangeByStart.get(index);
    if (range) {
      flushAssistantBuffer();
      const step = stepByGroupId.get(range.group.id);
      if (step) {
        blocks.push(renderTaskTimelineCommandStep(task, step));
      }
      index = range.end;
      continue;
    }

    const event = executionEvents[index];
    if (event?.type === "cli.chunk" && event.stream === "assistant" && event.content) {
      assistantBuffer += event.content;
    }
  }

  flushAssistantBuffer();
  return `
    <div class="assistant-main-stack assistant-main-stack-live">
      ${blocks.join("")}
    </div>
  `;
}

function renderTaskTimelineCommandStep(task, step) {
  const stepKey = step.groupId || `step-${task.key}`;
  const expanded = isTaskStepExpanded(task.key, stepKey, Boolean(step.defaultExpanded));
  const collapsedSummary = step.collapsedSummary || step.detailSummary || "";
  const detailBlock =
    expanded && step.group
      ? `
            <div class="task-step-detail-body">
              ${renderInlineCommandDetail(step.group)}
            </div>
          `
      : "";

  return `
    <div class="task-step-list task-step-list-inline">
      <div class="task-step-item task-step-item-command task-step-item-command-${escapeHtml(step.status || "success")} ${expanded ? "task-step-item-expanded" : "task-step-item-collapsed"}">
        <button
          type="button"
          class="task-step-toggle-row"
          data-task-step-toggle="1"
          data-task-key="${escapeHtml(task.key)}"
          data-step-key="${escapeHtml(stepKey)}"
          aria-expanded="${expanded ? "true" : "false"}"
        >
          <span class="task-step-toggle-main">
            <span class="task-step-label task-step-label-muted">${renderSearchHighlight(step.label, state.detail.search)}</span>
            ${step.meta ? `<span class="task-step-meta">${escapeHtml(step.meta)}</span>` : ""}
          </span>
        </button>
        ${
          step.status === "running" && Array.isArray(step.previewLines) && step.previewLines.length > 0
            ? `
              <div class="task-step-preview task-step-preview-running">
                ${step.previewLines
                  .map(
                    (line) =>
                      `<div class="task-step-preview-line">${renderSearchHighlight(
                        shortenText(line, 180),
                        state.detail.search,
                      )}</div>`,
                  )
                  .join("")}
              </div>
            `
            : collapsedSummary
              ? `<div class="task-step-collapsed-summary">${renderSearchHighlight(collapsedSummary, state.detail.search)}</div>`
              : ""
        }
        ${detailBlock}
      </div>
    </div>
  `;
}

function renderTaskStepList(task, options = {}) {
  const compact = Boolean(options.compact);
  const onlyActive = Boolean(options.onlyActive);
  const includeRecentWhenIdle = Boolean(options.includeRecentWhenIdle);

  let steps = Array.isArray(task.steps) ? [...task.steps] : [];

  if (onlyActive) {
    const activeSteps = steps.filter((step) => {
      if (step.kind === "command") {
        return step.status === "running" || step.status === "error";
      }
      return step.kind === "warning" || step.kind === "error";
    });
    const fallbackRecentSteps =
      includeRecentWhenIdle && activeSteps.length === 0
        ? steps.filter((step) => step.kind === "command" || step.kind === "warning").slice(-1)
        : [];

    steps = activeSteps.length > 0 ? activeSteps : fallbackRecentSteps;

    // 主流里最多只放一条当前命令，避免全堆在顶部
    const runningCommands = steps.filter((step) => step.kind === "command");
    const notices = steps.filter((step) => step.kind !== "command");
    const latestRunning = runningCommands.length > 0 ? [runningCommands.at(-1)] : [];
    steps = [...latestRunning, ...notices].slice(0, 2);
  }

  if (!steps.length) {
    return compact ? "" : `<div class="task-step-empty">${escapeHtml(t("task.empty"))}</div>`;
  }

  return `
    <div class="task-step-list ${compact ? "task-step-list-compact" : "task-step-list-detail"}">
      ${steps
    .map((step, index) => {
      if (step.kind !== "command") {
        return `
              <div class="task-step-item task-step-item-${escapeHtml(step.kind || "status")}">
                <div class="task-step-row">
                  <span class="task-step-label">${renderSearchHighlight(step.label, state.detail.search)}</span>
                  ${
          step.meta
            ? `<span class="task-step-meta">${escapeHtml(step.meta)}</span>`
            : ""
        }
                </div>
              </div>
            `;
      }

      const stepKey = step.groupId || `step-${index}`;
      const expanded = !compact && isTaskStepExpanded(
        task.key,
        stepKey,
        Boolean(step.defaultExpanded),
      );

      const previewLines = Array.isArray(step.previewLines) ? step.previewLines : [];
      const previewHtml =
        step.status === "running" && previewLines.length > 0
          ? `
                <div class="task-step-preview task-step-preview-running">
                  ${previewLines
            .map(
              (line) =>
                `<div class="task-step-preview-line">${renderSearchHighlight(
                  shortenText(line, 180),
                  state.detail.search,
                )}</div>`,
            )
            .join("")}
                </div>
              `
          : "";

      const collapsedSummary = step.collapsedSummary || step.detailSummary || "";
      const detailBlock =
        !compact && expanded && step.group
          ? `
                <div class="task-step-detail-body">
                  ${renderInlineCommandDetail(step.group)}
                </div>
              `
          : "";

      return `
            <div class="task-step-item task-step-item-command task-step-item-command-${escapeHtml(step.status || "success")} ${expanded ? "task-step-item-expanded" : "task-step-item-collapsed"}">
              <button
                type="button"
                class="task-step-toggle-row"
                data-task-step-toggle="${compact ? "0" : "1"}"
                data-task-key="${escapeHtml(task.key)}"
                data-step-key="${escapeHtml(stepKey)}"
                aria-expanded="${expanded ? "true" : "false"}"
                ${compact ? "tabindex='-1'" : ""}
              >
                <span class="task-step-toggle-main">
                  <span class="task-step-label task-step-label-muted">${renderSearchHighlight(step.label, state.detail.search)}</span>
                  ${
        !compact && step.meta
          ? `<span class="task-step-meta">${escapeHtml(step.meta)}</span>`
          : ""
      }
                </span>
              </button>

              ${
        step.status === "running"
          ? previewHtml
          : !compact && collapsedSummary
            ? `<div class="task-step-collapsed-summary">${renderSearchHighlight(collapsedSummary, state.detail.search)}</div>`
            : ""
      }

              ${detailBlock}
            </div>
          `;
    })
    .join("")}
    </div>
  `;
}

function renderTaskExecutionDetails(task) {
  const outputHtml = renderTaskOutputDetails(task);
  const rawEvents = getTaskRawEvents(task);

  return `
    <div class="assistant-execution-details">
      ${renderTaskStepList(task, { compact: false, onlyActive: false })}
      ${outputHtml}
      ${
    rawEvents.length > 0
      ? `
            <details class="assistant-raw-events">
              <summary>${escapeHtml(t("inspect.viewRawEvents"))}</summary>
              ${renderRawEventList(rawEvents)}
            </details>
          `
      : ""
  }
    </div>
  `;
}

function renderTaskOutputDetails(task) {
  const orphanEvents = [...task.orphanStdoutEvents, ...task.orphanStderrEvents];
  if (orphanEvents.length === 0) {
    return "";
  }

  const summaryParts = [];
  if (task.orphanStdoutEvents.length > 0) {
    summaryParts.push(t("command.stdoutCount", { count: task.orphanStdoutEvents.length }));
  }
  if (task.orphanStderrEvents.length > 0) {
    summaryParts.push(t("command.stderrCount", { count: task.orphanStderrEvents.length }));
  }

  return `
    <div class="assistant-command-item assistant-command-item-inline-detail">
      <div class="assistant-command-head">
        <span class="assistant-command-code">${escapeHtml(t("inspect.commandOutput"))}</span>
        <span class="assistant-command-meta">${escapeHtml(summaryParts.join(" · "))}</span>
      </div>
      <details class="assistant-command-output">
        <summary>${escapeHtml(t("inspect.viewOutputDetails"))}</summary>
        <div class="assistant-command-body">
          ${orphanEvents.map((event) => renderToolBodyEvent(event)).join("")}
        </div>
      </details>
    </div>
  `;
}

function renderInlineCommandDetail(group) {
  const exitCode = getCommandExitCode(group.endEvent);
  const status = getCommandRunStatusPresentation(group, exitCode);
  const timing = describeCommandTiming(group);
  const preview = describeCommandPreview(group);
  const copyPayload = encodeCopyPayload(group.command || "");
  const meta = [];

  if (group.outputCount > 0) {
    meta.push(t("command.outputCount", { count: group.outputCount }));
  }
  if (group.stderrCount > 0) {
    meta.push(t("command.stderrCount", { count: group.stderrCount }));
  }
  if (timing) {
    meta.push(timing.label);
  }
  meta.push(status.label);

  const outputSummary = getCommandOutputSummary(group, preview);

  return `
    <div class="assistant-command-item assistant-command-item-inline-detail">
      <div class="assistant-command-head">
        <code class="assistant-command-code">${escapeHtml(group.command || t("inspect.commandUnknown"))}</code>
        <span class="assistant-command-meta">${escapeHtml(meta.join(" · "))}</span>
      </div>
      ${
        outputSummary
          ? `<p class="assistant-command-preview">${renderSearchHighlight(outputSummary, state.detail.search)}</p>`
          : ""
      }
      <details class="assistant-command-output">
        <summary>${escapeHtml(t("inspect.viewFullCommandOutput"))}</summary>
        ${
          group.command
            ? `
              <div class="assistant-command-actions">
                <button
                  type="button"
                  class="event-copy-button msg-copy"
                  data-copy-text="${escapeHtml(copyPayload)}"
                >${escapeHtml(t("inspect.copyCommand"))}</button>
              </div>
            `
            : ""
        }
        <div class="assistant-command-body">
          ${
            group.events.length > 0
              ? group.events
                  .filter((event) => !isCommandEndNotice(event))
                  .map((event) => renderToolBodyEvent(event))
                  .join("") || `<div class="command-group-empty">${escapeHtml(t("generic.noExtraOutput"))}</div>`
              : `<div class="command-group-empty">${escapeHtml(t("generic.noOutputYet"))}</div>`
          }
        </div>
      </details>
    </div>
  `;
}

function getCommandOutputSummary(group, preview) {
  if (!group.endEvent) {
    return t("inspect.commandStillRunning");
  }

  if (preview && !preview.empty) {
    const firstLine = String(preview.text || "")
      .split("\n")
      .find((line) => line.trim() && line.trim() !== "…");
    if (firstLine) {
      return shortenText(firstLine.replace(/^\[stderr\]\s*/, ""), 140);
    }
  }

  if (group.stderrCount > 0) {
    return t("inspect.commandEndedWithErrors");
  }

  if (group.outputCount > 0) {
    return t("inspect.commandCompletedExpand");
  }

  return t("inspect.commandCompletedNoOutput");
}

function getTaskRawEvents(task) {
  const events = [];
  const seen = new Set();

  const pushEvent = (event) => {
    if (!event) {
      return;
    }
    const key = event.id || `${event.type}:${event.ts || ""}:${event.content || event.status || ""}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    events.push(event);
  };

  task.statusEvents.forEach(pushEvent);
  task.noticeEvents.forEach(pushEvent);
  task.commandGroups.forEach((group) => {
    pushEvent(group.startEvent);
    group.events.forEach(pushEvent);
    pushEvent(group.endEvent);
  });

  return events.sort((left, right) => Number(left.ts || 0) - Number(right.ts || 0));
}

function renderCommandGroup(group) {
  const exitCode = getCommandExitCode(group.endEvent);
  const status = getCommandRunStatusPresentation(group, exitCode);
  const timing = describeCommandTiming(group);
  const attention = describeCommandAttention(group);
  const preview = describeCommandPreview(group);
  const commandLabel = renderSearchHighlight(
    shortenText(group.command || t("inspect.commandUnknown"), 220),
    state.detail.search,
  );
  const stderrStrong = group.stderrCount > 0;
  const exitStrong = Boolean(exitCode && exitCode !== "0");
  const inspectKey = getCommandGroupInspectKey(group);
  const summary = getCommandStepSummary(group, preview);
  const selected = state.detail.inspectSelectionKey === inspectKey;

  return `
    <article
      id="${escapeHtml(getCommandGroupElementId(group.id))}"
      class="command-group command-step-card ${selected ? "command-step-card-selected" : ""} ${attention?.cardClass || ""} ${stderrStrong ? "command-group-has-stderr" : ""} ${exitStrong ? "command-group-exit-bad" : ""}"
      data-inspect-key="${escapeHtml(inspectKey)}"
    >
      <div class="command-task-card">
        <div class="command-task-toggle">
          <div class="command-task-toggle-body">
            <div class="command-task-title-row">
              <code class="command-task-title">${commandLabel}</code>
              <span class="command-status-pill ${escapeHtml(status.pillClass)}">${escapeHtml(status.label)}</span>
            </div>
            <p class="command-step-summary">${escapeHtml(summary)}</p>
            <div class="command-task-metrics" aria-label="${escapeHtml(t("inspect.commandMetrics"))}">
              ${
                timing
                  ? `<span class="command-task-metric command-task-metric-timing"><span class="command-task-metric-k">${escapeHtml(t("inspect.duration"))}</span><span class="command-task-metric-v">${escapeHtml(timing.value)}</span></span>`
                  : ""
              }
              <span class="command-task-metric"><span class="command-task-metric-k">${escapeHtml(t("inspect.output"))}</span><span class="command-task-metric-v">${escapeHtml(String(group.outputCount))}</span></span>
              ${
                stderrStrong
                  ? `<span class="command-task-metric command-task-metric-warn"><span class="command-task-metric-k">stderr</span><span class="command-task-metric-v">${escapeHtml(String(group.stderrCount))}</span></span>`
                  : ""
              }
              ${
                exitStrong
                  ? `<span class="command-task-metric command-task-metric-danger"><span class="command-task-metric-k">exit</span><span class="command-task-metric-v">${escapeHtml(formatExitCodeForDisplay(group.endEvent, exitCode))}</span></span>`
                  : ""
              }
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function getCommandStepSummary(group, preview) {
  const presentation = describeCommandPresentation(group, preview);

  if (!group.endEvent) {
    return presentation.collapsedSummary || t("command.summary.running");
  }

  return presentation.collapsedSummary || t("command.summary.completed");
}

function renderCommandGroupDetail(group) {
  const exitCode = getCommandExitCode(group.endEvent);
  const status = getCommandRunStatusPresentation(group, exitCode);
  const timing = describeCommandTiming(group);
  const copyButton = group.command
    ? `
      <button
        type="button"
        class="event-copy-button command-task-copy"
        data-copy-text="${escapeHtml(encodeCopyPayload(group.command))}"
      >${escapeHtml(t("inspect.copyCommand"))}</button>
    `
    : "";

  return `
    <div class="inspect-detail-stack">
      <div class="inspect-detail-head">
        <span class="inspect-detail-kind">${escapeHtml(t("inspect.executionSteps"))}</span>
        ${copyButton}
      </div>
      <div class="inspect-command-card">
        <div class="command-task-title-row">
          <code class="command-task-title">${escapeHtml(group.command || t("inspect.commandUnknown"))}</code>
          <span class="command-status-pill ${escapeHtml(status.pillClass)}">${escapeHtml(status.label)}</span>
        </div>
        <div class="command-task-metrics inspect-command-metrics">
          ${
            timing
              ? `<span class="command-task-metric command-task-metric-timing"><span class="command-task-metric-k">${escapeHtml(t("inspect.duration"))}</span><span class="command-task-metric-v">${escapeHtml(timing.value)}</span></span>`
              : ""
          }
          <span class="command-task-metric"><span class="command-task-metric-k">${escapeHtml(t("inspect.output"))}</span><span class="command-task-metric-v">${escapeHtml(String(group.outputCount))}</span></span>
          <span class="command-task-metric ${group.stderrCount > 0 ? "command-task-metric-warn" : ""}"><span class="command-task-metric-k">stderr</span><span class="command-task-metric-v">${escapeHtml(String(group.stderrCount))}</span></span>
          <span class="command-task-metric ${exitCode && exitCode !== "0" ? "command-task-metric-danger" : ""}">
            <span class="command-task-metric-k">exit</span>
            <span class="command-task-metric-v">${escapeHtml(formatExitCodeForDisplay(group.endEvent, exitCode))}</span>
          </span>
        </div>
      </div>
      <div class="inspect-detail-card inspect-detail-card-raw">
        ${
          group.events.length > 0
            ? group.events
                .filter((event) => !isCommandEndNotice(event))
                .map((event) => renderToolBodyEvent(event))
                .join("") || `<div class="command-group-empty">${escapeHtml(t("generic.noExtraOutput"))}</div>`
            : `<div class="command-group-empty">${escapeHtml(t("generic.noOutputYet"))}</div>`
        }
      </div>
    </div>
  `;
}

function isCommandStartNotice(event) {
  return (
    event.type === "system.notice" &&
    event.content &&
    event.content.startsWith("Running command:")
  );
}

function isCommandEndNotice(event) {
  return (
    event.type === "system.notice" &&
    event.content &&
    event.content.startsWith("Command completed")
  );
}

function isCommandBodyEvent(event) {
  return isCommandEndNotice(event) || isCommandOutputEvent(event);
}

function isCommandOutputEvent(event) {
  return (
    event.type === "cli.chunk" &&
    (event.stream === "command" || event.stream === "stderr")
  );
}

function extractCommandText(event) {
  if (!isCommandStartNotice(event)) {
    return "";
  }

  return event.content.replace("Running command: ", "");
}

function describeCommandTiming(group) {
  const durationSeconds = getCommandDurationSeconds(group);
  if (durationSeconds <= 0) {
    return null;
  }

  return {
    label: t(group.endEvent ? "command.elapsedLabel" : "command.runningForLabel", {
      value: formatDurationSeconds(durationSeconds),
    }),
    value: formatDurationSeconds(durationSeconds),
    className: group.endEvent
      ? "command-group-pill-timing"
      : "command-group-pill-live",
  };
}

function describeCommandAttention(group) {
  const exitCode = getCommandExitCode(group.endEvent);
  if (exitCode && exitCode !== "0") {
    return {
      label: t("inspect.problemCommand"),
      pillClass: "command-group-pill-danger",
      cardClass: "command-group-danger",
    };
  }

  const durationSeconds = getCommandDurationSeconds(group);
  if (!group.endEvent && durationSeconds >= LONG_RUNNING_COMMAND_SECONDS) {
    return {
      label: t("inspect.longRunning"),
      pillClass: "command-group-pill-warning",
      cardClass: "command-group-running-long",
    };
  }

  if (durationSeconds >= SLOW_COMMAND_SECONDS) {
    return {
      label: t("inspect.slowCommand"),
      pillClass: "command-group-pill-warning",
      cardClass: "command-group-slow",
    };
  }

  return null;
}

function describeCommandPreview(group) {
  const outputEvents = group.events.filter(isCommandOutputEvent);
  const hasStderr = outputEvents.some((event) => event.stream === "stderr");
  const lines = outputEvents.flatMap((event) => getCommandPreviewLines(event));
  const keyword = normalizeSearchKeyword(state.detail.search);

  if (lines.length === 0) {
    return {
      text: group.endEvent ? t("inspect.commandCompletedNoOutput") : t("generic.noOutputYet"),
      hiddenLineCount: 0,
      hasStderr: false,
      empty: true,
      focusedBySearch: false,
    };
  }

  if (keyword) {
    const focusedPreview = buildSearchFocusedPreview(lines, keyword);
    if (focusedPreview) {
      return {
        ...focusedPreview,
        hasStderr,
        empty: false,
        focusedBySearch: true,
      };
    }
  }

  if (lines.length <= COMMAND_PREVIEW_HEAD_LINES + COMMAND_PREVIEW_TAIL_LINES) {
    return {
      text: lines.join("\n"),
      hiddenLineCount: 0,
      hasStderr,
      empty: false,
      focusedBySearch: false,
    };
  }

  const hiddenLineCount = lines.length - COMMAND_PREVIEW_HEAD_LINES - COMMAND_PREVIEW_TAIL_LINES;
  return {
    text: [
      ...lines.slice(0, COMMAND_PREVIEW_HEAD_LINES),
      "…",
      ...lines.slice(-COMMAND_PREVIEW_TAIL_LINES),
    ].join("\n"),
    hiddenLineCount,
    hasStderr,
    empty: false,
    focusedBySearch: false,
  };
}

function getCommandOutputLines(group) {
  return group.events
    .filter(isCommandOutputEvent)
    .flatMap((event) => getCommandPreviewLines(event))
    .map((line) => String(line || "").replace(/\r/g, ""))
    .filter((line) => line.trim());
}

function getTailLines(lines, count) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return [];
  }
  return lines.slice(-Math.max(1, count));
}

function getFirstMeaningfulPreviewLine(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && line !== "…");
}

function describeCommandPresentation(group, preview = describeCommandPreview(group)) {
  const lines = getCommandOutputLines(group);
  const exitCode = getCommandExitCode(group.endEvent);
  const isRunning = !group.endEvent;
  const isError = Boolean(exitCode && exitCode !== "0");
  const hasOutput = lines.length > 0;

  const previewLines = isRunning
    ? getTailLines(lines, COMMAND_RUNNING_PREVIEW_LINES)
    : [];

  let collapsedSummary = "";
  let detailSummary = "";

  if (isRunning) {
    const lastLine = getTailLines(lines, 1)[0];
    collapsedSummary = lastLine
      ? shortenText(lastLine.replace(/^\[stderr\]\s*/, ""), COMMAND_COLLAPSED_SUMMARY_MAX)
      : t("command.summary.running");
    detailSummary = collapsedSummary;
  } else if (preview && !preview.empty) {
    const firstLine = getFirstMeaningfulPreviewLine(preview.text);
    if (firstLine) {
      collapsedSummary = shortenText(
        firstLine.replace(/^\[stderr\]\s*/, ""),
        COMMAND_COLLAPSED_SUMMARY_MAX,
      );
      detailSummary = collapsedSummary;
    }
  }

  if (!collapsedSummary) {
    if (isError) {
      collapsedSummary = t("command.summary.failedExpand");
      detailSummary = collapsedSummary;
    } else if (group.stderrCount > 0) {
      collapsedSummary = t("command.summary.completedWithStderr");
      detailSummary = collapsedSummary;
    } else if (hasOutput) {
      collapsedSummary = t("command.summary.completedExpand");
      detailSummary = collapsedSummary;
    } else {
      collapsedSummary = group.endEvent ? t("inspect.noOutput") : t("inspect.noOutputYetShort");
      detailSummary = collapsedSummary;
    }
  }

  return {
    status: isRunning ? "running" : isError ? "error" : "success",
    previewLines,
    collapsedSummary,
    detailSummary,
  };
}

function getTaskStepDetailKey(taskKey, stepKey) {
  return `${taskKey}::${stepKey}`;
}

function isTaskStepExpanded(taskKey, stepKey, fallback = false) {
  const key = getTaskStepDetailKey(taskKey, stepKey);
  const explicitValue = state.detail.taskDetails[key];
  if (typeof explicitValue === "boolean") {
    return explicitValue;
  }
  return fallback;
}

function setTaskStepExpanded(taskKey, stepKey, expanded) {
  const key = getTaskStepDetailKey(taskKey, stepKey);
  state.detail.taskDetails[key] = Boolean(expanded);
}

function buildSearchFocusedPreview(lines, keyword) {
  const matchedIndexes = [];

  lines.forEach((line, index) => {
    if (String(line || "").toLowerCase().includes(keyword)) {
      matchedIndexes.push(index);
    }
  });

  if (matchedIndexes.length === 0) {
    return null;
  }

  const ranges = [
    expandPreviewRange(matchedIndexes[0], lines.length),
  ];
  const lastMatch = matchedIndexes[matchedIndexes.length - 1];
  if (lastMatch !== matchedIndexes[0]) {
    ranges.push(expandPreviewRange(lastMatch, lines.length));
  }

  const mergedRanges = mergePreviewRanges(ranges);
  const previewLines = [];
  let visibleLineCount = 0;
  let cursor = 0;

  mergedRanges.forEach((range) => {
    if (range.start > cursor) {
      previewLines.push("…");
    }

    previewLines.push(...lines.slice(range.start, range.end + 1));
    visibleLineCount += range.end - range.start + 1;
    cursor = range.end + 1;
  });

  if (cursor < lines.length) {
    previewLines.push("…");
  }

  return {
    text: previewLines.join("\n"),
    hiddenLineCount: Math.max(0, lines.length - visibleLineCount),
  };
}

function expandPreviewRange(index, totalLines) {
  return {
    start: Math.max(0, index - COMMAND_PREVIEW_MATCH_CONTEXT_LINES),
    end: Math.min(totalLines - 1, index + COMMAND_PREVIEW_MATCH_CONTEXT_LINES),
  };
}

function mergePreviewRanges(ranges) {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = merged[merged.length - 1];

    if (current.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }

    merged.push(current);
  }

  return merged;
}

function matchesEventOptions(event, options = {}) {
  return (
    matchesEventFilter(event, options.filter || "all") &&
    matchesEventSearch(event, options.search || "") &&
    matchesEventSeverity(event, options.severity || "all")
  );
}

function getCommandDurationSeconds(group) {
  const startTs = Number(group.startEvent?.ts || 0);
  const endTs = Number(group.endEvent?.ts || getLastTimedEventTs(group.events) || 0);

  if (!startTs || !endTs || endTs <= startTs) {
    return 0;
  }

  return endTs - startTs;
}

function getLastTimedEventTs(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const ts = Number(events[index]?.ts || 0);
    if (ts > 0) {
      return ts;
    }
  }

  return 0;
}

function getCommandPreviewLines(event) {
  const normalized = String(event.content || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.map((line) => (event.stream === "stderr" ? `[stderr] ${line}` : line));
}

function formatDurationSeconds(durationSeconds) {
  const totalMs = Math.max(0, Math.round(Number(durationSeconds || 0) * 1000));

  if (totalMs < 1000) {
    return `${totalMs}ms`;
  }

  const totalSeconds = totalMs / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(totalSeconds >= 10 ? 0 : 1)}s`;
  }

  const roundedSeconds = Math.round(totalSeconds);
  if (roundedSeconds >= 3600) {
    const hours = Math.floor(roundedSeconds / 3600);
    const minutes = Math.floor((roundedSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatElapsedSinceIso(isoString) {
  const ts = Date.parse(String(isoString || ""));
  if (!Number.isFinite(ts)) {
    return "--";
  }

  return formatDurationSeconds(Math.max(0, (Date.now() - ts) / 1000));
}

function formatElapsedSinceUnixSeconds(unixSeconds) {
  const safeSeconds = Number(unixSeconds || 0);
  if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) {
    return "--";
  }

  return formatDurationSeconds(Math.max(0, Date.now() / 1000 - safeSeconds));
}

function getCommandExitCode(endEvent) {
  const match = endEvent?.content?.match(/^Command completed \(([^)]+)\):/);
  return match?.[1] || "";
}

function getCommandRunStatusPresentation(group, exitCode) {
  if (!group.endEvent) {
    return { label: t("inspect.running"), pillClass: "command-status-live" };
  }

  if (exitCode && exitCode !== "0") {
    return { label: t("inspect.error"), pillClass: "command-status-error" };
  }

  return { label: t("inspect.completed"), pillClass: "command-status-done" };
}

function formatExitCodeForDisplay(endEvent, exitCode) {
  if (!endEvent) {
    return "—";
  }

  if (exitCode === "" || exitCode == null) {
    return "—";
  }

  return String(exitCode);
}

function shouldExpandCommandGroupByDefault(group) {
  if (!group.endEvent) {
    return true;
  }

  if (group.stderrCount > 0) {
    return true;
  }

  const exitCode = getCommandExitCode(group.endEvent);
  if (exitCode && exitCode !== "0") {
    return true;
  }

  return false;
}

function isCommandGroupExpanded(groupId, fallback) {
  const explicitValue = state.detail.commandGroups[groupId];
  if (typeof explicitValue === "boolean") {
    return explicitValue;
  }

  return fallback;
}

function getEventFilterOptions(counts) {
  return [
    { id: "all", label: t("inspect.filter.all"), count: counts.all },
    { id: "assistant", label: t("inspect.filter.assistant"), count: counts.assistant },
    { id: "command", label: t("inspect.filter.command"), count: counts.command },
    { id: "system", label: t("inspect.filter.system"), count: counts.system },
  ];
}

function getEventSeverityOptions(events) {
  return [
    { id: "all", label: t("inspect.severity.all"), count: events.length },
    {
      id: "error",
      label: t("inspect.error"),
      count: events.filter((event) => matchesEventSeverity(event, "error")).length,
    },
    {
      id: "warning",
      label: t("inspect.warning"),
      count: events.filter((event) => matchesEventSeverity(event, "warning")).length,
    },
    {
      id: "stderr",
      label: t("inspect.stderr"),
      count: events.filter((event) => matchesEventSeverity(event, "stderr")).length,
    },
  ];
}

function getEventCounts(events) {
  const counts = {
    all: events.length,
    assistant: 0,
    command: 0,
    system: 0,
  };

  events.forEach((event) => {
    if (matchesEventFilter(event, "assistant")) {
      counts.assistant += 1;
    }

    if (matchesEventFilter(event, "command")) {
      counts.command += 1;
    }

    if (matchesEventFilter(event, "system")) {
      counts.system += 1;
    }
  });

  return counts;
}

function summarizeSessionDetail(events) {
  const counts = getEventCounts(events);
  const lastAssistantEvent = [...events]
    .reverse()
    .find((event) => event.type === "cli.chunk" && event.stream === "assistant");
  const lastCommandNotice = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === "system.notice" &&
        event.content &&
        event.content.startsWith("Running command:"),
    );

  return {
    totalEvents: counts.all,
    assistantEvents: counts.assistant,
    commandEvents: counts.command,
    systemEvents: counts.system,
    lastAssistantReply: lastAssistantEvent?.content || "",
    lastCommand: lastCommandNotice?.content
      ? lastCommandNotice.content.replace("Running command: ", "")
      : "",
  };
}

function getSessionStatusOptions(sessions) {
  const counts = new Map();
  sessions.forEach((session) => {
    counts.set(session.status, (counts.get(session.status) || 0) + 1);
  });

  const orderedStatuses = [
    "idle",
    "starting",
    "running",
    "waiting_input",
    "stopping",
    "completed",
    "failed",
  ];
  const presentStatuses = orderedStatuses.filter((status) => counts.has(status));

  return [
    { value: "all", label: t("sessions.statusAll", { count: sessions.length }) },
    ...presentStatuses.map((status) => ({
      value: status,
      label: `${sessionStatusLabel(status)} (${counts.get(status) || 0})`,
    })),
  ];
}

function getSessionProjectOptions(projects, sessions) {
  const counts = new Map();
  sessions.forEach((session) => {
    counts.set(session.projectId, (counts.get(session.projectId) || 0) + 1);
  });

  return [
    { value: "all", label: t("sessions.projectAll", { count: sessions.length }) },
    ...projects.map((project) => ({
      value: project.projectId,
      label: `${project.name} (${counts.get(project.projectId) || 0})`,
    })),
  ];
}

function getThreadFilterOptions(sessions) {
  const readyCount = sessions.filter((session) => Boolean(session.codexThreadId)).length;
  const missingCount = sessions.length - readyCount;

  return [
    { value: "all", label: t("sessions.threadAll"), count: sessions.length },
    { value: "ready", label: t("sessions.threadReadyFilter"), count: readyCount },
    { value: "missing", label: t("sessions.threadMissingFilter"), count: missingCount },
  ];
}

function getSessionSortOptions() {
  return [
    { value: "activity_desc", label: t("sessions.sort.activity_desc") },
    { value: "created_desc", label: t("sessions.sort.created_desc") },
    { value: "events_desc", label: t("sessions.sort.events_desc") },
    { value: "reply_desc", label: t("sessions.sort.reply_desc") },
  ];
}

function parseHashRoute(hash) {
  const normalized = hash || "#/sessions";
  const [path, query = ""] = normalized.split("?");
  return {
    path,
    query,
  };
}

function getCodexQuotaCacheKey(sessionId) {
  return `${CODEX_QUOTA_CACHE_PREFIX}${String(sessionId || "").trim()}`;
}

function readQuotaNumber(input) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === "string" && input.trim()) {
    const parsed = Number.parseFloat(input);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toQuotaRemainingPercent(input) {
  const usedPercent = readQuotaNumber(input);
  if (usedPercent == null) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(100 - usedPercent)));
}

function formatQuotaRemainTime(input) {
  const resetAt = readQuotaNumber(input);
  if (resetAt == null) {
    return null;
  }

  const diffSec = Math.max(0, Math.floor(resetAt - Date.now() / 1000));
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatQuotaResetDate(input) {
  const resetAt = readQuotaNumber(input);
  if (resetAt == null) {
    return null;
  }

  const date = new Date(resetAt * 1000);
  return new Intl.DateTimeFormat(getIntlLocale(), {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function normalizeCodexQuotaPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (
    payload.quota &&
    typeof payload.quota === "object" &&
    payload.quota.hour &&
    payload.quota.week
  ) {
    return payload;
  }

  const rateLimits =
    payload.rateLimits && typeof payload.rateLimits === "object" ? payload.rateLimits : {};
  const primary =
    rateLimits.primary && typeof rateLimits.primary === "object" ? rateLimits.primary : {};
  const secondary =
    rateLimits.secondary && typeof rateLimits.secondary === "object" ? rateLimits.secondary : {};

  if (!Object.keys(primary).length && !Object.keys(secondary).length) {
    return null;
  }

  return {
    quota: {
      hour: {
        percent: toQuotaRemainingPercent(primary.used_percent),
        remainTime: formatQuotaRemainTime(primary.resets_at),
      },
      week: {
        percent: toQuotaRemainingPercent(secondary.used_percent),
        resetDate: formatQuotaResetDate(secondary.resets_at),
      },
    },
  };
}

function hasVisibleCodexQuota(payload) {
  const quota = payload?.quota;
  if (!quota || typeof quota !== "object") {
    return false;
  }

  return (
    quotaValuePresent(quota?.hour?.percent) ||
    quotaValuePresent(quota?.hour?.remainTime) ||
    quotaValuePresent(quota?.week?.percent) ||
    quotaValuePresent(quota?.week?.resetDate)
  );
}

function quotaValuePresent(input) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return true;
  }

  return typeof input === "string" && input.trim().length > 0;
}

function readCachedCodexQuota(sessionId) {
  const key = getCodexQuotaCacheKey(sessionId);
  if (!sessionId) {
    return null;
  }

  try {
    const raw = window.localStorage?.getItem(key);
    const normalized = raw ? normalizeCodexQuotaPayload(JSON.parse(raw)) : null;
    return normalized && hasVisibleCodexQuota(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function writeCachedCodexQuota(sessionId, payload) {
  const normalized = normalizeCodexQuotaPayload(payload);
  if (!sessionId || !normalized || !hasVisibleCodexQuota(normalized)) {
    return;
  }

  try {
    window.localStorage?.setItem(getCodexQuotaCacheKey(sessionId), JSON.stringify(normalized));
  } catch {
    /* ignore quota cache write errors */
  }
}

function setDetailCodexQuota(sessionId, payload) {
  const normalized = normalizeCodexQuotaPayload(payload);
  if (!normalized || !hasVisibleCodexQuota(normalized)) {
    return state.detail.codexQuota;
  }

  state.detail.codexQuota = normalized;
  if (sessionId) {
    writeCachedCodexQuota(sessionId, normalized);
  }
  return normalized;
}

function getSlashQueryFromDraft(value) {
  const text = String(value || "");
  if (!text.startsWith("/")) {
    return null;
  }

  if (/[\r\n]/.test(text)) {
    return null;
  }

  const normalized = text.trim();
  if (!normalized.startsWith("/")) {
    return null;
  }

  const body = normalized.slice(1);
  if (/\s/.test(body)) {
    return null;
  }

  return body.toLowerCase();
}

function getVisibleSlashCommands() {
  const query = String(state.detail.slashQuery || "").trim().toLowerCase();
  const items = Array.isArray(state.detail.slashCommands) ? state.detail.slashCommands : [];
  if (!query) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [
      item.slash,
      item.title,
      item.description,
      item.hint || "",
      item.id,
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function clampSlashActiveIndex() {
  const visible = getVisibleSlashCommands();
  if (!visible.length) {
    state.detail.slashActiveIndex = 0;
    return;
  }

  if (state.detail.slashActiveIndex < 0) {
    state.detail.slashActiveIndex = 0;
    return;
  }

  if (state.detail.slashActiveIndex >= visible.length) {
    state.detail.slashActiveIndex = visible.length - 1;
  }
}

function patchComposerSlashMenu() {
  const slot = document.querySelector("#composer-slash-slot");
  if (!(slot instanceof HTMLElement)) {
    return;
  }

  slot.innerHTML = "";
}

function closeSlashMenu() {
  state.detail.slashMenuOpen = false;
  state.detail.slashQuery = "";
  state.detail.slashActiveIndex = 0;
  state.detail.slashCommandsLoading = false;
  patchComposerSlashMenu();
}

async function loadSlashCommands(sessionId, { force = false } = {}) {
  if (!sessionId) {
    return;
  }

  if (state.detail.slashCommandsLoading) {
    return;
  }

  if (!force && Array.isArray(state.detail.slashCommands) && state.detail.slashCommands.length > 0) {
    patchComposerSlashMenu();
    return;
  }

  state.detail.slashCommandsLoading = true;
  patchComposerSlashMenu();

  try {
    const payload = await getSessionSlashCommands(sessionId);
    state.detail.slashCommands = Array.isArray(payload?.items) ? payload.items : [];
  } catch (error) {
    state.detail.slashCommands = [];
    showToast(messageOf(error));
  } finally {
    state.detail.slashCommandsLoading = false;
    patchComposerSlashMenu();
  }
}

async function executeComposerSlashCommand(sessionId, command) {
  if (!sessionId || !command) {
    return;
  }

  if (!command.enabled) {
    showToast(command.hint || t("composer.slashUnavailable"));
    return;
  }

  if (state.detail.slashExecuting) {
    return;
  }

  state.detail.slashExecuting = true;

  try {
    const result = await executeSessionSlashCommand(sessionId, command.id);
    state.detail.draft = "";
    clearComposerDraft(sessionId);
    if (state.detail.session && command.id === "stop") {
      state.detail.session.status = "stopping";
      state.detail.session.liveBusy = true;
    }
    if (result?.data?.quota) {
      setDetailCodexQuota(sessionId, result.data.quota);
    }
    if (result?.data?.status) {
      state.detail.codexStatus = result.data.status;
    }
    closeSlashMenu();
    showToast(result?.message || t("composer.slashExecuted", { slash: command.slash }));

    if (result?.refreshDetail) {
      await renderSessionDetailPage(sessionId);
      return;
    }

    renderSessionDetail();
  } catch (error) {
    showToast(messageOf(error));
  } finally {
    state.detail.slashExecuting = false;
  }
}

function bindComposerSlashMenuControls() {
  document.querySelectorAll("[data-slash-command-id]").forEach((el) => {
    el.onclick = async () => {
      const commandId = el.getAttribute("data-slash-command-id");
      if (!commandId || !state.detail.session?.sessionId) {
        return;
      }

      const command = getVisibleSlashCommands().find((item) => item.id === commandId);
      if (!command) {
        return;
      }

      await executeComposerSlashCommand(state.detail.session.sessionId, command);
    };
  });
}

function hydrateSessionDetailViewState(query) {
  const nextView = loadSessionDetailViewState(query);
  state.detail = {
    ...state.detail,
    ...nextView,
  };
}

function hydrateSessionsViewState(query) {
  const nextView = loadSessionsViewState(query);
  state.sessions = {
    ...state.sessions,
    ...nextView,
  };
}

function loadSessionsViewState(query) {
  const hashState = query ? parseSessionsViewQuery(query) : null;
  if (hashState) {
    return normalizeSessionsViewState(hashState);
  }

  const storedState = readSessionsViewStateFromStorage();
  if (storedState) {
    return normalizeSessionsViewState(storedState);
  }

  return { ...DEFAULT_SESSIONS_VIEW };
}

function loadSessionDetailViewState(query) {
  const detailState = query ? parseSessionDetailViewQuery(query) : null;
  if (detailState) {
    return normalizeSessionDetailViewState(detailState);
  }

  return { ...DEFAULT_DETAIL_VIEW };
}

function parseSessionsViewQuery(query) {
  const params = new URLSearchParams(query);
  if ([...params.keys()].length === 0) {
    return null;
  }

  return {
    keyword: params.get("q") || "",
    status: params.get("status") || "all",
    projectId: params.get("project") || "all",
    thread: params.get("thread") || "all",
    sort: params.get("sort") || DEFAULT_SESSIONS_VIEW.sort,
    page: params.get("page") || DEFAULT_SESSIONS_VIEW.page,
  };
}

function parseSessionDetailViewQuery(query) {
  const params = new URLSearchParams(query);
  if ([...params.keys()].length === 0) {
    return null;
  }

  return {
    filter: params.get("filter") || DEFAULT_DETAIL_VIEW.filter,
    severity: params.get("level") || DEFAULT_DETAIL_VIEW.severity,
    search: params.get("q") || "",
    autoScroll: params.get("follow") || "1",
  };
}

function normalizeSessionsViewState(input) {
  return {
    keyword: String(input.keyword || ""),
    status: isAllowedSessionStatus(input.status) ? input.status : DEFAULT_SESSIONS_VIEW.status,
    projectId: String(input.projectId || DEFAULT_SESSIONS_VIEW.projectId),
    thread: isAllowedThreadFilter(input.thread) ? input.thread : DEFAULT_SESSIONS_VIEW.thread,
    sort: isAllowedSessionSort(input.sort) ? input.sort : DEFAULT_SESSIONS_VIEW.sort,
    page: normalizePage(input.page),
    pageSize: DEFAULT_SESSIONS_VIEW.pageSize,
  };
}

function normalizeSessionDetailViewState(input) {
  return {
    filter: isAllowedDetailFilter(input.filter) ? input.filter : DEFAULT_DETAIL_VIEW.filter,
    severity: isAllowedDetailSeverity(input.severity)
      ? input.severity
      : DEFAULT_DETAIL_VIEW.severity,
    search: String(input.search || ""),
    autoScroll: normalizeAutoScroll(input.autoScroll),
    rawStdoutBuckets:
      input.rawStdoutBuckets && typeof input.rawStdoutBuckets === "object"
        ? input.rawStdoutBuckets
        : {},
  };
}

function normalizePage(value) {
  const page = Number.parseInt(String(value || DEFAULT_SESSIONS_VIEW.page), 10);
  if (Number.isNaN(page) || page < 1) {
    return DEFAULT_SESSIONS_VIEW.page;
  }

  return page;
}

function normalizeAutoScroll(value) {
  if (value === false || value === "0" || value === 0 || value === "false") {
    return false;
  }

  return true;
}

function isAllowedSessionStatus(value) {
  return [
    "all",
    "idle",
    "starting",
    "running",
    "waiting_input",
    "stopping",
    "completed",
    "failed",
  ].includes(String(value || ""));
}

function isAllowedDetailFilter(value) {
  return ["all", "assistant", "command", "system"].includes(String(value || ""));
}

function isAllowedDetailSeverity(value) {
  return ["all", "error", "warning", "stderr"].includes(String(value || ""));
}

function isAllowedThreadFilter(value) {
  return ["all", "ready", "missing"].includes(String(value || ""));
}

function isAllowedSessionSort(value) {
  return getSessionSortOptions().some((option) => option.value === value);
}

function persistSessionsViewState() {
  const viewState = {
    keyword: state.sessions.keyword,
    status: state.sessions.status,
    projectId: state.sessions.projectId,
    thread: state.sessions.thread,
    sort: state.sessions.sort,
    page: state.sessions.page,
    pageSize: state.sessions.pageSize,
  };

  writeSessionsViewStateToStorage(viewState);
  syncSessionsHash(viewState);
}

function persistSessionDetailViewState(sessionId) {
  syncSessionDetailHash(
    sessionId,
    state.detail.filter,
    state.detail.severity,
    state.detail.search,
    state.detail.autoScroll,
  );
}

function writeSessionsViewStateToStorage(viewState) {
  try {
    window.localStorage?.setItem(SESSION_VIEW_STORAGE_KEY, JSON.stringify(viewState));
  } catch (_error) {
    // Ignore storage failures in restricted browsers.
  }
}

function readSessionsViewStateFromStorage() {
  try {
    const raw = window.localStorage?.getItem(SESSION_VIEW_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function getSessionDetailCacheKey(sessionId) {
  return `${SESSION_DETAIL_CACHE_STORAGE_PREFIX}${sessionId}`;
}

function cloneJsonValue(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return fallback;
  }
}

function readSessionDetailCacheIndex() {
  try {
    const raw = window.localStorage?.getItem(SESSION_DETAIL_CACHE_INDEX_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const normalized = {};
    Object.entries(parsed).forEach(([sessionId, savedAt]) => {
      const normalizedSessionId = String(sessionId || "").trim();
      const normalizedSavedAt = Number(savedAt || 0);
      if (normalizedSessionId && Number.isFinite(normalizedSavedAt) && normalizedSavedAt > 0) {
        normalized[normalizedSessionId] = normalizedSavedAt;
      }
    });
    return normalized;
  } catch (_error) {
    return {};
  }
}

function writeSessionDetailCacheIndex(index) {
  try {
    window.localStorage?.setItem(SESSION_DETAIL_CACHE_INDEX_STORAGE_KEY, JSON.stringify(index));
  } catch (_error) {
    // Ignore storage failures in restricted browsers.
  }
}

function pruneSessionDetailCaches(index, preservedSessionId = "") {
  const entries = Object.entries(index)
    .filter(([sessionId]) => sessionId)
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0));
  if (entries.length <= SESSION_DETAIL_CACHE_MAX_SESSIONS) {
    return index;
  }

  const nextIndex = {};
  entries.forEach(([sessionId, savedAt], indexPosition) => {
    if (indexPosition < SESSION_DETAIL_CACHE_MAX_SESSIONS || sessionId === preservedSessionId) {
      nextIndex[sessionId] = savedAt;
      return;
    }

    try {
      window.localStorage?.removeItem(getSessionDetailCacheKey(sessionId));
    } catch (_error) {
      // Ignore storage failures in restricted browsers.
    }
  });
  return nextIndex;
}

function buildSessionDetailCacheSnapshot(session = state.detail.session) {
  const sessionId = String(session?.sessionId || "").trim();
  if (!sessionId) {
    return null;
  }

  const rawEvents = Array.isArray(state.detail.rawEvents)
    ? state.detail.rawEvents.slice(-SESSION_DETAIL_CACHE_MAX_RAW_EVENTS)
    : [];
  return {
    sessionId,
    savedAt: Date.now(),
    session: cloneJsonValue(session, null),
    rawEvents: cloneJsonValue(rawEvents, []),
    cursor: Number(state.detail.cursor || 0),
    beforeCursor: Number(state.detail.beforeCursor || 0),
    historyHasMore: Boolean(state.detail.historyHasMore),
  };
}

function persistSessionDetailCacheSnapshot(snapshot) {
  const sessionId = String(snapshot?.sessionId || "").trim();
  if (!sessionId) {
    return;
  }

  try {
    window.localStorage?.setItem(getSessionDetailCacheKey(sessionId), JSON.stringify(snapshot));
    const nextIndex = readSessionDetailCacheIndex();
    nextIndex[sessionId] = Number(snapshot.savedAt || Date.now());
    writeSessionDetailCacheIndex(pruneSessionDetailCaches(nextIndex, sessionId));
  } catch (_error) {
    // Ignore storage failures in restricted browsers.
  }
}

function readSessionDetailCacheSnapshot(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return null;
  }

  try {
    const raw = window.localStorage?.getItem(getSessionDetailCacheKey(normalizedSessionId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (String(parsed.sessionId || "").trim() !== normalizedSessionId) {
      return null;
    }
    if (!parsed.session || !Array.isArray(parsed.rawEvents)) {
      return null;
    }

    return {
      sessionId: normalizedSessionId,
      savedAt: Number(parsed.savedAt || 0),
      session: cloneJsonValue(parsed.session, null),
      rawEvents: cloneJsonValue(parsed.rawEvents, []),
      cursor: Number(parsed.cursor || 0),
      beforeCursor: Number(parsed.beforeCursor || 0),
      historyHasMore: Boolean(parsed.historyHasMore),
    };
  } catch (_error) {
    return null;
  }
}

function clearSessionDetailCacheSnapshot(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }

  try {
    window.localStorage?.removeItem(getSessionDetailCacheKey(normalizedSessionId));
    const nextIndex = readSessionDetailCacheIndex();
    if (Object.prototype.hasOwnProperty.call(nextIndex, normalizedSessionId)) {
      delete nextIndex[normalizedSessionId];
      writeSessionDetailCacheIndex(nextIndex);
    }
  } catch (_error) {
    // Ignore storage failures in restricted browsers.
  }
}

function schedulePersistActiveSessionDetailCache() {
  const sessionId = String(state.detail.session?.sessionId || "").trim();
  if (!sessionId) {
    return;
  }

  if (state.detail.cachePersistTimerId) {
    window.clearTimeout(state.detail.cachePersistTimerId);
    state.detail.cachePersistTimerId = 0;
  }

  state.detail.cachePersistTimerId = window.setTimeout(() => {
    state.detail.cachePersistTimerId = 0;
    const snapshot = buildSessionDetailCacheSnapshot();
    if (snapshot) {
      persistSessionDetailCacheSnapshot(snapshot);
    }
  }, 180);
}

function resetSessionDetailTransientUiState(options = {}) {
  const {
    preserveCodexUiOptions = true,
    preserveCodexLaunch = true,
    preserveRemoteHosts = true,
    preserveActiveRemoteHost = true,
  } = options;

  state.detail.historyLoading = false;
  state.detail.composerSending = false;
  state.detail.composerSendError = "";
  state.detail.composerStopping = false;
  state.detail.mobileQueueSending = false;
  state.detail.mobileQueueLastError = "";
  state.detail.detailSyncError = "";
  state.detail.unseenCount = 0;
  state.detail.searchMatchIndex = 0;
  state.detail.activeSearchResultKey = "";
  state.detail.commandGroups = {};
  state.detail.taskDetails = {};
  state.detail.rawStdoutBuckets = {};
  if (!preserveCodexUiOptions) {
    state.detail.codexUiOptions = null;
  }
  if (!preserveCodexLaunch) {
    state.detail.codexLaunch = null;
  }
  if (!preserveRemoteHosts) {
    state.detail.remoteHosts = [];
  }
  if (!preserveActiveRemoteHost) {
    state.detail.activeRemoteHost = "";
  }
  state.detail.activeTaskStartedAt = 0;
  state.detail.liveExecutionTaskKey = "";
  state.detail.composerEnvironmentMenuOpen = false;
  state.detail.slashMenuOpen = false;
  state.detail.slashCommands = [];
  state.detail.slashCommandsLoading = false;
  state.detail.slashQuery = "";
  state.detail.slashActiveIndex = 0;
  state.detail.slashExecuting = false;
  state.detail.inspectDrawerOpen = false;
  state.detail.inspectSelectionKey = "";
  state.detail.optimisticSend = null;
}

function hydrateSessionDetailFromCache(sessionId, snapshot) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId || !snapshot?.session) {
    return false;
  }

  state.detail.session = snapshot.session;
  replaceDetailTimelineRawEvents(Array.isArray(snapshot.rawEvents) ? snapshot.rawEvents : []);
  syncDetailPendingApproval(state.detail.session, state.detail.timelineState);
  state.detail.cursor = Number(snapshot.cursor || 0);
  state.detail.beforeCursor = Number(snapshot.beforeCursor || 0);
  state.detail.historyHasMore = Boolean(snapshot.historyHasMore);
  state.detail.draft = readComposerDraft(normalizedSessionId);
  state.detail.codexQuota = readCachedCodexQuota(normalizedSessionId);
  state.detail.codexStatus = null;
  resetSessionDetailTransientUiState();
  state.detail.completionNoticeArmed = isSessionLiveBusy(state.detail.session);
  state.detail.detailSyncing = true;
  state.detail.detailSyncError = "";
  state.detail.session.eventCount = Math.max(
    getSessionActivityCount(state.detail.session),
    Number(state.detail.cursor || 0),
  );
  updateSessionListItem(state.detail.session);
  return true;
}

function syncSessionsHash(viewState) {
  if (!window.location.hash.startsWith("#/sessions")) {
    return;
  }

  const nextHash = buildSessionsHash(viewState);
  if (window.location.hash === nextHash) {
    return;
  }

  if (window.history && typeof window.history.replaceState === "function") {
    window.history.replaceState(null, "", nextHash);
    state.route = nextHash;
    return;
  }

  window.location.hash = nextHash;
}

function syncSessionDetailHash(sessionId, filter, severity, search, autoScroll) {
  if (!window.location.hash.startsWith(`#/sessions/${sessionId}`)) {
    return;
  }

  const nextHash = buildSessionDetailHash(sessionId, filter, severity, search, autoScroll);
  if (window.location.hash === nextHash) {
    return;
  }

  if (window.history && typeof window.history.replaceState === "function") {
    window.history.replaceState(null, "", nextHash);
    state.route = nextHash;
    return;
  }

  window.location.hash = nextHash;
}

function buildSessionsHash(viewState) {
  const params = new URLSearchParams();

  if (viewState.keyword.trim()) {
    params.set("q", viewState.keyword.trim());
  }

  if (viewState.status !== DEFAULT_SESSIONS_VIEW.status) {
    params.set("status", viewState.status);
  }

  if (viewState.projectId !== DEFAULT_SESSIONS_VIEW.projectId) {
    params.set("project", viewState.projectId);
  }

  if (viewState.thread !== DEFAULT_SESSIONS_VIEW.thread) {
    params.set("thread", viewState.thread);
  }

  if (viewState.sort !== DEFAULT_SESSIONS_VIEW.sort) {
    params.set("sort", viewState.sort);
  }

  if (viewState.page > DEFAULT_SESSIONS_VIEW.page) {
    params.set("page", String(viewState.page));
  }

  const query = params.toString();
  return query ? `#/sessions?${query}` : "#/sessions";
}

function buildSessionDetailHash(sessionId, filter, severity, search, autoScroll) {
  const params = new URLSearchParams();

  if (filter !== DEFAULT_DETAIL_VIEW.filter) {
    params.set("filter", filter);
  }

  if (severity !== DEFAULT_DETAIL_VIEW.severity) {
    params.set("level", severity);
  }

  if (String(search || "").trim()) {
    params.set("q", String(search || "").trim());
  }

  if (!autoScroll) {
    params.set("follow", "0");
  }

  const query = params.toString();
  return query ? `#/sessions/${sessionId}?${query}` : `#/sessions/${sessionId}`;
}

function matchesSessionFilters(session, project, filters) {
  if (filters.status !== "all" && session.status !== filters.status) {
    return false;
  }

  if (filters.projectId !== "all" && session.projectId !== filters.projectId) {
    return false;
  }

  if (filters.thread === "ready" && !session.codexThreadId) {
    return false;
  }

  if (filters.thread === "missing" && session.codexThreadId) {
    return false;
  }

  const keyword = filters.keyword.trim().toLowerCase();
  if (!keyword) {
    return true;
  }

  const haystacks = [
    session.title,
    session.projectId,
    project?.name,
    session.status,
    session.lastAssistantContent,
    session.lastCommand,
    session.codexThreadId,
  ];

  return haystacks.some((value) => String(value || "").toLowerCase().includes(keyword));
}

function countActiveSessionFilters(filters) {
  let count = 0;

  if (filters.keyword.trim()) {
    count += 1;
  }

  if (filters.status !== "all") {
    count += 1;
  }

  if (filters.projectId !== "all") {
    count += 1;
  }

  if (filters.thread !== "all") {
    count += 1;
  }

  return count;
}

function sortSessions(sessions, sort) {
  const items = [...sessions];

  items.sort((left, right) => {
    if (sort === "created_desc") {
      return compareTimes(right.createdAt, left.createdAt) || compareTitles(left, right);
    }

    if (sort === "events_desc") {
      return (
        Number(right.eventCount || 0) - Number(left.eventCount || 0) ||
        compareTimes(right.lastEventAt || right.updatedAt, left.lastEventAt || left.updatedAt) ||
        compareTitles(left, right)
      );
    }

    if (sort === "reply_desc") {
      return (
        Number(Boolean(right.lastAssistantContent)) - Number(Boolean(left.lastAssistantContent)) ||
        compareTimes(right.lastEventAt || right.updatedAt, left.lastEventAt || left.updatedAt) ||
        compareTitles(left, right)
      );
    }

    return (
      compareTimes(right.lastEventAt || right.updatedAt || right.createdAt, left.lastEventAt || left.updatedAt || left.createdAt) ||
      compareTitles(left, right)
    );
  });

  return items;
}

function getPageCount(totalItems, pageSize) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function clampPage(page, totalPages) {
  return Math.min(Math.max(page, 1), totalPages);
}

function getVisiblePageNumbers(currentPage, totalPages) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function compareTimes(left, right) {
  return toTimestamp(left) - toTimestamp(right);
}

function toTimestamp(value) {
  if (!value) {
    return 0;
  }

  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function compareTitles(left, right) {
  return String(left.title || "").localeCompare(String(right.title || ""), getIntlLocale());
}

function matchesEventFilter(event, filter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "assistant") {
    return event.type === "cli.chunk" && event.stream === "assistant";
  }

  if (filter === "command") {
    if (event.type === "cli.chunk" && event.stream === "command") {
      return true;
    }

    if (
      event.type === "system.notice" &&
      event.content &&
      (event.content.startsWith("Running command:") ||
        event.content.startsWith("Command completed"))
    ) {
      return true;
    }

    return false;
  }

  if (filter === "system") {
    return (
      event.type === "session.status" ||
      event.type === "cli.exit" ||
      event.type === "system.notice"
    );
  }

  return true;
}

function matchesEventSeverity(event, severity) {
  if (severity === "all") {
    return true;
  }

  if (severity === "error") {
    return (
      (event.type === "system.notice" && event.level === "error") ||
      (event.type === "cli.chunk" && event.stream === "stderr")
    );
  }

  if (severity === "warning") {
    return event.type === "system.notice" && event.level === "warning";
  }

  if (severity === "stderr") {
    return event.type === "cli.chunk" && event.stream === "stderr";
  }

  return true;
}

function matchesEventSearch(event, search) {
  const keyword = normalizeSearchKeyword(search);
  if (!keyword) {
    return true;
  }

  const haystacks = getEventSearchTexts(event);
  return haystacks.some((value) => String(value || "").toLowerCase().includes(keyword));
}

function getEventSearchTexts(event) {
  if (event.type === "message.user") {
    return ["user", "message.user", event.content];
  }

  if (event.type === "cli.chunk") {
    return ["cli", "cli.chunk", event.stream, cliEventLabel(event.stream), event.content];
  }

  if (event.type === "cli.exit") {
    return ["exit", "cli.exit", `exitCode:${String(event.exitCode)}`];
  }

  if (event.type === "session.status") {
    return ["status", "session.status", event.status, sessionStatusLabel(event.status)];
  }

  if (event.type === "codex.quota") {
    return [];
  }

  return ["system", "system.notice", event.level, event.content];
}

function normalizeSearchKeyword(search) {
  return String(search || "").trim().toLowerCase();
}

function loadingCard(message) {
  return `
    <article class="panel">
      <div class="loading-state">${escapeHtml(message)}</div>
    </article>
  `;
}

function encodeCopyPayload(value) {
  return encodeURIComponent(String(value || ""));
}

function decodeCopyPayload(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch (_error) {
    return String(value || "");
  }
}

function errorCard(message) {
  return `
    <article class="panel">
      <div class="error-state">${escapeHtml(message)}</div>
    </article>
  `;
}

function renderPendingApprovalBar(detailState) {
  const approval = detailState.pendingApproval;
  if (!approval) {
    return "";
  }

  const runtime = detailState.codexStatus?.runtime || null;
  const targetHint = approval.reason || approval.cwd || "";
  const commandPreview = approval.command
    ? `<code class="approval-banner-command">${escapeHtml(approval.command)}</code>`
    : "";
  const workspaceNote = approval.cwd
    ? `<span class="approval-banner-chip">${escapeHtml(approval.cwd)}</span>`
    : "";
  const canResolve = approval.resumable !== false;
  const approvalExplain = describeApprovalContext(approval, runtime);
  const restoreHint = !canResolve
    ? `<p class="approval-banner-meta approval-banner-meta--warning">${escapeHtml(t("approval.restoreHint"))}</p>`
    : "";
  const actionHtml = canResolve
    ? `
        <button type="button" class="secondary-button" data-approval-decision="decline">${escapeHtml(t("approval.deny"))}</button>
        <button type="button" class="secondary-button" data-approval-decision="accept">${escapeHtml(t("approval.allowOnce"))}</button>
        <button type="button" class="primary-button" data-approval-decision="acceptForSession">${escapeHtml(t("approval.allowForTurn"))}</button>
      `
    : `
        <button type="button" class="primary-button" data-approval-retry="true">${escapeHtml(t("approval.retryAction"))}</button>
      `;

  return `
    <section class="approval-banner" data-approval-id="${escapeHtml(approval.requestId)}" data-approval-resumable="${canResolve ? "true" : "false"}">
      <div class="approval-banner-copy">
        <div class="approval-banner-head">
          <p class="approval-banner-title">${escapeHtml(localizeApprovalTitle(approval.title))}</p>
          <span class="approval-banner-badge">${escapeHtml(canResolve ? t("approval.pending") : t("approval.restore"))}</span>
        </div>
        <p class="approval-banner-meta">${escapeHtml(t("approval.continueHint"))}</p>
        ${targetHint ? `<p class="approval-banner-meta approval-banner-meta--strong">${escapeHtml(targetHint)}</p>` : ""}
        ${
          approvalExplain
            ? `<p class="approval-banner-meta approval-banner-meta--strong">${escapeHtml(approvalExplain)}</p>`
            : ""
        }
        ${commandPreview}
        <div class="approval-banner-foot">
          ${workspaceNote}
          ${
            runtime?.sandboxMode
              ? `<span class="approval-banner-chip">Sandbox: ${escapeHtml(formatRuntimeValue(runtime.sandboxMode))}</span>`
              : ""
          }
          ${
            runtime?.approvalMode
              ? `<span class="approval-banner-chip">Approval: ${escapeHtml(formatRuntimeValue(runtime.approvalMode))}</span>`
              : ""
          }
        </div>
        ${restoreHint}
      </div>
      <div class="approval-banner-actions">
        ${actionHtml}
      </div>
    </section>
  `;
}

function bindPendingApprovalControls(sessionId) {
  const banner = document.querySelector("#session-approval-slot .approval-banner");
  if (!banner) {
    return;
  }

  const retryButton = banner.querySelector("[data-approval-retry]");
  if (retryButton instanceof HTMLButtonElement) {
    retryButton.onclick = async () => {
      const approval = state.detail.pendingApproval;
      const requestId = banner.getAttribute("data-approval-id");
      if (!approval || !requestId) {
        return;
      }

      const previousPendingApproval = { ...approval };
      const previousStatus = state.detail.session?.status || "waiting_input";
      const previousLiveBusy = Boolean(state.detail.session?.liveBusy);
      retryButton.disabled = true;
      banner.setAttribute("aria-busy", "true");
      state.detail.pendingApproval = null;
      if (state.detail.session?.sessionId === sessionId) {
        state.detail.session.status = "running";
        state.detail.session.liveBusy = true;
      }
      scheduleSessionDetailRender({ immediate: true });

      try {
        const codex = buildCodexLaunchPayload(
          state.detail.codexLaunch,
          state.detail.codexUiOptions,
        );
        const payload = codex ? { codex } : {};
        await retrySessionApproval(sessionId, requestId, payload);
        await resumeActiveSessionDetail("approval-retry");
      } catch (error) {
        if (isTerminalApprovalError(error)) {
          dismissApproval(sessionId, requestId);
          state.detail.pendingApproval = null;
          const refreshedSession = await getSession(sessionId).catch(() => null);
          if (refreshedSession && state.detail.session?.sessionId === sessionId) {
            state.detail.session = refreshedSession;
            updateSessionListItem(refreshedSession);
          } else if (state.detail.session?.sessionId === sessionId) {
            state.detail.session.status = previousStatus;
            state.detail.session.liveBusy = previousLiveBusy;
          }
          syncDetailPendingApproval(state.detail.session, state.detail.timelineState);
        } else {
          state.detail.pendingApproval = previousPendingApproval;
          if (state.detail.session?.sessionId === sessionId) {
            state.detail.session.status = previousStatus;
            state.detail.session.liveBusy = previousLiveBusy;
          }
        }
        scheduleSessionDetailRender({ immediate: true });
        showToast(messageOf(error));
      }
    };
  }

  if (banner.getAttribute("data-approval-resumable") === "false") {
    return;
  }

  banner.querySelectorAll("[data-approval-decision]").forEach((button) => {
    button.onclick = async () => {
      const decision = button.getAttribute("data-approval-decision");
      const requestId = banner.getAttribute("data-approval-id");
      if (!decision || !requestId) {
        return;
      }
      if (isApprovalSuppressed(sessionId, requestId, state.detail.pendingApproval?.callId)) {
        return;
      }

      const previousPendingApproval = state.detail.pendingApproval
        ? { ...state.detail.pendingApproval }
        : null;
      state.detail.resolvingApprovalRequestId = requestId;
      state.detail.resolvingApprovalSessionId = sessionId;
      state.detail.resolvingApprovalCallId = String(previousPendingApproval?.callId || "").trim();
      state.detail.pendingApproval = null;
      banner.setAttribute("aria-busy", "true");
      banner.setAttribute("data-pending-decision", decision);
      banner
        .querySelectorAll("[data-approval-decision]")
        .forEach((actionButton) => actionButton.setAttribute("disabled", "disabled"));
      scheduleSessionDetailRender({ immediate: true });
      try {
        await resolveSessionApproval(sessionId, requestId, decision);
        await catchUpSessionEvents(sessionId, state.detail.cursor || 0).catch(() => null);
        const refreshedSession = await getSession(sessionId).catch(() => null);
        if (refreshedSession && state.detail.session?.sessionId === sessionId) {
          state.detail.session = refreshedSession;
          updateSessionListItem(refreshedSession);
        }
        syncDetailPendingApproval(state.detail.session, state.detail.timelineState);
        scheduleSessionDetailRender({ immediate: true });
      } catch (error) {
        if (isApprovalSuppressed(sessionId, requestId, previousPendingApproval?.callId)) {
          clearResolvingApprovalState();
        }
        if (isTerminalApprovalError(error)) {
          dismissApproval(sessionId, requestId);
          state.detail.pendingApproval = null;
          const refreshedSession = await getSession(sessionId).catch(() => null);
          if (refreshedSession && state.detail.session?.sessionId === sessionId) {
            state.detail.session = refreshedSession;
            updateSessionListItem(refreshedSession);
          }
          syncDetailPendingApproval(state.detail.session, state.detail.timelineState);
        } else {
          state.detail.pendingApproval = previousPendingApproval;
        }
        showToast(messageOf(error));
        scheduleSessionDetailRender({ immediate: true });
      }
    };
  });
}

function describeApprovalContext(approval, runtime) {
  const command = typeof approval?.command === "string" ? approval.command : "";
  const targetPath = extractApprovalPath(command);
  const writableRoots = Array.isArray(runtime?.writableRoots) ? runtime.writableRoots : [];
  const workspaceRoot = typeof runtime?.workspaceRoot === "string" ? runtime.workspaceRoot : "";

  if (!targetPath) {
    return "";
  }

  if (writableRoots.some((root) => isPathInsideRoot(targetPath, root))) {
    return t("approval.pathInWritable", { targetPath });
  }

  if (workspaceRoot) {
    return t("approval.pathOutsideWorkspace", { targetPath, workspaceRoot });
  }

  return t("approval.pathOutsideWritable", { targetPath });
}

function extractApprovalPath(command) {
  const text = String(command || "");
  const match = text.match(/\/Users\/[^\s'"]+/);
  return match ? match[0] : "";
}

function isPathInsideRoot(targetPath, rootPath) {
  const target = String(targetPath || "").trim();
  const root = String(rootPath || "").trim();
  if (!target || !root) {
    return false;
  }

  return target === root || target.startsWith(`${root}/`);
}

function showToast(message) {
  const text = String(message || "").trim();
  if (!text) {
    return;
  }

  const now = Date.now();
  if (text === lastToastMessage && now - lastToastAt < 1500) {
    return;
  }

  lastToastMessage = text;
  lastToastAt = now;
  const existing = document.querySelector(".app-toast");
  if (existing instanceof HTMLElement) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.className = "app-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = text;
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("app-toast-visible");
  }, 16);

  window.setTimeout(() => {
    toast.classList.remove("app-toast-visible");
    window.setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 180);
  }, 2300);
}

function isSessionBusy(status) {
  return ["starting", "running", "stopping"].includes(status);
}

function isSessionLiveBusy(session) {
  if (!session) {
    return false;
  }

  if (session.sourceKind === "imported_rollout") {
    return Boolean(session.liveBusy);
  }

  return isSessionBusy(session.status);
}

function getSessionDisplayStatus(session) {
  if (!session) {
    return "idle";
  }

  if (session.sourceKind === "imported_rollout" && !isSessionLiveBusy(session)) {
    return "waiting_input";
  }

  return session.status;
}

function getRunningTimelineTurn() {
  const timelineState = state.detail.timelineState;
  if (!timelineState) {
    return null;
  }

  const activeTurnId = timelineState.activeTurnId;
  if (activeTurnId && timelineState.turnsById[activeTurnId]?.status === "running") {
    return timelineState.turnsById[activeTurnId];
  }

  for (let index = timelineState.turnOrder.length - 1; index >= 0; index -= 1) {
    const turn = timelineState.turnsById[timelineState.turnOrder[index]];
    if (turn?.status === "running") {
      return turn;
    }
  }

  return null;
}

function getLatestTimelineTurn() {
  const timelineState = state.detail.timelineState;
  if (!timelineState?.turnOrder?.length) {
    return null;
  }
  const latestTurnId = timelineState.turnOrder[timelineState.turnOrder.length - 1];
  return timelineState.turnsById[latestTurnId] || null;
}

function syncSessionRuntimeFromTimeline() {
  const session = state.detail.session;
  if (!session || !state.detail.timelineState) {
    return;
  }

  const runningTurn = getRunningTimelineTurn();
  if (runningTurn) {
    session.status = "running";
    session.liveBusy = true;
    session.sourceRolloutHasOpenTurn = true;
    return;
  }

  const latestTurn = getLatestTimelineTurn();
  session.sourceRolloutHasOpenTurn = false;
  if (latestTurn?.status === "failed" || latestTurn?.status === "aborted") {
    session.status = "failed";
    session.liveBusy = false;
    return;
  }

  if (session.liveBusy && latestTurn?.status === "completed") {
    session.status = "waiting_input";
    session.liveBusy = false;
  }
}

function getActiveTimelineTurn(session) {
  if (!session || !state.detail.timelineState) {
    return null;
  }

  const runningTurn = getRunningTimelineTurn();
  if (runningTurn) {
    return runningTurn;
  }

  const timelineState = state.detail.timelineState;
  for (let index = timelineState.turnOrder.length - 1; index >= 0; index -= 1) {
    const turnId = timelineState.turnOrder[index];
    const turn = timelineState.turnsById[turnId];
    if (turn?.status === "running" || turn?.status === "idle") {
      return turn;
    }
  }

  const lastTurnId = timelineState.turnOrder[timelineState.turnOrder.length - 1];
  if (lastTurnId && timelineState.turnsById[lastTurnId]) {
    return timelineState.turnsById[lastTurnId];
  }

  return null;
}

function getOptimisticActiveTurn(session) {
  const optimistic = state.detail.optimisticSend;
  if (!session || !isSessionLiveBusy(session) || !optimistic) {
    return null;
  }

  return {
    id: optimistic.turnId || optimistic.tempTurnId,
    startedAt: optimistic.createdAt,
  };
}

function getTurnStartedAtUnixSeconds(turn) {
  const startedAt = Date.parse(String(turn?.startedAt || ""));
  if (!Number.isFinite(startedAt)) {
    return 0;
  }

  return Math.floor(startedAt / 1000);
}

function getSessionActivityBadges(session, activeTurn) {
  if (!session) {
    return [];
  }
  if (session.sourceKind === "imported_rollout" && session.sourceRolloutHasOpenTurn) {
    return [{ label: t("session.externalRunning"), tone: "warm" }];
  }
  return [];
}

function getTimelineItemById(itemId) {
  if (!itemId || !state.detail.timelineState?.timelineItems) {
    return null;
  }
  const index = state.detail.timelineState.itemIndexById?.get?.(itemId);
  if (typeof index === "number") {
    return state.detail.timelineState.timelineItems[index] || null;
  }
  return state.detail.timelineState.timelineItems.find((item) => item?.id === itemId) || null;
}

function getActiveTurnItems(activeTurn, key) {
  const ids = Array.isArray(activeTurn?.[key]) ? activeTurn[key] : [];
  return ids.map((id) => getTimelineItemById(id)).filter(Boolean);
}

function compactCommandLabel(command) {
  const normalized = String(command || "").replace(/\s+/g, " ").trim();
  return shortenText(normalized, 72);
}

function deriveThreadRunSummary(session, activeTurn) {
  const optimistic = state.detail.optimisticSend;
  if (optimistic && !optimistic.confirmed) {
    return {
      code: "sending",
      tone: "warm",
      busy: true,
      label: t("threadStatus.sending"),
      detail: t("threadStatus.sendingDetail"),
    };
  }

  if (state.detail.pendingApproval) {
    return {
      code: "waiting_approval",
      tone: "warm",
      busy: true,
      label: t("threadStatus.waitingApproval"),
      detail:
        state.detail.pendingApproval.reason ||
        compactCommandLabel(state.detail.pendingApproval.command) ||
        t("threadStatus.waitingApprovalDetail"),
    };
  }

  const commands = getActiveTurnItems(activeTurn, "commandIds");
  const runningCommand = [...commands].reverse().find(
    (item) =>
      item.status === "running" ||
      item.status === "awaiting_approval" ||
      item.outputStatus === "streaming",
  );
  if (runningCommand) {
    return {
      code: runningCommand.status === "awaiting_approval" ? "waiting_approval" : "running_command",
      tone: "warm",
      busy: true,
      label:
        runningCommand.status === "awaiting_approval"
          ? t("threadStatus.waitingApproval")
          : t("threadStatus.runningCommand"),
      detail: compactCommandLabel(runningCommand.command) || t("timeline.command"),
    };
  }

  const patches = getActiveTurnItems(activeTurn, "patchIds");
  const runningPatch = [...patches].reverse().find(
    (item) => item.status === "running" || item.outputStatus === "streaming",
  );
  if (runningPatch) {
    return {
      code: "editing_files",
      tone: "warm",
      busy: true,
      label: t("threadStatus.editingFiles"),
      detail: t("threadStatus.editingFilesDetail"),
    };
  }

  const reasoning = getTimelineItemById(activeTurn?.reasoningId);
  if (reasoning?.status === "thinking") {
    return {
      code: "thinking",
      tone: "warm",
      busy: true,
      label: t("threadStatus.thinking"),
      detail: reasoning.summary || t("threadStatus.thinkingDetail"),
    };
  }

  if (optimistic?.confirmed && isSessionLiveBusy(session)) {
    return {
      code: "delivered",
      tone: "warm",
      busy: true,
      label: t("threadStatus.delivered"),
      detail: t("threadStatus.deliveredDetail"),
    };
  }

  if (activeTurn?.status === "failed" || getSessionDisplayStatus(session) === "failed") {
    return {
      code: "failed",
      tone: "danger",
      busy: false,
      label: t("threadStatus.failed"),
      detail: t("threadStatus.failedDetail"),
    };
  }

  if (isSessionLiveBusy(session)) {
    return {
      code: "processing",
      tone: "warm",
      busy: true,
      label: t("threadStatus.processing"),
      detail: t("threadStatus.waitingUpdate"),
    };
  }

  if (activeTurn?.status === "completed") {
    const completedAtMs = Date.parse(String(activeTurn.completedAt || activeTurn.startedAt || ""));
    if (Number.isFinite(completedAtMs) && Date.now() - completedAtMs > 10 * 1000) {
      return {
        code: "idle",
        tone: "neutral",
        busy: false,
        label: t("threadStatus.idle"),
        detail: t("threadStatus.idleDetail"),
      };
    }
    return {
      code: "completed",
      tone: "success",
      busy: false,
      label: t("threadStatus.completed"),
      detail: t("threadStatus.completedDetail"),
    };
  }

  return {
    code: "idle",
    tone: "neutral",
    busy: false,
    label: t("threadStatus.idle"),
    detail: t("threadStatus.idleDetail"),
  };
}

function getRunSummaryBadges(summary) {
  if (!summary || summary.code === "idle" || summary.code === "completed") {
    return [];
  }
  return [{ label: summary.label, tone: summary.tone || "neutral" }];
}

function renderComposerRunStatus(summary) {
  if (!summary || (summary.code === "idle" && !state.detail.optimisticSend)) {
    return "";
  }

  const detail = String(summary.detail || "").trim();
  return `
    <div class="thread-run-status thread-run-status-${escapeHtml(summary.tone || "neutral")}" aria-live="polite">
      <span class="thread-run-status-dot"></span>
      <span class="thread-run-status-main">${escapeHtml(summary.label || "")}</span>
      ${detail ? `<span class="thread-run-status-detail">${escapeHtml(detail)}</span>` : ""}
    </div>
  `;
}

function normalizePlanStatus(status) {
  const value = String(status || "").trim();
  if (value === "completed" || value === "in_progress" || value === "pending") {
    return value;
  }
  return "pending";
}

function getVisibleThreadTaskPlan() {
  const plan = state.detail.timelineState?.latestPlan || null;
  const activeTurnId = String(state.detail.timelineState?.activeTurnId || "");
  const planTurnId = String(plan?.turnId || "");
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  if (!activeTurnId || !planTurnId || planTurnId !== activeTurnId || tasks.length === 0) {
    return null;
  }
  return plan;
}

function planStatusLabel(status) {
  const normalized = normalizePlanStatus(status);
  if (normalized === "completed") {
    return t("taskPlan.status.completed");
  }
  if (normalized === "in_progress") {
    return t("taskPlan.status.inProgress");
  }
  return t("taskPlan.status.pending");
}

function renderThreadTaskPlanPanel(plan) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  if (tasks.length === 0) {
    return "";
  }

  const activeTask =
    tasks.find((item) => normalizePlanStatus(item.status) === "in_progress") ||
    tasks.find((item) => normalizePlanStatus(item.status) === "pending") ||
    null;
  const completedCount = tasks.filter(
    (item) => normalizePlanStatus(item.status) === "completed",
  ).length;
  const summary = activeTask
    ? t("taskPlan.current", { task: activeTask.step })
    : t("taskPlan.allDone");
  const openAttribute = state.workspace.taskPlanCollapsed ? "" : " open";

  return `
    <details class="thread-task-plan" data-thread-task-plan="1"${openAttribute}>
      <summary class="thread-task-plan-summary">
        <span class="thread-task-plan-title">${escapeHtml(t("taskPlan.title"))}</span>
        <span class="thread-task-plan-current">${escapeHtml(summary)}</span>
        <span class="thread-task-plan-count">${escapeHtml(t("taskPlan.progress", { completed: completedCount, total: tasks.length }))}</span>
      </summary>
      ${plan.explanation ? `<div class="thread-task-plan-explanation">${escapeHtml(plan.explanation)}</div>` : ""}
      <ol class="thread-task-plan-list">
        ${tasks
          .map((item) => {
            const status = normalizePlanStatus(item.status);
            return `
              <li class="thread-task-plan-item thread-task-plan-item-${escapeHtml(status)}">
                <span class="thread-task-plan-marker"></span>
                <span class="thread-task-plan-step">${escapeHtml(item.step)}</span>
                <span class="thread-task-plan-status">${escapeHtml(planStatusLabel(status))}</span>
              </li>
            `;
          })
          .join("")}
      </ol>
    </details>
  `;
}

function statusClass(status) {
  if (status === "running" || status === "waiting_input") {
    return "pill-warm";
  }

  if (status === "failed") {
    return "pill-danger";
  }

  if (status === "completed") {
    return "pill-success";
  }

  return "pill-neutral";
}

function sessionStatusLabel(status) {
  if (status === "idle") {
    return t("session.status.idle");
  }

  if (status === "starting") {
    return t("session.status.starting");
  }

  if (status === "running") {
    return t("session.status.running");
  }

  if (status === "waiting_input") {
    return t("session.status.waiting_input");
  }

  if (status === "stopping") {
    return t("session.status.stopping");
  }

  if (status === "completed") {
    return t("session.status.completed");
  }

  if (status === "failed") {
    return t("session.status.failed");
  }

  return status || t("session.status.unknown");
}

function cliEventLabel(stream) {
  if (stream === "assistant") {
    return "assistant";
  }

  if (stream === "command") {
    return "command";
  }

  return stream || "stdout";
}

function formatTs(ts) {
  if (!ts) {
    return "unknown";
  }

  return new Date(ts * 1000).toLocaleString(getIntlLocale());
}

function shortenText(value, limit) {
  if (!value) {
    return "";
  }

  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function disconnectConversationLayoutObserver() {
  state.detail.layoutScrollObserver?.disconnect();
  state.detail.layoutScrollObserver = null;
}

function scrollEventsToBottom() {
  if (!state.detail.autoScroll) {
    return;
  }

  const list = document.querySelector("#event-list");
  if (!list) {
    return;
  }

  list.scrollTop = list.scrollHeight;
  const last = list.lastElementChild;
  if (last) {
    last.scrollIntoView({ block: "end", inline: "nearest", behavior: "auto" });
  }
}

function getEventListBottomGap() {
  const list = document.querySelector("#event-list");
  if (!list) {
    return 0;
  }

  return Math.max(0, list.scrollHeight - list.scrollTop - list.clientHeight);
}

function shouldShowJumpToBottomButton() {
  if (state.detail.autoScroll) {
    return false;
  }

  const list = document.querySelector("#event-list");
  if (!list) {
    return state.detail.unseenCount > 0;
  }

  return state.detail.unseenCount > 0 || getEventListBottomGap() > list.clientHeight;
}

function resumeAutoScrollToBottom() {
  state.detail.autoScroll = true;
  state.detail.unseenCount = 0;
  scrollEventsToBottom();
  renderSessionDetail();
  window.requestAnimationFrame(() => {
    scrollEventsToBottom();
    scheduleInitialScrollToBottom();
  });
}

function scheduleAggressiveScrollToBottom() {
  if (!state.detail.autoScroll) {
    return;
  }

  const delaysMs = [0, 16, 32, 48, 100, 200, 400, 700, 1200];
  delaysMs.forEach((ms) => {
    window.setTimeout(() => scrollEventsToBottom(), ms);
  });
}

function scheduleInitialScrollToBottom() {
  if (!state.detail.autoScroll) {
    return;
  }

  scrollEventsToBottom();
  window.requestAnimationFrame(() => scrollEventsToBottom());
}

function captureAutoScrollBottomOffset() {
  if (!state.detail.autoScroll) {
    return null;
  }

  const list = document.querySelector("#event-list");
  if (!list) {
    return null;
  }

  return Math.max(0, list.scrollHeight - list.scrollTop - list.clientHeight);
}

function restoreAutoScrollBottomOffset(offset) {
  if (offset == null || !state.detail.autoScroll) {
    return;
  }

  const list = document.querySelector("#event-list");
  if (!list) {
    return;
  }

  list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight - offset);
}

function scheduleAutoScrollAnchorRestore() {
  if (!state.detail.autoScroll) {
    return;
  }

  window.requestAnimationFrame(() => {
    restoreAutoScrollBottomOffset(0);
  });
}

function attachConversationLayoutScrollObserver() {
  if (!state.detail.autoScroll || typeof ResizeObserver === "undefined") {
    return;
  }

  const panel = document.querySelector(".conversation-panel");
  if (!panel) {
    return;
  }

  let timeoutId = 0;
  const ro = new ResizeObserver(() => {
    if (!state.detail.autoScroll) {
      return;
    }

    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => restoreAutoScrollBottomOffset(0), 16);
  });

  ro.observe(panel);
  state.detail.layoutScrollObserver = ro;
}

function stepSearchMatch(direction) {
  const hits = getSearchMatchElements();
  if (hits.length === 0) {
    return;
  }

  const total = hits.length;
  state.detail.searchMatchIndex =
    (state.detail.searchMatchIndex + direction + total) % total;
  syncSearchMatchNavigation({ scrollIntoView: true });
}

function syncSearchMatchNavigation(options = {}) {
  const hits = getSearchMatchElements();
  const status = document.querySelector("#search-hit-status");
  const prevButton = document.querySelector("#search-hit-prev");
  const nextButton = document.querySelector("#search-hit-next");
  const total = hits.length;

  hits.forEach((hit) => hit.classList.remove("command-search-hit-active"));

  if (!state.detail.search.trim() || total === 0) {
    state.detail.searchMatchIndex = 0;
    if (status) {
      status.textContent = "0 / 0";
    }
    prevButton?.setAttribute("disabled", "disabled");
    nextButton?.setAttribute("disabled", "disabled");
    return;
  }

  state.detail.searchMatchIndex = Math.max(0, Math.min(state.detail.searchMatchIndex, total - 1));
  const activeHit = hits[state.detail.searchMatchIndex];
  activeHit?.classList.add("command-search-hit-active");

  if (status) {
    status.textContent = `${state.detail.searchMatchIndex + 1} / ${total}`;
  }

  prevButton?.removeAttribute("disabled");
  nextButton?.removeAttribute("disabled");

  if (options.scrollIntoView && activeHit) {
    activeHit.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }
}

function getSearchMatchElements() {
  return Array.from(document.querySelectorAll("#event-list .command-search-hit"));
}

function captureEventListScrollTop() {
  if (state.detail.autoScroll) {
    return null;
  }

  const list = document.querySelector("#event-list");
  return list ? list.scrollTop : null;
}

function restoreEventListScrollTop(scrollTop) {
  if (scrollTop == null || state.detail.autoScroll) {
    return;
  }

  const list = document.querySelector("#event-list");
  if (list) {
    list.scrollTop = scrollTop;
  }
}

function bindEventListAutoPause(sessionId) {
  const list = document.querySelector("#event-list");
  if (!list) {
    return;
  }

  list.addEventListener("scroll", () => {
    if (isEventListNearTop(list)) {
      void maybeLoadOlderSessionEvents(sessionId, list);
    }

    const nearBottom = isEventListNearBottom(list);

    if (state.detail.autoScroll && nearBottom) {
      return;
    }

    if (state.detail.autoScroll) {
      state.detail.autoScroll = false;
      state.detail.unseenCount = 0;
      persistSessionDetailViewState(sessionId);
      renderSessionDetail();
      return;
    }

    if (!nearBottom) {
      return;
    }

    state.detail.autoScroll = true;
    state.detail.unseenCount = 0;
    persistSessionDetailViewState(sessionId);
    renderSessionDetail();
  });
}

function isEventListNearBottom(list) {
  return list.scrollHeight - list.scrollTop - list.clientHeight <= 24;
}

function isEventListNearTop(list) {
  return list.scrollTop <= 48;
}

async function maybeLoadOlderSessionEvents(sessionId, list) {
  if (
    state.detail.historyLoading ||
    !state.detail.historyHasMore ||
    !state.detail.beforeCursor ||
    state.detail.beforeCursor <= 1
  ) {
    return;
  }

  state.detail.historyLoading = true;
  const previousScrollTop = list.scrollTop;
  const previousScrollHeight = list.scrollHeight;

  try {
    const payload = await getSessionTimelineEvents(sessionId, {
      before: state.detail.beforeCursor,
      limit: 200,
    });

    if (payload.items.length === 0) {
      state.detail.historyHasMore = false;
      state.detail.historyLoading = false;
      return;
    }

    mergeDetailTimelineRawEvents(payload.items);
    state.detail.beforeCursor = payload.beforeCursor || state.detail.beforeCursor;
    state.detail.historyHasMore = Boolean(payload.hasMoreBefore);
    state.detail.historyLoading = false;
    renderSessionDetail();

    window.requestAnimationFrame(() => {
      const nextList = document.querySelector("#event-list");
      if (!nextList) {
        return;
      }

      const scrollDelta = nextList.scrollHeight - previousScrollHeight;
      nextList.scrollTop = previousScrollTop + scrollDelta;
    });
  } catch (error) {
    state.detail.historyLoading = false;
    showToast(messageOf(error));
  }
}

function closeMessageContextMenu(options = {}) {
  if (!state.detail.messageContextMenu) {
    return;
  }
  state.detail.messageContextMenu = null;
  if (options.render !== false) {
    scheduleSessionDetailRender({ immediate: true });
  }
}

function openMessageContextMenu(copyText, clientX, clientY, anchorKey = "") {
  const text = decodeCopyPayload(copyText);
  if (!text) {
    return;
  }

  const viewportWidth = window.innerWidth || 360;
  const viewportHeight = window.innerHeight || 640;
  const menuWidth = 164;
  const menuHeight = 58;
  const margin = 12;
  const nextX = Math.min(
    Math.max(margin, Math.round(Number(clientX || viewportWidth / 2))),
    viewportWidth - menuWidth - margin,
  );
  const nextY = Math.min(
    Math.max(margin, Math.round(Number(clientY || viewportHeight / 2))),
    viewportHeight - menuHeight - margin,
  );

  state.detail.messageContextMenu = {
    text,
    x: nextX,
    y: nextY,
    anchorKey: String(anchorKey || "").trim(),
  };
  scheduleSessionDetailRender({ immediate: true });
}

function renderMessageContextMenu() {
  const menu = state.detail.messageContextMenu;
  if (!menu?.text) {
    return "";
  }

  return `
    <div class="message-context-menu-overlay" data-message-copy-action="close" aria-hidden="true"></div>
    <div
      class="message-context-menu"
      role="menu"
      aria-label="${escapeHtml(t("generic.copy"))}"
      style="left:${Math.round(Number(menu.x || 0))}px;top:${Math.round(Number(menu.y || 0))}px;"
    >
      <button
        type="button"
        class="message-context-menu-button"
        data-message-copy-action="copy"
      >${escapeHtml(t("generic.copy"))}</button>
    </div>
  `;
}

function getMessageCopyTargetElement(target) {
  if (target instanceof HTMLElement) {
    return target;
  }
  if (target instanceof Text) {
    return target.parentElement;
  }
  return null;
}

function shouldIgnoreMessageCopyTarget(target) {
  const targetEl = getMessageCopyTargetElement(target);
  if (!(targetEl instanceof HTMLElement)) {
    return true;
  }
  return Boolean(
    targetEl.closest(
      "button, a, input, textarea, select, summary, details, audio, [data-copy-text], [data-completion-action]",
    ),
  );
}

function isTouchLikeMessageCopySurface() {
  const touchViewport = isMobileWorkspaceViewport();
  const coarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches);
  return touchViewport || coarsePointer;
}

function shouldUseTapMessageCopyMenu(event) {
  if (!isTouchLikeMessageCopySurface()) {
    return false;
  }
  if (!(event instanceof Event)) {
    return false;
  }
  if (typeof PointerEvent !== "undefined" && event instanceof PointerEvent) {
    return event.pointerType === "touch" || event.pointerType === "pen";
  }
  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    return true;
  }
  return event.type === "click";
}

function shouldBypassContextMenuForTouch(event) {
  if (!isTouchLikeMessageCopySurface()) {
    return false;
  }
  if (typeof PointerEvent !== "undefined" && event instanceof PointerEvent) {
    return event.pointerType === "touch" || event.pointerType === "pen";
  }
  return true;
}

function getMessageCopyInteractionPoint(event) {
  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    const touch = event.changedTouches?.[0] || event.touches?.[0] || null;
    return {
      x: touch?.clientX ?? 0,
      y: touch?.clientY ?? 0,
    };
  }
  return {
    x: event.clientX ?? 0,
    y: event.clientY ?? 0,
  };
}

function findMessageCopyNodeFromTarget(target) {
  const targetEl = getMessageCopyTargetElement(target);
  if (!(targetEl instanceof HTMLElement)) {
    return null;
  }
  return (
    targetEl.closest("[data-message-copy-text]") ||
    targetEl.closest(".msg-bubble, .msg-notice")
  );
}

function getMessageCopyTextFromNode(node) {
  if (!(node instanceof HTMLElement)) {
    return "";
  }
  const encoded = node.getAttribute("data-message-copy-text") || "";
  if (encoded) {
    return decodeCopyPayload(encoded);
  }
  const textSource =
    node.querySelector(".msg-bubble-body, .msg-notice-text, .assistant-main-block") || node;
  return String(textSource.textContent || "").trim();
}

function getMessageCopyKeyFromNode(node) {
  if (!(node instanceof HTMLElement)) {
    return "";
  }
  const explicitKey = String(node.getAttribute("data-message-copy-key") || "").trim();
  if (explicitKey) {
    return explicitKey;
  }
  const row = node.closest(".transcript-row");
  if (row instanceof HTMLElement) {
    return (
      String(row.id || "").trim() ||
      String(row.getAttribute("data-inspect-key") || "").trim()
    );
  }
  return "";
}

function getMessageCopyIdentityFromNode(node) {
  if (!(node instanceof HTMLElement)) {
    return "";
  }
  const key = getMessageCopyKeyFromNode(node);
  if (key) {
    return `key:${key}`;
  }
  const text = getMessageCopyTextFromNode(node);
  return text ? `text:${encodeCopyPayload(text).slice(0, 240)}` : "";
}

function clearMessageCopyTapCandidate() {
  messageCopyTapCandidate = null;
}

function clearPendingMessageCopyTap() {
  pendingMessageCopyTap = null;
}

function rememberPendingMessageCopyTap(identity) {
  if (!identity) {
    clearPendingMessageCopyTap();
    return;
  }
  pendingMessageCopyTap = {
    identity,
    expiresAt: Date.now() + MESSAGE_COPY_TAP_CLICK_WINDOW_MS,
  };
}

function consumePendingMessageCopyTap(identity) {
  const pending = pendingMessageCopyTap;
  clearPendingMessageCopyTap();
  if (!pending?.identity || !identity) {
    return false;
  }
  if (pending.expiresAt < Date.now()) {
    return false;
  }
  return pending.identity === identity;
}

function isMessageCopyTapWithinBounds(candidate, point) {
  if (!candidate) {
    return false;
  }
  const dx = Math.abs(Number(point?.x ?? 0) - Number(candidate.startX ?? 0));
  const dy = Math.abs(Number(point?.y ?? 0) - Number(candidate.startY ?? 0));
  return dx <= MESSAGE_COPY_TAP_MAX_MOVE_PX && dy <= MESSAGE_COPY_TAP_MAX_MOVE_PX;
}

function hasActiveSelectableText() {
  if (typeof window === "undefined" || typeof window.getSelection !== "function") {
    return false;
  }
  const selection = window.getSelection();
  return Boolean(String(selection?.toString() || "").trim());
}

function suppressMessageCopyMenuForNativeSelection() {
  messageCopySelectionSuppressUntil = Date.now() + MESSAGE_COPY_SELECTION_SUPPRESS_MS;
}

function shouldSuppressMessageCopyMenuForSelection() {
  if (hasActiveSelectableText()) {
    suppressMessageCopyMenuForNativeSelection();
    return true;
  }
  return messageCopySelectionSuppressUntil > Date.now();
}

function beginMessageCopyTapCandidate(event) {
  if (
    !shouldUseTapMessageCopyMenu(event) ||
    shouldIgnoreMessageCopyTarget(event.target) ||
    shouldSuppressMessageCopyMenuForSelection()
  ) {
    clearMessageCopyTapCandidate();
    clearPendingMessageCopyTap();
    return;
  }
  const node = findMessageCopyNodeFromTarget(event.target);
  if (!(node instanceof HTMLElement)) {
    clearMessageCopyTapCandidate();
    return;
  }
  const identity = getMessageCopyIdentityFromNode(node);
  if (!identity) {
    clearMessageCopyTapCandidate();
    return;
  }
  const point = getMessageCopyInteractionPoint(event);
  messageCopyTapCandidate = {
    identity,
    startX: point.x,
    startY: point.y,
    startedAt: Date.now(),
  };
}

function updateMessageCopyTapCandidate(event) {
  if (!messageCopyTapCandidate || !shouldUseTapMessageCopyMenu(event)) {
    return;
  }
  if (!isMessageCopyTapWithinBounds(messageCopyTapCandidate, getMessageCopyInteractionPoint(event))) {
    clearMessageCopyTapCandidate();
  }
}

function finalizeMessageCopyTapCandidate(event) {
  const candidate = messageCopyTapCandidate;
  clearMessageCopyTapCandidate();
  if (!candidate || !shouldUseTapMessageCopyMenu(event)) {
    clearPendingMessageCopyTap();
    return;
  }
  const node = findMessageCopyNodeFromTarget(event.target);
  if (!(node instanceof HTMLElement)) {
    clearPendingMessageCopyTap();
    return;
  }
  const identity = getMessageCopyIdentityFromNode(node);
  const elapsed = Date.now() - Number(candidate.startedAt || 0);
  if (
    identity &&
    identity === candidate.identity &&
    elapsed <= MESSAGE_COPY_TAP_MAX_DURATION_MS &&
    isMessageCopyTapWithinBounds(candidate, getMessageCopyInteractionPoint(event))
  ) {
    rememberPendingMessageCopyTap(identity);
    return;
  }
  clearPendingMessageCopyTap();
}

function escapeMessageCopyKeyForSelector(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(source);
  }
  return source.replace(/["\\]/g, "\\$&");
}

function syncActiveMessageCopyTargetDom() {
  if (typeof document === "undefined") {
    return;
  }

  document
    .querySelectorAll(".message-copy-target-active, .message-copy-row-active")
    .forEach((element) => {
      element.classList.remove("message-copy-target-active", "message-copy-row-active");
    });

  const anchorKey = String(state.detail.messageContextMenu?.anchorKey || "").trim();
  if (!anchorKey) {
    return;
  }

  const selectorKey = escapeMessageCopyKeyForSelector(anchorKey);
  if (!selectorKey) {
    return;
  }

  const target = document.querySelector(`[data-message-copy-key="${selectorKey}"]`);
  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.classList.add("message-copy-target-active");
  target.closest(".transcript-row")?.classList.add("message-copy-row-active");
}

function openMessageContextMenuFromInteraction(event, node = findMessageCopyNodeFromTarget(event.target)) {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  if (shouldSuppressMessageCopyMenuForSelection()) {
    clearPendingMessageCopyTap();
    return false;
  }
  if (!shouldUseTapMessageCopyMenu(event)) {
    return false;
  }
  if (shouldIgnoreMessageCopyTarget(event.target)) {
    return false;
  }
  const point = getMessageCopyInteractionPoint(event);
  event.preventDefault();
  event.stopPropagation();
  openMessageContextMenu(
    encodeCopyPayload(getMessageCopyTextFromNode(node)),
    point.x,
    point.y,
    getMessageCopyKeyFromNode(node),
  );
  return true;
}

function bindMessageCopyMenus() {
  const menuCopyButton = document.querySelector("[data-message-copy-action='copy']");
  if (menuCopyButton instanceof HTMLButtonElement) {
    menuCopyButton.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const copied = await writeClipboardText(String(state.detail.messageContextMenu?.text || ""));
      if (!copied) {
        showToast(t("inspect.copyFailed"));
        return;
      }
      showToast(t("inspect.copied"));
      closeMessageContextMenu();
    };
  }

  document.querySelectorAll("[data-message-copy-action='close']").forEach((node) => {
    if (node instanceof HTMLElement) {
      node.onclick = (event) => {
        event.preventDefault();
        closeMessageContextMenu();
      };
    }
  });

  if (messageCopyMenuListenersBound || typeof document === "undefined") {
    return;
  }
  messageCopyMenuListenersBound = true;

  document.addEventListener("contextmenu", (event) => {
    if (shouldSuppressMessageCopyMenuForSelection()) {
      return;
    }
    if (shouldBypassContextMenuForTouch(event)) {
      return;
    }
    const node = findMessageCopyNodeFromTarget(event.target);
    if (!(node instanceof HTMLElement) || shouldIgnoreMessageCopyTarget(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openMessageContextMenu(
      encodeCopyPayload(getMessageCopyTextFromNode(node)),
      event.clientX,
      event.clientY,
      getMessageCopyKeyFromNode(node),
    );
  }, true);

  if (typeof PointerEvent !== "undefined") {
    document.addEventListener("pointerdown", (event) => {
      beginMessageCopyTapCandidate(event);
    }, true);
    document.addEventListener("pointermove", (event) => {
      updateMessageCopyTapCandidate(event);
    }, true);
    document.addEventListener("pointerup", (event) => {
      finalizeMessageCopyTapCandidate(event);
    }, true);
    document.addEventListener("pointercancel", () => {
      clearMessageCopyTapCandidate();
      clearPendingMessageCopyTap();
    }, true);
  } else if (typeof TouchEvent !== "undefined") {
    document.addEventListener("touchstart", (event) => {
      beginMessageCopyTapCandidate(event);
    }, true);
    document.addEventListener("touchmove", (event) => {
      updateMessageCopyTapCandidate(event);
    }, true);
    document.addEventListener("touchend", (event) => {
      finalizeMessageCopyTapCandidate(event);
    }, true);
    document.addEventListener("touchcancel", () => {
      clearMessageCopyTapCandidate();
      clearPendingMessageCopyTap();
    }, true);
  }

  document.addEventListener("selectionchange", () => {
    if (!hasActiveSelectableText()) {
      return;
    }
    suppressMessageCopyMenuForNativeSelection();
    clearMessageCopyTapCandidate();
    clearPendingMessageCopyTap();
    closeMessageContextMenu();
  }, true);

  document.addEventListener("click", (event) => {
    const node = findMessageCopyNodeFromTarget(event.target);
    if (!(node instanceof HTMLElement)) {
      return;
    }
    if (!shouldUseTapMessageCopyMenu(event)) {
      return;
    }
    if (shouldSuppressMessageCopyMenuForSelection()) {
      clearPendingMessageCopyTap();
      return;
    }
    if (!consumePendingMessageCopyTap(getMessageCopyIdentityFromNode(node))) {
      return;
    }
    if (hasActiveSelectableText()) {
      return;
    }
    openMessageContextMenuFromInteraction(event, node);
  }, true);
}

function bindCopyButtons() {
  document.querySelectorAll("[data-copy-text]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const encoded = button.getAttribute("data-copy-text") || "";
      const copied = await writeClipboardText(decodeCopyPayload(encoded));
      if (!copied) {
        showToast(t("inspect.copyFailed"));
        return;
      }

      flashCopySuccess(button);
    });
  });
}

async function writeClipboardText(text) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_error) {
    // Fallback below.
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "readonly");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();

  try {
    return document.execCommand("copy");
  } catch (_error) {
    return false;
  } finally {
    input.remove();
  }
}

function flashCopySuccess(button) {
  const original = button.textContent;
  button.textContent = t("inspect.copied");
  button.classList.add("event-copy-button-copied");

  window.setTimeout(() => {
    button.textContent = original;
    button.classList.remove("event-copy-button-copied");
  }, 1200);
}

function cleanupSocket() {
  state.ws?.close();
  state.ws = null;
  state.socketState = "closed";
}

function cleanupDetailClock() {
  if (state.detail.liveClockId) {
    window.clearInterval(state.detail.liveClockId);
    state.detail.liveClockId = 0;
  }
}

function cleanupLiveResumeSync() {
  if (state.detail.liveResumeTimerId) {
    window.clearTimeout(state.detail.liveResumeTimerId);
    state.detail.liveResumeTimerId = 0;
  }
}

function cleanupImportedSessionSync() {
  if (state.detail.importedSyncTimerId) {
    window.clearTimeout(state.detail.importedSyncTimerId);
    state.detail.importedSyncTimerId = 0;
  }
}

async function resumeActiveSessionDetail(reason = "resume") {
  const sessionId = state.detail.session?.sessionId || state.workspace.activeSessionId || "";
  if (!sessionId || state.detail.resumeSyncInFlight) {
    return;
  }

  const now = Date.now();
  if (now - Number(state.detail.lastResumeSyncAt || 0) < 900) {
    return;
  }

  state.detail.resumeSyncInFlight = true;
  state.detail.lastResumeSyncAt = now;

  try {
    const shouldForceReconnect =
      reason === "visibility" || reason === "focus" || reason === "pageshow";

    if (shouldForceReconnect || state.socketState === "closed" || state.socketState === "error") {
      cleanupSocket();
      state.socketState = "connecting";
      attachSessionSocket(sessionId);
    }

    if (state.detail.session?.sourceKind === "imported_rollout") {
      await syncImportedSession(sessionId).catch(() => null);
    }

    const wasBusyBeforeRefresh = isSessionLiveBusy(state.detail.session);
    const refreshedSession = await getSession(sessionId).catch(() => null);
    if (refreshedSession && state.detail.session?.sessionId === sessionId) {
      state.detail.session = refreshedSession;
      state.detail.completionNoticeArmed = isSessionLiveBusy(refreshedSession);
      syncDetailPendingApproval(refreshedSession, state.detail.timelineState);
      updateSessionListItem(refreshedSession);
    }

    await catchUpSessionEvents(sessionId, state.detail.cursor || 0, {
      wasBusy: wasBusyBeforeRefresh,
    }).catch(() => null);

    if (state.detail.session?.sessionId === sessionId) {
      void maybeFlushMobileSendQueue(`resume:${reason}`);
      scheduleSessionDetailRender();
      scheduleImportedSessionSync(sessionId, 1000);
    }
  } finally {
    state.detail.resumeSyncInFlight = false;
  }
}

function shouldAutoSyncImportedSession(session) {
  return Boolean(
    session &&
      session.sourceKind === "imported_rollout" &&
      session.sourceRolloutHasOpenTurn === true &&
      !isSessionLiveBusy(session),
  );
}

function scheduleLiveResumeSync(sessionId, delayMs = 3200) {
  cleanupLiveResumeSync();
  const session = state.detail.session;
  if (!session || session.sessionId !== sessionId || !isSessionLiveBusy(session)) {
    return;
  }

  state.detail.liveResumeTimerId = window.setTimeout(async () => {
    state.detail.liveResumeTimerId = 0;

    if (!state.detail.session || state.detail.session.sessionId !== sessionId || !isSessionLiveBusy(state.detail.session)) {
      return;
    }

    try {
      await resumeActiveSessionDetail("live-heartbeat");
    } finally {
      if (
        state.detail.session &&
        state.detail.session.sessionId === sessionId &&
        isSessionLiveBusy(state.detail.session)
      ) {
        scheduleLiveResumeSync(sessionId, 3200);
      }
    }
  }, delayMs);
}

function updateSessionListItem(session) {
  if (!session?.sessionId) {
    return;
  }

  state.sessions.items = state.sessions.items.map((item) =>
    item.sessionId === session.sessionId
      ? {
          ...item,
          title: session.title,
          status: session.status,
          liveBusy: session.liveBusy,
          codexThreadId: session.codexThreadId,
          sourceKind: session.sourceKind,
          sourceRolloutPath: session.sourceRolloutPath,
          sourceThreadId: session.sourceThreadId,
          sourceRolloutHasOpenTurn: session.sourceRolloutHasOpenTurn,
          updatedAt: session.updatedAt,
          lastEventAt: session.lastEventAt,
          eventCount: Math.max(getSessionActivityCount(item), getSessionActivityCount(session)),
          latestPlan: session.latestPlan || item.latestPlan || null,
          hasTaskPlan: Boolean(session.hasTaskPlan ?? item.hasTaskPlan),
          lastAssistantContent: session.lastAssistantContent ?? item.lastAssistantContent ?? "",
          lastCommand: session.lastCommand ?? item.lastCommand ?? "",
        }
      : item,
  );

  if (String(state.detail.session?.sessionId || "").trim() === String(session.sessionId || "").trim()) {
    schedulePersistActiveSessionDetailCache();
  }
}

function scheduleImportedSessionSync(sessionId, delayMs = 1200) {
  cleanupImportedSessionSync();
  const session = state.detail.session;
  if (!session || session.sessionId !== sessionId || !shouldAutoSyncImportedSession(session)) {
    return;
  }

  state.detail.importedSyncTimerId = window.setTimeout(async () => {
    state.detail.importedSyncTimerId = 0;

    if (!state.detail.session || state.detail.session.sessionId !== sessionId) {
      return;
    }

    try {
      const result = await syncImportedSession(sessionId);
      if (!state.detail.session || state.detail.session.sessionId !== sessionId) {
        return;
      }

      if (result?.appendedEvents > 0) {
        await catchUpSessionEvents(sessionId, state.detail.cursor);
      }

      if (result?.appendedEvents > 0 || result?.synced) {
        const refreshedSession = await getSession(sessionId).catch(() => null);
        if (refreshedSession && state.detail.session?.sessionId === sessionId) {
          state.detail.session = refreshedSession;
          syncDetailPendingApproval(refreshedSession, state.detail.timelineState);
          updateSessionListItem(refreshedSession);
        }
      }

      scheduleSessionDetailRender();
      scheduleImportedSessionSync(sessionId, 1600);
    } catch {
      scheduleImportedSessionSync(sessionId, 2400);
    }
  }, delayMs);
}

function ensureDetailClock() {
  cleanupDetailClock();
  syncDetailClockLabels();
  if (!state.detail.session) {
    return;
  }

  state.detail.liveClockId = window.setInterval(() => {
    syncDetailClockLabels();
  }, 1000);
}

function syncDetailClockLabels() {
  const session = state.detail.session;
  if (!session) {
    return;
  }

  const sessionElapsedEl = document.querySelector("#session-elapsed-chip");
  if (sessionElapsedEl) {
    sessionElapsedEl.textContent = t("session.elapsed", {
      value: formatElapsedSinceIso(session.createdAt),
    });
  }

  const activeElapsedEl = document.querySelector("#session-active-elapsed-chip");
  if (activeElapsedEl && state.detail.activeTaskStartedAt > 0) {
    activeElapsedEl.textContent = t("session.turnElapsed", {
      value: formatElapsedSinceUnixSeconds(state.detail.activeTaskStartedAt),
    });
  }

  document.querySelectorAll("[data-active-elapsed='true']").forEach((element) => {
    if (!(element instanceof HTMLElement) || state.detail.activeTaskStartedAt <= 0) {
      return;
    }
    element.textContent = formatElapsedSinceUnixSeconds(state.detail.activeTaskStartedAt);
  });

  const mobileActiveElapsedEl = document.querySelector("#session-mobile-active-elapsed");
  if (mobileActiveElapsedEl && state.detail.activeTaskStartedAt > 0) {
    mobileActiveElapsedEl.textContent = formatElapsedSinceUnixSeconds(
      state.detail.activeTaskStartedAt,
    );
  }
}

function renderSearchHighlight(value, search) {
  const text = String(value || "");
  const keyword = normalizeSearchKeyword(search);
  if (!keyword) {
    return escapeHtml(text);
  }

  const lowerText = text.toLowerCase();
  let cursor = 0;
  let html = "";

  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(keyword, cursor);
    if (matchIndex === -1) {
      html += escapeHtml(text.slice(cursor));
      break;
    }

    html += escapeHtml(text.slice(cursor, matchIndex));
    html += `<mark class="command-search-hit">${escapeHtml(
      text.slice(matchIndex, matchIndex + keyword.length),
    )}</mark>`;
    cursor = matchIndex + keyword.length;
  }

  return html;
}

function jumpToSearchResult(result) {
  if (!result.key || !result.targetId) {
    return;
  }

  state.detail.activeSearchResultKey = result.key;
  openInspectDrawer(result.key);
  renderSessionDetail();
  window.setTimeout(() => {
    focusSearchTarget(result.targetId);
  }, 0);
}

function focusSearchTarget(targetId) {
  const target = document.querySelector(`#${targetId}`);
  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
}

function getCommandGroupElementId(groupId) {
  return `command-group-${sanitizeDomIdSegment(groupId || "unknown")}`;
}

function getEventElementId(eventId) {
  return `event-${sanitizeDomIdSegment(eventId || "unknown")}`;
}

function getUserBubbleElementId(eventId) {
  return `user-msg-${sanitizeDomIdSegment(eventId || "unknown")}`;
}

function getAssistantBubbleElementId(stableId) {
  return `assistant-msg-${sanitizeDomIdSegment(stableId || "unknown")}`;
}

function getRawStdoutElementId(bucketId) {
  return `raw-out-${sanitizeDomIdSegment(bucketId || "unknown")}`;
}

function getOrphanStderrElementId(bucketId) {
  return `orphan-err-${sanitizeDomIdSegment(bucketId || "unknown")}`;
}

function sanitizeDomIdSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function searchResultKindLabel(event) {
  if (event.type === "message.user") {
    return t("timeline.userMessage");
  }

  if (event.type === "cli.chunk") {
    return cliEventLabel(event.stream);
  }

  if (event.type === "cli.exit") {
    return t("inspect.processExit");
  }

  if (event.type === "session.status") {
    return t("inspect.statusChange");
  }

  if (event.level === "error") {
    return "Error";
  }

  if (event.level === "warning") {
    return t("inspect.warning");
  }

  return t("inspect.filter.system");
}

function describeSearchResultTitle(event) {
  if (event.type === "cli.exit") {
    return `exitCode: ${String(event.exitCode)}`;
  }

  if (event.type === "session.status") {
    return event.status || "unknown";
  }

  if (event.content) {
    return event.content;
  }

  return searchResultKindLabel(event);
}

function describeSearchResultSnippet(event) {
  if (!event) {
    return "";
  }

  if (event.type === "system.notice" && isCommandStartNotice(event)) {
    return extractCommandText(event);
  }

  return describeSearchResultTitle(event);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function messageOf(error) {
  if (error?.code === "request_timeout") {
    return t("errors.requestTimeout");
  }
  return error instanceof Error ? error.message : "Unknown error";
}

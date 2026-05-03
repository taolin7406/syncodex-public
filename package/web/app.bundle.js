(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };

  // package/web/api.js
  var headers = {
    "Content-Type": "application/json"
  };
  var SEND_MESSAGE_TIMEOUT_MS = 75e3;
  var GET_RETRY_DELAYS_MS = [350, 900];
  var ATTACHMENT_UPLOAD_RETRY_DELAYS_MS = [700, 1600];
  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
  function isTransientFetchError(error) {
    return (error == null ? void 0 : error.name) === "TypeError" && String((error == null ? void 0 : error.message) || "").toLowerCase().includes("failed to fetch");
  }
  function isTransientRequestError(error) {
    return isTransientFetchError(error) || (error == null ? void 0 : error.code) === "request_timeout";
  }
  function shouldRetryRequest(options, error, attempt, retryDelaysMs) {
    const method = String(options.method || "GET").toUpperCase();
    const delays = Array.isArray(retryDelaysMs) ? retryDelaysMs : method === "GET" ? GET_RETRY_DELAYS_MS : [];
    return attempt < delays.length && isTransientRequestError(error);
  }
  async function request(path, options = {}) {
    const _a = options, { timeoutMs = 0, retryDelaysMs = null } = _a, fetchOptions = __objRest(_a, ["timeoutMs", "retryDelaysMs"]);
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await requestOnce(path, __spreadValues({ timeoutMs }, fetchOptions));
      } catch (error) {
        const delays = Array.isArray(retryDelaysMs) ? retryDelaysMs : String(fetchOptions.method || "GET").toUpperCase() === "GET" ? GET_RETRY_DELAYS_MS : [];
        if (!shouldRetryRequest(fetchOptions, error, attempt, delays)) {
          throw error;
        }
        await sleep(delays[attempt]);
      }
    }
  }
  async function requestOnce(path, options = {}) {
    var _b, _c;
    const _a = options, { timeoutMs = 0 } = _a, fetchOptions = __objRest(_a, ["timeoutMs"]);
    const controller = timeoutMs > 0 && typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0;
    let response;
    try {
      response = await fetch(path, __spreadProps(__spreadValues({}, fetchOptions), {
        signal: (_b = controller == null ? void 0 : controller.signal) != null ? _b : fetchOptions.signal,
        headers: __spreadValues(__spreadValues({}, headers), (_c = fetchOptions.headers) != null ? _c : {})
      }));
    } catch (error) {
      if ((error == null ? void 0 : error.name) === "AbortError") {
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
        (data == null ? void 0 : data.error) || "request_failed",
        (data == null ? void 0 : data.message) || (data == null ? void 0 : data.error) || `Request failed: ${response.status}`,
        data
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
    } catch (e) {
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
    if ((result == null ? void 0 : result.status) === "failed" || (result == null ? void 0 : result.ok) === false) {
      const stderr = typeof (result == null ? void 0 : result.stderr) === "string" ? result.stderr.trim() : "";
      const errorText = (result == null ? void 0 : result.error) || (result == null ? void 0 : result.message) || stderr || "send_failed";
      throw createApiError("send_failed", errorText, result);
    }
    return result;
  }
  function getProjects() {
    return request("/api/projects");
  }
  function createProject(payload) {
    return request("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  function browseProjectDirectories(pathValue = "") {
    const query = pathValue ? `?path=${encodeURIComponent(pathValue)}` : "";
    return request(`/api/projects/browse${query}`);
  }
  function getSessions() {
    return request("/api/sessions");
  }
  function createSession(payload) {
    return request("/api/sessions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  function importCodexSession(payload) {
    return request("/api/sessions/import-codex", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  function getSession(sessionId) {
    return request(`/api/sessions/${sessionId}`);
  }
  function updateSession(sessionId, payload) {
    return request(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }
  function syncImportedSession(sessionId) {
    return request(`/api/sessions/${sessionId}/sync`, {
      method: "POST"
    });
  }
  function getSessionEvents(sessionId, options = 0) {
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
  function getSessionTimeline(sessionId, options = 0) {
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
  function getSessionTimelineEvents(sessionId, options = 0) {
    return getSessionTimeline(sessionId, options);
  }
  function sendMessage(sessionId, payload) {
    return request(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: SEND_MESSAGE_TIMEOUT_MS
    }).then(assertMessageSent);
  }
  function getSessionQueue(sessionId) {
    return request(`/api/sessions/${sessionId}/queue`);
  }
  function queueMessage(sessionId, payload) {
    return request(`/api/sessions/${sessionId}/queue`, {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: SEND_MESSAGE_TIMEOUT_MS
    }).then(assertMessageSent);
  }
  function steerMessage(sessionId, payload) {
    return request(`/api/sessions/${sessionId}/steer`, {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: SEND_MESSAGE_TIMEOUT_MS
    }).then(assertMessageSent);
  }
  function updateQueuedMessage(sessionId, itemId, payload) {
    return request(`/api/sessions/${sessionId}/queue/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
      timeoutMs: SEND_MESSAGE_TIMEOUT_MS
    }).then(assertMessageSent);
  }
  function deleteQueuedMessage(sessionId, itemId) {
    return request(`/api/sessions/${sessionId}/queue/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      timeoutMs: SEND_MESSAGE_TIMEOUT_MS
    }).then(assertMessageSent);
  }
  function uploadSessionAttachments(sessionId, attachments) {
    return request(`/api/sessions/${sessionId}/attachments`, {
      method: "POST",
      body: JSON.stringify({ attachments }),
      timeoutMs: SEND_MESSAGE_TIMEOUT_MS,
      retryDelaysMs: ATTACHMENT_UPLOAD_RETRY_DELAYS_MS
    });
  }
  function deleteSessionAttachments(sessionId, attachments) {
    return request(`/api/sessions/${sessionId}/attachments`, {
      method: "DELETE",
      body: JSON.stringify({ attachments }),
      timeoutMs: SEND_MESSAGE_TIMEOUT_MS
    });
  }
  function createTtsAudio(text) {
    return request("/api/tts", {
      method: "POST",
      body: JSON.stringify({ text }),
      timeoutMs: SEND_MESSAGE_TIMEOUT_MS
    });
  }
  function stopSession(sessionId) {
    return request(`/api/sessions/${sessionId}/stop`, {
      method: "POST"
    });
  }
  function resolveSessionApproval(sessionId, requestId, decision) {
    return request(`/api/sessions/${sessionId}/approvals/${encodeURIComponent(requestId)}`, {
      method: "POST",
      body: JSON.stringify({ decision })
    });
  }
  function retrySessionApproval(sessionId, requestId, payload = {}) {
    return request(`/api/sessions/${sessionId}/approvals/${encodeURIComponent(requestId)}/retry`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  function getCodexUiOptions() {
    return request("/api/codex/mode");
  }
  function getCodexStatus(params = {}) {
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
  function getCodexQuota(sessionId) {
    return request(`/api/codex/quota?sessionId=${encodeURIComponent(sessionId)}`);
  }
  function getCodexHosts() {
    return request("/api/codex/hosts");
  }
  function getImportableCodexSessions() {
    return request("/api/codex/importable-sessions");
  }

  // package/web/i18n/locales/en.js
  var en_default = {
    "app.name": "Syncodex",
    "errors.requestTimeout": "Send timed out. Draft kept for retry.",
    "nav.projects": "Projects",
    "nav.sessions": "Sessions",
    "marketing.headline": "Keep an eye on Codex CLI from your phone",
    "marketing.copy": "Register a project, start a session, and hand the task off to a server-managed Codex CLI.",
    "workspace.openSidebar": "Open session sidebar",
    "workspace.closeSidebar": "Collapse session sidebar",
    "workspace.language.select": "Language",
    "workspace.language.switchToEnglish": "Switch to English",
    "workspace.language.switchToChinese": "Switch to Chinese",
    "workspace.language.toggle": "EN",
    "workspace.empty.eyebrow": "Session Workspace",
    "workspace.empty.title": "Choose a session to start working",
    "workspace.empty.subtitle": "Switch sessions from the sidebar, or create/import one directly.",
    "workspace.empty.newSession": "New session",
    "workspace.empty.importCodex": "Import Codex session",
    "workspace.sidebar.import": "Import Codex",
    "workspace.sidebar.newSession": "+ New session",
    "workspace.sidebar.empty": "No sessions match the current filter.",
    "workspace.sidebar.hasTasks": "Has task list",
    "workspace.sidebar.unreadCount": "{count} new updates",
    "workspace.sidebar.currentTask": "Now: {task}",
    "workspace.sidebar.taskProgress": "Tasks {completed} / {total}",
    "workspace.alerts.enable": "Enable completion alerts",
    "workspace.alerts.disable": "Disable completion alerts",
    "workspace.alerts.denied": "Notification permission is blocked",
    "workspace.alerts.enabledToast": "Completion alerts enabled.",
    "workspace.alerts.disabledToast": "Completion alerts disabled.",
    "workspace.alerts.vibrationOnlyToast": "Vibration alerts enabled; browser notifications are unavailable.",
    "workspace.alerts.deniedToast": "Browser notification permission is blocked. Enable it in browser settings.",
    "workspace.alerts.unsupportedToast": "This browser does not support notifications or vibration alerts.",
    "workspace.session.untitled": "Untitled session",
    "workspace.sessionMenu.title": "Session actions",
    "workspace.sessionMenu.pin": "Pin conversation",
    "workspace.sessionMenu.unpin": "Unpin conversation",
    "workspace.sessionMenu.pinned": "Pinned",
    "workspace.sessionMenu.rename": "Rename conversation",
    "workspace.sessionMenu.renamePrompt": "Rename conversation",
    "workspace.sessionMenu.renameEmpty": "Name cannot be empty.",
    "workspace.sessionMenu.renamed": "Conversation renamed.",
    "workspace.sessionMenu.archive": "Archive conversation",
    "workspace.sessionMenu.archiveConfirm": "Archive this conversation?",
    "workspace.sessionMenu.archived": "Conversation archived.",
    "workspace.sessionMenu.pinnedDone": "Conversation pinned.",
    "workspace.sessionMenu.unpinnedDone": "Conversation unpinned.",
    "workspace.project.untitled": "Untitled project",
    "workspace.create.eyebrow": "Session",
    "workspace.create.pickProjectTitle": "Choose a project to start a session",
    "workspace.create.close": "Close",
    "workspace.create.noProjects": "There are no projects yet. Pick a directory to use it directly, or create a new project folder inside it.",
    "workspace.create.chooseDirectory": "Choose directory",
    "workspace.create.startSession": "Start session",
    "workspace.create.processing": "Working...",
    "workspace.create.startMode": "Start mode",
    "workspace.create.startModeProject": "Existing project",
    "workspace.create.startModeCustom": "Custom path",
    "workspace.create.customCwd": "Working directory",
    "workspace.create.customCwdPlaceholder": "For example D:\\Projects\\syncodex",
    "workspace.create.customCwdHelp": "On mobile, type a Windows path directly; Syncodex will verify that the directory exists on the backend.",
    "workspace.create.customCwdRequired": "Enter a working directory.",
    "workspace.create.model": "Model",
    "workspace.create.reasoning": "Reasoning",
    "workspace.create.defaultModel": "Default model",
    "workspace.create.defaultReasoning": "Default reasoning",
    "workspace.create.noModelOverride": "Do not change model",
    "workspace.create.noReasoningOverride": "Do not change effort",
    "workspace.create.firstMessage": "First message",
    "workspace.create.firstMessagePlaceholder": "Enter the first message to send to Codex",
    "workspace.create.firstMessageHelp": "Syncodex will create a new thread through the official Codex app-server and send this message immediately.",
    "workspace.create.firstMessageRequired": "Enter the first message.",
    "workspace.create.existingProjectsOnly": "Start from an existing project or a custom path. Syncodex remembers the last choice.",
    "workspace.create.directoryTitle": "Choose a directory to start a session",
    "workspace.create.projectName": "New project name (optional)",
    "workspace.create.projectNamePlaceholder": "Leave empty to use this directory directly, or enter a name to create a new project folder inside it",
    "workspace.create.projectHelp": "Leave it empty to use the current directory as the project root. If you enter a project name, Syncodex will create that folder inside the current directory before starting the session.",
    "workspace.create.currentDirectory": "Current directory",
    "workspace.create.pathPlaceholder": "Choose a directory, or type a path directly",
    "workspace.create.upOneLevel": "Up one level",
    "workspace.create.loadingDirectories": "Loading directories...",
    "workspace.create.noChildDirectories": "There are no subdirectories to browse here.",
    "workspace.create.backToProjects": "Back to project list",
    "workspace.create.pathRequired": "Choose a directory or type a path directly.",
    "workspace.import.eyebrow": "Codex",
    "workspace.import.title": "Import Codex session",
    "workspace.import.searchPlaceholder": "Search by title, path, or session ID",
    "workspace.import.loading": "Loading importable sessions...",
    "workspace.import.empty": "No matching Codex sessions were found.",
    "workspace.import.imported": "Imported",
    "workspace.import.available": "Available",
    "workspace.import.syncLatest": "Sync latest",
    "workspace.import.importSession": "Import session",
    "workspace.import.syncToExisting": "Will sync into existing session {sessionId}",
    "workspace.import.importSelected": "Will import {title}",
    "workspace.import.chooseSession": "Choose a session",
    "workspace.import.noneAvailable": "There are no local Codex sessions available to import.",
    "workspace.import.invalidPrompt": "Invalid import selection.",
    "workspace.import.promptHeader": "Enter the number to import:",
    "workspace.loading.session": "Loading session content...",
    "workspace.loading.sessionSyncing": "Syncing latest session state...",
    "workspace.loading.sessionSyncFailed": "Latest sync failed. Showing cached content.",
    "workspace.loading.projects": "Loading projects...",
    "workspace.loading.sessions": "Loading sessions...",
    "projects.runtimeEyebrow": "Runtime",
    "projects.healthTitle": "Server health",
    "projects.codexCommand": "Codex command",
    "projects.executionMode": "Execution mode",
    "projects.projectRoots": "Project roots",
    "projects.registryEyebrow": "Project registry",
    "projects.addTitle": "Add project",
    "projects.name": "Project name",
    "projects.namePlaceholder": "e.g. my-service",
    "projects.path": "Local path",
    "projects.pathPlaceholder": "/workspace/my-service",
    "projects.register": "Register project",
    "projects.listTitle": "Projects",
    "projects.count": ({ count }) => count === 1 ? "1 project" : `${count} projects`,
    "projects.promptSessionTitle": "Enter a session title",
    "projects.promptSessionDefault": "Fix an API error",
    "sessions.filterListTitle": "Filters and list",
    "sessions.searchPlaceholder": "Search title, last reply, or command",
    "sessions.showing": "Showing {visible} / {total}",
    "sessions.clearFilters": "Clear filters",
    "sessions.projectMeta": "Project: {value}",
    "sessions.lastEventMeta": "Last event: {value}",
    "sessions.eventCount": ({ count }) => count === 1 ? "1 event" : `${count} events`,
    "sessions.threadReady": "Thread ready",
    "sessions.threadMissing": "Thread missing",
    "sessions.pendingApproval": "Pending approval",
    "sessions.emptyFiltered": "No sessions match the current filters.",
    "sessions.pageRange": "Items {start}-{end} of {total}",
    "sessions.pageIndex": "Page {page} / {total}",
    "sessions.pagePrev": "Previous",
    "sessions.pageNext": "Next",
    "sessions.pendingApprovalTitle": "Pending approval",
    "sessions.lastCommandTitle": "Last command",
    "sessions.lastReplyTitle": "Last reply",
    "sessions.statusAll": ({ count }) => `All statuses (${count})`,
    "sessions.projectAll": ({ count }) => `All projects (${count})`,
    "sessions.threadAll": "All threads",
    "sessions.threadReadyFilter": "Thread ready",
    "sessions.threadMissingFilter": "Thread missing",
    "sessions.sort.activity_desc": "Recently active",
    "sessions.sort.created_desc": "Recently created",
    "sessions.sort.events_desc": "Most events",
    "sessions.sort.reply_desc": "Recently replied",
    "session.status.idle": "Idle",
    "session.status.starting": "Starting",
    "session.status.running": "Running",
    "session.status.waiting_input": "Waiting",
    "session.status.stopping": "Stopping",
    "session.status.completed": "Completed",
    "session.status.failed": "Failed",
    "session.status.unknown": "Unknown status",
    "session.host.unsynced": "Host not synced",
    "session.model.unsynced": "Model not synced",
    "session.reasoning.unsynced": "Reasoning not synced",
    "session.elapsed": "Session {value}",
    "session.turnElapsed": "Turn {value}",
    "session.externalRunning": "Running externally",
    "session.current": "Current session",
    "session.back": "Back",
    "threadStatus.idle": "Idle",
    "threadStatus.idleDetail": "Ready for a new message",
    "threadStatus.sending": "Sending",
    "threadStatus.sendingDetail": "Delivering the message to Codex",
    "threadStatus.delivered": "Delivered to Codex",
    "threadStatus.deliveredDetail": "Waiting for Codex to start processing",
    "threadStatus.processing": "Processing",
    "threadStatus.waitingUpdate": "Waiting for Codex events",
    "threadStatus.thinking": "Thinking",
    "threadStatus.thinkingDetail": "Codex is reasoning",
    "threadStatus.runningCommand": "Running command",
    "threadStatus.editingFiles": "Editing files",
    "threadStatus.editingFilesDetail": "Codex is applying file changes",
    "threadStatus.waitingApproval": "Waiting for approval",
    "threadStatus.waitingApprovalDetail": "Approve it in Codex Desktop",
    "threadStatus.completed": "Completed",
    "threadStatus.completedDetail": "This turn is complete",
    "threadStatus.failed": "Error",
    "threadStatus.failedDetail": "This turn hit an error",
    "completionNotice.title": "Codex completed",
    "completionNotice.detail": "The latest turn in {title} is done",
    "completionActions.view": "View result",
    "completionActions.read": "Read aloud",
    "completionActions.pauseRead": "Pause reading",
    "completionActions.resumeRead": "Resume reading",
    "completionActions.readingControl": "Reading controls",
    "completionActions.moveReadControl": "Move reading controls",
    "completionActions.stopRead": "Stop reading",
    "completionActions.copy": "Copy result",
    "completionActions.summarize": "Summarize",
    "completionActions.continue": "Continue",
    "completionActions.options": "Options",
    "completionActions.settings": "This thread",
    "completionActions.stopAutoContinue": "Stop auto-continue",
    "completionActions.settingShowMenu": "Show completion menu",
    "completionActions.settingAutoRead": "Auto-read in this thread",
    "completionActions.settingAutoContinue": "Auto-continue in this thread",
    "completionActions.settingMaxRuns": "Run limit for this thread",
    "completionActions.autoContinueHelp": "These toggles apply only to the current thread. Auto-continue sends a continue prompt after a task finishes here. It stops at the limit, on errors, while waiting for approval, or when the task list is complete.",
    "completionActions.autoContinueProgress": "Auto-continue: {count} / {max}",
    "completionActions.autoSending": "Continuing automatically...",
    "completionActions.autoSent": "Auto-continue prompt sent.",
    "completionActions.autoQueued": "Queued an auto-continue step.",
    "completionActions.sending": "Sending...",
    "completionActions.sent": "Sent.",
    "completionActions.waitForIdle": "Codex is still processing this task. Wait until it finishes before running this action.",
    "completionActions.waitForQueue": "Queued tasks are waiting, so completion actions will wait for the queue first.",
    "completionActions.autoStoppedLimit": "Auto-continue stopped: reached the {count} / {max} limit.",
    "completionActions.autoStoppedFailure": "This turn failed, so auto-continue is paused.",
    "completionActions.autoStoppedApproval": "Codex is waiting for approval, so auto-continue is paused.",
    "completionActions.autoStoppedPlanDone": "The task list is complete, so auto-continue stopped.",
    "completionActions.autoStoppedQueued": "A queued mobile message will be sent next, so auto-continue is paused.",
    "completionActions.autoStoppedByUser": "Auto-continue stopped.",
    "completionActions.noResult": "No result text is available.",
    "completionActions.copied": "Result copied.",
    "completionActions.speechUnsupported": "This browser does not support speech.",
    "completionActions.readingStarted": "Reading result.",
    "completionActions.readingTruncated": "Codex completed. The result is long, so reading the beginning.",
    "completionActions.audioTitle": "Audio player",
    "completionActions.audioHelp": "Generate audio with Windows speech and play it on this phone.",
    "completionActions.generateAudio": "Generate audio",
    "completionActions.audioGenerating": "Generating audio...",
    "completionActions.audioGeneratingShort": "Generating...",
    "completionActions.audioReady": "Audio is ready.",
    "completionActions.audioReadyCached": "Cached audio is ready.",
    "completionActions.audioReadyTapToPlay": "Audio is ready. Tap the sound button to play.",
    "completionActions.audioTapToPlay": "Tap the sound button to start audio.",
    "completionActions.audioFailed": "Audio generation failed.",
    "completionActions.autoReadFailed": "Auto-read did not start. Tap Read aloud to retry.",
    "completionActions.clearAudio": "Remove audio",
    "taskPlan.title": "Current tasks",
    "taskPlan.current": "Now: {task}",
    "taskPlan.allDone": "All tasks completed",
    "taskPlan.progress": "{completed} / {total} completed",
    "taskPlan.status.pending": "Pending",
    "taskPlan.status.inProgress": "In progress",
    "taskPlan.status.completed": "Completed",
    "inspect.selectionTitle": "Details",
    "inspect.close": "Close",
    "inspect.searchFlow": "Search timeline",
    "inspect.searchPlaceholder": "Search commands, errors, or replies",
    "inspect.searchPrev": "Previous",
    "inspect.searchNext": "Next",
    "inspect.clearSearch": "Clear",
    "inspect.results": "Results",
    "inspect.resultCount": ({ count }) => count === 1 ? "1 result" : `${count} results`,
    "inspect.resultCountMatches": ({ count }) => count === 1 ? "1 match" : `${count} matches`,
    "inspect.emptySearch": "No search results match the current filters.",
    "inspect.rawEventsEmpty": "There are no raw events yet.",
    "inspect.hint.permissionsDenied": "The current command hit a system permission denial. The target path might be outside the writable workspace.",
    "inspect.hint.readOnly": "The current runtime is in read-only mode, so write operations fail immediately.",
    "inspect.hint.workspaceWrite": "The current runtime is in workspace-write mode, so writes are limited to the current writable roots.",
    "inspect.hint.noInteractiveApproval": "The current {mode} runtime path does not support interactive approval prompts.",
    "inspect.hint.workspaceRoot": "The current workspace root is {path}.",
    "inspect.hint.sandboxApproval": "This failure is related to the current sandbox / approval settings.",
    "inspect.session": "Session",
    "inspect.project": "Project",
    "inspect.projectDirectory": "Project directory",
    "inspect.currentCwd": "Current CWD",
    "inspect.executionPath": "Execution path",
    "inspect.workspaceRoot": "Workspace root",
    "inspect.writableRoots": "Writable roots",
    "inspect.pid": "PID",
    "inspect.thread": "Thread",
    "inspect.runtimeHints": "Restrictions",
    "inspect.fetchHistory": "Fetch history",
    "inspect.followBottom": "Jump to bottom and follow",
    "inspect.autoScroll": "Auto-scroll: {value}",
    "inspect.rawEventsDebug": "Raw events / debug data",
    "inspect.emptySelection": "Choose a task to inspect its input, execution, and final reply.",
    "inspect.detailTitle": "Turn details",
    "inspect.userInput": "User input",
    "inspect.executionDetails": "Execution details",
    "inspect.assistantReply": "Assistant reply",
    "inspect.rawStdout": "Raw CLI output",
    "inspect.output": "Output",
    "inspect.viewOutputDetails": "View output details",
    "inspect.viewFullCommandOutput": "View full command and output",
    "inspect.commandStillRunning": "The command is still running and output will keep streaming.",
    "inspect.commandEndedWithErrors": "The command finished with stderr output.",
    "inspect.commandCompletedExpand": "The command finished. Expand to inspect full output.",
    "inspect.commandCompletedNoOutput": "The command finished with no extra output.",
    "inspect.executionSteps": "Execution steps",
    "inspect.viewRawEvents": "View raw events",
    "inspect.copyCommand": "Copy command",
    "inspect.commandMetrics": "Command metrics",
    "inspect.commandOutput": "Output",
    "inspect.copyFailed": "Copy failed. Please copy manually.",
    "inspect.copied": "Copied",
    "inspect.tool": "Tool",
    "inspect.userKind": "User",
    "inspect.statusKind": "Status",
    "inspect.commandUnknown": "Unknown command",
    "inspect.systemNotice": "System notice",
    "inspect.running": "Running",
    "inspect.error": "Error",
    "inspect.warning": "Warning",
    "inspect.completed": "Completed",
    "inspect.stderr": "Stderr",
    "inspect.duration": "Duration",
    "inspect.problemCommand": "Problem command",
    "inspect.longRunning": "Long running",
    "inspect.slowCommand": "Slow command",
    "inspect.noOutput": "No output",
    "inspect.noOutputYetShort": "No output yet",
    "inspect.processExit": "Process exit",
    "inspect.statusChange": "Status change",
    "inspect.filter.all": "All",
    "inspect.filter.assistant": "Assistant",
    "inspect.filter.command": "Tool / command",
    "inspect.filter.system": "System",
    "inspect.severity.all": "All severities",
    "approval.required": "Approval required",
    "approval.commandRequired": "Command execution requires approval",
    "approval.fileChangeRequired": "File changes require approval",
    "approval.extraPermissionRequired": "Extra permissions require approval",
    "approval.pending": "Pending",
    "approval.restore": "Restart required",
    "approval.continueHint": "This step needs your approval before execution can continue.",
    "approval.restoreHint": "This approval request was restored from history and the runtime is no longer active. Send the task again to request approval one more time.",
    "approval.retryAction": "Request again",
    "approval.deny": "Deny",
    "approval.allowOnce": "Allow once",
    "approval.allowForTurn": "Allow for turn",
    "approval.pathInWritable": "The target path {targetPath} is already writable. This approval is needed to continue a sensitive operation.",
    "approval.pathOutsideWorkspace": "The target path {targetPath} is outside the current workspace root {workspaceRoot}, so approval is required.",
    "approval.pathOutsideWritable": "The target path {targetPath} is outside the current writable roots, so approval is required.",
    "composer.reasoning.low": "Low",
    "composer.reasoning.medium": "Medium",
    "composer.reasoning.high": "High",
    "composer.reasoning.xhigh": "Very high",
    "composer.model.noOverride": "Do not change model",
    "composer.reasoning.noOverride": "Do not change effort",
    "composer.slashMenu": "Slash commands",
    "composer.slashLoading": "Loading commands...",
    "composer.slashEmpty": "No matching commands",
    "composer.quota.remaining": "Quota remaining",
    "composer.quota.hours": "5 hours {percent} {remain}",
    "composer.quota.week": "1 week {percent} {reset}",
    "composer.environment": "Environment menu",
    "composer.unsynced": "Not synced",
    "composer.placeholder": "Idle, waiting for input",
    "composer.syncingHint": "Syncing latest state, please wait...",
    "composer.aria.message": "Send a message to Codex",
    "composer.aria.model": "Model",
    "composer.aria.reasoning": "Reasoning effort",
    "composer.aria.stop": "Stop current task",
    "composer.aria.stopping": "Stopping current task",
    "composer.aria.clearBusy": "Clear stuck state",
    "composer.aria.send": "Send",
    "composer.aria.queue": "Queue for next turn",
    "composer.aria.steer": "Steer current task",
    "composer.aria.sending": "Sending",
    "composer.sending": "Sending...",
    "composer.steered": "Steering message sent.",
    "composer.steerNeedsBusy": "Steer is available only while Codex is working.",
    "composer.stopping": "Stopping...",
    "composer.stopConfirm": "Stop the current Codex task?",
    "composer.sendFailed": "Send failed",
    "composer.stopRequested": "Stop request sent to official Codex.",
    "composer.clearBusyDone": "Official Codex stop failed. Syncodex only cleared its local busy state.",
    "composer.busyHint": "",
    "composer.queueHint": "Codex is busy. Send will queue this message in the official Codex queue.",
    "composer.queued": ({ count }) => count === 1 ? "Queued for the next turn" : `${count} messages queued for the next turn`,
    "composer.queueSending": "Sending queued message...",
    "composer.queueSent": "Queued message sent.",
    "composer.officialQueued": ({ count }) => `${count} official Codex queue item(s) waiting.`,
    "composer.queueAfterOfficial": ({ official, local }) => `${official} official Codex queue item(s), plus ${local} legacy local item(s).`,
    "composer.attachments.title": "Attachments",
    "composer.attachments.add": "Add files or images",
    "composer.attachments.remove": "Remove attachment",
    "composer.attachments.uploading": "Uploading attachments...",
    "composer.attachments.uploadingShort": "Uploading",
    "composer.attachments.failed": "Attachment upload failed. Remove it before retrying.",
    "composer.attachments.failedShort": "Failed",
    "composer.attachments.added": ({ count }) => `Added ${count} attachment(s).`,
    "composer.attachments.tooMany": ({ count }) => `Add up to ${count} attachments.`,
    "composer.attachments.tooLarge": ({ name }) => `Attachment is too large: ${name}`,
    "composer.attachments.totalTooLarge": "Total attachment size is too large.",
    "composer.attachments.pasting": "Pasting image...",
    "composer.attachments.pasteFailed": "Could not read the pasted image. Save it and add it with the attachment button.",
    "queue.title": "Task queue",
    "queue.summary": ({ official, local, total }) => `${total} queued: ${official} official, ${local} legacy local. Official Codex items are the execution source.`,
    "queue.originOfficial": "Official Codex",
    "queue.originSyncodex": "Legacy local",
    "queue.originAutoContinue": "Auto continue",
    "queue.createdAgo": ({ value }) => `queued ${value} ago`,
    "queue.actions": "Queue actions",
    "queue.openActions": "Open queue actions",
    "queue.edit": "Edit",
    "queue.edited": "Queued task updated",
    "queue.removed": "Queued task deleted",
    "queue.movedToFront": "Moved to the front",
    "queue.editLocal": "Edit",
    "queue.editPrompt": "Edit this local queued task",
    "queue.editedLocal": "Local queued task updated",
    "queue.removeLocal": "Delete this local queued task",
    "queue.removeLocalShort": "Delete",
    "queue.removedLocal": "Local queued task deleted",
    "queue.moveLocalToFront": "Move to front",
    "queue.movedLocalToFront": "Moved to the front of the local queue",
    "queue.badgeOfficial": ({ count }) => `${count} official Codex queued item(s)`,
    "queue.badgeSyncodex": ({ count }) => `${count} Syncodex local queued item(s)`,
    "queue.badgeShortOfficial": ({ count }) => `C ${count}`,
    "queue.badgeShortSyncodex": ({ count }) => `S ${count}`,
    "timeline.empty": "No conversation yet.",
    "timeline.userMessage": "User message",
    "timeline.assistantCommentary": "Assistant commentary",
    "timeline.assistant": "Assistant",
    "timeline.thinking": "Thinking...",
    "timeline.command": "Command",
    "timeline.commandStreaming": "Command output is still streaming...",
    "timeline.patch": "Edited files",
    "timeline.patchStreaming": "Patch output is still streaming...",
    "timeline.activitySummary": "Activity summary",
    "timeline.fileChanges": "Edited files",
    "timeline.file.untitled": "Untitled file",
    "timeline.summary.moreItems": "and {count} more",
    "timeline.summary.moreFiles": "and {count} more files",
    "timeline.summary.moreLocations": "and {count} more locations",
    "timeline.summary.searchAt": "searched in {value}",
    "timeline.summary.activities": "{count} activities",
    "timeline.system": "System",
    "timeline.jumpToBottom": "Jump to bottom",
    "timeline.validation.completed": ({ count }) => count > 1 ? `Validated ${count} items` : "Validated",
    "timeline.search.completed": ({ count }) => count > 1 ? `Searched ${count} items` : "Searched",
    "timeline.browse.completed": ({ count }) => count > 1 ? `Browsed ${count} files` : "Browsed file",
    "timeline.edit.completed": ({ count }) => count > 1 ? `Edited ${count} files` : "Edited file",
    "timeline.executedActivities": ({ count }) => `Completed ${count} activities`,
    "activity.search": "Search",
    "activity.browse.single": "Browsed 1 file",
    "activity.browse.multiple": "Browsed {count} files",
    "activity.edit.single": "Edited file",
    "activity.edit.multiple": "Edited {count} files",
    "activity.validation.completed": "Validated",
    "activity.running.edit": "Editing files",
    "activity.failed.edit": "File edit failed",
    "activity.completed.edit": "Edited file",
    "activity.running.search": "Searching",
    "activity.failed.search": "Search failed",
    "activity.completed.search": "Searched",
    "activity.running.browse": "Viewing files",
    "activity.failed.browse": "File view failed",
    "activity.completed.browse": "Browsed file",
    "activity.running.validation": "Validating",
    "activity.failed.validation": "Validation failed",
    "activity.completed.validation": "Validated",
    "activity.running.git": "Running Git operation",
    "activity.failed.git": "Git operation failed",
    "activity.completed.git": "Ran Git operation",
    "activity.running.run": "Running command",
    "activity.failed.run": "Command failed",
    "activity.completed.run": "Ran command",
    "task.commandExecuted": "Ran {label}",
    "task.commandRunning": "Running {label}",
    "task.commandFailed": "Failed {label}",
    "task.processing": "Working",
    "task.empty": "No execution steps to display.",
    "command.outputCount": ({ count }) => `output ${count}`,
    "command.stdoutCount": ({ count }) => `stdout ${count}`,
    "command.stderrCount": ({ count }) => `stderr ${count}`,
    "command.elapsedLabel": "Elapsed {value}",
    "command.runningForLabel": "Running {value}",
    "command.summary.running": "Command is still running...",
    "command.summary.completed": "Command completed.",
    "command.summary.failedExpand": "Command failed. Expand to inspect full output.",
    "command.summary.completedWithStderr": "Command completed with stderr output.",
    "command.summary.completedExpand": "Command completed. Expand to inspect full output.",
    "runtime.low": "Low",
    "runtime.medium": "Medium",
    "runtime.high": "High",
    "runtime.xhigh": "Very high",
    "generic.close": "Close",
    "generic.back": "Back",
    "generic.refresh": "Refresh",
    "generic.online": "Online",
    "generic.search": "Search",
    "generic.project": "Project",
    "generic.status": "Status",
    "generic.sort": "Sort",
    "generic.keyword": "Keyword",
    "generic.clear": "Clear",
    "generic.copy": "Copy",
    "generic.expand": "Expand",
    "generic.collapse": "Collapse",
    "generic.type": "Type",
    "generic.level": "Severity",
    "generic.on": "On",
    "generic.off": "Off",
    "generic.notSynced": "Not synced",
    "generic.notStarted": "Not started",
    "generic.notEstablished": "Not established",
    "generic.showing": "Showing {visible} / {total}",
    "generic.segmentCount": ({ count }) => count === 1 ? "1 segment" : `${count} segments`,
    "generic.noExtraOutput": "No extra output.",
    "generic.noOutputYet": "This command has no output yet.",
    "generic.unknown": "Unknown",
    "generic.none": "None",
    "composer.slashUnavailable": "This command is not available right now.",
    "composer.slashExecuted": "{slash} executed."
  };

  // package/web/i18n/locales/de.js
  var de_default = __spreadProps(__spreadValues({}, en_default), {
    "nav.projects": "Projekte",
    "nav.sessions": "Sitzungen",
    "workspace.openSidebar": "Sitzungsleiste \xF6ffnen",
    "workspace.closeSidebar": "Sitzungsleiste ausblenden",
    "workspace.empty.title": "W\xE4hle eine Sitzung, um zu starten",
    "workspace.empty.subtitle": "Wechsle Sitzungen in der Seitenleiste oder erstelle / importiere eine neue.",
    "workspace.empty.newSession": "Neue Sitzung",
    "workspace.sidebar.import": "Codex-Sitzung importieren",
    "workspace.sidebar.newSession": "+ Neue Sitzung",
    "workspace.sidebar.empty": "Keine Sitzung passt zum aktuellen Filter.",
    "workspace.session.untitled": "Unbenannte Sitzung",
    "workspace.loading.session": "Sitzungsinhalt wird geladen...",
    "workspace.loading.projects": "Projekte werden geladen...",
    "workspace.loading.sessions": "Sitzungen werden geladen...",
    "session.status.idle": "Leerlauf",
    "session.status.starting": "Startet",
    "session.status.running": "L\xE4uft",
    "session.status.waiting_input": "Wartet",
    "session.status.stopping": "Wird gestoppt",
    "session.status.completed": "Abgeschlossen",
    "session.status.failed": "Fehlgeschlagen",
    "session.current": "Aktuelle Sitzung",
    "approval.required": "Genehmigung erforderlich",
    "approval.pending": "Ausstehend",
    "approval.deny": "Ablehnen",
    "approval.allowOnce": "Einmal erlauben",
    "approval.allowForTurn": "F\xFCr diesen Zug erlauben",
    "composer.placeholder": "Beschreibe die Entwicklungsaufgabe, die Codex \xFCbernehmen soll",
    "timeline.empty": "Noch keine Unterhaltung.",
    "timeline.thinking": "Denkt nach...",
    "generic.close": "Schlie\xDFen",
    "generic.back": "Zur\xFCck",
    "generic.refresh": "Aktualisieren",
    "generic.search": "Suchen",
    "generic.project": "Projekt",
    "generic.status": "Status",
    "generic.sort": "Sortieren",
    "generic.keyword": "Suchbegriff",
    "generic.copy": "Kopieren",
    "generic.expand": "Erweitern",
    "generic.collapse": "Einklappen",
    "generic.on": "An",
    "generic.off": "Aus",
    "generic.none": "Keine",
    "inspect.selectionTitle": "Details"
  });

  // package/web/i18n/locales/es.js
  var es_default = __spreadProps(__spreadValues({}, en_default), {
    "nav.projects": "Proyectos",
    "nav.sessions": "Sesiones",
    "workspace.openSidebar": "Abrir barra lateral de sesiones",
    "workspace.closeSidebar": "Ocultar barra lateral de sesiones",
    "workspace.empty.title": "Elige una sesi\xF3n para empezar a trabajar",
    "workspace.empty.subtitle": "Cambia de sesi\xF3n desde la barra lateral o crea/importa una nueva.",
    "workspace.empty.newSession": "Nueva sesi\xF3n",
    "workspace.sidebar.import": "Importar sesi\xF3n de Codex",
    "workspace.sidebar.newSession": "+ Nueva sesi\xF3n",
    "workspace.sidebar.empty": "Ninguna sesi\xF3n coincide con el filtro actual.",
    "workspace.session.untitled": "Sesi\xF3n sin t\xEDtulo",
    "workspace.loading.session": "Cargando contenido de la sesi\xF3n...",
    "workspace.loading.projects": "Cargando proyectos...",
    "workspace.loading.sessions": "Cargando sesiones...",
    "session.status.idle": "Inactiva",
    "session.status.starting": "Iniciando",
    "session.status.running": "En ejecuci\xF3n",
    "session.status.waiting_input": "Esperando",
    "session.status.stopping": "Deteniendo",
    "session.status.completed": "Completada",
    "session.status.failed": "Fall\xF3",
    "session.current": "Sesi\xF3n actual",
    "approval.required": "Se requiere aprobaci\xF3n",
    "approval.pending": "Pendiente",
    "approval.deny": "Denegar",
    "approval.allowOnce": "Permitir una vez",
    "approval.allowForTurn": "Permitir en este turno",
    "composer.placeholder": "Describe la tarea de desarrollo que quieres que Codex resuelva",
    "timeline.empty": "Todav\xEDa no hay conversaci\xF3n.",
    "timeline.thinking": "Pensando...",
    "generic.close": "Cerrar",
    "generic.back": "Volver",
    "generic.refresh": "Actualizar",
    "generic.search": "Buscar",
    "generic.project": "Proyecto",
    "generic.status": "Estado",
    "generic.sort": "Ordenar",
    "generic.keyword": "Palabra clave",
    "generic.copy": "Copiar",
    "generic.expand": "Expandir",
    "generic.collapse": "Contraer",
    "generic.on": "S\xED",
    "generic.off": "No",
    "generic.none": "Ninguno",
    "inspect.selectionTitle": "Detalles"
  });

  // package/web/i18n/locales/fr.js
  var fr_default = __spreadProps(__spreadValues({}, en_default), {
    "nav.projects": "Projets",
    "nav.sessions": "Sessions",
    "workspace.openSidebar": "Ouvrir la barre lat\xE9rale des sessions",
    "workspace.closeSidebar": "R\xE9duire la barre lat\xE9rale des sessions",
    "workspace.empty.title": "Choisissez une session pour commencer",
    "workspace.empty.subtitle": "Basculez entre les sessions depuis la barre lat\xE9rale ou cr\xE9ez / importez-en une.",
    "workspace.empty.newSession": "Nouvelle session",
    "workspace.sidebar.import": "Importer une session Codex",
    "workspace.sidebar.newSession": "+ Nouvelle session",
    "workspace.sidebar.empty": "Aucune session ne correspond au filtre actuel.",
    "workspace.session.untitled": "Session sans titre",
    "workspace.loading.session": "Chargement du contenu de la session...",
    "workspace.loading.projects": "Chargement des projets...",
    "workspace.loading.sessions": "Chargement des sessions...",
    "session.status.idle": "Inactif",
    "session.status.starting": "D\xE9marrage",
    "session.status.running": "En cours",
    "session.status.waiting_input": "En attente",
    "session.status.stopping": "Arr\xEAt",
    "session.status.completed": "Termin\xE9",
    "session.status.failed": "\xC9chec",
    "session.current": "Session actuelle",
    "approval.required": "Approbation requise",
    "approval.pending": "En attente",
    "approval.deny": "Refuser",
    "approval.allowOnce": "Autoriser une fois",
    "approval.allowForTurn": "Autoriser pour ce tour",
    "composer.placeholder": "D\xE9crivez la t\xE2che de d\xE9veloppement que vous voulez confier \xE0 Codex",
    "timeline.empty": "Aucune conversation pour le moment.",
    "timeline.thinking": "R\xE9flexion...",
    "generic.close": "Fermer",
    "generic.back": "Retour",
    "generic.refresh": "Actualiser",
    "generic.search": "Rechercher",
    "generic.project": "Projet",
    "generic.status": "Statut",
    "generic.sort": "Trier",
    "generic.keyword": "Mot-cl\xE9",
    "generic.copy": "Copier",
    "generic.expand": "D\xE9velopper",
    "generic.collapse": "R\xE9duire",
    "generic.on": "Activ\xE9",
    "generic.off": "D\xE9sactiv\xE9",
    "generic.none": "Aucun",
    "inspect.selectionTitle": "D\xE9tails"
  });

  // package/web/i18n/locales/ja.js
  var ja_default = __spreadProps(__spreadValues({}, en_default), {
    "nav.projects": "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8",
    "nav.sessions": "\u30BB\u30C3\u30B7\u30E7\u30F3",
    "workspace.openSidebar": "\u30BB\u30C3\u30B7\u30E7\u30F3\u30B5\u30A4\u30C9\u30D0\u30FC\u3092\u958B\u304F",
    "workspace.closeSidebar": "\u30BB\u30C3\u30B7\u30E7\u30F3\u30B5\u30A4\u30C9\u30D0\u30FC\u3092\u9589\u3058\u308B",
    "workspace.empty.title": "\u4F5C\u696D\u3092\u59CB\u3081\u308B\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u9078\u629E",
    "workspace.empty.subtitle": "\u30B5\u30A4\u30C9\u30D0\u30FC\u3067\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u5207\u308A\u66FF\u3048\u308B\u304B\u3001\u65B0\u898F\u4F5C\u6210 / \u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    "workspace.empty.newSession": "\u65B0\u3057\u3044\u30BB\u30C3\u30B7\u30E7\u30F3",
    "workspace.sidebar.import": "Codex \u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u30A4\u30F3\u30DD\u30FC\u30C8",
    "workspace.sidebar.newSession": "+ \u65B0\u3057\u3044\u30BB\u30C3\u30B7\u30E7\u30F3",
    "workspace.sidebar.empty": "\u73FE\u5728\u306E\u30D5\u30A3\u30EB\u30BF\u30FC\u306B\u4E00\u81F4\u3059\u308B\u30BB\u30C3\u30B7\u30E7\u30F3\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
    "workspace.session.untitled": "\u7121\u984C\u306E\u30BB\u30C3\u30B7\u30E7\u30F3",
    "workspace.loading.session": "\u30BB\u30C3\u30B7\u30E7\u30F3\u5185\u5BB9\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D...",
    "workspace.loading.projects": "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D...",
    "workspace.loading.sessions": "\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D...",
    "session.status.idle": "\u5F85\u6A5F\u4E2D",
    "session.status.starting": "\u8D77\u52D5\u4E2D",
    "session.status.running": "\u5B9F\u884C\u4E2D",
    "session.status.waiting_input": "\u5165\u529B\u5F85\u3061",
    "session.status.stopping": "\u505C\u6B62\u4E2D",
    "session.status.completed": "\u5B8C\u4E86",
    "session.status.failed": "\u5931\u6557",
    "session.current": "\u73FE\u5728\u306E\u30BB\u30C3\u30B7\u30E7\u30F3",
    "approval.required": "\u627F\u8A8D\u304C\u5FC5\u8981\u3067\u3059",
    "approval.pending": "\u4FDD\u7559\u4E2D",
    "approval.deny": "\u62D2\u5426",
    "approval.allowOnce": "\u4E00\u5EA6\u3060\u3051\u8A31\u53EF",
    "approval.allowForTurn": "\u3053\u306E\u30BF\u30FC\u30F3\u3067\u8A31\u53EF",
    "composer.placeholder": "Codex \u306B\u4EFB\u305B\u305F\u3044\u958B\u767A\u30BF\u30B9\u30AF\u3092\u8AAC\u660E\u3057\u3066\u304F\u3060\u3055\u3044",
    "timeline.empty": "\u307E\u3060\u4F1A\u8A71\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
    "timeline.thinking": "\u601D\u8003\u4E2D...",
    "generic.close": "\u9589\u3058\u308B",
    "generic.back": "\u623B\u308B",
    "generic.refresh": "\u66F4\u65B0",
    "generic.search": "\u691C\u7D22",
    "generic.project": "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8",
    "generic.status": "\u72B6\u614B",
    "generic.sort": "\u4E26\u3073\u66FF\u3048",
    "generic.keyword": "\u30AD\u30FC\u30EF\u30FC\u30C9",
    "generic.copy": "\u30B3\u30D4\u30FC",
    "generic.expand": "\u5C55\u958B",
    "generic.collapse": "\u6298\u308A\u305F\u305F\u3080",
    "generic.on": "\u30AA\u30F3",
    "generic.off": "\u30AA\u30D5",
    "generic.none": "\u306A\u3057",
    "inspect.selectionTitle": "\u8A73\u7D30"
  });

  // package/web/i18n/locales/ko.js
  var ko_default = __spreadProps(__spreadValues({}, en_default), {
    "nav.projects": "\uD504\uB85C\uC81D\uD2B8",
    "nav.sessions": "\uC138\uC158",
    "workspace.openSidebar": "\uC138\uC158 \uC0AC\uC774\uB4DC\uBC14 \uC5F4\uAE30",
    "workspace.closeSidebar": "\uC138\uC158 \uC0AC\uC774\uB4DC\uBC14 \uB2EB\uAE30",
    "workspace.empty.title": "\uC791\uC5C5\uC744 \uC2DC\uC791\uD560 \uC138\uC158\uC744 \uC120\uD0DD\uD558\uC138\uC694",
    "workspace.empty.subtitle": "\uC0AC\uC774\uB4DC\uBC14\uC5D0\uC11C \uC138\uC158\uC744 \uC804\uD658\uD558\uAC70\uB098 \uC0C8\uB85C \uB9CC\uB4E4\uAE30 / \uAC00\uC838\uC624\uAE30\uB97C \uD558\uC138\uC694.",
    "workspace.empty.newSession": "\uC0C8 \uC138\uC158",
    "workspace.sidebar.import": "Codex \uC138\uC158 \uAC00\uC838\uC624\uAE30",
    "workspace.sidebar.newSession": "+ \uC0C8 \uC138\uC158",
    "workspace.sidebar.empty": "\uD604\uC7AC \uD544\uD130\uC640 \uC77C\uCE58\uD558\uB294 \uC138\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
    "workspace.session.untitled": "\uC81C\uBAA9 \uC5C6\uB294 \uC138\uC158",
    "workspace.loading.session": "\uC138\uC158 \uB0B4\uC6A9\uC744 \uBD88\uB7EC\uC624\uB294 \uC911...",
    "workspace.loading.projects": "\uD504\uB85C\uC81D\uD2B8\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...",
    "workspace.loading.sessions": "\uC138\uC158\uC744 \uBD88\uB7EC\uC624\uB294 \uC911...",
    "session.status.idle": "\uB300\uAE30",
    "session.status.starting": "\uC2DC\uC791 \uC911",
    "session.status.running": "\uC2E4\uD589 \uC911",
    "session.status.waiting_input": "\uC785\uB825 \uB300\uAE30",
    "session.status.stopping": "\uC911\uC9C0 \uC911",
    "session.status.completed": "\uC644\uB8CC",
    "session.status.failed": "\uC2E4\uD328",
    "session.current": "\uD604\uC7AC \uC138\uC158",
    "approval.required": "\uC2B9\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4",
    "approval.pending": "\uB300\uAE30 \uC911",
    "approval.deny": "\uAC70\uBD80",
    "approval.allowOnce": "\uD55C \uBC88 \uD5C8\uC6A9",
    "approval.allowForTurn": "\uC774\uBC88 \uD134\uC5D0\uC11C \uD5C8\uC6A9",
    "composer.placeholder": "Codex\uAC00 \uCC98\uB9AC\uD560 \uAC1C\uBC1C \uC791\uC5C5\uC744 \uC124\uBA85\uD558\uC138\uC694",
    "timeline.empty": "\uC544\uC9C1 \uB300\uD654\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
    "timeline.thinking": "\uC0DD\uAC01 \uC911...",
    "generic.close": "\uB2EB\uAE30",
    "generic.back": "\uB4A4\uB85C",
    "generic.refresh": "\uC0C8\uB85C\uACE0\uCE68",
    "generic.search": "\uAC80\uC0C9",
    "generic.project": "\uD504\uB85C\uC81D\uD2B8",
    "generic.status": "\uC0C1\uD0DC",
    "generic.sort": "\uC815\uB82C",
    "generic.keyword": "\uD0A4\uC6CC\uB4DC",
    "generic.copy": "\uBCF5\uC0AC",
    "generic.expand": "\uD3BC\uCE58\uAE30",
    "generic.collapse": "\uC811\uAE30",
    "generic.on": "\uCF1C\uC9D0",
    "generic.off": "\uAEBC\uC9D0",
    "generic.none": "\uC5C6\uC74C",
    "inspect.selectionTitle": "\uC138\uBD80 \uC815\uBCF4"
  });

  // package/web/i18n/locales/pt-BR.js
  var pt_BR_default = __spreadProps(__spreadValues({}, en_default), {
    "nav.projects": "Projetos",
    "nav.sessions": "Sess\xF5es",
    "workspace.openSidebar": "Abrir barra lateral de sess\xF5es",
    "workspace.closeSidebar": "Recolher barra lateral de sess\xF5es",
    "workspace.empty.title": "Escolha uma sess\xE3o para come\xE7ar a trabalhar",
    "workspace.empty.subtitle": "Troque de sess\xE3o pela barra lateral ou crie / importe uma nova.",
    "workspace.empty.newSession": "Nova sess\xE3o",
    "workspace.sidebar.import": "Importar sess\xE3o do Codex",
    "workspace.sidebar.newSession": "+ Nova sess\xE3o",
    "workspace.sidebar.empty": "Nenhuma sess\xE3o corresponde ao filtro atual.",
    "workspace.session.untitled": "Sess\xE3o sem t\xEDtulo",
    "workspace.loading.session": "Carregando conte\xFAdo da sess\xE3o...",
    "workspace.loading.projects": "Carregando projetos...",
    "workspace.loading.sessions": "Carregando sess\xF5es...",
    "session.status.idle": "Inativa",
    "session.status.starting": "Iniciando",
    "session.status.running": "Executando",
    "session.status.waiting_input": "Aguardando",
    "session.status.stopping": "Parando",
    "session.status.completed": "Conclu\xEDda",
    "session.status.failed": "Falhou",
    "session.current": "Sess\xE3o atual",
    "approval.required": "Aprova\xE7\xE3o necess\xE1ria",
    "approval.pending": "Pendente",
    "approval.deny": "Negar",
    "approval.allowOnce": "Permitir uma vez",
    "approval.allowForTurn": "Permitir neste turno",
    "composer.placeholder": "Descreva a tarefa de desenvolvimento que voc\xEA quer que o Codex resolva",
    "timeline.empty": "Ainda n\xE3o h\xE1 conversa.",
    "timeline.thinking": "Pensando...",
    "generic.close": "Fechar",
    "generic.back": "Voltar",
    "generic.refresh": "Atualizar",
    "generic.search": "Buscar",
    "generic.project": "Projeto",
    "generic.status": "Status",
    "generic.sort": "Ordenar",
    "generic.keyword": "Palavra-chave",
    "generic.copy": "Copiar",
    "generic.expand": "Expandir",
    "generic.collapse": "Recolher",
    "generic.on": "Ligado",
    "generic.off": "Desligado",
    "generic.none": "Nenhum",
    "inspect.selectionTitle": "Detalhes"
  });

  // package/web/i18n/locales/ru.js
  var ru_default = __spreadProps(__spreadValues({}, en_default), {
    "nav.projects": "\u041F\u0440\u043E\u0435\u043A\u0442\u044B",
    "nav.sessions": "\u0421\u0435\u0441\u0441\u0438\u0438",
    "workspace.openSidebar": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0431\u043E\u043A\u043E\u0432\u0443\u044E \u043F\u0430\u043D\u0435\u043B\u044C \u0441\u0435\u0441\u0441\u0438\u0439",
    "workspace.closeSidebar": "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u0431\u043E\u043A\u043E\u0432\u0443\u044E \u043F\u0430\u043D\u0435\u043B\u044C \u0441\u0435\u0441\u0441\u0438\u0439",
    "workspace.empty.title": "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0435\u0441\u0441\u0438\u044E, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C \u0440\u0430\u0431\u043E\u0442\u0443",
    "workspace.empty.subtitle": "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0439\u0442\u0435 \u0441\u0435\u0441\u0441\u0438\u0438 \u0432 \u0431\u043E\u043A\u043E\u0432\u043E\u0439 \u043F\u0430\u043D\u0435\u043B\u0438 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 / \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u043D\u043E\u0432\u0443\u044E.",
    "workspace.empty.newSession": "\u041D\u043E\u0432\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F",
    "workspace.sidebar.import": "\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0435\u0441\u0441\u0438\u044E Codex",
    "workspace.sidebar.newSession": "+ \u041D\u043E\u0432\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F",
    "workspace.sidebar.empty": "\u041D\u0435\u0442 \u0441\u0435\u0441\u0441\u0438\u0439, \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0438\u0445 \u043F\u043E\u0434 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u0444\u0438\u043B\u044C\u0442\u0440.",
    "workspace.session.untitled": "\u0421\u0435\u0441\u0441\u0438\u044F \u0431\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F",
    "workspace.loading.session": "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E \u0441\u0435\u0441\u0441\u0438\u0438...",
    "workspace.loading.projects": "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432...",
    "workspace.loading.sessions": "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u0435\u0441\u0441\u0438\u0439...",
    "session.status.idle": "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435",
    "session.status.starting": "\u0417\u0430\u043F\u0443\u0441\u043A",
    "session.status.running": "\u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F",
    "session.status.waiting_input": "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0432\u0432\u043E\u0434\u0430",
    "session.status.stopping": "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430",
    "session.status.completed": "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E",
    "session.status.failed": "\u041E\u0448\u0438\u0431\u043A\u0430",
    "session.current": "\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F",
    "approval.required": "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435",
    "approval.pending": "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435",
    "approval.deny": "\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C",
    "approval.allowOnce": "\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u043E\u0434\u0438\u043D \u0440\u0430\u0437",
    "approval.allowForTurn": "\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0445\u043E\u0434\u0430",
    "composer.placeholder": "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0437\u0430\u0434\u0430\u0447\u0443 \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0438, \u043A\u043E\u0442\u043E\u0440\u0443\u044E Codex \u0434\u043E\u043B\u0436\u0435\u043D \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C",
    "timeline.empty": "\u0414\u0438\u0430\u043B\u043E\u0433\u0430 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.",
    "timeline.thinking": "\u0420\u0430\u0437\u043C\u044B\u0448\u043B\u044F\u0435\u0442...",
    "generic.close": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C",
    "generic.back": "\u041D\u0430\u0437\u0430\u0434",
    "generic.refresh": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
    "generic.search": "\u041F\u043E\u0438\u0441\u043A",
    "generic.project": "\u041F\u0440\u043E\u0435\u043A\u0442",
    "generic.status": "\u0421\u0442\u0430\u0442\u0443\u0441",
    "generic.sort": "\u0421\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0430",
    "generic.keyword": "\u041A\u043B\u044E\u0447\u0435\u0432\u043E\u0435 \u0441\u043B\u043E\u0432\u043E",
    "generic.copy": "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
    "generic.expand": "\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C",
    "generic.collapse": "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C",
    "generic.on": "\u0412\u043A\u043B",
    "generic.off": "\u0412\u044B\u043A\u043B",
    "generic.none": "\u041D\u0435\u0442",
    "inspect.selectionTitle": "\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u043E\u0441\u0442\u0438"
  });

  // package/web/i18n/locales/zh-CN.js
  var zh_CN_default = {
    "app.name": "Syncodex",
    "errors.requestTimeout": "\u53D1\u9001\u8D85\u65F6\uFF0C\u5185\u5BB9\u5DF2\u4FDD\u7559\uFF0C\u53EF\u91CD\u8BD5\u3002",
    "nav.projects": "\u9879\u76EE",
    "nav.sessions": "\u4F1A\u8BDD",
    "marketing.headline": "\u624B\u673A\u4E0A\u76EF\u7740 Codex CLI \u8DD1\u4EFB\u52A1",
    "marketing.copy": "\u5148\u5EFA\u9879\u76EE\uFF0C\u518D\u5EFA\u4F1A\u8BDD\uFF0C\u518D\u628A\u4EFB\u52A1\u4E22\u7ED9\u670D\u52A1\u7AEF\u6258\u7BA1\u7684 Codex CLI\u3002",
    "workspace.openSidebar": "\u6253\u5F00\u4F1A\u8BDD\u4FA7\u8FB9\u680F",
    "workspace.closeSidebar": "\u6536\u8D77\u4F1A\u8BDD\u4FA7\u8FB9\u680F",
    "workspace.language.select": "\u8BED\u8A00",
    "workspace.language.switchToEnglish": "\u5207\u6362\u5230\u82F1\u6587",
    "workspace.language.switchToChinese": "\u5207\u6362\u5230\u4E2D\u6587",
    "workspace.language.toggle": "EN",
    "workspace.empty.eyebrow": "\u4F1A\u8BDD\u5DE5\u4F5C\u53F0",
    "workspace.empty.title": "\u9009\u62E9\u4E00\u4E2A\u4F1A\u8BDD\u5F00\u59CB\u5DE5\u4F5C",
    "workspace.empty.subtitle": "\u5DE6\u4FA7\u5207\u6362\u5DF2\u6709\u4F1A\u8BDD\uFF0C\u6216\u76F4\u63A5\u65B0\u5EFA/\u5BFC\u5165\u4E00\u4E2A\u4F1A\u8BDD\u3002",
    "workspace.empty.newSession": "\u65B0\u5EFA\u4F1A\u8BDD",
    "workspace.empty.importCodex": "\u5BFC\u5165 Codex \u4F1A\u8BDD",
    "workspace.sidebar.import": "\u5BFC\u5165 Codex",
    "workspace.sidebar.newSession": "+ \u65B0\u5EFA\u4F1A\u8BDD",
    "workspace.sidebar.empty": "\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u4E0B\u6CA1\u6709\u4F1A\u8BDD\u3002",
    "workspace.sidebar.hasTasks": "\u6709\u4EFB\u52A1\u5217\u8868",
    "workspace.sidebar.unreadCount": "{count} \u6761\u65B0\u52A8\u6001",
    "workspace.sidebar.currentTask": "\u5F53\u524D\uFF1A{task}",
    "workspace.sidebar.taskProgress": "\u4EFB\u52A1 {completed} / {total}",
    "workspace.alerts.enable": "\u5F00\u542F\u5B8C\u6210\u63D0\u9192",
    "workspace.alerts.disable": "\u5173\u95ED\u5B8C\u6210\u63D0\u9192",
    "workspace.alerts.denied": "\u901A\u77E5\u6743\u9650\u5DF2\u88AB\u6D4F\u89C8\u5668\u62D2\u7EDD",
    "workspace.alerts.enabledToast": "\u5DF2\u5F00\u542F\u5B8C\u6210\u63D0\u9192\u3002",
    "workspace.alerts.disabledToast": "\u5DF2\u5173\u95ED\u5B8C\u6210\u63D0\u9192\u3002",
    "workspace.alerts.vibrationOnlyToast": "\u5DF2\u5F00\u542F\u9707\u52A8\u63D0\u9192\uFF1B\u6D4F\u89C8\u5668\u901A\u77E5\u4E0D\u53EF\u7528\u3002",
    "workspace.alerts.deniedToast": "\u6D4F\u89C8\u5668\u901A\u77E5\u6743\u9650\u5DF2\u88AB\u62D2\u7EDD\uFF0C\u8BF7\u5728\u6D4F\u89C8\u5668\u8BBE\u7F6E\u4E2D\u5F00\u542F\u3002",
    "workspace.alerts.unsupportedToast": "\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u901A\u77E5\u6216\u9707\u52A8\u63D0\u9192\u3002",
    "workspace.session.untitled": "\u672A\u547D\u540D\u4F1A\u8BDD",
    "workspace.sessionMenu.title": "\u4F1A\u8BDD\u64CD\u4F5C",
    "workspace.sessionMenu.pin": "\u7F6E\u9876\u5BF9\u8BDD",
    "workspace.sessionMenu.unpin": "\u53D6\u6D88\u7F6E\u9876",
    "workspace.sessionMenu.pinned": "\u5DF2\u7F6E\u9876",
    "workspace.sessionMenu.rename": "\u91CD\u547D\u540D\u5BF9\u8BDD",
    "workspace.sessionMenu.renamePrompt": "\u91CD\u547D\u540D\u5BF9\u8BDD",
    "workspace.sessionMenu.renameEmpty": "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\u3002",
    "workspace.sessionMenu.renamed": "\u5DF2\u91CD\u547D\u540D\u5BF9\u8BDD\u3002",
    "workspace.sessionMenu.archive": "\u5F52\u6863\u5BF9\u8BDD",
    "workspace.sessionMenu.archiveConfirm": "\u5F52\u6863\u8FD9\u4E2A\u5BF9\u8BDD\uFF1F",
    "workspace.sessionMenu.archived": "\u5DF2\u5F52\u6863\u5BF9\u8BDD\u3002",
    "workspace.sessionMenu.pinnedDone": "\u5DF2\u7F6E\u9876\u5BF9\u8BDD\u3002",
    "workspace.sessionMenu.unpinnedDone": "\u5DF2\u53D6\u6D88\u7F6E\u9876\u3002",
    "workspace.project.untitled": "\u672A\u547D\u540D\u9879\u76EE",
    "workspace.create.eyebrow": "\u4F1A\u8BDD",
    "workspace.create.pickProjectTitle": "\u9009\u62E9\u9879\u76EE\u5F00\u59CB\u4F1A\u8BDD",
    "workspace.create.close": "\u5173\u95ED",
    "workspace.create.noProjects": "\u5F53\u524D\u8FD8\u6CA1\u6709\u9879\u76EE\u3002\u5148\u9009\u62E9\u4E00\u4E2A\u76EE\u5F55\uFF0C\u76F4\u63A5\u4F7F\u7528\u5DF2\u6709\u9879\u76EE\uFF0C\u6216\u5728\u8BE5\u76EE\u5F55\u4E0B\u521B\u5EFA\u4E00\u4E2A\u65B0\u9879\u76EE\u3002",
    "workspace.create.chooseDirectory": "\u9009\u62E9\u76EE\u5F55",
    "workspace.create.startSession": "\u5F00\u59CB\u4F1A\u8BDD",
    "workspace.create.processing": "\u5904\u7406\u4E2D...",
    "workspace.create.startMode": "\u65B0\u5EFA\u65B9\u5F0F",
    "workspace.create.startModeProject": "\u5DF2\u6709\u9879\u76EE",
    "workspace.create.startModeCustom": "\u81EA\u5B9A\u4E49\u8DEF\u5F84",
    "workspace.create.customCwd": "\u5DE5\u4F5C\u76EE\u5F55",
    "workspace.create.customCwdPlaceholder": "\u4F8B\u5982 D:\\Projects\\syncodex",
    "workspace.create.customCwdHelp": "\u624B\u673A\u7AEF\u53EF\u76F4\u63A5\u8F93\u5165 Windows \u8DEF\u5F84\uFF1BSyncodex \u4F1A\u5728\u540E\u7AEF\u786E\u8BA4\u76EE\u5F55\u5B58\u5728\u3002",
    "workspace.create.customCwdRequired": "\u8BF7\u8F93\u5165\u5DE5\u4F5C\u76EE\u5F55\u3002",
    "workspace.create.model": "\u6A21\u578B",
    "workspace.create.reasoning": "\u601D\u8003\u5F3A\u5EA6",
    "workspace.create.defaultModel": "\u9ED8\u8BA4\u6A21\u578B",
    "workspace.create.defaultReasoning": "\u9ED8\u8BA4\u5F3A\u5EA6",
    "workspace.create.noModelOverride": "\u4E0D\u4FEE\u6539\u6A21\u578B",
    "workspace.create.noReasoningOverride": "\u4E0D\u4FEE\u6539\u5F3A\u5EA6",
    "workspace.create.firstMessage": "\u7B2C\u4E00\u6761\u6D88\u606F",
    "workspace.create.firstMessagePlaceholder": "\u8F93\u5165\u8981\u4EA4\u7ED9 Codex \u7684\u7B2C\u4E00\u6761\u6D88\u606F",
    "workspace.create.firstMessageHelp": "Syncodex \u4F1A\u901A\u8FC7\u5B98\u65B9 Codex app-server \u521B\u5EFA\u65B0 thread\uFF0C\u5E76\u7ACB\u5373\u53D1\u9001\u8FD9\u6761\u6D88\u606F\u3002",
    "workspace.create.firstMessageRequired": "\u8BF7\u8F93\u5165\u7B2C\u4E00\u6761\u6D88\u606F\u3002",
    "workspace.create.existingProjectsOnly": "\u53EF\u4ECE\u5DF2\u6709\u9879\u76EE\u6216\u81EA\u5B9A\u4E49\u8DEF\u5F84\u5F00\u59CB\uFF0C\u5E76\u8BB0\u4F4F\u4E0A\u6B21\u9009\u62E9\u3002",
    "workspace.create.directoryTitle": "\u9009\u62E9\u76EE\u5F55\u5F00\u59CB\u4F1A\u8BDD",
    "workspace.create.projectName": "\u65B0\u9879\u76EE\u540D\u79F0\uFF08\u53EF\u9009\uFF09",
    "workspace.create.projectNamePlaceholder": "\u7559\u7A7A\u5219\u76F4\u63A5\u4F7F\u7528\u8BE5\u76EE\u5F55\uFF0C\u8F93\u5165\u5219\u5728\u8BE5\u76EE\u5F55\u4E0B\u521B\u5EFA\u65B0\u9879\u76EE",
    "workspace.create.projectHelp": "\u7559\u7A7A\u4F1A\u76F4\u63A5\u628A\u5F53\u524D\u76EE\u5F55\u5F53\u6210\u9879\u76EE\u76EE\u5F55\uFF1B\u5982\u679C\u586B\u5199\u9879\u76EE\u540D\u79F0\uFF0C\u5C31\u4F1A\u5728\u5F53\u524D\u76EE\u5F55\u4E0B\u65B0\u5EFA\u4E00\u4E2A\u9879\u76EE\u76EE\u5F55\u518D\u5F00\u59CB\u4F1A\u8BDD\u3002",
    "workspace.create.currentDirectory": "\u5F53\u524D\u76EE\u5F55",
    "workspace.create.pathPlaceholder": "\u9009\u62E9\u76EE\u5F55\uFF0C\u6216\u76F4\u63A5\u8F93\u5165\u76EE\u5F55\u8DEF\u5F84",
    "workspace.create.upOneLevel": "\u4E0A\u4E00\u7EA7",
    "workspace.create.loadingDirectories": "\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55...",
    "workspace.create.noChildDirectories": "\u5F53\u524D\u76EE\u5F55\u4E0B\u6CA1\u6709\u53EF\u6D4F\u89C8\u7684\u5B50\u76EE\u5F55\u3002",
    "workspace.create.backToProjects": "\u8FD4\u56DE\u9879\u76EE\u5217\u8868",
    "workspace.create.pathRequired": "\u8BF7\u9009\u62E9\u76EE\u5F55\uFF0C\u6216\u76F4\u63A5\u8F93\u5165\u76EE\u5F55\u8DEF\u5F84\u3002",
    "workspace.import.eyebrow": "Codex",
    "workspace.import.title": "\u5BFC\u5165 Codex \u4F1A\u8BDD",
    "workspace.import.searchPlaceholder": "\u641C\u7D22\u6807\u9898\u3001\u8DEF\u5F84\u6216\u4F1A\u8BDD ID",
    "workspace.import.loading": "\u6B63\u5728\u52A0\u8F7D\u53EF\u5BFC\u5165\u4F1A\u8BDD...",
    "workspace.import.empty": "\u6CA1\u6709\u5339\u914D\u7684 Codex \u4F1A\u8BDD\u3002",
    "workspace.import.imported": "\u5DF2\u5BFC\u5165",
    "workspace.import.available": "\u53EF\u5BFC\u5165",
    "workspace.import.syncLatest": "\u540C\u6B65\u6700\u65B0\u5185\u5BB9",
    "workspace.import.importSession": "\u5BFC\u5165\u4F1A\u8BDD",
    "workspace.import.syncToExisting": "\u5C06\u540C\u6B65\u5230\u73B0\u6709\u4F1A\u8BDD {sessionId}",
    "workspace.import.importSelected": "\u5C06\u5BFC\u5165 {title}",
    "workspace.import.chooseSession": "\u8BF7\u9009\u62E9\u4E00\u4E2A\u4F1A\u8BDD",
    "workspace.import.noneAvailable": "\u5F53\u524D\u6CA1\u6709\u53EF\u5BFC\u5165\u7684\u672C\u673A Codex \u4F1A\u8BDD\u3002",
    "workspace.import.invalidPrompt": "\u65E0\u6548\u7684\u5BFC\u5165\u7F16\u53F7\u3002",
    "workspace.import.promptHeader": "\u8F93\u5165\u8981\u5BFC\u5165\u7684\u7F16\u53F7\uFF1A",
    "workspace.loading.session": "\u6B63\u5728\u52A0\u8F7D\u4F1A\u8BDD\u5185\u5BB9...",
    "workspace.loading.sessionSyncing": "\u6B63\u5728\u540C\u6B65\u6700\u65B0\u72B6\u6001...",
    "workspace.loading.sessionSyncFailed": "\u6700\u65B0\u72B6\u6001\u540C\u6B65\u5931\u8D25\uFF0C\u5F53\u524D\u663E\u793A\u7684\u662F\u7F13\u5B58\u5185\u5BB9\u3002",
    "workspace.loading.projects": "\u6B63\u5728\u52A0\u8F7D\u9879\u76EE\u5217\u8868...",
    "workspace.loading.sessions": "\u6B63\u5728\u52A0\u8F7D\u4F1A\u8BDD\u5217\u8868...",
    "projects.runtimeEyebrow": "\u8FD0\u884C\u73AF\u5883",
    "projects.healthTitle": "\u670D\u52A1\u7AEF\u5065\u5EB7\u72B6\u6001",
    "projects.codexCommand": "Codex \u547D\u4EE4",
    "projects.executionMode": "\u6267\u884C\u6A21\u5F0F",
    "projects.projectRoots": "\u9879\u76EE\u767D\u540D\u5355",
    "projects.registryEyebrow": "\u9879\u76EE\u767B\u8BB0",
    "projects.addTitle": "\u65B0\u589E\u9879\u76EE",
    "projects.name": "\u9879\u76EE\u540D",
    "projects.namePlaceholder": "\u4F8B\u5982 my-service",
    "projects.path": "\u672C\u5730\u8DEF\u5F84",
    "projects.pathPlaceholder": "/workspace/my-service",
    "projects.register": "\u767B\u8BB0\u9879\u76EE",
    "projects.listTitle": "\u9879\u76EE\u5217\u8868",
    "projects.count": ({ count }) => `${count} \u4E2A\u9879\u76EE`,
    "projects.promptSessionTitle": "\u8F93\u5165\u4F1A\u8BDD\u6807\u9898",
    "projects.promptSessionDefault": "\u4FEE\u590D\u67D0\u4E2A\u63A5\u53E3\u5F02\u5E38",
    "sessions.filterListTitle": "\u7B5B\u9009\u4E0E\u5217\u8868",
    "sessions.searchPlaceholder": "\u6309\u6807\u9898 / \u6700\u8FD1\u56DE\u590D / \u547D\u4EE4\u641C\u7D22",
    "sessions.showing": "\u663E\u793A {visible} / {total}",
    "sessions.clearFilters": "\u6E05\u7A7A\u7B5B\u9009",
    "sessions.projectMeta": "\u9879\u76EE: {value}",
    "sessions.lastEventMeta": "\u6700\u8FD1\u4E8B\u4EF6: {value}",
    "sessions.eventCount": ({ count }) => `\u4E8B\u4EF6 ${count}`,
    "sessions.threadReady": "\u7EBF\u7A0B\u5DF2\u5EFA\u7ACB",
    "sessions.threadMissing": "\u7EBF\u7A0B\u672A\u5EFA\u7ACB",
    "sessions.pendingApproval": "\u5F85\u5BA1\u6279",
    "sessions.emptyFiltered": "\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u4E0B\u6CA1\u6709\u4F1A\u8BDD\u3002",
    "sessions.pageRange": "\u7B2C {start}-{end} \u6761\uFF0C\u5171 {total} \u6761",
    "sessions.pageIndex": "\u7B2C {page} / {total} \u9875",
    "sessions.pagePrev": "\u4E0A\u4E00\u9875",
    "sessions.pageNext": "\u4E0B\u4E00\u9875",
    "sessions.pendingApprovalTitle": "\u5F85\u5BA1\u6279",
    "sessions.lastCommandTitle": "\u6700\u8FD1\u547D\u4EE4",
    "sessions.lastReplyTitle": "\u6700\u8FD1\u56DE\u590D",
    "sessions.statusAll": ({ count }) => `\u5168\u90E8\u72B6\u6001 (${count})`,
    "sessions.projectAll": ({ count }) => `\u5168\u90E8\u9879\u76EE (${count})`,
    "sessions.threadAll": "\u5168\u90E8\u7EBF\u7A0B",
    "sessions.threadReadyFilter": "\u7EBF\u7A0B\u5DF2\u5EFA\u7ACB",
    "sessions.threadMissingFilter": "\u7EBF\u7A0B\u672A\u5EFA\u7ACB",
    "sessions.sort.activity_desc": "\u6700\u8FD1\u6D3B\u8DC3",
    "sessions.sort.created_desc": "\u6700\u65B0\u521B\u5EFA",
    "sessions.sort.events_desc": "\u4E8B\u4EF6\u6700\u591A",
    "sessions.sort.reply_desc": "\u6700\u8FD1\u6709\u56DE\u590D",
    "session.status.idle": "\u7A7A\u95F2",
    "session.status.starting": "\u542F\u52A8\u4E2D",
    "session.status.running": "\u6267\u884C\u4E2D",
    "session.status.waiting_input": "\u7B49\u5F85\u8F93\u5165",
    "session.status.stopping": "\u505C\u6B62\u4E2D",
    "session.status.completed": "\u5DF2\u5B8C\u6210",
    "session.status.failed": "\u5931\u8D25",
    "session.status.unknown": "\u672A\u77E5\u72B6\u6001",
    "session.host.unsynced": "\u672A\u540C\u6B65\u4E3B\u673A",
    "session.model.unsynced": "\u672A\u540C\u6B65\u6A21\u578B",
    "session.reasoning.unsynced": "\u672A\u540C\u6B65\u63A8\u7406",
    "session.elapsed": "\u4F1A\u8BDD {value}",
    "session.turnElapsed": "\u672C\u8F6E {value}",
    "session.externalRunning": "\u5916\u90E8\u6267\u884C\u4E2D",
    "session.current": "\u5F53\u524D\u4F1A\u8BDD",
    "session.back": "\u8FD4\u56DE",
    "threadStatus.idle": "\u7A7A\u95F2",
    "threadStatus.idleDetail": "\u53EF\u4EE5\u53D1\u9001\u65B0\u6D88\u606F",
    "threadStatus.sending": "\u53D1\u9001\u4E2D",
    "threadStatus.sendingDetail": "\u6B63\u5728\u628A\u6D88\u606F\u9001\u5230\u5B98\u65B9 Codex",
    "threadStatus.delivered": "\u5DF2\u9001\u8FBE\u5B98\u65B9 Codex",
    "threadStatus.deliveredDetail": "\u7B49\u5F85\u5B98\u65B9 Codex \u5F00\u59CB\u5904\u7406",
    "threadStatus.processing": "\u6B63\u5728\u5904\u7406",
    "threadStatus.waitingUpdate": "\u7B49\u5F85\u5B98\u65B9 Codex \u66F4\u65B0\u4E8B\u4EF6",
    "threadStatus.thinking": "\u6B63\u5728\u601D\u8003",
    "threadStatus.thinkingDetail": "Codex \u6B63\u5728\u63A8\u7406",
    "threadStatus.runningCommand": "\u6B63\u5728\u8FD0\u884C\u547D\u4EE4",
    "threadStatus.editingFiles": "\u6B63\u5728\u4FEE\u6539\u6587\u4EF6",
    "threadStatus.editingFilesDetail": "Codex \u6B63\u5728\u5E94\u7528\u6587\u4EF6\u6539\u52A8",
    "threadStatus.waitingApproval": "\u7B49\u5F85\u786E\u8BA4",
    "threadStatus.waitingApprovalDetail": "\u9700\u8981\u5728\u5B98\u65B9 Codex \u4E2D\u786E\u8BA4",
    "threadStatus.completed": "\u5DF2\u5B8C\u6210",
    "threadStatus.completedDetail": "\u672C\u8F6E\u4EFB\u52A1\u5DF2\u7ECF\u5B8C\u6210",
    "threadStatus.failed": "\u51FA\u9519",
    "threadStatus.failedDetail": "\u672C\u8F6E\u4EFB\u52A1\u51FA\u73B0\u9519\u8BEF",
    "completionNotice.title": "Codex \u5DF2\u5B8C\u6210",
    "completionNotice.detail": "{title} \u7684\u672C\u8F6E\u4EFB\u52A1\u5DF2\u7ED3\u675F",
    "completionActions.view": "\u67E5\u770B\u7ED3\u679C",
    "completionActions.read": "\u6717\u8BFB",
    "completionActions.pauseRead": "\u6682\u505C\u6717\u8BFB",
    "completionActions.resumeRead": "\u7EE7\u7EED\u6717\u8BFB",
    "completionActions.readingControl": "\u6717\u8BFB\u63A7\u5236",
    "completionActions.moveReadControl": "\u79FB\u52A8\u6717\u8BFB\u63A7\u5236",
    "completionActions.stopRead": "\u505C\u6B62\u6717\u8BFB",
    "completionActions.copy": "\u590D\u5236\u7ED3\u679C",
    "completionActions.summarize": "\u603B\u7ED3\u672C\u8F6E",
    "completionActions.continue": "\u7EE7\u7EED\u4E0B\u4E00\u6B65",
    "completionActions.options": "\u9009\u9879",
    "completionActions.settings": "\u5F53\u524D\u7EBF\u7A0B\u8BBE\u7F6E",
    "completionActions.stopAutoContinue": "\u505C\u6B62\u81EA\u52A8\u7EE7\u7EED",
    "completionActions.settingShowMenu": "\u663E\u793A\u5B8C\u6210\u540E\u83DC\u5355",
    "completionActions.settingAutoRead": "\u5F53\u524D\u7EBF\u7A0B\u81EA\u52A8\u6717\u8BFB",
    "completionActions.settingAutoContinue": "\u5F53\u524D\u7EBF\u7A0B\u81EA\u52A8\u7EE7\u7EED",
    "completionActions.settingMaxRuns": "\u5F53\u524D\u7EBF\u7A0B\u8FDE\u7EED\u6B21\u6570\u4E0A\u9650",
    "completionActions.autoContinueHelp": "\u8FD9\u4E9B\u5F00\u5173\u53EA\u5BF9\u5F53\u524D\u7EBF\u7A0B\u751F\u6548\u3002\u81EA\u52A8\u7EE7\u7EED\u4F1A\u5728\u672C\u7EBF\u7A0B\u4EFB\u52A1\u5B8C\u6210\u540E\u53D1\u9001\u7EE7\u7EED\u6307\u4EE4\uFF1B\u8FBE\u5230\u4E0A\u9650\u3001\u51FA\u9519\u3001\u7B49\u5F85\u786E\u8BA4\u6216\u4EFB\u52A1\u5217\u8868\u5B8C\u6210\u65F6\u4F1A\u505C\u6B62\u3002",
    "completionActions.autoContinueProgress": "\u81EA\u52A8\u7EE7\u7EED\uFF1A{count} / {max}",
    "completionActions.autoSending": "\u6B63\u5728\u81EA\u52A8\u7EE7\u7EED\u4E0B\u4E00\u6B65...",
    "completionActions.autoSent": "\u5DF2\u81EA\u52A8\u53D1\u9001\u7EE7\u7EED\u4E0B\u4E00\u6B65\u3002",
    "completionActions.autoQueued": "\u5DF2\u52A0\u5165\u81EA\u52A8\u4E0B\u4E00\u6B65\u961F\u5217\u3002",
    "completionActions.sending": "\u6B63\u5728\u53D1\u9001...",
    "completionActions.sent": "\u5DF2\u53D1\u9001\u3002",
    "completionActions.waitForIdle": "Codex \u6B63\u5728\u5904\u7406\u5F53\u524D\u4EFB\u52A1\uFF0C\u5B8C\u6210\u540E\u624D\u80FD\u6267\u884C\u8FD9\u4E2A\u64CD\u4F5C\u3002",
    "completionActions.waitForQueue": "\u5DF2\u6709\u6392\u961F\u4EFB\u52A1\uFF0C\u5B8C\u6210\u540E\u52A8\u4F5C\u4F1A\u7B49\u5F85\u961F\u5217\u5148\u6267\u884C\u3002",
    "completionActions.autoStoppedLimit": "\u81EA\u52A8\u7EE7\u7EED\u5DF2\u505C\u6B62\uFF1A\u5DF2\u8FBE\u5230 {count} / {max} \u6B21\u4E0A\u9650\u3002",
    "completionActions.autoStoppedFailure": "\u672C\u8F6E\u4EFB\u52A1\u51FA\u9519\uFF0C\u81EA\u52A8\u7EE7\u7EED\u5DF2\u6682\u505C\u3002",
    "completionActions.autoStoppedApproval": "Codex \u6B63\u5728\u7B49\u5F85\u786E\u8BA4\uFF0C\u81EA\u52A8\u7EE7\u7EED\u5DF2\u6682\u505C\u3002",
    "completionActions.autoStoppedPlanDone": "\u4EFB\u52A1\u5217\u8868\u5DF2\u5B8C\u6210\uFF0C\u81EA\u52A8\u7EE7\u7EED\u5DF2\u505C\u6B62\u3002",
    "completionActions.autoStoppedQueued": "\u624B\u673A\u7AEF\u5DF2\u6709\u6392\u961F\u6D88\u606F\uFF0C\u81EA\u52A8\u7EE7\u7EED\u5DF2\u6682\u505C\u3002",
    "completionActions.autoStoppedByUser": "\u5DF2\u505C\u6B62\u81EA\u52A8\u7EE7\u7EED\u3002",
    "completionActions.noResult": "\u6CA1\u6709\u53EF\u7528\u7684\u7ED3\u679C\u5185\u5BB9\u3002",
    "completionActions.copied": "\u7ED3\u679C\u5DF2\u590D\u5236\u3002",
    "completionActions.speechUnsupported": "\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u6717\u8BFB\u3002",
    "completionActions.readingStarted": "\u5F00\u59CB\u6717\u8BFB\u7ED3\u679C\u3002",
    "completionActions.readingTruncated": "Codex \u5DF2\u5B8C\u6210\u3002\u7ED3\u679C\u8F83\u957F\uFF0C\u5DF2\u4E3A\u4F60\u6717\u8BFB\u5F00\u5934\u90E8\u5206\u3002",
    "completionActions.audioTitle": "\u97F3\u9891\u64AD\u653E\u5668",
    "completionActions.audioHelp": "\u7531 Windows \u672C\u673A\u8BED\u97F3\u751F\u6210\u97F3\u9891\uFF0C\u624B\u673A\u7AEF\u7528\u64AD\u653E\u5668\u64AD\u653E\u3002",
    "completionActions.generateAudio": "\u751F\u6210\u97F3\u9891",
    "completionActions.audioGenerating": "\u6B63\u5728\u751F\u6210\u97F3\u9891...",
    "completionActions.audioGeneratingShort": "\u751F\u6210\u4E2D...",
    "completionActions.audioReady": "\u97F3\u9891\u5DF2\u751F\u6210\uFF0C\u53EF\u4EE5\u64AD\u653E\u3002",
    "completionActions.audioReadyCached": "\u5DF2\u4F7F\u7528\u7F13\u5B58\u97F3\u9891\uFF0C\u53EF\u4EE5\u64AD\u653E\u3002",
    "completionActions.audioReadyTapToPlay": "\u97F3\u9891\u5DF2\u5C31\u7EEA\uFF0C\u70B9\u51FB\u58F0\u97F3\u6309\u94AE\u64AD\u653E\u3002",
    "completionActions.audioTapToPlay": "\u8BF7\u70B9\u51FB\u58F0\u97F3\u6309\u94AE\u5F00\u59CB\u64AD\u653E\u3002",
    "completionActions.audioFailed": "\u97F3\u9891\u751F\u6210\u5931\u8D25\u3002",
    "completionActions.autoReadFailed": "\u81EA\u52A8\u6717\u8BFB\u672A\u542F\u52A8\uFF0C\u8BF7\u70B9\u201C\u6717\u8BFB\u201D\u91CD\u8BD5\u3002",
    "completionActions.clearAudio": "\u79FB\u9664\u97F3\u9891",
    "taskPlan.title": "\u5F53\u524D\u4EFB\u52A1",
    "taskPlan.current": "\u6B63\u5728\u8FDB\u884C\uFF1A{task}",
    "taskPlan.allDone": "\u4EFB\u52A1\u5DF2\u5168\u90E8\u5B8C\u6210",
    "taskPlan.progress": "{completed} / {total} \u5DF2\u5B8C\u6210",
    "taskPlan.status.pending": "\u5F85\u5904\u7406",
    "taskPlan.status.inProgress": "\u8FDB\u884C\u4E2D",
    "taskPlan.status.completed": "\u5DF2\u5B8C\u6210",
    "inspect.selectionTitle": "\u8F85\u52A9\u4FE1\u606F",
    "inspect.close": "\u5173\u95ED",
    "inspect.searchFlow": "\u641C\u7D22\u6267\u884C\u6D41",
    "inspect.searchPlaceholder": "\u6309\u547D\u4EE4\u3001\u62A5\u9519\u3001\u56DE\u590D\u5185\u5BB9\u641C\u7D22",
    "inspect.searchPrev": "\u4E0A\u4E00\u6761",
    "inspect.searchNext": "\u4E0B\u4E00\u6761",
    "inspect.clearSearch": "\u6E05\u7A7A",
    "inspect.results": "\u7ED3\u679C",
    "inspect.resultCount": ({ count }) => `${count} \u6761`,
    "inspect.resultCountMatches": ({ count }) => `${count} \u5904\u547D\u4E2D`,
    "inspect.emptySearch": "\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u4E0B\u6CA1\u6709\u641C\u7D22\u7ED3\u679C\u3002",
    "inspect.rawEventsEmpty": "\u5F53\u524D\u6CA1\u6709\u539F\u59CB\u4E8B\u4EF6\u3002",
    "inspect.hint.permissionsDenied": "\u5F53\u524D\u547D\u4EE4\u89E6\u53D1\u4E86\u7CFB\u7EDF\u6743\u9650\u62D2\u7EDD\uFF0C\u76EE\u6807\u76EE\u5F55\u53EF\u80FD\u4E0D\u5728 writable workspace \u5185\u3002",
    "inspect.hint.readOnly": "\u5F53\u524D\u8FD0\u884C\u73AF\u5883\u5305\u542B read-only \u9650\u5236\uFF0C\u6240\u4EE5\u5199\u64CD\u4F5C\u4F1A\u76F4\u63A5\u5931\u8D25\u3002",
    "inspect.hint.workspaceWrite": "\u5F53\u524D\u8FD0\u884C\u73AF\u5883\u5904\u4E8E workspace-write \u6A21\u5F0F\uFF0C\u53EA\u80FD\u5199\u5165\u5F53\u524D\u53EF\u5199\u6839\u76EE\u5F55\u3002",
    "inspect.hint.noInteractiveApproval": "\u5F53\u524D {mode} \u8FD0\u884C\u94FE\u8DEF\u4E0D\u652F\u6301\u4EA4\u4E92\u5BA1\u6279\u5F39\u7A97\u3002",
    "inspect.hint.workspaceRoot": "\u5F53\u524D workspace root \u662F {path}\u3002",
    "inspect.hint.sandboxApproval": "\u8FD9\u6B21\u5931\u8D25\u548C\u5F53\u524D sandbox / approval \u914D\u7F6E\u6709\u5173\u3002",
    "inspect.session": "\u4F1A\u8BDD",
    "inspect.project": "\u9879\u76EE",
    "inspect.projectDirectory": "\u9879\u76EE\u76EE\u5F55",
    "inspect.currentCwd": "\u5F53\u524D\u76EE\u5F55",
    "inspect.executionPath": "\u6267\u884C\u94FE\u8DEF",
    "inspect.workspaceRoot": "\u5DE5\u4F5C\u533A\u6839\u76EE\u5F55",
    "inspect.writableRoots": "\u53EF\u5199\u6839\u76EE\u5F55",
    "inspect.pid": "PID",
    "inspect.thread": "\u7EBF\u7A0B",
    "inspect.runtimeHints": "\u9650\u5236\u8BF4\u660E",
    "inspect.fetchHistory": "\u8865\u62C9\u5386\u53F2",
    "inspect.followBottom": "\u56DE\u5230\u5E95\u90E8\u5E76\u8DDF\u968F",
    "inspect.autoScroll": "\u81EA\u52A8\u6EDA\u52A8\uFF1A{value}",
    "inspect.rawEventsDebug": "\u539F\u59CB\u4E8B\u4EF6 / \u8C03\u8BD5\u4FE1\u606F",
    "inspect.emptySelection": "\u9009\u62E9\u4E00\u4E2A\u4EFB\u52A1\u540E\uFF0C\u8FD9\u91CC\u4F1A\u5C55\u793A\u8FD9\u4E00\u8F6E\u7684\u8F93\u5165\u3001\u6267\u884C\u8FC7\u7A0B\u548C\u6700\u7EC8\u7ED3\u679C\u3002",
    "inspect.detailTitle": "\u672C\u8F6E\u8BE6\u60C5",
    "inspect.userInput": "\u7528\u6237\u8F93\u5165",
    "inspect.executionDetails": "\u6267\u884C\u8BE6\u60C5",
    "inspect.assistantReply": "Assistant \u56DE\u590D",
    "inspect.rawStdout": "CLI \u539F\u59CB\u8F93\u51FA",
    "inspect.output": "\u8F93\u51FA",
    "inspect.viewOutputDetails": "\u67E5\u770B\u8F93\u51FA\u8BE6\u60C5",
    "inspect.viewFullCommandOutput": "\u67E5\u770B\u5B8C\u6574\u547D\u4EE4\u4E0E\u8F93\u51FA",
    "inspect.commandStillRunning": "\u547D\u4EE4\u4ECD\u5728\u6267\u884C\uFF0C\u8F93\u51FA\u4F1A\u6301\u7EED\u8FFD\u52A0\u3002",
    "inspect.commandEndedWithErrors": "\u547D\u4EE4\u5DF2\u7ED3\u675F\uFF0C\u5E76\u4EA7\u751F\u9519\u8BEF\u8F93\u51FA\u3002",
    "inspect.commandCompletedExpand": "\u547D\u4EE4\u5DF2\u5B8C\u6210\uFF0C\u5C55\u5F00\u540E\u53EF\u67E5\u770B\u5B8C\u6574\u8F93\u51FA\u3002",
    "inspect.commandCompletedNoOutput": "\u547D\u4EE4\u5DF2\u5B8C\u6210\uFF0C\u6CA1\u6709\u989D\u5916\u8F93\u51FA\u3002",
    "inspect.executionSteps": "\u6267\u884C\u6B65\u9AA4",
    "inspect.viewRawEvents": "\u67E5\u770B\u539F\u59CB\u4E8B\u4EF6",
    "inspect.copyCommand": "\u590D\u5236\u547D\u4EE4",
    "inspect.commandMetrics": "\u547D\u4EE4\u6307\u6807",
    "inspect.commandOutput": "\u8FD0\u884C\u8F93\u51FA",
    "inspect.copyFailed": "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u3002",
    "inspect.copied": "\u5DF2\u590D\u5236",
    "inspect.tool": "\u5DE5\u5177",
    "inspect.userKind": "\u7528\u6237",
    "inspect.statusKind": "\u72B6\u6001",
    "inspect.commandUnknown": "\u672A\u8BC6\u522B\u547D\u4EE4",
    "inspect.systemNotice": "\u7CFB\u7EDF\u63D0\u793A",
    "inspect.running": "\u8FD0\u884C\u4E2D",
    "inspect.error": "\u5F02\u5E38",
    "inspect.warning": "Warning",
    "inspect.completed": "\u5DF2\u5B8C\u6210",
    "inspect.stderr": "Stderr",
    "inspect.duration": "\u8017\u65F6",
    "inspect.problemCommand": "\u5F02\u5E38\u547D\u4EE4",
    "inspect.longRunning": "\u8FD0\u884C\u8F83\u4E45",
    "inspect.slowCommand": "\u6162\u547D\u4EE4",
    "inspect.noOutput": "\u65E0\u8F93\u51FA",
    "inspect.noOutputYetShort": "\u6682\u65E0\u8F93\u51FA",
    "inspect.processExit": "\u8FDB\u7A0B\u9000\u51FA",
    "inspect.statusChange": "\u72B6\u6001\u5207\u6362",
    "inspect.filter.all": "\u5168\u90E8",
    "inspect.filter.assistant": "Assistant",
    "inspect.filter.command": "\u5DE5\u5177 / \u547D\u4EE4",
    "inspect.filter.system": "System",
    "inspect.severity.all": "\u5168\u90E8\u7EA7\u522B",
    "approval.required": "\u9700\u8981\u6388\u6743",
    "approval.commandRequired": "\u547D\u4EE4\u6267\u884C\u9700\u8981\u6388\u6743",
    "approval.fileChangeRequired": "\u6587\u4EF6\u4FEE\u6539\u9700\u8981\u6388\u6743",
    "approval.extraPermissionRequired": "\u989D\u5916\u6743\u9650\u9700\u8981\u6388\u6743",
    "approval.pending": "\u5F85\u786E\u8BA4",
    "approval.restore": "\u9700\u91CD\u65B0\u53D1\u8D77",
    "approval.continueHint": "\u8FD9\u4E00\u6B65\u9700\u8981\u4F60\u7684\u786E\u8BA4\u540E\u624D\u80FD\u7EE7\u7EED\u6267\u884C\u3002",
    "approval.restoreHint": "\u8FD9\u6761\u6388\u6743\u8BF7\u6C42\u662F\u4ECE\u5386\u53F2\u4E8B\u4EF6\u6062\u590D\u7684\uFF0C\u5F53\u524D\u8FD0\u884C\u5DF2\u7ECF\u7ED3\u675F\u3002\u8BF7\u91CD\u65B0\u53D1\u9001\u8FD9\u8F6E\u4EFB\u52A1\u4EE5\u518D\u6B21\u53D1\u8D77\u6388\u6743\u3002",
    "approval.retryAction": "\u91CD\u65B0\u53D1\u8D77\u6388\u6743",
    "approval.deny": "\u62D2\u7EDD",
    "approval.allowOnce": "\u5141\u8BB8\u4E00\u6B21",
    "approval.allowForTurn": "\u672C\u8F6E\u5141\u8BB8",
    "approval.pathInWritable": "\u76EE\u6807\u8DEF\u5F84 {targetPath} \u5DF2\u5728\u5F53\u524D\u53EF\u5199\u8303\u56F4\u5185\uFF0C\u8FD9\u6B21\u6388\u6743\u7528\u4E8E\u7EE7\u7EED\u6267\u884C\u654F\u611F\u64CD\u4F5C\u3002",
    "approval.pathOutsideWorkspace": "\u76EE\u6807\u8DEF\u5F84 {targetPath} \u4E0D\u5728\u5F53\u524D workspace root {workspaceRoot} \u5185\uFF0C\u6240\u4EE5\u9700\u8981\u6388\u6743\u3002",
    "approval.pathOutsideWritable": "\u76EE\u6807\u8DEF\u5F84 {targetPath} \u4E0D\u5728\u5F53\u524D\u53EF\u5199\u8303\u56F4\u5185\uFF0C\u6240\u4EE5\u9700\u8981\u6388\u6743\u3002",
    "composer.reasoning.low": "\u4F4E",
    "composer.reasoning.medium": "\u4E2D",
    "composer.reasoning.high": "\u9AD8",
    "composer.reasoning.xhigh": "\u8D85\u9AD8",
    "composer.model.noOverride": "\u4E0D\u4FEE\u6539\u6A21\u578B",
    "composer.reasoning.noOverride": "\u4E0D\u4FEE\u6539\u5F3A\u5EA6",
    "composer.slashMenu": "\u659C\u6760\u547D\u4EE4",
    "composer.slashLoading": "\u6B63\u5728\u52A0\u8F7D\u547D\u4EE4...",
    "composer.slashEmpty": "\u6CA1\u6709\u5339\u914D\u7684\u547D\u4EE4",
    "composer.quota.remaining": "\u5269\u4F59\u989D\u5EA6",
    "composer.quota.hours": "5 \u5C0F\u65F6 {percent} {remain}",
    "composer.quota.week": "1 \u5468 {percent} {reset}",
    "composer.environment": "\u73AF\u5883\u5165\u53E3",
    "composer.unsynced": "\u672A\u540C\u6B65",
    "composer.placeholder": "\u7A7A\u95F2\u4E2D\uFF0C\u7B49\u5F85\u8F93\u5165",
    "composer.syncingHint": "\u6B63\u5728\u540C\u6B65\u6700\u65B0\u72B6\u6001\uFF0C\u8BF7\u7A0D\u5019...",
    "composer.aria.message": "\u53D1\u6D88\u606F\u7ED9 Codex",
    "composer.aria.model": "\u6A21\u578B",
    "composer.aria.reasoning": "\u5F3A\u5EA6",
    "composer.aria.stop": "\u505C\u6B62\u5F53\u524D\u4EFB\u52A1",
    "composer.aria.stopping": "\u6B63\u5728\u505C\u6B62\u5F53\u524D\u4EFB\u52A1",
    "composer.aria.clearBusy": "\u6E05\u9664\u5361\u4F4F\u72B6\u6001",
    "composer.aria.send": "\u53D1\u9001",
    "composer.aria.queue": "\u6392\u961F\u5230\u4E0B\u4E00\u8F6E",
    "composer.aria.steer": "Steer \u5F53\u524D\u4EFB\u52A1",
    "composer.aria.sending": "\u6B63\u5728\u53D1\u9001",
    "composer.sending": "\u6B63\u5728\u53D1\u9001...",
    "composer.steered": "Steer \u6D88\u606F\u5DF2\u53D1\u9001\u3002",
    "composer.steerNeedsBusy": "\u53EA\u6709 Codex \u6B63\u5728\u6267\u884C\u65F6\u624D\u80FD Steer\u3002",
    "composer.stopping": "\u6B63\u5728\u505C\u6B62...",
    "composer.stopConfirm": "\u786E\u5B9A\u8981\u505C\u6B62\u5F53\u524D Codex \u4EFB\u52A1\u5417\uFF1F",
    "composer.sendFailed": "\u53D1\u9001\u5931\u8D25",
    "composer.stopRequested": "\u5DF2\u5411\u5B98\u65B9 Codex \u53D1\u9001\u505C\u6B62\u8BF7\u6C42\u3002",
    "composer.clearBusyDone": "\u5B98\u65B9 Codex \u505C\u6B62\u5931\u8D25\uFF1BSyncodex \u53EA\u6E05\u9664\u4E86\u672C\u5730\u5FD9\u788C\u72B6\u6001\u3002",
    "composer.busyHint": "",
    "composer.queueHint": "Codex \u6B63\u5728\u5904\u7406\u5F53\u524D\u4EFB\u52A1\uFF0C\u53D1\u9001\u4F1A\u8FDB\u5165\u5B98\u65B9 Codex \u961F\u5217\u3002",
    "composer.queued": ({ count }) => count === 1 ? "\u5DF2\u6392\u961F\u5230\u4E0B\u4E00\u8F6E" : `\u5DF2\u6392\u961F ${count} \u6761\u5230\u4E0B\u4E00\u8F6E`,
    "composer.queueSending": "\u6B63\u5728\u53D1\u9001\u6392\u961F\u6D88\u606F...",
    "composer.queueSent": "\u6392\u961F\u6D88\u606F\u5DF2\u53D1\u9001\u3002",
    "composer.officialQueued": ({ count }) => `\u5B98\u65B9 Codex \u961F\u5217\u4E2D\u8FD8\u6709 ${count} \u6761\u3002`,
    "composer.queueAfterOfficial": ({ official, local }) => `\u5B98\u65B9 Codex \u961F\u5217 ${official} \u6761\uFF0C\u65E7\u672C\u5730\u961F\u5217 ${local} \u6761\u3002`,
    "composer.attachments.title": "\u9644\u4EF6",
    "composer.attachments.add": "\u6DFB\u52A0\u6587\u4EF6\u6216\u56FE\u7247",
    "composer.attachments.remove": "\u79FB\u9664\u9644\u4EF6",
    "composer.attachments.uploading": "\u6B63\u5728\u4E0A\u4F20\u9644\u4EF6...",
    "composer.attachments.uploadingShort": "\u4E0A\u4F20\u4E2D",
    "composer.attachments.failed": "\u9644\u4EF6\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u79FB\u9664\u540E\u91CD\u8BD5\u3002",
    "composer.attachments.failedShort": "\u5931\u8D25",
    "composer.attachments.added": ({ count }) => `\u5DF2\u6DFB\u52A0 ${count} \u4E2A\u9644\u4EF6\u3002`,
    "composer.attachments.tooMany": ({ count }) => `\u6700\u591A\u53EA\u80FD\u6DFB\u52A0 ${count} \u4E2A\u9644\u4EF6\u3002`,
    "composer.attachments.tooLarge": ({ name }) => `\u9644\u4EF6\u8FC7\u5927\uFF1A${name}`,
    "composer.attachments.totalTooLarge": "\u9644\u4EF6\u603B\u5927\u5C0F\u8FC7\u5927\u3002",
    "composer.attachments.pasting": "\u6B63\u5728\u7C98\u8D34\u56FE\u7247...",
    "composer.attachments.pasteFailed": "\u65E0\u6CD5\u8BFB\u53D6\u526A\u8D34\u677F\u56FE\u7247\uFF0C\u8BF7\u4FDD\u5B58\u540E\u7528\u9644\u4EF6\u6309\u94AE\u9009\u62E9\u3002",
    "queue.title": "\u4EFB\u52A1\u961F\u5217",
    "queue.summary": ({ official, local, total }) => `\u5171 ${total} \u6761\uFF1A\u5B98\u65B9 ${official} \u6761\uFF0C\u65E7\u672C\u5730 ${local} \u6761\u3002\u5B98\u65B9 Codex \u961F\u5217\u662F\u552F\u4E00\u6267\u884C\u6E90\u3002`,
    "queue.originOfficial": "\u5B98\u65B9 Codex",
    "queue.originSyncodex": "\u65E7\u672C\u5730",
    "queue.originAutoContinue": "\u81EA\u52A8\u4E0B\u4E00\u6B65",
    "queue.createdAgo": ({ value }) => `${value} \u524D\u52A0\u5165`,
    "queue.actions": "\u961F\u5217\u64CD\u4F5C",
    "queue.openActions": "\u6253\u5F00\u961F\u5217\u64CD\u4F5C",
    "queue.edit": "\u7F16\u8F91",
    "queue.edited": "\u5DF2\u66F4\u65B0\u961F\u5217\u4EFB\u52A1",
    "queue.removed": "\u5DF2\u5220\u9664\u961F\u5217\u4EFB\u52A1",
    "queue.movedToFront": "\u5DF2\u79FB\u5230\u6700\u524D",
    "queue.editLocal": "\u7F16\u8F91",
    "queue.editPrompt": "\u7F16\u8F91\u8FD9\u6761\u672C\u5730\u961F\u5217\u4EFB\u52A1",
    "queue.editedLocal": "\u5DF2\u66F4\u65B0\u672C\u5730\u961F\u5217\u4EFB\u52A1",
    "queue.removeLocal": "\u5220\u9664\u8FD9\u6761\u672C\u5730\u961F\u5217\u4EFB\u52A1",
    "queue.removeLocalShort": "\u5220\u9664",
    "queue.removedLocal": "\u5DF2\u5220\u9664\u672C\u5730\u961F\u5217\u4EFB\u52A1",
    "queue.moveLocalToFront": "\u79FB\u5230\u6700\u524D",
    "queue.movedLocalToFront": "\u5DF2\u79FB\u5230\u672C\u5730\u961F\u5217\u6700\u524D",
    "queue.badgeOfficial": ({ count }) => `\u5B98\u65B9 Codex \u961F\u5217 ${count} \u6761`,
    "queue.badgeSyncodex": ({ count }) => `Syncodex \u672C\u5730\u961F\u5217 ${count} \u6761`,
    "queue.badgeShortOfficial": ({ count }) => `\u5B98 ${count}`,
    "queue.badgeShortSyncodex": ({ count }) => `\u672C ${count}`,
    "timeline.empty": "\u8FD8\u6CA1\u6709\u5BF9\u8BDD\u3002",
    "timeline.userMessage": "\u7528\u6237\u6D88\u606F",
    "timeline.assistantCommentary": "\u8FC7\u7A0B\u8BF4\u660E",
    "timeline.assistant": "\u52A9\u624B\u6D88\u606F",
    "timeline.thinking": "\u601D\u8003\u4E2D...",
    "timeline.command": "\u547D\u4EE4",
    "timeline.commandStreaming": "\u547D\u4EE4\u8F93\u51FA\u6301\u7EED\u66F4\u65B0\u4E2D...",
    "timeline.patch": "\u5DF2\u7F16\u8F91\u6587\u4EF6",
    "timeline.patchStreaming": "\u8865\u4E01\u8F93\u51FA\u6301\u7EED\u66F4\u65B0\u4E2D...",
    "timeline.activitySummary": "\u6D3B\u52A8\u6458\u8981",
    "timeline.fileChanges": "\u5DF2\u7F16\u8F91\u7684\u6587\u4EF6",
    "timeline.file.untitled": "\u672A\u547D\u540D\u6587\u4EF6",
    "timeline.summary.moreItems": "\u7B49 {count} \u9879",
    "timeline.summary.moreFiles": "\u7B49 {count} \u4E2A\u6587\u4EF6",
    "timeline.summary.moreLocations": "\u7B49 {count} \u4E2A\u4F4D\u7F6E",
    "timeline.summary.searchAt": "\u641C\u7D22\u4E8E {value}",
    "timeline.summary.activities": "{count} \u4E2A\u6D3B\u52A8",
    "timeline.system": "\u7CFB\u7EDF",
    "timeline.jumpToBottom": "\u56DE\u5230\u5E95\u90E8",
    "timeline.validation.completed": ({ count }) => count > 1 ? `\u5DF2\u9A8C\u8BC1 ${count} \u9879` : "\u5DF2\u9A8C\u8BC1",
    "timeline.search.completed": ({ count }) => count > 1 ? `\u5DF2\u641C\u7D22 ${count} \u9879` : "\u5DF2\u641C\u7D22",
    "timeline.browse.completed": ({ count }) => count > 1 ? `\u5DF2\u6D4F\u89C8 ${count} \u4E2A\u6587\u4EF6` : "\u5DF2\u6D4F\u89C8\u6587\u4EF6",
    "timeline.edit.completed": ({ count }) => count > 1 ? `\u5DF2\u7F16\u8F91 ${count} \u4E2A\u6587\u4EF6` : "\u5DF2\u7F16\u8F91\u6587\u4EF6",
    "timeline.executedActivities": ({ count }) => `\u5DF2\u6267\u884C ${count} \u4E2A\u6D3B\u52A8`,
    "activity.search": "\u641C\u7D22",
    "activity.browse.single": "\u5DF2\u67E5\u770B 1 \u4E2A\u6587\u4EF6",
    "activity.browse.multiple": "\u5DF2\u67E5\u770B {count} \u4E2A\u6587\u4EF6",
    "activity.edit.single": "\u5DF2\u7F16\u8F91\u7684\u6587\u4EF6",
    "activity.edit.multiple": "\u5DF2\u7F16\u8F91 {count} \u4E2A\u6587\u4EF6",
    "activity.validation.completed": "\u5DF2\u9A8C\u8BC1",
    "activity.running.edit": "\u6B63\u5728\u7F16\u8F91\u6587\u4EF6",
    "activity.failed.edit": "\u7F16\u8F91\u6587\u4EF6\u5931\u8D25",
    "activity.completed.edit": "\u5DF2\u7F16\u8F91\u6587\u4EF6",
    "activity.running.search": "\u6B63\u5728\u641C\u7D22",
    "activity.failed.search": "\u641C\u7D22\u5931\u8D25",
    "activity.completed.search": "\u5DF2\u641C\u7D22",
    "activity.running.browse": "\u6B63\u5728\u67E5\u770B\u6587\u4EF6",
    "activity.failed.browse": "\u67E5\u770B\u6587\u4EF6\u5931\u8D25",
    "activity.completed.browse": "\u5DF2\u6D4F\u89C8\u6587\u4EF6",
    "activity.running.validation": "\u6B63\u5728\u6821\u9A8C",
    "activity.failed.validation": "\u6821\u9A8C\u5931\u8D25",
    "activity.completed.validation": "\u5DF2\u9A8C\u8BC1",
    "activity.running.git": "\u6B63\u5728\u6267\u884C Git \u64CD\u4F5C",
    "activity.failed.git": "Git \u64CD\u4F5C\u5931\u8D25",
    "activity.completed.git": "\u5DF2\u6267\u884C Git \u64CD\u4F5C",
    "activity.running.run": "\u6B63\u5728\u6267\u884C\u547D\u4EE4",
    "activity.failed.run": "\u547D\u4EE4\u6267\u884C\u5931\u8D25",
    "activity.completed.run": "\u5DF2\u6267\u884C\u547D\u4EE4",
    "task.commandExecuted": "\u5DF2\u6267\u884C {label}",
    "task.commandRunning": "\u6B63\u5728\u6267\u884C {label}",
    "task.commandFailed": "\u6267\u884C\u5931\u8D25 {label}",
    "task.processing": "\u6B63\u5728\u5904\u7406",
    "task.empty": "\u6682\u65E0\u53EF\u5C55\u793A\u7684\u6267\u884C\u8FC7\u7A0B\u3002",
    "command.outputCount": ({ count }) => `\u8F93\u51FA ${count} \u6761`,
    "command.stdoutCount": ({ count }) => `stdout ${count} \u6761`,
    "command.stderrCount": ({ count }) => `stderr ${count} \u6761`,
    "command.elapsedLabel": "\u8017\u65F6 {value}",
    "command.runningForLabel": "\u5DF2\u8FD0\u884C {value}",
    "command.summary.running": "\u547D\u4EE4\u6267\u884C\u4E2D...",
    "command.summary.completed": "\u547D\u4EE4\u5DF2\u5B8C\u6210\u3002",
    "command.summary.failedExpand": "\u547D\u4EE4\u6267\u884C\u5931\u8D25\uFF0C\u5C55\u5F00\u53EF\u67E5\u770B\u5B8C\u6574\u8F93\u51FA\u3002",
    "command.summary.completedWithStderr": "\u547D\u4EE4\u5DF2\u5B8C\u6210\uFF0C\u4F46\u5305\u542B\u9519\u8BEF\u8F93\u51FA\u3002",
    "command.summary.completedExpand": "\u547D\u4EE4\u5DF2\u5B8C\u6210\uFF0C\u5C55\u5F00\u53EF\u67E5\u770B\u5B8C\u6574\u8F93\u51FA\u3002",
    "runtime.low": "\u4F4E",
    "runtime.medium": "\u4E2D",
    "runtime.high": "\u9AD8",
    "runtime.xhigh": "\u8D85\u9AD8",
    "generic.close": "\u5173\u95ED",
    "generic.back": "\u8FD4\u56DE",
    "generic.refresh": "\u5237\u65B0",
    "generic.online": "\u5728\u7EBF",
    "generic.search": "\u641C\u7D22",
    "generic.project": "\u9879\u76EE",
    "generic.status": "\u72B6\u6001",
    "generic.sort": "\u6392\u5E8F",
    "generic.keyword": "\u5173\u952E\u8BCD",
    "generic.clear": "\u6E05\u7A7A",
    "generic.copy": "\u590D\u5236",
    "generic.expand": "\u5C55\u5F00",
    "generic.collapse": "\u6536\u8D77",
    "generic.type": "\u7C7B\u578B",
    "generic.level": "\u7EA7\u522B",
    "generic.on": "\u5F00",
    "generic.off": "\u5173",
    "generic.notSynced": "\u672A\u540C\u6B65",
    "generic.notStarted": "\u672A\u542F\u52A8",
    "generic.notEstablished": "\u672A\u5EFA\u7ACB",
    "generic.showing": "\u663E\u793A {visible} / {total}",
    "generic.segmentCount": ({ count }) => `${count} \u6BB5`,
    "generic.noExtraOutput": "\u65E0\u989D\u5916\u8F93\u51FA\u3002",
    "generic.noOutputYet": "\u8FD9\u6761\u547D\u4EE4\u8FD8\u6CA1\u6709\u8F93\u51FA\u3002",
    "generic.unknown": "\u672A\u77E5",
    "generic.none": "\u6682\u65E0",
    "composer.slashUnavailable": "\u5F53\u524D\u547D\u4EE4\u6682\u65F6\u4E0D\u53EF\u7528\u3002",
    "composer.slashExecuted": "{slash} \u5DF2\u6267\u884C\u3002"
  };

  // package/web/i18n/locales/zh-Hant.js
  var zh_Hant_default = __spreadProps(__spreadValues({}, en_default), {
    "nav.projects": "\u5C08\u6848",
    "nav.sessions": "\u6703\u8A71",
    "workspace.openSidebar": "\u6253\u958B\u6703\u8A71\u5074\u6B04",
    "workspace.closeSidebar": "\u6536\u8D77\u6703\u8A71\u5074\u6B04",
    "workspace.empty.eyebrow": "\u6703\u8A71\u5DE5\u4F5C\u5340",
    "workspace.empty.title": "\u9078\u64C7\u4E00\u500B\u6703\u8A71\u958B\u59CB\u5DE5\u4F5C",
    "workspace.empty.subtitle": "\u5F9E\u5074\u6B04\u5207\u63DB\u6703\u8A71\uFF0C\u6216\u76F4\u63A5\u65B0\u5EFA / \u532F\u5165\u4E00\u500B\u6703\u8A71\u3002",
    "workspace.empty.newSession": "\u65B0\u5EFA\u6703\u8A71",
    "workspace.empty.importCodex": "\u532F\u5165 Codex \u6703\u8A71",
    "workspace.sidebar.import": "\u532F\u5165 Codex",
    "workspace.sidebar.newSession": "+ \u65B0\u5EFA\u6703\u8A71",
    "workspace.sidebar.empty": "\u76EE\u524D\u7BE9\u9078\u689D\u4EF6\u4E0B\u6C92\u6709\u6703\u8A71\u3002",
    "workspace.session.untitled": "\u672A\u547D\u540D\u6703\u8A71",
    "workspace.loading.session": "\u6B63\u5728\u8F09\u5165\u6703\u8A71\u5167\u5BB9...",
    "workspace.loading.projects": "\u6B63\u5728\u8F09\u5165\u5C08\u6848\u5217\u8868...",
    "workspace.loading.sessions": "\u6B63\u5728\u8F09\u5165\u6703\u8A71\u5217\u8868...",
    "session.status.idle": "\u7A7A\u9592",
    "session.status.starting": "\u555F\u52D5\u4E2D",
    "session.status.running": "\u57F7\u884C\u4E2D",
    "session.status.waiting_input": "\u7B49\u5F85\u8F38\u5165",
    "session.status.stopping": "\u505C\u6B62\u4E2D",
    "session.status.completed": "\u5DF2\u5B8C\u6210",
    "session.status.failed": "\u5931\u6557",
    "session.current": "\u76EE\u524D\u6703\u8A71",
    "approval.required": "\u9700\u8981\u6388\u6B0A",
    "approval.pending": "\u5F85\u78BA\u8A8D",
    "approval.restore": "\u9700\u91CD\u65B0\u767C\u8D77",
    "approval.deny": "\u62D2\u7D55",
    "approval.allowOnce": "\u5141\u8A31\u4E00\u6B21",
    "approval.allowForTurn": "\u672C\u8F2A\u5141\u8A31",
    "composer.placeholder": "\u63CF\u8FF0\u4F60\u8981\u8655\u7406\u7684\u958B\u767C\u4EFB\u52D9",
    "timeline.empty": "\u9084\u6C92\u6709\u5C0D\u8A71\u3002",
    "timeline.thinking": "\u601D\u8003\u4E2D...",
    "generic.close": "\u95DC\u9589",
    "generic.back": "\u8FD4\u56DE",
    "generic.refresh": "\u91CD\u65B0\u6574\u7406",
    "generic.search": "\u641C\u5C0B",
    "generic.project": "\u5C08\u6848",
    "generic.status": "\u72C0\u614B",
    "generic.sort": "\u6392\u5E8F",
    "generic.keyword": "\u95DC\u9375\u8A5E",
    "generic.copy": "\u8907\u88FD",
    "generic.expand": "\u5C55\u958B",
    "generic.collapse": "\u6536\u8D77",
    "generic.on": "\u958B",
    "generic.off": "\u95DC",
    "generic.none": "\u66AB\u7121",
    "inspect.selectionTitle": "\u8F14\u52A9\u8CC7\u8A0A"
  });

  // package/web/i18n/index.js
  var LOCALE_STORAGE_KEY = "syncodex.locale";
  var LEGACY_LOCALE_STORAGE_KEY = "remcodex.locale";
  var LOCALE_OPTIONS = [
    { id: "en", label: "English" },
    { id: "zh-CN", label: "\u7B80\u4F53\u4E2D\u6587" },
    { id: "zh-Hant", label: "\u7E41\u9AD4\u4E2D\u6587" },
    { id: "ja", label: "\u65E5\u672C\u8A9E" },
    { id: "ko", label: "\uD55C\uAD6D\uC5B4" },
    { id: "es", label: "Espa\xF1ol" },
    { id: "fr", label: "Fran\xE7ais" },
    { id: "de", label: "Deutsch" },
    { id: "pt-BR", label: "Portugu\xEAs (Brasil)" },
    { id: "ru", label: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439" }
  ];
  var SUPPORTED_LOCALES = new Set(LOCALE_OPTIONS.map((item) => item.id));
  var DICTIONARIES = {
    de: de_default,
    en: en_default,
    es: es_default,
    fr: fr_default,
    ja: ja_default,
    ko: ko_default,
    "pt-BR": pt_BR_default,
    ru: ru_default,
    "zh-CN": zh_CN_default,
    "zh-Hant": zh_Hant_default
  };
  function normalizeLocale(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) {
      return "en";
    }
    if (raw === "zh" || raw === "zh-cn" || raw === "zh-hans" || raw.startsWith("zh-cn")) {
      return "zh-CN";
    }
    if (raw === "zh-tw" || raw === "zh-hk" || raw === "zh-hant" || raw.startsWith("zh-tw") || raw.startsWith("zh-hk") || raw.startsWith("zh-hant")) {
      return "zh-Hant";
    }
    if (raw === "ja" || raw.startsWith("ja-")) {
      return "ja";
    }
    if (raw === "ko" || raw.startsWith("ko-")) {
      return "ko";
    }
    if (raw === "es" || raw.startsWith("es-")) {
      return "es";
    }
    if (raw === "fr" || raw.startsWith("fr-")) {
      return "fr";
    }
    if (raw === "de" || raw.startsWith("de-")) {
      return "de";
    }
    if (raw === "pt" || raw === "pt-br" || raw.startsWith("pt-br")) {
      return "pt-BR";
    }
    if (raw === "ru" || raw.startsWith("ru-")) {
      return "ru";
    }
    return "en";
  }
  function readStoredLocale() {
    var _a, _b;
    try {
      const value = ((_a = window.localStorage) == null ? void 0 : _a.getItem(LOCALE_STORAGE_KEY)) || ((_b = window.localStorage) == null ? void 0 : _b.getItem(LEGACY_LOCALE_STORAGE_KEY));
      return value && SUPPORTED_LOCALES.has(value) ? value : "";
    } catch (e) {
      return "";
    }
  }
  function detectLocale() {
    var _a;
    const stored = readStoredLocale();
    if (stored) {
      return stored;
    }
    if (typeof navigator !== "undefined") {
      return normalizeLocale(navigator.language || ((_a = navigator.languages) == null ? void 0 : _a[0]) || "");
    }
    return "en";
  }
  var currentLocale = detectLocale();
  function interpolate(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) => {
      const value = params[key];
      return value === void 0 || value === null ? "" : String(value);
    });
  }
  function resolveValue(dict, key) {
    return dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : void 0;
  }
  function getCurrentLocale() {
    return currentLocale;
  }
  function getIntlLocale() {
    switch (currentLocale) {
      case "zh-CN":
        return "zh-Hans-CN";
      case "zh-Hant":
        return "zh-Hant";
      case "pt-BR":
        return "pt-BR";
      default:
        return currentLocale;
    }
  }
  function listSupportedLocales() {
    return LOCALE_OPTIONS;
  }
  function setCurrentLocale(locale) {
    var _a, _b;
    currentLocale = normalizeLocale(locale);
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(LOCALE_STORAGE_KEY, currentLocale);
      (_b = window.localStorage) == null ? void 0 : _b.removeItem(LEGACY_LOCALE_STORAGE_KEY);
    } catch (e) {
    }
    return currentLocale;
  }
  function t(key, params = {}) {
    var _a, _b;
    const dict = DICTIONARIES[currentLocale] || DICTIONARIES.en;
    const fallback = DICTIONARIES["zh-CN"];
    const value = (_b = (_a = resolveValue(dict, key)) != null ? _a : resolveValue(fallback, key)) != null ? _b : resolveValue(DICTIONARIES.en, key);
    if (typeof value === "function") {
      return String(value(params));
    }
    if (typeof value === "string") {
      return interpolate(value, params);
    }
    return key;
  }
  function formatInlineList(values) {
    const list = Array.isArray(values) ? values.filter(Boolean) : [];
    if (list.length === 0) {
      return "";
    }
    if (currentLocale === "zh-CN") {
      return list.join("\u3001");
    }
    return list.join(", ");
  }

  // package/web/components/composer.js
  var CODEX_LAUNCH_STORAGE_KEY = "remote-agent-console.codexLaunch.v1";
  var CLIENT_FALLBACK_CODEX_UI_OPTIONS = {
    models: [
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.4", label: "gpt-5.4" },
      { id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
      { id: "gpt-5.3-codex", label: "gpt-5.3-codex" },
      { id: "gpt-5.2-codex", label: "gpt-5.2-codex" },
      { id: "gpt-5.2", label: "gpt-5.2" },
      { id: "gpt-5.1-codex-max", label: "gpt-5.1-codex-max" },
      { id: "gpt-5.1-codex-mini", label: "gpt-5.1-codex-mini" }
    ],
    reasoningLevels: [
      { id: "low", label: "low", launch: { reasoningEffort: "low" } },
      { id: "medium", label: "medium", launch: { reasoningEffort: "medium" } },
      { id: "high", label: "high", launch: { reasoningEffort: "high" } },
      { id: "xhigh", label: "xhigh", launch: { reasoningEffort: "xhigh" } }
    ]
  };
  function getReasoningLabel(id, fallback = "") {
    if (id === "low") {
      return t("composer.reasoning.low");
    }
    if (id === "medium") {
      return t("composer.reasoning.medium");
    }
    if (id === "high") {
      return t("composer.reasoning.high");
    }
    if (id === "xhigh") {
      return t("composer.reasoning.xhigh");
    }
    return fallback || id || "";
  }
  var activeComposerContext = null;
  var selectMeasureEl = null;
  function positionComposerEnvironmentPopover() {
    const popover = document.querySelector(".toolbar-host-wrap .input-popover");
    const toggle = document.querySelector("#composer-env-toggle");
    if (!(popover instanceof HTMLElement) || !(toggle instanceof HTMLElement)) {
      return;
    }
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const margin = 8;
    const gap = 8;
    const maxWidth = Math.min(352, Math.max(220, viewportWidth - margin * 2));
    popover.style.width = `${maxWidth}px`;
    popover.style.maxWidth = `${maxWidth}px`;
    popover.style.position = "fixed";
    popover.style.left = "0";
    popover.style.right = "auto";
    popover.style.bottom = "auto";
    popover.style.transform = "none";
    const toggleRect = toggle.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const width = Math.min(maxWidth, Math.ceil(popoverRect.width || maxWidth));
    const height = Math.ceil(popoverRect.height || 0);
    let left = toggleRect.right - width;
    left = Math.max(margin, Math.min(left, viewportWidth - width - margin));
    let top = toggleRect.top - height - gap;
    if (top < margin) {
      top = Math.min(viewportHeight - height - margin, toggleRect.bottom + gap);
    }
    popover.style.left = `${Math.max(margin, left)}px`;
    popover.style.top = `${Math.max(margin, top)}px`;
  }
  function escapeHtml(value) {
    return String(value != null ? value : "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
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
  function ensureSelectMeasureEl() {
    if (selectMeasureEl) {
      return selectMeasureEl;
    }
    selectMeasureEl = document.createElement("span");
    selectMeasureEl.style.position = "absolute";
    selectMeasureEl.style.visibility = "hidden";
    selectMeasureEl.style.pointerEvents = "none";
    selectMeasureEl.style.whiteSpace = "nowrap";
    selectMeasureEl.style.left = "-9999px";
    selectMeasureEl.style.top = "-9999px";
    document.body.appendChild(selectMeasureEl);
    return selectMeasureEl;
  }
  function syncSelectWidth(el) {
    var _a, _b;
    if (!(el instanceof HTMLSelectElement)) {
      return;
    }
    const measureEl = ensureSelectMeasureEl();
    const computed = window.getComputedStyle(el);
    const selectedText = ((_b = (_a = el.options[el.selectedIndex]) == null ? void 0 : _a.text) == null ? void 0 : _b.trim()) || "";
    measureEl.style.fontFamily = computed.fontFamily;
    measureEl.style.fontSize = computed.fontSize;
    measureEl.style.fontWeight = computed.fontWeight;
    measureEl.style.fontStyle = computed.fontStyle;
    measureEl.style.fontVariant = computed.fontVariant;
    measureEl.style.letterSpacing = computed.letterSpacing;
    measureEl.style.textTransform = computed.textTransform;
    measureEl.textContent = selectedText;
    const textWidth = Math.ceil(measureEl.getBoundingClientRect().width);
    const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(computed.paddingRight) || 0;
    const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(computed.borderRightWidth) || 0;
    const arrowAllowance = 18;
    const nextWidth = Math.ceil(
      textWidth + paddingLeft + paddingRight + borderLeft + borderRight + arrowAllowance
    );
    el.style.width = `${nextWidth}px`;
  }
  function renderComposerQuotaPopover(detailState) {
    var _a, _b, _c, _d, _e;
    const quota = (_a = detailState.codexQuota) == null ? void 0 : _a.quota;
    const hourPercent = typeof ((_b = quota == null ? void 0 : quota.hour) == null ? void 0 : _b.percent) === "number" && Number.isFinite(quota.hour.percent) ? `${quota.hour.percent}%` : "--";
    const hourRemain = typeof ((_c = quota == null ? void 0 : quota.hour) == null ? void 0 : _c.remainTime) === "string" && quota.hour.remainTime.trim() ? quota.hour.remainTime.trim() : "--";
    const weekPercent = typeof ((_d = quota == null ? void 0 : quota.week) == null ? void 0 : _d.percent) === "number" && Number.isFinite(quota.week.percent) ? `${quota.week.percent}%` : "--";
    const weekReset = typeof ((_e = quota == null ? void 0 : quota.week) == null ? void 0 : _e.resetDate) === "string" && quota.week.resetDate.trim() ? quota.week.resetDate.trim() : "--";
    const summary = `${hourPercent} / ${weekPercent}`;
    return `
    <details class="input-popover-quota">
      <summary class="input-popover-quota-summary">
        <span>${escapeHtml(t("composer.quota.remaining"))}</span>
        <span class="input-popover-quota-summary-value">${escapeHtml(summary)}</span>
      </summary>
      <div class="input-popover-quota-body">
        <p class="input-popover-quota-line">${escapeHtml(t("composer.quota.hours", { percent: hourPercent, remain: hourRemain }))}</p>
        <p class="input-popover-quota-line">${escapeHtml(t("composer.quota.week", { percent: weekPercent, reset: weekReset }))}</p>
      </div>
    </details>
  `;
  }
  function ensureDetailCodexLaunch(detailState, uiOptions) {
    var _a;
    const current = (_a = detailState.codexLaunch) != null ? _a : defaultCodexLaunch();
    const normalized = normalizeCodexLaunchAgainstUi(current, uiOptions);
    if (!detailState.codexLaunch || detailState.codexLaunch.modelId !== normalized.modelId || detailState.codexLaunch.reasoningId !== normalized.reasoningId || detailState.codexLaunch.profile !== normalized.profile) {
      detailState.codexLaunch = normalized;
    }
    return detailState.codexLaunch;
  }
  function renderComposerEnvironmentPopover(detailState) {
    const hosts = Array.isArray(detailState.remoteHosts) ? detailState.remoteHosts : [];
    const activeHost = detailState.activeRemoteHost || "";
    return `
    <div class="input-popover" role="menu" aria-label="${escapeHtml(t("composer.environment"))}">
      <div class="input-popover-group">
        ${hosts.length > 0 ? hosts.map(
      (host) => `
                    <button
                      type="button"
                      class="input-popover-item ${activeHost === host ? "input-popover-item--active" : ""}"
                      data-remote-host="${escapeHtml(host)}"
                    >
                      <span class="input-popover-item-check">${activeHost === host ? "\u2713" : ""}</span>
                      <span class="input-popover-item-label">${escapeHtml(host)}</span>
                    </button>
                  `
    ).join("") : `<div class="input-popover-item-label">${escapeHtml(t("composer.unsynced"))}</div>`}
      </div>
      <div class="input-popover-divider"></div>
      ${renderComposerQuotaPopover(detailState)}
    </div>
  `;
  }
  function setActiveRemoteHost(detailState, host) {
    detailState.activeRemoteHost = String(host || "").trim();
  }
  function closeComposerEnvironmentMenu(detailState, onRender) {
    if (!detailState.composerEnvironmentMenuOpen) {
      return;
    }
    detailState.composerEnvironmentMenuOpen = false;
    onRender();
  }
  function ensureComposerEnvironmentGlobalListeners() {
    if (window.__composerEnvironmentListenersBound) {
      return;
    }
    window.__composerEnvironmentListenersBound = true;
    document.addEventListener("click", (event) => {
      var _a;
      const context = activeComposerContext;
      if (!((_a = context == null ? void 0 : context.detailState) == null ? void 0 : _a.composerEnvironmentMenuOpen)) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }
      if (target.closest(".input-container")) {
        return;
      }
      closeComposerEnvironmentMenu(context.detailState, context.onRender);
    });
    document.addEventListener("keydown", (event) => {
      var _a;
      const context = activeComposerContext;
      if (event.key === "Escape" && ((_a = context == null ? void 0 : context.detailState) == null ? void 0 : _a.composerEnvironmentMenuOpen)) {
        closeComposerEnvironmentMenu(context.detailState, context.onRender);
      }
    });
  }
  function bindComposerMetaControls(detailState) {
    ensureDetailCodexLaunch(detailState, detailState.codexUiOptions);
    document.querySelectorAll("[data-codex-pref]").forEach((el) => {
      var _a;
      const key = el.getAttribute("data-codex-pref");
      if (!key || key !== "modelId" && key !== "reasoningId" && key !== "profile") {
        return;
      }
      const onChange = () => {
        detailState.codexLaunch[key] = el.value;
        persistCodexLaunchPrefs(detailState.codexLaunch);
      };
      if (el.tagName === "SELECT") {
        syncSelectWidth(el);
        window.requestAnimationFrame(() => syncSelectWidth(el));
        if ((_a = document.fonts) == null ? void 0 : _a.ready) {
          document.fonts.ready.then(() => syncSelectWidth(el)).catch(() => {
          });
        }
        el.onchange = () => {
          onChange();
          syncSelectWidth(el);
        };
        return;
      }
      el.oninput = onChange;
    });
  }
  function bindComposerEnvironmentControls(detailState, onRender) {
    ensureComposerEnvironmentGlobalListeners();
    const toggle = document.querySelector("#composer-env-toggle");
    if (toggle) {
      toggle.onclick = async () => {
        var _a;
        const nextOpen = !detailState.composerEnvironmentMenuOpen;
        detailState.composerEnvironmentMenuOpen = nextOpen;
        if (nextOpen) {
          if (!detailState.codexQuota && ((_a = detailState.session) == null ? void 0 : _a.sessionId)) {
            try {
              detailState.codexQuota = await getCodexQuota(detailState.session.sessionId);
            } catch (e) {
              detailState.codexQuota = null;
            }
          }
          try {
            const hostResult = await getCodexHosts();
            detailState.remoteHosts = Array.isArray(hostResult == null ? void 0 : hostResult.hosts) ? hostResult.hosts.filter((item) => typeof item === "string" && item.trim()) : [];
            detailState.activeRemoteHost = typeof (hostResult == null ? void 0 : hostResult.activeHost) === "string" && hostResult.activeHost.trim() ? hostResult.activeHost.trim() : detailState.remoteHosts[0] || "";
          } catch (e) {
            detailState.remoteHosts = [];
            detailState.activeRemoteHost = "";
          }
        }
        onRender();
        window.requestAnimationFrame(() => positionComposerEnvironmentPopover());
      };
    }
    document.querySelectorAll("[data-remote-host]").forEach((el) => {
      el.onclick = () => {
        const next = el.getAttribute("data-remote-host");
        if (!next) {
          return;
        }
        setActiveRemoteHost(detailState, next);
        detailState.composerEnvironmentMenuOpen = false;
        onRender();
      };
    });
  }
  function isBusyStatus(status) {
    return ["starting", "running", "stopping"].includes(status);
  }
  function isSessionComposerBusy(session) {
    if (!session) {
      return false;
    }
    if (session.sourceKind === "imported_rollout") {
      return Boolean(session.liveBusy);
    }
    return isBusyStatus(session.status);
  }
  function defaultCodexLaunch() {
    return {
      modelId: "",
      reasoningId: "",
      profile: ""
    };
  }
  function normalizeCodexLaunchAgainstUi(prefs, uiOptions) {
    const source = prefs && typeof prefs === "object" ? prefs : {};
    const opts = uiOptions && Array.isArray(uiOptions.models) && uiOptions.models.length > 0 ? uiOptions : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
    const modelIds = new Set(opts.models.map((m) => m.id));
    const reasoningIds = new Set(opts.reasoningLevels.map((r) => r.id));
    let modelId = typeof source.modelId === "string" ? source.modelId.trim() : "";
    let reasoningId = typeof source.reasoningId === "string" ? source.reasoningId.trim() : "";
    if (modelId && !modelIds.has(modelId)) {
      modelId = "";
    }
    if (reasoningId && !reasoningIds.has(reasoningId)) {
      reasoningId = "";
    }
    return __spreadProps(__spreadValues(__spreadValues({}, defaultCodexLaunch()), source), {
      modelId,
      reasoningId,
      profile: typeof source.profile === "string" ? source.profile : ""
    });
  }
  function persistCodexLaunchPrefs(prefs) {
    var _a;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(CODEX_LAUNCH_STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
    }
  }
  function buildCodexLaunchPayload(launch, uiOptions) {
    var _a;
    if (!launch) {
      return void 0;
    }
    const opts = uiOptions && Array.isArray(uiOptions.models) && uiOptions.models.length > 0 ? uiOptions : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
    const codex = {};
    const modelId = String(launch.modelId || "").trim();
    if (modelId) {
      codex.model = modelId;
    }
    const profile = String(launch.profile || "").trim();
    if (profile) {
      codex.profile = profile;
    }
    const level = opts.reasoningLevels.find((r) => r.id === launch.reasoningId);
    const reasoningEffort = (_a = level == null ? void 0 : level.launch) == null ? void 0 : _a.reasoningEffort;
    if (reasoningEffort === "low" || reasoningEffort === "medium" || reasoningEffort === "high" || reasoningEffort === "xhigh") {
      codex.reasoningEffort = reasoningEffort;
    }
    return Object.keys(codex).length ? codex : void 0;
  }
  function renderComposerInput({ session, detailState, uiOptions }) {
    const opts = uiOptions && Array.isArray(uiOptions.models) && uiOptions.models.length > 0 ? uiOptions : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
    const launch = ensureDetailCodexLaunch(detailState, opts);
    const modelOptionsHtml = [
      `<option value="" ${launch.modelId ? "" : "selected"}>${escapeHtml(t("composer.model.noOverride"))}</option>`,
      ...opts.models.map(
        (model) => `<option value="${escapeHtml(model.id)}" ${launch.modelId === model.id ? "selected" : ""}>${escapeHtml(model.label)}</option>`
      )
    ].join("");
    const reasoningOptionsHtml = [
      `<option value="" ${launch.reasoningId ? "" : "selected"}>${escapeHtml(t("composer.reasoning.noOverride"))}</option>`,
      ...opts.reasoningLevels.map(
        (level) => `<option value="${escapeHtml(level.id)}" ${launch.reasoningId === level.id ? "selected" : ""}>${escapeHtml(getReasoningLabel(level.id, level.label))}</option>`
      )
    ].join("");
    const activeHost = detailState.activeRemoteHost || "--";
    const isBusy = isSessionComposerBusy(session);
    const attachmentItems = Array.isArray(detailState.composerAttachments) ? detailState.composerAttachments : [];
    const attachmentFailed = attachmentItems.some((item) => item.status === "failed");
    const statusPlaceholderText = !detailState.composerSendError && !attachmentFailed ? String(detailState.composerPlaceholderHint || detailState.mobileQueueStatusText || "").trim() : "";
    const placeholderText = statusPlaceholderText || t("composer.placeholder");
    const sendStatusText = detailState.composerSendError ? t("composer.sendFailed") : attachmentFailed ? t("composer.attachments.failed") : "";
    const sendStatusClass = detailState.composerSendError ? "composer-send-status-error" : attachmentFailed ? "composer-send-status-error" : "";
    const attachmentsHtml = attachmentItems.length ? `
      <div class="composer-attachments" aria-label="${escapeHtml(t("composer.attachments.title"))}">
        ${attachmentItems.map((item) => {
      const statusClass2 = item.status === "failed" ? "composer-attachment-failed" : item.status === "uploading" ? "composer-attachment-uploading" : "";
      const statusText = item.status === "failed" ? t("composer.attachments.failedShort") : item.status === "uploading" ? t("composer.attachments.uploadingShort") : formatAttachmentSize(item.size);
      return `
              <div class="composer-attachment ${statusClass2}">
                ${item.isImage && item.previewUrl ? `<img class="composer-attachment-thumb" src="${escapeHtml(item.previewUrl)}" alt="" />` : `<span class="composer-attachment-file-icon" aria-hidden="true">${item.isImage ? "IMG" : "FILE"}</span>`}
                <span class="composer-attachment-name" title="${escapeHtml(item.path || item.name)}">${escapeHtml(item.name || "attachment")}</span>
                ${statusText ? `<span class="composer-attachment-meta">${escapeHtml(statusText)}</span>` : ""}
                <button
                  type="button"
                  class="composer-attachment-remove"
                  data-remove-attachment="${escapeHtml(item.id)}"
                  aria-label="${escapeHtml(t("composer.attachments.remove"))}"
                  title="${escapeHtml(t("composer.attachments.remove"))}"
                >x</button>
              </div>
            `;
    }).join("")}
      </div>
    ` : "";
    return `
    <div class="input-container ${isBusy ? "input-container--busy" : ""}">
      <textarea
        name="content"
        class="input-area ${statusPlaceholderText && !String(detailState.draft || "").trim() ? "input-area--status-placeholder" : ""}"
        rows="1"
        placeholder="${escapeHtml(placeholderText)}"
        required
        autocomplete="on"
        autocorrect="on"
        autocapitalize="sentences"
        spellcheck="true"
        inputmode="text"
        enterkeyhint="send"
        lang="zh-CN"
        aria-label="${escapeHtml(t("composer.aria.message"))}"
      >${escapeHtml(detailState.draft)}</textarea>
      <div id="composer-slash-slot"></div>
      ${attachmentsHtml}
      <div
        id="composer-send-status"
        class="composer-send-status ${sendStatusText ? "composer-send-status-visible" : ""} ${sendStatusClass}"
        aria-live="polite"
      >${escapeHtml(sendStatusText)}</div>
      <div class="toolbar">
        <div class="toolbar-center">
          <select class="toolbar-select" data-codex-pref="modelId" aria-label="${escapeHtml(t("composer.aria.model"))}">
            ${modelOptionsHtml}
          </select>
          <select class="toolbar-select" data-codex-pref="reasoningId" aria-label="${escapeHtml(t("composer.aria.reasoning"))}">
            ${reasoningOptionsHtml}
          </select>
          <div class="toolbar-host-wrap">
            <button
              type="button"
              id="composer-env-toggle"
              class="toolbar-env"
              aria-haspopup="menu"
              aria-expanded="${detailState.composerEnvironmentMenuOpen ? "true" : "false"}"
            >
              <span class="toolbar-env-label">${escapeHtml(activeHost)}</span>
            </button>
            ${detailState.composerEnvironmentMenuOpen ? renderComposerEnvironmentPopover(detailState) : ""}
          </div>
        </div>
        <div class="toolbar-right">
          <input
            id="composer-attachment-input"
            class="composer-attachment-input"
            type="file"
            multiple
            accept="image/*,.txt,.md,.json,.csv,.tsv,.log,.py,.js,.ts,.tsx,.jsx,.html,.css,.xml,.yaml,.yml,.toml,.ini,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          />
          <button
            type="button"
            id="composer-attach-action"
            class="composer-attach-fab"
            aria-label="${escapeHtml(t("composer.attachments.add"))}"
            title="${escapeHtml(t("composer.attachments.add"))}"
          >
            <svg class="composer-action-icon composer-attach-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M8.2 12.4 13.9 6.7a3.1 3.1 0 0 1 4.4 4.4l-6.6 6.6a4.8 4.8 0 0 1-6.8-6.8l6.8-6.8"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
              <path
                d="M9.8 14.2 16 8"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="2"
              />
            </svg>
          </button>
          <button
            type="button"
            id="composer-action"
            class="composer-action-fab composer-action-fab--send"
            aria-label="${escapeHtml(t("composer.aria.send"))}"
            title="${escapeHtml(isBusy ? t("composer.aria.queue") : t("composer.aria.send"))}"
          >
            <svg class="composer-action-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M3.4 20.4 21 12 3.4 3.6l-.8 6.2 12.2 2.2-12.2 2.2.8 6.2Z"
              />
            </svg>
          </button>
          ${isBusy ? `<button
                  type="button"
                  id="composer-steer-action"
                  class="composer-steer-fab"
                  aria-label="${escapeHtml(t("composer.aria.steer"))}"
                  title="${escapeHtml(t("composer.aria.steer"))}"
                >
                  <svg class="composer-action-icon composer-steer-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M5 12h10.5M12 5l7 7-7 7"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.2"
                    />
                  </svg>
                </button>` : ""}
          ${isBusy ? `<button
                  type="button"
                  id="composer-stop-action"
                  class="composer-stop-fab"
                  aria-label="${escapeHtml(t("composer.aria.clearBusy"))}"
                  title="${escapeHtml(t("composer.aria.clearBusy"))}"
                >
                  <svg class="composer-action-icon composer-stop-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <rect
                      x="7"
                      y="7"
                      width="10"
                      height="10"
                      rx="2.2"
                      fill="currentColor"
                    />
                  </svg>
                </button>` : ""}
        </div>
      </div>
    </div>
  `;
  }
  function bindComposerInputControls({ detailState, onRender }) {
    activeComposerContext = { detailState, onRender };
    bindComposerMetaControls(detailState);
    bindComposerEnvironmentControls(detailState, onRender);
    if (detailState.composerEnvironmentMenuOpen) {
      window.requestAnimationFrame(() => positionComposerEnvironmentPopover());
    }
  }
  function adjustComposerHeight(el) {
    var _a, _b, _c;
    if (!el) {
      return;
    }
    const computed = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 24;
    const minPx = Math.ceil(lineHeight);
    const viewportHeight = ((_a = window.visualViewport) == null ? void 0 : _a.height) || window.innerHeight || 0;
    const isMobile = (_c = (_b = window.matchMedia) == null ? void 0 : _b.call(window, "(max-width: 759px)")) == null ? void 0 : _c.matches;
    const mobileMaxPx = viewportHeight ? Math.max(96, Math.floor(viewportHeight * 0.35)) : 176;
    const maxPx = isMobile ? Math.min(220, mobileMaxPx) : 176;
    el.style.overflowY = "hidden";
    el.style.height = "auto";
    const targetHeight = Math.max(minPx, Math.min(el.scrollHeight, maxPx));
    el.style.height = `${targetHeight}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }

  // package/web/components/session-workbench.js
  function escapeHtml2(value) {
    return String(value != null ? value : "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function getCompactMobileTitle(title) {
    const text = String(title || "").trim();
    if (!text) {
      return t("session.current");
    }
    return text.length > 12 ? `${text.slice(0, 12)}...` : text;
  }
  function renderSessionTopBar({
    title,
    statusCode = "",
    statusLabel,
    statusClass: statusClass2,
    activityBadges = [],
    host,
    model,
    reasoning,
    sessionElapsedLabel,
    activeElapsedLabel,
    inspectOpen,
    showInspectAction = true,
    showCompletionOptionsAction = false,
    completionOptionsOpen = false,
    backHref = ""
  }) {
    void statusCode;
    void statusLabel;
    void statusClass2;
    void activityBadges;
    void sessionElapsedLabel;
    void activeElapsedLabel;
    const fullTitle = title || t("workspace.session.untitled");
    const mobileTitle = getCompactMobileTitle(fullTitle);
    return `
    <section class="session-topbar" aria-label="${escapeHtml2(t("inspect.thread"))}">
      <div class="session-topbar-mobile-bar">
        ${backHref ? `<a href="${escapeHtml2(backHref)}" class="session-topbar-mobile-back">${escapeHtml2(t("session.back"))}</a>` : `<span class="session-topbar-mobile-back session-topbar-mobile-back-placeholder"></span>`}
        <div class="session-topbar-mobile-center">
          <div class="session-topbar-mobile-title-row">
            <div class="session-topbar-mobile-title" title="${escapeHtml2(fullTitle)}">${escapeHtml2(mobileTitle)}</div>
          </div>
        </div>
        ${showInspectAction ? `
              <button
                id="inspect-drawer-toggle"
                type="button"
                class="secondary-button session-topbar-mobile-action ${inspectOpen ? "session-topbar-action-active" : ""}"
                aria-expanded="${inspectOpen ? "true" : "false"}"
                aria-controls="inspect-drawer"
              >
                Inspect
              </button>
            ` : showCompletionOptionsAction ? `
                <button
                  type="button"
                  class="secondary-button session-topbar-mobile-action ${completionOptionsOpen ? "session-topbar-action-active" : ""}"
                  data-completion-options-toggle
                  aria-expanded="${completionOptionsOpen ? "true" : "false"}"
                  aria-controls="session-completion-options-slot"
                >
                  ${escapeHtml2(t("completionActions.options"))}
                </button>
              ` : `<span class="session-topbar-mobile-action session-topbar-mobile-action-placeholder"></span>`}
      </div>
      <div class="session-topbar-main">
        <h2 class="session-topbar-title" title="${escapeHtml2(fullTitle)}">${escapeHtml2(fullTitle)}</h2>
      </div>
      <div class="session-topbar-meta">
        <span class="session-topbar-chip">${escapeHtml2(host || t("session.host.unsynced"))}</span>
        <span class="session-topbar-chip">${escapeHtml2(model || t("session.model.unsynced"))}</span>
        <span class="session-topbar-chip">${escapeHtml2(reasoning || t("session.reasoning.unsynced"))}</span>
      </div>
      ${showInspectAction ? `
            <button
              id="inspect-drawer-toggle"
              type="button"
              class="secondary-button session-topbar-action ${inspectOpen ? "session-topbar-action-active" : ""}"
              aria-expanded="${inspectOpen ? "true" : "false"}"
              aria-controls="inspect-drawer"
            >
              Inspect
            </button>
          ` : showCompletionOptionsAction ? `
              <button
                type="button"
                class="secondary-button session-topbar-action ${completionOptionsOpen ? "session-topbar-action-active" : ""}"
                data-completion-options-toggle
                aria-expanded="${completionOptionsOpen ? "true" : "false"}"
                aria-controls="session-completion-options-slot"
              >
                ${escapeHtml2(t("completionActions.options"))}
              </button>
            ` : ""}
    </section>
  `;
  }

  // package/web/session-event-adapter.js
  function toIsoTimestamp(value) {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  function safeJsonParse(value) {
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }
  function normalizeId(raw, fallbackPrefix = "raw") {
    var _a;
    if (raw == null ? void 0 : raw.id) {
      return String(raw.id);
    }
    const topType = String((raw == null ? void 0 : raw.type) || "unknown");
    const payloadType = String(((_a = raw == null ? void 0 : raw.payload) == null ? void 0 : _a.type) || "unknown");
    const timestamp = String((raw == null ? void 0 : raw.timestamp) || Date.now());
    return `${fallbackPrefix}:${topType}:${payloadType}:${timestamp}`;
  }
  function pickTurnId(payload) {
    return (payload == null ? void 0 : payload.turn_id) || (payload == null ? void 0 : payload.turnId) || null;
  }
  function pickCallId(payload) {
    return (payload == null ? void 0 : payload.call_id) || (payload == null ? void 0 : payload.callId) || null;
  }
  function pickRequestId(payload) {
    return (payload == null ? void 0 : payload.request_id) || (payload == null ? void 0 : payload.requestId) || null;
  }
  function pickMessageId(payload) {
    return (payload == null ? void 0 : payload.message_id) || (payload == null ? void 0 : payload.messageId) || (payload == null ? void 0 : payload.id) || null;
  }
  function normalizeMessageContent(content) {
    if (typeof content === "string") {
      return content;
    }
    if (!Array.isArray(content)) {
      return "";
    }
    return content.map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      return typeof item.text === "string" ? item.text : "";
    }).filter(Boolean).join("\n");
  }
  function normalizeUserVisibleText(text) {
    const value = String(text || "");
    const marker = "Syncodex attachments uploaded to this Windows machine. Use these absolute paths when you need to inspect them:";
    const markerIndex = value.indexOf(marker);
    if (markerIndex < 0) {
      return value;
    }
    const before = value.slice(0, markerIndex).trim();
    if (before) {
      return before;
    }
    const attachmentNames = value.slice(markerIndex + marker.length).split(/\r?\n/).map((line) => {
      var _a, _b;
      return ((_b = (_a = line.match(/^\s*\d+\.\s+\[[^\]]+\]\s+(.+?)\s+\(/)) == null ? void 0 : _a[1]) == null ? void 0 : _b.trim()) || "";
    }).filter(Boolean);
    return attachmentNames.length ? attachmentNames.join(", ") : "";
  }
  function normalizeFunctionCallArguments(payload) {
    const parsed = safeJsonParse(payload == null ? void 0 : payload.arguments);
    return parsed && typeof parsed === "object" ? parsed : {};
  }
  function normalizePlanUpdate(payload) {
    const args = normalizeFunctionCallArguments(payload);
    const plan = Array.isArray(args.plan) ? args.plan.map((item, index) => ({
      id: String((item == null ? void 0 : item.id) || (item == null ? void 0 : item.step) || `plan:${index}`),
      step: String((item == null ? void 0 : item.step) || "").trim(),
      status: String((item == null ? void 0 : item.status) || "pending").trim() || "pending"
    })).filter((item) => item.step) : [];
    return {
      explanation: String(args.explanation || "").trim(),
      plan,
      raw: payload
    };
  }
  function normalizeFunctionCallOutput(payload) {
    const output = typeof (payload == null ? void 0 : payload.output) === "string" ? payload.output : "";
    const rejected = /Rejected\("rejected by user"\)/.test(output);
    return {
      output,
      rejected,
      raw: payload
    };
  }
  function normalizeCustomToolOutput(payload) {
    const output = typeof (payload == null ? void 0 : payload.output) === "string" ? payload.output : "";
    const parsed = safeJsonParse(output);
    return {
      output,
      parsed,
      raw: payload
    };
  }
  function normalizeExecCommandEnd(payload) {
    const command = Array.isArray(payload == null ? void 0 : payload.command) ? payload.command.join(" ") : typeof (payload == null ? void 0 : payload.command) === "string" ? payload.command : "";
    return {
      command,
      argv: Array.isArray(payload == null ? void 0 : payload.command) ? payload.command : [],
      cwd: (payload == null ? void 0 : payload.cwd) || null,
      stdout: (payload == null ? void 0 : payload.stdout) || "",
      stderr: (payload == null ? void 0 : payload.stderr) || "",
      aggregatedOutput: (payload == null ? void 0 : payload.aggregated_output) || "",
      formattedOutput: (payload == null ? void 0 : payload.formatted_output) || "",
      exitCode: typeof (payload == null ? void 0 : payload.exit_code) === "number" ? payload.exit_code : Number.isFinite(Number(payload == null ? void 0 : payload.exit_code)) ? Number(payload.exit_code) : null,
      processId: (payload == null ? void 0 : payload.process_id) || null,
      status: (payload == null ? void 0 : payload.status) || null,
      duration: (payload == null ? void 0 : payload.duration) || null,
      parsedCommand: Array.isArray(payload == null ? void 0 : payload.parsed_cmd) ? payload.parsed_cmd : [],
      raw: payload
    };
  }
  function normalizePatchEnd(payload) {
    return {
      stdout: (payload == null ? void 0 : payload.stdout) || "",
      stderr: (payload == null ? void 0 : payload.stderr) || "",
      success: typeof (payload == null ? void 0 : payload.success) === "boolean" ? payload.success : null,
      status: (payload == null ? void 0 : payload.status) || null,
      changes: (payload == null ? void 0 : payload.changes) && typeof payload.changes === "object" ? payload.changes : {},
      raw: payload
    };
  }
  function normalizeTokenCount(payload) {
    return {
      info: (payload == null ? void 0 : payload.info) || null,
      rateLimits: (payload == null ? void 0 : payload.rate_limits) || null,
      raw: payload
    };
  }
  function normalizeDirectSemanticPayload(topType, raw, payload) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    if (topType === "message.user") {
      return {
        text: (payload == null ? void 0 : payload.text) || (raw == null ? void 0 : raw.text) || (raw == null ? void 0 : raw.content) || normalizeMessageContent((payload == null ? void 0 : payload.content) || (raw == null ? void 0 : raw.content)),
        source: "message.user",
        raw
      };
    }
    if (topType === "message.assistant.start" || topType === "message.assistant.delta" || topType === "message.assistant.end" || topType === "message.assistant") {
      const isDelta = topType === "message.assistant.delta";
      return {
        text: isDelta ? void 0 : (payload == null ? void 0 : payload.text) || (raw == null ? void 0 : raw.text) || (raw == null ? void 0 : raw.content) || normalizeMessageContent((payload == null ? void 0 : payload.content) || (raw == null ? void 0 : raw.content)),
        textDelta: (payload == null ? void 0 : payload.textDelta) || (payload == null ? void 0 : payload.text_delta) || (raw == null ? void 0 : raw.textDelta) || (raw == null ? void 0 : raw.text_delta) || (payload == null ? void 0 : payload.delta) || (raw == null ? void 0 : raw.delta) || (payload == null ? void 0 : payload.text) || (raw == null ? void 0 : raw.text) || (payload == null ? void 0 : payload.content) || (raw == null ? void 0 : raw.content) || "",
        raw
      };
    }
    if (topType === "reasoning.start" || topType === "reasoning.delta" || topType === "reasoning.end" || topType === "reasoning") {
      const isDelta = topType === "reasoning.delta";
      return {
        summary: (payload == null ? void 0 : payload.summary) || (raw == null ? void 0 : raw.summary) || (raw == null ? void 0 : raw.text) || "",
        text: isDelta ? void 0 : (payload == null ? void 0 : payload.text) || (raw == null ? void 0 : raw.text) || (payload == null ? void 0 : payload.summary) || (raw == null ? void 0 : raw.summary) || "",
        textDelta: (payload == null ? void 0 : payload.textDelta) || (payload == null ? void 0 : payload.text_delta) || (raw == null ? void 0 : raw.textDelta) || (raw == null ? void 0 : raw.text_delta) || (payload == null ? void 0 : payload.delta) || (raw == null ? void 0 : raw.delta) || (payload == null ? void 0 : payload.summary) || (raw == null ? void 0 : raw.summary) || (payload == null ? void 0 : payload.text) || (raw == null ? void 0 : raw.text) || "",
        raw
      };
    }
    if (topType === "command.start") {
      return {
        command: (payload == null ? void 0 : payload.command) || (raw == null ? void 0 : raw.command) || "",
        cwd: (payload == null ? void 0 : payload.cwd) || (raw == null ? void 0 : raw.cwd) || null,
        justification: (payload == null ? void 0 : payload.justification) || (raw == null ? void 0 : raw.justification) || null,
        sandboxPermissions: (payload == null ? void 0 : payload.sandboxPermissions) || (raw == null ? void 0 : raw.sandboxPermissions) || (raw == null ? void 0 : raw.sandbox_permissions) || null,
        raw
      };
    }
    if (topType === "command.end") {
      return {
        command: (payload == null ? void 0 : payload.command) || (raw == null ? void 0 : raw.command) || "",
        cwd: (payload == null ? void 0 : payload.cwd) || (raw == null ? void 0 : raw.cwd) || null,
        stdout: (payload == null ? void 0 : payload.stdout) || (raw == null ? void 0 : raw.stdout) || "",
        stderr: (payload == null ? void 0 : payload.stderr) || (raw == null ? void 0 : raw.stderr) || "",
        output: (payload == null ? void 0 : payload.output) || (raw == null ? void 0 : raw.output) || "",
        aggregatedOutput: (payload == null ? void 0 : payload.aggregatedOutput) || (payload == null ? void 0 : payload.aggregated_output) || (raw == null ? void 0 : raw.aggregatedOutput) || "",
        formattedOutput: (payload == null ? void 0 : payload.formattedOutput) || (payload == null ? void 0 : payload.formatted_output) || (raw == null ? void 0 : raw.formattedOutput) || "",
        exitCode: (_d = (_c = (_b = (_a = payload == null ? void 0 : payload.exitCode) != null ? _a : payload == null ? void 0 : payload.exit_code) != null ? _b : raw == null ? void 0 : raw.exitCode) != null ? _c : raw == null ? void 0 : raw.exit_code) != null ? _d : null,
        duration: (payload == null ? void 0 : payload.duration) || (raw == null ? void 0 : raw.duration) || null,
        status: (payload == null ? void 0 : payload.status) || (raw == null ? void 0 : raw.status) || null,
        rejected: (_f = (_e = payload == null ? void 0 : payload.rejected) != null ? _e : raw == null ? void 0 : raw.rejected) != null ? _f : false,
        raw
      };
    }
    if (topType === "command.output.delta") {
      return {
        stream: (payload == null ? void 0 : payload.stream) || (raw == null ? void 0 : raw.stream) || "stdout",
        textDelta: (payload == null ? void 0 : payload.textDelta) || (payload == null ? void 0 : payload.text_delta) || (raw == null ? void 0 : raw.textDelta) || (raw == null ? void 0 : raw.text_delta) || (payload == null ? void 0 : payload.delta) || (raw == null ? void 0 : raw.delta) || (payload == null ? void 0 : payload.text) || (raw == null ? void 0 : raw.text) || "",
        raw
      };
    }
    if (topType === "patch.start") {
      return {
        input: (payload == null ? void 0 : payload.input) || (raw == null ? void 0 : raw.input) || (raw == null ? void 0 : raw.patch) || "",
        raw
      };
    }
    if (topType === "patch.end") {
      return {
        output: (payload == null ? void 0 : payload.output) || (raw == null ? void 0 : raw.output) || "",
        stdout: (payload == null ? void 0 : payload.stdout) || (raw == null ? void 0 : raw.stdout) || "",
        stderr: (payload == null ? void 0 : payload.stderr) || (raw == null ? void 0 : raw.stderr) || "",
        success: (_h = (_g = payload == null ? void 0 : payload.success) != null ? _g : raw == null ? void 0 : raw.success) != null ? _h : null,
        status: (payload == null ? void 0 : payload.status) || (raw == null ? void 0 : raw.status) || null,
        changes: (payload == null ? void 0 : payload.changes) || (raw == null ? void 0 : raw.changes) || {},
        raw
      };
    }
    if (topType === "patch.output.delta") {
      return {
        textDelta: (payload == null ? void 0 : payload.textDelta) || (payload == null ? void 0 : payload.text_delta) || (raw == null ? void 0 : raw.textDelta) || (raw == null ? void 0 : raw.text_delta) || (payload == null ? void 0 : payload.delta) || (raw == null ? void 0 : raw.delta) || (payload == null ? void 0 : payload.text) || (raw == null ? void 0 : raw.text) || "",
        raw
      };
    }
    if (topType === "approval.requested" || topType === "approval.resolved") {
      return {
        title: (payload == null ? void 0 : payload.title) || (raw == null ? void 0 : raw.title) || "",
        reason: (payload == null ? void 0 : payload.reason) || (raw == null ? void 0 : raw.reason) || "",
        command: (payload == null ? void 0 : payload.command) || (raw == null ? void 0 : raw.command) || "",
        decision: (payload == null ? void 0 : payload.decision) || (raw == null ? void 0 : raw.decision) || null,
        resumable: (_j = (_i = payload == null ? void 0 : payload.resumable) != null ? _i : raw == null ? void 0 : raw.resumable) != null ? _j : true,
        raw
      };
    }
    if (topType === "turn.aborted" || topType === "error") {
      return {
        reason: (payload == null ? void 0 : payload.reason) || (raw == null ? void 0 : raw.reason) || "",
        message: (payload == null ? void 0 : payload.message) || (raw == null ? void 0 : raw.message) || "",
        code: (payload == null ? void 0 : payload.code) || (raw == null ? void 0 : raw.code) || null,
        raw
      };
    }
    if (topType === "token_count") {
      return normalizeTokenCount(__spreadProps(__spreadValues(__spreadValues({}, raw), payload), {
        rate_limits: (payload == null ? void 0 : payload.rate_limits) || (raw == null ? void 0 : raw.rate_limits) || (raw == null ? void 0 : raw.rateLimits) || null
      }));
    }
    return payload;
  }
  function normalizeRawSessionEvent(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const timestamp = toIsoTimestamp(raw.timestamp);
    const seq = typeof raw.seq === "number" ? raw.seq : Number.isFinite(Number(raw.seq)) ? Number(raw.seq) : 0;
    const topType = String(raw.type || "");
    const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
    const payloadType = String(payload.type || "");
    const directSemanticKinds = /* @__PURE__ */ new Set([
      "message.user",
      "message.assistant",
      "message.assistant.start",
      "message.assistant.delta",
      "message.assistant.end",
      "reasoning",
      "reasoning.start",
      "reasoning.delta",
      "reasoning.end",
      "command.start",
      "command.output.delta",
      "command.end",
      "patch.start",
      "patch.output.delta",
      "patch.end",
      "approval.requested",
      "approval.resolved",
      "turn.started",
      "turn.completed",
      "turn.aborted",
      "error",
      "token_count"
    ]);
    if (directSemanticKinds.has(topType)) {
      const directKindMap = {
        "message.user": "user_message",
        "message.assistant": "assistant_message",
        "message.assistant.start": "assistant_message_start",
        "message.assistant.delta": "assistant_message_delta",
        "message.assistant.end": "assistant_message_end",
        reasoning: "reasoning",
        "reasoning.start": "reasoning_start",
        "reasoning.delta": "reasoning_delta",
        "reasoning.end": "reasoning_end",
        "command.start": "command_start",
        "command.output.delta": "command_output_delta",
        "command.end": "command_end",
        "patch.start": "patch_start",
        "patch.output.delta": "patch_output_delta",
        "patch.end": "patch_end",
        "approval.requested": "approval_requested",
        "approval.resolved": "approval_resolved",
        "turn.started": "turn_started",
        "turn.completed": "turn_completed",
        "turn.aborted": "turn_aborted",
        error: "error",
        token_count: "token_count"
      };
      return {
        id: normalizeId(raw, "semantic"),
        seq,
        timestamp,
        kind: directKindMap[topType],
        turnId: raw.turnId || payload.turnId || payload.turn_id || null,
        callId: raw.callId || payload.callId || payload.call_id || null,
        requestId: raw.requestId || payload.requestId || payload.request_id || null,
        messageId: raw.messageId || payload.messageId || payload.message_id || null,
        role: raw.role || payload.role || null,
        phase: raw.phase || payload.phase || null,
        payload: normalizeDirectSemanticPayload(topType, raw, payload)
      };
    }
    if (topType === "session_meta" || topType === "turn_context") {
      return null;
    }
    if (topType === "response_item") {
      if (payloadType === "message") {
        const role = String(payload.role || "");
        const phase = payload.phase || null;
        const text = normalizeMessageContent(payload.content);
        if (role === "user") {
          return {
            id: normalizeId(raw, "user"),
            seq,
            timestamp,
            kind: "user_message",
            turnId: pickTurnId(payload),
            callId: null,
            requestId: null,
            messageId: pickMessageId(payload),
            role: "user",
            phase: null,
            payload: {
              text: normalizeUserVisibleText(text),
              source: "response_item.message",
              raw: payload
            }
          };
        }
        if (role === "assistant") {
          return {
            id: normalizeId(raw, "assistant"),
            seq,
            timestamp,
            kind: "assistant_message",
            turnId: pickTurnId(payload),
            callId: null,
            requestId: null,
            messageId: pickMessageId(payload),
            role: "assistant",
            phase: phase || "final_answer",
            payload: {
              text,
              source: "response_item.message",
              raw: payload
            }
          };
        }
        return null;
      }
      if (payloadType === "reasoning") {
        return {
          id: normalizeId(raw, "reasoning"),
          seq,
          timestamp,
          kind: "reasoning",
          turnId: pickTurnId(payload),
          callId: null,
          requestId: null,
          messageId: pickMessageId(payload),
          role: "assistant",
          phase: "commentary",
          payload: {
            summary: (payload == null ? void 0 : payload.summary) || null,
            content: (payload == null ? void 0 : payload.content) || null,
            encryptedContent: (payload == null ? void 0 : payload.encrypted_content) || null,
            raw: payload
          }
        };
      }
      if (payloadType === "function_call" && (payload == null ? void 0 : payload.name) === "exec_command") {
        const args = normalizeFunctionCallArguments(payload);
        return {
          id: normalizeId(raw, "command-start"),
          seq,
          timestamp,
          kind: "command_start",
          turnId: pickTurnId(payload) || args.turnId || null,
          callId: pickCallId(payload),
          requestId: pickRequestId(payload) || null,
          messageId: null,
          role: "assistant",
          phase: "commentary",
          payload: {
            name: payload.name,
            command: args.cmd || "",
            sandboxPermissions: args.sandbox_permissions || null,
            justification: args.justification || null,
            cwd: args.cwd || null,
            args,
            raw: payload
          }
        };
      }
      if (payloadType === "function_call" && (payload == null ? void 0 : payload.name) === "update_plan") {
        return {
          id: normalizeId(raw, "plan-update"),
          seq,
          timestamp,
          kind: "plan_update",
          turnId: pickTurnId(payload),
          callId: pickCallId(payload),
          requestId: null,
          messageId: null,
          role: "assistant",
          phase: "commentary",
          payload: normalizePlanUpdate(payload)
        };
      }
      if (payloadType === "function_call_output") {
        return {
          id: normalizeId(raw, "command-end"),
          seq,
          timestamp,
          kind: "command_end",
          turnId: pickTurnId(payload),
          callId: pickCallId(payload),
          requestId: pickRequestId(payload),
          messageId: null,
          role: "assistant",
          phase: "commentary",
          payload: normalizeFunctionCallOutput(payload)
        };
      }
      if (payloadType === "custom_tool_call" && (payload == null ? void 0 : payload.name) === "apply_patch") {
        return {
          id: normalizeId(raw, "patch-start"),
          seq,
          timestamp,
          kind: "patch_start",
          turnId: pickTurnId(payload),
          callId: pickCallId(payload),
          requestId: null,
          messageId: null,
          role: "assistant",
          phase: "commentary",
          payload: {
            name: payload.name,
            status: payload.status || null,
            input: payload.input || "",
            raw: payload
          }
        };
      }
      if (payloadType === "custom_tool_call_output") {
        return {
          id: normalizeId(raw, "patch-end"),
          seq,
          timestamp,
          kind: "patch_end",
          turnId: pickTurnId(payload),
          callId: pickCallId(payload),
          requestId: null,
          messageId: null,
          role: "assistant",
          phase: "commentary",
          payload: normalizeCustomToolOutput(payload)
        };
      }
      return null;
    }
    if (topType === "event_msg") {
      if (payloadType === "user_message") {
        return {
          id: normalizeId(raw, "user"),
          seq,
          timestamp,
          kind: "user_message",
          turnId: pickTurnId(payload),
          callId: null,
          requestId: null,
          messageId: pickMessageId(payload),
          role: "user",
          phase: null,
          payload: {
            text: normalizeUserVisibleText((payload == null ? void 0 : payload.message) || ""),
            images: Array.isArray(payload == null ? void 0 : payload.images) ? payload.images : [],
            localImages: Array.isArray(payload == null ? void 0 : payload.local_images) ? payload.local_images : [],
            source: "event_msg.user_message",
            raw: payload
          }
        };
      }
      if (payloadType === "agent_message") {
        return {
          id: normalizeId(raw, "assistant"),
          seq,
          timestamp,
          kind: "assistant_message",
          turnId: pickTurnId(payload),
          callId: null,
          requestId: null,
          messageId: pickMessageId(payload),
          role: "assistant",
          phase: (payload == null ? void 0 : payload.phase) || "final_answer",
          payload: {
            text: (payload == null ? void 0 : payload.message) || "",
            memoryCitation: (payload == null ? void 0 : payload.memory_citation) || null,
            source: "event_msg.agent_message",
            raw: payload
          }
        };
      }
      if (payloadType === "task_started") {
        return {
          id: normalizeId(raw, "turn-start"),
          seq,
          timestamp,
          kind: "turn_started",
          turnId: pickTurnId(payload),
          callId: null,
          requestId: null,
          messageId: null,
          role: null,
          phase: null,
          payload: {
            modelContextWindow: (payload == null ? void 0 : payload.model_context_window) || null,
            collaborationModeKind: (payload == null ? void 0 : payload.collaboration_mode_kind) || null,
            raw: payload
          }
        };
      }
      if (payloadType === "task_complete") {
        return {
          id: normalizeId(raw, "turn-complete"),
          seq,
          timestamp,
          kind: "turn_completed",
          turnId: pickTurnId(payload),
          callId: null,
          requestId: null,
          messageId: null,
          role: null,
          phase: null,
          payload: {
            lastAgentMessage: (payload == null ? void 0 : payload.last_agent_message) || "",
            raw: payload
          }
        };
      }
      if (payloadType === "turn_aborted") {
        return {
          id: normalizeId(raw, "turn-aborted"),
          seq,
          timestamp,
          kind: "turn_aborted",
          turnId: pickTurnId(payload),
          callId: null,
          requestId: null,
          messageId: null,
          role: null,
          phase: null,
          payload: {
            reason: (payload == null ? void 0 : payload.reason) || null,
            raw: payload
          }
        };
      }
      if (payloadType === "exec_command_end") {
        return {
          id: normalizeId(raw, "command-end"),
          seq,
          timestamp,
          kind: "command_end",
          turnId: pickTurnId(payload),
          callId: pickCallId(payload),
          requestId: null,
          messageId: null,
          role: null,
          phase: null,
          payload: normalizeExecCommandEnd(payload)
        };
      }
      if (payloadType === "patch_apply_end") {
        return {
          id: normalizeId(raw, "patch-end"),
          seq,
          timestamp,
          kind: "patch_end",
          turnId: pickTurnId(payload),
          callId: pickCallId(payload),
          requestId: null,
          messageId: null,
          role: null,
          phase: null,
          payload: normalizePatchEnd(payload)
        };
      }
      if (payloadType === "error") {
        return {
          id: normalizeId(raw, "error"),
          seq,
          timestamp,
          kind: "error",
          turnId: pickTurnId(payload),
          callId: pickCallId(payload),
          requestId: pickRequestId(payload),
          messageId: null,
          role: null,
          phase: null,
          payload: {
            message: (payload == null ? void 0 : payload.message) || "",
            code: (payload == null ? void 0 : payload.codex_error_info) || null,
            raw: payload
          }
        };
      }
      if (payloadType === "token_count") {
        return {
          id: normalizeId(raw, "token-count"),
          seq,
          timestamp,
          kind: "token_count",
          turnId: pickTurnId(payload),
          callId: null,
          requestId: null,
          messageId: null,
          role: null,
          phase: null,
          payload: normalizeTokenCount(payload)
        };
      }
    }
    return null;
  }
  function expandOneShotNormalizedEvent(event) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    if (!event) {
      return [];
    }
    if (event.kind === "assistant_message") {
      const messageId = event.messageId || `assistant:${event.id}`;
      const base = __spreadProps(__spreadValues({}, event), {
        messageId
      });
      return [
        __spreadProps(__spreadValues({}, base), {
          id: `${event.id}:start`,
          kind: "assistant_message_start",
          payload: { raw: ((_a = event.payload) == null ? void 0 : _a.raw) || event.payload || {} }
        }),
        __spreadProps(__spreadValues({}, base), {
          id: `${event.id}:delta`,
          kind: "assistant_message_delta",
          payload: {
            textDelta: ((_b = event.payload) == null ? void 0 : _b.text) || "",
            raw: ((_c = event.payload) == null ? void 0 : _c.raw) || event.payload || {}
          }
        }),
        __spreadProps(__spreadValues({}, base), {
          id: `${event.id}:end`,
          kind: "assistant_message_end",
          payload: { raw: ((_d = event.payload) == null ? void 0 : _d.raw) || event.payload || {} }
        })
      ];
    }
    if (event.kind === "reasoning") {
      const messageId = event.messageId || `reasoning:${event.id}`;
      const reasoningText = ((_e = event.payload) == null ? void 0 : _e.content) || ((_f = event.payload) == null ? void 0 : _f.summary) || ((_g = event.payload) == null ? void 0 : _g.text) || "";
      return [
        __spreadProps(__spreadValues({}, event), {
          id: `${event.id}:start`,
          kind: "reasoning_start",
          messageId,
          payload: {
            summary: ((_h = event.payload) == null ? void 0 : _h.summary) || "",
            raw: ((_i = event.payload) == null ? void 0 : _i.raw) || event.payload || {}
          }
        }),
        __spreadProps(__spreadValues({}, event), {
          id: `${event.id}:delta`,
          kind: "reasoning_delta",
          messageId,
          payload: {
            textDelta: reasoningText,
            summary: ((_j = event.payload) == null ? void 0 : _j.summary) || "",
            raw: ((_k = event.payload) == null ? void 0 : _k.raw) || event.payload || {}
          }
        }),
        __spreadProps(__spreadValues({}, event), {
          id: `${event.id}:end`,
          kind: "reasoning_end",
          messageId,
          payload: { raw: ((_l = event.payload) == null ? void 0 : _l.raw) || event.payload || {} }
        })
      ];
    }
    return [event];
  }
  function normalizeRawSessionEvents(list) {
    if (!Array.isArray(list)) {
      return [];
    }
    return list.flatMap((raw) => expandOneShotNormalizedEvent(normalizeRawSessionEvent(raw))).filter(Boolean).sort((a, b) => a.seq - b.seq);
  }

  // package/web/message-rich-text.js
  function escapeHtml3(value) {
    return String(value != null ? value : "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  var LOCAL_FILE_API_PREFIX = "/api/local-file?path=";
  function trimLocalFileReference(value) {
    let next = String(value || "").trim();
    if (!next) {
      return "";
    }
    next = next.replace(/[?#].*$/, "");
    for (let index = 0; index < 2; index += 1) {
      const match = next.match(/^(.*):(\d+)$/);
      if (!match) {
        break;
      }
      const head = String(match[1] || "");
      if (/^[A-Za-z]:$/.test(head)) {
        break;
      }
      next = head;
    }
    return next.trim();
  }
  function normalizeLocalFileHref(href) {
    const value = String(href || "").trim();
    if (!value) {
      return null;
    }
    let candidate = value;
    if (/^file:\/\//i.test(candidate)) {
      try {
        const url = new URL(candidate);
        if (url.protocol.toLowerCase() !== "file:") {
          return null;
        }
        candidate = decodeURIComponent(`${url.host ? `//${url.host}` : ""}${url.pathname || ""}`);
      } catch (e) {
        return null;
      }
    }
    if (/^\/[A-Za-z]:[\\/]/.test(candidate)) {
      candidate = candidate.slice(1);
    }
    candidate = trimLocalFileReference(candidate);
    if (!candidate) {
      return null;
    }
    const isWindowsAbsolute = /^[A-Za-z]:[\\/]/.test(candidate) || /^\\\\[^\\]+\\[^\\]+/.test(candidate);
    const isPosixAbsolute = /^\/(?!\/)/.test(candidate);
    if (!isWindowsAbsolute && !isPosixAbsolute) {
      return null;
    }
    return `${LOCAL_FILE_API_PREFIX}${encodeURIComponent(candidate)}`;
  }
  function prepareMarkdownSource(text, options = {}) {
    const raw = String(text != null ? text : "");
    if (!raw.trim()) {
      return "";
    }
    let prepared = raw.replace(/\r\n?/g, "\n");
    prepared = prepared.replace(
      /([^\n])\n(?=(?:\s{0,3}(?:[-*+]|\d+\.)\s+|\s{0,3}>|\s{0,3}```|\s{0,3}#{1,6}\s))/g,
      "$1\n\n"
    );
    if (!options.streaming) {
      return prepared;
    }
    const fenceMatches = prepared.match(/^\s*```.*$/gm) || [];
    if (fenceMatches.length % 2 === 1) {
      prepared += "\n```";
    }
    const backtickCount = (prepared.match(/`/g) || []).length;
    if (backtickCount % 2 === 1) {
      prepared += "`";
    }
    const doubleStarCount = (prepared.match(/\*\*/g) || []).length;
    if (doubleStarCount % 2 === 1) {
      prepared += "**";
    }
    const singleStarLike = prepared.replace(/\*\*/g, "");
    const singleStarCount = (singleStarLike.match(/\*/g) || []).length;
    if (singleStarCount % 2 === 1) {
      prepared += "*";
    }
    prepared = prepared.replace(/([^\n])\n(?=\s{0,3}>\s?)/g, "$1\n\n");
    return prepared;
  }
  function renderPlainText(text, options) {
    const value = String(text || "");
    if (!value) {
      return "";
    }
    if (typeof options.renderText === "function") {
      return options.renderText(value);
    }
    return escapeHtml3(value);
  }
  function renderCodeText(text, options) {
    const value = String(text || "");
    if (!value) {
      return "";
    }
    if (typeof options.renderCodeText === "function") {
      return options.renderCodeText(value);
    }
    return renderPlainText(value, options);
  }
  function sanitizeHref(href) {
    const value = String(href || "").trim();
    if (!value) {
      return null;
    }
    const localFileHref = normalizeLocalFileHref(value);
    if (localFileHref) {
      return localFileHref;
    }
    if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || value.startsWith("#") || /^https?:\/\//i.test(value)) {
      return value;
    }
    return null;
  }
  function getMarkdownItFactory() {
    const factory = globalThis.markdownit;
    if (typeof factory !== "function") {
      throw new Error("markdown-it is not loaded.");
    }
    return factory;
  }
  function renderDefaultCodeBlock(block, options) {
    const lang = String(block.lang || "").trim() || "text";
    const code = String(block.text || "").replace(/\n$/, "");
    return `<div class="msg-md-code-block"><pre class="msg-md-pre"><code class="msg-md-code">${renderCodeText(code, options)}</code></pre></div>`;
  }
  function createMarkdownRenderer(options) {
    const MarkdownIt = getMarkdownItFactory();
    const md = MarkdownIt({
      html: false,
      linkify: true,
      breaks: true
    });
    md.validateLink = (url) => Boolean(sanitizeHref(url));
    const linkStack = [];
    md.renderer.rules.paragraph_open = () => '<p class="msg-md-p">';
    md.renderer.rules.paragraph_close = () => "</p>";
    md.renderer.rules.bullet_list_open = () => '<ul class="msg-md-ul">';
    md.renderer.rules.bullet_list_close = () => "</ul>";
    md.renderer.rules.ordered_list_open = () => '<ol class="msg-md-ol">';
    md.renderer.rules.ordered_list_close = () => "</ol>";
    md.renderer.rules.list_item_open = () => '<li class="msg-md-li">';
    md.renderer.rules.list_item_close = () => "</li>";
    md.renderer.rules.blockquote_open = () => '<blockquote class="msg-md-bq">';
    md.renderer.rules.blockquote_close = () => "</blockquote>";
    md.renderer.rules.softbreak = () => "<br>";
    md.renderer.rules.hardbreak = () => "<br>";
    md.renderer.rules.text = (tokens, idx) => renderPlainText(tokens[idx].content || "", options);
    md.renderer.rules.code_inline = (tokens, idx) => `<code class="msg-md-code-inline">${renderCodeText(tokens[idx].content || "", options)}</code>`;
    md.renderer.rules.fence = (tokens, idx) => {
      const token = tokens[idx];
      const block = {
        lang: String(token.info || "").trim(),
        text: token.content || ""
      };
      if (typeof options.renderCodeBlock === "function") {
        return options.renderCodeBlock(block, {
          escapeHtml: escapeHtml3,
          renderCodeText: (value) => renderCodeText(value, options)
        });
      }
      return renderDefaultCodeBlock(block, options);
    };
    md.renderer.rules.code_block = (tokens, idx) => {
      const token = tokens[idx];
      const block = {
        lang: "",
        text: token.content || ""
      };
      if (typeof options.renderCodeBlock === "function") {
        return options.renderCodeBlock(block, {
          escapeHtml: escapeHtml3,
          renderCodeText: (value) => renderCodeText(value, options)
        });
      }
      return renderDefaultCodeBlock(block, options);
    };
    md.renderer.rules.link_open = (tokens, idx) => {
      const href = sanitizeHref(tokens[idx].attrGet("href"));
      if (!href) {
        linkStack.push("span");
        return '<span class="msg-md-a">';
      }
      linkStack.push("a");
      return `<a class="msg-md-a" href="${escapeHtml3(href)}" target="_blank" rel="noreferrer noopener">`;
    };
    md.renderer.rules.link_close = () => {
      const tag = linkStack.pop() || "a";
      return tag === "span" ? "</span>" : "</a>";
    };
    md.renderer.rules.image = (tokens, idx) => {
      const token = tokens[idx];
      const alt = token.content || token.attrGet("alt") || "";
      return renderPlainText(alt, options);
    };
    return md;
  }
  var defaultRenderer = null;
  function getDefaultRenderer() {
    if (!defaultRenderer) {
      defaultRenderer = createMarkdownRenderer({});
    }
    return defaultRenderer;
  }
  function renderRichText(text, options = {}) {
    const source = prepareMarkdownSource(text, options);
    if (!source) return "";
    const renderer = Object.keys(options).length === 0 ? getDefaultRenderer() : createMarkdownRenderer(options);
    return renderer.render(source);
  }

  // package/web/session-command-activity.js
  function stripShellWrapper(command) {
    let current = String(command || "").trim();
    while (true) {
      const match = current.match(
        /^(?:\/bin\/)?(?:zsh|bash|sh)\s+-lc\s+(['"])([\s\S]*)\1$/
      );
      if (!match) {
        return current;
      }
      current = match[2].trim();
    }
  }
  function tokenizeShell(command) {
    const source = stripShellWrapper(command);
    const tokens = [];
    let current = "";
    let quote = "";
    let escapeNext = false;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (escapeNext) {
        current += char;
        escapeNext = false;
        continue;
      }
      if (char === "\\") {
        escapeNext = true;
        continue;
      }
      if (quote) {
        if (char === quote) {
          quote = "";
        } else {
          current += char;
        }
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (/\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = "";
        }
        continue;
      }
      current += char;
    }
    if (current) {
      tokens.push(current);
    }
    return tokens;
  }
  function getCommandContext(command) {
    const normalized = stripShellWrapper(command);
    const tokens = tokenizeShell(command);
    let offset = 0;
    while (offset < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[offset] || "")) {
      offset += 1;
    }
    if (tokens[offset] === "env") {
      offset += 1;
      while (offset < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[offset] || "")) {
        offset += 1;
      }
    }
    const primary = tokens[offset] || "";
    const commandName = basename(primary);
    const subcommand = commandName === "git" ? tokens[offset + 1] || "" : "";
    return {
      normalized,
      tokens,
      offset,
      primary,
      commandName,
      subcommand
    };
  }
  function isOptionToken(token) {
    return /^-/.test(token || "");
  }
  function isLikelyPathToken(token) {
    if (!token || isOptionToken(token)) {
      return false;
    }
    if (/^\d+$/.test(token)) {
      return false;
    }
    if (token === "|" || token === "||" || token === "&&" || token === ">" || token === ">>" || token === "<") {
      return false;
    }
    return true;
  }
  function pushUnique(list, value) {
    if (!value || list.includes(value)) {
      return;
    }
    list.push(value);
  }
  function basename(path) {
    const value = String(path || "").replace(/\/+$/, "");
    if (!value) {
      return "";
    }
    const parts = value.split("/");
    return parts[parts.length - 1] || value;
  }
  function extractSearchFiles(tokens, startIndex, options = {}) {
    const consumingOptions = new Set(options.consumingOptions || []);
    const patternOptions = new Set(options.patternOptions || []);
    let patternConsumed = false;
    const files = [];
    let stopOptionParsing = false;
    for (let index = startIndex; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (!token) {
        continue;
      }
      if (token === "--") {
        stopOptionParsing = true;
        continue;
      }
      if (!stopOptionParsing && isOptionToken(token)) {
        const optionName = token.includes("=") ? token.split("=")[0] : token;
        if (patternOptions.has(optionName)) {
          patternConsumed = true;
        }
        if (consumingOptions.has(optionName) && !token.includes("=")) {
          index += 1;
        }
        continue;
      }
      if (!patternConsumed) {
        patternConsumed = true;
        continue;
      }
      if (isLikelyPathToken(token)) {
        pushUnique(files, token);
      }
    }
    return files;
  }
  function extractBrowseFiles(context) {
    const { primary, tokens, offset } = context;
    const files = [];
    if (["sed", "cat", "head", "tail", "nl", "wc", "stat"].includes(primary)) {
      for (let index = tokens.length - 1; index > offset; index -= 1) {
        const token = tokens[index];
        if (isLikelyPathToken(token)) {
          pushUnique(files, token);
          break;
        }
      }
      return files;
    }
    if (primary === "ls" || primary === "tree") {
      for (let index = offset + 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (isLikelyPathToken(token)) {
          pushUnique(files, token);
        }
      }
      return files;
    }
    return files;
  }
  function extractEditFiles(context) {
    const { primary, tokens, offset } = context;
    const files = [];
    if (primary === "touch") {
      for (let index = offset + 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (isLikelyPathToken(token)) {
          pushUnique(files, token);
        }
      }
      return files;
    }
    if (primary === "sed" && tokens.includes("-i")) {
      for (let index = tokens.length - 1; index > offset; index -= 1) {
        const token = tokens[index];
        if (isLikelyPathToken(token)) {
          pushUnique(files, token);
          break;
        }
      }
      return files;
    }
    if (primary === "apply_patch") {
      return files;
    }
    return files;
  }
  function collectPatchFileStats(item) {
    const changes = (item == null ? void 0 : item.changes) && typeof item.changes === "object" ? item.changes : {};
    const fileStats = [];
    Object.entries(changes).forEach(([path, change]) => {
      const added = Number((change == null ? void 0 : change.added) || 0);
      const removed = Number((change == null ? void 0 : change.removed) || 0);
      fileStats.push({
        path,
        added: Number.isFinite(added) ? added : 0,
        removed: Number.isFinite(removed) ? removed : 0
      });
    });
    if (fileStats.length > 0) {
      return fileStats;
    }
    const patchText = String((item == null ? void 0 : item.patchText) || "");
    if (!patchText) {
      return [];
    }
    const fileMap = /* @__PURE__ */ new Map();
    let currentPath = null;
    function ensureFile(path) {
      const normalizedPath = String(path || "").trim();
      if (!normalizedPath || normalizedPath === "/dev/null") {
        return null;
      }
      const existing = fileMap.get(normalizedPath) || {
        path: normalizedPath,
        added: 0,
        removed: 0
      };
      fileMap.set(normalizedPath, existing);
      return existing;
    }
    patchText.split("\n").forEach((line) => {
      const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (diffMatch) {
        currentPath = diffMatch[2];
        ensureFile(currentPath);
        return;
      }
      const nextFileMatch = line.match(/^\+\+\+ (?:b\/)?(.+)$/);
      if (nextFileMatch && nextFileMatch[1] !== "/dev/null") {
        currentPath = nextFileMatch[1];
        ensureFile(currentPath);
        return;
      }
      if (line.startsWith("@@")) {
        ensureFile(currentPath);
        return;
      }
      if (line.startsWith("+") && !line.startsWith("+++")) {
        const current = ensureFile(currentPath);
        if (current) {
          current.added += 1;
        }
        return;
      }
      if (line.startsWith("-") && !line.startsWith("---")) {
        const current = ensureFile(currentPath);
        if (current) {
          current.removed += 1;
        }
      }
    });
    if (fileMap.size === 0) {
      currentPath = null;
      patchText.split("\n").forEach((line) => {
        const patchFileMatch = line.match(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/);
        if (patchFileMatch) {
          currentPath = patchFileMatch[1].trim();
          ensureFile(currentPath);
          return;
        }
        if (!currentPath) {
          return;
        }
        if (line.startsWith("*** ")) {
          currentPath = null;
          return;
        }
        if (line.startsWith("+")) {
          const current = ensureFile(currentPath);
          if (current) {
            current.added += 1;
          }
          return;
        }
        if (line.startsWith("-")) {
          const current = ensureFile(currentPath);
          if (current) {
            current.removed += 1;
          }
        }
      });
    }
    return Array.from(fileMap.values());
  }
  function collectPatchFileStatsFromOutput(item) {
    const output = String((item == null ? void 0 : item.output) || (item == null ? void 0 : item.stdout) || "");
    if (!output) {
      return [];
    }
    const fileMap = /* @__PURE__ */ new Map();
    const lines = output.split("\n");
    lines.forEach((line) => {
      const match = line.match(/^[AMD]\s+(.+)$/);
      if (!match) {
        return;
      }
      const path = match[1].trim();
      if (!path) {
        return;
      }
      fileMap.set(path, {
        path,
        added: 0,
        removed: 0
      });
    });
    return Array.from(fileMap.values());
  }
  function collectFileStatsForItem(item, classification) {
    if ((item == null ? void 0 : item.type) === "patch" || classification.kind === "edit") {
      const fileStats = collectPatchFileStats(item);
      if (fileStats.length > 0) {
        return fileStats;
      }
      const outputFileStats = collectPatchFileStatsFromOutput(item);
      if (outputFileStats.length > 0) {
        return outputFileStats;
      }
    }
    return (classification.files || []).map((path) => ({
      path,
      added: 0,
      removed: 0
    }));
  }
  function getOutputLength(item) {
    return [
      item == null ? void 0 : item.output,
      item == null ? void 0 : item.stdout,
      item == null ? void 0 : item.stderr,
      item == null ? void 0 : item.patchText
    ].map((value) => String(value || "")).join("").length;
  }
  function hasFailureLikeOutput(item) {
    const output = [item == null ? void 0 : item.output, item == null ? void 0 : item.stdout, item == null ? void 0 : item.stderr, item == null ? void 0 : item.patchText].map((value) => String(value || "")).join("\n");
    if (!output.trim()) {
      return false;
    }
    return false;
  }
  function getDurationMs(item) {
    var _a, _b;
    const value = Number((_b = (_a = item == null ? void 0 : item.durationMs) != null ? _a : item == null ? void 0 : item.duration) != null ? _b : 0);
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    if (value >= 1e3) {
      return value;
    }
    return value * 1e3;
  }
  function extractCommandFiles(command) {
    const context = getCommandContext(command);
    const { primary, commandName, subcommand, offset, tokens } = context;
    if (!primary) {
      return [];
    }
    if (commandName === "git" && subcommand === "grep") {
      return extractSearchFiles(tokens, offset + 2, {
        consumingOptions: [
          "-e",
          "-f",
          "-m",
          "-A",
          "-B",
          "-C",
          "--exclude",
          "--exclude-from",
          "--exclude-dir",
          "--include"
        ],
        patternOptions: ["-e", "-f"]
      });
    }
    if (["rg", "grep", "fd"].includes(commandName)) {
      return extractSearchFiles(tokens, offset + 1, {
        consumingOptions: commandName === "fd" ? ["-e", "-E", "-x", "-X", "-g", "-t", "-T", "--glob", "--type", "--exclude"] : [
          "-e",
          "-f",
          "-g",
          "-t",
          "-T",
          "-m",
          "-M",
          "--glob",
          "--type",
          "--type-not",
          "--max-count",
          "--max-filesize",
          "--ignore-file",
          "--pre",
          "--replace",
          "--sort",
          "--sortr",
          "--colors"
        ],
        patternOptions: commandName === "fd" ? ["-g", "--glob"] : ["-e", "-f"]
      });
    }
    if (commandName === "find") {
      for (let index = offset + 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (isLikelyPathToken(token) && !isOptionToken(token)) {
          return [token];
        }
      }
      return [];
    }
    if (["sed", "cat", "head", "tail", "nl", "wc", "stat", "ls", "tree"].includes(commandName)) {
      return extractBrowseFiles(context);
    }
    if (["touch"].includes(commandName) || commandName === "sed" && tokens.includes("-i")) {
      return extractEditFiles(context);
    }
    return [];
  }
  function classifyCommandActivity(item) {
    if (!item) {
      return {
        kind: "unknown",
        important: true,
        files: [],
        searchCount: 0,
        browseCount: 0,
        summaryLabel: "",
        stats: { added: 0, removed: 0 }
      };
    }
    if (item.type === "patch") {
      const fileStats = collectPatchFileStats(item).length > 0 ? collectPatchFileStats(item) : collectPatchFileStatsFromOutput(item);
      const files2 = fileStats.map((entry) => entry.path);
      const stats2 = fileStats.reduce(
        (acc, entry) => ({
          added: acc.added + entry.added,
          removed: acc.removed + entry.removed
        }),
        { added: 0, removed: 0 }
      );
      const classification2 = {
        kind: "edit",
        important: false,
        files: files2,
        searchCount: 0,
        browseCount: 0,
        summaryLabel: files2.length > 1 ? t("activity.edit.multiple", { count: files2.length }) : t("activity.edit.single"),
        stats: stats2
      };
      classification2.important = isImportantCommandActivity(item, classification2);
      return classification2;
    }
    const context = getCommandContext(item.command || "");
    const { primary, commandName, subcommand, normalized, tokens, offset } = context;
    const files = extractCommandFiles(item.command || "");
    let kind = "unknown";
    let searchCount = 0;
    let browseCount = 0;
    let summaryLabel = "";
    let stats = { added: 0, removed: 0 };
    if (commandName === "git" && subcommand === "grep") {
      kind = "search";
    } else if (["rg", "grep", "fd"].includes(commandName)) {
      kind = "search";
    } else if (commandName === "find" && /(?:^|\s)find(?:\s|$)/.test(normalized)) {
      kind = "search";
    } else if (["sed", "cat", "head", "tail", "nl", "ls", "tree", "wc", "stat"].includes(commandName)) {
      kind = "browse";
    } else if (commandName === "node" && tokens.includes("--check") || commandName === "tsc" && tokens.includes("--noEmit") || commandName === "eslint" || commandName === "prettier" && tokens.includes("--check") || commandName === "vitest" || commandName === "jest" || (commandName === "npm" || commandName === "pnpm") && tokens[offset + 1] === "test") {
      kind = "validation";
    } else if (commandName === "apply_patch") {
      kind = "edit";
    } else if (commandName === "touch" || commandName === "sed" && tokens.includes("-i")) {
      kind = "edit";
    } else if (commandName === "git") {
      kind = "git";
    } else if (primary) {
      kind = "run";
    }
    if (kind === "search") {
      searchCount = 1;
      summaryLabel = t("activity.search");
    } else if (kind === "browse") {
      browseCount = files.length || 1;
      summaryLabel = files.length > 1 ? t("activity.browse.multiple", { count: files.length }) : t("activity.browse.single");
    } else if (kind === "edit") {
      const fileStats = collectFileStatsForItem(item, { kind, files });
      files.splice(0, files.length, ...fileStats.map((entry) => entry.path));
      stats = fileStats.reduce(
        (acc, entry) => ({
          added: acc.added + entry.added,
          removed: acc.removed + entry.removed
        }),
        { added: 0, removed: 0 }
      );
      summaryLabel = files.length > 1 ? t("activity.edit.multiple", { count: files.length }) : t("activity.edit.single");
    } else if (kind === "validation") {
      summaryLabel = t("activity.validation.completed");
    }
    const classification = {
      kind,
      important: false,
      files,
      searchCount,
      browseCount,
      summaryLabel,
      stats
    };
    classification.important = isImportantCommandActivity(item, classification);
    return classification;
  }
  function isImportantCommandActivity(item, classification) {
    if (!item) {
      return true;
    }
    if (item.status === "running" || item.outputStatus === "streaming" || item.status === "awaiting_approval") {
      return true;
    }
    if (item.status === "failed" || item.status === "rejected" || item.success === false) {
      return true;
    }
    if (Number.isFinite(Number(item.exitCode)) && Number(item.exitCode) !== 0) {
      return true;
    }
    if (String(item.stderr || "").trim()) {
      return true;
    }
    if ((classification == null ? void 0 : classification.kind) === "edit") {
      return classification.files.length === 0;
    }
    if (getOutputLength(item) > 800) {
      return true;
    }
    if (getDurationMs(item) > 8e3) {
      return true;
    }
    if (!classification || ["unknown", "run", "git"].includes(classification.kind)) {
      return true;
    }
    return false;
  }
  function resolveDisplayState(item) {
    if ((item == null ? void 0 : item.status) === "running" || (item == null ? void 0 : item.outputStatus) === "streaming" || (item == null ? void 0 : item.status) === "awaiting_approval") {
      return "running";
    }
    if ((item == null ? void 0 : item.status) === "failed" || (item == null ? void 0 : item.status) === "rejected" || (item == null ? void 0 : item.success) === false || hasFailureLikeOutput(item) || String((item == null ? void 0 : item.stderr) || "").trim() || Number.isFinite(Number(item == null ? void 0 : item.exitCode)) && Number(item.exitCode) !== 0) {
      return "failed";
    }
    return "completed";
  }
  function summarizePaths(paths) {
    const values = Array.isArray(paths) ? paths.filter(Boolean) : [];
    if (values.length === 0) {
      return "";
    }
    if (values.length === 1) {
      return values[0];
    }
    return `${values[0]} ${t("timeline.summary.moreItems", { count: values.length })}`;
  }
  function resolveActivityDisplay(item, classification) {
    var _a;
    const kind = (classification == null ? void 0 : classification.kind) || "unknown";
    const state2 = resolveDisplayState(item);
    const titleMap = {
      edit: {
        running: t("activity.running.edit"),
        failed: t("activity.failed.edit"),
        completed: t("activity.completed.edit")
      },
      search: {
        running: t("activity.running.search"),
        failed: t("activity.failed.search"),
        completed: t("activity.completed.search")
      },
      browse: {
        running: t("activity.running.browse"),
        failed: t("activity.failed.browse"),
        completed: t("activity.completed.browse")
      },
      validation: {
        running: t("activity.running.validation"),
        failed: t("activity.failed.validation"),
        completed: t("activity.completed.validation")
      },
      git: {
        running: t("activity.running.git"),
        failed: t("activity.failed.git"),
        completed: t("activity.completed.git")
      },
      run: {
        running: t("activity.running.run"),
        failed: t("activity.failed.run"),
        completed: t("activity.completed.run")
      },
      unknown: {
        running: t("activity.running.run"),
        failed: t("activity.failed.run"),
        completed: t("activity.completed.run")
      }
    };
    let subtitle = "";
    if (kind === "search") {
      subtitle = summarizePaths((classification == null ? void 0 : classification.files) || []) || (item == null ? void 0 : item.cwd) || "";
    } else if (kind === "browse" || kind === "edit") {
      subtitle = summarizePaths((classification == null ? void 0 : classification.files) || []);
    } else if (kind === "validation") {
      subtitle = (item == null ? void 0 : item.cwd) || "";
    }
    return {
      title: ((_a = titleMap[kind]) == null ? void 0 : _a[state2]) || titleMap.unknown[state2],
      subtitle,
      showRawCommandAsBody: (item == null ? void 0 : item.type) === "command"
    };
  }
  function createActivityGroup(item, classification) {
    return {
      groupType: classification.kind === "edit" ? "file_change_summary" : "activity_summary",
      turnId: item.turnId || null,
      seq: item.seq,
      timestamp: item.timestamp,
      rawItems: [],
      browseFiles: [],
      browseCommandCount: 0,
      searchTargets: [],
      searchCount: 0,
      validationCount: 0,
      commandsCount: 0,
      files: [],
      fileMap: /* @__PURE__ */ new Map()
    };
  }
  function addToActivityGroup(group, item, classification) {
    group.rawItems.push(item);
    group.commandsCount += 1;
    if (group.groupType === "activity_summary") {
      if (classification.kind === "browse") {
        group.browseCommandCount += 1;
        classification.files.forEach((path) => pushUnique(group.browseFiles, path));
      }
      if (classification.kind === "search") {
        group.searchCount += Math.max(1, classification.searchCount || 0);
        const targets = classification.files.length > 0 ? classification.files : item.cwd ? [item.cwd] : [];
        targets.forEach((path) => pushUnique(group.searchTargets, path));
      }
      if (classification.kind === "validation") {
        group.validationCount += 1;
        if (item.cwd) {
          pushUnique(group.searchTargets, item.cwd);
        }
      }
      return;
    }
    collectFileStatsForItem(item, classification).forEach((entry) => {
      const current = group.fileMap.get(entry.path) || {
        path: entry.path,
        added: 0,
        removed: 0
      };
      current.added += entry.added;
      current.removed += entry.removed;
      group.fileMap.set(entry.path, current);
      if (!group.files.includes(entry.path)) {
        group.files.push(entry.path);
      }
    });
  }
  function buildActivitySummaryItem(group) {
    const browseCount = group.browseFiles.length || group.browseCommandCount;
    const titleParts = [];
    if (browseCount > 0) {
      titleParts.push(t("timeline.browse.completed", { count: browseCount }));
    }
    if (group.searchCount > 0) {
      titleParts.push(t("timeline.search.completed", { count: group.searchCount }));
    }
    if (group.validationCount > 0) {
      titleParts.push(t("timeline.validation.completed", { count: group.validationCount }));
    }
    let title = formatInlineList(titleParts);
    if (!title) {
      title = t("timeline.executedActivities", { count: group.commandsCount });
    }
    return {
      id: `activity-summary:${group.turnId || "none"}:${group.seq}`,
      type: "activity_summary",
      turnId: group.turnId,
      seq: group.seq,
      timestamp: group.timestamp,
      summary: {
        browseFiles: group.browseFiles,
        browseCount,
        searchTargets: group.searchTargets,
        searchCount: group.searchCount,
        validationCount: group.validationCount,
        commandsCount: group.commandsCount,
        title
      },
      rawItems: group.rawItems
    };
  }
  function buildFileChangeSummaryItem(group) {
    const files = group.files.map((path) => group.fileMap.get(path)).filter(Boolean);
    return {
      id: `file-change-summary:${group.turnId || "none"}:${group.seq}`,
      type: "file_change_summary",
      turnId: group.turnId,
      seq: group.seq,
      timestamp: group.timestamp,
      files,
      title: t("timeline.edit.completed", { count: files.length }),
      rawItems: group.rawItems
    };
  }
  function flushGroup(result, group) {
    if (!group || group.rawItems.length === 0) {
      return;
    }
    if (group.groupType === "activity_summary") {
      result.push(buildActivitySummaryItem(group));
      return;
    }
    result.push(buildFileChangeSummaryItem(group));
  }
  function groupTimelineActivities(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }
    const result = [];
    let group = null;
    items.forEach((item) => {
      if ((item == null ? void 0 : item.type) !== "command" && (item == null ? void 0 : item.type) !== "patch") {
        flushGroup(result, group);
        group = null;
        result.push(item);
        return;
      }
      const classification = classifyCommandActivity(item);
      if (classification.important) {
        flushGroup(result, group);
        group = null;
        result.push(item);
        return;
      }
      const nextGroupType = classification.kind === "edit" ? "file_change_summary" : "activity_summary";
      if (!group || group.groupType !== nextGroupType || group.turnId !== (item.turnId || null)) {
        flushGroup(result, group);
        group = createActivityGroup(item, classification);
      }
      addToActivityGroup(group, item, classification);
    });
    flushGroup(result, group);
    return result;
  }

  // package/web/session-timeline-reducer.js
  var TURN_STATUS_PRIORITY = {
    idle: 0,
    running: 1,
    completed: 2,
    failed: 3,
    aborted: 4
  };
  var MAX_COMMAND_OUTPUT_CHARS = 80 * 1024;
  var MAX_PATCH_OUTPUT_CHARS = 48 * 1024;
  var OUTPUT_TRUNCATION_NOTICE = "\n\n[output truncated]\n";
  var DUPLICATE_USER_MESSAGE_WINDOW_MS = 30 * 1e3;
  var SAME_SOURCE_DUPLICATE_USER_MESSAGE_WINDOW_MS = 20 * 1e3;
  var USER_MESSAGE_MIRROR_SOURCES = /* @__PURE__ */ new Set([
    "message.user",
    "response_item.message",
    "event_msg.user_message"
  ]);
  var DUPLICATE_ASSISTANT_MESSAGE_WINDOW_MS = 30 * 1e3;
  var ASSISTANT_MESSAGE_MIRROR_SOURCES = /* @__PURE__ */ new Set([
    "message.assistant",
    "response_item.message",
    "event_msg.agent_message"
  ]);
  function createItemIndex() {
    return /* @__PURE__ */ new Map();
  }
  function clampOutputText(text, maxChars = MAX_COMMAND_OUTPUT_CHARS) {
    const safeText = String(text || "");
    if (!safeText) {
      return "";
    }
    if (safeText.endsWith(OUTPUT_TRUNCATION_NOTICE)) {
      return safeText;
    }
    const contentLimit = Math.max(0, maxChars - OUTPUT_TRUNCATION_NOTICE.length);
    if (safeText.length <= contentLimit) {
      return safeText;
    }
    return `${safeText.slice(0, contentLimit)}${OUTPUT_TRUNCATION_NOTICE}`;
  }
  function appendClampedOutput(currentText, textDelta, maxChars = MAX_COMMAND_OUTPUT_CHARS) {
    return clampOutputText(`${String(currentText || "")}${String(textDelta || "")}`, maxChars);
  }
  function nextTurnFallbackId(event) {
    var _a;
    return (event == null ? void 0 : event.turnId) || `turn:${(event == null ? void 0 : event.id) || ((_a = crypto.randomUUID) == null ? void 0 : _a.call(crypto)) || Date.now()}`;
  }
  function nextApprovalFallbackId(event) {
    return (event == null ? void 0 : event.requestId) || (event == null ? void 0 : event.callId) || `approval:${(event == null ? void 0 : event.id) || Date.now()}`;
  }
  function nextMessageFallbackId(event, prefix = "message") {
    return (event == null ? void 0 : event.messageId) || `${prefix}:${(event == null ? void 0 : event.id) || Date.now()}`;
  }
  function appendDeltaText(currentText, textDelta) {
    const delta = String(textDelta || "");
    if (!delta) {
      return currentText || "";
    }
    return `${currentText || ""}${delta}`;
  }
  function normalizeUserMessageText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function normalizeAssistantMessageText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function getTimestampMs(value) {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  function isMirrorSourcePair(left, right) {
    if (!USER_MESSAGE_MIRROR_SOURCES.has(left || "")) {
      return false;
    }
    if (!USER_MESSAGE_MIRROR_SOURCES.has(right || "")) {
      return false;
    }
    return left !== right;
  }
  function isSameUnkeyedUserSource(left, right) {
    const normalizedLeft = String(left || "");
    const normalizedRight = String(right || "");
    if (!normalizedLeft || normalizedLeft !== normalizedRight) {
      return false;
    }
    return USER_MESSAGE_MIRROR_SOURCES.has(normalizedLeft);
  }
  function isRecentUserMessageDuplicate(item, event) {
    var _a, _b, _c;
    if ((item == null ? void 0 : item.type) !== "user") {
      return false;
    }
    const text = normalizeUserMessageText((_a = event.payload) == null ? void 0 : _a.text);
    if (!text || normalizeUserMessageText(item.text) !== text) {
      return false;
    }
    const mirrorPair = isMirrorSourcePair(item.source, (_b = event.payload) == null ? void 0 : _b.source);
    const sameUnkeyedSource = isSameUnkeyedUserSource(item.source, (_c = event.payload) == null ? void 0 : _c.source);
    if (!mirrorPair && !sameUnkeyedSource) {
      return false;
    }
    const leftTimestamp = getTimestampMs(item.timestamp);
    const rightTimestamp = getTimestampMs(event.timestamp);
    if (leftTimestamp !== null && rightTimestamp !== null) {
      const windowMs = sameUnkeyedSource ? SAME_SOURCE_DUPLICATE_USER_MESSAGE_WINDOW_MS : DUPLICATE_USER_MESSAGE_WINDOW_MS;
      return Math.abs(leftTimestamp - rightTimestamp) <= windowMs;
    }
    const maxSeqGap = sameUnkeyedSource ? 30 : 2;
    return Math.abs(Number(item.seq || 0) - Number(event.seq || 0)) <= maxSeqGap;
  }
  function findRecentDuplicateUserItem(state2, event) {
    for (let index = state2.timelineItems.length - 1; index >= 0; index -= 1) {
      const item = state2.timelineItems[index];
      if (isRecentUserMessageDuplicate(item, event)) {
        return item;
      }
    }
    return null;
  }
  function isAssistantMirrorSourcePair(left, right) {
    if (!ASSISTANT_MESSAGE_MIRROR_SOURCES.has(left || "")) {
      return false;
    }
    if (!ASSISTANT_MESSAGE_MIRROR_SOURCES.has(right || "")) {
      return false;
    }
    return left !== right;
  }
  function isRecentAssistantMessageDuplicate(item, event) {
    var _a, _b;
    const phase = resolveAssistantItemType(event);
    if ((item == null ? void 0 : item.type) !== phase) {
      return false;
    }
    const text = normalizeAssistantMessageText((_a = event.payload) == null ? void 0 : _a.text);
    if (!text || normalizeAssistantMessageText(item.text) !== text) {
      return false;
    }
    if (!isAssistantMirrorSourcePair(item.source, (_b = event.payload) == null ? void 0 : _b.source)) {
      return false;
    }
    const leftTimestamp = getTimestampMs(item.timestamp);
    const rightTimestamp = getTimestampMs(event.timestamp);
    if (leftTimestamp !== null && rightTimestamp !== null) {
      return Math.abs(leftTimestamp - rightTimestamp) <= DUPLICATE_ASSISTANT_MESSAGE_WINDOW_MS;
    }
    return Math.abs(Number(item.seq || 0) - Number(event.seq || 0)) <= 2;
  }
  function findRecentDuplicateAssistantItem(state2, event) {
    for (let index = state2.timelineItems.length - 1; index >= 0; index -= 1) {
      const item = state2.timelineItems[index];
      if (isRecentAssistantMessageDuplicate(item, event)) {
        return item;
      }
    }
    return null;
  }
  function linkDuplicateAssistantMessage(state2, event, turnId, duplicateItem) {
    if (!duplicateItem) {
      return false;
    }
    const turn = ensureTurn(state2, turnId, event);
    if (!turn.messageIds.includes(duplicateItem.id)) {
      turn.messageIds.push(duplicateItem.id);
    }
    if (resolveAssistantItemType(event) === "assistant_commentary") {
      turn.lastCommentaryId = duplicateItem.id;
    } else {
      turn.finalMessageId = duplicateItem.id;
      completeReasoningIfPresent(state2, turn);
    }
    return true;
  }
  function reduceLegacyAssistantMessage(state2, event) {
    var _a, _b, _c, _d, _e, _f, _g;
    const messageId = nextMessageFallbackId(event, resolveAssistantItemType(event));
    reduceTimeline(state2, __spreadProps(__spreadValues({}, event), {
      id: `${event.id}:start`,
      kind: "assistant_message_start",
      messageId,
      payload: {
        source: ((_a = event.payload) == null ? void 0 : _a.source) || null,
        raw: ((_b = event.payload) == null ? void 0 : _b.raw) || event.payload || {}
      }
    }));
    reduceTimeline(state2, __spreadProps(__spreadValues({}, event), {
      id: `${event.id}:delta`,
      kind: "assistant_message_delta",
      messageId,
      payload: {
        textDelta: ((_c = event.payload) == null ? void 0 : _c.text) || "",
        source: ((_d = event.payload) == null ? void 0 : _d.source) || null,
        raw: ((_e = event.payload) == null ? void 0 : _e.raw) || event.payload || {}
      }
    }));
    reduceTimeline(state2, __spreadProps(__spreadValues({}, event), {
      id: `${event.id}:end`,
      kind: "assistant_message_end",
      messageId,
      payload: {
        source: ((_f = event.payload) == null ? void 0 : _f.source) || null,
        raw: ((_g = event.payload) == null ? void 0 : _g.raw) || event.payload || {}
      }
    }));
  }
  function reduceLegacyReasoning(state2, event) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const messageId = nextMessageFallbackId(event, "reasoning");
    const reasoningText = ((_a = event.payload) == null ? void 0 : _a.content) || ((_b = event.payload) == null ? void 0 : _b.summary) || ((_c = event.payload) == null ? void 0 : _c.text) || "";
    reduceTimeline(state2, __spreadProps(__spreadValues({}, event), {
      id: `${event.id}:start`,
      kind: "reasoning_start",
      messageId,
      payload: {
        summary: ((_d = event.payload) == null ? void 0 : _d.summary) || "",
        raw: ((_e = event.payload) == null ? void 0 : _e.raw) || event.payload || {}
      }
    }));
    reduceTimeline(state2, __spreadProps(__spreadValues({}, event), {
      id: `${event.id}:delta`,
      kind: "reasoning_delta",
      messageId,
      payload: {
        textDelta: reasoningText,
        summary: ((_f = event.payload) == null ? void 0 : _f.summary) || "",
        raw: ((_g = event.payload) == null ? void 0 : _g.raw) || event.payload || {}
      }
    }));
    reduceTimeline(state2, __spreadProps(__spreadValues({}, event), {
      id: `${event.id}:end`,
      kind: "reasoning_end",
      messageId,
      payload: { raw: ((_h = event.payload) == null ? void 0 : _h.raw) || event.payload || {} }
    }));
  }
  function resolveTurnId(state2, event) {
    if (event.turnId) {
      return event.turnId;
    }
    if (event.kind === "user_message") {
      return nextTurnFallbackId(event);
    }
    return state2.activeTurnId || state2.turnOrder[state2.turnOrder.length - 1] || nextTurnFallbackId(event);
  }
  function ensureTurn(state2, turnId, seed = {}) {
    if (!state2.turnsById[turnId]) {
      state2.turnsById[turnId] = {
        id: turnId,
        status: "idle",
        startedAt: seed.timestamp || null,
        completedAt: null,
        userMessageId: null,
        lastCommentaryId: null,
        finalMessageId: null,
        reasoningId: null,
        messageIds: [],
        commandIds: [],
        patchIds: [],
        approvalIds: [],
        systemIds: [],
        tokenCountId: null
      };
      state2.turnOrder.push(turnId);
    }
    return state2.turnsById[turnId];
  }
  function setTurnStatus(turn, nextStatus) {
    const current = turn.status || "idle";
    if ((TURN_STATUS_PRIORITY[nextStatus] || 0) >= (TURN_STATUS_PRIORITY[current] || 0)) {
      turn.status = nextStatus;
    }
  }
  function insertTimelineItem(state2, item) {
    const existingIndex = state2.itemIndexById.get(item.id);
    if (typeof existingIndex === "number") {
      state2.timelineItems[existingIndex] = __spreadValues(__spreadValues({}, state2.timelineItems[existingIndex]), item);
      return state2.timelineItems[existingIndex];
    }
    const nextItem = __spreadValues({}, item);
    let insertAt = state2.timelineItems.findIndex((candidate) => candidate.seq > nextItem.seq);
    if (insertAt === -1) {
      insertAt = state2.timelineItems.length;
    }
    state2.timelineItems.splice(insertAt, 0, nextItem);
    state2.itemIndexById = createItemIndex();
    state2.timelineItems.forEach((candidate, index) => {
      state2.itemIndexById.set(candidate.id, index);
    });
    return nextItem;
  }
  function upsertUserMessage(state2, event, turnId) {
    var _a, _b;
    const turn = ensureTurn(state2, turnId, event);
    const duplicateItem = findRecentDuplicateUserItem(state2, event);
    if (duplicateItem) {
      turn.userMessageId = duplicateItem.id;
      state2.activeTurnId = turnId;
      return;
    }
    const item = insertTimelineItem(state2, {
      id: `user:${turnId}`,
      type: "user",
      turnId,
      seq: event.seq,
      timestamp: event.timestamp,
      role: "user",
      text: ((_a = event.payload) == null ? void 0 : _a.text) || "",
      source: ((_b = event.payload) == null ? void 0 : _b.source) || null
    });
    turn.userMessageId = item.id;
    state2.activeTurnId = turnId;
  }
  function resolveAssistantItemType(event) {
    return event.phase === "commentary" ? "assistant_commentary" : "assistant_final";
  }
  function upsertAssistantMessage(state2, event, turnId, partial = {}) {
    var _a, _b;
    const turn = ensureTurn(state2, turnId, event);
    const phase = resolveAssistantItemType(event);
    const messageId = nextMessageFallbackId(event, phase);
    const itemId = `${phase}:${messageId}`;
    const current = state2.messagesById[messageId] || {
      id: itemId,
      type: phase,
      turnId,
      messageId,
      seq: event.seq,
      timestamp: event.timestamp,
      role: "assistant",
      phase: event.phase || "final_answer",
      status: "streaming",
      text: "",
      source: ((_a = event.payload) == null ? void 0 : _a.source) || null
    };
    const item = insertTimelineItem(state2, __spreadProps(__spreadValues(__spreadValues({}, current), partial), {
      id: current.id,
      type: current.type,
      turnId,
      messageId,
      seq: current.seq || event.seq,
      timestamp: current.timestamp || event.timestamp,
      role: "assistant",
      phase: event.phase || current.phase || "final_answer",
      source: partial.source || current.source || ((_b = event.payload) == null ? void 0 : _b.source) || null
    }));
    state2.messagesById[messageId] = item;
    if (!turn.messageIds.includes(item.id)) {
      turn.messageIds.push(item.id);
    }
    if (phase === "assistant_commentary") {
      turn.lastCommentaryId = item.id;
    } else {
      turn.finalMessageId = item.id;
    }
    return item;
  }
  function upsertReasoning(state2, event, turnId, partial = {}) {
    const turn = ensureTurn(state2, turnId, event);
    const messageId = nextMessageFallbackId(event, "reasoning");
    const current = state2.reasoningById[messageId] || {
      id: `reasoning:${messageId}`,
      type: "reasoning",
      turnId,
      messageId,
      seq: event.seq,
      timestamp: event.timestamp,
      status: "thinking",
      summary: "",
      text: ""
    };
    const item = insertTimelineItem(state2, __spreadProps(__spreadValues(__spreadValues({}, current), partial), {
      id: current.id,
      type: "reasoning",
      turnId,
      messageId,
      seq: current.seq || event.seq,
      timestamp: current.timestamp || event.timestamp
    }));
    state2.reasoningById[messageId] = item;
    turn.reasoningId = item.id;
    return item;
  }
  function completeReasoningIfPresent(state2, turn) {
    if (!(turn == null ? void 0 : turn.reasoningId)) {
      return;
    }
    insertTimelineItem(state2, {
      id: turn.reasoningId,
      status: "done"
    });
  }
  function upsertCommand(state2, event, turnId, partial) {
    const turn = ensureTurn(state2, turnId, event);
    const callId = event.callId || `command:${event.id}`;
    const current = state2.commandsByCallId[callId] || {
      id: `command:${callId}`,
      type: "command",
      turnId,
      callId,
      seq: event.seq,
      timestamp: event.timestamp,
      status: "pending",
      command: "",
      cwd: null,
      stdout: "",
      stderr: "",
      output: "",
      outputStatus: "idle",
      exitCode: null,
      duration: null,
      justification: null,
      sandboxPermissions: null
    };
    const next = __spreadProps(__spreadValues(__spreadValues({}, current), partial), {
      id: current.id,
      type: "command",
      turnId,
      callId,
      seq: current.seq || event.seq,
      timestamp: current.timestamp || event.timestamp
    });
    state2.commandsByCallId[callId] = next;
    insertTimelineItem(state2, next);
    if (!turn.commandIds.includes(next.id)) {
      turn.commandIds.push(next.id);
    }
    return next;
  }
  function upsertPatch(state2, event, turnId, partial) {
    const turn = ensureTurn(state2, turnId, event);
    const callId = event.callId || `patch:${event.id}`;
    const current = state2.patchesByCallId[callId] || {
      id: `patch:${callId}`,
      type: "patch",
      turnId,
      callId,
      seq: event.seq,
      timestamp: event.timestamp,
      status: "pending",
      patchText: "",
      stdout: "",
      stderr: "",
      output: "",
      outputStatus: "idle",
      changes: {},
      success: null
    };
    const next = __spreadProps(__spreadValues(__spreadValues({}, current), partial), {
      id: current.id,
      type: "patch",
      turnId,
      callId,
      seq: current.seq || event.seq,
      timestamp: current.timestamp || event.timestamp
    });
    state2.patchesByCallId[callId] = next;
    insertTimelineItem(state2, next);
    if (!turn.patchIds.includes(next.id)) {
      turn.patchIds.push(next.id);
    }
    return next;
  }
  function upsertApproval(state2, event, turnId, partial) {
    const turn = ensureTurn(state2, turnId, event);
    const requestId = nextApprovalFallbackId(event);
    const current = state2.approvalsByRequestId[requestId] || {
      id: `approval:${requestId}`,
      type: "approval",
      turnId,
      requestId,
      seq: event.seq,
      timestamp: event.timestamp,
      status: "pending",
      title: "",
      reason: "",
      command: ""
    };
    const next = __spreadProps(__spreadValues(__spreadValues({}, current), partial), {
      id: current.id,
      type: "approval",
      turnId,
      requestId,
      seq: current.seq || event.seq,
      timestamp: current.timestamp || event.timestamp
    });
    state2.approvalsByRequestId[requestId] = next;
    insertTimelineItem(state2, next);
    if (!turn.approvalIds.includes(next.id)) {
      turn.approvalIds.push(next.id);
    }
    return next;
  }
  function upsertSystem(state2, event, turnId, partial) {
    const turn = ensureTurn(state2, turnId, event);
    const item = insertTimelineItem(state2, __spreadValues({
      id: `system:${event.id}`,
      type: "system",
      turnId,
      seq: event.seq,
      timestamp: event.timestamp
    }, partial));
    if (!turn.systemIds.includes(item.id)) {
      turn.systemIds.push(item.id);
    }
    return item;
  }
  function upsertTokenCount(state2, event, turnId) {
    const turn = ensureTurn(state2, turnId, event);
    const item = insertTimelineItem(state2, {
      id: `token:${turnId}`,
      type: "system",
      subtype: "token_count",
      turnId,
      seq: event.seq,
      timestamp: event.timestamp,
      payload: event.payload
    });
    turn.tokenCountId = item.id;
    state2.latestTokenCount = event.payload || null;
  }
  function upsertPlan(state2, event, turnId) {
    var _a, _b;
    const turn = ensureTurn(state2, turnId, event);
    const tasks = Array.isArray((_a = event.payload) == null ? void 0 : _a.plan) ? event.payload.plan.map((item, index) => ({
      id: String((item == null ? void 0 : item.id) || (item == null ? void 0 : item.step) || `plan:${index}`),
      step: String((item == null ? void 0 : item.step) || "").trim(),
      status: String((item == null ? void 0 : item.status) || "pending").trim() || "pending"
    })).filter((item) => item.step) : [];
    const completedCount = tasks.filter((item) => item.status === "completed").length;
    const activeTask = tasks.find((item) => item.status === "in_progress") || tasks.find((item) => item.status === "pending") || null;
    state2.latestPlan = {
      id: `plan:${event.id || turnId}`,
      turnId,
      seq: event.seq,
      timestamp: event.timestamp,
      explanation: ((_b = event.payload) == null ? void 0 : _b.explanation) || "",
      tasks,
      activeTask,
      completedCount,
      totalCount: tasks.length
    };
    turn.planId = state2.latestPlan.id;
  }
  function createEmptyTimelineState() {
    return {
      activeTurnId: null,
      turnsById: {},
      turnOrder: [],
      messagesById: {},
      reasoningById: {},
      commandsByCallId: {},
      patchesByCallId: {},
      approvalsByRequestId: {},
      timelineItems: [],
      itemIndexById: createItemIndex(),
      latestTokenCount: null,
      latestPlan: null
    };
  }
  function reduceTimeline(state2, event) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y, _Z, __, _$, _aa, _ba, _ca, _da, _ea, _fa, _ga, _ha, _ia, _ja, _ka, _la, _ma;
    if (!event) {
      return state2;
    }
    const turnId = resolveTurnId(state2, event);
    const turn = ensureTurn(state2, turnId, event);
    switch (event.kind) {
      case "user_message":
        upsertUserMessage(state2, event, turnId);
        setTurnStatus(turn, "idle");
        break;
      case "assistant_message_start":
        upsertAssistantMessage(state2, event, turnId, {
          status: "streaming",
          text: ((_a = event.payload) == null ? void 0 : _a.text) || ""
        });
        if (event.phase !== "commentary") {
          state2.activeTurnId = turnId;
        }
        break;
      case "assistant_message_delta": {
        const existing = state2.messagesById[nextMessageFallbackId(event, resolveAssistantItemType(event))];
        upsertAssistantMessage(state2, event, turnId, {
          status: "streaming",
          text: appendDeltaText(existing == null ? void 0 : existing.text, (_b = event.payload) == null ? void 0 : _b.textDelta)
        });
        break;
      }
      case "assistant_message_end":
        upsertAssistantMessage(state2, event, turnId, {
          text: typeof ((_c = event.payload) == null ? void 0 : _c.text) === "string" && event.payload.text !== "" ? event.payload.text : ((_d = state2.messagesById[nextMessageFallbackId(event, resolveAssistantItemType(event))]) == null ? void 0 : _d.text) || "",
          status: "completed"
        });
        if (event.phase !== "commentary") {
          completeReasoningIfPresent(state2, turn);
        }
        break;
      case "assistant_message":
        if (linkDuplicateAssistantMessage(
          state2,
          event,
          turnId,
          findRecentDuplicateAssistantItem(state2, event)
        )) {
          break;
        }
        reduceLegacyAssistantMessage(state2, event);
        break;
      case "reasoning_start":
        upsertReasoning(state2, event, turnId, {
          status: "thinking",
          summary: ((_e = event.payload) == null ? void 0 : _e.summary) || "",
          text: ""
        });
        setTurnStatus(turn, turn.status === "idle" ? "running" : turn.status);
        break;
      case "reasoning_delta": {
        const reasoningId = nextMessageFallbackId(event, "reasoning");
        const existing = state2.reasoningById[reasoningId];
        const nextText = appendDeltaText(existing == null ? void 0 : existing.text, (_f = event.payload) == null ? void 0 : _f.textDelta);
        upsertReasoning(state2, event, turnId, {
          status: "thinking",
          text: nextText,
          summary: ((_g = event.payload) == null ? void 0 : _g.summary) || nextText || (existing == null ? void 0 : existing.summary) || ""
        });
        setTurnStatus(turn, turn.status === "idle" ? "running" : turn.status);
        break;
      }
      case "reasoning_end":
        upsertReasoning(state2, event, turnId, {
          status: "done",
          summary: ((_h = event.payload) == null ? void 0 : _h.summary) || ((_i = state2.reasoningById[nextMessageFallbackId(event, "reasoning")]) == null ? void 0 : _i.summary) || ""
        });
        break;
      case "reasoning":
        reduceLegacyReasoning(state2, event);
        break;
      case "command_start":
        upsertCommand(state2, event, turnId, {
          status: ((_j = event.payload) == null ? void 0 : _j.sandboxPermissions) === "require_escalated" ? "awaiting_approval" : "running",
          command: ((_k = event.payload) == null ? void 0 : _k.command) || "",
          cwd: ((_l = event.payload) == null ? void 0 : _l.cwd) || null,
          justification: ((_m = event.payload) == null ? void 0 : _m.justification) || null,
          sandboxPermissions: ((_n = event.payload) == null ? void 0 : _n.sandboxPermissions) || null
        });
        setTurnStatus(turn, "running");
        state2.activeTurnId = turnId;
        break;
      case "command_output_delta": {
        const commandId = event.callId || `command:${event.id}`;
        const currentCommand = state2.commandsByCallId[commandId];
        const nextStdout = ((_o = event.payload) == null ? void 0 : _o.stream) === "stderr" ? (currentCommand == null ? void 0 : currentCommand.stdout) || "" : appendClampedOutput(
          currentCommand == null ? void 0 : currentCommand.stdout,
          (_p = event.payload) == null ? void 0 : _p.textDelta,
          MAX_COMMAND_OUTPUT_CHARS
        );
        const nextStderr = ((_q = event.payload) == null ? void 0 : _q.stream) === "stderr" ? appendClampedOutput(
          currentCommand == null ? void 0 : currentCommand.stderr,
          (_r = event.payload) == null ? void 0 : _r.textDelta,
          MAX_COMMAND_OUTPUT_CHARS
        ) : (currentCommand == null ? void 0 : currentCommand.stderr) || "";
        upsertCommand(state2, event, turnId, {
          status: (currentCommand == null ? void 0 : currentCommand.status) === "awaiting_approval" ? "awaiting_approval" : "running",
          stdout: nextStdout,
          stderr: nextStderr,
          outputStatus: "streaming"
        });
        setTurnStatus(turn, "running");
        break;
      }
      case "command_end": {
        const rejected = Boolean((_s = event.payload) == null ? void 0 : _s.rejected);
        const completedStatus = ((_t = event.payload) == null ? void 0 : _t.status) === "failed" || ((_u = event.payload) == null ? void 0 : _u.exitCode) > 0 ? "failed" : rejected ? "rejected" : "completed";
        upsertCommand(state2, event, turnId, {
          status: completedStatus,
          command: ((_v = event.payload) == null ? void 0 : _v.command) || ((_w = state2.commandsByCallId[event.callId]) == null ? void 0 : _w.command) || "",
          cwd: ((_x = event.payload) == null ? void 0 : _x.cwd) || ((_y = state2.commandsByCallId[event.callId]) == null ? void 0 : _y.cwd) || null,
          stdout: clampOutputText(
            ((_z = event.payload) == null ? void 0 : _z.stdout) || ((_A = state2.commandsByCallId[event.callId]) == null ? void 0 : _A.stdout) || "",
            MAX_COMMAND_OUTPUT_CHARS
          ),
          stderr: clampOutputText(
            ((_B = event.payload) == null ? void 0 : _B.stderr) || ((_C = state2.commandsByCallId[event.callId]) == null ? void 0 : _C.stderr) || "",
            MAX_COMMAND_OUTPUT_CHARS
          ),
          output: clampOutputText(
            ((_D = event.payload) == null ? void 0 : _D.aggregatedOutput) || ((_E = event.payload) == null ? void 0 : _E.formattedOutput) || ((_F = event.payload) == null ? void 0 : _F.output) || ((_G = state2.commandsByCallId[event.callId]) == null ? void 0 : _G.output) || "",
            MAX_COMMAND_OUTPUT_CHARS
          ),
          exitCode: (_K = (_J = (_H = event.payload) == null ? void 0 : _H.exitCode) != null ? _J : (_I = state2.commandsByCallId[event.callId]) == null ? void 0 : _I.exitCode) != null ? _K : null,
          duration: ((_L = event.payload) == null ? void 0 : _L.duration) || ((_M = state2.commandsByCallId[event.callId]) == null ? void 0 : _M.duration) || null,
          outputStatus: "done"
        });
        if (completedStatus === "failed") {
          setTurnStatus(turn, "failed");
        }
        break;
      }
      case "patch_start":
        upsertPatch(state2, event, turnId, {
          status: "running",
          patchText: ((_N = event.payload) == null ? void 0 : _N.input) || ""
        });
        setTurnStatus(turn, "running");
        state2.activeTurnId = turnId;
        break;
      case "patch_output_delta": {
        const patchId = event.callId || `patch:${event.id}`;
        const currentPatch = state2.patchesByCallId[patchId];
        upsertPatch(state2, event, turnId, {
          status: (currentPatch == null ? void 0 : currentPatch.status) || "running",
          output: appendClampedOutput(
            currentPatch == null ? void 0 : currentPatch.output,
            (_O = event.payload) == null ? void 0 : _O.textDelta,
            MAX_PATCH_OUTPUT_CHARS
          ),
          outputStatus: "streaming"
        });
        setTurnStatus(turn, "running");
        break;
      }
      case "patch_end": {
        const patchStatus = ((_P = event.payload) == null ? void 0 : _P.status) === "failed" || ((_Q = event.payload) == null ? void 0 : _Q.success) === false ? "failed" : "completed";
        upsertPatch(state2, event, turnId, {
          status: patchStatus,
          patchText: ((_R = event.payload) == null ? void 0 : _R.patchText) || ((_S = state2.patchesByCallId[event.callId]) == null ? void 0 : _S.patchText) || "",
          output: clampOutputText(
            ((_T = event.payload) == null ? void 0 : _T.output) || ((_U = state2.patchesByCallId[event.callId]) == null ? void 0 : _U.output) || "",
            MAX_PATCH_OUTPUT_CHARS
          ),
          stdout: clampOutputText(
            ((_V = event.payload) == null ? void 0 : _V.stdout) || ((_W = state2.patchesByCallId[event.callId]) == null ? void 0 : _W.stdout) || "",
            MAX_PATCH_OUTPUT_CHARS
          ),
          stderr: clampOutputText(
            ((_X = event.payload) == null ? void 0 : _X.stderr) || ((_Y = state2.patchesByCallId[event.callId]) == null ? void 0 : _Y.stderr) || "",
            MAX_PATCH_OUTPUT_CHARS
          ),
          changes: ((_Z = event.payload) == null ? void 0 : _Z.changes) || ((__ = state2.patchesByCallId[event.callId]) == null ? void 0 : __.changes) || {},
          success: (_ca = (_ba = (_$ = event.payload) == null ? void 0 : _$.success) != null ? _ba : (_aa = state2.patchesByCallId[event.callId]) == null ? void 0 : _aa.success) != null ? _ca : null,
          outputStatus: "done"
        });
        if (patchStatus === "failed") {
          setTurnStatus(turn, "failed");
        }
        break;
      }
      case "approval_requested":
        upsertApproval(state2, event, turnId, {
          status: "pending",
          title: ((_da = event.payload) == null ? void 0 : _da.title) || t("approval.required"),
          reason: ((_ea = event.payload) == null ? void 0 : _ea.reason) || "",
          command: ((_fa = event.payload) == null ? void 0 : _fa.command) || "",
          resumable: (_ha = (_ga = event.payload) == null ? void 0 : _ga.resumable) != null ? _ha : true
        });
        break;
      case "approval_resolved":
        upsertApproval(state2, event, turnId, {
          status: ((_ia = event.payload) == null ? void 0 : _ia.decision) === "decline" ? "rejected" : "resolved",
          decision: ((_ja = event.payload) == null ? void 0 : _ja.decision) || null
        });
        break;
      case "turn_started":
        if (state2.latestPlan && state2.latestPlan.turnId !== turnId) {
          state2.latestPlan = null;
        }
        setTurnStatus(turn, "running");
        state2.activeTurnId = turnId;
        break;
      case "plan_update":
        upsertPlan(state2, event, turnId);
        setTurnStatus(turn, turn.status === "idle" ? "running" : turn.status);
        state2.activeTurnId = turnId;
        break;
      case "turn_completed":
        setTurnStatus(turn, "completed");
        turn.completedAt = event.timestamp;
        completeReasoningIfPresent(state2, turn);
        if (state2.activeTurnId === turnId) {
          state2.activeTurnId = null;
        }
        break;
      case "turn_aborted":
        setTurnStatus(turn, "aborted");
        completeReasoningIfPresent(state2, turn);
        upsertSystem(state2, event, turnId, {
          subtype: "turn_aborted",
          text: ((_ka = event.payload) == null ? void 0 : _ka.reason) || "Turn aborted",
          status: "aborted"
        });
        if (state2.activeTurnId === turnId) {
          state2.activeTurnId = null;
        }
        break;
      case "error":
        setTurnStatus(turn, "failed");
        completeReasoningIfPresent(state2, turn);
        upsertSystem(state2, event, turnId, {
          subtype: "error",
          text: ((_la = event.payload) == null ? void 0 : _la.message) || "Unknown error",
          errorCode: ((_ma = event.payload) == null ? void 0 : _ma.code) || null,
          status: "failed"
        });
        break;
      case "token_count":
        upsertTokenCount(state2, event, turnId);
        break;
      default:
        break;
    }
    return state2;
  }
  function reduceTimelineBatch(state2, events) {
    if (!Array.isArray(events)) {
      return state2;
    }
    events.forEach((event) => {
      reduceTimeline(state2, event);
    });
    return state2;
  }
  function buildTimelineView(state2) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const items = state2.timelineItems.filter(
      (item) => !(item.type === "system" && item.subtype === "token_count")
    );
    const groupedItems = groupTimelineActivities(items);
    let activeTurn = null;
    if (state2.activeTurnId && ((_a = state2.turnsById[state2.activeTurnId]) == null ? void 0 : _a.status) === "running") {
      activeTurn = state2.turnsById[state2.activeTurnId];
    } else {
      for (let index = state2.turnOrder.length - 1; index >= 0; index -= 1) {
        const turn = state2.turnsById[state2.turnOrder[index]];
        if ((turn == null ? void 0 : turn.status) === "running") {
          activeTurn = turn;
          break;
        }
      }
    }
    if (!activeTurn) {
      return groupedItems;
    }
    const lastTurnItem = [...groupedItems].reverse().find((item) => item.turnId === activeTurn.id) || null;
    const lastSeq = (_d = (_c = lastTurnItem == null ? void 0 : lastTurnItem.seq) != null ? _c : (_b = groupedItems[groupedItems.length - 1]) == null ? void 0 : _b.seq) != null ? _d : 0;
    const lastTimestamp = (_h = (_g = (_e = lastTurnItem == null ? void 0 : lastTurnItem.timestamp) != null ? _e : activeTurn.startedAt) != null ? _g : (_f = groupedItems[groupedItems.length - 1]) == null ? void 0 : _f.timestamp) != null ? _h : (/* @__PURE__ */ new Date()).toISOString();
    return [
      ...groupedItems,
      {
        id: `thinking:${activeTurn.id}`,
        type: "reasoning",
        turnId: activeTurn.id,
        seq: lastSeq + 0.01,
        timestamp: lastTimestamp,
        status: "thinking",
        summary: t("timeline.thinking"),
        text: "",
        synthetic: true
      }
    ];
  }

  // package/web/session-timeline-renderer.js
  function getCompactDisplayPaths(paths, limit = 2) {
    const values = Array.isArray(paths) ? paths.filter(Boolean) : [];
    if (values.length === 0) {
      return { preview: [], remainingCount: 0 };
    }
    const basenameCounts = /* @__PURE__ */ new Map();
    values.forEach((path) => {
      const key = basename(path) || path;
      basenameCounts.set(key, (basenameCounts.get(key) || 0) + 1);
    });
    const displayPaths = values.map((path) => {
      const key = basename(path) || path;
      return (basenameCounts.get(key) || 0) > 1 ? path : key;
    });
    return {
      preview: displayPaths.slice(0, limit),
      remainingCount: Math.max(0, displayPaths.length - limit)
    };
  }
  function compactCommandPreview(command, maxLength = 64) {
    const source = String(command || "").trim();
    if (!source) {
      return "";
    }
    const unwrapped = source.replace(
      /^(?:\/bin\/)?(?:zsh|bash|sh)\s+-lc\s+(['"])([\s\S]*)\1$/,
      "$2"
    );
    const normalized = unwrapped.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength - 1)}\u2026`;
  }
  function localizeApprovalTitle(title) {
    const normalized = String(title || "").trim();
    if (!normalized) {
      return t("approval.required");
    }
    if (normalized === "\u547D\u4EE4\u6267\u884C\u9700\u8981\u6388\u6743" || normalized === "Command execution requires approval") {
      return t("approval.commandRequired");
    }
    if (normalized === "\u6587\u4EF6\u4FEE\u6539\u9700\u8981\u6388\u6743" || normalized === "File changes require approval") {
      return t("approval.fileChangeRequired");
    }
    if (normalized === "\u989D\u5916\u6743\u9650\u9700\u8981\u6388\u6743" || normalized === "Extra permissions require approval") {
      return t("approval.extraPermissionRequired");
    }
    if (normalized === "\u64CD\u4F5C\u9700\u8981\u6388\u6743" || normalized === "Approval required" || normalized === "Approval required for operation") {
      return t("approval.required");
    }
    return normalized;
  }
  function renderInlineActivityDetail({
    shell = "",
    output = "",
    error = "",
    patchText = ""
  }) {
    const hasBody = shell || output || error || patchText;
    if (!hasBody) {
      return { hasDetail: false, bodyHtml: "" };
    }
    return {
      hasDetail: true,
      bodyHtml: `
      <div class="assistant-command-content">
        ${shell ? `<pre class="assistant-command-shell">${escapeHtml3(shell)}</pre>` : ""}
        ${patchText ? `<pre class="assistant-command-output">${escapeHtml3(patchText)}</pre>` : ""}
        ${output ? `<pre class="assistant-command-output">${escapeHtml3(output)}</pre>` : ""}
        ${error ? `<pre class="assistant-command-error-output">${escapeHtml3(error)}</pre>` : ""}
      </div>
    `
    };
  }
  function renderRawActivityItems(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      return "";
    }
    const blocks = list.map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      if (item.type === "patch") {
        return renderInlineActivityDetail({
          patchText: item.patchText || "",
          output: item.output || "",
          error: item.stderr || ""
        }).bodyHtml;
      }
      if (item.type === "command") {
        return renderInlineActivityDetail({
          shell: item.command || "",
          output: item.output || item.stdout || "",
          error: item.stderr || ""
        }).bodyHtml;
      }
      return "";
    }).filter(Boolean);
    return blocks.join("");
  }
  function renderInlineActivityRow({
    rowClass = "",
    itemId = "",
    label = "",
    meta = "",
    detail = null,
    open = false
  }) {
    if (detail == null ? void 0 : detail.hasDetail) {
      return `
      <div class="transcript-row transcript-row-inline-activity timeline-row ${escapeHtml3(rowClass)}" data-timeline-id="${escapeHtml3(itemId)}">
        <div class="timeline-inline-step">
          <details class="timeline-inline-detail-row" ${open ? "open" : ""}>
            <summary class="task-step-row task-step-item-status">
              <span class="task-step-label">${escapeHtml3(label)}</span>
              ${meta ? `<span class="task-step-meta">${escapeHtml3(meta)}</span>` : ""}
            </summary>
            ${detail.bodyHtml}
          </details>
        </div>
      </div>
    `;
    }
    return `
    <div class="transcript-row transcript-row-inline-activity timeline-row ${escapeHtml3(rowClass)}" data-timeline-id="${escapeHtml3(itemId)}">
      <div class="timeline-inline-step">
        <div class="task-step-row task-step-item-status">
          <span class="task-step-label">${escapeHtml3(label)}</span>
          ${meta ? `<span class="task-step-meta">${escapeHtml3(meta)}</span>` : ""}
        </div>
      </div>
    </div>
  `;
  }
  function renderInlinePatchMeta(item, classification, display) {
    var _a, _b;
    const changeEntries = Object.entries(item.changes || {});
    if (changeEntries.length > 0) {
      const basenameCounts = /* @__PURE__ */ new Map();
      changeEntries.forEach(([path]) => {
        const key = basename(path) || path;
        basenameCounts.set(key, (basenameCounts.get(key) || 0) + 1);
      });
      const preview = changeEntries.slice(0, 2).map(([path, change]) => {
        const compact = basename(path) || path;
        const displayPath = (basenameCounts.get(compact) || 0) > 1 ? path : compact;
        return `${displayPath} +${Number((change == null ? void 0 : change.added) || 0)} -${Number((change == null ? void 0 : change.removed) || 0)}`;
      });
      if (changeEntries.length > 2) {
        preview.push(t("timeline.summary.moreItems", { count: changeEntries.length }));
      }
      return preview.join("\u3001");
    }
    if (classification.files.length > 0) {
      const firstPath = classification.files[0];
      return `${basename(firstPath) || firstPath} +${Number(((_a = classification.stats) == null ? void 0 : _a.added) || 0)} -${Number(((_b = classification.stats) == null ? void 0 : _b.removed) || 0)}`;
    }
    return display.subtitle || "";
  }
  function getBubbleWidthClass(text) {
    const source = String(text || "").trim();
    if (!source) {
      return "";
    }
    return source.includes("\n") ? "" : " msg-bubble-fluid";
  }
  function renderChanges(changes) {
    const entries = Object.entries(changes || {});
    if (entries.length === 0) {
      return "";
    }
    return `
    <ul class="timeline-file-list">
      ${entries.map(
      ([file, change]) => `
            <li class="timeline-file-item">
              <span class="timeline-file-op">${escapeHtml3((change == null ? void 0 : change.type) || "?")}</span>
              <span class="timeline-file-path">${escapeHtml3(file)}</span>
            </li>
          `
    ).join("")}
    </ul>
  `;
  }
  function renderPlainStreamingText(text) {
    return `<div class="timeline-streaming-plain">${escapeHtml3(String(text || "")).replace(/\n/g, "<br>")}</div>`;
  }
  function renderStreamingAwareRichText(text, options = {}) {
    const source = String(text || "");
    const body = renderRichText(source, options);
    if (body) {
      return body;
    }
    if (source) {
      return renderPlainStreamingText(source);
    }
    return "";
  }
  function renderTimelineList(items, options = {}) {
    const body = Array.isArray(items) && items.length > 0 ? items.map((item) => renderTimelineItem(item, options)).join("") : `<div class="event-empty">${escapeHtml3(t("timeline.empty"))}</div>`;
    return `
    <div id="event-list" class="event-list timeline-list event-list--flex">
      ${body}
    </div>
  `;
  }
  function renderTimeline(items, options = {}) {
    return `
    <div class="session-stream-shell">
      <div class="session-stream-main">
        ${renderTimelineList(items, options)}
      </div>
    </div>
  `;
  }
  function renderTimelineItem(item, options = {}) {
    switch (item.type) {
      case "user":
        return renderUserMessage(item, options);
      case "assistant_commentary":
        return renderAssistantCommentary(item, options);
      case "assistant_final":
        return renderAssistantFinal(item, options);
      case "reasoning":
        return renderReasoningItem(item, options);
      case "command":
        return renderCommandItem(item, options);
      case "patch":
        return renderPatchItem(item, options);
      case "activity_summary":
        return renderActivitySummaryItem(item, options);
      case "file_change_summary":
        return renderFileChangeSummaryItem(item, options);
      case "approval":
        return renderApprovalItem(item, options);
      case "system":
        return renderSystemItem(item, options);
      default:
        return "";
    }
  }
  function getTimelineMessageCopyKey(prefix, item) {
    return `${prefix}:${String((item == null ? void 0 : item.id) || "unknown")}`;
  }
  function getTimelineSelectedClass(options, copyKey) {
    return String((options == null ? void 0 : options.activeMessageCopyKey) || "").trim() === copyKey ? " message-copy-target-active" : "";
  }
  function renderUserMessage(item, options = {}) {
    const copyKey = getTimelineMessageCopyKey("user", item);
    const selectedClass = getTimelineSelectedClass(options, copyKey);
    return `
    <div class="transcript-row transcript-row-user timeline-row timeline-row-user" data-timeline-id="${escapeHtml3(item.id || "")}">
      <article class="msg-bubble msg-user msg-user-soft${getBubbleWidthClass(item.text)}${selectedClass}" data-message-copy-key="${escapeHtml3(copyKey)}" aria-label="${escapeHtml3(t("timeline.userMessage"))}">
        <div class="msg-bubble-body">${renderRichText(item.text || "")}</div>
      </article>
    </div>
  `;
  }
  function renderAssistantCommentary(item, options = {}) {
    const body = renderStreamingAwareRichText(item.text || "", {
      streaming: item.status === "streaming"
    });
    if (!body) {
      return "";
    }
    const copyKey = getTimelineMessageCopyKey("assistant", item);
    const selectedClass = getTimelineSelectedClass(options, copyKey);
    return `
    <div class="transcript-row transcript-row-assistant timeline-row timeline-row-commentary" data-timeline-id="${escapeHtml3(item.id || "")}">
      <article class="msg-bubble msg-assistant turn-assistant-bubble timeline-commentary-bubble${getBubbleWidthClass(item.text)} ${item.status === "streaming" ? "timeline-assistant-streaming" : ""}${selectedClass}" data-message-copy-key="${escapeHtml3(copyKey)}" aria-label="${escapeHtml3(t("timeline.assistantCommentary"))}">
        <div class="msg-bubble-body msg-md timeline-commentary-body">
          ${body}
        </div>
      </article>
    </div>
  `;
  }
  function renderAssistantFinal(item, options = {}) {
    const body = renderStreamingAwareRichText(item.text || "", {
      streaming: item.status === "streaming"
    });
    if (!body) {
      return "";
    }
    const copyKey = getTimelineMessageCopyKey("assistant", item);
    const selectedClass = getTimelineSelectedClass(options, copyKey);
    return `
    <div class="transcript-row transcript-row-assistant timeline-row timeline-row-final" data-timeline-id="${escapeHtml3(item.id || "")}">
      <article class="msg-bubble msg-assistant turn-assistant-bubble${getBubbleWidthClass(item.text)} ${item.status === "streaming" ? "timeline-assistant-streaming" : ""}${selectedClass}" data-message-copy-key="${escapeHtml3(copyKey)}" aria-label="${escapeHtml3(t("timeline.assistant"))}">
        <div class="msg-bubble-body msg-md">
          ${body}
        </div>
      </article>
    </div>
  `;
  }
  function renderReasoningItem(item, options = {}) {
    const activeElapsedLabel = item.status === "thinking" ? String(options.activeElapsedLabel || "").trim() : "";
    const reasoningText = String(item.summary || item.text || "").trim();
    if (!reasoningText && !item.synthetic) {
      return "";
    }
    return `
    <div class="transcript-row transcript-row-assistant timeline-row timeline-row-reasoning" data-timeline-id="${escapeHtml3(item.id || "")}">
      <div class="timeline-reasoning ${item.status === "thinking" ? "timeline-reasoning-thinking" : ""}">
        <div class="assistant-thinking-row">
          <span class="assistant-thinking">${escapeHtml3(reasoningText || t("timeline.thinking"))}</span>
          ${activeElapsedLabel ? `<span class="assistant-thinking-elapsed" data-active-elapsed="true">${escapeHtml3(activeElapsedLabel)}</span>` : ""}
        </div>
      </div>
    </div>
  `;
  }
  function renderCommandItem(item) {
    const classification = classifyCommandActivity(item);
    const display = resolveActivityDisplay(item, classification);
    const inlineOutput = String(item.output || item.stdout || "");
    const isRunning = item.status === "running" || item.outputStatus === "streaming" || item.status === "awaiting_approval";
    const isFailed = item.status === "failed" || item.status === "rejected" || item.exitCode !== null && item.exitCode !== void 0 && Number.isFinite(Number(item.exitCode)) && Number(item.exitCode) !== 0 || Boolean(String(item.stderr || "").trim());
    const canRenderInline = isRunning || !isFailed && !["unknown"].includes(classification.kind);
    const shouldRenderCard = !canRenderInline && !isFailed;
    const summary = [];
    const pushSummary = (value) => {
      if (!value || summary.includes(value)) {
        return;
      }
      summary.push(value);
    };
    pushSummary(display.subtitle);
    pushSummary(item.cwd ? `cwd: ${item.cwd}` : "");
    pushSummary(
      item.exitCode !== null && item.exitCode !== void 0 ? `exit ${item.exitCode}` : ""
    );
    pushSummary(item.status);
    const shouldOpen = item.status === "running" || item.outputStatus === "streaming";
    if (!shouldRenderCard) {
      const inlineMeta = display.subtitle || compactCommandPreview(item.command || "");
      const detail = renderInlineActivityDetail({
        shell: item.command || "",
        output: inlineOutput,
        error: item.stderr || ""
      });
      return renderInlineActivityRow({
        rowClass: "timeline-row-command timeline-row-inline-command",
        itemId: item.id || "",
        label: display.title || t("timeline.command"),
        meta: inlineMeta,
        detail,
        open: isRunning || isFailed
      });
    }
    return `
    <div class="transcript-row transcript-row-assistant timeline-row timeline-row-command" data-timeline-id="${escapeHtml3(item.id || "")}">
      <div class="timeline-card timeline-card-command timeline-card-${escapeHtml3(item.status || "pending")}">
        <details ${shouldOpen ? "open" : ""}>
          <summary>
            <span class="timeline-card-title">${escapeHtml3(display.title || t("timeline.command"))}</span>
            <span class="timeline-card-meta">${escapeHtml3(summary.join(" \xB7 "))}</span>
          </summary>
          <div class="timeline-card-body">
            ${display.showRawCommandAsBody && item.command ? `<pre class="timeline-card-pre">${escapeHtml3(item.command)}</pre>` : ""}
            ${item.output ? `<pre class="timeline-card-pre">${escapeHtml3(item.output)}</pre>` : item.stdout ? `<pre class="timeline-card-pre">${escapeHtml3(item.stdout)}</pre>` : item.status === "running" ? renderStreamingPlaceholder(t("timeline.commandStreaming")) : ""}
            ${item.stderr ? `<pre class="timeline-card-pre timeline-card-pre-error">${escapeHtml3(item.stderr)}</pre>` : ""}
          </div>
        </details>
      </div>
    </div>
  `;
  }
  function renderPatchItem(item) {
    const classification = classifyCommandActivity(item);
    const display = resolveActivityDisplay(item, classification);
    const isRunning = item.status === "running" || item.outputStatus === "streaming" || item.status === "awaiting_approval";
    const looksFailed = item.success === false || Boolean(String(item.stderr || "").trim()) || /verification failed/i.test(String(item.output || "")) || /failed to find expected lines/i.test(String(item.output || ""));
    const shouldRenderCard = !looksFailed && !isRunning && classification.files.length === 0;
    const meta = [];
    const pushMeta = (value) => {
      if (!value || meta.includes(value)) {
        return;
      }
      meta.push(value);
    };
    pushMeta(display.subtitle);
    pushMeta(item.status || "pending");
    if (item.success === true) {
      pushMeta("success");
    } else if (item.success === false) {
      pushMeta("failed");
    }
    const shouldOpen = item.status === "running" || item.outputStatus === "streaming";
    if (!shouldRenderCard) {
      const detail = renderInlineActivityDetail({
        patchText: item.patchText || "",
        output: item.output || "",
        error: item.stderr || ""
      });
      return renderInlineActivityRow({
        rowClass: "timeline-row-patch timeline-row-inline-patch",
        itemId: item.id || "",
        label: display.title || t("timeline.patch"),
        meta: renderInlinePatchMeta(item, classification, display),
        detail,
        open: isRunning || looksFailed
      });
    }
    return `
    <div class="transcript-row transcript-row-assistant timeline-row timeline-row-patch" data-timeline-id="${escapeHtml3(item.id || "")}">
      <div class="timeline-card timeline-card-patch timeline-card-${escapeHtml3(item.status || "pending")}">
        <details ${shouldOpen ? "open" : ""}>
          <summary>
            <span class="timeline-card-title">${escapeHtml3(display.title || t("timeline.patch"))}</span>
            <span class="timeline-card-meta">${escapeHtml3(meta.join(" \xB7 "))}</span>
          </summary>
          <div class="timeline-card-body">
            ${item.patchText ? `<pre class="timeline-card-pre">${escapeHtml3(item.patchText)}</pre>` : ""}
            ${renderChanges(item.changes)}
            ${item.output ? `<pre class="timeline-card-pre">${escapeHtml3(item.output)}</pre>` : item.status === "running" ? renderStreamingPlaceholder(t("timeline.patchStreaming")) : ""}
            ${item.stderr ? `<pre class="timeline-card-pre timeline-card-pre-error">${escapeHtml3(item.stderr)}</pre>` : ""}
          </div>
        </details>
      </div>
    </div>
  `;
  }
  function renderActivitySummaryItem(item) {
    const summary = item.summary || {};
    const browseFiles = Array.isArray(summary.browseFiles) ? summary.browseFiles : [];
    const searchTargets = Array.isArray(summary.searchTargets) ? summary.searchTargets : [];
    const metaParts = [];
    const browsePreview = getCompactDisplayPaths(browseFiles, 2);
    const searchPreview = getCompactDisplayPaths(searchTargets, 2);
    if (browsePreview.preview.length > 0) {
      metaParts.push(formatInlineList(browsePreview.preview));
    }
    if (browsePreview.remainingCount > 0) {
      metaParts.push(t("timeline.summary.moreFiles", { count: browsePreview.remainingCount }));
    }
    if (summary.searchCount > 0 && searchPreview.preview.length > 0) {
      metaParts.push(
        browsePreview.preview.length > 0 ? t("timeline.summary.searchAt", { value: formatInlineList(searchPreview.preview) }) : formatInlineList(searchPreview.preview)
      );
    }
    if (summary.validationCount > 0 && searchPreview.preview.length > 0 && summary.searchCount === 0) {
      metaParts.push(formatInlineList(searchPreview.preview));
    }
    if (summary.searchCount > 0 && searchPreview.remainingCount > 0 && browsePreview.preview.length === 0) {
      metaParts.push(t("timeline.summary.moreLocations", { count: searchPreview.remainingCount }));
    }
    if (summary.validationCount > 0 && searchPreview.remainingCount > 0 && summary.searchCount === 0) {
      metaParts.push(t("timeline.summary.moreLocations", { count: searchPreview.remainingCount }));
    }
    if (summary.commandsCount > 0 && metaParts.length === 0) {
      metaParts.push(t("timeline.summary.activities", { count: summary.commandsCount }));
    }
    const detail = {
      hasDetail: Array.isArray(item.rawItems) && item.rawItems.length > 0,
      bodyHtml: renderRawActivityItems(item.rawItems)
    };
    return renderInlineActivityRow({
      rowClass: "timeline-row-activity-summary",
      itemId: item.id || "",
      label: summary.title || t("timeline.activitySummary"),
      meta: metaParts.join(" \xB7 "),
      detail
    });
  }
  function renderFileChangeSummaryItem(item) {
    const files = Array.isArray(item.files) ? item.files : [];
    const basenameCounts = /* @__PURE__ */ new Map();
    files.forEach((file) => {
      const key = basename(file.path || "") || file.path || "";
      basenameCounts.set(key, (basenameCounts.get(key) || 0) + 1);
    });
    const preview = files.slice(0, 2).map((file) => {
      const path = file.path || t("timeline.file.untitled");
      const compact = basename(path) || path;
      const displayPath = (basenameCounts.get(compact) || 0) > 1 ? path : compact;
      return `${displayPath} +${Number(file.added || 0)} -${Number(file.removed || 0)}`;
    });
    if (files.length > 2) {
      preview.push(t("timeline.summary.moreItems", { count: files.length }));
    }
    const detail = {
      hasDetail: Array.isArray(item.rawItems) && item.rawItems.length > 0,
      bodyHtml: renderRawActivityItems(item.rawItems)
    };
    return renderInlineActivityRow({
      rowClass: "timeline-row-file-change-summary",
      itemId: item.id || "",
      label: item.title || t("timeline.fileChanges"),
      meta: formatInlineList(preview),
      detail
    });
  }
  function renderApprovalItem(item) {
    const metaParts = [];
    if (item.status === "rejected") {
      metaParts.push(t("approval.deny"));
    } else if (item.status === "resolved") {
      if (item.decision === "acceptForSession") {
        metaParts.push(t("approval.allowForTurn"));
      } else {
        metaParts.push(t("approval.allowOnce"));
      }
    } else {
      metaParts.push(t("approval.pending"));
    }
    if (item.reason) {
      metaParts.push(item.reason);
    } else if (item.command) {
      metaParts.push(compactCommandPreview(item.command, 88));
    }
    return renderInlineActivityRow({
      rowClass: "timeline-row-approval-history",
      itemId: item.id || "",
      label: localizeApprovalTitle(item.title),
      meta: metaParts.join(" \xB7 ")
    });
  }
  function renderSystemItem(item) {
    return `
    <div class="transcript-row transcript-row-assistant timeline-row timeline-row-system" data-timeline-id="${escapeHtml3(item.id || "")}">
      <div class="timeline-system timeline-system-${escapeHtml3(item.status || item.subtype || "neutral")}">
        ${escapeHtml3(item.text || item.subtype || t("timeline.system"))}
      </div>
    </div>
  `;
  }

  // package/web/session-ws.js
  function connectSessionSocket(sessionId, handlers) {
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
      var _a, _b, _c, _d, _e;
      if (closed || !normalizedSessionId) {
        return;
      }
      try {
        if (!initialized) {
          const data = await fetchEvents({ limit: "1" });
          const items = Array.isArray(data == null ? void 0 : data.items) ? data.items : [];
          const latestSeq = Number((data == null ? void 0 : data.afterCursor) || ((_a = items[items.length - 1]) == null ? void 0 : _a.seq) || 0);
          cursor = Number.isFinite(latestSeq) ? latestSeq : 0;
          initialized = true;
          (_b = handlers.onStateChange) == null ? void 0 : _b.call(handlers, "polling");
        } else {
          const data = await fetchEvents(cursor > 0 ? { after: String(cursor) } : {});
          const items = Array.isArray(data == null ? void 0 : data.items) ? data.items : [];
          items.slice().sort((a, b) => Number((a == null ? void 0 : a.seq) || 0) - Number((b == null ? void 0 : b.seq) || 0)).forEach((event) => {
            var _a2;
            const seq = Number((event == null ? void 0 : event.seq) || 0);
            if (Number.isFinite(seq) && seq > cursor) {
              cursor = seq;
            }
            (_a2 = handlers.onEvent) == null ? void 0 : _a2.call(handlers, event);
          });
          (_c = handlers.onStateChange) == null ? void 0 : _c.call(handlers, "polling");
        }
        retryDelayMs = 1500;
        schedule(retryDelayMs);
      } catch (error) {
        (_d = handlers.onError) == null ? void 0 : _d.call(handlers, error);
        (_e = handlers.onStateChange) == null ? void 0 : _e.call(handlers, "reconnecting");
        retryDelayMs = Math.min(Math.round(retryDelayMs * 1.5), 1e4);
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
      }
    };
  }

  // package/web/app.js
  var app = document.querySelector("#app");
  var SESSION_VIEW_STORAGE_KEY = "remote-agent-console.sessions.view";
  var SESSION_DETAIL_CACHE_STORAGE_PREFIX = "remote-agent-console.sessionDetailCache.v1:";
  var SESSION_DETAIL_CACHE_INDEX_STORAGE_KEY = "remote-agent-console.sessionDetailCache.index.v1";
  var CODEX_QUOTA_CACHE_PREFIX = "remote-agent-console.codexQuota:";
  var COMPOSER_DRAFT_STORAGE_PREFIX = "remote-agent-console.composerDraft:";
  var MOBILE_SEND_QUEUE_STORAGE_KEY = "remote-agent-console.mobileSendQueue.v1";
  var MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY = "remote-agent-console.mobileSendQueue.lock.v1";
  var WORKSPACE_UI_STORAGE_KEY = "remote-agent-console.workspace.ui";
  var WORKSPACE_UNREAD_STORAGE_KEY = "remote-agent-console.workspace.unread";
  var COMPLETION_ALERT_STORAGE_KEY = "remote-agent-console.completionAlerts.v1";
  var COMPLETION_ACTION_STORAGE_KEY = "remote-agent-console.completionActions.v1";
  var COMPLETION_ACTION_MIGRATION_STORAGE_KEY = "remote-agent-console.completionActions.migrations.v1";
  var COMPLETION_SPEECH_FLOAT_STORAGE_KEY = "remote-agent-console.completionSpeechFloat.v1";
  var CREATE_SESSION_PREF_STORAGE_KEY = "remote-agent-console.createSessionPrefs.v1";
  var TASK_PLAN_PANEL_STORAGE_KEY = "remote-agent-console.taskPlanPanel.v1";
  var INITIAL_DETAIL_EVENT_PAGE_LIMIT = 200;
  var SESSION_DETAIL_CACHE_MAX_SESSIONS = 12;
  var SESSION_DETAIL_CACHE_MAX_RAW_EVENTS = 180;
  var DETAIL_RENDER_BATCH_MS = 0;
  var COMPLETION_NOTICE_MS = 9e3;
  var COMPLETION_ACTION_READ_MAX_CHARS = 1200;
  var COMPLETION_ACTION_READ_SUMMARY_MAX_CHARS = 200;
  var COMPLETION_AUTO_CONTINUE_PROMPT = "\u81EA\u52A8\u4E0B\u4E00\u6B65";
  var COMPLETION_MANUAL_CONTINUE_PROMPT = "\u7EE7\u7EED\u4E0B\u4E00\u6B65";
  var COMPLETION_SUMMARY_PROMPT = "\u8BF7\u7528\u7B80\u77ED\u4E2D\u6587\u603B\u7ED3\u521A\u624D\u5B8C\u6210\u7684\u5185\u5BB9\u3001\u4FEE\u6539\u4E86\u54EA\u4E9B\u6587\u4EF6\u3001\u4E0B\u4E00\u6B65\u5EFA\u8BAE\u505A\u4EC0\u4E48\u3002";
  var COMPOSER_ATTACHMENT_MAX_COUNT = 8;
  var COMPOSER_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
  var COMPOSER_ATTACHMENT_TOTAL_MAX_BYTES = 60 * 1024 * 1024;
  var COMPOSER_SEND_DEDUPE_WINDOW_MS = 4e3;
  var MOBILE_SEND_QUEUE_LOCK_MS = 9e4;
  var LEGACY_LOCAL_QUEUE_FLUSH_ENABLED = false;
  var WORKSPACE_UNREAD_BADGE_MAX = 99;
  var WORKSPACE_SESSIONS_REFRESH_MS = 1e4;
  var CLIENT_INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  var clientDebugLastSentAt = 0;
  var missingDetailRecoveryAttempts = {};
  var activeRouteRenderHash = "";
  var activeRouteRenderPromise = null;
  var activeWorkspaceRenderSessionId = "";
  var activeWorkspaceRenderPromise = null;
  var lastToastMessage = "";
  var lastToastAt = 0;
  var completionAudioElement = null;
  var lastCompletionAudioError = "";
  var completionAudioUnavailableForCjk = false;
  var messageCopyMenuListenersBound = false;
  var MESSAGE_COPY_TAP_MAX_DURATION_MS = 260;
  var MESSAGE_COPY_TAP_MAX_MOVE_PX = 10;
  var MESSAGE_COPY_TAP_CLICK_WINDOW_MS = 700;
  var MESSAGE_COPY_SELECTION_SUPPRESS_MS = 900;
  var messageCopyTapCandidate = null;
  var pendingMessageCopyTap = null;
  var messageCopySelectionSuppressUntil = 0;
  var composerSendGuard = {
    key: "",
    active: false,
    finishedAt: 0
  };
  function collectClientDebug(extra = {}) {
    var _a, _b, _c, _d, _e;
    const root = document.querySelector("#app");
    const shell = document.querySelector(".workspace-shell");
    const detail = document.querySelector("#session-detail-shell");
    const transcript = document.querySelector("#session-transcript-slot");
    const rootRect = (_a = root == null ? void 0 : root.getBoundingClientRect) == null ? void 0 : _a.call(root);
    const detailRect = (_b = detail == null ? void 0 : detail.getBoundingClientRect) == null ? void 0 : _b.call(detail);
    const text = String((root == null ? void 0 : root.innerText) || "");
    return __spreadValues({
      at: (/* @__PURE__ */ new Date()).toISOString(),
      instanceId: CLIENT_INSTANCE_ID,
      href: window.location.href,
      hash: window.location.hash,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        visualWidth: ((_c = window.visualViewport) == null ? void 0 : _c.width) || 0,
        visualHeight: ((_d = window.visualViewport) == null ? void 0 : _d.height) || 0,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      root: {
        exists: Boolean(root),
        childCount: ((_e = root == null ? void 0 : root.children) == null ? void 0 : _e.length) || 0,
        textLength: text.length,
        textPreview: text.slice(0, 180),
        rect: rootRect ? { x: rootRect.x, y: rootRect.y, width: rootRect.width, height: rootRect.height } : null
      },
      shell: {
        exists: Boolean(shell),
        className: (shell == null ? void 0 : shell.className) || ""
      },
      detail: {
        exists: Boolean(detail),
        className: (detail == null ? void 0 : detail.className) || "",
        rect: detailRect ? { x: detailRect.x, y: detailRect.y, width: detailRect.width, height: detailRect.height } : null
      },
      transcript: {
        exists: Boolean(transcript),
        textLength: String((transcript == null ? void 0 : transcript.innerText) || "").length
      }
    }, extra);
  }
  function serializeClientError(error) {
    if (!error) {
      return { message: "" };
    }
    return {
      name: String(error.name || ""),
      message: messageOf(error),
      stack: String(error.stack || "").slice(0, 2e3)
    };
  }
  function reportClientDebug(reason, extra = {}, options = {}) {
    const now = Date.now();
    if (!options.force && now - clientDebugLastSentAt < 2500) {
      return;
    }
    clientDebugLastSentAt = now;
    const payload = collectClientDebug(__spreadValues({ reason }, extra));
    try {
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon("/api/client-debug", blob)) {
          return;
        }
      }
      fetch("/api/client-debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        cache: "no-store",
        keepalive: true
      }).catch(() => null);
    } catch (e) {
    }
  }
  function installBlankScreenWatchdog() {
    window.setTimeout(() => {
      const text = String((app == null ? void 0 : app.innerText) || "").trim();
      const hasShell = Boolean(document.querySelector(".workspace-shell"));
      reportClientDebug("blank-screen-watchdog", { hasShell, textLength: text.length });
      if (text || hasShell) {
        return;
      }
      if (!app) {
        return;
      }
      app.innerHTML = `
      <section style="padding:24px">
        <div style="border:1px solid rgba(180,35,24,.25);border-radius:14px;background:#fff7f6;color:#b42318;padding:16px 18px;font:14px/1.6 system-ui,sans-serif">
          <strong style="display:block;margin-bottom:8px">Syncodex \u9875\u9762\u542F\u52A8\u5F02\u5E38</strong>
          <div>\u524D\u7AEF\u8D44\u6E90\u5DF2\u52A0\u8F7D\uFF0C\u4F46\u9875\u9762\u6839\u8282\u70B9\u4ECD\u4E3A\u7A7A\u3002\u8BCA\u65AD\u4FE1\u606F\u5DF2\u5199\u5165\u7535\u8111\u7AEF\u65E5\u5FD7\u3002</div>
          <button type="button" onclick="location.reload()" style="margin-top:12px;border:0;border-radius:999px;background:#b42318;color:white;padding:8px 14px;font-weight:700">\u91CD\u65B0\u52A0\u8F7D</button>
        </div>
      </section>`;
    }, 4200);
    window.setTimeout(() => {
      const route = parseHashRoute(window.location.hash || "");
      const matched = route.path.match(/^#\/sessions\/([^/]+)$/);
      const sessionId = String((matched == null ? void 0 : matched[1]) || "").trim();
      const hasShell = Boolean(document.querySelector(".workspace-shell"));
      const hasDetail = Boolean(document.querySelector("#session-detail-shell"));
      if (!sessionId || !hasShell || hasDetail) {
        return;
      }
      const attempts = Number(missingDetailRecoveryAttempts[sessionId] || 0);
      if (attempts >= 2) {
        reportClientDebug(
          "missing-detail-recovery-skipped",
          { sessionId, attempts },
          { force: true }
        );
        return;
      }
      missingDetailRecoveryAttempts[sessionId] = attempts + 1;
      reportClientDebug(
        "missing-detail-recovery-start",
        { sessionId, attempt: attempts + 1 },
        { force: true }
      );
      void renderWorkspacePage(sessionId).then(() => {
        reportClientDebug(
          "missing-detail-recovery-complete",
          {
            sessionId,
            hasDetail: Boolean(document.querySelector("#session-detail-shell"))
          },
          { force: true }
        );
      }).catch((error) => {
        reportClientDebug(
          "missing-detail-recovery-error",
          { sessionId, error: serializeClientError(error) },
          { force: true }
        );
      });
    }, 12e3);
  }
  stripMobileAccessTokenFromAddressBar();
  function stripMobileAccessTokenFromAddressBar() {
    var _a;
    if (typeof window === "undefined" || !((_a = window.history) == null ? void 0 : _a.replaceState)) {
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
    } catch (e) {
    }
  }
  function buildComposerSendGuardKey(sessionId, content, attachments = []) {
    const attachmentKey = attachments.map((item) => [(item == null ? void 0 : item.path) || "", (item == null ? void 0 : item.name) || "", (item == null ? void 0 : item.size) || ""].join(":")).join("|");
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
    return __spreadProps(__spreadValues({}, source), {
      clientMessageId
    });
  }
  function acquireComposerSendGuard(key) {
    const now = Date.now();
    if (composerSendGuard.key === key && (composerSendGuard.active || now - composerSendGuard.finishedAt < COMPOSER_SEND_DEDUPE_WINDOW_MS)) {
      return false;
    }
    composerSendGuard = {
      key,
      active: true,
      finishedAt: 0
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
      finishedAt: Date.now()
    };
  }
  var GENERIC_SESSION_TITLES = /* @__PURE__ */ new Set([
    "\u672A\u547D\u540D\u4F1A\u8BDD",
    "\u65B0\u4F1A\u8BDD",
    "Untitled session",
    "New session"
  ]);
  var DEFAULT_SESSIONS_VIEW = {
    keyword: "",
    status: "all",
    projectId: "all",
    thread: "all",
    sort: "activity_desc",
    page: 1,
    pageSize: 8
  };
  var DEFAULT_DETAIL_VIEW = {
    filter: "all",
    severity: "all",
    search: "",
    autoScroll: true,
    rawStdoutBuckets: {}
  };
  function isMobileWorkspaceViewport() {
    return window.matchMedia("(max-width: 759px)").matches;
  }
  function readWorkspaceUiState() {
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(WORKSPACE_UI_STORAGE_KEY);
      if (!raw) {
        return { sidebarCollapsed: false, collapsedProjectIds: [] };
      }
      const parsed = JSON.parse(raw);
      return {
        sidebarCollapsed: Boolean(parsed == null ? void 0 : parsed.sidebarCollapsed),
        collapsedProjectIds: Array.isArray(parsed == null ? void 0 : parsed.collapsedProjectIds) ? parsed.collapsedProjectIds.map((id) => String(id)).filter(Boolean) : []
      };
    } catch (e) {
      return { sidebarCollapsed: false, collapsedProjectIds: [] };
    }
  }
  function readWorkspaceUnreadState() {
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(WORKSPACE_UNREAD_STORAGE_KEY);
      if (!raw) {
        return { readEventCounts: {} };
      }
      const parsed = JSON.parse(raw);
      const readEventCounts = {};
      const source = parsed && typeof parsed.readEventCounts === "object" && parsed.readEventCounts ? parsed.readEventCounts : {};
      Object.entries(source).forEach(([sessionId, value]) => {
        const normalizedSessionId = String(sessionId || "").trim();
        const count = Number(value || 0);
        if (normalizedSessionId && Number.isFinite(count) && count >= 0) {
          readEventCounts[normalizedSessionId] = Math.floor(count);
        }
      });
      return { readEventCounts };
    } catch (e) {
      return { readEventCounts: {} };
    }
  }
  function readCompletionAlertPrefs() {
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(COMPLETION_ALERT_STORAGE_KEY);
      if (!raw) {
        return { enabled: false, browser: false, vibration: false };
      }
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed == null ? void 0 : parsed.enabled),
        browser: Boolean(parsed == null ? void 0 : parsed.browser),
        vibration: Boolean(parsed == null ? void 0 : parsed.vibration)
      };
    } catch (e) {
      return { enabled: false, browser: false, vibration: false };
    }
  }
  function defaultCompletionActionPrefs() {
    return {
      showMenu: true,
      autoRead: true,
      autoContinue: false,
      autoContinueMaxRuns: 3
    };
  }
  function normalizeCompletionActionPrefs(value) {
    const base = defaultCompletionActionPrefs();
    const rawMax = Number(value == null ? void 0 : value.autoContinueMaxRuns);
    const maxRuns = Number.isFinite(rawMax) ? Math.max(1, Math.min(20, Math.floor(rawMax))) : base.autoContinueMaxRuns;
    return {
      showMenu: (value == null ? void 0 : value.showMenu) !== false,
      autoRead: Boolean(value == null ? void 0 : value.autoRead),
      autoContinue: Boolean(value == null ? void 0 : value.autoContinue),
      autoContinueMaxRuns: maxRuns
    };
  }
  function normalizeCompletionActionThreadPrefs(value, fallback = null) {
    const merged = normalizeCompletionActionPrefs(__spreadValues(__spreadValues({}, fallback || defaultCompletionActionPrefs()), value && typeof value === "object" ? value : {}));
    return {
      autoRead: merged.autoRead,
      autoContinue: merged.autoContinue,
      autoContinueMaxRuns: merged.autoContinueMaxRuns
    };
  }
  function readCompletionActionState() {
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(COMPLETION_ACTION_STORAGE_KEY);
      if (!raw) {
        return { prefs: defaultCompletionActionPrefs(), threadRuns: {} };
      }
      const parsed = JSON.parse(raw);
      const threadRuns = (parsed == null ? void 0 : parsed.threadRuns) && typeof parsed.threadRuns === "object" && !Array.isArray(parsed.threadRuns) ? parsed.threadRuns : {};
      return {
        prefs: normalizeCompletionActionPrefs((parsed == null ? void 0 : parsed.prefs) || parsed),
        threadRuns
      };
    } catch (e) {
      return { prefs: defaultCompletionActionPrefs(), threadRuns: {} };
    }
  }
  function applyCompletionActionMigrations(value) {
    var _a, _b, _c;
    const nextValue = {
      prefs: normalizeCompletionActionPrefs((value == null ? void 0 : value.prefs) || value),
      threadRuns: (value == null ? void 0 : value.threadRuns) && typeof value.threadRuns === "object" && !Array.isArray(value.threadRuns) ? value.threadRuns : {}
    };
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(COMPLETION_ACTION_MIGRATION_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const autoReadEnabledOnce = Boolean(parsed == null ? void 0 : parsed.autoReadEnabledOnce);
      if (!autoReadEnabledOnce && !nextValue.prefs.autoRead) {
        nextValue.prefs = __spreadProps(__spreadValues({}, nextValue.prefs), {
          autoRead: true
        });
        (_b = window.localStorage) == null ? void 0 : _b.setItem(
          COMPLETION_ACTION_STORAGE_KEY,
          JSON.stringify(nextValue)
        );
      }
      (_c = window.localStorage) == null ? void 0 : _c.setItem(
        COMPLETION_ACTION_MIGRATION_STORAGE_KEY,
        JSON.stringify(__spreadProps(__spreadValues({}, parsed && typeof parsed === "object" ? parsed : {}), {
          autoReadEnabledOnce: true
        }))
      );
    } catch (e) {
    }
    return nextValue;
  }
  function readCompletionSpeechFloatPosition() {
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(COMPLETION_SPEECH_FLOAT_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      const x = Number(parsed == null ? void 0 : parsed.x);
      const y = Number(parsed == null ? void 0 : parsed.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }
      return { x, y };
    } catch (e) {
      return null;
    }
  }
  function writeCompletionSpeechFloatPosition(position) {
    var _a;
    const x = Number(position == null ? void 0 : position.x);
    const y = Number(position == null ? void 0 : position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const nextPosition = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) };
    state.detail.speechFloatPosition = nextPosition;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(COMPLETION_SPEECH_FLOAT_STORAGE_KEY, JSON.stringify(nextPosition));
    } catch (e) {
    }
  }
  function readTaskPlanPanelCollapsed() {
    var _a;
    try {
      return ((_a = window.localStorage) == null ? void 0 : _a.getItem(TASK_PLAN_PANEL_STORAGE_KEY)) === "collapsed";
    } catch (e) {
      return false;
    }
  }
  function writeTaskPlanPanelCollapsed(collapsed) {
    var _a;
    state.workspace.taskPlanCollapsed = Boolean(collapsed);
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(
        TASK_PLAN_PANEL_STORAGE_KEY,
        collapsed ? "collapsed" : "expanded"
      );
    } catch (e) {
    }
  }
  function writeCompletionActionState() {
    var _a;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(
        COMPLETION_ACTION_STORAGE_KEY,
        JSON.stringify(state.workspace.completionActions || { prefs: defaultCompletionActionPrefs(), threadRuns: {} })
      );
    } catch (e) {
    }
  }
  function getCompletionThreadRunEntry(sessionId) {
    var _a, _b;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return {};
    }
    const rawEntry = (_b = (_a = state.workspace.completionActions) == null ? void 0 : _a.threadRuns) == null ? void 0 : _b[normalizedSessionId];
    return rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry) ? rawEntry : {};
  }
  function getCompletionActionPrefsForSession(sessionId, fallbackPrefs = null) {
    var _a;
    const globalPrefs = normalizeCompletionActionPrefs(fallbackPrefs || ((_a = state.workspace.completionActions) == null ? void 0 : _a.prefs) || {});
    const threadEntry = getCompletionThreadRunEntry(sessionId);
    const threadPrefs = normalizeCompletionActionThreadPrefs((threadEntry == null ? void 0 : threadEntry.prefs) || {}, globalPrefs);
    return __spreadProps(__spreadValues(__spreadValues({}, globalPrefs), threadPrefs), {
      showMenu: globalPrefs.showMenu
    });
  }
  function normalizeCreateSessionStartMode(value) {
    return value === "custom" ? "custom" : "project";
  }
  function readCreateSessionPrefs() {
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(CREATE_SESSION_PREF_STORAGE_KEY);
      if (!raw) {
        return { startMode: "project", cwd: "", modelId: "", reasoningId: "" };
      }
      const parsed = JSON.parse(raw);
      return {
        startMode: normalizeCreateSessionStartMode((parsed == null ? void 0 : parsed.startMode) || (parsed == null ? void 0 : parsed.mode)),
        cwd: typeof (parsed == null ? void 0 : parsed.cwd) === "string" ? parsed.cwd : "",
        modelId: "",
        reasoningId: ""
      };
    } catch (e) {
      return { startMode: "project", cwd: "", modelId: "", reasoningId: "" };
    }
  }
  function writeCreateSessionPrefsFromDialog() {
    var _a;
    const dialogState = state.workspace.createDialog;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(
        CREATE_SESSION_PREF_STORAGE_KEY,
        JSON.stringify({
          startMode: normalizeCreateSessionStartMode(dialogState.startMode),
          cwd: String(dialogState.customCwd || "").trim()
        })
      );
    } catch (e) {
    }
  }
  function writeCompletionAlertPrefs() {
    var _a;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(
        COMPLETION_ALERT_STORAGE_KEY,
        JSON.stringify(state.workspace.completionAlerts || {})
      );
    } catch (e) {
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
    var _a;
    const key = getComposerDraftStorageKey(sessionId);
    if (!key) {
      return "";
    }
    try {
      return String(((_a = window.localStorage) == null ? void 0 : _a.getItem(key)) || "");
    } catch (e) {
      return "";
    }
  }
  function writeComposerDraft(sessionId, value) {
    var _a, _b;
    const key = getComposerDraftStorageKey(sessionId);
    if (!key) {
      return;
    }
    try {
      const text = String(value || "");
      if (text) {
        (_a = window.localStorage) == null ? void 0 : _a.setItem(key, text);
      } else {
        (_b = window.localStorage) == null ? void 0 : _b.removeItem(key);
      }
    } catch (e) {
    }
  }
  function clearComposerDraft(sessionId) {
    writeComposerDraft(sessionId, "");
  }
  function normalizeMobileQueuedItem(item) {
    var _a, _b;
    const content = String((item == null ? void 0 : item.content) || (item == null ? void 0 : item.text) || ((_a = item == null ? void 0 : item.payload) == null ? void 0 : _a.content) || "").trim();
    const attachments = Array.isArray(item == null ? void 0 : item.attachments) ? item.attachments : Array.isArray((_b = item == null ? void 0 : item.payload) == null ? void 0 : _b.attachments) ? item.payload.attachments : [];
    if (!content && attachments.length <= 0) {
      return null;
    }
    const payload = (item == null ? void 0 : item.payload) && typeof item.payload === "object" && !Array.isArray(item.payload) ? __spreadProps(__spreadValues({}, item.payload), { content }) : { content };
    const clientMessageId = String((item == null ? void 0 : item.clientMessageId) || payload.clientMessageId || payload.client_message_id || "").trim() || createClientMessageId("queue");
    payload.clientMessageId = clientMessageId;
    if (attachments.length > 0) {
      payload.attachments = attachments;
    }
    return {
      id: String((item == null ? void 0 : item.id) || `mobile-queue:${Date.now()}:${Math.random().toString(16).slice(2)}`),
      clientMessageId,
      origin: String((item == null ? void 0 : item.origin) || "syncodex_mobile").trim() || "syncodex_mobile",
      startsAutoContinueSequence: Boolean(item == null ? void 0 : item.startsAutoContinueSequence),
      autoContinueMaxRuns: Math.max(0, Math.floor(Number((item == null ? void 0 : item.autoContinueMaxRuns) || 0))),
      content: content || attachments.map((attachment) => attachment.name || attachment.path || "attachment").join(", "),
      payload,
      createdAt: String((item == null ? void 0 : item.createdAt) || (/* @__PURE__ */ new Date()).toISOString())
    };
  }
  function readMobileSendQueueState() {
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(MOBILE_SEND_QUEUE_STORAGE_KEY);
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
    } catch (e) {
      return {};
    }
  }
  function writeMobileSendQueueState() {
    var _a;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(
        MOBILE_SEND_QUEUE_STORAGE_KEY,
        JSON.stringify(state.workspace.mobileSendQueue || {})
      );
    } catch (e) {
    }
  }
  function syncMobileSendQueueStateFromStorage() {
    state.workspace.mobileSendQueue = readMobileSendQueueState();
  }
  function tryAcquireMobileQueueFlushLock(sessionId) {
    var _a, _b, _c;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return "";
    }
    const now = Date.now();
    const owner = `${CLIENT_INSTANCE_ID}:${normalizedSessionId}:${now}`;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY);
      const current = raw ? JSON.parse(raw) : null;
      if (current && String(current.sessionId || "") === normalizedSessionId && String(current.owner || "") !== owner && Number(current.expiresAt || 0) > now) {
        return "";
      }
      (_b = window.localStorage) == null ? void 0 : _b.setItem(
        MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY,
        JSON.stringify({
          sessionId: normalizedSessionId,
          owner,
          expiresAt: now + MOBILE_SEND_QUEUE_LOCK_MS
        })
      );
      const storedRaw = (_c = window.localStorage) == null ? void 0 : _c.getItem(MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY);
      const stored = storedRaw ? JSON.parse(storedRaw) : null;
      return String((stored == null ? void 0 : stored.owner) || "") === owner ? owner : "";
    } catch (e) {
      return owner;
    }
  }
  function releaseMobileQueueFlushLock(owner) {
    var _a, _b;
    const normalizedOwner = String(owner || "").trim();
    if (!normalizedOwner) {
      return;
    }
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY);
      const current = raw ? JSON.parse(raw) : null;
      if (String((current == null ? void 0 : current.owner) || "") === normalizedOwner) {
        (_b = window.localStorage) == null ? void 0 : _b.removeItem(MOBILE_SEND_QUEUE_LOCK_STORAGE_KEY);
      }
    } catch (e) {
    }
  }
  function getMobileQueuedMessages(sessionId) {
    var _a;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return [];
    }
    const items = (_a = state.workspace.mobileSendQueue) == null ? void 0 : _a[normalizedSessionId];
    return Array.isArray(items) ? items : [];
  }
  function setMobileQueuedMessages(sessionId, items) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return;
    }
    const normalizedItems = (Array.isArray(items) ? items : []).map(normalizeMobileQueuedItem).filter(Boolean);
    state.workspace.mobileSendQueue = __spreadValues({}, state.workspace.mobileSendQueue || {});
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
    const nextItems = options.toFront ? [queuedItem, ...getMobileQueuedMessages(sessionId)] : [...getMobileQueuedMessages(sessionId), queuedItem];
    setMobileQueuedMessages(sessionId, nextItems);
    return nextItems.length;
  }
  function isAutoContinueQueuedItem(item) {
    return String((item == null ? void 0 : item.origin) || "").trim() === "syncodex_auto_continue";
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
    const nextItems = items.filter((item) => String((item == null ? void 0 : item.id) || "") !== normalizedItemId);
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
      if (String((item == null ? void 0 : item.id) || "") !== normalizedItemId) {
        return item;
      }
      const payload = (item == null ? void 0 : item.payload) && typeof item.payload === "object" && !Array.isArray(item.payload) ? __spreadValues({}, item.payload) : {};
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
      return __spreadProps(__spreadValues({}, item), {
        content: nextContent,
        payload
      });
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
    const index = items.findIndex((item2) => String((item2 == null ? void 0 : item2.id) || "") === normalizedItemId);
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
    var _a;
    const localCount = getMobileQueuedMessages(sessionId).length;
    const officialCount = ((_a = state.detail.session) == null ? void 0 : _a.sessionId) === sessionId ? getOfficialQueuedMessages(state.detail.session).length : 0;
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
    const text = String((item == null ? void 0 : item.text) || (item == null ? void 0 : item.content) || "").trim();
    if (!text) {
      return null;
    }
    return {
      id: String((item == null ? void 0 : item.id) || `official-queue:${index}`),
      origin: "official_codex",
      label: t("queue.originOfficial"),
      text,
      cwd: String((item == null ? void 0 : item.cwd) || ""),
      createdAt: String((item == null ? void 0 : item.createdAt) || ""),
      createdAtMs: Number((item == null ? void 0 : item.createdAtMs) || 0) || 0
    };
  }
  function getOfficialQueuedMessages(session = state.detail.session) {
    const items = Array.isArray(session == null ? void 0 : session.officialQueuedFollowUps) ? session.officialQueuedFollowUps : Array.isArray(session == null ? void 0 : session.officialQueuedFollowUpsPreview) ? session.officialQueuedFollowUpsPreview : [];
    return items.map(normalizeOfficialQueuedItem).filter(Boolean);
  }
  function getOfficialQueueCount(session = state.detail.session) {
    var _a, _b;
    const count = Number((_b = (_a = session == null ? void 0 : session.officialQueueCount) != null ? _a : session == null ? void 0 : session.officialQueuedFollowupCount) != null ? _b : 0);
    if (Number.isFinite(count) && count > 0) {
      return count;
    }
    return getOfficialQueuedMessages(session).length;
  }
  function hasOfficialQueuedMessages(session = state.detail.session) {
    return getOfficialQueueCount(session) > 0;
  }
  function applyOfficialQueueResult(result, session = state.detail.session) {
    var _a, _b;
    if (!session || !result) {
      return;
    }
    const items = Array.isArray(result.items) ? result.items : [];
    session.officialQueuedFollowUps = items;
    session.officialQueuedFollowUpsPreview = items.slice(0, 2);
    session.officialQueueCount = Number((_b = (_a = result.officialQueueCount) != null ? _a : result.count) != null ? _b : items.length) || 0;
    session.officialQueuedFollowupCount = session.officialQueueCount;
    session.hasOfficialQueue = session.officialQueueCount > 0;
  }
  async function refreshOfficialQueueForSession(sessionId) {
    var _a;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return null;
    }
    const result = await getSessionQueue(normalizedSessionId);
    if (((_a = state.detail.session) == null ? void 0 : _a.sessionId) === normalizedSessionId) {
      applyOfficialQueueResult(result, state.detail.session);
      scheduleSessionDetailRender();
    }
    return result;
  }
  function getUnifiedQueuedMessages(session = state.detail.session) {
    const sessionId = String((session == null ? void 0 : session.sessionId) || "").trim();
    const officialItems = getOfficialQueuedMessages(session).map((item) => __spreadProps(__spreadValues({}, item), {
      origin: "official_codex",
      label: t("queue.originOfficial")
    }));
    const localItems = getMobileQueuedMessages(sessionId).map((item, index) => ({
      id: item.id || `mobile-queue:${index}`,
      origin: item.origin === "syncodex_auto_continue" ? "syncodex_auto_continue" : "syncodex_mobile",
      label: item.origin === "syncodex_auto_continue" ? t("queue.originAutoContinue") : t("queue.originSyncodex"),
      text: item.content || "",
      cwd: "",
      createdAt: item.createdAt || "",
      createdAtMs: 0
    }));
    return [...officialItems, ...localItems];
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
        } catch (e) {
        }
      }
    });
    state.detail.composerAttachments = [];
    state.detail.composerUploadingAttachments = false;
    setForceComposerRender();
  }
  function deleteUploadedComposerAttachments(sessionId, attachments) {
    const sessionKey = String(sessionId || "").trim();
    const readyAttachments = (Array.isArray(attachments) ? attachments : []).filter(
      (item) => (item == null ? void 0 : item.status) === "ready" && (item == null ? void 0 : item.path)
    );
    if (!sessionKey || readyAttachments.length <= 0) {
      return;
    }
    deleteSessionAttachments(sessionKey, readyAttachments).catch((error) => {
      reportClientDebug(
        "composer-attachment-delete-failed",
        {
          sessionId: sessionKey,
          error: serializeClientError(error),
          attachmentCount: readyAttachments.length
        },
        { force: true }
      );
    });
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
      } catch (e) {
        return "";
      }
    })();
    if (pathName && /\.[a-z0-9]{2,5}$/i.test(pathName)) {
      return pathName.slice(0, 120);
    }
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    return `pasted-image-${stamp}-${index}.${getImageExtensionFromMime(mimeType)}`;
  }
  function normalizeClipboardImageFile(file, index) {
    const mimeType = String((file == null ? void 0 : file.type) || "");
    if (!file || !mimeType.startsWith("image/")) {
      return null;
    }
    const name = String(file.name || "").trim() || getPastedImageName(index, mimeType);
    try {
      return new File([file], name, {
        type: mimeType,
        lastModified: file.lastModified || Date.now()
      });
    } catch (e) {
      return file;
    }
  }
  function getDirectClipboardImageFiles(clipboardData) {
    const files = [];
    const seen = /* @__PURE__ */ new Set();
    Array.from((clipboardData == null ? void 0 : clipboardData.items) || []).forEach((item, index) => {
      var _a;
      if ((item == null ? void 0 : item.kind) !== "file" || !String(item.type || "").startsWith("image/")) {
        return;
      }
      const file = (_a = item.getAsFile) == null ? void 0 : _a.call(item);
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
    Array.from((clipboardData == null ? void 0 : clipboardData.files) || []).forEach((file, index) => {
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
    var _a;
    const html = String(((_a = clipboardData == null ? void 0 : clipboardData.getData) == null ? void 0 : _a.call(clipboardData, "text/html")) || "");
    if (!html || !html.includes("<img")) {
      return [];
    }
    const template = document.createElement("template");
    template.innerHTML = html;
    return Array.from(template.content.querySelectorAll("img")).map((img) => String(img.getAttribute("src") || "").trim()).filter((src) => src && !src.startsWith("blob:") && !src.startsWith("cid:")).slice(0, COMPOSER_ATTACHMENT_MAX_COUNT);
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
        lastModified: Date.now()
      });
    } catch (e) {
      return null;
    }
  }
  function getComposerAttachmentPayloads() {
    return (state.detail.composerAttachments || []).filter((item) => item.status === "ready" && item.path).map((item) => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      path: item.path,
      isImage: item.isImage
    }));
  }
  function restoreComposerAttachmentsFromPayload(payload) {
    const attachments = Array.isArray(payload == null ? void 0 : payload.attachments) ? payload.attachments : [];
    const restored = attachments.map((item) => {
      const path = String((item == null ? void 0 : item.path) || "").trim();
      if (!path) {
        return null;
      }
      return {
        id: String((item == null ? void 0 : item.id) || `attachment:${Date.now()}:${Math.random().toString(16).slice(2)}`),
        name: String((item == null ? void 0 : item.name) || path.split(/[\\/]/).pop() || "attachment"),
        mimeType: String((item == null ? void 0 : item.mimeType) || (item == null ? void 0 : item.type) || ""),
        size: Number((item == null ? void 0 : item.size) || 0) || 0,
        path,
        isImage: Boolean(item == null ? void 0 : item.isImage) || String((item == null ? void 0 : item.mimeType) || (item == null ? void 0 : item.type) || "").startsWith("image/"),
        previewUrl: "",
        status: "ready"
      };
    }).filter(Boolean);
    if (!restored.length) {
      return;
    }
    const existing = state.detail.composerAttachments || [];
    const existingIds = new Set(existing.map((item) => String(item.id || "")));
    state.detail.composerAttachments = [
      ...existing,
      ...restored.filter((item) => !existingIds.has(String(item.id || "")))
    ];
    state.detail.composerUploadingAttachments = state.detail.composerAttachments.some(
      (item) => item.status === "uploading"
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
    const attachmentStatusText = typeof options.attachmentStatusText === "string" ? options.attachmentStatusText : getComposerAttachmentStatusText();
    if (attachmentStatusText) {
      return attachmentStatusText;
    }
    const queuedStatus = typeof options.queuedStatus === "string" ? options.queuedStatus : getMobileQueueStatusText(session.sessionId);
    if (queuedStatus) {
      return queuedStatus;
    }
    const currentBusy = typeof options.currentBusy === "boolean" ? options.currentBusy : isSessionLiveBusy(session);
    if (currentBusy) {
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
      path: ""
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
          data: await fileToDataUrl(file)
        }))
      );
      const result = await uploadSessionAttachments(sessionId, attachments);
      const savedById = new Map((result.items || result.attachments || []).map((item) => [String(item.id), item]));
      state.detail.composerAttachments = (state.detail.composerAttachments || []).map((item) => {
        const saved = savedById.get(String(item.id));
        if (!saved) {
          return item.status === "uploading" ? __spreadProps(__spreadValues({}, item), { status: "failed" }) : item;
        }
        return __spreadProps(__spreadValues({}, item), {
          name: saved.name || item.name,
          mimeType: saved.mimeType || item.mimeType,
          size: saved.size || item.size,
          path: saved.path || "",
          isImage: Boolean(saved.isImage) || item.isImage,
          status: "ready"
        });
      });
      showToast(t("composer.attachments.added", { count: records.length }));
    } catch (error) {
      state.detail.composerAttachments = (state.detail.composerAttachments || []).map(
        (item) => records.some((record) => record.id === item.id) ? __spreadProps(__spreadValues({}, item), { status: "failed" }) : item
      );
      showToast(messageOf(error));
    } finally {
      state.detail.composerUploadingAttachments = false;
      setForceComposerRender();
      scheduleSessionDetailRender();
    }
  }
  function removeComposerAttachment(attachmentId) {
    var _a;
    const id = String(attachmentId || "");
    const items = state.detail.composerAttachments || [];
    const removed = items.find((item) => item.id === id);
    if (removed == null ? void 0 : removed.previewUrl) {
      try {
        URL.revokeObjectURL(removed.previewUrl);
      } catch (e) {
      }
    }
    deleteUploadedComposerAttachments((_a = state.detail.session) == null ? void 0 : _a.sessionId, removed ? [removed] : []);
    state.detail.composerAttachments = items.filter((item) => item.id !== id);
    state.detail.composerUploadingAttachments = state.detail.composerAttachments.some(
      (item) => item.status === "uploading"
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
    const fetchedFiles = (await Promise.all(imageSources.map((src, index) => readImageFileFromSource(src, index + 1)))).filter(Boolean);
    if (!fetchedFiles.length) {
      showToast(t("composer.attachments.pasteFailed"));
      return true;
    }
    await addComposerFiles(fetchedFiles, sessionId);
    return true;
  }
  function writeWorkspaceUiState() {
    var _a;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(
        WORKSPACE_UI_STORAGE_KEY,
        JSON.stringify({
          sidebarCollapsed: Boolean(state.workspace.sidebarCollapsed),
          collapsedProjectIds: Array.from(state.workspace.collapsedProjectIds || [])
        })
      );
    } catch (e) {
    }
  }
  function writeWorkspaceUnreadState() {
    var _a;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(
        WORKSPACE_UNREAD_STORAGE_KEY,
        JSON.stringify({
          readEventCounts: state.workspace.readEventCounts || {}
        })
      );
    } catch (e) {
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
        state.workspace.sidebarCollapsed ? t("workspace.openSidebar") : t("workspace.closeSidebar")
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
            aria-label="${escapeHtml4(state.workspace.sidebarCollapsed ? t("workspace.openSidebar") : t("workspace.closeSidebar"))}"
            aria-expanded="${state.workspace.sidebarCollapsed ? "false" : "true"}"
            aria-controls="workspace-sidebar"
          >
            \u2630
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
  async function loadInitialSessionEvents(sessionId) {
    const firstPage = await getSessionTimelineEvents(sessionId, {
      limit: INITIAL_DETAIL_EVENT_PAGE_LIMIT
    });
    return {
      // Do not block first paint on historical backfill. Older pages are lazy-loaded after
      // the detail shell is mounted, which is much safer over mobile tunnels.
      items: Array.isArray(firstPage.items) ? [...firstPage.items] : [],
      nextCursor: firstPage.nextCursor || 0,
      beforeCursor: firstPage.beforeCursor || 0,
      hasMoreBefore: Boolean(firstPage.hasMoreBefore),
      lastSeq: firstPage.lastSeq || firstPage.nextCursor || 0
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
      restoreTitle = false
    } = options;
    state.detail.optimisticSend = null;
    if (restoreSession && state.detail.session) {
      state.detail.session.status = optimistic.previousStatus || "waiting_input";
      state.detail.session.liveBusy = Boolean(optimistic.previousLiveBusy);
      state.detail.session.updatedAt = optimistic.previousUpdatedAt || state.detail.session.updatedAt;
    }
    if (restoreTitle && optimistic.titleWasUpdated && state.detail.session) {
      state.detail.session.title = optimistic.previousTitle || "";
      state.sessions.items = state.sessions.items.map(
        (item) => item.sessionId === optimistic.sessionId ? __spreadProps(__spreadValues({}, item), { title: optimistic.previousTitle || "" }) : item
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
    var _a, _b, _c;
    const optimistic = state.detail.optimisticSend;
    if (!(optimistic == null ? void 0 : optimistic.confirmed)) {
      return;
    }
    const hasRealUser = state.detail.timelineItems.some((item) => isMatchingOptimisticUserItem(item, optimistic));
    if (hasRealUser) {
      state.detail.optimisticSend = null;
      return;
    }
    if (!((_a = state.detail.session) == null ? void 0 : _a.liveBusy)) {
      state.detail.optimisticSend = null;
      return;
    }
    const turnId = optimistic.turnId;
    if (!turnId) {
      return;
    }
    const hasFollowupItem = state.detail.timelineItems.some(
      (item) => item.turnId === turnId && item.type !== "user"
    );
    const turn = ((_c = (_b = state.detail.timelineState) == null ? void 0 : _b.turnsById) == null ? void 0 : _c[turnId]) || null;
    if (hasFollowupItem || (turn == null ? void 0 : turn.status) === "running" || (turn == null ? void 0 : turn.status) === "completed" || (turn == null ? void 0 : turn.status) === "failed" || (turn == null ? void 0 : turn.status) === "aborted") {
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
    return Math.abs(itemMs - optimisticMs) <= 3e4;
  }
  function getDisplayTimelineItems() {
    var _a, _b, _c, _d, _e, _f;
    const optimistic = state.detail.optimisticSend;
    const items = state.detail.timelineItems.filter(
      (item) => !(item.synthetic && item.type === "reasoning" && item.status === "thinking")
    );
    const session = state.detail.session;
    if (!optimistic) {
      if (!isSessionLiveBusy(session)) {
        return items;
      }
      const activeTurn = getActiveTimelineTurn(session);
      const lastSeq = Number(((_a = items[items.length - 1]) == null ? void 0 : _a.seq) || 0);
      const lastTimestamp = (activeTurn == null ? void 0 : activeTurn.startedAt) || (session == null ? void 0 : session.updatedAt) || ((_b = items[items.length - 1]) == null ? void 0 : _b.timestamp) || (/* @__PURE__ */ new Date()).toISOString();
      const placeholderTurnId = (activeTurn == null ? void 0 : activeTurn.id) || ((_c = items[items.length - 1]) == null ? void 0 : _c.turnId) || `turn:thinking:${(session == null ? void 0 : session.sessionId) || "detail"}`;
      return [
        ...items,
        {
          id: `thinking:${placeholderTurnId}`,
          type: "reasoning",
          turnId: placeholderTurnId,
          seq: lastSeq + 1e-3,
          timestamp: lastTimestamp,
          status: "thinking",
          summary: t("timeline.thinking"),
          text: "",
          synthetic: true
        }
      ];
    }
    const displayItems = [...items];
    const optimisticTurnId = optimistic.turnId || optimistic.tempTurnId;
    const optimisticTimestamp = optimistic.createdAt || (/* @__PURE__ */ new Date()).toISOString();
    const hasRealUser = displayItems.some((item) => isMatchingOptimisticUserItem(item, optimistic));
    if (!hasRealUser) {
      const lastSeq = Number(((_d = displayItems[displayItems.length - 1]) == null ? void 0 : _d.seq) || 0);
      displayItems.push({
        id: optimistic.userItemId,
        type: "user",
        turnId: optimisticTurnId,
        seq: lastSeq + 1e-3,
        timestamp: optimisticTimestamp,
        role: "user",
        text: optimistic.text,
        optimistic: true
      });
    }
    const shouldShowThinking = Boolean(optimistic) || isSessionLiveBusy(session);
    if (shouldShowThinking) {
      const activeTurn = getActiveTimelineTurn(session);
      const lastSeq = Number(((_e = displayItems[displayItems.length - 1]) == null ? void 0 : _e.seq) || 0);
      const placeholderTurnId = (activeTurn == null ? void 0 : activeTurn.id) || optimisticTurnId || ((_f = displayItems[displayItems.length - 1]) == null ? void 0 : _f.turnId) || `turn:thinking:${(session == null ? void 0 : session.sessionId) || "detail"}`;
      displayItems.push({
        id: optimistic.thinkingItemId || `thinking:${placeholderTurnId}`,
        type: "reasoning",
        turnId: placeholderTurnId,
        seq: lastSeq + 1e-3,
        timestamp: (activeTurn == null ? void 0 : activeTurn.startedAt) || (session == null ? void 0 : session.updatedAt) || optimisticTimestamp,
        status: "thinking",
        summary: t("timeline.thinking"),
        text: "",
        synthetic: true,
        optimistic: Boolean(optimistic)
      });
    }
    return displayItems;
  }
  function getPendingApprovalFromTimelineState(timelineState) {
    var _a;
    if (!timelineState || !timelineState.approvalsByRequestId) {
      return null;
    }
    const sessionId = String(((_a = state.detail.session) == null ? void 0 : _a.sessionId) || state.workspace.activeSessionId || "").trim();
    const pendingApproval = Object.values(timelineState.approvalsByRequestId).filter(
      (item) => (item == null ? void 0 : item.status) === "pending" && !isApprovalDismissed(sessionId, item == null ? void 0 : item.requestId) && !isApprovalSuppressed(sessionId, item == null ? void 0 : item.requestId)
    ).sort((left, right) => Number((right == null ? void 0 : right.seq) || 0) - Number((left == null ? void 0 : left.seq) || 0))[0];
    if (!pendingApproval) {
      return null;
    }
    return {
      requestId: pendingApproval.requestId,
      callId: pendingApproval.callId || null,
      title: localizeApprovalTitle2(pendingApproval.title),
      reason: pendingApproval.reason || "",
      command: pendingApproval.command || "",
      cwd: pendingApproval.cwd || "",
      resumable: pendingApproval.resumable !== false
    };
  }
  function resolveDetailPendingApproval(session, timelineState) {
    const timelinePending = getPendingApprovalFromTimelineState(timelineState);
    const sessionPending = (session == null ? void 0 : session.pendingApproval) || null;
    const liveBusy = (session == null ? void 0 : session.liveBusy) === true;
    const sessionId = String((session == null ? void 0 : session.sessionId) || "").trim();
    const canResolve = liveBusy && (sessionPending == null ? void 0 : sessionPending.resumable) !== false;
    if (!timelinePending) {
      return sessionPending && !isApprovalDismissed(sessionId, sessionPending.requestId, sessionPending.callId) && !isApprovalSuppressed(sessionId, sessionPending.requestId, sessionPending.callId) ? sessionPending : null;
    }
    return __spreadProps(__spreadValues(__spreadValues({}, timelinePending), sessionPending && sessionPending.requestId === timelinePending.requestId ? sessionPending : {}), {
      resumable: canResolve
    });
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
    var _a;
    const key = getApprovalDismissalKey(sessionId, requestId);
    if (!key || key === ":") {
      return false;
    }
    return Boolean((_a = state.detail.dismissedApprovalKeys) == null ? void 0 : _a[key]);
  }
  function dismissApproval(sessionId, requestId) {
    const key = getApprovalDismissalKey(sessionId, requestId);
    if (!key || key === ":") {
      return;
    }
    state.detail.dismissedApprovalKeys = __spreadProps(__spreadValues({}, state.detail.dismissedApprovalKeys || {}), {
      [key]: true
    });
  }
  function isTerminalApprovalError(error) {
    const message = messageOf(error);
    return message === "Approval request not found." || message === "Approval request can no longer be resumed.";
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
    const sessionPending = (session == null ? void 0 : session.pendingApproval) || null;
    const timelinePending = (timelineState == null ? void 0 : timelineState.approvalsByRequestId) ? Object.values(timelineState.approvalsByRequestId).some(
      (item) => (item == null ? void 0 : item.status) === "pending" && !isApprovalDismissed(session == null ? void 0 : session.sessionId, item == null ? void 0 : item.requestId) && isApprovalSuppressed(session == null ? void 0 : session.sessionId, item == null ? void 0 : item.requestId)
    ) : false;
    const detailPending = state.detail.pendingApproval && isApprovalSuppressed(
      session == null ? void 0 : session.sessionId,
      state.detail.pendingApproval.requestId,
      state.detail.pendingApproval.callId
    );
    const sessionStillPending = sessionPending && !isApprovalDismissed(session == null ? void 0 : session.sessionId, sessionPending.requestId, sessionPending.callId) && isApprovalSuppressed(session == null ? void 0 : session.sessionId, sessionPending.requestId, sessionPending.callId);
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
      const eventSessionId = String((rawEvent == null ? void 0 : rawEvent.sessionId) || (rawEvent == null ? void 0 : rawEvent.session_id) || "").trim();
      return !eventSessionId || eventSessionId === activeSessionId;
    });
    if (filteredRawEvents.length === 0) {
      return;
    }
    const existingIds = new Set(state.detail.rawEvents.map((event) => event.id));
    const currentMaxSeq = state.detail.rawEvents.reduce(
      (maxSeq, event) => Math.max(maxSeq, Number((event == null ? void 0 : event.seq) || 0)),
      0
    );
    const appended = [];
    let canApplyIncrementally = true;
    filteredRawEvents.forEach((rawEvent) => {
      if (!(rawEvent == null ? void 0 : rawEvent.id) || existingIds.has(rawEvent.id)) {
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
    const wasBusy = Object.prototype.hasOwnProperty.call(options, "wasBusy") ? Boolean(options.wasBusy) : isSessionLiveBusy(state.detail.session);
    const previousAssistantText = getLatestAssistantText();
    if (appended.some(isTurnStartRawEvent)) {
      state.detail.completionSpeechBaselineText = previousAssistantText;
      armCompletionNoticeForActiveSession();
    }
    state.detail.rawEvents = [...state.detail.rawEvents, ...appended].sort(
      (a, b) => (a.seq || 0) - (b.seq || 0)
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
    var _a;
    const payloadType = String(((_a = event == null ? void 0 : event.payload) == null ? void 0 : _a.type) || "");
    return (event == null ? void 0 : event.type) === "turn.started" || payloadType === "task_started";
  }
  function isCompletionRawEvent(event) {
    var _a;
    const payloadType = String(((_a = event == null ? void 0 : event.payload) == null ? void 0 : _a.type) || "");
    return (event == null ? void 0 : event.type) === "turn.completed" || payloadType === "task_complete";
  }
  function getCompletionEventKey(event) {
    var _a, _b;
    const sessionId = String((event == null ? void 0 : event.sessionId) || (event == null ? void 0 : event.session_id) || getActiveDetailSessionId() || "").trim();
    const turnId = (event == null ? void 0 : event.turnId) || (event == null ? void 0 : event.turn_id) || ((_a = event == null ? void 0 : event.payload) == null ? void 0 : _a.turn_id) || ((_b = event == null ? void 0 : event.payload) == null ? void 0 : _b.turnId) || "";
    return `${sessionId}:${turnId || (event == null ? void 0 : event.id) || (event == null ? void 0 : event.seq) || Date.now()}`;
  }
  function getCompletionEventTurnId(event) {
    var _a, _b, _c, _d;
    const explicitTurnId = String(
      (event == null ? void 0 : event.turnId) || (event == null ? void 0 : event.turn_id) || ((_a = event == null ? void 0 : event.payload) == null ? void 0 : _a.turn_id) || ((_b = event == null ? void 0 : event.payload) == null ? void 0 : _b.turnId) || ""
    ).trim();
    if (explicitTurnId) {
      return explicitTurnId;
    }
    return String(((_c = getLatestTimelineTurn()) == null ? void 0 : _c.id) || ((_d = state.detail.timelineState) == null ? void 0 : _d.activeTurnId) || "").trim();
  }
  function markCompletionEventsSeen(events) {
    const nextSeen = __spreadValues({}, state.detail.seenCompletionEventKeys || {});
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
    var _a;
    if (!((_a = state.detail.session) == null ? void 0 : _a.sessionId)) {
      return;
    }
    state.detail.completionNoticeArmed = true;
  }
  function disarmCompletionNoticeForActiveSession() {
    state.detail.completionNoticeArmed = false;
  }
  function maybeShowCompletionNotice(events, options = {}) {
    var _a;
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
    if (!key || ((_a = state.detail.seenCompletionEventKeys) == null ? void 0 : _a[key])) {
      return;
    }
    state.detail.seenCompletionEventKeys = __spreadProps(__spreadValues({}, state.detail.seenCompletionEventKeys || {}), {
      [key]: true
    });
    disarmCompletionNoticeForActiveSession();
    showCompletionNotice({
      key,
      sessionId: state.detail.session.sessionId,
      turnId: getCompletionEventTurnId(event),
      title: state.detail.session.title || t("workspace.session.untitled"),
      completedAt: event.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
      previousAssistantText: state.detail.completionSpeechBaselineText || options.previousAssistantText || ""
    });
  }
  function maybeQueueAutoContinueFromCompletion(events) {
    var _a, _b;
    const sessionId = String(((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "").trim();
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
    if (hasQueuedAutoContinueMessage(sessionId) || hasOfficialQueuedMessages(state.detail.session)) {
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
      "auto-continue"
    );
    payload.clientMessageId = `auto-continue:${completionKey}`;
    if (((_b = state.detail.completionNotice) == null ? void 0 : _b.sessionId) === sessionId) {
      state.detail.completionNotice.actionStatus = t("completionActions.autoQueued");
    }
    scheduleSessionDetailRender();
    void queueMessage(sessionId, payload).then((result) => {
      var _a2, _b2;
      setCompletionAutoContinueLastEventKey(sessionId, completionKey);
      const nextRuns = getCompletionAutoContinueRuns(sessionId) + 1;
      const nextRemaining = Math.max(0, getCompletionAutoContinueRemaining(sessionId) - 1);
      setCompletionAutoContinueRuns(sessionId, nextRuns);
      setCompletionAutoContinueRemaining(sessionId, nextRemaining);
      if (((_a2 = state.detail.session) == null ? void 0 : _a2.sessionId) === sessionId) {
        applyOfficialQueueResult(result, state.detail.session);
      }
      if (((_b2 = state.detail.completionNotice) == null ? void 0 : _b2.sessionId) === sessionId) {
        state.detail.completionNotice.autoContinueRuns = nextRuns;
      }
      scheduleSessionDetailRender();
    }).catch((error) => {
      var _a2;
      if (((_a2 = state.detail.completionNotice) == null ? void 0 : _a2.sessionId) === sessionId) {
        state.detail.completionNotice.actionStatus = messageOf(error);
      }
      scheduleSessionDetailRender();
    });
  }
  function showCompletionNotice(notice) {
    var _a;
    cleanupCompletionNoticeTimer();
    const key = String((notice == null ? void 0 : notice.key) || Date.now());
    const noticeSessionId = (notice == null ? void 0 : notice.sessionId) || ((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "";
    const prefs = getCompletionActionPrefsForSession(noticeSessionId);
    state.detail.completionNotice = {
      key,
      sessionId: noticeSessionId,
      turnId: String((notice == null ? void 0 : notice.turnId) || ""),
      title: (notice == null ? void 0 : notice.title) || t("workspace.session.untitled"),
      completedAt: (notice == null ? void 0 : notice.completedAt) || (/* @__PURE__ */ new Date()).toISOString(),
      previousAssistantText: String((notice == null ? void 0 : notice.previousAssistantText) || ""),
      expiresAt: prefs.showMenu ? 0 : Date.now() + COMPLETION_NOTICE_MS,
      actionStatus: "",
      autoContinueRuns: getCompletionAutoContinueRuns(noticeSessionId),
      autoContinueMaxRuns: prefs.autoContinueMaxRuns
    };
    triggerCompletionExternalAlert(state.detail.completionNotice);
    runCompletionAutomaticActions(state.detail.completionNotice);
    if (!prefs.showMenu) {
      state.detail.completionNoticeTimerId = window.setTimeout(() => {
        var _a2;
        if (((_a2 = state.detail.completionNotice) == null ? void 0 : _a2.key) === key) {
          state.detail.completionNotice = null;
          state.detail.completionNoticeTimerId = 0;
          scheduleSessionDetailRender();
        }
      }, COMPLETION_NOTICE_MS);
    }
  }
  function getCompletionAutoContinueRuns(sessionId) {
    var _a, _b, _c;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return 0;
    }
    const runs = Number(((_c = (_b = (_a = state.workspace.completionActions) == null ? void 0 : _a.threadRuns) == null ? void 0 : _b[normalizedSessionId]) == null ? void 0 : _c.autoContinueRuns) || 0);
    return Number.isFinite(runs) && runs > 0 ? Math.floor(runs) : 0;
  }
  function getCompletionAutoContinueRemaining(sessionId) {
    var _a, _b, _c;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return 0;
    }
    const remaining = Number(((_c = (_b = (_a = state.workspace.completionActions) == null ? void 0 : _a.threadRuns) == null ? void 0 : _b[normalizedSessionId]) == null ? void 0 : _c.autoContinueRemaining) || 0);
    return Number.isFinite(remaining) && remaining > 0 ? Math.floor(remaining) : 0;
  }
  function getCompletionAutoContinueLastEventKey(sessionId) {
    var _a, _b, _c;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return "";
    }
    return String(((_c = (_b = (_a = state.workspace.completionActions) == null ? void 0 : _a.threadRuns) == null ? void 0 : _b[normalizedSessionId]) == null ? void 0 : _c.autoContinueLastEventKey) || "");
  }
  function updateCompletionThreadRunState(sessionId, patch = {}) {
    var _a, _b, _c, _d;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return;
    }
    state.workspace.completionActions = {
      prefs: normalizeCompletionActionPrefs(((_a = state.workspace.completionActions) == null ? void 0 : _a.prefs) || {}),
      threadRuns: __spreadProps(__spreadValues({}, ((_b = state.workspace.completionActions) == null ? void 0 : _b.threadRuns) || {}), {
        [normalizedSessionId]: __spreadValues(__spreadValues({}, ((_d = (_c = state.workspace.completionActions) == null ? void 0 : _c.threadRuns) == null ? void 0 : _d[normalizedSessionId]) || {}), patch)
      })
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
      autoContinueLastEventKey: String(key || "")
    });
  }
  function resetCompletionAutoContinueSequence(sessionId, maxRuns = 0) {
    var _a;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return;
    }
    const nextMaxRuns = Math.max(0, Math.floor(Number(maxRuns || 0)));
    removeAutoContinueQueuedMessages(normalizedSessionId);
    updateCompletionThreadRunState(normalizedSessionId, {
      autoContinueRuns: 0,
      autoContinueRemaining: nextMaxRuns,
      autoContinueLastEventKey: ""
    });
    if (((_a = state.detail.completionNotice) == null ? void 0 : _a.sessionId) === normalizedSessionId) {
      state.detail.completionNotice.autoContinueRuns = 0;
      state.detail.completionNotice.autoContinueMaxRuns = getCompletionActionPrefsForSession(normalizedSessionId).autoContinueMaxRuns;
    }
  }
  function clearCompletionAutoContinueSequence(sessionId) {
    resetCompletionAutoContinueSequence(sessionId, 0);
  }
  function getLatestAssistantText() {
    var _a, _b, _c, _d;
    const items = Array.isArray(state.detail.timelineItems) ? state.detail.timelineItems : [];
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if ((item == null ? void 0 : item.type) === "assistant_final") {
        const text = String(item.text || "").trim();
        if (text) {
          return text;
        }
      }
      if ((item == null ? void 0 : item.type) === "assistant") {
        const text = (Array.isArray(item.events) ? item.events : []).map((event) => event.content || "").join("").trim();
        if (text) {
          return text;
        }
      }
      if ((item == null ? void 0 : item.type) === "task") {
        const text = String(((_b = (_a = item.task) == null ? void 0 : _a.assistantMessage) == null ? void 0 : _b.mainText) || ((_c = item.assistantMessage) == null ? void 0 : _c.mainText) || "").trim();
        if (text) {
          return text;
        }
      }
    }
    return String(((_d = state.detail.session) == null ? void 0 : _d.lastAssistantContent) || "").trim();
  }
  function getAssistantTextForTurn(turnId) {
    var _a, _b, _c, _d;
    const normalizedTurnId = String(turnId || "").trim();
    if (!normalizedTurnId) {
      return "";
    }
    const timelineItems = Array.isArray(state.detail.timelineItems) ? state.detail.timelineItems : [];
    for (let index = timelineItems.length - 1; index >= 0; index -= 1) {
      const item = timelineItems[index];
      if ((item == null ? void 0 : item.turnId) !== normalizedTurnId) {
        continue;
      }
      if ((item == null ? void 0 : item.type) === "assistant_final") {
        const text = String(item.text || "").trim();
        if (text) {
          return text;
        }
      }
      if ((item == null ? void 0 : item.type) === "task") {
        const text = String(((_b = (_a = item.task) == null ? void 0 : _a.assistantMessage) == null ? void 0 : _b.mainText) || ((_c = item.assistantMessage) == null ? void 0 : _c.mainText) || "").trim();
        if (text) {
          return text;
        }
      }
    }
    const timelineState = state.detail.timelineState;
    const turn = ((_d = timelineState == null ? void 0 : timelineState.turnsById) == null ? void 0 : _d[normalizedTurnId]) || null;
    const messages = Object.values((timelineState == null ? void 0 : timelineState.messagesById) || {});
    const messageIds = Array.isArray(turn == null ? void 0 : turn.messageIds) ? turn.messageIds : [];
    const candidates = [
      turn == null ? void 0 : turn.finalMessageId,
      ...messageIds.slice().reverse()
    ].filter(Boolean);
    for (const itemId of candidates) {
      const message = messages.find((item) => (item == null ? void 0 : item.id) === itemId);
      if ((message == null ? void 0 : message.type) === "assistant_final") {
        const text = String(message.text || "").trim();
        if (text) {
          return text;
        }
      }
    }
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if ((message == null ? void 0 : message.turnId) === normalizedTurnId && (message == null ? void 0 : message.type) === "assistant_final") {
        const text = String(message.text || "").trim();
        if (text) {
          return text;
        }
      }
    }
    return "";
  }
  function normalizeCompletionSpeechText(sourceText) {
    return String(sourceText || "").replace(/!\[[^\]]*]\([^)]+\)/g, " ").replace(/\[([^\]]+)]\([^)]+\)/g, "$1").replace(/```[\s\S]*?```/g, " ").replace(/`([^`]+)`/g, "$1").replace(/(^|\s)([-*]|\d+\.)\s+/g, "$1").replace(/\s+/g, " ").trim();
  }
  function normalizeCompletionSpeechLine(sourceLine) {
    return String(sourceLine || "").replace(/!\[[^\]]*]\([^)]+\)/g, " ").replace(/\[([^\]]+)]\([^)]+\)/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/^\s{0,3}#{1,6}\s+/g, "").replace(/^\s*[-*+]\s+/g, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1").replace(/\s+/g, " ").trim();
  }
  function buildCompletionSpeechOutline(sourceText, maxChars = COMPLETION_ACTION_READ_SUMMARY_MAX_CHARS) {
    const rawLines = String(sourceText || "").replace(/```[\s\S]*?```/g, " ").split(/\r?\n/).map((line) => normalizeCompletionSpeechLine(line)).filter(Boolean).filter((line) => !/^[-=]{3,}$/.test(line));
    if (!rawLines.length) {
      return "";
    }
    const firstLine = rawLines[0];
    const numberedLines = rawLines.filter(
      (line, index) => index > 0 && /^[1-5]\s*[.)]\s*\S+/.test(line)
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
        /^(?:i(?:'ve| have)|this round|this time|we(?:'ve| have))/i
      ],
      contains: [
        /(?:\u5df2\u5b8c\u6210|\u5df2\u4fee\u590d|\u5df2\u66f4\u65b0|\u5df2\u5904\u7406|\u5df2\u89e3\u51b3|\u5df2\u6062\u590d|\u5df2\u652f\u6301|\u4e00\u53e5\u8bdd\u603b\u7ed3|\u6839\u56e0|\u539f\u56e0|\u95ee\u9898\u70b9|\u5173\u952e|\u6838\u5fc3|\u7ed3\u8bba)/,
        /(?:completed|fixed|updated|implemented|resolved|root cause|summary|conclusion)/i
      ]
    };
    const resultPatterns = {
      starts: [
        /^(?:\u73b0\u5728|\u76ee\u524d|\u5f53\u524d|\u5df2\u7ecf|\u4e0d\u4f1a\u518d|\u4f1a\u81ea\u52a8|\u53ef\u4ee5|\u53ef\u76f4\u63a5|\u5df2\u6062\u590d|\u5df2\u5f00\u542f|\u5df2\u652f\u6301|\u5df2\u6062\u590d\u6b63\u5e38|\u9875\u9762\u5df2|\u624b\u673a\u7aef|\u8fd9\u6837|\u56e0\u6b64|\u73b0\u5728\u53ef\u4ee5|\u76ee\u524d\u53ef\u4ee5)/,
        /^(?:now|currently|it now|this now|can now|will now|restored|available|works|working|you can now)/i
      ],
      contains: [
        /(?:\u73b0\u5728\u53ef\u4ee5|\u5df2\u6062\u590d|\u4e0d\u4f1a\u518d|\u5df2\u652f\u6301|\u53ef\u4ee5\u76f4\u63a5|\u624b\u673a\u7aef|\u9875\u9762\u5df2)/,
        /(?:can now|is now|restored|available|works|working)/i
      ]
    };
    const verificationPatterns = {
      starts: [
        /^(?:\u5df2\u91cd\u65b0\u6253\u5305|\u5df2\u91cd\u542f|\u5df2\u542f\u52a8|\u5df2\u9a8c\u8bc1|\u6d4b\u8bd5\u901a\u8fc7|health \u6b63\u5e38|\/health|\u53ef\u5237\u65b0\u6d4b\u8bd5|\u53ef\u76f4\u63a5\u6d4b\u8bd5|\u53ef\u76f4\u63a5\u5237\u65b0)/i,
        /^(?:rebuilt|restarted|verified|tested|health|\/health|ready to test|can refresh)/i
      ],
      contains: [
        /(?:\u5df2\u91cd\u65b0\u6253\u5305|\u5df2\u91cd\u542f|health \u6b63\u5e38|\/health|\u6d4b\u8bd5\u901a\u8fc7|\u53ef\u76f4\u63a5\u5237\u65b0)/i,
        /(?:rebuilt|restarted|verified|tested|health|can refresh)/i
      ]
    };
    const nextStepPatterns = {
      starts: [
        /^(?:\u4e0b\u4e00\u6b65|\u540e\u9762|\u63a5\u4e0b\u6765|\u7ee7\u7eed|\u8fd8\u53ef\u4ee5|\u53ef\u4ee5\u7ee7\u7eed|\u540e\u7eed\u53ef\u4ee5|\u4e4b\u540e\u53ef\u4ee5|\u540e\u9762\u53ef\u4ee5|\u518d\u4e0b\u6765|\u4e0b\u4e00\u6b65\u53ef\u4ee5|\u6211\u4eec\u540e\u9762\u53ef\u4ee5|\u73b0\u5728\u53ef\u4ee5\u7ee7\u7eed)/,
        /^(?:next step|next we can|next,|you can next|we can next|after this|from here|continue with|can continue)/i
      ],
      contains: [
        /(?:\u4e0b\u4e00\u6b65|\u540e\u7eed\u53ef\u4ee5|\u6211\u4eec\u540e\u9762\u53ef\u4ee5|\u73b0\u5728\u53ef\u4ee5\u7ee7\u7eed|\u63a5\u4e0b\u6765)/,
        /(?:next step|after this|from here|continue with|can continue)/i
      ]
    };
    const rawLines = String(sourceText || "").replace(/```[\s\S]*?```/g, " ").split(/\r?\n/).map((line) => normalizeCompletionSpeechLine(line)).filter(Boolean).filter((line) => {
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
        const startsMatched = ((patternSet == null ? void 0 : patternSet.starts) || []).some((pattern) => pattern.test(candidate));
        const containsMatched = startsMatched || ((patternSet == null ? void 0 : patternSet.contains) || []).some((pattern) => pattern.test(candidate));
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
    return text.length <= COMPLETION_ACTION_READ_MAX_CHARS ? text : text.slice(0, COMPLETION_ACTION_READ_MAX_CHARS);
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
    var _a, _b;
    const plan = ((_a = state.detail.timelineState) == null ? void 0 : _a.latestPlan) || ((_b = state.detail.session) == null ? void 0 : _b.latestPlan) || null;
    const tasks = Array.isArray(plan == null ? void 0 : plan.tasks) ? plan.tasks : [];
    if (tasks.length === 0) {
      return false;
    }
    return tasks.every((item) => normalizePlanStatus(item.status) === "completed");
  }
  function getAutoContinueBlockReason() {
    var _a;
    const status = String(((_a = state.detail.session) == null ? void 0 : _a.status) || "").toLowerCase();
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
    var _a;
    if (state.detail.completionActionSending) {
      return t("completionActions.sending");
    }
    if (isSessionLiveBusy(state.detail.session)) {
      return t("completionActions.waitForIdle");
    }
    if (hasOfficialQueuedMessages(state.detail.session) || getMobileQueuedMessages((_a = state.detail.session) == null ? void 0 : _a.sessionId).length > 0) {
      return t("completionActions.waitForQueue");
    }
    return "";
  }
  async function sendCompletionActionMessage(content, source = "manual") {
    var _a;
    const sessionId = (_a = state.detail.session) == null ? void 0 : _a.sessionId;
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
    const previousSessionState = state.detail.session ? {
      status: state.detail.session.status,
      liveBusy: state.detail.session.liveBusy,
      updatedAt: state.detail.session.updatedAt
    } : null;
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
        state.detail.session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
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
  async function queueOfficialComposerMessage(sessionId, content, payload) {
    var _a, _b, _c, _d;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return false;
    }
    state.detail.composerSending = true;
    state.detail.composerSendError = "";
    scheduleSessionDetailRender();
    try {
      const result = await queueMessage(normalizedSessionId, payload);
      if (((_a = state.detail.session) == null ? void 0 : _a.sessionId) === normalizedSessionId) {
        applyOfficialQueueResult(result, state.detail.session);
        state.detail.draft = "";
        clearComposerDraft(normalizedSessionId);
      }
      clearComposerAttachments();
      showToast(t("composer.queued", { count: (_c = (_b = result == null ? void 0 : result.officialQueueCount) != null ? _b : result == null ? void 0 : result.count) != null ? _c : 1 }));
      return true;
    } catch (error) {
      const errorMessage = messageOf(error);
      state.detail.composerSendError = errorMessage;
      writeComposerDraft(normalizedSessionId, content);
      if (((_d = state.detail.session) == null ? void 0 : _d.sessionId) === normalizedSessionId) {
        state.detail.draft = content;
      }
      showToast(errorMessage);
      return false;
    } finally {
      state.detail.composerSending = false;
      scheduleSessionDetailRender();
      void refreshOfficialQueueForSession(normalizedSessionId).catch(() => null);
    }
  }
  async function steerComposerMessage(sessionId, content, payload) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId || state.detail.composerSending) {
      return false;
    }
    state.detail.composerSending = true;
    state.detail.composerSendError = "";
    scheduleSessionDetailRender();
    try {
      const result = await steerMessage(normalizedSessionId, payload);
      state.detail.draft = "";
      clearComposerDraft(normalizedSessionId);
      clearComposerAttachments();
      showToast(t("composer.steered"));
      await catchUpSessionEvents(normalizedSessionId, state.detail.cursor || 0).catch(() => null);
      return Boolean(result);
    } catch (error) {
      const errorMessage = messageOf(error);
      state.detail.composerSendError = errorMessage;
      state.detail.draft = content;
      writeComposerDraft(normalizedSessionId, content);
      showToast(errorMessage);
      return false;
    } finally {
      state.detail.composerSending = false;
      scheduleSessionDetailRender();
    }
  }
  async function maybeFlushMobileSendQueue(reason = "idle") {
    var _a, _b, _c, _d;
    if (!LEGACY_LOCAL_QUEUE_FLUSH_ENABLED) {
      return false;
    }
    const session = state.detail.session;
    const sessionId = (session == null ? void 0 : session.sessionId) || "";
    syncMobileSendQueueStateFromStorage();
    if (!sessionId || state.detail.mobileQueueSending || state.detail.composerSending || state.detail.completionActionSending || state.detail.pendingApproval || hasOfficialQueuedMessages(session) || isSessionLiveBusy(session)) {
      return false;
    }
    const status = String((session == null ? void 0 : session.status) || "").toLowerCase();
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
      if (((_a = state.detail.session) == null ? void 0 : _a.sessionId) === sessionId) {
        state.detail.session.status = "running";
        state.detail.session.liveBusy = true;
        state.detail.session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      }
      armCompletionNoticeForActiveSession();
      if (!isAutoContinueQueuedItem(queuedItem)) {
        resetCompletionAutoContinueSequence(
          sessionId,
          queuedItem.startsAutoContinueSequence ? queuedItem.autoContinueMaxRuns : 0
        );
      }
      await sendMessage(sessionId, queuedItem.payload || { content: queuedItem.content });
      if (isAutoContinueQueuedItem(queuedItem)) {
        const nextRuns = getCompletionAutoContinueRuns(sessionId) + 1;
        const nextRemaining = Math.max(0, getCompletionAutoContinueRemaining(sessionId) - 1);
        setCompletionAutoContinueRuns(sessionId, nextRuns);
        setCompletionAutoContinueRemaining(sessionId, nextRemaining);
        if (((_b = state.detail.completionNotice) == null ? void 0 : _b.sessionId) === sessionId) {
          state.detail.completionNotice.autoContinueRuns = nextRuns;
          state.detail.completionNotice.autoContinueMaxRuns = getCompletionActionPrefsForSession(sessionId).autoContinueMaxRuns;
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
        if (((_c = state.detail.completionNotice) == null ? void 0 : _c.sessionId) === sessionId) {
          state.detail.completionNotice.actionStatus = errorMessage;
        }
      } else {
        writeComposerDraft(sessionId, queuedItem.content);
        clearCompletionAutoContinueSequence(sessionId);
        if (((_d = state.detail.session) == null ? void 0 : _d.sessionId) === sessionId) {
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
    var _a, _b;
    const prefs = getCompletionActionPrefsForSession((notice == null ? void 0 : notice.sessionId) || ((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "");
    if (!notice || notice.sessionId !== ((_b = state.detail.session) == null ? void 0 : _b.sessionId)) {
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
      } catch (e) {
      }
    }
    const shouldShowBrowserNotification = prefs.browser && getNotificationPermission() === "granted" && (document.visibilityState !== "visible" || !document.hasFocus());
    if (!shouldShowBrowserNotification) {
      return;
    }
    try {
      const notification = new window.Notification(title, {
        body,
        tag: `syncodex-completion:${notice.sessionId || ""}`,
        renotify: false,
        silent: false
      });
      notification.onclick = () => {
        window.focus();
        if (notice.sessionId) {
          window.location.hash = buildSessionDetailHash(
            notice.sessionId,
            state.detail.filter,
            state.detail.severity,
            state.detail.search,
            state.detail.autoScroll
          );
        }
        notification.close();
      };
    } catch (e) {
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
    } catch (e) {
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
      const exact = voices.find((voice) => String((voice == null ? void 0 : voice.lang) || "").toLowerCase() === locale);
      if (exact) {
        return exact;
      }
    }
    if (localePrefix) {
      const prefix = voices.find((voice) => String((voice == null ? void 0 : voice.lang) || "").toLowerCase().startsWith(`${localePrefix}-`));
      if (prefix) {
        return prefix;
      }
    }
    if (needsCjk) {
      const zhVoice = voices.find((voice) => String((voice == null ? void 0 : voice.lang) || "").toLowerCase().startsWith("zh"));
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
    const name = String((error == null ? void 0 : error.name) || "").toLowerCase();
    const message = String(messageOf(error) || "").toLowerCase();
    return name === "notallowederror" || message.includes("notallowed") || message.includes("user gesture") || message.includes("play()");
  }
  async function playCompletionAudioText(text, { automatic = false } = {}) {
    var _a, _b;
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
    const audioUrl = String((audioPayload == null ? void 0 : audioPayload.audioUrl) || "").trim();
    if (!audioUrl) {
      return false;
    }
    try {
      state.detail.speechRunId = Number(state.detail.speechRunId || 0) + 1;
      const runId = state.detail.speechRunId;
      try {
        (_b = (_a = window.speechSynthesis) == null ? void 0 : _a.cancel) == null ? void 0 : _b.call(_a);
      } catch (e) {
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
    } catch (e) {
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
      const charIndex = Number(event == null ? void 0 : event.charIndex);
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
    if (!sourceText && (!resumed || existingChunks.length <= 0) || !isCompletionSpeechSupported()) {
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
          playResult.then(() => {
            state.detail.speechActive = true;
            state.detail.speechPaused = false;
            scheduleSessionDetailRender();
          }).catch((error) => {
            state.detail.speechActive = true;
            state.detail.speechPaused = true;
            showToast(
              isAudioAutoplayBlocked(error) ? t("completionActions.audioTapToPlay") : messageOf(error)
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
    return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }
  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
  async function speakCompletionResult({ automatic = false, notice = state.detail.completionNotice } = {}) {
    var _a, _b, _c;
    let targetTurnId = String((notice == null ? void 0 : notice.turnId) || "").trim();
    const previousAssistantText = String((notice == null ? void 0 : notice.previousAssistantText) || "").trim();
    let text = "";
    if (automatic && (notice == null ? void 0 : notice.sessionId)) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await delay(attempt === 0 ? 250 : 450);
        await catchUpSessionEvents(notice.sessionId, state.detail.cursor || 0).catch(() => null);
        if (attempt >= 2) {
          const refreshedSession = await getSession(notice.sessionId).catch(() => null);
          if (refreshedSession && ((_a = state.detail.session) == null ? void 0 : _a.sessionId) === notice.sessionId) {
            state.detail.session = refreshedSession;
            updateSessionListItem(refreshedSession);
          }
        }
        if (!targetTurnId) {
          targetTurnId = String(((_b = getLatestTimelineTurn()) == null ? void 0 : _b.id) || "").trim();
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
        targetTurnId = String(((_c = getLatestTimelineTurn()) == null ? void 0 : _c.id) || "").trim();
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
    var _a;
    const notice = state.detail.completionNotice;
    if (!notice || notice.sessionId !== ((_a = state.detail.session) == null ? void 0 : _a.sessionId)) {
      return "";
    }
    if (Number(notice.expiresAt || 0) > 0 && Number(notice.expiresAt || 0) <= Date.now()) {
      state.detail.completionNotice = null;
      cleanupCompletionNoticeTimer();
      return "";
    }
    const prefs = getCompletionActionPrefsForSession(notice.sessionId);
    const runs = getCompletionAutoContinueRuns(notice.sessionId);
    const autoLine = prefs.autoContinue ? t("completionActions.autoContinueProgress", { count: runs, max: prefs.autoContinueMaxRuns }) : "";
    const statusLine = notice.actionStatus || autoLine;
    if (!statusLine) {
      return "";
    }
    return `
    <div class="completion-notice" role="status" aria-live="polite">
      <div class="completion-notice-mark" aria-hidden="true">\u2713</div>
      <div class="completion-notice-copy">
        <div class="completion-notice-title">${escapeHtml4(t("completionNotice.title"))}</div>
        <div class="completion-notice-detail">${escapeHtml4(
      t("completionNotice.detail", { title: shortenText(notice.title, 80) })
    )}</div>
        ${statusLine ? `<div class="completion-actions-status">${escapeHtml4(statusLine)}</div>` : ""}
      </div>
      <button type="button" class="completion-notice-close" data-dismiss-completion-notice aria-label="${escapeHtml4(t("generic.close"))}">\xD7</button>
    </div>
  `;
  }
  function renderCompletionOptionsPanel() {
    var _a;
    if (!state.detail.completionActionSettingsOpen) {
      return "";
    }
    const sessionId = ((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "";
    const prefs = getCompletionActionPrefsForSession(sessionId);
    const runs = getCompletionAutoContinueRuns(sessionId);
    const autoLine = prefs.autoContinue ? t("completionActions.autoContinueProgress", { count: runs, max: prefs.autoContinueMaxRuns }) : "";
    const audioUrl = String(state.detail.completionAudioUrl || "");
    const audioStatus = state.detail.completionAudioGenerating ? t("completionActions.audioGenerating") : state.detail.completionAudioError || state.detail.completionAudioStatus || "";
    return `
    <section class="completion-options-panel" aria-label="${escapeHtml4(t("completionActions.options"))}">
      <div class="completion-options-head">
        <div>
          <div class="completion-options-title">${escapeHtml4(t("completionActions.options"))}</div>
          ${autoLine ? `<div class="completion-actions-status">${escapeHtml4(autoLine)}</div>` : ""}
        </div>
        <button type="button" class="completion-options-close" data-completion-options-toggle aria-label="${escapeHtml4(t("generic.close"))}">\xD7</button>
      </div>
      <div class="completion-actions-settings completion-options-settings">
        <label class="completion-actions-toggle">
          <input
            type="checkbox"
            id="completion-action-auto-read"
            ${prefs.autoRead ? "checked" : ""}
          />
          <span>${escapeHtml4(t("completionActions.settingAutoRead"))}</span>
        </label>
        <label class="completion-actions-toggle">
          <input type="checkbox" id="completion-action-auto-continue" ${prefs.autoContinue ? "checked" : ""} />
          <span>${escapeHtml4(t("completionActions.settingAutoContinue"))}</span>
        </label>
        <label class="completion-actions-number">
          <span>${escapeHtml4(t("completionActions.settingMaxRuns"))}</span>
          <input
            id="completion-action-max-runs"
            type="number"
            min="1"
            max="20"
            step="1"
            value="${escapeHtml4(prefs.autoContinueMaxRuns)}"
          />
        </label>
        ${prefs.autoContinue ? `<button type="button" class="completion-action-button completion-action-button-danger" data-completion-action="stop-auto">${escapeHtml4(t("completionActions.stopAutoContinue"))}</button>` : ""}
        <div class="completion-actions-help">${escapeHtml4(t("completionActions.autoContinueHelp"))}</div>
      </div>
      <div class="completion-audio-panel">
        <div class="completion-audio-head">
          <div>
            <div class="completion-audio-title">${escapeHtml4(t("completionActions.audioTitle"))}</div>
            <div class="completion-audio-subtitle">${escapeHtml4(t("completionActions.audioHelp"))}</div>
          </div>
          <button
            type="button"
            class="completion-action-button"
            data-completion-action="generate-audio"
            ${state.detail.completionAudioGenerating ? "disabled" : ""}
          >${escapeHtml4(state.detail.completionAudioGenerating ? t("completionActions.audioGeneratingShort") : t("completionActions.generateAudio"))}</button>
        </div>
        ${audioUrl ? `
              <div class="completion-audio-player-row">
                <audio id="completion-audio-player" class="completion-audio-player" controls preload="metadata" src="${escapeHtml4(audioUrl)}"></audio>
                <button type="button" class="completion-action-button completion-action-button-danger" data-completion-action="clear-audio">${escapeHtml4(t("completionActions.clearAudio"))}</button>
              </div>
            ` : ""}
        ${audioStatus ? `<div class="completion-actions-status">${escapeHtml4(audioStatus)}</div>` : ""}
      </div>
    </section>
  `;
  }
  function renderCompletionSpeechControl() {
    if (!isCompletionSpeechSupported() && state.detail.speechTransport !== "audio" || !state.detail.speechActive && !state.detail.speechPaused) {
      return "";
    }
    const paused = Boolean(state.detail.speechPaused);
    const toggleLabel = paused ? t("completionActions.resumeRead") : t("completionActions.pauseRead");
    const position = state.detail.speechFloatPosition || null;
    const positionStyle = position && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y)) ? ` style="left: ${Math.max(0, Math.round(Number(position.x)))}px; top: ${Math.max(0, Math.round(Number(position.y)))}px; right: auto; bottom: auto;"` : "";
    const toggleIcon = paused ? `
      <path fill="currentColor" d="M8.4 6.8v10.4l8.3-5.2-8.3-5.2Z" />
    ` : `
      <rect x="8" y="7" width="2.7" height="10" rx="0.9" fill="currentColor" />
      <rect x="13.3" y="7" width="2.7" height="10" rx="0.9" fill="currentColor" />
    `;
    return `
    <div class="completion-speech-float ${paused ? "completion-speech-float-paused" : ""}" role="group" aria-label="${escapeHtml4(t("completionActions.readingControl"))}"${positionStyle}>
      <button
        type="button"
        class="completion-speech-drag"
        data-completion-speech-drag
        aria-label="${escapeHtml4(t("completionActions.moveReadControl"))}"
        title="${escapeHtml4(t("completionActions.moveReadControl"))}"
      >
        <span></span><span></span><span></span><span></span>
      </button>
      <button
        type="button"
        class="completion-speech-button completion-speech-button-toggle"
        data-completion-speech-toggle
        aria-label="${escapeHtml4(toggleLabel)}"
        title="${escapeHtml4(toggleLabel)}"
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
        aria-label="${escapeHtml4(t("completionActions.stopRead"))}"
        title="${escapeHtml4(t("completionActions.stopRead"))}"
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
    const mobileItems = getMobileQueuedMessages(session == null ? void 0 : session.sessionId);
    const localCount = mobileItems.length;
    const autoCount = mobileItems.filter(isAutoContinueQueuedItem).length;
    const manualLocalCount = localCount - autoCount;
    const summary = t("queue.summary", { official: officialCount, local: localCount, total: items.length });
    const rowsHtml = items.map((item, index) => {
      const origin = item.origin === "official_codex" ? "official" : item.origin === "syncodex_auto_continue" ? "auto-continue" : "syncodex";
      const elapsed = item.createdAt ? formatElapsedSinceIso(item.createdAt) : "";
      const actionsMenu = item.origin === "official_codex" ? `
            <div class="session-queue-actions" role="menu" aria-label="${escapeHtml4(t("queue.actions"))}">
              <button type="button" class="session-queue-action" data-official-queue-action="edit" data-official-queue-id="${escapeHtml4(item.id)}" role="menuitem">${escapeHtml4(t("queue.edit"))}</button>
              <button type="button" class="session-queue-action" data-official-queue-action="remove" data-official-queue-id="${escapeHtml4(item.id)}" role="menuitem">${escapeHtml4(t("queue.removeLocalShort"))}</button>
              <button type="button" class="session-queue-action" data-official-queue-action="front" data-official-queue-id="${escapeHtml4(item.id)}" role="menuitem">${escapeHtml4(t("queue.moveLocalToFront"))}</button>
            </div>
          ` : item.origin !== "official_codex" ? `
            <div class="session-queue-actions" role="menu" aria-label="${escapeHtml4(t("queue.actions"))}">
              <button type="button" class="session-queue-action" data-mobile-queue-action="edit" data-mobile-queue-id="${escapeHtml4(item.id)}" role="menuitem">${escapeHtml4(t("queue.editLocal"))}</button>
              <button type="button" class="session-queue-action" data-mobile-queue-action="remove" data-mobile-queue-id="${escapeHtml4(item.id)}" role="menuitem">${escapeHtml4(t("queue.removeLocalShort"))}</button>
              <button type="button" class="session-queue-action" data-mobile-queue-action="front" data-mobile-queue-id="${escapeHtml4(item.id)}" role="menuitem">${escapeHtml4(t("queue.moveLocalToFront"))}</button>
            </div>
          ` : "";
      return `
        <li class="session-queue-item session-queue-item-${origin}" ${item.origin === "official_codex" ? `data-official-queue-item="${escapeHtml4(item.id)}" role="button" tabindex="0" aria-haspopup="menu" aria-label="${escapeHtml4(t("queue.openActions"))}"` : `data-mobile-queue-item="${escapeHtml4(item.id)}" role="button" tabindex="0" aria-haspopup="menu" aria-label="${escapeHtml4(t("queue.openActions"))}"`}>
          <div class="session-queue-item-head">
            <span class="session-queue-index">${index + 1}</span>
            <span class="session-queue-source">${escapeHtml4(item.label)}</span>
            ${elapsed && elapsed !== "--" ? `<span class="session-queue-time">${escapeHtml4(t("queue.createdAgo", { value: elapsed }))}</span>` : ""}
          </div>
          <div class="session-queue-text">${escapeHtml4(shortenText(item.text, 180))}</div>
          ${actionsMenu}
        </li>
      `;
    }).join("");
    return `
    <section class="session-queue-panel" aria-label="${escapeHtml4(t("queue.title"))}">
      <div class="session-queue-panel-head">
        <div>
          <div class="session-queue-title">${escapeHtml4(t("queue.title"))}</div>
          <div class="session-queue-summary">${escapeHtml4(summary)}</div>
        </div>
        <div class="session-queue-legend" aria-hidden="true">
          ${officialCount > 0 ? `<span class="session-queue-legend-item session-queue-legend-official">${escapeHtml4(t("queue.originOfficial"))}</span>` : ""}
          ${manualLocalCount > 0 ? `<span class="session-queue-legend-item session-queue-legend-syncodex">${escapeHtml4(t("queue.originSyncodex"))}</span>` : ""}
          ${autoCount > 0 ? `<span class="session-queue-legend-item session-queue-legend-auto-continue">${escapeHtml4(t("queue.originAutoContinue"))}</span>` : ""}
        </div>
      </div>
      <ol class="session-queue-list">
        ${rowsHtml}
      </ol>
    </section>
  `;
  }
  function updateCompletionActionPrefs(partial = {}) {
    var _a, _b, _c, _d;
    const sessionId = String(((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "").trim();
    if (!sessionId) {
      return;
    }
    const previousPrefs = getCompletionActionPrefsForSession(sessionId);
    const threadEntry = getCompletionThreadRunEntry(sessionId);
    const nextThreadPrefs = normalizeCompletionActionThreadPrefs(
      __spreadValues(__spreadValues({}, (threadEntry == null ? void 0 : threadEntry.prefs) || {}), partial),
      previousPrefs
    );
    state.workspace.completionActions = {
      prefs: normalizeCompletionActionPrefs(((_b = state.workspace.completionActions) == null ? void 0 : _b.prefs) || {}),
      threadRuns: __spreadProps(__spreadValues({}, ((_c = state.workspace.completionActions) == null ? void 0 : _c.threadRuns) || {}), {
        [sessionId]: __spreadProps(__spreadValues({}, threadEntry), {
          prefs: nextThreadPrefs
        })
      })
    };
    writeCompletionActionState();
    if (((_d = state.detail.completionNotice) == null ? void 0 : _d.sessionId) === sessionId) {
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
    var _a, _b;
    const targetTurnId = String(((_a = state.detail.completionNotice) == null ? void 0 : _a.turnId) || ((_b = getLatestTimelineTurn()) == null ? void 0 : _b.id) || "").trim();
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
      const audioUrl = String((result == null ? void 0 : result.audioUrl) || (result == null ? void 0 : result.url) || "");
      if (!audioUrl) {
        throw new Error(t("completionActions.audioFailed"));
      }
      state.detail.completionAudioUrl = audioUrl;
      state.detail.completionAudioStatus = (result == null ? void 0 : result.cached) ? t("completionActions.audioReadyCached") : t("completionActions.audioReady");
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
    var _a, _b;
    updateCompletionActionPrefs({ autoContinue: false });
    if (((_a = state.detail.completionNotice) == null ? void 0 : _a.sessionId) === ((_b = state.detail.session) == null ? void 0 : _b.sessionId)) {
      state.detail.completionNotice.actionStatus = t("completionActions.autoStoppedByUser");
    }
    scheduleSessionDetailRender();
  }
  function clampCompletionSpeechFloatPosition(x, y, rect = null) {
    const margin = 10;
    const width = Number((rect == null ? void 0 : rect.width) || 86);
    const height = Number((rect == null ? void 0 : rect.height) || 48);
    const viewportWidth = Math.max(width + margin * 2, window.innerWidth || 360);
    const viewportHeight = Math.max(height + margin * 2, window.innerHeight || 640);
    return {
      x: Math.min(Math.max(margin, Number(x || 0)), viewportWidth - width - margin),
      y: Math.min(Math.max(margin, Number(y || 0)), viewportHeight - height - margin)
    };
  }
  function bindCompletionSpeechFloatControls() {
    const floatEl = document.querySelector(".completion-speech-float");
    const dragHandle = document.querySelector("[data-completion-speech-drag]");
    if (!(floatEl instanceof HTMLElement) || !(dragHandle instanceof HTMLElement)) {
      return;
    }
    dragHandle.onpointerdown = (event) => {
      var _a;
      event.preventDefault();
      event.stopPropagation();
      const rect = floatEl.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      floatEl.classList.add("completion-speech-float-dragging");
      (_a = dragHandle.setPointerCapture) == null ? void 0 : _a.call(dragHandle, event.pointerId);
      const move = (moveEvent) => {
        moveEvent.preventDefault();
        const next = clampCompletionSpeechFloatPosition(
          moveEvent.clientX - offsetX,
          moveEvent.clientY - offsetY,
          rect
        );
        floatEl.style.left = `${next.x}px`;
        floatEl.style.top = `${next.y}px`;
        floatEl.style.right = "auto";
        floatEl.style.bottom = "auto";
      };
      const finish = (upEvent) => {
        var _a2;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        floatEl.classList.remove("completion-speech-float-dragging");
        (_a2 = dragHandle.releasePointerCapture) == null ? void 0 : _a2.call(dragHandle, event.pointerId);
        const nextRect = floatEl.getBoundingClientRect();
        const next = clampCompletionSpeechFloatPosition(nextRect.left, nextRect.top, nextRect);
        writeCompletionSpeechFloatPosition(next);
        if ((upEvent == null ? void 0 : upEvent.type) !== "pointercancel") {
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
        var _a, _b;
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
          if ((_a = state.detail.session) == null ? void 0 : _a.sessionId) {
            const prefs = getCompletionActionPrefsForSession(state.detail.session.sessionId);
            resetCompletionAutoContinueSequence(
              state.detail.session.sessionId,
              prefs.autoContinue ? prefs.autoContinueMaxRuns : 0
            );
          }
          const sent = await sendCompletionActionMessage(COMPLETION_MANUAL_CONTINUE_PROMPT, "manual");
          if (!sent && ((_b = state.detail.session) == null ? void 0 : _b.sessionId)) {
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
    var _a;
    return String(state.workspace.activeSessionId || ((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "").trim();
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
        limit: 200
      });
      if (!isActiveDetailSession(normalizedSessionId)) {
        return;
      }
      const items = Array.isArray(payload == null ? void 0 : payload.items) ? payload.items.filter((item) => {
        const eventSessionId = String((item == null ? void 0 : item.sessionId) || (item == null ? void 0 : item.session_id) || "").trim();
        return !eventSessionId || eventSessionId === normalizedSessionId;
      }) : [];
      if (items.length === 0) {
        return;
      }
      const wasBusy = Object.prototype.hasOwnProperty.call(options, "wasBusy") ? Boolean(options.wasBusy) : isSessionLiveBusy(state.detail.session);
      trackUnseenEvents(items);
      mergeDetailTimelineRawEvents(items, { wasBusy });
      nextAfter = Number((payload == null ? void 0 : payload.nextCursor) || nextAfter);
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
    if (currentNode.classList.contains("timeline-row-final") || currentNode.classList.contains("timeline-row-commentary") || currentNode.classList.contains("timeline-row-user")) {
      currentNode.replaceWith(nextNode.cloneNode(true));
      return true;
    }
    if (currentNode.classList.contains("timeline-row-reasoning")) {
      currentNode.replaceWith(nextNode.cloneNode(true));
      return true;
    }
    if (currentNode.classList.contains("timeline-row-command") || currentNode.classList.contains("timeline-row-patch")) {
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
          ".assistant-command-item-inline-detail, .timeline-inline-detail-row"
        );
        const nextInlineDetail = nextInline.querySelector(
          ".assistant-command-item-inline-detail, .timeline-inline-detail-row"
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
      if (!currentCard || !nextCard || !currentDetails || !nextDetails || !currentTitle || !nextTitle || !currentMeta || !nextMeta || !currentBody || !nextBody) {
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
      ".session-topbar-action"
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
  var initialWorkspaceUiState = readWorkspaceUiState();
  var initialWorkspaceUnreadState = readWorkspaceUnreadState();
  var initialCompletionAlertPrefs = readCompletionAlertPrefs();
  var initialCompletionActionState = applyCompletionActionMigrations(readCompletionActionState());
  var initialTaskPlanCollapsed = readTaskPlanPanelCollapsed();
  var initialMobileSendQueueState = readMobileSendQueueState();
  var state = {
    route: "",
    ws: null,
    socketState: "closed",
    ui: {
      locale: getCurrentLocale()
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
      sessionContextMenu: null,
      sessionsRefreshTimerId: 0,
      sessionsRefreshInFlight: false,
      createDialog: {
        open: false,
        mode: "pick-project",
        startMode: "project",
        submitting: false,
        selectedProjectId: "",
        firstMessage: "",
        clientCreateId: "",
        customCwd: "",
        modelId: "",
        reasoningId: "",
        projectName: "",
        projectPath: "",
        browserLoading: false,
        browserCurrentPath: "",
        browserParentPath: "",
        browserItems: [],
        error: ""
      },
      importDialog: {
        open: false,
        loading: false,
        submitting: false,
        items: [],
        query: "",
        selectedRolloutPath: "",
        error: ""
      }
    },
    sessions: __spreadValues({
      items: [],
      projects: []
    }, DEFAULT_SESSIONS_VIEW),
    detail: __spreadValues({
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
      lastResumeSyncAt: 0
    }, DEFAULT_DETAIL_VIEW)
  };
  applyDocumentLocale();
  installBlankScreenWatchdog();
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
    true
  );
  function renderRoute() {
    const hash = window.location.hash || "#/sessions";
    if (activeRouteRenderPromise && activeRouteRenderHash === hash) {
      reportClientDebug("route-render-reused", { hash });
      return;
    }
    if (state.route === hash && !activeRouteRenderPromise) {
      const route2 = parseHashRoute(hash);
      const matched2 = route2.path.match(/^#\/sessions\/([^/]+)$/);
      if (!matched2 || document.querySelector("#session-detail-shell")) {
        reportClientDebug("route-render-ignored", { hash });
        return;
      }
    }
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
    const route = parseHashRoute(hash);
    state.route = hash;
    const matched = route.path.match(/^#\/sessions\/([^/]+)$/);
    hydrateSessionsViewState("");
    if (matched) {
      hydrateSessionDetailViewState(route.query);
    } else {
      state.detail = __spreadProps(__spreadValues(__spreadValues({}, state.detail), DEFAULT_DETAIL_VIEW), {
        optimisticSend: null,
        detailSyncing: false,
        detailSyncError: ""
      });
    }
    const routeSessionId = (matched == null ? void 0 : matched[1]) || "";
    activeRouteRenderHash = hash;
    activeRouteRenderPromise = renderWorkspacePage(routeSessionId).then(() => {
      reportClientDebug("route-rendered", { routeSessionId }, { force: true });
    }).catch((error) => {
      reportClientDebug(
        "route-render-error",
        { routeSessionId, error: serializeClientError(error) },
        { force: true }
      );
    }).finally(() => {
      if (activeRouteRenderHash === hash) {
        activeRouteRenderHash = "";
        activeRouteRenderPromise = null;
      }
    });
  }
  function getWorkspaceFilteredSessions() {
    const projectMap = new Map(state.sessions.projects.map((project) => [project.projectId, project]));
    const filtered = state.sessions.items.filter(
      (session) => matchesSessionFilters(session, projectMap.get(session.projectId), state.sessions)
    );
    return sortSessions(filtered, state.sessions.sort);
  }
  function getWorkspaceSessionById(sessionId) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return null;
    }
    return state.sessions.items.find((session) => session.sessionId === normalizedSessionId) || null;
  }
  function resolveWorkspaceSessionId(routeSessionId) {
    var _a, _b;
    const availableIds = new Set(state.sessions.items.map((session) => session.sessionId));
    if (routeSessionId && availableIds.has(routeSessionId)) {
      return routeSessionId;
    }
    if (state.workspace.activeSessionId && availableIds.has(state.workspace.activeSessionId)) {
      return state.workspace.activeSessionId;
    }
    return ((_a = getWorkspaceFilteredSessions()[0]) == null ? void 0 : _a.sessionId) || ((_b = state.sessions.items[0]) == null ? void 0 : _b.sessionId) || "";
  }
  function renderWorkspaceEmptyState() {
    return `
    <section class="workspace-empty-state">
      <p class="workspace-empty-eyebrow">${escapeHtml4(t("workspace.empty.eyebrow"))}</p>
      <h2>${escapeHtml4(t("workspace.empty.title"))}</h2>
      <p>${escapeHtml4(t("workspace.empty.subtitle"))}</p>
      <div class="workspace-empty-actions">
        <button id="workspace-empty-create-session" type="button" class="primary-button">${escapeHtml4(t("workspace.empty.newSession"))}</button>
        <button id="workspace-empty-import-session" type="button" class="secondary-button">${escapeHtml4(t("workspace.empty.importCodex"))}</button>
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
    return state.sessions.projects.find(
      (project) => normalizeProjectPathForComparison(project.path) === normalizedTargetPath
    ) || null;
  }
  function getDefaultWorkspaceProjectBrowsePath() {
    var _a, _b;
    return normalizeProjectPathForComparison(
      ((_a = state.detail.session) == null ? void 0 : _a.projectPath) || ((_b = state.sessions.projects[0]) == null ? void 0 : _b.path) || ""
    );
  }
  function getWorkspaceCreateCodexUiOptions() {
    const uiOptions = state.detail.codexUiOptions;
    return uiOptions && Array.isArray(uiOptions.models) && uiOptions.models.length > 0 && Array.isArray(uiOptions.reasoningLevels) && uiOptions.reasoningLevels.length > 0 ? uiOptions : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
  }
  function getDefaultCreateSessionCodexLaunch() {
    var _a;
    return normalizeCodexLaunchAgainstUi(
      state.detail.codexLaunch || ((_a = state.detail.session) == null ? void 0 : _a.codexLaunch) || {},
      getWorkspaceCreateCodexUiOptions()
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
    const title = String((session == null ? void 0 : session.title) || "").trim();
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
    return `${normalized.slice(0, 27)}\u2026`;
  }
  function renderWorkspaceCreateSessionDialog() {
    const dialogState = state.workspace.createDialog;
    if (!dialogState.open) {
      return "";
    }
    const projects = Array.isArray(state.sessions.projects) ? state.sessions.projects : [];
    const selectedProject = projects.find((project) => project.projectId === dialogState.selectedProjectId) || projects[0] || null;
    const startMode = normalizeCreateSessionStartMode(dialogState.startMode);
    const uiOptions = getWorkspaceCreateCodexUiOptions();
    const modelOptions = Array.isArray(uiOptions.models) ? uiOptions.models : [];
    const reasoningOptions = Array.isArray(uiOptions.reasoningLevels) ? uiOptions.reasoningLevels : [];
    const selectedModelId = String(dialogState.modelId || "").trim();
    const selectedReasoningId = String(dialogState.reasoningId || "").trim();
    const canSubmitSession = canSubmitWorkspaceCreateSession();
    if (dialogState.mode === "pick-project") {
      return `
      <div class="workspace-modal-overlay"></div>
      <section class="workspace-dialog" aria-label="${escapeHtml4(t("workspace.empty.newSession"))}">
        <div class="workspace-dialog-head">
          <div>
            <p class="workspace-dialog-eyebrow">${escapeHtml4(t("workspace.create.eyebrow"))}</p>
            <h2 class="workspace-dialog-title">${escapeHtml4(t("workspace.create.pickProjectTitle"))}</h2>
          </div>
          <button id="workspace-create-dialog-close" type="button" class="secondary-button">${escapeHtml4(t("workspace.create.close"))}</button>
        </div>
        <div class="workspace-dialog-body">
          <div class="workspace-dialog-segmented" role="group" aria-label="${escapeHtml4(t("workspace.create.startMode"))}">
            <button
              type="button"
              class="workspace-dialog-segment ${startMode === "project" ? "workspace-dialog-segment-active" : ""}"
              data-create-start-mode="project"
            >
              ${escapeHtml4(t("workspace.create.startModeProject"))}
            </button>
            <button
              type="button"
              class="workspace-dialog-segment ${startMode === "custom" ? "workspace-dialog-segment-active" : ""}"
              data-create-start-mode="custom"
            >
              ${escapeHtml4(t("workspace.create.startModeCustom"))}
            </button>
          </div>
          ${startMode === "custom" ? `
                <label class="workspace-dialog-field">
                  <span>${escapeHtml4(t("workspace.create.customCwd"))}</span>
                  <input
                    id="workspace-create-custom-cwd"
                    class="workspace-dialog-input"
                    value="${escapeHtml4(dialogState.customCwd || "")}"
                    placeholder="${escapeHtml4(t("workspace.create.customCwdPlaceholder"))}"
                  />
                </label>
                <div class="workspace-dialog-help">
                  ${escapeHtml4(t("workspace.create.customCwdHelp"))}
                </div>
              ` : projects.length === 0 ? `<div class="workspace-dialog-empty">${escapeHtml4(t("workspace.create.noProjects"))}</div>` : `
                <div class="workspace-dialog-list">
                  ${projects.map((project) => {
        const active = project.projectId === (selectedProject == null ? void 0 : selectedProject.projectId);
        return `
                        <button
                          type="button"
                          class="workspace-dialog-item ${active ? "workspace-dialog-item-active" : ""}"
                          data-select-project="${project.projectId}"
                        >
                          <div class="workspace-dialog-item-head">
                            <span class="workspace-dialog-item-title">${escapeHtml4(project.name || t("workspace.project.untitled"))}</span>
                          </div>
                          <div class="workspace-dialog-item-subtle">${escapeHtml4(shortenText(project.path || "", 100))}</div>
                        </button>
                      `;
      }).join("")}
                </div>
              `}
          <div class="workspace-dialog-grid">
            <label class="workspace-dialog-field">
              <span>${escapeHtml4(t("workspace.create.model"))}</span>
              <select id="workspace-create-model" class="workspace-dialog-input">
                <option value="" ${selectedModelId ? "" : "selected"}>
                  ${escapeHtml4(t("workspace.create.noModelOverride"))}
                </option>
                ${modelOptions.map((modelOption) => {
        const id = String(modelOption.id || "").trim();
        const label = String(modelOption.label || id || t("workspace.create.defaultModel"));
        return `
                      <option value="${escapeHtml4(id)}" ${id === selectedModelId ? "selected" : ""}>
                        ${escapeHtml4(label)}
                      </option>
                    `;
      }).join("")}
              </select>
            </label>
            <label class="workspace-dialog-field">
              <span>${escapeHtml4(t("workspace.create.reasoning"))}</span>
              <select id="workspace-create-reasoning" class="workspace-dialog-input">
                <option value="" ${selectedReasoningId ? "" : "selected"}>
                  ${escapeHtml4(t("workspace.create.noReasoningOverride"))}
                </option>
                ${reasoningOptions.map((reasoningOption) => {
        const id = String(reasoningOption.id || "").trim();
        const label = formatReasoningEffortLabel(id || reasoningOption.label || t("workspace.create.defaultReasoning"));
        return `
                      <option value="${escapeHtml4(id)}" ${id === selectedReasoningId ? "selected" : ""}>
                        ${escapeHtml4(label)}
                      </option>
                    `;
      }).join("")}
              </select>
            </label>
          </div>
          <label class="workspace-dialog-field workspace-dialog-first-message">
            <span>${escapeHtml4(t("workspace.create.firstMessage"))}</span>
            <textarea
              id="workspace-create-first-message"
              class="workspace-dialog-input workspace-dialog-textarea"
              rows="5"
              placeholder="${escapeHtml4(t("workspace.create.firstMessagePlaceholder"))}"
              autocomplete="on"
              autocorrect="on"
              autocapitalize="sentences"
              spellcheck="true"
              inputmode="text"
              enterkeyhint="done"
              lang="zh-CN"
            >${escapeHtml4(dialogState.firstMessage || "")}</textarea>
          </label>
          <div class="workspace-dialog-help">
            ${escapeHtml4(t("workspace.create.firstMessageHelp"))}
          </div>
          ${dialogState.error ? `<div class="workspace-dialog-error">${escapeHtml4(dialogState.error)}</div>` : ""}
        </div>
        <div class="workspace-dialog-foot workspace-dialog-foot-split">
          <div class="workspace-dialog-secondary-actions">
            <span class="workspace-dialog-foot-note">${escapeHtml4(t("workspace.create.existingProjectsOnly"))}</span>
          </div>
          <button
            id="workspace-create-session-submit"
            type="button"
            class="primary-button"
            ${canSubmitSession ? "" : "disabled"}
          >
            ${escapeHtml4(dialogState.submitting ? t("workspace.create.processing") : t("workspace.create.startSession"))}
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
    <section class="workspace-dialog" aria-label="${escapeHtml4(title)}">
      <div class="workspace-dialog-head">
        <div>
          <p class="workspace-dialog-eyebrow">${escapeHtml4(t("generic.project"))}</p>
          <h2 class="workspace-dialog-title">${escapeHtml4(title)}</h2>
        </div>
        <button id="workspace-create-dialog-close" type="button" class="secondary-button">${escapeHtml4(t("workspace.create.close"))}</button>
      </div>
      <div class="workspace-dialog-form">
        <label class="workspace-dialog-field">
          <span>${escapeHtml4(t("workspace.create.projectName"))}</span>
          <input
            id="workspace-project-name"
            class="workspace-dialog-input"
            value="${escapeHtml4(dialogState.projectName)}"
            placeholder="${escapeHtml4(t("workspace.create.projectNamePlaceholder"))}"
          />
        </label>
        <div class="workspace-dialog-help">
          ${escapeHtml4(t("workspace.create.projectHelp"))}
        </div>
        <div class="workspace-dialog-field">
          <span>${escapeHtml4(t("workspace.create.currentDirectory"))}</span>
          <div class="workspace-directory-browser">
            <div class="workspace-directory-browser-bar">
              <input
                id="workspace-project-browser-path"
                class="workspace-dialog-input workspace-directory-browser-path-input"
                value="${escapeHtml4(browserPathValue)}"
                placeholder="${escapeHtml4(t("workspace.create.pathPlaceholder"))}"
              />
              <div class="workspace-directory-browser-actions">
                ${canBrowseUp ? `<button id="workspace-project-browse-up" type="button" class="secondary-button">${escapeHtml4(t("workspace.create.upOneLevel"))}</button>` : ""}
              </div>
            </div>
            ${dialogState.browserLoading ? `<div class="workspace-dialog-empty">${escapeHtml4(t("workspace.create.loadingDirectories"))}</div>` : browserItems.length ? `
                    <div class="workspace-dialog-list workspace-directory-browser-list">
                      ${browserItems.map((item) => {
      const active = item.path === dialogState.projectPath;
      return `
                            <button
                              type="button"
                              class="workspace-dialog-item ${active ? "workspace-dialog-item-active" : ""}"
                              data-browse-path="${escapeHtml4(item.path)}"
                            >
                              <div class="workspace-dialog-item-head">
                                <span class="workspace-dialog-item-title">${escapeHtml4(item.name || item.path)}</span>
                              </div>
                              <div class="workspace-dialog-item-subtle">${escapeHtml4(shortenText(item.path || "", 100))}</div>
                            </button>
                          `;
    }).join("")}
                    </div>
                  ` : `<div class="workspace-dialog-empty">${escapeHtml4(t("workspace.create.noChildDirectories"))}</div>`}
          </div>
        </div>
        ${dialogState.error ? `<div class="workspace-dialog-error">${escapeHtml4(dialogState.error)}</div>` : ""}
      </div>
      <div class="workspace-dialog-foot workspace-dialog-foot-split">
        <button id="workspace-create-dialog-back" type="button" class="secondary-button">${escapeHtml4(t("workspace.create.backToProjects"))}</button>
        <button id="workspace-project-submit" type="button" class="primary-button">${escapeHtml4(primaryLabel)}</button>
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
        item.importedSessionId
      ].filter(Boolean).join("\n").toLowerCase();
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
    const selected = visibleItems.find((item) => item.rolloutPath === dialogState.selectedRolloutPath) || visibleItems[0] || null;
    const primaryLabel = (selected == null ? void 0 : selected.importedSessionId) ? t("workspace.import.syncLatest") : t("workspace.import.importSession");
    return `
    <div class="workspace-import-dialog-overlay"></div>
    <section class="workspace-import-dialog" aria-label="${escapeHtml4(t("workspace.import.title"))}">
      <div class="workspace-import-dialog-head">
        <div>
          <p class="workspace-import-dialog-eyebrow">${escapeHtml4(t("workspace.import.eyebrow"))}</p>
          <h2 class="workspace-import-dialog-title">${escapeHtml4(t("workspace.import.title"))}</h2>
        </div>
        <button id="workspace-import-dialog-close" type="button" class="secondary-button">${escapeHtml4(t("workspace.create.close"))}</button>
      </div>
      <div class="workspace-import-dialog-toolbar">
        <input
          id="workspace-import-dialog-search"
          class="workspace-import-dialog-search"
          placeholder="${escapeHtml4(t("workspace.import.searchPlaceholder"))}"
          value="${escapeHtml4(dialogState.query)}"
        />
      </div>
      <div class="workspace-import-dialog-body">
        ${dialogState.loading ? `<div class="workspace-import-dialog-empty">${escapeHtml4(t("workspace.import.loading"))}</div>` : dialogState.error ? `<div class="workspace-import-dialog-empty">${escapeHtml4(dialogState.error)}</div>` : visibleItems.length === 0 ? `<div class="workspace-import-dialog-empty">${escapeHtml4(t("workspace.import.empty"))}</div>` : `
                  <div class="workspace-import-dialog-list">
                    ${visibleItems.map((item) => {
      const selectedItem = (selected == null ? void 0 : selected.rolloutPath) === item.rolloutPath;
      const importedLabel = item.importedSessionId ? t("workspace.import.imported") : t("workspace.import.available");
      const updatedLabel = item.updatedAt ? formatElapsedSinceIso(item.updatedAt) : "--";
      return `
                          <button
                            type="button"
                            class="workspace-import-dialog-item ${selectedItem ? "workspace-import-dialog-item-active" : ""}"
                            data-import-rollout="${escapeHtml4(item.rolloutPath)}"
                          >
                            <div class="workspace-import-dialog-item-head">
                              <span class="workspace-import-dialog-item-title">${escapeHtml4(item.title || item.codexSessionId || t("workspace.session.untitled"))}</span>
                              <span class="pill ${item.importedSessionId ? "pill-neutral" : "pill-success"}">${escapeHtml4(importedLabel)}</span>
                            </div>
                            <div class="workspace-import-dialog-item-meta">
                              <span>${escapeHtml4(shortenText(item.cwd || item.rolloutPath, 72))}</span>
                              <span>${escapeHtml4(updatedLabel)}</span>
                            </div>
                            <div class="workspace-import-dialog-item-subtle">${escapeHtml4(shortenText(item.codexSessionId || item.rolloutPath, 90))}</div>
                          </button>
                        `;
    }).join("")}
                  </div>
                `}
      </div>
      <div class="workspace-import-dialog-foot">
        <div class="workspace-import-dialog-foot-note">
          ${selected ? selected.importedSessionId ? escapeHtml4(t("workspace.import.syncToExisting", { sessionId: selected.importedSessionId })) : escapeHtml4(t("workspace.import.importSelected", { title: selected.title || selected.codexSessionId || t("workspace.session.untitled") })) : escapeHtml4(t("workspace.import.chooseSession"))}
        </div>
        <button
          id="workspace-import-dialog-submit"
          type="button"
          class="primary-button"
          ${selected && !dialogState.loading && !dialogState.submitting ? "" : "disabled"}
        >
          ${escapeHtml4(dialogState.submitting ? t("workspace.create.processing") : primaryLabel)}
        </button>
      </div>
    </section>
  `;
  }
  function renderWorkspaceModalSlot() {
    return `${renderWorkspaceCreateSessionDialog()}${renderWorkspaceImportDialog()}`;
  }
  function getSessionLatestPlan(session) {
    const plan = session == null ? void 0 : session.latestPlan;
    return plan && Array.isArray(plan.tasks) && plan.tasks.length > 0 ? plan : null;
  }
  function getSessionActivityCount(session) {
    const count = Number((session == null ? void 0 : session.eventCount) || (session == null ? void 0 : session.lastEventSeq) || (session == null ? void 0 : session.lastSeq) || 0);
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
    if (String(nextSummary.lastEventAt || "") && String(nextSummary.lastEventAt || "") !== String(currentSession.lastEventAt || "")) {
      return true;
    }
    if (String(nextSummary.updatedAt || "") && String(nextSummary.updatedAt || "") !== String(currentSession.updatedAt || "")) {
      return true;
    }
    return false;
  }
  function reconcileWorkspaceReadMarkers(sessions = []) {
    const readEventCounts = __spreadValues({}, state.workspace.readEventCounts || {});
    let changed = false;
    sessions.forEach((session) => {
      const sessionId = String((session == null ? void 0 : session.sessionId) || (session == null ? void 0 : session.id) || "").trim();
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
    var _a, _b, _c;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return;
    }
    const session = state.sessions.items.find((item) => item.sessionId === normalizedSessionId) || (((_a = state.detail.session) == null ? void 0 : _a.sessionId) === normalizedSessionId ? state.detail.session : null);
    const nextCount = Math.max(
      Number(activityCount || 0),
      getSessionActivityCount(session),
      ((_b = state.detail.session) == null ? void 0 : _b.sessionId) === normalizedSessionId ? Number(state.detail.cursor || 0) : 0
    );
    const normalizedCount = Number.isFinite(nextCount) && nextCount > 0 ? Math.floor(nextCount) : 0;
    const currentCount = Number(((_c = state.workspace.readEventCounts) == null ? void 0 : _c[normalizedSessionId]) || 0);
    if (currentCount >= normalizedCount) {
      return;
    }
    state.workspace.readEventCounts = __spreadProps(__spreadValues({}, state.workspace.readEventCounts || {}), {
      [normalizedSessionId]: normalizedCount
    });
    writeWorkspaceUnreadState();
  }
  function updateWorkspaceSessionActivityCount(sessionId, activityCount) {
    var _a;
    const normalizedSessionId = String(sessionId || "").trim();
    const nextCount = Number(activityCount || 0);
    if (!normalizedSessionId || !Number.isFinite(nextCount) || nextCount <= 0) {
      return;
    }
    state.sessions.items = state.sessions.items.map((item) => {
      if (item.sessionId !== normalizedSessionId) {
        return item;
      }
      return __spreadProps(__spreadValues({}, item), {
        eventCount: Math.max(getSessionActivityCount(item), Math.floor(nextCount))
      });
    });
    if (((_a = state.detail.session) == null ? void 0 : _a.sessionId) === normalizedSessionId) {
      state.detail.session.eventCount = Math.max(
        getSessionActivityCount(state.detail.session),
        Math.floor(nextCount)
      );
    }
  }
  function getWorkspaceUnreadCount(session, selectedSessionId = "") {
    var _a;
    const sessionId = String((session == null ? void 0 : session.sessionId) || (session == null ? void 0 : session.id) || "").trim();
    if (!sessionId || sessionId === selectedSessionId) {
      return 0;
    }
    const activityCount = getSessionActivityCount(session);
    const readCount = Number(((_a = state.workspace.readEventCounts) == null ? void 0 : _a[sessionId]) || 0);
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
    const displayCount = unreadCount > WORKSPACE_UNREAD_BADGE_MAX ? `${WORKSPACE_UNREAD_BADGE_MAX}+` : String(unreadCount);
    const label = t("workspace.sidebar.unreadCount", { count: unreadCount });
    return `<span class="workspace-session-unread-badge" title="${escapeHtml4(label)}" aria-label="${escapeHtml4(label)}">${escapeHtml4(displayCount)}</span>`;
  }
  function renderWorkspaceQueueBadges(session) {
    const officialCount = getOfficialQueueCount(session);
    const localCount = getMobileQueuedMessages(session == null ? void 0 : session.sessionId).length;
    const badges = [];
    if (officialCount > 0) {
      const label = t("queue.badgeOfficial", { count: officialCount });
      badges.push(
        `<span class="workspace-session-queue-badge workspace-session-queue-badge-official" title="${escapeHtml4(label)}" aria-label="${escapeHtml4(label)}">${escapeHtml4(t("queue.badgeShortOfficial", { count: officialCount }))}</span>`
      );
    }
    if (localCount > 0) {
      const label = t("queue.badgeSyncodex", { count: localCount });
      badges.push(
        `<span class="workspace-session-queue-badge workspace-session-queue-badge-syncodex" title="${escapeHtml4(label)}" aria-label="${escapeHtml4(label)}">${escapeHtml4(t("queue.badgeShortSyncodex", { count: localCount }))}</span>`
      );
    }
    return badges.join("");
  }
  function getSessionTaskSummary(session) {
    var _a;
    const plan = getSessionLatestPlan(session);
    if (!plan) {
      return "";
    }
    const activeTask = ((_a = plan.activeTask) == null ? void 0 : _a.step) || "";
    if (activeTask) {
      return t("workspace.sidebar.currentTask", { task: activeTask });
    }
    return t("workspace.sidebar.taskProgress", {
      completed: plan.completedCount || 0,
      total: plan.totalCount || plan.tasks.length
    });
  }
  function renderWorkspaceSessionTaskIcon(session) {
    const plan = getSessionLatestPlan(session);
    if (!plan) {
      return "";
    }
    const label = t("workspace.sidebar.hasTasks");
    return `
    <span class="workspace-session-task-icon" title="${escapeHtml4(label)}" aria-label="${escapeHtml4(label)}">
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
  function renderWorkspaceSessionPinIcon() {
    const label = t("workspace.sessionMenu.pinned");
    return `
    <span class="workspace-session-pin" title="${escapeHtml4(label)}" aria-label="${escapeHtml4(label)}">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M6.2 2.2h3.6l-.5 3.3 2.5 2.3v1.1H8.7v4.2L8 14l-.7-.9V8.9H4.2V7.8l2.5-2.3-.5-3.3z"></path>
      </svg>
    </span>
  `;
  }
  function renderCompletionAlertToggle() {
    const prefs = state.workspace.completionAlerts || {};
    const permission = getNotificationPermission();
    const enabled = Boolean(prefs.enabled);
    const disabled = permission === "unsupported" && !canUseVibration();
    const title = enabled ? t("workspace.alerts.disable") : permission === "denied" ? t("workspace.alerts.denied") : t("workspace.alerts.enable");
    return `
    <button
      id="workspace-completion-alert-toggle"
      type="button"
      class="workspace-sidebar-alert-btn ${enabled ? "workspace-sidebar-alert-btn-active" : ""}"
      aria-label="${escapeHtml4(title)}"
      title="${escapeHtml4(title)}"
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
    const contextMenuHtml = renderWorkspaceSessionContextMenu();
    const projectOrder = state.sessions.projects.map((project) => project.projectId).filter((projectId) => filteredSessions.some((session) => session.projectId === projectId));
    const groupedProjectIds = new Set(projectOrder);
    const orphanProjectIds = [
      ...new Set(
        filteredSessions.map((session) => session.projectId).filter((projectId) => projectId && !groupedProjectIds.has(projectId))
      )
    ];
    const sidebarGroups = [...projectOrder, ...orphanProjectIds].map((projectId) => {
      const project = projectMap.get(projectId) || { name: projectId, path: "" };
      const sessions = filteredSessions.filter((session) => session.projectId === projectId);
      return { projectId, project, sessions };
    }).filter((group) => group.sessions.length > 0);
    const groupedSessionsHtml = sidebarGroups.length > 0 ? sidebarGroups.map((group) => {
      var _a, _b;
      const collapsed = state.workspace.collapsedProjectIds.has(group.projectId);
      return `
              <section class="workspace-session-project-group ${collapsed ? "workspace-session-project-group-collapsed" : ""}">
                <button
                  type="button"
                  class="workspace-session-project-head"
                  data-toggle-project="${escapeHtml4(group.projectId)}"
                  aria-expanded="${collapsed ? "false" : "true"}"
                >
                  <span class="workspace-session-project-main">
                    <svg class="workspace-session-project-chevron" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                      <path d="M6 3.5 10.5 8 6 12.5"></path>
                    </svg>
                    <span class="workspace-session-project-title">${escapeHtml4(((_a = group.project) == null ? void 0 : _a.name) || group.projectId)}</span>
                  </span>
                  <span class="workspace-session-project-count">${group.sessions.length}</span>
                </button>
                <div class="workspace-session-project-body" ${collapsed ? "hidden" : ""}>
                  ${((_b = group.project) == null ? void 0 : _b.path) ? `<div class="workspace-session-project-path">${escapeHtml4(shortenText(group.project.path, 72))}</div>` : ""}
                  ${group.sessions.map((session) => {
        const displayStatus = getSessionDisplayStatus(session);
        const showStatusPill = ["starting", "running", "stopping", "failed"].includes(displayStatus);
        const selected = session.sessionId === selectedSessionId;
        const unreadCount = getWorkspaceUnreadCount(session, selectedSessionId);
        const taskSummary = getSessionTaskSummary(session);
        const stateClass = isSessionLiveBusy(session) ? "workspace-session-item-running" : displayStatus === "failed" ? "workspace-session-item-failed" : "";
        return `
                        <button
                          type="button"
                          class="workspace-session-item ${selected ? "workspace-session-item-active" : ""} ${stateClass}"
                          data-open-session="${session.sessionId}"
                        >
                          <div class="workspace-session-item-head">
                            <span class="workspace-session-item-title-wrap">
                              <span class="workspace-session-status-dot ${statusClass(displayStatus)}"></span>
                              ${session.isPinned || session.pinned ? renderWorkspaceSessionPinIcon() : ""}
                              <span class="workspace-session-item-title">${escapeHtml4(session.title || t("workspace.session.untitled"))}</span>
                            </span>
                            <span class="workspace-session-item-badges">
                              ${renderWorkspaceUnreadBadge(unreadCount)}
                              ${renderWorkspaceQueueBadges(session)}
                              ${renderWorkspaceSessionTaskIcon(session)}
                              ${showStatusPill ? `<span class="pill ${statusClass(displayStatus)}">${escapeHtml4(sessionStatusLabel(displayStatus))}</span>` : ""}
                            </span>
                          </div>
                          ${taskSummary ? `<div class="workspace-session-item-task">${escapeHtml4(shortenText(taskSummary, 96))}</div>` : ""}
                          ${session.lastAssistantContent ? `<div class="workspace-session-item-preview">${escapeHtml4(shortenText(session.lastAssistantContent, 90))}</div>` : session.lastCommand ? `<div class="workspace-session-item-preview">${escapeHtml4(shortenText(session.lastCommand, 90))}</div>` : ""}
                        </button>
                      `;
      }).join("")}
                </div>
              </section>
            `;
    }).join("") : "";
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
              aria-label="${escapeHtml4(t("workspace.language.select"))}"
              title="${escapeHtml4(t("workspace.language.select"))}"
              aria-expanded="${state.workspace.localeMenuOpen ? "true" : "false"}"
              aria-haspopup="menu"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <circle cx="12" cy="12" r="8"></circle>
                <path d="M4 12h16"></path>
                <path d="M12 4c2.4 2.2 3.8 5 3.8 8s-1.4 5.8-3.8 8c-2.4-2.2-3.8-5-3.8-8s1.4-5.8 3.8-8z"></path>
              </svg>
            </button>
            ${state.workspace.localeMenuOpen ? `
                  <div id="workspace-locale-menu" class="workspace-sidebar-locale-menu" role="menu" aria-label="${escapeHtml4(t("workspace.language.select"))}">
                    ${localeOptions.map(
      (option) => `
                          <button
                            type="button"
                            class="workspace-sidebar-locale-option ${getCurrentLocale() === option.id ? "workspace-sidebar-locale-option-active" : ""}"
                            data-workspace-locale="${escapeHtml4(option.id)}"
                            role="menuitemradio"
                            aria-checked="${getCurrentLocale() === option.id ? "true" : "false"}"
                          >
                            ${escapeHtml4(option.label)}
                          </button>
                        `
    ).join("")}
                  </div>
                ` : ""}
          </div>
          <button id="workspace-import-session" type="button" class="workspace-sidebar-import-btn" title="${escapeHtml4(t("workspace.sidebar.import"))}" aria-label="${escapeHtml4(t("workspace.sidebar.import"))}">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M12 4v10"></path>
              <path d="M8 10l4 4 4-4"></path>
              <path d="M4 18v2h16v-2"></path>
            </svg>
          </button>
          <button id="workspace-sidebar-close" type="button" class="workspace-sidebar-close" aria-label="${escapeHtml4(t("workspace.closeSidebar"))}">
            \u2630
          </button>
        </div>
      </div>

      <div class="workspace-sidebar-actions">
        <button id="workspace-create-session" type="button" class="primary-button">${escapeHtml4(t("workspace.sidebar.newSession"))}</button>
      </div>

      <div class="workspace-session-list" id="workspace-session-list">
        ${filteredSessions.length > 0 ? groupedSessionsHtml : `<div class="workspace-session-empty">${escapeHtml4(t("workspace.sidebar.empty"))}</div>`}
      </div>
      ${contextMenuHtml}
    </div>
  `;
  }
  function renderWorkspaceSessionContextMenu() {
    const menu = state.workspace.sessionContextMenu;
    if (!(menu == null ? void 0 : menu.sessionId)) {
      return "";
    }
    const session = getWorkspaceSessionById(menu.sessionId);
    if (!session) {
      return "";
    }
    const pinned = Boolean(session.isPinned || session.pinned);
    const left = Math.max(8, Math.min(Number(menu.x || 0), window.innerWidth - 188));
    const top = Math.max(8, Math.min(Number(menu.y || 0), window.innerHeight - 150));
    return `
    <div class="workspace-session-menu-layer" data-session-menu-action="close">
      <div
        class="workspace-session-menu"
        role="menu"
        style="left:${left}px;top:${top}px"
        aria-label="${escapeHtml4(t("workspace.sessionMenu.title"))}"
      >
        <button type="button" class="workspace-session-menu-item" data-session-menu-action="${pinned ? "unpin" : "pin"}" data-session-menu-id="${escapeHtml4(session.sessionId)}" role="menuitem">
          ${escapeHtml4(pinned ? t("workspace.sessionMenu.unpin") : t("workspace.sessionMenu.pin"))}
        </button>
        <button type="button" class="workspace-session-menu-item" data-session-menu-action="rename" data-session-menu-id="${escapeHtml4(session.sessionId)}" role="menuitem">
          ${escapeHtml4(t("workspace.sessionMenu.rename"))}
        </button>
        <button type="button" class="workspace-session-menu-item workspace-session-menu-item-danger" data-session-menu-action="archive" data-session-menu-id="${escapeHtml4(session.sessionId)}" role="menuitem">
          ${escapeHtml4(t("workspace.sessionMenu.archive"))}
        </button>
      </div>
    </div>
  `;
  }
  function closeWorkspaceSessionContextMenu() {
    var _a;
    if (!state.workspace.sessionContextMenu) {
      return;
    }
    state.workspace.sessionContextMenu = null;
    patchWorkspaceSidebar(state.workspace.activeSessionId || ((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "");
  }
  function openWorkspaceSessionContextMenu(sessionId, clientX, clientY) {
    var _a;
    const session = getWorkspaceSessionById(sessionId);
    if (!session) {
      return;
    }
    state.workspace.sessionContextMenu = {
      sessionId,
      x: Number(clientX || 0),
      y: Number(clientY || 0)
    };
    patchWorkspaceSidebar(state.workspace.activeSessionId || ((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "");
  }
  function patchWorkspaceSidebar(selectedSessionId = "") {
    const slot = document.querySelector("#workspace-sidebar");
    if (!(slot instanceof HTMLElement)) {
      return;
    }
    slot.innerHTML = renderWorkspaceSidebar(selectedSessionId);
    bindWorkspaceSidebarControls(selectedSessionId);
  }
  async function refreshWorkspaceSessionsNow() {
    const sessions = await getSessions();
    if (!sessions || !Array.isArray(sessions.items)) {
      return [];
    }
    state.sessions.items = sessions.items;
    reconcileWorkspaceReadMarkers(state.sessions.items);
    return sessions.items;
  }
  async function handleWorkspaceSessionMenuAction(action, sessionId) {
    var _a, _b, _c, _d, _e, _f;
    const normalizedAction = String(action || "").trim();
    const normalizedSessionId = String(sessionId || "").trim();
    const session = getWorkspaceSessionById(normalizedSessionId);
    if (!normalizedAction || !session) {
      return;
    }
    closeWorkspaceSessionContextMenu();
    try {
      if (normalizedAction === "rename") {
        const nextTitle = window.prompt(t("workspace.sessionMenu.renamePrompt"), session.title || "");
        if (nextTitle === null) {
          return;
        }
        const trimmedTitle = String(nextTitle || "").trim();
        if (!trimmedTitle) {
          showToast(t("workspace.sessionMenu.renameEmpty"));
          return;
        }
        const result = await updateSession(normalizedSessionId, {
          action: "rename",
          title: trimmedTitle
        });
        if (result == null ? void 0 : result.session) {
          updateSessionListItem(result.session);
          if (((_a = state.detail.session) == null ? void 0 : _a.sessionId) === normalizedSessionId) {
            state.detail.session = __spreadProps(__spreadValues({}, state.detail.session), {
              title: result.session.title || trimmedTitle
            });
            scheduleSessionDetailRender();
          }
        } else {
          await refreshWorkspaceSessionsNow();
        }
        showToast(t("workspace.sessionMenu.renamed"));
        patchWorkspaceSidebar(state.workspace.activeSessionId || ((_b = state.detail.session) == null ? void 0 : _b.sessionId) || "");
        return;
      }
      if (normalizedAction === "pin" || normalizedAction === "unpin") {
        const result = await updateSession(normalizedSessionId, {
          action: normalizedAction,
          pinned: normalizedAction === "pin"
        });
        const shouldPin = Boolean((_c = result == null ? void 0 : result.pinned) != null ? _c : normalizedAction === "pin");
        state.sessions.items = state.sessions.items.map(
          (item) => item.sessionId === normalizedSessionId ? __spreadProps(__spreadValues({}, item), { pinned: shouldPin, isPinned: shouldPin, pinnedOrder: shouldPin ? 0 : null }) : item
        );
        await refreshWorkspaceSessionsNow().catch(() => null);
        showToast(shouldPin ? t("workspace.sessionMenu.pinnedDone") : t("workspace.sessionMenu.unpinnedDone"));
        patchWorkspaceSidebar(state.workspace.activeSessionId || ((_d = state.detail.session) == null ? void 0 : _d.sessionId) || "");
        return;
      }
      if (normalizedAction === "archive") {
        if (!window.confirm(t("workspace.sessionMenu.archiveConfirm", { title: session.title || "" }))) {
          return;
        }
        await updateSession(normalizedSessionId, { action: "archive" });
        const nextItems = await refreshWorkspaceSessionsNow();
        showToast(t("workspace.sessionMenu.archived"));
        const activeSessionId = state.workspace.activeSessionId || ((_e = state.detail.session) == null ? void 0 : _e.sessionId) || "";
        if (activeSessionId === normalizedSessionId) {
          const nextSessionId = ((_f = nextItems[0]) == null ? void 0 : _f.sessionId) || "";
          state.workspace.activeSessionId = nextSessionId;
          if (nextSessionId) {
            window.location.hash = buildSessionDetailHash(nextSessionId);
          } else {
            window.location.hash = "#/sessions";
          }
        } else {
          patchWorkspaceSidebar(activeSessionId);
        }
        return;
      }
    } catch (error) {
      showToast(messageOf(error));
      await refreshWorkspaceSessionsForSidebar().catch(() => null);
    }
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
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
      const selectedSessionId = state.workspace.activeSessionId || ((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "";
      const activeSessionSummary = sessions.items.find((item) => item.sessionId === selectedSessionId);
      if (activeSessionSummary && ((_b = state.detail.session) == null ? void 0 : _b.sessionId) === selectedSessionId) {
        const previousOfficialCount = getOfficialQueueCount(state.detail.session);
        const nextOfficialCount = getOfficialQueueCount(activeSessionSummary);
        const detailNeedsRefresh = previousOfficialCount !== nextOfficialCount || hasActiveSessionSummaryChanged(state.detail.session, activeSessionSummary);
        if (detailNeedsRefresh) {
          const wasBusyBeforeRefresh = isSessionLiveBusy(state.detail.session);
          const previousCursor = state.detail.cursor || 0;
          const refreshedSession = await getSession(selectedSessionId).catch(() => null);
          if (refreshedSession && ((_c = state.detail.session) == null ? void 0 : _c.sessionId) === selectedSessionId) {
            state.detail.session = refreshedSession;
            syncDetailPendingApproval(refreshedSession, state.detail.timelineState);
            updateSessionListItem(refreshedSession);
            await catchUpSessionEvents(selectedSessionId, previousCursor, {
              wasBusy: wasBusyBeforeRefresh
            }).catch(() => null);
            void maybeFlushMobileSendQueue("session-summary-refresh");
            scheduleSessionDetailRender();
          } else if (((_d = state.detail.session) == null ? void 0 : _d.sessionId) === selectedSessionId) {
            state.detail.session = __spreadProps(__spreadValues({}, state.detail.session), {
              status: activeSessionSummary.status,
              liveBusy: activeSessionSummary.liveBusy,
              sourceRolloutHasOpenTurn: activeSessionSummary.sourceRolloutHasOpenTurn,
              updatedAt: activeSessionSummary.updatedAt,
              lastEventAt: activeSessionSummary.lastEventAt,
              eventCount: Math.max(
                getSessionActivityCount(state.detail.session),
                getSessionActivityCount(activeSessionSummary)
              ),
              latestPlan: activeSessionSummary.latestPlan || state.detail.session.latestPlan || null,
              hasTaskPlan: Boolean((_e = activeSessionSummary.hasTaskPlan) != null ? _e : state.detail.session.hasTaskPlan),
              lastAssistantContent: (_g = (_f = activeSessionSummary.lastAssistantContent) != null ? _f : state.detail.session.lastAssistantContent) != null ? _g : "",
              lastCommand: (_i = (_h = activeSessionSummary.lastCommand) != null ? _h : state.detail.session.lastCommand) != null ? _i : "",
              officialQueueCount: activeSessionSummary.officialQueueCount,
              officialQueuedFollowupCount: activeSessionSummary.officialQueuedFollowupCount,
              hasOfficialQueue: activeSessionSummary.hasOfficialQueue,
              officialQueuedFollowUpsPreview: activeSessionSummary.officialQueuedFollowUpsPreview
            });
            void maybeFlushMobileSendQueue("session-summary-fallback");
            scheduleSessionDetailRender();
          }
        } else {
          state.detail.session = __spreadProps(__spreadValues({}, state.detail.session), {
            officialQueueCount: activeSessionSummary.officialQueueCount,
            officialQueuedFollowupCount: activeSessionSummary.officialQueuedFollowupCount,
            hasOfficialQueue: activeSessionSummary.hasOfficialQueue,
            officialQueuedFollowUpsPreview: activeSessionSummary.officialQueuedFollowUpsPreview
          });
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
    return activeElement instanceof HTMLTextAreaElement && activeElement.name === "content" && Boolean(activeElement.closest("#session-composer-slot"));
  }
  function closeWorkspaceCreateDialog() {
    state.workspace.createDialog.open = false;
    state.workspace.createDialog.mode = "pick-project";
    state.workspace.createDialog.startMode = "project";
    state.workspace.createDialog.submitting = false;
    state.workspace.createDialog.selectedProjectId = "";
    state.workspace.createDialog.firstMessage = "";
    state.workspace.createDialog.clientCreateId = "";
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
    var _a, _b, _c;
    const projects = Array.isArray(state.sessions.projects) ? state.sessions.projects : [];
    const prefs = readCreateSessionPrefs();
    const preferredProjectId = ((_a = state.detail.session) == null ? void 0 : _a.projectId) && projects.some((project) => project.projectId === state.detail.session.projectId) ? state.detail.session.projectId : ((_b = projects[0]) == null ? void 0 : _b.projectId) || "";
    const preferredProject = projects.find((project) => project.projectId === preferredProjectId) || projects[0] || null;
    const defaultLaunch = getDefaultCreateSessionCodexLaunch();
    state.workspace.createDialog.open = true;
    state.workspace.createDialog.mode = "pick-project";
    state.workspace.createDialog.startMode = normalizeCreateSessionStartMode(prefs.startMode);
    state.workspace.createDialog.submitting = false;
    state.workspace.createDialog.selectedProjectId = preferredProjectId;
    state.workspace.createDialog.firstMessage = "";
    state.workspace.createDialog.clientCreateId = "";
    state.workspace.createDialog.customCwd = prefs.cwd || ((_c = state.detail.session) == null ? void 0 : _c.projectPath) || (preferredProject == null ? void 0 : preferredProject.path) || "";
    state.workspace.createDialog.modelId = prefs.modelId || defaultLaunch.modelId || "";
    state.workspace.createDialog.reasoningId = prefs.reasoningId || defaultLaunch.reasoningId || "";
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
    if (dialogState.submitting) {
      return;
    }
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
    state.workspace.createDialog.clientCreateId = String(state.workspace.createDialog.clientCreateId || "").trim() || createClientMessageId("create");
    patchWorkspaceModalSlot();
    try {
      const payload = {
        message,
        clientCreateId: state.workspace.createDialog.clientCreateId,
        modelId: String(dialogState.modelId || "").trim(),
        reasoningId: String(dialogState.reasoningId || "").trim()
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
        state.detail.autoScroll
      );
    } catch (error) {
      state.workspace.createDialog.submitting = false;
      state.workspace.createDialog.clientCreateId = "";
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
      const project = findExistingProjectByPath(targetPath) || await createProject({
        name: nameValue,
        path: targetPath,
        createMissing: createInSelectedDirectory
      });
      const session = await createSession({ projectId: project.projectId });
      closeWorkspaceCreateDialog();
      window.location.hash = buildSessionDetailHash(
        session.sessionId,
        state.detail.filter,
        state.detail.severity,
        state.detail.search,
        state.detail.autoScroll
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
      state.workspace.createDialog.browserCurrentPath = String((result == null ? void 0 : result.currentPath) || "");
      state.workspace.createDialog.projectPath = String((result == null ? void 0 : result.currentPath) || "");
      state.workspace.createDialog.browserParentPath = String((result == null ? void 0 : result.parentPath) || "");
      state.workspace.createDialog.browserItems = Array.isArray(result == null ? void 0 : result.items) ? result.items : [];
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
    var _a;
    state.workspace.importDialog.open = true;
    state.workspace.importDialog.loading = true;
    state.workspace.importDialog.submitting = false;
    state.workspace.importDialog.query = "";
    state.workspace.importDialog.selectedRolloutPath = "";
    state.workspace.importDialog.error = "";
    patchWorkspaceModalSlot();
    try {
      const importable = await getImportableCodexSessions();
      const items = Array.isArray(importable == null ? void 0 : importable.items) ? importable.items : [];
      state.workspace.importDialog.items = items;
      state.workspace.importDialog.loading = false;
      state.workspace.importDialog.selectedRolloutPath = ((_a = items[0]) == null ? void 0 : _a.rolloutPath) || "";
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
        sessionId = String((result == null ? void 0 : result.sessionId) || "").trim();
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
            state.detail.autoScroll
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
        var _a;
        state.workspace.importDialog.query = event.currentTarget.value;
        const visibleItems = getWorkspaceImportDialogItems();
        if (!visibleItems.some((item) => item.rolloutPath === state.workspace.importDialog.selectedRolloutPath)) {
          state.workspace.importDialog.selectedRolloutPath = ((_a = visibleItems[0]) == null ? void 0 : _a.rolloutPath) || "";
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
        const nextPath = String(state.workspace.createDialog.browserParentPath || "").trim() || "";
        await loadWorkspaceProjectBrowser(nextPath);
      };
    }
    document.querySelectorAll("[data-browse-path]").forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      ;
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
          button.getAttribute("data-create-start-mode")
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
      } catch (e) {
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
        browser ? t("workspace.alerts.enabledToast") : t("workspace.alerts.vibrationOnlyToast")
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
      let longPressTimer = 0;
      let menuOpenedByPress = false;
      const clearLongPressTimer = () => {
        if (longPressTimer) {
          window.clearTimeout(longPressTimer);
          longPressTimer = 0;
        }
      };
      const openMenu = (event) => {
        const sessionId = button.getAttribute("data-open-session") || "";
        if (!sessionId) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        menuOpenedByPress = true;
        openWorkspaceSessionContextMenu(sessionId, event.clientX, event.clientY);
      };
      button.oncontextmenu = openMenu;
      button.onpointerdown = (event) => {
        if (event.pointerType === "mouse" || event.button !== 0) {
          return;
        }
        menuOpenedByPress = false;
        clearLongPressTimer();
        const clientX = event.clientX;
        const clientY = event.clientY;
        longPressTimer = window.setTimeout(() => {
          longPressTimer = 0;
          menuOpenedByPress = true;
          openWorkspaceSessionContextMenu(button.getAttribute("data-open-session") || "", clientX, clientY);
        }, 560);
      };
      button.onpointerup = clearLongPressTimer;
      button.onpointercancel = clearLongPressTimer;
      button.onpointerleave = clearLongPressTimer;
      button.onclick = () => {
        if (menuOpenedByPress) {
          menuOpenedByPress = false;
          return;
        }
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
          state.detail.autoScroll
        );
      };
    });
    document.querySelectorAll("[data-session-menu-action]").forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      element.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = element.getAttribute("data-session-menu-action") || "";
        if (action === "close") {
          closeWorkspaceSessionContextMenu();
          return;
        }
        void handleWorkspaceSessionMenuAction(
          action,
          element.getAttribute("data-session-menu-id") || ""
        );
      };
    });
  }
  function renderWorkspacePage(routeSessionId) {
    const normalizedRouteSessionId = String(routeSessionId || "").trim();
    if (activeWorkspaceRenderPromise && activeWorkspaceRenderSessionId === normalizedRouteSessionId) {
      reportClientDebug(
        "workspace-render-reused",
        { routeSessionId: normalizedRouteSessionId }
      );
      return activeWorkspaceRenderPromise;
    }
    const promise = renderWorkspacePageImpl(normalizedRouteSessionId).finally(() => {
      if (activeWorkspaceRenderSessionId === normalizedRouteSessionId && activeWorkspaceRenderPromise === promise) {
        activeWorkspaceRenderSessionId = "";
        activeWorkspaceRenderPromise = null;
      }
    });
    activeWorkspaceRenderSessionId = normalizedRouteSessionId;
    activeWorkspaceRenderPromise = promise;
    return promise;
  }
  async function renderWorkspacePageImpl(normalizedRouteSessionId) {
    reportClientDebug(
      "workspace-render-start",
      { routeSessionId: normalizedRouteSessionId },
      { force: true }
    );
    if (isMobileWorkspaceViewport()) {
      state.workspace.sidebarCollapsed = true;
    }
    app.innerHTML = renderWorkspaceShell({
      sidebarHtml: renderWorkspaceSidebar(""),
      mainHtml: loadingCard(t("workspace.loading.session"))
    });
    syncWorkspaceShellState();
    bindWorkspaceCreateDialogControls();
    bindWorkspaceImportDialogControls();
    try {
      const [sessions, projects] = await Promise.all([getSessions(), getProjects()]);
      state.sessions.items = sessions.items;
      state.sessions.projects = projects.items;
      reconcileWorkspaceReadMarkers(state.sessions.items);
      const selectedSessionId = resolveWorkspaceSessionId(normalizedRouteSessionId);
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
      reportClientDebug(
        "workspace-session-selected",
        {
          routeSessionId: normalizedRouteSessionId,
          selectedSessionId,
          sessionCount: state.sessions.items.length
        },
        { force: true }
      );
      if (normalizedRouteSessionId !== selectedSessionId) {
        const nextHash = buildSessionDetailHash(
          selectedSessionId,
          state.detail.filter,
          state.detail.severity,
          state.detail.search,
          state.detail.autoScroll
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
      if (!document.querySelector("#session-detail-shell") && state.workspace.activeSessionId === selectedSessionId) {
        reportClientDebug(
          "workspace-detail-missing-retry",
          { selectedSessionId },
          { force: true }
        );
        await renderSessionDetailPage(selectedSessionId);
      }
      patchWorkspaceSidebar(selectedSessionId);
      reportClientDebug(
        "workspace-render-complete",
        {
          routeSessionId: normalizedRouteSessionId,
          selectedSessionId,
          hasDetail: Boolean(document.querySelector("#session-detail-shell"))
        },
        { force: true }
      );
    } catch (error) {
      reportClientDebug(
        "workspace-render-error",
        { routeSessionId: normalizedRouteSessionId, error: serializeClientError(error) },
        { force: true }
      );
      app.innerHTML = renderWorkspaceShell({
        sidebarHtml: renderWorkspaceSidebar(""),
        mainHtml: errorCard(messageOf(error))
      });
      syncWorkspaceShellState();
      bindWorkspaceCreateDialogControls();
      bindWorkspaceImportDialogControls();
      bindWorkspaceSidebarControls("");
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
        const cwd = item.cwd ? ` \xB7 ${item.cwd}` : "";
        const imported = item.importedSessionId ? ` \xB7 ${t("workspace.import.imported")} ${item.importedSessionId}` : "";
        return `${index + 1}. ${title}${cwd}${imported}`;
      })
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
    const items = Array.isArray(importable == null ? void 0 : importable.items) ? importable.items : [];
    if (items.length === 0) {
      showToast(t("workspace.import.noneAvailable"));
      return;
    }
    const selected = promptImportableCodexSession(items);
    if (!selected) {
      return;
    }
    const result = await importCodexSession({
      rolloutPath: selected.rolloutPath
    });
    if (result == null ? void 0 : result.sessionId) {
      window.location.hash = `#/sessions/${result.sessionId}`;
    }
  }
  async function renderSessionDetailPage(sessionId) {
    var _a, _b, _c, _d;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return;
    }
    reportClientDebug(
      "detail-load-start",
      { sessionId: normalizedSessionId },
      { force: true }
    );
    const previousSessionId = String(((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "").trim();
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
    const isStaleDetailLoad = () => state.detail.loadRequestId !== loadRequestId || state.workspace.activeSessionId !== normalizedSessionId;
    let mainSlot = document.querySelector("#workspace-main-slot");
    if (!mainSlot) {
      app.innerHTML = renderWorkspaceShell({
        sidebarHtml: renderWorkspaceSidebar(normalizedSessionId),
        mainHtml: loadingCard(t("workspace.loading.session"))
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
        reportClientDebug(
          "detail-load-stale-after-sync",
          {
            sessionId: normalizedSessionId,
            activeSessionId: state.workspace.activeSessionId,
            loadRequestId,
            currentLoadRequestId: state.detail.loadRequestId
          },
          { force: true }
        );
        return;
      }
      const [session, eventData, uiOptionsResult, hostsResult] = await Promise.all([
        getSession(normalizedSessionId),
        loadInitialSessionEvents(normalizedSessionId),
        getCodexUiOptions().catch(() => null),
        getCodexHosts().catch(() => null)
      ]);
      if (isStaleDetailLoad()) {
        reportClientDebug(
          "detail-load-stale-after-data",
          {
            sessionId: normalizedSessionId,
            activeSessionId: state.workspace.activeSessionId,
            loadRequestId,
            currentLoadRequestId: state.detail.loadRequestId
          },
          { force: true }
        );
        return;
      }
      const uiOptions = uiOptionsResult && Array.isArray(uiOptionsResult.models) && uiOptionsResult.models.length > 0 && Array.isArray(uiOptionsResult.reasoningLevels) && uiOptionsResult.reasoningLevels.length > 0 ? uiOptionsResult : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
      state.detail.session = session;
      replaceDetailTimelineRawEvents(eventData.items);
      markCompletionEventsSeen(eventData.items);
      syncDetailPendingApproval(session, state.detail.timelineState);
      state.detail.cursor = eventData.lastSeq || eventData.nextCursor || eventData.afterCursor || 0;
      state.detail.beforeCursor = eventData.beforeCursor || 0;
      state.detail.session.eventCount = Math.max(
        getSessionActivityCount(state.detail.session),
        Number(state.detail.cursor || 0)
      );
      updateSessionListItem(state.detail.session);
      markWorkspaceSessionSeen(normalizedSessionId, state.detail.cursor);
      state.detail.historyHasMore = Boolean(eventData.hasMoreBefore);
      state.detail.draft = readComposerDraft(normalizedSessionId);
      resetSessionDetailTransientUiState({
        preserveCodexUiOptions: false,
        preserveCodexLaunch: false,
        preserveRemoteHosts: false,
        preserveActiveRemoteHost: false
      });
      state.detail.codexUiOptions = uiOptions;
      state.detail.codexLaunch = normalizeCodexLaunchAgainstUi(
        session.codexLaunch || {},
        uiOptions
      );
      state.detail.remoteHosts = hostsResult && Array.isArray(hostsResult.hosts) ? hostsResult.hosts.filter((item) => typeof item === "string" && item.trim()) : [];
      if (!state.detail.remoteHosts.length) {
        const currentHost = getCurrentPageHost();
        if (currentHost) {
          state.detail.remoteHosts = [currentHost];
        }
      }
      state.detail.activeRemoteHost = hostsResult && typeof hostsResult.activeHost === "string" && hostsResult.activeHost.trim() ? hostsResult.activeHost.trim() : state.detail.remoteHosts[0] || getCurrentPageHost();
      state.detail.codexQuota = readCachedCodexQuota(normalizedSessionId);
      state.detail.codexStatus = null;
      state.detail.completionNoticeArmed = isSessionLiveBusy(session);
      state.detail.detailSyncing = false;
      state.detail.detailSyncError = "";
      state.socketState = "connecting";
      const detailQuery = parseHashRoute(window.location.hash || "").query || "";
      const followParam = new URLSearchParams(detailQuery).get("follow");
      if (followParam !== "0" && followParam !== "false") {
        state.detail.autoScroll = true;
      }
      reportClientDebug(
        "detail-load-data-ready",
        {
          sessionId: normalizedSessionId,
          rawEventCount: ((_c = (_b = state.detail.timelineState) == null ? void 0 : _b.rawEvents) == null ? void 0 : _c.length) || 0
        },
        { force: true }
      );
      renderSessionDetail();
      reportClientDebug(
        "detail-rendered",
        {
          sessionId: normalizedSessionId,
          hasDetail: Boolean(document.querySelector("#session-detail-shell")),
          hasTranscript: Boolean(document.querySelector("#session-transcript-slot"))
        },
        { force: true }
      );
      void maybeFlushMobileSendQueue("detail-load");
      if (isStaleDetailLoad()) {
        reportClientDebug(
          "detail-load-stale-after-render",
          {
            sessionId: normalizedSessionId,
            activeSessionId: state.workspace.activeSessionId,
            loadRequestId,
            currentLoadRequestId: state.detail.loadRequestId
          },
          { force: true }
        );
        return;
      }
      void getCodexStatus({
        sessionId: normalizedSessionId,
        threadId: session.codexThreadId || "",
        cwd: session.projectPath || ""
      }).then((codexStatus) => {
        if (isStaleDetailLoad()) {
          return;
        }
        state.detail.codexStatus = codexStatus;
        scheduleSessionDetailRender({ immediate: true });
        reportClientDebug(
          "detail-status-loaded",
          { sessionId: normalizedSessionId },
          { force: true }
        );
      }).catch((error) => {
        if (isStaleDetailLoad()) {
          return;
        }
        reportClientDebug(
          "detail-status-error",
          { sessionId: normalizedSessionId, error: serializeClientError(error) },
          { force: true }
        );
      });
      attachSessionSocket(normalizedSessionId);
      void catchUpSessionEvents(normalizedSessionId, state.detail.cursor).then(() => {
        if (!isStaleDetailLoad()) {
          scheduleSessionDetailRender();
        }
      }).catch(() => null);
      scheduleImportedSessionSync(normalizedSessionId);
    } catch (error) {
      if (isStaleDetailLoad()) {
        reportClientDebug(
          "detail-load-error-stale",
          {
            sessionId: normalizedSessionId,
            activeSessionId: state.workspace.activeSessionId,
            loadRequestId,
            currentLoadRequestId: state.detail.loadRequestId,
            error: serializeClientError(error)
          },
          { force: true }
        );
        return;
      }
      reportClientDebug(
        "detail-load-error",
        { sessionId: normalizedSessionId, error: serializeClientError(error) },
        { force: true }
      );
      if (hydratedFromCache && ((_d = state.detail.session) == null ? void 0 : _d.sessionId) === normalizedSessionId) {
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
          mainHtml: errorCard(messageOf(error))
        });
        syncWorkspaceShellState();
        bindWorkspaceCreateDialogControls();
        bindWorkspaceImportDialogControls();
        bindWorkspaceSidebarControls(normalizedSessionId);
      }
    }
  }
  function renderSessionDetail() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    const session = state.detail.session;
    if (!session) {
      const mainSlot = document.querySelector("#workspace-main-slot");
      if (mainSlot) {
        mainSlot.innerHTML = errorCard("Session not found.");
      } else {
        app.innerHTML = renderWorkspaceShell({
          sidebarHtml: renderWorkspaceSidebar(""),
          mainHtml: errorCard("Session not found.")
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
    const threadInfo = ((_a = state.detail.codexStatus) == null ? void 0 : _a.thread) || session.thread || session || null;
    const activeTurn = getActiveTimelineTurn(session) || getOptimisticActiveTurn(session);
    const runSummary = deriveThreadRunSummary(session, activeTurn);
    const displayTimelineItems = getDisplayTimelineItems();
    state.detail.activeTaskStartedAt = getTurnStartedAtUnixSeconds(activeTurn);
    if (!state.detail.codexLaunch) {
      state.detail.codexLaunch = normalizeCodexLaunchAgainstUi(
        session.codexLaunch || {},
        state.detail.codexUiOptions
      );
    }
    if (!state.detail.codexUiOptions) {
      state.detail.codexUiOptions = CLIENT_FALLBACK_CODEX_UI_OPTIONS;
    }
    const activeElapsedValue = activeTurn ? formatElapsedSinceUnixSeconds(state.detail.activeTaskStartedAt) : "";
    const topBarHtml = renderSessionTopBar({
      title: session.title || t("workspace.session.untitled"),
      statusCode: getSessionDisplayStatus(session),
      statusLabel: runSummary.busy || runSummary.code === "failed" ? runSummary.label : sessionStatusLabel(getSessionDisplayStatus(session)),
      statusClass: statusClass(getSessionDisplayStatus(session)),
      activityBadges: [...getSessionActivityBadges(session, activeTurn), ...getRunSummaryBadges(runSummary)],
      host: state.detail.activeRemoteHost || t("session.host.unsynced"),
      model: getSelectedModelLabel(
        state.detail.codexUiOptions,
        state.detail.codexLaunch,
        threadInfo
      ),
      reasoning: getSelectedReasoningLabel(
        state.detail.codexUiOptions,
        state.detail.codexLaunch,
        threadInfo
      ),
      sessionElapsedLabel: t("session.elapsed", { value: formatElapsedSinceIso(session.createdAt) }),
      activeElapsedLabel: activeElapsedValue,
      inspectOpen: state.detail.inspectDrawerOpen,
      showInspectAction: false,
      showCompletionOptionsAction: true,
      completionOptionsOpen: state.detail.completionActionSettingsOpen,
      backHref: ""
    });
    const showUnseenBanner = shouldShowJumpToBottomButton();
    const taskPlanHtml = renderThreadTaskPlanPanel(getVisibleThreadTaskPlan());
    const transcriptOptions = {
      session,
      socketState: state.socketState,
      activeElapsedLabel: activeElapsedValue,
      activeMessageCopyKey: String(((_b = state.detail.messageContextMenu) == null ? void 0 : _b.anchorKey) || "").trim()
    };
    const transcriptHtml = `
    ${showUnseenBanner ? `
        <button id="event-unseen-banner" type="button" class="event-unseen-banner" aria-label="${escapeHtml4(t("timeline.jumpToBottom"))}">
          \u2193
        </button>
      ` : ""}
    <div id="thread-task-plan-slot">${taskPlanHtml}</div>
    ${renderTimeline(displayTimelineItems, transcriptOptions)}
  `;
    const detailSyncing = Boolean(state.detail.detailSyncing);
    const approvalBarHtml = detailSyncing ? "" : renderPendingApprovalBar(state.detail);
    const liveStatusHtml = state.detail.detailSyncError ? `<div class="completion-actions-status">${escapeHtml4(t("workspace.loading.sessionSyncFailed"))}</div>` : "";
    const completionOptionsHtml = renderCompletionOptionsPanel();
    const completionNoticeHtml = detailSyncing ? "" : renderCompletionNotice();
    const speechControlHtml = renderCompletionSpeechControl();
    const messageContextMenuHtml = renderMessageContextMenu();
    const queuePanelHtml = detailSyncing ? "" : renderSessionQueuePanel(session);
    state.detail.mobileQueueStatusText = detailSyncing ? "" : isMobileWorkspaceViewport() || getMobileQueuedMessages(session.sessionId).length > 0 || hasOfficialQueuedMessages(session) ? getMobileQueueStatusText(session.sessionId) : "";
    state.detail.composerPlaceholderHint = detailSyncing ? t("composer.syncingHint") : getComposerPlaceholderHint(session, {
      queuedStatus: state.detail.mobileQueueStatusText,
      currentBusy: isSessionLiveBusy(session)
    });
    const composerInputHtml = renderComposerInput({
      session,
      detailState: state.detail,
      uiOptions: state.detail.codexUiOptions
    });
    const workspaceMainSlot = document.querySelector("#workspace-main-slot");
    const shell = document.querySelector("#session-detail-shell");
    const shellMounted = (shell == null ? void 0 : shell.dataset.sessionId) === session.sessionId;
    if (!shellMounted) {
      const shellHtml = `
      <div id="session-detail-shell" class="session-detail-layout workspace-session-detail-layout" data-session-id="${escapeHtml4(session.sessionId)}">
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
          mainHtml: shellHtml
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
      (_c = document.querySelector("#session-detail-shell")) == null ? void 0 : _c.insertAdjacentHTML(
        "beforeend",
        `<div id="completion-speech-control-slot"></div>`
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
    if (completionOptionsSlot && (!shellMounted || state.detail.lastCompletionOptionsHtml !== completionOptionsHtml)) {
      completionOptionsSlot.innerHTML = completionOptionsHtml;
      state.detail.lastCompletionOptionsHtml = completionOptionsHtml;
    }
    if (speechControlSlot && (!shellMounted || state.detail.lastSpeechControlHtml !== speechControlHtml)) {
      speechControlSlot.innerHTML = speechControlHtml;
      state.detail.lastSpeechControlHtml = speechControlHtml;
    }
    if (messageContextMenuSlot && (!shellMounted || state.detail.lastMessageContextMenuHtml !== messageContextMenuHtml)) {
      messageContextMenuSlot.innerHTML = messageContextMenuHtml;
      state.detail.lastMessageContextMenuHtml = messageContextMenuHtml;
    }
    if (transcriptSlot) {
      const existingBanner = transcriptSlot.querySelector("#event-unseen-banner");
      if (showUnseenBanner) {
        const bannerHtml = "\u2193";
        if (existingBanner) {
          existingBanner.textContent = bannerHtml;
        } else {
          transcriptSlot.insertAdjacentHTML(
            "afterbegin",
            `<button id="event-unseen-banner" type="button" class="event-unseen-banner" aria-label="${escapeHtml4(t("timeline.jumpToBottom"))}">${bannerHtml}</button>`
          );
        }
      } else {
        existingBanner == null ? void 0 : existingBanner.remove();
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
    if (liveStatusSlot && (!shellMounted || state.detail.lastLiveStatusHtml !== liveStatusHtml || liveStatusSlot.innerHTML !== liveStatusHtml)) {
      liveStatusSlot.innerHTML = liveStatusHtml;
      state.detail.lastLiveStatusHtml = liveStatusHtml;
    }
    if (completionNoticeSlot && (!shellMounted || state.detail.lastCompletionNoticeHtml !== completionNoticeHtml)) {
      completionNoticeSlot.innerHTML = completionNoticeHtml;
      state.detail.lastCompletionNoticeHtml = completionNoticeHtml;
    }
    if (queueSlot && (!shellMounted || state.detail.lastQueuePanelHtml !== queuePanelHtml)) {
      queueSlot.innerHTML = queuePanelHtml;
      state.detail.lastQueuePanelHtml = queuePanelHtml;
    }
    const composerFocused = isComposerTextareaFocused();
    if (composerSlot && (!shellMounted || state.detail.lastComposerHtml !== composerInputHtml) && (!shellMounted || !composerFocused || state.detail.forceComposerRender)) {
      composerSlot.innerHTML = composerInputHtml;
      state.detail.lastComposerHtml = composerInputHtml;
      state.detail.forceComposerRender = false;
    }
    const composerTextarea = document.querySelector('textarea[name="content"]');
    const messageFormEl = document.querySelector("#message-form");
    const composerActionFab = document.querySelector("#composer-action");
    const composerSteerFab = document.querySelector("#composer-steer-action");
    const composerStopFab = document.querySelector("#composer-stop-action");
    const composerAttachFab = document.querySelector("#composer-attach-action");
    const composerAttachmentInput = document.querySelector("#composer-attachment-input");
    const composerSendStatus = document.querySelector("#composer-send-status");
    function syncComposerActionState() {
      if (!composerActionFab || !composerTextarea) {
        return;
      }
      const detailSyncing2 = Boolean(state.detail.detailSyncing);
      const currentBusy = isSessionLiveBusy(state.detail.session);
      const hasAttachments = (state.detail.composerAttachments || []).length > 0;
      const attachmentStatusText = getComposerAttachmentStatusText();
      if (detailSyncing2) {
        composerActionFab.disabled = true;
        composerActionFab.setAttribute("aria-label", t("workspace.loading.sessionSyncing"));
        composerActionFab.setAttribute("title", t("workspace.loading.sessionSyncing"));
      } else if (state.detail.composerSending) {
        composerActionFab.disabled = true;
        composerActionFab.setAttribute("aria-label", t("composer.aria.sending"));
        composerActionFab.setAttribute("title", t("composer.sending"));
      } else {
        composerActionFab.disabled = state.detail.composerUploadingAttachments || !composerTextarea.value.trim() && !hasAttachments;
        composerActionFab.setAttribute("aria-label", currentBusy ? t("composer.aria.queue") : t("composer.aria.send"));
        composerActionFab.setAttribute("title", currentBusy ? t("composer.aria.queue") : t("composer.aria.send"));
      }
      if (composerSteerFab instanceof HTMLButtonElement) {
        composerSteerFab.disabled = detailSyncing2 || state.detail.composerSending || state.detail.composerUploadingAttachments || !currentBusy || !composerTextarea.value.trim() && !hasAttachments;
      }
      if (composerStopFab instanceof HTMLButtonElement) {
        composerStopFab.disabled = detailSyncing2 || state.detail.composerSending || state.detail.composerStopping || !currentBusy;
        composerStopFab.classList.toggle("composer-stop-fab--pending", Boolean(state.detail.composerStopping));
        composerStopFab.setAttribute(
          "title",
          detailSyncing2 ? t("workspace.loading.sessionSyncing") : state.detail.composerStopping ? t("composer.stopping") : t("composer.aria.stop")
        );
        composerStopFab.setAttribute(
          "aria-label",
          detailSyncing2 ? t("workspace.loading.sessionSyncing") : state.detail.composerStopping ? t("composer.aria.stopping") : t("composer.aria.stop")
        );
      }
      if (composerAttachFab instanceof HTMLButtonElement) {
        composerAttachFab.disabled = detailSyncing2 || state.detail.composerSending || state.detail.composerUploadingAttachments;
      }
      if (composerSendStatus instanceof HTMLElement) {
        const queuedStatus = getMobileQueueStatusText(session.sessionId);
        state.detail.mobileQueueStatusText = queuedStatus;
        const placeholderHint = detailSyncing2 ? t("composer.syncingHint") : getComposerPlaceholderHint(session, {
          attachmentStatusText,
          queuedStatus,
          currentBusy
        });
        state.detail.composerPlaceholderHint = placeholderHint;
        composerTextarea.placeholder = placeholderHint || t("composer.placeholder");
        composerTextarea.classList.toggle(
          "input-area--status-placeholder",
          Boolean(placeholderHint && !composerTextarea.value.trim())
        );
        const statusText = state.detail.composerSendError ? t("composer.sendFailed") : hasFailedComposerAttachment() ? t("composer.attachments.failed") : "";
        composerSendStatus.textContent = statusText;
        composerSendStatus.classList.toggle("composer-send-status-visible", Boolean(statusText));
        composerSendStatus.classList.toggle(
          "composer-send-status-error",
          Boolean(state.detail.composerSendError || hasFailedComposerAttachment())
        );
        composerSendStatus.classList.toggle(
          "composer-send-status-waiting",
          false
        );
      }
    }
    async function sendComposerMessage() {
      var _a2, _b2, _c2, _d2, _e2;
      if (state.detail.detailSyncing) {
        showToast(t("workspace.loading.sessionSyncing"));
        return;
      }
      if (state.detail.composerSending) {
        return;
      }
      const content = String((composerTextarea == null ? void 0 : composerTextarea.value) || "").trim();
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
        state.detail.codexUiOptions
      );
      const payload = ensurePayloadClientMessageId(__spreadValues(__spreadValues({
        content
      }, codex ? { codex } : {}), attachmentPayloads.length ? { attachments: attachmentPayloads } : {}), "composer");
      const sendGuardKey = buildComposerSendGuardKey(session.sessionId, content, attachmentPayloads);
      if (!acquireComposerSendGuard(sendGuardKey)) {
        return;
      }
      const busyBeforeRefresh = isSessionLiveBusy(state.detail.session);
      const busyAfterRefresh = await refreshSessionBeforeSend();
      const shouldQueueAfterRefresh = Boolean(busyAfterRefresh && !state.detail.mobileQueueSending);
      reportClientDebug(
        "composer-submit-route",
        {
          sessionId: session.sessionId,
          busyBeforeRefresh,
          busyAfterRefresh,
          detailSyncing: Boolean(state.detail.detailSyncing),
          composerSending: Boolean(state.detail.composerSending),
          mobileQueueSending: Boolean(state.detail.mobileQueueSending),
          route: shouldQueueAfterRefresh ? "queue" : "messages"
        },
        { force: true }
      );
      if (shouldQueueAfterRefresh) {
        const queued = await queueOfficialComposerMessage(session.sessionId, content, payload);
        if (queued && composerTextarea) {
          composerTextarea.value = "";
          adjustComposerHeight(composerTextarea);
        }
        syncComposerActionState();
        releaseComposerSendGuard(sendGuardKey);
        return;
      }
      const optimisticText = content || attachmentPayloads.map((item) => item.name || item.path || "attachment").join(", ");
      const optimisticTimestamp = (/* @__PURE__ */ new Date()).toISOString();
      const optimisticSend = {
        sessionId: session.sessionId,
        tempTurnId: `optimistic-turn:${Date.now()}`,
        userItemId: `optimistic-user:${Date.now()}`,
        thinkingItemId: `optimistic-thinking:${Date.now()}`,
        text: optimisticText,
        createdAt: optimisticTimestamp,
        confirmed: false,
        turnId: null,
        previousStatus: ((_a2 = state.detail.session) == null ? void 0 : _a2.status) || "waiting_input",
        previousLiveBusy: Boolean((_b2 = state.detail.session) == null ? void 0 : _b2.liveBusy),
        previousUpdatedAt: ((_c2 = state.detail.session) == null ? void 0 : _c2.updatedAt) || "",
        previousTitle: ((_d2 = state.detail.session) == null ? void 0 : _d2.title) || "",
        titleWasUpdated: false
      };
      try {
        const prefs = getCompletionActionPrefsForSession(session.sessionId);
        resetCompletionAutoContinueSequence(session.sessionId, prefs.autoContinue ? prefs.autoContinueMaxRuns : 0);
        if (state.detail.session && shouldAutotitleSession(state.detail.session)) {
          const nextTitle = deriveSessionTitleFromMessage(optimisticText);
          state.detail.session.title = nextTitle;
          state.sessions.items = state.sessions.items.map(
            (item) => item.sessionId === session.sessionId ? __spreadProps(__spreadValues({}, item), { title: nextTitle }) : item
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
              } catch (e) {
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
        if (((_e2 = state.detail.optimisticSend) == null ? void 0 : _e2.userItemId) === optimisticSend.userItemId) {
          state.detail.optimisticSend = __spreadProps(__spreadValues({}, state.detail.optimisticSend), {
            confirmed: true,
            turnId: result.turnId || state.detail.optimisticSend.turnId
          });
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
          restoreTitle: true
        });
        syncComposerActionState();
        scheduleSessionDetailRender();
        void resumeActiveSessionDetail("send-error");
        showToast(errorMessage);
      } finally {
        releaseComposerSendGuard(sendGuardKey);
      }
    }
    async function refreshSessionBeforeSend() {
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
    if (composerSteerFab) {
      composerSteerFab.onclick = async () => {
        if (state.detail.detailSyncing || state.detail.composerSending) {
          return;
        }
        const content = String((composerTextarea == null ? void 0 : composerTextarea.value) || "").trim();
        const attachmentPayloads = getComposerAttachmentPayloads();
        if (!content && attachmentPayloads.length <= 0) {
          return;
        }
        if (!isSessionLiveBusy(state.detail.session)) {
          showToast(t("composer.steerNeedsBusy"));
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
          state.detail.codexUiOptions
        );
        const payload = ensurePayloadClientMessageId(__spreadValues(__spreadValues({
          content
        }, codex ? { codex } : {}), attachmentPayloads.length ? { attachments: attachmentPayloads } : {}), "steer");
        const sent = await steerComposerMessage(session.sessionId, content, payload);
        if (sent && composerTextarea) {
          composerTextarea.value = "";
          adjustComposerHeight(composerTextarea);
        }
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
    document.querySelectorAll("[data-mobile-queue-item], [data-official-queue-item]").forEach((itemEl) => {
      const toggleMenu = () => {
        document.querySelectorAll(".session-queue-item-menu-open").forEach((openItem) => {
          if (openItem !== itemEl) {
            openItem.classList.remove("session-queue-item-menu-open");
          }
        });
        itemEl.classList.toggle("session-queue-item-menu-open");
      };
      itemEl.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.closest("[data-mobile-queue-action], [data-official-queue-action]")) {
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
    document.querySelectorAll("[data-official-queue-action]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const itemId = button.getAttribute("data-official-queue-id") || "";
        const action = button.getAttribute("data-official-queue-action") || "";
        const queuedItem = getOfficialQueuedMessages(session).find((item) => String((item == null ? void 0 : item.id) || "") === itemId);
        if (!queuedItem || state.detail.composerSending) {
          return;
        }
        try {
          let result = null;
          if (action === "edit") {
            const nextContent = window.prompt(t("queue.editPrompt"), queuedItem.text || "");
            if (nextContent === null) {
              return;
            }
            result = await updateQueuedMessage(session.sessionId, itemId, { content: nextContent });
            showToast(t("queue.edited"));
          } else if (action === "remove") {
            result = await deleteQueuedMessage(session.sessionId, itemId);
            showToast(t("queue.removed"));
          } else if (action === "front") {
            result = await updateQueuedMessage(session.sessionId, itemId, { action: "front" });
            showToast(t("queue.movedToFront"));
          }
          if (result) {
            applyOfficialQueueResult(result, session);
            scheduleSessionDetailRender();
          }
        } catch (error) {
          showToast(messageOf(error));
          void refreshOfficialQueueForSession(session.sessionId).catch(() => null);
        }
      });
    });
    document.querySelectorAll("[data-mobile-queue-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const itemId = button.getAttribute("data-mobile-queue-id") || "";
        const action = button.getAttribute("data-mobile-queue-action") || "";
        const queuedItem = getMobileQueuedMessages(session.sessionId).find((item) => String((item == null ? void 0 : item.id) || "") === itemId);
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
        var _a2, _b2;
        if (state.detail.composerStopping) {
          return;
        }
        if (!window.confirm(t("composer.stopConfirm"))) {
          return;
        }
        const stillBusy = await refreshSessionBeforeSend();
        if (stillBusy) {
          state.detail.composerStopping = true;
          syncComposerActionState();
          scheduleSessionDetailRender();
          try {
            const stoppedSession = await stopSession(session.sessionId);
            if (stoppedSession && ((_a2 = state.detail.session) == null ? void 0 : _a2.sessionId) === session.sessionId) {
              state.detail.session = stoppedSession;
              updateSessionListItem(stoppedSession);
            } else if (((_b2 = state.detail.session) == null ? void 0 : _b2.sessionId) === session.sessionId) {
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
              (stoppedSession == null ? void 0 : stoppedSession.stopStatus) === "official_interrupted" ? t("composer.stopRequested") : t("composer.clearBusyDone")
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
      onRender: renderSessionDetail
    });
    bindCompletionActionControls();
    document.querySelectorAll('[data-codex-pref="modelId"], [data-codex-pref="reasoningId"]').forEach((el) => {
      const previousOnChange = el.onchange;
      el.onchange = (event) => {
        previousOnChange == null ? void 0 : previousOnChange.call(el, event);
        renderSessionDetail();
      };
    });
    (_d = document.querySelector("#event-search")) == null ? void 0 : _d.addEventListener("input", (event) => {
      var _a2;
      const searchInput = event.currentTarget;
      const nextSearch = searchInput.value;
      const caret = (_a2 = searchInput.selectionStart) != null ? _a2 : nextSearch.length;
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
    (_e = document.querySelector("#event-search")) == null ? void 0 : _e.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      stepSearchMatch(event.shiftKey ? -1 : 1);
    });
    (_f = document.querySelector("#clear-event-search")) == null ? void 0 : _f.addEventListener("click", () => {
      state.detail.search = "";
      state.detail.searchMatchIndex = 0;
      state.detail.activeSearchResultKey = "";
      renderSessionDetail();
    });
    (_g = document.querySelector("#search-hit-prev")) == null ? void 0 : _g.addEventListener("click", () => {
      stepSearchMatch(-1);
    });
    (_h = document.querySelector("#search-hit-next")) == null ? void 0 : _h.addEventListener("click", () => {
      stepSearchMatch(1);
    });
    (_i = document.querySelector("#toggle-auto-scroll")) == null ? void 0 : _i.addEventListener("click", () => {
      state.detail.autoScroll = !state.detail.autoScroll;
      if (state.detail.autoScroll) {
        state.detail.unseenCount = 0;
      }
      renderSessionDetail();
    });
    (_j = document.querySelector("#resume-auto-scroll")) == null ? void 0 : _j.addEventListener("click", () => {
      resumeAutoScrollToBottom();
    });
    (_k = document.querySelector("#event-unseen-banner")) == null ? void 0 : _k.addEventListener("click", () => {
      resumeAutoScrollToBottom();
    });
    (_l = document.querySelector("#refresh-events")) == null ? void 0 : _l.addEventListener("click", async () => {
      try {
        const payload = await getSessionEvents(session.sessionId, {
          after: state.detail.cursor,
          limit: 200
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
        var _a;
        const eventSessionId = String((event == null ? void 0 : event.sessionId) || (event == null ? void 0 : event.session_id) || "").trim();
        if (state.ws !== socket || !isActiveDetailSession(normalizedSessionId) || eventSessionId && eventSessionId !== normalizedSessionId) {
          return;
        }
        const wasBusyBeforeEvent = isSessionLiveBusy(state.detail.session);
        if (state.detail.session) {
          const payloadType = String(((_a = event == null ? void 0 : event.payload) == null ? void 0 : _a.type) || "");
          state.detail.session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
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
          } else if (event.type === "system.notice" && event.content && event.content.startsWith("Codex thread started: ")) {
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
      }
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
        cwd: state.detail.session.projectPath || ""
      });
      if (state.detail.session && state.detail.session.sessionId === sessionId) {
        state.detail.codexStatus = status;
        scheduleSessionDetailRender();
      }
    } catch (e) {
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
  function getSelectedModelLabel(uiOptions, launch, threadInfo) {
    var _a;
    const opts = uiOptions && Array.isArray(uiOptions.models) && uiOptions.models.length > 0 ? uiOptions : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
    return (threadInfo == null ? void 0 : threadInfo.model) || ((_a = opts.models.find((item) => item.id === (launch == null ? void 0 : launch.modelId))) == null ? void 0 : _a.label) || t("session.model.unsynced");
  }
  function getSelectedReasoningLabel(uiOptions, launch, threadInfo) {
    const opts = uiOptions && Array.isArray(uiOptions.reasoningLevels) && uiOptions.reasoningLevels.length > 0 ? uiOptions : CLIENT_FALLBACK_CODEX_UI_OPTIONS;
    return ((threadInfo == null ? void 0 : threadInfo.reasoningEffort) ? formatReasoningEffortLabel(threadInfo.reasoningEffort) : "") || (() => {
      const selected = opts.reasoningLevels.find((item) => item.id === (launch == null ? void 0 : launch.reasoningId));
      return selected ? formatReasoningEffortLabel(selected.id || selected.label) : "";
    })() || t("session.reasoning.unsynced");
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
  function formatRuntimeValue(value, fallback = t("generic.notSynced")) {
    const text = typeof value === "string" ? value.trim() : "";
    return text || fallback;
  }
  function localizeApprovalTitle2(title) {
    const normalized = String(title || "").trim();
    if (!normalized) {
      return t("approval.required");
    }
    if (normalized === "\u547D\u4EE4\u6267\u884C\u9700\u8981\u6388\u6743" || normalized === "Command execution requires approval") {
      return t("approval.commandRequired");
    }
    if (normalized === "\u6587\u4EF6\u4FEE\u6539\u9700\u8981\u6388\u6743" || normalized === "File changes require approval") {
      return t("approval.fileChangeRequired");
    }
    if (normalized === "\u989D\u5916\u6743\u9650\u9700\u8981\u6388\u6743" || normalized === "Extra permissions require approval") {
      return t("approval.extraPermissionRequired");
    }
    if (normalized === "\u64CD\u4F5C\u9700\u8981\u6388\u6743" || normalized === "Approval required" || normalized === "Approval required for operation") {
      return t("approval.required");
    }
    return normalized;
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
  function formatDurationSeconds(durationSeconds) {
    const totalMs = Math.max(0, Math.round(Number(durationSeconds || 0) * 1e3));
    if (totalMs < 1e3) {
      return `${totalMs}ms`;
    }
    const totalSeconds = totalMs / 1e3;
    if (totalSeconds < 60) {
      return `${totalSeconds.toFixed(totalSeconds >= 10 ? 0 : 1)}s`;
    }
    const roundedSeconds = Math.round(totalSeconds);
    if (roundedSeconds >= 3600) {
      const hours = Math.floor(roundedSeconds / 3600);
      const minutes2 = Math.floor(roundedSeconds % 3600 / 60);
      return `${hours}h ${minutes2}m`;
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
    return formatDurationSeconds(Math.max(0, (Date.now() - ts) / 1e3));
  }
  function formatElapsedSinceUnixSeconds(unixSeconds) {
    const safeSeconds = Number(unixSeconds || 0);
    if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) {
      return "--";
    }
    return formatDurationSeconds(Math.max(0, Date.now() / 1e3 - safeSeconds));
  }
  function getSessionSortOptions() {
    return [
      { value: "activity_desc", label: t("sessions.sort.activity_desc") },
      { value: "created_desc", label: t("sessions.sort.created_desc") },
      { value: "events_desc", label: t("sessions.sort.events_desc") },
      { value: "reply_desc", label: t("sessions.sort.reply_desc") }
    ];
  }
  function parseHashRoute(hash) {
    const normalized = hash || "#/sessions";
    const [path, query = ""] = normalized.split("?");
    return {
      path,
      query
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
    const diffSec = Math.max(0, Math.floor(resetAt - Date.now() / 1e3));
    const hours = Math.floor(diffSec / 3600);
    const minutes = Math.floor(diffSec % 3600 / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  function formatQuotaResetDate(input) {
    const resetAt = readQuotaNumber(input);
    if (resetAt == null) {
      return null;
    }
    const date = new Date(resetAt * 1e3);
    return new Intl.DateTimeFormat(getIntlLocale(), {
      month: "numeric",
      day: "numeric"
    }).format(date);
  }
  function normalizeCodexQuotaPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    if (payload.quota && typeof payload.quota === "object" && payload.quota.hour && payload.quota.week) {
      return payload;
    }
    const rateLimits = payload.rateLimits && typeof payload.rateLimits === "object" ? payload.rateLimits : {};
    const primary = rateLimits.primary && typeof rateLimits.primary === "object" ? rateLimits.primary : {};
    const secondary = rateLimits.secondary && typeof rateLimits.secondary === "object" ? rateLimits.secondary : {};
    if (!Object.keys(primary).length && !Object.keys(secondary).length) {
      return null;
    }
    return {
      quota: {
        hour: {
          percent: toQuotaRemainingPercent(primary.used_percent),
          remainTime: formatQuotaRemainTime(primary.resets_at)
        },
        week: {
          percent: toQuotaRemainingPercent(secondary.used_percent),
          resetDate: formatQuotaResetDate(secondary.resets_at)
        }
      }
    };
  }
  function hasVisibleCodexQuota(payload) {
    var _a, _b, _c, _d;
    const quota = payload == null ? void 0 : payload.quota;
    if (!quota || typeof quota !== "object") {
      return false;
    }
    return quotaValuePresent((_a = quota == null ? void 0 : quota.hour) == null ? void 0 : _a.percent) || quotaValuePresent((_b = quota == null ? void 0 : quota.hour) == null ? void 0 : _b.remainTime) || quotaValuePresent((_c = quota == null ? void 0 : quota.week) == null ? void 0 : _c.percent) || quotaValuePresent((_d = quota == null ? void 0 : quota.week) == null ? void 0 : _d.resetDate);
  }
  function quotaValuePresent(input) {
    if (typeof input === "number" && Number.isFinite(input)) {
      return true;
    }
    return typeof input === "string" && input.trim().length > 0;
  }
  function readCachedCodexQuota(sessionId) {
    var _a;
    const key = getCodexQuotaCacheKey(sessionId);
    if (!sessionId) {
      return null;
    }
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(key);
      const normalized = raw ? normalizeCodexQuotaPayload(JSON.parse(raw)) : null;
      return normalized && hasVisibleCodexQuota(normalized) ? normalized : null;
    } catch (e) {
      return null;
    }
  }
  function writeCachedCodexQuota(sessionId, payload) {
    var _a;
    const normalized = normalizeCodexQuotaPayload(payload);
    if (!sessionId || !normalized || !hasVisibleCodexQuota(normalized)) {
      return;
    }
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(getCodexQuotaCacheKey(sessionId), JSON.stringify(normalized));
    } catch (e) {
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
  function hydrateSessionDetailViewState(query) {
    const nextView = loadSessionDetailViewState(query);
    state.detail = __spreadValues(__spreadValues({}, state.detail), nextView);
  }
  function hydrateSessionsViewState(query) {
    const nextView = loadSessionsViewState(query);
    state.sessions = __spreadValues(__spreadValues({}, state.sessions), nextView);
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
    return __spreadValues({}, DEFAULT_SESSIONS_VIEW);
  }
  function loadSessionDetailViewState(query) {
    const detailState = query ? parseSessionDetailViewQuery(query) : null;
    if (detailState) {
      return normalizeSessionDetailViewState(detailState);
    }
    return __spreadValues({}, DEFAULT_DETAIL_VIEW);
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
      page: params.get("page") || DEFAULT_SESSIONS_VIEW.page
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
      autoScroll: params.get("follow") || "1"
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
      pageSize: DEFAULT_SESSIONS_VIEW.pageSize
    };
  }
  function normalizeSessionDetailViewState(input) {
    return {
      filter: isAllowedDetailFilter(input.filter) ? input.filter : DEFAULT_DETAIL_VIEW.filter,
      severity: isAllowedDetailSeverity(input.severity) ? input.severity : DEFAULT_DETAIL_VIEW.severity,
      search: String(input.search || ""),
      autoScroll: normalizeAutoScroll(input.autoScroll),
      rawStdoutBuckets: input.rawStdoutBuckets && typeof input.rawStdoutBuckets === "object" ? input.rawStdoutBuckets : {}
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
      "failed"
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
  function persistSessionDetailViewState(sessionId) {
    syncSessionDetailHash(
      sessionId,
      state.detail.filter,
      state.detail.severity,
      state.detail.search,
      state.detail.autoScroll
    );
  }
  function readSessionsViewStateFromStorage() {
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(SESSION_VIEW_STORAGE_KEY);
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
    var _a;
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(SESSION_DETAIL_CACHE_INDEX_STORAGE_KEY);
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
    var _a;
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(SESSION_DETAIL_CACHE_INDEX_STORAGE_KEY, JSON.stringify(index));
    } catch (_error) {
    }
  }
  function pruneSessionDetailCaches(index, preservedSessionId = "") {
    const entries = Object.entries(index).filter(([sessionId]) => sessionId).sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0));
    if (entries.length <= SESSION_DETAIL_CACHE_MAX_SESSIONS) {
      return index;
    }
    const nextIndex = {};
    entries.forEach(([sessionId, savedAt], indexPosition) => {
      var _a;
      if (indexPosition < SESSION_DETAIL_CACHE_MAX_SESSIONS || sessionId === preservedSessionId) {
        nextIndex[sessionId] = savedAt;
        return;
      }
      try {
        (_a = window.localStorage) == null ? void 0 : _a.removeItem(getSessionDetailCacheKey(sessionId));
      } catch (_error) {
      }
    });
    return nextIndex;
  }
  function buildSessionDetailCacheSnapshot(session = state.detail.session) {
    const sessionId = String((session == null ? void 0 : session.sessionId) || "").trim();
    if (!sessionId) {
      return null;
    }
    const rawEvents = Array.isArray(state.detail.rawEvents) ? state.detail.rawEvents.slice(-SESSION_DETAIL_CACHE_MAX_RAW_EVENTS) : [];
    return {
      sessionId,
      savedAt: Date.now(),
      session: cloneJsonValue(session, null),
      rawEvents: cloneJsonValue(rawEvents, []),
      cursor: Number(state.detail.cursor || 0),
      beforeCursor: Number(state.detail.beforeCursor || 0),
      historyHasMore: Boolean(state.detail.historyHasMore)
    };
  }
  function persistSessionDetailCacheSnapshot(snapshot) {
    var _a;
    const sessionId = String((snapshot == null ? void 0 : snapshot.sessionId) || "").trim();
    if (!sessionId) {
      return;
    }
    try {
      (_a = window.localStorage) == null ? void 0 : _a.setItem(getSessionDetailCacheKey(sessionId), JSON.stringify(snapshot));
      const nextIndex = readSessionDetailCacheIndex();
      nextIndex[sessionId] = Number(snapshot.savedAt || Date.now());
      writeSessionDetailCacheIndex(pruneSessionDetailCaches(nextIndex, sessionId));
    } catch (_error) {
    }
  }
  function readSessionDetailCacheSnapshot(sessionId) {
    var _a;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return null;
    }
    try {
      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(getSessionDetailCacheKey(normalizedSessionId));
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
        historyHasMore: Boolean(parsed.historyHasMore)
      };
    } catch (_error) {
      return null;
    }
  }
  function clearSessionDetailCacheSnapshot(sessionId) {
    var _a;
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return;
    }
    try {
      (_a = window.localStorage) == null ? void 0 : _a.removeItem(getSessionDetailCacheKey(normalizedSessionId));
      const nextIndex = readSessionDetailCacheIndex();
      if (Object.prototype.hasOwnProperty.call(nextIndex, normalizedSessionId)) {
        delete nextIndex[normalizedSessionId];
        writeSessionDetailCacheIndex(nextIndex);
      }
    } catch (_error) {
    }
  }
  function schedulePersistActiveSessionDetailCache() {
    var _a;
    const sessionId = String(((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "").trim();
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
      preserveActiveRemoteHost = true
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
    if (!normalizedSessionId || !(snapshot == null ? void 0 : snapshot.session)) {
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
      Number(state.detail.cursor || 0)
    );
    updateSessionListItem(state.detail.session);
    return true;
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
      project == null ? void 0 : project.name,
      session.status,
      session.lastAssistantContent,
      session.lastCommand,
      session.codexThreadId
    ];
    return haystacks.some((value) => String(value || "").toLowerCase().includes(keyword));
  }
  function sortSessions(sessions, sort) {
    const items = [...sessions];
    items.sort((left, right) => {
      const leftPinned = Boolean(left.isPinned || left.pinned);
      const rightPinned = Boolean(right.isPinned || right.pinned);
      if (leftPinned !== rightPinned) {
        return Number(rightPinned) - Number(leftPinned);
      }
      if (leftPinned && rightPinned) {
        const leftOrder = Number.isFinite(Number(left.pinnedOrder)) ? Number(left.pinnedOrder) : 9999;
        const rightOrder = Number.isFinite(Number(right.pinnedOrder)) ? Number(right.pinnedOrder) : 9999;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
      }
      if (sort === "created_desc") {
        return compareTimes(right.createdAt, left.createdAt) || compareTitles(left, right);
      }
      if (sort === "events_desc") {
        return Number(right.eventCount || 0) - Number(left.eventCount || 0) || compareTimes(right.lastEventAt || right.updatedAt, left.lastEventAt || left.updatedAt) || compareTitles(left, right);
      }
      if (sort === "reply_desc") {
        return Number(Boolean(right.lastAssistantContent)) - Number(Boolean(left.lastAssistantContent)) || compareTimes(right.lastEventAt || right.updatedAt, left.lastEventAt || left.updatedAt) || compareTitles(left, right);
      }
      return compareTimes(right.lastEventAt || right.updatedAt || right.createdAt, left.lastEventAt || left.updatedAt || left.createdAt) || compareTitles(left, right);
    });
    return items;
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
  function loadingCard(message) {
    return `
    <article class="panel">
      <div class="loading-state">${escapeHtml4(message)}</div>
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
      <div class="error-state">${escapeHtml4(message)}</div>
    </article>
  `;
  }
  function renderPendingApprovalBar(detailState) {
    var _a;
    const approval = detailState.pendingApproval;
    if (!approval) {
      return "";
    }
    const runtime = ((_a = detailState.codexStatus) == null ? void 0 : _a.runtime) || null;
    const targetHint = approval.reason || approval.cwd || "";
    const commandPreview = approval.command ? `<code class="approval-banner-command">${escapeHtml4(approval.command)}</code>` : "";
    const workspaceNote = approval.cwd ? `<span class="approval-banner-chip">${escapeHtml4(approval.cwd)}</span>` : "";
    const canResolve = approval.resumable !== false;
    const approvalExplain = describeApprovalContext(approval, runtime);
    const restoreHint = !canResolve ? `<p class="approval-banner-meta approval-banner-meta--warning">${escapeHtml4(t("approval.restoreHint"))}</p>` : "";
    const actionHtml = canResolve ? `
        <button type="button" class="secondary-button" data-approval-decision="decline">${escapeHtml4(t("approval.deny"))}</button>
        <button type="button" class="secondary-button" data-approval-decision="accept">${escapeHtml4(t("approval.allowOnce"))}</button>
        <button type="button" class="primary-button" data-approval-decision="acceptForSession">${escapeHtml4(t("approval.allowForTurn"))}</button>
      ` : `
        <button type="button" class="primary-button" data-approval-retry="true">${escapeHtml4(t("approval.retryAction"))}</button>
      `;
    return `
    <section class="approval-banner" data-approval-id="${escapeHtml4(approval.requestId)}" data-approval-resumable="${canResolve ? "true" : "false"}">
      <div class="approval-banner-copy">
        <div class="approval-banner-head">
          <p class="approval-banner-title">${escapeHtml4(localizeApprovalTitle2(approval.title))}</p>
          <span class="approval-banner-badge">${escapeHtml4(canResolve ? t("approval.pending") : t("approval.restore"))}</span>
        </div>
        <p class="approval-banner-meta">${escapeHtml4(t("approval.continueHint"))}</p>
        ${targetHint ? `<p class="approval-banner-meta approval-banner-meta--strong">${escapeHtml4(targetHint)}</p>` : ""}
        ${approvalExplain ? `<p class="approval-banner-meta approval-banner-meta--strong">${escapeHtml4(approvalExplain)}</p>` : ""}
        ${commandPreview}
        <div class="approval-banner-foot">
          ${workspaceNote}
          ${(runtime == null ? void 0 : runtime.sandboxMode) ? `<span class="approval-banner-chip">Sandbox: ${escapeHtml4(formatRuntimeValue(runtime.sandboxMode))}</span>` : ""}
          ${(runtime == null ? void 0 : runtime.approvalMode) ? `<span class="approval-banner-chip">Approval: ${escapeHtml4(formatRuntimeValue(runtime.approvalMode))}</span>` : ""}
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
        var _a, _b, _c, _d, _e, _f;
        const approval = state.detail.pendingApproval;
        const requestId = banner.getAttribute("data-approval-id");
        if (!approval || !requestId) {
          return;
        }
        const previousPendingApproval = __spreadValues({}, approval);
        const previousStatus = ((_a = state.detail.session) == null ? void 0 : _a.status) || "waiting_input";
        const previousLiveBusy = Boolean((_b = state.detail.session) == null ? void 0 : _b.liveBusy);
        retryButton.disabled = true;
        banner.setAttribute("aria-busy", "true");
        state.detail.pendingApproval = null;
        if (((_c = state.detail.session) == null ? void 0 : _c.sessionId) === sessionId) {
          state.detail.session.status = "running";
          state.detail.session.liveBusy = true;
        }
        scheduleSessionDetailRender({ immediate: true });
        try {
          const codex = buildCodexLaunchPayload(
            state.detail.codexLaunch,
            state.detail.codexUiOptions
          );
          const payload = codex ? { codex } : {};
          await retrySessionApproval(sessionId, requestId, payload);
          await resumeActiveSessionDetail("approval-retry");
        } catch (error) {
          if (isTerminalApprovalError(error)) {
            dismissApproval(sessionId, requestId);
            state.detail.pendingApproval = null;
            const refreshedSession = await getSession(sessionId).catch(() => null);
            if (refreshedSession && ((_d = state.detail.session) == null ? void 0 : _d.sessionId) === sessionId) {
              state.detail.session = refreshedSession;
              updateSessionListItem(refreshedSession);
            } else if (((_e = state.detail.session) == null ? void 0 : _e.sessionId) === sessionId) {
              state.detail.session.status = previousStatus;
              state.detail.session.liveBusy = previousLiveBusy;
            }
            syncDetailPendingApproval(state.detail.session, state.detail.timelineState);
          } else {
            state.detail.pendingApproval = previousPendingApproval;
            if (((_f = state.detail.session) == null ? void 0 : _f.sessionId) === sessionId) {
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
        var _a, _b, _c;
        const decision = button.getAttribute("data-approval-decision");
        const requestId = banner.getAttribute("data-approval-id");
        if (!decision || !requestId) {
          return;
        }
        if (isApprovalSuppressed(sessionId, requestId, (_a = state.detail.pendingApproval) == null ? void 0 : _a.callId)) {
          return;
        }
        const previousPendingApproval = state.detail.pendingApproval ? __spreadValues({}, state.detail.pendingApproval) : null;
        state.detail.resolvingApprovalRequestId = requestId;
        state.detail.resolvingApprovalSessionId = sessionId;
        state.detail.resolvingApprovalCallId = String((previousPendingApproval == null ? void 0 : previousPendingApproval.callId) || "").trim();
        state.detail.pendingApproval = null;
        banner.setAttribute("aria-busy", "true");
        banner.setAttribute("data-pending-decision", decision);
        banner.querySelectorAll("[data-approval-decision]").forEach((actionButton) => actionButton.setAttribute("disabled", "disabled"));
        scheduleSessionDetailRender({ immediate: true });
        try {
          await resolveSessionApproval(sessionId, requestId, decision);
          await catchUpSessionEvents(sessionId, state.detail.cursor || 0).catch(() => null);
          const refreshedSession = await getSession(sessionId).catch(() => null);
          if (refreshedSession && ((_b = state.detail.session) == null ? void 0 : _b.sessionId) === sessionId) {
            state.detail.session = refreshedSession;
            updateSessionListItem(refreshedSession);
          }
          syncDetailPendingApproval(state.detail.session, state.detail.timelineState);
          scheduleSessionDetailRender({ immediate: true });
        } catch (error) {
          if (isApprovalSuppressed(sessionId, requestId, previousPendingApproval == null ? void 0 : previousPendingApproval.callId)) {
            clearResolvingApprovalState();
          }
          if (isTerminalApprovalError(error)) {
            dismissApproval(sessionId, requestId);
            state.detail.pendingApproval = null;
            const refreshedSession = await getSession(sessionId).catch(() => null);
            if (refreshedSession && ((_c = state.detail.session) == null ? void 0 : _c.sessionId) === sessionId) {
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
    const command = typeof (approval == null ? void 0 : approval.command) === "string" ? approval.command : "";
    const targetPath = extractApprovalPath(command);
    const writableRoots = Array.isArray(runtime == null ? void 0 : runtime.writableRoots) ? runtime.writableRoots : [];
    const workspaceRoot = typeof (runtime == null ? void 0 : runtime.workspaceRoot) === "string" ? runtime.workspaceRoot : "";
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
    var _a;
    const timelineState = state.detail.timelineState;
    if (!timelineState) {
      return null;
    }
    const activeTurnId = timelineState.activeTurnId;
    if (activeTurnId && ((_a = timelineState.turnsById[activeTurnId]) == null ? void 0 : _a.status) === "running") {
      return timelineState.turnsById[activeTurnId];
    }
    for (let index = timelineState.turnOrder.length - 1; index >= 0; index -= 1) {
      const turn = timelineState.turnsById[timelineState.turnOrder[index]];
      if ((turn == null ? void 0 : turn.status) === "running") {
        return turn;
      }
    }
    return null;
  }
  function getLatestTimelineTurn() {
    var _a;
    const timelineState = state.detail.timelineState;
    if (!((_a = timelineState == null ? void 0 : timelineState.turnOrder) == null ? void 0 : _a.length)) {
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
    if ((latestTurn == null ? void 0 : latestTurn.status) === "failed" || (latestTurn == null ? void 0 : latestTurn.status) === "aborted") {
      session.status = "failed";
      session.liveBusy = false;
      return;
    }
    if (session.liveBusy && (latestTurn == null ? void 0 : latestTurn.status) === "completed") {
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
      if ((turn == null ? void 0 : turn.status) === "running" || (turn == null ? void 0 : turn.status) === "idle") {
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
      startedAt: optimistic.createdAt
    };
  }
  function getTurnStartedAtUnixSeconds(turn) {
    const startedAt = Date.parse(String((turn == null ? void 0 : turn.startedAt) || ""));
    if (!Number.isFinite(startedAt)) {
      return 0;
    }
    return Math.floor(startedAt / 1e3);
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
    var _a, _b, _c;
    if (!itemId || !((_a = state.detail.timelineState) == null ? void 0 : _a.timelineItems)) {
      return null;
    }
    const index = (_c = (_b = state.detail.timelineState.itemIndexById) == null ? void 0 : _b.get) == null ? void 0 : _c.call(_b, itemId);
    if (typeof index === "number") {
      return state.detail.timelineState.timelineItems[index] || null;
    }
    return state.detail.timelineState.timelineItems.find((item) => (item == null ? void 0 : item.id) === itemId) || null;
  }
  function getActiveTurnItems(activeTurn, key) {
    const ids = Array.isArray(activeTurn == null ? void 0 : activeTurn[key]) ? activeTurn[key] : [];
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
        detail: t("threadStatus.sendingDetail")
      };
    }
    if (state.detail.pendingApproval) {
      return {
        code: "waiting_approval",
        tone: "warm",
        busy: true,
        label: t("threadStatus.waitingApproval"),
        detail: state.detail.pendingApproval.reason || compactCommandLabel(state.detail.pendingApproval.command) || t("threadStatus.waitingApprovalDetail")
      };
    }
    const commands = getActiveTurnItems(activeTurn, "commandIds");
    const runningCommand = [...commands].reverse().find(
      (item) => item.status === "running" || item.status === "awaiting_approval" || item.outputStatus === "streaming"
    );
    if (runningCommand) {
      return {
        code: runningCommand.status === "awaiting_approval" ? "waiting_approval" : "running_command",
        tone: "warm",
        busy: true,
        label: runningCommand.status === "awaiting_approval" ? t("threadStatus.waitingApproval") : t("threadStatus.runningCommand"),
        detail: compactCommandLabel(runningCommand.command) || t("timeline.command")
      };
    }
    const patches = getActiveTurnItems(activeTurn, "patchIds");
    const runningPatch = [...patches].reverse().find(
      (item) => item.status === "running" || item.outputStatus === "streaming"
    );
    if (runningPatch) {
      return {
        code: "editing_files",
        tone: "warm",
        busy: true,
        label: t("threadStatus.editingFiles"),
        detail: t("threadStatus.editingFilesDetail")
      };
    }
    const reasoning = getTimelineItemById(activeTurn == null ? void 0 : activeTurn.reasoningId);
    if ((reasoning == null ? void 0 : reasoning.status) === "thinking") {
      return {
        code: "thinking",
        tone: "warm",
        busy: true,
        label: t("threadStatus.thinking"),
        detail: reasoning.summary || t("threadStatus.thinkingDetail")
      };
    }
    if ((optimistic == null ? void 0 : optimistic.confirmed) && isSessionLiveBusy(session)) {
      return {
        code: "delivered",
        tone: "warm",
        busy: true,
        label: t("threadStatus.delivered"),
        detail: t("threadStatus.deliveredDetail")
      };
    }
    if ((activeTurn == null ? void 0 : activeTurn.status) === "failed" || getSessionDisplayStatus(session) === "failed") {
      return {
        code: "failed",
        tone: "danger",
        busy: false,
        label: t("threadStatus.failed"),
        detail: t("threadStatus.failedDetail")
      };
    }
    if (isSessionLiveBusy(session)) {
      return {
        code: "processing",
        tone: "warm",
        busy: true,
        label: t("threadStatus.processing"),
        detail: t("threadStatus.waitingUpdate")
      };
    }
    if ((activeTurn == null ? void 0 : activeTurn.status) === "completed") {
      const completedAtMs = Date.parse(String(activeTurn.completedAt || activeTurn.startedAt || ""));
      if (Number.isFinite(completedAtMs) && Date.now() - completedAtMs > 10 * 1e3) {
        return {
          code: "idle",
          tone: "neutral",
          busy: false,
          label: t("threadStatus.idle"),
          detail: t("threadStatus.idleDetail")
        };
      }
      return {
        code: "completed",
        tone: "success",
        busy: false,
        label: t("threadStatus.completed"),
        detail: t("threadStatus.completedDetail")
      };
    }
    return {
      code: "idle",
      tone: "neutral",
      busy: false,
      label: t("threadStatus.idle"),
      detail: t("threadStatus.idleDetail")
    };
  }
  function getRunSummaryBadges(summary) {
    if (!summary || summary.code === "idle" || summary.code === "completed") {
      return [];
    }
    return [{ label: summary.label, tone: summary.tone || "neutral" }];
  }
  function normalizePlanStatus(status) {
    const value = String(status || "").trim();
    if (value === "completed" || value === "in_progress" || value === "pending") {
      return value;
    }
    return "pending";
  }
  function getVisibleThreadTaskPlan() {
    var _a, _b;
    const plan = ((_a = state.detail.timelineState) == null ? void 0 : _a.latestPlan) || null;
    const activeTurnId = String(((_b = state.detail.timelineState) == null ? void 0 : _b.activeTurnId) || "");
    const planTurnId = String((plan == null ? void 0 : plan.turnId) || "");
    const tasks = Array.isArray(plan == null ? void 0 : plan.tasks) ? plan.tasks : [];
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
    const tasks = Array.isArray(plan == null ? void 0 : plan.tasks) ? plan.tasks : [];
    if (tasks.length === 0) {
      return "";
    }
    const activeTask = tasks.find((item) => normalizePlanStatus(item.status) === "in_progress") || tasks.find((item) => normalizePlanStatus(item.status) === "pending") || null;
    const completedCount = tasks.filter(
      (item) => normalizePlanStatus(item.status) === "completed"
    ).length;
    const summary = activeTask ? t("taskPlan.current", { task: activeTask.step }) : t("taskPlan.allDone");
    const openAttribute = state.workspace.taskPlanCollapsed ? "" : " open";
    return `
    <details class="thread-task-plan" data-thread-task-plan="1"${openAttribute}>
      <summary class="thread-task-plan-summary">
        <span class="thread-task-plan-title">${escapeHtml4(t("taskPlan.title"))}</span>
        <span class="thread-task-plan-current">${escapeHtml4(summary)}</span>
        <span class="thread-task-plan-count">${escapeHtml4(t("taskPlan.progress", { completed: completedCount, total: tasks.length }))}</span>
      </summary>
      ${plan.explanation ? `<div class="thread-task-plan-explanation">${escapeHtml4(plan.explanation)}</div>` : ""}
      <ol class="thread-task-plan-list">
        ${tasks.map((item) => {
      const status = normalizePlanStatus(item.status);
      return `
              <li class="thread-task-plan-item thread-task-plan-item-${escapeHtml4(status)}">
                <span class="thread-task-plan-marker"></span>
                <span class="thread-task-plan-step">${escapeHtml4(item.step)}</span>
                <span class="thread-task-plan-status">${escapeHtml4(planStatusLabel(status))}</span>
              </li>
            `;
    }).join("")}
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
  function shortenText(value, limit) {
    if (!value) {
      return "";
    }
    if (value.length <= limit) {
      return value;
    }
    return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}\u2026`;
  }
  function disconnectConversationLayoutObserver() {
    var _a;
    (_a = state.detail.layoutScrollObserver) == null ? void 0 : _a.disconnect();
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
    state.detail.searchMatchIndex = (state.detail.searchMatchIndex + direction + total) % total;
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
      prevButton == null ? void 0 : prevButton.setAttribute("disabled", "disabled");
      nextButton == null ? void 0 : nextButton.setAttribute("disabled", "disabled");
      return;
    }
    state.detail.searchMatchIndex = Math.max(0, Math.min(state.detail.searchMatchIndex, total - 1));
    const activeHit = hits[state.detail.searchMatchIndex];
    activeHit == null ? void 0 : activeHit.classList.add("command-search-hit-active");
    if (status) {
      status.textContent = `${state.detail.searchMatchIndex + 1} / ${total}`;
    }
    prevButton == null ? void 0 : prevButton.removeAttribute("disabled");
    nextButton == null ? void 0 : nextButton.removeAttribute("disabled");
    if (options.scrollIntoView && activeHit) {
      activeHit.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
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
    if (state.detail.historyLoading || !state.detail.historyHasMore || !state.detail.beforeCursor || state.detail.beforeCursor <= 1) {
      return;
    }
    state.detail.historyLoading = true;
    const previousScrollTop = list.scrollTop;
    const previousScrollHeight = list.scrollHeight;
    try {
      const payload = await getSessionTimelineEvents(sessionId, {
        before: state.detail.beforeCursor,
        limit: 200
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
      viewportWidth - menuWidth - margin
    );
    const nextY = Math.min(
      Math.max(margin, Math.round(Number(clientY || viewportHeight / 2))),
      viewportHeight - menuHeight - margin
    );
    state.detail.messageContextMenu = {
      text,
      x: nextX,
      y: nextY,
      anchorKey: String(anchorKey || "").trim()
    };
    scheduleSessionDetailRender({ immediate: true });
  }
  function renderMessageContextMenu() {
    const menu = state.detail.messageContextMenu;
    if (!(menu == null ? void 0 : menu.text)) {
      return "";
    }
    return `
    <div class="message-context-menu-overlay" data-message-copy-action="close" aria-hidden="true"></div>
    <div
      class="message-context-menu"
      role="menu"
      aria-label="${escapeHtml4(t("generic.copy"))}"
      style="left:${Math.round(Number(menu.x || 0))}px;top:${Math.round(Number(menu.y || 0))}px;"
    >
      <button
        type="button"
        class="message-context-menu-button"
        data-message-copy-action="copy"
      >${escapeHtml4(t("generic.copy"))}</button>
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
        "button, a, input, textarea, select, summary, details, audio, [data-copy-text], [data-completion-action]"
      )
    );
  }
  function isTouchLikeMessageCopySurface() {
    const touchViewport = isMobileWorkspaceViewport();
    const coarsePointer = typeof window !== "undefined" && typeof window.matchMedia === "function" && (window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches);
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
    var _a, _b, _c, _d, _e, _f;
    if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
      const touch = ((_a = event.changedTouches) == null ? void 0 : _a[0]) || ((_b = event.touches) == null ? void 0 : _b[0]) || null;
      return {
        x: (_c = touch == null ? void 0 : touch.clientX) != null ? _c : 0,
        y: (_d = touch == null ? void 0 : touch.clientY) != null ? _d : 0
      };
    }
    return {
      x: (_e = event.clientX) != null ? _e : 0,
      y: (_f = event.clientY) != null ? _f : 0
    };
  }
  function findMessageCopyNodeFromTarget(target) {
    const targetEl = getMessageCopyTargetElement(target);
    if (!(targetEl instanceof HTMLElement)) {
      return null;
    }
    return targetEl.closest("[data-message-copy-text]") || targetEl.closest(".msg-bubble, .msg-notice");
  }
  function getMessageCopyTextFromNode(node) {
    if (!(node instanceof HTMLElement)) {
      return "";
    }
    const encoded = node.getAttribute("data-message-copy-text") || "";
    if (encoded) {
      return decodeCopyPayload(encoded);
    }
    const textSource = node.querySelector(".msg-bubble-body, .msg-notice-text, .assistant-main-block") || node;
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
      return String(row.id || "").trim() || String(row.getAttribute("data-inspect-key") || "").trim();
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
      expiresAt: Date.now() + MESSAGE_COPY_TAP_CLICK_WINDOW_MS
    };
  }
  function consumePendingMessageCopyTap(identity) {
    const pending = pendingMessageCopyTap;
    clearPendingMessageCopyTap();
    if (!(pending == null ? void 0 : pending.identity) || !identity) {
      return false;
    }
    if (pending.expiresAt < Date.now()) {
      return false;
    }
    return pending.identity === identity;
  }
  function isMessageCopyTapWithinBounds(candidate, point) {
    var _a, _b, _c, _d;
    if (!candidate) {
      return false;
    }
    const dx = Math.abs(Number((_a = point == null ? void 0 : point.x) != null ? _a : 0) - Number((_b = candidate.startX) != null ? _b : 0));
    const dy = Math.abs(Number((_c = point == null ? void 0 : point.y) != null ? _c : 0) - Number((_d = candidate.startY) != null ? _d : 0));
    return dx <= MESSAGE_COPY_TAP_MAX_MOVE_PX && dy <= MESSAGE_COPY_TAP_MAX_MOVE_PX;
  }
  function hasActiveSelectableText() {
    if (typeof window === "undefined" || typeof window.getSelection !== "function") {
      return false;
    }
    const selection = window.getSelection();
    return Boolean(String((selection == null ? void 0 : selection.toString()) || "").trim());
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
    if (!shouldUseTapMessageCopyMenu(event) || shouldIgnoreMessageCopyTarget(event.target) || shouldSuppressMessageCopyMenuForSelection()) {
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
      startedAt: Date.now()
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
    if (identity && identity === candidate.identity && elapsed <= MESSAGE_COPY_TAP_MAX_DURATION_MS && isMessageCopyTapWithinBounds(candidate, getMessageCopyInteractionPoint(event))) {
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
    var _a, _b;
    if (typeof document === "undefined") {
      return;
    }
    document.querySelectorAll(".message-copy-target-active, .message-copy-row-active").forEach((element) => {
      element.classList.remove("message-copy-target-active", "message-copy-row-active");
    });
    const anchorKey = String(((_a = state.detail.messageContextMenu) == null ? void 0 : _a.anchorKey) || "").trim();
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
    (_b = target.closest(".transcript-row")) == null ? void 0 : _b.classList.add("message-copy-row-active");
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
      getMessageCopyKeyFromNode(node)
    );
    return true;
  }
  function bindMessageCopyMenus() {
    const menuCopyButton = document.querySelector("[data-message-copy-action='copy']");
    if (menuCopyButton instanceof HTMLButtonElement) {
      menuCopyButton.onclick = async (event) => {
        var _a;
        event.preventDefault();
        event.stopPropagation();
        const copied = await writeClipboardText(String(((_a = state.detail.messageContextMenu) == null ? void 0 : _a.text) || ""));
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
        getMessageCopyKeyFromNode(node)
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
    var _a;
    try {
      if (typeof navigator !== "undefined" && ((_a = navigator.clipboard) == null ? void 0 : _a.writeText)) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_error) {
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
    var _a;
    (_a = state.ws) == null ? void 0 : _a.close();
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
    var _a, _b, _c, _d;
    const sessionId = ((_a = state.detail.session) == null ? void 0 : _a.sessionId) || state.workspace.activeSessionId || "";
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
      const shouldForceReconnect = reason === "visibility" || reason === "focus" || reason === "pageshow";
      if (shouldForceReconnect || state.socketState === "closed" || state.socketState === "error") {
        cleanupSocket();
        state.socketState = "connecting";
        attachSessionSocket(sessionId);
      }
      if (((_b = state.detail.session) == null ? void 0 : _b.sourceKind) === "imported_rollout") {
        await syncImportedSession(sessionId).catch(() => null);
      }
      const wasBusyBeforeRefresh = isSessionLiveBusy(state.detail.session);
      const refreshedSession = await getSession(sessionId).catch(() => null);
      if (refreshedSession && ((_c = state.detail.session) == null ? void 0 : _c.sessionId) === sessionId) {
        state.detail.session = refreshedSession;
        state.detail.completionNoticeArmed = isSessionLiveBusy(refreshedSession);
        syncDetailPendingApproval(refreshedSession, state.detail.timelineState);
        updateSessionListItem(refreshedSession);
      }
      await catchUpSessionEvents(sessionId, state.detail.cursor || 0, {
        wasBusy: wasBusyBeforeRefresh
      }).catch(() => null);
      if (((_d = state.detail.session) == null ? void 0 : _d.sessionId) === sessionId) {
        void maybeFlushMobileSendQueue(`resume:${reason}`);
        scheduleSessionDetailRender();
        scheduleImportedSessionSync(sessionId, 1e3);
      }
    } finally {
      state.detail.resumeSyncInFlight = false;
    }
  }
  function shouldAutoSyncImportedSession(session) {
    return Boolean(
      session && session.sourceKind === "imported_rollout" && session.sourceRolloutHasOpenTurn === true && !isSessionLiveBusy(session)
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
        if (state.detail.session && state.detail.session.sessionId === sessionId && isSessionLiveBusy(state.detail.session)) {
          scheduleLiveResumeSync(sessionId, 3200);
        }
      }
    }, delayMs);
  }
  function updateSessionListItem(session) {
    var _a;
    if (!(session == null ? void 0 : session.sessionId)) {
      return;
    }
    state.sessions.items = state.sessions.items.map(
      (item) => {
        var _a2, _b, _c, _d, _e;
        return item.sessionId === session.sessionId ? __spreadProps(__spreadValues({}, item), {
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
          hasTaskPlan: Boolean((_a2 = session.hasTaskPlan) != null ? _a2 : item.hasTaskPlan),
          lastAssistantContent: (_c = (_b = session.lastAssistantContent) != null ? _b : item.lastAssistantContent) != null ? _c : "",
          lastCommand: (_e = (_d = session.lastCommand) != null ? _d : item.lastCommand) != null ? _e : ""
        }) : item;
      }
    );
    if (String(((_a = state.detail.session) == null ? void 0 : _a.sessionId) || "").trim() === String(session.sessionId || "").trim()) {
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
      var _a;
      state.detail.importedSyncTimerId = 0;
      if (!state.detail.session || state.detail.session.sessionId !== sessionId) {
        return;
      }
      try {
        const result = await syncImportedSession(sessionId);
        if (!state.detail.session || state.detail.session.sessionId !== sessionId) {
          return;
        }
        if ((result == null ? void 0 : result.appendedEvents) > 0) {
          await catchUpSessionEvents(sessionId, state.detail.cursor);
        }
        if ((result == null ? void 0 : result.appendedEvents) > 0 || (result == null ? void 0 : result.synced)) {
          const refreshedSession = await getSession(sessionId).catch(() => null);
          if (refreshedSession && ((_a = state.detail.session) == null ? void 0 : _a.sessionId) === sessionId) {
            state.detail.session = refreshedSession;
            syncDetailPendingApproval(refreshedSession, state.detail.timelineState);
            updateSessionListItem(refreshedSession);
          }
        }
        scheduleSessionDetailRender();
        scheduleImportedSessionSync(sessionId, 1600);
      } catch (e) {
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
    }, 1e3);
  }
  function syncDetailClockLabels() {
    const session = state.detail.session;
    if (!session) {
      return;
    }
    const sessionElapsedEl = document.querySelector("#session-elapsed-chip");
    if (sessionElapsedEl) {
      sessionElapsedEl.textContent = t("session.elapsed", {
        value: formatElapsedSinceIso(session.createdAt)
      });
    }
    const activeElapsedEl = document.querySelector("#session-active-elapsed-chip");
    if (activeElapsedEl && state.detail.activeTaskStartedAt > 0) {
      activeElapsedEl.textContent = t("session.turnElapsed", {
        value: formatElapsedSinceUnixSeconds(state.detail.activeTaskStartedAt)
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
        state.detail.activeTaskStartedAt
      );
    }
  }
  function escapeHtml4(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function messageOf(error) {
    if ((error == null ? void 0 : error.code) === "request_timeout") {
      return t("errors.requestTimeout");
    }
    return error instanceof Error ? error.message : "Unknown error";
  }
})();

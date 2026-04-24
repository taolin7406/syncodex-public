import { t } from "../i18n/index.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCompactMobileTitle(title) {
  const text = String(title || "").trim();
  if (!text) {
    return t("session.current");
  }
  return text.length > 12 ? `${text.slice(0, 12)}...` : text;
}

export function renderSessionTopBar({
  title,
  statusCode = "",
  statusLabel,
  statusClass,
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
  backHref = "",
}) {
  void statusCode;
  void statusLabel;
  void statusClass;
  void activityBadges;
  void sessionElapsedLabel;
  void activeElapsedLabel;
  const fullTitle = title || t("workspace.session.untitled");
  const mobileTitle = getCompactMobileTitle(fullTitle);

  return `
    <section class="session-topbar" aria-label="${escapeHtml(t("inspect.thread"))}">
      <div class="session-topbar-mobile-bar">
        ${
          backHref
            ? `<a href="${escapeHtml(backHref)}" class="session-topbar-mobile-back">${escapeHtml(t("session.back"))}</a>`
            : `<span class="session-topbar-mobile-back session-topbar-mobile-back-placeholder"></span>`
        }
        <div class="session-topbar-mobile-center">
          <div class="session-topbar-mobile-title-row">
            <div class="session-topbar-mobile-title" title="${escapeHtml(fullTitle)}">${escapeHtml(mobileTitle)}</div>
          </div>
        </div>
        ${
          showInspectAction
            ? `
              <button
                id="inspect-drawer-toggle"
                type="button"
                class="secondary-button session-topbar-mobile-action ${inspectOpen ? "session-topbar-action-active" : ""}"
                aria-expanded="${inspectOpen ? "true" : "false"}"
                aria-controls="inspect-drawer"
              >
                Inspect
              </button>
            `
            : showCompletionOptionsAction
              ? `
                <button
                  type="button"
                  class="secondary-button session-topbar-mobile-action ${completionOptionsOpen ? "session-topbar-action-active" : ""}"
                  data-completion-options-toggle
                  aria-expanded="${completionOptionsOpen ? "true" : "false"}"
                  aria-controls="session-completion-options-slot"
                >
                  ${escapeHtml(t("completionActions.options"))}
                </button>
              `
              : `<span class="session-topbar-mobile-action session-topbar-mobile-action-placeholder"></span>`
        }
      </div>
      <div class="session-topbar-main">
        <h2 class="session-topbar-title" title="${escapeHtml(fullTitle)}">${escapeHtml(fullTitle)}</h2>
      </div>
      <div class="session-topbar-meta">
        <span class="session-topbar-chip">${escapeHtml(host || t("session.host.unsynced"))}</span>
        <span class="session-topbar-chip">${escapeHtml(model || t("session.model.unsynced"))}</span>
        <span class="session-topbar-chip">${escapeHtml(reasoning || t("session.reasoning.unsynced"))}</span>
      </div>
      ${
        showInspectAction
          ? `
            <button
              id="inspect-drawer-toggle"
              type="button"
              class="secondary-button session-topbar-action ${inspectOpen ? "session-topbar-action-active" : ""}"
              aria-expanded="${inspectOpen ? "true" : "false"}"
              aria-controls="inspect-drawer"
            >
              Inspect
            </button>
          `
          : showCompletionOptionsAction
            ? `
              <button
                type="button"
                class="secondary-button session-topbar-action ${completionOptionsOpen ? "session-topbar-action-active" : ""}"
                data-completion-options-toggle
                aria-expanded="${completionOptionsOpen ? "true" : "false"}"
                aria-controls="session-completion-options-slot"
              >
                ${escapeHtml(t("completionActions.options"))}
              </button>
            `
          : ""
      }
    </section>
  `;
}

export function renderInspectDrawer({
  open,
  selectionTitle,
  searchSectionHtml,
  detailsSectionHtml,
  sessionSectionHtml,
}) {
  return `
    <div
      id="inspect-drawer-overlay"
      class="inspect-drawer-overlay ${open ? "inspect-drawer-overlay-open" : ""}"
      ${open ? "" : "hidden"}
    ></div>
    <aside
      id="inspect-drawer"
      class="inspect-drawer ${open ? "inspect-drawer-open" : ""}"
      aria-label="Inspect"
      ${open ? "" : "hidden"}
    >
      <div class="inspect-drawer-head">
        <div>
          <p class="inspect-drawer-eyebrow">Inspect</p>
          <h3 class="inspect-drawer-title">${escapeHtml(selectionTitle || t("inspect.selectionTitle"))}</h3>
        </div>
        <button id="inspect-drawer-close" type="button" class="secondary-button">${escapeHtml(t("inspect.close"))}</button>
      </div>
      <div class="inspect-drawer-body">
        <section class="inspect-drawer-section">
          <div class="inspect-section-head">
            <span class="inspect-section-title">Search</span>
          </div>
          ${searchSectionHtml}
        </section>
        <section class="inspect-drawer-section">
          <div class="inspect-section-head">
            <span class="inspect-section-title">Details</span>
          </div>
          ${detailsSectionHtml}
        </section>
        <section class="inspect-drawer-section">
          <div class="inspect-section-head">
            <span class="inspect-section-title">Session</span>
          </div>
          ${sessionSectionHtml}
        </section>
      </div>
    </aside>
  `;
}

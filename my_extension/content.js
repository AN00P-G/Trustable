(() => {
  if (globalThis.__trustableContentInitialized) return;
  globalThis.__trustableContentInitialized = true;

  const MAX_LEN = 2000;
  const MAX_LINES = 30;
  const STORAGE_KEY = "trustable_widget_state";
  const SESSION_KEY = "trustable_hidden_session";

  const hasChrome =
    typeof chrome !== "undefined" && chrome?.runtime?.id ? true : false;

  const iconUrl = hasChrome ? chrome.runtime.getURL("icon.png") : "";

  // -------------------------------------------------------------------------
  // Page scraping
  // -------------------------------------------------------------------------
  function scrapeText() {
    const candidates = document.querySelectorAll(
      "article, main, section, p, h1, h2, h3, li, div",
    );
    const seen = new Set();
    const lines = [];

    for (const el of candidates) {
      const txt = (el.innerText || "").trim();
      if (!txt) continue;
      if (txt.length < 3) continue;
      if (txt.length > 10000 && el.tagName.toLowerCase() === "li") continue;
      if (seen.has(txt)) continue;
      seen.add(txt);
      lines.push(txt);
      if (lines.length >= MAX_LINES) break;
    }

    return lines.join("\n").slice(0, MAX_LEN);
  }

  // -------------------------------------------------------------------------
  // Persisted widget state (position + open/collapsed)
  // -------------------------------------------------------------------------
  const defaultState = { open: false, right: 18, bottom: 18, hiddenUntil: 0 };
  let state = { ...defaultState };
  let autoShowTimer = null;

  function loadState() {
    return new Promise((resolve) => {
      if (hasChrome && chrome.storage?.local) {
        chrome.storage.local.get(STORAGE_KEY, (res) => {
          if (chrome.runtime.lastError) return resolve({ ...defaultState });
          resolve({ ...defaultState, ...(res?.[STORAGE_KEY] || {}) });
        });
      } else {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          resolve(raw ? { ...defaultState, ...JSON.parse(raw) } : { ...defaultState });
        } catch {
          resolve({ ...defaultState });
        }
      }
    });
  }

  function saveState() {
    if (hasChrome && chrome.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: state });
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* ignore */
      }
    }
  }

  // ---- "Hide for this session" (browser session via chrome.storage.session,
  //      falling back to per-tab sessionStorage) --------------------------------
  function getSessionHidden() {
    return new Promise((resolve) => {
      try {
        if (hasChrome && chrome.storage?.session) {
          chrome.storage.session.get(SESSION_KEY, (r) => {
            if (chrome.runtime.lastError) {
              return resolve(fallbackSessionHidden());
            }
            resolve(!!r?.[SESSION_KEY]);
          });
          return;
        }
      } catch {
        /* fall through */
      }
      resolve(fallbackSessionHidden());
    });
  }

  function fallbackSessionHidden() {
    try {
      return !!sessionStorage.getItem(SESSION_KEY);
    } catch {
      return false;
    }
  }

  function setSessionHidden(v) {
    try {
      if (hasChrome && chrome.storage?.session) {
        chrome.storage.session.set({ [SESSION_KEY]: !!v });
      }
    } catch {
      /* ignore */
    }
    try {
      if (v) sessionStorage.setItem(SESSION_KEY, "1");
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  async function isHidden() {
    if (state.hiddenUntil && Date.now() < state.hiddenUntil) return true;
    if (await getSessionHidden()) return true;
    return false;
  }

  function hideForMs(ms) {
    state.hiddenUntil = Date.now() + ms;
    saveState();
    applyHidden();
    if (autoShowTimer) clearTimeout(autoShowTimer);
    autoShowTimer = setTimeout(() => showWidget(), ms);
  }

  function hideForSession() {
    setSessionHidden(true);
    applyHidden();
  }

  function clearHide() {
    state.hiddenUntil = 0;
    saveState();
    setSessionHidden(false);
    if (autoShowTimer) {
      clearTimeout(autoShowTimer);
      autoShowTimer = null;
    }
  }

  function applyHidden() {
    if (els?.host) els.host.style.display = "none";
    closeMenu();
  }

  function showWidget() {
    buildWidget();
    if (els?.host) els.host.style.display = "";
  }

  // -------------------------------------------------------------------------
  // Widget markup + styles (isolated in a Shadow DOM so page CSS can't touch it)
  // -------------------------------------------------------------------------
  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; }

    @keyframes tr-in { 0% { opacity: 0; transform: translateY(16px) scale(0.96); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes tr-spin { to { transform: rotate(360deg); } }
    @keyframes tr-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.7); } }
    @keyframes tr-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes tr-pop { 0% { opacity: 0; transform: scale(0.85); } 60% { transform: scale(1.04); } 100% { opacity: 1; transform: scale(1); } }
    @keyframes tr-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes tr-ring { 0%, 100% { box-shadow: 0 0 0 0 rgba(107,114,128,0.55); } 50% { box-shadow: 0 0 0 8px rgba(107,114,128,0); } }
    @keyframes tr-grad { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

    .root {
      position: fixed;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
    }

    /* ---- Floating action button (always on screen) ---- */
    .fab {
      position: relative;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      cursor: pointer;
      background: linear-gradient(135deg, #0a0a0a, #26262a);
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      transition: transform 0.18s cubic-bezier(0.18,0.89,0.32,1.28), box-shadow 0.2s ease;
      animation: tr-float 4s ease-in-out infinite;
    }
    .fab:hover { transform: scale(1.07); box-shadow: 0 12px 30px rgba(0,0,0,0.45); }
    .fab:active { transform: scale(0.96); }
    .fab.dragging { animation: none; cursor: grabbing; transform: scale(1.05); }
    .fab img { width: 34px; height: 34px; border-radius: 9px; pointer-events: none; }

    .fab-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #6b7280;
      border: 2px solid #0a0a0a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      color: #fff;
      font-weight: 700;
    }
    .fab-badge.good { background: #22c55e; }
    .fab-badge.bad { background: #ef4444; }
    .fab-badge.loading { background: #6b7280; animation: tr-ring 1.2s ease-out infinite; }

    /* ---- Panel ---- */
    .panel {
      position: relative;
      width: 320px;
      overflow: hidden;
      border-radius: 16px;
      background: linear-gradient(160deg, #050505, #141416);
      color: #f4f4f5;
      box-shadow: 0 18px 50px rgba(0,0,0,0.55);
      border: 1px solid rgba(255,255,255,0.08);
      display: none;
      isolation: isolate;
      animation: tr-in 0.35s cubic-bezier(0.18,0.89,0.32,1.28);
    }
    .panel.open { display: block; }

    /* animated network background */
    .net-canvas {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      z-index: -1; pointer-events: none;
      opacity: 0.85;
    }

    .panel-header {
      position: relative;
      padding: 14px 14px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      background: linear-gradient(120deg, #0a0a0a, #26262a, #3a3a40, #26262a, #0a0a0a);
      background-size: 220% 220%;
      animation: tr-grad 9s ease infinite;
      cursor: grab;
      overflow: hidden;
    }
    /* glossy radial highlight in header */
    .panel-header::before {
      content: "";
      position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(circle at 25% 0%, rgba(255,255,255,0.22), transparent 55%);
    }
    .panel-header > * { position: relative; z-index: 1; }
    .panel-header:active { cursor: grabbing; }
    .panel-logo { width: 34px; height: 34px; border-radius: 9px; box-shadow: 0 4px 12px rgba(0,0,0,0.35); }
    .panel-titles { flex: 1 1 auto; min-width: 0; }
    .panel-title { font-size: 15px; font-weight: 700; }
    .panel-sub { font-size: 10px; color: rgba(255,255,255,0.75); }
    .icon-btn {
      flex: 0 0 auto;
      width: 24px; height: 24px;
      border: none;
      border-radius: 7px;
      background: rgba(255,255,255,0.08);
      color: #f4f4f5;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s ease;
    }
    .icon-btn:hover { background: rgba(255,255,255,0.18); }
    .icon-btn svg { width: 14px; height: 14px; }
    #tr-settings:hover svg { animation: tr-spin 3s linear infinite; }

    /* ---- Settings menu ---- */
    .menu {
      position: absolute; top: 50px; right: 12px; width: 210px;
      background: #17171a; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; box-shadow: 0 14px 34px rgba(0,0,0,0.55);
      padding: 6px; z-index: 6; display: none;
    }
    .menu.open { display: block; animation: tr-in 0.18s ease; }
    .menu-title {
      font-size: 9px; text-transform: uppercase; letter-spacing: 0.7px;
      color: #9ca3af; padding: 6px 8px 4px;
    }
    .menu-item {
      width: 100%; text-align: left; background: transparent; border: none;
      color: #f4f4f5; font-size: 12px; padding: 8px; border-radius: 8px;
      cursor: pointer; display: flex; align-items: center; gap: 8px;
      font-family: inherit; transition: background 0.15s ease;
    }
    .menu-item:hover { background: rgba(255,255,255,0.08); }
    .menu-item svg { width: 14px; height: 14px; flex: 0 0 auto; color: #9ca3af; }
    .menu-hint {
      font-size: 9px; color: #6b7280; padding: 6px 8px 4px; line-height: 1.3;
      border-top: 1px solid rgba(255,255,255,0.07); margin-top: 4px;
    }

    .panel-body { padding: 14px; }

    .status {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; color: #9ca3af; margin-bottom: 12px; min-height: 18px;
    }
    .status .dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; flex: 0 0 auto; }
    .status.loading .dot { animation: tr-pulse 1s ease-in-out infinite; }
    .status.done .dot { background: #22c55e; }
    .status.error .dot { background: #ef4444; }
    .status .spin {
      width: 13px; height: 13px; border: 2px solid rgba(255,255,255,0.2);
      border-top-color: #d4d4d8; border-radius: 50%; animation: tr-spin 0.7s linear infinite; display: none;
    }
    .status.loading .spin { display: inline-block; }

    .card { animation: tr-fade 0.4s ease both; }

    .score-ring { position: relative; width: 150px; height: 150px; margin: 4px auto 12px; animation: tr-pop 0.5s cubic-bezier(0.18,0.89,0.32,1.28) both; }
    .score-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .ring-track { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 10; }
    .ring-progress { fill: none; stroke-width: 10; stroke-linecap: round; stroke-dasharray: 339.292; stroke-dashoffset: 339.292; transition: stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1); }
    .ring-progress.good { stroke: #22c55e; }
    .ring-progress.bad { stroke: #ef4444; }
    .ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .ring-score { font-size: 24px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
    .ring-score.good { color: #22c55e; } .ring-score.bad { color: #ef4444; }
    .ring-verdict { margin-top: 3px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; }
    .ring-verdict.good { color: #22c55e; } .ring-verdict.bad { color: #ef4444; }
    .ring-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-top: 1px; }

    /* ---- Reasons dropdown ---- */
    .features { margin-top: 14px; }
    .features-toggle {
      width: 100%; display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px;
      background: rgba(255,255,255,0.05); color: #f4f4f5; cursor: pointer;
      font-size: 12px; font-weight: 600; letter-spacing: 0.3px;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .features-toggle:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.22); }
    .features-toggle .caret {
      width: 14px; height: 14px; flex: 0 0 auto; transition: transform 0.25s ease; color: #9ca3af;
    }
    .features.open .features-toggle .caret { transform: rotate(180deg); }
    .features.open .features-toggle { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom-color: transparent; }
    .features-panel {
      overflow: hidden; max-height: 0; opacity: 0;
      border: 1px solid transparent; border-top: none;
      transition: max-height 0.3s ease, opacity 0.25s ease, padding 0.25s ease;
      padding: 0 12px;
    }
    .features.open .features-panel {
      max-height: 240px; opacity: 1; padding: 12px;
      overflow-y: auto; overscroll-behavior: contain;
      border-color: rgba(255,255,255,0.12);
      border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;
      background: rgba(255,255,255,0.03);
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.25) transparent;
    }
    .features-panel::-webkit-scrollbar { width: 8px; }
    .features-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 8px; }
    .features-panel::-webkit-scrollbar-track { background: transparent; }
    .features-title { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; }
    .feature { margin-bottom: 9px; animation: tr-fade 0.4s ease both; }
    .feature-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 3px; font-size: 12px; }
    .feature-name { font-family: "Fira Code", "Consolas", monospace; color: #f4f4f5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; }
    .feature-meta { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
    .feature-val { font-family: "Fira Code", "Consolas", monospace; font-size: 11px; font-variant-numeric: tabular-nums; }
    .feature-val.pos { color: #22c55e; }
    .feature-val.neg { color: #ef4444; }
    .feature-tag { font-size: 9px; padding: 2px 6px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; background: rgba(255,255,255,0.08); }
    .feature-track { height: 5px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
    .feature-fill { height: 100%; width: 0%; border-radius: 999px; transition: width 0.8s cubic-bezier(0.22,1,0.36,1); }
    .feature-fill.pos { background: linear-gradient(90deg, #22c55e, #4ade80); }
    .feature-fill.neg { background: linear-gradient(90deg, #ef4444, #f87171); }

    .message { font-size: 13px; color: #9ca3af; text-align: center; padding: 8px 4px; }

    .rescan-icon {
      margin-left: auto; flex: 0 0 auto;
      width: 22px; height: 22px; padding: 0;
      border: none; border-radius: 7px;
      background: rgba(255,255,255,0.08); color: #d4d4d8; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s ease, transform 0.15s ease, color 0.15s ease;
    }
    .rescan-icon:hover { background: rgba(255,255,255,0.18); color: #fff; transform: rotate(-25deg); }
    .rescan-icon:active { transform: scale(0.9); }
    .rescan-icon:disabled { opacity: 0.5; cursor: default; }
    .rescan-icon svg { width: 13px; height: 13px; }
    .rescan-icon.spinning svg { animation: tr-spin 0.7s linear infinite; }
  `;

  const CIRCUMFERENCE = 339.292; // 2 * PI * r (r = 54)

  let els = null; // cached widget elements
  let netCtl = null; // network animation controller
  let busy = false;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function buildWidget() {
    if (els) return els;

    const host = document.createElement("div");
    host.id = "trustable-widget-host";
    // Keep the host itself out of the layout flow.
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLES;
    shadow.appendChild(style);

    const root = document.createElement("div");
    root.className = "root";
    root.innerHTML = `
      <div class="panel" id="tr-panel">
        <canvas class="net-canvas" id="tr-net"></canvas>
        <div class="panel-header" id="tr-drag">
          <img class="panel-logo" src="${iconUrl}" alt="" />
          <div class="panel-titles">
            <div class="panel-title">Trustable</div>
            <div class="panel-sub">Content trust analysis</div>
          </div>
          <button class="icon-btn" id="tr-settings" title="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button class="icon-btn" id="tr-min" title="Minimize">&minus;</button>
        </div>
        <div class="menu" id="tr-menu">
          <div class="menu-title">Hide widget</div>
          <button class="menu-item" data-hide="1800000" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
            Hide for 30 minutes
          </button>
          <button class="menu-item" data-hide="7200000" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
            Hide for 2 hours
          </button>
          <button class="menu-item" data-hide="session" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            Hide for this session
          </button>
          <div class="menu-hint">Click the toolbar icon to bring it back.</div>
        </div>
        <div class="panel-body">
          <div class="status loading" id="tr-status">
            <span class="dot"></span><span class="spin"></span>
            <span id="tr-status-text">Starting analysis&hellip;</span>
            <button class="rescan-icon" id="tr-rescan" type="button" title="Re-scan page">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>
          </div>
          <div id="tr-result"></div>
        </div>
      </div>
      <div class="fab" id="tr-fab" title="Trustable">
        <img src="${iconUrl}" alt="Trustable" />
        <span class="fab-badge" id="tr-badge"></span>
      </div>
    `;
    shadow.appendChild(root);
    (document.body || document.documentElement).appendChild(host);

    els = {
      host,
      root,
      panel: shadow.getElementById("tr-panel"),
      fab: shadow.getElementById("tr-fab"),
      badge: shadow.getElementById("tr-badge"),
      drag: shadow.getElementById("tr-drag"),
      minBtn: shadow.getElementById("tr-min"),
      settingsBtn: shadow.getElementById("tr-settings"),
      menu: shadow.getElementById("tr-menu"),
      rescan: shadow.getElementById("tr-rescan"),
      status: shadow.getElementById("tr-status"),
      statusText: shadow.getElementById("tr-status-text"),
      result: shadow.getElementById("tr-result"),
      net: shadow.getElementById("tr-net"),
    };

    // Animated network background
    if (globalThis.TrustableNetwork && els.net) {
      netCtl = globalThis.TrustableNetwork.start(els.net, {
        lineRGB: "148,163,184",
        accentRGB: "107,114,128",
      });
    }

    applyPosition();
    setPanelOpen(state.open, false);

    // Interactions
    els.fab.addEventListener("click", (e) => {
      if (fabWasDragged) {
        fabWasDragged = false;
        return;
      }
      togglePanel();
    });
    els.minBtn.addEventListener("click", () => setPanelOpen(false));
    els.rescan.addEventListener("click", () => classifyAndDisplay());

    // Settings menu
    els.settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.menu.classList.toggle("open");
    });
    els.menu.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = e.target.closest(".menu-item");
      if (!item) return;
      const val = item.getAttribute("data-hide");
      if (val === "session") hideForSession();
      else hideForMs(Number(val));
    });
    // Close menu when clicking anywhere else (inside shadow or on the page).
    shadow.addEventListener("click", (e) => {
      if (!e.composedPath().includes(els.menu)) closeMenu();
    });
    document.addEventListener("click", closeMenu);

    enableDrag(els.fab);
    enableDrag(els.drag);

    return els;
  }

  function closeMenu() {
    if (els?.menu) els.menu.classList.remove("open");
  }

  function applyPosition() {
    if (!els) return;
    els.root.style.right = `${state.right}px`;
    els.root.style.bottom = `${state.bottom}px`;
    els.root.style.left = "auto";
    els.root.style.top = "auto";
  }

  function setPanelOpen(open, persist = true) {
    state.open = open;
    if (els) els.panel.classList.toggle("open", open);
    if (persist) saveState();
    if (open && !lastData && !busy) classifyAndDisplay();
  }

  function togglePanel() {
    setPanelOpen(!state.open);
  }

  // -------------------------------------------------------------------------
  // Dragging (moves the whole widget, remembers position)
  // -------------------------------------------------------------------------
  let fabWasDragged = false;

  function enableDrag(handle) {
    let startX, startY, startRight, startBottom, moved;

    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const pt = e.touches ? e.touches[0] : e;
      startX = pt.clientX;
      startY = pt.clientY;
      startRight = state.right;
      startBottom = state.bottom;
      moved = false;
      els.fab.classList.add("dragging");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    };

    const onMove = (e) => {
      const pt = e.touches ? e.touches[0] : e;
      const dx = pt.clientX - startX;
      const dy = pt.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (e.cancelable) e.preventDefault();

      const maxRight = window.innerWidth - 66;
      const maxBottom = window.innerHeight - 66;
      state.right = Math.max(6, Math.min(maxRight, startRight - dx));
      state.bottom = Math.max(6, Math.min(maxBottom, startBottom - dy));
      applyPosition();
    };

    const onUp = () => {
      els.fab.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      if (moved) {
        fabWasDragged = true;
        saveState();
      }
    };

    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive: false });
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  function setStatus(text, cls) {
    if (!els) return;
    els.statusText.textContent = text;
    els.status.className = `status ${cls || ""}`.trim();
  }

  function setBusy(b) {
    busy = b;
    if (!els) return;
    els.rescan.disabled = b;
    els.rescan.classList.toggle("spinning", b);
  }

  function setBadge(cls) {
    if (!els) return;
    els.badge.className = `fab-badge ${cls || ""}`.trim();
    els.badge.textContent = cls === "good" ? "\u2713" : cls === "bad" ? "!" : "";
  }

  function showSkeletonMessage(msg) {
    if (!els) return;
    els.result.innerHTML = `<div class="card"><div class="message">${escapeHtml(msg)}</div></div>`;
  }

  function animateNumber(el, from, to, duration) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (from + (to - from) * eased).toFixed(2);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  let lastData = null;

  function renderResult(data) {
    lastData = data;
    if (!els) return;

    const prediction = String(data.prediction || "unknown");
    const isBad = prediction.toLowerCase() === "spam";
    const tone = isBad ? "bad" : "good";
    const icon = isBad ? "\u26A0\uFE0F" : "\u2713";

    const score = Number(data.trust_score);
    const scorePct = Math.max(0, Math.min(100, Math.round(score * 100)));

    let featuresHtml = "";
    if (Array.isArray(data.top_features) && data.top_features.length) {
      const maxContrib = Math.max(
        ...data.top_features.map((f) => Math.abs(Number(f.contribution)) || 0),
        1e-6,
      );
      const rows = data.top_features
        .map((f, i) => {
          // Display convention: positive = Ham (trust, green), negative = Spam (red).
          // Server emits positive = Spam, so negate for display.
          const contrib = -(Number(f.contribution) || 0);
          const pct = Math.max(4, Math.round((Math.abs(contrib) / maxContrib) * 100));
          const dir = contrib >= 0 ? "pos" : "neg";
          const label = contrib >= 0 ? "Ham" : "Spam";
          const val = `${contrib >= 0 ? "+" : "\u2212"}${Math.abs(contrib).toFixed(3)}`;
          return `
            <div class="feature" style="animation-delay:${0.1 + i * 0.07}s">
              <div class="feature-head">
                <span class="feature-name" title="${escapeHtml(f.feature)}">${escapeHtml(f.feature)}</span>
                <span class="feature-meta">
                  <span class="feature-val ${dir}">${val}</span>
                  <span class="feature-tag">${label}</span>
                </span>
              </div>
              <div class="feature-track">
                <div class="feature-fill ${dir}" data-pct="${pct}"></div>
              </div>
            </div>`;
        })
        .join("");
      featuresHtml = `
        <div class="features" id="tr-reasons">
          <button class="features-toggle" id="tr-reasons-toggle" type="button">
            <span>Why this score${data.top_features.length ? ` (${data.top_features.length})` : ""}</span>
            <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="features-panel">
            <div class="features-title">All contributing features</div>
            ${rows}
          </div>
        </div>`;
    }

    els.result.innerHTML = `
      <div class="card">
        <div class="score-ring">
          <svg viewBox="0 0 120 120">
            <circle class="ring-track" cx="60" cy="60" r="54"></circle>
            <circle class="ring-progress ${tone}" id="tr-ring" cx="60" cy="60" r="54"></circle>
          </svg>
          <div class="ring-center">
            <div class="ring-score ${tone}" id="tr-score">0.00</div>
            <div class="ring-verdict ${tone}">${icon} ${escapeHtml(prediction)}</div>
            <div class="ring-label">Trust score</div>
          </div>
        </div>
        ${featuresHtml}
      </div>`;

    const shadow = els.host.shadowRoot;
    requestAnimationFrame(() => {
      const ring = shadow.getElementById("tr-ring");
      if (ring) ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - scorePct / 100));
      const valueEl = shadow.getElementById("tr-score");
      if (valueEl && Number.isFinite(score)) animateNumber(valueEl, 0, score, 900);
      const reasons = shadow.getElementById("tr-reasons");
      const toggle = shadow.getElementById("tr-reasons-toggle");
      if (toggle && reasons) {
        toggle.addEventListener("click", () => {
          const nowOpen = reasons.classList.toggle("open");
          if (nowOpen) {
            // (re)animate the bars each time the dropdown pops open
            shadow.querySelectorAll(".feature-fill").forEach((el) => {
              const pct = el.getAttribute("data-pct");
              el.style.width = "0%";
              requestAnimationFrame(() => (el.style.width = `${pct}%`));
            });
          }
        });
      }
    });

    setBadge(tone);
    if (netCtl) netCtl.setAccent(isBad ? "239,68,68" : "34,197,94");
  }

  // -------------------------------------------------------------------------
  // Classify
  // -------------------------------------------------------------------------
  async function classifyAndDisplay() {
    buildWidget();
    const text = scrapeText();

    if (!text) {
      setStatus("No readable text found", "error");
      setBadge("");
      showSkeletonMessage("No readable text was found on this page.");
      return;
    }

    setBusy(true);
    setStatus("Analyzing page\u2026", "loading");
    setBadge("loading");

    const endpoints = [
      "http://127.0.0.1:8000/classify",
      "http://localhost:8000/classify",
    ];

    let lastErr = "";
    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!resp.ok) {
          lastErr = `${resp.status}`;
          continue;
        }
        const data = await resp.json();
        if (!data || !data.prediction) {
          lastErr = "bad response";
          continue;
        }
        setStatus("Analysis complete", "done");
        renderResult(data);
        setBusy(false);
        return;
      } catch (err) {
        lastErr = err?.message || "network error";
      }
    }

    setStatus("Classify failed", "error");
    setBadge("bad");
    showSkeletonMessage(
      `Unable to reach the classifier API (${lastErr}). Make sure the local server is running on port 8000.`,
    );
    setBusy(false);
  }

  // -------------------------------------------------------------------------
  // Popup messaging support
  // -------------------------------------------------------------------------
  if (hasChrome && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg.action !== "string") return;

      if (msg.action === "ping") {
        sendResponse({ ok: true });
        return;
      }
      if (msg.action === "scrapePage") {
        sendResponse({ text: scrapeText() });
        return;
      }
      if (msg.action === "classifyAndDisplay") {
        setPanelOpen(true);
        classifyAndDisplay()
          .then(() => sendResponse({ ok: true }))
          .catch((e) => sendResponse({ ok: false, error: e?.message || "error" }));
        return true;
      }
      if (msg.action === "toggleWidget") {
        // Bring the widget back (clears any active hide) and toggle the panel.
        const wasHidden = els?.host?.style.display === "none" || !els;
        clearHide();
        showWidget();
        if (wasHidden) {
          setPanelOpen(true);
          if (!lastData && !busy) classifyAndDisplay();
        } else {
          togglePanel();
        }
        sendResponse({ ok: true });
        return;
      }
    });
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  function boot() {
    loadState().then(async (s) => {
      state = s;

      // Respect an active "hide" choice — stay out of the way until it expires
      // or the user clicks the toolbar icon.
      if (await isHidden()) {
        if (state.hiddenUntil && Date.now() < state.hiddenUntil) {
          const remaining = state.hiddenUntil - Date.now();
          autoShowTimer = setTimeout(() => {
            clearHide();
            showWidget();
            setPanelOpen(false, false);
            classifyAndDisplay();
          }, remaining);
        }
        return;
      }

      buildWidget();
      // Run analysis once so the badge reflects the page right away.
      setTimeout(() => classifyAndDisplay(), 500);
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

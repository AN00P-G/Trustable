(() => {
  if (globalThis.__trustableContentInitialized) return;
  globalThis.__trustableContentInitialized = true;

  const MAX_LEN = 2000;
  const MAX_LINES = 30;

  function scrapeText() {
    // Prefer main content containers; fallback to common text elements.
    const candidates = document.querySelectorAll(
      "article, main, section, p, h1, h2, h3, li, div",
    );
    const seen = new Set();
    const lines = [];

    for (const el of candidates) {
      const txt = (el.innerText || "").trim();
      if (!txt) continue;

      // Basic noise filtering: skip very short nav-like strings
      if (txt.length < 3) continue;
      if (txt.length > 10000 && el.tagName.toLowerCase() === "li") continue;

      if (seen.has(txt)) continue; // drop duplicates
      seen.add(txt);
      lines.push(txt);
      if (lines.length >= MAX_LINES) break;
    }

    return lines.join("\n").slice(0, MAX_LEN);
  }

  function ensureStyles() {
    if (document.getElementById("trustable-banner-styles")) return;
    const style = document.createElement("style");
    style.id = "trustable-banner-styles";
    style.textContent = `
      @keyframes trustable-in {
        0% { opacity: 0; transform: translateY(16px) scale(0.96); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes trustable-spin { to { transform: rotate(360deg); } }
      @keyframes trustable-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.75); }
      }
      #trustable-banner {
        position: fixed;
        bottom: 18px;
        right: 18px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 12px;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 13px;
        line-height: 1.35;
        max-width: 260px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(4px);
        animation: trustable-in 0.45s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        transition: background 0.35s ease, transform 0.2s ease, opacity 0.35s ease;
        cursor: default;
      }
      #trustable-banner .trustable-icon {
        flex: 0 0 auto;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #trustable-banner .trustable-icon .trustable-loader {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #fff;
        border-radius: 50%;
        animation: trustable-spin 0.7s linear infinite;
      }
      #trustable-banner .trustable-icon .trustable-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #fff;
        animation: trustable-pulse 1s ease-in-out infinite;
      }
      #trustable-banner .trustable-msg { white-space: pre-wrap; font-weight: 500; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function showBanner(message, color = "#1a73e8", state = "info") {
    ensureStyles();
    let banner = document.getElementById("trustable-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "trustable-banner";
      banner.innerHTML =
        '<span class="trustable-icon"></span><span class="trustable-msg"></span>';
      (document.body || document.documentElement).appendChild(banner);
    }

    banner.style.background = color;

    const iconEl = banner.querySelector(".trustable-icon");
    if (state === "loading") {
      iconEl.innerHTML = '<span class="trustable-loader"></span>';
    } else if (state === "good") {
      iconEl.textContent = "\u2713";
      iconEl.style.fontSize = "18px";
    } else if (state === "bad") {
      iconEl.textContent = "\u26A0\uFE0F";
      iconEl.style.fontSize = "16px";
    } else {
      iconEl.innerHTML = '<span class="trustable-dot"></span>';
    }

    banner.querySelector(".trustable-msg").textContent = message;
  }

  async function classifyAndDisplay() {
    const text = scrapeText();
    if (!text) {
      showBanner("Trustable: no text found", "#6b7280", "info");
      return;
    }

    showBanner("Trustable: analyzing page\u2026", "#18181b", "loading");

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
        const trust = Number(data.trust_score).toFixed(2);
        const isSpam = data.prediction.toLowerCase() === "spam";
        const color = isSpam ? "#dc2626" : "#16a34a";
        showBanner(
          `Trustable: ${data.prediction}\nTrust score: ${trust}`,
          color,
          isSpam ? "bad" : "good",
        );
        return;
      } catch (err) {
        lastErr = err?.message || "network error";
      }
    }
    showBanner(`Trustable: classify failed\n${lastErr}`, "#dc2626", "bad");
  }

  // Support popup messaging; prevents reinjection loops.
  if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage) {
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
        classifyAndDisplay()
          .then(() => sendResponse({ ok: true }))
          .catch((e) => sendResponse({ ok: false, error: e?.message || "error" }));
        return true;
      }
    });
  }

  // Auto-run once per page load (after a short delay so the DOM has content).
  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(classifyAndDisplay, 500);
  });
})();


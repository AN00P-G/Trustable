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

  function showBanner(message, color = "#1a73e8") {
    let banner = document.getElementById("trustable-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "trustable-banner";
      Object.assign(banner.style, {
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: 2147483647,
        padding: "10px 12px",
        borderRadius: "6px",
        color: "white",
        fontFamily: "Arial, sans-serif",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        maxWidth: "240px",
        background: color,
        whiteSpace: "pre-wrap",
      });
      (document.body || document.documentElement).appendChild(banner);
    }
    banner.style.background = color;
    banner.textContent = message;
  }

  async function classifyAndDisplay() {
    const text = scrapeText();
    if (!text) {
      showBanner("Trustable: no text found", "#9e9e9e");
      return;
    }

    showBanner("Trustable: classifying...", "#1a73e8");

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
        const color =
          data.prediction.toLowerCase() === "spam" ? "#d93025" : "#188038";
        showBanner(`Trustable: ${data.prediction}\nTrust: ${trust}`, color);
        return;
      } catch (err) {
        lastErr = err?.message || "network error";
      }
    }
    showBanner(`Trustable: classify failed\n${lastErr}`, "#d93025");
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


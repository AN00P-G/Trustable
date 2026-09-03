const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('status-text');
const resultEl = document.getElementById('result');
const rescanBtn = document.getElementById('rescan');

// Animated network background
let netCtl = null;
(function initNetwork() {
  const canvas = document.getElementById('net-bg');
  if (canvas && window.TrustableNetwork) {
    netCtl = window.TrustableNetwork.start(canvas, {
      lineRGB: '148,163,184',
      accentRGB: '107,114,128',
    });
  }
})();

function setStatus(text, state) {
  statusTextEl.textContent = text;
  statusEl.className = `status ${state || ''}`.trim();
}

function setBusy(busy) {
  rescanBtn.disabled = busy;
  rescanBtn.classList.toggle('spinning', busy);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showSkeleton() {
  resultEl.innerHTML = `
    <div class="card">
      <div class="skeleton sk-lg"></div>
      <div class="skeleton sk-line" style="width: 40%;"></div>
      <div class="skeleton sk-line"></div>
      <div class="skeleton sk-line" style="width: 80%;"></div>
      <div class="skeleton sk-line" style="width: 60%;"></div>
    </div>`;
}

function showMessage(msg) {
  resultEl.innerHTML = `<div class="card"><div class="message">${escapeHtml(msg)}</div></div>`;
}

function renderResult(data) {
  const prediction = String(data.prediction || 'unknown');
  const isBad = prediction.toLowerCase() === 'spam';
  const tone = isBad ? 'bad' : 'good';
  const icon = isBad ? '\u26A0\uFE0F' : '\u2713';

  const score = Number(data.trust_score);
  const scorePct = Math.max(0, Math.min(100, Math.round(score * 100)));

  let featuresHtml = '';
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
        const dir = contrib >= 0 ? 'pos' : 'neg';
        const label = contrib >= 0 ? 'Ham' : 'Spam';
        const val = `${contrib >= 0 ? '+' : '\u2212'}${Math.abs(contrib).toFixed(3)}`;
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
      .join('');

    featuresHtml = `
      <div class="features" id="reasons">
        <button class="features-toggle" id="reasons-toggle" type="button">
          <span>Why this score (${data.top_features.length})</span>
          <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="features-panel">
          <div class="features-title">All contributing features</div>
          ${rows}
        </div>
      </div>`;
  }

  const CIRCUMFERENCE = 339.292; // 2 * PI * r (r = 54)

  resultEl.innerHTML = `
    <div class="card">
      <div class="score-ring">
        <svg viewBox="0 0 120 120">
          <circle class="ring-track" cx="60" cy="60" r="54"></circle>
          <circle class="ring-progress ${tone}" id="ring-progress" cx="60" cy="60" r="54"></circle>
        </svg>
        <div class="ring-center">
          <div class="ring-score ${tone}" id="score-value">0.00</div>
          <div class="ring-verdict ${tone}">${icon} ${escapeHtml(prediction)}</div>
          <div class="ring-label">Trust score</div>
        </div>
      </div>

      ${featuresHtml}
    </div>`;

  requestAnimationFrame(() => {
    const ring = document.getElementById('ring-progress');
    if (ring) {
      const offset = CIRCUMFERENCE * (1 - scorePct / 100);
      ring.style.strokeDashoffset = String(offset);
    }

    const valueEl = document.getElementById('score-value');
    if (valueEl && Number.isFinite(score)) animateNumber(valueEl, 0, score, 900);

    const reasons = document.getElementById('reasons');
    const toggle = document.getElementById('reasons-toggle');
    if (toggle && reasons) {
      toggle.addEventListener('click', () => {
        const nowOpen = reasons.classList.toggle('open');
        if (nowOpen) {
          document.querySelectorAll('.feature-fill').forEach((el) => {
            const pct = el.getAttribute('data-pct');
            el.style.width = '0%';
            requestAnimationFrame(() => (el.style.width = `${pct}%`));
          });
        }
      });
    }
  });

  if (netCtl) netCtl.setAccent(isBad ? '239,68,68' : '34,197,94');
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

function classifyAndShow() {
  setBusy(true);
  setStatus('Scraping page…', 'loading');
  showSkeleton();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      setStatus('No active tab', 'error');
      showMessage('Could not find an active tab to analyze.');
      setBusy(false);
      return;
    }

    const tabId = tabs[0].id;

    const classify = (scraped) => {
      setStatus('Classifying…', 'loading');

      const endpoints = [
        'http://127.0.0.1:8000/classify',
        'http://localhost:8000/classify',
      ];

      const tryFetch = (idx) => {
        if (idx >= endpoints.length) {
          setStatus('Classify failed', 'error');
          showMessage('Unable to reach the classifier API. Make sure the local server is running on port 8000.');
          setBusy(false);
          return;
        }
        const url = endpoints[idx];
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: scraped }),
        })
          .then(async (r) => {
            if (!r.ok) {
              const msg = await r.text();
              throw new Error(`${r.status} ${msg}`);
            }
            return r.json();
          })
          .then((data) => {
            if (!data || !data.prediction) {
              setStatus('Unexpected response', 'error');
              showMessage('The classifier returned an unexpected response.');
              setBusy(false);
              return;
            }
            setStatus('Analysis complete', 'done');
            renderResult(data);
            setBusy(false);
          })
          .catch((err) => {
            if (idx === endpoints.length - 1) {
              setStatus('Classify failed', 'error');
              showMessage(err.message || 'An error occurred while classifying.');
              setBusy(false);
              return;
            }
            tryFetch(idx + 1);
          });
      };

      tryFetch(0);
    };

    const sendScrape = () => {
      chrome.tabs.sendMessage(tabId, { action: 'scrapePage' }, (response) => {
        if (chrome.runtime.lastError) {
          setStatus('Content script not ready', 'error');
          showMessage('Could not read the page content. Try reloading the tab.');
          setBusy(false);
          return;
        }
        const scraped = response?.text || '';

        if (!scraped) {
          setStatus('No text found', 'error');
          showMessage('No readable text was found on this page.');
          setBusy(false);
          return;
        }

        classify(scraped);
      });
    };

    chrome.tabs.sendMessage(tabId, { action: 'ping' }, () => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
          if (chrome.runtime.lastError) {
            setStatus('Cannot inject content script', 'error');
            showMessage('This page does not allow the extension to run (e.g. browser system pages).');
            setBusy(false);
            return;
          }
          sendScrape();
        });
      } else {
        sendScrape();
      }
    });
  });
}

rescanBtn.addEventListener('click', classifyAndShow);

document.addEventListener('DOMContentLoaded', () => {
  classifyAndShow();
});

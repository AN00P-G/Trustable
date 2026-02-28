const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');

function classifyAndShow() {
  statusEl.textContent = 'Scraping...';
  resultEl.textContent = '(not yet classified)';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      statusEl.textContent = 'No active tab';
      return;
    }

    const tabId = tabs[0].id;

    const classify = (scraped) => {
      statusEl.textContent = 'Classifying...';

      const endpoints = [
        'http://127.0.0.1:8000/classify',
        'http://localhost:8000/classify',
      ];

      const tryFetch = (idx) => {
        if (idx >= endpoints.length) {
          statusEl.textContent = 'Classify failed';
          resultEl.textContent = 'Unable to reach classifier API';
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
            statusEl.textContent = 'Done';
            if (!data || !data.prediction) {
              resultEl.textContent = 'Unexpected response';
              return;
            }
            const lines = [];
            lines.push(`Predicted: ${data.prediction}`);
            lines.push(`Trust score: ${data.trust_score.toFixed(2)}`);

            if (data.top_features && data.top_features.length) {
              lines.push('', 'Top contributing features:');
              data.top_features.forEach((f) => {
                const contrib = Number(f.contribution).toFixed(4);
                lines.push(`- '${f.feature}'  (${f.label})  contrib: ${contrib}`);
              });
            }

            resultEl.textContent = lines.join('\n');
          })
          .catch((err) => {
            if (idx === endpoints.length - 1) {
              statusEl.textContent = 'Classify failed';
              resultEl.textContent = err.message || 'Error';
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
          statusEl.textContent = 'Content script not ready';
          return;
        }
        statusEl.textContent = 'Scraped text ready';
        const scraped = response?.text || '';

        if (!scraped) {
          resultEl.textContent = 'No text to classify';
          return;
        }

        classify(scraped);
      });
    };

    chrome.tabs.sendMessage(tabId, { action: 'ping' }, () => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
          if (chrome.runtime.lastError) {
            statusEl.textContent = 'Cannot inject content script';
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

// Run automatically when popup opens
document.addEventListener('DOMContentLoaded', () => {
  classifyAndShow();
});
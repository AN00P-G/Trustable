# Trustable

**Trustable** is an explainable machine learning browser extension that
classifies webpage content as spam or legitimate and shows the user exactly
which words and phrases drove that decision. It combines a TF-IDF + Logistic
Regression pipeline with a Flask API backend and a Chrome/Chromium extension
frontend. Everything runs locally on your machine — no cloud service, no data
leaving your device.

---

## How It Works

When you open the extension popup on any webpage, the content script scrapes
up to 2,000 characters of visible text and sends it to a local Flask server.
The server runs the text through a trained pipeline and returns:

- **Prediction** — `spam` or `ham`
- **Trust score** — a number from 0.0 (very suspicious) to 1.0 (very trustworthy), computed as `1 - P(spam)`
- **Top contributing features** — the specific words and phrases that most influenced the prediction, labeled as spam-leaning or ham-leaning with numeric contribution scores

An inline banner also appears in the bottom-right corner of every page
automatically when the extension is active.

---

## Requirements

- Python 3.13 or higher
- [uv](https://docs.astral.sh/uv/) package manager
- Google Chrome or any Chromium-based browser (Edge, Brave, etc.)

No dataset is required. A pretrained model (`src/spam_pipeline.joblib`) is
included in the repository and loads automatically on first run.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/Trustable.git
cd Trustable
```

### 2. Install Python dependencies

```bash
uv sync
```

### 3. Start the backend server

```bash
cd src
uv run server.py
```

The server starts at `http://127.0.0.1:8000` and loads the pretrained model
instantly. No dataset or training step required.

### 4. Load the browser extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `my_extension/` folder from this repository

The Trustable icon will appear in your toolbar. Click it on any page to
classify that page's content.

---

## Usage

### Browser Extension

Once the extension is loaded and the server is running:

- **Click the toolbar icon** on any page to open the popup. It will
  automatically scrape and classify the page, showing the prediction, trust
  score, and top contributing features.
- **Inline banner** — the extension also injects a small banner in the
  bottom-right corner of each page automatically after the page loads,
  showing the prediction and trust score (green for ham, red for spam).

Example popup output:

```
Predicted: spam
Trust score: 0.08

Top contributing features:
- 'free prize'    (Spam)   contrib: 0.4821
- 'click here'    (Spam)   contrib: 0.3109
- 'limited time'  (Spam)   contrib: 0.2744
- 'your account'  (Ham)    contrib: -0.1203
- 'verify'        (Spam)   contrib: 0.0987
```

### API

The server exposes a single endpoint that accepts any text:

```bash
curl -X POST http://127.0.0.1:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "Congratulations! You have won a free iPhone. Click here to claim."}'
```

Response:

```json
{
  "prediction": "spam",
  "trust_score": 0.04,
  "top_features": [
    {"feature": "free iphone", "contribution": 0.512, "label": "Spam"},
    {"feature": "click here",  "contribution": 0.389, "label": "Spam"},
    {"feature": "claim",       "contribution": 0.271, "label": "Spam"}
  ]
}
```

### Interactive CLI

```bash
cd src
uv run main.py
```

```
Enter an SMS message to classify as spam or ham ("quit" to exit): Get a free iPhone now!

SMS: Get a free iPhone now!
Predicted: spam, Trust score: 0.06

Top contributing features:
Feature: 'free iphone', Contribution: 0.5120 --> Spam
Feature: 'free',        Contribution: 0.3840 --> Spam
Feature: 'iphone',      Contribution: 0.2910 --> Spam
```

---

## Running the Benchmark

The benchmark script evaluates the pretrained model against `src/test.csv`,
an unseen balanced dataset of 4,000 messages (2,000 ham, 2,000 spam), running
10,000 inference passes to measure accuracy and timing stability.

```bash
cd src
uv run test.py
```

Expected results:

| Metric | Value |
|---|---|
| Accuracy | 93.47% |
| Ham F1 | 0.9382 |
| Spam F1 | 0.9309 |
| Spam precision | 98.88% |
| Mean inference time | 43.73 ms per 4,000 samples |
| Prediction consistency | True (identical across all 10,000 runs) |

---

## Adding Your Own Training Data (Optional)

To retrain the model on custom data, create `src/Dataset/` and drop labeled
CSV files into it. The preprocessing pipeline normalizes column names and
labels automatically.

Supported column name formats:

| Column names | Example source |
|---|---|
| `v1`, `v2` | UCI SMS Spam Collection |
| `label`, `text` | Generic format |
| `category`, `message` | Alternative SMS format |
| `email`, `label` | Email datasets |

Supported label encodings (all mapped to `ham` or `spam` automatically):

| Input value | Mapped to |
|---|---|
| `spam`, `junk`, `phishing`, `bad`, `1` | `spam` |
| `ham`, `not spam`, `legit`, `ok`, `0` | `ham` |

After adding data, restart the server. It will detect the change via MD5
hash and retrain automatically.

---

## Project Structure

```
Trustable/
├── src/
│   ├── Dataset/              # place custom training CSVs here (gitignored)
│   ├── main.py               # interactive CLI entry point
│   ├── model.py              # pipeline training, caching, and explain()
│   ├── preprocess.py         # CSV loading, normalization, train/test split
│   ├── server.py             # Flask API server
│   ├── test.py               # benchmark evaluation script
│   ├── test.csv              # unseen benchmark dataset (4,000 samples)
│   ├── spam_pipeline.joblib  # pretrained model (loaded automatically)
│   └── spam_pipeline.hash    # hash of training data for cache invalidation
├── my_extension/
│   ├── manifest.json         # Chrome Manifest V3 config
│   ├── content.js            # page scraping and inline banner
│   ├── popup.html            # extension popup UI
│   ├── popup.js              # popup logic and API calls
│   └── icon.png              # extension icon
├── pyproject.toml            # Python project and dependency config
└── uv.lock                   # locked dependency versions
```

---

## Continuous Integration

The repository includes a GitHub Actions workflow (`.github/workflows/test.yml`)
that runs the CLI automatically on Ubuntu, Windows, and macOS on every push
to `main`. This verifies that the pretrained model loads and classifies
correctly across all three platforms without any setup beyond `uv sync`.

---

## Model Details

| Component | Configuration |
|---|---|
| Feature extraction | TF-IDF, unigrams and bigrams, `min_df=3` |
| Classifier | Logistic Regression, `class_weight="balanced"`, `max_iter=1000` |
| Train/test split | 80/20, `random_state=22` |
| Cache invalidation | MD5 hash of training CSV |
| Serialization | joblib |

---

## Troubleshooting

**Server not reachable from extension**

Make sure `server.py` is running before opening the extension popup. The
server must be started manually.

**Extension shows "Content script not ready"**

Reload the page and try again. This can happen on pages that restrict script
injection (e.g., the Chrome Web Store itself).

**Model retrains unexpectedly on startup**

This happens when `src/Dataset/` contains CSV files and their content has
changed since the last run. Remove or empty `src/Dataset/` to always use
the included pretrained model.

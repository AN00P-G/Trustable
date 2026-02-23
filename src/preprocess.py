"""Preprocess datasets and consolidate into a single spam.csv for training.

Looks for CSVs in src/Dataset/ (any *.csv), merges them with the base spam.csv,
normalizes columns, dedupes, and writes back to src/spam.csv.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pandas as pd
from sklearn.model_selection import train_test_split


DATA_PATH = Path(__file__).resolve().parent / "spam.csv"
DATASETS_DIR = Path(__file__).resolve().parent / "Dataset"

# Optional: add extra arbitrary CSV paths here (absolute or relative).
EXTRA_DATASETS: list[str] = []


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = {c.lower(): c for c in df.columns}

    # Common known patterns
    patterns = [
        ({"label": "label", "text": "text"}, {"label", "text"}),
        ({"v1": "label", "v2": "text"}, {"v1", "v2"}),
        ({"category": "label", "message": "text"}, {"category", "message"}),
        ({"email_text": "text", "label": "label"}, {"email_text", "label"}),
        ({"email": "text", "label": "label"}, {"email", "label"}),
        ({"text": "text", "label": "label"}, {"text", "label"}),
    ]

    for mapping, needed in patterns:
        if needed.issubset(
            set(cols)
        ):  # all required columns present (case-insensitive)
            renamed = {cols[k]: v for k, v in mapping.items()}
            return df.rename(columns=renamed)[["label", "text"]]

    # Heuristic fallback: pick one label-like and one text-like column
    label_candidates = [
        c
        for c in df.columns
        if c.lower() in {"label", "category", "target", "class", "label_num"}
    ]
    text_candidates = [
        c
        for c in df.columns
        if c.lower() in {"text", "message", "email", "email_text", "content"}
    ]
    if label_candidates and text_candidates:
        return df.rename(
            columns={label_candidates[0]: "label", text_candidates[0]: "text"}
        )[["label", "text"]]

    # Last-resort heuristic: if there are at least 2 columns, take first as label, second as text
    if len(df.columns) >= 2:
        c1, c2 = df.columns[:2]
        return df.rename(columns={c1: "label", c2: "text"})[["label", "text"]]

    raise ValueError(
        "CSV must have recognizable label/text columns; expected one of [label,text], [v1,v2], [category,message], [email_text,label], [email,label], or [text,label]."
    )


def _load_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, encoding="latin-1")


def _dataset_csvs() -> list[Path]:
    if not DATASETS_DIR.exists():
        return []
    return sorted(DATASETS_DIR.glob("*.csv"))


def load_and_merge(extra_paths: Iterable[str] | None = None) -> pd.DataFrame:
    paths = [DATA_PATH]
    paths.extend(_dataset_csvs())
    if extra_paths:
        paths.extend([Path(p) for p in extra_paths])

    frames = []
    for p in paths:
        if not p.exists():
            continue
        try:
            df = _normalize_columns(_load_csv(p))
            frames.append(df)
        except Exception as exc:  # keep going but report
            print(f"Skipping {p.name}: {exc}")
            continue

    if not frames:
        raise FileNotFoundError("No datasets found to load.")

    merged = pd.concat(frames, ignore_index=True)
    merged = merged.dropna(subset=["label", "text"])

    def _norm_label(val: object) -> str | None:
        """Map various label codings to 'ham' or 'spam'; drop unrecognized."""
        # Numeric labels
        if isinstance(val, (int, float)):
            if int(val) == 1:
                return "spam"
            if int(val) == 0:
                return "ham"

        s = str(val).strip().lower()
        # Numeric-like strings
        try:
            num = float(s)
            if num == 1:
                return "spam"
            if num == 0:
                return "ham"
        except Exception:
            pass

        if s in {"spam", "junk", "spam mail", "spam_message", "bad", "phishing"}:
            return "spam"
        if s in {
            "ham",
            "not spam",
            "legit",
            "ok",
            "ham mail",
            "ham_message",
            "notspam",
        }:
            return "ham"
        return None

    merged["label"] = merged["label"].apply(_norm_label)
    merged["text"] = merged["text"].astype(str).str.strip()

    merged = merged.dropna(subset=["label", "text"])
    merged = merged.drop_duplicates()

    merged.to_csv(DATA_PATH, index=False, encoding="utf-8")
    return merged


df = load_and_merge(EXTRA_DATASETS)

X = df["text"]
y = df["label"]
x_train, x_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=22
)

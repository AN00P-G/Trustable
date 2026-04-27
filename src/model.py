"""Model training, evaluation, and explanation helpers."""

import hashlib
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.pipeline import Pipeline


MODEL_PATH = Path(__file__).resolve().parent / "spam_pipeline.joblib"
HASH_PATH = MODEL_PATH.with_suffix(".hash")
DATA_PATH = Path(__file__).resolve().parent / "spam.csv"


def _data_hash() -> str:
    """MD5 hash of spam.csv — stable regardless of mtime."""
    if not DATA_PATH.exists():
        return ""
    return hashlib.md5(DATA_PATH.read_bytes()).hexdigest()


def _save_hash() -> None:
    HASH_PATH.write_text(_data_hash(), encoding="utf-8")


def _hash_changed() -> bool:
    if not DATA_PATH.exists():
        return False
    if not HASH_PATH.exists():
        return True
    return HASH_PATH.read_text(encoding="utf-8").strip() != _data_hash()


def _train_and_evaluate():
    # Only import preprocess when we actually need to retrain.
    from preprocess import x_train, x_test, y_train, y_test

    pipeline = Pipeline(
        [
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=3)),
            ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]
    )

    pipeline.fit(x_train, y_train)
    y_pred = pipeline.predict(x_test)

    print("-" * 100)
    print("\nModel Evaluation Report:")
    print(classification_report(y_test, y_pred))
    print("-" * 100)
    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, y_pred))
    print("")

    joblib.dump(pipeline, MODEL_PATH)
    _save_hash()
    print(f"Model trained and cached at {MODEL_PATH}")

    return pipeline


def _needs_retrain(pl):
    classes = set(map(str, pl.classes_))
    return not ({"ham", "spam"} <= classes and len(classes) == 2)


if MODEL_PATH.exists():
    loaded = joblib.load(MODEL_PATH)
    if _needs_retrain(loaded) or _hash_changed():
        print("Cached model out-of-date or classes wrong; retraining...")
        pipeline = _train_and_evaluate()
    else:
        pipeline = loaded
        print(f"Loaded cached model from {MODEL_PATH}")
else:
    print("No cached model found; training from scratch...")
    pipeline = _train_and_evaluate()


def _spam_prob(pipeline: Pipeline, texts: list[str]) -> np.ndarray:
    """Return probability of spam for each text, robust to class order."""
    probs = pipeline.predict_proba(texts)
    classes = list(pipeline.classes_)
    if "spam" in classes:
        idx = classes.index("spam")
        return probs[:, idx]
    if probs.shape[1] == 2:
        return probs[:, 1]
    for i, c in enumerate(classes):
        if isinstance(c, str) and "spam" in c.lower():
            return probs[:, i]
    return probs[:, -1]


def explain(sample_sms: str, top_k: int = 5):
    """Return prediction, trust_score, and top contributing features for a message."""
    pred = pipeline.predict([sample_sms])[0]
    prob_spam = float(_spam_prob(pipeline, [sample_sms])[0])
    trust_score = 1 - prob_spam

    tfidf_vectorizer = pipeline.named_steps["tfidf"]
    clf = pipeline.named_steps["clf"]
    features = tfidf_vectorizer.transform([sample_sms]).toarray()[0]
    feature_names = tfidf_vectorizer.get_feature_names_out()
    feature_importance = clf.coef_[0]

    contributions = features * feature_importance

    top_indices = np.argsort(np.abs(contributions))[-top_k:][::-1]
    top_features = []
    for idx in top_indices:
        if features[idx] == 0:
            continue
        contrib = float(contributions[idx])
        top_features.append(
            {
                "feature": feature_names[idx],
                "contribution": contrib,
                "label": "Spam" if contrib > 0 else "Ham",
            }
        )

    return {
        "prediction": pred,
        "trust_score": trust_score,
        "top_features": top_features,
    }

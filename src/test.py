"""Benchmark evaluation on untrained dataset using test.csv."""

import time
import csv
from pathlib import Path

import numpy as np
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

from model import pipeline

ITERATIONS = 10_000
TEST_CSV_PATH = Path(__file__).resolve().parent / "test.csv"

def run_benchmark():
    if not TEST_CSV_PATH.exists():
        print(f"test.csv not found at {TEST_CSV_PATH}")
        return

    # Load unseen dataset
    texts, true_labels = [], []
    with open(TEST_CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            label = row.get("label", "").strip().lower()
            text = row.get("text", "").strip()
            if label in {"ham", "spam"} and text:
                texts.append(text)
                true_labels.append(label)

    if not texts:
        print("No valid samples found in test.csv")
        return

    print("=" * 80)
    print(f"  BENCHMARK EVALUATION ({ITERATIONS:,} iterations on UNTRAINED dataset)")
    print("=" * 80)
    print(f"\nTest set size: {len(texts)} samples (from test.csv)")

    y_pred_baseline = pipeline.predict(texts)
    y_prob_baseline = pipeline.predict_proba(texts)

    print("\nBaseline Classification Report (Untrained dataset):")
    print(classification_report(true_labels, y_pred_baseline, digits=4))
    print("Confusion Matrix:")
    print(confusion_matrix(true_labels, y_pred_baseline))

    # Show misclassified samples
    misclassified = [
        (texts[i], true_labels[i], y_pred_baseline[i])
        for i in range(len(texts))
        if true_labels[i] != y_pred_baseline[i]
    ]
    print(f"\nMisclassified: {len(misclassified)} / {len(texts)}")
    if misclassified:
        print("\nSample misclassifications (up to 15):")
        for text, true, pred in misclassified[:15]:
            # Replace newlines with spaces and truncate to keep output clean
            snippet = text[:100].replace('\n', ' ')
            print(f"  True={true:4s}  Pred={pred:4s}  \"{snippet}...\"")
            
    print(f"\nRunning {ITERATIONS:,} prediction iterations...")
    iteration_times = []
    all_accuracies = []
    
    # Store just the first prediction to check consistency across all runs
    base_pred = y_pred_baseline
    consistent = True

    for i in range(ITERATIONS):
        start = time.perf_counter()
        y_pred = pipeline.predict(texts)
        elapsed = time.perf_counter() - start
        
        iteration_times.append(elapsed)
        all_accuracies.append(accuracy_score(true_labels, y_pred))
        
        # Fast consistency check without storing 10000 arrays
        if consistent and not np.array_equal(y_pred, base_pred):
            consistent = False
            
        if (i + 1) % 1000 == 0:
            print(f"  Completed {i + 1:>6,} / {ITERATIONS:,} iterations")

    times = np.array(iteration_times)
    accs = np.array(all_accuracies)

    print()
    print("=" * 80)
    print("  BENCHMARK RESULTS (Untrained Dataset)")
    print("=" * 80)
    print(f"\nTiming (per full test-set inference):")
    print(f"  Mean:   {times.mean() * 1000:>8.2f} ms")
    print(f"  Median: {np.median(times) * 1000:>8.2f} ms")
    print(f"  Std:    {times.std() * 1000:>8.2f} ms")
    print(f"  Min:    {times.min() * 1000:>8.2f} ms")
    print(f"  Max:    {times.max() * 1000:>8.2f} ms")
    print(f"  Total:  {times.sum():>8.2f} s")

    print(f"\nAccuracy (across {ITERATIONS:,} iterations):")
    print(f"  Mean: {accs.mean():.6f}  Std: {accs.std():.6f}  "
          f"Min: {accs.min():.6f}  Max: {accs.max():.6f}")

    print(f"\nPrediction consistency across all runs: {consistent}")

    classes = list(pipeline.classes_)
    spam_idx = classes.index("spam") if "spam" in classes else -1
    
    print()
    print("=" * 80)
    print("  FINAL EVALUATION (aggregated from benchmark)")
    print("=" * 80)
    print("\nClassification Report:")
    print(classification_report(true_labels, y_pred_baseline, digits=4))
    print("Confusion Matrix:")
    print(confusion_matrix(true_labels, y_pred_baseline))
    
    if spam_idx >= 0:
        spam_probs = y_prob_baseline[:, spam_idx]
        trust_scores = 1 - spam_probs
        labels_arr = np.array(true_labels)
        print(f"\nTrust Score Distribution:")
        print(f"  Ham  avg trust: {trust_scores[labels_arr == 'ham'].mean():.4f}")
        print(f"  Spam avg trust: {trust_scores[labels_arr == 'spam'].mean():.4f}")

    print()
    print("=" * 80)
    print("  Benchmark complete.")
    print("=" * 80)


if __name__ == "__main__":
    run_benchmark()

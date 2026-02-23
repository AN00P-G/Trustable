"""Entry point for interactive SMS classification using the cached pipeline."""

from model import pipeline, explain


def main():
    print("-" * 100)
    print("\nHello from trustable!")
    while True:
        sample_sms = [
            str(
                input(
                    '\nEnter an SMS message to classify as spam or ham ("quit" to exit): '
                )
            )
        ]
        if sample_sms[0].lower() == "quit":
            print("Exiting the application.")
            break
        else:
            pred = pipeline.predict(sample_sms)
            prob = pipeline.predict_proba(sample_sms)

            print(f"\nSMS: {sample_sms[0]}")
            print(f"Predicted: {pred[0]}, Trust score: {1 - prob[0][1]:.2f}")

            details = explain(sample_sms[0])
            top_features = details.get("top_features", [])
            if top_features:
                print("\nTop contributing features:")
                for f in top_features:
                    contrib = f.get("contribution", 0.0)
                    label = f.get("label", "")
                    feat = f.get("feature", "")
                    print(f"Feature: '{feat}', Contribution: {contrib:.4f} --> {label}")
                print("-" * 100)


if __name__ == "__main__":
    main()

""" Module main.py: Entry point for the Trustable SMS Spam Classifier application. """
from model import pipeline

def main():
    print("-" * 100)
    print("")
    print("Hello from trustable!")
    
    sample_sms = [str(input("Enter an SMS message to classify as spam or ham: "))]
    pred = pipeline.predict(sample_sms)
    prob = pipeline.predict_proba(sample_sms)

    print(f"\nSMS: {sample_sms[0]}")
    print(f"Predicted: {pred[0]}, Trust score: {1 - prob[0][1]:.2f}")


if __name__ == "__main__":
    main()

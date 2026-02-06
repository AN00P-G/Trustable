""" Model training and evaluation module """
from preprocess import X, y, x_train, x_test, y_train, y_test
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, confusion_matrix
import numpy as np


pipeline = Pipeline([
    ('tfidf', TfidfVectorizer(ngram_range=(1, 2), min_df=3)),
    ('clf', LogisticRegression(max_iter=1000, class_weight='balanced')),
])

pipeline.fit(x_train, y_train)
y_pred = pipeline.predict(x_test)

print("-" * 100)
print("\nModel Evaluation Report:")
print(classification_report(y_test, y_pred))
print("-" * 100)
print("\nConfusion Matrix:")
print(confusion_matrix(y_test, y_pred))
print("")

def explanation(sample_sms):
    """ Provides a simple explanation for the model's prediction on a given SMS message. """
    pred = pipeline.predict([sample_sms])[0]
    prob = pipeline.predict_proba([sample_sms])[0][1]  # Probability of being spam
    trust_score = 1 - prob  # Higher trust score means more likely to be ham


    TfidfVectorizer = pipeline.named_steps['tfidf']
    clf = pipeline.named_steps['clf']
    features = (TfidfVectorizer.transform([sample_sms])).toarray()[0]
    feature_names = TfidfVectorizer.get_feature_names_out()
    feature_importance = clf.coef_[0]
    
    contributions = features * feature_importance
    
    top_contributions = np.argsort(np.abs(contributions))[-5:][::-1]
    print("\nTop contributing features:")
    for i in top_contributions:
        if features[i] > 0:
            print(f"Feature: '{feature_names[i]}', Contribution: {-contributions[i]:.4f} --> {'Spam' if contributions[i] > 0 else 'Ham'}")
    print("-" * 100)

        
    return explanation

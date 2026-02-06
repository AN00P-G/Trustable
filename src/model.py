""" Model training and evaluation module """
from preprocess import X, y, x_train, x_test, y_train, y_test
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, confusion_matrix


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


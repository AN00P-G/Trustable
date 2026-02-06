"""Preprocessing module for data handling and preparation."""

import pandas as pd
from sklearn.model_selection import train_test_split


df  = pd.read_csv('spam.csv', encoding='latin-1')
df = df[['v1', 'v2']]
df.columns = ['label', 'text']

X = df['text']
y = df['label']
x_train, x_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=22)


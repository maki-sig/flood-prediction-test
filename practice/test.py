import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from xgboost import XGBRegressor
# xgbregressor for numbers, xgbclassifier for classifications

# machine learning first study

ds = pd.read_csv('train.csv') # loading the dataset
print(f"No. of rows:    {len(ds)}") # printing no of rows
print(f"No. of columns: {len(ds.columns)}") # printing no of columns

# printing dataset
print(ds.head())

# next step is to prepare the x and y
# x are the inputs that the model will learn from and y is the answer that the model will try to predict
x = ds[["horsepower", "mileage_miles"]]
y = ds["price_usd"]

# split dataset into two categories, train value and test value
# 80% for training, 20% for testing - optimal
x_train, x_test, y_train, y_test = train_test_split(
    x, y, test_size=0.2, random_state=42
)

# defining the model
model = XGBRegressor(
    n_estimators=100,
    learning_rate=0.1,
    max_depth=3,
    random_state=42,
    eval_metric="logloss",
)

# train the model
model.fit(x_train, y_train)
print("Training done :>")

# to save model once
joblib.dump(model, "modek.pkl")
print("Model saved :>")

# my input to predict the price
x_pred = [[200, 15000]]
prediction = model.predict(x_pred)
print(f"\nPredicted price: {prediction}")
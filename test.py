import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from xgboost import XGBClassifier

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
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier
# using classifier to predict if rain causes flood or nah

# loading the features dataset
ds = pd.read_csv("../data/flood_features.csv")

# confirmation by printing no of rows and columns
print("Data set loaded")
print(f"\nNo. of rows:\t{len(ds)}")
print(f"No. of columns:\t{len(ds.columns)}\n")

print(ds.head())

x = ds[["rain_intensity_1h", "rain_accum_6h", "rain_accum_24h"]] # the features
y = ds["is_flooded"] # the target

# splitting dataset, 1 for training 1 for testing
x_train, x_test, y_train, y_test = train_test_split(
    x, y, test_size=0.2, random_state=42
)

# needed to balance according to AI
num_zeros = (y_train == 0).sum()
num_ones = (y_train == 1).sum()
balance_weight = num_zeros / num_ones if num_ones > 0 else 1.0

# defining the model
model = XGBClassifier(
    objective="binary:logistic",
    eval_metric="logloss",
    scale_pos_weight=balance_weight,
    n_estimators=100,
    max_depth=4,
    learning_rate=0.1,
    random_state=42
)

print(f"\nTraining the model...")

# training
model.fit(x_train, y_train)
joblib.dump(model, "../model/flood_model.pkl")

print("\nTraining complete, model saved to --> flood_model.pkl")
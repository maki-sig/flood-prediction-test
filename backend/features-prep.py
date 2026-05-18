import pandas as pd 


# program to convert hourly precip data to 6h and 24h rain accumulation features
df = pd.read_csv("vks-one-yr-rain-history.csv")

df = df.rename(columns={"time": "timestamp", "precipitation": "rain_intensity_1h"})
df["timestamp"] = pd.to_datetime(df["timestamp"])
df = df.sort_values("timestamp").reset_index(drop=True)

df["rain_accum_6h"] = df["rain_intensity_1h"].rolling(window=6, min_periods=1, closed="right").sum()
df["rain_accum_24h"] = df["rain_intensity_1h"].rolling(window=24, min_periods=1, closed="right").sum()

df["is_flooded"] = 0

final_cols = ["timestamp", "rain_intensity_1h", "rain_accum_6h", "rain_accum_24h", "is_flooded"]
df[final_cols].to_csv("protoype_features.csv", index=False)

print("Success")
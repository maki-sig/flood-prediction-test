import joblib

# loading the model
predict_flood = joblib.load("flood_pred_model.pkl")
print("Model loaded")

# parameters to predict
rainfall_intensity = 12.5
accum_6h = 12.5
accum_24h = 12.5

rainfall_data = [[rainfall_intensity, accum_6h, accum_24h]]

print("\nParameters:" \
f"\n1. Rainfall intensity: {rainfall_intensity}" \
f"\n2. Rainfall 6h Accumulation: {accum_6h}" \
f"\n3. Rainfall 24h Accumulation: {accum_24h}")
print("\nPredicting flood...")

prediction = predict_flood.predict(rainfall_data)

if(prediction == 1):
    print(f"Result:\t{prediction} - yes it will flood")
else:
    print(f"Result:\t{prediction} - it will not flood")
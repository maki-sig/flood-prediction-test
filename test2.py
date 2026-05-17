import joblib

# load the model
model = joblib.load("modek.pkl")
print("Model loaded :>\n")

# horsepower and mileage
hp = 200
mileage = 15000
toPredict = [[hp, mileage]]

prediction = model.predict(toPredict)

print(f"Predicted price of car with {hp}hp and {mileage} mileage is: {prediction}")
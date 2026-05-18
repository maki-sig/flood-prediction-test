from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import joblib
import pandas as pd
import os

app = FastAPI(title="Flood Prediction API")

# Load model
# We assume the model file is in the same directory or copied here during deployment
model_path = os.path.join(os.path.dirname(__file__), "flood_model.pkl")

# Fallback to root model directory if running locally in the full repo
if not os.path.exists(model_path):
    model_path = os.path.join(os.path.dirname(__file__), "..", "model", "flood_model.pkl")

if os.path.exists(model_path):
    try:
        model = joblib.load(model_path)
        print(f"Model loaded successfully from {model_path}")
    except Exception as e:
        model = None
        print(f"Error loading model: {e}")
else:
    model = None
    print(f"Warning: Model not found at {model_path}")

class FeatureItem(BaseModel):
    rain_intensity_1h: float
    rain_accum_6h: float
    rain_accum_24h: float

@app.post("/predict")
async def predict(items: List[FeatureItem]):
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded on server")
    
    try:
        # Convert to DataFrame
        data = [item.dict() for item in items]
        df = pd.DataFrame(data)
        
        # Ensure correct column ordering
        cols = ["rain_intensity_1h", "rain_accum_6h", "rain_accum_24h"]
        df = df[cols]
        
        # Predict
        probabilities = model.predict_proba(df)
        flood_probs = [float(p[1]) for p in probabilities]
        
        return {"probabilities": flood_probs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {
        "message": "Flood Prediction API is running",
        "model_loaded": model is not None
    }

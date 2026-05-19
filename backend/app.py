from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
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

@app.post("/update")
@app.get("/update")
async def update_predictions(
    request: Request,
    latitude: float = 13.6192,
    longitude: float = 123.1814,
    secret: Optional[str] = None,
    force: bool = False
):
    import requests
    from supabase import create_client, Client
    
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=500, detail="Supabase environment variables (SUPABASE_URL, SUPABASE_KEY) are not configured.")

    # 1. Secret Token Authorization (Security Check)
    update_secret = os.environ.get("UPDATE_SECRET")
    if update_secret:
        # Clean any quotes/spaces from the environment variable itself
        update_secret = update_secret.strip('\'" ')
        
        auth_header = request.headers.get("Authorization")
        token = None
        if auth_header:
            auth_header = auth_header.strip()
            if auth_header.startswith("Bearer "):
                parts = auth_header.split(" ")
                if len(parts) > 1:
                    token = parts[1]
            else:
                token = auth_header  # Fallback to raw header value if Bearer is missing
        
        if not token:
            token = secret
            
        if token:
            token = token.strip('\'" ')  # Clean any quotes/spaces from client input
            
        if token != update_secret:
            # Returning 200 OK so that cronjobs that I configured don't disable the job upon consecutive failures
            return {"status": "error", "message": "Unauthorized: Invalid secret token."}

    # 2. Temporal Cooldown (45-Minute Rate Limiting)
    if not force:
        try:
            temp_client = create_client(supabase_url, supabase_key)
            last_record = temp_client.table("rainfall_prediction_logs") \
                .select("created_at") \
                .order("created_at", desc=True) \
                .limit(1) \
                .execute()
                
            if last_record.data:
                created_at_str = last_record.data[0]["created_at"]
                if created_at_str.endswith("Z"):
                    created_at_str = created_at_str.replace("Z", "+00:00")
                
                last_update_time = datetime.fromisoformat(created_at_str)
                now_utc = datetime.now(timezone.utc)
                time_diff = now_utc - last_update_time
                
                if time_diff < timedelta(minutes=45):
                    minutes_ago = int(time_diff.total_seconds() / 60)
                    return {
                        "status": "skipped",
                        "message": f"Database updated {minutes_ago} minutes ago. Cooldown active (45m)."
                    }
        except Exception as db_err:
            print(f"Error checking cooldown status: {db_err}")

    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded on server")

    try:
        # 1. Fetch from Open-Meteo
        open_meteo_url = f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&hourly=precipitation&timezone=GMT&past_days=1&forecast_days=3"
        weather_response = requests.get(open_meteo_url)
        if weather_response.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Open-Meteo API returned status {weather_response.status_code}")
            
        weather_data = weather_response.json()
        hourly = weather_data.get("hourly", {})
        times = hourly.get("time", [])
        precipitation = hourly.get("precipitation", [])
        
        if not times or not precipitation:
            raise HTTPException(status_code=500, detail="Invalid hourly data returned from weather API")
            
        # 2. Compute rolling features
        df = pd.DataFrame({
            'forecast_time': times,
            'rain_intensity_1h': precipitation
        })
        # Calculate rolling sum
        df['rain_accum_6h'] = df['rain_intensity_1h'].rolling(window=6, min_periods=1).sum().round(2)
        df['rain_accum_24h'] = df['rain_intensity_1h'].rolling(window=24, min_periods=1).sum().round(2)
        
        # 3. Predict
        cols = ["rain_intensity_1h", "rain_accum_6h", "rain_accum_24h"]
        probabilities = model.predict_proba(df[cols])
        df['predicted_probability'] = [float(p[1]) for p in probabilities]
        
        # 4. Format for Supabase
        records = []
        for _, row in df.iterrows():
            records.append({
                "forecast_time": row['forecast_time'],
                "rain_intensity_1h": float(row['rain_intensity_1h']),
                "rain_accum_6h": float(row['rain_accum_6h']),
                "rain_accum_24h": float(row['rain_accum_24h']),
                "predicted_probability": float(row['predicted_probability']),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            
        # 5. Initialize Supabase and Upsert
        supabase_client: Client = create_client(supabase_url, supabase_key)
        res = supabase_client.table("rainfall_prediction_logs").upsert(records, on_conflict="forecast_time").execute()
        
        return {
            "status": "success",
            "message": f"Successfully fetched, predicted and upserted {len(records)} hourly records into Supabase.",
            "records_updated": len(records)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {
        "message": "Flood Prediction API is running",
        "model_loaded": model is not None
    }

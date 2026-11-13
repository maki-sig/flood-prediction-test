from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import joblib
import pandas as pd
import os

app = FastAPI(title="Flood Prediction API")

from forecast import STREETS, FEATURES, MODEL_PATH, feature_frame, weather_features

try:
    model = joblib.load(MODEL_PATH)
    if list(model.feature_names_in_) != FEATURES:
        raise ValueError("Model feature schema does not match street inference")
except Exception as exc:
    model = None
    print(f"Model unavailable: {exc}")

@app.get("/streets")
async def streets():
    return STREETS

class FeatureItem(BaseModel):
    street_id: int
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
        df = feature_frame(data)
        
        # Predict
        probabilities = model.predict_proba(df)
        flood_probs = [float(p[1]) for p in probabilities]
        
        return {"probabilities": flood_probs}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
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
    
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
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
            raise HTTPException(status_code=401, detail="Invalid secret token")

    # 2. Temporal Cooldown (45-Minute Rate Limiting)
    if not force:
        try:
            # Query Supabase via direct Postgrest REST request to bypass supabase package compiler dependencies
            headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}"
            }
            params = {
                "select": "created_at,street_id,forecast_time",
                "order": "created_at.desc",
                "limit": 3000
            }
            start_filter = pd.Timestamp.now(tz="Asia/Manila").normalize().isoformat()
            params['forecast_time'] = f'gte.{start_filter}'
            params['order'] = 'street_id,forecast_time'
            params['limit'] = 1000
            last_record_data = []
            for offset in range(0, 3000, 1000):
                params['offset'] = offset
                res = requests.get(f"{supabase_url}/rest/v1/street_prediction_logs", headers=headers, params=params, timeout=30)
                res.raise_for_status()
                page = res.json()
                last_record_data.extend(page)
                if len(page) < 1000:
                    break
            if last_record_data:
                if last_record_data:
                    created_at_str = max(r["created_at"] for r in last_record_data)
                    if created_at_str.endswith("Z"):
                        created_at_str = created_at_str.replace("Z", "+00:00")
                    
                    last_update_time = min(datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")) for r in last_record_data)
                    now_utc = datetime.now(timezone.utc)
                    time_diff = now_utc - last_update_time
                    
                    start = pd.Timestamp(now_utc).tz_convert("Asia/Manila").normalize()
                    expected = {(s['street_id'], (start + pd.Timedelta(hours=h)).tz_convert('UTC').isoformat()) for s in STREETS for h in range(72)}
                    actual = {(r['street_id'], pd.Timestamp(r['forecast_time']).tz_convert('UTC').isoformat()) for r in last_record_data}
                    if time_diff < timedelta(minutes=45) and expected <= actual:
                        minutes_ago = int(time_diff.total_seconds() / 60)
                        return {
                            "status": "skipped",
                            "message": f"Database updated {minutes_ago} minutes ago. Cooldown active (45m)."
                        }
        except Exception as db_err:
            print(f"Error checking cooldown status: {db_err}")

    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded on server")

    # Parse optional JSON payload from request body if POST
    body_data = None
    if request.method == "POST":
        try:
            body_data = await request.json()
        except Exception:
            pass

    try:
        # 1. Fetch from Open-Meteo (or use provided payload)
        hourly = None
        if body_data and isinstance(body_data, dict) and "hourly" in body_data:
            print("[Update] Using injected weather payload from request body.")
            hourly = body_data.get("hourly", {})
        else:
            print("[Update] Injected payload not found or invalid. Fetching from Open-Meteo API...")
            open_meteo_url = f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&hourly=precipitation&timezone=GMT&past_days=2&forecast_days=4"
            weather_response = requests.get(open_meteo_url, timeout=30)
            if weather_response.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Open-Meteo API returned status {weather_response.status_code}")
            weather_data = weather_response.json()
            hourly = weather_data.get("hourly", {})
            
        df = weather_features(hourly)
        now = datetime.now(timezone.utc)
        local_start = pd.Timestamp(now).tz_convert("Asia/Manila").normalize()
        df = df[(df.forecast_time >= local_start) & (df.forecast_time < local_start + pd.Timedelta(days=3))]
        if len(df) != 72:
            raise ValueError("Weather does not cover three full Manila days")
        records = []
        for street in STREETS:
            items = [{**row, 'street_id': street['street_id']} for row in df.to_dict('records')]
            probabilities = model.predict_proba(feature_frame(items))[:, 1]
            for row, probability in zip(items, probabilities):
                records.append({**row, 'forecast_time': row['forecast_time'].isoformat(),
                                'predicted_probability': float(probability), 'created_at': now.isoformat()})

        # 5. Initialize Supabase and Upsert (via direct REST API)
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        res = requests.post(
            f"{supabase_url}/rest/v1/street_prediction_logs?on_conflict=street_id,forecast_time",
            headers=headers,
            json=records, timeout=30
        )
        if res.status_code not in (200, 201):
            raise Exception(f"Supabase REST upsert failed with status {res.status_code}: {res.text}")
        
        return {
            "status": "success",
            "message": f"Successfully fetched, predicted and upserted {len(records)} hourly records into Supabase.",
            "records_updated": len(records)
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {
        "message": "Flood Prediction API is running",
        "model_loaded": model is not None
    }

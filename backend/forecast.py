"""Shared street catalog and inference features."""
import json
import math
from pathlib import Path
import pandas as pd

STREETS = json.loads(Path(__file__).with_name('streets.json').read_text())
FEATURES = ['street_id', 'elevation', 'flood_hazard_level', 'rain_intensity_1h', 'rain_accum_6h', 'rain_accum_24h']
MODEL_PATH = Path(__file__).resolve().parent.parent / 'model' / 'predict_flood_model.pkl'

def feature_frame(items):
    catalog = {s['street_id']: s for s in STREETS}
    rows = []
    for item in items:
        if item['street_id'] not in catalog:
            raise ValueError('Unknown street ID')
        rows.append({**item, **catalog[item['street_id']]})
    return pd.DataFrame(rows)[FEATURES]

def weather_features(hourly):
    times = pd.to_datetime(hourly.get('time', []), utc=True)
    rain = hourly.get('precipitation', [])
    if len(times) != len(rain) or len(times) < 24:
        raise ValueError('Weather requires matching hourly timestamps and rainfall')
    df = pd.DataFrame({'forecast_time': times, 'rain_intensity_1h': rain})
    if df.isna().any().any() or (df.rain_intensity_1h < 0).any() or not all(math.isfinite(v) for v in rain) or not df.forecast_time.diff().iloc[1:].eq(pd.Timedelta(hours=1)).all():
        raise ValueError('Weather must contain consecutive hours and nonnegative rainfall')
    for hours in (6, 24):
        df[f'rain_accum_{hours}h'] = df.rain_intensity_1h.rolling(hours, min_periods=hours).sum()
    return df.dropna()

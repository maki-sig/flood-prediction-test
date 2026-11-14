"""Street attributes and inference shared by the API; source datasets stay unchanged."""
import csv
from functools import lru_cache
from pathlib import Path

import pandas as pd

FEATURE_COLUMNS = [
    "street_id", "elevation", "flood_hazard_level",
    "rain_intensity_1h", "rain_accum_6h", "rain_accum_24h",
]


@lru_cache(maxsize=1)
def load_street_catalog(dataset_path=None):
    path = dataset_path or Path(__file__).resolve().parent.parent / "data" / "sorted_training_dataset.csv"
    streets = {}
    with open(path, newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            street = {
                "street_id": int(row["street_id"]),
                "street_name": row["street_name"].strip(),
                "elevation": float(row["elevation"]),
                "flood_hazard_level": int(row["flood_hazard_level"]),
            }
            previous = streets.setdefault(street["street_id"], street)
            if previous != street:
                raise ValueError(f"Conflicting attributes for street {street['street_id']}")
    if not streets:
        raise ValueError("Street catalog is empty")
    return tuple(streets[key] for key in sorted(streets))


def predict_probabilities(model, features):
    frame = pd.DataFrame(features)[FEATURE_COLUMNS]
    flood_index = list(model.classes_).index(1)
    return [float(row[flood_index]) for row in model.predict_proba(frame)]


def predict_street_forecasts(model, hourly, catalog=None):
    """Reuse already computed rainfall features; predict each street for each hour."""
    catalog = load_street_catalog() if catalog is None else catalog
    records = []
    for row in hourly.to_dict("records"):
        for street in catalog:
            records.append({**row, **street})
    probabilities = predict_probabilities(model, records)
    for record, probability in zip(records, probabilities):
        record["predicted_probability"] = probability
    return records

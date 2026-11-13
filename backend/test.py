import pickle
from pathlib import Path

import pandas as pd


FEATURE_COLUMNS = [
    "street_id",
    "elevation",
    "flood_hazard_level",
    "rain_intensity_1h",
    "rain_accum_6h",
    "rain_accum_24h",
]

# Synthetic rainfall scenarios using street attributes from the training CSV.
# Rainfall values are in mm; accumulated totals include the current hour.
# These examples demonstrate predictions and have no verified flood labels.
MOCK_SCENARIOS = [
    ("Cypress: dry weather", [1, 7, 0, 0.0, 0.0, 0.0]),
    ("Chico: light rain", [2, 7, 1, 1.2, 5.0, 12.0]),
    ("Hamoran: sustained rain", [4, 8, 1, 8.0, 35.0, 75.0]),
    ("Antipolo: intense rain after a wet day", [16, 6, 2, 30.0, 110.0, 200.0]),
    ("Antipolo: rain stopped after heavy accumulation", [16, 6, 2, 0.0, 85.0, 180.0]),
]


def main():
    model_path = Path(__file__).resolve().parent.parent / "model" / "predict_flood_model.pkl"
    if not model_path.is_file():
        raise SystemExit(
            f"Model not found: {model_path}\n"
            "Train the model with backend/train.py before running this script."
        )

    with model_path.open("rb") as model_file:
        model = pickle.load(model_file)

    rainfall_data = pd.DataFrame(
        [features for _, features in MOCK_SCENARIOS], columns=FEATURE_COLUMNS
    )
    flood_class_index = list(model.classes_).index(1)
    probabilities = model.predict_proba(rainfall_data)[:, flood_class_index]

    results = rainfall_data.copy()
    results.insert(0, "scenario", [name for name, _ in MOCK_SCENARIOS])
    results["flood_probability"] = [f"{probability:.2%}" for probability in probabilities]

    print(f"Model loaded from {model_path}\n")
    print(results.to_string(index=False))


if __name__ == "__main__":
    main()

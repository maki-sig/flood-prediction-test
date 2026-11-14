"""Run with: python -m unittest discover -s backend -p test_street_predictions.py"""
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from street_predictions import load_street_catalog, predict_street_forecasts


class ExampleModel:
    # Class order is deliberately reversed to verify class-1 lookup.
    classes_ = [1, 0]

    def predict_proba(self, frame):
        self.frame = frame
        return [[0.8, 0.2] if row.street_id == 2 else [0.1, 0.9]
                for row in frame.itertuples()]


class StreetPredictionTests(unittest.TestCase):
    def test_each_hour_keeps_distinct_street_predictions(self):
        model = ExampleModel()
        hourly = pd.DataFrame([
            {"forecast_time": time, "rain_intensity_1h": 2, "rain_accum_6h": 8, "rain_accum_24h": 20}
            for time in ["2026-11-13T00:00:00Z", "2026-11-13T01:00:00Z"]
        ])
        catalog = [
            {"street_id": 1, "street_name": "cypress", "elevation": 7, "flood_hazard_level": 0},
            {"street_id": 2, "street_name": "chico", "elevation": 7, "flood_hazard_level": 1},
        ]
        records = predict_street_forecasts(model, hourly, catalog)
        self.assertEqual(len(records), 4)
        self.assertEqual([row["predicted_probability"] for row in records], [0.1, 0.8, 0.1, 0.8])
        self.assertEqual(list(model.frame.columns), ["street_id", "elevation", "flood_hazard_level", "rain_intensity_1h", "rain_accum_6h", "rain_accum_24h"])
        self.assertEqual(records[2]["forecast_time"], "2026-11-13T01:00:00Z")

    def test_catalog_deduplicates_and_rejects_conflicting_attributes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "catalog.csv"
            header = "street_id,street_name,elevation,flood_hazard_level\n"
            path.write_text(header + "1,cypress,7,0\n1,cypress,7,0\n")
            self.assertEqual(len(load_street_catalog(path)), 1)
            load_street_catalog.cache_clear()
            path.write_text(header + "1,cypress,7,0\n1,cypress,6,0\n")
            with self.assertRaisesRegex(ValueError, "Conflicting"):
                load_street_catalog(path)


if __name__ == "__main__":
    unittest.main()

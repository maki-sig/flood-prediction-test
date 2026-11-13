import unittest
from unittest.mock import patch, Mock
import asyncio
import pandas as pd
from forecast import FEATURES, STREETS, feature_frame, weather_features
import app


class ForecastTests(unittest.TestCase):
    def test_catalog_and_feature_order(self):
        self.assertEqual(len(STREETS), 26)
        frame = feature_frame([dict(street_id=1, elevation=999, rain_intensity_1h=1, rain_accum_6h=6, rain_accum_24h=24)])
        self.assertEqual(list(frame.columns), FEATURES)
        self.assertEqual(frame.iloc[0].elevation, 7)
        with self.assertRaises(ValueError):
            feature_frame([{'street_id': 999}])

    def test_weather_windows_and_invalid_hours(self):
        times = pd.date_range('2026-11-10', periods=48, freq='h', tz='UTC')
        payload = {'time': times.astype(str).tolist(), 'precipitation': [1] * 48}
        frame = weather_features(payload)
        self.assertEqual(len(frame), 25)
        self.assertEqual(frame.iloc[0].rain_accum_24h, 24)
        self.assertEqual(frame.iloc[0].rain_accum_6h, 6)
        payload['precipitation'][0] = None
        with self.assertRaises(ValueError):
            weather_features(payload)

    def test_update_produces_all_street_hours(self):
        start = pd.Timestamp.now(tz='Asia/Manila').normalize().tz_convert('UTC')
        times = pd.date_range(start - pd.Timedelta(days=2), periods=144, freq='h')
        request = Mock(method='POST', headers={})
        async def body():
            return {'hourly': {'time': times.astype(str).tolist(), 'precipitation': [1] * len(times)}}
        request.json = body
        response = Mock(status_code=201)
        with patch.dict('os.environ', {'SUPABASE_URL': 'https://example.test', 'SUPABASE_SERVICE_ROLE_KEY': 'test', 'UPDATE_SECRET': ''}), patch('requests.post', return_value=response) as post:
            result = asyncio.run(app.update_predictions(request, force=True))
        records = post.call_args.kwargs['json']
        self.assertEqual(result['records_updated'], 1872)
        self.assertEqual(len({(r['street_id'], r['forecast_time']) for r in records}), 1872)
        self.assertTrue(all(pd.Timestamp(r['forecast_time']).tzinfo is not None for r in records))


if __name__ == '__main__':
    unittest.main()

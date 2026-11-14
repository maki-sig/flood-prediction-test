# Street flood probability and routing

Road restrictions use the selected forecast hour's street-specific flood probability.
`frontend/lib/road-checker.ts` holds the single cutoff, `ROAD_PROBABILITY_THRESHOLD`:
probability **at or above 0.5** is red (`not_passable`); lower values are green
(`passable`). This initial cutoff has not been calibrated against held-out road
passability observations. These are predicted restrictions, not measured road conditions.

Missing, unmatched, or invalid probabilities remain gray (`unknown`). Only red
streets are excluded from routing. Gray streets stay available for general street
guidance, with an explicit notice that flood status is unverified. No barangay-level
fallback paints roads green. Unnamed roads, Jade Street, Onyx Street, and Yakal Extension have no matching
catalog entry and remain unknown unless their own forecasts become available.
The explicit `hamoraon` -> `hamoran` alias reconciles the existing GIS and CSV spelling.

## Data flow

1. The existing `data/sorted_training_dataset.csv` supplies the street catalog,
   cached after checking that each street ID has consistent attributes.
2. `backend/app.py` loads `model/predict_flood_model.pkl`. The existing Open-Meteo
   loading and rolling rainfall preparation are reused. `street_predictions.py`
   supplies all six training features and calls the supplied model once per batch.
3. `/update` writes predictions to `street_flood_predictions`, keyed by street ID
   and UTC forecast timestamp. The existing `rainfall_prediction_logs` remains
   one row per hour, now containing the maximum probability across catalogued streets.
   Consequently dashboard probabilities represent the most at-risk modelled street.
4. `/api/predict` paginates street forecasts and attaches `street_forecasts` to each
   existing hourly response. It matches timestamps by instant, not by string format.
5. The map calls `checkRoads()` using already loaded GIS geometry and the selected
   hour. The existing `buildRoadNetwork()` receives green and gray road features,
   excluding red road features. Missing forecasts preserve the original street graph
   so pinning can still display general guidance to the nearest reachable shelter.
   A changed selected hour or refreshed prediction rebuilds the graph and reruns
   existing A*. The shelter recommendation code, cost, and heuristic are unchanged.

Elevation and hazard level are model inputs. Probability is never interpreted as
water depth or water-surface elevation. Original datasets, GIS files, and model
binaries are unchanged. Existing endpoint snapping still allows access up to 150 m
from a road; the route covers snapped road access points, not verified building
access or the safety of the connector from a building.

## Setup

1. Run `frontend/supabase/migrations/202611130002_street_flood_predictions.sql`
   in the project's Supabase SQL editor. It creates a separate table with public
   read access and service-role writes; it does not delete existing data.
2. Configure the frontend's existing `.env.local` Supabase URL/anon key and
   `BACKEND_API_URL=http://127.0.0.1:8000`.
3. In the Python backend process, set `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_KEY` containing the service-role key).
   Python does not automatically load `frontend/.env.local`. Set the same
   `UPDATE_SECRET` in frontend and backend if using it. Never expose the
   service-role key in a `NEXT_PUBLIC_` variable.
4. Install the existing backend requirements in your Python environment. From
   the project root, run `python -m uvicorn backend.app:app --reload --port 8000`.
5. Start `npm run dev` from `frontend`. Trigger a forced update once with
   `/api/predict?latitude=13.6452&longitude=123.1938&update=true` to populate the
   new street table. Without the migration/backend connection, roads stay unknown.

`POST /predict` now requires all six model features. The old three-feature
payload cannot be used with the newly trained six-feature classifier.

## Checks

From `frontend`, run `npm test`. The checker tests demonstrate a direct green
route, the same route detouring around a red middle street, a disconnected
destination, cutoff equality, invalid/missing probabilities, and name matching.

From the project root, run:
`python -m unittest discover -s backend -p test_street_predictions.py`.
These tests use a small example model to check the feature order, class lookup,
per-street/per-hour records, and conflicting catalog values. They do not measure
the trained model's accuracy. The existing `backend/test.py` can separately
exercise the real model in an environment with the backend dependencies installed.

## Files changed

| File | Change |
| --- | --- |
| `backend/app.py` | Load the new model, accept six features, infer and save street forecasts, retain hourly dashboard aggregates. |
| `backend/street_predictions.py` | Cached catalog loading, consistent six-feature inference, hourly street expansion. |
| `backend/test_street_predictions.py` | Feature order, probability class, hourly expansion and catalog consistency tests. |
| `frontend/lib/road-checker.ts` | One probability cutoff, spelling alias, status/color output and filtered graph. |
| `frontend/app/api/predict/route.ts` | Fetch paginated street predictions and attach them to the matching forecast hour. |
| `frontend/app/components/FloodMap.tsx` | Road styling, probability popups, legend and rerouting when forecasts change. |
| `frontend/app/dashboard/page.tsx` | Optional street forecast type in hourly data. |
| `frontend/app/manage-evac/page.tsx` | Same hourly forecast type for the official view. |
| `frontend/tests/road-checker.test.ts` | Green route, red-street detour, disconnection, missing data, cutoff and alias tests. |
| `frontend/scripts/test-route-planner.mjs` | Run the checker tests alongside existing routing tests. |
| `frontend/supabase/migrations/202611130002_street_flood_predictions.sql` | Separate per-street table, index and read/write permissions. |
| `ROAD-PASSABILITY.md` | Setup, data connections, threshold meaning, checks and change list. |

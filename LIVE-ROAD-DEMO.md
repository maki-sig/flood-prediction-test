# Live map demonstration

Run the existing frontend with `npm run dev` and visit
`http://localhost:3000/demo/roads`.

This separate page uses the real local road GeoJSON with mock street
probabilities, a mock starting pin, and one clearly labeled mock shelter.
It runs the existing road checker, graph builder, A* and shelter recommendation.
It does not call the prediction or shelters API, run XGBoost, or write Supabase data.
Closing the page leaves the dashboard and real forecasts unchanged.

1. The initial scenario assigns 10% to every street: all roads are green.
2. Keep **Chico Street** selected and click **Make selected street red (90%)**.
   The street becomes red and the route changes. With the supplied starting pin,
   the test fixture changes from approximately 0.250 km to 0.258 km to the same
   mock shelter, using different streets.
3. Click **Restore all green (10%)** to recover the original route.
4. Click **Make all streets red — no route** to demonstrate disconnection.
5. Use the slider to show the inclusive 50% cutoff or select another street.
   A different street might not affect the route if it is not part of that route.
6. **Choose another starting pin** lets you click the map; **Reset demo** restores
   the supplied, tested scenario.

All statuses and coordinates on this page are demonstration inputs. A predicted
restriction does not establish actual observed road conditions.

## Files

- `frontend/app/demo/roads/page.tsx`: labeled demo page and interactive controls.
- `frontend/lib/road-demo.ts`: in-memory mock probabilities and shelter.
- `frontend/app/components/FloodMap.tsx`: optional preloaded road geometry so the
  demo can reuse its loaded data without fetching the roads a second time.
- `frontend/tests/road-demo.test.ts`: actual-GIS red street, detour, restore and
  all-red tests, plus immutability checks.
- `frontend/scripts/test-route-planner.mjs`: include demo tests and use the frontend
  directory for both compilation and test execution.
- `LIVE-ROAD-DEMO.md`: this guide.

Existing map callers need no changes. The optional `roadGeometry` prop supplies
the same GeoJSON that the normal map fetches; it does not alter routing signatures
or algorithms. Dataset, model, A*, graph builder and shelter ranking files remain
unchanged.

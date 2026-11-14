import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkRoads, ROAD_PROBABILITY_THRESHOLD, type StreetForecast } from "../lib/road-checker";
import { buildAStarRoute, findNearestAvailableShelter } from "../lib/route-planner";
import type { ShelterPin } from "../lib/evac-actions";
import { buildRoadNetwork } from "../lib/road-network";

const feature = (name: string, coordinates: number[][]): GeoJSON.Feature => ({
  type: "Feature", properties: { name }, geometry: { type: "LineString", coordinates },
});
const streets: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [
  feature("West Street", [[123.19, 13.64], [123.191, 13.64]]),
  feature("Middle Street", [[123.191, 13.64], [123.193, 13.64]]),
  feature("East Street", [[123.193, 13.64], [123.194, 13.64]]),
  feature("Bypass Street", [[123.191, 13.64], [123.191, 13.643], [123.193, 13.643], [123.193, 13.64]]),
] };
const forecasts = (middle: number): StreetForecast[] => ["west", "middle", "east", "bypass"].map((street_name, index) => ({
  street_id: index + 1, street_name, probability: street_name === "middle" ? middle : 0.1,
}));
const start: [number, number] = [13.64, 123.19];
const goal: [number, number] = [13.64, 123.194];

test("green route uses the direct street; red street reroutes the unchanged A*", () => {
  const original = JSON.stringify(streets);
  const open = checkRoads(streets, forecasts(0.1));
  const restricted = checkRoads(streets, forecasts(0.9));
  const direct = buildAStarRoute(start, goal, [], open.network);
  const detour = buildAStarRoute(start, goal, [], restricted.network);
  assert.ok(direct.length >= 2);
  assert.ok(direct.every(point => point[0] === 13.64));
  assert.ok(detour.some(point => point[0] === 13.643));
  assert.equal(open.roads.features[1].properties?.passability_color, "#22c55e");
  assert.equal(restricted.roads.features[1].properties?.passability_color, "#ef4444");
  for (let i = 1; i < detour.length; i++) {
    const a = detour[i - 1], b = detour[i];
    assert.ok(!(a[0] === 13.64 && b[0] === 13.64 && Math.min(a[1], b[1]) < 123.193 && Math.max(a[1], b[1]) > 123.191));
  }
  assert.equal(JSON.stringify(streets), original, "Source geometry must remain unchanged");
  console.log("Example: green direct route:", JSON.stringify(direct));
  console.log("Example: Middle Street red, rerouted via Bypass Street:", JSON.stringify(detour));
});

test("threshold is inclusive, updates restore the direct route, invalid or missing values remain unknown", () => {
  const threshold = checkRoads(streets, forecasts(ROAD_PROBABILITY_THRESHOLD));
  assert.equal(threshold.roads.features[1].properties?.passability, "not_passable");
  assert.equal(checkRoads(streets, forecasts(ROAD_PROBABILITY_THRESHOLD - 0.001)).roads.features[1].properties?.passability, "passable");
  for (const probability of [NaN, Infinity, -1, 1.1]) {
    assert.equal(checkRoads(streets, forecasts(probability)).roads.features[1].properties?.passability, "unknown");
  }
  const unknown = checkRoads(streets);
  assert.ok(unknown.roads.features.every(feature => feature.properties?.passability === "unknown"));
  assert.ok(unknown.roads.features.every(feature => feature.properties?.passability_color === "#9ca3af"));
  assert.deepEqual(buildAStarRoute(start, goal, [], unknown.network),
    buildAStarRoute(start, goal, [], checkRoads(streets, forecasts(0.1)).network));
});

test("closed bypass disconnects destination; recommendation keeps its existing ranking", () => {
  const blocked = forecasts(0.9).map(row => ({ ...row, probability: row.street_name === "bypass" ? 0.9 : row.probability }));
  const network = checkRoads(streets, blocked).network;
  assert.deepEqual(buildAStarRoute(start, goal, [], network), []);
  const shelter: ShelterPin = {
    loc_id: 1, shelter_id: 1, latitude: goal[0], longitude: goal[1],
    shelter: { shelter_name: "Center", type: "Evacuation Center", barangay_name: "Test", zone_num: 1,
      max_capacity: 20, curr_capacity: 1, shelter_head: null },
  };
  assert.equal(findNearestAvailableShelter(start, [shelter], [], network), null);
  assert.equal(findNearestAvailableShelter(start, [shelter], [], checkRoads(streets, forecasts(0.9)).network)?.shelterId, 1);
});

test("explicit spelling alias works; unknown names and extensions do not inherit another street's forecast", () => {
  const geometry: GeoJSON.FeatureCollection = { ...streets, features: ["Hamoraon Street", "Jade Street", "Yakal Extension"].map(name => feature(name, [[123.19, 13.64], [123.191, 13.64]])) };
  const checked = checkRoads(geometry, [{ street_id: 4, street_name: "hamoran", probability: 0.8 }, { street_id: 18, street_name: "yakal", probability: 0.1 }]);
  assert.deepEqual(checked.roads.features.map(row => row.properties?.passability), ["not_passable", "unknown", "unknown"]);
});

test("partial forecasts retain unknown connections but still detour around a known red street", () => {
  const partial = checkRoads(streets, [{ street_id: 2, street_name: "middle", probability: 0.9 }]);
  assert.deepEqual(partial.roads.features.map(feature => feature.properties?.passability),
    ["unknown", "not_passable", "unknown", "unknown"]);
  const detour = buildAStarRoute(start, goal, [], partial.network);
  assert.ok(detour.some(point => point[0] === 13.643));
  assert.deepEqual(detour, buildAStarRoute(start, goal, [], checkRoads(streets, forecasts(0.9)).network));
});

test("pinning with no street forecasts preserves the original GIS route and nearest shelter", () => {
  const geometry: GeoJSON.FeatureCollection = JSON.parse(readFileSync("public/gis/geojson/villa_karangahan_roads.geojson", "utf8"));
  const pin: [number, number] = [13.6435229, 123.1909163];
  const destination: [number, number] = [13.6426062, 123.1922408];
  const shelter: ShelterPin = {
    loc_id: 1, shelter_id: 1, latitude: destination[0], longitude: destination[1],
    shelter: { shelter_name: "Center", type: "Evacuation Center", barangay_name: "Test", zone_num: 1,
      max_capacity: 20, curr_capacity: 1, shelter_head: null },
  };
  const baseline = findNearestAvailableShelter(pin, [shelter], [], buildRoadNetwork(geometry));
  const restored = findNearestAvailableShelter(pin, [shelter], [], checkRoads(geometry).network);
  assert.ok(baseline && baseline.path.length >= 2);
  assert.deepEqual(restored, baseline);
});

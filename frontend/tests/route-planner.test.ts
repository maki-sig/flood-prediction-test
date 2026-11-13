import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildAStarRoute, findNearestAvailableShelter } from "../lib/route-planner";
import type { ShelterPin } from "../lib/evac-actions";
import { buildRoadNetwork } from "../lib/road-network";

function shelter(id: number, latitude: number, longitude: number, current: number, maximum: number): ShelterPin {
  return {
    loc_id: id, shelter_id: id, latitude, longitude,
    shelter: {
      shelter_name: `Center ${id}`, type: "Evacuation Center", barangay_name: "Test", zone_num: 1,
      max_capacity: maximum, curr_capacity: current, shelter_head: null,
    },
  };
}

test("selects a center with open occupancy when the nearest center is full", () => {
  const start: [number, number] = [13.645, 123.195];
  const closestFull = shelter(1, 13.645, 123.1951, 20, 20);
  const nextOpen = shelter(2, 13.645, 123.196, 4, 20);
  const selected = findNearestAvailableShelter(start, [closestFull, nextOpen]);
  assert.equal(selected?.shelterId, 2);
  assert.equal(selected?.availableCapacity, 16);
});

test("returns no shelter when every center is at capacity", () => {
  const start: [number, number] = [13.645, 123.195];
  assert.equal(findNearestAvailableShelter(start, [shelter(1, 13.645, 123.196, 10, 10)]), null);
});

test("still considers the last open slot even when the map calls a center full", () => {
  const start: [number, number] = [13.645, 123.195];
  const selected = findNearestAvailableShelter(start, [shelter(3, 13.645, 123.196, 19, 20)]);
  assert.equal(selected?.shelterId, 3);
  assert.equal(selected?.availableCapacity, 1);
});

test("routes around an impassable road cell", () => {
  const start: [number, number] = [13.645, 123.194];
  const goal: [number, number] = [13.645, 123.198];
  const direct = buildAStarRoute(start, goal);
  const blocked = buildAStarRoute(start, goal, [[13.645, 123.196]]);
  assert.ok(direct.length > 2);
  assert.notDeepEqual(blocked, direct);
  assert.ok(blocked.every((point) => point[0] !== 13.645 || point[1] !== 123.196));
});

test("does not return a route through a blocked destination", () => {
  const goal: [number, number] = [13.645, 123.196];
  assert.deepEqual(buildAStarRoute([13.645, 123.194], goal, [goal]), []);
});

// MODIFIED: A U-shaped street must be followed around its bend rather than cutting through a building block.
test("street routing follows bends and snaps building pins to road access", () => {
  const roads = buildRoadNetwork({ type: "FeatureCollection", features: [{
    type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [
      [123.19, 13.64], [123.19, 13.642], [123.192, 13.642], [123.192, 13.64],
    ] },
  }] });
  const path = buildAStarRoute([13.6402, 123.1901], [13.6402, 123.1919], [], roads);
  assert.ok(path.some(p => p[0] === 13.642 && p[1] === 123.19));
  assert.ok(path.some(p => p[0] === 13.642 && p[1] === 123.192));
  assert.equal(path[0][1], 123.19);
  assert.equal(path[path.length - 1][1], 123.192);
});

test("street routing rejects disconnected streets instead of drawing across the gap", () => {
  const roads = buildRoadNetwork({ type: "FeatureCollection", features: [123.19, 123.192].map(lon => ({
    type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lon, 13.64], [lon, 13.642]] },
  })) });
  assert.deepEqual(buildAStarRoute([13.64, 123.19], [13.64, 123.192], [], roads), []);
});

test("street routing connects a side street at an interior junction", () => {
  const roads = buildRoadNetwork({ type: "FeatureCollection", features: [
    [[123.19, 13.64], [123.192, 13.64]],
    [[123.191, 13.64], [123.191, 13.642]],
  ].map(coordinates => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } })) });
  const path = buildAStarRoute([13.64, 123.19], [13.642, 123.191], [], roads);
  assert.ok(path.some(p => p[0] === 13.64 && p[1] === 123.191));
  assert.ok(path.length >= 3);
});

test("local GIS route stays on street segments to Hamoraon Street", () => {
  const data: GeoJSON.FeatureCollection = JSON.parse(readFileSync("public/gis/geojson/villa_karangahan_roads.geojson", "utf8"));
  const roads = buildRoadNetwork(data);
  const path = buildAStarRoute([13.6435229, 123.1909163], [13.6426062, 123.1922408], [], roads);
  assert.ok(path.length > 2);
  const segments = data.features.flatMap(feature => {
    const geometry = feature.geometry;
    const lines = geometry.type === "MultiLineString" ? geometry.coordinates : geometry.type === "LineString" ? [geometry.coordinates] : [];
    return lines.flatMap(line => line.slice(1).map((end, i) => [line[i], end]));
  });
  for (let i = 1; i < path.length; i++) {
    assert.ok(segments.some(([a, b]) => [path[i - 1], path[i]].every(([lat, lon]) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      return length > 0 && Math.abs((lon - a[0]) * dy - (lat - a[1]) * dx) / length < 0.000001
        && lon >= Math.min(a[0], b[0]) - 0.000001 && lon <= Math.max(a[0], b[0]) + 0.000001
        && lat >= Math.min(a[1], b[1]) - 0.000001 && lat <= Math.max(a[1], b[1]) + 0.000001;
    })), "Every drawn edge must lie on a source street segment");
  }
});


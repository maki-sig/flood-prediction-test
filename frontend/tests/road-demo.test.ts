import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDemoForecasts, DEMO_SHELTERS, DEMO_START, DEMO_STREET, getDemoStreetNames } from "../lib/road-demo";
import { checkRoads } from "../lib/road-checker";
import { findNearestAvailableShelter } from "../lib/route-planner";

const roads: GeoJSON.FeatureCollection = JSON.parse(readFileSync("public/gis/geojson/villa_karangahan_roads.geojson", "utf8"));
const route = (probability: number, all = false) => findNearestAvailableShelter(
  DEMO_START, DEMO_SHELTERS, [], checkRoads(roads, createDemoForecasts(roads, DEMO_STREET, probability, all)).network,
);

test("real GIS demo turns Chico Street red and reroutes to the same mock shelter", () => {
  const original = JSON.stringify(roads);
  const green = route(0.1);
  const red = route(0.9);
  assert.ok(green && red);
  assert.equal(red.shelterId, green.shelterId);
  assert.ok(red.distanceKm > green.distanceKm);
  assert.notDeepEqual(red.path, green.path);
  assert.deepEqual(red.path[0], green.path[0]);
  assert.deepEqual(red.path.at(-1), green.path.at(-1));
  const checked = checkRoads(roads, createDemoForecasts(roads, DEMO_STREET, 0.9));
  const chico = checked.roads.features.filter(feature => feature.properties?.name === DEMO_STREET);
  assert.ok(chico.length > 0);
  assert.ok(chico.every(feature => feature.properties?.passability_color === "#ef4444"));
  assert.equal(JSON.stringify(roads), original);
  assert.deepEqual(route(0.1), green, "Restoring green restores the original route");
  console.log(`Live demo fixture: green ${green.distanceKm.toFixed(3)} km; Chico red ${red.distanceKm.toFixed(3)} km.`);
});

test("all red removes every edge and returns no route; demo does not mutate real forecasts", () => {
  assert.equal(route(0.9, true), null);
  const blocked = checkRoads(roads, createDemoForecasts(roads, DEMO_STREET, 0.9, true));
  assert.ok(blocked.roads.features.every(feature => feature.properties?.passability === "not_passable"));
  assert.equal(blocked.network.edges.size, 0);
  assert.ok(getDemoStreetNames(roads).includes(DEMO_STREET));
  assert.ok(createDemoForecasts(roads, DEMO_STREET, 0.1).every(row => row.probability === 0.1));
  assert.throws(() => createDemoForecasts(roads, DEMO_STREET, NaN), RangeError);
});

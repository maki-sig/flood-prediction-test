import type { ShelterPin } from "./evac-actions";
import type { StreetForecast } from "./road-checker";

// Presentation fixtures only. Nothing here is persisted or sent to the model.
export const DEMO_START: [number, number] = [13.6435229, 123.1909163];
export const DEMO_STREET = "Chico Street";
export const DEMO_SHELTERS: ShelterPin[] = [{
  loc_id: -1, shelter_id: -1, latitude: 13.6426062, longitude: 123.1922408,
  shelter: {
    shelter_name: "DEMO shelter (synthetic)", type: "Demo only",
    barangay_name: "Demo", zone_num: 1, max_capacity: 20, curr_capacity: 1,
    shelter_head: null,
  },
}];

export function getDemoStreetNames(roads: GeoJSON.FeatureCollection): string[] {
  return [...new Set(roads.features.map(feature => String(feature.properties?.name ?? "")))]
    .filter(Boolean).sort();
}

export function createDemoForecasts(
  roads: GeoJSON.FeatureCollection,
  selectedStreet: string,
  probability: number,
  blockAll = false,
): StreetForecast[] {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError("Demo probability must be between 0 and 1.");
  }
  // Include unnamed geometry as well so the all-red example really closes it.
  const names = [...new Set(roads.features.map(feature => String(feature.properties?.name ?? "")))];
  return names.map((street_name, index) => ({
    street_id: -(index + 1), street_name,
    probability: blockAll ? 0.9 : street_name === selectedStreet ? probability : 0.1,
  }));
}

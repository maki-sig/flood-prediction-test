import { buildRoadNetwork } from "./road-network";

// Initial operating cutoff, not a calibrated guarantee of road safety.
export const ROAD_PROBABILITY_THRESHOLD = 0.5;

export interface StreetForecast {
  street_id: number;
  street_name: string;
  probability: number;
}

export type RoadStatus = "passable" | "not_passable" | "unknown";

function normalizeStreet(name: string) {
  const normalized = name.toLowerCase().trim().replace(/\s+(street|st\.?)$/, "");
  // Dataset spelling differs from the existing GIS label.
  return normalized === "hamoraon" ? "hamoran" : normalized;
}

export function checkRoads(roads: GeoJSON.FeatureCollection, forecasts: StreetForecast[] = []) {
  const probabilities = new Map<string, number>();
  for (const forecast of forecasts) {
    const probability = forecast.probability;
    if (typeof forecast.street_name !== "string" || !Number.isFinite(probability) || probability < 0 || probability > 1) continue;
    const name = normalizeStreet(forecast.street_name);
    // Conservatively combine duplicate entries rather than let order decide.
    probabilities.set(name, Math.max(probability, probabilities.get(name) ?? 0));
  }
  const features = roads.features.map(feature => {
    const probability = probabilities.get(normalizeStreet(String(feature.properties?.name ?? "")));
    const status: RoadStatus = probability === undefined ? "unknown"
      : probability >= ROAD_PROBABILITY_THRESHOLD ? "not_passable" : "passable";
    return { ...feature, properties: {
      ...feature.properties,
      flood_probability: probability ?? null,
      passability: status,
      passability_color: status === "passable" ? "#22c55e" : status === "not_passable" ? "#ef4444" : "#9ca3af",
    } };
  });
  const checked: GeoJSON.FeatureCollection = { ...roads, features };
  // Missing forecasts do not establish a closure. Keep these roads available
  // for general guidance while retaining their gray, explicitly unknown status.
  // Only a model-predicted red street is removed from the routing graph.
  const routable: GeoJSON.FeatureCollection = {
    ...roads, features: features.filter(feature => feature.properties.passability !== "not_passable"),
  };
  return { roads: checked, network: buildRoadNetwork(routable) };
}

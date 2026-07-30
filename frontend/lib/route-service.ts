export type RouteTransportMode = "foot" | "driving" | "emergency";

export interface RoadRouteResult {
  geometry: [number, number][];
  distanceKm: number;
  durationMinutes: number;
  mode: RouteTransportMode;
}

function normalizeMode(mode: RouteTransportMode) {
  return mode === "emergency" ? "driving" : mode;
}

export async function fetchRoadRoute(
  start: [number, number],
  goal: [number, number],
  mode: RouteTransportMode = "foot"
): Promise<RoadRouteResult> {
  const profile = normalizeMode(mode);
  const startCoord = `${start[1]},${start[0]}`;
  const goalCoord = `${goal[1]},${goal[0]}`;
  const url = `https://router.project-osrm.org/route/v1/${profile}/${startCoord};${goalCoord}?overview=full&geometries=geojson&steps=false`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Routing request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data?.routes?.length) {
    throw new Error("No road route could be found for the selected start and destination.");
  }

  const route = data.routes[0];
  const geometry = (route.geometry?.coordinates ?? []).map((coord: [number, number]) => [coord[1], coord[0]] as [number, number]);

  return {
    geometry,
    distanceKm: Number(route.distance ?? 0) / 1000,
    durationMinutes: Number(route.duration ?? 0) / 60,
    mode: profile as RouteTransportMode,
  };
}

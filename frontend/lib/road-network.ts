// MODIFIED: Use the existing GIS street geometry as connected routing edges, so paths cannot cut across blocks.
export type RoadCoordinate = [number, number];
export interface RoadNetwork {
  coordinates: RoadCoordinate[];
  edges: Map<number, Set<number>>;
}

function projection(point: RoadCoordinate, a: RoadCoordinate, b: RoadCoordinate) {
  const scale = Math.cos(point[0] * Math.PI / 180);
  const dx = (b[1] - a[1]) * scale, dy = b[0] - a[0];
  const t = Math.max(0, Math.min(1, ((point[1] - a[1]) * scale * dx + (point[0] - a[0]) * dy) / (dx * dx + dy * dy || 1)));
  const coordinate: RoadCoordinate = [a[0] + t * dy, a[1] + t * (b[1] - a[1])];
  const distanceMeters = Math.hypot((point[1] - coordinate[1]) * scale, point[0] - coordinate[0]) * 111_195;
  return { t, coordinate, distanceMeters };
}

export function buildRoadNetwork(data: GeoJSON.FeatureCollection): RoadNetwork {
  const coordinates: RoadCoordinate[] = [];
  const ids = new Map<string, number>();
  const segments: [number, number][] = [];
  const node = (coordinate: number[]) => {
    const key = coordinate.slice(0, 2).join(",");
    if (!ids.has(key)) {
      ids.set(key, coordinates.length);
      coordinates.push([coordinate[1], coordinate[0]]);
    }
    return ids.get(key)!;
  };
  for (const feature of data.features) {
    const geometry = feature.geometry;
    const lines = geometry?.type === "MultiLineString" ? geometry.coordinates
      : geometry?.type === "LineString" ? [geometry.coordinates] : [];
    for (const line of lines) {
      const vertices = line.filter(c => Number.isFinite(c[0]) && Number.isFinite(c[1])).map(node);
      for (let i = 1; i < vertices.length; i++) if (vertices[i - 1] !== vertices[i]) segments.push([vertices[i - 1], vertices[i]]);
    }
  }
  const network: RoadNetwork = { coordinates, edges: new Map() };
  // MODIFIED: A junction can be a vertex of one street inside another street's segment; split there instead of connecting nearby parallel roads.
  for (const [a, b] of segments) {
    const splits = coordinates.map((point, id) => ({ id, ...projection(point, coordinates[a], coordinates[b]) }))
      .filter(p => p.distanceMeters < 0.05).sort((left, right) => left.t - right.t);
    for (let i = 1; i < splits.length; i++) connect(network, splits[i - 1].id, splits[i].id);
  }
  return network;
}

function connect(network: RoadNetwork, a: number, b: number) {
  if (!network.edges.has(a)) network.edges.set(a, new Set());
  if (!network.edges.has(b)) network.edges.set(b, new Set());
  network.edges.get(a)!.add(b);
  network.edges.get(b)!.add(a);
}

// MODIFIED: Snap to the street segment itself, with a bounded access distance; never draw a connector through a house.
export function attachRoadEndpoints(source: RoadNetwork, start: RoadCoordinate, goal: RoadCoordinate, maxAccessMeters = 150) {
  const network: RoadNetwork = {
    coordinates: [...source.coordinates],
    edges: new Map([...source.edges].map(([id, neighbors]) => [id, new Set(neighbors)])),
  };
  const attach = (point: RoadCoordinate) => {
    let best: { a: number; b: number; coordinate: RoadCoordinate; distanceMeters: number } | null = null;
    for (const [a, neighbors] of network.edges) for (const b of neighbors) {
      if (a >= b) continue;
      const candidate = projection(point, network.coordinates[a], network.coordinates[b]);
      if (!best || candidate.distanceMeters < best.distanceMeters) best = { a, b, ...candidate };
    }
    if (!best || best.distanceMeters > maxAccessMeters) return null;
    const id = network.coordinates.length;
    network.coordinates.push(best.coordinate);
    network.edges.get(best.a)!.delete(best.b);
    network.edges.get(best.b)!.delete(best.a);
    connect(network, best.a, id);
    connect(network, id, best.b);
    return id;
  };
  const startId = attach(start), goalId = attach(goal);
  return startId === null || goalId === null ? null : { network, startId, goalId };
}

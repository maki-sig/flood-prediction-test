import type { ShelterPin } from "./evac-actions";
import { VKS_MAX_BOUNDS } from "./gis-config";
import { attachRoadEndpoints, type RoadNetwork } from "./road-network";
import { selectBestShelterRecommendation, type ShelterRecommendationCandidate } from "./shelter-recommendation";

export type ShelterRouteCandidate = ShelterRecommendationCandidate;

// Cover the same full map envelope used for pinning. The old bounds clamped
// pins outside a small central box onto its edge, producing wrong routes.
const GRID_MIN_LAT = VKS_MAX_BOUNDS[0][0];
const GRID_MAX_LAT = VKS_MAX_BOUNDS[1][0];
const GRID_MIN_LON = VKS_MAX_BOUNDS[0][1];
const GRID_MAX_LON = VKS_MAX_BOUNDS[1][1];
const GRID_CELLS_X = 110;
const GRID_CELLS_Y = 90;
const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;

function toCell(lat: number, lon: number) {
  // Turn coordinates into grid cells.
  const x = Math.min(
    GRID_CELLS_X - 1,
    Math.max(0, Math.round(((lon - GRID_MIN_LON) / (GRID_MAX_LON - GRID_MIN_LON)) * (GRID_CELLS_X - 1)))
  );
  const y = Math.min(
    GRID_CELLS_Y - 1,
    Math.max(0, Math.round(((lat - GRID_MIN_LAT) / (GRID_MAX_LAT - GRID_MIN_LAT)) * (GRID_CELLS_Y - 1)))
  );
  return { x, y };
}

function toCoord(x: number, y: number): [number, number] {
  // Turn a grid cell back into coordinates.
  const lat = GRID_MIN_LAT + (y / (GRID_CELLS_Y - 1)) * (GRID_MAX_LAT - GRID_MIN_LAT);
  const lon = GRID_MIN_LON + (x / (GRID_CELLS_X - 1)) * (GRID_MAX_LON - GRID_MIN_LON);
  return [lat, lon];
}

function toKey(x: number, y: number) {
  // Make a key for storing each grid cell.
  return `${x},${y}`;
}

type QueueItem = { key: string; score: number };

function pushMin(heap: QueueItem[], item: QueueItem) {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].score <= heap[index].score) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function popMin(heap: QueueItem[]): QueueItem | undefined {
  if (heap.length === 0) return undefined;
  const minimum = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < heap.length && heap[left].score < heap[smallest].score) smallest = left;
      if (right < heap.length && heap[right].score < heap[smallest].score) smallest = right;
      if (smallest === index) break;
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
      index = smallest;
    }
  }
  return minimum;
}

function haversineDistanceKm(a: [number, number], b: [number, number]) {
  // Find the straight-line distance between two points.
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aValue = sinDLat * sinDLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(aValue), Math.sqrt(1 - aValue));
  return earthRadiusKm * c;
}

function heuristicCost(a: [number, number], b: [number, number]) {
  // Estimate the distance left to the goal.
  return haversineDistanceKm(a, b);
}

// MODIFIED: Apply the same Haversine A* scores, heap, and reconstruction to actual street neighbors when GIS geometry is available.
function buildStreetRoute(start: [number, number], goal: [number, number], roads: RoadNetwork): [number, number][] {
  const attached = attachRoadEndpoints(roads, start, goal);
  if (!attached) return [];
  const { network, startId, goalId } = attached;
  const destination = network.coordinates[goalId];
  const startKey = String(startId), goalKey = String(goalId);
  const openSet = new Set([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, heuristicCost(network.coordinates[startId], destination)]]);
  const openQueue: QueueItem[] = [];
  pushMin(openQueue, { key: startKey, score: fScore.get(startKey)! });
  while (openQueue.length) {
    const next = popMin(openQueue)!;
    const currentKey = next.key;
    if (!openSet.has(currentKey) || next.score > (fScore.get(currentKey) ?? Infinity)) continue;
    if (currentKey === goalKey) {
      const path: [number, number][] = [];
      let cursor: string | undefined = currentKey;
      while (cursor !== undefined) {
        path.push(network.coordinates[Number(cursor)]);
        cursor = cameFrom.get(cursor);
      }
      return path.reverse();
    }
    openSet.delete(currentKey);
    const currentId = Number(currentKey);
    for (const neighbor of network.edges.get(currentId) ?? []) {
      const neighborKey = String(neighbor);
      const tentative = gScore.get(currentKey)! + haversineDistanceKm(network.coordinates[currentId], network.coordinates[neighbor]);
      if (tentative < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentative);
        fScore.set(neighborKey, tentative + heuristicCost(network.coordinates[neighbor], destination));
        openSet.add(neighborKey);
        pushMin(openQueue, { key: neighborKey, score: fScore.get(neighborKey)! });
      }
    }
  }
  return [];
}

export function buildAStarRoute(start: [number, number], goal: [number, number], blockedRoads: [number, number][] = [], roads?: RoadNetwork) {
  // MODIFIED: The map supplies its street graph so routing follows road geometry. Legacy grid callers retain their original behavior.
  if (roads) {
    // Closures must never be silently ignored by a road-graph caller.
    if (blockedRoads.length) return [];
    return buildStreetRoute(start, goal, roads);
  }
  // Find the shortest grid route from start to goal.
  const startCell = toCell(start[0], start[1]);
  const goalCell = toCell(goal[0], goal[1]);
  const startKey = toKey(startCell.x, startCell.y);
  const goalKey = toKey(goalCell.x, goalCell.y);
  const blockedCells = new Set<string>();
  for (const [lat, lon] of blockedRoads) {
    const cell = toCell(lat, lon);
    // A report blocks its cell and adjacent cells to account for the grid's
    // roughly 30 m resolution and the fact that a road is wider than a point.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x >= 0 && y >= 0 && x < GRID_CELLS_X && y < GRID_CELLS_Y) blockedCells.add(toKey(x, y));
      }
    }
  }
  blockedCells.delete(startKey);
  if (blockedCells.has(goalKey) && goalKey !== startKey) return [];
  if (startKey === goalKey) return [start, goal];

  const openSet = new Set<string>([startKey]);
  const cameFrom = new Map<string, string | null>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, heuristicCost([start[0], start[1]], goal)]]);
  const openQueue: QueueItem[] = [];
  pushMin(openQueue, { key: startKey, score: fScore.get(startKey)! });

  while (openQueue.length > 0) {
    const next = popMin(openQueue)!;
    const currentKey = next.key;
    // Ignore outdated heap entries left by a shorter path update.
    if (!openSet.has(currentKey) || next.score > (fScore.get(currentKey) ?? Number.POSITIVE_INFINITY)) continue;

    if (currentKey === goalKey) {
      // Follow saved cells to build the route.
      const path: [number, number][] = [];
      let cursor: string | null = currentKey;
      while (cursor) {
        const [xText, yText] = cursor.split(",");
        const x = Number(xText);
        const y = Number(yText);
        path.push(toCoord(x, y));
        cursor = cameFrom.get(cursor) ?? null;
      }
      const cellPath = path.reverse();
      return [start, ...cellPath, goal].filter((point, index, points) =>
        index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]
      );
    }

    openSet.delete(currentKey);

    const [currentXText, currentYText] = currentKey.split(",");
    const currentX = Number(currentXText);
    const currentY = Number(currentYText);
    const currentCoord: [number, number] = toCoord(currentX, currentY);

    for (const [dx, dy] of DIRECTIONS) {
      const nextX = currentX + dx;
      const nextY = currentY + dy;
      if (nextX < 0 || nextY < 0 || nextX >= GRID_CELLS_X || nextY >= GRID_CELLS_Y) {
        continue;
      }

      const neighborKey = toKey(nextX, nextY);
      if (blockedCells.has(neighborKey)) continue;
      // Do not squeeze diagonal routes through the corner of a blocked cell.
      if (dx !== 0 && dy !== 0 &&
          (blockedCells.has(toKey(currentX + dx, currentY)) || blockedCells.has(toKey(currentX, currentY + dy)))) continue;
      const stepCost = haversineDistanceKm(currentCoord, toCoord(nextX, nextY));
      const tentativeGScore = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + stepCost;
      const neighborGScore = gScore.get(neighborKey);

      if (neighborGScore === undefined || tentativeGScore < neighborGScore) {
        // Save this route if it is shorter.
        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeGScore);
        fScore.set(neighborKey, tentativeGScore + heuristicCost(toCoord(nextX, nextY), goal));
        openSet.add(neighborKey);
        pushMin(openQueue, { key: neighborKey, score: fScore.get(neighborKey)! });
      }
    }
  }

  return [];
}

export function findNearestAvailableShelter(start: [number, number], shelters: ShelterPin[], blockedRoads: [number, number][] = [], roads?: RoadNetwork): ShelterRouteCandidate | null {
  // MODIFIED: Compare the same connected street paths that the map draws, rather than unconstrained grid distances.
  const routePlanner = (routeStart: [number, number], goal: [number, number]) => buildAStarRoute(routeStart, goal, blockedRoads, roads);
  return selectBestShelterRecommendation(start, shelters, routePlanner, true);
}

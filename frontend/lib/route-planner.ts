import type { ShelterPin } from "./evac-actions";
import { selectBestShelterRecommendation, type ShelterRecommendationCandidate } from "./shelter-recommendation";

export interface ShelterRouteCandidate extends ShelterRecommendationCandidate {}

const GRID_MIN_LAT = 13.64;
const GRID_MAX_LAT = 13.65;
const GRID_MIN_LON = 123.19;
const GRID_MAX_LON = 123.20;
const GRID_CELLS = 36;
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
  const x = Math.min(
    GRID_CELLS - 1,
    Math.max(0, Math.round(((lon - GRID_MIN_LON) / (GRID_MAX_LON - GRID_MIN_LON)) * (GRID_CELLS - 1)))
  );
  const y = Math.min(
    GRID_CELLS - 1,
    Math.max(0, Math.round(((lat - GRID_MIN_LAT) / (GRID_MAX_LAT - GRID_MIN_LAT)) * (GRID_CELLS - 1)))
  );
  return { x, y };
}

function toCoord(x: number, y: number): [number, number] {
  const lat = GRID_MIN_LAT + (y / (GRID_CELLS - 1)) * (GRID_MAX_LAT - GRID_MIN_LAT);
  const lon = GRID_MIN_LON + (x / (GRID_CELLS - 1)) * (GRID_MAX_LON - GRID_MIN_LON);
  return [lat, lon];
}

function toKey(x: number, y: number) {
  return `${x},${y}`;
}

function haversineDistanceKm(a: [number, number], b: [number, number]) {
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
  return haversineDistanceKm(a, b);
}

export function buildAStarRoute(start: [number, number], goal: [number, number]) {
  const startCell = toCell(start[0], start[1]);
  const goalCell = toCell(goal[0], goal[1]);
  const startKey = toKey(startCell.x, startCell.y);
  const goalKey = toKey(goalCell.x, goalCell.y);

  const openSet = new Set<string>([startKey]);
  const cameFrom = new Map<string, string | null>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, heuristicCost([start[0], start[1]], goal)]]);

  while (openSet.size > 0) {
    let currentKey = startKey;
    let currentScore = Number.POSITIVE_INFINITY;

    for (const candidateKey of openSet) {
      const candidateScore = fScore.get(candidateKey) ?? Number.POSITIVE_INFINITY;
      if (candidateScore < currentScore) {
        currentScore = candidateScore;
        currentKey = candidateKey;
      }
    }

    if (currentKey === goalKey) {
      const path: [number, number][] = [];
      let cursor: string | null = currentKey;
      while (cursor) {
        const [xText, yText] = cursor.split(",");
        const x = Number(xText);
        const y = Number(yText);
        path.push(toCoord(x, y));
        cursor = cameFrom.get(cursor) ?? null;
      }
      return path.reverse();
    }

    openSet.delete(currentKey);

    const [currentXText, currentYText] = currentKey.split(",");
    const currentX = Number(currentXText);
    const currentY = Number(currentYText);
    const currentCoord: [number, number] = toCoord(currentX, currentY);

    for (const [dx, dy] of DIRECTIONS) {
      const nextX = currentX + dx;
      const nextY = currentY + dy;
      if (nextX < 0 || nextY < 0 || nextX >= GRID_CELLS || nextY >= GRID_CELLS) {
        continue;
      }

      const neighborKey = toKey(nextX, nextY);
      const stepCost = haversineDistanceKm(currentCoord, toCoord(nextX, nextY));
      const tentativeGScore = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + stepCost;
      const neighborGScore = gScore.get(neighborKey);

      if (neighborGScore === undefined || tentativeGScore < neighborGScore) {
        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeGScore);
        fScore.set(neighborKey, tentativeGScore + heuristicCost(toCoord(nextX, nextY), goal));
        openSet.add(neighborKey);
      }
    }
  }

  return [start, goal];
}

export function findNearestAvailableShelter(start: [number, number], shelters: ShelterPin[]): ShelterRouteCandidate | null {
  return selectBestShelterRecommendation(start, shelters, buildAStarRoute);
}

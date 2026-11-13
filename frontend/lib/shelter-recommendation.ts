import type { ShelterPin } from "./evac-actions";
import { getShelterCapacityStatus } from "./gis-config";

export interface ShelterRecommendationCandidate {
  shelterId: number;
  shelterName: string;
  path: [number, number][];
  distanceKm: number;
  availableCapacity: number;
  goal: [number, number];
  score: number;
  capacityPriority: number;
}

export type ShelterRoutePlanner = (start: [number, number], goal: [number, number]) => [number, number][];

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

function getShelterCapacityInfo(pin: ShelterPin) {
  const maxCapacity = Number(pin.shelter?.max_capacity ?? 0);
  const currCapacity = Number(pin.shelter?.curr_capacity ?? 0);
  const availableCapacity = Math.max(0, maxCapacity - currCapacity);
  return { maxCapacity, currCapacity, availableCapacity };
}

export function filterAvailableShelters(shelters: ShelterPin[]) {
  return shelters.filter((pin) => {
    const { maxCapacity, currCapacity } = getShelterCapacityInfo(pin);
    // A shelter displayed as FULL (90%+) is not a routing candidate, even if
    // its raw capacity count has a few spaces left. This keeps routing aligned
    // with the map's capacity status and reserves those spaces for emergencies.
    return maxCapacity > currCapacity && getShelterCapacityStatus(currCapacity, maxCapacity) !== "full";
  });
}

export function buildShelterRecommendations(
  start: [number, number],
  shelters: ShelterPin[],
  routePlanner: ShelterRoutePlanner
): ShelterRecommendationCandidate[] {
  return filterAvailableShelters(shelters)
    .map((pin) => {
      const goal: [number, number] = [pin.latitude, pin.longitude];

      // Straight-line Haversine distance — used to choose the nearest shelter
      // within the same capacity-status group.
      const straightLineKm = haversineDistanceKm(start, goal);

      // Build the visual route path (only used for drawing the line on the map)
      const path = routePlanner(start, goal);

      // Traced path length for display — may differ from crow-flies distance
      const pathDistanceKm = path.length > 1
        ? path.reduce((total, point, index) => {
            if (index === 0) return total;
            return total + haversineDistanceKm(path[index - 1], point);
          }, 0)
        : straightLineKm;

      const { availableCapacity } = getShelterCapacityInfo(pin);

      const capacityStatus = getShelterCapacityStatus(
        Number(pin.shelter?.curr_capacity ?? 0),
        Number(pin.shelter?.max_capacity ?? 0)
      );

      return {
        shelterId: pin.shelter_id,
        shelterName: pin.shelter?.shelter_name ?? "Shelter",
        path,
        distanceKm: pathDistanceKm,
        availableCapacity,
        goal,
        // Nearly full shelters are routed to first so they can be filled
        // before sending evacuees to shelters with more room.
        capacityPriority: capacityStatus === "almost" ? 0 : 1,
        score: straightLineKm,
      };
    })
    // Primary: almost-full shelters, then available shelters. Within each
    // status group, choose the nearest one; capacity breaks exact distance ties.
    .sort((a, b) => a.capacityPriority - b.capacityPriority || a.score - b.score || b.availableCapacity - a.availableCapacity);
}

export function selectBestShelterRecommendation(
  start: [number, number],
  shelters: ShelterPin[],
  routePlanner: ShelterRoutePlanner
): ShelterRecommendationCandidate | null {
  const ranked = buildShelterRecommendations(start, shelters, routePlanner);
  return ranked[0] ?? null;
}

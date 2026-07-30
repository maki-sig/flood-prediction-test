import type { ShelterPin } from "./evac-actions";

export interface ShelterRecommendationCandidate {
  shelterId: number;
  shelterName: string;
  path: [number, number][];
  distanceKm: number;
  availableCapacity: number;
  goal: [number, number];
  score: number;
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
    return maxCapacity > currCapacity;
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
      const path = routePlanner(start, goal);
      const distanceKm = path.length > 1
        ? path.reduce((total, point, index) => {
            if (index === 0) return total;
            return total + haversineDistanceKm(path[index - 1], point);
          }, 0)
        : haversineDistanceKm(start, goal);
      const { availableCapacity } = getShelterCapacityInfo(pin);
      const capacityPenalty = Math.max(0, 6 - availableCapacity) * 0.08;
      const score = distanceKm + capacityPenalty;

      return {
        shelterId: pin.shelter_id,
        shelterName: pin.shelter?.shelter_name ?? "Shelter",
        path,
        distanceKm,
        availableCapacity,
        goal,
        score,
      };
    })
    .sort((a, b) => a.score - b.score || a.distanceKm - b.distanceKm || b.availableCapacity - a.availableCapacity);
}

export function selectBestShelterRecommendation(
  start: [number, number],
  shelters: ShelterPin[],
  routePlanner: ShelterRoutePlanner
): ShelterRecommendationCandidate | null {
  const ranked = buildShelterRecommendations(start, shelters, routePlanner);
  return ranked[0] ?? null;
}

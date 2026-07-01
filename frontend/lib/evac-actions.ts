/**
 * evac-actions.ts
 * Browser-safe client for the /api/shelters endpoint.
 * Does NOT import Supabase — all DB access happens server-side in the API route.
 */

// ─────────────────────────────────────────────
// Shared types (used by both client and API route)
// ─────────────────────────────────────────────

export interface ShelterFormPayload {
  // Shelter Info
  shelterName: string;
  zoneNum: string;
  barangay: string;
  type: string;
  maxCapacity: string;
  currCapacity: string;
  // Point Person
  fname: string;
  mname: string;
  lname: string;
  contactNum: string;
  socmedUrl: string;
  // Map pin
  latitude: number;
  longitude: number;
}

export type InsertResult =
  | { success: true }
  | { success: false; error: string };

// ─────────────────────────────────────────────
// Shelter pin type returned by the GET endpoint
// ─────────────────────────────────────────────

export interface ShelterPin {
  loc_id: number;
  latitude: number;
  longitude: number;
  shelter_id: number;
  shelter: {
    shelter_name: string;
    type: string;
    barangay_name: string;
    zone_num: number;
    max_capacity: number;
    curr_capacity: number;
    shelter_head: {
      fname: string;
      mname: string;
      lname: string;
      contact_num: string;
      socmed_url: string;
    } | null;
  } | null;
}

// ─────────────────────────────────────────────
// Public API — calls the server-side route
// ─────────────────────────────────────────────

/**
 * Fetches all saved shelter location pins from /api/shelters.
 */
export async function fetchShelterPins(): Promise<ShelterPin[]> {
  try {
    const res = await fetch("/api/shelters", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.pins ?? [];
  } catch {
    return [];
  }
}


/**
 * Sends shelter form data to the /api/shelters server route,
 * which handles all Supabase inserts in FK-safe order.
 */
export async function createShelterEntry(
  payload: ShelterFormPayload
): Promise<InsertResult> {
  try {
    const res = await fetch("/api/shelters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    return { success: false, error: message };
  }
}

/**
 * Sends shelter update payload to the PUT /api/shelters route.
 */
export async function updateShelterEntry(
  shelter_id: number,
  payload: ShelterFormPayload
): Promise<InsertResult> {
  try {
    const res = await fetch("/api/shelters", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelter_id, payload }),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    return { success: false, error: message };
  }
}

/**
 * Sends a DELETE request for a shelter to the /api/shelters route.
 */
export async function deleteShelterEntry(
  shelter_id: number
): Promise<InsertResult> {
  try {
    const res = await fetch(`/api/shelters?shelter_id=${shelter_id}`, {
      method: "DELETE",
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      return { success: false, error: json.error ?? `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    return { success: false, error: message };
  }
}


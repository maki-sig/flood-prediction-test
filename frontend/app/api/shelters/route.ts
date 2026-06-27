/**
 * POST /api/shelters
 * Server-side route handler for creating a new evacuation shelter.
 * Supabase is only imported here — never in the browser bundle.
 *
 * Insert order respects FK constraints:
 *   shelter_head → shelter → location
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import type { ShelterFormPayload } from "../../../lib/evac-actions";

// ── GET /api/shelters ─────────────────────────────────────────────────────────
// Returns all shelter pins: { loc_id, latitude, longitude, shelter_id,
//   shelter_name, type, barangay_name, zone_num }
export async function GET() {
  const { data, error } = await supabase
    .from("location")
    .select(`
      loc_id,
      latitude,
      longitude,
      shelter_id,
      shelter (
        shelter_name,
        type,
        barangay_name,
        zone_num,
        max_capacity,
        curr_capacity
      )
    `);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pins: data ?? [] });
}


export async function POST(request: Request) {
  try {
    const payload: ShelterFormPayload = await request.json();

    // ── Step 1: Insert shelter_head ────────────────────────────────────
    const { data: headRow, error: headError } = await supabase
      .from("shelter_head")
      .insert({
        fname: payload.fname.trim(),
        mname: payload.mname.trim(),
        lname: payload.lname.trim(),
        contact_num: payload.contactNum.trim(),
        socmed_url: payload.socmedUrl.trim(),
      })
      .select("head_id")
      .single();

    if (headError) {
      return NextResponse.json(
        { error: `shelter_head: ${headError.message}` },
        { status: 400 }
      );
    }

    const headId: number = headRow.head_id;

    // ── Step 2: Insert shelter ─────────────────────────────────────────
    const now = new Date().toISOString();
    const { data: shelterRow, error: shelterError } = await supabase
      .from("shelter")
      .insert({
        shelter_name: payload.shelterName.trim(),
        zone_num: parseInt(payload.zoneNum, 10),
        barangay_name: payload.barangay.trim(),
        municipality: "Naga City",
        type: payload.type,
        max_capacity: parseInt(payload.maxCapacity, 10),
        curr_capacity: parseInt(payload.currCapacity, 10),
        created_at: now,
        last_update: now,
        head_id: headId,
      })
      .select("shelter_id")
      .single();

    if (shelterError) {
      return NextResponse.json(
        { error: `shelter: ${shelterError.message}` },
        { status: 400 }
      );
    }

    const shelterId: number = shelterRow.shelter_id;

    // ── Step 3: Insert location ────────────────────────────────────────
    const { error: locationError } = await supabase
      .from("location")
      .insert({
        latitude: payload.latitude,
        longitude: payload.longitude,
        shelter_id: shelterId,
      });

    if (locationError) {
      return NextResponse.json(
        { error: `location: ${locationError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, shelter_id: shelterId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

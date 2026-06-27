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
// Returns all shelter pins including nested shelter and shelter_head data
export async function GET() {
  const { data, error } = await supabase
    .from("location")
    .select(`
      loc_id,
      latitude,
      longitude,
      shelter_id,
      shelter (
        shelter_id,
        head_id,
        shelter_name,
        type,
        barangay_name,
        zone_num,
        max_capacity,
        curr_capacity,
        shelter_head (
          head_id,
          fname,
          mname,
          lname,
          contact_num,
          socmed_url
        )
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

// ── PUT /api/shelters ─────────────────────────────────────────────────────────
// Updates an existing shelter, its point person, and its coordinates
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { shelter_id, payload }: { shelter_id: number; payload: ShelterFormPayload } = body;

    if (!shelter_id) {
      return NextResponse.json({ error: "shelter_id is required" }, { status: 400 });
    }

    // 1. Fetch shelter to get head_id
    const { data: shelterRow, error: fetchError } = await supabase
      .from("shelter")
      .select("head_id")
      .eq("shelter_id", shelter_id)
      .single();

    if (fetchError || !shelterRow) {
      return NextResponse.json({ error: `Shelter not found: ${fetchError?.message || 'Not found'}` }, { status: 404 });
    }

    const headId = shelterRow.head_id;

    // 2. Update shelter_head if exists
    if (headId) {
      const { error: headError } = await supabase
        .from("shelter_head")
        .update({
          fname: payload.fname.trim(),
          mname: payload.mname.trim(),
          lname: payload.lname.trim(),
          contact_num: payload.contactNum.trim(),
          socmed_url: payload.socmedUrl.trim(),
        })
        .eq("head_id", headId);

      if (headError) {
        return NextResponse.json({ error: `shelter_head update: ${headError.message}` }, { status: 400 });
      }
    }

    // 3. Update shelter
    const now = new Date().toISOString();
    const { error: shelterError } = await supabase
      .from("shelter")
      .update({
        shelter_name: payload.shelterName.trim(),
        zone_num: parseInt(payload.zoneNum, 10),
        barangay_name: payload.barangay.trim(),
        type: payload.type,
        max_capacity: parseInt(payload.maxCapacity, 10),
        curr_capacity: parseInt(payload.currCapacity, 10),
        last_update: now,
      })
      .eq("shelter_id", shelter_id);

    if (shelterError) {
      return NextResponse.json({ error: `shelter update: ${shelterError.message}` }, { status: 400 });
    }

    // 4. Update location (coordinates)
    const { error: locationError } = await supabase
      .from("location")
      .update({
        latitude: payload.latitude,
        longitude: payload.longitude,
      })
      .eq("shelter_id", shelter_id);

    if (locationError) {
      return NextResponse.json({ error: `location update: ${locationError.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE /api/shelters ──────────────────────────────────────────────────────
// Deletes a shelter and all associated records in FK-safe order
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shelter_id_str = searchParams.get("shelter_id");
    if (!shelter_id_str) {
      return NextResponse.json({ error: "shelter_id query parameter is required" }, { status: 400 });
    }
    const shelter_id = parseInt(shelter_id_str, 10);

    // 1. Fetch shelter to get head_id
    const { data: shelterRow, error: fetchError } = await supabase
      .from("shelter")
      .select("head_id")
      .eq("shelter_id", shelter_id)
      .single();

    if (fetchError || !shelterRow) {
      return NextResponse.json({ error: `Shelter not found: ${fetchError?.message || 'Not found'}` }, { status: 404 });
    }

    const headId = shelterRow.head_id;

    // 2. Delete location (FK references shelter)
    const { error: locationError } = await supabase
      .from("location")
      .delete()
      .eq("shelter_id", shelter_id);

    if (locationError) {
      return NextResponse.json({ error: `location delete: ${locationError.message}` }, { status: 400 });
    }

    // 3. Delete shelter
    const { error: shelterError } = await supabase
      .from("shelter")
      .delete()
      .eq("shelter_id", shelter_id);

    if (shelterError) {
      return NextResponse.json({ error: `shelter delete: ${shelterError.message}` }, { status: 400 });
    }

    // 4. Delete shelter_head
    if (headId) {
      const { error: headError } = await supabase
        .from("shelter_head")
        .delete()
        .eq("head_id", headId);

      if (headError) {
        return NextResponse.json({ error: `shelter_head delete: ${headError.message}` }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


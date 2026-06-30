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



function validatePayload(payload: any): string | null {
  if (!payload) {
    return "Request payload is missing.";
  }

  // 1. Check required fields are present and are non-empty strings
  const requiredFields = [
    { key: "shelterName", label: "Shelter Name" },
    { key: "zoneNum", label: "Zone / Phase" },
    { key: "barangay", label: "Barangay" },
    { key: "maxCapacity", label: "Max Capacity" },
    { key: "fname", label: "Point Person First Name" },
    { key: "lname", label: "Point Person Last Name" },
    { key: "contactNum", label: "Point Person Contact Number" },
  ];

  for (const field of requiredFields) {
    const value = payload[field.key];
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      return `${field.label} is required.`;
    }
  }

  // 2. Length limits to prevent spam
  if (payload.shelterName.trim().length < 3 || payload.shelterName.trim().length > 100) {
    return "Shelter Name must be between 3 and 100 characters.";
  }

  if (payload.zoneNum.trim().length > 5) {
    return "Zone / Phase must not exceed 5 characters.";
  }

  if (payload.barangay.trim().length < 3 || payload.barangay.trim().length > 50) {
    return "Barangay must be between 3 and 50 characters.";
  }

  // 3. Format & Value Checks
  const zoneVal = parseInt(payload.zoneNum, 10);
  if (isNaN(zoneVal) || zoneVal <= 0 || zoneVal > 999) {
    return "Zone / Phase must be a valid number between 1 and 999.";
  }

  const maxCapVal = parseInt(payload.maxCapacity, 10);
  if (isNaN(maxCapVal) || maxCapVal <= 0 || maxCapVal > 99999) {
    return "Max Capacity must be a number between 1 and 99,999.";
  }

  const currCapVal = payload.currCapacity !== undefined && payload.currCapacity !== null && String(payload.currCapacity).trim()
    ? parseInt(payload.currCapacity, 10)
    : 0;

  if (isNaN(currCapVal) || currCapVal < 0 || currCapVal > 99999) {
    return "Current Capacity must be a valid number between 0 and 99,999.";
  }

  if (currCapVal > maxCapVal) {
    return "Current capacity cannot exceed maximum capacity.";
  }

  const fNameVal = (payload.fname || "").trim();
  if (fNameVal.length < 2 || fNameVal.length > 50) {
    return "First Name must be between 2 and 50 characters.";
  }

  const mNameVal = (payload.mname || "").trim();
  if (mNameVal && mNameVal.length > 50) {
    return "Middle Name must not exceed 50 characters.";
  }

  const lNameVal = (payload.lname || "").trim();
  if (lNameVal.length < 2 || lNameVal.length > 50) {
    return "Last Name must be between 2 and 50 characters.";
  }

  // Name Regex: Letters, spaces, hyphens, and periods
  const nameRegex = /^[a-zA-Z\s.\-]+$/;
  if (!nameRegex.test(fNameVal)) {
    return "First Name must contain only letters, spaces, dots, or hyphens.";
  }
  if (mNameVal && !nameRegex.test(mNameVal)) {
    return "Middle Name must contain only letters, spaces, dots, or hyphens.";
  }
  if (!nameRegex.test(lNameVal)) {
    return "Last Name must contain only letters, spaces, dots, or hyphens.";
  }

  // PH Mobile Regex: Starts with 09 or +639 followed by 9 digits
  const contactVal = (payload.contactNum || "").trim();
  if (contactVal.length < 11 || contactVal.length > 13) {
    return "Contact Number must be between 11 and 13 characters.";
  }
  const phoneRegex = /^(09|\+639)\d{9}$/;
  if (!phoneRegex.test(contactVal)) {
    return "Contact Number must be a valid PH mobile number (e.g. 09123456789).";
  }

  // Optional URL check
  const urlVal = (payload.socmedUrl || "").trim();
  if (urlVal) {
    if (urlVal.length > 200) {
      return "Social Media URL must not exceed 200 characters.";
    }
    try {
      new URL(urlVal);
    } catch (e) {
      return "Please enter a valid Social Media URL (including http:// or https://).";
    }
  }

  // Geofence check
  const lat = payload.latitude;
  const lon = payload.longitude;
  if (lat === undefined || lat === null || isNaN(lat) || lon === undefined || lon === null || isNaN(lon)) {
    return "Latitude and Longitude coordinates are required.";
  }
  if (lat < 13.5500 || lat > 13.6800 || lon < 123.1400 || lon > 123.2700) {
    return "Shelter location pin must be within the boundaries of Naga City.";
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const payload: ShelterFormPayload = await request.json();

    const validationError = validatePayload(payload);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }


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

    const validationError = validatePayload(payload);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
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


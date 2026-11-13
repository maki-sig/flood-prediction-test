import { NextResponse } from "next/server";
import { getRoadStatusServerClient, requireOfficial } from "../../../lib/road-status-server";

export async function GET() {
  const auth = await requireOfficial();
  if (!auth) return NextResponse.json({ error: "Official sign-in is required." }, { status: 401 });
  const { data, error } = await auth.client.from("evacuation_alerts").select("id,reason,latitude,longitude,created_at").is("acknowledged_at", null).order("created_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.reason !== "string" || payload.reason.length > 500
    || !Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)
    || payload.latitude < -90 || payload.latitude > 90 || payload.longitude < -180 || payload.longitude > 180) {
    return NextResponse.json({ error: "Invalid evacuation alert." }, { status: 400 });
  }
  const client = await getRoadStatusServerClient();
  const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: match } = await client.from("evacuation_alerts").select("id")
    .eq("reason", payload.reason).gte("created_at", recent).is("acknowledged_at", null)
    .gte("latitude", payload.latitude - 0.0003).lte("latitude", payload.latitude + 0.0003)
    .gte("longitude", payload.longitude - 0.0003).lte("longitude", payload.longitude + 0.0003).limit(1).maybeSingle();
  if (match) return NextResponse.json({ alertId: match.id, deduplicated: true });
  const { data, error } = await client.from("evacuation_alerts").insert({
    reason: payload.reason, latitude: payload.latitude, longitude: payload.longitude,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alertId: data.id }, { status: 201 });
}

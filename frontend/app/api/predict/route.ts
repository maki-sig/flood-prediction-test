import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Helper function to calculate daily stats
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateDailyStats(predictions: any[]) {
  let peakProb = 0;
  let peakHour = 0;
  let totalRain = 0;
  let avgProb = 0;

  predictions.forEach((p) => {
    if (p.probability > peakProb) {
      peakProb = p.probability;
      peakHour = p.hour;
    }
    totalRain += p.rain_intensity_1h;
    avgProb += p.probability;
  });

  avgProb = predictions.length > 0 ? avgProb / predictions.length : 0;

  let riskLevel = "Safe";
  if (peakProb >= 0.35) riskLevel = "High";
  else if (peakProb >= 0.1) riskLevel = "Moderate";
  else if (peakProb >= 0.01) riskLevel = "Low";

  return {
    summary: {
      risk_level: riskLevel,
      peak_probability: parseFloat((peakProb * 100).toFixed(4)),
      peak_hour: peakHour,
      average_probability: parseFloat((avgProb * 100).toFixed(4)),
      total_precipitation: parseFloat(totalRain.toFixed(2)),
    },
    hourly: predictions,
  };
}

// Resilient fullstack helper to extract date strings in Asia/Manila timezone (UTC+8)
function getManilaDateStrings() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));

  const year = partMap.year;
  const month = partMap.month;
  const day = partMap.day;

  const todayStr = `${year}-${month}-${day}`;

  // Calculate relative days purely using UTC calculations to bypass server offset bias
  const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));

  const tomorrow = new Date(date);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const dayAfterTomorrow = new Date(date);
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 2);
  const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split("T")[0];

  return { todayStr, tomorrowStr, dayAfterTomorrowStr };
}

// Helper to fetch records from Supabase
async function fetchPredictionRecords(startOfToday: string, endOfDayAfterTomorrow: string) {
  const records = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("street_prediction_logs").select("*")
      .gte("forecast_time", startOfToday).lte("forecast_time", endOfDayAfterTomorrow)
      .order("street_id").order("forecast_time").range(offset, offset + 999);
    if (error) throw new Error(error.message);
    records.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return records;
}

// Helper to trigger Python backend synchronization
async function syncWithBackend(latitude: string, longitude: string, force: boolean) {
  const backendApiUrl = process.env.BACKEND_API_URL || "http://127.0.0.1:8000";
  const updateSecret = process.env.UPDATE_SECRET;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (updateSecret) {
    headers["Authorization"] = `Bearer ${updateSecret}`;
  }

  const queryParams = new URLSearchParams({ latitude, longitude });
  if (force) queryParams.append("force", "true");

  // 2. POST weather payload to Python backend /update
  const response = await fetch(`${backendApiUrl}/update?${queryParams.toString()}`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(120000)
  });

  const result = await response.json();
  if (!response.ok || result.status === "error") {
    throw new Error(`Backend update failed with status ${response.status}`);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latitude = searchParams.get("latitude") || "13.6452";
    const longitude = searchParams.get("longitude") || "123.1938";
    const forceUpdate = searchParams.get("update") === "true";

    // 1. Resolve exact targets in Asia/Manila timezone
    const { todayStr, tomorrowStr, dayAfterTomorrowStr } = getManilaDateStrings();

    const startOfToday = `${todayStr}T00:00:00+08:00`;
    const endOfDayAfterTomorrow = `${dayAfterTomorrowStr}T23:59:59+08:00`;

    // 2. Fetch predictions from Supabase
    let dbRecords = forceUpdate ? [] : await fetchPredictionRecords(startOfToday, endOfDayAfterTomorrow);
    
    // 3. Resilient Fallback: Sync with Python backend if data is missing, incomplete, or forced
    const { data: catalog, error: catalogError } = await supabase.from("prediction_streets").select("*").order("street_id");
    if (catalogError || !catalog?.length) throw new Error("Street catalog unavailable; apply the database migration");
    const complete = (rows: typeof dbRecords) => catalog.every(street => new Set(rows.filter(r => r.street_id === street.street_id).map(r => r.forecast_time)).size === 72);
    const expectedCount = 72 * catalog.length; // 3 days * 24 hours
    if (!complete(dbRecords) || forceUpdate || dbRecords.some(r => Date.now() - new Date(r.created_at).getTime() > 90 * 60000)) {
      console.log(`[Sync] Triggering background update (Force=${forceUpdate}, Count=${dbRecords.length}/${expectedCount})...`);
      
      try {
        await syncWithBackend(latitude, longitude, forceUpdate);
        // Retry fetching freshly populated data from Supabase
        dbRecords = await fetchPredictionRecords(startOfToday, endOfDayAfterTomorrow);
      } catch (err: unknown) {
        console.error("[Fallback Error] Failed to sync predictions:", err instanceof Error ? err.message : String(err));
      }
    }

    if (!dbRecords || dbRecords.length === 0) {
      throw new Error("No prediction records available in the database after fallback attempt.");
    }

    // 4. Format database records to match expected frontend structure in Manila Time (UTC+8)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allPredictions = dbRecords.map((r: any) => {
      const dateObj = new Date(r.forecast_time);

      // Resolve the date string in Asia/Manila timezone (YYYY-MM-DD)
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(dateObj);
      const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
      const sgDate = `${partMap.year}-${partMap.month}-${partMap.day}`;

      // Resolve the hour in Asia/Manila timezone (0-23)
      const hourFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        hour12: false,
      });
      const hourParts = hourFormatter.formatToParts(dateObj);
      const hourPartMap = Object.fromEntries(hourParts.map(p => [p.type, p.value]));
      let sgHour = parseInt(hourPartMap.hour);
      if (sgHour === 24) sgHour = 0;

      // Reconstruct formatted local time string for chart index matching
      const localHH = sgHour.toString().padStart(2, '0');
      const timeStr = `${sgDate}T${localHH}:00`;

      return {
        street_id: r.street_id,
        time: timeStr,
        hour: sgHour,
        sgDate,
        rain_intensity_1h: r.rain_intensity_1h,
        rain_accum_6h: r.rain_accum_6h,
        rain_accum_24h: r.rain_accum_24h,
        probability: parseFloat(r.predicted_probability.toFixed(6)),
      };
    });

    const streets = catalog.map(street => {
      const rows = allPredictions.filter(p => p.street_id === street.street_id);
      const days = Object.fromEntries([["today", todayStr], ["tomorrow", tomorrowStr], ["dayAfterTomorrow", dayAfterTomorrowStr]].map(([key, date]) => {
        const hourly = rows.filter(p => p.sgDate === date);
        return [key, {date, ...calculateDailyStats(hourly), complete: hourly.length === 24}];
      }));
      return {...street, days};
    });
    // 6. Return combined 3-day structured payload
    return NextResponse.json({
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        elevation: 5.0,
        timezone: "Asia/Manila",
        timezone_abbreviation: "PST",
      },
      last_updated: dbRecords[0]?.created_at || null,
      streets,
      complete: complete(dbRecords),
      stale: !dbRecords.length || Date.now() - Math.min(...dbRecords.map(r => new Date(r.created_at).getTime())) > 90 * 60000,
      days: streets[0].days,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

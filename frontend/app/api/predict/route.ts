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
  if (peakProb > 0.5) riskLevel = "High";
  else if (peakProb > 0.2) riskLevel = "Moderate";
  else if (peakProb > 0.05) riskLevel = "Low";

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
  const { data, error } = await supabase
    .from("rainfall_prediction_logs")
    .select("*")
    .gte("forecast_time", startOfToday)
    .lte("forecast_time", endOfDayAfterTomorrow)
    .order("forecast_time", { ascending: true });

  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }
  return data || [];
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

  // 1. Fetch weather payload using Vercel IP (resilient proxying)
  let weatherData = null;
  try {
    const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=precipitation&timezone=GMT&past_days=1&forecast_days=3`;
    console.log(`[Vercel Fetch] Querying Open-Meteo directly: ${openMeteoUrl}`);
    const weatherRes = await fetch(openMeteoUrl);
    if (weatherRes.ok) {
      weatherData = await weatherRes.json();
    } else {
      console.warn(`[Vercel Fetch] Direct Open-Meteo query failed with status ${weatherRes.status}. Falling back to backend direct fetching.`);
    }
  } catch (err: any) {
    console.error("[Vercel Fetch] Failed fetching from Open-Meteo:", err.message);
  }

  const queryParams = new URLSearchParams({ latitude, longitude });
  if (force) queryParams.append("force", "true");

  // 2. POST weather payload to Python backend /update
  const response = await fetch(`${backendApiUrl}/update?${queryParams.toString()}`, {
    method: "POST",
    headers,
    body: weatherData ? JSON.stringify(weatherData) : undefined
  });

  if (!response.ok) {
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
    const expectedCount = 72; // 3 days * 24 hours
    if (dbRecords.length < expectedCount || forceUpdate) {
      console.log(`[Sync] Triggering background update (Force=${forceUpdate}, Count=${dbRecords.length}/${expectedCount})...`);
      
      try {
        await syncWithBackend(latitude, longitude, forceUpdate);
        // Retry fetching freshly populated data from Supabase
        dbRecords = await fetchPredictionRecords(startOfToday, endOfDayAfterTomorrow);
      } catch (err: any) {
        console.error("[Fallback Error] Failed to sync predictions:", err.message);
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
        time: timeStr,
        hour: sgHour,
        sgDate,
        rain_intensity_1h: r.rain_intensity_1h,
        rain_accum_6h: r.rain_accum_6h,
        rain_accum_24h: r.rain_accum_24h,
        probability: parseFloat(r.predicted_probability.toFixed(6)),
      };
    });

    // 5. Slice predictions into respective days using resolved Manila calendar dates
    const todayPredictions = allPredictions.filter((p) => p.sgDate === todayStr);
    const tomorrowPredictions = allPredictions.filter((p) => p.sgDate === tomorrowStr);
    const dayAfterTomorrowPredictions = allPredictions.filter((p) => p.sgDate === dayAfterTomorrowStr);

    const todayBlock = calculateDailyStats(todayPredictions);
    const tomorrowBlock = calculateDailyStats(tomorrowPredictions);
    const dayAfterTomorrowBlock = calculateDailyStats(dayAfterTomorrowPredictions);

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
      days: {
        today: {
          date: todayStr,
          ...todayBlock,
        },
        tomorrow: {
          date: tomorrowStr,
          ...tomorrowBlock,
        },
        dayAfterTomorrow: {
          date: dayAfterTomorrowStr,
          ...dayAfterTomorrowBlock,
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

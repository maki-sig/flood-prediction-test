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

// Resilient fullstack helper to extract date strings in Asia/Singapore timezone (UTC+8)
function getSingaporeDateStrings() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore",
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latitude = searchParams.get("latitude") || "13.6192";
    const longitude = searchParams.get("longitude") || "123.1814";

    // 1. Resolve exact targets in Asia/Singapore timezone
    const { todayStr, tomorrowStr, dayAfterTomorrowStr } = getSingaporeDateStrings();

    const startOfToday = `${todayStr}T00:00:00`;
    const endOfDayAfterTomorrow = `${dayAfterTomorrowStr}T23:59:59`;

    const forceUpdate = searchParams.get("update") === "true";

    // 2. Fetch predictions from Supabase
    let dbRecords = null;
    let currentCount = 0;
    
    if (!forceUpdate) {
      const { data, error: dbError } = await supabase
        .from("rainfall_prediction_logs")
        .select("*")
        .gte("forecast_time", startOfToday)
        .lte("forecast_time", endOfDayAfterTomorrow)
        .order("forecast_time", { ascending: true });

      if (dbError) {
        throw new Error(`Supabase query failed: ${dbError.message}`);
      }
      dbRecords = data;
      currentCount = dbRecords?.length || 0;
    }

    // 3. Resilient Fallback: If no records are found, data is incomplete, or forceUpdate is requested,
    // trigger a background update automatically from the Python backend to synchronize.
    const expectedCount = 72; // 3 days * 24 hours

    if (!dbRecords || currentCount < expectedCount || forceUpdate) {
      console.log(`[Fullstack Sync] Triggering background update (Force=${forceUpdate}, Count=${currentCount}/${expectedCount})...`);
      const backendApiUrl = process.env.BACKEND_API_URL || "http://127.0.0.1:8000";
      
      const updateSecret = process.env.UPDATE_SECRET;
      const headers: HeadersInit = {};
      if (updateSecret) {
        headers["Authorization"] = `Bearer ${updateSecret}`;
      }

      try {
        const updateRes = await fetch(`${backendApiUrl}/update?latitude=${latitude}&longitude=${longitude}${forceUpdate ? "&force=true" : ""}`, {
          method: "POST",
          headers
        });
        if (updateRes.ok) {
          // Retry fetching the freshly populated data from Supabase
          const retryResult = await supabase
            .from("rainfall_prediction_logs")
            .select("*")
            .gte("forecast_time", startOfToday)
            .lte("forecast_time", endOfDayAfterTomorrow)
            .order("forecast_time", { ascending: true });
          
          if (retryResult.data && retryResult.data.length > 0) {
            dbRecords = retryResult.data;
          }
        }
      } catch (err: any) {
        console.error("[Fullstack Fallback] Failed to automatically sync predictions:", err.message);
      }
    }

    if (!dbRecords || dbRecords.length === 0) {
      throw new Error("No prediction records available in the database.");
    }

    // 4. Format database records to match expected frontend structure in Singapore Time (UTC+8)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allPredictions = dbRecords.map((r: any) => {
      const dateObj = new Date(r.forecast_time);

      // Resolve the date string in Asia/Singapore timezone (YYYY-MM-DD)
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(dateObj);
      const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
      const sgDate = `${partMap.year}-${partMap.month}-${partMap.day}`;

      // Resolve the hour in Asia/Singapore timezone (0-23)
      const hourFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Singapore",
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

    // 5. Slice predictions into respective days using resolved Singapore calendar dates
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
        elevation: 20.0,
        timezone: "Asia/Singapore",
        timezone_abbreviation: "+08",
      },
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

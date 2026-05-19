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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latitude = searchParams.get("latitude") || "13.6192";
    const longitude = searchParams.get("longitude") || "123.1814";

    // 1. Resolve target dates in Asia/Singapore timezone
    const localTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
    
    const today = new Date(localTime);
    const todayStr = today.toISOString().split("T")[0];

    const tomorrow = new Date(localTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const dayAfterTomorrow = new Date(localTime);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split("T")[0];

    const startOfToday = `${todayStr}T00:00:00`;
    const endOfDayAfterTomorrow = `${dayAfterTomorrowStr}T23:59:59`;

    // 2. Fetch predictions from Supabase
    let { data: dbRecords, error: dbError } = await supabase
      .from("rainfall_prediction_logs")
      .select("*")
      .gte("forecast_time", startOfToday)
      .lte("forecast_time", endOfDayAfterTomorrow)
      .order("forecast_time", { ascending: true });

    if (dbError) {
      throw new Error(`Supabase query failed: ${dbError.message}`);
    }

    // 3. Fallback: If no records are found in database, trigger a backend update first
    if (!dbRecords || dbRecords.length === 0) {
      console.log("No prediction logs found in database for current timeframe. Triggering backend update...");
      const backendApiUrl = process.env.BACKEND_API_URL || "http://127.0.0.1:8000";
      
      try {
        const updateRes = await fetch(`${backendApiUrl}/update`, {
          method: "POST"
        });
        if (updateRes.ok) {
          // Retry fetching from Supabase
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
        console.error("Failed to automatically update predictions:", err.message);
      }
    }

    if (!dbRecords || dbRecords.length === 0) {
      throw new Error("No prediction records available in the database.");
    }

    // 4. Format database records to match expected frontend structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allPredictions = dbRecords.map((r: any) => {
      let formattedTime = r.forecast_time;
      if (typeof formattedTime === "string") {
        // "2026-05-19T00:00:00+00:00" -> "2026-05-19T00:00"
        // "2026-05-19 00:00:00" -> "2026-05-19T00:00"
        formattedTime = formattedTime.replace(" ", "T").substring(0, 16);
      }

      return {
        time: formattedTime,
        hour: new Date(formattedTime).getHours(),
        rain_intensity_1h: r.rain_intensity_1h,
        rain_accum_6h: r.rain_accum_6h,
        rain_accum_24h: r.rain_accum_24h,
        probability: parseFloat(r.predicted_probability.toFixed(6)),
      };
    });

    // 5. Slice predictions into respective days
    const todayPredictions = allPredictions.filter((p) => p.time.startsWith(todayStr));
    const tomorrowPredictions = allPredictions.filter((p) => p.time.startsWith(tomorrowStr));
    const dayAfterTomorrowPredictions = allPredictions.filter((p) => p.time.startsWith(dayAfterTomorrowStr));

    const todayBlock = calculateDailyStats(todayPredictions);
    const tomorrowBlock = calculateDailyStats(tomorrowPredictions);
    const dayAfterTomorrowBlock = calculateDailyStats(dayAfterTomorrowPredictions);

    // 6. Return combined 3-day structured payload
    return NextResponse.json({
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        elevation: 20.0, // Naga City average elevation
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

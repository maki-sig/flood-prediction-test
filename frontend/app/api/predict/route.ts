import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

// Helper function to invoke Python bridge script
function runPythonPrediction(pythonPath: string, scriptPath: string, inputData: any[]): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const pyProcess = spawn(pythonPath, [scriptPath]);
    let outputData = "";
    let errorData = "";

    pyProcess.stdout.on("data", (data) => {
      outputData += data.toString();
    });

    pyProcess.stderr.on("data", (data) => {
      errorData += data.toString();
    });

    pyProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(errorData || `Python script exited with code ${code}`));
        return;
      }
      try {
        const probs = JSON.parse(outputData);
        resolve(probs);
      } catch (err) {
        reject(new Error("Failed to parse prediction probabilities: " + err));
      }
    });

    // Write input JSON to stdin and end the stream
    pyProcess.stdin.write(JSON.stringify(inputData));
    pyProcess.stdin.end();
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latitude = searchParams.get("latitude") || "13.6192";
    const longitude = searchParams.get("longitude") || "123.1814";

    // 1. Fetch forecast from Open-Meteo API (with past_days=1 to have lookback data for Today's early hours)
    const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=precipitation&timezone=Asia/Singapore&past_days=1&forecast_days=3`;
    
    const weatherResponse = await fetch(openMeteoUrl);
    if (!weatherResponse.ok) {
      throw new Error(`Open-Meteo API returned status ${weatherResponse.status}`);
    }
    
    const weatherData = await weatherResponse.json();
    if (!weatherData.hourly || !weatherData.hourly.time || !weatherData.hourly.precipitation) {
      throw new Error("Invalid hourly data returned from weather API");
    }
    
    const times: string[] = weatherData.hourly.time;
    const precipitation: number[] = weatherData.hourly.precipitation;

    // 2. Compute rolling features across all hourly points
    const features: any[] = [];
    for (let i = 0; i < times.length; i++) {
      const rain_intensity_1h = precipitation[i];

      // 6h rolling sum
      let sum6h = 0;
      for (let j = Math.max(0, i - 5); j <= i; j++) {
        sum6h += precipitation[j];
      }

      // 24h rolling sum
      let sum24h = 0;
      for (let j = Math.max(0, i - 23); j <= i; j++) {
        sum24h += precipitation[j];
      }

      features.push({
        time: times[i],
        rain_intensity_1h,
        rain_accum_6h: parseFloat(sum6h.toFixed(2)),
        rain_accum_24h: parseFloat(sum24h.toFixed(2)),
      });
    }

    // 3. Resolve target dates in Asia/Singapore timezone
    const localTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
    
    const today = new Date(localTime);
    const todayStr = today.toISOString().split("T")[0];

    const tomorrow = new Date(localTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const dayAfterTomorrow = new Date(localTime);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split("T")[0];

    // Filter features for Today, Tomorrow, and Day After Tomorrow
    const todayFeatures = features.filter((f) => f.time.startsWith(todayStr));
    const tomorrowFeatures = features.filter((f) => f.time.startsWith(tomorrowStr));
    const dayAfterTomorrowFeatures = features.filter((f) => f.time.startsWith(dayAfterTomorrowStr));

    // Combine them into a flat array for a single bulk Python subprocess call
    const allFeatures = [...todayFeatures, ...tomorrowFeatures, ...dayAfterTomorrowFeatures];
    if (allFeatures.length === 0) {
      throw new Error("No forecast intervals resolved for predicted boundaries");
    }

    // 4. Resolve python environment paths
    let rootDir = process.cwd();
    if (!fs.existsSync(path.join(rootDir, "venv")) && fs.existsSync(path.join(rootDir, "..", "venv"))) {
      rootDir = path.join(rootDir, "..");
    }
    
    const pythonPath = path.join(rootDir, "venv", "Scripts", "python.exe");
    const scriptPath = path.join(rootDir, "backend", "predict_json.py");

    if (!fs.existsSync(pythonPath)) {
      throw new Error(`Python executable not found at ${pythonPath}`);
    }
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Python bridge script not found at ${scriptPath}`);
    }

    // 5. Invoke Python ML prediction for all 72 hours
    const predictInputs = allFeatures.map((f) => ({
      rain_intensity_1h: f.rain_intensity_1h,
      rain_accum_6h: f.rain_accum_6h,
      rain_accum_24h: f.rain_accum_24h,
    }));

    const probabilities = await runPythonPrediction(pythonPath, scriptPath, predictInputs);

    // Combine predictions with forecast features
    const allPredictions = allFeatures.map((f, idx) => ({
      time: f.time,
      hour: new Date(f.time).getHours(),
      rain_intensity_1h: f.rain_intensity_1h,
      rain_accum_6h: f.rain_accum_6h,
      rain_accum_24h: f.rain_accum_24h,
      probability: parseFloat(probabilities[idx].toFixed(6)),
    }));

    // Slice predictions back into respective days
    const todayPredictions = allPredictions.slice(0, todayFeatures.length);
    const tomorrowPredictions = allPredictions.slice(todayFeatures.length, todayFeatures.length + tomorrowFeatures.length);
    const dayAfterTomorrowPredictions = allPredictions.slice(todayFeatures.length + tomorrowFeatures.length);

    // 6. Calculate stats for each day block
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

    const todayBlock = calculateDailyStats(todayPredictions);
    const tomorrowBlock = calculateDailyStats(tomorrowPredictions);
    const dayAfterTomorrowBlock = calculateDailyStats(dayAfterTomorrowPredictions);

    // Return combined 3-day structured payload
    return NextResponse.json({
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        elevation: weatherData.elevation,
        timezone: weatherData.timezone,
        timezone_abbreviation: weatherData.timezone_abbreviation,
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export interface HourlyData {
  time: string;
  hour: number;
  rain_intensity_1h: number;
  rain_accum_6h: number;
  rain_accum_24h: number;
  probability: number;
}

export interface DailyPredictionBlock {
  date: string;
  complete: boolean;
  summary: {
    risk_level: string;
    peak_probability: number;
    peak_hour: number;
    average_probability: number;
    total_precipitation: number;
  };
  hourly: HourlyData[];
}

export interface StreetPrediction {
  street_id: number;
  street_name: string;
  elevation: number;
  flood_hazard_level: number;
  days: Record<"today" | "tomorrow" | "dayAfterTomorrow", DailyPredictionBlock>;
}
export interface PredictionResponse {
  streets: StreetPrediction[];
  stale: boolean;
  complete: boolean;
  location: {
    latitude: number;
    longitude: number;
    elevation: number;
    timezone: string;
    timezone_abbreviation: string;
  };
  last_updated?: string;
  days: {
    today: DailyPredictionBlock;
    tomorrow: DailyPredictionBlock;
    dayAfterTomorrow: DailyPredictionBlock;
  };
}

export type ForecastPeriod = "today" | "tomorrow" | "dayAfterTomorrow";

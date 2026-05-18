"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";

interface HourlyData {
  time: string;
  hour: number;
  rain_intensity_1h: number;
  rain_accum_6h: number;
  rain_accum_24h: number;
  probability: number;
}

interface DailyPredictionBlock {
  date: string;
  summary: {
    risk_level: string;
    peak_probability: number;
    peak_hour: number;
    average_probability: number;
    total_precipitation: number;
  };
  hourly: HourlyData[];
}

interface PredictionResponse {
  location: {
    latitude: number;
    longitude: number;
    elevation: number;
    timezone: string;
    timezone_abbreviation: string;
  };
  days: {
    today: DailyPredictionBlock;
    tomorrow: DailyPredictionBlock;
    dayAfterTomorrow: DailyPredictionBlock;
  };
}

const NAGA_LAT = "13.6192";
const NAGA_LON = "123.1814";

// Probability categorization helper with premium theme semantics
const getProbabilityCategory = (p: number, theme: 'dark' | 'light') => {
  const pct = p * 100;
  if (pct < 1.0) {
    return {
      label: "No Chance of Flooding",
      colorClass: "text-safe-text border-safe-border bg-safe-bg",
      textColor: "text-safe-text",
      hex: theme === "dark" ? "#a7f3d0" : "#059669"
    };
  } else if (pct < 10.0) {
    return {
      label: "Low Chance of Flooding",
      colorClass: "text-sky-700 dark:text-sky-200 border-sky-500/20 dark:border-sky-500/30 bg-sky-500/10 dark:bg-sky-500/10",
      textColor: "text-sky-600 dark:text-sky-400",
      hex: theme === "dark" ? "#bae6fd" : "#0284c7"
    };
  } else if (pct < 35.0) {
    return {
      label: "Moderate Chance of Flooding",
      colorClass: "text-amber-700 dark:text-amber-200 border-amber-500/20 dark:border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/10",
      textColor: "text-amber-600 dark:text-amber-400",
      hex: theme === "dark" ? "#fde68a" : "#d97706"
    };
  } else {
    return {
      label: "High Chance of Flooding",
      colorClass: "text-rose-700 dark:text-rose-200 border-rose-500/20 dark:border-rose-500/30 bg-rose-500/10 dark:bg-rose-500/10",
      textColor: "text-rose-600 dark:text-rose-400",
      hex: theme === "dark" ? "#fecdd3" : "#e11d48"
    };
  }
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [data, setData] = useState<PredictionResponse | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'tomorrow' | 'dayAfterTomorrow'>('tomorrow');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Load saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "dark" | "light";
    if (savedTheme) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(savedTheme);
    }
  }, []);

  // Manage theme state and inject data attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Handle scroll visibility for "Scroll to Top" button
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Derive active forecast period data block
  const activeData = useMemo(() => {
    if (!data) return null;
    return data.days[selectedPeriod];
  }, [data, selectedPeriod]);

  // Interactive selected hour index
  const [selectedHourIdx, setSelectedHourIdx] = useState<number>(12);

  // Live timer for next forecast sync
  const [timeUntilNextHour, setTimeUntilNextHour] = useState<string>("59:59");

  // Leaflet.js Dynamic CDNs & Map Refs
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState<'dark' | 'light' | 'satellite'>('dark');

  // Synchronize map style with system theme selection
  useEffect(() => {
    if (theme === "light") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapStyle("light");
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapStyle("dark");
    }
  }, [theme]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [mapInstance, setMapInstance] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileLayerRef = React.useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polygonRef = React.useRef<any>(null);

  // Load Leaflet Script and CSS dynamically on the client side
  useEffect(() => {
    if (typeof window === "undefined") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeafletLoaded(true);
      return;
    }

    const cssLink = document.createElement("link");
    cssLink.id = "leaflet-css";
    cssLink.rel = "stylesheet";
    cssLink.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(cssLink);

    const jsScript = document.createElement("script");
    jsScript.id = "leaflet-js";
    jsScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    jsScript.onload = () => {
      setLeafletLoaded(true);
    };
    document.head.appendChild(jsScript);
  }, []);

  // Fetch prediction function
  const fetchPrediction = useCallback(async (isManualSync = false) => {
    if (isManualSync) setSyncing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/predict?latitude=${NAGA_LAT}&longitude=${NAGA_LON}`);
      if (!res.ok) {
        throw new Error(`Server returned error ${res.status}`);
      }
      const json: PredictionResponse = await res.json();
      if ("error" in json) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error((json as any).error);
      }
      setData(json);
      // Default selected hour is the peak risk hour
      setSelectedHourIdx(json.days[selectedPeriod].summary.peak_hour);
    } catch {
      // Fail silently as error is not used in UI
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [selectedPeriod]);

  // Initial fetch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPrediction();
  }, []);

  // Live countdown timer to the next hour turn (standard open-meteo hourly refresh schedule)
  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      const nextHour = new Date();
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);

      const diffMs = nextHour.getTime() - now.getTime();

      const minutes = Math.floor(diffMs / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);

      const formatNum = (n: number) => n.toString().padStart(2, "0");
      setTimeUntilNextHour(`${formatNum(minutes)}:${formatNum(seconds)}`);

      // Trigger a auto-fetch if countdown reaches exact 00:00
      if (minutes === 0 && seconds === 0) {
        setTimeout(() => fetchPrediction(), 1000);
      }
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);



  // Selected hour details
  const selectedHourDetails = useMemo(() => {
    if (!activeData || !activeData.hourly || activeData.hourly.length === 0) return null;
    return activeData.hourly.find((h) => h.hour === selectedHourIdx) || activeData.hourly[12];
  }, [activeData, selectedHourIdx]);

  // Selected hour category
  const selectedHourCategory = useMemo(() => {
    if (!selectedHourDetails) return null;
    return getProbabilityCategory(selectedHourDetails.probability, theme);
  }, [selectedHourDetails, theme]);

  // Initialize and Maintain the Leaflet GIS Map
  useEffect(() => {
    if (!leafletLoaded || !data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L) return;

    // Set up Leaflet Map inside #flows-leaflet-map
    const mapInstance = L.map("flows-leaflet-map", {
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: false
    }).setView([13.635, 123.250], 12);

    // Dynamic Attribution pinned neatly
    L.control.attribution({ prefix: false }).addTo(mapInstance);

    // User's requested city bounds polygon coordinates
    const polygonCoords: [number, number][] = [
      [13.609968789298009, 123.238264647267],
      [13.603295049815724, 123.18504962357763],
      [13.625651336134831, 123.17440661883975],
      [13.647338250079457, 123.19431933738156],
      [13.662351100172332, 123.25028094293877],
      [13.67380990980166, 123.28804495293048],
      [13.670041129846703, 123.29437332892063],
      [13.674735584354098, 123.30273542780482],
      [13.674263815340117, 123.32482711860592],
      [13.654805049817684, 123.37582600721545],
      [13.650044097448697, 123.31723756354909],
      [13.609968789298009, 123.238264647267]
    ];

    // Determine initial color style
    const category = getProbabilityCategory(selectedHourDetails?.probability || 0, theme);

    const polygon = L.polygon(polygonCoords, {
      color: category.hex,
      fillColor: category.hex,
      fillOpacity: theme === "dark" ? 0.18 : 0.14,
      weight: 2,
      opacity: 0.85
    }).addTo(mapInstance);

    polygonRef.current = polygon;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMapInstance(mapInstance);

    // Automatically fit the map view smoothly bounds
    mapInstance.fitBounds(polygon.getBounds(), {
      padding: [40, 40]
    });

    return () => {
      mapInstance.remove();
      setMapInstance(null);
    };
  }, [leafletLoaded, data]);

  // Dynamically swap the active tile layer based on mapStyle selection
  useEffect(() => {
    if (!leafletLoaded || !mapInstance) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L) return;

    // Remove existing tile layer if any
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    let url = "";
    let attrib = "";

    if (mapStyle === "dark") {
      url = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
      attrib = "&copy; CARTO";
    } else if (mapStyle === "light") {
      url = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
      attrib = "&copy; CARTO";
    } else {
      url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      attrib = "&copy; Esri";
    }

    const newLayer = L.tileLayer(url, {
      maxZoom: 20,
      attribution: attrib,
      subdomains: "abcd"
    }).addTo(mapInstance);

    tileLayerRef.current = newLayer;
  }, [mapStyle, leafletLoaded, mapInstance]);

  // Dynamically update polygon color styles on selected hour or theme change
  useEffect(() => {
    if (!leafletLoaded || !selectedHourDetails) return;
    const category = getProbabilityCategory(selectedHourDetails.probability, theme);

    if (polygonRef.current) {
      polygonRef.current.setStyle({
        color: category.hex,
        fillColor: category.hex,
        fillOpacity: theme === "dark" ? 0.18 : 0.14,
        weight: 2,
        opacity: 0.85
      });
    }
  }, [selectedHourDetails, leafletLoaded, theme]);


  // SVG Chart Dimensions and Math
  const chartHeight = 220;
  const chartWidth = 720;
  const paddingLeft = 45;
  const paddingRight = 45;
  const paddingTop = 20;
  const paddingBottom = 30;

  // Max precipitation value for Y-axis scaling
  const maxPrecip = useMemo(() => {
    if (!activeData || !activeData.hourly) return 1.0;
    return Math.max(...activeData.hourly.map(h => h.rain_intensity_1h), 1.0);
  }, [activeData]);

  const chartPoints = useMemo(() => {
    if (!activeData || !activeData.hourly) return null;
    const hourly = activeData.hourly;

    const xStride = (chartWidth - paddingLeft - paddingRight) / 23;

    return hourly.map((h, i) => {
      const x = paddingLeft + i * xStride;
      // Precip (left axis)
      const yPrecip = chartHeight - paddingBottom - (h.rain_intensity_1h / maxPrecip) * (chartHeight - paddingTop - paddingBottom);
      // Probability (right axis)
      const yProb = chartHeight - paddingBottom - (h.probability / 1.0) * (chartHeight - paddingTop - paddingBottom);

      return { x, yPrecip, yProb, ...h };
    });
  }, [activeData, maxPrecip]);

  // Formatting utilities
  const formatHour = (h: number) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:00 ${ampm}`;
  };

  // Overall Risk Category
  const summaryCategory = useMemo(() => {
    if (!activeData) return null;
    return getProbabilityCategory(activeData.summary.peak_probability / 100, theme);
  }, [activeData, theme]);

  return (
    <div className="min-h-screen bg-bg-base text-text-text font-sans flex flex-col antialiased selection:bg-blue-500/20 selection:text-blue-500 flows-root">

      {/* Dynamic glow decorations using soft theme-aware colors */}
      <div className="absolute top-[80vh] left-10 w-80 h-80 bg-[#cba6f7]/5 dark:bg-[#cba6f7]/3 bg-[#cba6f7]/1 rounded-none blur-[100px] pointer-events-none z-0" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#89b4fa]/5 dark:bg-[#89b4fa]/3 bg-[#89b4fa]/1 rounded-none blur-[120px] pointer-events-none z-0" />

      {/* Header Navigation (Catppuccin Mantle) */}
      <header className="relative w-full border-b border-border-surface bg-bg-mantle/90 backdrop-blur-md z-30 px-6 py-4 flex items-center justify-between flows-header">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-sm md:text-base font-extrabold tracking-wider uppercase bg-gradient-to-r from-text-text to-text-subtext text-transparent bg-clip-text">
              FLOWS
            </h1>
            <p className="text-[9px] text-text-subtext font-mono tracking-wider uppercase">ML-Driven Flood Prediction Module</p>
          </div>
        </div>

        {/* Live System Indicators & Theme Toggle */}
        <div className="flex items-center gap-4 font-mono text-[10px] text-text-subtext">
          <div className="flex items-center justify-center gap-2 h-7 px-3 border border-border-surface bg-bg-crust/50 rounded-[4px] flows-indicator">
            <span className="text-text-subtext font-bold">NEXT FETCH IN:</span>
            <span className="text-blue-600 dark:text-blue-400 font-bold animate-pulse">{timeUntilNextHour}</span>
          </div>

          <div className="flex items-center justify-center gap-2 h-7 px-3 border border-border-surface bg-bg-crust/50 rounded-[4px] flows-indicator">
            <span className="flex h-1.5 w-1.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="text-safe-text font-bold uppercase tracking-wider">ONLINE</span>
          </div>

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            className="flex items-center justify-center w-7 h-7 bg-bg-crust/50 border border-border-surface text-text-muted hover:text-blue-600 dark:hover:text-blue-400 rounded-[4px] cursor-pointer transition-colors flows-indicator"
          >
            {theme === 'dark' ? (
              /* Sun Icon for Light Mode */
              <svg className="w-[13px] h-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              /* Moon Icon for Dark Mode */
              <svg className="w-[13px] h-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-col w-full z-10">

        {/* SECTION 1: Docked Split Viewport Map (Right) & Left Sidebar Analytics (Left) */}
        <section className="relative w-full h-[calc(100vh-66px)] min-h-[550px] border-b border-border-surface flex flex-row overflow-hidden bg-bg-base z-10">

          {/* DOCKED SIDEBAR PANEL (Left, height fills map) */}
          <aside className="w-[420px] shrink-0 h-full border-r border-border-surface bg-bg-mantle p-5 flex flex-col justify-between overflow-y-auto select-none font-sans shadow-lg z-20 flows-sidebar">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-border-surface pb-2.5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-subtext flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                  Analytics Console
                </h2>
                <span className="font-mono text-[9px] text-text-muted uppercase tracking-widest">NAGA CITY</span>
              </div>

              {activeData && summaryCategory ? (
                <div className="flex flex-col gap-4">

                  {/* Timeframe selector tabs with Date display */}
                  <div className="flex flex-col gap-1.5 border-b border-border-surface pb-3">
                    <span className="text-[8px] font-bold font-mono tracking-widest uppercase text-[#89b4fa]">
                      EVALUATION TIMEFRAME
                    </span>
                    <div className="grid grid-cols-3 gap-1 bg-bg-crust border border-border-surface p-1 rounded-[4px]">
                      {(["today", "tomorrow", "dayAfterTomorrow"] as const).map((period) => {
                        const dateVal = data?.days[period]?.date || "";
                        const formattedDate = dateVal
                          ? new Date(dateVal).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "";
                        return (
                          <button
                            key={period}
                            onClick={() => setSelectedPeriod(period)}
                            className={`py-1 text-[8px] font-bold font-mono uppercase tracking-wider rounded-[2px] transition-all flex flex-col items-center justify-center cursor-pointer ${selectedPeriod === period
                              ? "bg-blue-600 dark:bg-blue-500 text-white"
                              : "text-text-subtext hover:bg-border-surface/50 hover:text-text-text"
                              }`}
                          >
                            <span className="leading-none">{period === "dayAfterTomorrow" ? "3RD DAY" : period}</span>
                            <span className={`text-[7px] leading-none mt-0.5 font-light ${selectedPeriod === period ? "text-white/80" : "text-text-muted"}`}>
                              {formattedDate}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Categorized Risk Summary */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-light text-text-subtext">Overall Assessment</span>
                      <span className={`flex items-center justify-center px-2.5 py-0.5 rounded-[4px] text-[10px] font-mono font-black uppercase tracking-wider border ${summaryCategory.colorClass}`}>
                        {summaryCategory.label}
                      </span>
                    </div>
                  </div>

                  {/* Core Risk Metrics Grid */}
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border-surface font-mono">
                    <div className="flex flex-col">
                      <span className="text-[8px] font-bold uppercase tracking-widest text-text-subtext">Peak Risk</span>
                      <span className={`text-2xl font-extrabold ${summaryCategory?.textColor || 'text-text-text'} mt-1`}>
                        {activeData.summary.peak_probability}%
                      </span>
                      <span className="text-[9px] text-text-muted mt-1">
                        Peak at {formatHour(activeData.summary.peak_hour)}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[8px] font-bold uppercase tracking-widest text-text-subtext">Rainfall</span>
                      <span className="text-2xl font-extrabold text-text-text mt-1">
                        {activeData.summary.total_precipitation}<span className="text-[10px] text-text-subtext font-light ml-0.5">mm</span>
                      </span>
                      <span className="text-[9px] text-text-muted mt-1">24h Forecast</span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[8px] font-bold uppercase tracking-widest text-text-subtext">Mean Index</span>
                      <span className="text-2xl font-extrabold text-text-subtext mt-1">
                        {activeData.summary.average_probability}%
                      </span>
                      <span className="text-[9px] text-text-muted mt-1">Mean Prob</span>
                    </div>
                  </div>

                  {/* Local environment specs */}
                  <div className="border border-border-surface bg-bg-crust/40 rounded-[4px] p-3 text-xs font-light text-text-subtext flex flex-col gap-2 flows-subbox">
                    <div className="flex justify-between font-mono text-[9px] text-text-muted uppercase tracking-wider border-b border-border-surface pb-1.5">
                      <span>Telemetry Node</span>
                      <span>Status Details</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-text-subtext font-medium">Elevation:</span>
                      <span className="font-mono text-text-text font-semibold">{data?.location.elevation}m asl</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-text-subtext font-medium">Refresh Interval:</span>
                      <span className="font-mono text-text-text font-semibold">Hourly Sync</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-text-subtext font-medium">Auto-Evaluation:</span>
                      <button
                        onClick={() => fetchPrediction(true)}
                        disabled={syncing || loading}
                        className="font-mono text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-bold transition-colors disabled:text-text-muted flex items-center gap-1 cursor-pointer"
                      >
                        <svg className={`w-2.5 h-2.5 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        {syncing ? "SYNCING" : "SYNC NOW"}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] font-light leading-relaxed text-text-subtext bg-bg-crust/20 border border-border-surface p-2.5 rounded-[4px] flows-indicator">
                    {activeData.summary.risk_level === "Safe" && "Model outputs remain well below baseline thresholds. No significant flooding is anticipated."}
                    {activeData.summary.risk_level === "Low" && "Localized street waterlogging or minor ponding is possible during high precipitation turns."}
                    {activeData.summary.risk_level === "Moderate" && "Elevated risk index. Monitor drainage flows and safeguard low-level logistics."}
                    {activeData.summary.risk_level === "High" && "CRITICAL INDICATOR: High probability of structural flooding. Initiate containment models."}
                  </p>
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-blue-600 dark:border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[10px] font-mono tracking-widest text-blue-600 dark:text-blue-400 uppercase">Synchronizing sensor...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] font-mono text-[#f38ba8] uppercase tracking-wider">No active sensor link</span>
                      <button
                        onClick={() => fetchPrediction()}
                        className="px-3 py-1.5 bg-[#11111b] border border-[#313244] hover:bg-[#313244] text-[9px] font-mono tracking-widest uppercase rounded-[4px] transition-colors"
                      >
                        Connect Sensor
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Scroll-down indicators inside the floating sidebar */}
            <div className="mt-4 pt-2.5 border-t border-border-surface flex items-center justify-center gap-1.5 text-[9px] font-mono text-text-muted uppercase tracking-widest animate-pulse shrink-0">
              <span>Scroll down for timelines</span>
              <svg className="w-3.5 h-3.5 text-text-muted animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
              </svg>
            </div>
          </aside>

          {/* DOCKED MAP PANEL (Right, fills map height) */}
          <div className="flex-1 h-full relative z-10 bg-[#11111b]">
            <div id="flows-leaflet-map" className="w-full h-full z-10" />

            {!leafletLoaded && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#11111b]/95 gap-3">
                <div className="w-6 h-6 border-2 border-blue-600 dark:border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] font-mono tracking-widest text-blue-600 dark:text-blue-400 uppercase">Loading Cartographic Engine...</span>
              </div>
            )}

            {/* Custom Map Menubar (Top Right of Map) */}
            <div className="absolute top-6 right-6 z-20 flex items-center gap-2 border border-border-surface bg-bg-mantle px-3 py-2 rounded-[4px] shadow-2xl font-mono text-[9px] text-text-text">
              {/* Zoom & Reset Buttons */}
              <div className="flex items-center gap-1 border-r border-border-surface pr-2.5">
                <button
                  title="Zoom In"
                  onClick={() => mapInstance?.zoomIn()}
                  className="w-6 h-6 flex items-center justify-center bg-bg-crust border border-border-surface hover:bg-border-surface hover:text-blue-600 dark:hover:text-blue-400 rounded-[4px] cursor-pointer transition-colors font-bold text-xs select-none"
                >
                  ＋
                </button>
                <button
                  title="Zoom Out"
                  onClick={() => mapInstance?.zoomOut()}
                  className="w-6 h-6 flex items-center justify-center bg-bg-crust border border-border-surface hover:bg-border-surface hover:text-blue-600 dark:hover:text-blue-400 rounded-[4px] cursor-pointer transition-colors font-bold text-xs select-none"
                >
                  －
                </button>
                <button
                  title="Reset Map Position"
                  onClick={() => mapInstance?.flyTo([13.635, 123.250], 12, { animate: true, duration: 1.2 })}
                  className="w-6 h-6 flex items-center justify-center bg-bg-crust border border-border-surface hover:bg-border-surface hover:text-blue-600 dark:hover:text-blue-400 text-text-text rounded-[4px] cursor-pointer transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m14 0a5 5 0 11-10 0 5 5 0 0110 0z" />
                  </svg>
                </button>
              </div>

              {/* Map Style Selector */}
              <div className="flex items-center gap-1.5 pl-1">
                <span className="text-text-subtext font-bold text-[8px] uppercase tracking-wider mr-1">STYLE:</span>
                {(["dark", "light", "satellite"] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => setMapStyle(style)}
                    className={`px-2 py-1 text-[8px] font-bold uppercase rounded-[2px] cursor-pointer border transition-all ${mapStyle === style
                      ? "bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500 text-white"
                      : "bg-bg-crust border-border-surface hover:bg-border-surface hover:text-blue-600 dark:hover:text-blue-400 text-text-text"
                      }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Absolute floating premium risk legend bottom-right of map */}
            <div className="absolute bottom-6 right-6 bg-bg-mantle border border-border-surface px-3 py-2.5 rounded-[4px] font-mono text-[9px] text-text-text flex flex-col gap-2 z-20 shadow-2xl min-w-[155px]">
              <span className="text-text-subtext font-bold text-[8px] uppercase tracking-widest border-b border-border-surface/60 pb-1.5 mb-0.5">
                Flood Probability
              </span>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500 border border-emerald-500/20" />
                  <span className="text-[8.5px] font-normal text-text-text">Safe (&lt;1%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-sky-500 border border-sky-500/20" />
                  <span className="text-[8.5px] font-normal text-text-text">Low (1-10%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-500 border border-amber-500/20" />
                  <span className="text-[8.5px] font-normal text-text-text">Moderate (10-35%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-rose-500 border border-rose-500/20" />
                  <span className="text-[8.5px] font-normal text-text-text">High (&gt;35%)</span>
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* SECTION 2: Dynamic Chart Area (Displayed below the map through scrolling down) */}
        {activeData && chartPoints && (
          <section className="relative w-full max-w-7xl mx-auto px-4 md:px-6 py-10 flex flex-col gap-6 z-10 border-b border-border-surface/40">

            <div className="bg-bg-mantle/40 backdrop-blur-md border border-border-surface rounded-[4px] p-5 shadow-xl flex flex-col gap-4 flows-card">
              <div className="flex justify-between items-center flex-wrap gap-4 border-b border-border-surface pb-3">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-text-subtext flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                    </svg>
                    Telemetry Timeline & Forecast Curve
                  </h2>
                  <p className="text-[10px] font-light text-text-muted mt-0.5">
                    Hover across coordinates to evaluate index factors at targeted timelines
                  </p>
                </div>

                {/* Chart Legend (Catppuccin colored markers) */}
                <div className="flex gap-4 font-mono text-[9px] text-text-subtext uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-none bg-blue-600 dark:bg-blue-500 inline-block" />
                    Rain Intensity (mm/h)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-none bg-[#f38ba8] inline-block" />
                    Flood Probability (%)
                  </span>
                </div>
              </div>

              {/* Interactive SVG Chart */}
              <div className="relative w-full overflow-x-auto select-none pt-2">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full min-w-[700px] h-auto overflow-visible"
                >
                  {/* Gridlines */}
                  {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                    const y = paddingTop + ratio * (chartHeight - paddingTop - paddingBottom);
                    return (
                      <g key={ratio} className="opacity-30 flows-gridline">
                        <line
                          x1={paddingLeft}
                          y1={y}
                          x2={chartWidth - paddingRight}
                          y2={y}
                          stroke="var(--border-surface)"
                          strokeWidth={0.5}
                          strokeDasharray="2 2"
                        />
                      </g>
                    );
                  })}

                  {/* Left Y-Axis Labels (Rain Intensity mm/h) */}
                  {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                    const y = paddingTop + ratio * (chartHeight - paddingTop - paddingBottom);
                    const value = (1.0 - ratio) * maxPrecip;
                    return (
                      <text
                        key={`y-left-${ratio}`}
                        x={paddingLeft - 8}
                        y={y + 3}
                        className="text-[7.5px] font-mono fill-blue-600 dark:fill-blue-400 flows-chart-text-left"
                        textAnchor="end"
                      >
                        {value.toFixed(1)}
                      </text>
                    );
                  })}

                  {/* Right Y-Axis Labels (Flood Probability %) */}
                  {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                    const y = paddingTop + ratio * (chartHeight - paddingTop - paddingBottom);
                    const value = Math.round((1.0 - ratio) * 100);
                    return (
                      <text
                        key={`y-right-${ratio}`}
                        x={chartWidth - paddingRight + 8}
                        y={y + 3}
                        className="text-[7.5px] font-mono fill-[#f38ba8] flows-chart-text-right"
                        textAnchor="start"
                      >
                        {value}%
                      </text>
                    );
                  })}

                  {/* X Axis labels (Hours) rendered complete with compact font size to fit all hours */}
                  {chartPoints.map((pt) => {
                    return (
                      <text
                        key={pt.hour}
                        x={pt.x}
                        y={chartHeight - 8}
                        className="text-[6.2px] font-mono font-light tracking-tighter fill-text-subtext flows-chart-text"
                        textAnchor="middle"
                      >
                        {pt.hour === 0 ? "12 AM" : pt.hour === 12 ? "12 PM" : `${pt.hour % 12}${pt.hour >= 12 ? " PM" : " AM"}`}
                      </text>
                    );
                  })}

                  {/* Rain Intensity (Sky Blue Area) */}
                  <path
                    d={`
                      M ${chartPoints[0].x} ${chartHeight - paddingBottom}
                      ${chartPoints.map(pt => `L ${pt.x} ${pt.yPrecip}`).join(" ")}
                      L ${chartPoints[chartPoints.length - 1].x} ${chartHeight - paddingBottom}
                      Z
                    `}
                    fill="url(#cyan-gradient)"
                    className="opacity-[0.08]"
                  />
                  <path
                    d={chartPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.yPrecip}`).join(" ")}
                    fill="none"
                    stroke={theme === 'dark' ? "#3b82f6" : "#2563eb"}
                    strokeWidth={1.5}
                    strokeLinecap="square"
                  />

                  {/* Flood Probability (Red/Rose Area) */}
                  <path
                    d={`
                      M ${chartPoints[0].x} ${chartHeight - paddingBottom}
                      ${chartPoints.map(pt => `L ${pt.x} ${pt.yProb}`).join(" ")}
                      L ${chartPoints[chartPoints.length - 1].x} ${chartHeight - paddingBottom}
                      Z
                    `}
                    fill="url(#rose-gradient)"
                    className="opacity-[0.06]"
                  />
                  <path
                    d={chartPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.yProb}`).join(" ")}
                    fill="none"
                    stroke="#f38ba8"
                    strokeWidth={1.5}
                    strokeLinecap="square"
                  />

                  {/* Interactivity columns overlay */}
                  {chartPoints.map((pt) => {
                    const xStride = (chartWidth - paddingLeft - paddingRight) / 23;
                    const xStart = pt.x - xStride / 2;
                    return (
                      <rect
                        key={pt.hour}
                        x={xStart}
                        y={paddingTop}
                        width={xStride}
                        height={chartHeight - paddingTop - paddingBottom}
                        fill="transparent"
                        className="cursor-pointer hover:fill-blue-500/[0.04]"
                        onMouseEnter={() => setSelectedHourIdx(pt.hour)}
                        onClick={() => setSelectedHourIdx(pt.hour)}
                      />
                    );
                  })}

                  {/* Cursor indicators */}
                  {(() => {
                    const activePt = chartPoints.find(pt => pt.hour === selectedHourIdx);
                    if (!activePt) return null;
                    return (
                      <g className="pointer-events-none">
                        <line
                          x1={activePt.x}
                          y1={paddingTop}
                          x2={activePt.x}
                          y2={chartHeight - paddingBottom}
                          stroke="#585b70"
                          strokeWidth={1}
                          strokeDasharray="2 2"
                        />
                        <rect x={activePt.x - 3.5} y={activePt.yPrecip - 3.5} width={7} height={7} fill={theme === 'dark' ? "#3b82f6" : "#2563eb"} stroke="#ffffff" strokeWidth={1} />
                        <rect x={activePt.x - 3.5} y={activePt.yProb - 3.5} width={7} height={7} fill="#f38ba8" stroke="#ffffff" strokeWidth={1} />
                      </g>
                    );
                  })()}

                  {/* Gradients using Catppuccin parameters */}
                  <defs>
                    <linearGradient id="cyan-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme === 'dark' ? "#3b82f6" : "#2563eb"} />
                      <stop offset="100%" stopColor={theme === 'dark' ? "#3b82f6" : "#2563eb"} stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="rose-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f38ba8" />
                      <stop offset="100%" stopColor="#f38ba8" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

          </section>
        )}

        {/* SECTION 3: Node Inspectors & XGBoost Specifications */}
        {activeData && selectedHourDetails && selectedHourCategory && (
          <section className="relative w-full max-w-7xl mx-auto px-4 md:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 border-b border-border-surface/40">

            {/* Hour Inspector Card (Left, 7 cols) */}
            <div className="lg:col-span-7 bg-bg-mantle/40 backdrop-blur-md border border-border-surface rounded-[4px] p-5 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-blue-500/5 to-transparent pointer-events-none rounded-none blur-2xl" />

              <div className="flex justify-between items-center border-b border-border-surface pb-2 mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtext flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Timeline Node Inspector: {formatHour(selectedHourDetails.hour)}
                </h3>
                <span className={`font-mono text-[9px] border px-2 py-0.5 rounded-[2px] uppercase ${selectedHourCategory.colorClass}`}>
                  {selectedHourCategory.label}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs mb-3">

                {/* rain_intensity_1h */}
                <div className="flex flex-col bg-bg-crust/40 rounded-[4px] p-3 border border-border-surface gap-1.5">
                  <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">rain_intensity_1h</span>
                  <span className="text-base font-bold text-text-text">{selectedHourDetails.rain_intensity_1h.toFixed(2)} <span className="text-[10px] text-text-subtext font-normal">mm</span></span>
                  <span className="text-[9.5px] font-sans font-light text-text-subtext leading-normal">Precipitation current hour</span>
                </div>

                {/* rain_accum_6h */}
                <div className="flex flex-col bg-bg-crust/40 rounded-[4px] p-3 border border-border-surface gap-1.5 flows-subbox">
                  <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">rain_accum_6h</span>
                  <span className="text-base font-bold text-text-text">{selectedHourDetails.rain_accum_6h.toFixed(2)} <span className="text-[10px] text-text-subtext font-normal">mm</span></span>
                  <span className="text-[9.5px] font-sans font-light text-text-subtext leading-normal">Rolling 6h accumulation</span>
                </div>

                {/* rain_accum_24h */}
                <div className="flex flex-col bg-bg-crust/40 rounded-[4px] p-3 border border-border-surface gap-1.5 flows-subbox">
                  <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">rain_accum_24h</span>
                  <span className="text-base font-bold text-text-text">{selectedHourDetails.rain_accum_24h.toFixed(2)} <span className="text-[10px] text-text-subtext font-normal">mm</span></span>
                  <span className="text-[9.5px] font-sans font-light text-text-subtext leading-normal">Rolling 24h accumulation</span>
                </div>

              </div>

              {/* Categorized Model Prediction Output */}
              <div className="flex justify-between items-center bg-bg-crust/60 rounded-[4px] p-3.5 border border-border-surface shadow-md flows-subbox">
                <div>
                  <p className="text-[9px] font-mono font-bold text-text-muted uppercase tracking-widest">Target Prediction Prob</p>
                  <p className="text-[10px] font-sans font-light text-text-subtext mt-0.5">XGBoost prediction index</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="text-lg font-mono font-bold text-text-text">{(selectedHourDetails.probability * 100).toFixed(4)}%</span>
                </div>
              </div>
            </div>

            {/* Model Card (Right, 5 cols) */}
            <div className="lg:col-span-5 bg-bg-mantle/40 backdrop-blur-md border border-border-surface rounded-[4px] p-5 shadow-xl flex flex-col justify-between flows-card">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtext mb-3 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  XGBoost Classifier Architecture
                </h3>

                <p className="text-xs font-light text-text-subtext leading-relaxed mb-4">
                  Predictive logs execute in local virtual environments. Feature lag calculations sum the past 6h and 24h intervals back into today&apos;s timeline to ensure seamless continuity.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center font-mono text-[9px] uppercase">
                <div className="bg-bg-crust/40 border border-border-surface rounded-[4px] p-2.5 flows-subbox">
                  <p className="text-text-muted font-bold">Objective</p>
                  <p className="text-text-text mt-0.5">binary:logistic</p>
                </div>
                <div className="bg-bg-crust/40 border border-border-surface rounded-[4px] p-2.5 flows-subbox">
                  <p className="text-text-muted font-bold">Architecture</p>
                  <p className="text-text-text mt-0.5">100 Trees (Depth 4)</p>
                </div>
              </div>
            </div>

          </section>
        )}

        {/* SECTION 4: Tabular Timelines and Logs */}
        {activeData && (
          <section className="relative w-full max-w-7xl mx-auto px-4 md:px-6 py-6 pb-16 z-10">

            <div className="bg-bg-mantle/40 backdrop-blur-md border border-border-surface rounded-[4px] p-5 shadow-xl flex flex-col justify-between flows-card">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtext mb-4 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Evaluated Logs Timeline & Classifications
                </h3>

                <div className="max-h-[350px] overflow-y-auto pr-1 border border-border-surface bg-bg-crust/20 rounded-[4px] flows-subbox">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border-surface text-text-muted font-mono text-[9px] uppercase tracking-wider bg-bg-mantle sticky top-0 z-10 flows-header">
                        <th className="py-2.5 px-3">Hour</th>
                        <th className="py-2.5 px-3">Rain (1h)</th>
                        <th className="py-2.5 px-3">Accum (6h)</th>
                        <th className="py-2.5 px-3">Accum (24h)</th>
                        <th className="py-2.5 px-3 text-center">Probability</th>
                        <th className="py-2.5 px-3 text-right">Risk Classification</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-[11px]">
                      {activeData.hourly.map((h) => {
                        const hrCat = getProbabilityCategory(h.probability, theme);
                        return (
                          <tr
                            key={h.hour}
                            id={`hour-row-${h.hour}`}
                            onMouseEnter={() => setSelectedHourIdx(h.hour)}
                            className={`border-b border-border-surface/40 transition-colors cursor-pointer flows-tablerow ${selectedHourIdx === h.hour
                              ? "bg-border-surface/40 text-text-text"
                              : "hover:bg-border-surface/15 text-text-subtext"
                              }`}
                          >
                            <td className="py-2.5 px-3 font-semibold">{formatHour(h.hour)}</td>
                            <td className="py-2.5 px-3">{h.rain_intensity_1h.toFixed(1)} mm</td>
                            <td className="py-2.5 px-3 text-text-muted">{h.rain_accum_6h.toFixed(1)} mm</td>
                            <td className="py-2.5 px-3 text-text-muted">{h.rain_accum_24h.toFixed(1)} mm</td>
                            <td className="py-2.5 px-3 text-center font-bold text-text-text">
                              {(h.probability * 100).toFixed(3)}%
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-[2px] text-[10px] font-bold border ${hrCat.colorClass}`}>
                                {hrCat.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-3 font-mono text-[9px] text-text-muted uppercase tracking-wider">
                *Select timelines to evaluate rolling sensors in depth
              </div>
            </div>

          </section>
        )}

      </div>

      {/* Footer (Catppuccin Crust) */}
      <footer className="w-full border-t border-border-surface bg-bg-crust mt-auto py-5 px-6 flex justify-between items-center text-[10px] font-mono text-text-muted uppercase tracking-widest z-20">
        <span>© 2026 FLOWS - Flood Level Observation and Warning System.</span>
        <span>Open-Meteo Integration Engine v1.0</span>
      </footer>

      {/* Scroll to Top Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-6 right-6 z-50 flex items-center justify-center cursor-pointer transition-all duration-300 ${showScrollTop ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
          }`}
        title="Scroll to Top"
      >
        {/* Outer Hexagon (Acts as Border) */}
        <div className="bg-border-surface [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] w-[34px] h-[38px] flex items-center justify-center hover:bg-blue-600 dark:hover:bg-blue-400 transition-colors shadow-2xl">
          {/* Inner Hexagon (Fill) */}
          <div className="bg-bg-mantle [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] w-[32px] h-[36px] flex items-center justify-center text-text-muted hover:text-text-text transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </div>
        </div>
      </button>

    </div>
  );
}

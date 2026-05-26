"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import Footer from "../../components/Footer";
import ThemeToggle from "../../components/ThemeToggle";
import Link from "next/link";

const FloodMap = dynamic(() => import("../components/FloodMap"), {
  ssr: false,
});

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
  last_updated?: string;
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
      label: "Safe",
      heroLabel: "No Flood Risk",
      colorClass: "text-safe-text border-safe-border bg-safe-bg",
      textColor: "text-safe-text",
      hex: theme === "dark" ? "#a7f3d0" : "#059669"
    };
  } else if (pct < 10.0) {
    return {
      label: "Low",
      heroLabel: "Low Flood Risk",
      colorClass: "text-primary-blue border-primary-blue-border bg-primary-blue-bg",
      textColor: "text-primary-blue",
      hex: theme === "dark" ? "#bae6fd" : "#0284c7"
    };
  } else if (pct < 35.0) {
    return {
      label: "Moderate",
      heroLabel: "Moderate Flood Risk",
      colorClass: "text-semantic-yellow border-semantic-yellow-border bg-semantic-yellow-bg",
      textColor: "text-semantic-yellow",
      hex: theme === "dark" ? "#fde68a" : "#d97706"
    };
  } else {
    return {
      label: "High",
      heroLabel: "High Flood Risk",
      colorClass: "text-semantic-red border-semantic-red-border bg-semantic-red-bg",
      textColor: "text-semantic-red",
      hex: theme === "dark" ? "#fecdd3" : "#e11d48"
    };
  }
};

const DASHBOARD_SECTIONS = [
  { id: "overview", label: "Overview & Map" },
  { id: "forecast-curve", label: "Forecast Curve" },
  { id: "hour-inspector", label: "Hour Inspector" },
  { id: "logs-timeline", label: "Logs Timeline" },
];

export default function Home() {
  const [loading, setLoading] = useState(false);

  const [data, setData] = useState<PredictionResponse | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'tomorrow' | 'dayAfterTomorrow'>('tomorrow');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [appliedTheme, setAppliedTheme] = useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  const [activeDashboardSection, setActiveDashboardSection] = useState("overview");
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToDashboardSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveDashboardSection(id);
    isProgrammaticScroll.current = true;
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    programmaticScrollTimer.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 900);
    const subNav = document.getElementById("sub-nav");
    const isMobile = window.innerWidth < 768;
    const offset = isMobile ? 12 : (subNav ? subNav.getBoundingClientRect().height : 48);
    const top = el.getBoundingClientRect().top + window.scrollY - offset - 12;
    window.scrollTo({ top, behavior: "smooth" });
  };

  useEffect(() => {
    const sectionIds = ["overview", "forecast-curve", "hour-inspector", "logs-timeline"];
    const detect = () => {
      if (isProgrammaticScroll.current) return;
      const subNav = document.getElementById("sub-nav");
      const isMobile = window.innerWidth < 768;
      const offset = isMobile ? 12 : (subNav ? subNav.getBoundingClientRect().height : 48);
      const detectionY = offset + 24;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= detectionY) {
          current = id;
        }
      }
      setActiveDashboardSection(current);
    };
    window.addEventListener("scroll", detect, { passive: true });
    detect();
    return () => window.removeEventListener("scroll", detect);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setAppliedTheme(el.classList.contains('dark') ? 'dark' : 'light');
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

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

  // Live clock for Philippine Standard Time (PST)
  const [phTime, setPhTime] = useState<string>("");

  // Last Ingestion Timestamp
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Fetch prediction function
  const fetchPrediction = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/predict?latitude=${NAGA_LAT}&longitude=${NAGA_LON}`;
      const res = await fetch(url);
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
      // Format database timestamp in Manila time
      if (json.last_updated) {
        const dateObj = new Date(json.last_updated);
        const formatted = dateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }) + ", " + dateObj.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }) + " PST";
        setLastUpdated(formatted);
      } else {
        setLastUpdated("N/A");
      }
    } catch {
      // Fail silently as error is not used in UI
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  // Initial fetch
  useEffect(() => {
    // Defer network fetch to prevent client hydration from locking the main thread on mobile WebKit
    const timer = setTimeout(() => {
      fetchPrediction();
    }, 150);
    return () => clearTimeout(timer);
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

  // Live clock for Philippine Standard Time (PST)
  useEffect(() => {
    const updateTime = () => {
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Manila",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });
        setPhTime(formatter.format(new Date()));
      } catch (e) {
        console.error("Failed to format time:", e);
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
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
    const currentTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
    return getProbabilityCategory(selectedHourDetails.probability, currentTheme);
  }, [selectedHourDetails]);

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
    const currentTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
    return getProbabilityCategory(activeData.summary.peak_probability / 100, currentTheme);
  }, [activeData]);

  return (
    <div className="min-h-screen bg-bg-base text-text-text font-sans flex flex-col antialiased selection:bg-primary-blue-bg selection:text-primary-blue flows-root relative">

      {/* Main content wrapper */}

      {/* Header Navigation */}
      <header className="relative w-full border-b border-border-surface bg-bg-mantle/95 backdrop-blur-md z-30 px-4 md:px-6 py-3 flex flex-row items-center justify-between gap-2 flows-header">
        <div className="flex items-center gap-2 md:gap-3">
          <Link
            href="/"
            className="group flex flex-col leading-none shrink-0 cursor-pointer transition-all"
          >
            <span className="text-sm font-extrabold tracking-widest uppercase bg-gradient-to-r from-text-text to-text-subtext text-transparent bg-clip-text group-hover:opacity-90 transition-opacity">
              FLOWS
            </span>
            <span className="hidden sm:block text-[8px] font-mono tracking-wider uppercase text-text-muted">
              Flood Level Observation &amp; Warning System
            </span>
          </Link>
        </div>

        {/* Live System Indicators & Theme Toggle */}
        <div className="flex items-center gap-2 md:gap-3 font-mono text-[9px] text-text-subtext">
          {/* NEXT UPDATE */}
          <div className="flex items-center justify-center gap-1.5 h-7 px-2.5 border border-border-surface bg-bg-crust/50 rounded-[4px] flows-indicator">
            <span className="text-text-subtext font-bold uppercase tracking-wider">NEXT UPDATE IN:</span>
            <span className="text-text-text font-bold tracking-wider">{timeUntilNextHour}</span>
          </div>

          {/* PST digital clock - hidden on mobile */}
          <div className="hidden sm:flex items-center justify-center gap-1.5 h-7 px-2.5 border border-border-surface bg-bg-crust/50 rounded-[4px] flows-indicator font-mono">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://flagsapi.com/PH/flat/64.png"
              alt="Philippines Flag"
              className="w-3 h-3 object-contain select-none"
            />
            <span className="text-text-muted font-bold uppercase tracking-wider">PST:</span>
            <span className="text-text-text font-bold tracking-wider">{phTime || "12:00:00 AM"}</span>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-col w-full z-10">

        {/* Sticky Sub-navigation */}
        <div id="sub-nav" className="sticky top-0 z-40 w-full border-b border-border-surface bg-bg-base/90 backdrop-blur-md transition-all hidden md:block">
          <div
            className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 flex items-center justify-center gap-4 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {DASHBOARD_SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => scrollToDashboardSection(sec.id)}
                className={`relative px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  activeDashboardSection === sec.id
                    ? "text-primary-blue"
                    : "text-text-muted hover:text-text-subtext"
                }`}
              >
                {sec.label}
                {activeDashboardSection === sec.id && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full bg-primary-blue" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* SECTION 1: Docked Split Viewport Map (Right) & Left Sidebar Analytics (Left) */}
        <section id="overview" className="relative w-full h-auto md:h-[calc(100vh-110px)] md:min-h-[550px] border-b border-border-surface flex flex-col md:flex-row overflow-hidden bg-bg-base z-10">

          {/* DOCKED SIDEBAR PANEL (Left, height fills map) */}
          <aside className="w-full md:w-[420px] shrink-0 h-auto md:h-full border-b md:border-b-0 md:border-r border-border-surface bg-bg-mantle p-5 flex flex-col justify-between overflow-y-auto select-none font-sans z-20 flows-sidebar">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-border-surface pb-2.5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-subtext flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-primary-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Risk Overview
                </h2>
                <span className="font-mono text-[9px] text-text-muted uppercase tracking-widest">NAGA CITY</span>
              </div>

              {activeData && summaryCategory ? (
                <div className="flex flex-col gap-3">

                  {/* Timeframe selector tabs */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[8px] font-mono tracking-widest uppercase text-text-muted">
                      Forecast Period
                    </span>
                    <div className="grid grid-cols-3 gap-0.5 bg-bg-crust/40 border border-border-surface/35 p-0.5 rounded-[4px]">
                      {(["today", "tomorrow", "dayAfterTomorrow"] as const).map((period) => {
                        const dateVal = data?.days[period]?.date || "";
                        const formattedDate = dateVal
                          ? new Date(dateVal).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "";
                        return (
                          <button
                            key={period}
                            onClick={() => setSelectedPeriod(period)}
                            className={`py-1.5 text-[8px] font-bold font-mono uppercase tracking-wider rounded-[2px] transition-all flex flex-col items-center justify-center cursor-pointer ${selectedPeriod === period
                              ? "bg-primary-blue text-white"
                              : "text-text-subtext hover:bg-border-surface/30 hover:text-text-text"
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

                  {/* Hero Risk Classification — visually dominant */}
                  <div className={`rounded-[4px] border p-4 flex items-center justify-between gap-3 ${summaryCategory.colorClass}`}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-mono font-bold uppercase tracking-widest opacity-70">Overall Assessment</span>
                      <span className="text-xl font-extrabold font-mono tracking-tight leading-none">{summaryCategory.heroLabel}</span>
                      <span className="text-[10px] font-light opacity-75 mt-0.5">
                        Peak: {activeData.summary.peak_probability.toFixed(2)}% at {formatHour(activeData.summary.peak_hour)}
                      </span>
                    </div>
                    {/* Checkmark for safe/low, warning triangle for moderate/high */}
                    {(summaryCategory.label === "Safe" || summaryCategory.label === "Low") ? (
                      <svg className="w-8 h-8 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                    )}
                  </div>

                  {/* Core Risk Metrics — inspector-style panel */}
                  <div className="grid grid-cols-3 gap-1 bg-bg-crust/20 rounded-[4px] p-4 border border-border-surface/40 font-mono text-center">
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">Peak Risk</span>
                      <span className={`text-sm md:text-base font-extrabold ${summaryCategory?.textColor || 'text-text-text'}`}>
                        {activeData.summary.peak_probability.toFixed(2)}<span className="text-[9px] text-text-muted font-normal">%</span>
                      </span>
                      <span className="text-[8px] font-sans font-light text-text-muted">Highest Hour</span>
                    </div>

                    <div className="flex flex-col gap-1 border-l border-border-surface/40">
                      <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">Rainfall</span>
                      <span className="text-sm md:text-base font-extrabold text-text-text">
                        {activeData.summary.total_precipitation.toFixed(2)}<span className="text-[9px] text-text-muted font-normal"> mm</span>
                      </span>
                      <span className="text-[8px] font-sans font-light text-text-muted">24h Total</span>
                    </div>

                    <div className="flex flex-col gap-1 border-l border-border-surface/40">
                      <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">Avg Risk</span>
                      <span className="text-sm md:text-base font-extrabold text-text-subtext">
                        {activeData.summary.average_probability.toFixed(2)}<span className="text-[9px] text-text-muted font-normal">%</span>
                      </span>
                      <span className="text-[8px] font-sans font-light text-text-muted">Mean Prob</span>
                    </div>
                  </div>

                  {/* Advisory text */}
                  <div className="border border-border-surface/85 bg-bg-crust/35 rounded-[4px] p-3 select-text">
                    <p className="text-[11px] leading-relaxed text-text-subtext">
                      {activeData.summary.risk_level === "Safe" && (
                        "Conditions are currently clear. Telemetry predicts minimal to zero rainfall with no threat of flooding. Have a safe day!"
                      )}
                      {activeData.summary.risk_level === "Low" && (
                        "Expect light rainfall. While overall flooding is unlikely, some low-lying streets might experience minor water clogging or puddles. Keep an umbrella handy."
                      )}
                      {activeData.summary.risk_level === "Moderate" && (
                        "Noticeable flood risk ahead. Heavy or continuous rainfall is expected. Watch out for localized flooding, avoid clogged drain paths, and consider moving low-level valuables to safety."
                      )}
                      {activeData.summary.risk_level === "High" && (
                        "CRITICAL WARNING: High probability of severe flooding in low-lying areas. Avoid traveling through flooded streets, secure properties, and tune in to local emergency alerts immediately."
                      )}
                    </p>
                  </div>

                  {/* Last Updated — subtle */}
                  <div className="flex gap-1.5 items-center text-[9px] text-text-muted/80 px-1">
                    <span>Last Updated:</span>
                    <span className="font-mono text-text-muted font-medium">{lastUpdated || "Syncing..."}</span>
                  </div>
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-primary-blue border-t-transparent rounded-full animate-spin" />
                      <span className="text-[10px] font-mono tracking-widest text-primary-blue uppercase">Synchronizing sensor...</span>
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
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[9px] font-mono text-text-muted uppercase tracking-widest shrink-0">
              <span>Scroll down for timelines</span>
              <svg className="w-3.5 h-3.5 text-text-muted animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
              </svg>
            </div>
          </aside>

          {/* DOCKED MAP PANEL (Right, fills map height) */}
          <div className="flex-1 h-[400px] md:h-full relative z-10 bg-[#11111b]">
            <Suspense fallback={
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#11111b]/95 gap-3">
                <div className="w-6 h-6 border-2 border-primary-blue border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] font-mono tracking-widest text-primary-blue uppercase">Loading Cartographic Engine...</span>
              </div>
            }>
              <FloodMap
                data={data}
                theme={appliedTheme}
                selectedHourDetails={selectedHourDetails}
                getProbabilityCategory={getProbabilityCategory}
              />
            </Suspense>
          </div>

        </section>

        {/* SECTION 2: Dynamic Chart Area (Displayed below the map through scrolling down) */}
        {activeData && chartPoints && (
          <section id="forecast-curve" className="relative w-full max-w-7xl mx-auto px-4 md:px-6 py-10 flex flex-col gap-6 z-10">

            <div className="bg-bg-mantle/80 md:bg-bg-mantle/40 md:backdrop-blur-md border border-border-surface rounded-[4px] p-5 flex flex-col gap-4 flows-card">
              <div className="flex justify-between items-center flex-wrap gap-4 pb-1">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-text-subtext flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-primary-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                    </svg>
                    Flood Forecast Chart
                  </h2>
                  <p className="text-[10px] font-light text-text-muted mt-0.5">
                    <span className="hidden sm:inline">Hover across coordinates to evaluate index factors at targeted timelines</span>
                    <span className="inline sm:hidden">Tap points to view hour predictions</span>
                  </p>
                </div>

                {/* Chart Legend (Catppuccin colored markers) */}
                <div className="flex gap-4 font-mono text-[9px] text-text-subtext uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-none bg-primary-blue inline-block" />
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
                  className="w-full h-auto overflow-visible min-w-[640px] md:min-w-[700px]"
                >
                  {/* Gridlines */}
                  {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                    const y = paddingTop + ratio * (chartHeight - paddingTop - paddingBottom);
                    return (
                      <g key={ratio} className="opacity-[0.12] flows-gridline">
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
                        className="text-[10px] md:text-[7.5px] font-mono fill-primary-blue flows-chart-text-left"
                        textAnchor="end"
                      >
                        {value.toFixed(2)}
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
                        className="text-[10px] md:text-[7.5px] font-mono fill-[#f38ba8] flows-chart-text-right"
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
                        className={`text-[9.5px] md:text-[6.2px] font-mono font-light tracking-tighter fill-text-subtext flows-chart-text ${pt.hour % 3 === 0 ? "" : "hidden md:block"
                          }`}
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
                    stroke={appliedTheme === 'dark' ? "#3b82f6" : "#2563eb"}
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
                        className="cursor-pointer hover:fill-primary-blue-bg"
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
                        <rect x={activePt.x - 3.5} y={activePt.yPrecip - 3.5} width={7} height={7} fill={appliedTheme === 'dark' ? "#3b82f6" : "#2563eb"} stroke="#ffffff" strokeWidth={1} />
                        <rect x={activePt.x - 3.5} y={activePt.yProb - 3.5} width={7} height={7} fill="#f38ba8" stroke="#ffffff" strokeWidth={1} />
                      </g>
                    );
                  })()}

                  {/* Gradients using Catppuccin parameters */}
                  <defs>
                    <linearGradient id="cyan-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={appliedTheme === 'dark' ? "#3b82f6" : "#2563eb"} />
                      <stop offset="100%" stopColor={appliedTheme === 'dark' ? "#3b82f6" : "#2563eb"} stopOpacity="0" />
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
          <section id="hour-inspector" className="relative w-full max-w-7xl mx-auto px-4 md:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10">

            {/* Hour Inspector Card (Left, 7 cols) */}
            <div className="lg:col-span-7 bg-bg-mantle/80 md:bg-bg-mantle/40 md:backdrop-blur-md border border-border-surface rounded-[4px] p-5 relative overflow-hidden flows-card">


              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtext flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-primary-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Selected Hour: {formatHour(selectedHourDetails.hour)}
                </h3>
                <span className={`font-mono text-[9px] border text-center px-2 py-0.5 rounded-[2px] uppercase ${selectedHourCategory.colorClass}`}>
                  {selectedHourCategory.label}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 bg-bg-crust/20 rounded-[4px] p-4 border border-border-surface/40 font-mono mb-4 text-center">

                {/* rain_intensity_1h */}
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">
                    <span className="hidden sm:inline">Rainfall (1h)</span>
                    <span className="inline sm:hidden">Rain (1h)</span>
                  </span>
                  <span className="text-sm md:text-base font-extrabold text-text-text">{selectedHourDetails.rain_intensity_1h.toFixed(2)} <span className="text-[9px] text-text-muted font-normal">mm</span></span>
                  <span className="text-[8px] font-sans font-light text-text-muted">This Hour</span>
                </div>

                {/* rain_accum_6h */}
                <div className="flex flex-col gap-1 border-l border-border-surface/40">
                  <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">
                    <span className="hidden sm:inline">Accumulated Rain (6h)</span>
                    <span className="inline sm:hidden">Accum (6h)</span>
                  </span>
                  <span className="text-sm md:text-base font-extrabold text-text-text">{selectedHourDetails.rain_accum_6h.toFixed(2)} <span className="text-[9px] text-text-muted font-normal">mm</span></span>
                  <span className="text-[8px] font-sans font-light text-text-muted">Past 6h</span>
                </div>

                {/* rain_accum_24h */}
                <div className="flex flex-col gap-1 border-l border-border-surface/40">
                  <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">
                    <span className="hidden sm:inline">Accumulated Rain (24h)</span>
                    <span className="inline sm:hidden">Accum (24h)</span>
                  </span>
                  <span className="text-sm md:text-base font-extrabold text-text-text">{selectedHourDetails.rain_accum_24h.toFixed(2)} <span className="text-[9px] text-text-muted font-normal">mm</span></span>
                  <span className="text-[8px] font-sans font-light text-text-muted">Past 24h</span>
                </div>

              </div>

              {/* Categorized Model Prediction Output */}
              <div className="flex justify-between items-center bg-bg-crust/60 rounded-[4px] p-3.5 border border-border-surface flows-subbox">
                <div>
                  <p className="text-[9px] font-mono font-bold text-text-muted uppercase tracking-widest">Flood Probability</p>
                  <p className="text-[10px] font-sans font-light text-text-subtext mt-0.5">Calculated model probability</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="text-base md:text-lg font-mono font-bold text-text-text">{(selectedHourDetails.probability * 100).toFixed(2)}%</span>
                </div>
              </div>
            </div>

            {/* Model Card (Right, 5 cols) */}
            <div className="lg:col-span-5 bg-bg-mantle/80 md:bg-bg-mantle/40 md:backdrop-blur-md border border-border-surface rounded-[4px] p-5 flex flex-col justify-between flows-card">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtext mb-3 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-primary-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  Prediction Model
                </h3>

                <p className="text-xs font-light text-text-subtext leading-relaxed mb-4">
                  <span className="hidden sm:inline">Predictive logs execute in local virtual environments. Feature lag calculations sum the past 6h and 24h intervals back into today&apos;s timeline to ensure seamless continuity.</span>
                  <span className="inline sm:hidden">Machine learning model predicting flood risk based on rainfall patterns and accumulation trends.</span>
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
          <section id="logs-timeline" className="relative w-full max-w-7xl mx-auto px-4 md:px-6 py-6 pb-16 z-10">

            <div className="bg-bg-mantle/80 md:bg-bg-mantle/40 md:backdrop-blur-md border border-border-surface rounded-[4px] p-5 flex flex-col justify-between flows-card">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtext mb-4 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-primary-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Detailed Hour Log
                </h3>

                {/* Desktop Table View */}
                <div className="hidden md:block max-h-[350px] overflow-y-auto overflow-x-auto pr-1 border border-border-surface bg-bg-crust/20 rounded-[4px] flows-subbox">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border-surface text-text-muted font-mono text-[9px] uppercase tracking-wider bg-bg-mantle sticky top-0 z-10 flows-header">
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3">Rainfall (1h)</th>
                        <th className="py-2.5 px-3">Accumulated Rain (6h)</th>
                        <th className="py-2.5 px-3">Accumulated Rain (24h)</th>
                        <th className="py-2.5 px-3 text-center">Flood Probability</th>
                        <th className="py-2.5 px-3 text-center md:text-right">Risk Level</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-[11px]">
                      {activeData.hourly.map((h) => {
                        const currentTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
                        const hrCat = getProbabilityCategory(h.probability, currentTheme);
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
                            <td className="py-2.5 px-3">{h.rain_intensity_1h.toFixed(2)} mm</td>
                            <td className="py-2.5 px-3 text-text-muted">{h.rain_accum_6h.toFixed(2)} mm</td>
                            <td className="py-2.5 px-3 text-text-muted">{h.rain_accum_24h.toFixed(2)} mm</td>
                            <td className="py-2.5 px-3 text-center font-bold text-text-text">
                              {(h.probability * 100).toFixed(2)}%
                            </td>
                            <td className="py-2.5 px-3 text-center md:text-right">
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

                {/* Mobile Cards View */}
                <div className="block md:hidden w-full">
                  <div
                    className="flex overflow-x-auto gap-3 pb-3 snap-x scrollbar-thin scrollbar-thumb-rounded"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {activeData.hourly.map((h) => {
                      const currentTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
                      const hrCat = getProbabilityCategory(h.probability, currentTheme);
                      const isSelected = selectedHourIdx === h.hour;
                      return (
                        <div
                          key={h.hour}
                          id={`hour-card-${h.hour}`}
                          onClick={() => setSelectedHourIdx(h.hour)}
                          className={`w-64 shrink-0 p-4 rounded-[6px] border snap-start cursor-pointer transition-all flex flex-col justify-between h-44 ${isSelected
                              ? "border-primary-blue bg-primary-blue-bg/20"
                              : "border-border-surface bg-bg-mantle/40 hover:border-border-surface/80"
                            }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-mono text-xs font-bold text-text-text">
                              {formatHour(h.hour)}
                            </span>
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-[2px] text-[8px] font-bold border ${hrCat.colorClass}`}>
                              {hrCat.label}
                            </span>
                          </div>

                          <div className="my-2">
                            <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest block">
                              Probability
                            </span>
                            <span className="text-lg font-mono font-black text-text-text">
                              {(h.probability * 100).toFixed(2)}%
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 border-t border-border-surface/40 pt-2 font-mono text-[9px]">
                            <div>
                              <span className="text-text-muted block font-sans">Rain (1h)</span>
                              <span className="font-bold text-text-text">{h.rain_intensity_1h.toFixed(2)} mm</span>
                            </div>
                            <div>
                              <span className="text-text-muted block font-sans">Accum (6h)</span>
                              <span className="font-bold text-text-subtext">{h.rain_accum_6h.toFixed(2)} mm</span>
                            </div>
                            <div>
                              <span className="text-text-muted block font-sans">Accum (24h)</span>
                              <span className="font-bold text-text-subtext">{h.rain_accum_24h.toFixed(2)} mm</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              <div className="mt-3 font-mono text-[9px] text-text-muted uppercase tracking-wider">
                *Select timelines to evaluate rolling sensors in depth
              </div>
            </div>

          </section>
        )}

      </div>

      {/* Footer (shared) wrapped to extend background color on mobile bottom navbar overflow */}
      <div className="w-full mt-auto bg-bg-crust pb-16 md:pb-0">
        <Footer />
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border-surface bg-bg-mantle/95 backdrop-blur-md flex items-center justify-around py-2.5 px-4 shadow-[0_-4px_24px_rgba(0,0,0,0.4)]">
        {DASHBOARD_SECTIONS.map((sec) => {
          const isActive = activeDashboardSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => scrollToDashboardSection(sec.id)}
              className={`flex flex-col items-center gap-1 font-mono text-[9px] uppercase tracking-wider transition-colors duration-200 cursor-pointer ${
                isActive ? "text-primary-blue" : "text-text-muted hover:text-text-subtext"
              }`}
            >
              {sec.id === "overview" && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              )}
              {sec.id === "forecast-curve" && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                </svg>
              )}
              {sec.id === "hour-inspector" && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
              {sec.id === "logs-timeline" && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
              <span className="text-[8px] tracking-tight">{sec.id === "forecast-curve" ? "Forecast" : sec.id === "hour-inspector" ? "Inspector" : sec.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Scroll to Top Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-20 md:bottom-6 right-6 z-50 flex items-center justify-center cursor-pointer transition-all duration-300 ${
          showScrollTop ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
        }`}
        title="Scroll to Top"
      >
        {/* Outer Hexagon (Acts as Border) */}
        <div className="bg-border-surface [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] w-[34px] h-[38px] flex items-center justify-center hover:bg-primary-blue transition-colors shadow-2xl">
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





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

const EVAC_SECTIONS = [
  { id: "overview", label: "Overview & Map" },
];

export default function ManageEvacPage() {
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [pinnedPosition, setPinnedPosition] = useState<[number, number] | null>(null);
  const [data, setData] = useState<PredictionResponse | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'tomorrow' | 'dayAfterTomorrow'>('tomorrow');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [appliedTheme, setAppliedTheme] = useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  // Clear pinned position when leaving edit mode
  useEffect(() => {
    if (!isEditMode) {
      setPinnedPosition(null);
    }
  }, [isEditMode]);

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
    const sectionIds = ["overview"];
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

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const activeData = useMemo(() => {
    if (!data) return null;
    return data.days[selectedPeriod];
  }, [data, selectedPeriod]);

  const [selectedHourIdx, setSelectedHourIdx] = useState<number>(12);

  const [timeUntilNextHour, setTimeUntilNextHour] = useState<string>("59:59");
  const [phTime, setPhTime] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchPrediction = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/predict?latitude=${NAGA_LAT}&longitude=${NAGA_LON}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server returned error ${res.status}`);
      const json: PredictionResponse = await res.json();
      if ("error" in json) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error((json as any).error);
      }
      setData(json);
      setSelectedHourIdx(json.days[selectedPeriod].summary.peak_hour);
      if (json.last_updated) {
        const dateObj = new Date(json.last_updated);
        const formatted =
          dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
          ", " +
          dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) +
          " PST";
        setLastUpdated(formatted);
      } else {
        setLastUpdated("N/A");
      }
    } catch {
      // Fail silently
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    const timer = setTimeout(() => { fetchPrediction(); }, 150);
    return () => clearTimeout(timer);
  }, []);

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
      if (minutes === 0 && seconds === 0) setTimeout(() => fetchPrediction(), 1000);
    };
    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

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

  const selectedHourDetails = useMemo(() => {
    if (!activeData || !activeData.hourly || activeData.hourly.length === 0) return null;
    return activeData.hourly.find((h) => h.hour === selectedHourIdx) || activeData.hourly[12];
  }, [activeData, selectedHourIdx]);

  const formatHour = (h: number) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:00 ${ampm}`;
  };

  const summaryCategory = useMemo(() => {
    if (!activeData) return null;
    const currentTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
    return getProbabilityCategory(activeData.summary.peak_probability / 100, currentTheme);
  }, [activeData]);

  return (
    <div className="min-h-screen bg-bg-base text-text-text font-sans flex flex-col antialiased selection:bg-primary-blue-bg selection:text-primary-blue flows-root relative">
      <style>{`
        .flows-sidebar-custom {
          transition: all 0.5s ease-in-out !important;
        }
        @media (min-width: 768px) {
          .flows-sidebar-custom {
            margin-left: ${isEditMode ? "-420px" : "0px"} !important;
            opacity: ${isEditMode ? "0" : "1"} !important;
            width: 420px !important;
            min-width: 420px !important;
          }
        }
        @media (max-width: 767px) {
          .flows-sidebar-custom {
            max-height: ${isEditMode ? "0px" : "2000px"} !important;
            opacity: ${isEditMode ? "0" : "1"} !important;
            padding: ${isEditMode ? "0px" : "20px"} !important;
            overflow: hidden !important;
          }
        }
      `}</style>


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
          <div className="flex items-center justify-center gap-1.5 h-7 px-2.5 border border-border-surface bg-bg-crust/50 rounded-[4px] flows-indicator">
            <span className="text-text-subtext font-bold uppercase tracking-wider">NEXT UPDATE IN:</span>
            <span className="text-text-text font-bold tracking-wider">{timeUntilNextHour}</span>
          </div>

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

        {/* SECTION: Docked Split Viewport — Sidebar Analytics (Left) + Map (Right) */}
        <section id="overview" className="relative w-full h-auto md:h-[calc(100vh-50px)] md:min-h-[550px] border-b border-border-surface flex flex-col md:flex-row overflow-hidden bg-bg-base z-10">

          {/* DOCKED SIDEBAR PANEL */}
          <aside className="shrink-0 h-auto md:h-full border-b md:border-b-0 md:border-r border-border-surface bg-bg-mantle p-5 flex flex-col justify-between overflow-y-auto select-none font-sans z-20 flows-sidebar flows-sidebar-custom">
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

                  {/* Hero Risk Classification */}
                  <div className={`rounded-[4px] border p-4 flex items-center justify-between gap-3 ${summaryCategory.colorClass}`}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] font-mono font-bold uppercase tracking-widest opacity-70">Overall Assessment</span>
                      <span className="text-xl font-extrabold font-mono tracking-tight leading-none">{summaryCategory.heroLabel}</span>
                      <span className="text-[10px] font-light opacity-75 mt-0.5">
                        Peak: {activeData.summary.peak_probability.toFixed(2)}% at {formatHour(activeData.summary.peak_hour)}
                      </span>
                    </div>
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

                  {/* Core Risk Metrics */}
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

                  {/* Last Updated */}
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

            {/* Add Evacuation Shelter CTA — pinned to sidebar bottom */}
            <div className="shrink-0 pt-4 mt-2 border-t border-border-surface">
              <button
                onClick={() => setIsEditMode(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-blue hover:bg-primary-blue/90 active:scale-[0.98] text-white text-[10px] font-mono font-bold uppercase tracking-widest rounded-[4px] transition-all duration-150 shadow-[0_0_16px_rgba(59,130,246,0.2)] cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Evacuation Shelter
              </button>
            </div>
          </aside>

          {/* DOCKED MAP PANEL */}
          <div className="flex-1 h-[400px] md:h-full relative z-10 bg-[#11111b]">
            {isEditMode && (
              <div className="absolute top-4 md:top-6 left-1/2 -translate-x-1/2 z-30 flex items-center h-7 md:h-10 gap-3 border border-border-surface bg-bg-mantle px-3.5 py-1 md:px-4 md:py-2 rounded-[4px] shadow-2xl font-mono text-[9px] md:text-[10px] text-text-text max-w-[90vw] md:max-w-none animate-in fade-in slide-in-from-top-4 duration-300">
                <span className="flex items-center gap-2 font-sans font-medium text-text-subtext">
                  <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>
                    {pinnedPosition
                      ? "Pin placed. Confirm to save shelter details."
                      : "Click anywhere on the map to place the shelter pin"}
                  </span>
                </span>
                <div className="h-full border-r border-border-surface self-stretch mx-1" />
                <div className="flex items-center gap-1.5">
                  {pinnedPosition && (
                    <button
                      onClick={() => {
                        console.log("Confirming shelter position:", pinnedPosition);
                      }}
                      className="px-1.5 py-0.5 md:px-2 md:py-1 text-[7px] md:text-[8px] font-bold font-mono uppercase rounded-[2px] cursor-pointer border transition-all bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-500/35 text-emerald-500"
                    >
                      Confirm
                    </button>
                  )}
                  <button
                    onClick={() => setIsEditMode(false)}
                    className="px-1.5 py-0.5 md:px-2 md:py-1 text-[7px] md:text-[8px] font-bold font-mono uppercase rounded-[2px] cursor-pointer border transition-all bg-[#f38ba8]/20 border-[#f38ba8]/30 hover:bg-[#f38ba8]/35 text-[#f38ba8]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <Suspense fallback={
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#1e1e2e]">
                <div className="relative w-full h-full overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)",
                      backgroundSize: "48px 48px",
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="relative w-10 h-10">
                      <div className="absolute inset-0 rounded-full border-2 border-primary-blue/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-blue animate-spin" />
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-primary-blue">
                      Rendering Cartographic Engine
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                      Loading tile layers&hellip;
                    </span>
                  </div>
                </div>
              </div>
            }>
              <FloodMap
                data={data}
                theme={appliedTheme}
                selectedHourDetails={selectedHourDetails}
                getProbabilityCategory={getProbabilityCategory}
                isEditMode={isEditMode}
                pinnedPosition={pinnedPosition}
                onMapClick={setPinnedPosition}
              />
            </Suspense>
          </div>

        </section>

      </div>

      {/* Footer */}
      <div className="w-full mt-auto bg-bg-crust pb-16 md:pb-0">
        <Footer />
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border-surface bg-bg-mantle/95 backdrop-blur-md flex items-center justify-around py-2.5 px-4 shadow-[0_-4px_24px_rgba(0,0,0,0.4)]">
        {EVAC_SECTIONS.map((sec) => {
          const isActive = activeDashboardSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => scrollToDashboardSection(sec.id)}
              className={`flex flex-col items-center gap-1 font-mono text-[9px] uppercase tracking-wider transition-colors duration-200 cursor-pointer ${isActive ? "text-primary-blue" : "text-text-muted hover:text-text-subtext"
                }`}
            >
              {sec.id === "overview" && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              )}
              <span className="text-[8px] tracking-tight">{sec.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Scroll to Top Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-20 md:bottom-6 right-6 z-50 flex items-center justify-center cursor-pointer transition-all duration-300 ${showScrollTop ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
          }`}
        title="Scroll to Top"
      >
        <div className="bg-border-surface [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] w-[34px] h-[38px] flex items-center justify-center hover:bg-primary-blue transition-colors shadow-2xl">
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

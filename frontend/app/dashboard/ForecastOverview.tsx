"use client";

import { useState } from "react";
import type { DailyPredictionBlock, ForecastPeriod, PredictionResponse, StreetPrediction } from "../../lib/forecast-types";

const levels = ["Safe", "Low", "Moderate", "High"] as const;
const tones: Record<string, string> = { Safe: "text-safe-text bg-safe-bg border-safe-border", Low: "text-primary-blue bg-primary-blue-bg border-primary-blue-border", Moderate: "text-semantic-yellow bg-semantic-yellow-bg border-semantic-yellow-border", High: "text-semantic-red bg-semantic-red-bg border-semantic-red-border" };
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const control = "min-h-11 rounded-xl border border-border-surface px-4 text-sm font-medium transition hover:bg-bg-crust focus-visible:outline-2 focus-visible:outline-primary-blue focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-wait";

export function ForecastOverview({ data, period, onPeriodChange, selectedStreetId, onSelectStreet, loading, error, lastUpdated, onRefresh }: {
  data: PredictionResponse | null; period: ForecastPeriod; onPeriodChange: (p: ForecastPeriod) => void;
  selectedStreetId?: number; onSelectStreet: (id: number) => void; loading: boolean; error: string | null; lastUpdated: string; onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const streets = data?.streets ?? [];
  const visible = streets.filter(s => s.street_name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => Number(b.days[period].complete) - Number(a.days[period].complete) || b.days[period].summary.peak_probability - a.days[period].summary.peak_probability || a.street_name.localeCompare(b.street_name));
  return <section id="overview" className="w-full max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
    <div className="flex flex-wrap justify-between items-end gap-4">
      <div><p className="text-sm text-primary-blue font-medium mb-2">Villa Karangahan / Street forecasts</p><h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Know your street?s flood risk</h1><p className="text-text-muted mt-3 max-w-2xl text-sm leading-relaxed">Compare 26 streets, explore hourly forecasts, and plan your next move.</p></div>
      <div className="flex items-center gap-3"><p className="text-xs text-text-muted" aria-live="polite">{loading ? "Refreshing forecasts?" : lastUpdated ? `Updated ${lastUpdated}` : "Awaiting forecast data"}</p><button className={control} disabled={loading} aria-label="Refresh street forecasts" onClick={onRefresh}>{loading ? "Refreshing?" : "Refresh"}</button></div>
    </div>
    <div className="sticky top-0 md:top-16 z-30 flex gap-2 rounded-2xl border border-border-surface bg-bg-mantle p-2 shadow-sm" role="group" aria-label="Forecast day">
      {(["today", "tomorrow", "dayAfterTomorrow"] as const).map((key, i) => <button key={key} aria-pressed={period === key} onClick={() => onPeriodChange(key)} className={`${control} flex-1 ${period === key ? "bg-primary-blue text-white border-transparent" : "text-text-subtext"}`}><span>{["Today", "Tomorrow", "Day 3"][i]}</span><span className="block text-xs opacity-75 mt-1">{streets[0]?.days[key]?.date ? new Date(`${streets[0].days[key].date}T12:00:00+08:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Manila" }) : "?"}</span></button>)}
    </div>
    {error && <div role="alert" className="rounded-xl border border-semantic-red-border bg-semantic-red-bg p-4 text-sm"><p>{error}</p>{data && <p className="mt-1">Previously loaded forecasts remain visible.</p>}<button onClick={onRefresh} disabled={loading} className={`${control} mt-3`}>Retry refresh</button></div>}
    {data?.stale && <p role="status" className="rounded-xl border border-semantic-yellow-border bg-semantic-yellow-bg p-4 text-sm text-semantic-yellow">These forecasts are stale. Refresh to check for newer predictions.</p>}
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {[...levels, "Incomplete"].map(level => <div key={level} className={`rounded-2xl border p-4 ${tones[level] ?? "border-border-surface bg-bg-mantle text-text-subtext"}`}><p className="text-xs font-medium">{level === "Safe" ? "Minimal risk" : level === "Incomplete" ? level : `${level} risk`}</p><p className="text-3xl font-semibold tracking-tight mt-3">{!data ? "?" : streets.filter(s => level === "Incomplete" ? !s.days[period].complete : s.days[period].complete && s.days[period].summary.risk_level === level).length}</p><p className="text-xs opacity-75 mt-1">streets{data?.stale ? " ? stale" : ""}</p></div>)}
    </div>
    <div className="rounded-2xl border border-border-surface bg-bg-mantle overflow-hidden">
      <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-b border-border-surface"><div><h2 className="text-lg font-semibold">Street comparison</h2><p className="text-xs text-text-muted mt-1">Highest peak probability first ? All times in Manila</p></div><input aria-label="Search streets" placeholder="Search streets?" value={query} onChange={e => setQuery(e.target.value)} className={`${control} w-full sm:w-64 bg-bg-base`} /></div>
      <div className="hidden sm:grid grid-cols-4 px-5 py-3 text-xs text-text-muted border-b border-border-surface"><span>Street</span><span>Daily risk</span><span>Peak probability</span><span>Peak time</span></div>
      <div className="max-h-[480px] overflow-y-auto" aria-busy={loading}>
        {!data && <p role="status" className="p-10 text-center text-text-muted">{loading ? "Loading street forecasts?" : "No forecasts available. Refresh to try again."}</p>}
        {data && !visible.length && <p className="p-10 text-center text-text-muted">No streets match ?{query}?.</p>}
        {visible.map(street => { const day = street.days[period]; const selected = selectedStreetId === street.street_id;
          return <button key={street.street_id} onClick={() => onSelectStreet(street.street_id)} aria-pressed={selected} className={`w-full grid grid-cols-2 sm:grid-cols-4 gap-3 items-center text-left px-5 py-4 min-h-16 border-b border-border-surface last:border-0 transition focus-visible:outline-2 focus-visible:outline-primary-blue focus-visible:outline-offset-[-2px] ${selected ? "bg-primary-blue-bg border-l-4 border-l-primary-blue" : "hover:bg-bg-crust border-l-4 border-l-transparent"}`}>
            <span className="capitalize font-semibold">{street.street_name}<span className="block text-xs text-text-muted font-normal mt-1">{selected ? "Selected street" : "View forecast"}</span></span>
            <span><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${day.complete ? tones[day.summary.risk_level] : "border-border-surface text-text-muted"}`}>{day.complete ? day.summary.risk_level === "Safe" ? "Minimal" : day.summary.risk_level : "Incomplete"}</span></span>
            <span className="text-sm tabular-nums">{day.complete ? `${day.summary.peak_probability.toFixed(2)}%` : `${day.hourly.length}/24 hours`}</span>
            <span className="text-sm text-text-muted">{day.complete ? `${hourLabel(day.summary.peak_hour)} PHT` : "Awaiting coverage"}</span>
          </button>;
        })}
      </div>
    </div>
    <p className="text-xs text-text-muted leading-relaxed">Streets share area rainfall forecasts. Predictions account for each street?s elevation and hazard inputs. Forecasts support planning; follow local emergency advisories.</p>
  </section>;
}

export function StreetSummary({ street, day }: { street: StreetPrediction; day: DailyPredictionBlock }) {
  return <section className="max-w-7xl mx-auto px-4 md:px-6 pt-4" aria-label="Selected street summary">
    <div className="rounded-2xl border border-border-surface bg-bg-mantle p-6 md:p-8">
      <div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs text-primary-blue font-medium mb-2">Selected street / {day.date}</p><h2 className="text-2xl font-semibold capitalize">{street.street_name}</h2><p className="text-sm text-text-muted mt-2">Elevation {street.elevation} m ? {day.hourly.length}/24 forecast hours</p></div><div className={`rounded-xl border p-4 ${day.complete ? tones[day.summary.risk_level] : "border-border-surface"}`}><p className="text-xs">{day.complete ? "Peak flood probability" : "Partial forecast"}</p><p className="text-2xl font-semibold mt-1">{day.complete ? `${day.summary.peak_probability.toFixed(2)}%` : "Incomplete"}</p><p className="text-xs mt-1">{day.complete ? `${day.summary.risk_level === "Safe" ? "Minimal" : day.summary.risk_level} risk ? ${hourLabel(day.summary.peak_hour)} PHT` : "Available hours shown below"}</p></div></div>
      <div className="mt-6 pt-5 border-t border-border-surface grid grid-cols-2 gap-4"><div><p className="text-xs text-text-muted">{day.complete ? "Daily rainfall" : "Rainfall in available hours"}</p><p className="text-xl font-medium mt-1">{day.summary.total_precipitation.toFixed(1)} <span className="text-sm text-text-muted">mm</span></p></div><div><p className="text-xs text-text-muted">Average flood probability{day.complete ? "" : " (available hours)"}</p><p className="text-xl font-medium mt-1">{day.hourly.length ? `${day.summary.average_probability.toFixed(2)}%` : "Unavailable"}</p></div></div>
      {!day.complete && <p role="status" className="mt-4 text-sm text-semantic-yellow">This day has incomplete coverage. A full-day risk classification is unavailable.</p>}
    </div>
  </section>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { GIS_DATA_PATHS, isValidFeatureCollection } from "../../../lib/gis-config";
import { ROAD_PROBABILITY_THRESHOLD } from "../../../lib/road-checker";
import { createDemoForecasts, DEMO_SHELTERS, DEMO_START, DEMO_STREET, getDemoStreetNames } from "../../../lib/road-demo";
import type { ShelterRouteCandidate } from "../../../lib/route-planner";

const FloodMap = dynamic(() => import("../../components/FloodMap"), { ssr: false });
const category = (probability: number) => ({
  hex: probability >= ROAD_PROBABILITY_THRESHOLD ? "#ef4444" : "#22c55e",
});

export default function RoadDemoPage() {
  const [roads, setRoads] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [street, setStreet] = useState(DEMO_STREET);
  const [probability, setProbability] = useState(0.1);
  const [blockAll, setBlockAll] = useState(false);
  const [start, setStart] = useState<[number, number]>(DEMO_START);
  const [isPinning, setIsPinning] = useState(false);
  const [route, setRoute] = useState<ShelterRouteCandidate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(GIS_DATA_PATHS.roads, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load the local road geometry.");
        const geometry: unknown = await response.json();
        if (!isValidFeatureCollection(geometry)) throw new Error("Road geometry is invalid.");
        setRoads(geometry as GeoJSON.FeatureCollection);
      })
      .catch(error => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, []);

  const names = useMemo(() => roads ? getDemoStreetNames(roads) : [], [roads]);
  const streetForecasts = useMemo(() => roads
    ? createDemoForecasts(roads, street, probability, blockAll) : [], [roads, street, probability, blockAll]);
  const selectedHour = useMemo(() => ({
    time: "DEMO", hour: 12, rain_intensity_1h: 0, rain_accum_6h: 0,
    rain_accum_24h: 0, probability: 0.1, street_forecasts: streetForecasts,
  }), [streetForecasts]);
  const red = blockAll || probability >= ROAD_PROBABILITY_THRESHOLD;

  const reset = () => {
    setStreet(DEMO_STREET);
    setProbability(0.1);
    setBlockAll(false);
    setStart(DEMO_START);
    setIsPinning(false);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] p-4 md:p-6">
        <div className="mb-4 rounded-lg border border-amber-400/60 bg-amber-400/10 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300">DEMO MODE — SYNTHETIC DATA</p>
          <h1 className="mt-1 text-2xl font-bold">Watch a red street change the evacuation route</h1>
          <p className="mt-2 text-sm text-slate-300">
            Real street geometry; mock probabilities, starting pin and shelter.
            This page does not call XGBoost or write to Supabase. The existing A* and shelter ranking are used.
          </p>
          <Link href="/dashboard" className="mt-2 inline-block text-sm text-cyan-300 underline">Return to live dashboard</Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section aria-label="Road demo controls" className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold">Demo controls</h2>
            <p className="mt-2 text-sm text-slate-300">
              Start with all roads green. Set Chico Street to 90% and watch the orange route take another street.
            </p>
            <label htmlFor="demo-street" className="mt-5 block text-sm font-medium">Street to simulate</label>
            <select id="demo-street" value={street} disabled={!roads || blockAll}
              onChange={event => setStreet(event.target.value)}
              className="mt-2 w-full rounded border border-slate-600 bg-slate-950 p-2 text-sm">
              {names.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <label htmlFor="demo-probability" className="mt-5 block text-sm font-medium">
              Mock flood probability: {Math.round((blockAll ? 0.9 : probability) * 100)}%
            </label>
            <input id="demo-probability" type="range" min="0" max="100" step="1"
              value={Math.round((blockAll ? 0.9 : probability) * 100)} disabled={!roads || blockAll}
              onChange={event => setProbability(Number(event.target.value) / 100)}
              className="mt-3 w-full accent-amber-400" />
            <p className="mt-1 text-xs text-slate-400">At {ROAD_PROBABILITY_THRESHOLD * 100}% or higher, the street turns red and is excluded.</p>
            <p role="status" className={`mt-3 text-sm font-semibold ${red ? "text-red-400" : "text-green-400"}`}>
              {blockAll ? "All streets: RED / restricted" : `${street}: ${red ? "RED / restricted" : "GREEN / passable by demo rule"}`}
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button type="button" disabled={!roads} onClick={() => { setBlockAll(false); setProbability(0.9); }}
                className="rounded bg-red-700 px-3 py-2 text-sm font-semibold hover:bg-red-600 disabled:opacity-40">Make selected street red (90%)</button>
              <button type="button" disabled={!roads} onClick={() => { setBlockAll(false); setProbability(0.1); }}
                className="rounded bg-green-800 px-3 py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-40">Restore all green (10%)</button>
              <button type="button" disabled={!roads} onClick={() => setBlockAll(true)}
                className="rounded border border-red-500/60 px-3 py-2 text-sm hover:bg-red-500/10 disabled:opacity-40">Make all streets red — no route</button>
              <button type="button" disabled={!roads} onClick={() => setIsPinning(value => !value)}
                className="rounded border border-cyan-500/60 px-3 py-2 text-sm hover:bg-cyan-500/10 disabled:opacity-40">
                {isPinning ? "Cancel moving the starting pin" : "Choose another starting pin"}
              </button>
              <button type="button" onClick={reset} className="rounded border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">Reset demo</button>
            </div>
            <div className="mt-5 border-t border-slate-700 pt-4 text-sm">
              <p className="font-semibold">Current route</p>
              <p aria-live="polite" className="mt-2 text-slate-300">
                {route ? `${route.distanceKm.toFixed(3)} km to ${route.shelterName}` : roads ? "No connected route currently available." : "Loading streets…"}
              </p>
              {notice && <p className="mt-2 text-xs text-amber-200">{notice}</p>}
              {isPinning && <p className="mt-2 text-xs text-cyan-300">Click the map or a building to move the starting pin.</p>}
              <p className="mt-3 text-xs text-slate-400">Choosing a different street or pin may produce a detour, an unchanged route, or no route, depending on connectivity.</p>
            </div>
          </section>

          <section aria-label="Live road restriction demo map"
            className="relative h-[650px] min-h-[500px] overflow-hidden rounded-lg border border-slate-700">
            <div className="pointer-events-none absolute left-3 top-3 z-40 rounded bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950">
              DEMO — simulated street restrictions
            </div>
            {roads ? <FloodMap data={roads} roadGeometry={roads} theme="dark"
              selectedHourDetails={selectedHour} getProbabilityCategory={category}
              shelterPins={DEMO_SHELTERS} routeStart={start} pinnedPosition={start}
              isPinningLocation={isPinning}
              onMapClick={point => { setStart(point); setIsPinning(false); }}
              onLocationPinChange={setStart} onRouteFound={setRoute} onRouteErrorChange={setNotice}
            /> : <p role={loadError ? "alert" : "status"} className="p-8 pt-16 text-slate-300">{loadError ?? "Loading local GIS streets…"}</p>}
          </section>
        </div>
      </div>
    </main>
  );
}

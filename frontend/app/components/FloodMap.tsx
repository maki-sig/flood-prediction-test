"use client";

import React, { useEffect, useState, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ShelterPin } from "../../lib/evac-actions";

const NAGA_POLYGON_COORDS: [number, number][] = [
  [13.6419785, 123.1934035],
  [13.6416401, 123.1933278],
  [13.6416585, 123.1918782],
  [13.6417219, 123.1915338],
  [13.6421588, 123.1916475],
  [13.6422572, 123.1913411],
  [13.643296, 123.191687],
  [13.6433786, 123.1912268],
  [13.6444971, 123.1912708],
  [13.6457181, 123.1922606],
  [13.6466449, 123.1925039],
  [13.6462163, 123.1939949],
  [13.6460041, 123.194951],
  [13.6439484, 123.1944416],
  [13.6443549, 123.1938358],
  [13.642053, 123.1929932],
  [13.6419785, 123.1934035],
];

function isPointInPolygon(point: [number, number], vs: [number, number][]): boolean {
  const x = point[0]; // Latitude
  const y = point[1]; // Longitude
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

interface HourlyData {
  time: string;
  hour: number;
  rain_intensity_1h: number;
  rain_accum_6h: number;
  rain_accum_24h: number;
  probability: number;
}

interface FloodMapProps {
  data: any;
  theme?: "dark" | "light";
  selectedHourDetails: HourlyData | null;
  getProbabilityCategory: (p: number, theme: "dark" | "light") => any;
  isEditMode?: boolean;
  pinnedPosition?: [number, number] | null;
  onMapClick?: (latlng: [number, number]) => void;
  defaultStyle?: "dark" | "light" | "satellite";
  shelterPins?: ShelterPin[];
  onPinClick?: (pin: ShelterPin) => void;
  selectedShelterPin?: ShelterPin | null;
}

export default function FloodMap({
  data,
  theme,
  selectedHourDetails,
  getProbabilityCategory,
  isEditMode,
  pinnedPosition,
  onMapClick,
  defaultStyle = "dark",
  shelterPins = [],
  onPinClick,
  selectedShelterPin,
}: FloodMapProps) {
  const [mapStyle, setMapStyle] = useState<"dark" | "light" | "satellite">(defaultStyle);
  const [appliedTheme, setAppliedTheme] = useState<"dark" | "light">(
    (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) ? "dark" : "light"
  );
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isCursorInside, setIsCursorInside] = useState(true);

  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const shelterMarkersRef = useRef<L.Marker[]>([]);

  // Recalculate map container size and center layout on edit mode toggle
  useEffect(() => {
    if (!mapInstance) return;

    // Trigger loading screen overlay during transition
    setMapReady(false);

    // Invalidate size immediately so Leaflet knows the dimensions changed
    mapInstance.invalidateSize();

    if (isEditMode) {
      // Zoom in a bit when entering edit mode
      mapInstance.flyTo([13.6441, 123.1931], 16, {
        animate: true,
        duration: 0.8,
      });
    } else {
      // Smoothly fly back to fit the bounds of the target polygon when edit mode is cancelled
      if (polygonRef.current) {
        mapInstance.flyToBounds(polygonRef.current.getBounds(), {
          padding: [20, 20],
          animate: true,
          duration: 0.8,
        });
      }
    }

    const timer = setTimeout(() => {
      mapInstance.invalidateSize();
      if (!isEditMode && polygonRef.current) {
        mapInstance.fitBounds(polygonRef.current.getBounds(), {
          padding: [20, 20],
          animate: true,
        });
      }
      // Hide the loading overlay after transition completes
      setMapReady(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isEditMode, mapInstance]);

  // Handle map click events & cursor hover boundary checks in edit mode
  useEffect(() => {
    if (!mapInstance || !isEditMode) {
      setIsCursorInside(true);
      if (mapInstance) {
        try {
          const container = mapInstance.getContainer();
          container.style.cursor = "";
        } catch (err) {}
      }
      return;
    }

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const inside = isPointInPolygon([e.latlng.lat, e.latlng.lng], NAGA_POLYGON_COORDS);
      if (!inside) return; // Block placing pin outside
      if (onMapClick) {
        onMapClick([e.latlng.lat, e.latlng.lng]);
      }
    };

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      const inside = isPointInPolygon([e.latlng.lat, e.latlng.lng], NAGA_POLYGON_COORDS);
      setIsCursorInside(inside);
      
      const container = mapInstance.getContainer();
      if (pinnedPosition) {
        // If a pin is already placed, we do not show the stop/block cursor (not-allowed) when hovering outside
        container.style.cursor = inside ? "crosshair" : "";
      } else {
        if (inside) {
          container.style.cursor = "crosshair";
        } else {
          container.style.cursor = "not-allowed";
        }
      }
    };

    const handleMouseOut = () => {
      setIsCursorInside(true);
      try {
        const container = mapInstance.getContainer();
        container.style.cursor = "";
      } catch (err) {}
    };

    mapInstance.on("click", handleMapClick);
    mapInstance.on("mousemove", handleMouseMove);
    mapInstance.on("mouseout", handleMouseOut);

    return () => {
      mapInstance.off("click", handleMapClick);
      mapInstance.off("mousemove", handleMouseMove);
      mapInstance.off("mouseout", handleMouseOut);
      try {
        const container = mapInstance.getContainer();
        container.style.cursor = "";
      } catch (err) {}
    };
  }, [mapInstance, isEditMode, onMapClick, pinnedPosition]);

  // Render or update pinned marker position
  useEffect(() => {
    if (!mapInstance) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (pinnedPosition) {
      const redIcon = L.icon({
        iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      const marker = L.marker(pinnedPosition, { icon: redIcon }).addTo(mapInstance);
      markerRef.current = marker;
    }
  }, [pinnedPosition, mapInstance]);

  // Synchronize map style with system theme selection
  // Note: if defaultStyle is overridden (e.g. satellite), theme changes are ignored
  useEffect(() => {
    if (defaultStyle === "satellite") return; // Satellite pages always stay satellite
    const t = theme ?? appliedTheme;
    if (t === "light") setMapStyle("light");
    else setMapStyle("dark");
  }, [theme, appliedTheme, defaultStyle]);

  // Explicit global bounds clamped to the world to prevent infinite panning
  const worldBounds: L.LatLngBoundsExpression = [
    [-90, -180], // SouthWest corner
    [90, 180], // NorthEast corner
  ];

  // Initialize Map
  useEffect(() => {
    if (!data) return;

    // Reset ready state for each (re)initialization
    setMapReady(false);

    // Set up Leaflet Map inside #flows-leaflet-map
    const map = L.map("flows-leaflet-map", {
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: false,
      scrollWheelZoom: false,
      minZoom: 2,
      maxZoom: 18,
      maxBounds: worldBounds,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
    }).setView([13.6441, 123.1931], 16);

    // Dynamic Attribution pinned neatly
    L.control.attribution({ prefix: false }).addTo(map);

    // Determine initial color style
    const t = theme ?? appliedTheme;
    const category = getProbabilityCategory(
      selectedHourDetails?.probability || 0,
      t
    );

    const polygon = L.polygon(NAGA_POLYGON_COORDS, {
      color: category.hex,
      fillColor: category.hex,
      fillOpacity: (theme ?? appliedTheme) === "dark" ? 0.18 : 0.14,
      weight: 2,
      opacity: 0.85,
    }).addTo(map);

    polygonRef.current = polygon;
    setMapInstance(map);

    // Automatically fit polygon
    map.fitBounds(polygon.getBounds(), { padding: [10, 10] });

    // Mark map as ready once all visible tiles have loaded
    map.once("load", () => setMapReady(true));
    // Fallback: some tile providers don't always fire 'load' — mark ready after a short delay
    const fallbackTimer = setTimeout(() => setMapReady(true), 2500);

    return () => {
      clearTimeout(fallbackTimer);
      map.remove();
      setMapInstance(null);
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme, appliedTheme]);

  // Dynamically swap the active tile layer based on mapStyle selection
  useEffect(() => {
    if (!mapInstance || !(mapInstance as any)._container) return;

    // Remove existing tile layer if any
    if (tileLayerRef.current) {
      try {
        tileLayerRef.current.remove();
      } catch (e) {
        // Ignore if layer is already removed or map is destroyed
      }
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
      url =
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      attrib = "&copy; Esri";
    }

    try {
      const newLayer = L.tileLayer(url, {
        maxZoom: 20,
        attribution: attrib,
        subdomains: "abcd",
        noWrap: true,
        bounds: worldBounds,
      }).addTo(mapInstance);

      tileLayerRef.current = newLayer;
    } catch (e) {
      // Map instance is likely unmounted or mid-destruction
      console.warn("Leaflet error adding layer to map:", e);
    }
  }, [mapStyle, mapInstance]);

  // Dynamically update polygon color styles on selected hour or theme change
  useEffect(() => {
    if (!selectedHourDetails) return;
    const t = theme ?? appliedTheme;
    const category = getProbabilityCategory(selectedHourDetails.probability, t);

    if (polygonRef.current) {
      polygonRef.current.setStyle({
        color: category.hex,
        fillColor: category.hex,
        fillOpacity: t === "dark" ? 0.18 : 0.14,
        weight: 2,
        opacity: 0.85,
      });
    }
  }, [selectedHourDetails, theme, appliedTheme, getProbabilityCategory]);

  // Render shelter pins fetched from the database
  useEffect(() => {
    if (!mapInstance || !shelterPins.length) return;

    // Guard: ensure the map container is actually mounted in the DOM
    try {
      const container = mapInstance.getContainer();
      if (!container || !container.isConnected) return;
    } catch {
      return;
    }

    // Clear any previously rendered shelter markers
    shelterMarkersRef.current.forEach((m) => m.remove());
    shelterMarkersRef.current = [];

    const defaultIcon = L.icon({
      iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    const activeIcon = L.divIcon({
      html: `<div class="active-pinpoint-wrapper" style="width: 25px; height: 41px; position: relative;">
               <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png" style="width: 25px; height: 41px; display: block;" class="active-pinpoint-heartbeat" />
             </div>`,
      className: "active-pinpoint-container",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    });

    shelterPins.forEach((pin) => {
      try {
        const isActive = selectedShelterPin && selectedShelterPin.shelter_id === pin.shelter_id;
        const marker = L.marker([pin.latitude, pin.longitude], { 
          icon: isActive ? activeIcon : defaultIcon 
        }).addTo(mapInstance);
        
        if (onPinClick) {
          marker.on("click", () => onPinClick(pin));
        }
        shelterMarkersRef.current.push(marker);
      } catch {
        // Skip pins that fail to render (e.g. map not ready)
      }
    });

    return () => {
      shelterMarkersRef.current.forEach((m) => m.remove());
      shelterMarkersRef.current = [];
    };
  }, [shelterPins, mapInstance, onPinClick, selectedShelterPin]);

  // Observe changes to document class so map updates when ThemeToggle changes theme
  useEffect(() => {
    if (typeof document === "undefined" || theme) return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setAppliedTheme(el.classList.contains("dark") ? "dark" : "light");
    });
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [theme]);

  return (
    <>
      <div id="flows-leaflet-map" className="w-full h-full z-10" />

      {/* Geofence warning banner */}
      {isEditMode && !pinnedPosition && !isCursorInside && (
        <div className="absolute top-16 md:top-20 left-1/2 -translate-x-1/2 z-20 bg-rose-600/90 text-white font-mono text-[9px] md:text-[10px] uppercase tracking-widest px-3 py-2 rounded-[4px] shadow-2xl flex items-center gap-2 border border-rose-500/30 text-center max-w-[85vw] md:max-w-none pointer-events-none">
          <span>⚠ Evacuation shelter must be placed within target area boundaries!</span>
        </div>
      )}

      {/* Map loading overlay — fades out once Leaflet tiles are ready */}
      <div
        className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 pointer-events-none"
        style={{
          background: "var(--bg-base, #1e1e2e)",
          opacity: mapReady ? 0 : 1,
          transition: "opacity 0.5s ease",
        }}
      >
        {/* Animated grid skeleton imitating a map grid */}
        <div className="relative w-full h-full overflow-hidden">
          {/* Shimmer grid lines */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          {/* Shimmer sweep */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(105deg, transparent 40%, rgba(59,130,246,0.07) 50%, transparent 60%)",
              backgroundSize: "200% 100%",
              animation: "map-shimmer 2s linear infinite",
            }}
          />
          {/* Centre content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            {/* Spinning ring */}
            <div className="relative w-10 h-10">
              <div
                className="absolute inset-0 rounded-full border-2 border-primary-blue/20"
              />
              <div
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-blue animate-spin"
              />
            </div>
            <span
              className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: "var(--primary-blue)" }}
            >
              Rendering Cartographic Engine
            </span>
            <span
              className="font-mono text-[9px] uppercase tracking-widest"
              style={{ color: "var(--text-muted, #585b70)" }}
            >
              Loading tile layers&hellip;
            </span>
          </div>
        </div>
      </div>

      {/* Keyframe for the shimmer sweep */}
      <style>{`
        @keyframes map-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Custom Map Menubar (Bottom Center on Mobile, Top Right on Desktop) */}
      <div className="absolute bottom-4 md:bottom-auto md:top-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 z-20 flex items-center gap-1.5 md:gap-2 border border-border-surface bg-bg-mantle px-2 py-1 md:px-3 md:py-2 rounded-[4px] shadow-2xl font-mono text-[8px] md:text-[9px] text-text-text max-w-[90vw] md:max-w-none">
        {/* Zoom & Reset Buttons */}
        <div className="flex items-center gap-1 border-r border-border-surface pr-1.5 md:pr-2.5">
          <button
            title="Zoom In"
            onClick={() => mapInstance?.zoomIn()}
            className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center bg-bg-crust border border-border-surface hover:bg-border-surface hover:text-primary-blue rounded-[4px] cursor-pointer transition-colors font-bold text-xs select-none"
          >
            ＋
          </button>
          <button
            title="Zoom Out"
            onClick={() => mapInstance?.zoomOut()}
            className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center bg-bg-crust border border-border-surface hover:bg-border-surface hover:text-primary-blue rounded-[4px] cursor-pointer transition-colors font-bold text-xs select-none"
          >
            －
          </button>
          <button
            title="Reset Map Position"
            onClick={() => {
              if (polygonRef.current) {
                mapInstance?.flyToBounds(polygonRef.current.getBounds(), {
                  padding: [10, 10],
                  animate: true,
                  duration: 1.2,
                });
              }
            }}
            className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center bg-bg-crust border border-border-surface hover:bg-border-surface hover:text-primary-blue text-text-text rounded-[4px] cursor-pointer transition-colors"
          >
            <svg
              className="w-3 h-3 md:w-3.5 md:h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v2m0 14v2m9-9h-2M5 12H3m14 0a5 5 0 11-10 0 5 5 0 0110 0z"
              />
            </svg>
          </button>
        </div>

        {/* Map Style Selector */}
        <div className="flex items-center gap-1 pl-0.5">
          <span className="text-text-subtext font-bold text-[7px] md:text-[8px] uppercase tracking-wider mr-0.5 md:mr-1">
            STYLE:
          </span>
          {(["dark", "light", "satellite"] as const).map((style) => (
            <button
              key={style}
              onClick={() => setMapStyle(style)}
              className={`px-1.5 py-0.5 md:px-2 md:py-1 text-[7px] md:text-[8px] font-bold uppercase rounded-[2px] cursor-pointer border transition-all ${mapStyle === style
                ? "bg-primary-blue border-primary-blue text-white"
                : "bg-bg-crust border-border-surface hover:bg-border-surface hover:text-primary-blue text-text-text"
                }`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      {/* Absolute floating premium risk legend (Top Right on Mobile, Bottom Right on Desktop) */}
      <div className="absolute top-4 right-3 md:top-auto md:bottom-6 md:right-6 bg-bg-mantle border border-border-surface px-2.5 py-2 md:px-3 md:py-2 rounded-[4px] font-mono text-[8px] md:text-[9px] text-text-text flex flex-col items-stretch gap-1 md:gap-1.5 z-20 shadow-2xl min-w-[90px] md:min-w-[160px]">
        <span className="text-text-subtext font-bold text-[7px] md:text-[8px] uppercase tracking-widest border-b border-border-surface/60 pb-1 mb-0.5">
          Flood Probability
        </span>
        <div className="flex flex-col gap-1 md:gap-1.5">
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-[2px] bg-emerald-500 border border-emerald-500/20 shrink-0" />
            <span className="text-[7px] md:text-[8.5px] font-normal text-text-text">
              Safe (&lt;1%)
            </span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-[2px] bg-primary-blue border-primary-blue-border shrink-0" />
            <span className="text-[7px] md:text-[8.5px] font-normal text-text-text">
              Low (1-10%)
            </span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-[2px] bg-semantic-yellow border-semantic-yellow-border shrink-0" />
            <span className="text-[7px] md:text-[8.5px] font-normal text-text-text">
              Mod (10-35%)
            </span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-[2px] bg-semantic-red border-semantic-red-border shrink-0" />
            <span className="text-[7px] md:text-[8.5px] font-normal text-text-text">
              High (&gt;35%)
            </span>
          </div>
        </div>
      </div>
      {/* Active Pin Pulse Heartbeat Styles */}
      <style>{`
        @keyframes heartbeat {
          0% { transform: scale(1) translate3d(0,0,0); }
          20% { transform: scale(1.15) translate3d(0,0,0); }
          40% { transform: scale(1) translate3d(0,0,0); }
          60% { transform: scale(1.15) translate3d(0,0,0); }
          80% { transform: scale(1) translate3d(0,0,0); }
          100% { transform: scale(1) translate3d(0,0,0); }
        }
        .active-pinpoint-heartbeat {
          animation: heartbeat 3.2s infinite ease-in-out;
          transform-origin: bottom center;
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .active-pinpoint-container {
          z-index: 1000 !important;
        }
      `}</style>
    </>
  );
}




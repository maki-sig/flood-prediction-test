/**
 * gis-config.ts
 * Centralized GIS configuration, styles, GeoJSON loaders, and SVG markers for FloodVisor.
 * Implements a modern dark GIS basemap without external mapping APIs.
 */

export interface GisLayerVisibility {
  boundary: boolean;
  buildings: boolean;
  roads: boolean;
  rivers: boolean;
  floodRisk: boolean;
  shelters: boolean;
  satellite: boolean;
}

export const GIS_DEFAULT_VISIBILITY: GisLayerVisibility = {
  boundary: true,
  buildings: true,
  roads: true,
  rivers: true,
  floodRisk: true,
  shelters: true,
  satellite: false,
};

export const GIS_DATA_PATHS = {
  boundary: "/gis/geojson/villa_karangahan_boundary.geojson",
  buildings: "/gis/geojson/villa_karangahan_buildings.geojson",
  roads: "/gis/geojson/villa_karangahan_roads.geojson",
  rivers: "/gis/geojson/villa_karangahan_rivers.geojson",
  satelliteTiles: "/gis/tiles/{z}/{x}/{y}.png",
} as const;

// Villa Karangahan default coordinate center and bounding envelope
export const VKS_CENTER: [number, number] = [13.6441, 123.1931];

// Bounding box with buffer to prevent panning far outside geographic coverage
export const VKS_MAX_BOUNDS: [[number, number], [number, number]] = [
  [13.635, 123.180], // SouthWest corner
  [13.655, 123.205], // NorthEast corner
];

/**
 * Styling tokens for the local GIS basemap
 */
export const GIS_STYLES = {
  // Dark charcoal basemap background
  mapBackground: "#111827",

  // Barangay boundary
  boundary: {
    color: "#06b6d4", // Cyan
    weight: 2.5,
    opacity: 0.95,
    fill: false,
    dashArray: "6, 4",
  },

  // Building footprints
  building: {
    strokeColor: "#475569",
    strokeWeight: 0.8,
    fillColor: "#94a3b8", // Light gray
    fillOpacity: 0.38,
    hover: {
      strokeColor: "#38bdf8",
      strokeWeight: 2,
      fillColor: "#cbd5e1",
      fillOpacity: 0.7,
    },
  },

  // Road network
  roads: {
    tertiary: {
      color: "#94a3b8",
      weight: 3.5,
      opacity: 0.9,
    },
    residential: {
      color: "#64748b",
      weight: 2.2,
      opacity: 0.85,
    },
    footway: {
      color: "#475569",
      weight: 1.5,
      opacity: 0.75,
      dashArray: "3, 3",
    },
    default: {
      color: "#64748b",
      weight: 2.0,
      opacity: 0.8,
    },
  },

  // Rivers and waterways
  rivers: {
    color: "#0284c7", // Bright water blue
    weight: 3.5,
    opacity: 0.95,
    fillColor: "#0284c7",
    fillOpacity: 0.35,
  },

  // Flood risk overlay color categories
  floodRisk: {
    safe: {
      hex: "#10b981", // Emerald green
      label: "Safe (<1%)",
      fillOpacity: 0.12,
    },
    low: {
      hex: "#0284c7", // Sky blue
      label: "Low (1-10%)",
      fillOpacity: 0.22,
    },
    moderate: {
      hex: "#f59e0b", // Amber yellow
      label: "Moderate (10-35%)",
      fillOpacity: 0.32,
    },
    high: {
      hex: "#ef4444", // Crimson red
      label: "High (>35%)",
      fillOpacity: 0.42,
    },
  },
};

/**
 * Validates whether loaded GeoJSON object is a valid FeatureCollection
 */
export function isValidFeatureCollection(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const fc = data as { type?: string; features?: unknown };
  return fc.type === "FeatureCollection" && Array.isArray(fc.features);
}

/**
 * Format building properties for interactive popup
 */
export function formatBuildingPopup(props: Record<string, unknown>): string {
  const name = (props.name as string) || (props["nagacity:address"] as string) || `Building #${props.fid || props.id || ""}`;
  const type = props.building && props.building !== "yes" ? (props.building as string) : ((props["nagacity:type"] as string) || "Building");
  const address = (props["nagacity:address"] as string) || "Villa Karangahan Subd.";
  const classrooms = props["nagacity:classrooms"] as string | undefined;
  const teachers = props["nagacity:teachers"] as string | undefined;

  return `
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.4; color: #f1f5f9; min-width: 180px;">
      <div style="font-weight: 700; color: #38bdf8; font-size: 12px; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px;">
        ${escapeHtml(name)}
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <span style="color: #94a3b8;">Type:</span>
        <span style="font-weight: 600; text-transform: capitalize;">${escapeHtml(type)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <span style="color: #94a3b8;">Location:</span>
        <span>${escapeHtml(address)}</span>
      </div>
      ${
        classrooms
          ? `<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
               <span style="color: #94a3b8;">Classrooms:</span>
               <span>${escapeHtml(classrooms)}</span>
             </div>`
          : ""
      }
      ${
        teachers
          ? `<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
               <span style="color: #94a3b8;">Teachers:</span>
               <span>${escapeHtml(teachers)}</span>
             </div>`
          : ""
      }
      <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #1e293b; font-size: 9px; color: #64748b;">
        QGIS Layer: Buildings
      </div>
    </div>
  `;
}

/**
 * Format road properties for interactive popup / tooltip
 */
export function formatRoadPopup(props: Record<string, unknown>): string {
  const name = (props.name as string) || "Unnamed Local Road";
  const highway = (props.highway as string) || "residential";
  const surface = (props.surface as string) || "paved";
  const width = props.width ? `${props.width} m` : "Standard";

  return `
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.4; color: #f1f5f9; min-width: 170px;">
      <div style="font-weight: 700; color: #94a3b8; font-size: 12px; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px;">
        🛣️ ${escapeHtml(name)}
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <span style="color: #94a3b8;">Classification:</span>
        <span style="font-weight: 600; text-transform: capitalize;">${escapeHtml(highway)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <span style="color: #94a3b8;">Surface:</span>
        <span style="text-transform: capitalize;">${escapeHtml(surface)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #94a3b8;">Width:</span>
        <span>${escapeHtml(width)}</span>
      </div>
    </div>
  `;
}

/**
 * Format waterway properties for interactive popup
 */
export function formatWaterwayPopup(props: Record<string, unknown>): string {
  const type = (props.waterway as string) || "Waterway / Drain";
  const boat = props.boat ? `Navigable: ${props.boat}` : "";

  return `
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.4; color: #f1f5f9; min-width: 160px;">
      <div style="font-weight: 700; color: #38bdf8; font-size: 12px; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px;">
        💧 Waterway Channel
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <span style="color: #94a3b8;">Channel Type:</span>
        <span style="font-weight: 600; text-transform: capitalize;">${escapeHtml(type)}</span>
      </div>
      ${boat ? `<div style="font-size: 10px; color: #64748b;">${escapeHtml(boat)}</div>` : ""}
      <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #1e293b; font-size: 9px; color: #64748b;">
        QGIS Layer: Drainage / Rivers
      </div>
    </div>
  `;
}

/**
 * Sanitize strings for HTML injection protection
 */
function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Self-contained SVG Markers (no external CDN images required)
 */
export const GIS_SVG_ICONS = {
  // Evacuation Shelter Marker Pin (Red with shelter house icon)
  shelterDefault: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="28" height="37">
      <defs>
        <filter id="pin-shadow" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/>
        </filter>
      </defs>
      <path d="M16 1 C8 1 2 7.2 2 15 C2 24.5 16 41 16 41 C16 41 30 24.5 30 15 C30 7.2 24 1 16 1 Z" 
            fill="#e11d48" stroke="#ffffff" stroke-width="1.8" filter="url(#pin-shadow)"/>
      <circle cx="16" cy="15" r="7.5" fill="#ffffff"/>
      <path d="M16 10.5 L11 14.5 L12 14.5 L12 18.5 L14.5 18.5 L14.5 16 L17.5 16 L17.5 18.5 L20 18.5 L20 14.5 L21 14.5 Z" 
            fill="#e11d48"/>
    </svg>
  `,

  // Active / Selected Shelter Marker Pin (With pulse ring)
  shelterActive: `
    <div class="active-pinpoint-wrapper" style="width: 32px; height: 42px; position: relative;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42" class="active-pinpoint-heartbeat">
        <defs>
          <filter id="active-shadow" x="-30%" y="-15%" width="160%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#f43f5e" flood-opacity="0.6"/>
          </filter>
        </defs>
        <path d="M16 1 C8 1 2 7.2 2 15 C2 24.5 16 41 16 41 C16 41 30 24.5 30 15 C30 7.2 24 1 16 1 Z" 
              fill="#f43f5e" stroke="#ffffff" stroke-width="2" filter="url(#active-shadow)"/>
        <circle cx="16" cy="15" r="8" fill="#ffffff"/>
        <path d="M16 10 L10.5 14.5 L11.5 14.5 L11.5 19 L14.5 19 L14.5 16 L17.5 16 L17.5 19 L20.5 19 L20.5 14.5 L21.5 14.5 Z" 
              fill="#f43f5e"/>
      </svg>
    </div>
  `,

  // Pinned location / User marker (Target pinpoint in Cyan)
  userPin: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="28" height="37">
      <defs>
        <filter id="user-pin-shadow" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/>
        </filter>
      </defs>
      <path d="M16 1 C8 1 2 7.2 2 15 C2 24.5 16 41 16 41 C16 41 30 24.5 30 15 C30 7.2 24 1 16 1 Z" 
            fill="#06b6d4" stroke="#ffffff" stroke-width="1.8" filter="url(#user-pin-shadow)"/>
      <circle cx="16" cy="15" r="7.5" fill="#ffffff"/>
      <circle cx="16" cy="15" r="4" fill="#0891b2"/>
    </svg>
  `,

  // Destination / Route goal marker (Green flag pin)
  routeDestination: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="28" height="37">
      <defs>
        <filter id="dest-pin-shadow" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/>
        </filter>
      </defs>
      <path d="M16 1 C8 1 2 7.2 2 15 C2 24.5 16 41 16 41 C16 41 30 24.5 30 15 C30 7.2 24 1 16 1 Z" 
            fill="#10b981" stroke="#ffffff" stroke-width="1.8" filter="url(#dest-pin-shadow)"/>
      <circle cx="16" cy="15" r="7.5" fill="#ffffff"/>
      <path d="M13 11 L19 14 L13 17 Z M13 11 L13 20" stroke="#047857" stroke-width="1.6" fill="#10b981" stroke-linecap="round"/>
    </svg>
  `,
};

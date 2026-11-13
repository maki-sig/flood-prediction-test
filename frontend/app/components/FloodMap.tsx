"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import type { Feature, LineString, MultiLineString } from "geojson";
import "leaflet/dist/leaflet.css";
import type { ShelterPin } from "../../lib/evac-actions";
import { findNearestAvailableShelter, type ShelterRouteCandidate } from "../../lib/route-planner";
import { buildRoadNetwork } from "../../lib/road-network";
import {
  GIS_DATA_PATHS,
  GIS_STYLES,
  VKS_CENTER,
  VKS_MAX_BOUNDS,
  GIS_SVG_ICONS,
  GIS_DEFAULT_VISIBILITY,
  type GisLayerVisibility,
  isValidFeatureCollection,
  formatBuildingPopup,
  formatRoadPopup,
  formatWaterwayPopup,
  getShelterCapacityStatus,
  SHELTER_STATUS_COLORS,
  buildShelterIcon,
  buildActiveShelterIcon,
} from "../../lib/gis-config";

interface HourlyData {
  time: string;
  hour: number;
  rain_intensity_1h: number;
  rain_accum_6h: number;
  rain_accum_24h: number;
  probability: number;
}

interface FloodMapProps {
  data: unknown;
  theme?: "dark" | "light";
  selectedHourDetails: HourlyData | null;
  getProbabilityCategory: (p: number, theme: "dark" | "light") => { hex: string; [key: string]: unknown };
  isEditMode?: boolean;
  isPinningLocation?: boolean;
  pinnedPosition?: [number, number] | null;
  onMapClick?: (latlng: [number, number]) => void;
  defaultStyle?: "theme" | "satellite";
  shelterPins?: ShelterPin[];
  onPinClick?: (pin: ShelterPin) => void;
  selectedShelterPin?: ShelterPin | null;
  routeStart?: [number, number] | null;
  currentLocation?: [number, number] | null;
  onRouteFound?: (route: ShelterRouteCandidate | null) => void;
  onRouteSummaryChange?: (summary: { distanceKm: number; durationMinutes: number } | null) => void;
  onRouteErrorChange?: (message: string | null) => void;
  onLocationPinChange?: (location: [number, number]) => void;
  onRemovePin?: () => void;
}

export default function FloodMap({
  data,
  theme,
  selectedHourDetails,
  getProbabilityCategory,
  isEditMode,
  isPinningLocation = false,
  pinnedPosition,
  onMapClick,
  defaultStyle = "theme",
  shelterPins = [],
  onPinClick,
  selectedShelterPin,
  routeStart,
  currentLocation,
  onRouteFound,
  onRouteSummaryChange,
  onRouteErrorChange,
  onLocationPinChange,
  onRemovePin,
}: FloodMapProps) {
  const [mapStyle, setMapStyle] = useState<"theme" | "satellite">(defaultStyle);
  const [layerVisibility, setLayerVisibility] = useState<GisLayerVisibility>(() => ({
    ...GIS_DEFAULT_VISIBILITY,
    satellite: defaultStyle === "satellite",
  }));
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [appliedTheme, setAppliedTheme] = useState<"dark" | "light">(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light"
  );
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [gisLoadStatus, setGisLoadStatus] = useState<string>("Loading local GIS layers...");

  // Layer references for dynamic updates and visibility toggles
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const floodRiskLayerRef = useRef<L.GeoJSON | null>(null);
  const buildingsLayerRef = useRef<L.GeoJSON | null>(null);
  const roadsLayerRef = useRef<L.GeoJSON | null>(null);
  const riversLayerRef = useRef<L.GeoJSON | null>(null);
  const satelliteTileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const shelterMarkersRef = useRef<L.Marker[]>([]);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const routeMarkerRef = useRef<L.Marker | null>(null);
  const rawBoundaryDataRef = useRef<unknown>(null);

  const routeCallbacks = useMemo(
    () => ({
      onRouteFound,
      onRouteSummaryChange,
      onRouteErrorChange,
    }),
    [onRouteFound, onRouteSummaryChange, onRouteErrorChange]
  );

  // Toggle single layer visibility
  const toggleLayer = useCallback((layerKey: keyof GisLayerVisibility) => {
    setLayerVisibility((prev) => {
      const next = { ...prev, [layerKey]: !prev[layerKey] };
      if (layerKey === "satellite") {
        setMapStyle(next.satellite ? "satellite" : "theme");
      }
      return next;
    });
  }, []);

  // Sync mapStyle with satellite layer visibility
  const handleStyleChange = useCallback((style: "theme" | "satellite") => {
    setMapStyle(style);
    setLayerVisibility((prev) => ({
      ...prev,
      satellite: style === "satellite",
    }));
  }, []);

  // Initialize Map without external basemap tile APIs
  useEffect(() => {
    if (!data) return;

    // Container initialization
    const map = L.map("flows-leaflet-map", {
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: true,
      scrollWheelZoom: true,
      minZoom: 14,
      maxZoom: 20,
      maxBounds: VKS_MAX_BOUNDS,
      maxBoundsViscosity: 0.9,
      worldCopyJump: false,
    }).setView(VKS_CENTER, 16);

    // Custom attribution indicating local QGIS datasets
    L.control
      .attribution({
        prefix: '<span class="font-mono text-[9px] text-slate-400">FloodVisor GIS • Villa Karangahan</span>',
      })
      .addTo(map);

    setMapInstance(map);

    // Load local QGIS GeoJSON files asynchronously
    let isCancelled = false;

    async function loadGisDatasets() {
      try {
        setGisLoadStatus("Loading Barangay boundary...");
        const [boundaryRes, buildingsRes, roadsRes, riversRes] = await Promise.all([
          fetch(GIS_DATA_PATHS.boundary).then((r) => (r.ok ? r.json() : null)),
          fetch(GIS_DATA_PATHS.buildings).then((r) => (r.ok ? r.json() : null)),
          fetch(GIS_DATA_PATHS.roads).then((r) => (r.ok ? r.json() : null)),
          fetch(GIS_DATA_PATHS.rivers).then((r) => (r.ok ? r.json() : null)),
        ]);

        if (isCancelled) return;

        // 1. Waterways / Rivers Layer (Bottom vector layer)
        if (isValidFeatureCollection(riversRes)) {
          const riversLayer = L.geoJSON(riversRes, {
            style: () => ({
              color: GIS_STYLES.rivers.color,
              weight: GIS_STYLES.rivers.weight,
              opacity: GIS_STYLES.rivers.opacity,
            }),
            onEachFeature: (feature, layer) => {
              if (feature.properties) {
                layer.bindPopup(formatWaterwayPopup(feature.properties), {
                  className: "gis-custom-popup",
                });
              }
            },
          }).addTo(map);
          riversLayerRef.current = riversLayer;
        }

        // 2. Road Network Layer
        if (isValidFeatureCollection(roadsRes)) {
          const roadsLayer = L.geoJSON(roadsRes, {
            style: (feature) => {
              const hway = feature?.properties?.highway;
              // MODIFIED: The model lacks georeferenced depth and road elevations, so no road can be labeled safe; render passability as unknown.
              const roadStyle = hway === "tertiary"
                ? GIS_STYLES.roads.tertiary
                : hway === "footway" || hway === "service"
                  ? GIS_STYLES.roads.footway
                  : GIS_STYLES.roads.residential;
              return {
                color: "#9ca3af",
                weight: roadStyle.weight,
                opacity: roadStyle.opacity,
                dashArray: (roadStyle as any).dashArray,
              };
            },
            onEachFeature: (feature, layer) => {
              if (feature.properties) {
                const roadName = feature.properties.name;
                if (roadName) {
                  const label = document.createElement("span");
                  label.className = "gis-road-label-text";
                  label.textContent = roadName;
                  layer.bindTooltip(label, {
                    permanent: true,
                    direction: "center",
                    interactive: false,
                    opacity: 1,
                    className: "gis-road-tooltip",
                  });
                }
                layer.bindPopup(formatRoadPopup(feature.properties), {
                  className: "gis-custom-popup",
                });
              }
            },
          }).addTo(map);
          roadsLayerRef.current = roadsLayer;
        }

        // 3. Buildings Footprints Layer
        if (isValidFeatureCollection(buildingsRes)) {
          const isDark = (theme ?? appliedTheme) === "dark";
          const bs = isDark ? GIS_STYLES.building.dark : GIS_STYLES.building;
          const buildingsLayer = L.geoJSON(buildingsRes, {
            style: () => ({
              color: bs.strokeColor,
              weight: bs.strokeWeight,
              fillColor: bs.fillColor,
              fillOpacity: bs.fillOpacity,
            }),
            onEachFeature: (feature, layer) => {
              if (feature.properties) {
                layer.bindPopup(formatBuildingPopup(feature.properties), {
                  className: "gis-custom-popup",
                });
                layer.on({
                  mouseover: (e) => {
                    const l = e.target;
                    l.setStyle({
                      color: GIS_STYLES.building.hover.strokeColor,
                      weight: GIS_STYLES.building.hover.strokeWeight,
                      fillColor: GIS_STYLES.building.hover.fillColor,
                      fillOpacity: GIS_STYLES.building.hover.fillOpacity,
                    });
                    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                      l.bringToFront();
                    }
                  },
                  mouseout: (e) => {
                    buildingsLayer.resetStyle(e.target);
                  },
                });
              }
            },
          }).addTo(map);
          buildingsLayerRef.current = buildingsLayer;
        }

        // 4. Barangay Boundary & Dynamic Flood Risk Overlay
        if (isValidFeatureCollection(boundaryRes)) {
          rawBoundaryDataRef.current = boundaryRes;

          const t = theme ?? appliedTheme;
          const category = getProbabilityCategory(selectedHourDetails?.probability || 0, t);

          // Dedicated flood risk fill layer
          const floodLayer = L.geoJSON(boundaryRes, {
            interactive: false,
            style: () => ({
              color: category.hex,
              fillColor: category.hex,
              fillOpacity: t === "dark" ? 0.22 : 0.16,
              weight: 0,
              opacity: 0,
            }),
          }).addTo(map);
          floodRiskLayerRef.current = floodLayer;

          // Crisp outline boundary layer
          const boundaryLayer = L.geoJSON(boundaryRes, {
            style: () => ({
              color: GIS_STYLES.boundary.color,
              weight: GIS_STYLES.boundary.weight,
              opacity: GIS_STYLES.boundary.opacity,
              dashArray: GIS_STYLES.boundary.dashArray,
              fill: false,
            }),
          }).addTo(map);
          boundaryLayerRef.current = boundaryLayer;

          // Automatically fit the map to the official barangay boundary
          const bounds = boundaryLayer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [16, 16], maxZoom: 17 });
          }
        }

        setMapReady(true);
      } catch (err) {
        console.error("Error loading QGIS GeoJSON layers:", err);
        setMapReady(true);
      }
    }

    void loadGisDatasets();

    return () => {
      isCancelled = true;
      map.remove();
      setMapInstance(null);
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Handle Local Satellite Raster Layer Toggle (QGIS exported tiles)
  useEffect(() => {
    if (!mapInstance) return;

    if (satelliteTileLayerRef.current) {
      try {
        satelliteTileLayerRef.current.remove();
      } catch {}
      satelliteTileLayerRef.current = null;
    }

    if (layerVisibility.satellite) {
      try {
        const localSatelliteLayer = L.tileLayer(GIS_DATA_PATHS.satelliteTiles, {
          minZoom: 14,
          maxZoom: 20,
          bounds: VKS_MAX_BOUNDS,
          attribution: "Local Georeferenced Imagery (QGIS)",
          errorTileUrl: "", // Silently hide missing tile slots without external fallback requests
        }).addTo(mapInstance);

        // Send satellite layer to bottom so GeoJSON features remain clearly visible on top
        localSatelliteLayer.bringToBack();
        satelliteTileLayerRef.current = localSatelliteLayer;
      } catch (err) {
        console.warn("Could not mount local satellite tile layer:", err);
      }
    }
  }, [layerVisibility.satellite, mapInstance]);

  // Sync Layer Visibility with Leaflet instances
  useEffect(() => {
    if (!mapInstance) return;

    // Boundary
    if (boundaryLayerRef.current) {
      if (layerVisibility.boundary && !mapInstance.hasLayer(boundaryLayerRef.current)) {
        boundaryLayerRef.current.addTo(mapInstance);
      } else if (!layerVisibility.boundary && mapInstance.hasLayer(boundaryLayerRef.current)) {
        mapInstance.removeLayer(boundaryLayerRef.current);
      }
    }

    // Flood Risk Overlay
    if (floodRiskLayerRef.current) {
      if (layerVisibility.floodRisk && !mapInstance.hasLayer(floodRiskLayerRef.current)) {
        floodRiskLayerRef.current.addTo(mapInstance);
      } else if (!layerVisibility.floodRisk && mapInstance.hasLayer(floodRiskLayerRef.current)) {
        mapInstance.removeLayer(floodRiskLayerRef.current);
      }
    }

    // Buildings
    if (buildingsLayerRef.current) {
      if (layerVisibility.buildings && !mapInstance.hasLayer(buildingsLayerRef.current)) {
        buildingsLayerRef.current.addTo(mapInstance);
      } else if (!layerVisibility.buildings && mapInstance.hasLayer(buildingsLayerRef.current)) {
        mapInstance.removeLayer(buildingsLayerRef.current);
      }
    }

    // Roads
    if (roadsLayerRef.current) {
      if (layerVisibility.roads && !mapInstance.hasLayer(roadsLayerRef.current)) {
        roadsLayerRef.current.addTo(mapInstance);
      } else if (!layerVisibility.roads && mapInstance.hasLayer(roadsLayerRef.current)) {
        mapInstance.removeLayer(roadsLayerRef.current);
      }
    }

    // Rivers / Waterways
    if (riversLayerRef.current) {
      if (layerVisibility.rivers && !mapInstance.hasLayer(riversLayerRef.current)) {
        riversLayerRef.current.addTo(mapInstance);
      } else if (!layerVisibility.rivers && mapInstance.hasLayer(riversLayerRef.current)) {
        mapInstance.removeLayer(riversLayerRef.current);
      }
    }
  }, [layerVisibility, mapInstance]);

  // Position only street labels; Leaflet continues to own the road geometry.
  useEffect(() => {
    if (!mapInstance || !mapReady) return;
    let frame = 0;
    const layoutLabels = () => {
      const roads = roadsLayerRef.current;
      if (!roads || !mapInstance.hasLayer(roads)) return;
      const container = mapInstance.getContainer();
      const viewport = container.getBoundingClientRect();
      const occupied = Array.from(container.querySelectorAll<HTMLElement>(
        ".leaflet-marker-icon, .leaflet-popup"
      )).map((element) => element.getBoundingClientRect());
      const candidates: { tooltip: L.Tooltip; text: HTMLElement; length: number; point: L.Point; angle: number }[] = [];
      roads.eachLayer((layer) => {
        const tooltip = layer.getTooltip();
        const element = tooltip?.getElement();
        const text = element?.querySelector<HTMLElement>(".gis-road-label-text");
        if (!tooltip || !element || !text) return;
        element.style.visibility = "hidden";
        const geometry = (layer as L.Layer & { feature?: Feature<LineString | MultiLineString> }).feature?.geometry;
        if (!geometry || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) return;
        const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
        // Use the longest part of a multipart street, centered by distance along it.
        const projected = lines.map((line) => {
          const points = line.map(([lng, lat]) => mapInstance.latLngToContainerPoint([lat, lng]));
          const lengths = points.slice(1).map((point, i) => point.distanceTo(points[i]));
          return { points, lengths, length: lengths.reduce((sum, length) => sum + length, 0) };
        }).sort((a, b) => b.length - a.length);
        const line = projected[0];
        if (!line || line.length < text.offsetWidth + 12) return;
        let remaining = line.length / 2;
        for (let i = 0; i < line.lengths.length; i++) {
          const length = line.lengths[i];
          if (remaining > length) { remaining -= length; continue; }
          if (!length) continue;
          const start = line.points[i];
          const delta = line.points[i + 1].subtract(start);
          const point = start.add(delta.multiplyBy(remaining / length));
          let angle = Math.atan2(delta.y, delta.x) * 180 / Math.PI;
          if (angle > 90) angle -= 180;
          if (angle < -90) angle += 180;
          // Avoid placing straight text across a bend longer than its local segment.
          if (length < text.offsetWidth + 8) return;
          candidates.push({ tooltip, text, length: line.length, point, angle });
          break;
        }
      });
      const names = new Set<string>();
      candidates.sort((a, b) => b.length - a.length).forEach(({ tooltip, text, point, angle }) => {
        if (names.has(text.textContent || "")) return;
        tooltip.setLatLng(mapInstance.containerPointToLatLng(point));
        text.style.transform = `rotate(${angle}deg)`;
        const rect = text.getBoundingClientRect();
        const padding = 5;
        if (rect.left < viewport.left || rect.right > viewport.right || rect.top < viewport.top || rect.bottom > viewport.bottom) return;
        if (occupied.some((other) => rect.left < other.right + padding && rect.right > other.left - padding && rect.top < other.bottom + padding && rect.bottom > other.top - padding)) return;
        tooltip.getElement()!.style.visibility = "visible";
        occupied.push(rect);
        names.add(text.textContent || "");
      });
    };
    const scheduleLayout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layoutLabels);
    };
    mapInstance.on("move zoom resize layeradd layerremove", scheduleLayout);
    scheduleLayout();
    return () => {
      cancelAnimationFrame(frame);
      mapInstance.off("move zoom resize layeradd layerremove", scheduleLayout);
    };
  }, [mapInstance, mapReady, layerVisibility.roads]);

  // Update dynamic flood risk color overlay when prediction hour or theme changes
  useEffect(() => {
    if (!selectedHourDetails || !floodRiskLayerRef.current) return;
    const t = theme ?? appliedTheme;
    const category = getProbabilityCategory(selectedHourDetails.probability, t);

    // Compute opacity based on risk level
    const pct = (selectedHourDetails.probability || 0) * 100;
    const fillOpacity = pct < 1.0 ? 0.12 : pct < 10.0 ? 0.22 : pct < 35.0 ? 0.32 : 0.44;

    floodRiskLayerRef.current.setStyle({
      color: category.hex,
      fillColor: category.hex,
      fillOpacity,
      weight: 0,
      opacity: 0,
    });
  }, [selectedHourDetails, theme, appliedTheme, getProbabilityCategory]);

  // Re-apply building stroke/fill styles when the theme switches so outlines
  // remain visible on both the dark charcoal basemap and the lighter satellite view.
  useEffect(() => {
    if (!buildingsLayerRef.current) return;
    const isDark = (theme ?? appliedTheme) === "dark";
    const bs = isDark ? GIS_STYLES.building.dark : GIS_STYLES.building;
    buildingsLayerRef.current.setStyle({
      color: bs.strokeColor,
      weight: bs.strokeWeight,
      fillColor: bs.fillColor,
      fillOpacity: bs.fillOpacity,
    });
  }, [theme, appliedTheme]);

  // Handle Edit Mode zoom & fitBounds transitions
  useEffect(() => {
    if (!mapInstance) return;

    mapInstance.invalidateSize();

    const bounds = boundaryLayerRef.current?.getBounds();

    if (isEditMode) {
      const center = bounds?.isValid() ? bounds.getCenter() : L.latLng(VKS_CENTER[0], VKS_CENTER[1]);
      mapInstance.flyTo(center, 18, {
        animate: true,
        duration: 0.8,
      });
    } else if (bounds?.isValid()) {
      mapInstance.flyToBounds(bounds, {
        padding: [16, 16],
        animate: true,
        duration: 0.8,
      });
    }
  }, [isEditMode, mapInstance]);

  // During location selection, building clicks place the pin at the exact
  // clicked coordinate instead of opening the building information popup.
  useEffect(() => {
    if (!mapReady || !isPinningLocation || !onMapClick || !buildingsLayerRef.current) return;
    mapInstance?.closePopup();
    const cleanups: (() => void)[] = [];
    buildingsLayerRef.current.eachLayer((building) => {
      const popup = building.getPopup();
      building.unbindPopup();
      const pinBuilding = (event: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event);
        onMapClick([event.latlng.lat, event.latlng.lng]);
      };
      building.on("click", pinBuilding);
      cleanups.push(() => { building.off("click", pinBuilding); if (popup) building.bindPopup(popup); });
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [mapReady, mapInstance, isPinningLocation, onMapClick]);

  // Map click handling for pinning
  useEffect(() => {
    if (!mapInstance || (!isEditMode && !isPinningLocation)) {
      if (mapInstance) {
        try {
          mapInstance.getContainer().style.cursor = "";
        } catch {}
      }
      return;
    }

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (onMapClick) {
        onMapClick([e.latlng.lat, e.latlng.lng]);
      }
    };

    mapInstance.getContainer().style.cursor = !pinnedPosition ? "crosshair" : "";
    mapInstance.on("click", handleMapClick);

    return () => {
      mapInstance.off("click", handleMapClick);
      try {
        mapInstance.getContainer().style.cursor = "";
      } catch {}
    };
  }, [mapInstance, isEditMode, isPinningLocation, onMapClick, pinnedPosition]);

  // Render Pinned User Location Marker using self-contained SVG icon
  useEffect(() => {
    if (!mapInstance) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    const nextPosition = pinnedPosition ?? currentLocation;
    if (!nextPosition) return;

    const userPinIcon = L.divIcon({
      html: GIS_SVG_ICONS.userPin,
      className: "gis-user-pin",
      iconSize: [28, 37],
      iconAnchor: [14, 37],
      popupAnchor: [0, -34],
    });

    const marker = L.marker(nextPosition, {
      icon: userPinIcon,
      draggable: true,
      zIndexOffset: 1000,
    }).addTo(mapInstance);

    marker.bindPopup(
      `<div class="gis-custom-popup" style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #f1f5f9;">
        <div style="font-weight: 700; color: #06b6d4; margin-bottom: 4px;">📍 Selected Location</div>
        <div>Lat: ${nextPosition[0].toFixed(5)}</div>
        <div>Lng: ${nextPosition[1].toFixed(5)}</div>
        <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">Drag to adjust evacuation starting point</div>
      </div>`
    );

    marker.on("dragend", () => {
      const updatedLocation: [number, number] = [marker.getLatLng().lat, marker.getLatLng().lng];
      if (onLocationPinChange) {
        onLocationPinChange(updatedLocation);
      }
    });

    markerRef.current = marker;
    mapInstance.flyTo(nextPosition, 17, { animate: true, duration: 0.8 });
  }, [pinnedPosition, currentLocation, mapInstance, onLocationPinChange]);

  // Render Evacuation Shelter Pins with self-contained SVG markers
  useEffect(() => {
    if (!mapInstance || !shelterPins.length) return;

    shelterMarkersRef.current.forEach((m) => m.remove());
    shelterMarkersRef.current = [];

    if (!layerVisibility.shelters) return;

    shelterPins.forEach((pin) => {
      try {
        const shelter = pin.shelter;
        const maxCap = shelter?.max_capacity ?? 0;
        const currCap = shelter?.curr_capacity ?? 0;
        const status = getShelterCapacityStatus(currCap, maxCap);
        const statusColors = SHELTER_STATUS_COLORS[status];

        const isActive = selectedShelterPin && selectedShelterPin.shelter_id === pin.shelter_id;

        const pinIcon = L.divIcon({
          html: isActive ? buildActiveShelterIcon(status) : buildShelterIcon(status),
          className: isActive ? "gis-shelter-pin-active" : "gis-shelter-pin",
          iconSize: isActive ? [32, 42] : [28, 37],
          iconAnchor: isActive ? [16, 42] : [14, 37],
          popupAnchor: [0, isActive ? -38 : -34],
        });

        const marker = L.marker([pin.latitude, pin.longitude], {
          icon: pinIcon,
          zIndexOffset: isActive ? 900 : 500,
        }).addTo(mapInstance);

        const name = shelter?.shelter_name || "Designated Evacuation Shelter";
        const available = Math.max(0, maxCap - currCap);
        const contact = shelter?.shelter_head?.contact_num || "N/A";
        const contactPerson = shelter?.shelter_head
          ? `${shelter.shelter_head.fname} ${shelter.shelter_head.lname}`
          : "Barangay Disaster Officer";

        const statusDotColor = status === 'full' ? '#ef4444' : status === 'almost' ? '#f97316' : '#22c55e';

        const popupHtml = `
          <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.4; color: #f1f5f9; min-width: 200px;">
            <div style="font-weight: 700; color: #f43f5e; font-size: 12px; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px;">
              🏥 ${name}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="color: #94a3b8;">Status:</span>
              <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 700; color: ${statusDotColor};">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${statusDotColor};"></span>
                ${statusColors.label}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span style="color: #94a3b8;">Capacity:</span>
              <span>${currCap} / ${maxCap} (${available} free)</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span style="color: #94a3b8;">Contact:</span>
              <span>${contact}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span style="color: #94a3b8;">Head:</span>
              <span>${contactPerson}</span>
            </div>
            <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #1e293b; font-size: 9px; color: #64748b;">
              Villa Karangahan Evac Network
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml, { className: "gis-custom-popup" });

        if (onPinClick) {
          marker.on("click", () => onPinClick(pin));
        }
        shelterMarkersRef.current.push(marker);
      } catch (err) {
        console.warn("Error mounting shelter pin:", err);
      }
    });

    return () => {
      shelterMarkersRef.current.forEach((m) => m.remove());
      shelterMarkersRef.current = [];
    };
  }, [shelterPins, mapInstance, onPinClick, selectedShelterPin, layerVisibility.shelters]);

  // MODIFIED: Build connectivity once from the same street geometry rendered on the map.
  const roadNetwork = useMemo(() => mapReady && roadsLayerRef.current
    ? buildRoadNetwork(roadsLayerRef.current.toGeoJSON() as GeoJSON.FeatureCollection)
    : null, [mapReady]);

  // MODIFIED: Draw street-constrained A* guidance while flood safety remains unverified.
  useEffect(() => {
    const clearRoute = () => {
      routeLineRef.current?.remove();
      routeLineRef.current = null;
      routeMarkerRef.current?.remove();
      routeMarkerRef.current = null;
    };
    clearRoute();
    if (!mapInstance || !routeStart) {
      routeCallbacks.onRouteFound?.(null);
      routeCallbacks.onRouteSummaryChange?.(null);
      routeCallbacks.onRouteErrorChange?.(null);
      return;
    }

    // MODIFIED: Restore selection by calculated A* distance and existing capacity rules; missing flood data does not hide general route guidance.
    const route = roadNetwork ? findNearestAvailableShelter(routeStart, shelterPins, [], roadNetwork) : null;
    routeCallbacks.onRouteFound?.(route);
    if (!route) {
      routeCallbacks.onRouteSummaryChange?.(null);
      routeCallbacks.onRouteErrorChange?.(roadNetwork
        ? "No connected street route to an evacuation center with available capacity was found."
        : "Loading street geometry for routing...");
      return;
    }

    const notice = "Route follows streets between the nearest road access points. Access from buildings and flood safety are unverified.";
    routeCallbacks.onRouteErrorChange?.(notice);
    routeCallbacks.onRouteSummaryChange?.({
      distanceKm: route.distanceKm,
      durationMinutes: Math.max(1, Math.round(route.distanceKm * 14)),
    });
    routeLineRef.current = L.polyline(route.path, {
      color: "#f59e0b", weight: 4, opacity: 0.95,
      lineCap: "round", lineJoin: "round", dashArray: "8, 4",
    }).addTo(mapInstance);
    const destinationIcon = L.divIcon({
      html: GIS_SVG_ICONS.routeDestination,
      className: "gis-dest-pin", iconSize: [28, 37], iconAnchor: [14, 37],
      popupAnchor: [0, -34],
    });
    const popup = document.createElement("div");
    popup.textContent = route.shelterName + " · " + route.distanceKm.toFixed(2) + " km · Flood safety unverified";
    routeMarkerRef.current = L.marker(route.goal, { icon: destinationIcon })
      .addTo(mapInstance).bindPopup(popup, { className: "gis-custom-popup" });
    return clearRoute;
  }, [routeStart, shelterPins, mapInstance, routeCallbacks, roadNetwork]);

  // Observe theme changes
  useEffect(() => {
    if (typeof document === "undefined" || theme) return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setAppliedTheme(el.classList.contains("dark") ? "dark" : "light");
    });
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [theme]);

  // Fit view to barangay boundary
  const handleResetPosition = useCallback(() => {
    if (!mapInstance) return;
    const bounds = boundaryLayerRef.current?.getBounds();
    if (bounds?.isValid()) {
      mapInstance.flyToBounds(bounds, {
        padding: [16, 16],
        animate: true,
        duration: 0.9,
      });
    } else {
      mapInstance.flyTo(VKS_CENTER, 16, { animate: true, duration: 0.9 });
    }
  }, [mapInstance]);

  return (
    <>
      {/* Map Container with Dark GIS Basemap Styling */}
      <div
        id="flows-leaflet-map"
        className="w-full h-full z-10 relative"
        style={{
          backgroundColor: GIS_STYLES.mapBackground,
          backgroundImage:
            "radial-gradient(rgba(56, 189, 248, 0.04) 1px, transparent 1px), radial-gradient(rgba(148, 163, 184, 0.02) 1px, transparent 1px)",
          backgroundSize: "32px 32px, 16px 16px",
          backgroundPosition: "0 0, 8px 8px",
        }}
      />

      {/* Map loading overlay — fades out once QGIS datasets are mounted */}
      <div
        className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 pointer-events-none"
        style={{
          background: "var(--bg-base, #111827)",
          opacity: mapReady ? 0 : 1,
          transition: "opacity 0.5s ease",
        }}
      >
        <div className="relative w-full h-full overflow-hidden flex flex-col items-center justify-center">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(6, 182, 212, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.08) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="relative z-10 flex flex-col items-center justify-center gap-3 bg-slate-900/80 p-6 rounded-lg border border-slate-700/60 backdrop-blur-sm shadow-2xl">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
            </div>
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-cyan-400">
              GIS Cartographic Engine
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
              {gisLoadStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Custom GIS Map Menubar (Bottom Center on Mobile, Top Right on Desktop) */}
      <div className="absolute bottom-4 md:bottom-auto md:top-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 z-20 flex items-center gap-1.5 md:gap-2 border border-border-surface bg-bg-mantle px-2 py-1 md:px-3 md:py-2 rounded-[4px] shadow-2xl font-mono text-[8px] md:text-[9px] text-text-text max-w-[95vw] md:max-w-none backdrop-blur-md">
        {/* Zoom & Reset Buttons */}
        <div className="flex items-center gap-1 border-r border-border-surface pr-1.5 md:pr-2.5">
          <button
            title="Zoom In"
            type="button"
            onClick={() => mapInstance?.zoomIn()}
            className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center bg-bg-crust border border-border-surface hover:bg-border-surface hover:text-cyan-400 rounded-[4px] cursor-pointer transition-colors font-bold text-xs select-none"
          >
            ＋
          </button>
          <button
            title="Zoom Out"
            type="button"
            onClick={() => mapInstance?.zoomOut()}
            className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center bg-bg-crust border border-border-surface hover:bg-border-surface hover:text-cyan-400 rounded-[4px] cursor-pointer transition-colors font-bold text-xs select-none"
          >
            －
          </button>
          <button
            title="Fit to Barangay Boundary"
            type="button"
            onClick={handleResetPosition}
            className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center bg-bg-crust border border-border-surface hover:bg-border-surface hover:text-cyan-400 text-text-text rounded-[4px] cursor-pointer transition-colors"
          >
            <svg className="w-3 h-3 md:w-3.5 md:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m14 0a5 5 0 11-10 0 5 5 0 0110 0z" />
            </svg>
          </button>
        </div>

        {/* GIS Style Selector (Local GIS Vector Basemap vs Local Satellite) */}
        <div className="flex items-center gap-1 pl-0.5 border-r border-border-surface pr-1.5 md:pr-2.5">
          <span className="text-text-subtext font-bold text-[7px] md:text-[8px] uppercase tracking-wider mr-0.5">
            GIS:
          </span>
          <button
            type="button"
            onClick={() => handleStyleChange("theme")}
            className={`px-1.5 py-0.5 md:px-2 md:py-1 text-[7px] md:text-[8px] font-bold uppercase rounded-[2px] cursor-pointer border transition-all ${
              mapStyle === "theme"
                ? "bg-cyan-600 border-cyan-500 text-white shadow-sm"
                : "bg-bg-crust border-border-surface hover:bg-border-surface hover:text-cyan-400 text-text-text"
            }`}
          >
            Vector
          </button>
          <button
            type="button"
            onClick={() => handleStyleChange("satellite")}
            title="Local Georeferenced Satellite Tiles (QGIS)"
            className={`px-1.5 py-0.5 md:px-2 md:py-1 text-[7px] md:text-[8px] font-bold uppercase rounded-[2px] cursor-pointer border transition-all ${
              mapStyle === "satellite"
                ? "bg-cyan-600 border-cyan-500 text-white shadow-sm"
                : "bg-bg-crust border-border-surface hover:bg-border-surface hover:text-cyan-400 text-text-text"
            }`}
          >
            Satellite
          </button>
        </div>

        {/* GIS Layers Toggle Dropdown Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLayerPanel((v) => !v)}
            className={`px-1.5 py-0.5 md:px-2 md:py-1 text-[7px] md:text-[8px] font-bold uppercase rounded-[2px] cursor-pointer border transition-all flex items-center gap-1 ${
              showLayerPanel
                ? "bg-border-surface text-cyan-400 border-cyan-500"
                : "bg-bg-crust border-border-surface hover:bg-border-surface text-text-text"
            }`}
          >
            <svg className="w-2.5 h-2.5 md:w-3 md:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            Layers
          </button>

          {/* Layer Visibility Menu */}
          {showLayerPanel && (
            <div className="absolute right-0 top-full mt-1.5 bg-bg-mantle border border-border-surface rounded-[4px] p-2 shadow-2xl flex flex-col gap-1.5 min-w-[130px] z-50">
              <span className="text-[7.5px] uppercase tracking-wider text-text-subtext font-bold border-b border-border-surface pb-1">
                QGIS Layers
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-cyan-400 transition-colors">
                <input
                  type="checkbox"
                  checked={layerVisibility.boundary}
                  onChange={() => toggleLayer("boundary")}
                  className="rounded text-cyan-500 focus:ring-0 w-3 h-3 cursor-pointer"
                />
                <span className="text-[8px]">Boundary</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-cyan-400 transition-colors">
                <input
                  type="checkbox"
                  checked={layerVisibility.buildings}
                  onChange={() => toggleLayer("buildings")}
                  className="rounded text-cyan-500 focus:ring-0 w-3 h-3 cursor-pointer"
                />
                <span className="text-[8px]">Buildings</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-cyan-400 transition-colors">
                <input
                  type="checkbox"
                  checked={layerVisibility.roads}
                  onChange={() => toggleLayer("roads")}
                  className="rounded text-cyan-500 focus:ring-0 w-3 h-3 cursor-pointer"
                />
                <span className="text-[8px]">Road Network</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-cyan-400 transition-colors">
                <input
                  type="checkbox"
                  checked={layerVisibility.rivers}
                  onChange={() => toggleLayer("rivers")}
                  className="rounded text-cyan-500 focus:ring-0 w-3 h-3 cursor-pointer"
                />
                <span className="text-[8px]">Waterways</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-cyan-400 transition-colors">
                <input
                  type="checkbox"
                  checked={layerVisibility.floodRisk}
                  onChange={() => toggleLayer("floodRisk")}
                  className="rounded text-cyan-500 focus:ring-0 w-3 h-3 cursor-pointer"
                />
                <span className="text-[8px]">Flood Risk Overlay</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-cyan-400 transition-colors">
                <input
                  type="checkbox"
                  checked={layerVisibility.shelters}
                  onChange={() => toggleLayer("shelters")}
                  className="rounded text-cyan-500 focus:ring-0 w-3 h-3 cursor-pointer"
                />
                <span className="text-[8px]">Shelters</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Floating Risk Legend (Top Right on Mobile, Bottom Right on Desktop) */}
      <div className="absolute top-4 right-3 md:top-auto md:bottom-6 md:right-6 bg-bg-mantle border border-border-surface px-2.5 py-2 md:px-3 md:py-2 rounded-[4px] font-mono text-[8px] md:text-[9px] text-text-text flex flex-col items-stretch gap-1 md:gap-1.5 z-20 shadow-2xl min-w-[90px] md:min-w-[160px] backdrop-blur-md">
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

        {/* MODIFIED: Until flood depth and matching road elevations are available, every road remains explicitly unknown. */}
        <div className="border-t border-border-surface/60 mt-0.5 pt-1 flex items-center gap-1.5 md:gap-2">
          <span className="w-2 h-1 md:w-2.5 md:h-1 rounded-sm bg-gray-400 shrink-0" />
          <span className="text-[7px] md:text-[8.5px] text-text-text">Road status unknown</span>
        </div>

        {/* Divider */}
        <div className="border-t border-border-surface/60 mt-0.5 pt-1 mb-0.5">
          <span className="text-text-subtext font-bold text-[7px] md:text-[8px] uppercase tracking-widest">
            Evacuation Centers
          </span>
        </div>
        <div className="flex flex-col gap-1 md:gap-1.5">
          {/* Available — green pin */}
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="shrink-0 flex items-end justify-center" style={{ width: 14, height: 18 }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="14" height="18">
                <path d="M16 1 C8 1 2 7.2 2 15 C2 24.5 16 41 16 41 C16 41 30 24.5 30 15 C30 7.2 24 1 16 1 Z" fill="#22c55e" stroke="#fff" strokeWidth="2"/>
                <circle cx="16" cy="15" r="7.5" fill="#fff"/>
                <path d="M16 10.5 L11 14.5 L12 14.5 L12 18.5 L14.5 18.5 L14.5 16 L17.5 16 L17.5 18.5 L20 18.5 L20 14.5 L21 14.5 Z" fill="#22c55e"/>
              </svg>
            </span>
            <span className="text-[7px] md:text-[8.5px] font-normal text-text-text">Available</span>
          </div>
          {/* Almost full — orange pin */}
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="shrink-0 flex items-end justify-center" style={{ width: 14, height: 18 }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="14" height="18">
                <path d="M16 1 C8 1 2 7.2 2 15 C2 24.5 16 41 16 41 C16 41 30 24.5 30 15 C30 7.2 24 1 16 1 Z" fill="#f97316" stroke="#fff" strokeWidth="2"/>
                <circle cx="16" cy="15" r="7.5" fill="#fff"/>
                <path d="M16 10.5 L11 14.5 L12 14.5 L12 18.5 L14.5 18.5 L14.5 16 L17.5 16 L17.5 18.5 L20 18.5 L20 14.5 L21 14.5 Z" fill="#f97316"/>
              </svg>
            </span>
            <span className="text-[7px] md:text-[8.5px] font-normal text-text-text">Almost Full</span>
          </div>
          {/* Full — red pin */}
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="shrink-0 flex items-end justify-center" style={{ width: 14, height: 18 }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="14" height="18">
                <path d="M16 1 C8 1 2 7.2 2 15 C2 24.5 16 41 16 41 C16 41 30 24.5 30 15 C30 7.2 24 1 16 1 Z" fill="#ef4444" stroke="#fff" strokeWidth="2"/>
                <circle cx="16" cy="15" r="7.5" fill="#fff"/>
                <path d="M16 10.5 L11 14.5 L12 14.5 L12 18.5 L14.5 18.5 L14.5 16 L17.5 16 L17.5 18.5 L20 18.5 L20 14.5 L21 14.5 Z" fill="#ef4444"/>
              </svg>
            </span>
            <span className="text-[7px] md:text-[8.5px] font-normal text-text-text">Full</span>
          </div>
        </div>
      </div>

      {/* Global Leaflet Styles & Popup Overrides for Local Dark GIS Mapping */}
      <style>{`
        /* Heartbeat pulse animation for active shelter pin */
        @keyframes heartbeat {
          0% { transform: scale(1) translate3d(0,0,0); }
          20% { transform: scale(1.18) translate3d(0,0,0); }
          40% { transform: scale(1) translate3d(0,0,0); }
          60% { transform: scale(1.18) translate3d(0,0,0); }
          80% { transform: scale(1) translate3d(0,0,0); }
          100% { transform: scale(1) translate3d(0,0,0); }
        }
        .active-pinpoint-heartbeat {
          animation: heartbeat 2.8s infinite ease-in-out;
          transform-origin: bottom center;
          will-change: transform;
        }
        .gis-shelter-pin-active {
          z-index: 1000 !important;
        }

        /* Dark modern styling for Leaflet Popups */
        .leaflet-popup-content-wrapper {
          background-color: #0f172a !important;
          color: #f1f5f9 !important;
          border: 1px solid #334155 !important;
          border-radius: 6px !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6) !important;
          padding: 2px !important;
        }
        .leaflet-popup-content {
          margin: 10px 12px !important;
          line-height: 1.4 !important;
        }
        .leaflet-popup-tip {
          background-color: #0f172a !important;
          border-left: 1px solid #334155 !important;
          border-top: 1px solid #334155 !important;
        }
        .leaflet-container a.leaflet-popup-close-button {
          color: #94a3b8 !important;
          padding: 4px 4px 0 0 !important;
        }
        .leaflet-container a.leaflet-popup-close-button:hover {
          color: #38bdf8 !important;
        }

        /* Road name tooltip */
        .gis-road-tooltip {
          pointer-events: none !important;
          visibility: hidden;
          background: transparent !important;
          color: #f1f5f9 !important;
          border: none !important;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
          font-size: 10px !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .gis-road-label-text {
          display: inline-block;
          white-space: nowrap;
          font-weight: 600;
          letter-spacing: 0.3px;
          line-height: 1.2;
          transform-origin: center;
          text-shadow: 0 1px 2px #0f172a, 0 -1px 2px #0f172a, 1px 0 2px #0f172a, -1px 0 2px #0f172a;
        }
        .gis-road-tooltip:before {
          display: none !important;
        }
      `}</style>
    </>
  );
}

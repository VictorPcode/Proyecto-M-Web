import React, { useEffect, useRef } from "react";

type Marker = { id: string; lngLat: [number, number]; color?: string; title?: string };

type Props = {
  accessToken?: string;
  center?: [number, number];
  zoom?: number;
  markers?: Marker[];
  route?: [number, number][];
  mapStyle?: string; // mapbox style URL to allow custom themes (e.g. uber-like dark navigation)
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

export default function MapPlaceholder({
  accessToken,
  center = [-74.5, 40],
  zoom = 9,
  markers = [],
  route,
  mapStyle,
  style,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapLoadedRef = useRef(false);
  const markersRef = useRef<any[]>([]);
  const [mapError, setMapError] = React.useState<string | null>(null);

  // Init map once
  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      try {
        const token = accessToken ?? (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "");
        console.log("Mapbox token available:", !!token, "Length:", token?.length);
        if (!token) {
          console.error("No Mapbox token provided!");
          setMapError("No Mapbox token configured");
          return;
        }
        if (mapRef.current) return;
        const mb = (await import("mapbox-gl")) as any;
        try { await import("mapbox-gl/dist/mapbox-gl.css"); } catch {}
        const mapboxgl = mb.default ?? mb;
        mapboxgl.accessToken = token;
        if (!containerRef.current) return;
        const centerNorm = Array.isArray(center) && center.length === 2 ? (center.slice(0, 2) as [number, number]) : ([-74.5, 40] as [number, number]);
        
        // Simple custom style using only free tier sources
        const basicStyle = {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#f0f0f0' }
            }
          ]
        };
        
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: mapStyle || basicStyle,
          center: centerNorm,
          zoom,
          dragPan: false,
          scrollZoom: false,
          boxZoom: false,
          dragRotate: false,
          keyboard: false,
          doubleClickZoom: false,
          touchZoomRotate: false,
          attributionControl: false,
          logoPosition: 'bottom-left' as any,
        });
        
        // Ocultar logo y controles de Mapbox con CSS
        const style = document.createElement('style');
        style.textContent = `
          .mapboxgl-ctrl-bottom-left,
          .mapboxgl-ctrl-bottom-right,
          .mapboxgl-ctrl-logo {
            display: none !important;
          }
        `;
        document.head.appendChild(style);
        mapRef.current = map;
        map.on("load", () => { mapLoadedRef.current = true; try { map.resize(); } catch {} });
        map.on("error", (e: any) => { const msg = e && e.error ? e.error.message || String(e.error) : String(e); console.warn("Mapbox error:", msg); setMapError(`Mapbox error: ${msg}`); });
        setMapError(null);
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error("Mapbox init error:", msg);
        setMapError(`Init error: ${msg}`);
      }
    })();
    return () => {
      try { mapRef.current?.remove(); } catch {}
      mapRef.current = null;
      mapLoadedRef.current = false;
      markersRef.current.forEach(m => { try { m.remove(); } catch {} });
      markersRef.current = [];
    };
  }, [accessToken, mapStyle]);

  // Update center/zoom
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const centerNorm = Array.isArray(center) && center.length === 2 ? (center.slice(0, 2) as [number, number]) : ([-74.5, 40] as [number, number]);
    try { map.setCenter(centerNorm); } catch {}
    try { map.setZoom(zoom); } catch {}
  }, [center, zoom]);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // remove previous
    markersRef.current.forEach(m => { try { m.remove(); } catch {} });
    markersRef.current = [];
    // add new
    (markers || []).forEach((m) => {
      if (!Array.isArray(m.lngLat) || m.lngLat.length !== 2) return;
      const el = document.createElement("div");
      el.style.background = m.color ?? "#0070f3";
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.border = "2px solid white";
      const marker = new (require("mapbox-gl").Marker)(el).setLngLat(m.lngLat as [number, number]).addTo(map);
      if (m.title) {
        const popup = new (require("mapbox-gl").Popup)({ offset: 25 }).setText(m.title);
        marker.setPopup(popup);
      }
      markersRef.current.push(marker);
    });
  }, [JSON.stringify(markers || [])]);

  // Update route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const coords = (route || []).filter((c) => Array.isArray(c) && c.length === 2) as [number, number][];
    const geojson = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } as any;
    try {
      // Remover capas anteriores si existen
      if (map.getLayer("route-outline")) map.removeLayer("route-outline");
      if (map.getLayer("route")) map.removeLayer("route");
      if (map.getSource("route")) map.removeSource("route");
      
      // Solo agregar si hay coordenadas
      if (coords.length > 1) {
        // Agregar source
        map.addSource("route", { type: "geojson", data: geojson });
        
        // Capa de borde (outline) más grueso
        map.addLayer({
          id: "route-outline",
          type: "line",
          source: "route",
          layout: {
            "line-join": "round",
            "line-cap": "round"
          },
          paint: {
            "line-color": "#1a73e8",
            "line-width": 8,
            "line-opacity": 0.4
          }
        });
        
        // Capa principal de la ruta
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: {
            "line-join": "round",
            "line-cap": "round"
          },
          paint: {
            "line-color": "#4285f4",
            "line-width": 5,
            "line-opacity": 0.9
          }
        });
        
        // Ajustar vista para mostrar toda la ruta
        const mb = require("mapbox-gl");
        const bounds = coords.reduce((b, c) => b.extend(c as [number, number]), new mb.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]));
        map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
      }
    } catch (err) {
      console.error("Error actualizando ruta:", err);
    }
  }, [JSON.stringify(route || [])]);

  const token = accessToken ?? (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "");
  if (!token) {
    return (
      <div style={{ width: "100%", height: 400, position: "relative", background: "#111", color: "#aaa", display: "flex", alignItems: "center", justifyContent: "center", ...style }} aria-label="Map placeholder">
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Mapbox no configurado</div>
          <div style={{ fontSize: 12 }}>Define NEXT_PUBLIC_MAPBOX_TOKEN para ver el mapa</div>
          {children}
        </div>
      </div>
    );
  }
  if (mapError) {
    return (
      <div style={{ width: "100%", height: 400, position: "relative", background: "#222", color: "#f88", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...style }} aria-label="Map error">
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Mapbox Error</div>
          <div style={{ fontSize: 12, wordBreak: "break-word" }}>{mapError}</div>
          <div style={{ fontSize: 11, marginTop: 8, color: "#aaa" }}>Revisa la consola. Verifica token: styles:read, tiles:read, fonts:read. Revisa Allowed URLs.</div>
        </div>
      </div>
    );
  }
  return (
    <div
      style={{ width: "100%", height: 400, position: "relative", background: "#000", overflow: "hidden", ...style }}
      aria-label="Map"
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 1 }} />
      {children ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 5,
            pointerEvents: "auto",
            maxWidth: "90%",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

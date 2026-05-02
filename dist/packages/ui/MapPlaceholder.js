"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MapPlaceholder;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
function MapPlaceholder({ accessToken, center = [-74.5, 40], zoom = 9, markers = [], route, mapStyle, style, children, }) {
    const containerRef = (0, react_1.useRef)(null);
    const mapRef = (0, react_1.useRef)(null);
    const mapLoadedRef = (0, react_1.useRef)(false);
    const markersRef = (0, react_1.useRef)([]);
    const [mapError, setMapError] = react_1.default.useState(null);
    // Init map once
    (0, react_1.useEffect)(() => {
        if (typeof window === "undefined")
            return;
        (async () => {
            try {
                const token = accessToken ?? (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "");
                console.log("Mapbox token available:", !!token, "Length:", token?.length);
                if (!token) {
                    console.error("No Mapbox token provided!");
                    setMapError("No Mapbox token configured");
                    return;
                }
                if (mapRef.current)
                    return;
                const mb = (await import("mapbox-gl"));
                try {
                    await import("mapbox-gl/dist/mapbox-gl.css");
                }
                catch { }
                const mapboxgl = mb.default ?? mb;
                mapboxgl.accessToken = token;
                if (!containerRef.current)
                    return;
                const centerNorm = Array.isArray(center) && center.length === 2 ? center.slice(0, 2) : [-74.5, 40];
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
                    logoPosition: 'bottom-left',
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
                map.on("load", () => { mapLoadedRef.current = true; try {
                    map.resize();
                }
                catch { } });
                map.on("error", (e) => { const msg = e && e.error ? e.error.message || String(e.error) : String(e); console.warn("Mapbox error:", msg); setMapError(`Mapbox error: ${msg}`); });
                setMapError(null);
            }
            catch (err) {
                const msg = err?.message || String(err);
                console.error("Mapbox init error:", msg);
                setMapError(`Init error: ${msg}`);
            }
        })();
        return () => {
            try {
                mapRef.current?.remove();
            }
            catch { }
            mapRef.current = null;
            mapLoadedRef.current = false;
            markersRef.current.forEach(m => { try {
                m.remove();
            }
            catch { } });
            markersRef.current = [];
        };
    }, [accessToken, mapStyle]);
    // Update center/zoom
    (0, react_1.useEffect)(() => {
        const map = mapRef.current;
        if (!map)
            return;
        const centerNorm = Array.isArray(center) && center.length === 2 ? center.slice(0, 2) : [-74.5, 40];
        try {
            map.setCenter(centerNorm);
        }
        catch { }
        try {
            map.setZoom(zoom);
        }
        catch { }
    }, [center, zoom]);
    // Update markers
    (0, react_1.useEffect)(() => {
        const map = mapRef.current;
        if (!map)
            return;
        // remove previous
        markersRef.current.forEach(m => { try {
            m.remove();
        }
        catch { } });
        markersRef.current = [];
        // add new
        (markers || []).forEach((m) => {
            if (!Array.isArray(m.lngLat) || m.lngLat.length !== 2)
                return;
            const el = document.createElement("div");
            el.style.background = m.color ?? "#0070f3";
            el.style.width = "14px";
            el.style.height = "14px";
            el.style.borderRadius = "50%";
            el.style.border = "2px solid white";
            const marker = new (require("mapbox-gl").Marker)(el).setLngLat(m.lngLat).addTo(map);
            if (m.title) {
                const popup = new (require("mapbox-gl").Popup)({ offset: 25 }).setText(m.title);
                marker.setPopup(popup);
            }
            markersRef.current.push(marker);
        });
    }, [JSON.stringify(markers || [])]);
    // Update route
    (0, react_1.useEffect)(() => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current)
            return;
        const coords = (route || []).filter((c) => Array.isArray(c) && c.length === 2);
        const geojson = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
        try {
            // Remover capas anteriores si existen
            if (map.getLayer("route-outline"))
                map.removeLayer("route-outline");
            if (map.getLayer("route"))
                map.removeLayer("route");
            if (map.getSource("route"))
                map.removeSource("route");
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
                const bounds = coords.reduce((b, c) => b.extend(c), new mb.LngLatBounds(coords[0], coords[0]));
                map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
            }
        }
        catch (err) {
            console.error("Error actualizando ruta:", err);
        }
    }, [JSON.stringify(route || [])]);
    const token = accessToken ?? (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "");
    if (!token) {
        return ((0, jsx_runtime_1.jsx)("div", { style: { width: "100%", height: 400, position: "relative", background: "#111", color: "#aaa", display: "flex", alignItems: "center", justifyContent: "center", ...style }, "aria-label": "Map placeholder", children: (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Mapbox no configurado" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12 }, children: "Define NEXT_PUBLIC_MAPBOX_TOKEN para ver el mapa" }), children] }) }));
    }
    if (mapError) {
        return ((0, jsx_runtime_1.jsx)("div", { style: { width: "100%", height: 400, position: "relative", background: "#222", color: "#f88", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...style }, "aria-label": "Map error", children: (0, jsx_runtime_1.jsxs)("div", { style: { textAlign: "center" }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Mapbox Error" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, wordBreak: "break-word" }, children: mapError }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11, marginTop: 8, color: "#aaa" }, children: "Revisa la consola. Verifica token: styles:read, tiles:read, fonts:read. Revisa Allowed URLs." })] }) }));
    }
    return ((0, jsx_runtime_1.jsxs)("div", { style: { width: "100%", height: 400, position: "relative", background: "#000", overflow: "hidden", ...style }, "aria-label": "Map", children: [(0, jsx_runtime_1.jsx)("div", { ref: containerRef, style: { position: "absolute", inset: 0, zIndex: 1 } }), children ? ((0, jsx_runtime_1.jsx)("div", { style: {
                    position: "absolute",
                    top: 12,
                    left: 12,
                    zIndex: 5,
                    pointerEvents: "auto",
                    maxWidth: "90%",
                }, children: children })) : null] }));
}

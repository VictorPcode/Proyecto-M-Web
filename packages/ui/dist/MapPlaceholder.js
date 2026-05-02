var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useRef } from "react";
export default function MapPlaceholder({ accessToken, center = [-74.5, 40], zoom = 9, markers = [], route, mapStyle, style, children, }) {
    var _a;
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const mapLoadedRef = useRef(false);
    const markersRef = useRef([]);
    const [mapError, setMapError] = React.useState(null);
    // Init map once
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        (() => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const token = accessToken !== null && accessToken !== void 0 ? accessToken : ((_a = process.env.NEXT_PUBLIC_MAPBOX_TOKEN) !== null && _a !== void 0 ? _a : "");
                if (!token || mapRef.current)
                    return;
                const mb = (yield import("mapbox-gl"));
                try {
                    yield import("mapbox-gl/dist/mapbox-gl.css");
                }
                catch (_c) { }
                const mapboxgl = (_b = mb.default) !== null && _b !== void 0 ? _b : mb;
                mapboxgl.accessToken = token;
                if (!containerRef.current)
                    return;
                const centerNorm = Array.isArray(center) && center.length === 2 ? center.slice(0, 2) : [-74.5, 40];
                const map = new mapboxgl.Map({
                    container: containerRef.current,
                    style: mapStyle || "mapbox://styles/mapbox/navigation-night-v1",
                    center: centerNorm,
                    zoom,
                });
                mapRef.current = map;
                map.on("load", () => { mapLoadedRef.current = true; try {
                    map.resize();
                }
                catch (_a) { } });
                map.on("error", (e) => { const msg = e && e.error ? e.error.message || String(e.error) : String(e); console.warn("Mapbox error:", msg); setMapError(`Mapbox error: ${msg}`); });
                setMapError(null);
            }
            catch (err) {
                const msg = (err === null || err === void 0 ? void 0 : err.message) || String(err);
                console.error("Mapbox init error:", msg);
                setMapError(`Init error: ${msg}`);
            }
        }))();
        return () => {
            var _a;
            try {
                (_a = mapRef.current) === null || _a === void 0 ? void 0 : _a.remove();
            }
            catch (_b) { }
            mapRef.current = null;
            mapLoadedRef.current = false;
            markersRef.current.forEach(m => { try {
                m.remove();
            }
            catch (_a) { } });
            markersRef.current = [];
        };
    }, [accessToken, mapStyle]);
    // Update center/zoom
    useEffect(() => {
        const map = mapRef.current;
        if (!map)
            return;
        const centerNorm = Array.isArray(center) && center.length === 2 ? center.slice(0, 2) : [-74.5, 40];
        try {
            map.setCenter(centerNorm);
        }
        catch (_a) { }
        try {
            map.setZoom(zoom);
        }
        catch (_b) { }
    }, [center, zoom]);
    // Update markers
    useEffect(() => {
        const map = mapRef.current;
        if (!map)
            return;
        // remove previous
        markersRef.current.forEach(m => { try {
            m.remove();
        }
        catch (_a) { } });
        markersRef.current = [];
        // add new
        (markers || []).forEach((m) => {
            var _a;
            if (!Array.isArray(m.lngLat) || m.lngLat.length !== 2)
                return;
            const el = document.createElement("div");
            el.style.background = (_a = m.color) !== null && _a !== void 0 ? _a : "#0070f3";
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
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current)
            return;
        const coords = (route || []).filter((c) => Array.isArray(c) && c.length === 2);
        const geojson = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
        try {
            if (map.getSource("route")) {
                map.getSource("route").setData(geojson);
            }
            else {
                map.addSource("route", { type: "geojson", data: geojson });
                map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ff7e5f", "line-width": 4 } });
            }
            if (coords.length > 0) {
                const mb = require("mapbox-gl");
                const bounds = coords.reduce((b, c) => b.extend(c), new mb.LngLatBounds(coords[0], coords[0]));
                map.fitBounds(bounds, { padding: 40 });
            }
        }
        catch (_a) { }
    }, [JSON.stringify(route || [])]);
    const token = accessToken !== null && accessToken !== void 0 ? accessToken : ((_a = process.env.NEXT_PUBLIC_MAPBOX_TOKEN) !== null && _a !== void 0 ? _a : "");
    if (!token) {
        return (_jsx("div", { style: Object.assign({ width: "100%", height: 400, position: "relative", background: "#111", color: "#aaa", display: "flex", alignItems: "center", justifyContent: "center" }, style), "aria-label": "Map placeholder", children: _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Mapbox no configurado" }), _jsx("div", { style: { fontSize: 12 }, children: "Define NEXT_PUBLIC_MAPBOX_TOKEN para ver el mapa" }), children] }) }));
    }
    if (mapError) {
        return (_jsx("div", { style: Object.assign({ width: "100%", height: 400, position: "relative", background: "#222", color: "#f88", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }, style), "aria-label": "Map error", children: _jsxs("div", { style: { textAlign: "center" }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: 8 }, children: "Mapbox Error" }), _jsx("div", { style: { fontSize: 12, wordBreak: "break-word" }, children: mapError }), _jsx("div", { style: { fontSize: 11, marginTop: 8, color: "#aaa" }, children: "Revisa la consola. Verifica token: styles:read, tiles:read, fonts:read. Revisa Allowed URLs." })] }) }));
    }
    return (_jsxs("div", { style: Object.assign({ width: "100%", height: 400, position: "relative", background: "#000", overflow: "hidden" }, style), "aria-label": "Map", children: [_jsx("div", { ref: containerRef, style: { position: "absolute", inset: 0, zIndex: 1 } }), children ? (_jsx("div", { style: {
                    position: "absolute",
                    top: 12,
                    left: 12,
                    zIndex: 5,
                    pointerEvents: "auto",
                    maxWidth: "90%",
                }, children: children })) : null] }));
}

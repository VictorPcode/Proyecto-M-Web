import React, { useEffect, useRef } from "react";
import type { LatLngExpression } from "leaflet";

type Marker = {
  id: string;
  lngLat: [number, number];
  color?: string;
  title?: string;
};

type Props = {
  center?: [number, number];
  zoom?: number;
  markers?: Marker[];
  route?: [number, number][];
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

export default function LeafletMap({
  center = [-57.6, -25.3],
  zoom = 13,
  markers = [],
  route,
  style,
  children,
}: Props) {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<any[]>([]);
  const routeLayerRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    if (typeof window === "undefined") return;
    if (mapRef.current || !containerRef.current) return;

    const checkAndInit = () => {
      if (!containerRef.current || !isMountedRef.current) return;

      const width = containerRef.current.offsetWidth;
      const height = containerRef.current.offsetHeight;

      if (width === 0 || height === 0) {
        setTimeout(checkAndInit, 100);
        return;
      }

      import("leaflet").then((L) => {
        if (!containerRef.current || !isMountedRef.current || mapRef.current) return;

        const leaflet = L.default || L;

        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link");
          link.id = "leaflet-css";
          link.rel = "stylesheet";
          link.href =
            "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }

        containerRef.current.innerHTML = "";
        (containerRef.current as any)._leaflet_id = undefined;

        const map = leaflet.map(containerRef.current!, {
          center: [center[1], center[0]],
          zoom,
        });

        leaflet
          .tileLayer(
            "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            {
              attribution: "",
              maxZoom: 19,
              subdomains: "abcd",
            }
          )
          .addTo(map);

        mapRef.current = map;
      });
    };

    checkAndInit();

    return () => {
      isMountedRef.current = false;

      if (mapRef.current) {
        try {
          mapRef.current.off();
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
      }

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      if (routeLayerRef.current) {
        try {
          routeLayerRef.current.remove();
        } catch {}
        routeLayerRef.current = null;
      }

      if (containerRef.current) {
        containerRef.current.innerHTML = "";
        (containerRef.current as any)._leaflet_id = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.setView([center[1], center[0]], zoom);
    }
  }, [center, zoom]);

  useEffect(() => {
    if (!mapRef.current) return;

    import("leaflet").then((L) => {
      const leaflet = L.default || L;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      markers.forEach((marker) => {
        const icon = leaflet.divIcon({
          className: "custom-marker",
          html: `<div style="position:relative;width:16px;height:16px;">
            <div style="
              position:absolute;top:50%;left:50%;
              transform:translate(-50%,-50%);
              width:16px;height:16px;
              background:${marker.color || "#3b82f6"};
              border-radius:50%;
            "></div>
          </div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const m = leaflet.marker(
          [marker.lngLat[1], marker.lngLat[0]],
          { icon }
        );

        if (marker.title) m.bindPopup(marker.title);

        m.addTo(mapRef.current);
        markersRef.current.push(m);
      });
    });
  }, [markers]);

  useEffect(() => {
    if (!mapRef.current || !route || route.length < 2) return;

    import("leaflet").then(async (L) => {
      const leaflet = L.default || L;

      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
        routeLayerRef.current = null;
      }

      const coords = route
        .map(([lng, lat]) => `${lng},${lat}`)
        .join(";");

      try {
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
        );

        const data = await res.json();

        if (!data.routes?.length) return;

        const geometry: [number, number][] =
          data.routes[0].geometry.coordinates;

        const latLngs: LatLngExpression[] = geometry.map(
          ([lng, lat]) => [lat, lng] as [number, number]
        );

        const polyline = leaflet
          .polyline(latLngs, {
            color: "#ffb700",
            weight: 5,
            opacity: 0.9,
          })
          .addTo(mapRef.current);

        routeLayerRef.current = polyline;

        mapRef.current.fitBounds(polyline.getBounds(), {
          padding: [50, 50],
        });
      } catch {
        const latLngs: LatLngExpression[] = route.map(
          ([lng, lat]) => [lat, lng]
        );

        const polyline = leaflet
          .polyline(latLngs, {
            color: "#ffb700",
            weight: 5,
            opacity: 0.9,
          })
          .addTo(mapRef.current);

        routeLayerRef.current = polyline;

        mapRef.current.fitBounds(polyline.getBounds(), {
          padding: [50, 50],
        });
      }
    });
  }, [route]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "400px",
        ...style,
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          zIndex: 0,
        }}
      />
      {children}
    </div>
  );
}
import React, { useEffect, useRef } from "react";

type Marker = { id: string; lngLat: [number, number]; color?: string; title?: string };

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

  // Initialize map
  useEffect(() => {
    isMountedRef.current = true;
    if (typeof window === "undefined") return;
    if (mapRef.current || !containerRef.current) return;

    // Wait for next animation frame to ensure DOM is fully rendered
    const rafId = requestAnimationFrame(() => {
      // Double check after animation frame
      if (!isMountedRef.current || !containerRef.current) return;
      
      // Wait a bit more if container has no dimensions
      const checkAndInit = () => {
        if (!containerRef.current || !isMountedRef.current) return;
        
        const width = containerRef.current.offsetWidth;
        const height = containerRef.current.offsetHeight;
        
        if (width === 0 || height === 0) {
          console.warn("LeafletMap: Container has no dimensions, retrying...");
          // Retry after a short delay
          setTimeout(checkAndInit, 100);
          return;
        }

        // Dynamic import of Leaflet to avoid SSR issues
        import("leaflet").then((L) => {
          if (!containerRef.current || !isMountedRef.current || mapRef.current) return;
          
          const leaflet = L.default || L;
          
          // Load CSS dynamically
          if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
          }
          
          // Clear any existing map instance from the container
          containerRef.current.innerHTML = '';
          (containerRef.current as any)._leaflet_id = undefined;
      
          const map = leaflet.map(containerRef.current!, {
            center: [center[1], center[0]], // Leaflet uses [lat, lng]
            zoom,
            zoomControl: true,
            dragging: true,
            touchZoom: true,
            scrollWheelZoom: true,
            doubleClickZoom: true,
            boxZoom: true,
            keyboard: true,
          });

          // Add dark Uber-like tile layer (CartoDB Dark Matter - 100% free)
          leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
            attribution: '',
            maxZoom: 19,
            subdomains: 'abcd'
          }).addTo(map);

          mapRef.current = map;
        }).catch(err => {
          console.error("Error loading Leaflet:", err);
        });
      };
      
      checkAndInit();
    });

    return () => {
      isMountedRef.current = false;
      // Cleanup map properly
      if (mapRef.current) {
        try {
          // Disable all interactions first
          const map = mapRef.current;
          map.dragging?.disable();
          map.touchZoom?.disable();
          map.doubleClickZoom?.disable();
          map.scrollWheelZoom?.disable();
          map.boxZoom?.disable();
          map.keyboard?.disable();
          if (map.tap) map.tap.disable();
          
          // Remove all event listeners
          map.off();
          map.stop();
          
          // Remove the map
          map.remove();
        } catch (e) {
          console.warn("Error removing map:", e);
        }
        mapRef.current = null;
      }
      // Clear markers
      markersRef.current.forEach(m => {
        try {
          m.remove();
        } catch (e) {}
      });
      markersRef.current = [];
      
      // Clear route
      if (routeLayerRef.current) {
        try {
          routeLayerRef.current.remove();
        } catch (e) {}
        routeLayerRef.current = null;
      }
      
      // Clear container
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        (containerRef.current as any)._leaflet_id = undefined;
      }
    };
  }, []);

  // Update center
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.setView([center[1], center[0]], zoom);
    }
  }, [center, zoom]);

  // Update markers
  useEffect(() => {
    if (!isMountedRef.current || !mapRef.current || typeof window === "undefined") return;

    import("leaflet").then((L) => {
      const leaflet = L.default || L;
      
      // Remove old markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Add new markers
      markers.forEach((marker) => {
        // guard check: ensure map exists
        if (!mapRef.current) return;
        
        const icon = leaflet.divIcon({
          className: "custom-marker",
          html: `<div style="
            position: relative;
            width: 16px;
            height: 16px;
          ">
            <div style="
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 16px;
              height: 16px;
              background: ${marker.color || "#3b82f6"};
              border-radius: 50%;
              box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9), 0 2px 8px rgba(0, 0, 0, 0.25);
            "></div>
            <div style="
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 8px;
              height: 8px;
              background: rgba(255, 255, 255, 0.4);
              border-radius: 50%;
            "></div>
          </div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const leafletMarker = leaflet.marker([marker.lngLat[1], marker.lngLat[0]], { icon });
        if (marker.title) {
          leafletMarker.bindPopup(marker.title);
        }
        if (mapRef.current) {
          leafletMarker.addTo(mapRef.current);
          markersRef.current.push(leafletMarker);
        }
      });
    });
  }, [markers]);

  // Update route
  useEffect(() => {
    if (!isMountedRef.current || !mapRef.current || typeof window === "undefined") return;

    import("leaflet").then((L) => {
      const leaflet = L.default || L;
      
      // Remove old route
      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
        routeLayerRef.current = null;
      }

      // Add new route
      if (route && route.length > 0) {
        console.log("Drawing route with", route.length, "points");
        const latLngs = route.map((coord) => [coord[1], coord[0]] as [number, number]);
        const polyline = leaflet.polyline(latLngs, {
          color: "#FFD700",
          weight: 5,
          opacity: 0.9,
        }).addTo(mapRef.current);
        routeLayerRef.current = polyline;

        // Fit bounds to show entire route
        if (latLngs.length > 1) {
          mapRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });
        }
      } else {
        console.log("No route to draw");
      }
    });
  }, [route]);

  return (
    <div style={{ position: "relative", width: "100%", height: "400px", ...style }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%", position: "absolute", zIndex: 0 }} />
      {children}
    </div>
  );
}


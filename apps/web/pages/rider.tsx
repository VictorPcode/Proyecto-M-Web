import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import LeafletMap from "../../../packages/ui/LeafletMap";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const RIDER_RIDE_SNAPSHOT_KEY = "movi:rider:rideSnapshot";
const PASSED_RIDES_KEY = "movi:rider:passedRides";
const PASSED_RIDE_TTL_MS = 10 * 60 * 1000;
const NEARBY_REQUEST_RADIUS_KM = 4;
const NEAR_DESTINATION_THRESHOLD_KM = 2;

const formatGuarani = (value: number) =>
  new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
  }).format(value);

type RideState =
  | "PENDIENTE"
  | "ASIGNADO"
  | "EN_CURSO"
  | "FINALIZADO"
  | "CANCELADO";

type GeoPoint = {
  lat: number;
  lng: number;
};

type RideRequest = {
  id: string;
  origin: GeoPoint;
  destination: GeoPoint;
  estimatedFare: number;
  state: RideState;
  passengerId: string;
  passengerName?: string;
  originName?: string;
  destName?: string;
};

type ChatMessage = {
  rideId: string;
  userId: string;
  role: "DRIVER" | "PASSENGER";
  text: string;
  ts: number;
};

type User = {
  id: string;
  name?: string;
  vehicle?: {
    id: string; // Add vehicle ID to type
    placa?: string;
    marca?: string;
    modelo?: string;
    color?: string;
  };
};

type VehicleInfo = {
  placa?: string;
  marca?: string;
  modelo?: string;
  color?: string;
};

const getPassedRideIds = () => {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = localStorage.getItem(PASSED_RIDES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    const activeEntries = Object.entries(parsed).filter(
      ([, ts]) => typeof ts === "number" && now - ts < PASSED_RIDE_TTL_MS,
    );

    if (activeEntries.length !== Object.entries(parsed).length) {
      localStorage.setItem(
        PASSED_RIDES_KEY,
        JSON.stringify(Object.fromEntries(activeEntries)),
      );
    }

    return new Set(activeEntries.map(([rideId]) => rideId));
  } catch {
    localStorage.removeItem(PASSED_RIDES_KEY);
    return new Set<string>();
  }
};

const rememberPassedRide = (rideId: string) => {
  if (typeof window === "undefined") return;

  try {
    const raw = localStorage.getItem(PASSED_RIDES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[rideId] = Date.now();
    localStorage.setItem(PASSED_RIDES_KEY, JSON.stringify(parsed));
  } catch {}
};

export default function RiderPage() {
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [debugStatus, setDebugStatus] = useState<string>("cliente no montado");
  const socketRef = useRef<any | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [driverLocation, setDriverLocation] = useState<[number, number]>([
    -57.6, -25.3,
  ]);
  const [activeRide, setActiveRide] = useState<RideRequest | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(
    null,
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  // New state to manage manual payment confirmation modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [manualInputAmount, setManualInputAmount] = useState("0");
  const [pendingFare, setPendingFare] = useState<number>(0);
  const [acceptingRideId, setAcceptingRideId] = useState<string | null>(null);

  const [approvalError, setApprovalError] = useState(false);
  const [geoWarning, setGeoWarning] = useState<string | null>(null);

  const activeRideIdRef = useRef<string | null>(null);
  const activeRideRef = useRef<RideRequest | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsMobile(window.innerWidth <= 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem("movi:user") : null;
    const token =
      typeof window !== "undefined" ? localStorage.getItem("movi:token") : null;
    if (!raw || !token) {
      router.replace("/driver-login");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setUser(parsed);
      if (parsed.role !== "DRIVER") {
        // not a driver; clear and bounce
        localStorage.removeItem("movi:user");
        localStorage.removeItem("movi:token");
        alert("Debe iniciar sesión con una cuenta de conductor.");
        router.replace("/driver-login");
        return;
      }
      // bloquear conductores no aprobados ANTES de conectar socket
      if (!parsed.approved) {
        setApprovalError(true);
        localStorage.removeItem("movi:user");
        localStorage.removeItem("movi:token");
        return;
      }

      try {
        const snapshotRaw = localStorage.getItem(RIDER_RIDE_SNAPSHOT_KEY);
        if (snapshotRaw) {
          const snapshot = JSON.parse(snapshotRaw);
          if (snapshot?.userId !== parsed.id) return;
          if (Array.isArray(snapshot?.requests)) setRequests(snapshot.requests);
          if (snapshot?.activeRide) setActiveRide(snapshot.activeRide);
          if (Array.isArray(snapshot?.routeGeometry))
            setRouteGeometry(snapshot.routeGeometry);
        }
      } catch (err) {
        console.warn("Error restoring rider snapshot:", err);
      }
    } catch (e) {
      console.error("error parsing stored user", e);
      localStorage.removeItem("movi:user");
      localStorage.removeItem("movi:token");
      router.replace("/driver-login");
      return;
    }

    let socket: any;
    (async () => {
      // marcar montado
      setDebugStatus("montado: inicializando socket");
      const { io } = await import("socket.io-client");
      socket = io(`${API_URL}/drivers`, { auth: { token } });
      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("driver connected", socket.id);
        setDebugStatus(`conectado: ${socket.id}`);
      });

      // TODO: En producción, solo recibir solicitudes de pasajeros dentro de 4km
      // Por ahora, el rider demo recibe todas las solicitudes para pruebas internas
      socket.on(
        "driver:nearby_request",
        (r: {
          rideId: string;
          origin?: GeoPoint;
          destination?: GeoPoint;
          estimatedFare?: number;
          passengerId: string;
          passengerName?: string;
          originName?: string;
          destName?: string;
        }) => {
          console.log("Nueva solicitud recibida:", r);
          setRequests((prev: RideRequest[]) => {
            if (getPassedRideIds().has(r.rideId)) return prev;

            if (
              !r.origin ||
              typeof r.origin.lat !== "number" ||
              typeof r.origin.lng !== "number"
            ) {
              return prev;
            }
            const ride = activeRideRef.current;
            if (ride?.state === "ASIGNADO") return prev;

            if (ride?.state === "EN_CURSO" && ride.destination?.lat && ride.destination?.lng) {
              const distanceToCurrentDestination = distanceKm(
                driverLocation[1],
                driverLocation[0],
                ride.destination.lat,
                ride.destination.lng,
              );

              if (
                distanceToCurrentDestination === null ||
                distanceToCurrentDestination > NEAR_DESTINATION_THRESHOLD_KM
              ) {
                return prev;
              }
            }

            const distanceToNewOrigin = distanceKm(
              driverLocation[1],
              driverLocation[0],
              r.origin.lat,
              r.origin.lng,
            );

            if (
              distanceToNewOrigin === null ||
              distanceToNewOrigin > NEARBY_REQUEST_RADIUS_KM
            ) {
              return prev;
            }

            if (ride?.destination?.lat && ride?.destination?.lng) {
              const distanceFromDestination = distanceKm(
                ride.destination.lat,
                ride.destination.lng,
                r.origin?.lat,
                r.origin?.lng,
              );
              if (distanceFromDestination === null || distanceFromDestination > NEARBY_REQUEST_RADIUS_KM) return prev;
            }
            // Evitar duplicados
            if (prev.some((x) => x.id === r.rideId)) return prev;

            return [
              {
                id: r.rideId,
                origin: r.origin,
                destination: r.destination ?? r.origin,
                estimatedFare: r.estimatedFare ?? 0,
                state: "PENDIENTE",
                passengerId: r.passengerId,
                passengerName: r.passengerName,
                originName: r.originName,
                destName: r.destName,
              },
              ...prev,
            ];
          });
          setDebugStatus(`received request ${r.rideId}`);
        },
      );

      socket.on(
        "ride:status_changed",
        (s: { rideId: string; newState: RideState }) => {
          setAcceptingRideId((current) =>
            current === s.rideId ? null : current,
          );

          if (s.newState === "CANCELADO" || s.newState === "FINALIZADO") {
            setRequests((prev) => prev.filter((x) => x.id !== s.rideId));
            setActiveRide((prev) => {
              if (!prev || prev.id !== s.rideId) return prev;
              activeRideIdRef.current = null;
              setRouteGeometry(null);
              setChatMessages([]);
              setChatOpen(false);
              setShowPaymentModal(false);
              setShowManualInputModal(false);
              setPendingFare(0);
              localStorage.removeItem(RIDER_RIDE_SNAPSHOT_KEY);
              return null;
            });
          } else if (s.newState === "ASIGNADO") {
            setRequests((prev) => prev.filter((x) => x.id !== s.rideId));
          } else {
            setRequests((prev) =>
              prev.map((x) =>
                x.id === s.rideId ? { ...x, state: s.newState } : x,
              ),
            );
            setActiveRide((prev) =>
              prev && prev.id === s.rideId
                ? { ...prev, state: s.newState }
                : prev,
            );
          }
        },
      );

      socket.on(
        "driver:accept_ok",
        (ride: {
          id: string;
          originLat: number;
          originLng: number;
          destLat: number;
          destLng: number;
          estimatedFare: number;
          state: RideState;
          passengerId: string;
          passenger?: { name?: string };
        }) => {
          setAcceptingRideId(null);
          setRequests((prev) => {
            const pending = prev.find((req) => req.id === ride.id);
            const active: RideRequest = {
              id: ride.id,
              origin: pending?.origin ?? {
                lat: ride.originLat,
                lng: ride.originLng,
              },
              destination: pending?.destination ?? {
                lat: ride.destLat,
                lng: ride.destLng,
              },
              estimatedFare: ride.estimatedFare,
              state: ride.state,
              passengerId: ride.passengerId,
              passengerName: pending?.passengerName || ride.passenger?.name,
              originName: pending?.originName,
              destName: pending?.destName,
            };

            setActiveRide(active);
            setChatMessages([]);
            setChatOpen(false);

            if (active.origin) {
              fetchDirections(driverLocation, [
                active.origin.lng,
                active.origin.lat,
              ]);
            }

            return prev.filter((req) => req.id !== ride.id);
          });
        },
      );

      socket.on(
        "driver:accept_failed",
        (payload: { rideId: string; reason?: string; restUntil?: string }) => {
          setAcceptingRideId((current) =>
            current === payload.rideId ? null : current,
          );
          setRequests((prev) =>
            prev.filter((req) => req.id !== payload.rideId),
          );

          if (payload.reason === "driver_must_rest" && payload.restUntil) {
            alert(
              `Debes descansar hasta ${new Date(payload.restUntil).toLocaleString("es-PY")}.`,
            );
            return;
          }

          if (payload.reason === "driver_session_limit_reached" && payload.restUntil) {
            alert(
              `Alcanzaste el limite de 12 horas. Debes descansar hasta ${new Date(payload.restUntil).toLocaleString("es-PY")}.`,
            );
            return;
          }

          if (payload.reason === "ride_already_taken") {
            alert("Este viaje ya fue aceptado por otro conductor.");
          }
        },
      );

      const clearRejectedActiveRide = (payload: {
        rideId: string;
        reason?: string;
        restUntil?: string;
      }) => {
        if (
          payload.reason === "ride_not_assigned_to_driver" ||
          payload.reason === "ride_already_taken"
        ) {
          setActiveRide((prev) => {
            if (!prev || prev.id !== payload.rideId) return prev;
            activeRideIdRef.current = null;
            setRouteGeometry(null);
            setChatMessages([]);
            setChatOpen(false);
            setShowPaymentModal(false);
            setShowManualInputModal(false);
            setPendingFare(0);
            localStorage.removeItem(RIDER_RIDE_SNAPSHOT_KEY);
            return null;
          });
          setRequests((prev) =>
            prev.filter((req) => req.id !== payload.rideId),
          );
          alert("Este viaje ya no esta disponible para este conductor.");
          return;
        }

        if (payload.restUntil) {
          alert(
            `No puedes tomar viajes hasta ${new Date(payload.restUntil).toLocaleString("es-PY")}.`,
          );
        }
      };

      socket.on("driver:start_failed", clearRejectedActiveRide);
      socket.on("driver:end_failed", clearRejectedActiveRide);

      socket.on("ride:chat_message", (msg: ChatMessage) => {
        if (!msg?.rideId || msg.rideId !== activeRideIdRef.current) return;
        // Ignore own messages (optimistically added)
        if (msg.role === "DRIVER") return;
        setChatMessages((prev) => [...prev, msg]);
      });

      // fetch pendientes existentes y perfil actualizado
      try {
        const [ridesRes, meRes] = await Promise.all([
          fetch(`${API_URL}/rides?state=PENDIENTE`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (meRes.ok) {
          const profile = await meRes.json();
          console.log("Perfil actualizado:", profile);
          // si es conductor pero no aprobado, no dejaremos continuar
          if (profile.role === "DRIVER" && !profile.approved) {
            alert("Cuenta de conductor pendiente de aprobación. Por favor espera la revisión de un administrador.");
            socket?.disconnect();
            router.replace("/driver-login");
            return;
          }
          setUser(profile);
          localStorage.setItem("movi:user", JSON.stringify(profile));
          if (profile.vehicle) {
            localStorage.setItem(
              "movi:vehicle",
              JSON.stringify(profile.vehicle),
            );
          }
        }

        if (ridesRes.ok) {
          const rides = await ridesRes.json();
          const passedRideIds = getPassedRideIds();
          // Reemplazar completamente en lugar de agregar para evitar duplicados
          const mapped: RideRequest[] = rides.map(
            (r: {
              id: string;
              originLat: number;
              originLng: number;
              destLat: number;
              destLng: number;
              estimatedFare: number;
              state: RideState;
              passengerId: string;
              passenger?: { name: string };
            }) => ({
              id: r.id,
              origin: { lat: r.originLat, lng: r.originLng },
              destination: { lat: r.destLat, lng: r.destLng },
              estimatedFare: r.estimatedFare,
              state: r.state,
              passengerId: r.passengerId,
              passengerName: r.passenger?.name || "Pasajero",
            }),
          ).filter((ride: RideRequest) => !passedRideIds.has(ride.id));
          setRequests(filterRequestsByActiveRide(mapped));
          // Reverse-geocode names for DB-loaded rides
          mapped.forEach(async (req) => {
            try {
              const [oRes, dRes] = await Promise.all([
                fetch(`${API_URL}/reverse-geocode?lat=${req.origin.lat}&lng=${req.origin.lng}`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/reverse-geocode?lat=${req.destination.lat}&lng=${req.destination.lng}`, { headers: { Authorization: `Bearer ${token}` } }),
              ]);
              const [oData, dData] = await Promise.all([oRes.json(), dRes.json()]);
              setRequests((prev) =>
                prev.map((r2) =>
                  r2.id === req.id
                    ? { ...r2, originName: oData.display_name || oData.text, destName: dData.display_name || dData.text }
                    : r2,
                ),
              );
            } catch {}
          });
        }

        // Fetch active rides (ASIGNADO or EN_CURSO) to restore on page reload
        try {
          const activeRes = await fetch(
            `${API_URL}/rides?state=ASIGNADO,EN_CURSO`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (activeRes.ok) {
            const activeRides = await activeRes.json();
            if (activeRides && activeRides.length > 0) {
              const active = activeRides[0];
              const ride: RideRequest = {
                id: active.id,
                origin: { lat: active.originLat, lng: active.originLng },
                destination: { lat: active.destLat, lng: active.destLng },
                estimatedFare: active.estimatedFare,
                state: active.state,
                passengerId: active.passengerId,
                passengerName: active.passenger?.name || "Pasajero",
              };
              setActiveRide(ride);
              setChatMessages([]);
                // Reverse-geocode names for restored active ride
                try {
                  const [oRes, dRes] = await Promise.all([
                    fetch(`${API_URL}/reverse-geocode?lat=${ride.origin.lat}&lng=${ride.origin.lng}`, { headers: { Authorization: `Bearer ${token}` } }),
                    fetch(`${API_URL}/reverse-geocode?lat=${ride.destination.lat}&lng=${ride.destination.lng}`, { headers: { Authorization: `Bearer ${token}` } }),
                  ]);
                  const [oData, dData] = await Promise.all([oRes.json(), dRes.json()]);
                  setActiveRide((prev) => prev && prev.id === ride.id
                    ? { ...prev, originName: oData.display_name || oData.text, destName: dData.display_name || dData.text }
                    : prev
                  );
                } catch {}
            }
          }
        } catch (err) {
          console.warn("Error fetching active rides:", err);
        }
      } catch (err) {
        console.warn("Error fetching pending rides:", err);
      }
    })();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      activeRideIdRef.current = null;
      setDebugStatus("desconectado");
    };
  }, [router]);

  useEffect(() => {
    activeRideRef.current = activeRide;
    if (activeRide?.destination?.lat && activeRide?.destination?.lng) {
      setRequests((prev) => filterRequestsByActiveRide(prev));
    }
  }, [activeRide]);

  useEffect(() => {
    if (!activeRide) return;
    if (routeGeometry && routeGeometry.length > 0) return;

    if (activeRide.state === "EN_CURSO") {
      fetchDirections(
        [activeRide.origin.lng, activeRide.origin.lat],
        [activeRide.destination.lng, activeRide.destination.lat],
      );
      return;
    }

    fetchDirections(driverLocation, [activeRide.origin.lng, activeRide.origin.lat]);
  }, [activeRide, routeGeometry, driverLocation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasRideContext = !!activeRide || requests.length > 0;
    if (!hasRideContext) {
      localStorage.removeItem(RIDER_RIDE_SNAPSHOT_KEY);
      return;
    }
    const snapshot = {
      userId: user?.id,
      requests,
      activeRide,
      routeGeometry,
    };
    localStorage.setItem(RIDER_RIDE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  }, [requests, activeRide, routeGeometry]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!navigator.geolocation) {
      setGeoWarning("Este navegador no soporta geolocalizacion.");
      return;
    }
    if (!window.isSecureContext) {
      setGeoWarning(
        "En telefonos, la ubicacion puede bloquearse en HTTP. Usa HTTPS o habilita permiso de ubicacion del sitio.",
      );
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const loc: [number, number] = [
          pos.coords.longitude,
          pos.coords.latitude,
        ];
        setDriverLocation(loc);
        socketRef.current?.emit("driver:location", {
          lng: loc[0],
          lat: loc[1],
        });
      },
      (err) => {
        console.warn("Driver geolocation error:", err);
        if (!window.isSecureContext) {
          setGeoWarning(
            "La app esta en HTTP y el navegador puede bloquear la ubicacion del conductor. Abre la web con URL HTTPS.",
          );
          return;
        }
        if (err.code === err.PERMISSION_DENIED) {
          setGeoWarning(
            "Permiso de ubicacion denegado. Activalo en configuracion del navegador para este sitio.",
          );
          return;
        }
        if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoWarning(
            "No se pudo obtener la ubicacion del conductor. Verifica GPS activo.",
          );
          return;
        }
        if (err.code === err.TIMEOUT) {
          setGeoWarning(
            "La ubicacion tardo demasiado. Intenta nuevamente con mejor senal GPS.",
          );
          return;
        }
        setGeoWarning("No se pudo leer la ubicacion del conductor.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!activeRide || !user) {
      activeRideIdRef.current = null;
      return;
    }

    if (activeRide.state === "ASIGNADO" || activeRide.state === "EN_CURSO") {
      activeRideIdRef.current = activeRide.id;
      socketRef.current?.emit("ride:join", {
        rideId: activeRide.id,
        userId: user.id,
      });
    }
  }, [activeRide, user]);

  const fetchDirections = async (
    origin: [number, number],
    dest: [number, number],
  ) => {
    try {
      const res = await fetch(
        `http://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?` +
          `geometries=geojson&overview=full&steps=true`,
      );
      const data = await res.json();
      if (data.code !== "Ok") {
        setRouteGeometry([origin, dest]);
        return;
      }
      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates as [
          number,
          number,
        ][];
        setRouteGeometry(coords);
      } else {
        setRouteGeometry([origin, dest]);
      }
    } catch (err) {
      console.error("Directions error:", err);
      setRouteGeometry([origin, dest]);
    }
  };

  const distanceKm = (
    lat1?: number,
    lng1?: number,
    lat2?: number,
    lng2?: number,
  ) => {
    if (
      typeof lat1 !== "number" ||
      typeof lng1 !== "number" ||
      typeof lat2 !== "number" ||
      typeof lng2 !== "number"
    ) {
      return null;
    }
    const toRad = (val: number) => (val * Math.PI) / 180;
    const r = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return r * c;
  };

  const calculateFare = (distance: number) => {
    const baseFare = 9000;
    if (distance <= 1) return baseFare;
    const extra = distance - 1;
    const wholeKm = Math.floor(extra);
    const fractional = extra - wholeKm;
    return baseFare + wholeKm * 2600 + fractional * 2700;
  };

  const filterRequestsByActiveRide = (list: RideRequest[]) => {
    const ride = activeRideRef.current;
    if (!ride?.destination?.lat || !ride?.destination?.lng) return list;
    return list.filter((req) => {
      const distance = distanceKm(
        ride.destination.lat,
        ride.destination.lng,
        req.origin?.lat,
        req.origin?.lng,
      );
      return distance !== null && distance <= 1;
    });
  };

  const sendChat = (overrideText?: string) => {
    if (!activeRide || !user) return;
    const text =
      typeof overrideText === "string" ? overrideText : chatInput.trim();
    if (!text) return;
    if (activeRideIdRef.current !== activeRide.id) {
      activeRideIdRef.current = activeRide.id;
      socketRef.current?.emit("ride:join", {
        rideId: activeRide.id,
        userId: user.id,
      });
    }
    const payload: ChatMessage = {
      rideId: activeRide.id,
      userId: user.id,
      role: "DRIVER",
      text,
      ts: Date.now(),
    };
    setChatMessages((prev) => [...prev, payload]);
    setChatOpen(true);
    socketRef.current?.emit("ride:chat_message", {
      rideId: activeRide.id,
      userId: user.id,
      text,
      ts: Date.now(),
    });
    setChatInput("");
  };

  const accept = (ride: RideRequest) => {
    if (acceptingRideId) return;

    const driverId = user?.id || "demo-driver";
    // Priorizamos el vehiculo real de la BD si existe
    const realVehicle = user?.vehicle;
    const vehicleId = realVehicle?.id || `veh-${driverId}`;

    // Si no hay vehículo real, usar datos locales o defaults
    const vehicle = {
      placa: realVehicle?.placa || "SIN-PLACA",
      marca: realVehicle?.marca || "Vehiculo",
      modelo: realVehicle?.modelo || "Modelo",
      color: realVehicle?.color || "Color",
    };

    console.log("Aceptando viaje con vehículo:", { vehicleId, vehicle });

    socketRef.current?.emit("driver:accept_ride", {
      rideId: ride.id,
      driverId,
      vehicleId,
      vehicle,
    });
    setAcceptingRideId(ride.id);
  };

  const startRide = () => {
    if (!activeRide || !activeRide.origin) return;

    // 1. Validar proximidad (ej. 100 metros = 0.1km)
    const dist = distanceKm(
      driverLocation[1],
      driverLocation[0],
      activeRide.origin.lat,
      activeRide.origin.lng,
    );

    console.log("Distancia al pasajero:", dist, "km");

    // Permitir un margen mayor (0.3km) para pruebas, o 0.1km para prod
    if (dist === null || dist > 0.3) {
      alert(
        `Debes estar en la ubicación de recogida para iniciar el viaje. Estás a ${(dist || 0).toFixed(2)}km.`,
      );
      return;
    }

    // 2. Cambiar estado y ruta
    socketRef.current?.emit("driver:start_ride", activeRide.id);

    // Actualización optimista
    setActiveRide((prev) => (prev ? { ...prev, state: "EN_CURSO" } : null));

    // Cambiar ruta: Origen -> Destino
    if (activeRide.destination) {
      fetchDirections(
        [activeRide.origin.lng, activeRide.origin.lat],
        [activeRide.destination.lng, activeRide.destination.lat],
      );
    }
  };

  const pass = (ride: RideRequest) => {
    rememberPassedRide(ride.id);
    setRequests((prev) => prev.filter((r) => r.id !== ride.id));
  };

  const handleLogout = () => {
    if (activeRide && (activeRide.state === "ASIGNADO" || activeRide.state === "EN_CURSO")) {
      if (!confirm("Tienes un viaje activo. ¿Seguro que deseas cerrar sesión?")) {
        return;
      }
    }
    localStorage.removeItem("movi:user");
    localStorage.removeItem("movi:token");
    localStorage.removeItem("movi:vehicle");
    localStorage.removeItem(RIDER_RIDE_SNAPSHOT_KEY);
    socketRef.current?.disconnect();
    router.push("/driver-login");
  };

  const endRide = () => {
    if (!activeRide) return;

    const rideId = activeRide.id;
    // Si state=PENDIENTE/ASIGNADO, no tiene sentido "En curso->Finalizar", pero validemos
    // que esté "EN_CURSO"

    // Distancia al destino
    let dist = 1000;
    if (activeRide.destination?.lat && activeRide.destination?.lng) {
      const d = distanceKm(
        driverLocation[1],
        driverLocation[0],
        activeRide.destination.lat,
        activeRide.destination.lng,
      );
      if (d !== null) dist = d;
    }

    console.log("Distancia al destino:", dist, "km");

    // Limite: 0.2km
    if (dist > 0.2) {
      // Open custom modal instead of prompt
      setManualInputAmount("0");
      setShowManualInputModal(true);
    } else {
      // Finalizar normal
      // Calc distance from origin to here
      let traveled = 0;
      if (activeRide.origin?.lat && activeRide.origin?.lng) {
        const t = distanceKm(
          activeRide.origin.lat,
          activeRide.origin.lng,
          driverLocation[1],
          driverLocation[0],
        );
        if (t !== null) traveled = t;
      }

      const finalAmount = calculateFare(traveled);

      // Emitimos primero para que el cliente vea el monto de inmediato
      socketRef.current?.emit("driver:end_ride", {
        rideId,
        finalFare: finalAmount,
      });

      // Show payment modal
      setPendingFare(finalAmount);
      setShowPaymentModal(true);
    }
  };

  const markers = [
    {
      id: "driver",
      lngLat: driverLocation,
      color: "#22c55e",
      title: "Tu ubicación",
    },
  ];

  if (activeRide?.origin?.lng && activeRide?.origin?.lat) {
    markers.push({
      id: "pickup",
      lngLat: [activeRide.origin.lng, activeRide.origin.lat],
      color: "#3b82f6",
      title: "Recogida",
    });
  }

  if (activeRide?.destination?.lng && activeRide?.destination?.lat) {
    markers.push({
      id: "dropoff",
      lngLat: [activeRide.destination.lng, activeRide.destination.lat],
      color: "#f59e0b",
      title: "Destino",
    });
  }

  // Agregar marcadores de solicitudes pendientes
  requests.forEach((req) => {
    if (req.origin?.lng && req.origin?.lat) {
      markers.push({
        id: `req-${req.id}`,
        lngLat: [req.origin.lng, req.origin.lat] as [number, number],
        color: "#FF3B30",
        title: "Solicitud",
      });
    }
  });

  const googleMapsUrl =
    activeRide?.origin && activeRide?.destination
      ? `https://www.google.com/maps/dir/?api=1&origin=${driverLocation[1]},${driverLocation[0]}` +
        `&destination=${activeRide.destination.lat},${activeRide.destination.lng}` +
        `&waypoints=${activeRide.origin.lat},${activeRide.origin.lng}`
      : "";

  return (
    <>
      {/* Modal de error de aprobación */}
      {approvalError && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '40px',
              borderRadius: '20px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              textAlign: 'center',
              maxWidth: '420px',
              width: '90%',
            }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                marginBottom: 16,
                color: '#000',
              }}
            >
              Cuenta Pendiente
            </div>
            <div
              style={{
                fontSize: 16,
                color: '#666',
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              Tu cuenta de conductor aún no ha sido aprobada. Espera la revisión de un administrador.
            </div>
            <button
              onClick={() => router.replace('/driver-login')}
              style={{
                padding: '14px 32px',
                background: '#007AFF',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: 16,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Volver al Login
            </button>
          </div>
        </div>
      )}

      {!approvalError && (
        <div
          style={{
            position: "relative",
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
          }}
        >
          <LeafletMap
            center={driverLocation}
            zoom={13}
            markers={markers}
            route={
              activeRide && routeGeometry && routeGeometry.length > 0
                ? routeGeometry
                : undefined
            }
            style={{ width: "100%", height: "100%" }}
          />

          {geoWarning && (
            <div
              style={{
                position: "fixed",
                top: isMobile ? 10 : 24,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 12,
                width: "min(92vw, 620px)",
                background: "#fff4e5",
                color: "#7a3e00",
                border: "1px solid #ffd9a8",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {geoWarning}
            </div>
          )}

          {/* Status bar - Top left */}
          <div
            style={{
              position: "fixed",
              top: isMobile ? 58 : 24,
              left: isMobile ? 12 : 24,
              right: isMobile ? 12 : "auto",
              zIndex: 10,
              background: "rgba(255, 255, 255, 0.95)",
              padding: "12px 20px",
              borderRadius: "12px",
              backdropFilter: "blur(20px)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: "#000", fontWeight: 600 }}>
                  {user?.name || "Conductor"}
                </div>
                <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>
                  {user?.vehicle?.placa ? `Placa: ${user.vehicle.placa}` : "Sin vehículo"}
                </div>
                <div style={{ fontSize: 11, color: "#86868b", marginTop: 2 }}>
                  {requests.length} solicitudes pendientes
                </div>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  padding: "6px 12px",
                  background: "#FF3B30",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Cerrar sesión
              </button>
            </div>
          </div>

      {/* Manual Input Modal */}
      {showManualInputModal && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 2000,
            background: "white",
            padding: "24px",
            borderRadius: "24px",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
            width: "90%",
            maxWidth: "320px",
            textAlign: "center",
          }}
        >
          <h3 style={{ marginBottom: 16 }}>Finalizar Viaje (Distancia)</h3>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
            Estás lejos del destino. Ingresa el monto a cobrar:
          </p>
          <input
            type="number"
            value={manualInputAmount}
            onChange={(e) => setManualInputAmount(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: 24,
              textAlign: "center",
              marginBottom: 20,
              borderRadius: 12,
              border: "1px solid #ddd",
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowManualInputModal(false)}
              style={{
                flex: 1,
                padding: 12,
                background: "#f5f5f7",
                border: "none",
                borderRadius: 12,
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const finalFare =
                  parseInt(manualInputAmount.replace(/\D/g, ""), 10) || 0;
                if (activeRide) {
                  socketRef.current?.emit("driver:end_ride", {
                    rideId: activeRide.id,
                    finalFare,
                    state: "CANCELADO",
                  });
                  setPendingFare(finalFare);
                  setShowManualInputModal(false);
                  setShowPaymentModal(true);
                }
              }}
              style={{
                flex: 1,
                padding: 12,
                background: "#000",
                color: "white",
                border: "none",
                borderRadius: 12,
                fontWeight: 600,
              }}
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {showPaymentModal && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 2000,
            background: "white",
            padding: "32px",
            borderRadius: "24px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            width: "90%",
            maxWidth: "360px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "bold",
              marginBottom: "16px",
            }}
          >
            Cobrar Viaje
          </h2>
          <div
            style={{ fontSize: "15px", color: "#666", marginBottom: "24px" }}
          >
            Total a recibir del pasajero:
          </div>
          <div
            style={{
              fontSize: "32px",
              fontWeight: "bold",
              color: "#007AFF",
              marginBottom: "32px",
            }}
          >
            {formatGuarani(pendingFare)}
          </div>
          <button
            onClick={() => {
              if (activeRide) {
                socketRef.current?.emit("driver:confirm_payment", {
                  rideId: activeRide.id,
                });
              }
              setShowPaymentModal(false);
              setPendingFare(0);
              setActiveRide(null);
              setRouteGeometry(null);
              localStorage.removeItem(RIDER_RIDE_SNAPSHOT_KEY);
            }}
            style={{
              width: "100%",
              padding: "16px",
              background: "#34C759",
              color: "white",
              border: "none",
              borderRadius: "12px",
              fontWeight: "bold",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Confirmar Pago Recibido
          </button>
        </div>
      )}

      {activeRide && (
        <div
          style={{
            position: "fixed",
            top: isMobile ? "auto" : 24,
            bottom: isMobile ? 16 : "auto",
            left: isMobile ? 12 : "50%",
            right: isMobile ? 12 : "auto",
            transform: isMobile ? "none" : "translateX(-50%)",
            zIndex: 11,
            background: "rgba(255, 255, 255, 0.98)",
            padding: isMobile ? "16px" : "20px",
            borderRadius: isMobile ? "18px 18px 14px 14px" : "16px",
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
            width: isMobile ? "auto" : "360px",
            maxWidth: isMobile ? "none" : "calc(100vw - 48px)",
            maxHeight: isMobile ? "52vh" : "none",
            overflowY: isMobile ? "auto" : "visible",
          }}
        >
          <div style={{ fontSize: 14, color: "#86868b", marginBottom: 8 }}>
            Viaje asignado
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#000",
              marginBottom: 12,
            }}
          >
            Recoger a {activeRide.passengerName || "Pasajero"}
          </div>
          <div style={{ fontSize: 13, color: "#86868b", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
              <span style={{ color: "#007AFF", fontWeight: 700, minWidth: 12 }}>●</span>
              <span>{activeRide.originName || `${activeRide.origin?.lat?.toFixed(4)}, ${activeRide.origin?.lng?.toFixed(4)}`}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ color: "#FF3B30", fontWeight: 700, minWidth: 12 }}>●</span>
              <span>{activeRide.destName || `${activeRide.destination?.lat?.toFixed(4)}, ${activeRide.destination?.lng?.toFixed(4)}`}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  textAlign: "center",
                  background: "#1c1c1c",
                  color: "white",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Abrir en Google Maps
              </a>
              <button
                onClick={() => setChatOpen(true)}
                style={{
                  flex: 1,
                  background: "#007AFF",
                  color: "white",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Chatear
              </button>
            </div>
            {activeRide.state === "ASIGNADO" && (
              <button
                onClick={startRide}
                style={{
                  width: "100%",
                  background: "#34C759",
                  color: "white",
                  padding: "12px",
                  borderRadius: "10px",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                Iniciar Viaje
              </button>
            )}
            {activeRide.state === "EN_CURSO" && (
              <button
                onClick={endRide}
                style={{
                  width: "100%",
                  background: "#FF3B30",
                  color: "white",
                  padding: "12px",
                  borderRadius: "10px",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                Finalizar Viaje
              </button>
            )}
          </div>
        </div>
      )}

      {/* Request Cards - Right side */}
      {requests.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: isMobile ? "auto" : 24,
            right: isMobile ? 12 : 24,
            left: isMobile ? 12 : "auto",
            bottom: isMobile ? 16 : "auto",
            zIndex: 10,
            maxHeight: isMobile ? "45vh" : "calc(100vh - 48px)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxWidth: isMobile ? "none" : "360px",
          }}
        >
          {requests.map((req) => (
            <div
              key={req.id}
              style={{
                background: "rgba(255, 255, 255, 0.98)",
                padding: "20px",
                borderRadius: "16px",
                backdropFilter: "blur(20px)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                animation: "slideInRight 0.3s ease-out",
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#000",
                  marginBottom: 12,
                }}
              >
                Nueva solicitud de {req.passengerName || "Pasajero"}
              </div>

              <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                  <span style={{ color: "#007AFF", fontWeight: 600, minWidth: 16 }}>●</span>
                  <span>{req.originName || `${req.origin?.lat?.toFixed(4)}, ${req.origin?.lng?.toFixed(4)}`}</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <span style={{ color: "#FF3B30", fontWeight: 600, minWidth: 16 }}>●</span>
                  <span>{req.destName || `${req.destination?.lat?.toFixed(4)}, ${req.destination?.lng?.toFixed(4)}`}</span>
                </div>
              </div>

              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#007AFF",
                  marginTop: 12,
                  marginBottom: 16,
                }}
              >
                {formatGuarani(req.estimatedFare ?? 0)}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => accept(req)}
                  disabled={!!acceptingRideId}
                  style={{
                    flex: 1,
                    background: acceptingRideId ? "#8e8e93" : "#34C759",
                    color: "white",
                    padding: "12px 20px",
                    borderRadius: "10px",
                    fontSize: 14,
                    fontWeight: 600,
                    border: "none",
                    cursor: acceptingRideId ? "not-allowed" : "pointer",
                    boxShadow: "0 2px 8px rgba(52, 199, 89, 0.3)",
                  }}
                >
                  {acceptingRideId === req.id ? "Aceptando..." : "Aceptar"}
                </button>
                <button
                  onClick={() => pass(req)}
                  disabled={!!acceptingRideId}
                  style={{
                    flex: 1,
                    background: "#f5f5f7",
                    color: "#000",
                    padding: "12px 20px",
                    borderRadius: "10px",
                    fontSize: 14,
                    fontWeight: 500,
                    border: "none",
                    cursor: acceptingRideId ? "not-allowed" : "pointer",
                  }}
                >
                  Pasar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {chatOpen && activeRide && (
        <div
          style={{
            position: "fixed",
            bottom: isMobile ? 16 : 24,
            right: isMobile ? 12 : 24,
            left: isMobile ? 12 : "auto",
            zIndex: 1002,
            width: isMobile ? "auto" : "320px",
            maxWidth: isMobile ? "none" : "calc(100vw - 48px)",
            background: "rgba(255, 255, 255, 0.98)",
            borderRadius: isMobile ? "18px 18px 14px 14px" : "16px",
            boxShadow: "0 12px 48px rgba(0, 0, 0, 0.2)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Chat con {activeRide.passengerName || "Pasajero"}
            </div>
            <button
              onClick={() => setChatOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              X
            </button>
          </div>
          <div
            style={{
              padding: "12px 16px",
              maxHeight: "240px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {chatMessages.length === 0 && (
              <div style={{ fontSize: 12, color: "#86868b" }}>
                Aun no hay mensajes
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div
                key={`${m.ts}-${i}`}
                style={{
                  alignSelf: m.role === "DRIVER" ? "flex-end" : "flex-start",
                  background: m.role === "DRIVER" ? "#007AFF" : "#f5f5f7",
                  color: m.role === "DRIVER" ? "white" : "#000",
                  padding: "8px 10px",
                  borderRadius: "10px",
                  fontSize: 13,
                  maxWidth: "80%",
                }}
              >
                {m.text}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "12px 16px",
              borderTop: "1px solid #f0f0f0",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                paddingBottom: 2,
              }}
            >
              {["Estoy en camino", "Llego en 5 min", "He llegado"].map(
                (reply) => (
                  <button
                    key={reply}
                    onClick={() => sendChat(reply)}
                    style={{
                      background: "#f0f0f0",
                      border: "none",
                      borderRadius: "16px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                      color: "#333",
                      fontWeight: 500,
                    }}
                  >
                    {reply}
                  </button>
                ),
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" ? sendChat() : null)}
                placeholder="Escribe un mensaje"
                style={{
                  flex: 1,
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                  padding: "8px 10px",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <button
                onClick={() => sendChat()}
                style={{
                  background: "#007AFF",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No requests message */}
      {requests.length === 0 && !activeRide && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 5,
            background: "rgba(255, 255, 255, 0.95)",
            padding: "24px 32px",
            borderRadius: "16px",
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "#000",
              marginBottom: 8,
            }}
          >
            Esperando solicitudes...
          </div>
          <div style={{ fontSize: 14, color: "#86868b" }}>
            Te notificaremos cuando haya un viaje disponible
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
        </div>
      )}
    </>
  );
}

//client.tsx
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/router";
import { Button, Header } from "@movi/ui";
import LeafletMap from "../../../packages/ui/LeafletMap";
import { buildStateQuery } from "../utils/query";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const CLIENT_RIDE_SNAPSHOT_KEY = "movi:client:rideSnapshot";
const CANCEL_REASONS = [
  "El conductor no avanza hacia mí",
  "Cambio de destino o de plan",
  "Tiempo de espera excesivo",
  "No me siento seguro/a",
  "El conductor me pidió cancelar",
  "Otro",
];

console.log("Environment variables loaded:");
console.log(
  "MAPBOX_TOKEN:",
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? "Available" : "NOT FOUND",
);
console.log("API_URL:", API_URL);

type User = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  photoUrl?: string | null;
};

type RideState =
  | "PENDIENTE"
  | "ASIGNADO"
  | "EN_CURSO"
  | "FINALIZADO"
  | "CANCELADO";

type DriverUser = { id: string; name?: string; photoUrl?: string | null };

type Vehicle = {
  placa?: string;
  marca?: string;
  modelo?: string;
  color?: string;
};

type Ride = {
  id: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  estimatedFare: number;
  finalFare?: number;
  state: RideState;
  driver?: DriverUser;
  vehicle?: Vehicle;
  passengerId?: string;
};

type Suggestion = {
  display_name: string;
  lat: string;
  lon: string;
};

type ChatMessage = {
  rideId: string;
  userId: string;
  role: "PASSENGER" | "DRIVER";
  text: string;
  ts: number;
};

const formatGuarani = (value: number) =>
  new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
  }).format(value);

export default function ClientPage() {
  const [messages, setMessages] = useState<string[]>([]);
  const [currentRide, setCurrentRide] = useState<Ride | null>(null);
  const [history, setHistory] = useState<Ride[]>([]);
  const passengerRef = useRef<any | null>(null);
  const [debugStatus, setDebugStatus] = useState<string>("cliente no montado");
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [tokenSnippet, setTokenSnippet] = useState<string>("none");

  const [user, setUser] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [driverPos, setDriverPos] = useState<[number, number] | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originCoords, setOriginCoords] = useState<[number, number] | null>(
    null,
  );
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(
    null,
  );
  const [waitingDriver, setWaitingDriver] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodingError, setGeocodingError] = useState<string | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<Suggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<Suggestion[]>([]);
  const [geoWarning, setGeoWarning] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonOther, setCancelReasonOther] = useState("");
  const activeRideIdRef = useRef<string | null>(null);

  const router = useRouter();

  const clearRideState = () => {
    setCurrentRide(null);
    setWaitingDriver(false);
    setRouteGeometry(null);
    setOriginQuery("");
    setDestQuery("");
    setOriginCoords(null);
    setDestCoords(null);
    setDriverPos(null);
    setChatMessages([]);
    setChatOpen(false);
    activeRideIdRef.current = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(CLIENT_RIDE_SNAPSHOT_KEY);
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem("movi:user");
    if (!raw) {
      router.replace("/register");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      // Validar que sea un usuario válido y no un objeto de error
      if (parsed && parsed.error) {
        console.error("Invalid user data in localStorage:", parsed);
        localStorage.removeItem("movi:user");
        localStorage.removeItem("movi:token");
        router.replace("/login");
        return;
      }
      if (parsed && parsed.id && parsed.email) {
        setUser(parsed);
      } else {
        console.error("Invalid user format:", parsed);
        localStorage.removeItem("movi:user");
        localStorage.removeItem("movi:token");
        router.replace("/login");
        return;
      }
    } catch (e) {
      console.error("Error parsing user data:", e);
      localStorage.removeItem("movi:user");
      localStorage.removeItem("movi:token");
      router.replace("/login");
      return;
    }
    const t = localStorage.getItem("movi:token") || "";
    setTokenSnippet(t ? `${t.slice(0, 12)}…` : "none");
    setMounted(true);
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsMobile(window.innerWidth <= 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!mounted || !user?.id) return;
    const token = localStorage.getItem("movi:token");
    if (!token) return;

    (async () => {
      try {
        const [meRes, ridesRes] = await Promise.all([
          fetch(`${API_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/me/rides`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (meRes.ok) {
          const profile = await meRes.json();
          setUser(profile);
          setProfileName(profile.name || "");
          setProfilePhone(profile.phone || "");
          setProfilePhotoUrl(profile.photoUrl || "");
          localStorage.setItem("movi:user", JSON.stringify(profile));
        }

        if (ridesRes.ok) {
          const rides = await ridesRes.json();
          if (Array.isArray(rides)) setHistory(rides);
        }
      } catch (err) {
        console.warn("Error loading passenger profile:", err);
      }
    })();
  }, [mounted, user?.id]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const onReturnToForeground = async () => {
      if (document.visibilityState !== "visible") return;
      const token = localStorage.getItem("movi:token");
      if (!token) return;

      if (passengerRef.current && !passengerRef.current.connected) {
        passengerRef.current.connect();
      }

      try {
        const res = await fetch(
          `${API_URL}/rides?${buildStateQuery(["ASIGNADO", "EN_CURSO"])}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) return;
        const rides = await res.json();
        if (Array.isArray(rides) && rides.length > 0) {
          const active = rides[0];
          const ride: Ride = {
            id: active.id,
            originLat: active.originLat,
            originLng: active.originLng,
            destLat: active.destLat,
            destLng: active.destLng,
            estimatedFare: active.estimatedFare,
            finalFare: active.finalFare,
            state: active.state,
            driver: active.driver,
            vehicle: active.vehicle,
            passengerId: active.passengerId,
          };
          setCurrentRide(ride);
          if (user?.id) {
            activeRideIdRef.current = ride.id;
            passengerRef.current?.emit("ride:join", {
              rideId: ride.id,
              userId: user.id,
            });
          }
        }
      } catch (err) {
        console.warn("Error restoring active ride on foreground:", err);
      }
    };

    document.addEventListener("visibilitychange", onReturnToForeground);
    window.addEventListener("focus", onReturnToForeground);

    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        const nav: any = navigator;
        if (nav?.wakeLock?.request) {
          wakeLock = await nav.wakeLock.request("screen");
        }
      } catch { }
    };
    void requestWakeLock();

    return () => {
      document.removeEventListener("visibilitychange", onReturnToForeground);
      window.removeEventListener("focus", onReturnToForeground);
      if (wakeLock?.release) wakeLock.release().catch(() => undefined);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined" || !user?.id) return;
    try {
      const raw = localStorage.getItem(CLIENT_RIDE_SNAPSHOT_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      if (snapshot?.userId !== user.id) return;
      if (snapshot?.currentRide) setCurrentRide(snapshot.currentRide);
      if (Array.isArray(snapshot?.routeGeometry))
        setRouteGeometry(snapshot.routeGeometry);
      if (typeof snapshot?.originQuery === "string")
        setOriginQuery(snapshot.originQuery);
      if (typeof snapshot?.destQuery === "string") setDestQuery(snapshot.destQuery);
      if (Array.isArray(snapshot?.originCoords)) setOriginCoords(snapshot.originCoords);
      if (Array.isArray(snapshot?.destCoords)) setDestCoords(snapshot.destCoords);
      if (typeof snapshot?.waitingDriver === "boolean")
        setWaitingDriver(snapshot.waitingDriver);
    } catch (err) {
      console.warn("Error restoring client snapshot:", err);
    }
  }, [mounted, user?.id]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const hasRideContext = !!currentRide || waitingDriver;
    if (!hasRideContext) {
      localStorage.removeItem(CLIENT_RIDE_SNAPSHOT_KEY);
      return;
    }

    const snapshot = {
      userId: user?.id,
      currentRide: currentRide
        ? {
          id: currentRide.id,
          state: currentRide.state,
          originLat: currentRide.originLat,
          originLng: currentRide.originLng,
          destLat: currentRide.destLat,
          destLng: currentRide.destLng,
          estimatedFare: currentRide.estimatedFare,
          finalFare: currentRide.finalFare,
          driver: currentRide.driver,
          vehicle: currentRide.vehicle,
          passengerId: currentRide.passengerId,
        }
        : null,
      // routeGeometry excluded to prevent localStorage quota exceeded
      originQuery,
      destQuery,
      originCoords,
      destCoords,
      waitingDriver,
    };

    try {
      localStorage.setItem(CLIENT_RIDE_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("Unable to persist ride snapshot:", error);
    }
  }, [
    mounted,
    currentRide,
    // routeGeometry removed from dependencies since not saved to localStorage
    originQuery,
    destQuery,
    originCoords,
    destCoords,
    waitingDriver,
  ]);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "geolocation" in navigator &&
      !originCoords
    ) {
      if (!window.isSecureContext) {
        setGeoWarning(
          "En telefono, la geolocalizacion se bloquea si el sitio va por HTTP. Abre la app con HTTPS (tunel) para usar ubicacion.",
        );
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          if (!latitude || !longitude) return;

          // Set coords immediately
          setOriginCoords([longitude, latitude]);
          setGeoWarning(null);

          // Fetch address
          try {
            const res = await fetch(
              `${API_URL}/reverse-geocode?lat=${latitude}&lng=${longitude}`,
            );
            if (res.ok) {
              const data = await res.json();
              if (data.display_name) {
                setOriginQuery(data.display_name);
              }
            }
          } catch (err) {
            console.error("Reverse geocode failed", err);
            // Fallback if needed, but coords are already set
            setOriginQuery("Mi ubicación actual");
          }
        },
        (err) => {
          console.error("Geolocation error:", err);
          if (!window.isSecureContext) {
            setGeoWarning(
              "Este navegador esta abriendo la app en HTTP y puede bloquear la ubicacion. Prueba abrir la web con URL HTTPS.",
            );
            return;
          }
          if (err.code === err.PERMISSION_DENIED) {
            setGeoWarning(
              "Permiso de ubicacion denegado por el navegador o el sistema. Revisa permisos del navegador y del sistema operativo.",
            );
            return;
          }
          if (err.code === err.POSITION_UNAVAILABLE) {
            setGeoWarning(
              "No se pudo obtener tu ubicacion. Verifica GPS activo y precision de ubicacion.",
            );
            return;
          }
          if (err.code === err.TIMEOUT) {
            setGeoWarning(
              "La ubicacion tardo demasiado. Intenta nuevamente con mejor senal GPS.",
            );
            return;
          }
          setGeoWarning("No se pudo leer tu ubicacion en este dispositivo.");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // debug: confirmar montaje cliente
    console.log("Client page: booting client-side code");
    setDebugStatus("montado: inicializando socket");

    let socket: any;
    (async () => {
      const { io } = await import("socket.io-client");
      const token =
        typeof window !== "undefined"
          ? (localStorage.getItem("movi:token") ?? undefined)
          : undefined;
      socket = io(`${API_URL}/passengers`, { auth: { token } });
      passengerRef.current = socket;

      const onConnect = () => {
        setMessages((m) => [...m, `Connected ${socket.id}`]);
        setDebugStatus(`conectado: ${socket.id}`);

        // Fetch active ride on reconnect to restore state after page reload
        const token = typeof window !== "undefined" ? localStorage.getItem("movi:token") : null;
        if (token) {
          (async () => {
            try {
              const res = await fetch(
                `${API_URL}/rides?${buildStateQuery(["ASIGNADO", "EN_CURSO"])}`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                },
              );
              if (res.ok) {
                const rides = await res.json();
                if (rides && rides.length > 0) {
                  const activeRide = rides[0];
                  const ride: Ride = {
                    id: activeRide.id,
                    originLat: activeRide.originLat,
                    originLng: activeRide.originLng,
                    destLat: activeRide.destLat,
                    destLng: activeRide.destLng,
                    estimatedFare: activeRide.estimatedFare,
                    finalFare: activeRide.finalFare,
                    state: activeRide.state,
                    driver: activeRide.driver,
                    vehicle: activeRide.vehicle,
                    passengerId: activeRide.passengerId,
                  };
                  setCurrentRide(ride);
                  setChatMessages([]);
                  if (user?.id) {
                    activeRideIdRef.current = ride.id;
                    socket.emit("ride:join", {
                      rideId: ride.id,
                      userId: user.id,
                    });
                  }
                }
              }
            } catch (err) {
              console.warn("Error fetching active ride:", err);
            }
          })();
        }
      };
      const onCreated = (ride: Ride) => {
        setCurrentRide(ride);
        setHistory((h) => [ride, ...h]);
        setMessages((m) => [...m, `Ride created ${ride.id}`]);
        setDebugStatus(`ride created: ${ride.id}`);
      };
      const onAssigned = (ride: Ride) => {
        console.log("Ride assigned event received:", ride);
        setCurrentRide(ride);
        setMessages((m) => [...m, `Ride assigned ${ride.id}`]);
        setDebugStatus(`ride assigned: ${ride.id}`);
        setWaitingDriver(false);
        setChatMessages([]);
        if (user?.id) {
          activeRideIdRef.current = ride.id;
          passengerRef.current?.emit("ride:join", {
            rideId: ride.id,
            userId: user.id,
          });
        }
      };
      const onTracking = (loc: { lng: number; lat: number }) => {
        const lngLat: [number, number] = [Number(loc.lng), Number(loc.lat)];
        setDriverPos(lngLat);
      };
      const onStatus = (s: {
        rideId: string;
        newState: RideState;
        finalFare?: number;
      }) => {
        setMessages((m) => [...m, `Status: ${JSON.stringify(s)}`]);
        setDebugStatus(`status: ${JSON.stringify(s)}`);

        // Use functional update to check the CURRENT state value
        setCurrentRide((cr: Ride | null) => {
          if (!cr) return null; // No active ride
          if (cr.id !== s.rideId) return cr; // Mismatched ride ID

          return {
            ...cr,
            state: s.newState,
            finalFare: s.finalFare ?? cr.finalFare,
          };
        });
      };

      const onPaymentConfirmed = (data: { rideId: string }) => {
        setMessages((m) => [...m, `Pago confirmado ${data.rideId}`]);
        if (activeRideIdRef.current === data.rideId || currentRide?.id === data.rideId) {
          // Limpiar sin depender de recarga completa
          clearRideState();
        }
      };

      const onChatMessage = (msg: ChatMessage) => {
        if (!msg?.rideId || msg.rideId !== activeRideIdRef.current) return;
        // Ignore own messages (optimistically added)
        if (msg.role === "PASSENGER") return;
        setChatMessages((prev) => [...prev, msg]);
        if (msg.role === "DRIVER") setChatOpen(true);
      };

      socket.on("connect", onConnect);
      socket.on("ride:created", onCreated);
      socket.on("ride:assigned", onAssigned);
      socket.on("ride:tracking", onTracking);
      socket.on("ride:status_changed", onStatus);
      socket.on("ride:chat_message", onChatMessage);
      socket.on("ride:payment_confirmed", onPaymentConfirmed);
    })();

    return () => {
      passengerRef.current?.disconnect();
      passengerRef.current = null;
      activeRideIdRef.current = null;
      setDebugStatus("desconectado");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Efecto para limpiar si el viaje se cancela sin monto
  useEffect(() => {
    if (
      currentRide?.state === "CANCELADO" &&
      (!currentRide.finalFare || currentRide.finalFare <= 0)
    ) {
      alert("El viaje fue cancelado.");
      clearRideState();
    }
  }, [currentRide]);

  // Fallback: si el modal final queda colgado por pérdida de evento, cerrar solo.
  useEffect(() => {
    if (!currentRide) return;
    const isFinishedWithFare =
      (currentRide.state === "FINALIZADO" || currentRide.state === "CANCELADO") &&
      (currentRide.finalFare || 0) > 0;
    if (!isFinishedWithFare) return;

    const token =
      typeof window !== "undefined" ? localStorage.getItem("movi:token") : null;

    const checkTimer = setTimeout(async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/rides?state=ASIGNADO,EN_CURSO`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const rides = await res.json();
        if (!Array.isArray(rides) || rides.length === 0) {
          clearRideState();
        }
      } catch { }
    }, 4000);

    const forceCloseTimer = setTimeout(() => {
      clearRideState();
    }, 20000);

    return () => {
      clearTimeout(checkTimer);
      clearTimeout(forceCloseTimer);
    };
  }, [currentRide]);

  useEffect(() => {
    if (!currentRide || !user) {
      activeRideIdRef.current = null;
      return;
    }

    if (currentRide.state === "ASIGNADO" || currentRide.state === "EN_CURSO") {
      activeRideIdRef.current = currentRide.id;
      passengerRef.current?.emit("ride:join", {
        rideId: currentRide.id,
        userId: user.id,
      });
    }
  }, [currentRide, user]);

  useEffect(() => {
    if (!currentRide) return;
    if (!(currentRide.state === "ASIGNADO" || currentRide.state === "EN_CURSO" || currentRide.state === "PENDIENTE")) {
      return;
    }

    const origin: [number, number] = [currentRide.originLng, currentRide.originLat];
    const dest: [number, number] = [currentRide.destLng, currentRide.destLat];

    setOriginCoords((prev) => prev ?? origin);
    setDestCoords((prev) => prev ?? dest);

    if (!routeGeometry || routeGeometry.length === 0) {
      void fetchDirections(origin, dest);
    }

    const token =
      typeof window !== "undefined" ? localStorage.getItem("movi:token") : null;
    if (!token || (originQuery && destQuery)) return;

    (async () => {
      try {
        const [oRes, dRes] = await Promise.all([
          originQuery
            ? Promise.resolve(null)
            : fetch(`${API_URL}/reverse-geocode?lat=${origin[1]}&lng=${origin[0]}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          destQuery
            ? Promise.resolve(null)
            : fetch(`${API_URL}/reverse-geocode?lat=${dest[1]}&lng=${dest[0]}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
        ]);
        if (oRes && oRes.ok) {
          const data = await oRes.json();
          setOriginQuery(data.display_name
             || data.text || "Origen");
        }
        if (dRes && dRes.ok) {
          const data = await dRes.json();
          setDestQuery(data.display_name || data.text || "Destino");
        }
      } catch (err) {
        console.warn("Error restoring route names:", err);
      }
    })();
  }, [currentRide, routeGeometry, originQuery, destQuery]);

  const register = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    setRegistering(true);
    try {
      const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role: "PASSENGER" }),
      });
      const u = await res.json();
      setUser(u);
      localStorage.setItem("movi:user", JSON.stringify(u));
    } catch (err) {
      console.error("register error", err);
    } finally {
      setRegistering(false);
    }
  };

  const distanceKm = (origin: [number, number], dest: [number, number]) => {
    const toRad = (val: number) => (val * Math.PI) / 180;
    const r = 6371;
    const dLat = toRad(dest[1] - origin[1]);
    const dLng = toRad(dest[0] - origin[0]);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(origin[1])) *
      Math.cos(toRad(dest[1])) *
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

  const requestRide = () => {
    if (!user) {
      setMessages((m) => [
        ...m,
        "Debes registrarte antes de solicitar un viaje",
      ]);
      return;
    }

    if (!originCoords || !destCoords) {
      setMessages((m) => [...m, "Debes seleccionar origen y destino"]);
      return;
    }

    if (waitingDriver) {
      return; // Prevent multiple requests
    }

    setWaitingDriver(true);
    const distance = distanceKm(originCoords, destCoords);
    const estimatedFare = calculateFare(distance);
    passengerRef.current?.emit("passenger:request_ride", {
      passengerId: user.id,
      origin: { lat: originCoords[1], lng: originCoords[0] },
      destination: { lat: destCoords[1], lng: destCoords[0] },
      originName: originQuery || undefined,
      destName: destQuery || undefined,
      estimatedFare,
    });
  };

  const openCancelRideModal = () => {
    if (!currentRide) return;
    setCancelReason("");
    setCancelReasonOther("");
    setShowCancelModal(true);
  };

  const confirmCancelRide = () => {
    if (!currentRide) return;
    const selected = cancelReason === "Otro" ? cancelReasonOther.trim() : cancelReason;
    if (!selected) {
      alert("Selecciona un motivo de cancelación.");
      return;
    }
    passengerRef.current?.emit("passenger:cancel_ride", {
      rideId: currentRide.id,
      reason: selected,
    });
    setMessages((m) => [...m, `Cancel requested ${currentRide.id}: ${selected}`]);
    setShowCancelModal(false);
    clearRideState();
  };

  const sendChat = () => {
    if (!currentRide || !user) return;
    const text = chatInput.trim();
    if (!text) return;
    if (activeRideIdRef.current !== currentRide.id) {
      activeRideIdRef.current = currentRide.id;
      passengerRef.current?.emit("ride:join", {
        rideId: currentRide.id,
        userId: user.id,
      });
    }
    const payload: ChatMessage = {
      rideId: currentRide.id,
      userId: user.id,
      role: "PASSENGER",
      text,
      ts: Date.now(),
    };
    setChatMessages((prev) => [...prev, payload]);
    setChatOpen(true);
    passengerRef.current?.emit("ride:chat_message", {
      rideId: currentRide.id,
      userId: user.id,
      text,
      ts: Date.now(),
    });
    setChatInput("");
  };

  const geocodeAddress = async (
    query: string,
    limit = 10,
  ): Promise<Suggestion[]> => {
    if (!query.trim() || query.trim().length < 2) return [];

    const searchQuery = query.trim();

    try {
      setGeocodingError(null);
      const response = await fetch(
        `${API_URL}/geocode?query=${encodeURIComponent(searchQuery)}&limit=${limit}`,
      );

      if (!response.ok) {
        console.error("Geocoding error:", response.status);
        setGeocodingError("Error al buscar ubicaciones. Verifica la conexión.");
        return [];
      }

      const data = await response.json();

      const suggestions = Array.isArray(data) ? data : data.features;

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        return [];
      }

      return suggestions as Suggestion[];
    } catch (error) {
      console.error("Geocoding error:", error);
      setGeocodingError("No se pudo conectar con el servidor de búsqueda.");
      return [];
    }
  };

  const fetchDirections = async (
    origin: [number, number],
    dest: [number, number],
  ) => {
    try {
      // Por ahora usar línea recta simple (puedes integrar OSRM más tarde para rutas reales)
      // OSRM es gratuito: http://router.project-osrm.org/route/v1/driving/

      const res = await fetch(
        `http://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?` +
        `geometries=geojson&overview=full&steps=true`,
      );

      const data = await res.json();

      if (data.code !== "Ok") {
        console.error("Directions API error:", data.message || data.code);
        // Fallback a línea recta
        setRouteGeometry([origin, dest]);
        return;
      }

      if (data.routes && data.routes.length > 0) {
        // Tomar la mejor ruta (la primera es la más rápida/corta)
        const route = data.routes[0];
        const coords = route.geometry.coordinates as [number, number][];

        // Información adicional útil
        const distance = (route.distance / 1000).toFixed(1); // km
        const duration = Math.round(route.duration / 60); // minutos

        console.log(
          `Ruta calculada: ${distance}km, ~${duration} min, ${coords.length} puntos`,
        );

        setRouteGeometry(coords);
      } else {
        console.warn("No se encontró ninguna ruta, usando línea recta");
        setRouteGeometry([origin, dest]);
      }
    } catch (err) {
      console.error("Directions error:", err);
      setRouteGeometry([origin, dest]);
    }
  };

  const handleOriginChange = (query: string) => {
    setOriginQuery(query);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      if (!query.trim() || query.trim().length < 2) {
        setOriginSuggestions([]);
        return;
      }
      setGeocoding(true);
      const suggestions = await geocodeAddress(query);
      setOriginSuggestions(suggestions);
      setGeocoding(false);
    }, 200);
  };

  const selectOriginSuggestion = async (feature: Suggestion) => {
    const lng = Number(feature.lon);
    const lat = Number(feature.lat);

    setOriginQuery(feature.display_name);
    setOriginCoords([lng, lat]);
    setOriginSuggestions([]);

    if (destCoords) {
      await fetchDirections([lng, lat], destCoords);
    }
  };

  const handleDestChange = (query: string) => {
    setDestQuery(query);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      if (!query.trim() || query.trim().length < 2) {
        setDestSuggestions([]);
        return;
      }
      setGeocoding(true);
      const suggestions = await geocodeAddress(query);
      setDestSuggestions(suggestions);
      setGeocoding(false);
    }, 200);
  };

  const handleLogout = () => {
    if (currentRide && currentRide.state !== "FINALIZADO" && currentRide.state !== "CANCELADO") {
      if (!confirm("Tienes un viaje activo. ¿Seguro que deseas cerrar sesión?")) {
        return;
      }
    }
    localStorage.removeItem("movi:user");
    localStorage.removeItem("movi:token");
    localStorage.removeItem(CLIENT_RIDE_SNAPSHOT_KEY);
    passengerRef.current?.disconnect();
    router.push("/login");
  };

  const saveProfile = async () => {
    const token = localStorage.getItem("movi:token");
    if (!token || !user) return;

    setSavingProfile(true);
    try {
      const res = await fetch(`${API_URL}/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: profileName,
          phone: profilePhone,
          photoUrl: profilePhotoUrl,
        }),
      });

      if (!res.ok) throw new Error("profile_update_failed");

      const updated = await res.json();
      setUser(updated);
      localStorage.setItem("movi:user", JSON.stringify(updated));
      setProfileOpen(false);
    } catch (err) {
      console.error("Error saving profile:", err);
      alert("No se pudo guardar el perfil.");
    } finally {
      setSavingProfile(false);
    }
  };

  const selectDestSuggestion = async (feature: Suggestion) => {
    const lng = Number(feature.lon);
    const lat = Number(feature.lat);

    setDestQuery(feature.display_name);
    setDestCoords([lng, lat]);
    setDestSuggestions([]);

    if (originCoords) {
      await fetchDirections(originCoords, [lng, lat]);
    }
  };

  const swapPlaces = () => {
    if (!originCoords || !destCoords) return;

    const tempQuery = originQuery;
    const tempCoords = originCoords;
    setOriginQuery(destQuery);
    setDestQuery(tempQuery);
    setOriginCoords(destCoords);
    setDestCoords(tempCoords);
    fetchDirections(destCoords, tempCoords);
  };

  const driverCoords = driverPos;

  const markers = [];
  if (originCoords)
    markers.push({
      id: "origin",
      lngLat: originCoords,
      color: "#e2c906ff",
      title: "Origen",
    });
  if (destCoords)
    markers.push({
      id: "dest",
      lngLat: destCoords,
      color: "#ffa25fff",
      title: "Destino",
    });
  if (driverCoords)
    markers.push({
      id: "driver",
      lngLat: driverCoords as [number, number],
      color: "#22c55e",
      title: "Conductor",
    });

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Logout Button - Top Right */}
      {user && (
        <div
          style={{
            position: "fixed",
            top: isMobile ? 10 : 24,
            right: isMobile ? 10 : 24,
            zIndex: 1100,
            display: "flex",
            gap: 8,
          }}
        >
          <button
            onClick={() => setProfileOpen(true)}
            style={{
              padding: "10px 14px",
              background: "white",
              color: "#1c1c1e",
              border: "1px solid #e5e5ea",
              borderRadius: "8px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            }}
          >
            Perfil
          </button>
          <button
            onClick={() => setHistoryOpen(true)}
            style={{
              padding: "10px 14px",
              background: "white",
              color: "#1c1c1e",
              border: "1px solid #e5e5ea",
              borderRadius: "8px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            }}
          >
            Historial
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: "10px 16px",
              background: "#FF3B30",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              backdropFilter: "blur(10px)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            }}
          >
            Cerrar sesión
          </button>
        </div>
      )}

      {profileOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2200, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ width: "min(92vw, 420px)", background: "white", borderRadius: 18, padding: 22, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>Mi perfil</h2>
            <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 6 }}>Nombre</label>
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)} style={{ width: "100%", padding: 12, border: "1px solid #ddd", borderRadius: 10, marginBottom: 12 }} />
            <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 6 }}>Telefono</label>
            <input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} style={{ width: "100%", padding: 12, border: "1px solid #ddd", borderRadius: 10, marginBottom: 12 }} />
            <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 6 }}>Foto URL</label>
            <input value={profilePhotoUrl} onChange={(e) => setProfilePhotoUrl(e.target.value)} style={{ width: "100%", padding: 12, border: "1px solid #ddd", borderRadius: 10, marginBottom: 18 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setProfileOpen(false)} style={{ flex: 1, padding: 12, border: "none", borderRadius: 10, background: "#f2f2f7", fontWeight: 600 }}>Cancelar</button>
              <button onClick={saveProfile} disabled={savingProfile} style={{ flex: 1, padding: 12, border: "none", borderRadius: 10, background: "#007AFF", color: "white", fontWeight: 600 }}>{savingProfile ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2200, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ width: "min(92vw, 560px)", maxHeight: "80vh", overflowY: "auto", background: "white", borderRadius: 18, padding: 22, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Historial</h2>
              <button onClick={() => setHistoryOpen(false)} style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer" }}>x</button>
            </div>
            {history.length === 0 ? (
              <div style={{ color: "#777", fontSize: 14 }}>Aun no hay viajes registrados.</div>
            ) : history.map((ride) => (
              <div key={ride.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{ride.state}</div>
                <div style={{ color: "#555", fontSize: 13 }}>Origen: {ride.originLat.toFixed(5)}, {ride.originLng.toFixed(5)}</div>
                <div style={{ color: "#555", fontSize: 13 }}>Destino: {ride.destLat.toFixed(5)}, {ride.destLng.toFixed(5)}</div>
                <div style={{ color: "#007AFF", fontWeight: 700, marginTop: 8 }}>{formatGuarani(ride.finalFare ?? ride.estimatedFare ?? 0)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {geoWarning && (
        <div
          style={{
            position: "fixed",
            top: isMobile ? 56 : 8,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1200,
            width: "min(92vw, 560px)",
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

      <LeafletMap
        center={originCoords || destCoords || [-57.6, -25.3]}
        zoom={13}
        markers={markers}
        route={
          originCoords &&
            destCoords &&
            routeGeometry &&
            routeGeometry.length > 0
            ? routeGeometry
            : undefined
        }
        style={{ width: "100%", height: "100%" }}
      />

      {/* Search Card - Centered at top with Uber/Apple style */}
      {/* Mostrar solo si NO hay viaje asignado o en curso Y NO está esperando conductor */}
      {(!currentRide ||
        currentRide.state === "PENDIENTE" ||
        currentRide.state === "CANCELADO") &&
        !waitingDriver && (
          <div
            style={{
              position: "fixed",
              top: isMobile ? "auto" : "32px",
              bottom: isMobile ? "16px" : "auto",
              left: isMobile ? "12px" : "50%",
              right: isMobile ? "12px" : "auto",
              transform: isMobile ? "none" : "translateX(-50%)",
              zIndex: 1000,
              background: "rgba(255, 255, 255, 0.98)",
              padding: isMobile ? "16px" : "20px 24px",
              borderRadius: isMobile ? "18px 18px 14px 14px" : "20px",
              backdropFilter: "blur(20px)",
              boxShadow:
                "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
              width: isMobile ? "auto" : "420px",
              maxWidth: isMobile ? "none" : "calc(100vw - 64px)",
              maxHeight: isMobile ? "46vh" : "none",
              overflowY: isMobile ? "auto" : "visible",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: 16,
                fontSize: 20,
                color: "#000",
                letterSpacing: "-0.5px",
              }}
            >
              {user ? `Hola, ${user.name}` : "¿A dónde vamos?"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "14px 16px",
                    background: "#f5f5f7",
                    borderRadius: "12px",
                    border: "2px solid transparent",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#007AFF",
                    }}
                  ></div>
                  <input
                    value={originQuery}
                    onChange={(e) => handleOriginChange(e.target.value)}
                    placeholder="Punto de partida"
                    style={{
                      flex: 1,
                      border: "none",
                      background: "transparent",
                      color: "#000",
                      fontSize: 15,
                      fontWeight: 500,
                      outline: "none",
                      fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  />
                </div>
                {originSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#fff",
                      borderRadius: 12,
                      marginTop: 8,
                      maxHeight: 240,
                      overflowY: "auto",
                      zIndex: 1001,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      border: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    {originSuggestions.map((s, i) => (
                      <div
                        key={i}
                        onClick={() => selectOriginSuggestion(s)}
                        style={{
                          padding: "12px 16px",
                          cursor: "pointer",
                          borderBottom:
                            i < originSuggestions.length - 1
                              ? "1px solid #f0f0f0"
                              : "none",
                          fontSize: 14,
                          color: "#000",
                          fontWeight: 500,
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#f5f5f7")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        {s.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ position: "relative" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "14px 16px",
                    background: "#f5f5f7",
                    borderRadius: "12px",
                    border: "2px solid transparent",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "2px",
                      background: "#FF3B30",
                    }}
                  ></div>
                  <input
                    value={destQuery}
                    onChange={(e) => handleDestChange(e.target.value)}
                    placeholder="¿A dónde vas?"
                    style={{
                      flex: 1,
                      border: "none",
                      background: "transparent",
                      color: "#000",
                      fontSize: 15,
                      fontWeight: 500,
                      outline: "none",
                      fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  />
                </div>
                {destSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#fff",
                      borderRadius: 12,
                      marginTop: 8,
                      maxHeight: 240,
                      overflowY: "auto",
                      zIndex: 1001,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      border: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    {destSuggestions.map((s, i) => (
                      <div
                        key={i}
                        onClick={() => selectDestSuggestion(s)}
                        style={{
                          padding: "12px 16px",
                          cursor: "pointer",
                          borderBottom:
                            i < destSuggestions.length - 1
                              ? "1px solid #f0f0f0"
                              : "none",
                          fontSize: 14,
                          color: "#000",
                          fontWeight: 500,
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#f5f5f7")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        {s.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {geocoding && (
                <div
                  style={{
                    color: "#86868b",
                    fontSize: 13,
                    textAlign: "center",
                    marginTop: 4,
                  }}
                >
                  Buscando...
                </div>
              )}

              {geocodingError && !geocoding && (
                <div
                  style={{
                    color: "#FF3B30",
                    fontSize: 12,
                    textAlign: "center",
                    marginTop: 4,
                    padding: "6px 12px",
                    background: "#fff1f0",
                    borderRadius: 8,
                  }}
                >
                  {geocodingError}
                </div>
              )}

              {/* Botón Solicitar viaje */}
              <Button
                onClick={requestRide}
                disabled={waitingDriver}
                style={{
                  background: waitingDriver ? "#86868b" : "#1c1c1cff",
                  color: "white",
                  padding: "14px 24px",
                  borderRadius: "12px",
                  fontSize: 15,
                  fontWeight: 600,
                  border: "none",
                  boxShadow: waitingDriver ? "none" : "0 4px 16px rgba(0, 122, 255, 0.4)",
                  cursor: waitingDriver ? "not-allowed" : "pointer",
                  width: "100%",
                  marginTop: 8,
                }}
              >
                {waitingDriver ? "Buscando conductor..." : "Solicitar viaje"}
              </Button>
            </div>
          </div>
        )}

      {/* Driver Info Card - Cuando el viaje está asignado */}
      {currentRide &&
        (currentRide.state === "ASIGNADO" ||
          currentRide.state === "EN_CURSO") && (
          <div
            style={{
              position: "fixed",
              top: isMobile ? "auto" : "32px",
              bottom: isMobile ? "16px" : "auto",
              left: isMobile ? "12px" : "50%",
              right: isMobile ? "12px" : "auto",
              transform: isMobile ? "none" : "translateX(-50%)",
              zIndex: 1000,
              background: "rgba(255, 255, 255, 0.98)",
              padding: isMobile ? "16px" : "24px",
              borderRadius: isMobile ? "18px 18px 14px 14px" : "20px",
              backdropFilter: "blur(20px)",
              boxShadow:
                "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
              width: isMobile ? "auto" : "420px",
              maxWidth: isMobile ? "none" : "calc(100vw - 64px)",
              maxHeight: isMobile ? "52vh" : "none",
              overflowY: isMobile ? "auto" : "visible",
            }}
          >
            <div style={{ fontSize: 14, color: "#86868b", marginBottom: 12 }}>
              {currentRide.state === "ASIGNADO"
                ? "Conductor asignado"
                : "Viaje en curso"}
            </div>

            {/* Información del conductor */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                marginBottom: 20,
                paddingBottom: 20,
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              {currentRide.driver?.photoUrl ? (
                <img
                  src={currentRide.driver.photoUrl}
                  alt={currentRide.driver?.name || "Conductor"}
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: "#007AFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: 24,
                    fontWeight: 600,
                  }}
                >
                  {currentRide.driver?.name?.charAt(0)?.toUpperCase() || "C"}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "#000",
                    marginBottom: 4,
                  }}
                >
                  {currentRide.driver?.name || "Conductor"}
                </div>
                {currentRide.vehicle && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr",
                      columnGap: 12,
                      rowGap: 4,
                      fontSize: 13,
                      marginTop: 8,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#333" }}>
                      Modelo:
                    </span>
                    <span style={{ color: "#666" }}>
                      {currentRide.vehicle.marca} {currentRide.vehicle.modelo}
                    </span>

                    <span style={{ fontWeight: 600, color: "#333" }}>
                      Color:
                    </span>
                    <span style={{ color: "#666" }}>
                      {currentRide.vehicle.color || "No especificado"}
                    </span>

                    <span style={{ fontWeight: 600, color: "#333" }}>
                      Chapa:
                    </span>
                    <span style={{ color: "#666" }}>
                      {currentRide.vehicle.placa || "No visible"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Información del viaje */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px",
                  background: "#f5f5f7",
                  borderRadius: "12px",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#007AFF",
                  }}
                ></div>
                <div style={{ fontSize: 14, color: "#000" }}>
                  {originQuery ||
                    `${currentRide.originLat.toFixed(4)}, ${currentRide.originLng.toFixed(4)}`}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px",
                  background: "#f5f5f7",
                  borderRadius: "12px",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "2px",
                    background: "#FF3B30",
                  }}
                ></div>
                <div style={{ fontSize: 14, color: "#000" }}>
                  {destQuery ||
                    `${currentRide.destLat.toFixed(4)}, ${currentRide.destLng.toFixed(4)}`}
                </div>
              </div>
            </div>

            {/* Precio estimado */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px",
                background: "#f5f5f7",
                borderRadius: "12px",
              }}
            >
              <div style={{ fontSize: 14, color: "#86868b" }}>
                Tarifa estimada
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#007AFF" }}>
                {formatGuarani(currentRide.estimatedFare ?? 0)}
              </div>
            </div>

            <button
              onClick={() => setChatOpen(true)}
              style={{
                width: "100%",
                marginTop: 12,
                padding: "12px 16px",
                borderRadius: "12px",
                background: "#1c1c1c",
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              Chatear con el conductor
            </button>

            {/* Estado del viaje */}
            <div
              style={{
                marginTop: 16,
                padding: "12px",
                background:
                  currentRide.state === "EN_CURSO" ? "#34C759" : "#007AFF",
                borderRadius: "12px",
                color: "white",
                textAlign: "center",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {currentRide.state === "ASIGNADO"
                ? "El conductor va en camino..."
                : "En camino al destino"}
            </div>
          </div>
        )}

      {chatOpen &&
        currentRide &&
        (currentRide.state === "ASIGNADO" ||
          currentRide.state === "EN_CURSO") && (
          <div
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 1002,
              width: "320px",
              maxWidth: "calc(100vw - 48px)",
              background: "rgba(255, 255, 255, 0.98)",
              borderRadius: "16px",
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
                Chat con {currentRide.driver?.name || "conductor"}
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
                    alignSelf:
                      m.role === "PASSENGER" ? "flex-end" : "flex-start",
                    background: m.role === "PASSENGER" ? "#007AFF" : "#f5f5f7",
                    color: m.role === "PASSENGER" ? "white" : "#000",
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
                gap: 8,
                padding: "12px 16px",
                borderTop: "1px solid #f0f0f0",
              }}
            >
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
                onClick={sendChat}
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
        )}

      {/* Cancel button - Bottom left corner (only when ride exists) */}
      {currentRide && currentRide.state !== "FINALIZADO" && (
        <div
          style={{
            position: "fixed",
            top: isMobile ? 10 : "auto",
            right: isMobile ? 128 : "auto",
            bottom: isMobile ? "auto" : 24,
            left: isMobile ? "auto" : 24,
            zIndex: 1000,
          }}
        >
          {/* <button
            className="ghost"
            onClick={openCancelRideModal}
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              padding: isMobile ? "10px 14px" : "12px 24px",
              borderRadius: "12px",
              fontSize: isMobile ? 12 : 14,
              border: "1px solid rgba(0,0,0,0.1)",
              cursor: "pointer",
            }}
          >
            Cancelar viaje
          </button> */}
        </div>
      )}

      {showCancelModal && currentRide && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 2100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
        >
          <div
            style={{
              background: "#fff",
              width: isMobile ? "100%" : 440,
              maxWidth: "100%",
              borderRadius: isMobile ? "18px 18px 14px 14px" : 18,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              maxHeight: "78vh",
              overflowY: "auto",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              ¿Por qué deseas cancelar este viaje?
            </div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              Tu respuesta nos ayuda a mejorar el servicio.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CANCEL_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setCancelReason(reason)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border:
                      cancelReason === reason
                        ? "1px solid #007AFF"
                        : "1px solid #e5e7eb",
                    background: cancelReason === reason ? "#eef6ff" : "#fff",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  {reason}
                </button>
              ))}
            </div>

            {cancelReason === "Otro" && (
              <textarea
                value={cancelReasonOther}
                onChange={(e) => setCancelReasonOther(e.target.value)}
                placeholder="Especifica el motivo"
                style={{
                  marginTop: 10,
                  width: "100%",
                  minHeight: 80,
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  padding: 10,
                  fontSize: 14,
                  outline: "none",
                }}
              />
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                onClick={() => setShowCancelModal(false)}
                style={{
                  flex: 1,
                  padding: "11px 12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Volver
              </button>
              <button
                onClick={confirmCancelRide}
                style={{
                  flex: 1,
                  padding: "11px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "#ff3b30",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalized Trip Card */}
      {currentRide &&
        (currentRide.state === "FINALIZADO" ||
          (currentRide.state === "CANCELADO" &&
            (currentRide.finalFare || 0) > 0)) && (
          <div
            style={{
              position: "fixed",
              top: isMobile ? "auto" : "50%",
              left: isMobile ? "12px" : "50%",
              right: isMobile ? "12px" : "auto",
              bottom: isMobile ? "16px" : "auto",
              transform: isMobile ? "none" : "translate(-50%, -50%)",
              zIndex: 2000,
              background: "rgba(255, 255, 255, 0.98)",
              padding: isMobile ? "18px" : "32px",
              borderRadius: isMobile ? "18px 18px 14px 14px" : "24px",
              backdropFilter: "blur(20px)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.25)",
              width: isMobile ? "auto" : "360px",
              maxWidth: isMobile ? "none" : "calc(100vw - 48px)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 8,
                color: "#000",
              }}
            >
              {currentRide.state === "CANCELADO"
                ? "Viaje Finalizado (Concluido)"
                : "¡Viaje Finalizado!"}
            </div>
            <div style={{ fontSize: 15, color: "#86868b", marginBottom: 24 }}>
              Esperamos que hayas disfrutado el viaje con
            </div>

            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#007AFF",
                marginBottom: 32,
              }}
            >
              {currentRide.driver?.name || "Conductor"}
            </div>

            <div
              style={{
                background: "#f5f5f7",
                padding: "20px",
                borderRadius: "16px",
                marginBottom: 32,
              }}
            >
              <div style={{ fontSize: 13, color: "#86868b", marginBottom: 4 }}>
                Total a pagar
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#000" }}>
                {formatGuarani(
                  currentRide.finalFare ?? currentRide.estimatedFare,
                )}
              </div>
            </div>

            {/* 
                Mostrar mensaje de espera incluso si es CANCELADO, 
                si el usuario ingresó un monto manual (fare > 0).
                Si es 0, mostramos "Entendido" para salir.
             */}
            {currentRide.finalFare && currentRide.finalFare > 0 ? (
              <div style={{ fontSize: 13, color: "#86868b", marginTop: 16 }}>
                Esperando confirmación del conductor...
              </div>
            ) : (
              <Button
                onClick={() => {
                  clearRideState();
                }}
                style={{
                  width: "100%",
                  padding: "16px",
                  fontSize: 16,
                  borderRadius: "14px",
                  background: "#000",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Entendido
              </Button>
            )}
          </div>
        )}|

      {/* Waiting for driver - Bottom center (Uber style) */}
      {((waitingDriver && !["ASIGNADO", "EN_CURSO"].includes(currentRide?.state ?? "")) ||
        currentRide?.state === "PENDIENTE") && (
          <div
            style={{
              position: "fixed",
              bottom: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1001,
              background: "rgba(255, 255, 255, 0.98)",
              padding: isMobile ? "16px" : "24px 32px",
              borderRadius: isMobile ? "18px 18px 14px 14px" : "20px",
              backdropFilter: "blur(20px)",
              boxShadow: "0 12px 48px rgba(0, 0, 0, 0.2)",
              minWidth: isMobile ? "0" : "320px",
              width: isMobile ? "calc(100vw - 24px)" : "auto",
              textAlign: "center",
              transition: "bottom 0.4s cubic-bezier(0.4, 0.0, 0.2, 1)",
              animation: "slideUp 0.4s ease-out",
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  margin: "0 auto",
                  borderRadius: "50%",
                  border: "3px solid #007AFF",
                  borderTopColor: "transparent",
                  animation: "spin 1s linear infinite",
                }}
              ></div>
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "#000",
                marginBottom: 8,
              }}
            >
              Buscando conductor
            </div>
            <div style={{ fontSize: 14, color: "#86868b", marginBottom: 16 }}>
              Espera mientras un conductor acepta tu solicitud...
            </div>
            <button
              onClick={() => {
                if (currentRide) {
                  openCancelRideModal();
                } else {
                  setWaitingDriver(false);
                }
              }}
              style={{
                background: "transparent",
                border: "1px solid #d1d1d6",
                borderRadius: 10,
                padding: "10px 24px",
                fontSize: 14,
                color: "#ff3b30",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Cancelar búsqueda
            </button>
            <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            @keyframes slideUp {
              from {
                bottom: -200px;
                opacity: 0;
              }
              to {
                bottom: 24px;
                opacity: 1;
              }
            }
          `}</style>
          </div>
        )}
    </div>
  );
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ClientPage;
const jsx_runtime_1 = require("react/jsx-runtime");
//client.tsx
const react_1 = require("react");
const router_1 = require("next/router");
const ui_1 = require("ui");
const LeafletMap_1 = __importDefault(require("../../../packages/ui/LeafletMap"));
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
console.log("MAPBOX_TOKEN:", process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? "Available" : "NOT FOUND");
console.log("API_URL:", API_URL);
const formatGuarani = (value) => new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
}).format(value);
function ClientPage() {
    const [messages, setMessages] = (0, react_1.useState)([]);
    const [currentRide, setCurrentRide] = (0, react_1.useState)(null);
    const [history, setHistory] = (0, react_1.useState)([]);
    const passengerRef = (0, react_1.useRef)(null);
    const [debugStatus, setDebugStatus] = (0, react_1.useState)("cliente no montado");
    const [mounted, setMounted] = (0, react_1.useState)(false);
    const [isMobile, setIsMobile] = (0, react_1.useState)(false);
    const [tokenSnippet, setTokenSnippet] = (0, react_1.useState)("none");
    const [user, setUser] = (0, react_1.useState)(null);
    const [registering, setRegistering] = (0, react_1.useState)(false);
    const [name, setName] = (0, react_1.useState)("");
    const [email, setEmail] = (0, react_1.useState)("");
    const [driverPos, setDriverPos] = (0, react_1.useState)(null);
    const [originQuery, setOriginQuery] = (0, react_1.useState)("");
    const [destQuery, setDestQuery] = (0, react_1.useState)("");
    const [originCoords, setOriginCoords] = (0, react_1.useState)(null);
    const [destCoords, setDestCoords] = (0, react_1.useState)(null);
    const [routeGeometry, setRouteGeometry] = (0, react_1.useState)(null);
    const [waitingDriver, setWaitingDriver] = (0, react_1.useState)(false);
    const [geocoding, setGeocoding] = (0, react_1.useState)(false);
    const [geocodingError, setGeocodingError] = (0, react_1.useState)(null);
    const [originSuggestions, setOriginSuggestions] = (0, react_1.useState)([]);
    const [destSuggestions, setDestSuggestions] = (0, react_1.useState)([]);
    const [geoWarning, setGeoWarning] = (0, react_1.useState)(null);
    const debounceTimerRef = (0, react_1.useRef)(null);
    const [chatOpen, setChatOpen] = (0, react_1.useState)(false);
    const [chatMessages, setChatMessages] = (0, react_1.useState)([]);
    const [chatInput, setChatInput] = (0, react_1.useState)("");
    const [showCancelModal, setShowCancelModal] = (0, react_1.useState)(false);
    const [cancelReason, setCancelReason] = (0, react_1.useState)("");
    const [cancelReasonOther, setCancelReasonOther] = (0, react_1.useState)("");
    const activeRideIdRef = (0, react_1.useRef)(null);
    const router = (0, router_1.useRouter)();
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
    (0, react_1.useEffect)(() => {
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
            }
            else {
                console.error("Invalid user format:", parsed);
                localStorage.removeItem("movi:user");
                localStorage.removeItem("movi:token");
                router.replace("/login");
                return;
            }
        }
        catch (e) {
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
    (0, react_1.useEffect)(() => {
        if (typeof window === "undefined")
            return;
        const update = () => setIsMobile(window.innerWidth <= 768);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);
    (0, react_1.useEffect)(() => {
        if (typeof document === "undefined")
            return;
        const onReturnToForeground = async () => {
            if (document.visibilityState !== "visible")
                return;
            const token = localStorage.getItem("movi:token");
            if (!token)
                return;
            if (passengerRef.current && !passengerRef.current.connected) {
                passengerRef.current.connect();
            }
            try {
                const res = await fetch(`${API_URL}/rides?state=ASIGNADO,EN_CURSO`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok)
                    return;
                const rides = await res.json();
                if (Array.isArray(rides) && rides.length > 0) {
                    const active = rides[0];
                    const ride = {
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
            }
            catch (err) {
                console.warn("Error restoring active ride on foreground:", err);
            }
        };
        document.addEventListener("visibilitychange", onReturnToForeground);
        window.addEventListener("focus", onReturnToForeground);
        let wakeLock = null;
        const requestWakeLock = async () => {
            try {
                const nav = navigator;
                if (nav?.wakeLock?.request) {
                    wakeLock = await nav.wakeLock.request("screen");
                }
            }
            catch { }
        };
        void requestWakeLock();
        return () => {
            document.removeEventListener("visibilitychange", onReturnToForeground);
            window.removeEventListener("focus", onReturnToForeground);
            if (wakeLock?.release)
                wakeLock.release().catch(() => undefined);
        };
    }, [user?.id]);
    (0, react_1.useEffect)(() => {
        if (!mounted || typeof window === "undefined" || !user?.id)
            return;
        try {
            const raw = localStorage.getItem(CLIENT_RIDE_SNAPSHOT_KEY);
            if (!raw)
                return;
            const snapshot = JSON.parse(raw);
            if (snapshot?.userId !== user.id)
                return;
            if (snapshot?.currentRide)
                setCurrentRide(snapshot.currentRide);
            if (Array.isArray(snapshot?.routeGeometry))
                setRouteGeometry(snapshot.routeGeometry);
            if (typeof snapshot?.originQuery === "string")
                setOriginQuery(snapshot.originQuery);
            if (typeof snapshot?.destQuery === "string")
                setDestQuery(snapshot.destQuery);
            if (Array.isArray(snapshot?.originCoords))
                setOriginCoords(snapshot.originCoords);
            if (Array.isArray(snapshot?.destCoords))
                setDestCoords(snapshot.destCoords);
            if (typeof snapshot?.waitingDriver === "boolean")
                setWaitingDriver(snapshot.waitingDriver);
        }
        catch (err) {
            console.warn("Error restoring client snapshot:", err);
        }
    }, [mounted, user?.id]);
    (0, react_1.useEffect)(() => {
        if (!mounted || typeof window === "undefined")
            return;
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
        }
        catch (error) {
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
    (0, react_1.useEffect)(() => {
        if (typeof window !== "undefined" &&
            "geolocation" in navigator &&
            !originCoords) {
            if (!window.isSecureContext) {
                setGeoWarning("En telefono, la geolocalizacion se bloquea si el sitio va por HTTP. Abre la app con HTTPS (tunel) para usar ubicacion.");
            }
            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;
                if (!latitude || !longitude)
                    return;
                // Set coords immediately
                setOriginCoords([longitude, latitude]);
                setGeoWarning(null);
                // Fetch address
                try {
                    const res = await fetch(`${API_URL}/reverse-geocode?lat=${latitude}&lng=${longitude}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.place_name) {
                            setOriginQuery(data.place_name);
                        }
                    }
                }
                catch (err) {
                    console.error("Reverse geocode failed", err);
                    // Fallback if needed, but coords are already set
                    setOriginQuery("Mi ubicación actual");
                }
            }, (err) => {
                console.error("Geolocation error:", err);
                if (!window.isSecureContext) {
                    setGeoWarning("Este navegador esta abriendo la app en HTTP y puede bloquear la ubicacion. Prueba abrir la web con URL HTTPS.");
                    return;
                }
                if (err.code === err.PERMISSION_DENIED) {
                    setGeoWarning("Permiso de ubicacion denegado por el navegador o el sistema. Revisa permisos del navegador y del sistema operativo.");
                    return;
                }
                if (err.code === err.POSITION_UNAVAILABLE) {
                    setGeoWarning("No se pudo obtener tu ubicacion. Verifica GPS activo y precision de ubicacion.");
                    return;
                }
                if (err.code === err.TIMEOUT) {
                    setGeoWarning("La ubicacion tardo demasiado. Intenta nuevamente con mejor senal GPS.");
                    return;
                }
                setGeoWarning("No se pudo leer tu ubicacion en este dispositivo.");
            }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    (0, react_1.useEffect)(() => {
        // debug: confirmar montaje cliente
        console.log("Client page: booting client-side code");
        setDebugStatus("montado: inicializando socket");
        let socket;
        (async () => {
            const { io } = await import("socket.io-client");
            const token = typeof window !== "undefined"
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
                            const res = await fetch(`${API_URL}/rides?state=ASIGNADO,EN_CURSO`, {
                                headers: { Authorization: `Bearer ${token}` },
                            });
                            if (res.ok) {
                                const rides = await res.json();
                                if (rides && rides.length > 0) {
                                    const activeRide = rides[0];
                                    const ride = {
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
                        }
                        catch (err) {
                            console.warn("Error fetching active ride:", err);
                        }
                    })();
                }
            };
            const onCreated = (ride) => {
                setCurrentRide(ride);
                setHistory((h) => [ride, ...h]);
                setMessages((m) => [...m, `Ride created ${ride.id}`]);
                setDebugStatus(`ride created: ${ride.id}`);
            };
            const onAssigned = (ride) => {
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
            const onTracking = (loc) => {
                const lngLat = [Number(loc.lng), Number(loc.lat)];
                setDriverPos(lngLat);
            };
            const onStatus = (s) => {
                setMessages((m) => [...m, `Status: ${JSON.stringify(s)}`]);
                setDebugStatus(`status: ${JSON.stringify(s)}`);
                // Use functional update to check the CURRENT state value
                setCurrentRide((cr) => {
                    if (!cr)
                        return null; // No active ride
                    if (cr.id !== s.rideId)
                        return cr; // Mismatched ride ID
                    return {
                        ...cr,
                        state: s.newState,
                        finalFare: s.finalFare ?? cr.finalFare,
                    };
                });
            };
            const onPaymentConfirmed = (data) => {
                setMessages((m) => [...m, `Pago confirmado ${data.rideId}`]);
                if (activeRideIdRef.current === data.rideId || currentRide?.id === data.rideId) {
                    // Limpiar sin depender de recarga completa
                    clearRideState();
                }
            };
            const onChatMessage = (msg) => {
                if (!msg?.rideId || msg.rideId !== activeRideIdRef.current)
                    return;
                // Ignore own messages (optimistically added)
                if (msg.role === "PASSENGER")
                    return;
                setChatMessages((prev) => [...prev, msg]);
                if (msg.role === "DRIVER")
                    setChatOpen(true);
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
    (0, react_1.useEffect)(() => {
        if (currentRide?.state === "CANCELADO" &&
            (!currentRide.finalFare || currentRide.finalFare <= 0)) {
            alert("El viaje fue cancelado.");
            clearRideState();
        }
    }, [currentRide]);
    // Fallback: si el modal final queda colgado por pérdida de evento, cerrar solo.
    (0, react_1.useEffect)(() => {
        if (!currentRide)
            return;
        const isFinishedWithFare = (currentRide.state === "FINALIZADO" || currentRide.state === "CANCELADO") &&
            (currentRide.finalFare || 0) > 0;
        if (!isFinishedWithFare)
            return;
        const token = typeof window !== "undefined" ? localStorage.getItem("movi:token") : null;
        const checkTimer = setTimeout(async () => {
            if (!token)
                return;
            try {
                const res = await fetch(`${API_URL}/rides?state=ASIGNADO,EN_CURSO`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok)
                    return;
                const rides = await res.json();
                if (!Array.isArray(rides) || rides.length === 0) {
                    clearRideState();
                }
            }
            catch { }
        }, 4000);
        const forceCloseTimer = setTimeout(() => {
            clearRideState();
        }, 20000);
        return () => {
            clearTimeout(checkTimer);
            clearTimeout(forceCloseTimer);
        };
    }, [currentRide]);
    (0, react_1.useEffect)(() => {
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
    (0, react_1.useEffect)(() => {
        if (!currentRide)
            return;
        if (!(currentRide.state === "ASIGNADO" || currentRide.state === "EN_CURSO" || currentRide.state === "PENDIENTE")) {
            return;
        }
        const origin = [currentRide.originLng, currentRide.originLat];
        const dest = [currentRide.destLng, currentRide.destLat];
        setOriginCoords((prev) => prev ?? origin);
        setDestCoords((prev) => prev ?? dest);
        if (!routeGeometry || routeGeometry.length === 0) {
            void fetchDirections(origin, dest);
        }
        const token = typeof window !== "undefined" ? localStorage.getItem("movi:token") : null;
        if (!token || (originQuery && destQuery))
            return;
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
                    setOriginQuery(data.place_name || data.text || "Origen");
                }
                if (dRes && dRes.ok) {
                    const data = await dRes.json();
                    setDestQuery(data.place_name || data.text || "Destino");
                }
            }
            catch (err) {
                console.warn("Error restoring route names:", err);
            }
        })();
    }, [currentRide, routeGeometry, originQuery, destQuery]);
    const register = async (e) => {
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
        }
        catch (err) {
            console.error("register error", err);
        }
        finally {
            setRegistering(false);
        }
    };
    const distanceKm = (origin, dest) => {
        const toRad = (val) => (val * Math.PI) / 180;
        const r = 6371;
        const dLat = toRad(dest[1] - origin[1]);
        const dLng = toRad(dest[0] - origin[0]);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(origin[1])) *
                Math.cos(toRad(dest[1])) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return r * c;
    };
    const calculateFare = (distance) => {
        const baseFare = 9000;
        if (distance <= 1)
            return baseFare;
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
        if (!currentRide)
            return;
        setCancelReason("");
        setCancelReasonOther("");
        setShowCancelModal(true);
    };
    const confirmCancelRide = () => {
        if (!currentRide)
            return;
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
        if (!currentRide || !user)
            return;
        const text = chatInput.trim();
        if (!text)
            return;
        if (activeRideIdRef.current !== currentRide.id) {
            activeRideIdRef.current = currentRide.id;
            passengerRef.current?.emit("ride:join", {
                rideId: currentRide.id,
                userId: user.id,
            });
        }
        const payload = {
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
    const geocodeAddress = async (query, limit = 10) => {
        if (!query.trim() || query.trim().length < 2)
            return [];
        const searchQuery = query.trim();
        try {
            setGeocodingError(null);
            const response = await fetch(`${API_URL}/geocode?query=${encodeURIComponent(searchQuery)}&limit=${limit}`);
            if (!response.ok) {
                console.error("Geocoding error:", response.status);
                setGeocodingError("Error al buscar ubicaciones. Verifica la conexión.");
                return [];
            }
            const data = await response.json();
            if (!data.features || data.features.length === 0) {
                return [];
            }
            return data.features;
        }
        catch (error) {
            console.error("Geocoding error:", error);
            setGeocodingError("No se pudo conectar con el servidor de búsqueda.");
            return [];
        }
    };
    const fetchDirections = async (origin, dest) => {
        try {
            // Por ahora usar línea recta simple (puedes integrar OSRM más tarde para rutas reales)
            // OSRM es gratuito: http://router.project-osrm.org/route/v1/driving/
            const res = await fetch(`http://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?` +
                `geometries=geojson&overview=full&steps=true`);
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
                const coords = route.geometry.coordinates;
                // Información adicional útil
                const distance = (route.distance / 1000).toFixed(1); // km
                const duration = Math.round(route.duration / 60); // minutos
                console.log(`Ruta calculada: ${distance}km, ~${duration} min, ${coords.length} puntos`);
                setRouteGeometry(coords);
            }
            else {
                console.warn("No se encontró ninguna ruta, usando línea recta");
                setRouteGeometry([origin, dest]);
            }
        }
        catch (err) {
            console.error("Directions error:", err);
            setRouteGeometry([origin, dest]);
        }
    };
    const handleOriginChange = (query) => {
        setOriginQuery(query);
        if (debounceTimerRef.current)
            clearTimeout(debounceTimerRef.current);
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
    const selectOriginSuggestion = async (feature) => {
        const [lng, lat] = feature.center;
        setOriginQuery(feature.place_name);
        setOriginCoords([lng, lat]);
        setOriginSuggestions([]);
        if (destCoords) {
            await fetchDirections([lng, lat], destCoords);
        }
    };
    const handleDestChange = (query) => {
        setDestQuery(query);
        if (debounceTimerRef.current)
            clearTimeout(debounceTimerRef.current);
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
    const selectDestSuggestion = async (feature) => {
        const [lng, lat] = feature.center;
        setDestQuery(feature.place_name);
        setDestCoords([lng, lat]);
        setDestSuggestions([]);
        if (originCoords) {
            await fetchDirections(originCoords, [lng, lat]);
        }
    };
    const swapPlaces = () => {
        if (!originCoords || !destCoords)
            return;
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
            lngLat: driverCoords,
            color: "#22c55e",
            title: "Conductor",
        });
    return ((0, jsx_runtime_1.jsxs)("div", { style: {
            position: "relative",
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
        }, children: [user && ((0, jsx_runtime_1.jsx)("div", { style: {
                    position: "fixed",
                    top: isMobile ? 10 : 24,
                    right: isMobile ? 10 : 24,
                    zIndex: 1100,
                }, children: (0, jsx_runtime_1.jsx)("button", { onClick: handleLogout, style: {
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
                    }, children: "Cerrar sesi\u00F3n" }) })), geoWarning && ((0, jsx_runtime_1.jsx)("div", { style: {
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
                }, children: geoWarning })), (0, jsx_runtime_1.jsx)(LeafletMap_1.default, { center: originCoords || destCoords || [-57.6, -25.3], zoom: 13, markers: markers, route: originCoords &&
                    destCoords &&
                    routeGeometry &&
                    routeGeometry.length > 0
                    ? routeGeometry
                    : undefined, style: { width: "100%", height: "100%" } }), (!currentRide ||
                currentRide.state === "PENDIENTE" ||
                currentRide.state === "CANCELADO") &&
                !waitingDriver && ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
                    width: isMobile ? "auto" : "420px",
                    maxWidth: isMobile ? "none" : "calc(100vw - 64px)",
                    maxHeight: isMobile ? "46vh" : "none",
                    overflowY: isMobile ? "auto" : "visible",
                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                            fontWeight: 600,
                            marginBottom: 16,
                            fontSize: 20,
                            color: "#000",
                            letterSpacing: "-0.5px",
                        }, children: user ? `Hola, ${user.name}` : "¿A dónde vamos?" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { position: "relative" }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "12px",
                                            padding: "14px 16px",
                                            background: "#f5f5f7",
                                            borderRadius: "12px",
                                            border: "2px solid transparent",
                                            transition: "all 0.2s ease",
                                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                                    width: "8px",
                                                    height: "8px",
                                                    borderRadius: "50%",
                                                    background: "#007AFF",
                                                } }), (0, jsx_runtime_1.jsx)("input", { value: originQuery, onChange: (e) => handleOriginChange(e.target.value), placeholder: "Punto de partida", style: {
                                                    flex: 1,
                                                    border: "none",
                                                    background: "transparent",
                                                    color: "#000",
                                                    fontSize: 15,
                                                    fontWeight: 500,
                                                    outline: "none",
                                                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                                } })] }), originSuggestions.length > 0 && ((0, jsx_runtime_1.jsx)("div", { style: {
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
                                        }, children: originSuggestions.map((s, i) => ((0, jsx_runtime_1.jsx)("div", { onClick: () => selectOriginSuggestion(s), style: {
                                                padding: "12px 16px",
                                                cursor: "pointer",
                                                borderBottom: i < originSuggestions.length - 1
                                                    ? "1px solid #f0f0f0"
                                                    : "none",
                                                fontSize: 14,
                                                color: "#000",
                                                fontWeight: 500,
                                                transition: "background 0.15s ease",
                                            }, onMouseEnter: (e) => (e.currentTarget.style.background = "#f5f5f7"), onMouseLeave: (e) => (e.currentTarget.style.background = "transparent"), children: s.place_name }, i))) }))] }), (0, jsx_runtime_1.jsxs)("div", { style: { position: "relative" }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "12px",
                                            padding: "14px 16px",
                                            background: "#f5f5f7",
                                            borderRadius: "12px",
                                            border: "2px solid transparent",
                                            transition: "all 0.2s ease",
                                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                                    width: "8px",
                                                    height: "8px",
                                                    borderRadius: "2px",
                                                    background: "#FF3B30",
                                                } }), (0, jsx_runtime_1.jsx)("input", { value: destQuery, onChange: (e) => handleDestChange(e.target.value), placeholder: "\u00BFA d\u00F3nde vas?", style: {
                                                    flex: 1,
                                                    border: "none",
                                                    background: "transparent",
                                                    color: "#000",
                                                    fontSize: 15,
                                                    fontWeight: 500,
                                                    outline: "none",
                                                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                                } })] }), destSuggestions.length > 0 && ((0, jsx_runtime_1.jsx)("div", { style: {
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
                                        }, children: destSuggestions.map((s, i) => ((0, jsx_runtime_1.jsx)("div", { onClick: () => selectDestSuggestion(s), style: {
                                                padding: "12px 16px",
                                                cursor: "pointer",
                                                borderBottom: i < destSuggestions.length - 1
                                                    ? "1px solid #f0f0f0"
                                                    : "none",
                                                fontSize: 14,
                                                color: "#000",
                                                fontWeight: 500,
                                                transition: "background 0.15s ease",
                                            }, onMouseEnter: (e) => (e.currentTarget.style.background = "#f5f5f7"), onMouseLeave: (e) => (e.currentTarget.style.background = "transparent"), children: s.place_name }, i))) }))] }), geocoding && ((0, jsx_runtime_1.jsx)("div", { style: {
                                    color: "#86868b",
                                    fontSize: 13,
                                    textAlign: "center",
                                    marginTop: 4,
                                }, children: "Buscando..." })), geocodingError && !geocoding && ((0, jsx_runtime_1.jsx)("div", { style: {
                                    color: "#FF3B30",
                                    fontSize: 12,
                                    textAlign: "center",
                                    marginTop: 4,
                                    padding: "6px 12px",
                                    background: "#fff1f0",
                                    borderRadius: 8,
                                }, children: geocodingError })), (0, jsx_runtime_1.jsx)(ui_1.Button, { onClick: requestRide, disabled: waitingDriver, style: {
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
                                }, children: waitingDriver ? "Buscando conductor..." : "Solicitar viaje" })] })] })), currentRide &&
                (currentRide.state === "ASIGNADO" ||
                    currentRide.state === "EN_CURSO") && ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)",
                    width: isMobile ? "auto" : "420px",
                    maxWidth: isMobile ? "none" : "calc(100vw - 64px)",
                    maxHeight: isMobile ? "52vh" : "none",
                    overflowY: isMobile ? "auto" : "visible",
                }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 14, color: "#86868b", marginBottom: 12 }, children: currentRide.state === "ASIGNADO"
                            ? "Conductor asignado"
                            : "Viaje en curso" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            display: "flex",
                            alignItems: "center",
                            gap: "16px",
                            marginBottom: 20,
                            paddingBottom: 20,
                            borderBottom: "1px solid #f0f0f0",
                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
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
                                }, children: currentRide.driver?.name?.charAt(0)?.toUpperCase() || "C" }), (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1 }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                            fontSize: 18,
                                            fontWeight: 600,
                                            color: "#000",
                                            marginBottom: 4,
                                        }, children: currentRide.driver?.name || "Conductor" }), currentRide.vehicle && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                            display: "grid",
                                            gridTemplateColumns: "auto 1fr",
                                            columnGap: 12,
                                            rowGap: 4,
                                            fontSize: 13,
                                            marginTop: 8,
                                        }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontWeight: 600, color: "#333" }, children: "Modelo:" }), (0, jsx_runtime_1.jsxs)("span", { style: { color: "#666" }, children: [currentRide.vehicle.marca, " ", currentRide.vehicle.modelo] }), (0, jsx_runtime_1.jsx)("span", { style: { fontWeight: 600, color: "#333" }, children: "Color:" }), (0, jsx_runtime_1.jsx)("span", { style: { color: "#666" }, children: currentRide.vehicle.color || "No especificado" }), (0, jsx_runtime_1.jsx)("span", { style: { fontWeight: 600, color: "#333" }, children: "Chapa:" }), (0, jsx_runtime_1.jsx)("span", { style: { color: "#666" }, children: currentRide.vehicle.placa || "No visible" })] }))] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: 16 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    padding: "12px",
                                    background: "#f5f5f7",
                                    borderRadius: "12px",
                                    marginBottom: 8,
                                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                            width: "8px",
                                            height: "8px",
                                            borderRadius: "50%",
                                            background: "#007AFF",
                                        } }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 14, color: "#000" }, children: originQuery ||
                                            `${currentRide.originLat.toFixed(4)}, ${currentRide.originLng.toFixed(4)}` })] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    padding: "12px",
                                    background: "#f5f5f7",
                                    borderRadius: "12px",
                                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                            width: "8px",
                                            height: "8px",
                                            borderRadius: "2px",
                                            background: "#FF3B30",
                                        } }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 14, color: "#000" }, children: destQuery ||
                                            `${currentRide.destLat.toFixed(4)}, ${currentRide.destLng.toFixed(4)}` })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "16px",
                            background: "#f5f5f7",
                            borderRadius: "12px",
                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 14, color: "#86868b" }, children: "Tarifa estimada" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 20, fontWeight: 700, color: "#007AFF" }, children: formatGuarani(currentRide.estimatedFare ?? 0) })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setChatOpen(true), style: {
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
                        }, children: "Chatear con el conductor" }), (0, jsx_runtime_1.jsx)("div", { style: {
                            marginTop: 16,
                            padding: "12px",
                            background: currentRide.state === "EN_CURSO" ? "#34C759" : "#007AFF",
                            borderRadius: "12px",
                            color: "white",
                            textAlign: "center",
                            fontSize: 14,
                            fontWeight: 600,
                        }, children: currentRide.state === "ASIGNADO"
                            ? "El conductor va en camino..."
                            : "En camino al destino" })] })), chatOpen &&
                currentRide &&
                (currentRide.state === "ASIGNADO" ||
                    currentRide.state === "EN_CURSO") && ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px 16px",
                            borderBottom: "1px solid #f0f0f0",
                        }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 14, fontWeight: 600 }, children: ["Chat con ", currentRide.driver?.name || "conductor"] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setChatOpen(false), style: {
                                    background: "transparent",
                                    border: "none",
                                    fontSize: 16,
                                    cursor: "pointer",
                                }, children: "X" })] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            padding: "12px 16px",
                            maxHeight: "240px",
                            overflowY: "auto",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                        }, children: [chatMessages.length === 0 && ((0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, color: "#86868b" }, children: "Aun no hay mensajes" })), chatMessages.map((m, i) => ((0, jsx_runtime_1.jsx)("div", { style: {
                                    alignSelf: m.role === "PASSENGER" ? "flex-end" : "flex-start",
                                    background: m.role === "PASSENGER" ? "#007AFF" : "#f5f5f7",
                                    color: m.role === "PASSENGER" ? "white" : "#000",
                                    padding: "8px 10px",
                                    borderRadius: "10px",
                                    fontSize: 13,
                                    maxWidth: "80%",
                                }, children: m.text }, `${m.ts}-${i}`)))] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            display: "flex",
                            gap: 8,
                            padding: "12px 16px",
                            borderTop: "1px solid #f0f0f0",
                        }, children: [(0, jsx_runtime_1.jsx)("input", { value: chatInput, onChange: (e) => setChatInput(e.target.value), onKeyDown: (e) => (e.key === "Enter" ? sendChat() : null), placeholder: "Escribe un mensaje", style: {
                                    flex: 1,
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "10px",
                                    padding: "8px 10px",
                                    fontSize: 13,
                                    outline: "none",
                                } }), (0, jsx_runtime_1.jsx)("button", { onClick: sendChat, style: {
                                    background: "#007AFF",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "10px",
                                    padding: "8px 12px",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }, children: "Enviar" })] })] })), currentRide && currentRide.state !== "FINALIZADO" && ((0, jsx_runtime_1.jsx)("div", { style: {
                    position: "fixed",
                    top: isMobile ? 10 : "auto",
                    right: isMobile ? 128 : "auto",
                    bottom: isMobile ? "auto" : 24,
                    left: isMobile ? "auto" : 24,
                    zIndex: 1000,
                } })), showCancelModal && currentRide && ((0, jsx_runtime_1.jsx)("div", { style: {
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.45)",
                    zIndex: 2100,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 12,
                }, children: (0, jsx_runtime_1.jsxs)("div", { style: {
                        background: "#fff",
                        width: isMobile ? "100%" : 440,
                        maxWidth: "100%",
                        borderRadius: isMobile ? "18px 18px 14px 14px" : 18,
                        padding: 16,
                        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                        maxHeight: "78vh",
                        overflowY: "auto",
                    }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 18, fontWeight: 700, marginBottom: 8 }, children: "\u00BFPor qu\u00E9 deseas cancelar este viaje?" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 13, color: "#666", marginBottom: 12 }, children: "Tu respuesta nos ayuda a mejorar el servicio." }), (0, jsx_runtime_1.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: CANCEL_REASONS.map((reason) => ((0, jsx_runtime_1.jsx)("button", { onClick: () => setCancelReason(reason), style: {
                                    textAlign: "left",
                                    padding: "10px 12px",
                                    borderRadius: 10,
                                    border: cancelReason === reason
                                        ? "1px solid #007AFF"
                                        : "1px solid #e5e7eb",
                                    background: cancelReason === reason ? "#eef6ff" : "#fff",
                                    cursor: "pointer",
                                    fontSize: 14,
                                }, children: reason }, reason))) }), cancelReason === "Otro" && ((0, jsx_runtime_1.jsx)("textarea", { value: cancelReasonOther, onChange: (e) => setCancelReasonOther(e.target.value), placeholder: "Especifica el motivo", style: {
                                marginTop: 10,
                                width: "100%",
                                minHeight: 80,
                                borderRadius: 10,
                                border: "1px solid #d1d5db",
                                padding: 10,
                                fontSize: 14,
                                outline: "none",
                            } })), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 14 }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setShowCancelModal(false), style: {
                                        flex: 1,
                                        padding: "11px 12px",
                                        borderRadius: 10,
                                        border: "1px solid #d1d5db",
                                        background: "#fff",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                    }, children: "Volver" }), (0, jsx_runtime_1.jsx)("button", { onClick: confirmCancelRide, style: {
                                        flex: 1,
                                        padding: "11px 12px",
                                        borderRadius: 10,
                                        border: "none",
                                        background: "#ff3b30",
                                        color: "#fff",
                                        cursor: "pointer",
                                        fontWeight: 700,
                                    }, children: "Confirmar cancelaci\u00F3n" })] })] }) })), currentRide &&
                (currentRide.state === "FINALIZADO" ||
                    (currentRide.state === "CANCELADO" &&
                        (currentRide.finalFare || 0) > 0)) && ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                            fontSize: 24,
                            fontWeight: 700,
                            marginBottom: 8,
                            color: "#000",
                        }, children: currentRide.state === "CANCELADO"
                            ? "Viaje Finalizado (Concluido)"
                            : "¡Viaje Finalizado!" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 15, color: "#86868b", marginBottom: 24 }, children: "Esperamos que hayas disfrutado el viaje con" }), (0, jsx_runtime_1.jsx)("div", { style: {
                            fontSize: 28,
                            fontWeight: 800,
                            color: "#007AFF",
                            marginBottom: 32,
                        }, children: currentRide.driver?.name || "Conductor" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            background: "#f5f5f7",
                            padding: "20px",
                            borderRadius: "16px",
                            marginBottom: 32,
                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 13, color: "#86868b", marginBottom: 4 }, children: "Total a pagar" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 32, fontWeight: 700, color: "#000" }, children: formatGuarani(currentRide.finalFare ?? currentRide.estimatedFare) })] }), currentRide.finalFare && currentRide.finalFare > 0 ? ((0, jsx_runtime_1.jsx)("div", { style: { fontSize: 13, color: "#86868b", marginTop: 16 }, children: "Esperando confirmaci\u00F3n del conductor..." })) : ((0, jsx_runtime_1.jsx)(ui_1.Button, { onClick: () => {
                            clearRideState();
                        }, style: {
                            width: "100%",
                            padding: "16px",
                            fontSize: 16,
                            borderRadius: "14px",
                            background: "#000",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                            fontWeight: 600,
                        }, children: "Entendido" }))] })), "|", ((waitingDriver && !["ASIGNADO", "EN_CURSO"].includes(currentRide?.state ?? "")) ||
                currentRide?.state === "PENDIENTE") && ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                }, children: [(0, jsx_runtime_1.jsx)("div", { style: { marginBottom: 16 }, children: (0, jsx_runtime_1.jsx)("div", { style: {
                                width: "48px",
                                height: "48px",
                                margin: "0 auto",
                                borderRadius: "50%",
                                border: "3px solid #007AFF",
                                borderTopColor: "transparent",
                                animation: "spin 1s linear infinite",
                            } }) }), (0, jsx_runtime_1.jsx)("div", { style: {
                            fontSize: 18,
                            fontWeight: 600,
                            color: "#000",
                            marginBottom: 8,
                        }, children: "Buscando conductor" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 14, color: "#86868b", marginBottom: 16 }, children: "Espera mientras un conductor acepta tu solicitud..." }), (0, jsx_runtime_1.jsx)("button", { onClick: () => {
                            if (currentRide) {
                                openCancelRideModal();
                            }
                            else {
                                setWaitingDriver(false);
                            }
                        }, style: {
                            background: "transparent",
                            border: "1px solid #d1d1d6",
                            borderRadius: 10,
                            padding: "10px 24px",
                            fontSize: 14,
                            color: "#ff3b30",
                            cursor: "pointer",
                            fontWeight: 500,
                        }, children: "Cancelar b\u00FAsqueda" }), (0, jsx_runtime_1.jsx)("style", { children: `
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
          ` })] }))] }));
}

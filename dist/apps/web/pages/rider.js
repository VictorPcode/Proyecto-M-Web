"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = RiderPage;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const router_1 = require("next/router");
const LeafletMap_1 = __importDefault(require("../../../packages/ui/LeafletMap"));
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const RIDER_RIDE_SNAPSHOT_KEY = "movi:rider:rideSnapshot";
const formatGuarani = (value) => new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
}).format(value);
function RiderPage() {
    const [requests, setRequests] = (0, react_1.useState)([]);
    const [isMobile, setIsMobile] = (0, react_1.useState)(false);
    const [debugStatus, setDebugStatus] = (0, react_1.useState)("cliente no montado");
    const socketRef = (0, react_1.useRef)(null);
    const [user, setUser] = (0, react_1.useState)(null);
    const [driverLocation, setDriverLocation] = (0, react_1.useState)([
        -57.6, -25.3,
    ]);
    const [activeRide, setActiveRide] = (0, react_1.useState)(null);
    const [routeGeometry, setRouteGeometry] = (0, react_1.useState)(null);
    const [chatOpen, setChatOpen] = (0, react_1.useState)(false);
    const [chatMessages, setChatMessages] = (0, react_1.useState)([]);
    const [chatInput, setChatInput] = (0, react_1.useState)("");
    // New state to manage manual payment confirmation modal
    const [showPaymentModal, setShowPaymentModal] = (0, react_1.useState)(false);
    const [showManualInputModal, setShowManualInputModal] = (0, react_1.useState)(false);
    const [manualInputAmount, setManualInputAmount] = (0, react_1.useState)("0");
    const [pendingFare, setPendingFare] = (0, react_1.useState)(0);
    const [approvalError, setApprovalError] = (0, react_1.useState)(false);
    const [geoWarning, setGeoWarning] = (0, react_1.useState)(null);
    const activeRideIdRef = (0, react_1.useRef)(null);
    const activeRideRef = (0, react_1.useRef)(null);
    const router = (0, router_1.useRouter)();
    (0, react_1.useEffect)(() => {
        if (typeof window === "undefined")
            return;
        const update = () => setIsMobile(window.innerWidth <= 768);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);
    (0, react_1.useEffect)(() => {
        const raw = typeof window !== "undefined" ? localStorage.getItem("movi:user") : null;
        const token = typeof window !== "undefined" ? localStorage.getItem("movi:token") : null;
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
                    if (snapshot?.userId !== parsed.id)
                        return;
                    if (Array.isArray(snapshot?.requests))
                        setRequests(snapshot.requests);
                    if (snapshot?.activeRide)
                        setActiveRide(snapshot.activeRide);
                    if (Array.isArray(snapshot?.routeGeometry))
                        setRouteGeometry(snapshot.routeGeometry);
                }
            }
            catch (err) {
                console.warn("Error restoring rider snapshot:", err);
            }
        }
        catch (e) {
            console.error("error parsing stored user", e);
            localStorage.removeItem("movi:user");
            localStorage.removeItem("movi:token");
            router.replace("/driver-login");
            return;
        }
        let socket;
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
            socket.on("driver:nearby_request", (r) => {
                console.log("Nueva solicitud recibida:", r);
                setRequests((prev) => {
                    if (!r.origin ||
                        typeof r.origin.lat !== "number" ||
                        typeof r.origin.lng !== "number") {
                        return prev;
                    }
                    const ride = activeRideRef.current;
                    if (ride?.destination?.lat && ride?.destination?.lng) {
                        const distance = distanceKm(ride.destination.lat, ride.destination.lng, r.origin?.lat, r.origin?.lng);
                        if (distance === null || distance > 1)
                            return prev;
                    }
                    // Evitar duplicados
                    if (prev.some((x) => x.id === r.rideId))
                        return prev;
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
            });
            socket.on("ride:status_changed", (s) => {
                if (s.newState === "CANCELADO") {
                    // Remove cancelled ride from pending list
                    setRequests((prev) => prev.filter((x) => x.id !== s.rideId));
                    // Clear active ride if it was this one
                    setActiveRide((prev) => prev && prev.id === s.rideId ? null : prev);
                }
                else {
                    setRequests((prev) => prev.map((x) => x.id === s.rideId ? { ...x, state: s.newState } : x));
                    setActiveRide((prev) => prev && prev.id === s.rideId
                        ? { ...prev, state: s.newState }
                        : prev);
                }
            });
            socket.on("ride:chat_message", (msg) => {
                if (!msg?.rideId || msg.rideId !== activeRideIdRef.current)
                    return;
                // Ignore own messages (optimistically added)
                if (msg.role === "DRIVER")
                    return;
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
                        localStorage.setItem("movi:vehicle", JSON.stringify(profile.vehicle));
                    }
                }
                if (ridesRes.ok) {
                    const rides = await ridesRes.json();
                    // Reemplazar completamente en lugar de agregar para evitar duplicados
                    const mapped = rides.map((r) => ({
                        id: r.id,
                        origin: { lat: r.originLat, lng: r.originLng },
                        destination: { lat: r.destLat, lng: r.destLng },
                        estimatedFare: r.estimatedFare,
                        state: r.state,
                        passengerId: r.passengerId,
                        passengerName: r.passenger?.name || "Pasajero",
                    }));
                    setRequests(filterRequestsByActiveRide(mapped));
                    // Reverse-geocode names for DB-loaded rides
                    mapped.forEach(async (req) => {
                        try {
                            const [oRes, dRes] = await Promise.all([
                                fetch(`${API_URL}/reverse-geocode?lat=${req.origin.lat}&lng=${req.origin.lng}`, { headers: { Authorization: `Bearer ${token}` } }),
                                fetch(`${API_URL}/reverse-geocode?lat=${req.destination.lat}&lng=${req.destination.lng}`, { headers: { Authorization: `Bearer ${token}` } }),
                            ]);
                            const [oData, dData] = await Promise.all([oRes.json(), dRes.json()]);
                            setRequests((prev) => prev.map((r2) => r2.id === req.id
                                ? { ...r2, originName: oData.place_name || oData.text, destName: dData.place_name || dData.text }
                                : r2));
                        }
                        catch { }
                    });
                }
                // Fetch active rides (ASIGNADO or EN_CURSO) to restore on page reload
                try {
                    const activeRes = await fetch(`${API_URL}/rides?state=ASIGNADO,EN_CURSO`, { headers: { Authorization: `Bearer ${token}` } });
                    if (activeRes.ok) {
                        const activeRides = await activeRes.json();
                        if (activeRides && activeRides.length > 0) {
                            const active = activeRides[0];
                            const ride = {
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
                                    ? { ...prev, originName: oData.place_name || oData.text, destName: dData.place_name || dData.text }
                                    : prev);
                            }
                            catch { }
                        }
                    }
                }
                catch (err) {
                    console.warn("Error fetching active rides:", err);
                }
            }
            catch (err) {
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
    (0, react_1.useEffect)(() => {
        activeRideRef.current = activeRide;
        if (activeRide?.destination?.lat && activeRide?.destination?.lng) {
            setRequests((prev) => filterRequestsByActiveRide(prev));
        }
    }, [activeRide]);
    (0, react_1.useEffect)(() => {
        if (!activeRide)
            return;
        if (routeGeometry && routeGeometry.length > 0)
            return;
        if (activeRide.state === "EN_CURSO") {
            fetchDirections([activeRide.origin.lng, activeRide.origin.lat], [activeRide.destination.lng, activeRide.destination.lat]);
            return;
        }
        fetchDirections(driverLocation, [activeRide.origin.lng, activeRide.origin.lat]);
    }, [activeRide, routeGeometry, driverLocation]);
    (0, react_1.useEffect)(() => {
        if (typeof window === "undefined")
            return;
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
    (0, react_1.useEffect)(() => {
        if (typeof window === "undefined")
            return;
        if (!navigator.geolocation) {
            setGeoWarning("Este navegador no soporta geolocalizacion.");
            return;
        }
        if (!window.isSecureContext) {
            setGeoWarning("En telefonos, la ubicacion puede bloquearse en HTTP. Usa HTTPS o habilita permiso de ubicacion del sitio.");
        }
        const id = navigator.geolocation.watchPosition((pos) => {
            const loc = [
                pos.coords.longitude,
                pos.coords.latitude,
            ];
            setDriverLocation(loc);
            socketRef.current?.emit("driver:location", {
                lng: loc[0],
                lat: loc[1],
            });
        }, (err) => {
            console.warn("Driver geolocation error:", err);
            if (!window.isSecureContext) {
                setGeoWarning("La app esta en HTTP y el navegador puede bloquear la ubicacion del conductor. Abre la web con URL HTTPS.");
                return;
            }
            if (err.code === err.PERMISSION_DENIED) {
                setGeoWarning("Permiso de ubicacion denegado. Activalo en configuracion del navegador para este sitio.");
                return;
            }
            if (err.code === err.POSITION_UNAVAILABLE) {
                setGeoWarning("No se pudo obtener la ubicacion del conductor. Verifica GPS activo.");
                return;
            }
            if (err.code === err.TIMEOUT) {
                setGeoWarning("La ubicacion tardo demasiado. Intenta nuevamente con mejor senal GPS.");
                return;
            }
            setGeoWarning("No se pudo leer la ubicacion del conductor.");
        }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });
        return () => navigator.geolocation.clearWatch(id);
    }, []);
    (0, react_1.useEffect)(() => {
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
    const fetchDirections = async (origin, dest) => {
        try {
            const res = await fetch(`http://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?` +
                `geometries=geojson&overview=full&steps=true`);
            const data = await res.json();
            if (data.code !== "Ok") {
                setRouteGeometry([origin, dest]);
                return;
            }
            if (data.routes && data.routes.length > 0) {
                const coords = data.routes[0].geometry.coordinates;
                setRouteGeometry(coords);
            }
            else {
                setRouteGeometry([origin, dest]);
            }
        }
        catch (err) {
            console.error("Directions error:", err);
            setRouteGeometry([origin, dest]);
        }
    };
    const distanceKm = (lat1, lng1, lat2, lng2) => {
        if (typeof lat1 !== "number" ||
            typeof lng1 !== "number" ||
            typeof lat2 !== "number" ||
            typeof lng2 !== "number") {
            return null;
        }
        const toRad = (val) => (val * Math.PI) / 180;
        const r = 6371;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) *
                Math.cos(toRad(lat2)) *
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
    const filterRequestsByActiveRide = (list) => {
        const ride = activeRideRef.current;
        if (!ride?.destination?.lat || !ride?.destination?.lng)
            return list;
        return list.filter((req) => {
            const distance = distanceKm(ride.destination.lat, ride.destination.lng, req.origin?.lat, req.origin?.lng);
            return distance !== null && distance <= 1;
        });
    };
    const sendChat = (overrideText) => {
        if (!activeRide || !user)
            return;
        const text = typeof overrideText === "string" ? overrideText : chatInput.trim();
        if (!text)
            return;
        if (activeRideIdRef.current !== activeRide.id) {
            activeRideIdRef.current = activeRide.id;
            socketRef.current?.emit("ride:join", {
                rideId: activeRide.id,
                userId: user.id,
            });
        }
        const payload = {
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
    const accept = (ride) => {
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
        setActiveRide({ ...ride, state: "ASIGNADO" });
        setChatMessages([]);
        setChatOpen(false);
        setRequests((prev) => prev.filter((r) => r.id !== ride.id));
        if (ride?.origin) {
            // Al aceptar, mostramos ruta hacia el pasajero
            fetchDirections(driverLocation, [ride.origin.lng, ride.origin.lat]);
        }
    };
    const startRide = () => {
        if (!activeRide || !activeRide.origin)
            return;
        // 1. Validar proximidad (ej. 100 metros = 0.1km)
        const dist = distanceKm(driverLocation[1], driverLocation[0], activeRide.origin.lat, activeRide.origin.lng);
        console.log("Distancia al pasajero:", dist, "km");
        // Permitir un margen mayor (0.3km) para pruebas, o 0.1km para prod
        if (dist === null || dist > 0.3) {
            alert(`Debes estar en la ubicación de recogida para iniciar el viaje. Estás a ${(dist || 0).toFixed(2)}km.`);
            return;
        }
        // 2. Cambiar estado y ruta
        socketRef.current?.emit("driver:start_ride", activeRide.id);
        // Actualización optimista
        setActiveRide((prev) => (prev ? { ...prev, state: "EN_CURSO" } : null));
        // Cambiar ruta: Origen -> Destino
        if (activeRide.destination) {
            fetchDirections([activeRide.origin.lng, activeRide.origin.lat], [activeRide.destination.lng, activeRide.destination.lat]);
        }
    };
    const pass = (ride) => {
        // Simplemente remover de la lista (equivalente a "rechazar" pero con mejor UX)
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
        if (!activeRide)
            return;
        const rideId = activeRide.id;
        // Si state=PENDIENTE/ASIGNADO, no tiene sentido "En curso->Finalizar", pero validemos
        // que esté "EN_CURSO"
        // Distancia al destino
        let dist = 1000;
        if (activeRide.destination?.lat && activeRide.destination?.lng) {
            const d = distanceKm(driverLocation[1], driverLocation[0], activeRide.destination.lat, activeRide.destination.lng);
            if (d !== null)
                dist = d;
        }
        console.log("Distancia al destino:", dist, "km");
        // Limite: 0.2km
        if (dist > 0.2) {
            // Open custom modal instead of prompt
            setManualInputAmount("0");
            setShowManualInputModal(true);
        }
        else {
            // Finalizar normal
            // Calc distance from origin to here
            let traveled = 0;
            if (activeRide.origin?.lat && activeRide.origin?.lng) {
                const t = distanceKm(activeRide.origin.lat, activeRide.origin.lng, driverLocation[1], driverLocation[0]);
                if (t !== null)
                    traveled = t;
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
                lngLat: [req.origin.lng, req.origin.lat],
                color: "#FF3B30",
                title: "Solicitud",
            });
        }
    });
    const googleMapsUrl = activeRide?.origin && activeRide?.destination
        ? `https://www.google.com/maps/dir/?api=1&origin=${driverLocation[1]},${driverLocation[0]}` +
            `&destination=${activeRide.destination.lat},${activeRide.destination.lng}` +
            `&waypoints=${activeRide.origin.lat},${activeRide.origin.lng}`
        : "";
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [approvalError && ((0, jsx_runtime_1.jsx)("div", { style: {
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
                }, children: (0, jsx_runtime_1.jsxs)("div", { style: {
                        background: 'white',
                        padding: '40px',
                        borderRadius: '20px',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        textAlign: 'center',
                        maxWidth: '420px',
                        width: '90%',
                    }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                fontSize: 28,
                                fontWeight: 700,
                                marginBottom: 16,
                                color: '#000',
                            }, children: "Cuenta Pendiente" }), (0, jsx_runtime_1.jsx)("div", { style: {
                                fontSize: 16,
                                color: '#666',
                                marginBottom: 24,
                                lineHeight: 1.5,
                            }, children: "Tu cuenta de conductor a\u00FAn no ha sido aprobada. Espera la revisi\u00F3n de un administrador." }), (0, jsx_runtime_1.jsx)("button", { onClick: () => router.replace('/driver-login'), style: {
                                padding: '14px 32px',
                                background: '#007AFF',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontWeight: 600,
                                fontSize: 16,
                                cursor: 'pointer',
                                width: '100%',
                            }, children: "Volver al Login" })] }) })), !approvalError && ((0, jsx_runtime_1.jsxs)("div", { style: {
                    position: "relative",
                    width: "100vw",
                    height: "100vh",
                    overflow: "hidden",
                }, children: [(0, jsx_runtime_1.jsx)(LeafletMap_1.default, { center: driverLocation, zoom: 13, markers: markers, route: activeRide && routeGeometry && routeGeometry.length > 0
                            ? routeGeometry
                            : undefined, style: { width: "100%", height: "100%" } }), geoWarning && ((0, jsx_runtime_1.jsx)("div", { style: {
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
                        }, children: geoWarning })), (0, jsx_runtime_1.jsx)("div", { style: {
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
                        }, children: (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 13, color: "#000", fontWeight: 600 }, children: user?.name || "Conductor" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 11, color: "#444", marginTop: 2 }, children: user?.vehicle?.placa ? `Placa: ${user.vehicle.placa}` : "Sin vehículo" }), (0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 11, color: "#86868b", marginTop: 2 }, children: [requests.length, " solicitudes pendientes"] })] }), (0, jsx_runtime_1.jsx)("button", { onClick: handleLogout, style: {
                                        padding: "6px 12px",
                                        background: "#FF3B30",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "8px",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        whiteSpace: "nowrap",
                                    }, children: "Cerrar sesi\u00F3n" })] }) }), showManualInputModal && ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                        }, children: [(0, jsx_runtime_1.jsx)("h3", { style: { marginBottom: 16 }, children: "Finalizar Viaje (Distancia)" }), (0, jsx_runtime_1.jsx)("p", { style: { fontSize: 13, color: "#666", marginBottom: 16 }, children: "Est\u00E1s lejos del destino. Ingresa el monto a cobrar:" }), (0, jsx_runtime_1.jsx)("input", { type: "number", value: manualInputAmount, onChange: (e) => setManualInputAmount(e.target.value), style: {
                                    width: "100%",
                                    padding: "12px",
                                    fontSize: 24,
                                    textAlign: "center",
                                    marginBottom: 20,
                                    borderRadius: 12,
                                    border: "1px solid #ddd",
                                } }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setShowManualInputModal(false), style: {
                                            flex: 1,
                                            padding: 12,
                                            background: "#f5f5f7",
                                            border: "none",
                                            borderRadius: 12,
                                            fontWeight: 600,
                                        }, children: "Cancelar" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => {
                                            const finalFare = parseInt(manualInputAmount.replace(/\D/g, ""), 10) || 0;
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
                                        }, style: {
                                            flex: 1,
                                            padding: 12,
                                            background: "#000",
                                            color: "white",
                                            border: "none",
                                            borderRadius: 12,
                                            fontWeight: 600,
                                        }, children: "Confirmar" })] })] })), showPaymentModal && ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                        }, children: [(0, jsx_runtime_1.jsx)("h2", { style: {
                                    fontSize: "20px",
                                    fontWeight: "bold",
                                    marginBottom: "16px",
                                }, children: "Cobrar Viaje" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: "15px", color: "#666", marginBottom: "24px" }, children: "Total a recibir del pasajero:" }), (0, jsx_runtime_1.jsx)("div", { style: {
                                    fontSize: "32px",
                                    fontWeight: "bold",
                                    color: "#007AFF",
                                    marginBottom: "32px",
                                }, children: formatGuarani(pendingFare) }), (0, jsx_runtime_1.jsx)("button", { onClick: () => {
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
                                }, style: {
                                    width: "100%",
                                    padding: "16px",
                                    background: "#34C759",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "12px",
                                    fontWeight: "bold",
                                    fontSize: "16px",
                                    cursor: "pointer",
                                }, children: "Confirmar Pago Recibido" })] })), activeRide && ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 14, color: "#86868b", marginBottom: 8 }, children: "Viaje asignado" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                    fontSize: 16,
                                    fontWeight: 600,
                                    color: "#000",
                                    marginBottom: 12,
                                }, children: ["Recoger a ", activeRide.passengerName || "Pasajero"] }), (0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 13, color: "#86868b", marginBottom: 10 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 6 }, children: [(0, jsx_runtime_1.jsx)("span", { style: { color: "#007AFF", fontWeight: 700, minWidth: 12 }, children: "\u25CF" }), (0, jsx_runtime_1.jsx)("span", { children: activeRide.originName || `${activeRide.origin?.lat?.toFixed(4)}, ${activeRide.origin?.lng?.toFixed(4)}` })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", alignItems: "flex-start", gap: 6 }, children: [(0, jsx_runtime_1.jsx)("span", { style: { color: "#FF3B30", fontWeight: 700, minWidth: 12 }, children: "\u25CF" }), (0, jsx_runtime_1.jsx)("span", { children: activeRide.destName || `${activeRide.destination?.lat?.toFixed(4)}, ${activeRide.destination?.lng?.toFixed(4)}` })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [(0, jsx_runtime_1.jsx)("a", { href: googleMapsUrl, target: "_blank", rel: "noreferrer", style: {
                                                    flex: 1,
                                                    textAlign: "center",
                                                    background: "#1c1c1c",
                                                    color: "white",
                                                    padding: "10px 12px",
                                                    borderRadius: "10px",
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    textDecoration: "none",
                                                }, children: "Abrir en Google Maps" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setChatOpen(true), style: {
                                                    flex: 1,
                                                    background: "#007AFF",
                                                    color: "white",
                                                    padding: "10px 12px",
                                                    borderRadius: "10px",
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    border: "none",
                                                    cursor: "pointer",
                                                }, children: "Chatear" })] }), activeRide.state === "ASIGNADO" && ((0, jsx_runtime_1.jsx)("button", { onClick: startRide, style: {
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
                                        }, children: "Iniciar Viaje" })), activeRide.state === "EN_CURSO" && ((0, jsx_runtime_1.jsx)("button", { onClick: endRide, style: {
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
                                        }, children: "Finalizar Viaje" }))] })] })), requests.length > 0 && ((0, jsx_runtime_1.jsx)("div", { style: {
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
                        }, children: requests.map((req) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                                background: "rgba(255, 255, 255, 0.98)",
                                padding: "20px",
                                borderRadius: "16px",
                                backdropFilter: "blur(20px)",
                                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                                animation: "slideInRight 0.3s ease-out",
                            }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                                        fontSize: 16,
                                        fontWeight: 600,
                                        color: "#000",
                                        marginBottom: 12,
                                    }, children: ["Nueva solicitud de ", req.passengerName || "Pasajero"] }), (0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 13, color: "#555", marginBottom: 8 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }, children: [(0, jsx_runtime_1.jsx)("span", { style: { color: "#007AFF", fontWeight: 600, minWidth: 16 }, children: "\u25CF" }), (0, jsx_runtime_1.jsx)("span", { children: req.originName || `${req.origin?.lat?.toFixed(4)}, ${req.origin?.lng?.toFixed(4)}` })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", alignItems: "flex-start", gap: 6 }, children: [(0, jsx_runtime_1.jsx)("span", { style: { color: "#FF3B30", fontWeight: 600, minWidth: 16 }, children: "\u25CF" }), (0, jsx_runtime_1.jsx)("span", { children: req.destName || `${req.destination?.lat?.toFixed(4)}, ${req.destination?.lng?.toFixed(4)}` })] })] }), (0, jsx_runtime_1.jsx)("div", { style: {
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color: "#007AFF",
                                        marginTop: 12,
                                        marginBottom: 16,
                                    }, children: formatGuarani(req.estimatedFare ?? 0) }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => accept(req), style: {
                                                flex: 1,
                                                background: "#34C759",
                                                color: "white",
                                                padding: "12px 20px",
                                                borderRadius: "10px",
                                                fontSize: 14,
                                                fontWeight: 600,
                                                border: "none",
                                                cursor: "pointer",
                                                boxShadow: "0 2px 8px rgba(52, 199, 89, 0.3)",
                                            }, children: "Aceptar" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => pass(req), style: {
                                                flex: 1,
                                                background: "#f5f5f7",
                                                color: "#000",
                                                padding: "12px 20px",
                                                borderRadius: "10px",
                                                fontSize: 14,
                                                fontWeight: 500,
                                                border: "none",
                                                cursor: "pointer",
                                            }, children: "Pasar" })] })] }, req.id))) })), chatOpen && activeRide && ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                        }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "12px 16px",
                                    borderBottom: "1px solid #f0f0f0",
                                }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontSize: 14, fontWeight: 600 }, children: ["Chat con ", activeRide.passengerName || "Pasajero"] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setChatOpen(false), style: {
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
                                            alignSelf: m.role === "DRIVER" ? "flex-end" : "flex-start",
                                            background: m.role === "DRIVER" ? "#007AFF" : "#f5f5f7",
                                            color: m.role === "DRIVER" ? "white" : "#000",
                                            padding: "8px 10px",
                                            borderRadius: "10px",
                                            fontSize: 13,
                                            maxWidth: "80%",
                                        }, children: m.text }, `${m.ts}-${i}`)))] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                    padding: "12px 16px",
                                    borderTop: "1px solid #f0f0f0",
                                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                            display: "flex",
                                            gap: 6,
                                            overflowX: "auto",
                                            paddingBottom: 2,
                                        }, children: ["Estoy en camino", "Llego en 5 min", "He llegado"].map((reply) => ((0, jsx_runtime_1.jsx)("button", { onClick: () => sendChat(reply), style: {
                                                background: "#f0f0f0",
                                                border: "none",
                                                borderRadius: "16px",
                                                padding: "6px 10px",
                                                fontSize: "11px",
                                                whiteSpace: "nowrap",
                                                cursor: "pointer",
                                                color: "#333",
                                                fontWeight: 500,
                                            }, children: reply }, reply))) }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [(0, jsx_runtime_1.jsx)("input", { value: chatInput, onChange: (e) => setChatInput(e.target.value), onKeyDown: (e) => (e.key === "Enter" ? sendChat() : null), placeholder: "Escribe un mensaje", style: {
                                                    flex: 1,
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: "10px",
                                                    padding: "8px 10px",
                                                    fontSize: 13,
                                                    outline: "none",
                                                } }), (0, jsx_runtime_1.jsx)("button", { onClick: () => sendChat(), style: {
                                                    background: "#007AFF",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: "10px",
                                                    padding: "8px 12px",
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                }, children: "Enviar" })] })] })] })), requests.length === 0 && !activeRide && ((0, jsx_runtime_1.jsxs)("div", { style: {
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
                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                    fontSize: 18,
                                    fontWeight: 600,
                                    color: "#000",
                                    marginBottom: 8,
                                }, children: "Esperando solicitudes..." }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 14, color: "#86868b" }, children: "Te notificaremos cuando haya un viaje disponible" })] })), (0, jsx_runtime_1.jsx)("style", { children: `
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
      ` })] }))] }));
}

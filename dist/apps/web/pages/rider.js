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
exports.default = RiderPage;
exports.RiderPageDebug = RiderPageDebug;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const ui_1 = require("ui");
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
function RiderPage() {
    const [requests, setRequests] = (0, react_1.useState)([]);
    const [debugStatus, setDebugStatus] = (0, react_1.useState)("cliente no montado");
    const socketRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        let socket;
        (async () => {
            // marcar montado
            setDebugStatus("montado: inicializando socket");
            const { io } = await Promise.resolve().then(() => __importStar(require("socket.io-client")));
            socket = io(`${API_URL}/drivers`);
            socketRef.current = socket;
            socket.on("connect", () => {
                console.log("driver connected", socket.id);
                setDebugStatus(`conectado: ${socket.id}`);
            });
            socket.on("driver:nearby_request", (r) => {
                setRequests(prev => [{ id: r.rideId, origin: r.origin, destination: r.destination ?? r.origin, estimatedFare: r.estimatedFare ?? 0, state: "PENDIENTE" }, ...prev]);
                setDebugStatus(`received request ${r.rideId}`);
            });
            socket.on("ride:status_changed", (s) => {
                setRequests(prev => prev.map(x => (x.id === s.rideId ? { ...x, state: s.newState } : x)));
            });
            // fetch pendientes existentes vía REST
            try {
                const res = await fetch(`${API_URL}/rides?state=PENDIENTE`);
                if (res.ok) {
                    const rides = await res.json();
                    setRequests(prev => [
                        ...rides.map((r) => ({
                            id: r.id,
                            origin: { lat: r.originLat, lng: r.originLng },
                            destination: { lat: r.destLat, lng: r.destLng },
                            estimatedFare: r.estimatedFare,
                            state: r.state,
                        })),
                        ...prev,
                    ]);
                }
                else {
                    console.warn("Failed to fetch pending rides", res.status);
                }
            }
            catch (err) {
                console.warn("Error fetching pending rides:", err);
            }
        })();
        return () => {
            socketRef.current?.disconnect();
            socketRef.current = null;
            setDebugStatus("desconectado");
        };
    }, []);
    const accept = (ride) => {
        socketRef.current?.emit("driver:accept_ride", { rideId: ride.id, driverId: "demo-driver" });
        setRequests(prev => prev.map(r => (r.id === ride.id ? { ...r, state: "ASIGNADO" } : r)));
    };
    const start = (ride) => {
        socketRef.current?.emit("driver:start_ride", ride.id);
        setRequests(prev => prev.map(r => (r.id === ride.id ? { ...r, state: "EN_CURSO" } : r)));
    };
    const end = (ride) => {
        socketRef.current?.emit("driver:end_ride", ride.id);
        setRequests(prev => prev.map(r => (r.id === ride.id ? { ...r, state: "FINALIZADO" } : r)));
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "container", children: [(0, jsx_runtime_1.jsx)("div", { id: "rider-debug", style: { color: "white", marginBottom: 8 }, children: `RIDER DEBUG: ${debugStatus}` }), (0, jsx_runtime_1.jsx)(ui_1.Header, { title: "MOVI - Rider" }), (0, jsx_runtime_1.jsx)(ui_1.MapPlaceholder, { children: "\u00C1rea de trabajo (placeholder)" }), (0, jsx_runtime_1.jsxs)("div", { className: "list", style: { marginTop: 12 }, children: [requests.length === 0 && (0, jsx_runtime_1.jsx)("div", { className: "card", style: { color: "var(--muted)" }, children: "No hay solicitudes" }), requests.map(r => ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)(ui_1.RideCard, { id: r.id, origin: r.origin, destination: r.destination, onAccept: () => accept(r) }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 8, marginBottom: 12 }, children: [(0, jsx_runtime_1.jsx)("button", { className: "btn small", onClick: () => start(r), children: "Start" }), (0, jsx_runtime_1.jsx)("button", { className: "ghost small", onClick: () => end(r), children: "End" })] })] }, r.id)))] }), (0, jsx_runtime_1.jsxs)("div", { style: { marginTop: 16 }, className: "card", children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 700 }, children: "Controles demo" }), (0, jsx_runtime_1.jsxs)("div", { style: { marginTop: 8, display: "flex", gap: 8 }, children: [(0, jsx_runtime_1.jsx)("button", { className: "btn", onClick: () => socketRef.current?.emit("driver:location", { lat: -25.3, lng: -57.6 }), children: "Enviar ubicaci\u00F3n 1" }), (0, jsx_runtime_1.jsx)("button", { className: "ghost", onClick: () => socketRef.current?.emit("driver:location", { lat: -25.29, lng: -57.61 }), children: "Enviar ubicaci\u00F3n 2" })] })] })] }));
}
// exportación de debug (no por defecto)
function RiderPageDebug() {
    (0, react_1.useEffect)(() => {
        console.log("Rider page mounted");
    }, []);
    return ((0, jsx_runtime_1.jsxs)("div", { style: { padding: 20 }, children: [(0, jsx_runtime_1.jsx)("h1", { style: { color: "white" }, children: "RIDER PAGE - DEBUG" }), (0, jsx_runtime_1.jsx)("p", { style: { color: "#9a9a9a" }, children: "Si ves esto, Next est\u00E1 cargando /rider correctamente." })] }));
}

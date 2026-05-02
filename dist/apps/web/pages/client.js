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
exports.default = ClientPage;
const jsx_runtime_1 = require("react/jsx-runtime");
//client.tsx
const react_1 = require("react");
const ui_1 = require("ui");
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
function ClientPage() {
    const [messages, setMessages] = (0, react_1.useState)([]);
    const [currentRide, setCurrentRide] = (0, react_1.useState)(null);
    const [history, setHistory] = (0, react_1.useState)([]);
    const passengerRef = (0, react_1.useRef)(null);
    const [debugStatus, setDebugStatus] = (0, react_1.useState)("cliente no montado");
    (0, react_1.useEffect)(() => {
        // debug: confirmar montaje cliente
        console.log("Client page: booting client-side code");
        setDebugStatus("montado: inicializando socket");
        let socket;
        (async () => {
            const { io } = await Promise.resolve().then(() => __importStar(require("socket.io-client")));
            socket = io(`${API_URL}/passengers`);
            passengerRef.current = socket;
            const onConnect = () => {
                setMessages(m => [...m, `Connected ${socket.id}`]);
                setDebugStatus(`conectado: ${socket.id}`);
            };
            const onCreated = (ride) => {
                setCurrentRide(ride);
                setHistory(h => [ride, ...h]);
                setMessages(m => [...m, `Ride created ${ride.id}`]);
                setDebugStatus(`ride created: ${ride.id}`);
            };
            const onAssigned = (ride) => {
                setCurrentRide(ride);
                setMessages(m => [...m, `Ride assigned ${ride.id}`]);
                setDebugStatus(`ride assigned: ${ride.id}`);
            };
            const onStatus = (s) => {
                setMessages(m => [...m, `Status: ${JSON.stringify(s)}`]);
                setDebugStatus(`status: ${JSON.stringify(s)}`);
                if (currentRide && s.rideId === currentRide.id) {
                    setCurrentRide((cr) => ({ ...cr, state: s.newState }));
                }
            };
            socket.on("connect", onConnect);
            socket.on("ride:created", onCreated);
            socket.on("ride:assigned", onAssigned);
            socket.on("ride:status_changed", onStatus);
        })();
        return () => {
            passengerRef.current?.disconnect();
            passengerRef.current = null;
            setDebugStatus("desconectado");
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const requestRide = () => {
        passengerRef.current?.emit("passenger:request_ride", {
            passengerId: "demo-passenger",
            origin: { lat: -25.3, lng: -57.6 },
            destination: { lat: -25.28, lng: -57.63 },
            estimatedFare: 4.2,
        });
    };
    const cancelRide = () => {
        if (!currentRide)
            return;
        passengerRef.current?.emit("passenger:cancel_ride", currentRide.id);
        setMessages(m => [...m, `Cancel requested ${currentRide.id}`]);
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "container", children: [(0, jsx_runtime_1.jsx)("div", { id: "client-debug", style: { color: "white", marginBottom: 8 }, children: `CLIENT DEBUG: ${debugStatus}` }), (0, jsx_runtime_1.jsx)(ui_1.Header, { title: "MOVI - Cliente" }), (0, jsx_runtime_1.jsx)(ui_1.MapPlaceholder, { children: currentRide ? "Ride activo - sigue al driver" : "Tu ubicación (placeholder)" }), (0, jsx_runtime_1.jsxs)("div", { style: { marginTop: 12, display: "flex", gap: 12 }, children: [(0, jsx_runtime_1.jsx)(ui_1.Button, { onClick: requestRide, children: "Pedir ride demo" }), currentRide && (0, jsx_runtime_1.jsx)("button", { className: "ghost", onClick: cancelRide, children: "Cancelar ride" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "list", style: { marginTop: 16 }, children: [(0, jsx_runtime_1.jsx)("div", { className: "card", style: { fontWeight: 700 }, children: "Ride actual" }), currentRide ? ((0, jsx_runtime_1.jsx)(ui_1.RideCard, { id: currentRide.id, origin: { lat: currentRide.originLat, lng: currentRide.originLng }, destination: { lat: currentRide.destLat, lng: currentRide.destLng } })) : ((0, jsx_runtime_1.jsx)("div", { className: "card", style: { color: "var(--muted)" }, children: "No hay rides activos" })), (0, jsx_runtime_1.jsx)("div", { className: "card", style: { fontWeight: 700, marginTop: 8 }, children: "Historial / Eventos" }), messages.map((m, i) => ((0, jsx_runtime_1.jsx)("div", { className: "card", children: m }, i)))] })] }));
}

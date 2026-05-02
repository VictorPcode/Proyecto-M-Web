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
exports.default = Home;
const jsx_runtime_1 = require("react/jsx-runtime");
// apps/web/pages/index.tsx
const react_1 = require("react");
const ui_1 = require("ui");
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
function Home() {
    const [messages, setMessages] = (0, react_1.useState)([]);
    const [mounted, setMounted] = (0, react_1.useState)(false); // evita render SSR
    const socketRef = (0, react_1.useRef)(null);
    const passengerRef = (0, react_1.useRef)(null);
    // Marca que estamos en cliente
    (0, react_1.useEffect)(() => {
        setMounted(true);
    }, []);
    (0, react_1.useEffect)(() => {
        if (!mounted)
            return;
        let isMounted = true;
        (async () => {
            const { io } = await Promise.resolve().then(() => __importStar(require("socket.io-client")));
            if (!isMounted)
                return;
            // Socket global (tracking, etc.)
            socketRef.current = io(API_URL);
            socketRef.current.on("connect", () => {
                setMessages((m) => [
                    ...m,
                    ` Connected: ${socketRef.current?.id}`,
                ]);
            });
            socketRef.current.on("ride:tracking", (loc) => {
                setMessages((m) => [
                    ...m,
                    ` Tracking: lat=${loc.lat}, lng=${loc.lng}`,
                ]);
            });
            // Socket namespace pasajeros
            passengerRef.current = io(`${API_URL}/passengers`);
            passengerRef.current.on("connect", () => {
                setMessages((m) => [...m, `🟢 Passenger socket connected`]);
            });
            passengerRef.current.on("ride:created", (ride) => {
                setMessages((m) => [
                    ...m,
                    `🚀 Ride created: ${ride.id ?? JSON.stringify(ride)}`,
                ]);
            });
            passengerRef.current.on("ride:assigned", (ride) => {
                const rideString = typeof ride === "string"
                    ? ride
                    : JSON.stringify(ride, null, 2);
                setMessages((m) => [...m, `🚖 Ride assigned: ${rideString}`]);
            });
        })();
        return () => {
            isMounted = false;
            socketRef.current?.disconnect();
            passengerRef.current?.disconnect();
        };
    }, [mounted]);
    const requestRide = () => {
        passengerRef.current?.emit("passenger:request_ride", {
            passengerId: "demo-passenger",
            origin: { lat: -25.3, lng: -57.6 },
            destination: { lat: -25.28, lng: -57.63 },
        });
    };
    if (!mounted)
        return null;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "container", style: { maxWidth: 600, margin: "0 auto", padding: 20 }, children: [(0, jsx_runtime_1.jsx)(ui_1.Header, { title: "MOVI - Cliente" }), (0, jsx_runtime_1.jsx)(ui_1.MapPlaceholder, { children: "Tu ubicaci\u00F3n" }), (0, jsx_runtime_1.jsx)("div", { style: { marginTop: 12, display: "flex", gap: 12 }, children: (0, jsx_runtime_1.jsx)(ui_1.Button, { onClick: requestRide, children: "Pedir ride demo" }) }), (0, jsx_runtime_1.jsx)("div", { style: { marginTop: 20 }, children: messages.map((m, i) => ((0, jsx_runtime_1.jsx)("div", { style: {
                        backgroundColor: "#f3f3f3",
                        padding: "10px",
                        marginBottom: "8px",
                        borderRadius: "6px",
                        wordBreak: "break-word",
                        whiteSpace: "pre-wrap",
                    }, children: m }, i))) })] }));
}

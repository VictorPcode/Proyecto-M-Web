"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = RideCard;
const jsx_runtime_1 = require("react/jsx-runtime");
function RideCard({ id, origin, destination, onAccept, onCancel, small }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "card", style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("div", { style: { fontWeight: 700 }, children: ["Ride ", id ?? ""] }), (0, jsx_runtime_1.jsxs)("div", { style: { color: "var(--muted)", fontSize: 13 }, children: ["From: ", origin.lat.toFixed(3), ",", origin.lng.toFixed(3), " \u2192 To: ", destination.lat.toFixed(3), ",", destination.lng.toFixed(3)] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [onAccept && (0, jsx_runtime_1.jsx)("button", { className: "btn", onClick: onAccept, children: "Aceptar" }), onCancel && (0, jsx_runtime_1.jsx)("button", { className: "small-btn", onClick: onCancel, children: "Cancelar" })] })] }));
}

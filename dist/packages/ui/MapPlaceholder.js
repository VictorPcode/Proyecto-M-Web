"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MapPlaceholder;
const jsx_runtime_1 = require("react/jsx-runtime");
function MapPlaceholder({ children }) {
    return (0, jsx_runtime_1.jsx)("div", { className: "map-placeholder", children: children ?? "Mapa (placeholder)" });
}

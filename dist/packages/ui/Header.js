"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Header;
const jsx_runtime_1 = require("react/jsx-runtime");
const link_1 = __importDefault(require("next/link"));
function Header({ title = "MOVI" }) {
    return ((0, jsx_runtime_1.jsxs)("header", { className: "header", children: [(0, jsx_runtime_1.jsx)("h2", { style: { margin: 0 }, children: title }), (0, jsx_runtime_1.jsxs)("nav", { className: "nav", children: [(0, jsx_runtime_1.jsx)(link_1.default, { href: "/client", children: "Cliente" }), (0, jsx_runtime_1.jsx)(link_1.default, { href: "/rider", children: "Rider" })] })] }));
}

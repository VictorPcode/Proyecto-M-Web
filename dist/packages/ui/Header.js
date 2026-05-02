"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Header;
const jsx_runtime_1 = require("react/jsx-runtime");
function Header({ title = "MOVI" }) {
    return ((0, jsx_runtime_1.jsx)("header", { className: "header", children: (0, jsx_runtime_1.jsx)("h2", { style: { margin: 0 }, children: title }) }));
}

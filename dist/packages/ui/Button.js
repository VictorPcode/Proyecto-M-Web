"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Button = Button;
const jsx_runtime_1 = require("react/jsx-runtime");
function Button({ variant = "primary", children, ...rest }) {
    const className = variant === "primary" ? "btn" : "small-btn";
    return ((0, jsx_runtime_1.jsx)("button", { className: className, ...rest, children: children }));
}
exports.default = Button;

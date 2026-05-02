"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const jsx_runtime_1 = require("react/jsx-runtime");
// apps/web/pages/index.tsx
require("../styles.css");
function App({ Component, pageProps }) {
    return (0, jsx_runtime_1.jsx)(Component, { ...pageProps });
}

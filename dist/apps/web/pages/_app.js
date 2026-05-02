"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const jsx_runtime_1 = require("react/jsx-runtime");
// apps/web/pages/_app.tsx
require("../styles.css");
require("mapbox-gl/dist/mapbox-gl.css");
function App({ Component, pageProps }) {
    return (0, jsx_runtime_1.jsx)(Component, { ...pageProps });
}

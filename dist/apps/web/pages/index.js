"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Home;
// apps/web/pages/index.tsx
const react_1 = require("react");
const router_1 = require("next/router");
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
function Home() {
    const router = (0, router_1.useRouter)();
    (0, react_1.useEffect)(() => {
        router.replace("/login");
    }, [router]);
    return null;
}

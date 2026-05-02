import { jsx as _jsx } from "react/jsx-runtime";
export default function Header({ title = "MOVI" }) {
    return (_jsx("header", { className: "header", children: _jsx("h2", { style: { margin: 0 }, children: title }) }));
}

import { jsx as _jsx } from "react/jsx-runtime";
import { Colors } from "./colors";
export const Button = ({ children, onClick }) => {
    return (_jsx(Button, { onClick: onClick, style: {
            backgroundColor: Colors.primary,
            color: Colors.text,
            padding: "12px 24px",
            borderRadius: "8px",
            fontWeight: "bold",
        }, children: children }));
};

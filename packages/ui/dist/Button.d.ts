import React from "react";
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost";
};
export declare function Button({ variant, children, ...rest }: ButtonProps): import("react/jsx-runtime").JSX.Element;
export default Button;

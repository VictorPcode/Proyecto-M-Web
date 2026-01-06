import React from "react";
export interface ButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
}
export declare const Button: ({ children, onClick }: ButtonProps) => import("react/jsx-runtime").JSX.Element;

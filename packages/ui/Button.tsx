import React from "react";
import { Colors } from "./colors";

export interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button = ({ children, onClick }: ButtonProps) => {
  return (
    <Button
      onClick={onClick}
      style={{
        backgroundColor: Colors.primary,
        color: Colors.text,
        padding: "12px 24px",
        borderRadius: "8px",
        fontWeight: "bold",
      }}
    >
      {children}
    </Button>
  );
};

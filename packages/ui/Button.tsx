import React from "react";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function Button({ variant = "primary", children, ...rest }: ButtonProps) {
  const className = variant === "primary" ? "btn" : "small-btn";
  return (
    <button className={className} {...rest}>
      {children}
    </button>
  );
}

export default Button;

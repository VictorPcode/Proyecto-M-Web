// packages/ui/Header.tsx
import React from "react";
import Link from "next/link";

export default function Header({ title = "MOVI" }: { title?: string }) {
  return (
    <header className="header">
      <h2 style={{ margin: 0 }}>{title}</h2>
     
    </header>
  );
}

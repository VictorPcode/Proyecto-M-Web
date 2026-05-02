// apps/web/pages/index.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import type { Socket } from "socket.io-client";
import type { GeoLocation } from "@movi/types";
import { Button, Header, MapPlaceholder } from "ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return null;
}

"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type Echo from "laravel-echo";
import { getEcho } from "@/lib/websocket";
import { getToken } from "@/lib/auth";

type EchoInstance = Echo<"reverb">;

const EchoContext = createContext<EchoInstance | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [echo] = useState<EchoInstance | null>(() => getEcho());
  const prevTokenRef = useRef<string | null>(getToken());

  // Reinitialize Echo when auth token changes
  useEffect(() => {
    const interval = setInterval(() => {
      const currentToken = getToken();
      if (currentToken !== prevTokenRef.current) {
        prevTokenRef.current = currentToken;
        // Token changed - Echo will re-authenticate automatically
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return <EchoContext.Provider value={echo}>{children}</EchoContext.Provider>;
}

export function useEcho(): EchoInstance | null {
  return useContext(EchoContext);
}
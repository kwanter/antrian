import Echo from "laravel-echo";
import Pusher from "pusher-js";

declare global {
  interface Window {
    Pusher: typeof Pusher;
    __ECHO: Echo<"reverb"> | null;
  }
}

let echoInstance: Echo<"reverb"> | null = null;

export function getEcho(): Echo<"reverb"> | null {
  if (echoInstance) return echoInstance;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  if (!key) {
    console.warn("[Echo] NEXT_PUBLIC_PUSHER_KEY not set — WebSocket disabled");
    return null;
  }

  if (typeof window === "undefined") return null;

  window.Pusher = Pusher;

  const scheme = process.env.NEXT_PUBLIC_PUSHER_SCHEME || "http";
  const isSecure = scheme === "https";

  echoInstance = new Echo({
    broadcaster: "reverb",
    key,
    wsHost: process.env.NEXT_PUBLIC_PUSHER_HOST || "localhost",
    wsPort: parseInt(process.env.NEXT_PUBLIC_PUSHER_PORT || "8080"),
    wssPort: parseInt(process.env.NEXT_PUBLIC_PUSHER_PORT || "443"),
    forceTLS: isSecure,
    enabledTransports: isSecure ? ["wss"] : ["ws"],
    encrypted: isSecure,
  });

  // Expose for debugging
  window.__ECHO = echoInstance;

  return echoInstance;
}

export function disconnectEcho(): void {
  if (echoInstance) {
    echoInstance.disconnect();
    echoInstance = null;
    if (typeof window !== "undefined") {
      window.__ECHO = null;
    }
  }
}
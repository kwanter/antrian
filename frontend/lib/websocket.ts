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

  // The API base URL — same origin the axios client uses. Private channels
  // (F-08, F-22) require an auth round-trip to /broadcasting/auth on the
  // Laravel backend; without this, echo.private() silently fails.
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1$/, "") ??
    "http://localhost:8000";

  echoInstance = new Echo({
    broadcaster: "reverb",
    key,
    wsHost: process.env.NEXT_PUBLIC_PUSHER_HOST || "localhost",
    wsPort: parseInt(process.env.NEXT_PUBLIC_PUSHER_PORT || "8080"),
    wssPort: parseInt(process.env.NEXT_PUBLIC_PUSHER_PORT || "443"),
    forceTLS: isSecure,
    enabledTransports: isSecure ? ["wss"] : ["ws"],
    encrypted: isSecure,
    // Auth for private/presence channels — hit Laravel's broadcasting/auth
    // endpoint with Sanctum session cookies so the channel authorizer runs.
    authEndpoint: `${apiBase}/broadcasting/auth`,
    auth: {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
      },
    },
  });

  // Pusher-js needs withCredentials for cross-origin cookie auth.
  // @ts-expect-error — pusher-js options are passed through Echo config
  if (echoInstance.connector?.pusher?.config) {
    echoInstance.connector.pusher.config.authTransport = "ajax";
    echoInstance.connector.pusher.config.auth = {
      ...echoInstance.connector.pusher.config.auth,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
      },
    };
  }

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
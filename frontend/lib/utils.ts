import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Resolve a /storage/... path from the backend into a full URL.
 * Frontend and backend may run on different origins; this ensures
 * Audio() receives a resolvable absolute URL everywhere (dev, prod, TV).
 */
export function resolveBackendUrl(path: string): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  const backendRoot = apiBase.replace(/\/api\/v1\/?$/, "");
  return `${backendRoot}${path}`;
}

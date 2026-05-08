import type { User } from "./types";

const USER_KEY = "auth_user";

export function getToken(): string | null {
  return null;
}

export function setToken(): void {}

export function clearToken(): void {
  clearUser();
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setUser(user: User): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getUser();
}

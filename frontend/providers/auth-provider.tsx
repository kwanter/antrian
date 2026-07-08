"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LoginPayload, User } from "@/lib/types";
import { setUser, clearUser } from "@/lib/auth";
import api, { impersonateUser, stopImpersonation, type ImpersonationResponse } from "@/lib/api";

export class AuthError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

export type Impersonator = Pick<User, "id" | "name" | "email" | "role">;

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  impersonator: Impersonator | null;
  impersonate: (userId: number) => Promise<User>;
  stopPreview: () => Promise<User>;
  login: (payload: LoginPayload) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonator, setImpersonator] = useState<Impersonator | null>(null);

  // Verify session on mount by calling /auth/me
  useEffect(() => {
    api
      .get("/auth/me")
      .then(({ data }) => {
        setUser(data.data);
        setUserState(data.data);
        if (data.is_impersonating && data.impersonator) {
          setImpersonator(data.impersonator as Impersonator);
        } else {
          setImpersonator(null);
        }
      })
      .catch(() => {
        clearUser();
        setUserState(null);
        setImpersonator(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (payload: LoginPayload): Promise<User> => {
    try {
      const apiOrigin = api.defaults.baseURL?.replace(/\/api\/v1\/?$/, "") ?? "http://localhost:8000";
      await fetch(`${apiOrigin}/sanctum/csrf-cookie`, { credentials: "include" });
      const { data: res } = await api.post("/auth/login", payload);
      const loggedInUser: User = res.data.user;
      setUser(loggedInUser);
      setUserState(loggedInUser);
      setImpersonator(null);
      return loggedInUser;
    } catch (error) {
      clearUser();
      setUserState(null);
      const axiosError = error as { response?: { status?: number; data?: { code?: string; message?: string } } };
      const status = axiosError?.response?.status;
      const code = axiosError?.response?.data?.code;
      const message =
        axiosError?.response?.data?.message ??
        (status === 401
          ? "Email atau password salah."
          : status === 403
            ? "Akses ditolak."
            : status === 429
              ? "Terlalu banyak percobaan. Tunggu sebentar."
              : "Login gagal. Periksa koneksi Anda.");
      throw new AuthError(message, code, status);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore errors — clear local state regardless
    }
    clearUser();
    setUserState(null);
    setImpersonator(null);
  }, []);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.data);
      setUserState(data.data);
      if (data.is_impersonating && data.impersonator) {
        setImpersonator(data.impersonator as Impersonator);
      } else {
        setImpersonator(null);
      }
      return data.data;
    } catch {
      return null;
    }
  }, []);

  const impersonate = useCallback(async (userId: number): Promise<User> => {
    const res: ImpersonationResponse = await impersonateUser(userId);
    const target = res.data.user;
    const admin = res.data.impersonator ?? null;
    setUser(target);
    setUserState(target);
    setImpersonator(admin);
    return target;
  }, []);

  const stopPreview = useCallback(async (): Promise<User> => {
    const res: ImpersonationResponse = await stopImpersonation();
    const restored = res.data.user;
    setUser(restored);
    setUserState(restored);
    setImpersonator(null);
    return restored;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      isImpersonating: !!impersonator,
      impersonator,
      impersonate,
      stopPreview,
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading, impersonator, impersonate, stopPreview, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
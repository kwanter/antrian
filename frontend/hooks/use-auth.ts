"use client";

import { useMutation } from "@tanstack/react-query";
import type { LoginPayload } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

export function useLogin() {
  const { login } = useAuth();

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      await login(payload);
    },
  });
}

export function useLogout() {
  const { logout } = useAuth();
  return useMutation({ mutationFn: async () => logout() });
}

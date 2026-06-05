"use client";

import { useMutation } from "@tanstack/react-query";
import type { LoginPayload, User } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

export function useLogin() {
  const { login } = useAuth();

  return useMutation<User, Error, LoginPayload>({
    mutationFn: async (payload: LoginPayload) => {
      return await login(payload);
    },
  });
}

export function useLogout() {
  const { logout } = useAuth();
  return useMutation({ mutationFn: async () => logout() });
}

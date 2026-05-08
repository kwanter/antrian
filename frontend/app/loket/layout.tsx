"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

export default function LoketLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Skip auth for login page
  const isLoginPage = pathname?.endsWith("/login");

  // Redirect after mount to avoid "setState during render" error
  useEffect(() => {
    if (!isLoginPage && !isLoading && !isAuthenticated) {
      router.replace("/loket/login");
    }
  }, [isLoginPage, isLoading, isAuthenticated, router]);

  if (!isLoginPage && (isLoading || !isAuthenticated)) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500">Memuat...</p>
      </div>
    );
  }

  // If on login page, just render children without header
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Loket</h1>
        <div className="flex items-center gap-3">
          {user && (
            <Badge variant="outline" className="text-slate-600">
              {user.name ?? user.email}
            </Badge>
          )}
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
            <User className="w-4 h-4 text-slate-500" />
          </div>
          <Button variant="ghost" size="icon" onClick={logout} title="Keluar">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
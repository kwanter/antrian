"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/admin/sidebar";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2, Eye } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, isLoading, isImpersonating, impersonator, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isLoginPage) {
      router.replace("/login");
    }
    // Role guard: loket users must not access admin panel
    if (!isLoading && isAuthenticated && user && user.role === "loket" && !isLoginPage) {
      router.replace("/loket");
    }
  }, [isLoading, isAuthenticated, isLoginPage, router, user]);

  // Show loading while validating token
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Login page — no sidebar
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Not authenticated / unauthorized — show nothing while redirecting
  if (!isAuthenticated || user?.role === "loket") {
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
          <h1 className="text-sm font-medium text-muted-foreground">
            Panel Admin
          </h1>
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {user.name}
              </span>
              <Button variant="ghost" size="icon" onClick={() => logout()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </header>

        {/* Impersonation banner — only visible when active */}
        {isImpersonating && impersonator && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-6 py-2 text-amber-900">
            <div className="flex items-center gap-2 text-sm">
              <Eye className="h-4 w-4" />
              <span>
                Mode preview: Anda masuk sebagai{" "}
                <strong>{user?.name}</strong> ({user?.email}). Semua
                tindakan akan tercatat atas nama {impersonator.name}.
              </span>
            </div>
            <a
              href="/users"
              className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50"
            >
              Kelola Pengguna
            </a>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/admin/sidebar";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2 } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isLoginPage) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, isLoginPage, router]);

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

  // Not authenticated — show nothing while redirecting
  if (!isAuthenticated) {
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

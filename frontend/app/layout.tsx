import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import QueryProvider from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { WebSocketProvider } from "@/providers/websocket-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sistem Antrian Digital",
  description: "Digital Queue Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <AuthProvider>
            <WebSocketProvider>
              <TooltipProvider>
                {children}
                <Toaster />
              </TooltipProvider>
            </WebSocketProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

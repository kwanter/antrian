"use client";

export default function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen overflow-hidden bg-slate-50 cursor-none">
      {children}
    </div>
  );
}
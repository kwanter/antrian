"use client";

import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface CallButtonProps {
  label: string;
  icon: React.ReactNode;
  variant?: ComponentProps<typeof Button>["variant"];
  onClick: () => void;
  disabled?: boolean;
}

export function CallButton({ label, icon, variant = "default", onClick, disabled }: CallButtonProps) {
  return (
    <Button
      variant={variant}
      size="lg"
      className={cn("min-w-[140px] h-14 gap-2 text-base font-medium", variant === "outline" && "border-2")}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label}
    </Button>
  );
}
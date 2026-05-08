"use client";

import { cn } from "@/lib/utils";

interface ServiceButtonProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export function ServiceButton({
  label,
  icon,
  onClick,
  disabled = false,
}: ServiceButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full min-h-[120px] rounded-xl bg-white shadow-md",
        "flex flex-col items-center justify-center gap-3",
        "text-lg font-semibold text-slate-800",
        "hover:bg-blue-50 active:scale-[0.98]",
        "transition-all duration-150",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
      )}
    >
      {icon && <span className="text-4xl">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}
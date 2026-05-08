"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

interface VolumeSliderProps {
  value: number;
  status?: string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}

export function VolumeSlider({ value, status, onChange, onCommit }: VolumeSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="volume-slider" className="text-sm font-medium">
          Volume
        </Label>
        <div className="flex items-center gap-2 text-sm">
          {status && <span className="text-muted-foreground">{status}</span>}
          <span className="font-medium tabular-nums">{value}%</span>
        </div>
      </div>
      <Slider
        id="volume-slider"
        min={0}
        max={100}
        step={1}
        value={[value]}
        onValueChange={(vals) => onChange(Array.isArray(vals) ? (vals[0] ?? value) : (vals as number))}
        onValueCommitted={(vals) => onCommit?.(Array.isArray(vals) ? (vals[0] ?? value) : (vals as number))}
        className="w-full"
      />
    </div>
  );
}

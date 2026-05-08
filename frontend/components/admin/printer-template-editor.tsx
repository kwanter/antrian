"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PrinterTemplateEditorProps {
  template: Record<string, unknown>;
  onChange: (t: Record<string, unknown>) => void;
}

export function PrinterTemplateEditor({ template, onChange }: PrinterTemplateEditorProps) {
  const headerText = (template.header_text as string) ?? "";
  const footerText = (template.footer_text as string) ?? "";
  const paperSize = (template.paper_size as string) ?? "80mm";
  const copyCount = (template.copy_count as number) ?? 1;

  const update = (key: string, value: unknown) => onChange({ ...template, [key]: value });

  // Calculate visual width based on paper size (58mm or 80mm ticket)
  const ticketWidthPx = paperSize === "58mm" ? 160 : 220;

  return (
    <div className="flex flex-col gap-6">
      {/* Editor Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="header_text">Teks Header</Label>
          <Input
            id="header_text"
            value={headerText}
            onChange={(e) => update("header_text", e.target.value)}
            placeholder="Nama bisnis atau header nota"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="footer_text">Teks Footer</Label>
          <Input
            id="footer_text"
            value={footerText}
            onChange={(e) => update("footer_text", e.target.value)}
            placeholder="Alamat atau footer nota"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paper_size">Ukuran Kertas</Label>
          <Select value={paperSize} onValueChange={(v) => update("paper_size", v)}>
            <SelectTrigger id="paper_size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="58mm">58mm</SelectItem>
              <SelectItem value="80mm">80mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="copy_count">Jumlah Salinan</Label>
          <Input
            id="copy_count"
            type="number"
            min={1}
            max={10}
            value={copyCount}
            onChange={(e) => update("copy_count", parseInt(e.target.value) || 1)}
          />
        </div>
      </div>

      {/* Visual Preview */}
      <div className="space-y-2">
        <Label>Pratinjau Nota</Label>
        <div className="flex justify-center p-4 bg-muted rounded-lg overflow-auto">
          <Card
            className="bg-white text-black font-mono"
            style={{
              width: ticketWidthPx,
              minHeight: 240,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >
            {/* Header */}
            <div className="text-center border-b border-dashed border-gray-400 pb-2">
              <div className="font-bold text-sm">{headerText || "Header Nota"}</div>
            </div>

            {/* Ticket rows */}
            {[
              "----------------------------",
              "  Antrian #001",
              "  Tanggal: " + new Date().toLocaleDateString("id-ID"),
              "----------------------------",
              "  Item A        x1   Rp10.000",
              "  Item B        x2   Rp20.000",
              "----------------------------",
            ].map((line, i) => (
              <div key={i} className="whitespace-nowrap overflow-hidden text-ellipsis text-[10px]">
                {line}
              </div>
            ))}

            {/* Footer */}
            <div className="text-center border-t border-dashed border-gray-400 pt-2">
              <div className="text-[10px]">{footerText || "Footer Nota"}</div>
            </div>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Pratinjau nota pada kertas {paperSize}
        </p>
      </div>
    </div>
  );
}

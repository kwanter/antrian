"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PrinterTemplateEditorProps {
  template: Record<string, unknown>;
  onChange: (t: Record<string, unknown>) => void;
}

const PRINTER_MODELS = [
  { value: "Iware C-58BT", label: "Iware C-58BT (58mm, Bluetooth/USB)" },
  { value: "Epson TM-T82", label: "Epson TM-T82 (80mm)" },
  { value: "Epson TM-T58", label: "Epson TM-T58 (58mm)" },
  { value: "Generic 58mm", label: "Generic 58mm Thermal" },
  { value: "Generic 80mm", label: "Generic 80mm Thermal" },
];

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

export function PrinterTemplateEditor({
  template,
  onChange,
}: PrinterTemplateEditorProps) {
  const headerText = (template.header_text as string) ?? "";
  const footerText = (template.footer_text as string) ?? "";
  const paperSize = (template.paper_size as string) ?? "58mm";
  const copyCount = (template.copy_count as number) ?? 1;
  const printerModel = (template.printer_model as string) ?? "Iware C-58BT";
  const connectionType =
    (template.connection_type as string) ?? "web_serial";
  const baudRate = (template.baud_rate as number) ?? 9600;
  const charset = (template.charset as string) ?? "utf-8";
  const cutMode = (template.cut_mode as string) ?? "partial";

  const update = (key: string, value: unknown) =>
    onChange({ ...template, [key]: value });

  // Visual width based on paper size
  const ticketWidthPx = paperSize === "58mm" ? 160 : 220;

  return (
    <div className="flex flex-col gap-6">
      {/* Hardware */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Perangkat Keras</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="printer_model">Model Printer</Label>
            <Select
              value={printerModel}
              onValueChange={(v) => update("printer_model", v)}
            >
              <SelectTrigger id="printer_model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINTER_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="connection_type">Tipe Koneksi</Label>
            <Select
              value={connectionType}
              onValueChange={(v) => update("connection_type", v)}
            >
              <SelectTrigger id="connection_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="web_serial">
                  Web Serial (USB/Bluetooth ke Chrome)
                </SelectItem>
                <SelectItem value="windows_bridge">
                  Windows Bridge (layanan lokal)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="baud_rate">Baud Rate</Label>
            <Select
              value={String(baudRate)}
              onValueChange={(v) => update("baud_rate", parseInt(v ?? "9600", 10))}
            >
              <SelectTrigger id="baud_rate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAUD_RATES.map((b) => (
                  <SelectItem key={b} value={String(b)}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="charset">Charset</Label>
            <Select
              value={charset}
              onValueChange={(v) => update("charset", v)}
            >
              <SelectTrigger id="charset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="utf-8">UTF-8 (Latin, aksen)</SelectItem>
                <SelectItem value="cp437">CP437 (Latin US)</SelectItem>
                <SelectItem value="cp850">CP850 (Latin-1)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Template Content */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Isi Template</Label>
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
            <Select
              value={paperSize}
              onValueChange={(v) => update("paper_size", v)}
            >
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
            <Label htmlFor="cut_mode">Mode Potong</Label>
            <Select
              value={cutMode}
              onValueChange={(v) => update("cut_mode", v)}
            >
              <SelectTrigger id="cut_mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="partial">Potong Sebagian</SelectItem>
                <SelectItem value="full">Potong Penuh</SelectItem>
                <SelectItem value="none">Tanpa Potong</SelectItem>
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
              onChange={(e) =>
                update("copy_count", parseInt(e.target.value, 10) || 1)
              }
            />
          </div>
        </div>
      </div>

      {/* Visual Preview */}
      <div className="space-y-2">
        <Label>Pratinjau Tiket Antrian</Label>
        <div className="flex justify-center p-4 bg-muted rounded-lg overflow-auto">
          <Card
            className="bg-white text-black font-mono"
            style={{
              width: ticketWidthPx,
              minHeight: 280,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >
            <div className="text-center border-b border-dashed border-gray-400 pb-2">
              <div className="font-bold text-sm">
                {headerText || "Nama Instansi"}
              </div>
            </div>

            <div className="text-center font-bold text-[10px] mt-1">
              NOMOR ANTRIAN
            </div>
            <div className="text-center font-bold text-2xl my-1">A001</div>
            <div className="text-center text-[10px]">
              Layanan: Customer Service
            </div>
            <div className="text-center text-[10px]">
              {new Date().toLocaleDateString("id-ID", {
                timeZone: "Asia/Makassar",
              })}
            </div>

            <div className="text-center border-t border-dashed border-gray-400 pt-2 mt-auto">
              <div className="text-[10px]">
                {footerText || "Terima kasih atas kunjungan Anda"}
              </div>
            </div>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          {paperSize} • {cutMode === "partial" && "Potong sebagian"}
          {cutMode === "full" && "Potong penuh"}
          {cutMode === "none" && "Tanpa potong"} • {copyCount} salinan
        </p>
      </div>
    </div>
  );
}

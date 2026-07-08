"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { PrinterProfile } from "@/lib/types";
import { PrinterTemplateEditor } from "@/components/admin/printer-template-editor";
import { usePrinter } from "@/hooks/use-printer";
import { buildPrinterTestTicket } from "@/lib/escpos";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

export default function PrintersPage() {
  const qc = useQueryClient();
  const printer = usePrinter();
  const [editTarget, setEditTarget] = useState<PrinterProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrinterProfile | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Edit state
  const [editTemplate, setEditTemplate] = useState<Record<string, unknown>>({});
  const [editName, setEditName] = useState("");

  const { data: profiles = [], isLoading } = useQuery<PrinterProfile[]>({
    queryKey: ["printer-profiles"],
    queryFn: () => api.get("/printer-profiles").then((r) => r.data.data as PrinterProfile[]),
  });

  const createMut = useMutation({
    mutationFn: (payload: { name: string; template: Record<string, unknown> }) =>
      api.post("/printer-profiles", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["printer-profiles"] });
      toast.success("Profil printer berhasil dibuat");
      setShowAdd(false);
      resetAdd();
    },
    onError: () => toast.error("Gagal membuat profil printer"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; template: Record<string, unknown> } }) =>
      api.put(`/printer-profiles/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["printer-profiles"] });
      toast.success("Profil printer berhasil diperbarui");
      setEditTarget(null);
    },
    onError: () => toast.error("Gagal memperbarui profil printer"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/printer-profiles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["printer-profiles"] });
      toast.success("Profil printer berhasil dihapus");
      setDeleteTarget(null);
    },
    onError: () => toast.error("Gagal menghapus profil printer"),
  });

  // Add dialog state
  const [addName, setAddName] = useState("");
  const [addTemplate, setAddTemplate] = useState<Record<string, unknown>>({
    header_text: "",
    footer_text: "",
    paper_size: "58mm",
    copy_count: 1,
    printer_model: "Iware C-58BT",
    connection_type: "web_serial",
    baud_rate: 9600,
    charset: "utf-8",
    cut_mode: "partial",
  });

  const resetAdd = () => {
    setAddName("");
    setAddTemplate({
      header_text: "",
      footer_text: "",
      paper_size: "58mm",
      copy_count: 1,
      printer_model: "Iware C-58BT",
      connection_type: "web_serial",
      baud_rate: 9600,
      charset: "utf-8",
      cut_mode: "partial",
    });
  };

  const openEdit = (p: PrinterProfile) => {
    setEditTarget(p);
    setEditName(p.name);
    setEditTemplate({ ...(p.template ?? {}) });
  };

  const openAdd = () => {
    resetAdd();
    setShowAdd(true);
  };

  const testPrint = async (profile: PrinterProfile) => {
    const template = profile.template ?? {};
    const baudRate = (template.baud_rate as number) ?? 9600;

    try {
      const bytes = buildPrinterTestTicket({
        header_text: (template.header_text as string) || profile.header_text || undefined,
        footer_text: (template.footer_text as string) || profile.footer_text || undefined,
        paper_size: (template.paper_size as string) || profile.paper_size,
        copy_count: (template.copy_count as number) || profile.copy_count,
        cut_mode: (template.cut_mode as string) || "partial",
      });

      if ((template.connection_type as string) === "windows_bridge") {
        if (!printer.bridgeUrl) {
          throw new Error("Windows Bridge tidak aktif. Jalankan bridge.py di PC Windows.");
        }
        await printer.printViaBridge(bytes, printer.bridgeUrl);
      } else {
        if (!printer.isConnected) {
          await printer.connect({ baudRate });
        }
        await printer.print(bytes);
      }

      toast.success("Test print berhasil dikirim ke printer", {
        description: "Periksa apakah struk keluar dari printer",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test print gagal";
      toast.error(message);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Konfigurasi Printer</h1>
          <p className="text-muted-foreground text-sm">Kelola template dan profil printer untuk nota</p>
        </div>
        <Button onClick={openAdd}>+ Tambah Profil</Button>
      </div>

      {!printer.isWebSerialAvailable && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Web Serial API tidak tersedia di browser ini. Untuk printer USB di Windows, jalankan bridge.py.</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/iware-bridge/bridge.bat"
              download="bridge.bat"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Download bridge.bat
            </a>
            <a
              href="/iware-bridge/bridge.py"
              download="bridge.py"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              bridge.py
            </a>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Memuat...</div>
      ) : profiles.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Belum ada profil printer. Tambahkan yang pertama.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <CardDescription className="flex gap-2 flex-wrap">
                  <Badge variant="outline">{(p.template?.paper_size as string) ?? "80mm"}</Badge>
                  <Badge variant="secondary">Salinan ×{(p.template?.copy_count as number) ?? 1}</Badge>
                  <Badge variant="outline">{String(p.template?.printer_model ?? "Generic")}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs space-y-1">
                  {!!p.template?.header_text && (
                    <div className="text-muted-foreground">
                      <span className="font-medium">Header:</span> {String((p.template as Record<string, string>).header_text ?? "")}
                    </div>
                  )}
                  {!!p.template?.footer_text && (
                    <div className="text-muted-foreground">
                      <span className="font-medium">Footer:</span> {String((p.template as Record<string, string>).footer_text ?? "")}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {printer.isWebSerialAvailable && !printer.isConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => printer.connect({ baudRate: (p.template?.baud_rate as number) ?? 9600 })}
                    >
                      Hubungkan
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => testPrint(p)}>
                    Test Print
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(p)}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(p)}>
                    Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Profil Printer</DialogTitle>
            <DialogDescription>Ubah template nota untuk profil &quot;{editTarget?.name}&quot;</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nama Profil</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Contoh: Printer Kasir Utama"
              />
            </div>
            <PrinterTemplateEditor template={editTemplate} onChange={setEditTemplate} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={() => {
                if (!editTarget) return;
                updateMut.mutate({ id: editTarget.id, data: { name: editName, template: editTemplate } });
              }}
              disabled={!editName.trim() || updateMut.isPending}
            >
              {updateMut.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => !o && setShowAdd(false)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Tambah Profil Printer</DialogTitle>
            <DialogDescription>Buat profil printer baru dengan template nota</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-name">Nama Profil</Label>
              <Input
                id="add-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Contoh: Printer Kasir Utama"
              />
            </div>
            <PrinterTemplateEditor template={addTemplate} onChange={setAddTemplate} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Batal
            </Button>
            <Button
              onClick={() => {
                if (!addName.trim()) return;
                createMut.mutate({ name: addName, template: addTemplate });
              }}
              disabled={!addName.trim() || createMut.isPending}
            >
              {createMut.isPending ? "Membuat..." : "Buat Profil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Profil Printer</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus profil &quot;{deleteTarget?.name}&quot;? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMut.mutate(deleteTarget.id);
              }}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

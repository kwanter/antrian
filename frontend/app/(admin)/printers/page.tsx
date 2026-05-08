"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { PrinterProfile } from "@/lib/types";
import { PrinterTemplateEditor } from "@/components/admin/printer-template-editor";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function PrintersPage() {
  const qc = useQueryClient();
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
    paper_size: "80mm",
    copy_count: 1,
  });

  const resetAdd = () => {
    setAddName("");
    setAddTemplate({ header_text: "", footer_text: "", paper_size: "80mm", copy_count: 1 });
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Konfigurasi Printer</h1>
          <p className="text-muted-foreground text-sm">Kelola template dan profil printer untuk nota</p>
        </div>
        <Button onClick={openAdd}>+ Tambah Profil</Button>
      </div>

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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Profil Printer</DialogTitle>
            <DialogDescription>Ubah template nota untuk profil &quot;{editTarget?.name}&quot;</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Profil Printer</DialogTitle>
            <DialogDescription>Buat profil printer baru dengan template nota</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
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

"use client";

import { useState } from "react";
import api from "@/lib/api";
import type { Counter } from "@/lib/types";
import CounterAssignDialog from "@/components/admin/counter-assign-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface CounterForm {
  name: string;
  code: string;
}

export default function CountersPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [assignCounter, setAssignCounter] = useState<Counter | null>(null);
  const [form, setForm] = useState<CounterForm>({ name: "", code: "" });
  const [saving, setSaving] = useState(false);

  const { data: counters = [], isLoading } = useQuery<Counter[]>({
    queryKey: ["counters"],
    queryFn: () => api.get("/counters").then((r) => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: (payload: CounterForm) => api.post("/counters", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["counters"] });
      toast.success("Loket berhasil ditambahkan.");
      setAddOpen(false);
      setForm({ name: "", code: "" });
    },
    onError: () => toast.error("Gagal menambahkan loket."),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CounterForm }) =>
      api.put(`/counters/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["counters"] });
      toast.success("Loket berhasil diperbarui.");
      setEditId(null);
      setForm({ name: "", code: "" });
    },
    onError: () => toast.error("Gagal memperbarui loket."),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/counters/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["counters"] });
      toast.success("Loket berhasil dihapus.");
    },
    onError: () => toast.error("Gagal menghapus loket."),
  });

  const openEdit = (c: Counter) => {
    setForm({ name: c.name, code: c.code });
    setEditId(c.id);
  };

  const handleAdd = () => {
    setSaving(true);
    createMut.mutate(form, {
      onSettled: () => setSaving(false),
    });
  };

  const handleEdit = () => {
    if (!editId) return;
    setSaving(true);
    updateMut.mutate({ id: editId, payload: form }, {
      onSettled: () => setSaving(false),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manajemen Loket</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Tambah Loket
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Memuat…</p>
      ) : counters.length === 0 ? (
        <p className="text-muted-foreground">Belum ada loket.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {counters.map((counter) => (
            <Card key={counter.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{counter.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Kode: {counter.code}
                    </p>
                  </div>
                  <Badge
                    variant={counter.status === "active" ? "default" : "secondary"}
                    className={cn(
                      counter.status === "active"
                        ? "bg-green-100 text-green-800 hover:bg-green-100"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    {counter.status === "active" ? "Aktif" : "Tidak Aktif"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Pengguna:</p>
                  {counter.users && counter.users.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {counter.users.map((u) => (
                        <Badge key={u.id} variant="outline">
                          {u.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">Belum ditugaskan</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(counter)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAssignCounter(counter)}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    Tugaskan
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm(`Hapus loket "${counter.name}"?`)) {
                        deleteMut.mutate(counter.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Loket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-name">Nama</Label>
              <Input
                id="add-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Loket 1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-code">Kode</Label>
              <Input
                id="add-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="A1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleAdd} disabled={saving || !form.name || !form.code}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Loket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nama</Label>
              <Input
                id="edit-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-code">Kode</Label>
              <Input
                id="edit-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>
              Batal
            </Button>
            <Button onClick={handleEdit} disabled={saving || !form.name || !form.code}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <CounterAssignDialog
        open={assignCounter !== null}
        onOpenChange={(o) => !o && setAssignCounter(null)}
        counter={assignCounter}
      />
    </div>
  );
}

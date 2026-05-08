"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import {
  getLayanans,
  createLayanan,
  updateLayanan,
  deleteLayanan,
  type LayananPayload,
} from "@/lib/api";
import type { Layanan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { LayananForm } from "@/components/features/layanans/LayananForm";
import api from "@/lib/api";

function getErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error) && typeof error.response?.data?.message === "string") {
    return error.response.data.message;
  }

  return fallback;
}

export default function LayanansPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{
    name: string;
    code: string;
    description: string;
    counter_id: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: layanans = [], isLoading } = useQuery({
    queryKey: ["layanans"],
    queryFn: () => getLayanans(false).then((r) => r.data),
  });

  const { data: counters = [] } = useQuery({
    queryKey: ["counters"],
    queryFn: async () => {
      const { data } = await api.get("/counters");
      return data.data;
    },
  });

  const createMut = useMutation({
    mutationFn: (payload: LayananPayload) => createLayanan(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["layanans"] });
      toast.success("Layanan berhasil ditambahkan.");
      setAddOpen(false);
    },
    onError: (err: unknown) =>
      toast.error(getErrorMessage(err, "Gagal menambahkan layanan.")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: LayananPayload }) =>
      updateLayanan(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["layanans"] });
      toast.success("Layanan berhasil diperbarui.");
      setEditId(null);
      setEditData(null);
    },
    onError: (err: unknown) =>
      toast.error(getErrorMessage(err, "Gagal memperbarui layanan.")),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteLayanan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["layanans"] });
      toast.success("Layanan berhasil dinonaktifkan.");
    },
    onError: (err: unknown) =>
      toast.error(getErrorMessage(err, "Gagal menonaktifkan layanan.")),
  });

  const openEdit = (l: Layanan) => {
    setEditData({
      name: l.name,
      code: l.code,
      description: l.description || "",
      counter_id: l.counter_id?.toString() || "",
    });
    setEditId(l.id);
  };

  const handleAdd = (data: LayananPayload) => {
    setSaving(true);
    createMut.mutate(data, { onSettled: () => setSaving(false) });
  };

  const handleEdit = (data: LayananPayload) => {
    if (!editId) return;
    setSaving(true);
    updateMut.mutate({ id: editId, payload: data }, { onSettled: () => setSaving(false) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manajemen Layanan</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Tambah Layanan
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Memuat…</p>
      ) : layanans.length === 0 ? (
        <p className="text-muted-foreground">Belum ada layanan.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {layanans.map((layanan) => (
            <Card key={layanan.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {layanan.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">Kode: {layanan.code}</p>
                  </div>
                  <Badge
                    variant={layanan.is_active ? "default" : "secondary"}
                    className={cn(
                      layanan.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    )}
                  >
                    {layanan.is_active ? "Aktif" : "Nonaktif"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {layanan.description && (
                  <p className="text-sm text-muted-foreground">
                    {layanan.description}
                  </p>
                )}
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Counter:</p>
                  {layanan.counter ? (
                    <Badge variant="outline">{layanan.counter.name}</Badge>
                  ) : (
                    <p className="text-muted-foreground text-xs">Belum ditugaskan</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(layanan)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm(`Nonaktifkan layanan "${layanan.name}"?`))
                        deleteMut.mutate(layanan.id);
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

      <LayananForm
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="add"
        onSubmit={handleAdd}
        counters={counters}
        saving={saving}
      />

      {editData && (
        <LayananForm
          open={editId !== null}
          onOpenChange={(open) => !open && setEditId(null)}
          mode="edit"
          initialData={editData}
          onSubmit={handleEdit}
          counters={counters}
          saving={saving}
        />
      )}
    </div>
  );
}

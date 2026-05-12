"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Counter } from "@/lib/types";
import type { LayananPayload } from "@/lib/api";

interface LayananFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  initialData?: {
    name: string;
    code: string;
    description: string;
    counter_id: string;
  };
  onSubmit: (data: LayananPayload) => void;
  counters: Counter[];
  saving: boolean;
}

export function LayananForm({
  open,
  onOpenChange,
  mode,
  initialData,
  onSubmit,
  counters,
  saving,
}: LayananFormProps) {
  const emptyForm = { name: "", code: "", description: "", counter_id: "" };
  const [form, setForm] = useState(emptyForm);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setForm(emptyForm);
    onOpenChange(newOpen);
  };

  const currentForm = {
    name: form.name || initialData?.name || "",
    code: form.code || initialData?.code || "",
    description: form.description || initialData?.description || "",
    counter_id: form.counter_id || initialData?.counter_id || "",
  };

  const preparePayload = (): LayananPayload => ({
    name: currentForm.name,
    code: currentForm.code,
    description: currentForm.description || undefined,
    counter_id: currentForm.counter_id ? parseInt(currentForm.counter_id) : undefined,
  });

  const handleSubmit = () => {
    onSubmit(preparePayload());
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Tambah Layanan" : "Edit Layanan"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="layanan-name">Nama</Label>
            <Input
              id="layanan-name"
              value={currentForm.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Customer Service"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="layanan-code">Kode</Label>
            <Input
              id="layanan-code"
              value={currentForm.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="CS"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="layanan-desc">Deskripsi</Label>
            <Input
              id="layanan-desc"
              value={currentForm.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Opsional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="layanan-counter">Counter</Label>
            <select
              id="layanan-counter"
              className="w-full h-10 px-3 border rounded-md bg-background"
              value={currentForm.counter_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, counter_id: e.target.value }))
              }
            >
              <option value="">Pilih counter...</option>
              {counters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !currentForm.name || !currentForm.code}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

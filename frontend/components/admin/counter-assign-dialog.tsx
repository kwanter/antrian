"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { useQueryClient } from "@tanstack/react-query";
import type { User, Counter } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CounterAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counter: Counter | null;
}

export default function CounterAssignDialog({
  open,
  onOpenChange,
  counter,
}: CounterAssignDialogProps) {
  const qc = useQueryClient();
  const { user: currentUser, refreshUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .get("/users", { params: { role: "loket", is_active: true } })
      .then((res) => {
        const data = res.data.data as User[];
        setUsers(data);
        setSelectedIds(counter?.users?.map((u) => u.id) ?? []);
      });
  }, [open, counter]);

  const toggleUser = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!counter) return;
    setSaving(true);
    try {
      await api.post(`/counters/${counter.id}/sync-users`, {
        user_ids: selectedIds,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["counters"] }),
        qc.invalidateQueries({ queryKey: ["users"] }),
      ]);
      if (selectedIds.includes(currentUser?.id ?? -1) || (counter?.users ?? []).some(u => u.id === currentUser?.id)) {
        refreshUser();
      }
      toast.success("Pengguna berhasil ditugaskan ke loket ini.");
      onOpenChange(false);
    } catch {
      toast.error("Gagal menugaskan pengguna.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Tugaskan Pengguna ke Loket {counter?.name ?? ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-80 overflow-y-auto py-2">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Tidak ada pengguna loket aktif.
            </p>
          ) : (
            users.map((user) => {
              const assigned = selectedIds.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleUser(user.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-md border text-left transition-colors",
                    assigned
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "w-5 h-5 rounded border flex items-center justify-center",
                      assigned
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground"
                    )}
                  >
                    {assigned && <span className="text-xs">✓</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

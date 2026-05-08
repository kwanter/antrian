"use client";

import { useState } from "react";
import type { User } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export interface UserFormData {
  name: string;
  email: string;
  password?: string;
  role: "admin" | "loket" | "super";
  is_active: boolean;
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User | null;
  onSubmit: (data: UserFormData) => void;
}

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
}: UserFormDialogProps) {
  const [name, setName] = useState(() => user?.name ?? "");
  const [email, setEmail] = useState(() => user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "loket" | "super">(() => user?.role ?? "loket");
  const [isActive, setIsActive] = useState(() => user?.is_active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: UserFormData = {
      name,
      email,
      role,
      is_active: isActive,
    };

    if (!user || password) {
      data.password = password;
    }

    onSubmit(data);
  };

  const handleCancel = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("loket");
    setIsActive(true);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {user ? "Edit Pengguna" : "Tambah Pengguna Baru"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nama</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masukkan nama"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Masukkan email"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">
              Password
              {!user && <span className="text-destructive ml-1">*</span>}
              {user && (
                <span className="text-muted-foreground text-xs font-normal ml-1">
                  (kosongkan jika tidak diubah)
                </span>
              )}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={user ? "●●●●●●●●" : "Masukkan password"}
              required={!user}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Pilih role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="loket">Loket</SelectItem>
                <SelectItem value="super">Super</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is_active" className="cursor-pointer">
              Status Aktif
            </Label>
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          <DialogFooter className="gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Batal
            </Button>
            <Button type="submit">Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

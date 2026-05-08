"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { User } from "@/lib/types";
import type { UserFormData } from "@/components/admin/user-form-dialog";
import { UserFormDialog } from "@/components/admin/user-form-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Fetch users
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await api.get<{ data: User[] }>("/users");
      return response.data;
    },
  });

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      const response = await api.post("/users", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Pengguna berhasil ditambahkan");
      setDialogOpen(false);
      setEditingUser(null);
    },
    onError: () => {
      toast.error("Gagal menambahkan pengguna");
    },
  });

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UserFormData }) => {
      const response = await api.put(`/users/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Pengguna berhasil diperbarui");
      setDialogOpen(false);
      setEditingUser(null);
    },
    onError: () => {
      toast.error("Gagal memperbarui pengguna");
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Pengguna berhasil dihapus");
    },
    onError: () => {
      toast.error("Gagal menghapus pengguna");
    },
  });

  const handleOpenCreate = () => {
    setEditingUser(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setDialogOpen(true);
  };


  const handleSubmit = (data: UserFormData) => {
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (user: User) => {
    if (confirm(`Apakah Anda yakin ingin menghapus pengguna "${user.name}"?`)) {
      deleteMutation.mutate(user.id);
    }
  };


  const getRoleBadgeVariant = (role: User["role"]) => {
    switch (role) {
      case "admin":
        return "default";
      case "loket":
        return "secondary";
      case "super":
        return "outline";
      default:
        return "secondary";
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Manajemen Pengguna</h1>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Tambah Pengguna
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Memuat...
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-muted-foreground">Gagal memuat data pengguna</p>
          <Button variant="outline" onClick={() => refetch()}>
            Coba Lagi
          </Button>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data && data.data.length > 0 ? (
                data.data.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {user.role === "admin"
                          ? "Admin"
                          : user.role === "loket"
                            ? "Loket"
                            : "Super"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.is_active ? "default" : "destructive"}
                      >
                        {user.is_active ? "Aktif" : "Tidak Aktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-lg text-sm font-medium transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Buka menu</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenEdit(user)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(user)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Hapus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <p className="text-muted-foreground">Belum ada pengguna</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <UserFormDialog
        key={editingUser?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editingUser}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PaginatedResponse, AuditLog } from "@/lib/types";
import { getAuditLogs } from "@/lib/api";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACTION_OPTIONS = [
  { label: "Semua Aksi", value: "all" },
  { label: "Buat (Create)", value: "create" },
  { label: "Ubah (Update)", value: "update" },
  { label: "Hapus (Delete)", value: "delete" },
  { label: "Masuk (Login)", value: "login" },
  { label: "Keluar (Logout)", value: "logout" },
];

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [action, setAction] = useState("all");
  const [userName, setUserName] = useState("");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<
    PaginatedResponse<AuditLog>,
    Error
  >({
    queryKey: ["audit-logs", { page, startDate, endDate, action, userName }],
    queryFn: () =>
      getAuditLogs({
        page,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        action: action === "all" ? undefined : action || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const logs = data?.data ?? [];
  const meta = data?.meta;
  const currentPage = meta?.current_page ?? 1;
  const lastPage = meta?.last_page ?? 1;

  function handleFilterChange() {
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Log Audit</h1>
        <p className="text-muted-foreground text-sm">
          Riwayat aktivitas semua pengguna sistem
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start-date" className="text-xs">
              Tanggal Mulai
            </Label>
            <Input
              id="start-date"
              type="date"
              className="w-40"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                handleFilterChange();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="end-date" className="text-xs">
              Tanggal Akhir
            </Label>
            <Input
              id="end-date"
              type="date"
              className="w-40"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                handleFilterChange();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Aksi</Label>
            <Select
              value={action}
              onValueChange={(val) => {
                setAction(val ?? "all");
                handleFilterChange();
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Semua Aksi" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-filter" className="text-xs">
              User
            </Label>
            <Input
              id="user-filter"
              placeholder="Nama user..."
              className="w-48"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Daftar Log{" "}
            {meta && (
              <span className="text-muted-foreground font-normal text-sm">
                ({meta.total} total)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              Memuat data...
            </div>
          ) : isError ? (
            <div className="flex flex-col h-32 items-center justify-center gap-3 text-muted-foreground">
              <span>Gagal memuat data log audit.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Coba Lagi
              </Button>
            </div>
          ) : (
            <>
              <AuditLogTable logs={logs} />

              {meta && meta.total > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    Halaman {currentPage} dari {lastPage}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1 || isFetching}
                    >
                      Sebelumnya
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={currentPage >= lastPage || isFetching}
                    >
                      Selanjutnya
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

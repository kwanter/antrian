"use client";

import { AuditLog } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AuditLogTableProps {
  logs: AuditLog[];
}

const actionColors: Record<string, string> = {
  create: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  login: "bg-purple-100 text-purple-800",
  logout: "bg-gray-100 text-gray-800",
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AuditLogTable({ logs }: AuditLogTableProps) {
  if (logs.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        Tidak ada data log audit.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">Waktu</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Aksi</TableHead>
          <TableHead>Model</TableHead>
          <TableHead className="w-16 text-center">ID</TableHead>
          <TableHead className="w-28">IP Address</TableHead>
          <TableHead className="w-32">Perubahan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => {
          const actionKey = log.action.toLowerCase().split("_")[0];
          return (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap">
                {formatDate(log.created_at)}
              </TableCell>
              <TableCell>{log.user?.name ?? `User #${log.user_id}`}</TableCell>
              <TableCell>
                <Badge
                  className={cn(
                    "capitalize",
                    actionColors[actionKey] ?? "bg-gray-100 text-gray-800"
                  )}
                >
                  {log.action}
                </Badge>
              </TableCell>
              <TableCell className="capitalize">{log.model}</TableCell>
              <TableCell className="text-center">{log.model_id}</TableCell>
              <TableCell className="font-mono text-xs">{log.ip_address}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Lihat Detail
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

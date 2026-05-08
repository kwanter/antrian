"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { Queue } from "@/lib/types";

interface QueueMonitorTableProps {
  queues: Queue[];
}

export function QueueMonitorTable({ queues }: QueueMonitorTableProps) {
  const getStatusBadge = (status: Queue["status"]) => {
    const variants: Record<Queue["status"], { label: string; className: string }> = {
      waiting: { label: "Menunggu", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
      called: { label: "Dipanggil", className: "bg-blue-100 text-blue-800 border-blue-300" },
      serving: { label: "Dilayani", className: "bg-green-100 text-green-800 border-green-300" },
      completed: { label: "Selesai", className: "bg-gray-100 text-gray-600 border-gray-300" },
      skipped: { label: "Dilewati", className: "bg-red-100 text-red-800 border-red-300" },
    };

    const variant = variants[status];

    return (
      <Badge variant="outline" className={variant.className}>
        {variant.label}
      </Badge>
    );
  };

  const formatCreatedAt = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Antrian Hari Ini</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">No. Antrian</TableHead>
              <TableHead className="w-32">Layanan</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24">Loket</TableHead>
              <TableHead className="w-40">Dibuat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queues.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Belum ada antrian
                </TableCell>
              </TableRow>
            ) : (
              queues.map((queue) => (
                <TableRow key={queue.id}>
                  <TableCell className="font-medium">{queue.ticket_number}</TableCell>
                  <TableCell>{queue.service_type}</TableCell>
                  <TableCell>{getStatusBadge(queue.status)}</TableCell>
                  <TableCell>{queue.counter?.name ?? "-"}</TableCell>
                  <TableCell>{formatCreatedAt(queue.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
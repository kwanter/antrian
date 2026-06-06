"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Printer, Loader2, AlertCircle, RefreshCw, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { usePrinter } from "@/hooks/use-printer";
import { buildQueueTicketBytes } from "@/lib/escpos";
import type { Layanan, Queue, PrinterProfile } from "@/lib/types";

export default function KioskPage() {
  const qc = useQueryClient();
  const printer = usePrinter();

  const [selectedLayanan, setSelectedLayanan] = useState<Layanan | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastQueue, setLastQueue] = useState<Queue | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const { data: layanansData } = useQuery({
    queryKey: ["layanans"],
    queryFn: async () => {
      const { data } = await api.get("/layanans");
      return data.data as Layanan[];
    },
  });

  const { data: printerProfileData } = useQuery({
    queryKey: ["printer-profile-default"],
    queryFn: async () => {
      const { data } = await api.get("/printer-profiles/default");
      return data.data as PrinterProfile | null;
    },
  });

  const createTicket = useMutation({
    mutationFn: async (params: { layanan_id?: number; service_type?: string }) => {
      const { data } = await api.post("/queues", params);
      return data.data as Queue;
    },
    onSuccess: (queue) => {
      setLastQueue(queue);
      qc.invalidateQueries({ queryKey: ["queues"] });
    },
  });

  const handleSelectLayanan = useCallback((layanan: Layanan) => {
    setSelectedLayanan(layanan);
    setShowPreview(true);
    setShowError(false);
  }, []);

  const printQueue = useCallback(
    async (queue: Queue, profile: PrinterProfile) => {
      const template = profile.template ?? {};
      const bytes = buildQueueTicketBytes({
        ticketNumber: queue.ticket_number,
        serviceType: queue.service_type,
        createdAt: queue.created_at
          ? new Date(queue.created_at).toLocaleDateString("id-ID", {
              timeZone: "Asia/Makassar",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
        headerText: (template.header_text as string) || profile.header_text || undefined,
        footerText: (template.footer_text as string) || profile.footer_text || undefined,
        paperSize: (template.paper_size as "58mm" | "80mm") || profile.paper_size || "58mm",
        copyCount: (template.copy_count as number) || profile.copy_count || 1,
        cutMode: (template.cut_mode as "none" | "partial" | "full") || "partial",
      });

      if ((template.connection_type as string) === "windows_bridge") {
        await printer.printViaBridge(bytes);
        return;
      }

      if (!printer.isConnected) {
        await printer.connect({
          baudRate: (template.baud_rate as number) ?? 9600,
        });
      }
      await printer.print(bytes);
    },
    [printer],
  );

  const handlePrint = useCallback(async () => {
    if (!selectedLayanan) return;

    setIsPrinting(true);
    setShowError(false);

    try {
      const queue = await createTicket.mutateAsync({
        layanan_id: selectedLayanan.id,
        service_type: selectedLayanan.name,
      });

      if (!printerProfileData) {
        setErrorMessage("Profil printer belum diatur. Hubungi admin.");
        setShowError(true);
        return;
      }

      await printQueue(queue, printerProfileData);

      setShowPreview(false);
      setSelectedLayanan(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mencetak tiket";
      setErrorMessage(message);
      setShowError(true);
    } finally {
      setIsPrinting(false);
    }
  }, [selectedLayanan, createTicket, printerProfileData, printQueue]);

  const handleRetryPrint = useCallback(async () => {
    if (!lastQueue || !printerProfileData) return;

    setIsPrinting(true);
    setShowError(false);

    try {
      await printQueue(lastQueue, printerProfileData);
      setShowError(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mencetak ulang";
      setErrorMessage(message);
      setShowError(true);
    } finally {
      setIsPrinting(false);
    }
  }, [lastQueue, printerProfileData, printQueue]);

  const connectionType = (printerProfileData?.template?.connection_type as string) ?? "web_serial";
  const isWindowsBridge = connectionType === "windows_bridge";

  const handleClosePreview = useCallback(() => {
    setShowPreview(false);
    setSelectedLayanan(null);
    setShowError(false);
  }, []);

  const layanans = layanansData ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Ambil Nomor Antrian</h1>
          <p className="mt-2 text-slate-600">Pilih layanan yang Anda butuhkan</p>
        </div>

        {/* Printer status */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <Badge
            variant={
              isWindowsBridge
                ? printer.isBridgeAvailable
                  ? "default"
                  : "secondary"
                : printer.isConnected
                ? "default"
                : "secondary"
            }
            className="gap-1"
          >
            <Printer className="h-3 w-3" />
            {isWindowsBridge
              ? printer.isBridgeAvailable
                ? "Bridge Aktif"
                : "Bridge Tidak Terdeteksi"
              : printer.isConnected
              ? "Printer Terhubung"
              : printer.isWebSerialAvailable
              ? "Printer Belum Terhubung"
              : "Web Serial Tidak Tersedia"}
          </Badge>
          {!isWindowsBridge && !printer.isConnected && printer.isWebSerialAvailable && (
            <Button variant="outline" size="sm" onClick={() => printer.connect()}>
              Hubungkan Printer
            </Button>
          )}
        </div>

        {/* Layanan grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {layanans.map((layanan) => (
            <motion.div
              key={layanan.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card
                className="cursor-pointer border-2 border-transparent transition-colors hover:border-blue-200"
                onClick={() => handleSelectLayanan(layanan)}
              >
                <CardContent className="flex flex-col items-center gap-3 p-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-600">
                    {layanan.code}
                  </div>
                  <div className="text-center">
                    <h3 className="text-lg font-semibold">{layanan.name}</h3>
                    {layanan.description && (
                      <p className="text-sm text-slate-500">{layanan.description}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Preview modal */}
        <AnimatePresence>
          {showPreview && selectedLayanan && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
              >
                <div className="mb-4 text-center">
                  <h2 className="text-xl font-bold">{selectedLayanan.name}</h2>
                  <p className="text-sm text-slate-500">Konfirmasi pencetakan tiket</p>
                </div>

                {showError && (
                  <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="mb-6 flex flex-col gap-3">
                  {showError && !isWindowsBridge && !printer.isConnected && printer.isWebSerialAvailable && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full"
                      onClick={async () => {
                        setShowError(false);
                        try {
                          await printer.connect({
                            baudRate: (printerProfileData?.template?.baud_rate as number) ?? 9600,
                          });
                        } catch (err) {
                          const message = err instanceof Error ? err.message : "Gagal menghubungkan printer";
                          setErrorMessage(message);
                          setShowError(true);
                        }
                      }}
                      disabled={isPrinting || printer.isConnecting}
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Hubungkan Printer
                    </Button>
                  )}
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={handlePrint}
                    disabled={isPrinting}
                  >
                    {isPrinting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Mencetak...
                      </>
                    ) : (
                      <>
                        <Printer className="mr-2 h-4 w-4" />
                        Cetak Tiket
                      </>
                    )}
                  </Button>

                  {showError && lastQueue && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full"
                      onClick={handleRetryPrint}
                      disabled={isPrinting}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Cetak Ulang Tiket
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="lg"
                    className="w-full"
                    onClick={handleClosePreview}
                    disabled={isPrinting}
                  >
                    Batal
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success toast-like */}
        <AnimatePresence>
          {!showPreview && lastQueue && !showError && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2"
            >
              <div className="flex items-center gap-2 rounded-full bg-green-100 px-6 py-3 text-green-800 shadow-lg">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">
                  Tiket {lastQueue.ticket_number} berhasil dicetak
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { ServiceButton } from "@/components/kiosk/service-button";
import { TicketPreview } from "@/components/kiosk/ticket-preview";
import { PrintStatus } from "@/components/kiosk/print-status";
import { useCreateTicket } from "@/hooks/use-queue";
import { useQueueChannel } from "@/hooks/use-websocket";
import { getLayanans } from "@/lib/api";
import type { Layanan } from "@/lib/types";
import { Users, Star, Heart, Stethoscope, Building2, Loader2 } from "lucide-react";

type FlowState = "select" | "generating" | "preview" | "printing" | "success" | "error";

export default function KioskPage() {
  const [flow, setFlow] = useState<FlowState>("select");
  const [ticketData, setTicketData] = useState<{
    ticket_number: string;
    service_type: string;
    created_at: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [layanans, setLayanans] = useState<Layanan[]>([]);
  const [loadingLayanans, setLoadingLayanans] = useState(true);

  const createTicket = useCreateTicket();

  useQueueChannel(() => {});

  useEffect(() => {
    getLayanans(true)
      .then((r) => {
        setLayanans(r.data);
        setLoadingLayanans(false);
      })
      .catch(() => setLoadingLayanans(false));
  }, []);

  useEffect(() => {
    if (flow === "success") {
      const timer = setTimeout(() => {
        setFlow("select");
        setTicketData(null);
        setErrorMessage("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [flow]);

  const handleServiceSelect = (params: { layanan_id?: number; service_type?: string }) => {
    setFlow("generating");
    setErrorMessage("");

    createTicket.mutate(params, {
      onSuccess: (ticket) => {
        setTicketData({
          ticket_number: ticket.ticket_number,
          service_type: ticket.service_type,
          created_at: ticket.created_at,
        });
        setFlow("preview");

        setTimeout(() => {
          setFlow("printing");
          setTimeout(() => setFlow("success"), 2000);
        }, 1500);
      },
      onError: (error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "Gagal membuat tiket. Silakan coba lagi.");
        setFlow("error");
      },
    });
  };

  const handleRetry = () => {
    setFlow("select");
    setTicketData(null);
    setErrorMessage("");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-slate-800">Sistem Antrian Digital</h1>
        <p className="text-slate-500 mt-2">Pilih layanan untuk mendapatkan nomor antrian</p>
      </div>

      {flow === "select" && (
        <div className="w-full max-w-2xl">
          {loadingLayanans ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              <span className="ml-3 text-slate-500">Memuat layanan...</span>
            </div>
          ) : layanans.length > 0 ? (
            <div className="grid grid-cols-2 gap-6">
              {layanans.map((layanan) => (
                <ServiceButton
                  key={layanan.id}
                  label={layanan.name}
                  icon={<Building2 className="text-4xl" />}
                  onClick={() => handleServiceSelect({ layanan_id: layanan.id })}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <ServiceButton label="Layanan Umum" icon={<Users className="text-4xl" />} onClick={() => handleServiceSelect({ service_type: "Umum" })} />
              <ServiceButton label="Prioritas" icon={<Star className="text-4xl" />} onClick={() => handleServiceSelect({ service_type: "Prioritas" })} />
              <ServiceButton label="Pelayanan BPJS" icon={<Heart className="text-4xl" />} onClick={() => handleServiceSelect({ service_type: "BPJS" })} />
              <ServiceButton label="Konsultasi" icon={<Stethoscope className="text-4xl" />} onClick={() => handleServiceSelect({ service_type: "Konsultasi" })} />
            </div>
          )}
        </div>
      )}

      {flow === "generating" && (
        <div className="text-center">
          <div className="animate-spin w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-xl font-medium text-slate-700 mt-6">Membuat nomor antrian...</p>
        </div>
      )}

      {flow === "preview" && ticketData && (
        <div className="w-full max-w-md">
          <p className="text-center text-slate-600 mb-6">Tiket Anda siap!</p>
          <TicketPreview ticketNumber={ticketData.ticket_number} serviceType={ticketData.service_type} createdAt={ticketData.created_at} />
        </div>
      )}

      {(flow === "printing" || flow === "success") && (
        <div className="text-center">
          <PrintStatus status={flow === "printing" ? "printing" : "success"} />
          {flow === "success" && ticketData && (
            <div className="mt-8">
              <TicketPreview ticketNumber={ticketData.ticket_number} serviceType={ticketData.service_type} createdAt={ticketData.created_at} />
            </div>
          )}
          {flow === "success" && <p className="text-slate-500 mt-8">Halaman akan reset otomatis dalam 5 detik...</p>}
        </div>
      )}

      {flow === "error" && (
        <div className="text-center">
          <PrintStatus status="error" errorMessage={errorMessage} />
          <button onClick={handleRetry} className="mt-8 px-8 py-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 active:scale-[0.98] transition">
            Coba Lagi
          </button>
        </div>
      )}
    </div>
  );
}
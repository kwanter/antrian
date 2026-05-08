"use client";

import { useState, useCallback } from "react";

interface UsePrinterReturn {
  connect: () => Promise<void>;
  print: (bytes: Uint8Array) => Promise<void>;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
}

export function usePrinter(): UsePrinterReturn {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [port, setPort] = useState<any>(null);

  const isWebSerialAvailable = typeof navigator !== "undefined" && "serial" in navigator;

  const connect = useCallback(async () => {
    if (!isWebSerialAvailable) {
      setError("Web Serial API tidak tersedia di browser ini");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const selectedPort = await (navigator as any).serial.requestPort();
      await selectedPort.open({ baudRate: 9600 });
      setPort(selectedPort);
      setIsConnected(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menghubungkan ke printer";
      setError(message);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, [isWebSerialAvailable]);

  const print = useCallback(async (bytes: Uint8Array) => {
    if (!port || !isConnected) {
      setError("Printer belum terhubung");
      return;
    }

    try {
      const writer = port.writable?.getWriter();
      if (!writer) {
        setError("Tidak dapat menulis ke printer");
        return;
      }
      await writer.write(bytes);
      writer.releaseLock();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mencetak";
      setError(message);
    }
  }, [port, isConnected]);

  return { connect, print, isConnecting, isConnected, error };
}
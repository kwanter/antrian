"use client";

import { useState, useCallback, useEffect } from "react";

interface UsePrinterReturn {
  connect: (options?: { baudRate?: number }) => Promise<void>;
  disconnect: () => Promise<void>;
  print: (bytes: Uint8Array) => Promise<void>;
  printViaBridge: (bytes: Uint8Array, url?: string) => Promise<void>;
  bridgeUrl: string | null;
  isBridgeAvailable: boolean;
  isWebSerialAvailable: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  clearError: () => void;
}

export function usePrinter(): UsePrinterReturn {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgeUrl, setBridgeUrl] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [port, setPort] = useState<any>(null);

  const isWebSerialAvailable =
    typeof navigator !== "undefined" && "serial" in navigator;

  const clearError = useCallback(() => setError(null), []);

  const connect = useCallback(
    async (options?: { baudRate?: number }) => {
      if (!isWebSerialAvailable) {
        const message = "Web Serial API tidak tersedia di browser ini";
        setError(message);
        throw new Error(message);
      }

      setIsConnecting(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const selectedPort = await (navigator as any).serial.requestPort();
        await selectedPort.open({ baudRate: options?.baudRate ?? 9600 });
        setPort(selectedPort);
        setIsConnected(true);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Gagal menghubungkan ke printer";
        setError(message);
        setIsConnected(false);
        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [isWebSerialAvailable],
  );

  const disconnect = useCallback(async () => {
    if (!port) return;
    try {
      await port.close();
    } catch {
      // ignore
    } finally {
      setPort(null);
      setIsConnected(false);
    }
  }, [port]);

  const print = useCallback(
    async (bytes: Uint8Array) => {
      if (!port || !isConnected) {
        const message = "Printer belum terhubung";
        setError(message);
        throw new Error(message);
      }

      const writer = port.writable?.getWriter();
      if (!writer) {
        const message = "Tidak dapat menulis ke printer";
        setError(message);
        throw new Error(message);
      }

      try {
        await writer.write(bytes);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Gagal mencetak";
        setError(message);
        throw err;
      } finally {
        try {
          writer.releaseLock();
        } catch {
          // ignore
        }
      }
    },
    [port, isConnected],
  );

  const printViaBridge = useCallback(
    async (bytes: Uint8Array, url?: string) => {
      const target = url ?? bridgeUrl ?? "http://127.0.0.1:17758";
      try {
        const payload = btoa(String.fromCharCode(...bytes));
        const res = await fetch(`${target}/print`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Bridge print failed");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Gagal bridge print";
        setError(message);
        throw err;
      }
    },
    [bridgeUrl],
  );

  // Auto-detect bridge on mount
  useEffect(() => {
    const detect = async () => {
      try {
        const res = await fetch("http://127.0.0.1:17758/status", {
          method: "GET",
          signal: AbortSignal.timeout(1500),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "ok") {
            setBridgeUrl("http://127.0.0.1:17758");
          }
        }
      } catch {
        // bridge not running
      }
    };
    detect();
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (port) {
        try {
          port.close().catch(() => undefined);
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connect,
    disconnect,
    print,
    printViaBridge,
    bridgeUrl,
    isBridgeAvailable: !!bridgeUrl,
    isWebSerialAvailable,
    isConnecting,
    isConnected,
    error,
    clearError,
  };
}

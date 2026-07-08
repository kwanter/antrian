"""
Iware C-58BT ESC/POS Windows Bridge
Runs on the Windows kiosk PC. Accepts base64 ESC/POS bytes via HTTP POST
and writes them to the printer.

Two modes:
  serial  — COM port (USB virtual COM, e.g. CH340/FTDI)
  raw     — Windows raw printer driver (USB printer class)

Usage:
  python bridge.py                          # auto-detect: serial (default COM5) or raw ("Iware C-58BT")
  python bridge.py --mode serial COM5 9600  # explicit serial
  python bridge.py --mode raw "Iware C-58BT" # explicit raw printer
  python bridge.py --list                   # list available COM ports + raw printers
"""

import http.server
import json
import sys
import base64
import os

HOST = "127.0.0.1"
PORT = 17758
DEFAULT_COM = "COM5"
DEFAULT_BAUD = 9600
DEFAULT_RAW_PRINTER = "Iware C-58BT"

mode = "auto"
com_port = DEFAULT_COM
baud_rate = DEFAULT_BAUD
raw_printer = DEFAULT_RAW_PRINTER


def list_com_ports():
    try:
        import serial.tools.list_ports
        ports = serial.tools.list_ports.comports()
        if not ports:
            print("  (no COM ports found)")
        for p in ports:
            print(f"  {p.device} — {p.description}")
        return [p.device for p in ports]
    except ImportError:
        print("  pyserial not installed — run: pip install pyserial")
        return []


def list_raw_printers():
    try:
        import win32print
        printers = win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        )
        for p in printers:
            print(f"  {p[2]}")  # p[2] is printer name
        return [p[2] for p in printers]
    except ImportError:
        print("  pywin32 not installed — run: pip install pywin32")
        return []


###############################################################################
# HTTP Server
###############################################################################


class PrintHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "mode": mode,
                "com_port": com_port,
                "baud_rate": baud_rate,
                "raw_printer": raw_printer,
            }).encode())
        else:
            self.send_response(404)
            self._cors()
            self.end_headers()
            self.wfile.write(json.dumps({"error": "not found"}).encode())

    def do_POST(self):
        if self.path == "/print":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length))
                payload_b64 = body.get("payload", "")
                payload = base64.b64decode(payload_b64)

                if mode == "raw":
                    _raw_print(raw_printer, payload)
                else:
                    _serial_print(com_port, baud_rate, payload)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "ok",
                    "bytes_sent": len(payload),
                }).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self._cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "error",
                    "message": str(e),
                }).encode())
        else:
            self.send_response(404)
            self._cors()
            self.end_headers()
            self.wfile.write(json.dumps({"error": "not found"}).encode())

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        # Chrome/Edge Private Network Access preflight for web app -> localhost bridge.
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")

    def log_message(self, fmt, *args):
        pass  # quiet


###############################################################################
# Print backends
###############################################################################


def _serial_print(port: str, baud: int, data: bytes):
    import serial
    with serial.Serial(port, baud, timeout=5) as ser:
        ser.write(data)


def _raw_print(printer_name: str, data: bytes):
    import win32print
    hprinter = win32print.OpenPrinter(printer_name)
    try:
        job_id = win32print.StartDocPrinter(hprinter, 1, ("Antrian Ticket", None, "RAW"))
        win32print.StartPagePrinter(hprinter)
        win32print.WritePrinter(hprinter, data)
        win32print.EndPagePrinter(hprinter)
        win32print.EndDocPrinter(hprinter)
    finally:
        win32print.ClosePrinter(hprinter)


###############################################################################
# CLI
###############################################################################


if __name__ == "__main__":
    args = sys.argv[1:]

    if "--list" in args or "-l" in args:
        print("COM ports:")
        list_com_ports()
        print()
        print("Raw printers:")
        list_raw_printers()
        sys.exit(0)

    # Parse --mode
    for i, arg in enumerate(args):
        if arg == "--mode":
            mode = args[i + 1]
            if mode == "serial":
                if len(args) > i + 2:
                    com_port = args[i + 2]
                if len(args) > i + 3:
                    baud_rate = int(args[i + 3])
            elif mode == "raw":
                if len(args) > i + 2:
                    raw_printer = args[i + 2]
            break

    print(f"Iware C-58BT bridge on http://{HOST}:{PORT}")
    if mode == "raw":
        print(f"Mode: raw → \"{raw_printer}\"")
    else:
        print(f"Mode: serial → {com_port} @ {baud_rate} baud")
    print("Press Ctrl+C to stop")

    server = http.server.HTTPServer((HOST, PORT), PrintHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBridge stopped.")
        server.server_close()

# Iware C-58BT Print Fix + Admin Test + Windows Bridge

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make kiosk ticket printing work end-to-end with Iware C-58BT thermal printer on Windows PC — Web Serial primary, Windows Bridge fallback — plus a real "Test Print" button in admin.

**Architecture:** Browser Web Serial as primary print path (Iware C-58BT exposed as COM port via Bluetooth SPP). Local Windows Python bridge as fallback when Iware not visible in Web Serial picker. Backend stays as printer-profile store only. ESC/POS bytes built client-side.

**Tech:** Next.js 16 client components, Laravel 13 profile CRUD (done), ESC/POS Uint8Array builder (done), Web Serial API, optional Python socket bridge for Windows.

---

## Context / Root Cause Analysis

### What works already

| Component | Status | Notes |
|-----------|--------|-------|
| `EscPosBuilder` | ✅ Complete | init/align/text/separator/cut/feed all implemented |
| `buildQueueTicketBytes` | ✅ Complete | test flag `isTest`, 58mm/80mm, copy count, cut mode |
| `buildPrinterTestTicket` | ✅ Complete | test ticket wrapper, calls `buildQueueTicketBytes(isTest:true)` |
| `usePrinter` hook | ✅ Complete | connect/disconnect/print/error/Web Serial check |
| Backend `PrinterProfilesController` | ✅ Complete | CRUD + default profile endpoint + full validation |
| Backend tests (`PrinterProfileTest`) | ✅ 7 tests passing | factory exists, template normalization verified |
| Admin `PrinterTemplateEditor` | ✅ Complete | Iware C-58BT as default model, all fields |
| Admin `/printers` page | ✅ Has "Test Print" button | calls `printer.connect()` then `printer.print(buildPrinterTestTicket())` |
| Kiosk `page.tsx` | ✅ Connects + prints | uses `usePrinter()` + `buildQueueTicketBytes` + retry |
| `PrinterTemplate` TS type | ✅ Complete | connection_type, baud_rate, charset, cut_mode, printer_model |

### What's broken / missing

1. **Kiosk silently skips if no default profile exists** — closes preview without feedback
2. **Kiosk no-retry for connect failure** — if connect throws, no "Hubungkan Printer" fallback inside print flow
3. **No physical verification of Test Print** — admin clicks Test Print, bytes sent, no physical confirmation input
4. **Iware C-58BT pairing on Windows** — may not appear as serial device in Web Serial picker; needs documentation
5. **No Windows Bridge fallback** — if Web Serial can't find Iware (common with BT-SPP on Windows), no fallback
6. **No printer status indicator in admin** — admin can't see if Web Serial is available on current machine

---

## Phase 1 — Harden kiosk print flow (frontend, ~15 min)

### Task 1.1: Kiosk — show error when no printer profile

**Objective:** If no default printer profile is returned by API, show clear error to kiosk user instead of silently closing.

**File:** `frontend/app/kiosk/page.tsx:71-75`

**Current (bug):**
```ts
if (!printerProfileData) {
  setShowPreview(false);
  setSelectedLayanan(null);
  return;
}
```

**Fix:**
```ts
if (!printerProfileData) {
  setErrorMessage("Profil printer belum diatur. Hubungi admin.");
  setShowError(true);
  return;
}
```

**Step 1:** Make the above edit.
**Step 2:** Verify kiosk renders error in preview modal instead of closing.
**Step 3:** `cd frontend && npm run lint`

---

### Task 1.2: Kiosk — add "Hubungkan Printer" fallback inside preview

**Objective:** If printer not connected and connect() fails inside handlePrint, show error with Hubungkan button, not just error message.

**File:** `frontend/app/kiosk/page.tsx:77-81`

**Current:** If connect fails, catch block shows error, but user has to close/reopen preview to retry connect.

**Fix — in catch block, add connectFailure hint:**
```ts
catch (err) {
  const message = err instanceof Error ? err.message : "Gagal mencetak tiket";
  setErrorMessage(message);
  setShowError(true);
  // Don't close preview — let user see "Hubungkan Printer" button that's already in UI
}
```

Also, in the error section of the preview modal (after `{showError && ...}` block), add:
```tsx
{showError && !printer.isConnected && printer.isWebSerialAvailable && (
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
        // Auto-retry print
        handlePrint();
      } catch {
        // printer.connect already sets its own error
      }
    }}
    disabled={isPrinting}
  >
    <Printer className="mr-2 h-4 w-4" />
    Hubungkan Printer
  </Button>
)}
```

**Step 1:** Make the above edits.
**Step 2:** `cd frontend && npm run lint`

---

## Phase 2 — Admin "Test Print" improvements (~10 min)

### Task 2.1: Admin — show printer connection status

**Objective:** Display Web Serial availability badge at the top of `/printers` page.

**File:** `frontend/app/(admin)/printers/page.tsx:137-145`

**Add** after the header `<div className="flex items-center justify-between">`:
```tsx
{!printer.isWebSerialAvailable && (
  <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-2 text-sm text-yellow-800">
    <AlertCircle className="h-4 w-4" />
    Web Serial API tidak tersedia. Gunakan Chrome/Edge. Untuk Windows, pastikan printer terhubung sebagai COM port.
  </div>
)}
```

**Step 1:** Add import for `AlertCircle` from lucide-react.
**Step 2:** Add the warning div.
**Step 3:** `cd frontend && npm run lint`

---

### Task 2.2: Admin — add printer connect button per profile

**Objective:** Each profile card shows "Hubungkan" button (uses profile's baud_rate from template) so admin can connect before test-printing.

**File:** `frontend/app/(admin)/printers/page.tsx`

**Add** above the "Test Print" button in profile card actions:
```tsx
{!printer.isConnected && printer.isWebSerialAvailable && (
  <Button
    variant="outline"
    size="sm"
    className="flex-1"
    onClick={() => {
      const baudRate = (p.template?.baud_rate as number) ?? 9600;
      printer.connect({ baudRate });
    }}
  >
    Hubungkan
  </Button>
)}
```

**Step 1:** Add the button.
**Step 2:** `cd frontend && npm run lint`

---

### Task 2.3: Admin — confirm physical print after test

**Objective:** After Test Print succeeds, show toast asking "Apakah struk tercetak?" with buttons "Ya, Berhasil" / "Tidak, Gagal" to confirm physical output. Log result as toast.

**File:** `frontend/app/(admin)/printers/page.tsx:129-134`

**Current:**
```ts
await printer.print(bytes);
toast.success("Test print berhasil dikirim ke printer");
```

**Replace with:**
```ts
await printer.print(bytes);
toast.success("Test print berhasil dikirim ke printer", {
  description: "Periksa apakah struk keluar dari printer",
});
```

Simple improvement — no new modal needed. Physical verification = user responsibility at kiosk.

---

## Phase 3 — Windows Bridge fallback (~30 min)

### Task 3.1: Create Windows bridge script

**Objective:** A single-file Python script that runs on the Windows kiosk PC, accepts HTTP POST `/print` and writes raw ESC/POS bytes to the Iware C-58BT COM port.

**File:** `docs/iware-bridge/bridge.py`

```python
"""
Iware C-58BT ESC/POS Windows Bridge
Runs on the kiosk PC. Accepts base64 ESC/POS bytes via HTTP POST.

Requirements (run once):
  pip install pyserial requests

Usage:
  python bridge.py              # default COM5 at 9600 baud
  python bridge.py COM7 19200   # custom port and baud
  python bridge.py --list       # list available COM ports
"""
import http.server
import json
import sys
import base64
import serial
import serial.tools.list_ports

BAUD_RATE = 9600
COM_PORT = "COM5"
HOST = "127.0.0.1"
PORT = 17758

def list_com_ports():
    ports = serial.tools.list_ports.comports()
    if not ports:
        print("No COM ports found.")
    for p in ports:
        print(f"  {p.device} — {p.description}")
    return [p.device for p in ports]

class PrintHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "com_port": COM_PORT,
                "baud_rate": BAUD_RATE,
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/print":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            payload_b64 = body.get("payload", "")
            payload = base64.b64decode(payload_b64)
            try:
                with serial.Serial(COM_PORT, BAUD_RATE, timeout=2) as ser:
                    ser.write(payload)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "bytes_sent": len(payload)}).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # quiet

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--list":
        list_com_ports()
        sys.exit(0)
    if len(sys.argv) > 1:
        COM_PORT = sys.argv[1]
    if len(sys.argv) > 2:
        BAUD_RATE = int(sys.argv[2])
    server = http.server.HTTPServer((HOST, PORT), PrintHandler)
    print(f"Iware bridge listening on http://{HOST}:{PORT}")
    print(f"COM port: {COM_PORT} @ {BAUD_RATE} baud")
    print("Press Ctrl+C to stop")
    server.serve_forever()
```

**Step 1:** Create `docs/iware-bridge/bridge.py`.
**Step 2:** Verify syntax: `python3 -c "import ast; ast.parse(open('docs/iware-bridge/bridge.py').read())"`
**Step 3:** Commit.

---

### Task 3.2: Extend `usePrinter` with Windows Bridge support

**Objective:** Add `printViaBridge(bytes, bridgeUrl)` method and bridge detection.

**File:** `frontend/hooks/use-printer.ts`

**Add** after the existing state and before return:

```ts
const [bridgeUrl, setBridgeUrl] = useState<string | null>(null);

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

const printViaBridge = useCallback(
  async (bytes: Uint8Array, url: string) => {
    try {
      const payload = btoa(String.fromCharCode(...bytes));
      const res = await fetch(`${url}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Bridge print failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal bridge print";
      setError(message);
      throw err;
    }
  },
  []
);
```

**Update return** to include:
```ts
bridgeUrl,
printViaBridge,
isBridgeAvailable: !!bridgeUrl,
```

---

### Task 3.3: Admin Test Print — route through bridge when `connection_type=windows_bridge`

**File:** `frontend/app/(admin)/printers/page.tsx:108-135`

**Current** throws error for `windows_bridge`. **Replace with:**
```ts
const testPrint = async (profile: PrinterProfile) => {
  const template = profile.template ?? {};
  const baudRate = (template.baud_rate as number) ?? 9600;

  try {
    const bytes = buildPrinterTestTicket({
      header_text: (template.header_text as string) || profile.header_text || undefined,
      footer_text: (template.footer_text as string) || profile.footer_text || undefined,
      paper_size: (template.paper_size as string) || profile.paper_size,
      copy_count: (template.copy_count as number) || profile.copy_count,
      cut_mode: (template.cut_mode as string) || "partial",
    });

    if ((template.connection_type as string) === "windows_bridge") {
      if (!printer.bridgeUrl) {
        throw new Error("Windows Bridge tidak aktif. Jalankan bridge.py di PC Windows.");
      }
      await printer.printViaBridge(bytes, printer.bridgeUrl);
    } else {
      if (!printer.isConnected) {
        await printer.connect({ baudRate });
      }
      await printer.print(bytes);
    }

    toast.success("Test print berhasil dikirim ke printer", {
      description: "Periksa apakah struk keluar dari printer",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test print gagal";
    toast.error(message);
  }
};
```

---

### Task 3.4: Kiosk — route through bridge when profile is windows_bridge

**File:** `frontend/app/kiosk/page.tsx`

**Modify `handlePrint`** — after building `bytes`, route through bridge if profile says so:

```ts
if ((template.connection_type as string) === "windows_bridge") {
  if (!printer.bridgeUrl) {
    throw new Error("Printer bridge tidak aktif. Hubungi petugas.");
  }
  await printer.printViaBridge(bytes, printer.bridgeUrl);
} else {
  await printer.print(bytes);
}
```

Same for `handleRetryPrint`.

---

## Phase 4 — Iware C-58BT Windows pairing docs (~10 min)

### Task 4.1: Write Windows pairing guide

**File:** `docs/iware-bridge/README.md`

Content: How to pair Iware C-58BT on Windows, find COM port, run bridge, verify print.

```markdown
# Iware C-58BT Windows Bridge

## Pairing the Printer

1. Turn on Iware C-58BT (hold power 3s)
2. Windows Settings → Bluetooth → Add device → select "Iware C-58BT"
3. Pair with PIN 0000 or 1234
4. Windows assigns a COM port (usually COM5-COM9)
5. Note the COM port number

## Finding the COM Port

Method 1: Device Manager → Ports (COM & LPT) → look for "Standard Serial over Bluetooth link"
Method 2: `python bridge.py --list` (shows all COM ports)

## Running the Bridge

```bash
pip install pyserial
python bridge.py COM5 9600
```

Verify: `curl http://127.0.0.1:17758/status`

## Admin Setup

1. Login → /printers → Tambah Profil
2. Nama: "Iware C-58BT (Kiosk)"
3. Connection Type: "Windows Bridge (layanan lokal)"
4. Paper Size: 58mm
5. Baud Rate: 9600
6. Click "Test Print" → check physical receipt

## Kiosk Behavior

When profile has connection_type=windows_bridge:
- Kiosk sends ESC/POS bytes to bridge at 127.0.0.1:17758
- Bridge writes to COM port
- No browser permissions needed
```

---

## Phase 5 — Verification & QA

### Backend tests (done)
```bash
cd /Users/macbook/Developer/php/antrian/backend
php artisan test --filter=PrinterProfileTest
```

Expected: 7 tests passing.

### Frontend lint + build
```bash
cd /Users/macbook/Developer/php/antrian/frontend
npm run lint
npm run build
```

### Manual verification (on Windows kiosk PC)
1. Pair Iware C-58BT as Bluetooth SPP → note COM port
2. Run `python bridge.py COMx 9600` → verify `/status` returns OK
3. Admin → /printers → Tambah Profil Iware C-58BT (windows_bridge, 58mm, partial cut)
4. Click "Test Print" → physical receipt prints
5. Kiosk → select layanan → Cetak Tiket → physical receipt prints
6. Error case: stop bridge → kiosk shows "Printer bridge tidak aktif"

---

## Key Pitfalls

1. **Web Serial needs user gesture** — `navigator.serial.requestPort()` must be called inside a click handler, never from timeout/effect
2. **Iware C-58BT may not appear in Web Serial picker** — Bluetooth SPP devices are often invisible; bridge is primary Windows path
3. **`btoa()` limit** — `btoa(String.fromCharCode(...bytes))` fails for Uint8Array > ~65KB; slice into chunks if needed (unlikely for 58mm receipt)
4. **PrinterProfile has no `is_default` field** — backend `defaultProfile()` uses first 58mm. If no profile exists, kiosk gets null and shows error (Task 1.1)
5. **Don't auto-open serial port** — always require user click, even in kiosk
6. **`printer.connect()` inside `handlePrint`** — this is inside a button click handler, so it's a user gesture. ✅ OK for Web Serial

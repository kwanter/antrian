# Iware C-58BT USB Printer Bridge

Target printer: Iware C-58BT, 58mm thermal, connected to Windows kiosk PC via USB.

## Preferred path: Web Serial

Use this if Windows exposes the USB printer as a COM port.

1. Plug printer USB into Windows PC.
2. Open Device Manager.
3. Check `Ports (COM & LPT)`.
4. If you see a port like `USB-SERIAL CH340 (COM5)` or similar, Chrome/Edge Web Serial can usually print directly.
5. In Antrian admin → `/printers`:
   - Model: `Iware C-58BT`
   - Connection Type: `Web Serial`
   - Paper Size: `58mm`
   - Baud Rate: `9600`
   - Cut Mode: `partial`
6. Click `Hubungkan`, select the USB/COM printer, then click `Test Print`.

## Fallback path: Windows Bridge

Use this if the printer appears only under `Printers & scanners`, not as a COM port.

### Install

On the Windows kiosk PC:

```powershell
py -m pip install pyserial pywin32
```

Copy `bridge.py` to the Windows PC.

### List devices

```powershell
py bridge.py --list
```

This shows:
- COM ports, for serial mode
- Windows printer names, for raw mode

### Run serial bridge

If printer has COM port:

```powershell
py bridge.py --mode serial COM5 9600
```

### Run raw USB printer bridge

If printer is a Windows printer driver only:

```powershell
py bridge.py --mode raw "Iware C-58BT"
```

Keep the window open. Bridge listens at:

```text
http://127.0.0.1:17758
```

Verify:

```powershell
curl http://127.0.0.1:17758/status
```

Expected JSON:

```json
{"status":"ok"}
```

## Admin setup for bridge mode

1. Login admin.
2. Open `/printers`.
3. `Tambah Profil`.
4. Name: `Iware C-58BT USB`.
5. Model: `Iware C-58BT`.
6. Connection Type: `Windows Bridge`.
7. Paper Size: `58mm`.
8. Baud Rate: `9600` (ignored in raw mode, used in serial mode).
9. Cut Mode: `partial`.
10. Save.
11. Click `Test Print`.
12. Confirm physical paper comes out.

## Kiosk behavior

When default profile uses:

```json
{"connection_type":"web_serial"}
```

Kiosk prints through Chrome Web Serial.

When default profile uses:

```json
{"connection_type":"windows_bridge"}
```

Kiosk sends ESC/POS bytes to `http://127.0.0.1:17758/print`; bridge writes to the USB printer.

## Troubleshooting

### Web Serial not available

Use Chrome or Edge. Firefox/Safari do not support Web Serial.

### Printer not shown in Web Serial picker

Likely not a virtual COM printer. Use Windows Bridge raw mode.

### Bridge says printer not found

Run:

```powershell
py bridge.py --list
```

Copy the exact printer name from the `Raw printers:` list.

### Ticket sends but no paper

Try:

```powershell
py bridge.py --mode raw "EXACT PRINTER NAME"
```

Also verify the Windows driver can print a test page.

### Garbled text

Keep receipt text ASCII/simple Indonesian. ESC/POS charset handling differs per device; current app sends UTF-8 bytes.

### Cutter not working

Set Cut Mode = `none` if Iware C-58BT has no cutter, or `partial` if it supports ESC/POS cut.

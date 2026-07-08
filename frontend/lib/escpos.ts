/**
 * ESC/POS command builder — produces Uint8Array payloads for thermal printers.
 * Used by the kiosk's Web Serial printer hook.
 */

const ESC = 0x1b;
const GS = 0x1d;

// Character codes
const LF = 0x0a;
const FF = 0x0c;

export class EscPosBuilder {
  private buf: number[] = [];

  /** Initialize printer */
  init(): this {
    this.buf.push(ESC, 0x40);
    return this;
  }

  /** Print and feed n lines */
  feed(n = 1): this {
    for (let i = 0; i < n; i++) this.buf.push(LF);
    return this;
  }

  /** Form feed (cut partial) */
  formFeed(): this {
    this.buf.push(FF);
    return this;
  }

  /** Set alignment: 0=left, 1=center, 2=right */
  align(n: 0 | 1 | 2): this {
    this.buf.push(ESC, 0x61, n);
    return this;
  }

  /** Set bold on/off */
  bold(on: boolean): this {
    this.buf.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** Set underline: 0=off, 1=1px, 2=2px */
  underline(n: 0 | 1 | 2): this {
    this.buf.push(ESC, 0x2d, n);
    return this;
  }

  /** Set text size (double width/height). 0=normal, 1=double height, etc. */
  textSize(n: number): this {
    this.buf.push(GS, 0x21, n);
    return this;
  }

  /** Write raw text (UTF-8 encoded) */
  text(str: string): this {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    for (const b of bytes) this.buf.push(b);
    return this;
  }

  /** Add a line of text with LF */
  line(str: string): this {
    this.text(str);
    this.buf.push(LF);
    return this;
  }

  /** Separator line: dashes */
  separator(char = "-"): this {
    return this.line(char.repeat(32));
  }

  /** Full cut */
  cut(): this {
    this.buf.push(GS, 0x56, 0x00);
    return this;
  }

  /** Partial cut */
  cutPartial(): this {
    this.buf.push(GS, 0x56, 0x01);
    return this;
  }

  /** Build and return the final byte array */
  toBytes(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

/**
 * Build ESC/POS bytes for a queue ticket.
 */
export interface BuildTicketInput {
  ticketNumber: string;
  serviceType: string;
  createdAt: string;
  headerText?: string;
  footerText?: string;
  paperSize?: "58mm" | "80mm";
  copyCount?: number;
  cutMode?: "none" | "partial" | "full";
  isTest?: boolean;
}

export function buildQueueTicketBytes(input: BuildTicketInput): Uint8Array {
  const {
    ticketNumber,
    serviceType,
    createdAt,
    headerText,
    footerText,
    copyCount = 1,
    cutMode = "partial",
    isTest = false,
  } = input;

  const copies: Uint8Array[] = [];

  for (let c = 0; c < copyCount; c++) {
    const builder = new EscPosBuilder();
    builder.init().align(1); // center

    // Header
    if (headerText) {
      builder.bold(true).line(headerText).bold(false);
    }
    builder.separator("=");

    // Label
    builder.feed(1).bold(true).line("NOMOR ANTRIAN").bold(false).feed(1);

    // Big bold ticket number
    builder.textSize(1).bold(true).line(ticketNumber).bold(false).textSize(0);

    builder.feed(1).separator("-");

    // Details
    builder.align(0).bold(false);
    builder.line(`Layanan: ${serviceType}`);
    builder.line(`Tanggal: ${createdAt}`);

    if (isTest) {
      builder.line("");
      builder.align(1);
      builder.line("*** UJI COBA CETAK ***");
      builder.line("--- TEST PRINT ---");
    }

    // Footer
    builder.feed(1).separator("-").align(1);
    if (footerText) {
      builder.line(footerText);
    }
    builder.feed(2);

    // Cut
    if (cutMode === "full") {
      builder.cut();
    } else if (cutMode === "partial") {
      builder.cutPartial();
    }

    copies.push(builder.toBytes());
  }

  // Concatenate copies
  const totalLen = copies.reduce((s, c) => s + c.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const copy of copies) {
    combined.set(copy, offset);
    offset += copy.length;
  }
  return combined;
}

/**
 * Build ESC/POS bytes for a printer test page.
 */
export function buildPrinterTestTicket(profile?: {
  header_text?: string;
  footer_text?: string;
  paper_size?: string;
  copy_count?: number;
  cut_mode?: string;
}): Uint8Array {
  return buildQueueTicketBytes({
    ticketNumber: "TEST-001",
    serviceType: "Uji Coba Printer",
    createdAt: new Date().toLocaleDateString("id-ID", {
      timeZone: "Asia/Makassar",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    headerText: profile?.header_text || undefined,
    footerText: profile?.footer_text || undefined,
    paperSize: (profile?.paper_size as "58mm" | "80mm") || "58mm",
    copyCount: profile?.copy_count || 1,
    cutMode: (profile?.cut_mode as "none" | "partial" | "full") || "partial",
    isTest: true,
  });
}

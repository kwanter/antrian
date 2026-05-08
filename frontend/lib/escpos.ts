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

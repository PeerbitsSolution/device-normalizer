/**
 * IEEE-11073 SFLOAT (16-bit) and FLOAT (32-bit) parsers for Bluetooth SIG GATT Health Profiles.
 * Grounded in the IEEE 11073-20601 Personal Health Device Communication Standard
 * and Bluetooth SIG GATT Specifications.
 */

/**
 * Normalizes varied raw input (hex string, Uint8Array, number[]) into a DataView.
 */
export function payloadToDataView(raw: Uint8Array | number[] | string): DataView {
  let bytes: Uint8Array;

  if (typeof raw === "string") {
    // Validate that string does not contain non-hex characters
    const stripped = raw.trim().replace(/0x/gi, "").replace(/[\s,:-]/g, "");
    if (/[^0-9a-fA-F]/.test(stripped)) {
      throw new Error(`Invalid hex string: contains non-hex characters in "${raw}"`);
    }
    if (stripped.length === 0 || stripped.length % 2 !== 0) {
      throw new Error(`Invalid hex string length: "${raw}"`);
    }
    bytes = new Uint8Array(stripped.length / 2);
    for (let i = 0; i < stripped.length; i += 2) {
      bytes[i / 2] = parseInt(stripped.substring(i, i + 2), 16);
    }
  } else if (Array.isArray(raw)) {
    bytes = new Uint8Array(raw);
  } else if (raw instanceof Uint8Array) {
    bytes = raw;
  } else {
    throw new Error("Invalid payload: must be Uint8Array, byte array (number[]), or hex string");
  }

  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Decodes an IEEE-11073 16-bit SFLOAT into a JavaScript number.
 * Format:
 * - 4-bit signed exponent (two's complement: -8 to +7)
 * - 12-bit signed mantissa (two's complement: -2048 to +2047)
 * Special values:
 * - 0x07FE: +Infinity
 * - 0x07FF: NaN
 * - 0x0800: NRes (Not at this resolution)
 * - 0x0801: Reserved
 * - 0x0802: -Infinity
 */
export function parseSFloat16(view: DataView, offset: number, littleEndian: boolean = true): number {
  if (offset + 2 > view.byteLength) {
    throw new Error(`Cannot read SFLOAT16 at offset ${offset}: payload length is ${view.byteLength}`);
  }

  const raw16 = view.getUint16(offset, littleEndian);

  // Check special values
  if (raw16 === 0x07fe) return Number.POSITIVE_INFINITY;
  if (raw16 === 0x07ff) return Number.NaN;
  if (raw16 === 0x0800) return Number.NaN; // NRes
  if (raw16 === 0x0802) return Number.NEGATIVE_INFINITY;

  // Extract 4-bit signed exponent
  let exponent = (raw16 >> 12) & 0x0f;
  if (exponent >= 0x08) {
    exponent -= 0x10; // convert 4-bit two's complement to negative
  }

  // Extract 12-bit signed mantissa
  let mantissa = raw16 & 0x0fff;
  if (mantissa >= 0x0800) {
    mantissa -= 0x1000; // convert 12-bit two's complement to negative
  }

  const result = mantissa * Math.pow(10, exponent);
  return Math.round(result * 10000) / 10000;
}

/**
 * Decodes an IEEE-11073 32-bit FLOAT into a JavaScript number.
 * Format:
 * - 8-bit signed exponent (two's complement: -128 to +127)
 * - 24-bit signed mantissa (two's complement: -8388608 to +8388607)
 */
export function parseFloat32(view: DataView, offset: number, littleEndian: boolean = true): number {
  if (offset + 4 > view.byteLength) {
    throw new Error(`Cannot read FLOAT32 at offset ${offset}: payload length is ${view.byteLength}`);
  }

  const b0 = view.getUint8(offset);
  const b1 = view.getUint8(offset + 1);
  const b2 = view.getUint8(offset + 2);
  const b3 = view.getUint8(offset + 3);

  let raw32: number;
  if (littleEndian) {
    raw32 = (b3 << 24) | (b2 << 16) | (b1 << 8) | b0;
  } else {
    raw32 = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
  }

  // Exponent is the top 8 bits
  let exponent = (raw32 >> 24) & 0xff;
  if (exponent >= 0x80) {
    exponent -= 0x100;
  }

  // Mantissa is the lower 24 bits (signed)
  let mantissa = raw32 & 0x00ffffff;
  if (mantissa >= 0x800000) {
    mantissa -= 0x1000000;
  }

  // Special values
  if (raw32 === 0x007ffffe) return Number.POSITIVE_INFINITY;
  if (raw32 === 0x007fffff || raw32 === 0x00800000) return Number.NaN;
  if (raw32 === 0x00800002) return Number.NEGATIVE_INFINITY;

  const result = mantissa * Math.pow(10, exponent);
  return Math.round(result * 10000) / 10000;
}

/**
 * Parses Bluetooth SIG standard 7-byte Date-Time structure into an ISO 8601 string.
 * Year (UINT16), Month (UINT8), Day (UINT8), Hours (UINT8), Minutes (UINT8), Seconds (UINT8).
 */
export function parseBleDateTime(view: DataView, offset: number): { iso: string; bytesRead: number } {
  if (offset + 7 > view.byteLength) {
    return { iso: new Date().toISOString(), bytesRead: 0 };
  }

  const year = view.getUint16(offset, true);
  const month = view.getUint8(offset + 2);
  const day = view.getUint8(offset + 3);
  const hours = view.getUint8(offset + 4);
  const minutes = view.getUint8(offset + 5);
  const seconds = view.getUint8(offset + 6);

  if (year === 0 || month === 0 || day === 0) {
    return { iso: new Date().toISOString(), bytesRead: 7 };
  }

  const yyyy = String(year).padStart(4, "0");
  const MM = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  const iso = `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}.000Z`;
  return { iso, bytesRead: 7 };
}

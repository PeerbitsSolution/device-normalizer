/**
 * Bluetooth SIG GATT Health Thermometer Profile Normalizer.
 * Characteristic: Temperature Measurement (0x2A1C).
 * Grounded in Bluetooth SIG Health Thermometer Profile Specification (v1.0).
 */

import { DeviceReading, NormalizerAdapter, NormalizerOptions, BleRawPayload } from "../../types.js";
import { payloadToDataView, parseFloat32, parseBleDateTime } from "./sfloat.js";

const TEMP_TYPE_NAMES: Record<number, string> = {
  1: "Armpit",
  2: "Body",
  3: "Ear",
  4: "Finger",
  5: "Gastro-intestinal",
  6: "Mouth",
  7: "Rectum",
  8: "Toe",
  9: "Tympanum",
};

export const bleThermometerAdapter: NormalizerAdapter<BleRawPayload | Uint8Array | number[] | string> = {
  format: "ble-gatt-thermometer",
  displayName: "Bluetooth SIG Health Thermometer Profile (0x2A1C)",
  description: "Decodes GATT Temperature Measurement characteristic into canonical temperature DeviceReading",

  normalize(rawInput, options?: NormalizerOptions): DeviceReading {
    let rawBytes: Uint8Array | number[] | string;
    let patientRef = options?.defaultPatientRef || "Patient/unknown";
    let deviceId = options?.defaultDeviceId;
    let fallbackTimestamp = new Date().toISOString();

    if (typeof rawInput === "object" && rawInput !== null && "bytes" in rawInput) {
      const payload = rawInput as BleRawPayload;
      rawBytes = payload.bytes;
      if (payload.patientRef) patientRef = payload.patientRef;
      if (payload.deviceId) deviceId = payload.deviceId;
      if (payload.timestamp) fallbackTimestamp = payload.timestamp;
    } else {
      rawBytes = rawInput as Uint8Array | number[] | string;
    }

    const view = payloadToDataView(rawBytes);
    if (view.byteLength < 5) {
      throw new Error(`Invalid Thermometer GATT payload: minimum 5 bytes required, received ${view.byteLength}`);
    }

    const flags = view.getUint8(0);
    const isFahrenheit = (flags & 0x01) !== 0;
    const hasTimestamp = (flags & 0x02) !== 0;
    const hasTempType = (flags & 0x04) !== 0;

    const unit = isFahrenheit ? "degF" : "degC";

    let offset = 1;
    const temperature = parseFloat32(view, offset);
    offset += 4;

    let timestamp = fallbackTimestamp;
    if (hasTimestamp && offset + 7 <= view.byteLength) {
      const dt = parseBleDateTime(view, offset);
      timestamp = dt.iso;
      offset += dt.bytesRead;
    }

    let tempType: string | undefined;
    if (hasTempType && offset + 1 <= view.byteLength) {
      const typeCode = view.getUint8(offset);
      tempType = TEMP_TYPE_NAMES[typeCode] || `Type-${typeCode}`;
      offset += 1;
    }

    const metadata: Record<string, unknown> = {
      bleProfile: "0x2A1C",
    };
    if (tempType) metadata.temperatureType = tempType;

    return {
      deviceType: "temperature",
      value: temperature,
      unit,
      timestamp,
      patientRef,
      deviceId,
      metadata,
    };
  },
};

/**
 * Bluetooth SIG GATT Pulse Oximeter Profile Normalizer.
 * Characteristics: PLX Spot-Check Measurement (0x2A5E) & PLX Continuous Measurement (0x2A5F).
 * Grounded in Bluetooth SIG Pulse Oximeter Service Specification (v1.0.1).
 */

import { DeviceReading, NormalizerAdapter, NormalizerOptions, BleRawPayload } from "../../types.js";
import { payloadToDataView, parseSFloat16, parseBleDateTime } from "./sfloat.js";

export const blePulseOximeterAdapter: NormalizerAdapter<BleRawPayload | Uint8Array | number[] | string> = {
  format: "ble-gatt-pulse-oximeter",
  displayName: "Bluetooth SIG Pulse Oximeter Profile (0x2A5E / 0x2A5F)",
  description: "Decodes GATT Pulse Oximeter characteristic into canonical SpO2 DeviceReading",

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
      throw new Error(`Invalid Pulse Oximeter GATT payload: minimum 5 bytes required, received ${view.byteLength}`);
    }

    const flags = view.getUint8(0);
    const hasTimestamp = (flags & 0x01) !== 0;

    let offset = 1;
    const spo2 = parseSFloat16(view, offset);
    offset += 2;
    const pulseRate = parseSFloat16(view, offset);
    offset += 2;

    let timestamp = fallbackTimestamp;
    if (hasTimestamp && offset + 7 <= view.byteLength) {
      const dt = parseBleDateTime(view, offset);
      timestamp = dt.iso;
      offset += dt.bytesRead;
    }

    const metadata: Record<string, unknown> = {
      bleProfile: "0x2A5E/0x2A5F",
    };
    if (pulseRate !== undefined && !isNaN(pulseRate)) {
      metadata.pulseRate = pulseRate;
      metadata.pulseRateUnit = "bpm";
    }

    return {
      deviceType: "spo2",
      value: spo2,
      unit: "%",
      timestamp,
      patientRef,
      deviceId,
      metadata,
    };
  },
};

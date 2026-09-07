/**
 * Bluetooth SIG GATT Pulse Oximeter Profile Normalizer.
 * Characteristics: PLX Spot-Check Measurement (0x2A5E) & PLX Continuous Measurement (0x2A5F).
 * Grounded in Bluetooth SIG Pulse Oximeter Service Specification (v1.0.1).
 */

import { AdapterReading, NormalizerAdapter, NormalizerOptions, BleRawPayload } from "../../types.js";
import { requireTimestamp } from "../../helpers.js";
import { payloadToDataView, parseSFloat16, parseBleDateTime } from "./sfloat.js";

export const blePulseOximeterAdapter: NormalizerAdapter<BleRawPayload | Uint8Array | number[] | string> = {
  format: "ble-gatt-pulse-oximeter",
  displayName: "Bluetooth SIG Pulse Oximeter Profile (0x2A5E / 0x2A5F)",
  description: "Decodes GATT Pulse Oximeter characteristic into canonical SpO2 DeviceReading",

  detect(payload) {
    if (!payload || typeof payload !== "object" || !("characteristicUuid" in payload)) return null;
    const uuid = String((payload as { characteristicUuid?: unknown }).characteristicUuid).toLowerCase().replace(/^0x/, "");
    return uuid === "2a5e" || uuid === "2a5f" ? { format: this.format, provider: "bluetooth-sig", confidence: 1, transmissionType: "bluetooth", reason: "Pulse Oximeter characteristic UUID" } : null;
  },
  normalize(rawInput, options?: NormalizerOptions): AdapterReading {
    let rawBytes: Uint8Array | number[] | string;
    let patientRef = options?.defaultPatientRef;
    let deviceId = options?.defaultDeviceId;
    let fallbackTimestamp = options?.receivedAt;
    let timezoneOffsetMinutes: number | undefined;

    if (typeof rawInput === "object" && rawInput !== null && "bytes" in rawInput) {
      const payload = rawInput as BleRawPayload;
      rawBytes = payload.bytes;
      if (payload.patientRef) patientRef = payload.patientRef;
      if (payload.deviceId) deviceId = payload.deviceId;
      if (payload.timestamp) fallbackTimestamp = payload.timestamp;
      timezoneOffsetMinutes = payload.timezoneOffsetMinutes;
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

    let timestamp: string | undefined = fallbackTimestamp;
    if (hasTimestamp && offset + 7 <= view.byteLength) {
      const dt = parseBleDateTime(view, offset, timezoneOffsetMinutes);
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
      value: spo2 > 0 && spo2 <= 1 ? spo2 * 100 : spo2,
      unit: "%",
      timestamp: requireTimestamp(timestamp, options),
      timezoneOffsetMinutes,
      patientRef,
      deviceId,
      metadata,
    };
  },
};

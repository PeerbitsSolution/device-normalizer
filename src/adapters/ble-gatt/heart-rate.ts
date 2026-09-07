import { AdapterReading, BleRawPayload, NormalizerAdapter, NormalizerOptions } from "../../types.js";
import { completeAdapterTimestamp, extractBleInput } from "./shared.js";

export const bleHeartRateAdapter: NormalizerAdapter<BleRawPayload | Uint8Array | number[] | string> = {
  format: "ble-gatt-heart-rate",
  displayName: "Bluetooth SIG Heart Rate Measurement (0x2A37)",
  description: "Decodes the standard Heart Rate Measurement characteristic.",
  detect(payload) {
    if (!payload || typeof payload !== "object" || !("characteristicUuid" in payload)) return null;
    const uuid = String((payload as { characteristicUuid?: unknown }).characteristicUuid).toLowerCase().replace(/^0x/, "");
    return uuid === "2a37" ? { format: this.format, provider: "bluetooth-sig", confidence: 1, transmissionType: "bluetooth", reason: "Heart Rate characteristic UUID" } : null;
  },
  normalize(rawInput, options?: NormalizerOptions): AdapterReading {
    const input = extractBleInput(rawInput, options);
    const view = input.view;
    if (view.byteLength < 2) throw new Error(`Invalid Heart Rate GATT payload: minimum 2 bytes required, received ${view.byteLength}`);
    const flags = view.getUint8(0);
    const isUint16 = (flags & 0x01) !== 0;
    const required = isUint16 ? 3 : 2;
    if (view.byteLength < required) throw new Error(`Invalid Heart Rate GATT payload: minimum ${required} bytes required, received ${view.byteLength}`);
    const heartRate = isUint16 ? view.getUint16(1, true) : view.getUint8(1);
    const metadata: Record<string, unknown> = { bleProfile: "0x2A37" };
    let offset = required;
    if ((flags & 0x06) !== 0 && offset + 2 <= view.byteLength) {
      metadata.energyExpended = view.getUint16(offset, true);
      offset += 2;
    }
    if ((flags & 0x10) !== 0) {
      const rrIntervals: number[] = [];
      while (offset + 2 <= view.byteLength) {
        rrIntervals.push(Math.round((view.getUint16(offset, true) / 1024) * 1000 * 100) / 100);
        offset += 2;
      }
      metadata.rrIntervalsMs = rrIntervals;
    }
    return {
      deviceType: "heart-rate", value: heartRate, unit: "/min",
      timestamp: completeAdapterTimestamp(input.timestamp, options), patientRef: input.patientRef,
      timezoneOffsetMinutes: input.timezoneOffsetMinutes, deviceId: input.deviceId, metadata,
    };
  },
};

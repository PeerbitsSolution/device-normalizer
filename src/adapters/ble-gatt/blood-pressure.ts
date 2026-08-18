/**
 * Bluetooth SIG GATT Blood Pressure Profile Normalizer.
 * Characteristic: Blood Pressure Measurement (0x2A35).
 * Grounded in Bluetooth SIG Blood Pressure Profile Specification (v1.1.1).
 */

import { DeviceReading, NormalizerAdapter, NormalizerOptions, BleRawPayload } from "../../types.js";
import { payloadToDataView, parseSFloat16, parseBleDateTime } from "./sfloat.js";

export const bleBloodPressureAdapter: NormalizerAdapter<BleRawPayload | Uint8Array | number[] | string> = {
  format: "ble-gatt-blood-pressure",
  displayName: "Bluetooth SIG Blood Pressure Profile (0x2A35)",
  description: "Decodes GATT Blood Pressure Measurement characteristic into canonical blood pressure DeviceReading",

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
    if (view.byteLength < 7) {
      throw new Error(`Invalid Blood Pressure GATT payload: minimum 7 bytes required, received ${view.byteLength}`);
    }

    const flags = view.getUint8(0);
    const isKPa = (flags & 0x01) !== 0;
    const hasTimestamp = (flags & 0x02) !== 0;
    const hasPulseRate = (flags & 0x04) !== 0;
    const hasUserId = (flags & 0x08) !== 0;
    const hasStatus = (flags & 0x10) !== 0;

    const unit = isKPa ? "kPa" : "mmHg";

    let offset = 1;
    const systolic = parseSFloat16(view, offset);
    offset += 2;
    const diastolic = parseSFloat16(view, offset);
    offset += 2;
    const map = parseSFloat16(view, offset);
    offset += 2;

    let timestamp = fallbackTimestamp;
    if (hasTimestamp && offset + 7 <= view.byteLength) {
      const dt = parseBleDateTime(view, offset);
      timestamp = dt.iso;
      offset += dt.bytesRead;
    }

    let pulseRate: number | undefined;
    if (hasPulseRate && offset + 2 <= view.byteLength) {
      pulseRate = parseSFloat16(view, offset);
      offset += 2;
    }

    let userId: number | undefined;
    if (hasUserId && offset + 1 <= view.byteLength) {
      userId = view.getUint8(offset);
      offset += 1;
    }

    let measurementStatus: number | undefined;
    if (hasStatus && offset + 2 <= view.byteLength) {
      measurementStatus = view.getUint16(offset, true);
      offset += 2;
    }

    const metadata: Record<string, unknown> = {
      bleProfile: "0x2A35",
      meanArterialPressure: map,
    };
    if (pulseRate !== undefined) metadata.pulseRate = pulseRate;
    if (userId !== undefined) metadata.userId = userId;
    if (measurementStatus !== undefined) metadata.measurementStatus = measurementStatus;

    return {
      deviceType: "blood-pressure",
      value: {
        systolic,
        diastolic,
      },
      unit,
      timestamp,
      patientRef,
      deviceId,
      metadata,
    };
  },
};

/**
 * Bluetooth SIG GATT Weight Scale Profile Normalizer.
 * Characteristic: Weight Measurement (0x2A98).
 * Grounded in Bluetooth SIG Weight Scale Profile Specification (v1.0).
 */

import { DeviceReading, NormalizerAdapter, NormalizerOptions, BleRawPayload } from "../../types.js";
import { payloadToDataView, parseBleDateTime } from "./sfloat.js";

export const bleWeightScaleAdapter: NormalizerAdapter<BleRawPayload | Uint8Array | number[] | string> = {
  format: "ble-gatt-weight-scale",
  displayName: "Bluetooth SIG Weight Scale Profile (0x2A98)",
  description: "Decodes GATT Weight Measurement characteristic into canonical weight DeviceReading",

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
    if (view.byteLength < 3) {
      throw new Error(`Invalid Weight Scale GATT payload: minimum 3 bytes required, received ${view.byteLength}`);
    }

    const flags = view.getUint8(0);
    const isImperial = (flags & 0x01) !== 0;
    const hasTimestamp = (flags & 0x02) !== 0;
    const hasUserId = (flags & 0x04) !== 0;
    const hasBmiAndHeight = (flags & 0x08) !== 0;

    const unit = isImperial ? "lbs" : "kg";

    // Weight raw UINT16
    const rawWeight = view.getUint16(1, true);
    // Resolution per Bluetooth SIG spec: 0.005 kg for SI, 0.01 lb for Imperial
    const resolution = isImperial ? 0.01 : 0.005;
    const weight = Math.round(rawWeight * resolution * 100) / 100;

    let offset = 3;
    let timestamp = fallbackTimestamp;
    if (hasTimestamp && offset + 7 <= view.byteLength) {
      const dt = parseBleDateTime(view, offset);
      timestamp = dt.iso;
      offset += dt.bytesRead;
    }

    let userId: number | undefined;
    if (hasUserId && offset + 1 <= view.byteLength) {
      userId = view.getUint8(offset);
      offset += 1;
    }

    let bmi: number | undefined;
    let height: number | undefined;
    if (hasBmiAndHeight && offset + 4 <= view.byteLength) {
      bmi = view.getUint16(offset, true) * 0.1;
      offset += 2;
      const rawHeight = view.getUint16(offset, true);
      height = isImperial ? rawHeight * 0.1 : rawHeight * 0.001; // 0.1 inch or 0.001 meter
      offset += 2;
    }

    const metadata: Record<string, unknown> = {
      bleProfile: "0x2A98",
    };
    if (userId !== undefined) metadata.userId = userId;
    if (bmi !== undefined) metadata.bmi = Math.round(bmi * 10) / 10;
    if (height !== undefined) metadata.height = Math.round(height * 100) / 100;

    return {
      deviceType: "weight",
      value: weight,
      unit,
      timestamp,
      patientRef,
      deviceId,
      metadata,
    };
  },
};

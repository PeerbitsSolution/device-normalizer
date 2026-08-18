/**
 * Bluetooth SIG GATT Glucose Profile Normalizer.
 * Characteristic: Glucose Measurement (0x2A18).
 * Grounded in Bluetooth SIG Glucose Profile Specification (v1.0).
 */

import { DeviceReading, NormalizerAdapter, NormalizerOptions, BleRawPayload } from "../../types.js";
import { payloadToDataView, parseSFloat16, parseBleDateTime } from "./sfloat.js";

export const bleGlucoseAdapter: NormalizerAdapter<BleRawPayload | Uint8Array | number[] | string> = {
  format: "ble-gatt-glucose",
  displayName: "Bluetooth SIG Glucose Profile (0x2A18)",
  description: "Decodes GATT Glucose Measurement characteristic into canonical glucose DeviceReading",

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
    if (view.byteLength < 10) {
      throw new Error(`Invalid Glucose GATT payload: minimum 10 bytes required, received ${view.byteLength}`);
    }

    const flags = view.getUint8(0);
    const hasTimeOffset = (flags & 0x01) !== 0;
    const isMolL = (flags & 0x02) !== 0;
    const hasTypeAndLocation = (flags & 0x04) !== 0;
    const hasSensorStatus = (flags & 0x08) !== 0;

    const sequenceNumber = view.getUint16(1, true);

    let offset = 3;
    const baseTime = parseBleDateTime(view, offset);
    let timestamp = baseTime.iso || fallbackTimestamp;
    offset += 7;

    let timeOffsetMinutes = 0;
    if (hasTimeOffset && offset + 2 <= view.byteLength) {
      timeOffsetMinutes = view.getInt16(offset, true);
      offset += 2;
      // Adjust timestamp if time offset present
      const baseDate = new Date(timestamp);
      if (!isNaN(baseDate.getTime()) && timeOffsetMinutes !== 0) {
        timestamp = new Date(baseDate.getTime() + timeOffsetMinutes * 60 * 1000).toISOString();
      }
    }

    let glucoseRaw = 0;
    let unit = "mg/dL";

    if (offset + 2 <= view.byteLength) {
      glucoseRaw = parseSFloat16(view, offset);
      offset += 2;

      if (isMolL) {
        unit = "mmol/L";
        // If raw float is in mol/L (e.g. 0.0055), convert to mmol/L (5.5)
        if (glucoseRaw < 0.1 && glucoseRaw > 0) {
          glucoseRaw = Math.round(glucoseRaw * 1000 * 100) / 100;
        }
      } else {
        unit = "mg/dL";
        // If raw float is in kg/L (e.g. 0.00095), convert to mg/dL (95)
        if (glucoseRaw < 0.1 && glucoseRaw > 0) {
          glucoseRaw = Math.round(glucoseRaw * 100000 * 10) / 10;
        }
      }
    }

    let sampleType: number | undefined;
    let sampleLocation: number | undefined;
    if (hasTypeAndLocation && offset + 1 <= view.byteLength) {
      const byte = view.getUint8(offset);
      sampleLocation = (byte >> 4) & 0x0f;
      sampleType = byte & 0x0f;
      offset += 1;
    }

    let sensorStatus: number | undefined;
    if (hasSensorStatus && offset + 2 <= view.byteLength) {
      sensorStatus = view.getUint16(offset, true);
      offset += 2;
    }

    const metadata: Record<string, unknown> = {
      bleProfile: "0x2A18",
      sequenceNumber,
    };
    if (sampleType !== undefined) metadata.sampleType = sampleType;
    if (sampleLocation !== undefined) metadata.sampleLocation = sampleLocation;
    if (sensorStatus !== undefined) metadata.sensorStatus = sensorStatus;

    return {
      deviceType: "glucose",
      value: glucoseRaw,
      unit,
      timestamp,
      patientRef,
      deviceId,
      metadata,
    };
  },
};

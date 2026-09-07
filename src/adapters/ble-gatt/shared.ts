import { requireTimestamp } from "../../helpers.js";
import { BleRawPayload, NormalizerOptions } from "../../types.js";
import { payloadToDataView } from "./sfloat.js";

export function extractBleInput(
  rawInput: BleRawPayload | Uint8Array | number[] | string,
  options?: NormalizerOptions,
): { view: DataView; timestamp?: string; timezoneOffsetMinutes?: number; patientRef?: string; deviceId?: string } {
  if (typeof rawInput === "object" && rawInput !== null && "bytes" in rawInput) {
    const payload = rawInput as BleRawPayload;
    return {
      view: payloadToDataView(payload.bytes), timestamp: payload.timestamp, timezoneOffsetMinutes: payload.timezoneOffsetMinutes,
      patientRef: payload.patientRef ?? options?.defaultPatientRef,
      deviceId: payload.deviceId ?? options?.defaultDeviceId,
    };
  }
  return { view: payloadToDataView(rawInput), patientRef: options?.defaultPatientRef, deviceId: options?.defaultDeviceId };
}

export const completeAdapterTimestamp = requireTimestamp;

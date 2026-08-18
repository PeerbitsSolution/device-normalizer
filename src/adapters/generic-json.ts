/**
 * Generic JSON Adapter for @peerbits/device-normalizer.
 * Universal fallback adapter for pre-parsed flat vital reading objects.
 */

import {
  DeviceReading,
  NormalizerAdapter,
  NormalizerOptions,
  GenericDevicePayload,
  DeviceType,
  SUPPORTED_DEVICE_TYPES,
} from "../types.js";

/**
 * Standardizes arbitrary deviceType strings into canonical DeviceType enum.
 */
export function normalizeGenericDeviceType(rawType: string): DeviceType {
  const clean = rawType.trim().toLowerCase().replace(/[\s_]+/g, "-");

  if (clean.includes("pressure") || clean === "bp") return "blood-pressure";
  if (clean.includes("heart") || clean.includes("pulse") && !clean.includes("ox")) return "heart-rate";
  if (clean.includes("weight") || clean.includes("scale") || clean.includes("mass")) return "weight";
  if (clean.includes("spo2") || clean.includes("oximeter") || clean.includes("oxygen")) return "spo2";
  if (clean.includes("temp") || clean.includes("thermometer")) return "temperature";
  if (clean.includes("glucose") || clean.includes("sugar")) return "glucose";
  if (clean.includes("respiratory") || clean.includes("breathing")) return "respiratory-rate";

  if (SUPPORTED_DEVICE_TYPES.includes(clean as DeviceType)) {
    return clean as DeviceType;
  }

  throw new Error(`Unsupported or unrecognized deviceType in generic JSON: "${rawType}"`);
}

export const genericJsonAdapter: NormalizerAdapter<GenericDevicePayload | GenericDevicePayload[]> = {
  format: "generic-json",
  displayName: "Generic JSON Fallback",
  description: "Standardizes arbitrary flat JSON vital readings into canonical DeviceReading format",

  normalize(rawInput, options?: NormalizerOptions): DeviceReading | DeviceReading[] {
    if (Array.isArray(rawInput)) {
      const results: DeviceReading[] = [];
      for (const item of rawInput) {
        const res = genericJsonAdapter.normalize(item, options);
        if (Array.isArray(res)) results.push(...res);
        else results.push(res);
      }
      return results;
    }

    if (!rawInput || typeof rawInput !== "object") {
      throw new Error("Invalid generic JSON payload: expected an object or array");
    }

    const payload = rawInput as GenericDevicePayload;
    if (!payload.deviceType) {
      throw new Error("Generic JSON payload missing required 'deviceType' field");
    }

    const deviceType = normalizeGenericDeviceType(payload.deviceType);
    const rawVal = payload.value !== undefined ? payload.value : payload.rawValue;
    const unit = String(payload.unit || payload.rawUnit || "").trim();
    const timestamp = payload.timestamp || new Date().toISOString();
    const patientRef = options?.defaultPatientRef || payload.patientRef || "Patient/unknown";
    const deviceId = options?.defaultDeviceId || payload.deviceId;

    if (rawVal === undefined || rawVal === null) {
      throw new Error(`Generic JSON payload for ${deviceType} is missing 'value' / 'rawValue'`);
    }

    // Handle Blood Pressure compound value
    if (deviceType === "blood-pressure") {
      let systolic = 0;
      let diastolic = 0;

      if (typeof rawVal === "object" && rawVal !== null) {
        const bpObj = rawVal as Record<string, unknown>;
        systolic = Number(bpObj.systolic || bpObj.sys || 0);
        diastolic = Number(bpObj.diastolic || bpObj.dia || 0);
      } else if (typeof rawVal === "string") {
        // e.g. "120/80"
        const parts = rawVal.split(/[\/\s-]+/);
        if (parts.length >= 2) {
          systolic = parseFloat(parts[0]);
          diastolic = parseFloat(parts[1]);
        }
      }

      if (!systolic || !diastolic || isNaN(systolic) || isNaN(diastolic)) {
        throw new Error(`Invalid blood pressure value in generic JSON: ${JSON.stringify(rawVal)}`);
      }

      return {
        deviceType: "blood-pressure",
        value: { systolic, diastolic },
        unit: unit || "mmHg",
        timestamp,
        patientRef,
        deviceId,
        metadata: payload.metadata,
      };
    }

    // Single numeric value
    const numericVal = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal));
    if (isNaN(numericVal)) {
      throw new Error(`Invalid numeric value in generic JSON payload for ${deviceType}: ${JSON.stringify(rawVal)}`);
    }

    return {
      deviceType,
      value: numericVal,
      unit: unit || (deviceType === "spo2" ? "%" : deviceType === "heart-rate" ? "bpm" : ""),
      timestamp,
      patientRef,
      deviceId,
      metadata: payload.metadata,
    };
  },
};

/**
 * Apple HealthKit Sample Normalizer for @peerbits/device-normalizer.
 * Grounded in Apple HealthKit Public Schema and Sample Type Identifiers.
 * Covers the 7 core vital types and Blood Pressure correlation pairing.
 */

import {
  AdapterReading,
  NormalizerAdapter,
  NormalizerOptions,
  HealthKitSamplePayload,
  DeviceType,
} from "../types.js";
import { DeviceNormalizerError } from "../errors.js";
import { requireTimestamp } from "../helpers.js";
import { normalizeBloodPressure, normalizeScalarUnit } from "../units.js";

/**
 * Standardizes HealthKit sample type identifier strings (handles short names or full HK identifiers).
 */
export function normalizeHealthKitType(sampleType: string): DeviceType | "blood-pressure-correlation" | null {
  const clean = sampleType.trim();

  if (
    clean.includes("HeartRate") ||
    clean === "heart-rate" ||
    clean === "HKQuantityTypeIdentifierHeartRate"
  ) {
    return "heart-rate";
  }

  if (
    clean.includes("BloodPressure") ||
    clean === "HKCorrelationTypeIdentifierBloodPressure" ||
    clean === "HKQuantityTypeIdentifierBloodPressure"
  ) {
    return "blood-pressure-correlation";
  }

  if (
    clean.includes("BloodGlucose") ||
    clean === "HKQuantityTypeIdentifierBloodGlucose" ||
    clean === "glucose"
  ) {
    return "glucose";
  }

  if (
    clean.includes("OxygenSaturation") ||
    clean === "HKQuantityTypeIdentifierOxygenSaturation" ||
    clean === "spo2"
  ) {
    return "spo2";
  }

  if (
    clean.includes("BodyTemperature") ||
    clean.includes("BasalBodyTemperature") ||
    clean === "HKQuantityTypeIdentifierBodyTemperature" ||
    clean === "temperature"
  ) {
    return "temperature";
  }

  if (
    clean.includes("BodyMass") ||
    clean === "HKQuantityTypeIdentifierBodyMass" ||
    clean === "weight"
  ) {
    return "weight";
  }

  if (
    clean.includes("RespiratoryRate") ||
    clean === "HKQuantityTypeIdentifierRespiratoryRate" ||
    clean === "respiratory-rate"
  ) {
    return "respiratory-rate";
  }

  return null;
}

/**
 * Standardizes HealthKit units into standard canonical representations.
 */
export function normalizeHealthKitUnit(unit: string | undefined, deviceType: DeviceType): string {
  if (!unit) {
    switch (deviceType) {
      case "heart-rate":
      case "respiratory-rate":
        return "bpm";
      case "spo2":
        return "%";
      case "weight":
        return "kg";
      case "temperature":
        return "degC";
      case "glucose":
        return "mg/dL";
      case "blood-pressure":
        return "mmHg";
      default:
        return "";
    }
  }

  const u = unit.trim().toLowerCase();

  // Heart / respiratory rates
  if (u === "count/min" || u === "beats/min" || u === "bpm" || u === "/min") {
    return deviceType === "respiratory-rate" ? "/min" : "bpm";
  }

  // SpO2
  if (u === "%" || u === "percent") return "%";

  // Weight
  if (u === "kg" || u === "kilograms") return "kg";
  if (u === "lb" || u === "lbs" || u === "pounds") return "lbs";

  // Temperature
  if (u === "degc" || u === "c" || u === "celsius" || u === "°c" || u === "cel") return "degC";
  if (u === "degf" || u === "f" || u === "fahrenheit" || u === "°f") return "degF";

  // Glucose
  if (u === "mg/dl" || u === "mg/dl") return "mg/dL";
  if (u === "mmol/l" || u === "mmol/l") return "mmol/L";

  // Blood Pressure
  if (u === "mmhg") return "mmHg";

  return unit;
}

export const healthKitAdapter: NormalizerAdapter<HealthKitSamplePayload | HealthKitSamplePayload[]> = {
  format: "healthkit",
  displayName: "Apple HealthKit Public Schema",
  description: "Parses Apple HealthKit sample JSON structures into canonical DeviceReadings",

  detect(payload) {
    const first = Array.isArray(payload) ? payload[0] : payload;
    if (!first || typeof first !== "object") return null;
    const type = String((first as { sampleType?: unknown; correlationType?: unknown }).sampleType ??
      (first as { correlationType?: unknown }).correlationType ?? "");
    if (!type.startsWith("HK")) return null;
    return { format: this.format, provider: "apple-healthkit", confidence: 0.99, transmissionType: "healthkit", reason: "HealthKit type identifier" };
  },

  normalize(rawInput, options?: NormalizerOptions): AdapterReading | AdapterReading[] {
    if (Array.isArray(rawInput)) {
      const readings: AdapterReading[] = [];
      for (const item of rawInput) {
        const res = healthKitAdapter.normalize(item, options);
        if (Array.isArray(res)) readings.push(...res);
        else readings.push(res);
      }
      return readings;
    }

    if (!rawInput || typeof rawInput !== "object") {
      throw new Error("Invalid HealthKit payload: expected JSON object or array");
    }

    const payload = rawInput as HealthKitSamplePayload;
    const defaultPatientRef = options?.defaultPatientRef || payload.patientRef;
    const defaultDeviceId = options?.defaultDeviceId || payload.deviceId;
    const sampleType = payload.sampleType || payload.correlationType || "";
    const matchedType = normalizeHealthKitType(sampleType);

    // Handle Blood Pressure Correlation
    if (matchedType === "blood-pressure-correlation" || payload.objects) {
      const timestamp = requireTimestamp(payload.startDate || payload.endDate, options);
      const objects = payload.objects || [];
      let systolicVal: number | undefined;
      let diastolicVal: number | undefined;
      let bpUnit = "mmHg";

      for (const sub of objects) {
        const subType = sub.sampleType || "";
        if (subType.includes("Systolic")) {
          systolicVal = sub.value;
          if (sub.unit) bpUnit = normalizeHealthKitUnit(sub.unit, "blood-pressure");
        } else if (subType.includes("Diastolic")) {
          diastolicVal = sub.value;
          if (sub.unit) bpUnit = normalizeHealthKitUnit(sub.unit, "blood-pressure");
        }
      }

      if (systolicVal === undefined || diastolicVal === undefined) {
        // If flattened direct blood pressure object with systolic / diastolic props
        const rec = payload as unknown as Record<string, unknown>;
        if (typeof rec.systolic === "number" && typeof rec.diastolic === "number") {
          systolicVal = rec.systolic;
          diastolicVal = rec.diastolic;
        } else {
          throw new Error("HealthKit Blood Pressure correlation requires both systolic and diastolic sample objects");
        }
      }

      return {
        deviceType: "blood-pressure",
        value: {
          systolic: normalizeBloodPressure(systolicVal, bpUnit),
          diastolic: normalizeBloodPressure(diastolicVal, bpUnit),
        },
        unit: "mm[Hg]",
        timestamp,
        patientRef: defaultPatientRef,
        deviceId: defaultDeviceId,
        metadata: {
          source: "AppleHealthKit",
          correlationType: sampleType,
          ...(payload.metadata || {}),
        },
      };
    }

    if (!matchedType) {
      throw new Error(`Unsupported HealthKit sample type: "${sampleType}"`);
    }

    const timestamp = requireTimestamp(payload.startDate || payload.endDate, options);

    if (payload.value === undefined || !Number.isFinite(payload.value)) {
      throw new DeviceNormalizerError("invalid_payload", `HealthKit ${sampleType} requires a finite numeric value.`);
    }
    const value = payload.value;
    let unit = normalizeHealthKitUnit(payload.unit, matchedType);
    const normalized = normalizeScalarUnit(matchedType, value, unit);

    return {
      deviceType: matchedType,
      value: normalized.value,
      unit: normalized.unit,
      timestamp,
      patientRef: defaultPatientRef,
      deviceId: defaultDeviceId,
      metadata: {
        source: "AppleHealthKit",
        sampleType,
        ...(payload.metadata || {}),
      },
    };
  },
};

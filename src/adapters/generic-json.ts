/**
 * Generic JSON Adapter for @peerbits/device-normalizer.
 * Universal fallback adapter for pre-parsed flat vital reading objects.
 */

import {
  AdapterReading,
  NormalizerAdapter,
  NormalizerOptions,
  GenericDevicePayload,
  DeviceType,
  SUPPORTED_DEVICE_TYPES,
} from "../types.js";
import { DeviceNormalizerError } from "../errors.js";
import { requireTimestamp } from "../helpers.js";
import { normalizeBloodPressure, normalizeScalarUnit } from "../units.js";

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

  detect(payload) {
    const first = Array.isArray(payload) ? payload[0] : payload;
    if (!first || typeof first !== "object" || !("deviceType" in first)) return null;
    const provider = typeof (first as GenericDevicePayload).source?.provider === "string" ? (first as GenericDevicePayload).source!.provider! : "unknown";
    return { format: this.format, provider, confidence: 0.7, transmissionType: (first as GenericDevicePayload).source?.transmissionType ?? "unknown", reason: "Generic deviceType field" };
  },

  normalize(rawInput, options?: NormalizerOptions): AdapterReading | AdapterReading[] {
    if (Array.isArray(rawInput)) {
      const results: AdapterReading[] = [];
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
    const patientRef = options?.defaultPatientRef || payload.patientRef;
    const deviceId = options?.defaultDeviceId || payload.deviceId;

    if (rawVal === undefined || rawVal === null) {
      throw new Error(`Generic JSON payload for ${deviceType} is missing 'value' / 'rawValue'`);
    }
    const timestamp = requireTimestamp(payload.timestamp, options);
    const source = payload.source ? {
      provider: payload.source.provider ?? "unknown",
      deviceModel: payload.source.deviceModel,
      deviceIdentifier: payload.source.deviceIdentifier ?? deviceId,
      transmissionType: payload.source.transmissionType ?? "unknown",
    } : { provider: "unknown", deviceIdentifier: deviceId };

    // Handle Blood Pressure compound value
    if (deviceType === "blood-pressure") {
      let systolic = 0;
      let diastolic = 0;

      if (typeof rawVal === "object" && rawVal !== null) {
        const bpObj = rawVal as Record<string, unknown>;
        systolic = Number(bpObj.systolic ?? bpObj.sys);
        diastolic = Number(bpObj.diastolic ?? bpObj.dia);
      } else if (typeof rawVal === "string") {
        // e.g. "120/80"
        const parts = rawVal.split(/[\/\s-]+/);
        if (parts.length >= 2) {
          systolic = parseFloat(parts[0]);
          diastolic = parseFloat(parts[1]);
        }
      }

      if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
        throw new Error(`Invalid blood pressure value in generic JSON: ${JSON.stringify(rawVal)}`);
      }

      return {
        deviceType: "blood-pressure",
        value: {
          systolic: normalizeBloodPressure(systolic, unit),
          diastolic: normalizeBloodPressure(diastolic, unit),
        },
        unit: "mm[Hg]",
        timestamp,
        patientRef,
        deviceId,
        metadata: payload.metadata,
        source,
      };
    }

    if (["body-composition", "continuous-glucose", "spirometry", "sleep", "ecg"].includes(deviceType)) {
      if (typeof rawVal !== "object" || rawVal === null || Array.isArray(rawVal)) {
        throw new DeviceNormalizerError("invalid_payload", `Generic JSON ${deviceType} value must be an object.`);
      }
      const value = rawVal as Record<string, unknown>;
      const requiredKey = deviceType === "continuous-glucose" ? "glucose" : deviceType === "sleep" ? "totalDuration" : deviceType === "ecg" ? "rhythmClassification" : undefined;
      if (requiredKey && (value[requiredKey] === undefined || value[requiredKey] === null)) {
        throw new DeviceNormalizerError("invalid_payload", `Generic JSON ${deviceType} requires value.${requiredKey}.`);
      }
      if (deviceType !== "ecg" && (!payload.metrics || Object.keys(payload.metrics).length === 0)) {
        throw new DeviceNormalizerError("invalid_payload", `Generic JSON ${deviceType} requires canonical metrics with per-metric units.`);
      }
      for (const [key, metric] of Object.entries(payload.metrics ?? {})) {
        if (!metric || typeof metric.value !== "number" || !Number.isFinite(metric.value) || typeof metric.unit !== "string" || !metric.unit.trim()) {
          throw new DeviceNormalizerError("invalid_payload", `Generic JSON metric ${key} requires a finite value and unit.`);
        }
      }
      return {
        deviceType, value: rawVal as AdapterReading["value"], unit: unit || (deviceType === "ecg" ? "1" : "mixed"), metrics: payload.metrics,
        timestamp, timezoneOffsetMinutes: payload.timezoneOffsetMinutes, patientRef, deviceId, metadata: payload.metadata, source,
      };
    }

    // Single numeric value
    const numericVal = typeof rawVal === "number" ? rawVal : Number(String(rawVal));
    if (!Number.isFinite(numericVal)) {
      throw new Error(`Invalid numeric value in generic JSON payload for ${deviceType}: ${JSON.stringify(rawVal)}`);
    }

    if (!unit) throw new DeviceNormalizerError("invalid_payload", `Generic JSON payload for ${deviceType} is missing 'unit' / 'rawUnit'.`);
    const normalized = normalizeScalarUnit(deviceType, numericVal, unit);
    return {
      deviceType,
      value: normalized.value,
      unit: normalized.unit,
      timestamp,
      timezoneOffsetMinutes: payload.timezoneOffsetMinutes,
      patientRef,
      deviceId,
      metadata: payload.metadata,
      source,
    };
  },
};

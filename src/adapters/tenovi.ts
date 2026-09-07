import { DeviceNormalizerError } from "../errors.js";
import { requireTimestamp } from "../helpers.js";
import { normalizeBloodPressure, normalizeScalarUnit } from "../units.js";
import { AdapterReading, NormalizerAdapter, NormalizerOptions } from "../types.js";

interface TenoviPayload {
  metric?: unknown;
  device_name?: unknown;
  hwi_device_id?: unknown;
  patient_id?: unknown;
  hardware_uuid?: unknown;
  value_1?: unknown;
  value_2?: unknown;
  timestamp?: unknown;
  timezone_offset?: unknown;
  estimated_timestamp?: unknown;
  filter_params?: unknown;
}

const METRICS = new Set(["blood_pressure", "weight", "pulse", "glucose", "spO2", "temperature", "perfusion_index"]);

function numberField(value: unknown, name: string): number {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numberValue)) throw new DeviceNormalizerError("invalid_payload", `Tenovi ${name} must be numeric.`);
  return numberValue;
}

export const tenoviAdapter: NormalizerAdapter<TenoviPayload | TenoviPayload[]> = {
  format: "tenovi",
  displayName: "Tenovi HWI measurement webhook",
  description: "Normalizes documented Tenovi HWI measurement webhook payloads.",
  detect(payload) {
    const item = Array.isArray(payload) ? payload[0] : payload;
    if (!item || typeof item !== "object") return null;
    const candidate = item as TenoviPayload;
    return typeof candidate.metric === "string" && METRICS.has(candidate.metric) &&
      "value_1" in candidate && "timestamp" in candidate
      ? { format: this.format, provider: "tenovi", confidence: 0.99, transmissionType: "cellular", reason: "Tenovi HWI measurement fields" }
      : null;
  },
  normalize(input, options?: NormalizerOptions): AdapterReading | AdapterReading[] {
    if (Array.isArray(input)) return input.map((entry) => this.normalize(entry, options) as AdapterReading);
    if (!input || typeof input !== "object") throw new DeviceNormalizerError("invalid_payload", "Tenovi payload must be an object.");
    const metric = typeof input.metric === "string" ? input.metric : "";
    if (!METRICS.has(metric)) throw new DeviceNormalizerError("unsupported_measurement", `Unsupported Tenovi metric "${metric}".`);
    const value = numberField(input.value_1, "value_1");
    const timestamp = requireTimestamp(typeof input.timestamp === "string" ? input.timestamp : undefined, options);
    const timezoneOffsetMinutes = typeof input.timezone_offset === "number" ? input.timezone_offset * 60 : undefined;
    const deviceId = typeof input.hwi_device_id === "string" ? input.hwi_device_id : options?.defaultDeviceId;
    const patientRef = typeof input.patient_id === "string" ? input.patient_id : options?.defaultPatientRef;
    const metadata = {
      deviceName: typeof input.device_name === "string" ? input.device_name : undefined,
      hardwareUuid: typeof input.hardware_uuid === "string" ? input.hardware_uuid : undefined,
      estimatedTimestamp: input.estimated_timestamp === true,
      filterParams: input.filter_params,
    };

    if (metric === "blood_pressure") {
      const diastolic = numberField(input.value_2, "value_2 for blood_pressure");
      return {
        deviceType: "blood-pressure",
        value: { systolic: normalizeBloodPressure(value, "mmHg"), diastolic: normalizeBloodPressure(diastolic, "mmHg") },
        unit: "mm[Hg]", timestamp, timezoneOffsetMinutes, patientRef, deviceId,
        metrics: {
          systolic: { value, unit: "mm[Hg]" },
          diastolic: { value: diastolic, unit: "mm[Hg]" },
        },
        source: { provider: "tenovi", deviceModel: typeof input.device_name === "string" ? input.device_name : undefined, deviceIdentifier: deviceId },
        metadata,
      };
    }

    const mapping = metric === "pulse" ? ["heart-rate", "bpm"] as const
      : metric === "spO2" ? ["spo2", "%"] as const
      : metric === "weight" ? ["weight", "lb"] as const
      : metric === "glucose" ? ["glucose", "mg/dL"] as const
      : metric === "temperature" ? ["temperature", "degC"] as const
      : ["perfusion-index", "%"] as const;
    const normalized = normalizeScalarUnit(mapping[0], value, mapping[1]);
    return {
      deviceType: mapping[0], value: normalized.value, unit: normalized.unit,
      timestamp, timezoneOffsetMinutes, patientRef, deviceId,
      source: { provider: "tenovi", deviceModel: typeof input.device_name === "string" ? input.device_name : undefined, deviceIdentifier: deviceId },
      metadata,
    };
  },
};

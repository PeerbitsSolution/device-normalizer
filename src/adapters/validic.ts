import { DeviceNormalizerError } from "../errors.js";
import { requireTimestamp } from "../helpers.js";
import { normalizeBloodPressure, normalizeScalarUnit } from "../units.js";
import { AdapterReading, DeviceType, NormalizerAdapter, NormalizerOptions } from "../types.js";

interface ValidicMetric { type?: unknown; unit?: unknown; value?: unknown; origin?: unknown; }
interface ValidicMeasurement {
  type?: unknown;
  metrics?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  utc_offset?: unknown;
  source?: { type?: unknown; device?: unknown };
  user?: { uid?: unknown; user_id?: unknown };
  id?: unknown;
  checksum?: unknown;
}

const scalarTypes: Readonly<Record<string, DeviceType>> = {
  body_weight: "weight",
  body_temperature: "temperature",
  blood_glucose: "glucose",
  glucose: "glucose",
  oxygen_saturation: "spo2",
  spo2: "spo2",
  respiratory_rate: "respiratory-rate",
  heart_rate: "heart-rate",
  hrv: "heart-rate-variability",
};

function metricNumber(metric: ValidicMetric, index: number): number {
  if (typeof metric.value !== "number" || !Number.isFinite(metric.value)) {
    throw new DeviceNormalizerError("invalid_payload", `Validic metric ${index} must contain a finite numeric value.`);
  }
  return metric.value;
}

function metricUnit(metric: ValidicMetric, index: number): string {
  if (typeof metric.unit !== "string" || !metric.unit) {
    throw new DeviceNormalizerError("invalid_payload", `Validic metric ${index} must contain a unit.`);
  }
  return metric.unit;
}

export const validicAdapter: NormalizerAdapter<ValidicMeasurement | ValidicMeasurement[]> = {
  format: "validic",
  displayName: "Validic Inform measurement",
  description: "Normalizes documented Validic Inform measurement and stream payloads.",
  detect(payload) {
    const item = Array.isArray(payload) ? payload[0] : payload;
    if (!item || typeof item !== "object") return null;
    const candidate = item as ValidicMeasurement;
    return candidate.type === "measurement" && Array.isArray(candidate.metrics) && candidate.source !== undefined
      ? { format: this.format, provider: "validic", confidence: 0.99, transmissionType: "cloud-webhook", reason: "Validic measurement envelope" }
      : null;
  },
  normalize(input, options?: NormalizerOptions): AdapterReading | AdapterReading[] {
    if (Array.isArray(input)) return input.flatMap((entry) => this.normalize(entry, options) as AdapterReading[]);
    if (!input || typeof input !== "object" || !Array.isArray(input.metrics)) {
      throw new DeviceNormalizerError("invalid_payload", "Validic measurement must contain a metrics array.");
    }
    const timestamp = requireTimestamp(
      typeof input.start_time === "string" ? input.start_time : typeof input.end_time === "string" ? input.end_time : undefined,
      options,
    );
    const sourceProvider = typeof input.source?.type === "string" ? input.source.type : "validic";
    const deviceId = typeof input.source?.device === "string" ? input.source.device : options?.defaultDeviceId;
    const patientRef = typeof input.user?.uid === "string" ? input.user.uid :
      typeof input.user?.user_id === "string" ? input.user.user_id : options?.defaultPatientRef;
    const timezoneOffsetMinutes = typeof input.utc_offset === "number" ? input.utc_offset / 60 : undefined;
    const metadata = { validicId: input.id, checksum: input.checksum };
    const metrics = input.metrics as ValidicMetric[];
    const output: AdapterReading[] = [];
    const systolic = metrics.find((metric) => metric.type === "systolic");
    const diastolic = metrics.find((metric) => metric.type === "diastolic");
    const pulse = metrics.find((metric) => metric.type === "pulse");

    if (systolic || diastolic) {
      if (!systolic || !diastolic) throw new DeviceNormalizerError("invalid_payload", "Validic blood pressure requires both systolic and diastolic metrics.");
      const systolicValue = normalizeBloodPressure(metricNumber(systolic, 0), metricUnit(systolic, 0));
      const diastolicValue = normalizeBloodPressure(metricNumber(diastolic, 0), metricUnit(diastolic, 0));
      const pulseValue = pulse ? normalizeScalarUnit("heart-rate", metricNumber(pulse, 0), metricUnit(pulse, 0)).value : undefined;
      output.push({
        deviceType: "blood-pressure", value: { systolic: systolicValue, diastolic: diastolicValue, ...(pulseValue === undefined ? {} : { pulse: pulseValue }) }, unit: "mm[Hg]",
        metrics: {
          systolic: { value: systolicValue, unit: "mm[Hg]" }, diastolic: { value: diastolicValue, unit: "mm[Hg]" },
          ...(pulseValue === undefined ? {} : { pulse: { value: pulseValue, unit: "/min" } }),
        },
        timestamp, timezoneOffsetMinutes, patientRef, deviceId,
        source: { provider: sourceProvider, deviceIdentifier: deviceId }, metadata,
      });
    }

    metrics.forEach((metric, index) => {
      if (["systolic", "diastolic", "pulse"].includes(String(metric.type))) return;
      const type = String(metric.type ?? "");
      const deviceType = scalarTypes[type];
      if (!deviceType) return;
      const normalized = normalizeScalarUnit(deviceType, metricNumber(metric, index), metricUnit(metric, index));
      output.push({
        deviceType, value: normalized.value, unit: normalized.unit, timestamp, timezoneOffsetMinutes, patientRef, deviceId,
        source: { provider: sourceProvider, deviceIdentifier: deviceId }, metadata: { ...metadata, origin: metric.origin },
      });
    });

    if (output.length === 0) throw new DeviceNormalizerError("unsupported_measurement", "Validic payload contains no supported vital metrics.");
    return output;
  },
};

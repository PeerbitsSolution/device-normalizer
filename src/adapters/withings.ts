import { DeviceNormalizerError } from "../errors.js";
import { requireTimestamp } from "../helpers.js";
import { normalizeScalarUnit } from "../units.js";
import { AdapterReading, MetricKey, NormalizerAdapter, NormalizerOptions } from "../types.js";

interface WithingsMeasure { type?: unknown; value?: unknown; unit?: unknown; }
interface WithingsGroup {
  date?: unknown; deviceid?: unknown; model?: unknown; measures?: unknown;
  attrib?: unknown; probability?: unknown; grpid?: unknown;
}
interface WithingsPayload { status?: unknown; body?: { measuregrps?: unknown }; }

const BODY_KEYS: Readonly<Record<number, { key: MetricKey; field: string; unit: string }>> = {
  1: { key: "weight", field: "weight", unit: "kg" },
  5: { key: "fatFreeMass", field: "fatFreeMass", unit: "kg" },
  6: { key: "bodyFat", field: "bodyFat", unit: "%" },
  8: { key: "fatMass", field: "fatMass", unit: "kg" },
  76: { key: "muscleMass", field: "muscleMass", unit: "kg" },
  77: { key: "hydration", field: "hydration", unit: "kg" },
  88: { key: "boneMass", field: "boneMass", unit: "kg" },
};

function scaledValue(measure: WithingsMeasure, index: number): number {
  if (typeof measure.value !== "number" || typeof measure.unit !== "number") {
    throw new DeviceNormalizerError("invalid_payload", `Withings measure ${index} requires numeric value and unit exponent.`);
  }
  const result = measure.value * (10 ** measure.unit);
  if (!Number.isFinite(result)) throw new DeviceNormalizerError("invalid_payload", `Withings measure ${index} is not finite.`);
  return result;
}

function groupTimestamp(date: unknown, options?: NormalizerOptions): string {
  if (typeof date === "number" && Number.isFinite(date)) return new Date(date * 1000).toISOString();
  return requireTimestamp(undefined, options);
}

export const withingsAdapter: NormalizerAdapter<WithingsPayload> = {
  format: "withings",
  displayName: "Withings Measure - Getmeas response",
  description: "Normalizes the documented Withings measure API response after a notification-triggered fetch.",
  detect(payload) {
    if (!payload || typeof payload !== "object") return null;
    const candidate = payload as WithingsPayload;
    return candidate.status === 0 && Array.isArray(candidate.body?.measuregrps)
      ? { format: this.format, provider: "withings", confidence: 0.99, transmissionType: "cloud-webhook", reason: "Withings getmeas response envelope" }
      : null;
  },
  normalize(payload, options?: NormalizerOptions): AdapterReading[] {
    if (!payload || typeof payload !== "object" || payload.status !== 0 || !Array.isArray(payload.body?.measuregrps)) {
      throw new DeviceNormalizerError("invalid_payload", "Withings payload must be a successful getmeas response with body.measuregrps.");
    }
    const output: AdapterReading[] = [];
    for (const [groupIndex, rawGroup] of payload.body.measuregrps.entries()) {
      const group = rawGroup as WithingsGroup;
      if (!group || typeof group !== "object" || !Array.isArray(group.measures)) {
        throw new DeviceNormalizerError("invalid_payload", `Withings measure group ${groupIndex} has no measures array.`);
      }
      const timestamp = groupTimestamp(group.date, options);
      const deviceId = typeof group.deviceid === "string" || typeof group.deviceid === "number" ? String(group.deviceid) : options?.defaultDeviceId;
      const source = { provider: "withings", deviceModel: typeof group.model === "string" ? group.model : undefined, deviceIdentifier: deviceId };
      const metadata = { withingsGroupId: group.grpid, attrib: group.attrib, probability: group.probability };
      const measures = group.measures as WithingsMeasure[];
      const byType = new Map<number, WithingsMeasure>();
      measures.forEach((measure) => { if (typeof measure.type === "number") byType.set(measure.type, measure); });

      const systolic = byType.get(10);
      const diastolic = byType.get(9);
      if (systolic || diastolic) {
        if (!systolic || !diastolic) throw new DeviceNormalizerError("invalid_payload", "Withings blood pressure group requires systolic and diastolic measures.");
        const sys = scaledValue(systolic, 0);
        const dia = scaledValue(diastolic, 0);
        const pulse = byType.get(11);
        const pulseValue = pulse ? scaledValue(pulse, 0) : undefined;
        output.push({
          deviceType: "blood-pressure", value: { systolic: sys, diastolic: dia, ...(pulseValue === undefined ? {} : { pulse: pulseValue }) }, unit: "mm[Hg]",
          metrics: { systolic: { value: sys, unit: "mm[Hg]" }, diastolic: { value: dia, unit: "mm[Hg]" }, ...(pulseValue === undefined ? {} : { pulse: { value: pulseValue, unit: "/min" } }) },
          timestamp, patientRef: options?.defaultPatientRef, deviceId, source, metadata,
        });
      }

      const bodyMetrics: Partial<Record<MetricKey, { value: number; unit: string }>> = {};
      const bodyValue: Record<string, number> = {};
      measures.forEach((measure, index) => {
        if (typeof measure.type !== "number" || !BODY_KEYS[measure.type]) return;
        const definition = BODY_KEYS[measure.type];
        const value = scaledValue(measure, index);
        bodyMetrics[definition.key] = { value, unit: definition.unit };
        bodyValue[definition.field] = value;
      });
      if (Object.keys(bodyMetrics).length > 0) {
        output.push({
          deviceType: Object.keys(bodyMetrics).length === 1 && bodyMetrics.weight ? "weight" : "body-composition",
          value: Object.keys(bodyMetrics).length === 1 && bodyMetrics.weight ? bodyMetrics.weight.value : bodyValue,
          unit: Object.keys(bodyMetrics).length === 1 && bodyMetrics.weight ? "kg" : "mixed",
          metrics: bodyMetrics, timestamp, patientRef: options?.defaultPatientRef, deviceId, source, metadata,
        });
      }

      for (const [type, deviceType, unit] of [[12, "temperature", "Cel"], [71, "temperature", "Cel"], [73, "temperature", "Cel"], [54, "spo2", "%"], [119, "glucose", "mg/dL"], [62, "heart-rate-variability", "ms"]] as const) {
        const measure = byType.get(type);
        if (!measure) continue;
        const normalized = normalizeScalarUnit(deviceType, scaledValue(measure, type), unit);
        output.push({ deviceType, value: normalized.value, unit: normalized.unit, timestamp, patientRef: options?.defaultPatientRef, deviceId, source, metadata });
      }
    }
    if (!output.length) throw new DeviceNormalizerError("unsupported_measurement", "Withings response contains no supported measures.");
    return output;
  },
};

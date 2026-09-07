import { DeviceNormalizerError } from "../errors.js";
import { requireTimestamp } from "../helpers.js";
import { normalizeScalarUnit } from "../units.js";
import { AdapterReading, DeviceType, HealthConnectRecordPayload, NormalizerAdapter, NormalizerOptions } from "../types.js";

const TYPE_MAP: Readonly<Record<string, DeviceType>> = {
  HeartRateRecord: "heart-rate",
  HeartRateVariabilityRmssdRecord: "heart-rate-variability",
  OxygenSaturationRecord: "spo2",
  RespiratoryRateRecord: "respiratory-rate",
  BodyTemperatureRecord: "temperature",
  WeightRecord: "weight",
  BloodGlucoseRecord: "glucose",
};

export const healthConnectAdapter: NormalizerAdapter<HealthConnectRecordPayload | HealthConnectRecordPayload[]> = {
  format: "health-connect",
  displayName: "Google Health Connect",
  description: "Normalizes documented Health Connect record exports.",
  detect(payload) {
    const first = Array.isArray(payload) ? payload[0] : payload;
    if (!first || typeof first !== "object" || !("recordType" in first)) return null;
    const type = String((first as { recordType?: unknown }).recordType);
    if (!(type in TYPE_MAP)) return null;
    return { format: this.format, provider: "google-health-connect", confidence: 0.99, transmissionType: "health-connect", reason: "Known Health Connect record type" };
  },
  normalize(input, options?: NormalizerOptions): AdapterReading | AdapterReading[] {
    if (Array.isArray(input)) return input.map((item) => this.normalize(item, options) as AdapterReading);
    if (!input || typeof input !== "object") throw new DeviceNormalizerError("invalid_payload", "Health Connect payload must be an object or array.");
    const deviceType = TYPE_MAP[input.recordType];
    if (!deviceType) throw new DeviceNormalizerError("unsupported_measurement", `Unsupported Health Connect record type "${input.recordType}".`);
    if (typeof input.value !== "number") throw new DeviceNormalizerError("invalid_payload", "Health Connect record value must be numeric.");
    const normalized = normalizeScalarUnit(deviceType, input.value, input.unit ?? "");
    return {
      deviceType, value: normalized.value, unit: normalized.unit,
      timestamp: requireTimestamp(input.time ?? input.startTime ?? input.endTime, options),
      patientRef: input.patientRef ?? options?.defaultPatientRef,
      deviceId: input.deviceId ?? options?.defaultDeviceId,
      metadata: input.recordType === "HeartRateVariabilityRmssdRecord"
        ? { ...input.metadata, hrvMethod: "rmssd" }
        : input.metadata,
    };
  },
};

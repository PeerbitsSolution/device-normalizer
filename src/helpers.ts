import { DeviceNormalizerError } from "./errors.js";
import { DeviceReading, DeviceType, MetricKey, MetricValue, NormalizerOptions, ReadingSource } from "./types.js";

export const SCHEMA_VERSION = "2.0.0" as const;
export const ADAPTER_VERSION = "2.0.0";

export function requireTimestamp(timestamp: string | undefined, options?: NormalizerOptions): string {
  const value = timestamp ?? options?.receivedAt;
  if (!value) {
    throw new DeviceNormalizerError("missing_timestamp", "Source timestamp is missing; pass options.receivedAt only when receipt time is the intended fallback.");
  }
  const parsed = new Date(value);
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    throw new DeviceNormalizerError("invalid_payload", `Timestamp must include a UTC offset: "${value}"`);
  }
  if (Number.isNaN(parsed.getTime())) {
    throw new DeviceNormalizerError("invalid_payload", `Invalid ISO 8601 timestamp: "${value}"`);
  }
  return parsed.toISOString();
}

export function makeSource(
  format: string,
  provider: string,
  transmissionType: ReadingSource["transmissionType"],
  confidence = 1,
  deviceIdentifier?: string,
): ReadingSource {
  return { provider, format, detectionConfidence: confidence, transmissionType, adapterVersion: ADAPTER_VERSION, deviceIdentifier };
}

export function completeReading(reading: Omit<DeviceReading, "schemaVersion">): DeviceReading {
  return { schemaVersion: SCHEMA_VERSION, ...reading };
}

export function scalarMetrics(deviceType: DeviceType, value: number, unit: string): Partial<Record<MetricKey, MetricValue>> {
  const key: Partial<Record<DeviceType, MetricKey>> = {
    "heart-rate": "heartRate",
    "heart-rate-variability": "heartRateVariability",
    spo2: "spo2",
    "perfusion-index": "perfusionIndex",
    temperature: "temperature",
    glucose: "glucose",
    "respiratory-rate": "respiratoryRate",
    weight: "weight",
  };
  const metric = key[deviceType];
  return metric ? { [metric]: { value, unit } } : {};
}

import { DeviceNormalizerError } from "./errors.js";
import { completeReading, makeSource, scalarMetrics } from "./helpers.js";
import {
  AdapterReading,
  DetectionCandidate,
  DeviceReading,
  NormalizerAdapter,
  NormalizerOptions,
  SupportedFormat,
} from "./types.js";
import { bleBloodPressureAdapter } from "./adapters/ble-gatt/blood-pressure.js";
import { bleHeartRateAdapter } from "./adapters/ble-gatt/heart-rate.js";
import { bleThermometerAdapter } from "./adapters/ble-gatt/thermometer.js";
import { blePulseOximeterAdapter } from "./adapters/ble-gatt/pulse-oximeter.js";
import { bleWeightScaleAdapter } from "./adapters/ble-gatt/weight-scale.js";
import { bleGlucoseAdapter } from "./adapters/ble-gatt/glucose.js";
import { bleCgmAdapter } from "./adapters/ble-gatt/cgm.js";
import { healthKitAdapter } from "./adapters/healthkit.js";
import { healthConnectAdapter } from "./adapters/health-connect.js";
import { genericJsonAdapter } from "./adapters/generic-json.js";
import { junctionAdapter } from "./adapters/junction.js";
import { tenoviAdapter } from "./adapters/tenovi.js";
import { validicAdapter } from "./adapters/validic.js";
import { withingsAdapter } from "./adapters/withings.js";
import { iHealthAdapter } from "./adapters/ihealth.js";
import { dexcomAdapter } from "./adapters/dexcom.js";
import { validateDeviceReading } from "./validate.js";

export class UnsupportedFormatError extends DeviceNormalizerError {
  public readonly format: string;
  public readonly supportedFormats: string[];

  constructor(format: string, supportedFormats: string[]) {
    super("unsupported_format", `Unsupported normalizer format: "${format}". Supported formats: ${supportedFormats.join(", ")}`);
    this.name = "UnsupportedFormatError";
    this.format = format;
    this.supportedFormats = supportedFormats;
  }
}

export class NormalizationValidationError extends DeviceNormalizerError {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super("normalization_failed", `Device reading failed validation: ${errors.join("; ")}`, { errors });
    this.name = "NormalizationValidationError";
    this.errors = errors;
  }
}

const ADAPTER_REGISTRY = new Map<SupportedFormat, NormalizerAdapter<unknown>>();

export function registerAdapter(adapter: NormalizerAdapter<unknown>): void {
  ADAPTER_REGISTRY.set(adapter.format, adapter);
}

[
  bleBloodPressureAdapter, bleHeartRateAdapter, bleThermometerAdapter,
  blePulseOximeterAdapter, bleWeightScaleAdapter, bleGlucoseAdapter, bleCgmAdapter,
  healthKitAdapter, healthConnectAdapter, junctionAdapter, tenoviAdapter, validicAdapter, withingsAdapter, iHealthAdapter, dexcomAdapter, genericJsonAdapter,
].forEach((adapter) => registerAdapter(adapter as NormalizerAdapter<unknown>));

export function getSupportedFormats(): SupportedFormat[] {
  return Array.from(ADAPTER_REGISTRY.keys());
}

export function getRegisteredAdapters(): Array<{ format: SupportedFormat; displayName: string; description: string }> {
  return Array.from(ADAPTER_REGISTRY.values()).map(({ format, displayName, description }) => ({ format, displayName, description }));
}

function decorate(
  format: SupportedFormat,
  reading: AdapterReading,
  detection?: DetectionCandidate,
): DeviceReading {
  const fallback = sourceForFormat(format);
  const source = {
    ...makeSource(
      format,
      detection?.provider ?? fallback.provider,
      detection?.transmissionType ?? fallback.transmissionType,
      detection?.confidence ?? 1,
      reading.deviceId,
    ),
    ...reading.source,
  };
  const metrics = reading.metrics ?? (typeof reading.value === "number"
    ? scalarMetrics(reading.deviceType, reading.value, reading.unit)
    : reading.deviceType === "blood-pressure" && typeof reading.value === "object" && reading.value !== null
      ? Object.fromEntries(Object.entries(reading.value)
        .filter(([, value]) => typeof value === "number")
        .map(([key, value]) => [key, { value, unit: reading.unit }]))
      : {});
  return completeReading({ ...reading, metrics, source });
}

function sourceForFormat(format: SupportedFormat): Pick<DetectionCandidate, "provider" | "transmissionType"> {
  if (format.startsWith("ble-gatt")) return { provider: "bluetooth-sig", transmissionType: "bluetooth" };
  if (format === "healthkit") return { provider: "apple-healthkit", transmissionType: "healthkit" };
  if (format === "health-connect") return { provider: "google-health-connect", transmissionType: "health-connect" };
  if (format === "junction") return { provider: "junction", transmissionType: "cloud-webhook" };
  if (format === "tenovi") return { provider: "tenovi", transmissionType: "cellular" };
  if (format === "validic") return { provider: "validic", transmissionType: "cloud-webhook" };
  if (format === "withings") return { provider: "withings", transmissionType: "cloud-webhook" };
  if (format === "ihealth") return { provider: "ihealth", transmissionType: "cloud-webhook" };
  if (format === "dexcom") return { provider: "dexcom", transmissionType: "cloud-webhook" };
  return { provider: "unknown", transmissionType: "unknown" };
}

function runAdapter(
  format: SupportedFormat,
  payload: unknown,
  options?: NormalizerOptions,
  detection?: DetectionCandidate,
): DeviceReading | DeviceReading[] {
  const adapter = ADAPTER_REGISTRY.get(format);
  if (!adapter) throw new UnsupportedFormatError(format, getSupportedFormats());
  let result: AdapterReading | AdapterReading[];
  try {
    result = adapter.normalize(payload, options);
  } catch (error) {
    if (error instanceof DeviceNormalizerError) throw error;
    const message = error instanceof Error ? error.message : "Unknown adapter failure";
    throw new DeviceNormalizerError("invalid_payload", message, { format });
  }
  const readings = (Array.isArray(result) ? result : [result]).map((reading) => decorate(format, reading, detection));
  if (options?.validate !== false) {
    for (const reading of readings) {
      const validation = validateDeviceReading(reading);
      if (!validation.valid) throw new NormalizationValidationError(validation.errors);
    }
  }
  return Array.isArray(result) ? readings : readings[0];
}

/** Backward-compatible explicit dispatcher. Prefer process() for automatic detection. */
export function normalize(format: SupportedFormat | string, payload: unknown, options?: NormalizerOptions): DeviceReading | DeviceReading[] {
  if (!ADAPTER_REGISTRY.has(format as SupportedFormat)) throw new UnsupportedFormatError(format, getSupportedFormats());
  return runAdapter(format as SupportedFormat, payload, options);
}

export function detectFormat(payload: unknown): DetectionCandidate {
  const candidates = Array.from(ADAPTER_REGISTRY.values())
    .map((adapter) => adapter.detect?.(payload) ?? null)
    .filter((candidate): candidate is DetectionCandidate => candidate !== null)
    .sort((a, b) => b.confidence - a.confidence);

  if (candidates.length === 0) {
    throw new DeviceNormalizerError("unrecognized_source", "The payload does not match a supported source.");
  }
  if (candidates.length > 1 && candidates[0].confidence - candidates[1].confidence < 0.05) {
    throw new DeviceNormalizerError("ambiguous_source", "The payload matches more than one source.", { candidates });
  }
  return candidates[0];
}

/** Detects the source and returns normalized reading(s). */
export function process(payload: unknown, options?: NormalizerOptions): DeviceReading | DeviceReading[] {
  const detection = detectFormat(payload);
  return runAdapter(detection.format, payload, options, detection);
}

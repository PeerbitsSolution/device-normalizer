import { DeviceNormalizerError } from "../errors.js";
import { requireTimestamp } from "../helpers.js";
import { normalizeScalarUnit } from "../units.js";
import { AdapterReading, DeviceType, NormalizerAdapter, NormalizerOptions } from "../types.js";

interface JunctionSample { value?: unknown; unit?: unknown; timestamp?: unknown; start?: unknown; timezone_offset?: unknown; }
interface JunctionSource { provider?: unknown; slug?: unknown; device_id?: unknown; type?: unknown; }
interface JunctionEvent {
  event_type?: unknown;
  client_user_id?: unknown;
  user_id?: unknown;
  data?: { data?: unknown; source?: JunctionSource };
}

const RESOURCE_TYPES: Readonly<Record<string, DeviceType>> = {
  heartrate: "heart-rate",
  hrv: "heart-rate-variability",
  blood_oxygen: "spo2",
  body_temperature: "temperature",
  glucose: "glucose",
  respiratory_rate: "respiratory-rate",
  weight: "weight",
};

function resourceFromEvent(eventType: string): string | undefined {
  const match = /^daily\.data\.([a-z0-9_]+)\.(created|updated)$/.exec(eventType);
  return match?.[1];
}

export const junctionAdapter: NormalizerAdapter<JunctionEvent> = {
  format: "junction",
  displayName: "Junction wearable data webhook",
  description: "Normalizes Junction/Vital timeseries webhook events using its documented event envelope.",
  detect(payload) {
    if (!payload || typeof payload !== "object") return null;
    const event = payload as JunctionEvent;
    const eventType = typeof event.event_type === "string" ? event.event_type : "";
    const resource = resourceFromEvent(eventType);
    if (!resource || !event.data || !("source" in event.data) || !("data" in event.data)) return null;
    return { format: this.format, provider: "junction", confidence: 0.99, transmissionType: "cloud-webhook", reason: "Junction data-event envelope" };
  },
  normalize(event, options?: NormalizerOptions): AdapterReading[] {
    if (!event || typeof event !== "object") throw new DeviceNormalizerError("invalid_payload", "Junction event must be an object.");
    const eventType = typeof event.event_type === "string" ? event.event_type : "";
    const resource = resourceFromEvent(eventType);
    const deviceType = resource ? RESOURCE_TYPES[resource] : undefined;
    if (!deviceType) throw new DeviceNormalizerError("unsupported_measurement", `Unsupported Junction event type "${eventType}".`);
    const samples = event.data?.data;
    if (!Array.isArray(samples)) throw new DeviceNormalizerError("invalid_payload", "Junction timeseries event data.data must be an array.");
    const provider = String(event.data?.source?.provider ?? event.data?.source?.slug ?? "unknown");
    const deviceId = typeof event.data?.source?.device_id === "string" ? event.data.source.device_id : options?.defaultDeviceId;
    const patientRef = typeof event.client_user_id === "string" ? event.client_user_id :
      typeof event.user_id === "string" ? event.user_id : options?.defaultPatientRef;

    return samples.map((raw, index) => {
      if (!raw || typeof raw !== "object") throw new DeviceNormalizerError("invalid_payload", `Junction sample ${index} must be an object.`);
      const sample = raw as JunctionSample;
      if (typeof sample.value !== "number" || typeof sample.unit !== "string") {
        throw new DeviceNormalizerError("invalid_payload", `Junction sample ${index} requires numeric value and string unit.`);
      }
      const normalized = normalizeScalarUnit(deviceType, sample.value, sample.unit);
      const offsetSeconds = typeof sample.timezone_offset === "number" ? sample.timezone_offset : undefined;
      return {
        deviceType, value: normalized.value, unit: normalized.unit,
        timestamp: requireTimestamp(
          typeof sample.timestamp === "string" ? sample.timestamp : typeof sample.start === "string" ? sample.start : undefined,
          options,
        ),
        timezoneOffsetMinutes: offsetSeconds === undefined ? undefined : offsetSeconds / 60,
        patientRef, deviceId,
        source: { provider, deviceIdentifier: deviceId },
        metadata: { junctionEventType: eventType, junctionSourceType: event.data?.source?.type },
      };
    });
  },
};

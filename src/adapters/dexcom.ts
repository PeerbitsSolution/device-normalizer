import { DeviceNormalizerError } from '../errors.js';
import { normalizeScalarUnit } from '../units.js';
import type { AdapterReading, NormalizerAdapter, NormalizerOptions } from '../types.js';

interface DexcomEgv {
  recordId?: unknown;
  systemTime?: unknown;
  displayTime?: unknown;
  transmitterId?: unknown;
  value?: unknown;
  status?: unknown;
  trend?: unknown;
  trendRate?: unknown;
  displayDevice?: unknown;
  transmitterGeneration?: unknown;
}
interface DexcomPayload {
  unit?: unknown;
  rateUnit?: unknown;
  egvs?: unknown;
  recordType?: unknown;
  records?: unknown;
  userId?: unknown;
}

function numberField(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new DeviceNormalizerError('invalid_payload', `Dexcom ${name} must be finite numeric.`);
  return value;
}

/** Dexcom defines systemTime as nominally UTC, including responses without a trailing Z. */
function systemTime(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new DeviceNormalizerError('missing_timestamp', 'Dexcom EGV has no systemTime.');
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const parsed = new Date(utc);
  if (Number.isNaN(parsed.getTime())) throw new DeviceNormalizerError('invalid_payload', `Invalid Dexcom systemTime "${value}".`);
  return parsed.toISOString();
}

function records(payload: DexcomPayload): DexcomEgv[] {
  if (Array.isArray(payload.egvs)) return payload.egvs as DexcomEgv[];
  if (payload.recordType === 'egv' && Array.isArray(payload.records)) return payload.records as DexcomEgv[];
  if ('value' in payload && 'systemTime' in payload) return [payload as DexcomEgv];
  throw new DeviceNormalizerError('invalid_payload', 'Dexcom payload must contain an egvs array or v3 EGV records array.');
}

export const dexcomAdapter: NormalizerAdapter<DexcomPayload> = {
  format: 'dexcom',
  displayName: 'Dexcom EGV API',
  description: 'Normalizes documented Dexcom estimated glucose value API responses.',
  detect(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as DexcomPayload;
    const matched = Array.isArray(candidate.egvs) || (candidate.recordType === 'egv' && Array.isArray(candidate.records));
    return matched ? { format: this.format, provider: 'dexcom', confidence: 0.99, transmissionType: 'cloud-webhook', reason: 'Dexcom EGV response envelope' } : null;
  },
  normalize(payload, options?: NormalizerOptions): AdapterReading[] {
    if (!payload || typeof payload !== 'object') throw new DeviceNormalizerError('invalid_payload', 'Dexcom payload must be an object.');
    if (typeof payload.unit !== 'string') throw new DeviceNormalizerError('invalid_payload', 'Dexcom EGV response must specify its glucose unit.');
    const output: AdapterReading[] = [];
    for (const [index, egv] of records(payload).entries()) {
      const normalized = normalizeScalarUnit('glucose', numberField(egv.value, `egvs[${index}].value`), payload.unit);
      const rate = egv.trendRate === undefined ? undefined : numberField(egv.trendRate, `egvs[${index}].trendRate`);
      if (rate !== undefined && typeof payload.rateUnit !== 'string') {
        throw new DeviceNormalizerError('invalid_payload', 'Dexcom trendRate requires rateUnit.');
      }
      const deviceId = typeof egv.transmitterId === 'string' ? egv.transmitterId : options?.defaultDeviceId;
      output.push({
        deviceType: 'continuous-glucose',
        value: { glucose: normalized.value, ...(rate === undefined ? {} : { rateOfChange: rate }), ...(typeof egv.trend === 'string' ? { trend: egv.trend } : {}) },
        unit: normalized.unit,
        metrics: { glucose: { value: normalized.value, unit: normalized.unit }, ...(rate === undefined ? {} : { rateOfChange: { value: rate, unit: payload.rateUnit as string } }) },
        timestamp: systemTime(egv.systemTime), patientRef: typeof payload.userId === 'string' ? payload.userId : options?.defaultPatientRef,
        deviceId, source: { provider: 'dexcom', deviceIdentifier: deviceId },
        metadata: { recordId: egv.recordId, status: egv.status, displayTime: egv.displayTime, displayDevice: egv.displayDevice, transmitterGeneration: egv.transmitterGeneration },
      });
    }
    if (!output.length) throw new DeviceNormalizerError('unsupported_measurement', 'Dexcom EGV response is empty.');
    return output;
  },
};

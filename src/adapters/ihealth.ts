import { DeviceNormalizerError } from '../errors.js';
import { normalizeBloodPressure } from '../units.js';
import type { AdapterReading, NormalizerAdapter, NormalizerOptions } from '../types.js';

interface IHealthBloodPressureData {
  DataId?: unknown;
  Systolic?: unknown;
  Diastolic?: unknown;
  HeartRate?: unknown;
  MeasureTime?: unknown;
  TimeZone?: unknown;
  time_zone?: unknown;
  DataSource?: unknown;
}

interface IHealthPayload {
  CollectionType?: unknown;
  CollectionUnit?: unknown;
  Data?: IHealthBloodPressureData;
  UserID?: unknown;
}

function asNumber(value: unknown, name: string): number {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(result)) throw new DeviceNormalizerError('invalid_payload', `iHealth ${name} must be numeric.`);
  return result;
}

function toOffset(value: unknown): { text: string; minutes: number } {
  if (typeof value !== 'string') throw new DeviceNormalizerError('missing_timestamp', 'iHealth blood-pressure payload has no timezone.');
  const match = value.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) throw new DeviceNormalizerError('invalid_payload', `Invalid iHealth timezone "${value}".`);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  if (minutes > 14 * 60 || (minutes === 14 * 60 && Number(match[3]) !== 0)) {
    throw new DeviceNormalizerError('invalid_payload', `Invalid iHealth timezone "${value}".`);
  }
  return { text: `${match[1]}${match[2]}:${match[3]}`, minutes: match[1] === '-' ? -minutes : minutes };
}

function timestamp(data: IHealthBloodPressureData): { timestamp: string; timezoneOffsetMinutes: number } {
  if (typeof data.MeasureTime !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data.MeasureTime)) {
    throw new DeviceNormalizerError('missing_timestamp', 'iHealth blood-pressure payload has no valid MeasureTime.');
  }
  const offset = toOffset(data.time_zone ?? data.TimeZone);
  const instant = new Date(`${data.MeasureTime.replace(' ', 'T')}${offset.text}`);
  if (Number.isNaN(instant.getTime())) throw new DeviceNormalizerError('invalid_payload', 'Invalid iHealth MeasureTime.');
  return { timestamp: instant.toISOString(), timezoneOffsetMinutes: offset.minutes };
}

export const iHealthAdapter: NormalizerAdapter<IHealthPayload> = {
  format: 'ihealth',
  displayName: 'iHealth blood-pressure webhook',
  description: 'Normalizes the documented iHealth Cloud blood-pressure webhook payload.',
  detect(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as IHealthPayload;
    return candidate.CollectionType === 'bp' && candidate.Data && typeof candidate.Data === 'object'
      ? { format: this.format, provider: 'ihealth', confidence: 0.99, transmissionType: 'cloud-webhook', reason: 'iHealth blood-pressure webhook envelope' }
      : null;
  },
  normalize(payload, options?: NormalizerOptions): AdapterReading {
    if (!payload || typeof payload !== 'object' || payload.CollectionType !== 'bp' || !payload.Data) {
      throw new DeviceNormalizerError('invalid_payload', 'iHealth adapter requires a blood-pressure webhook payload.');
    }
    // iHealth documents CollectionUnit 0 for this blood-pressure envelope (mmHg).
    if (payload.CollectionUnit !== 0 && payload.CollectionUnit !== '0') {
      throw new DeviceNormalizerError('unsupported_measurement', 'Only iHealth blood-pressure CollectionUnit 0 (mmHg) is supported.');
    }
    const systolic = normalizeBloodPressure(asNumber(payload.Data.Systolic, 'Systolic'), 'mmHg');
    const diastolic = normalizeBloodPressure(asNumber(payload.Data.Diastolic, 'Diastolic'), 'mmHg');
    const pulse = asNumber(payload.Data.HeartRate, 'HeartRate');
    const measured = timestamp(payload.Data);
    const deviceId = typeof payload.Data.DataId === 'string' ? payload.Data.DataId : options?.defaultDeviceId;
    return {
      deviceType: 'blood-pressure', value: { systolic, diastolic, pulse }, unit: 'mm[Hg]',
      metrics: { systolic: { value: systolic, unit: 'mm[Hg]' }, diastolic: { value: diastolic, unit: 'mm[Hg]' }, pulse: { value: pulse, unit: '/min' } },
      timestamp: measured.timestamp, timezoneOffsetMinutes: measured.timezoneOffsetMinutes,
      patientRef: typeof payload.UserID === 'string' ? payload.UserID : options?.defaultPatientRef,
      deviceId,
      source: { provider: 'ihealth', deviceIdentifier: deviceId },
      metadata: { dataSource: payload.Data.DataSource },
    };
  },
};

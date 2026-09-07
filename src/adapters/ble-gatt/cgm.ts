import { DeviceNormalizerError } from '../../errors.js';
import type { AdapterReading, BleCgmPayload, NormalizerAdapter, NormalizerOptions } from '../../types.js';
import { parseSFloat16, payloadToDataView } from './sfloat.js';

function crcCcitt(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return crc & 0xffff;
}

function sessionStart(value: unknown): number {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    throw new DeviceNormalizerError('missing_timestamp', 'BLE CGM requires sessionStartTime with an explicit UTC offset.');
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) throw new DeviceNormalizerError('invalid_payload', 'BLE CGM sessionStartTime is invalid.');
  return timestamp;
}

export const bleCgmAdapter: NormalizerAdapter<BleCgmPayload> = {
  format: 'ble-gatt-cgm',
  displayName: 'Bluetooth SIG CGM Measurement (0x2AA7)',
  description: 'Decodes standard CGM Measurement records, optional fields, time offsets, and E2E CRC.',
  detect(payload) {
    if (!payload || typeof payload !== 'object' || !('characteristicUuid' in payload)) return null;
    const uuid = String((payload as { characteristicUuid?: unknown }).characteristicUuid).toLowerCase().replace(/^0x/, '');
    return uuid === '2aa7' ? { format: this.format, provider: 'bluetooth-sig', confidence: 1, transmissionType: 'bluetooth', reason: 'CGM Measurement characteristic UUID' } : null;
  },
  normalize(payload, options?: NormalizerOptions): AdapterReading[] {
    if (!payload || typeof payload !== 'object' || !('bytes' in payload)) {
      throw new DeviceNormalizerError('invalid_payload', 'BLE CGM requires bytes, sessionStartTime, and e2eCrcSupported.');
    }
    if (typeof payload.e2eCrcSupported !== 'boolean') {
      throw new DeviceNormalizerError('invalid_payload', 'BLE CGM requires e2eCrcSupported from the CGM Feature characteristic.');
    }
    const start = sessionStart(payload.sessionStartTime);
    const view = payloadToDataView(payload.bytes);
    const raw = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const output: AdapterReading[] = [];
    let recordOffset = 0;
    while (recordOffset < view.byteLength) {
      const size = view.getUint8(recordOffset);
      if (size < 6 || recordOffset + size > view.byteLength) throw new DeviceNormalizerError('invalid_payload', `Invalid BLE CGM record size ${size}.`);
      const flags = view.getUint8(recordOffset + 1);
      if ((flags & 0x1c) !== 0) throw new DeviceNormalizerError('invalid_payload', 'BLE CGM reserved flag bits must be zero.');
      const optionalCount = ((flags & 0x80) ? 1 : 0) + ((flags & 0x40) ? 1 : 0) + ((flags & 0x20) ? 1 : 0) +
        ((flags & 0x01) ? 2 : 0) + ((flags & 0x02) ? 2 : 0) + (payload.e2eCrcSupported ? 2 : 0);
      if (size !== 6 + optionalCount) throw new DeviceNormalizerError('invalid_payload', `BLE CGM record size ${size} does not match its flags and feature data.`);
      const glucose = parseSFloat16(view, recordOffset + 2);
      if (!Number.isFinite(glucose)) throw new DeviceNormalizerError('invalid_payload', 'BLE CGM glucose concentration is not a finite result.');
      const timeOffsetMinutes = view.getUint16(recordOffset + 4, true);
      let cursor = recordOffset + 6;
      const status: Record<string, number> = {};
      if ((flags & 0x80) !== 0) status.status = view.getUint8(cursor++);
      if ((flags & 0x40) !== 0) status.calibrationTemperature = view.getUint8(cursor++);
      if ((flags & 0x20) !== 0) status.warning = view.getUint8(cursor++);
      let trend: number | undefined;
      if ((flags & 0x01) !== 0) { trend = parseSFloat16(view, cursor); cursor += 2; }
      let quality: number | undefined;
      if ((flags & 0x02) !== 0) { quality = parseSFloat16(view, cursor); cursor += 2; }
      if ((trend !== undefined && !Number.isFinite(trend)) || (quality !== undefined && !Number.isFinite(quality))) {
        throw new DeviceNormalizerError('invalid_payload', 'BLE CGM optional numeric field is not finite.');
      }
      if (payload.e2eCrcSupported) {
        const supplied = view.getUint16(recordOffset + size - 2, true);
        const calculated = crcCcitt(raw.subarray(recordOffset, recordOffset + size - 2));
        if (supplied !== calculated) throw new DeviceNormalizerError('invalid_payload', 'BLE CGM E2E CRC validation failed.');
      }
      output.push({
        deviceType: 'continuous-glucose',
        value: { glucose, ...(trend === undefined ? {} : { rateOfChange: trend }) }, unit: 'mg/dL',
        metrics: { glucose: { value: glucose, unit: 'mg/dL' }, ...(trend === undefined ? {} : { rateOfChange: { value: trend, unit: 'mg/dL/min' } }) },
        timestamp: new Date(start + timeOffsetMinutes * 60_000).toISOString(),
        timezoneOffsetMinutes: payload.timezoneOffsetMinutes,
        patientRef: payload.patientRef ?? options?.defaultPatientRef,
        deviceId: payload.deviceId ?? options?.defaultDeviceId,
        metadata: { bleProfile: '0x2AA7', timeOffsetMinutes, ...(quality === undefined ? {} : { qualityPercent: quality }), ...status },
      });
      recordOffset += size;
    }
    if (!output.length) throw new DeviceNormalizerError('invalid_payload', 'BLE CGM payload contains no records.');
    return output;
  },
};

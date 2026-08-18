/**
 * Types for @peerbits/device-normalizer.
 * Normalizes raw device/health-platform payloads into canonical vital readings.
 *
 * NOTE per handover doc §5 FR1:
 * DeviceReading is intentionally a LOCAL COPY of fhir-observation-generator's shape,
 * kept in lockstep manually rather than imported.
 */

export type DeviceType =
  | "blood-pressure"
  | "heart-rate"
  | "weight"
  | "spo2"
  | "temperature"
  | "glucose"
  | "respiratory-rate";

export const SUPPORTED_DEVICE_TYPES: DeviceType[] = [
  "blood-pressure",
  "heart-rate",
  "weight",
  "spo2",
  "temperature",
  "glucose",
  "respiratory-rate",
];

export interface BloodPressureValue {
  systolic: number;
  diastolic: number;
  meanArterialPressure?: number;
}

export type DeviceReadingValue = number | BloodPressureValue;

export interface DeviceReading {
  /**
   * The vital type of the device reading.
   */
  deviceType: DeviceType;
  /**
   * Numeric reading value, or { systolic, diastolic } object for blood pressure.
   */
  value: DeviceReadingValue;
  /**
   * Unit of measurement as reported by the device (e.g. "degF", "lbs", "mmHg", "bpm", "%", "mg/dL").
   */
  unit: string;
  /**
   * Timestamp in ISO 8601 format (e.g. "2026-08-06T10:00:00Z").
   */
  timestamp: string;
  /**
   * Opaque reference to patient (e.g. "Patient/p-12345"). Never include real identifiers/PHI.
   */
  patientRef: string;
  /**
   * Optional opaque device identifier (e.g. "Device/d-98765").
   */
  deviceId?: string;
  /**
   * Optional normalized metadata from the raw standard (e.g. flags, battery, location).
   */
  metadata?: Record<string, unknown>;
}

export type SupportedFormat =
  | "ble-gatt-blood-pressure"
  | "ble-gatt-thermometer"
  | "ble-gatt-pulse-oximeter"
  | "ble-gatt-weight-scale"
  | "ble-gatt-glucose"
  | "healthkit"
  | "generic-json";

export interface NormalizerOptions {
  /** Default patient reference if missing in raw payload */
  defaultPatientRef?: string;
  /** Default device identifier if missing in raw payload */
  defaultDeviceId?: string;
  /** Whether to execute structural validation against fhir-observation-generator requirements (default: true) */
  validate?: boolean;
}

export interface NormalizerAdapter<T = unknown> {
  format: SupportedFormat;
  displayName: string;
  description: string;
  normalize: (payload: T, options?: NormalizerOptions) => DeviceReading | DeviceReading[];
}

export interface BleRawPayload {
  bytes: number[] | Uint8Array | string; // byte array, Uint8Array, or hex string (e.g. "00 78 00 50 00...")
  patientRef?: string;
  deviceId?: string;
  timestamp?: string;
}

export interface HealthKitSamplePayload {
  sampleType: string;
  value?: number;
  unit?: string;
  startDate?: string;
  endDate?: string;
  metadata?: Record<string, unknown>;
  patientRef?: string;
  deviceId?: string;
  // For HKCorrelation (e.g. Blood Pressure)
  objects?: HealthKitSamplePayload[];
  correlationType?: string;
}

export interface GenericDevicePayload {
  deviceType: string;
  value?: unknown;
  rawValue?: unknown;
  unit?: string;
  rawUnit?: string;
  timestamp?: string;
  patientRef?: string;
  deviceId?: string;
  metadata?: Record<string, unknown>;
}

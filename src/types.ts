export type DeviceType =
  | "blood-pressure"
  | "heart-rate"
  | "heart-rate-variability"
  | "ecg"
  | "weight"
  | "body-composition"
  | "spo2"
  | "perfusion-index"
  | "temperature"
  | "glucose"
  | "continuous-glucose"
  | "respiratory-rate"
  | "spirometry"
  | "sleep";

export const SUPPORTED_DEVICE_TYPES: readonly DeviceType[] = [
  "blood-pressure", "heart-rate", "heart-rate-variability", "ecg", "weight",
  "body-composition", "spo2", "perfusion-index", "temperature", "glucose", "continuous-glucose",
  "respiratory-rate", "spirometry", "sleep",
];

export interface BloodPressureValue {
  systolic: number;
  diastolic: number;
  meanArterialPressure?: number;
  pulse?: number;
}

export interface BodyCompositionValue {
  weight?: number;
  bmi?: number;
  bodyFat?: number;
  fatMass?: number;
  fatFreeMass?: number;
  muscleMass?: number;
  hydration?: number;
  boneMass?: number;
}

export interface ContinuousGlucoseValue { glucose: number; rateOfChange?: number; trend?: string; }
export interface SpirometryValue { fev1?: number; fvc?: number; pef?: number; fev1FvcRatio?: number; }
export interface SleepValue {
  totalDuration: number;
  deepSleep?: number;
  lightSleep?: number;
  remSleep?: number;
  awakeTime?: number;
  timeInBed?: number;
  efficiency?: number;
}
export interface EcgValue { averageHeartRate?: number; rhythmClassification?: string; durationSeconds?: number; }

export type DeviceReadingValue = number | BloodPressureValue | BodyCompositionValue |
  ContinuousGlucoseValue | SpirometryValue | SleepValue | EcgValue;

export type MetricKey =
  | "systolic" | "diastolic" | "meanArterialPressure" | "pulse"
  | "heartRate" | "heartRateVariability" | "spo2" | "perfusionIndex"
  | "temperature" | "glucose" | "rateOfChange" | "weight" | "bmi"
  | "bodyFat" | "fatMass" | "fatFreeMass" | "muscleMass" | "hydration" | "boneMass"
  | "respiratoryRate" | "fev1" | "fvc" | "pef" | "fev1FvcRatio"
  | "totalSleep" | "deepSleep" | "lightSleep" | "remSleep" | "awakeTime"
  | "timeInBed" | "sleepEfficiency";

export interface MetricValue {
  value: number;
  unit: string;
}

export type TransmissionType = "bluetooth" | "cellular" | "cloud-webhook" |
  "healthkit" | "health-connect" | "manual" | "unknown";

export interface ReadingSource {
  provider: string;
  format: string;
  detectionConfidence: number;
  transmissionType: TransmissionType;
  adapterVersion: string;
  deviceModel?: string;
  deviceIdentifier?: string;
}

export interface DeviceReading {
  schemaVersion: "2.0.0";
  deviceType: DeviceType;
  value: DeviceReadingValue;
  unit: string;
  /**
   * Canonical named values. New consumers should use this field; `value` and
   * `unit` remain for compatibility with the original package API.
   */
  metrics: Partial<Record<MetricKey, MetricValue>>;
  timestamp: string;
  timezoneOffsetMinutes?: number;
  patientRef?: string;
  deviceId?: string;
  source: ReadingSource;
  metadata?: Record<string, unknown>;
  waveformRef?: {
    lead?: string;
    sampleCount?: number;
    samplingRateHz?: number;
    reference: string;
    checksum?: string;
  };
}

export type AdapterReading = Omit<DeviceReading, "schemaVersion" | "source" | "metrics"> & {
  source?: Partial<ReadingSource>;
  metrics?: Partial<Record<MetricKey, MetricValue>>;
};

export type SupportedFormat =
  | "ble-gatt-blood-pressure" | "ble-gatt-heart-rate" | "ble-gatt-thermometer"
  | "ble-gatt-pulse-oximeter" | "ble-gatt-weight-scale" | "ble-gatt-glucose" | "ble-gatt-cgm"
  | "healthkit" | "health-connect" | "junction" | "tenovi" | "validic" | "withings" | "ihealth" | "dexcom" | "generic-json";

export interface NormalizerOptions {
  defaultPatientRef?: string;
  defaultDeviceId?: string;
  receivedAt?: string;
  validate?: boolean;
}

export interface DetectionCandidate {
  format: SupportedFormat;
  provider: string;
  confidence: number;
  transmissionType: TransmissionType;
  reason: string;
}

export interface NormalizerAdapter<T = unknown> {
  format: SupportedFormat;
  displayName: string;
  description: string;
  detect?: (payload: unknown) => DetectionCandidate | null;
  normalize: (payload: T, options?: NormalizerOptions) => AdapterReading | AdapterReading[];
}

export interface BleRawPayload {
  bytes: number[] | Uint8Array | string;
  characteristicUuid?: string;
  patientRef?: string;
  deviceId?: string;
  timestamp?: string;
  /** Required when a BLE Date-Time field is present because that field has no timezone. */
  timezoneOffsetMinutes?: number;
}

export interface BleCgmPayload extends BleRawPayload {
  /** Absolute CGM session start instant, read from the Session Start Time characteristic. */
  sessionStartTime: string;
  /** Must match the E2E-CRC feature bit read from the CGM Feature characteristic. */
  e2eCrcSupported: boolean;
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
  objects?: HealthKitSamplePayload[];
  correlationType?: string;
}

export interface HealthConnectRecordPayload {
  recordType: string;
  startTime?: string;
  endTime?: string;
  time?: string;
  value?: unknown;
  unit?: string;
  metadata?: Record<string, unknown>;
  patientRef?: string;
  deviceId?: string;
}

export interface GenericDevicePayload {
  deviceType: string;
  value?: unknown;
  rawValue?: unknown;
  unit?: string;
  rawUnit?: string;
  timestamp?: string;
  timezoneOffsetMinutes?: number;
  patientRef?: string;
  deviceId?: string;
  metadata?: Record<string, unknown>;
  metrics?: Partial<Record<MetricKey, MetricValue>>;
  source?: { provider?: string; deviceModel?: string; deviceIdentifier?: string; transmissionType?: TransmissionType };
}

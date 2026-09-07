/**
 * device-normalizer — Raw device/health-platform payloads -> canonical vital readings.
 * Feeds fhir-observation-generator directly.
 * Grounded strictly in publicly documented standards (Bluetooth SIG GATT Health Profiles & Apple HealthKit).
 */

export const VERSION = "2.0.0";

// Core Types
export type {
  DeviceType,
  DeviceReading,
  AdapterReading,
  DeviceReadingValue,
  BloodPressureValue,
  SupportedFormat,
  NormalizerOptions,
  NormalizerAdapter,
  BleRawPayload,
  BleCgmPayload,
  HealthKitSamplePayload,
  GenericDevicePayload,
  HealthConnectRecordPayload,
  DetectionCandidate,
  ReadingSource,
  TransmissionType,
  BodyCompositionValue,
  ContinuousGlucoseValue,
  SpirometryValue,
  SleepValue,
  EcgValue,
  MetricKey,
} from "./types.js";
export { SUPPORTED_DEVICE_TYPES } from "./types.js";

// Registry & Dispatcher
export {
  normalize,
  process,
  detectFormat,
  registerAdapter,
  getSupportedFormats,
  getRegisteredAdapters,
  UnsupportedFormatError,
  NormalizationValidationError,
} from "./registry.js";
export { DeviceNormalizerError, type NormalizerErrorCode } from "./errors.js";
export { normalizeScalarUnit, normalizeBloodPressure } from "./units.js";

// Structural Self-Check Validation
export { validateDeviceReading, type ValidationResult } from "./validate.js";

// Individual Adapters
export { bleBloodPressureAdapter } from "./adapters/ble-gatt/blood-pressure.js";
export { bleHeartRateAdapter } from "./adapters/ble-gatt/heart-rate.js";
export { bleThermometerAdapter } from "./adapters/ble-gatt/thermometer.js";
export { blePulseOximeterAdapter } from "./adapters/ble-gatt/pulse-oximeter.js";
export { bleWeightScaleAdapter } from "./adapters/ble-gatt/weight-scale.js";
export { bleGlucoseAdapter } from "./adapters/ble-gatt/glucose.js";
export { bleCgmAdapter } from "./adapters/ble-gatt/cgm.js";
export { healthKitAdapter, normalizeHealthKitType, normalizeHealthKitUnit } from "./adapters/healthkit.js";
export { healthConnectAdapter } from "./adapters/health-connect.js";
export { junctionAdapter } from "./adapters/junction.js";
export { tenoviAdapter } from "./adapters/tenovi.js";
export { validicAdapter } from "./adapters/validic.js";
export { withingsAdapter } from "./adapters/withings.js";
export { iHealthAdapter } from "./adapters/ihealth.js";
export { dexcomAdapter } from "./adapters/dexcom.js";
export { genericJsonAdapter, normalizeGenericDeviceType } from "./adapters/generic-json.js";

// SFLOAT / IEEE-11073 Helpers
export { parseSFloat16, parseFloat32, parseBleDateTime, payloadToDataView } from "./adapters/ble-gatt/sfloat.js";

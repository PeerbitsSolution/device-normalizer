/**
 * device-normalizer — Raw device/health-platform payloads -> canonical vital readings.
 * Feeds fhir-observation-generator directly.
 * Grounded strictly in publicly documented standards (Bluetooth SIG GATT Health Profiles & Apple HealthKit).
 */

export const VERSION = "1.0.0";

// Core Types
export type {
  DeviceType,
  DeviceReading,
  DeviceReadingValue,
  BloodPressureValue,
  SupportedFormat,
  NormalizerOptions,
  NormalizerAdapter,
  BleRawPayload,
  HealthKitSamplePayload,
  GenericDevicePayload,
} from "./types.js";
export { SUPPORTED_DEVICE_TYPES } from "./types.js";

// Registry & Dispatcher
export {
  normalize,
  registerAdapter,
  getSupportedFormats,
  getRegisteredAdapters,
  UnsupportedFormatError,
  NormalizationValidationError,
} from "./registry.js";

// Structural Self-Check Validation
export { validateDeviceReading, type ValidationResult } from "./validate.js";

// Individual Adapters
export { bleBloodPressureAdapter } from "./adapters/ble-gatt/blood-pressure.js";
export { bleThermometerAdapter } from "./adapters/ble-gatt/thermometer.js";
export { blePulseOximeterAdapter } from "./adapters/ble-gatt/pulse-oximeter.js";
export { bleWeightScaleAdapter } from "./adapters/ble-gatt/weight-scale.js";
export { bleGlucoseAdapter } from "./adapters/ble-gatt/glucose.js";
export { healthKitAdapter, normalizeHealthKitType, normalizeHealthKitUnit } from "./adapters/healthkit.js";
export { genericJsonAdapter, normalizeGenericDeviceType } from "./adapters/generic-json.js";

// SFLOAT / IEEE-11073 Helpers
export { parseSFloat16, parseFloat32, parseBleDateTime, payloadToDataView } from "./adapters/ble-gatt/sfloat.js";

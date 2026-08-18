/**
 * Format registry and dispatcher for @peerbits/device-normalizer.
 * Dispatches raw payloads to the appropriate standards-based normalizer adapter.
 * Produces clear typed errors for unsupported formats.
 */

import {
  DeviceReading,
  NormalizerAdapter,
  NormalizerOptions,
  SupportedFormat,
} from "./types.js";
import { bleBloodPressureAdapter } from "./adapters/ble-gatt/blood-pressure.js";
import { bleThermometerAdapter } from "./adapters/ble-gatt/thermometer.js";
import { blePulseOximeterAdapter } from "./adapters/ble-gatt/pulse-oximeter.js";
import { bleWeightScaleAdapter } from "./adapters/ble-gatt/weight-scale.js";
import { bleGlucoseAdapter } from "./adapters/ble-gatt/glucose.js";
import { healthKitAdapter } from "./adapters/healthkit.js";
import { genericJsonAdapter } from "./adapters/generic-json.js";
import { validateDeviceReading } from "./validate.js";

export class UnsupportedFormatError extends Error {
  public readonly format: string;
  public readonly supportedFormats: string[];

  constructor(format: string, supportedFormats: string[]) {
    super(
      `Unsupported normalizer format: "${format}". Supported formats are: ${supportedFormats.join(", ")}`
    );
    this.name = "UnsupportedFormatError";
    this.format = format;
    this.supportedFormats = supportedFormats;
  }
}

export class NormalizationValidationError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(`Device reading failed structural validation:\n- ${errors.join("\n- ")}`);
    this.name = "NormalizationValidationError";
    this.errors = errors;
  }
}

// Internal registry map
const ADAPTER_REGISTRY = new Map<SupportedFormat, NormalizerAdapter<any>>();

// Register built-in standards-based adapters
export function registerAdapter(adapter: NormalizerAdapter<any>): void {
  ADAPTER_REGISTRY.set(adapter.format, adapter);
}

// Initialize default adapters
registerAdapter(bleBloodPressureAdapter);
registerAdapter(bleThermometerAdapter);
registerAdapter(blePulseOximeterAdapter);
registerAdapter(bleWeightScaleAdapter);
registerAdapter(bleGlucoseAdapter);
registerAdapter(healthKitAdapter);
registerAdapter(genericJsonAdapter);

/**
 * Returns list of all registered format identifiers.
 */
export function getSupportedFormats(): SupportedFormat[] {
  return Array.from(ADAPTER_REGISTRY.keys());
}

/**
 * Returns metadata list for all registered normalizer adapters.
 */
export function getRegisteredAdapters(): Array<{
  format: SupportedFormat;
  displayName: string;
  description: string;
}> {
  return Array.from(ADAPTER_REGISTRY.values()).map((a) => ({
    format: a.format,
    displayName: a.displayName,
    description: a.description,
  }));
}

/**
 * Normalizes raw device/platform payloads into canonical DeviceReading(s).
 *
 * @param format Format identifier (e.g. "ble-gatt-blood-pressure", "healthkit", "generic-json")
 * @param payload Raw GATT bytes, HealthKit sample JSON, or generic JSON payload
 * @param options Normalizer options (patientRef, deviceId, validate)
 * @throws {UnsupportedFormatError} if the format is not recognized
 * @throws {NormalizationValidationError} if validation is enabled and the output fails structural self-check
 */
export function normalize(
  format: SupportedFormat | string,
  payload: unknown,
  options?: NormalizerOptions
): DeviceReading | DeviceReading[] {
  const adapter = ADAPTER_REGISTRY.get(format as SupportedFormat);
  if (!adapter) {
    throw new UnsupportedFormatError(format, getSupportedFormats());
  }

  const result = adapter.normalize(payload, options);

  // Optional structural self-check against fhir-observation-generator requirements
  if (options?.validate !== false) {
    const readings = Array.isArray(result) ? result : [result];
    for (const r of readings) {
      const valRes = validateDeviceReading(r);
      if (!valRes.valid) {
        throw new NormalizationValidationError(valRes.errors);
      }
    }
  }

  return result;
}

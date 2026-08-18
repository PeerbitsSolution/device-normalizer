/**
 * Structural self-check for @peerbits/device-normalizer.
 * Confirms output DeviceReading satisfies every field fhir-observation-generator requires.
 * Fast fail-early check at the boundary between raw device data and FHIR generation.
 */

import { DeviceReading, SUPPORTED_DEVICE_TYPES } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a single DeviceReading against fhir-observation-generator's generator contract.
 */
export function validateDeviceReading(reading: unknown): ValidationResult {
  const errors: string[] = [];

  if (!reading || typeof reading !== "object") {
    return { valid: false, errors: ["DeviceReading must be an object"] };
  }

  const r = reading as Partial<DeviceReading>;

  // 1. Check deviceType
  if (!r.deviceType) {
    errors.push("Missing required 'deviceType' field");
  } else if (!SUPPORTED_DEVICE_TYPES.includes(r.deviceType)) {
    errors.push(
      `Unsupported deviceType "${r.deviceType}". Expected one of: ${SUPPORTED_DEVICE_TYPES.join(", ")}`
    );
  }

  // 2. Check value
  if (r.value === undefined || r.value === null) {
    errors.push("Missing required 'value' field");
  } else if (r.deviceType === "blood-pressure") {
    if (typeof r.value !== "object" || r.value === null) {
      errors.push("Blood pressure value must be an object { systolic: number, diastolic: number }");
    } else {
      const bp = r.value as { systolic?: unknown; diastolic?: unknown };
      if (typeof bp.systolic !== "number" || isNaN(bp.systolic)) {
        errors.push("Blood pressure systolic value must be a valid number");
      }
      if (typeof bp.diastolic !== "number" || isNaN(bp.diastolic)) {
        errors.push("Blood pressure diastolic value must be a valid number");
      }
      if (typeof bp.systolic === "number" && typeof bp.diastolic === "number" && bp.systolic <= bp.diastolic) {
        errors.push(`Suspicious blood pressure values: systolic (${bp.systolic}) is <= diastolic (${bp.diastolic})`);
      }
    }
  } else {
    if (typeof r.value !== "number" || isNaN(r.value)) {
      errors.push(`Reading value for ${r.deviceType || "device"} must be a valid number, received: ${JSON.stringify(r.value)}`);
    }
  }

  // 3. Check unit
  if (!r.unit || typeof r.unit !== "string" || !r.unit.trim()) {
    errors.push("Missing required 'unit' field");
  }

  // 4. Check timestamp
  if (!r.timestamp || typeof r.timestamp !== "string" || !r.timestamp.trim()) {
    errors.push("Missing required 'timestamp' field");
  } else {
    const parsedDate = new Date(r.timestamp);
    if (isNaN(parsedDate.getTime())) {
      errors.push(`Invalid timestamp format: "${r.timestamp}". Expected ISO 8601 string.`);
    }
  }

  // 5. Check patientRef
  if (!r.patientRef || typeof r.patientRef !== "string" || !r.patientRef.trim()) {
    errors.push("Missing required 'patientRef' field");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

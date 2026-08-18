import { describe, it, expect } from "vitest";
import { validateDeviceReading } from "../src/validate.js";
import { DeviceReading } from "../src/types.js";

describe("device-normalizer: structural self-check", () => {
  it("confirms valid DeviceReading satisfies fhir-observation-generator requirements", () => {
    const validReading: DeviceReading = {
      deviceType: "blood-pressure",
      value: { systolic: 120, diastolic: 80 },
      unit: "mmHg",
      timestamp: "2026-08-15T10:00:00Z",
      patientRef: "Patient/synthetic-p-001",
    };

    const res = validateDeviceReading(validReading);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("flags a normalizer output missing a field fhir-observation-generator requires", () => {
    // Missing patientRef and invalid timestamp
    const incompleteReading = {
      deviceType: "heart-rate",
      value: 72,
      unit: "bpm",
      timestamp: "not-a-date",
    };

    const res = validateDeviceReading(incompleteReading);
    expect(res.valid).toBe(false);
    expect(res.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Missing required 'patientRef'"),
        expect.stringContaining("Invalid timestamp format"),
      ])
    );
  });

  it("flags invalid numeric values or missing systolic/diastolic in blood pressure", () => {
    const invalidBp = {
      deviceType: "blood-pressure",
      value: 120, // should be object
      unit: "mmHg",
      timestamp: "2026-08-15T10:00:00Z",
      patientRef: "Patient/p-1",
    };

    const res = validateDeviceReading(invalidBp);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("Blood pressure value must be an object");
  });
});

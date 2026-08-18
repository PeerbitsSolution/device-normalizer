import { describe, it, expect } from "vitest";
import {
  normalize,
  getSupportedFormats,
  getRegisteredAdapters,
  UnsupportedFormatError,
  NormalizationValidationError,
} from "../src/registry.js";
import { genericJsonAdapter } from "../src/adapters/generic-json.js";

describe("device-normalizer: format registry", () => {
  it("returns all supported format identifiers and descriptions", () => {
    const formats = getSupportedFormats();
    expect(formats).toContain("ble-gatt-blood-pressure");
    expect(formats).toContain("ble-gatt-thermometer");
    expect(formats).toContain("ble-gatt-pulse-oximeter");
    expect(formats).toContain("ble-gatt-weight-scale");
    expect(formats).toContain("ble-gatt-glucose");
    expect(formats).toContain("healthkit");
    expect(formats).toContain("generic-json");

    const adapters = getRegisteredAdapters();
    expect(adapters.length).toBe(formats.length);
  });

  it("dispatches to the correct adapter per declared format", () => {
    const rawGattHex = "00 78 00 50 00 5D 00";
    const res = normalize("ble-gatt-blood-pressure", { bytes: rawGattHex }) as any;

    expect(res.deviceType).toBe("blood-pressure");
    expect(res.value.systolic).toBe(120);
    expect(res.value.diastolic).toBe(80);
  });

  it("produces a clear typed error for an unknown format", () => {
    expect(() => normalize("fitbit-cloud-api", {})).toThrowError(UnsupportedFormatError);
  });

  it("generic JSON fallback parses flat vital structures", () => {
    const payload = {
      deviceType: "heart-rate",
      rawValue: 72,
      rawUnit: "bpm",
      patientRef: "Patient/p-123",
    };

    const res = normalize("generic-json", payload) as any;
    expect(res.deviceType).toBe("heart-rate");
    expect(res.value).toBe(72);
    expect(res.unit).toBe("bpm");
    expect(res.patientRef).toBe("Patient/p-123");
  });
});

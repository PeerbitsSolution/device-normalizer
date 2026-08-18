import { describe, it, expect } from "vitest";
import { healthKitAdapter } from "../src/adapters/healthkit.js";
import { HealthKitSamplePayload, DeviceReading } from "../src/types.js";
import * as fs from "node:fs";
import * as path from "node:path";

describe("device-normalizer: HealthKit adapter", () => {
  const validDir = path.resolve(__dirname, "../fixtures/valid");

  it("parses Blood Pressure correlation sample pair correctly", () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(validDir, "healthkit-sample.json"), "utf-8"));
    const reading = healthKitAdapter.normalize(fixture) as DeviceReading;

    expect(reading.deviceType).toBe("blood-pressure");
    expect(reading.value).toEqual({
      systolic: 118,
      diastolic: 78,
    });
    expect(reading.unit).toBe("mmHg");
    expect(reading.patientRef).toBe("Patient/synthetic-p-101");
    expect(reading.deviceId).toBe("Device/apple-watch-s9-001");
  });

  it("parses all 7 supported vital sample types correctly", () => {
    const samples: HealthKitSamplePayload[] = [
      {
        sampleType: "HKQuantityTypeIdentifierHeartRate",
        value: 72,
        unit: "count/min",
        startDate: "2026-08-15T10:00:00Z",
      },
      {
        sampleType: "HKQuantityTypeIdentifierBloodGlucose",
        value: 105,
        unit: "mg/dL",
        startDate: "2026-08-15T10:00:00Z",
      },
      {
        sampleType: "HKQuantityTypeIdentifierOxygenSaturation",
        value: 0.98, // decimal ratio
        unit: "%",
        startDate: "2026-08-15T10:00:00Z",
      },
      {
        sampleType: "HKQuantityTypeIdentifierBodyTemperature",
        value: 98.4,
        unit: "degF",
        startDate: "2026-08-15T10:00:00Z",
      },
      {
        sampleType: "HKQuantityTypeIdentifierBodyMass",
        value: 68.5,
        unit: "kg",
        startDate: "2026-08-15T10:00:00Z",
      },
      {
        sampleType: "HKQuantityTypeIdentifierRespiratoryRate",
        value: 16,
        unit: "count/min",
        startDate: "2026-08-15T10:00:00Z",
      },
    ];

    const results = healthKitAdapter.normalize(samples) as DeviceReading[];
    expect(results).toHaveLength(6);

    expect(results[0].deviceType).toBe("heart-rate");
    expect(results[0].value).toBe(72);
    expect(results[0].unit).toBe("bpm");

    expect(results[1].deviceType).toBe("glucose");
    expect(results[1].value).toBe(105);
    expect(results[1].unit).toBe("mg/dL");

    // SpO2 normalized from 0.98 ratio to 98%
    expect(results[2].deviceType).toBe("spo2");
    expect(results[2].value).toBe(98);
    expect(results[2].unit).toBe("%");

    expect(results[3].deviceType).toBe("temperature");
    expect(results[3].value).toBe(98.4);
    expect(results[3].unit).toBe("degF");

    expect(results[4].deviceType).toBe("weight");
    expect(results[4].value).toBe(68.5);
    expect(results[4].unit).toBe("kg");

    expect(results[5].deviceType).toBe("respiratory-rate");
    expect(results[5].value).toBe(16);
    expect(results[5].unit).toBe("/min");
  });

  it("throws error on unsupported HealthKit sample types", () => {
    const invalidSample = {
      sampleType: "HKQuantityTypeIdentifierStepCount",
      value: 5000,
    };
    expect(() => healthKitAdapter.normalize(invalidSample)).toThrow(/Unsupported HealthKit sample type/);
  });
});

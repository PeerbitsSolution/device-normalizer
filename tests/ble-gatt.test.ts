import { describe, it, expect } from "vitest";
import { bleBloodPressureAdapter } from "../src/adapters/ble-gatt/blood-pressure.js";
import { bleThermometerAdapter } from "../src/adapters/ble-gatt/thermometer.js";
import { blePulseOximeterAdapter } from "../src/adapters/ble-gatt/pulse-oximeter.js";
import { bleWeightScaleAdapter } from "../src/adapters/ble-gatt/weight-scale.js";
import { bleGlucoseAdapter } from "../src/adapters/ble-gatt/glucose.js";
import { parseSFloat16, parseFloat32 } from "../src/adapters/ble-gatt/sfloat.js";
import * as fs from "node:fs";
import * as path from "node:path";

describe("device-normalizer: BLE GATT adapters", () => {
  const validDir = path.resolve(__dirname, "../fixtures/valid");

  it("decodes Blood Pressure Profile (0x2A35) characteristic correctly", () => {
    const rawFixture = JSON.parse(fs.readFileSync(path.join(validDir, "ble-blood-pressure.json"), "utf-8"));
    const reading = bleBloodPressureAdapter.normalize(rawFixture);

    expect(reading.deviceType).toBe("blood-pressure");
    expect(reading.value).toEqual({
      systolic: 120,
      diastolic: 80,
    });
    expect(reading.unit).toBe("mmHg");
    expect(reading.metadata?.meanArterialPressure).toBe(93);
    expect(reading.patientRef).toBe("Patient/synthetic-p-101");
    expect(reading.deviceId).toBe("Device/ble-omron-bp-001");
  });

  it("decodes Blood Pressure with in-band kPa unit and pulse rate flags", () => {
    // Flags: 0x05 (bit 0 = 1 kPa, bit 2 = 1 Pulse Rate present)
    // Systolic: 16.0 kPa (mantissa 160, exponent -1 -> 0xF0A0)
    // Diastolic: 10.7 kPa (mantissa 107, exponent -1 -> 0xF06B)
    // MAP: 12.5 kPa (mantissa 125, exponent -1 -> 0xF07D)
    // Pulse Rate: 72 bpm (0x0048)
    const rawHex = "05 A0 F0 6B F0 7D F0 48 00";
    const reading = bleBloodPressureAdapter.normalize({ bytes: rawHex });

    expect(reading.deviceType).toBe("blood-pressure");
    expect(reading.unit).toBe("kPa");
    expect((reading.value as any).systolic).toBe(16);
    expect((reading.value as any).diastolic).toBe(10.7);
    expect(reading.metadata?.pulseRate).toBe(72);
  });

  it("decodes Health Thermometer Profile (0x2A1C) characteristic correctly", () => {
    const rawFixture = JSON.parse(fs.readFileSync(path.join(validDir, "ble-thermometer.json"), "utf-8"));
    const reading = bleThermometerAdapter.normalize(rawFixture);

    expect(reading.deviceType).toBe("temperature");
    expect(reading.value).toBe(37.0);
    expect(reading.unit).toBe("degC");
    expect(reading.patientRef).toBe("Patient/synthetic-p-101");
  });

  it("decodes Thermometer with Fahrenheit unit flag", () => {
    // Flags: 0x01 (bit 0 = 1 degF)
    // Temperature: 98.6 degF (986 * 10^-1 -> mantissa 986 = 0x0003DA, exponent -1 = 0xFF -> DA 03 00 FF)
    const rawHex = "01 DA 03 00 FF";
    const reading = bleThermometerAdapter.normalize(rawHex);

    expect(reading.deviceType).toBe("temperature");
    expect(reading.value).toBe(98.6);
    expect(reading.unit).toBe("degF");
  });

  it("decodes Pulse Oximeter Profile (0x2A5E/0x2A5F) characteristic correctly", () => {
    const rawFixture = JSON.parse(fs.readFileSync(path.join(validDir, "ble-pulse-oximeter.json"), "utf-8"));
    const reading = blePulseOximeterAdapter.normalize(rawFixture);

    expect(reading.deviceType).toBe("spo2");
    expect(reading.value).toBe(98);
    expect(reading.unit).toBe("%");
    expect(reading.metadata?.pulseRate).toBe(72);
    expect(reading.metadata?.pulseRateUnit).toBe("bpm");
  });

  it("decodes Weight Scale Profile (0x2A98) characteristic correctly", () => {
    const rawFixture = JSON.parse(fs.readFileSync(path.join(validDir, "ble-weight-scale.json"), "utf-8"));
    const reading = bleWeightScaleAdapter.normalize(rawFixture);

    expect(reading.deviceType).toBe("weight");
    expect(reading.value).toBe(75.0);
    expect(reading.unit).toBe("kg");
  });

  it("decodes Weight Scale with Imperial (lbs) unit flag", () => {
    // Flags: 0x01 (Imperial)
    // Weight raw UINT16: 16500 (resolution 0.01 lb -> 165.0 lbs) -> 16500 = 0x4074 -> 74 40
    const rawHex = "01 74 40";
    const reading = bleWeightScaleAdapter.normalize({ bytes: rawHex });

    expect(reading.deviceType).toBe("weight");
    expect(reading.value).toBe(165);
    expect(reading.unit).toBe("lbs");
  });

  it("decodes Glucose Profile (0x2A18) characteristic correctly", () => {
    const rawFixture = JSON.parse(fs.readFileSync(path.join(validDir, "ble-glucose.json"), "utf-8"));
    const reading = bleGlucoseAdapter.normalize(rawFixture);

    expect(reading.deviceType).toBe("glucose");
    expect(reading.value).toBe(95);
    expect(reading.unit).toBe("mg/dL");
    expect(reading.metadata?.sequenceNumber).toBe(1);
  });
});

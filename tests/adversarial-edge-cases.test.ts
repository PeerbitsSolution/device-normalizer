import { describe, it, expect } from "vitest";
import {
  normalize,
  parseSFloat16,
  parseFloat32,
  payloadToDataView,
  validateDeviceReading,
  DeviceReading,
  BloodPressureValue,
} from "../src/index.js";

describe("device-normalizer: adversarial edge cases & stress tests", () => {
  describe("1. Poisoned, Corrupt & Truncated Payloads", () => {
    it("safely rejects non-object / non-byte payloads", () => {
      expect(() => normalize("ble-gatt-blood-pressure", null)).toThrow(/Invalid payload/);
      expect(() => normalize("ble-gatt-blood-pressure", undefined)).toThrow(/Invalid payload/);
      expect(() => normalize("ble-gatt-blood-pressure", 12345)).toThrow(/Invalid payload/);
      expect(() => normalize("healthkit", "not-json")).toThrow();
      expect(() => normalize("generic-json", "not-json")).toThrow();
    });

    it("rejects odd-length hex strings and non-hex characters", () => {
      expect(() => payloadToDataView("00 78 0")).toThrow(/Invalid hex string/);
      expect(() => payloadToDataView("00 78 00 50 00 ZZ")).toThrow(/Invalid hex string/);
    });

    it("rejects truncated payloads for every BLE GATT profile gracefully", () => {
      // Blood Pressure requires min 7 bytes
      expect(() => normalize("ble-gatt-blood-pressure", { bytes: "00 78 00" })).toThrow(/minimum 7 bytes required/);

      // Thermometer requires min 5 bytes
      expect(() => normalize("ble-gatt-thermometer", { bytes: "00 72 01" })).toThrow(/minimum 5 bytes required/);

      // Pulse Oximeter requires min 5 bytes
      expect(() => normalize("ble-gatt-pulse-oximeter", { bytes: "00 62" })).toThrow(/minimum 5 bytes required/);

      // Weight Scale requires min 3 bytes
      expect(() => normalize("ble-gatt-weight-scale", { bytes: "00 98" })).toThrow(/minimum 3 bytes required/);

      // Glucose requires min 10 bytes
      expect(() => normalize("ble-gatt-glucose", { bytes: "00 01 00 EA 07" })).toThrow(/minimum 10 bytes required/);
    });
  });

  describe("2. IEEE-11073 SFLOAT & FLOAT32 Extreme Math", () => {
    it("handles IEEE-11073 16-bit SFLOAT special values (+Infinity, -Infinity, NaN, NRes)", () => {
      // 0x07FE: +Infinity -> little-endian FE 07
      const viewPosInf = payloadToDataView("FE 07");
      expect(parseSFloat16(viewPosInf, 0)).toBe(Number.POSITIVE_INFINITY);

      // 0x07FF: NaN -> little-endian FF 07
      const viewNaN = payloadToDataView("FF 07");
      expect(isNaN(parseSFloat16(viewNaN, 0))).toBe(true);

      // 0x0800: NRes (Not at this resolution) -> little-endian 00 08
      const viewNRes = payloadToDataView("00 08");
      expect(isNaN(parseSFloat16(viewNRes, 0))).toBe(true);

      // 0x0802: -Infinity -> little-endian 02 08
      const viewNegInf = payloadToDataView("02 08");
      expect(parseSFloat16(viewNegInf, 0)).toBe(Number.NEGATIVE_INFINITY);
    });

    it("handles negative exponents and negative mantissas in SFLOAT", () => {
      // Value: -50 with exponent 0 -> mantissa -50 = 0x0FCE, exp 0 -> 0x0FCE -> CE 0F
      const viewNegVal = payloadToDataView("CE 0F");
      expect(parseSFloat16(viewNegVal, 0)).toBe(-50);

      // Value: 12.5 (125 * 10^-1) -> mantissa 125 = 0x007D, exp -1 (0xF) -> 0xF07D -> 7D F0
      const viewDecVal = payloadToDataView("7D F0");
      expect(parseSFloat16(viewDecVal, 0)).toBe(12.5);
    });

    it("handles FLOAT32 positive, negative, and decimal numbers", () => {
      // Value: 36.6 degC (366 * 10^-1) -> mantissa 366 (0x00016E), exp -1 (0xFF) -> 6E 01 00 FF
      const viewFloat = payloadToDataView("6E 01 00 FF");
      expect(parseFloat32(viewFloat, 0)).toBe(36.6);
    });
  });

  describe("3. BLE GATT Full Bitmask & Optional Field Permutations", () => {
    it("decodes Blood Pressure with ALL optional flags enabled (19-byte full payload)", () => {
      // Flags: 0x1F (bit 0 = 1 kPa, bit 1 = 1 timestamp, bit 2 = 1 pulse, bit 3 = 1 userId, bit 4 = 1 status)
      // Systolic: 16.0 kPa (0xF0A0)
      // Diastolic: 10.7 kPa (0xF06B)
      // MAP: 12.5 kPa (0xF07D)
      // Timestamp: 2026-08-15 14:30:00 (EA 07 08 0F 0E 1E 00)
      // Pulse Rate: 75 bpm (0x004B)
      // User ID: 42 (0x2A)
      // Status: 0x0001
      const fullHex = "1F A0 F0 6B F0 7D F0 EA 07 08 0F 0E 1E 00 4B 00 2A 01 00";
      const reading = normalize("ble-gatt-blood-pressure", { bytes: fullHex }) as DeviceReading;
      const value = reading.value as BloodPressureValue;
      const metadata = reading.metadata as Record<string, number>;

      expect(reading.deviceType).toBe("blood-pressure");
      expect(reading.unit).toBe("kPa");
      expect(value.systolic).toBe(16);
      expect(value.diastolic).toBe(10.7);
      expect(metadata.meanArterialPressure).toBe(12.5);
      expect(metadata.pulseRate).toBe(75);
      expect(metadata.userId).toBe(42);
      expect(metadata.measurementStatus).toBe(1);
      expect(reading.timestamp).toBe("2026-08-15T14:30:00.000Z");
    });

    it("decodes Thermometer with all 9 temperature types", () => {
      const typeNames = ["Armpit", "Body", "Ear", "Finger", "Gastro-intestinal", "Mouth", "Rectum", "Toe", "Tympanum"];
      for (let t = 1; t <= 9; t++) {
        // Flags: 0x04 (bit 2 = temperature type present)
        // Temp: 37.0 degC (72 01 00 FF)
        // Type: t
        const hex = `04 72 01 00 FF 0${t}`;
        const reading = normalize("ble-gatt-thermometer", { bytes: hex }) as DeviceReading;
        expect(reading.deviceType).toBe("temperature");
        expect((reading.metadata as Record<string, string>).temperatureType).toBe(typeNames[t - 1]);
      }
    });

    it("decodes Glucose with negative time offset and mol/L unit flag", () => {
      // Flags: 0x03 (bit 0 = 1 time offset present, bit 1 = 1 mol/L)
      // Seq: 5 (05 00)
      // Base Time: 2026-08-15 10:00:00 (EA 07 08 0F 0A 00 00)
      // Time Offset: -30 minutes (INT16: -30 = 0xFFE2 -> E2 FF)
      // Concentration: 0.0055 mol/L -> 5.5 mmol/L (0xF037 -> 37 F0)
      const hex = "03 05 00 EA 07 08 0F 0A 00 00 E2 FF 37 F0";
      const reading = normalize("ble-gatt-glucose", { bytes: hex }) as DeviceReading;

      expect(reading.deviceType).toBe("glucose");
      expect(reading.unit).toBe("mmol/L");
      expect(reading.value).toBe(5.5);
      // Adjusted timestamp from 10:00 minus 30 mins -> 09:30
      expect(reading.timestamp).toBe("2026-08-15T09:30:00.000Z");
    });
  });

  describe("4. HealthKit Advanced Edge Cases", () => {
    it("handles decimal ratio SpO2 (0.975 -> 97.5%) and alternative units", () => {
      const sample = {
        sampleType: "HKQuantityTypeIdentifierOxygenSaturation",
        value: 0.975,
        unit: "%",
        startDate: "2026-08-15T12:00:00Z",
      };
      const res = normalize("healthkit", sample) as DeviceReading;
      expect(res.deviceType).toBe("spo2");
      expect(res.value).toBe(97.5);
      expect(res.unit).toBe("%");
    });

    it("rejects HealthKit Blood Pressure correlation missing diastolic component", () => {
      const incompleteCorrelation = {
        correlationType: "HKCorrelationTypeIdentifierBloodPressure",
        objects: [
          { sampleType: "HKQuantityTypeIdentifierBloodPressureSystolic", value: 120 },
        ],
      };
      expect(() => normalize("healthkit", incompleteCorrelation)).toThrow(/requires both systolic and diastolic/);
    });
  });

  describe("5. Generic JSON Edge Cases", () => {
    it("parses string-formatted compound blood pressure '125/85'", () => {
      const payload = {
        deviceType: "blood-pressure",
        rawValue: "125/85",
        rawUnit: "mmHg",
      };
      const res = normalize("generic-json", payload) as DeviceReading;
      expect(res.deviceType).toBe("blood-pressure");
      expect(res.value).toEqual({ systolic: 125, diastolic: 85 });
    });

    it("rejects generic JSON missing deviceType or with bad numeric values", () => {
      expect(() => normalize("generic-json", { value: 123 })).toThrow(/missing required 'deviceType'/);
      expect(() => normalize("generic-json", { deviceType: "heart-rate", rawValue: "invalid-number" })).toThrow(/Invalid numeric value/);
    });
  });

  describe("6. Structural Validator Edge Cases", () => {
    it("flags missing fields, suspicious systolic <= diastolic, and corrupt dates", () => {
      const badBp = {
        deviceType: "blood-pressure",
        value: { systolic: 70, diastolic: 120 }, // inverted
        unit: "mmHg",
        timestamp: "2026-08-15T10:00:00Z",
        patientRef: "Patient/p-1",
      };
      const res1 = validateDeviceReading(badBp);
      expect(res1.valid).toBe(false);
      expect(res1.errors[0]).toContain("Suspicious blood pressure values");

      const badDate = {
        deviceType: "heart-rate",
        value: 75,
        unit: "bpm",
        timestamp: "invalid-iso-date",
        patientRef: "Patient/p-1",
      };
      const res2 = validateDeviceReading(badDate);
      expect(res2.valid).toBe(false);
      expect(res2.errors[0]).toContain("Invalid timestamp format");
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  DeviceNormalizerError,
  DeviceReading,
  detectFormat,
  normalizeScalarUnit,
  process,
} from "../src/index.js";

describe("device-normalizer v2", () => {
  it("detects and decodes a BLE Heart Rate characteristic", () => {
    const reading = process({
      characteristicUuid: "0x2A37",
      bytes: [0x00, 72],
      timestamp: "2026-08-15T10:00:00+05:30",
    }) as DeviceReading;

    expect(reading.deviceType).toBe("heart-rate");
    expect(reading.value).toBe(72);
    expect(reading.unit).toBe("/min");
    expect(reading.timestamp).toBe("2026-08-15T04:30:00.000Z");
    expect(reading.patientRef).toBeUndefined();
    expect(reading.source.provider).toBe("bluetooth-sig");
  });

  it("decodes Bluetooth SIG CGM records using the session start time", () => {
    const readings = process({
      characteristicUuid: "0x2AA7", bytes: "08 01 64 00 05 00 0C F0",
      sessionStartTime: "2026-08-15T10:00:00Z", e2eCrcSupported: false,
    }) as DeviceReading[];
    expect(readings).toHaveLength(1);
    expect(readings[0].timestamp).toBe("2026-08-15T10:05:00.000Z");
    expect(readings[0].value).toEqual({ glucose: 100, rateOfChange: 1.2 });
  });

  it("detects and normalizes a Health Connect record", () => {
    const reading = process({
      recordType: "WeightRecord",
      value: 165,
      unit: "lb",
      time: "2026-08-15T10:00:00Z",
    }) as DeviceReading;

    expect(reading.value).toBe(74.8427);
    expect(reading.unit).toBe("kg");
    expect(reading.source.provider).toBe("google-health-connect");
  });

  it("detects documented generic JSON", () => {
    expect(detectFormat({ deviceType: "heart-rate", value: 72 }).format).toBe("generic-json");
  });

  it("detects and normalizes a Junction timeseries webhook", () => {
    const readings = process({
      event_type: "daily.data.heartrate.created",
      user_id: "junction-user",
      client_user_id: "app-patient-1",
      data: {
        source: { provider: "oura", type: "ring", device_id: "device-1" },
        data: [{ timestamp: "2026-08-15T10:00:00Z", timezone_offset: 19800, unit: "bpm", value: 70 }],
      },
    }) as DeviceReading[];

    expect(readings).toHaveLength(1);
    expect(readings[0].value).toBe(70);
    expect(readings[0].patientRef).toBe("app-patient-1");
    expect(readings[0].timezoneOffsetMinutes).toBe(330);
    expect(readings[0].source.provider).toBe("oura");
    expect(readings[0].source.format).toBe("junction");
  });

  it("detects and normalizes a Tenovi blood-pressure webhook", () => {
    const reading = process({
      metric: "blood_pressure",
      device_name: "Tenovi BPM - Wide Range",
      hwi_device_id: "device-1",
      patient_id: "patient-1",
      value_1: "120.00",
      value_2: "80.00",
      timestamp: "2021-01-15T12:14:49.000000Z",
      timezone_offset: -7,
      estimated_timestamp: false,
    }) as DeviceReading;
    expect(reading.deviceType).toBe("blood-pressure");
    expect(reading.metrics.systolic).toEqual({ value: 120, unit: "mm[Hg]" });
    expect(reading.metrics.diastolic).toEqual({ value: 80, unit: "mm[Hg]" });
    expect(reading.source.provider).toBe("tenovi");
  });

  it("detects and normalizes a Validic blood-pressure measurement", () => {
    const readings = process({
      type: "measurement",
      start_time: "2017-09-26T15:48:04Z",
      utc_offset: -18000,
      source: { type: "nokia", device: null },
      user: { uid: "patient-1" },
      metrics: [
        { type: "diastolic", unit: "mmHg", value: 80 },
        { type: "systolic", unit: "mmHg", value: 134 },
        { type: "pulse", unit: "bpm", value: 78 },
      ],
    }) as DeviceReading[];
    expect(readings).toHaveLength(1);
    expect(readings[0].metrics.pulse).toEqual({ value: 78, unit: "/min" });
    expect(readings[0].source.provider).toBe("nokia");
  });

  it("detects and normalizes a Withings Getmeas response", () => {
    const readings = process({
      status: 0,
      body: {
        measuregrps: [{
          date: 1712722953,
          deviceid: 14546187,
          model: "Body Comp Pro",
          measures: [{ value: 75232, type: 1, unit: -3 }],
        }],
      },
    }) as DeviceReading[];
    expect(readings).toHaveLength(1);
    expect(readings[0].deviceType).toBe("weight");
    expect(readings[0].metrics.weight).toEqual({ value: 75.232, unit: "kg" });
    expect(readings[0].source.provider).toBe("withings");
  });

  it("detects and normalizes an iHealth blood-pressure webhook", () => {
    const reading = process({
      CollectionType: "bp", CollectionUnit: 0, UserID: "patient-1",
      Data: { DataId: "device-reading-1", Systolic: 120, Diastolic: 80, HeartRate: 72, MeasureTime: "2026-08-15 10:00:00", TimeZone: "+0530", DataSource: "FromDevice" },
    }) as DeviceReading;
    expect(reading.deviceType).toBe("blood-pressure");
    expect(reading.timestamp).toBe("2026-08-15T04:30:00.000Z");
    expect(reading.metrics.pulse).toEqual({ value: 72, unit: "/min" });
    expect(reading.source.provider).toBe("ihealth");
  });

  it("detects and normalizes documented Dexcom EGV data", () => {
    const readings = process({
      unit: "mg/dL", rateUnit: "mg/dL/min", userId: "patient-1",
      egvs: [{ recordId: "egv-1", systemTime: "2026-08-15T04:30:00", value: 172, status: "high", trend: "fortyFiveUp", trendRate: 1.2, transmitterId: "TX-1" }],
    }) as DeviceReading[];
    expect(readings[0].deviceType).toBe("continuous-glucose");
    expect(readings[0].timestamp).toBe("2026-08-15T04:30:00.000Z");
    expect(readings[0].metrics.glucose).toEqual({ value: 172, unit: "mg/dL" });
    expect(readings[0].source.provider).toBe("dexcom");
  });

  it("returns a typed error for an unknown source", () => {
    expect.assertions(2);
    try {
      process({ unknown: true });
    } catch (error) {
      expect(error).toBeInstanceOf(DeviceNormalizerError);
      expect((error as DeviceNormalizerError).code).toBe("unrecognized_source");
    }
  });

  it("does not invent a missing timestamp", () => {
    expect(() => process({
      deviceType: "heart-rate",
      value: 72,
      unit: "bpm",
    })).toThrowError(expect.objectContaining({ code: "missing_timestamp" }));
  });

  it("does not guess the timezone of an embedded BLE Date-Time", () => {
    expect(() => process({
      characteristicUuid: "0x2A35",
      bytes: "02 78 00 50 00 5D 00 EA 07 08 0F 0E 1E 00",
    })).toThrowError(expect.objectContaining({ code: "invalid_payload" }));
  });

  it("normalizes common units into canonical units", () => {
    expect(normalizeScalarUnit("temperature", 98.6, "degF")).toEqual({ value: 37, unit: "Cel" });
    expect(normalizeScalarUnit("glucose", 5.5, "mmol/L")).toEqual({ value: 99.1, unit: "mg/dL" });
    expect(normalizeScalarUnit("spo2", 0.98, "1")).toEqual({ value: 98, unit: "%" });
  });

  it("normalizes a generic sleep session with strict metric units", () => {
    const reading = process({
      deviceType: "sleep", value: { totalDuration: 420, deepSleep: 80 }, unit: "min", timestamp: "2026-08-15T06:00:00Z",
      metrics: { totalSleep: { value: 420, unit: "min" }, deepSleep: { value: 80, unit: "min" } },
      source: { provider: "oura", transmissionType: "cloud-webhook" },
    }) as DeviceReading;
    expect(reading.metrics.totalSleep).toEqual({ value: 420, unit: "min" });
    expect(reading.source.provider).toBe("oura");
  });
});

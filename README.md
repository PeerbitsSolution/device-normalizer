# @peerbits/device-normalizer

> Normalizes raw device/health-platform payloads (Bluetooth GATT health profiles, Apple HealthKit, generic JSON) into canonical vital readings for `fhir-observation-generator`.

**Category:** RPM — Device & Observation Utilities · **License:** Apache-2.0 · **Status:** Stable

[![CI](https://github.com/PeerbitsSolution/device-normalizer/actions/workflows/ci.yml/badge.svg)](https://github.com/PeerbitsSolution/device-normalizer/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@peerbits/device-normalizer.svg)](https://www.npmjs.com/package/@peerbits/device-normalizer)

---

## 1. What problem does this solve?

Remote Patient Monitoring (RPM) applications receive vital signs in disparate formats: raw Bluetooth SIG GATT byte arrays from medical peripherals, exported Apple HealthKit sample JSONs, or ad-hoc sensor JSON payloads. Transforming these diverse sources into a standard representation requires error-prone bit-shifting, IEEE-11073 SFLOAT parsing, unit standardizations, and validation.

`@peerbits/device-normalizer` decodes and standardizes pre-retrieved payloads from publicly documented standards into canonical `DeviceReading` structures that seamlessly feed [`@peerbits/fhir-observation-generator`](https://github.com/PeerbitsSolution/fhir-observation-generator) to produce compliant FHIR R4 Observations.

> **Scope note:** Normalizes already-decoded payloads from publicly documented standards only (Bluetooth SIG GATT health profiles, Apple HealthKit's public schema, generic JSON). See [Supported Formats](./docs/SUPPORTED_FORMATS.md) for full details.

---

## 2. Features

- **Bluetooth SIG GATT Profile Decoders**: Full IEEE-11073 16-bit SFLOAT & 32-bit FLOAT decoders for:
  - **Blood Pressure Profile** (`0x2A35`): Systolic, Diastolic, MAP, in-band unit flag (mmHg/kPa), pulse rate, user ID, status.
  - **Health Thermometer Profile** (`0x2A1C`): Celsius & Fahrenheit flag, 7-byte timestamp, temperature type site.
  - **Pulse Oximeter Profile** (`0x2A5E` / `0x2A5F`): SpO2 (%) and Pulse Rate (bpm).
  - **Weight Scale Profile** (`0x2A98`): SI (kg) / Imperial (lbs) resolutions, BMI, height.
  - **Glucose Profile** (`0x2A18`): Sequence number, timestamp offset, mg/dL & mmol/L units, sample type/location.
- **Apple HealthKit Normalizer**: Parses 7 vital sample types plus paired Blood Pressure correlation records.
- **Generic JSON Fallback**: Standardizes flat JSON vital readings.
- **Structural Self-Check**: Verifies normalized readings strictly satisfy `@peerbits/fhir-observation-generator` schema requirements before pipeline handoff.
- **Zero Runtime Dependencies**: Pure TypeScript with no external network or BLE stack requirements.

---

## 3. Installation

```bash
npm install @peerbits/device-normalizer
```

---

## 4. Quick Start

```ts
import { normalize } from "@peerbits/device-normalizer";

// 1. Raw Bluetooth SIG GATT characteristic bytes (0x2A35 Blood Pressure)
const gattPayload = {
  bytes: "00 78 00 50 00 5D 00", // 120/80 mmHg with MAP 93 mmHg
  patientRef: "Patient/p-12345",
  deviceId: "Device/omron-evolv-001",
};

const reading = normalize("ble-gatt-blood-pressure", gattPayload);

console.log(reading);
// {
//   deviceType: "blood-pressure",
//   value: { systolic: 120, diastolic: 80 },
//   unit: "mmHg",
//   timestamp: "2026-08-17T12:00:00.000Z",
//   patientRef: "Patient/p-12345",
//   deviceId: "Device/omron-evolv-001",
//   metadata: { bleProfile: "0x2A35", meanArterialPressure: 93 }
// }
```

---

## 5. End-to-End Pipeline

```
[ Medical BLE Device / HealthKit ]
                 │
                 ▼ (Pre-retrieved raw payload)
    ┌──────────────────────────┐
    │ @peerbits/device-normalizer │ ──> Canonical DeviceReading
    └──────────────────────────┘
                 │
                 ▼
 ┌───────────────────────────────────────┐
 │ @peerbits/fhir-observation-generator │ ──> Valid FHIR R4 Observation Resource
 └───────────────────────────────────────┘
```

---

## 6. Architecture

```
src/
├── adapters/
│   ├── ble-gatt/
│   │   ├── sfloat.ts          # IEEE-11073 16-bit SFLOAT & 32-bit FLOAT decoding
│   │   ├── blood-pressure.ts  # 0x2A35 Blood Pressure Profile
│   │   ├── thermometer.ts     # 0x2A1C Health Thermometer Profile
│   │   ├── pulse-oximeter.ts  # 0x2A5E/0x2A5F Pulse Oximeter Profile
│   │   ├── weight-scale.ts    # 0x2A98 Weight Scale Profile
│   │   └── glucose.ts         # 0x2A18 Glucose Measurement Profile
│   ├── healthkit.ts           # Apple HealthKit 7 sample types + BP correlation
│   └── generic-json.ts        # Universal flat JSON fallback
├── registry.ts                # Adapter registry and dispatcher
├── validate.ts                # Structural self-check for fhir-observation-generator
├── types.ts                   # Core TypeScript types (DeviceReading local copy)
└── index.ts                   # Library entry point
```

---

## 7. Examples

See [`/docs/examples`](./docs/examples) for:
- [BLE GATT to FHIR Observation Pipeline](./docs/examples/ble-to-observation)
- [Apple HealthKit to FHIR Observation Pipeline](./docs/examples/healthkit-to-observation)

---

## 8. Roadmap

- [x] 5 Core Bluetooth SIG GATT Health Profiles
- [x] Apple HealthKit 7 vital sample types & BP correlation
- [x] Generic JSON fallback adapter
- [x] Structural self-check validator
- [ ] Additional publicly documented GATT profiles (Continuous Glucose CGM 0x2AA7)

---

## 9. Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 10. License

Apache License 2.0 — see [LICENSE](./LICENSE).

---

## 11. About Peerbits

`device-normalizer` is part of the [Peerbits HealthTech Open Source](https://github.com/PeerbitsSolution) initiative — reusable engineering components extracted from our healthcare technology work. This repository contains generalized, reusable logic only; it is not tied to any specific client engagement or commercial product.

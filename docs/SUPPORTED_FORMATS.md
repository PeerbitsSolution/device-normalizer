# Supported Formats

**Specification of supported and explicitly unsupported device payloads in `@peerbits/device-normalizer`.**
This boundary ensures the library remains strictly grounded in publicly documented standards.

---

## 1. Supported Formats (Publicly Documented Standards Only)

### Bluetooth SIG GATT Health Device Profiles
All GATT decoders accept pre-decoded characteristic value byte arrays, `Uint8Array` buffers, or hex strings.

| Profile Name | Characteristic UUID | Supported Features & Flags |
| :--- | :--- | :--- |
| **Blood Pressure Profile** | `0x2A35` (Blood Pressure Measurement) | Compound Systolic, Diastolic, Mean Arterial Pressure (MAP); In-band unit flag (mmHg / kPa); 7-byte Date-Time; Pulse Rate; User ID; Measurement Status. |
| **Health Thermometer Profile** | `0x2A1C` (Temperature Measurement) | IEEE-11073 32-bit FLOAT decoding; In-band unit flag (Celsius / Fahrenheit); 7-byte Date-Time; Temperature Type (Armpit, Body, Ear, Finger, Mouth, Rectum, Toe, Tympanum). |
| **Pulse Oximeter Profile** | `0x2A5E` (Spot-Check) / `0x2A5F` (Continuous) | IEEE-11073 16-bit SFLOAT SpO2 (%) and Pulse Rate (bpm); 7-byte Date-Time. |
| **Weight Scale Profile** | `0x2A98` (Weight Measurement) | UINT16 Weight with 0.005 kg (SI) or 0.01 lb (Imperial) resolution; 7-byte Date-Time; User ID; BMI and Height. |
| **Glucose Profile** | `0x2A18` (Glucose Measurement) | Sequence Number; Base Date-Time; Time Offset (minutes); SFLOAT Concentration in mg/dL (kg/L) or mmol/L (mol/L); Sample Type & Location; Sensor Status. |
| **Heart Rate Profile** | `0x2A37` (Heart Rate Measurement) | UINT8/UINT16 heart rate, energy-expended field, and RR intervals. |
| **Continuous Glucose Monitoring** | `0x2AA7` (CGM Measurement) | Multiple records, session-relative time, glucose, trend, quality, status annunciation, and optional E2E CRC validation. Requires session start and CGM feature context. |

### Platform and aggregator payloads

- Apple HealthKit documented sample identifiers.
- Google Health Connect core vital record exports.
- Junction/Vital documented timeseries webhook events.
- Tenovi HWI measurement webhooks.
- Validic stream measurement events.
- Withings `getmeas` responses (after the app follows its notification callback).
- iHealth Cloud blood-pressure webhooks.
- Dexcom EGV API responses.

### Apple HealthKit Public Schema
Parses HealthKit JSON sample exports across 7 core vital types:
1. `HKQuantityTypeIdentifierHeartRate` -> `heart-rate` (bpm)
2. `HKCorrelationTypeIdentifierBloodPressure` / `HKQuantityTypeIdentifierBloodPressure` -> `blood-pressure` ({ systolic, diastolic } in mmHg)
3. `HKQuantityTypeIdentifierBloodGlucose` -> `glucose` (mg/dL or mmol/L)
4. `HKQuantityTypeIdentifierOxygenSaturation` -> `spo2` (%)
5. `HKQuantityTypeIdentifierBodyTemperature` -> `temperature` (degC or degF)
6. `HKQuantityTypeIdentifierBodyMass` -> `weight` (kg or lbs)
7. `HKQuantityTypeIdentifierRespiratoryRate` -> `respiratory-rate` (/min or bpm)

### Generic JSON Fallback
For custom devices or pre-normalized backend payloads, accepts a flat JSON structure:
`{ deviceType, value | rawValue, unit | rawUnit, timestamp, patientRef, deviceId, metadata }`.

---

## 2. Explicitly NOT Supported

To maintain safety, privacy, and zero vendor lock-in, the following are strictly out of scope:
- **Bluetooth Radio Communication**: Scanning, pairing, connecting, RSSI filtering, or reading GATT characteristics over the air.
- **Vendor Cloud API Authentication**: OAuth login flows, cloud credential management, or HTTP polling against vendor clouds. Adapters only normalize the payload after the host app retrieves it.
- **Undocumented / Reverse-Engineered Vendor Protocols**: If a protocol is not an open standard or publicly documented API specification, it is not supported.
- **Real-Time BLE Streaming Stacks**: Batch/one-shot payload decoding only.
- **Vendor Payload Guessing**: Direct OEM adapters require official schemas and sanitized fixtures before they are accepted.
- **Direct Omron or Abbott/LibreView cloud ingestion**: no public payload contract has been verified. Use their BLE standard profiles, a supported aggregator, FHIR, or partner-provided schemas.

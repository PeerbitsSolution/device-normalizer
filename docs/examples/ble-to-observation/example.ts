import { normalize } from "../../../src/index.js";

// Step 1: Raw Bluetooth SIG GATT characteristic bytes for Blood Pressure (0x2A35)
// 120/80 mmHg with MAP 93 mmHg
const rawGattPayload = {
  bytes: "00 78 00 50 00 5D 00",
  patientRef: "Patient/p-98765",
  deviceId: "Device/omron-evolv-001",
};

// Step 2: Normalize into canonical DeviceReading
const reading = normalize("ble-gatt-blood-pressure", rawGattPayload);

console.log("Canonical DeviceReading:", JSON.stringify(reading, null, 2));
// Hand off directly to fhir-observation-generator to produce FHIR Observation!

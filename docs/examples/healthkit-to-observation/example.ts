import { normalize } from "../../../src/index.js";

// Apple HealthKit sample export for Blood Pressure correlation
const hkSample = {
  correlationType: "HKCorrelationTypeIdentifierBloodPressure",
  startDate: "2026-08-15T08:30:00.000Z",
  patientRef: "Patient/p-98765",
  objects: [
    {
      sampleType: "HKQuantityTypeIdentifierBloodPressureSystolic",
      value: 122,
      unit: "mmHg",
    },
    {
      sampleType: "HKQuantityTypeIdentifierBloodPressureDiastolic",
      value: 82,
      unit: "mmHg",
    },
  ],
};

const reading = normalize("healthkit", hkSample);
console.log("Normalized Reading:", JSON.stringify(reading, null, 2));

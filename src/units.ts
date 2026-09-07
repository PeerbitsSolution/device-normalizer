import { DeviceNormalizerError } from "./errors.js";
import { DeviceType } from "./types.js";

const round = (value: number, precision = 4): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

export function normalizeScalarUnit(deviceType: DeviceType, value: number, unit: string): { value: number; unit: string } {
  const key = unit.trim().toLowerCase().replace(/\s/g, "");
  if (!Number.isFinite(value)) throw new DeviceNormalizerError("invalid_payload", "Measurement value must be finite.");

  switch (deviceType) {
    case "heart-rate":
    case "respiratory-rate":
      if (["bpm", "/min", "count/min", "beats/min"].includes(key)) return { value, unit: "/min" };
      break;
    case "heart-rate-variability":
      if (["ms", "millisecond", "milliseconds"].includes(key)) return { value, unit: "ms" };
      break;
    case "spo2":
    case "perfusion-index":
      if (["%", "percent"].includes(key)) return { value: value > 0 && value <= 1 ? round(value * 100) : value, unit: "%" };
      if (["1", "ratio"].includes(key)) return { value: round(value * 100), unit: "%" };
      break;
    case "weight":
      if (["kg", "kilogram", "kilograms"].includes(key)) return { value, unit: "kg" };
      if (["lb", "lbs", "pound", "pounds", "[lb_av]"].includes(key)) return { value: round(value * 0.45359237), unit: "kg" };
      break;
    case "temperature":
      if (["cel", "degc", "c", "°c", "celsius"].includes(key)) return { value, unit: "Cel" };
      if (["[degf]", "degf", "f", "°f", "fahrenheit"].includes(key)) return { value: round((value - 32) * 5 / 9), unit: "Cel" };
      break;
    case "glucose":
      if (["mg/dl", "mgdl"].includes(key)) return { value, unit: "mg/dL" };
      if (["mmol/l", "mmoll"].includes(key)) return { value: round(value * 18.0182, 2), unit: "mg/dL" };
      break;
    default:
      if (unit.trim()) return { value, unit: unit.trim() };
  }

  throw new DeviceNormalizerError("invalid_payload", `Unsupported unit "${unit}" for ${deviceType}.`);
}

export function normalizeBloodPressure(value: number, unit: string): number {
  const key = unit.trim().toLowerCase();
  if (key === "mmhg" || key === "mm[hg]") return value;
  if (key === "kpa") return round(value * 7.50061683, 2);
  throw new DeviceNormalizerError("invalid_payload", `Unsupported blood-pressure unit "${unit}".`);
}

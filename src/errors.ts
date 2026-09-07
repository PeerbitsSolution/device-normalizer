export type NormalizerErrorCode = "unrecognized_source" | "ambiguous_source" |
  "invalid_payload" | "unsupported_format" | "missing_timestamp" |
  "unsupported_measurement" | "normalization_failed";

export class DeviceNormalizerError extends Error {
  constructor(
    public readonly code: NormalizerErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "DeviceNormalizerError";
  }
}

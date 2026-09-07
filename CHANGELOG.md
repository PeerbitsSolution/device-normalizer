# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0] - 2026-09-07
### Added
- Automatic `process(payload)` source detection with typed unknown/ambiguous-source errors.
- Bluetooth SIG Heart Rate Measurement (`0x2A37`) decoding.
- Bluetooth SIG Continuous Glucose Measurement (`0x2AA7`) decoding with feature-aware CRC validation.
- Google Health Connect core record support.
- Junction/Vital timeseries webhook support.
- Tenovi, Validic, Withings, iHealth blood-pressure, and Dexcom EGV adapters.
- Source provenance, schema versioning, timezone offsets, and canonical units.

### Changed
- Require a real source timestamp or explicit transport receipt time.
- Patient references are optional instead of being fabricated as `Patient/unknown`.
- Canonicalize weight, temperature, glucose, rate, blood-pressure, and SpO2 units.
- Require Node.js 20 or newer and update Vitest to a vulnerability-free release.

### Removed
- Silent fallback to current time, zero measurement values, and fake patient IDs.

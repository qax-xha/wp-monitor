# Changelog

All notable changes are documented in this file, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
with version numbers adhering to [Semantic Versioning](https://semver.org/).

## [0.7.3] - 2026-05-19

### Added

- Add file-based reading mode for MISS logs with increased file reading channels for better performance in large-file log replay scenarios.

### Changed

- Compact frontend layout with reduced spacing for higher information density.
- Align parse layer node list horizontally, fixing visual misalignment with side panels.

### Fixed

- Remove chart title and update tooltip style for rate trend chart.
- Update chart tooltip border style.
- Fix TypeScript compilation warnings (unused variables, JSX tag mismatch causing build failure).

## [0.7.2] - 2026-05-15

### Added

- Add `filters` parameter to `/layers/metrics` endpoint for filtering parse-layer metrics by package/rule combinations.
- Add `filterLogsByMode` frontend helper to unify log filtering logic for "withData/noData" modes.
- Add `resolveTimeRange` frontend helper to eliminate duplicated time range validation code.

### Changed

- Change `/layers/metrics` from GET to POST with JSON body for parameter passing.
- Refactor `fetchMetrics`, `fetchPackagesTimeSeries`, `fetchParseTimeSeries` to use structured filters instead of raw node_ids.
- Switch parse filter criteria from `log_count` to `log_rate_eps` for consistent metric semantics.
- Consolidate regex escaping to `escape_regex_chars`, remove duplicate `escape_promql_regex`.
- Replace inline regex escaping in `get_parse_timeseries` with `escape_regex_chars` calls.

### Fixed

- Fix filter loop overwrite bug in `fetch_snapshot_data` where only the last filter was applied.
- Fix cache zero-fill oscillation in frontend "noData" mode when filters are active.

### Removed

- Remove `zeroSeriesForSilent` frontend workaround (no longer needed with proper backend filtering).
- Remove duplicate `escape_promql_regex` method in favor of `escape_regex_chars`.

## [0.7.1] - 2026-05-12

### Changed

- Refactor error handling for unified error response format and propagation.
- Bump version to 0.7.2.

## [0.7.0] - 2026-05-11

### Added

- Add Helm chart packaging support.

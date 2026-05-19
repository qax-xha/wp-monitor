# Changelog

本文件记录所有重要变更，格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

All notable changes are documented in this file, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
with version numbers adhering to [Semantic Versioning](https://semver.org/).

## [0.7.3] - 2026-05-19

### Added

- MISS 日志新增文件读取模式，支持大文件场景下的日志回放，增加文件读取通道以提升性能。

- Add file-based reading mode for MISS logs with increased file reading channels for better performance in large-file log replay scenarios.

### Changed

- 前端布局紧凑化，缩减各区域间距，提升信息密度。
- Parse 层节点列表横向对齐，修复与两侧面板不对齐的视觉问题。

- Compact frontend layout with reduced spacing for higher information density.
- Align parse layer node list horizontally, fixing visual misalignment with side panels.

### Fixed

- 移除速率趋势图标题并优化 tooltip 样式。
- 更新图表 tooltip 边框样式。
- 修复 TypeScript 编译警告（未使用变量、JSX 标签不匹配导致构建失败）。

- Remove chart title and update tooltip style for rate trend chart.
- Update chart tooltip border style.
- Fix TypeScript compilation warnings (unused variables, JSX tag mismatch causing build failure).

## [0.7.2] - 2026-05-15

### Added

- `/layers/metrics` 接口新增 `filters` 参数，支持按 package/rule 组合过滤 parse 层指标数据。
- 新增 `filterLogsByMode` 前端工具函数，统一 "活跃/静默" 模式的日志过滤逻辑。
- 新增 `resolveTimeRange` 前端工具函数，消除时间范围校验的重复代码。

- Add `filters` parameter to `/layers/metrics` endpoint for filtering parse-layer metrics by package/rule combinations.
- Add `filterLogsByMode` frontend helper to unify log filtering logic for "withData/noData" modes.
- Add `resolveTimeRange` frontend helper to eliminate duplicated time range validation code.

### Changed

- `/layers/metrics` 接口从 GET 改为 POST，参数改为 JSON body 传递。
- 前端 `fetchMetrics`、`fetchPackagesTimeSeries`、`fetchParseTimeSeries` 重构为使用结构化 filters 替代原始 node_ids。
- Parse 层过滤判断从 `log_count` 改为 `log_rate_eps`，统一指标口径。
- 后端统一使用 `escape_regex_chars`，移除重复的 `escape_promql_regex` 方法。
- `get_parse_timeseries` 中的内联正则转义替换为调用 `escape_regex_chars`。

- Change `/layers/metrics` from GET to POST with JSON body for parameter passing.
- Refactor `fetchMetrics`, `fetchPackagesTimeSeries`, `fetchParseTimeSeries` to use structured filters instead of raw node_ids.
- Switch parse filter criteria from `log_count` to `log_rate_eps` for consistent metric semantics.
- Consolidate regex escaping to `escape_regex_chars`, remove duplicate `escape_promql_regex`.
- Replace inline regex escaping in `get_parse_timeseries` with `escape_regex_chars` calls.

### Fixed

- 修复 `fetch_snapshot_data` 中 filter 循环覆盖 bug，多个 filter 时仅最后一个生效。
- 修复 filter 存在时缓存填零导致前端 "静默" 模式数据震荡的问题。

- Fix filter loop overwrite bug in `fetch_snapshot_data` where only the last filter was applied.
- Fix cache zero-fill oscillation in frontend "noData" mode when filters are active.

### Removed

- 移除前端 `zeroSeriesForSilent` 函数（后端正确过滤后不再需要）。
- 移除 `vm_repository.rs` 中与 `escape_regex_chars` 重复的 `escape_promql_regex` 方法。

- Remove `zeroSeriesForSilent` frontend workaround (no longer needed with proper backend filtering).
- Remove duplicate `escape_promql_regex` method in favor of `escape_regex_chars`.

## [0.7.1] - 2026-05-12

### Changed

- 错误处理机制重构，统一错误响应格式与透传逻辑。
- 更新版本号至 0.7.2。

- Refactor error handling for unified error response format and propagation.
- Bump version to 0.7.2.

## [0.7.0] - 2026-05-11

### Added

- 新增 Helm Chart 打包支持。

- Add Helm chart packaging support.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  App, Button, DatePicker, Divider, Input, InputNumber, Space, Switch, Typography,
} from "antd";
import { ChevronDown } from "lucide-react";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/zh-cn";

import {
  applyMetricsToSnapshot,
  collectAllNodeIds,
  fmtCount,
  fmtRate,
} from "@/views/components/monitor/flowHelpers";
import TimeSeriesChart from "@/views/components/monitor/TimeSeriesChart";
import ScopeTrendPanel from "@/views/components/monitor/ScopeTrendPanel";
import ThemeSwitcher from "@/views/components/monitor/ThemeSwitcher";
import { getPalette } from "@/views/components/monitor/chartPalette";
import {
  exportMissedLogs,
  fetchMissedLogs,
  fetchMetrics,
  fetchNodeDetail,
  fetchNodeTimeSeries,
  fetchPackagesTimeSeries,
  fetchParseTimeSeries,
  fetchSnapshot,
  fetchVersion,
} from "@/services/monitor";
import type {
  LayerSnapshot,
  NodeDetail,
  NodeTimeSeries,
  VlogRecord,
} from "@/types/monitor";
import { useTheme } from "@/context/ThemeContext";
import logoDarkUrl from "@/assets/logo-dark.png";
import logoLightUrl from "@/assets/logo-light.png";

const QUICK_RANGES = [
  { key: "1m", label: "最近 1 分钟", minutes: 1 },
  { key: "5m", label: "最近 5 分钟", minutes: 5 },
  { key: "1h", label: "最近 1 小时", minutes: 60 },
  { key: "6h", label: "最近 6 小时", minutes: 360 },
  { key: "24h", label: "最近 24 小时", minutes: 1440 },
  // { key: "today", label: "今天" },
  // { key: "yesterday", label: "昨天" },
  { key: "week", label: "本周" },
] as const;
const MISS_PAGE_SIZE = 10;
const REALTIME_END_LAG_MS = 5000;
const { RangePicker } = DatePicker;
dayjs.locale("zh-cn");

type LegendType =
  | "source"
  | "package"
  | "log"
  | "group"
  | "sink"
  | "miss"
  | null;
type ParseSearchItem =
  | {
    key: string;
    type: "package";
    packageId: string;
    packageName: string;
    label: string;
  }
  | {
    key: string;
    type: "log";
    packageId: string;
    packageName: string;
    logId: string;
    logName: string;
    label: string;
  };
type ScopeSeriesRequest = {
  scope: "parse" | "source" | "sink";
  packageName?: string;
  sinkGroup?: string;
};

function toIsoByMinutesAgo(minutes: number) {
  return new Date(Date.now() - REALTIME_END_LAG_MS - minutes * 60 * 1000).toISOString();
}

function nowWithLagMs() {
  return Date.now() - REALTIME_END_LAG_MS;
}

function nowWithLagIso() {
  return new Date(nowWithLagMs()).toISOString();
}

function estimateMaxDataPoints() {
  if (typeof window === "undefined") return 720;
  const panelWidth = Math.max(360, Math.floor(window.innerWidth * 0.58));
  return Math.max(120, Math.min(1600, panelWidth));
}

function toDateFromIso(v: string) {
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatLocalDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatLocalTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeNodePillText(name: string) {
  if (name === "__source__") return "来源层";
  if (name === "__parse__") return "Parse 层";
  if (name === "__sink__") return "输出层";
  return name;
}

function resolveTimeRange(currentStart: string, currentEnd: string) {
  const startMs = new Date(currentStart).getTime();
  const endMs = new Date(currentEnd).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    const end = nowWithLagIso();
    const fallbackStart = new Date(new Date(end).getTime() - 5 * 60 * 1000).toISOString();
    let start = Number.isFinite(startMs) ? currentStart : fallbackStart;
    if (new Date(start).getTime() >= new Date(end).getTime()) start = fallbackStart;
    return { start, end };
  }
  return { start: currentStart, end: currentEnd };
}

function filterLogsByMode(
  logs: Array<{ name: string; metrics: { log_rate_eps: number } }>,
  mode: "withData" | "noData",
) {
  return logs.filter((log) =>
    mode === "withData"
      ? log.metrics.log_rate_eps > 0
      : log.metrics.log_rate_eps === 0,
  );
}

function buildQuickRange(key: string) {
  const now = new Date(nowWithLagMs());
  if (key === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: start.toISOString(), end: now.toISOString() };
  }
  if (key === "yesterday") {
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
    );
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (key === "week") {
    const weekday = now.getDay() === 0 ? 7 : now.getDay();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (weekday - 1),
    );
    return { start: start.toISOString(), end: now.toISOString() };
  }
  const selected = QUICK_RANGES.find((item) => item.key === key && "minutes" in item);
  if (!selected || !("minutes" in selected)) return null;
  const end = now;
  const start = new Date(end.getTime() - selected.minutes * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function WpMonitorPage() {
  const { theme, accentColor } = useTheme();
  const logoUrl = theme === 'light-modern' ? logoLightUrl : logoDarkUrl;
  const formatRate2 = useCallback((v: number) => `${v.toFixed(2)} e/s`, []);

  const [appVersion, setAppVersion] = useState("");
  const [snapshot, setSnapshot] = useState<LayerSnapshot | null>(null);
  const [startTime, setStartTime] = useState(() => toIsoByMinutesAgo(5));
  const [endTime, setEndTime] = useState(() => nowWithLagIso());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { message } = App.useApp();

  const [selectedNode, setSelectedNode] = useState("");
  const [hoveredNode, setHoveredNode] = useState("");
  const [sweepNode, setSweepNode] = useState("");
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [detailNodePill, setDetailNodePill] = useState("");
  const [detailViewMode, setDetailViewMode] = useState<"node" | "scope">(
    "node",
  );
  const [series, setSeries] = useState<NodeTimeSeries | null>(null);
  const [parseSeriesList, setParseSeriesList] = useState<NodeTimeSeries[] | null>(
    null,
  );
  const [hiddenScopeSeriesNames, setHiddenScopeSeriesNames] = useState<string[]>(
    [],
  );
  const [scopeSeriesRequest, setScopeSeriesRequest] =
    useState<ScopeSeriesRequest | null>(null);
  const [parseSeriesTitle, setParseSeriesTitle] = useState("");
  const [detailStartTime, setDetailStartTime] = useState("");
  const [detailEndTime, setDetailEndTime] = useState("");
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [detailPanelHeight, setDetailPanelHeight] = useState(290);
  const [missLogsLoading, setMissLogsLoading] = useState(false);
  const [missLogsError, setMissLogsError] = useState("");
  const [missLogs, setMissLogs] = useState<VlogRecord[]>([]);
  const [missHasMore, setMissHasMore] = useState(false);
  const [missPage, setMissPage] = useState(1);
  const [missExporting, setMissExporting] = useState(false);
  const [missWindowStart, setMissWindowStart] = useState("");
  const [missWindowEnd, setMissWindowEnd] = useState("");

  const [expandedPackages, setExpandedPackages] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  const [draftRange, setDraftRange] = useState("5m");
  const [draftStart, setDraftStart] = useState<Date | null>(() =>
    toDateFromIso(toIsoByMinutesAgo(5)),
  );
  const [draftEnd, setDraftEnd] = useState<Date | null>(() =>
    toDateFromIso(nowWithLagIso()),
  );
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(5);
  const [refreshIntervalInput, setRefreshIntervalInput] = useState("5");
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [detailTrendAutoRefresh, setDetailTrendAutoRefresh] = useState(true);

  const [parseFilter, setParseFilter] = useState<"withData" | "noData">("withData");
  const PARSE_PAGE_SIZE = 20;
  const [parsePage, setParsePage] = useState(1);
  const scopeModeRef = useRef<"log" | "package">("log");
  const initialScopeOpened = useRef(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const parseFilterRef = useRef(parseFilter);
  parseFilterRef.current = parseFilter;
  const [parseQuery, setParseQuery] = useState("");
  const [parseSearchOpen, setParseSearchOpen] = useState(false);
  const [parseSearchActiveIndex, setParseSearchActiveIndex] = useState(0);
  const parseSearchRef = useRef<HTMLDivElement | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const refreshSpinTimerRef = useRef<number | null>(null);
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );
  const scopeSeriesColorMapRef = useRef<Map<string, string>>(new Map());
  const scopeSeriesColorCursorRef = useRef(0);

  const clampDetailPanelHeight = useCallback((h: number) => {
    const isMobile = window.innerWidth <= 768;
    const minHeight = isMobile ? Math.floor(window.innerHeight * 0.56) : 220;
    const maxHeight = isMobile
      ? Math.floor(window.innerHeight * 0.9)
      : Math.floor(window.innerHeight * 0.86);
    return Math.min(maxHeight, Math.max(minHeight, h));
  }, []);

  const triggerRefreshSpin = useCallback(() => {
    if (refreshSpinTimerRef.current !== null) {
      window.clearTimeout(refreshSpinTimerRef.current);
    }
    setRefreshSpin(true);
    refreshSpinTimerRef.current = window.setTimeout(() => {
      setRefreshSpin(false);
    }, 300);
  }, []);

  async function loadSnapshot(start = startTime, end = endTime) {
    try {
      setLoading(true);
      setError("");
      const data = await fetchSnapshot(start, end);
      setSnapshot(data);
      setExpandedPackages(data.parses.map((parseItem) => parseItem.id));
      setExpandedGroups(data.sinks.map((group) => group.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshMetricsOnly() {
    if (!snapshot) return;
    triggerRefreshSpin();
    try {
      const ids = collectAllNodeIds(snapshot);
      const pkgFilters = filteredParses
        .map((pkg) => ({
          packageName: pkg.package_name,
          ruleNames: filterLogsByMode(pkg.logs, parseFilterRef.current).map((log) => log.name),
        }))
        .filter((f) => f.ruleNames.length > 0);
      // 自动刷新时保持窗口长度恒定，避免仅更新 end_time 导致时间范围持续漂移。
      const nowMs = nowWithLagMs();
      const startMs = new Date(startTime).getTime();
      const endMs = new Date(endTime).getTime();
      const durationMs =
        Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
          ? endMs - startMs
          : 5 * 60 * 1000;
      const nextEnd = new Date(nowMs).toISOString();
      const nextStart = new Date(nowMs - durationMs).toISOString();
      const data = await fetchMetrics(nextStart, nextEnd, ids, pkgFilters);
      setSnapshot((prev) =>
        prev ? applyMetricsToSnapshot(prev, data.items) : prev,
      );
      setStartTime(nextStart);
      setEndTime(nextEnd);
    } catch {
      await loadSnapshot();
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  // 默认打开 Parse 趋势图
  useEffect(() => {
    if (snapshot && !initialScopeOpened.current) {
      initialScopeOpened.current = true;
      void openParseScope();
    }
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    async function loadVersion() {
      try {
        const data = await fetchVersion();
        if (!cancelled) {
          setAppVersion(data.version);
        }
      } catch {
        if (!cancelled) {
          setAppVersion("");
        }
      }
    }
    void loadVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const timer = setInterval(() => {
      void refreshMetricsOnly();
    }, refreshIntervalSec * 1000);
    return () => clearInterval(timer);
  }, [
    snapshot,
    startTime,
    autoRefreshEnabled,
    refreshIntervalSec,
  ]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!parseSearchRef.current?.contains(target)) setParseSearchOpen(false);
      if (
        selectedNode &&
        !detailPanelRef.current?.contains(target) &&
        !(target as Element).closest(
          ".node, .node__leaf, .lane-title, .parse-search-item, .filter-toggle",
        )
      ) {
        setSelectedNode("");
        setDetailNodePill("");
        setScopeSeriesRequest(null);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [selectedNode]);

  useEffect(() => {
    if (!sweepNode) return;
    const timer = setTimeout(() => setSweepNode(""), 1300);
    return () => clearTimeout(timer);
  }, [sweepNode]);

  useEffect(() => {
    const onResize = () => {
      setDetailPanelHeight((prev) => clampDetailPanelHeight(prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampDetailPanelHeight]);

  useEffect(() => {
    if (error) {
      message.error(error, 3);
    }
  }, [error, message]);

  useEffect(() => {
    return () => {
      if (refreshSpinTimerRef.current !== null) {
        window.clearTimeout(refreshSpinTimerRef.current);
      }
    };
  }, []);

  const rateChartPoints = useMemo(
    () => series?.log_rate_eps ?? [],
    [series?.log_rate_eps],
  );
  const parseMultiSeries = useMemo(
    () =>
      (parseSeriesList ?? []).map((seriesItem) => ({
        name: seriesItem.node_id,
        points: seriesItem.log_rate_eps ?? [],
        color: (() => {
          const cached = scopeSeriesColorMapRef.current.get(seriesItem.node_id);
          if (cached) return cached;
          const palette = getPalette(theme);
          const color =
            palette[
            scopeSeriesColorCursorRef.current % palette.length
            ];
          scopeSeriesColorMapRef.current.set(seriesItem.node_id, color);
          scopeSeriesColorCursorRef.current += 1;
          return color;
        })(),
      })),
    [parseSeriesList, theme],
  );
  const visibleParseMultiSeries = useMemo(
    () =>
      parseMultiSeries.filter(
        (line) => !hiddenScopeSeriesNames.includes(line.name),
      ),
    [parseMultiSeries, hiddenScopeSeriesNames],
  );
  const isMissSelected = useMemo(
    () =>
      Boolean(snapshot && selectedNode && selectedNode === snapshot.miss.id),
    [snapshot, selectedNode],
  );
  const missHasData = useMemo(() => {
    if (!snapshot) return false;
    return (
      snapshot.miss.metrics.log_count > 0 ||
      snapshot.miss.metrics.log_rate_eps > 0
    );
  }, [snapshot]);
  const filteredParses = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.parses.filter((p) => {
      if (parseFilter === "withData") return p.metrics.log_rate_eps > 0;
      if (parseFilter === "noData") return p.logs.some((l) => l.metrics.log_rate_eps === 0);
      return true;
    });
  }, [snapshot, parseFilter]);

  const parsePages = useMemo(() => {
    const pages: (typeof filteredParses)[] = [];
    let cur: typeof filteredParses = [];
    let curCnt = 0;
    for (const pkg of filteredParses) {
      const cnt = filterLogsByMode(pkg.logs, parseFilter).length;
      if (curCnt >= PARSE_PAGE_SIZE && cur.length > 0) {
        pages.push(cur);
        cur = [];
        curCnt = 0;
      }
      cur.push(pkg);
      curCnt += cnt;
    }
    if (cur.length > 0) pages.push(cur);
    return pages.length > 0 ? pages : [[]];
  }, [filteredParses, parseFilter]);

  const parseTotalPages = parsePages.length;
  const parsePageItems = parsePages[Math.min(parsePage - 1, parseTotalPages - 1)] || [];

  const missPageItems = useMemo(() => missLogs, [missLogs]);
  const detailNodePillType = useMemo(() => {
    if (!selectedNode) return "generic";
    if (snapshot?.miss.id === selectedNode) return "miss";
    if (selectedNode === "__source__") return "source";
    if (selectedNode === "__parse__") return "parse";
    if (selectedNode === "__sink__") return "sink";
    if (detail?.node_type === "source") return "source";
    if (detail?.node_type === "parse") return "parse";
    if (detail?.node_type === "sink") return "sink";
    if (snapshot?.sources.some((node) => node.id === selectedNode)) return "source";
    if (
      snapshot?.parses.some(
        (parseItem) =>
          parseItem.id === selectedNode || parseItem.logs.some((log) => log.id === selectedNode),
      )
    )
      return "parse";
    if (
      snapshot?.sinks.some(
        (group) =>
          group.id === selectedNode || group.sinks.some((sink) => sink.id === selectedNode),
      )
    )
      return "sink";
    return "generic";
  }, [detail?.node_type, selectedNode, snapshot]);

  useEffect(() => {
    if (
      !selectedNode ||
      isMissSelected ||
      Boolean(parseSeriesList) ||
      !detailTrendAutoRefresh ||
      drawerLoading
    )
      return;
    const startMs = new Date(detailStartTime).getTime();
    const endMs = new Date(detailEndTime).getTime();
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs >= endMs
    )
      return;
    const durationMs = endMs - startMs;
    let cancelled = false;

    const refreshSelectedNodeDetail = async () => {
      try {
        const nextEndMs = nowWithLagMs();
        const nextStart = new Date(nextEndMs - durationMs).toISOString();
        const nextEnd = new Date(nextEndMs).toISOString();
        const [detailResp, seriesResp] = await Promise.all([
          fetchNodeDetail(selectedNode, nextStart, nextEnd),
          fetchNodeTimeSeries(
            selectedNode,
            nextStart,
            nextEnd,
            estimateMaxDataPoints(),
          ),
        ]);
        if (cancelled) return;
        setDetail(detailResp.data);
        setSeries(seriesResp.data);
        setDetailStartTime(nextStart);
        setDetailEndTime(nextEnd);
        setDrawerError("");
      } catch (err) {
        if (cancelled) return;
        setDrawerError((err as Error).message || "节点详情获取失败");
      }
    };

    const timer = setInterval(() => {
      void refreshSelectedNodeDetail();
    }, refreshIntervalSec * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    selectedNode,
    isMissSelected,
    detailTrendAutoRefresh,
    drawerLoading,
    detailStartTime,
    detailEndTime,
    refreshIntervalSec,
    parseSeriesList,
  ]);

  useEffect(() => {
    if (
      !selectedNode ||
      detailViewMode !== "scope" ||
      !scopeSeriesRequest ||
      parseSeriesList === null ||
      !detailTrendAutoRefresh ||
      drawerLoading
    )
      return;
    const startMs = new Date(detailStartTime).getTime();
    const endMs = new Date(detailEndTime).getTime();
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs >= endMs
    )
      return;
    const durationMs = endMs - startMs;
    let cancelled = false;

    const refreshScopeTimeseries = async () => {
      try {
        const filter = parseFilterRef.current;
        const nextEndMs = nowWithLagMs();
        const nextStart = new Date(nextEndMs - durationMs).toISOString();
        const nextEnd = new Date(nextEndMs).toISOString();
        let timeseriesResp;
        if (scopeModeRef.current === "package") {
          const pkgFilters = filteredParses.map((pkg) => ({
            packageName: pkg.package_name,
            ruleNames: filterLogsByMode(pkg.logs, filter).map((log) => log.name),
          }));
          timeseriesResp = await fetchPackagesTimeSeries(
            nextStart, nextEnd, estimateMaxDataPoints(),
            pkgFilters,
          );
        } else {
          let logNodeIds: string[] | undefined;
          const req = scopeSeriesRequest;
          if (req.scope === "parse" && req.packageName) {
            const snap = snapshotRef.current;
            const pkg = snap?.parses.find((p) => p.package_name === req.packageName);
            if (pkg) {
              const logs = filterLogsByMode(pkg.logs, filter);
              logNodeIds = logs.map((l) => l.name);
            }
          }
          timeseriesResp = await fetchParseTimeSeries(
            scopeSeriesRequest.scope,
            nextStart, nextEnd, estimateMaxDataPoints(),
            scopeSeriesRequest.packageName,
            scopeSeriesRequest.sinkGroup,
            logNodeIds,
          );
        }
        if (cancelled) return;
        setParseSeriesList(timeseriesResp.data ?? []);
        setDetailStartTime(nextStart);
        setDetailEndTime(nextEnd);
        setDrawerError("");
      } catch (err) {
        if (cancelled) return;
        setDrawerError((err as Error).message || "范围时序获取失败");
      }
    };

    const timer = setInterval(() => {
      void refreshScopeTimeseries();
    }, refreshIntervalSec * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    selectedNode,
    detailViewMode,
    scopeSeriesRequest,
    parseSeriesList,
    detailTrendAutoRefresh,
    drawerLoading,
    detailStartTime,
    detailEndTime,
    refreshIntervalSec,
  ]);

  const parseSearchGroups = useMemo(() => {
    if (!snapshot) return [];
    const q = parseQuery.trim().toLowerCase();
    if (!q) return [];
    return snapshot.parses
      .map((parseItem) => {
        const pkgMatched = parseItem.package_name.toLowerCase().includes(q);
        const logsMatched = parseItem.logs.filter((logItem) =>
          logItem.name.toLowerCase().includes(q),
        );
        if (!pkgMatched && logsMatched.length === 0) return null;
        return { pkg: parseItem, logsMatched };
      })
      .filter(Boolean) as Array<{
        pkg: LayerSnapshot["parses"][number];
        logsMatched: LayerSnapshot["parses"][number]["logs"];
      }>;
  }, [snapshot, parseQuery]);

  const parseSearchFlatItems = useMemo(() => {
    const list: ParseSearchItem[] = [];
    parseSearchGroups.forEach((group) => {
      list.push({
        key: `pkg:${group.pkg.id}`,
        type: "package",
        packageId: group.pkg.id,
        packageName: group.pkg.package_name,
        label: `${group.pkg.package_name} package ${group.logsMatched.length ? `(${group.logsMatched.length})` : ""}`,
      });
      group.logsMatched.forEach((logItem) => {
        list.push({
          key: `log:${logItem.id}`,
          type: "log",
          packageId: group.pkg.id,
          packageName: group.pkg.package_name,
          logId: logItem.id,
          logName: logItem.name,
          label: `${group.pkg.package_name} log_type ${logItem.name}`,
        });
      });
    });
    return list;
  }, [parseSearchGroups]);

  useEffect(() => {
    setParseSearchActiveIndex(0);
  }, [parseQuery, parseSearchOpen]);

  // 过滤切换且 scope 已打开时自动刷新
  useEffect(() => {
    if (!snapshot || !initialScopeOpened.current || detailViewMode !== "scope") return;

    if (scopeModeRef.current === "package") {
      void openParseScope();
    } else if (scopeModeRef.current === "log" && scopeSeriesRequest) {
      const req = scopeSeriesRequest;
      let logNodeIds: string[] | undefined;
      if (req.scope === "parse" && req.packageName) {
        const pkg = snapshot.parses.find((p) => p.package_name === req.packageName);
        if (pkg) {
          const logs = filterLogsByMode(pkg.logs, parseFilter);
          logNodeIds = logs.map((l) => l.name);
        }
      }
      void fetchParseTimeSeries(
        req.scope, detailStartTime, detailEndTime, estimateMaxDataPoints(),
        req.packageName, req.sinkGroup, logNodeIds,
      ).then((resp) => {
        setParseSeriesList(resp.data ?? []);
      }).catch((err) => {
        setDrawerError((err as Error).message || "Parse 时间序列获取失败");
      });
    }
  }, [parseFilter]);

  useEffect(() => {
    scopeSeriesColorMapRef.current.clear();
    scopeSeriesColorCursorRef.current = 0;
  }, [theme]);

  useEffect(() => {
    setHiddenScopeSeriesNames((prev) =>
      prev.filter((name) => parseMultiSeries.some((line) => line.name === name)),
    );
  }, [parseMultiSeries]);

  const resolveNodePillById = useCallback(
    (nodeId: string) => {
      if (!snapshot) return normalizeNodePillText(nodeId);
      if (snapshot.miss.id === nodeId) {
        return normalizeNodePillText(snapshot.miss.name);
      }
      const sourceNode = snapshot.sources.find((node) => node.id === nodeId);
      if (sourceNode) return normalizeNodePillText(sourceNode.name);
      const parseNode = snapshot.parses.find((parseItem) => parseItem.id === nodeId);
      if (parseNode) return normalizeNodePillText(parseNode.package_name);
      for (const parse of snapshot.parses) {
        const logNode = parse.logs.find((logItem) => logItem.id === nodeId);
        if (logNode) return normalizeNodePillText(logNode.name);
      }
      const sinkGroup = snapshot.sinks.find((group) => group.id === nodeId);
      if (sinkGroup) return normalizeNodePillText(sinkGroup.sink_group);
      for (const group of snapshot.sinks) {
        const sinkNode = group.sinks.find((sinkItem) => sinkItem.id === nodeId);
        if (sinkNode) return normalizeNodePillText(sinkNode.sink_name);
      }
      return normalizeNodePillText(nodeId);
    },
    [snapshot],
  );

  function nodeClass(
    base: string,
    nodeId: string,
    _type: Exclude<LegendType, null>,
  ) {
    const classes = [base];
    if (selectedNode === nodeId) classes.push("selected");
    if (hoveredNode === nodeId) classes.push("active");
    if (sweepNode === nodeId) classes.push("sweep");
    return classes.join(" ");
  }

  async function loadMissedLogs(start: string, end: string, page: number) {
    try {
      setMissLogsLoading(true);
      setMissLogsError("");
      const data = await fetchMissedLogs(start, end, page, MISS_PAGE_SIZE);
      setMissLogs(data.items);
      setMissHasMore(data.has_more);
      setMissPage(data.page);
      return true;
    } catch (err) {
      setMissLogs([]);
      setMissHasMore(false);
      setMissLogsError((err as Error).message || "MISS 日志获取失败");
      return false;
    } finally {
      setMissLogsLoading(false);
    }
  }

  async function onExportMissed() {
    if (!isMissSelected) return;
    try {
      setMissExporting(true);
      const exportStart = missWindowStart || detailStartTime;
      const exportEnd = missWindowEnd || detailEndTime;
      const resp = await exportMissedLogs(exportStart, exportEnd);
      const blob = await resp.blob();
      const contentDisposition = resp.headers.get("content-disposition") || "";
      const matched = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = matched?.[1] || `miss-${Date.now()}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.dispatchEvent(
        new MouseEvent("click", {
          bubbles: false,
          cancelable: true,
          view: window,
        }),
      );
      URL.revokeObjectURL(url);
    } catch (err) {
      setMissLogsError((err as Error).message || "MISS 日志导出失败");
    } finally {
      setMissExporting(false);
    }
  }

  async function onPrevMissPage() {
    if (missPage <= 1) return;
    const pageStart = missWindowStart || detailStartTime;
    const pageEnd = missWindowEnd || detailEndTime;
    await loadMissedLogs(pageStart, pageEnd, missPage - 1);
  }

  async function onNextMissPage() {
    if (!missHasMore) return;
    const pageStart = missWindowStart || detailStartTime;
    const pageEnd = missWindowEnd || detailEndTime;
    await loadMissedLogs(pageStart, pageEnd, missPage + 1);
  }

  async function openDetail(nodeId: string) {
    setDetailViewMode("node");
    setDetailNodePill(resolveNodePillById(nodeId));
    setHiddenScopeSeriesNames([]);
    setScopeSeriesRequest(null);
    const missNodeId = snapshot?.miss.id ?? "";
    const isMissNode = nodeId === missNodeId;
    const detailRange = resolveTimeRange(startTime, endTime || nowWithLagIso());
    setSelectedNode(nodeId);
    setDetailStartTime(detailRange.start);
    setDetailEndTime(detailRange.end);
    setDrawerLoading(true);
    setDrawerError("");
    setDetail(null);
    setSeries(null);
    setParseSeriesList(null);
    setParseSeriesTitle("");
    setMissLogs([]);
    setMissHasMore(false);
    setMissLogsError("");
    setMissLogsLoading(false);
    setMissWindowStart("");
    setMissWindowEnd("");
    try {
      const detailPromise = fetchNodeDetail(
        nodeId,
        detailRange.start,
        detailRange.end,
      );
      const seriesPromise = fetchNodeTimeSeries(
        nodeId,
        detailRange.start,
        detailRange.end,
        estimateMaxDataPoints(),
      );
      if (isMissNode) {
        setMissLogsLoading(true);
        setMissWindowStart(detailRange.start);
        setMissWindowEnd(detailRange.end);
        const [detailResp, seriesResp, missedResp] = await Promise.all([
          detailPromise,
          seriesPromise,
          fetchMissedLogs(detailRange.start, detailRange.end, 1, MISS_PAGE_SIZE),
        ]);
        setMissLogs(missedResp.items);
        setMissHasMore(missedResp.has_more);
        setMissPage(missedResp.page);
        setMissLogsError("");
        setMissLogsLoading(false);
        setDetail(detailResp.data);
        setDetailNodePill(normalizeNodePillText(detailResp.data.name));
        setSeries(seriesResp.data);
        return;
      }
      const [detailResp, seriesResp] = await Promise.all([
        detailPromise,
        seriesPromise,
      ]);
      setDetail(detailResp.data);
      setDetailNodePill(normalizeNodePillText(detailResp.data.name));
      setSeries(seriesResp.data);
    } catch (err) {
      if (isMissNode) {
        setMissLogs([]);
        setMissLogsError((err as Error).message || "MISS 日志获取失败");
        setMissLogsLoading(false);
      }
      setDrawerError((err as Error).message || "节点详情获取失败");
    } finally {
      setDrawerLoading(false);
    }
  }

  async function openParseTimeseries(
    scope: "parse" | "source" | "sink",
    selectedId: string,
    title: string,
    packageName?: string,
    sinkGroup?: string,
  ) {
    scopeModeRef.current = "log";
    setDetailViewMode("scope");
    setDetailNodePill(normalizeNodePillText(title.replace(/ 节点趋势$/, "")));
    setHiddenScopeSeriesNames([]);
    setScopeSeriesRequest({ scope, packageName, sinkGroup });
    const range = resolveTimeRange(startTime, endTime || nowWithLagIso());
    setSelectedNode(selectedId);
    setDetailStartTime(range.start);
    setDetailEndTime(range.end);
    setDrawerLoading(true);
    setDrawerError("");
    setDetail(null);
    setSeries(null);
    setParseSeriesList(null);
    setParseSeriesTitle(title);
    try {
      // 按活跃/静默收集应查询的 log node_ids
      let logNodeIds: string[] | undefined;
      if (scope === "parse" && packageName) {
        const pkg = snapshot?.parses.find((p) => p.package_name === packageName);
        if (pkg) {
          const logs = filterLogsByMode(pkg.logs, parseFilter);
          logNodeIds = logs.map((l) => l.name);
        }
      }
      const timeseriesResp = await fetchParseTimeSeries(
        scope,
        range.start,
        range.end,
        estimateMaxDataPoints(),
        packageName,
        sinkGroup,
        logNodeIds,
      );
      setParseSeriesList(timeseriesResp.data ?? []);
    } catch (err) {
      setDrawerError((err as Error).message || "Parse 时间序列获取失败");
    } finally {
      setDrawerLoading(false);
    }
  }

  async function openParseScope() {
    scopeModeRef.current = "package";
    const title = parseFilter === "withData" ? "Parse 层 Package 趋势（活跃）" : "Parse 层 Package 趋势（静默）";
    setDetailViewMode("scope");
    setDetailNodePill(normalizeNodePillText("Parse 层"));
    setHiddenScopeSeriesNames([]);
    setScopeSeriesRequest({ scope: "parse" });
    const range = resolveTimeRange(startTime, endTime || nowWithLagIso());
    setSelectedNode("__parse__");
    setDetailStartTime(range.start);
    setDetailEndTime(range.end);
    setDrawerLoading(true);
    setDrawerError("");
    setDetail(null);
    setSeries(null);
    setParseSeriesList(null);
    setParseSeriesTitle(title);
    try {
      if (filteredParses.length === 0) {
        setParseSeriesList([]);
      } else {
        const pkgFilters = filteredParses.map((pkg) => ({
          packageName: pkg.package_name,
          ruleNames: filterLogsByMode(pkg.logs, parseFilter).map((log) => log.name),
        }));
        const timeseriesResp = await fetchPackagesTimeSeries(
          range.start, range.end, estimateMaxDataPoints(),
          pkgFilters,
        );
        setParseSeriesList(timeseriesResp.data ?? []);
      }
    } catch (err) {
      setDrawerError((err as Error).message || "Parse 时间序列获取失败");
    } finally {
      setDrawerLoading(false);
    }
  }

  function togglePackage(pkgId: string) {
    setExpandedPackages((prev) =>
      prev.includes(pkgId)
        ? prev.filter((id) => id !== pkgId)
        : [...prev, pkgId],
    );
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  }

  async function applyTimeRange(
    nextStart: string,
    nextEnd: string,
    enableAutoRefresh: boolean,
  ) {
    if (new Date(nextStart).getTime() >= new Date(nextEnd).getTime()) {
      setError("开始时间必须早于结束时间");
      return;
    }
    setError("");
    setStartTime(nextStart);
    setEndTime(nextEnd);
    setAutoRefreshEnabled(enableAutoRefresh);
    await loadSnapshot(nextStart, nextEnd);
  }

  async function onPickRange(key: string) {
    setDraftRange(key);
    const range = buildQuickRange(key);
    if (!range) return;
    setDraftStart(new Date(range.start));
    setDraftEnd(new Date(range.end));
    await applyTimeRange(range.start, range.end, true);
  }

  async function onApplyTime() {
    if (!draftStart || !draftEnd) {
      setError("时间格式无效");
      return;
    }
    const nextStart = draftStart.toISOString();
    const nextEnd = draftEnd.toISOString();
    // 手动点击“查询”视为自定义时间查询，固定关闭自动刷新，避免选定窗口被改写。
    await applyTimeRange(nextStart, nextEnd, false);
  }

  function onRefreshIntervalChange(raw: string) {
    if (raw === "") {
      setRefreshIntervalInput("");
      return;
    }
    if (!/^\d+$/.test(raw)) return;
    setRefreshIntervalInput(raw);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed)) {
      setRefreshIntervalSec(Math.max(1, parsed));
    }
  }

  function commitRefreshIntervalInput() {
    const parsed = Number.parseInt(refreshIntervalInput, 10);
    const normalized = Number.isNaN(parsed) ? 1 : Math.max(1, parsed);
    setRefreshIntervalSec(normalized);
    setRefreshIntervalInput(String(normalized));
  }

  function onRefreshIntervalKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    commitRefreshIntervalInput();
    event.currentTarget.blur();
  }

  async function onSelectParsePackage(packageId: string, packageName: string) {
    setParseQuery(packageName);
    setParseSearchOpen(false);
    await openParseTimeseries(
      "parse",
      packageId,
      `Package ${packageName} 节点趋势`,
      packageName,
    );
  }

  async function onSelectParseLog(
    _packageId: string,
    logId: string,
    packageName: string,
    logName: string,
  ) {
    setParseQuery(`${packageName} / ${logName}`);
    setParseSearchOpen(false);
    await openDetail(logId);
  }

  async function onSelectParseItem(item: ParseSearchItem) {
    if (item.type === "package") {
      await onSelectParsePackage(item.packageId, item.packageName);
      return;
    }
    await onSelectParseLog(
      item.packageId,
      item.logId,
      item.packageName,
      item.logName,
    );
  }

  async function onParseSearchKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (!parseSearchOpen || !parseQuery.trim()) return;
    if (parseSearchFlatItems.length === 0) {
      if (event.key === "Escape") {
        setParseSearchOpen(false);
        event.preventDefault();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setParseSearchActiveIndex(
        (prev) => (prev + 1) % parseSearchFlatItems.length,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setParseSearchActiveIndex(
        (prev) =>
          (prev - 1 + parseSearchFlatItems.length) %
          parseSearchFlatItems.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = parseSearchFlatItems[parseSearchActiveIndex];
      if (item) await onSelectParseItem(item);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setParseSearchOpen(false);
    }
  }

  function onDetailPanelResizeMove(event: PointerEvent) {
    const state = resizeStateRef.current;
    if (!state) return;
    const delta = state.startY - event.clientY;
    setDetailPanelHeight(clampDetailPanelHeight(state.startHeight + delta));
  }

  function onDetailPanelResizeEnd() {
    resizeStateRef.current = null;
    window.removeEventListener("pointermove", onDetailPanelResizeMove);
    window.removeEventListener("pointerup", onDetailPanelResizeEnd);
  }

  function onDetailPanelResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeStateRef.current = {
      startY: event.clientY,
      startHeight: detailPanelHeight,
    };
    window.addEventListener("pointermove", onDetailPanelResizeMove);
    window.addEventListener("pointerup", onDetailPanelResizeEnd);
  }

  return (
    <div
      className="app"
      id="app"
      style={
        selectedNode
          ? { paddingBottom: `${detailPanelHeight + 22}px` }
          : undefined
      }
    >
      <div className="title-wrap">
        <div className="title-head">
          <div className="title-logo-shell" aria-hidden="true">
            <img
              className="title-logo"
              src={logoUrl}
              alt="WP Monitor logo"
            />
          </div>
          <div className="title-brand">
            <div className="title-row">
              <div className="title">Monitor</div>
              {appVersion ? (
                <span className="title-version-inline" aria-label={`当前版本 v${appVersion}`}>
                  <span className="title-version-inline-text">v{appVersion}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="wd-quick-inline">
            {QUICK_RANGES.map((range) => (
              <Button
                key={range.key}
                size="small"
                type={draftRange === range.key ? "primary" : "default"}
                onClick={() => void onPickRange(range.key)}
              >
                {range.label}
              </Button>
            ))}
            <Button
              size="small"
              type={draftRange === "custom" ? "primary" : "default"}
              onClick={() => setDraftRange("custom")}
            >
              自定义
            </Button>
          </div>
          <div className="wd-chip wd-time-field wd-time-range-field">
            <span className="wd-time-field-label">时间范围</span>
            <RangePicker
              className="wd-ant-range"
              classNames={{ popup: { root: "wd-ant-range-popup" } }}
              style={{ width: "336px", maxWidth: "100%" }}
              value={[
                draftStart ? dayjs(draftStart) : null,
                draftEnd ? dayjs(draftEnd) : null,
              ]}
              onChange={(dates: null | [Dayjs | null, Dayjs | null]) => {
                setDraftRange("custom");
                setDraftStart(dates?.[0]?.toDate() ?? null);
                setDraftEnd(dates?.[1]?.toDate() ?? null);
              }}
              onCalendarChange={() => {
                setDraftRange("custom");
              }}
              onOpenChange={(open) => {
                if (open) setDraftRange("custom");
              }}
              showTime={{ format: "HH:mm:ss", minuteStep: 1, secondStep: 1 }}
              format="YYYY-MM-DD HH:mm:ss"
              allowClear={false}
              separator="→"
              suffixIcon={null}
              placeholder={["开始时间", "结束时间"]}
            />
          </div>
          <Button
            type="primary"
            size="small"
            onClick={() => void onApplyTime()}
            loading={loading}
          >
            查询
          </Button>
          <span className="wd-chip wd-refresh-chip">
            <span className="wd-time-field-label">自动刷新</span>
            <span
              className={`refresh-live-dot ${autoRefreshEnabled ? "on" : "off"} ${refreshSpin ? "spin" : ""}`}
              aria-hidden="true"
            />
            <InputNumber
              size="small"
              className="refresh-interval-input"
              min={1}
              value={Number(refreshIntervalInput)}
              onChange={(value) => onRefreshIntervalChange(String(value ?? 1))}
              onBlur={commitRefreshIntervalInput}
              onKeyDown={onRefreshIntervalKeyDown}
              style={{ width: 56 }}
            />
            <span className="wd-refresh-unit">s</span>
          </span>
          <ThemeSwitcher />
        </div>
      </div>
      <div className="canvas" id="canvas">
        {!snapshot && (
          <div className="loading-skeleton" aria-hidden="true">
            {[0, 1, 2].map((lane) => (
              <section key={lane} className="skeleton-lane">
                <div className="skeleton-title shimmer" />
                <div className="skeleton-card shimmer" />
                <div className="skeleton-card shimmer" />
                <div className="skeleton-card shimmer" />
              </section>
            ))}
          </div>
        )}

        {snapshot && (
          <div className="columns">
            <section className="lane">
              <div className="lane-head">
                <div
                  className={`lane-title lane-title-clickable ${selectedNode === "__source__" ? "selected" : ""}`}
                  onClick={() =>
                    void openParseTimeseries(
                      "source",
                      "__source__",
                      "来源层全部节点趋势",
                    )
                  }
                >
                  来源层
                </div>
              </div>
              <div className="lane-scroll">
                {snapshot.sources.map((node) => (
                  <article
                    key={node.id}
                    className={nodeClass("node node--source", node.id, "source")}
                    onMouseEnter={() => { setHoveredNode(node.id); setSweepNode(node.id); }}
                    onMouseLeave={() => { setHoveredNode(""); setSweepNode(""); }}
                    onClick={() => void openDetail(node.id)}
                  >
                    <div className="node__title">{node.name}</div>
                    <div className="metric-badges">
                      <span className="metric-badge">速率 {fmtRate(node.metrics.log_rate_eps)}</span>
                      <span className="metric-badge">数量 {fmtCount(node.metrics.log_count)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="lane">
              <div className="lane-head">
                <div className="filter-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    className={`lane-title lane-title-clickable ${selectedNode === "__parse__" ? "selected" : ""}`}
                    onClick={() => void openParseScope()}
                  >
                    Parse
                  </div>
                  <Button
                    size="small"
                    type={parseFilter === "withData" ? "primary" : "default"}
                    onClick={() => { setParseFilter("withData"); setParsePage(1); }}
                  >
                    活跃
                  </Button>
                  <Button
                    size="small"
                    type={parseFilter === "noData" ? "primary" : "default"}
                    onClick={() => { setParseFilter("noData"); setParsePage(1); }}
                  >
                    静默
                  </Button>
                </div>
                <div className="lane-actions">
                  <Button size="small" onClick={() => setExpandedPackages(snapshot.parses.map((parseItem) => parseItem.id))}>
                    全部展开
                  </Button>
                  <Button size="small" onClick={() => setExpandedPackages([])}>
                    全部收起
                  </Button>
                  <div ref={parseSearchRef} className="parse-search">
                    <div className="parse-search-controls">
                      <Input
                        size="small"
                        className="parse-search-input"
                        value={parseQuery}
                        onChange={(event) => {
                          setParseQuery(event.target.value);
                          setParseSearchOpen(true);
                        }}
                        onFocus={() => setParseSearchOpen(true)}
                        onKeyDown={(event) => void onParseSearchKeyDown(event)}
                        placeholder="搜索 package 或日志类型"
                        allowClear
                      />
                    </div>
                    <div
                      className={`parse-search-results ${parseSearchOpen && parseQuery.trim() ? "" : "hidden"}`}
                    >
                      {parseSearchGroups.length === 0 && (
                        <div className="parse-search-item">无匹配结果</div>
                      )}
                      {parseSearchGroups.map((group) => (
                        <div key={group.pkg.id} className="parse-search-group">
                          <div
                            className={`parse-search-item parse-search-group-title ${parseSearchFlatItems[parseSearchActiveIndex]?.key === `pkg:${group.pkg.id}` ? "active" : ""}`}
                            onClick={() =>
                              void onSelectParsePackage(
                                group.pkg.id,
                                group.pkg.package_name,
                              )
                            }
                          >
                            {group.pkg.package_name} package{" "}
                            {group.logsMatched.length
                              ? `(${group.logsMatched.length})`
                              : ""}
                          </div>
                          {group.logsMatched.map((logItem) => (
                            <div
                              key={logItem.id}
                              className={`parse-search-item child ${parseSearchFlatItems[parseSearchActiveIndex]?.key === `log:${logItem.id}` ? "active" : ""}`}
                              onClick={() =>
                                void onSelectParseLog(
                                  group.pkg.id,
                                  logItem.id,
                                  group.pkg.package_name,
                                  logItem.name,
                                )
                              }
                            >
                              {group.pkg.package_name} log_type {logItem.name}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="lane-scroll">
                {parsePageItems.map((parseItem) => {
                  const isExpanded = expandedPackages.includes(parseItem.id);
                  const showLogs = parseFilter === "withData"
                    ? parseItem.logs.filter((l) => l.metrics.log_rate_eps > 0)
                    : parseFilter === "noData"
                      ? parseItem.logs.filter((l) => l.metrics.log_rate_eps === 0)
                      : parseItem.logs;
                  return (
                    <section
                      key={parseItem.id}
                      className={nodeClass("node node--package", parseItem.id, "package")}
                      onMouseEnter={(e) => {
                        setHoveredNode(parseItem.id);
                        const related = e.relatedTarget as Element | null;
                        if (!related || !e.currentTarget.contains(related)) {
                          setSweepNode(parseItem.id);
                        }
                      }}
                      onMouseLeave={() => { setHoveredNode(""); setSweepNode(""); }}
                    >
                      <div className="node__header">
                        <div
                          style={{ cursor: "pointer", flex: 1 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void openParseTimeseries(
                              "parse",
                              parseItem.id,
                              `Package ${parseItem.package_name} 节点趋势`,
                              parseItem.package_name,
                            );
                          }}
                        >
                          <div className="node__title">
                            {parseItem.package_name}
                          </div>
                          <div className="node__summary">
                            {fmtRate(parseItem.metrics.log_rate_eps)} /{" "}
                            {fmtCount(parseItem.metrics.log_count)} (汇总) ·{" "}
                            {showLogs.length} 个日志类型
                          </div>
                        </div>
                        <Button
                          size="small"
                          type="text"
                          style={{ opacity: 0.45 }}
                          icon={<ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePackage(parseItem.id);
                          }}
                        />
                      </div>
                      {isExpanded && (
                        <div className="node__children">
                          {showLogs.map((logItem) => (
                            <article
                              key={logItem.id}
                              className={nodeClass(
                                "node__leaf node__leaf--log",
                                logItem.id,
                                "log",
                              )}
                              onMouseEnter={() => setHoveredNode(logItem.id)}
                              onMouseLeave={() => setHoveredNode("")}
                              onClick={(event) => {
                                event.stopPropagation();
                                void openDetail(logItem.id);
                              }}
                            >
                              <div className="node__leaf-head">
                                <div className="node__title">{logItem.name}</div>
                                <div className="metric-inline-badges">
                                  <span className="metric-inline-badge">
                                    速率 {fmtRate(logItem.metrics.log_rate_eps)}
                                  </span>
                                  <span className="metric-inline-badge">
                                    数量 {fmtCount(logItem.metrics.log_count)}
                                  </span>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
                {parseTotalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "8px 0" }}>
                    <Button size="small" disabled={parsePage <= 1} onClick={() => setParsePage((p) => p - 1)}>◀</Button>
                    <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-sub)", padding: "2px 0" }}>
                      {parsePage} / {parseTotalPages} 页
                    </span>
                    <Button size="small" disabled={parsePage >= parseTotalPages} onClick={() => setParsePage((p) => p + 1)}>▶</Button>
                  </div>
                )}
              </div>
            </section>

            <section className="lane">
              <div className="lane-head">
                <div
                  className={`lane-title lane-title-clickable ${selectedNode === "__sink__" ? "selected" : ""}`}
                  onClick={() =>
                    void openParseTimeseries(
                      "sink",
                      "__sink__",
                      "输出层全部节点趋势",
                    )
                  }
                >
                  输出层
                </div>
                <div className="lane-actions">
                  <Button size="small" onClick={() => setExpandedGroups(snapshot.sinks.map((group) => group.id))}>
                    全部展开
                  </Button>
                  <Button size="small" onClick={() => setExpandedGroups([])}>
                    全部收起
                  </Button>
                </div>
              </div>
              <div className="lane-scroll">
                <article
                  className={nodeClass(
                    `node node--miss ${missHasData ? "node--miss-alert" : "node--miss-muted"}`,
                    snapshot.miss.id,
                    "miss",
                  )}
                  onMouseEnter={() => setHoveredNode(snapshot.miss.id)}
                  onMouseLeave={() => setHoveredNode("")}
                  onClick={() => void openDetail(snapshot.miss.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div className="node__title" style={{ marginBottom: 0 }}>{snapshot.miss.name}</div>
                    <div className="metric-badges" style={{ marginTop: 0 }}>
                      <span className="metric-badge">速率 {fmtRate(snapshot.miss.metrics.log_rate_eps)}</span>
                      <span className="metric-badge">数量 {fmtCount(snapshot.miss.metrics.log_count)}</span>
                    </div>
                  </div>
                  <div className="node__sub">未命中任何 WPL 规则 · 不流向任何输出</div>
                </article>
                {snapshot.sinks.map((group) => {
                  const isExpanded = expandedGroups.includes(group.id);
                  const handleGroupClick = () => {
                    void openParseTimeseries(
                      "sink",
                      group.id,
                      `Sink Group ${group.sink_group} 节点趋势`,
                      undefined,
                      group.sink_group,
                    );
                  };
                  return (
                    <section
                      key={group.id}
                      className={nodeClass("node node--group", group.id, "group")}
                      onMouseEnter={(e) => {
                        setHoveredNode(group.id);
                        const related = e.relatedTarget as Element | null;
                        if (!related || !e.currentTarget.contains(related)) {
                          setSweepNode(group.id);
                        }
                      }}
                      onMouseLeave={() => { setHoveredNode(""); setSweepNode(""); }}
                      onClick={handleGroupClick}
                    >
                      <div className="node__header">
                        <div>
                          <div className="node__title">
                            {group.sink_group}
                          </div>
                          <div className="node__summary">
                            {fmtRate(group.metrics.log_rate_eps)} /{" "}
                            {fmtCount(group.metrics.log_count)} · {group.sinks.length}{" "}
                            个输出目标
                          </div>
                        </div>
                        <Button
                          size="small"
                          type="text"
                          style={{ opacity: 0.45 }}
                          icon={<ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleGroup(group.id);
                          }}
                        />
                      </div>
                      {isExpanded && (
                        <div className="node__children">
                          {group.sinks.map((sinkItem) => (
                            <article
                              key={sinkItem.id}
                              className={nodeClass(
                                "node__leaf node__leaf--sink",
                                sinkItem.id,
                                "sink",
                              )}
                              onMouseEnter={() => setHoveredNode(sinkItem.id)}
                              onMouseLeave={() => setHoveredNode("")}
                              onClick={() => void openDetail(sinkItem.id)}
                            >
                              <div className="node__leaf-head">
                                <div className="node__title">{sinkItem.sink_name}</div>
                                <div className="metric-inline-badges">
                                  <span className="metric-inline-badge">
                                    速率 {fmtRate(sinkItem.metrics.log_rate_eps)}
                                  </span>
                                  <span className="metric-inline-badge">
                                    数量 {fmtCount(sinkItem.metrics.log_count)}
                                  </span>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>

      <aside
        ref={detailPanelRef}
        className={`detail-panel card ${selectedNode ? "open" : ""}`}
        style={{ height: `${detailPanelHeight}px` }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-resize-bar">
          <div
            className="detail-drag-handle"
            onPointerDown={onDetailPanelResizeStart}
            title="拖拽调整高度"
          />
        </div>
        <div className="detail-panel-head">
          <div className="detail-panel-head-left">
            <Typography.Text style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--detail-heading-color, var(--accent))" }}>节点详情</Typography.Text>
            {detailNodePill && (
              <span className={`detail-node-pill detail-node-pill--${detailNodePillType}`}>
                {detailNodePill}
              </span>
            )}
          </div>
          <div className="detail-panel-head-right">
            <button
              className="drawer-close"
              onClick={() => {
                setSelectedNode("");
                setParseSeriesList(null);
                setParseSeriesTitle("");
                setDetailNodePill("");
                setHiddenScopeSeriesNames([]);
                setScopeSeriesRequest(null);
                setDetailViewMode("node");
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="detail-panel-body">
          {drawerLoading && <p>详情加载中...</p>}
          {!drawerLoading && drawerError && (
            <p className="error">错误: {drawerError}</p>
          )}
          {!drawerLoading &&
            !drawerError &&
            detailViewMode === "scope" &&
            parseSeriesList && (
              <ScopeTrendPanel
                title={parseSeriesTitle}
                parseSeriesList={parseSeriesList}
                parseMultiSeries={parseMultiSeries}
                visibleParseMultiSeries={visibleParseMultiSeries}
                hiddenScopeSeriesNames={hiddenScopeSeriesNames}
                detailTrendAutoRefresh={detailTrendAutoRefresh}
                detailStartTime={detailStartTime}
                detailEndTime={detailEndTime}
                accentColor={accentColor}
                onToggleAutoRefresh={() =>
                  setDetailTrendAutoRefresh((prev) => !prev)
                }

                onToggleSeries={(name) =>
                  setHiddenScopeSeriesNames((prev) =>
                    prev.includes(name)
                      ? prev.filter((item) => item !== name)
                      : [...prev, name],
                  )
                }
                formatRate2={formatRate2}
                formatLocalTime={formatLocalTime}
              />
            )}
          {!drawerLoading &&
            !drawerError &&
            detailViewMode === "node" &&
            detail && (
              <div className={`detail-grid ${isMissSelected ? "miss-mode" : ""}`}>
                <section className="panel card detail-col">
                  <div className="panel-title">基本信息</div>
                  <div className="detail-name-type-row">
                    <span
                      className="detail-kv-value detail-name-only"
                      title={detail.name}
                    >
                      {detail.name}
                    </span>
                    <span className="detail-type-badge">{detail.node_type}</span>
                  </div>
                  <div className="detail-metric-badges">
                    <span className="detail-metric-badge">
                      速率 {fmtRate(detail.metrics.log_rate_eps)}
                    </span>
                    <span className="detail-metric-badge">
                      数量 {fmtCount(detail.metrics.log_count)}
                    </span>
                  </div>
                  <div className="detail-time-row">
                    <span className="detail-kv-label">时间窗口</span>
                    <span className="detail-kv-value detail-time-value">
                      {formatLocalDateTime(detailStartTime)} -{" "}
                      {formatLocalDateTime(detailEndTime)}
                    </span>
                  </div>
                </section>

                {!isMissSelected && (
                  <section className="panel card detail-col">
                    <div className="panel-head">
                      <div className="panel-head-main">
                        <Typography.Text strong style={{ fontSize: 13, color: "var(--text-sub)" }}>速率趋势</Typography.Text>
                        <Divider orientation="vertical" style={{ margin: "0 2px", borderColor: "rgba(228,77,38,0.18)" }} />
                        <Space size={4}>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>采样间隔</Typography.Text>
                          <Typography.Text style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-sub)" }}>
                            {series?.step_secs ?? 0}s
                          </Typography.Text>
                        </Space>
                        <Space size={4}>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>统计窗口</Typography.Text>
                          <Typography.Text style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-sub)" }}>
                            {series?.rate_window_secs ?? 0}s
                          </Typography.Text>
                        </Space>
                      </div>
                      <Space>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>实时刷新</Typography.Text>
                        <Switch
                          size="small"
                          checked={detailTrendAutoRefresh}
                          onChange={setDetailTrendAutoRefresh}
                        />
                      </Space>
                    </div>
                    <TimeSeriesChart
                      title="速率趋势"
                      points={rateChartPoints}
                      color={accentColor}
                      showTitleValue={false}
                      valueFormatter={formatRate2}
                      axisValueFormatter={formatRate2}
                      minY={0}
                      yTickAmount={6}
                      rangeStartLabel={formatLocalTime(detailStartTime)}
                      rangeEndLabel={formatLocalTime(detailEndTime)}
                      showRangeMeta={false}
                    />
                  </section>
                )}

                {isMissSelected && (
                  <section className="panel card detail-col detail-miss-col">
                    <div className="panel-title">MISS 原始日志</div>
                    <div className="miss-query-toolbar">
                      <Button
                        size="small"
                        onClick={() =>
                          void loadMissedLogs(
                            missWindowStart || detailStartTime,
                            missWindowEnd || detailEndTime,
                            missPage,
                          )
                        }
                        disabled={missLogsLoading}
                      >
                        刷新本页
                      </Button>
                      <Button size="small" onClick={() => void onExportMissed()} disabled={missExporting}>
                        {missExporting ? "导出中..." : "数据导出"}
                      </Button>
                    </div>
                    {missLogsLoading && <p>MISS 日志加载中...</p>}
                    {!missLogsLoading && missLogsError && (
                      <p className="error">错误: {missLogsError}</p>
                    )}
                    {!missLogsLoading &&
                      !missLogsError &&
                      missLogs.length === 0 && <p>当前时间窗口无 MISS 日志</p>}
                    {!missLogsLoading &&
                      !missLogsError &&
                      missLogs.length > 0 && (
                        <>
                          <p className="miss-page-meta">
                            第 {missPage} 页 / 每页 10 条
                            {missHasMore ? "（可继续翻页）" : "（已到末页）"}
                          </p>
                          <div className="miss-scroll">
                            <div className="miss-list">
                              {missPageItems.map((item, index) => {
                                const offset = (missPage - 1) * MISS_PAGE_SIZE;
                                const rowNo = offset + index + 1;
                                return (
                                  <article
                                    key={`${item.time}-${item.stream_id}-${rowNo}`}
                                    className="miss-record"
                                  >
                                    <div className="miss-record-head">
                                      #{rowNo} | {formatLocalDateTime(item.time)}
                                    </div>
                                    <pre className="miss-record-raw">
                                      {item.raw}
                                    </pre>
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                          <div className="miss-pager">
                            <Button size="small" disabled={missPage <= 1 || missLogsLoading} onClick={() => void onPrevMissPage()}>
                              上一页
                            </Button>
                            <Button size="small" disabled={missLogsLoading || !missHasMore} onClick={() => void onNextMissPage()}>
                              下一页
                            </Button>
                          </div>
                        </>
                      )}
                  </section>
                )}
              </div>
            )}

          {!drawerLoading &&
            !drawerError &&
            !detail &&
            detailViewMode === "node" &&
            (!parseSeriesList || parseSeriesList.length === 0) && (
              <p>点击节点查看详情</p>
            )}
          {!drawerLoading &&
            !drawerError &&
            detailViewMode === "scope" &&
            parseSeriesList === null && <p>请选择范围以查看时序</p>}
        </div>
      </aside>
    </div>
  );
}

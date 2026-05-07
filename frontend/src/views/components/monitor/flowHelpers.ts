import type {
  LayerSnapshot,
  MetricsSnapshot,
  NodeMetricsItem,
} from '../../../types/monitor';

export function collectAllNodeIds(snapshot: LayerSnapshot): string[] {
  const ids: string[] = [];
  snapshot.sources.forEach((sourceNode) => ids.push(sourceNode.id));
  snapshot.parses.forEach((parseItem) => {
    ids.push(parseItem.id);
    parseItem.logs.forEach((logItem) => ids.push(logItem.id));
  });
  snapshot.sinks.forEach((group) => {
    ids.push(group.id);
    group.sinks.forEach((sink) => ids.push(sink.id));
  });
  ids.push(snapshot.miss.id);
  return ids;
}

export function applyMetricsToSnapshot(
  snapshot: LayerSnapshot,
  items: NodeMetricsItem[],
): LayerSnapshot {
  const map = new Map<string, MetricsSnapshot>(
    items.map((item) => [item.node_id, item.metrics]),
  );

  const nextSources = snapshot.sources.map((sourceNode) => ({
    ...sourceNode,
    metrics: map.get(sourceNode.id) ?? sourceNode.metrics,
  }));

  const nextParses = snapshot.parses.map((parseItem) => {
    const nextLogs = parseItem.logs.map((logItem) => ({
      ...logItem,
      metrics: map.get(logItem.id) ?? logItem.metrics,
    }));
    return {
      ...parseItem,
      metrics: map.get(parseItem.id) ?? parseItem.metrics,
      logs: nextLogs,
    };
  });

  const nextSinks = snapshot.sinks.map((group) => {
    const nextLeaves = group.sinks.map((sink) => ({
      ...sink,
      metrics: map.get(sink.id) ?? sink.metrics,
    }));
    return {
      ...group,
      metrics: map.get(group.id) ?? group.metrics,
      sinks: nextLeaves,
    };
  });

  return {
    ...snapshot,
    sources: nextSources,
    parses: nextParses,
    sinks: nextSinks,
    miss: {
      ...snapshot.miss,
      metrics: map.get(snapshot.miss.id) ?? snapshot.miss.metrics,
    },
  };
}

export function fmtRate(value: number) {
  return `${value.toFixed(2)} e/s`;
}

export function fmtCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}

export function fmtPercentWithMin(value: number, digits = 2) {
  if (!Number.isFinite(value)) return (0).toFixed(digits);
  const min = 10 ** (-digits);
  if (value > 0 && value < min) return min.toFixed(digits);
  return value.toFixed(digits);
}

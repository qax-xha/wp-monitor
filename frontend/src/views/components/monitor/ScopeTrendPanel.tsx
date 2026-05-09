import { Divider, Space, Switch, Typography } from "antd";
import TimeSeriesChart from "@/views/components/monitor/TimeSeriesChart";
import type { NodeTimeSeries, TimePoint } from "@/types/monitor";

interface ScopeSeriesLine {
  name: string;
  points: TimePoint[];
  color?: string;
}

interface ScopeTrendPanelProps {
  title: string;
  parseSeriesList: NodeTimeSeries[];
  parseMultiSeries: ScopeSeriesLine[];
  visibleParseMultiSeries: ScopeSeriesLine[];
  hiddenScopeSeriesNames: string[];
  detailTrendAutoRefresh: boolean;
  detailStartTime: string;
  detailEndTime: string;
  onToggleAutoRefresh: () => void;
  onToggleSeries: (name: string) => void;
  formatRate2: (value: number) => string;
  formatLocalTime: (iso: string) => string;
}

export default function ScopeTrendPanel({
  parseSeriesList,
  parseMultiSeries,
  visibleParseMultiSeries,
  hiddenScopeSeriesNames,
  detailTrendAutoRefresh,
  detailStartTime,
  detailEndTime,
  onToggleAutoRefresh,
  onToggleSeries,
  formatRate2,
  formatLocalTime,
}: ScopeTrendPanelProps) {
  return (
    <section className="panel card detail-col">
      <div className="panel-head">
        <div className="panel-head-main">
          <Typography.Text strong style={{ fontSize: 13, color: "var(--text-sub)" }}>{"节点趋势"}</Typography.Text>
          <Divider orientation="vertical" style={{ margin: "0 2px", borderColor: "rgba(228,77,38,0.18)" }} />
          <Space size={4}>
            <Typography.Text style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-sub)" }}>采样间隔</Typography.Text>
            <Typography.Text style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
              {parseSeriesList[0]?.step_secs
                ? `${parseSeriesList[0].step_secs}s`
                : "--"}
            </Typography.Text>
          </Space>
          <Space size={4}>
            <Typography.Text style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-sub)" }}>统计窗口</Typography.Text>
            <Typography.Text style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
              {parseSeriesList[0]?.rate_window_secs
                ? `${parseSeriesList[0].rate_window_secs}s`
                : "--"}
            </Typography.Text>
          </Space>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>实时刷新</Typography.Text>
          <Switch size="small" checked={detailTrendAutoRefresh} onChange={onToggleAutoRefresh} />
        </span>
      </div>
      {parseMultiSeries.length > 0 && (
        <>
          <div
            style={{
              margin: "0 0 4px",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px 12px",
            }}
          >
            {parseMultiSeries.map((line) => {
              const hidden = hiddenScopeSeriesNames.includes(line.name);
              return (
                <span
                  key={line.name}
                  onClick={() => onToggleSeries(line.name)}
                  title={hidden ? "点击显示该曲线" : "点击隐藏该曲线"}
                  style={{
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    color: hidden ? "var(--text-muted)" : "var(--text-sub)",
                    textDecoration: hidden ? "line-through" : "none",
                    userSelect: "none",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: hidden ? "var(--text-muted)" : (line.color ?? "#e44d26"),
                      flexShrink: 0,
                    }}
                  />
                  {line.name}
                </span>
              );
            })}
          </div>
        </>
      )}
      <TimeSeriesChart
        title="速率趋势"
        points={[]}
        multiSeries={visibleParseMultiSeries}
        showLegend={false}
        color="#e44d26"
        showTitleValue={false}
        valueFormatter={formatRate2}
        axisValueFormatter={formatRate2}
        minY={0}
        yTickAmount={6}
        rangeStartLabel={formatLocalTime(detailStartTime)}
        rangeEndLabel={formatLocalTime(detailEndTime)}
        showRangeMeta={false}
      />
      {parseMultiSeries.length === 0 && (
        <div className="scope-empty-hint">当前范围暂无节点时序数据</div>
      )}
      {parseMultiSeries.length > 0 && visibleParseMultiSeries.length === 0 && (
        <div className="scope-empty-hint">当前已隐藏全部曲线</div>
      )}
    </section>
  );
}

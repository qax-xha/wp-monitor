import { Spin } from "antd";
import TimeSeriesChart from "@/views/components/monitor/TimeSeriesChart";
import type { TimePoint } from "@/types/monitor";

interface ScopeSeriesLine {
  name: string;
  points: TimePoint[];
  color?: string;
}

interface ScopeTrendPanelProps {
  parseMultiSeries: ScopeSeriesLine[];
  visibleParseMultiSeries: ScopeSeriesLine[];
  hiddenScopeSeriesNames: string[];
  detailStartTime: string;
  detailEndTime: string;
  accentColor: string;
  onToggleSeries: (name: string) => void;
  formatRate2: (value: number) => string;
  loading?: boolean;
}

export default function ScopeTrendPanel({
  parseMultiSeries,
  visibleParseMultiSeries,
  hiddenScopeSeriesNames,
  detailStartTime: _detailStartTime,
  detailEndTime: _detailEndTime,
  accentColor,
  onToggleSeries,
  formatRate2,
  loading = false,
}: ScopeTrendPanelProps) {
  return (
    <section className="detail-col">
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
                      background: hidden ? "var(--text-muted)" : (line.color ?? accentColor),
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
      <Spin spinning={loading}>
        <TimeSeriesChart
          title="速率趋势"
          points={[]}
          multiSeries={visibleParseMultiSeries}
          showLegend={false}
          color={accentColor}
          showTitleValue={false}
          valueFormatter={formatRate2}
          axisValueFormatter={formatRate2}
          minY={0}
          yTickAmount={6}
        />
      </Spin>
      {parseMultiSeries.length === 0 && (
        <div className="scope-empty-hint">当前范围暂无节点时序数据</div>
      )}
      {parseMultiSeries.length > 0 && visibleParseMultiSeries.length === 0 && (
        <div className="scope-empty-hint">当前已隐藏全部曲线</div>
      )}
    </section>
  );
}

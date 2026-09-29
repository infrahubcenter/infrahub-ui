import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Generalizes the 3 independent inline recharts implementations found in
// vms/[id]/monitoring/page.tsx (PercentLineChart/NetworkLineChart),
// databases/[id]/page.tsx (MetricsHistoryChart/PerformanceHistoryChart/the
// inline Size History chart in StorageTab) and
// object-storage/[id]/page.tsx (the inline History chart in PerformanceTab)
// -- per Step 19 decision #11, only the new /monitoring dashboard consumes
// this; the 3 source pages are left exactly as they were.
//
// Verified against all 3 sources: `dot={false}` and `connectNulls={false}`
// are consistent everywhere (no discrepancy). `isAnimationActive` is the one
// real behavioral difference -- VM's charts leave it unset (recharts default
// `true`), while every Database/Object-Storage chart explicitly passes
// `false`. This component defaults to `true` (matching VM, per the approved
// plan), and callers that want the Database/Object-Storage behavior should
// pass `isAnimationActive={false}` explicitly.
export type SeriesPoint = { t: string; [key: string]: number | string | null };

export type SeriesDef = { dataKey: string; name?: string; color: string };

export type TimeSeriesChartProps = {
  data: SeriesPoint[];
  /** 1 series = percent/value charts; 2 = network (rx/tx) or ops+errors style. */
  series: SeriesDef[];
  /** Pass [0,100] for VM's percent mode; omit for auto-domain (Database/Object Storage behavior). */
  yDomain?: [number, number];
  /**
   * YAxis pixel width. Sources vary this per chart shape (36 for plain
   * percent/value charts, 48-56 when `yTickFormatter` renders longer
   * byte/rate labels) -- default matches the plain-value sources' own 36.
   */
  yAxisWidth?: number;
  yTickFormatter?: (v: number) => string;
  tooltipFormatter?: (value: number) => string;
  /** Required -- no default, so each caller states its own exact copy rather than silently drifting. */
  emptyMessage: string;
  isAnimationActive?: boolean;
};

export function TimeSeriesChart({
  data,
  series,
  yDomain,
  yAxisWidth = 36,
  yTickFormatter,
  tooltipFormatter,
  emptyMessage,
  isAnimationActive = true,
}: TimeSeriesChartProps) {
  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">{emptyMessage}</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis
          domain={yDomain}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={yAxisWidth}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          formatter={(value) =>
            value === null || value === undefined
              ? "N/A"
              : tooltipFormatter
                ? tooltipFormatter(Number(value))
                : Number(value).toFixed(1)
          }
        />
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={isAnimationActive}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

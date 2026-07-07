import { createFileRoute, Link as RouterLink } from '@tanstack/react-router';
import {
  Box,
  Container,
  Paper,
  Typography,
  Grid,
  Button,
  Alert,
  AlertTitle,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  FormControl,
  Breadcrumbs,
  Collapse,
  IconButton,
  Divider,
  Stack,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { type ReactNode, useState, useEffect, useMemo } from 'react';
import { useDetailQuery } from '../../hooks/useDetailQuery';
import { useDataFromSource } from '../../hooks/useDataFromSource';
import { cleanPath } from '../../utils/queryParams.utils';
import Plot from 'react-plotly.js';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import MemoryIcon from '@mui/icons-material/Memory';
import {
  buildComputePerformanceSnapshot,
  buildRecentJobPerformanceRows,
  findUserJobMetadataById,
  getJobPerformanceSummary,
  type ComputeMetricsByJob,
  type IrisJobData,
  type JobGridRow,
  type LegacyUserJobData,
  type MetricStats,
  type NetworkPerformanceSnapshot,
  type PerformanceSnapshot,
} from './-controllers/recentJobPerformance.controller';

export const Route = createFileRoute('/user-job-performance-alphaver/$id')({
  component: JobPerformanceDetailPage,
});

interface MetricsRow {
  'Job ID': number;
  'Floored Relative Time': number;
  nersc_ldms_dcgm_gpu_utilization?: number | null;
  nersc_ldms_dcgm_dram_active?: number | null;
  [key: string]: number | null | undefined;
}

type MetricsByJob = Record<string, MetricsRow[]>;

interface JobExportMetricRow {
  timestamp?: string | number;
  hostname?: string;
  gpu_id?: number | string;
  nersc_ldms_dcgm_gr_engine_active?: number | string | null;
  nersc_ldms_dcgm_gpu_utilization?: number | string | null;
  nersc_ldms_dcgm_fb_used?: number | string | null;
  [key: string]: number | string | null | undefined;
}

interface JobMetricsExport {
  job_id?: number | string;
  data?: JobExportMetricRow[];
  [key: string]: JobExportMetricRow[] | string | number | null | undefined;
}

type JobMetricsCacheSource = JobMetricsExport | JobExportMetricRow[];

interface GpuUtilizationRangePoint {
  time: number;
  timestamp: string;
  min: number;
  median: number;
  max: number;
}

type ResourceGranularity = 'job' | 'node' | 'gpu';

type JobMetadata = Partial<LegacyUserJobData & IrisJobData> & {
  'Job ID'?: number;
  Project?: string;
  QOS?: string;
};

interface PowerMetricRow {
  [key: string]: number | string | null | undefined;
}

interface PowerConsumptionSummary {
  nodePower: number | null;
  cpuPower: number | null;
  gpuPower: number | null;
  memoryPower: number | null;
}

interface RuntimeDistributionSegment {
  label: string;
  share: number;
  color: string;
}

type UtilizationNodeRow = {
  node: string;
  color: string;
  symbol: NodeMarker;
  time: number[];
  cpuSeries: number[];
  gpuSeries: number[];
  cpuMean: number;
  cpuMin: number;
  cpuMax: number;
  gpuMean: number;
  gpuMin: number;
  gpuMax: number;
};

type UtilizationDetailRow = {
  id: string;
  label: string;
  color: string;
  symbol: NodeMarker;
  cpu: number | null;
  gpu: number | null;
};

type GpuMemoryNodeRow = {
  node: string;
  color: string;
  symbol: NodeMarker;
  time: number[];
  memorySeries: Array<number | null>;
  memoryMean: number | null;
  memoryMin: number | null;
  memoryMax: number | null;
};

type GpuMemoryDetailRow = {
  id: string;
  label: string;
  color: string;
  symbol: NodeMarker;
  memory: number | null;
};

const COLOR_TOKENS = {
  pageBg: '#f3f4f6',
  textPrimary: '#111827',
  textSecondary: '#4b5563',
  neutralTrack: '#d1d5db',
  vizGray: '#9ca3af',
  throughputFill: '#0a3a68',
  cpu: '#3b82f6',
  gpu: '#10b981',
  memory: '#f59e0b',
  network: '#8b5cf6',
  link: '#2563eb',
} as const;

const TITLE_SX = {
  fontWeight: 700,
  color: COLOR_TOKENS.textPrimary,
  letterSpacing: '-0.01em',
};

const SECTION_TITLE_SX = {
  fontWeight: 700,
  color: COLOR_TOKENS.textPrimary,
};

const ACTION_LINK_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.75,
  color: COLOR_TOKENS.link,
  fontWeight: 500,
  textDecoration: 'none',
};

const METRIC_CHIP_BASE_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
  px: 1.5,
  py: 0.65,
  borderRadius: '999px',
  cursor: 'pointer',
};

const METRIC_CHIP_LABEL_SX = {
  fontSize: '0.875rem',
  fontWeight: 600,
  lineHeight: 1.2,
};

const METRIC_CHIP_ICON_SX = {
  fontSize: 18,
};

const SECTION_TOGGLE_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  cursor: 'pointer',
  py: 0.5,
};

const PERFORMANCE_SNAPSHOT_ROWS = [
  { key: 'gpuUtilization', label: 'GPU utilization', unit: '%' },
  { key: 'cpuUtilization', label: 'CPU utilization', unit: '%' },
  { key: 'gpuMemoryBandwidth', label: 'GPU Memory Bandwidth', unit: '%' },
  { key: 'cpuMemoryBandwidth', label: 'CPU Memory Bandwidth', unit: '%' },
] as const;

const NETWORK_PERFORMANCE_ROWS = [
  { key: 'pcieThroughput', label: 'PCIe Throughput', unit: 'GB/s' },
  { key: 'nvlinkThroughput', label: 'NVLink Throughput', unit: 'GB/s' },
  { key: 'slingshotThroughput', label: 'Slingshot Throughput', unit: 'GB/s' },
] as const;

const POWER_CONSUMPTION_ROWS = [
  { key: 'nodePower', label: 'Node Power', unit: 'W' },
  { key: 'cpuPower', label: 'CPU Power', unit: 'W' },
  { key: 'gpuPower', label: 'GPU Power', unit: 'W' },
  { key: 'memoryPower', label: 'Memory Power', unit: 'W' },
] as const;

const detailDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

const parseJobTimestamp = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value.replace(' ', 'T'));

  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
};

const formatJobDateTime = (value?: string | null) => {
  const timestamp = parseJobTimestamp(value);

  return timestamp ? detailDateTimeFormatter.format(timestamp) : value ?? 'N/A';
};

const toFiniteNumber = (value: unknown) => {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
};

const formatNumber = (value: number | null | undefined, fractionDigits = 0) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'N/A';
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
};

const formatSnapshotValue = (value: number | null, unit: string) => {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A';
  }

  const formattedValue = value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });

  return unit === '%' ? `${formattedValue}%` : `${formattedValue} ${unit}`;
};

const getUtilizationBarColor = (value: number) => {
  if (value >= 70) {
    return '#16a34a';
  }

  if (value >= 40) {
    return '#d29731';
  }

  return '#dc2626';
};

const getAverageValue = (values: number[]) => {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getAverageFromRows = (
  rows: PowerMetricRow[] | undefined,
  metricKey: string
) => getAverageValue(
  (rows ?? [])
    .map((row) => row[metricKey])
    .filter((value): value is number => (
      typeof value === 'number' && Number.isFinite(value)
    ))
);

const getAverageFromMetricAliases = (
  rows: MetricsByJob[string] | undefined,
  aliases: string[]
) => {
  for (const alias of aliases) {
    const averageValue = getAverageValue(
      (rows ?? [])
        .map((row) => row[alias])
        .filter((value): value is number => (
          typeof value === 'number' && Number.isFinite(value)
        ))
    );

    if (averageValue !== null) {
      return averageValue;
    }
  }

  return null;
};

const getPowerConsumptionSummary = ({
  jobId,
  metricsByJob,
  nodePowerRows,
  cpuPowerRows,
  gpuPowerRows,
  memoryPowerRows,
}: {
  jobId: string;
  metricsByJob: MetricsByJob | undefined;
  nodePowerRows: PowerMetricRow[] | undefined;
  cpuPowerRows: PowerMetricRow[] | undefined;
  gpuPowerRows: PowerMetricRow[] | undefined;
  memoryPowerRows: PowerMetricRow[] | undefined;
}): PowerConsumptionSummary => {
  const metricRows = metricsByJob?.[jobId];

  return {
    nodePower: getAverageFromMetricAliases(metricRows, [
      'nersc_ldms_node_power',
    ]) ?? getAverageFromRows(nodePowerRows, 'node_power'),
    cpuPower: getAverageFromMetricAliases(metricRows, [
      'nersc_ldms_cpu_power',
    ]) ?? getAverageFromRows(cpuPowerRows, 'cpu_power'),
    gpuPower: getAverageFromMetricAliases(metricRows, [
      'nersc_ldms_dcgm_power_usage',
      'nersc_ldms_gpu_power',
    ]) ?? getAverageFromRows(gpuPowerRows, 'gpu_power'),
    memoryPower: getAverageFromMetricAliases(metricRows, [
      'nersc_ldms_memory_power',
    ]) ?? getAverageFromRows(memoryPowerRows, 'memory_power'),
  };
};

const getFiniteMetricStatsValues = (stats: MetricStats) => (
  [stats.min, stats.max, stats.median]
    .filter((value): value is number => (
      typeof value === 'number' && Number.isFinite(value)
    ))
);

const getMetricRangeDomain = (
  stats: MetricStats,
  unit: string
): [number, number] => {
  const values = getFiniteMetricStatsValues(stats);

  if (!values.length) {
    return [0, 1];
  }

  if (unit === '%') {
    return [0, 100];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.1, 1);

    return [Math.max(0, min - padding), max + padding];
  }

  const padding = (max - min) * 0.08;

  return [Math.max(0, min - padding), max + padding];
};

const getMetricRangePosition = (
  value: number | null,
  domain: [number, number]
) => {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }

  const [domainMin, domainMax] = domain;
  const domainRange = domainMax - domainMin;

  if (domainRange <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, ((value - domainMin) / domainRange) * 100));
};

const getLocalDataSourcePath = (dataSource: string) => {
  const base = document.querySelector('base')?.getAttribute('href') ?? '';
  const basePath = import.meta.env.VITE_BASE_URL || '';
  const leadingSlash = basePath ? '/' : '';
  const basename = cleanPath(leadingSlash + base + basePath);

  return `${basename}/${dataSource}`;
};

function useJobMetricsExport(jobId: string) {
  const [jobMetricsExportState, setJobMetricsExportState] =
    useState<{ jobId: string; data: JobMetricsExport } | undefined>();

  useEffect(() => {
    let isActive = true;

    if (!jobId) {
      setJobMetricsExportState(undefined);
      return () => {
        isActive = false;
      };
    }

    const fetchJobMetricsExport = async () => {
      const dataSourcePath = getLocalDataSourcePath(
        `data/user-job-performance/job_exports/job_${jobId}.json`
      );

      try {
        const response = await fetch(dataSourcePath);

        if (!response.ok) {
          if (isActive) {
            setJobMetricsExportState(undefined);
          }
          return;
        }

        const data = (await response.json()) as JobMetricsExport;

        if (isActive) {
          setJobMetricsExportState({ jobId, data });
        }
      } catch {
        if (isActive) {
          setJobMetricsExportState(undefined);
        }
      }
    };

    setJobMetricsExportState(undefined);
    fetchJobMetricsExport();

    return () => {
      isActive = false;
    };
  }, [jobId]);

  return jobMetricsExportState?.jobId === jobId
    ? jobMetricsExportState.data
    : undefined;
}

const getJobMetricsExportRows = (source?: JobMetricsCacheSource) =>
  Array.isArray(source) ? source : source?.data ?? [];

function PerformanceSummaryGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        p: 2,
        height: '100%',
        boxSizing: 'border-box',
        borderRadius: 2,
        border: '1px solid #e2e8f0',
        bgcolor: '#ffffff',
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
        {title}
      </Typography>
      <Divider sx={{ mb: 0.5 }} />
      {children}
    </Box>
  );
}

function AverageMetricRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        py: 1,
      }}
    >
      <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>
        Avg. {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: value === null ? '#94a3b8' : '#111827',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {formatSnapshotValue(value, unit)}
      </Typography>
    </Box>
  );
}

function ComputeMetricRangeRow({
  label,
  stats,
  unit,
}: {
  label: string;
  stats: MetricStats;
  unit: string;
}) {
  const hasValues = getFiniteMetricStatsValues(stats).length > 0;
  const domain = getMetricRangeDomain(stats, unit);
  const minPosition = getMetricRangePosition(stats.min, domain);
  const maxPosition = getMetricRangePosition(stats.max, domain);
  const medianPosition = getMetricRangePosition(stats.median, domain);
  const rangeLeft = Math.min(minPosition, maxPosition);
  const rangeWidth = Math.abs(maxPosition - minPosition);
  const medianValue = stats.median ?? stats.avg ?? 0;
  const medianColor = getUtilizationBarColor(
    unit === '%' ? Math.max(0, Math.min(100, medianValue)) : medianValue
  );

  return (
    <Box sx={{ py: 1.35 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
          mb: 0.9,
        }}
      >
        <Typography variant="body2" sx={{ color: '#475569', fontWeight: 700 }}>
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: stats.median === null ? '#94a3b8' : '#111827',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          Median {formatSnapshotValue(stats.median, unit)}
        </Typography>
      </Box>

      {hasValues ? (
        <>
          <Box
            aria-label={`${label}: min ${formatSnapshotValue(
              stats.min,
              unit
            )}, median ${formatSnapshotValue(stats.median, unit)}, max ${formatSnapshotValue(
              stats.max,
              unit
            )}`}
            role="img"
            sx={{
              position: 'relative',
              height: 10,
              bgcolor: '#e2e7ef',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                left: `${rangeLeft}%`,
                top: 0,
                width: rangeWidth < 1 ? 6 : `${rangeWidth}%`,
                height: '100%',
                bgcolor: '#94a3b8',
                borderRadius: 999,
                transform: rangeWidth < 1 ? 'translateX(-50%)' : undefined,
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                left: `${medianPosition}%`,
                top: 0,
                width: 8,
                height: '100%',
                bgcolor: medianColor,
                borderRadius: 999,
                boxShadow: '0 0 0 1px rgba(255,255,255,0.95)',
                transform: 'translateX(-50%)',
              }}
            />
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 1,
              mt: 0.65,
            }}
          >
            {[
              { label: 'Min', value: stats.min, align: 'left' },
              { label: 'Median', value: stats.median, align: 'center' },
              { label: 'Max', value: stats.max, align: 'right' },
            ].map((item) => (
              <Typography
                key={item.label}
                variant="caption"
                sx={{
                  color: item.value === null ? '#94a3b8' : '#64748b',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: item.align,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label} {formatSnapshotValue(item.value, unit)}
              </Typography>
            ))}
          </Box>
        </>
      ) : (
        <Typography variant="body2" sx={{ color: '#94a3b8' }}>
          N/A
        </Typography>
      )}
    </Box>
  );
}

function ComputePerformanceGroup({
  snapshot,
}: {
  snapshot: PerformanceSnapshot;
}) {
  return (
    <PerformanceSummaryGroup title="Compute Performance">
      <Stack divider={<Divider flexItem />} spacing={0}>
        {PERFORMANCE_SNAPSHOT_ROWS.map((row) => (
          <ComputeMetricRangeRow
            key={row.key}
            label={row.label}
            stats={snapshot[row.key]}
            unit={row.unit}
          />
        ))}
      </Stack>
    </PerformanceSummaryGroup>
  );
}

function PowerConsumptionGroup({
  powerConsumption,
}: {
  powerConsumption: PowerConsumptionSummary;
}) {
  return (
    <PerformanceSummaryGroup title="Power Consumption">
      <Stack divider={<Divider flexItem />} spacing={0}>
        {POWER_CONSUMPTION_ROWS.map((row) => (
          <AverageMetricRow
            key={row.key}
            label={row.label}
            value={powerConsumption[row.key]}
            unit={row.unit}
          />
        ))}
      </Stack>
    </PerformanceSummaryGroup>
  );
}

function NetworkPerformanceGroup({
  networkPerformance,
}: {
  networkPerformance: NetworkPerformanceSnapshot;
}) {
  return (
    <PerformanceSummaryGroup title="Network Performance">
      <Stack divider={<Divider flexItem />} spacing={0}>
        {NETWORK_PERFORMANCE_ROWS.map((row) => {
          const metric = networkPerformance[row.key];

          return (
            <Box
              key={row.key}
              sx={{
                pt: 1.75,
                pb: 1.25,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700 }}>
                  Total {row.label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: metric.total === null ? '#94a3b8' : '#111827',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatSnapshotValue(metric.total, row.unit)}
                </Typography>
              </Box>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {[
                  { label: 'Avg. Upload (tx)', value: metric.avgUpload },
                  { label: 'Avg. Download (rx)', value: metric.avgDownload },
                ].map((subMetric) => (
                  <Box
                    key={subMetric.label}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                      minHeight: 34,
                      px: 1,
                      py: 0.75,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        color: '#64748b',
                        fontWeight: 700,
                        lineHeight: 1.2,
                        minWidth: 0,
                      }}
                    >
                      {subMetric.label}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: subMetric.value === null ? '#94a3b8' : '#111827',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        fontVariantNumeric: 'tabular-nums',
                        lineHeight: 1.35,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatSnapshotValue(subMetric.value, row.unit)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </PerformanceSummaryGroup>
  );
}

function RuntimeResourceDistributionGroup({
  segments,
}: {
  segments: RuntimeDistributionSegment[];
}) {
  return (
    <PerformanceSummaryGroup title="Runtime Resource Distribution">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'minmax(0, 1fr) minmax(160px, 220px)',
            lg: 'minmax(0, 0.9fr) minmax(180px, 1fr)',
          },
          gap: 2,
          alignItems: 'center',
        }}
      >
        <Stack spacing={1.25}>
          {segments.map((segment) => (
            <Box
              key={segment.label}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                minHeight: 32,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <MemoryIcon sx={{ color: segment.color, fontSize: 18, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700 }}>
                  {segment.label}
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  color: '#475569',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {segment.share.toFixed(1)}%
              </Typography>
            </Box>
          ))}
          <Link href="#" sx={{ ...ACTION_LINK_SX, mt: 1 }}>
            Learn about Efficient Resource Distribution <ArrowForwardIcon />
          </Link>
        </Stack>
        <Plot
          data={[
            {
              type: 'pie',
              hole: 0.58,
              values: segments.map((segment) => segment.share),
              labels: segments.map((segment) => segment.label),
              text: segments.map((segment) => `${segment.share.toFixed(1)}%`),
              textinfo: 'text',
              texttemplate:
                '<span style="font-weight:600">%{label}</span><br><span style="font-weight:600">%{text}</span>',
              textposition: 'inside',
              insidetextfont: { color: '#ffffff', family: 'inherit', size: 11 },
              textfont: { color: '#ffffff', family: 'inherit', size: 12 },
              insidetextorientation: 'horizontal',
              sort: false,
              marker: {
                colors: segments.map((segment) => segment.color),
                line: { color: '#ffffff', width: 4 },
              },
              hoverinfo: 'label+percent',
              showlegend: false,
            },
          ]}
          layout={{
            autosize: true,
            height: 220,
            margin: { l: 0, r: 0, t: 0, b: 0 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
          }}
          config={{ responsive: true, displayModeBar: false }}
          style={{ width: '100%' }}
        />
      </Box>
    </PerformanceSummaryGroup>
  );
}

const GPU_MEMORY_METRIC_NAME = 'nersc_ldms_dcgm_fb_used';
const GPU_MEMORY_BROWSER_CACHE_VERSION = 1;

type GpuMemoryMetricsFetchStatus = 'idle' | 'loading' | 'success' | 'error';

interface JobGpuMemoryMetricsApiResponse {
  jobId?: number | string;
  metricName?: string;
  machineId?: string;
  data?: JobExportMetricRow[];
  error?: string;
}

interface GpuMemoryBrowserCachePayload {
  version: number;
  jobId: string;
  metricName: string;
  userId?: string;
  machineId?: string;
  savedAt: string;
  data: JobMetricsExport;
}

const getGpuMemoryBrowserCacheKey = (
  jobId: string,
  machineId?: string,
  userId?: string
) =>
  [
    'user-job-performance',
    'gpu-memory',
    GPU_MEMORY_METRIC_NAME,
    jobId,
    userId || 'default-user',
    machineId || 'default-machine',
  ].join(':');

const readGpuMemoryBrowserCache = (
  jobId: string,
  machineId?: string,
  userId?: string
): JobMetricsExport | undefined => {
  try {
    const cachedValue = window.localStorage.getItem(
      getGpuMemoryBrowserCacheKey(jobId, machineId, userId)
    );

    if (!cachedValue) {
      return undefined;
    }

    const payload = JSON.parse(cachedValue) as GpuMemoryBrowserCachePayload;

    if (
      payload.version !== GPU_MEMORY_BROWSER_CACHE_VERSION ||
      payload.jobId !== jobId ||
      payload.metricName !== GPU_MEMORY_METRIC_NAME
    ) {
      return undefined;
    }

    return payload.data;
  } catch {
    return undefined;
  }
};

const writeGpuMemoryBrowserCache = (
  jobId: string,
  data: JobMetricsExport,
  machineId?: string,
  userId?: string
) => {
  try {
    const payload: GpuMemoryBrowserCachePayload = {
      version: GPU_MEMORY_BROWSER_CACHE_VERSION,
      jobId,
      metricName: GPU_MEMORY_METRIC_NAME,
      userId,
      machineId,
      savedAt: new Date().toISOString(),
      data,
    };

    window.localStorage.setItem(
      getGpuMemoryBrowserCacheKey(jobId, machineId, userId),
      JSON.stringify(payload)
    );
  } catch {
    // Browser storage can be unavailable; the in-memory state still works.
  }
};

const removeGpuMemoryBrowserCache = (
  jobId: string,
  machineId?: string,
  userId?: string
) => {
  try {
    window.localStorage.removeItem(
      getGpuMemoryBrowserCacheKey(jobId, machineId, userId)
    );
  } catch {
    // Browser storage can be unavailable; nothing else is needed here.
  }
};

const getMetricsApiUserId = (value?: string | null) => {
  const trimmedValue = value?.trim();

  if (
    !trimmedValue ||
    trimmedValue === 'N/A' ||
    trimmedValue.includes(',') ||
    /\s/.test(trimmedValue)
  ) {
    return undefined;
  }

  return trimmedValue;
};

function useJobGpuMemoryMetrics(
  jobId: string,
  machineId?: string,
  userId?: string
) {
  const [gpuMemoryMetricsState, setGpuMemoryMetricsState] =
    useState<{
      jobId: string;
      data?: JobMetricsExport;
      status: GpuMemoryMetricsFetchStatus;
      error?: string;
    }>({ jobId, status: 'idle' });

  useEffect(() => {
    let isActive = true;
    const abortController = new AbortController();

    if (!jobId) {
      setGpuMemoryMetricsState({ jobId, status: 'idle' });
      return () => {
        isActive = false;
        abortController.abort();
        removeGpuMemoryBrowserCache(jobId, machineId, userId);
      };
    }

    const cachedData = readGpuMemoryBrowserCache(jobId, machineId, userId);

    if (cachedData) {
      setGpuMemoryMetricsState({
        jobId,
        data: cachedData,
        status: 'success',
      });
      return () => {
        isActive = false;
        abortController.abort();
        removeGpuMemoryBrowserCache(jobId, machineId, userId);
      };
    }

    const fetchGpuMemoryMetrics = async () => {
      setGpuMemoryMetricsState({ jobId, status: 'loading' });

      try {
        const queryParams = new URLSearchParams({
          jobId,
        });

        if (machineId) {
          queryParams.set('machineId', machineId);
        }
        if (userId) {
          queryParams.set('userId', userId);
        }

        const response = await fetch(
          `/api/user-job-performance/job-gpu-memory?${queryParams.toString()}`,
          { signal: abortController.signal }
        );

        if (!response.ok) {
          throw new Error(`GPU memory request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as JobGpuMemoryMetricsApiResponse;

        if (payload.error) {
          throw new Error(payload.error);
        }

        const data: JobMetricsExport = {
          job_id: payload.jobId ?? jobId,
          data: payload.data ?? [],
        };

        writeGpuMemoryBrowserCache(
          jobId,
          data,
          payload.machineId ?? machineId,
          userId
        );

        if (isActive) {
          setGpuMemoryMetricsState({
            jobId,
            data,
            status: 'success',
          });
        }
      } catch (error) {
        if (isActive && !abortController.signal.aborted) {
          setGpuMemoryMetricsState({
            jobId,
            status: 'error',
            error:
              error instanceof Error
                ? error.message
                : 'Unable to fetch GPU memory metrics.',
          });
        }
      }
    };

    fetchGpuMemoryMetrics();

    return () => {
      isActive = false;
      abortController.abort();
      removeGpuMemoryBrowserCache(jobId, machineId, userId);
    };
  }, [jobId, machineId, userId]);

  return gpuMemoryMetricsState.jobId === jobId
    ? gpuMemoryMetricsState
    : { jobId, status: 'idle' as GpuMemoryMetricsFetchStatus };
}

const formatDurationFromSeconds = (seconds: unknown) => {
  const numericSeconds = toFiniteNumber(seconds);

  if (numericSeconds === null) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round(numericSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
};

const formatDurationBetween = (startTime?: string, endTime?: string) => {
  const startTimestamp = parseJobTimestamp(startTime);
  const endTimestamp = parseJobTimestamp(endTime);

  if (!startTimestamp || !endTimestamp) {
    return null;
  }

  return formatDurationFromSeconds(
    (endTimestamp.getTime() - startTimestamp.getTime()) / 1000
  );
};

const buildJobDetailItems = (
  selectedJob: JobGridRow | null,
  metadata?: JobMetadata
) => {
  const submitTime =
    selectedJob?.submitTime ??
    metadata?.['Submit Time'] ??
    metadata?.['Start Time'];
  const startTime = selectedJob?.startTime ?? metadata?.['Start Time'];
  const endTime = selectedJob?.endTime ?? metadata?.['End Time'];
  const duration =
    selectedJob?.executionTime ??
    formatDurationFromSeconds(metadata?.['Elapsed secs']) ??
    formatDurationBetween(startTime, endTime) ??
    'N/A';
  const nodeCount =
    selectedJob?.nodeCount ??
    toFiniteNumber(metadata?.['No. of nodes Allocated']);
  const nodeHours =
    selectedJob?.nodeHours ??
    toFiniteNumber(
      metadata?.['Node hours charged'] ?? metadata?.['Charged Node Hours']
    );

  return [
    { label: 'Submit time', value: formatJobDateTime(submitTime) },
    { label: 'End time', value: formatJobDateTime(endTime) },
    { label: 'Wait time', value: selectedJob?.waitTime ?? 'N/A' },
    { label: 'Run time', value: duration },
    {
      label: 'Job status',
      value:
        selectedJob?.jobStatus ??
        metadata?.['Job Status'] ??
        metadata?.State ??
        'N/A',
    },
    {
      label: 'Project',
      value: selectedJob?.projectId ?? metadata?.Project ?? 'N/A',
    },
    { label: 'Queue', value: selectedJob?.qos ?? metadata?.QOS ?? 'N/A' },
    {
      label: 'Partition',
      value: selectedJob?.partition ?? metadata?.Partition ?? 'N/A',
    },
    { label: 'No. of Nodes', value: formatNumber(nodeCount) },
    { label: 'Node Hours Charged', value: formatNumber(nodeHours, 2) },
  ];
};

const rgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized.split('').map((char) => `${char}${char}`).join('')
      : normalized;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Detail view for a selected job from the User Job Performance page.
 */
function JobPerformanceDetailPage() {
  const { id } = Route.useParams();
  const [expandUtilization, setExpandUtilization] = useState(false);
  const [expandPowerNodes, setExpandPowerNodes] = useState(false);
  const [powerAggregation, setPowerAggregation] = useState('mean');
  const [resourceGranularity, setResourceGranularity] =
    useState<ResourceGranularity>('job');
  const [showCpuUtilization, setShowCpuUtilization] = useState(true);
  const [showGpuUtilization, setShowGpuUtilization] = useState(true);
  const [expandMemoryUtilization, setExpandMemoryUtilization] = useState(false);
  const [memoryGranularity, setMemoryGranularity] =
    useState<ResourceGranularity>('job');
  const [expandNetworkUtilization, setExpandNetworkUtilization] = useState(false);
  const [networkAggregation, setNetworkAggregation] = useState('mean');
  const [showNvlinkNetwork, setShowNvlinkNetwork] = useState(true);
  const [showSlingshotNetwork, setShowSlingshotNetwork] = useState(true);
  const [showCpuPower, setShowCpuPower] = useState(true);
  const [showGpuPower, setShowGpuPower] = useState(true);
  const [showMemoryPower, setShowMemoryPower] = useState(true);
  const [showNodePower, setShowNodePower] = useState(true);
  const [expandPcieBandwidth, setExpandPcieBandwidth] = useState(false);
  const [pcieAggregation, setPcieAggregation] = useState('mean');
  const [showPcieRead, setShowPcieRead] = useState(true);
  const [showPcieWrite, setShowPcieWrite] = useState(true);
  const [activeSection, setActiveSection] = useState('job-details');
  const [expandResourceSection, setExpandResourceSection] = useState(false);
  const [expandMemorySection, setExpandMemorySection] = useState(false);
  const [expandPowerSection, setExpandPowerSection] = useState(false);
  const [expandPcieSection, setExpandPcieSection] = useState(false);
  const [expandNetworkSection, setExpandNetworkSection] = useState(false);
  const [expandRooflineSection, setExpandRooflineSection] = useState(false);

  useEffect(() => {
    if (resourceGranularity !== 'job') {
      setExpandUtilization(true);
    }
  }, [resourceGranularity]);

  useEffect(() => {
    if (memoryGranularity !== 'job') {
      setExpandMemoryUtilization(true);
    }
  }, [memoryGranularity]);

  useEffect(() => {
    if (networkAggregation === 'all') {
      setExpandNetworkUtilization(true);
    }
  }, [networkAggregation]);

  useEffect(() => {
    if (pcieAggregation === 'all') {
      setExpandPcieBandwidth(true);
    }
  }, [pcieAggregation]);

  // Define query for this page and fetch data item
  const { data: detailData } = useDetailQuery({
    dataSource: 'data/user-job-performance/user-jobs.json',
    dataIdField: 'Job ID',
    paramId: id,
    queryMode: 'client',
    staticParams: null,
  });
  const userJobsData = useDataFromSource(
    'data/user-job-performance/user-jobs.json'
  ) as LegacyUserJobData[] | undefined;
  const irisJobsData = useDataFromSource(
    'data/user-job-performance/job-data-iris-export.json'
  ) as IrisJobData[] | undefined;
  const metricsByJob = useDataFromSource(
    'data/user-job-performance/metrics-data.json'
  ) as MetricsByJob | undefined;
  const nodePowerRows = useDataFromSource(
    'data/user-job-performance/pmt-export-node-power-51567294.json'
  ) as PowerMetricRow[] | undefined;
  const cpuPowerRows = useDataFromSource(
    'data/user-job-performance/pmt-export-cpu-power-51567294 (1).json'
  ) as PowerMetricRow[] | undefined;
  const gpuPowerRows = useDataFromSource(
    'data/user-job-performance/pmt-export-gpu-power-51567294.json'
  ) as PowerMetricRow[] | undefined;
  const memoryPowerRows = useDataFromSource(
    'data/user-job-performance/pmt-export-mem-power-51567294 (1).json'
  ) as PowerMetricRow[] | undefined;
  const jobRows = useMemo(
    () => buildRecentJobPerformanceRows({
      legacyJobs: userJobsData,
      irisJobs: irisJobsData,
      metricsByJob,
    }),
    [irisJobsData, metricsByJob, userJobsData]
  );
  const selectedJob = useMemo(
    () => jobRows.find((job) => job.id === id) ?? null,
    [id, jobRows]
  );
  const metadata = useMemo(
    () =>
      (detailData as JobMetadata | undefined) ??
      findUserJobMetadataById(id, userJobsData, irisJobsData),
    [detailData, id, irisJobsData, userJobsData]
  );
  const pageJobId = selectedJob?.jobId ?? metadata?.['Job ID'] ?? id;
  const pageProject = selectedJob?.projectId ?? metadata?.Project ?? 'N/A';
  const pageMachineId = selectedJob?.hostname ?? 'perlmutter gpu';
  const pageUserId = getMetricsApiUserId(selectedJob?.user);
  const jobDetailItems = useMemo(
    () => buildJobDetailItems(selectedJob, metadata),
    [metadata, selectedJob]
  );
  const jobMetricsExport = useJobMetricsExport(id);
  const performanceSummary = useMemo(
    () => {
      if (!selectedJob) {
        return null;
      }

      return getJobPerformanceSummary(
        selectedJob,
        selectedJob.gpuUtilizationStatus ? undefined : metricsByJob
      );
    },
    [metricsByJob, selectedJob]
  );
  const computeMetricsByJob = useMemo<ComputeMetricsByJob | undefined>(
    () => (selectedJob && jobMetricsExport
      ? { [selectedJob.jobId]: jobMetricsExport }
      : undefined),
    [jobMetricsExport, selectedJob]
  );
  const computePerformanceSnapshot = useMemo(
    () => (selectedJob && performanceSummary
      ? buildComputePerformanceSnapshot({
        jobId: selectedJob.jobId,
        baseSnapshot: performanceSummary.snapshot,
        computeMetricsByJob,
      })
      : null),
    [computeMetricsByJob, performanceSummary, selectedJob]
  );
  const powerConsumptionSummary = useMemo(
    () => (selectedJob
      ? getPowerConsumptionSummary({
        jobId: selectedJob.jobId,
        metricsByJob,
        nodePowerRows,
        cpuPowerRows,
        gpuPowerRows,
        memoryPowerRows,
      })
      : null),
    [
      cpuPowerRows,
      gpuPowerRows,
      memoryPowerRows,
      metricsByJob,
      nodePowerRows,
      selectedJob,
    ]
  );
  const runtimeDistributionSegments = useMemo<RuntimeDistributionSegment[]>(() => {
    if (!performanceSummary) {
      return [];
    }

    const activeShare = 100 - performanceSummary.idlePercent;
    const basis = [
      {
        label: 'GPU',
        value: performanceSummary.gpuUtilization,
        color: COLOR_TOKENS.gpu,
      },
      {
        label: 'CPU',
        value: performanceSummary.cpuUtilization,
        color: COLOR_TOKENS.cpu,
      },
      {
        label: 'Memory',
        value: performanceSummary.memoryUtilization,
        color: COLOR_TOKENS.memory,
      },
    ];
    const totalBasis = basis.reduce((sum, item) => sum + item.value, 0) || 1;

    return [
      ...basis.map((item) => ({
        label: item.label,
        share: Number(((activeShare * item.value) / totalBasis).toFixed(1)),
        color: item.color,
      })),
      {
        label: 'Others',
        share: Number(performanceSummary.idlePercent.toFixed(1)),
        color: COLOR_TOKENS.vizGray,
      },
    ];
  }, [performanceSummary]);
  const jobGpuMemoryMetrics = useJobGpuMemoryMetrics(
    pageJobId.toString(),
    pageMachineId,
    pageUserId
  );
  const gpuUtilizationRangePoints = useMemo(
    () => buildGpuUtilizationRangePoints(jobMetricsExport),
    [jobMetricsExport]
  );
  const gpuUtilizationDeviceTraces = useMemo(
    () => buildGpuUtilizationDeviceTraces(jobMetricsExport),
    [jobMetricsExport]
  );
  const gpuMemoryRangePoints = useMemo(
    () => buildGpuMemoryRangePoints(jobGpuMemoryMetrics.data),
    [jobGpuMemoryMetrics.data]
  );
  const gpuMemoryNodeRows = useMemo(
    () => buildGpuMemoryNodeRows(jobGpuMemoryMetrics.data),
    [jobGpuMemoryMetrics.data]
  );
  const gpuMemoryDeviceTraces = useMemo(
    () => buildGpuMemoryDeviceTraces(jobGpuMemoryMetrics.data),
    [jobGpuMemoryMetrics.data]
  );
  const gpuMemoryDeviceRows = useMemo(
    () => buildGpuMemoryDeviceRows(jobGpuMemoryMetrics.data),
    [jobGpuMemoryMetrics.data]
  );

  // Track active section for navigation highlighting
  useEffect(() => {
    const handleScroll = () => {
      const sections = [
        'job-details',
        'insights',
        'gpu-throughput',
        'runtime-resource-distribution',
        'resource-util',
        'memory-util',
        'gpu-inter-node-network',
        'power',
        'pcie-bandwidth',
        'roofline',
      ];

      const scrollPosition = window.scrollY + 100;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i]);
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(sections[i]);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    if (section) {
      const offset = 80; // Account for any fixed headers
      const elementPosition = section.offsetTop;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  // Generate chart data
  const resourceUtilizationData = generateResourceUtilizationData(
    metricsByJob,
    id,
    gpuUtilizationRangePoints
  );
  const powerData = generatePowerData();
  const rooflineData = generateRooflineData();
  const cpuUtilizationSeries = resourceUtilizationData.find(
    (series) => series.name === 'CPU'
  )?.y ?? [];
  const gpuUtilizationSeries = resourceUtilizationData.find(
    (series) => series.name === 'GPU'
  )?.y ?? [];
  const resourceTimeAxis = resourceUtilizationData.find(
    (series) => series.name === 'CPU'
  )?.x ?? [];
  const cpuUtilizationAvg = cpuUtilizationSeries.length
    ? cpuUtilizationSeries.reduce((sum, value) => sum + value, 0) /
      cpuUtilizationSeries.length
    : 0;
  const gpuUtilizationAvg = gpuUtilizationSeries.length
    ? gpuUtilizationSeries.reduce((sum, value) => sum + value, 0) /
      gpuUtilizationSeries.length
    : 0;
  const filteredResourceUtilizationData = resourceUtilizationData.filter(
    (series) =>
      (series.name === 'CPU' && showCpuUtilization) ||
      (series.name === 'GPU' && showGpuUtilization)
  );
  const syntheticNodeUtilizationRows = generateUtilizationNodesData(
    cpuUtilizationSeries,
    gpuUtilizationSeries,
    resourceTimeAxis
  );
  const gpuExportNodeUtilizationRows = useMemo(
    () =>
      buildGpuUtilizationNodeRows(
        jobMetricsExport,
        cpuUtilizationSeries,
        resourceTimeAxis
      ),
    [cpuUtilizationSeries, jobMetricsExport, resourceTimeAxis]
  );
  const nodeUtilizationRows = gpuExportNodeUtilizationRows.length
    ? gpuExportNodeUtilizationRows
    : syntheticNodeUtilizationRows;
  const nodeLevelUtilizationRows = nodeUtilizationRows.map((row) => ({
    id: row.node,
    label: row.node,
    color: row.color,
    symbol: row.symbol,
    cpu: row.cpuMean,
    gpu: row.gpuMean,
  }));
  const gpuLevelUtilizationRows = useMemo(
    () => buildGpuUtilizationDeviceRows(jobMetricsExport, cpuUtilizationSeries),
    [cpuUtilizationSeries, jobMetricsExport]
  );
  const jobLevelUtilizationRows: UtilizationDetailRow[] = [{
    id: 'job',
    label: `Job ${pageJobId}`,
    color: COLOR_TOKENS.gpu,
    symbol: 'circle',
    cpu: cpuUtilizationAvg,
    gpu: gpuUtilizationAvg,
  }];
  const displayedUtilizationRows =
    resourceGranularity === 'job'
      ? jobLevelUtilizationRows
      : resourceGranularity === 'node'
        ? nodeLevelUtilizationRows
        : gpuLevelUtilizationRows.length
          ? gpuLevelUtilizationRows
          : nodeLevelUtilizationRows;
  const utilizationDetailTitle =
    resourceGranularity === 'job'
      ? 'View job level data'
      : resourceGranularity === 'node'
        ? 'View node level data'
        : 'View GPU level data';
  const utilizationEntityColumnLabel =
    resourceGranularity === 'job'
      ? 'Job'
      : resourceGranularity === 'node'
        ? 'Node'
        : 'GPU';
  const utilizationGpuColumnLabel =
    resourceGranularity === 'gpu'
      ? 'Avg. Raw GPU Utilization'
      : 'Median GPU Utilization';
  const resourceBandData = buildUtilizationBandTraces(
    nodeUtilizationRows,
    filteredResourceUtilizationData,
    gpuUtilizationRangePoints
  );
  const gpuUtilizationRangeAreaTraces = showGpuUtilization
    ? buildGpuUtilizationRangeAreaTraces(gpuUtilizationRangePoints)
    : [];
  const nodeLevelResourcePlotData = nodeUtilizationRows.flatMap((row) => {
    const traces = [];

    if (showCpuUtilization) {
      traces.push({
        x: row.time,
        y: row.cpuSeries,
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: `${row.node} CPU`,
        line: { color: row.color, width: 1.6, dash: 'dot' as const },
        marker: { symbol: row.symbol, size: 5 },
      });
    }

    if (showGpuUtilization) {
      traces.push({
        x: row.time,
        y: row.gpuSeries,
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: `${row.node} GPU`,
        line: { color: row.color, width: 1.8 },
        marker: { symbol: row.symbol, size: 5 },
      });
    }

    return traces;
  });
  const gpuLevelResourcePlotData = [
    ...(showCpuUtilization
      ? filteredResourceUtilizationData.filter((series) => series.name === 'CPU')
      : []),
    ...(showGpuUtilization ? gpuUtilizationDeviceTraces : []),
  ];
  const resourcePlotData =
    resourceGranularity === 'job'
      ? resourceBandData
      : resourceGranularity === 'node'
        ? [
            ...gpuUtilizationRangeAreaTraces,
            ...nodeLevelResourcePlotData,
          ]
        : gpuLevelResourcePlotData.length
          ? gpuLevelResourcePlotData
          : nodeLevelResourcePlotData;
  const cpuPowerSeries =
    powerData.find((series) => series.name === 'CPU')?.y ?? [];
  const gpuPowerSeries =
    powerData.find((series) => series.name === 'GPU')?.y ?? [];
  const memoryPowerSeries =
    powerData.find((series) => series.name === 'Memory')?.y ?? [];
  const nodePowerSeries =
    powerData.find((series) => series.name === 'Node')?.y ?? [];
  const avgPower = (series: number[]) =>
    series.length
      ? series.reduce((sum, value) => sum + value, 0) / series.length
      : 0;
  const cpuPowerAvg = avgPower(cpuPowerSeries);
  const gpuPowerAvg = avgPower(gpuPowerSeries);
  const memoryPowerAvg = avgPower(memoryPowerSeries);
  const nodePowerAvg = avgPower(nodePowerSeries);
  const filteredPowerData = powerData.filter(
    (series) =>
      (series.name === 'CPU' && showCpuPower) ||
      (series.name === 'GPU' && showGpuPower) ||
      (series.name === 'Memory' && showMemoryPower) ||
      (series.name === 'Node' && showNodePower)
  );
  const powerTableMetricPrefix =
    powerAggregation === 'max'
      ? 'Max.'
      : powerAggregation === 'min'
        ? 'Min.'
        : 'Avg.';
  const displayedPowerNodeRows = syntheticNodeUtilizationRows.map((row, idx) => {
    const nodeFactor = 0.84 + idx * 0.025;
    const aggregationFactor =
      powerAggregation === 'max'
        ? 1.16
        : powerAggregation === 'min'
          ? 0.82
          : 1;
    return {
      node: row.node,
      cpu: cpuPowerAvg * nodeFactor * aggregationFactor,
      gpu: gpuPowerAvg * nodeFactor * aggregationFactor,
      mem: memoryPowerAvg * nodeFactor * aggregationFactor,
      nodePower: nodePowerAvg * nodeFactor * aggregationFactor,
    };
  });
  const pcieBandwidthData = generatePcieBandwidthData(metricsByJob, id);
  const pcieReadSeries =
    pcieBandwidthData.find((series) => series.name === 'PCIe Read')?.y ?? [];
  const pcieWriteSeries =
    pcieBandwidthData.find((series) => series.name === 'PCIe Write')?.y ?? [];
  const pcieTimeAxis =
    pcieBandwidthData.find((series) => series.name === 'PCIe Read')?.x ?? [];
  const pcieReadAvg = pcieReadSeries.length
    ? pcieReadSeries.reduce((sum, value) => sum + value, 0) /
      pcieReadSeries.length
    : 0;
  const pcieWriteAvg = pcieWriteSeries.length
    ? pcieWriteSeries.reduce((sum, value) => sum + value, 0) /
      pcieWriteSeries.length
    : 0;
  const pcieNodeRows = generatePcieNodesData(
    pcieReadSeries,
    pcieWriteSeries,
    pcieTimeAxis
  );
  const displayedPcieNodeRows = pcieNodeRows.map((row) => ({
    color: row.color,
    symbol: row.symbol,
    node: row.node,
    read:
      pcieAggregation === 'max'
        ? row.readMax
        : pcieAggregation === 'min'
          ? row.readMin
          : row.readMean,
    write:
      pcieAggregation === 'max'
        ? row.writeMax
        : pcieAggregation === 'min'
          ? row.writeMin
          : row.writeMean,
  }));
  const pcieTableMetricPrefix =
    pcieAggregation === 'max'
      ? 'Max.'
      : pcieAggregation === 'min'
        ? 'Min.'
        : 'Avg.';
  const pcieReadPlotData =
    pcieAggregation === 'all'
      ? pcieNodeRows.map((row) => ({
          x: row.time,
          y: row.readSeries,
          type: 'scatter' as const,
          mode: 'lines+markers' as const,
          name: `${row.node} Read`,
          line: { color: row.color, width: 1.8 },
          marker: { symbol: row.symbol, size: 5 },
        }))
      : showPcieRead
        ? [pcieBandwidthData.find((series) => series.name === 'PCIe Read')]
        : [];
  const pcieWritePlotData =
    pcieAggregation === 'all'
      ? pcieNodeRows.map((row) => ({
          x: row.time,
          y: row.writeSeries,
          type: 'scatter' as const,
          mode: 'lines+markers' as const,
          name: `${row.node} Write`,
          line: { color: row.color, width: 1.8 },
          marker: { symbol: row.symbol, size: 5 },
        }))
      : showPcieWrite
        ? [pcieBandwidthData.find((series) => series.name === 'PCIe Write')]
        : [];
  const pcieCombinedPlotData =
    pcieAggregation === 'all'
      ? [
          ...(showPcieRead ? pcieReadPlotData : []),
          ...(showPcieWrite ? pcieWritePlotData : []),
        ]
      : [
          ...(showPcieRead
            ? [pcieBandwidthData.find((series) => series.name === 'PCIe Read')]
            : []),
          ...(showPcieWrite
            ? [pcieBandwidthData.find((series) => series.name === 'PCIe Write')]
            : []),
        ];
  const gpuMemoryAvg = gpuMemoryRangePoints.length
    ? averageValues(gpuMemoryRangePoints.map((point) => point.median))
    : null;
  const jobLevelMemoryRows: GpuMemoryDetailRow[] = [{
    id: 'job',
    label: `Job ${pageJobId}`,
    color: COLOR_TOKENS.gpu,
    symbol: 'circle',
    memory: gpuMemoryAvg,
  }];
  const nodeLevelMemoryRows = gpuMemoryNodeRows.map((row) => ({
    id: row.node,
    label: row.node,
    color: row.color,
    symbol: row.symbol,
    memory: row.memoryMean,
  }));
  const displayedMemoryRows =
    memoryGranularity === 'job'
      ? jobLevelMemoryRows
      : memoryGranularity === 'node'
        ? nodeLevelMemoryRows
        : gpuMemoryDeviceRows.length
          ? gpuMemoryDeviceRows
          : nodeLevelMemoryRows;
  const memoryDetailTitle =
    memoryGranularity === 'job'
      ? 'View job level data'
      : memoryGranularity === 'node'
        ? 'View node level data'
        : 'View GPU level data';
  const memoryEntityColumnLabel =
    memoryGranularity === 'job'
      ? 'Job'
      : memoryGranularity === 'node'
        ? 'Node'
        : 'GPU';
  const memoryValueColumnLabel =
    memoryGranularity === 'gpu'
      ? 'Avg. Raw GPU Memory'
      : 'Avg. GPU Memory';
  const nodeLevelMemoryPlotData = gpuMemoryNodeRows.map((row) => ({
    x: row.time,
    y: row.memorySeries,
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: `${row.node} GPU Memory`,
    line: { color: row.color, width: 1.8 },
    marker: { symbol: row.symbol, size: 5 },
    hovertemplate:
      `<br><b>${row.node}</b><br>` +
      'GPU Memory: <b>%{y:.1f} MiB</b><br>' +
      'Time: %{x:.1f}s<extra></extra>',
  }));
  const memoryPlotData =
    memoryGranularity === 'job'
      ? buildGpuMemoryJobTraces(gpuMemoryRangePoints)
      : memoryGranularity === 'node'
        ? [
            ...buildGpuMemoryRangeAreaTraces(gpuMemoryRangePoints),
            ...nodeLevelMemoryPlotData,
          ]
        : gpuMemoryDeviceTraces.length
          ? gpuMemoryDeviceTraces
          : nodeLevelMemoryPlotData;
  const isGpuMemoryLoading = jobGpuMemoryMetrics.status === 'loading';
  const gpuMemoryError =
    jobGpuMemoryMetrics.status === 'error'
      ? jobGpuMemoryMetrics.error ?? 'Unable to fetch GPU memory metrics.'
      : null;
  const hasGpuMemoryPlotData = memoryPlotData.length > 0;
  const gpuInterNodeNetworkData = generateGpuInterNodeNetworkData(metricsByJob, id);
  const nvlinkSeries = gpuInterNodeNetworkData.find(
    (series) => series.name === 'GPU Network (NVLink)'
  )?.y ?? [];
  const slingshotSeries = gpuInterNodeNetworkData.find(
    (series) => series.name === 'Inter-Node Network (Slingshot)'
  )?.y ?? [];
  const networkTimeAxis = gpuInterNodeNetworkData.find(
    (series) => series.name === 'GPU Network (NVLink)'
  )?.x ?? [];
  const nvlinkAvg = nvlinkSeries.length
    ? nvlinkSeries.reduce((sum, value) => sum + value, 0) / nvlinkSeries.length
    : 0;
  const slingshotAvg = slingshotSeries.length
    ? slingshotSeries.reduce((sum, value) => sum + value, 0) /
      slingshotSeries.length
    : 0;
  const filteredNetworkData = gpuInterNodeNetworkData.filter(
    (series) =>
      (series.name === 'GPU Network (NVLink)' && showNvlinkNetwork) ||
      (series.name === 'Inter-Node Network (Slingshot)' &&
        showSlingshotNetwork)
  );
  const networkNodeRows = generatePcieNodesData(
    nvlinkSeries,
    slingshotSeries,
    networkTimeAxis
  );
  const displayedNetworkNodeRows = networkNodeRows.map((row) => ({
    color: row.color,
    symbol: row.symbol,
    node: row.node,
    nvlink:
      networkAggregation === 'max'
        ? row.readMax
        : networkAggregation === 'min'
          ? row.readMin
          : row.readMean,
    slingshot:
      networkAggregation === 'max'
        ? row.writeMax
        : networkAggregation === 'min'
          ? row.writeMin
          : row.writeMean,
  }));
  const networkTableMetricPrefix =
    networkAggregation === 'max'
      ? 'Max.'
      : networkAggregation === 'min'
        ? 'Min.'
        : 'Avg.';
  const networkPlotData =
    networkAggregation === 'all'
      ? networkNodeRows.flatMap((row) => {
          const traces = [];
          if (showNvlinkNetwork) {
            traces.push({
              x: row.time,
              y: row.readSeries,
              type: 'scatter' as const,
              mode: 'lines+markers' as const,
              name: `${row.node} NVLink`,
              line: { color: row.color, width: 1.8 },
              marker: { symbol: row.symbol, size: 5 },
            });
          }
          if (showSlingshotNetwork) {
            traces.push({
              x: row.time,
              y: row.writeSeries,
              type: 'scatter' as const,
              mode: 'lines+markers' as const,
              name: `${row.node} Slingshot`,
              line: { color: row.color, width: 1.6, dash: 'dot' as const },
              marker: { symbol: row.symbol, size: 5 },
            });
          }
          return traces;
        })
      : filteredNetworkData.length
        ? filteredNetworkData
        : gpuInterNodeNetworkData;

  if (!selectedJob && !metadata) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: COLOR_TOKENS.pageBg, minHeight: '100vh', pb: 4 }}>
      {/* Breadcrumbs */}
      <Box
        sx={{
          bgcolor: 'white',
          borderBottom: '1px solid #e0e0e0',
          px: 3,
          py: 1.5,
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
          <Link
            component={RouterLink}
            to="/user-job-performance-alphaver"
            underline="hover"
            color="primary"
          >
            For Users
          </Link>
          <Link
            component={RouterLink}
            to="/user-job-performance-alphaver"
            underline="hover"
            color="primary"
          >
            Performance Overview
          </Link>
          <Typography color="text.primary">
            Details for Job {pageJobId}
          </Typography>
        </Breadcrumbs>
      </Box>

      <Container maxWidth="xl" sx={{ mt: 3 }}>
        {/* Page Header */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={10}>
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Typography variant="h4" sx={{ ...TITLE_SX, mb: 2 }}>
                Performance Details : {pageJobId} ({pageProject})
              </Typography>
                <Box sx={{ flex: 1 }} />
                <Button
                  component={RouterLink}
                  to="/user-job-performance-alphaver/compare"
                  variant="outlined"
                  endIcon={<ArrowForwardIcon />}
                  size="medium"
                  sx={{
                    textTransform: 'none',
                    borderColor: '#1a2f5a',
                    color: '#1a2f5a',
                    '&:hover': {
                      borderColor: '#1a2f5a',
                      bgcolor: 'rgba(26, 47, 90)',
                      color: '#ffffff',
                    },
                  }}
                >
                  Compare More Metrics
                </Button>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12} md={2}>
            {/*intentional blank*/}
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          {/* Main Content */}
          <Grid item xs={12} md>
            {/* Job Details Table */}
            <Paper
              id="job-details"
              sx={{ p: 2, mb: 3, scrollMarginTop: '80px' }}
            >
              <Typography variant="h5" sx={{ ...SECTION_TITLE_SX, mb: 2 }}>
                Job Details
              </Typography>
              <Grid container spacing={2}>
                {jobDetailItems.map((item) => (
                  <Grid item xs={6} sm={4} md={2.4} key={item.label}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      {item.label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {item.value}
                    </Typography>
                  </Grid>
                ))}
              </Grid>
            </Paper>

            {/* Insights & Hints */}
            <Paper id="insights" sx={{ p: 2, mb: 3, scrollMarginTop: '80px' }}>
              <Typography variant="h5" sx={{ ...SECTION_TITLE_SX, mb: 2 }}>
                Insights & Hints
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Alert
                    severity="warning"
                    variant="outlined"
                    icon={<WarningIcon />}
                    sx={{
                      height: '100%',
                      color: COLOR_TOKENS.textPrimary,
                      '& .MuiAlertTitle-root': { color: COLOR_TOKENS.textPrimary },
                      '& .MuiTypography-root': { color: COLOR_TOKENS.textPrimary },
                      '& a': { color: COLOR_TOKENS.link },
                    }}
                  >
                    <AlertTitle sx={{ fontWeight: 600 }}>
                      Compute bound performance
                    </AlertTitle>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      Consider improving vectorization or use multi-threading.
                      Review roofline analysis chart in the performance summary
                      for more details.
                    </Typography>
                    <Link
                      href="#"
                      variant="body2"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      Learn about Roofline Analysis{' '}
                      <ArrowForwardIcon fontSize="small" />
                    </Link>
                  </Alert>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Alert
                    severity="warning"
                    variant="outlined"
                    icon={<WarningIcon />}
                    sx={{
                      height: '100%',
                      color: COLOR_TOKENS.textPrimary,
                      '& .MuiAlertTitle-root': { color: COLOR_TOKENS.textPrimary },
                      '& .MuiTypography-root': { color: COLOR_TOKENS.textPrimary },
                      '& a': { color: COLOR_TOKENS.link },
                    }}
                  >
                    <AlertTitle sx={{ fontWeight: 600 }}>
                      Network imbalance detected
                    </AlertTitle>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      High I/O or CPU utilization imbalance across ~20% of
                      nodes. Distribute network traffic evenly across available
                      nodes to improve potential performance.
                    </Typography>
                    <Link
                      href="#"
                      variant="body2"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      Learn about Network Performance{' '}
                      <ArrowForwardIcon fontSize="small" />
                    </Link>
                  </Alert>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Alert
                    severity="info"
                    variant="outlined"
                    icon={<InfoIcon />}
                    sx={{
                      height: '100%',
                      color: COLOR_TOKENS.textPrimary,
                      '& .MuiAlertTitle-root': { color: COLOR_TOKENS.textPrimary },
                      '& .MuiTypography-root': { color: COLOR_TOKENS.textPrimary },
                      '& a': { color: COLOR_TOKENS.link },
                    }}
                  >
                    <AlertTitle sx={{ fontWeight: 600 }}>
                      Explore power capping
                    </AlertTitle>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      Prepare for power-limited compute landscape. Power capping
                      can offer incentives of node hour discounts, priority
                      boosts, or access to free queues.
                    </Typography>
                    <Link href="#" sx={ACTION_LINK_SX}>
                      Learn about Power Capping{' '} <ArrowForwardIcon fontSize="small" />
                    </Link>
                    {/* <Link
                      href="#"
                      variant="body2"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      Learn about Power Capping{' '}
                      <ArrowForwardIcon fontSize="small" />
                    </Link> */}
                  </Alert>
                </Grid>
              </Grid>
            </Paper>

            <Paper
              id="gpu-throughput"
              sx={{ p: 4, mb: 3, scrollMarginTop: '80px' }}
            >
              <Typography variant="h5" sx={{ ...SECTION_TITLE_SX, mb: 2.5 }}>
                Performance summary
              </Typography>
              {performanceSummary && computePerformanceSnapshot && powerConsumptionSummary ? (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      lg: 'repeat(2, minmax(0, 1fr))',
                    },
                    gap: 2,
                    alignItems: 'stretch',
                  }}
                >
                  <Box
                    id="runtime-resource-distribution"
                    sx={{ height: '100%', scrollMarginTop: '80px' }}
                  >
                    <RuntimeResourceDistributionGroup
                      segments={runtimeDistributionSegments}
                    />
                  </Box>
                  <PowerConsumptionGroup powerConsumption={powerConsumptionSummary} />
                  <ComputePerformanceGroup snapshot={computePerformanceSnapshot} />
                  <NetworkPerformanceGroup
                    networkPerformance={performanceSummary.networkPerformance}
                  />
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: COLOR_TOKENS.textSecondary }}>
                  Loading performance summary...
                </Typography>
              )}
            </Paper>

            {/* Resource Utilization */}
            <Paper
              id="resource-util"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box
                sx={{ ...SECTION_TOGGLE_SX, mb: expandResourceSection ? 3 : 0 }}
                onClick={() => setExpandResourceSection(!expandResourceSection)}
              >
                <IconButton size="small">
                  {expandResourceSection ? (
                    <ExpandMoreIcon />
                  ) : (
                    <KeyboardArrowRightIcon />
                  )}
                </IconButton>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  GPU & CPU Utilization
                </Typography>
              </Box>
              <Collapse in={expandResourceSection}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 2,
                    mb: 2,
                  }}
                >
                <FormControl size="small" sx={{ minWidth: 300 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 0.5 }}
                  >
                    Granularity
                  </Typography>
                  <Select
                    value={resourceGranularity}
                    onChange={(e) =>
                      setResourceGranularity(e.target.value as ResourceGranularity)
                    }
                  >
                    <MenuItem value="job">
                      Job level (median across nodes)
                    </MenuItem>
                    <MenuItem value="node">
                      Node level (median across GPUs)
                    </MenuItem>
                    <MenuItem value="gpu">GPU level (raw)</MenuItem>
                  </Select>
                </FormControl>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Avg. CPU utilization across all nodes for the selected job."
                  >
                    <Box
                      onClick={() => setShowCpuUtilization(!showCpuUtilization)}
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.cpu}`,
                        opacity: showCpuUtilization ? 1 : 0.45,
                      }}
                    >
                      <MemoryIcon
                        sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.cpu }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        CPU {cpuUtilizationAvg.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Tooltip>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Avg. GPU utilization across all nodes for the selected job."
                  >
                    <Box
                      onClick={() => setShowGpuUtilization(!showGpuUtilization)}
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.gpu}`,
                        opacity: showGpuUtilization ? 1 : 0.45,
                      }}
                    >
                      <MemoryIcon
                        sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.gpu }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        GPU {gpuUtilizationAvg.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Tooltip>
                </Box>
                </Box>
                <Plot
                  data={resourcePlotData as any}
                  layout={{
                    autosize: true,
                    height: 330,
                    margin: { l: 50, r: 20, t: 20, b: 50 },
                    xaxis: {
                      title: 'Floored Relative Time (s)',
                    },
                    yaxis: {
                      title: 'Utilization %',
                      range: [0, 100],
                    },
                    showlegend: resourceGranularity !== 'job',
                    legend:
                      resourceGranularity !== 'job'
                        ? {
                            orientation: 'v',
                            x: 1.02,
                            y: 1,
                            xanchor: 'left',
                          }
                        : undefined,
                    hovermode: 'x unified',
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%' }}
                />
                <Divider sx={{ mt: 2, mb: 1.5 }} />
                <Box
                  id="util-nodes"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    py: 1,
                  }}
                  onClick={() => setExpandUtilization(!expandUtilization)}
                >
                  <IconButton size="small">
                    {expandUtilization ? <ExpandMoreIcon /> : <KeyboardArrowRightIcon />}
                  </IconButton>
                  <Typography variant="h6" sx={{ fontWeight: 500 }}>
                    {utilizationDetailTitle}
                  </Typography>
                </Box>
                <Collapse in={expandUtilization}>
                  <Box sx={{ scrollMarginTop: '80px' }}>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Legend</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>
                              {utilizationEntityColumnLabel}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>
                              Avg. CPU Utilization
                            </TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>
                              {utilizationGpuColumnLabel}
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {displayedUtilizationRows.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell>
                                <Typography
                                  variant="body1"
                                  sx={{ color: row.color, lineHeight: 1 }}
                                >
                                  {getMarkerGlyph(row.symbol)}
                                </Typography>
                              </TableCell>
                              <TableCell>{row.label}</TableCell>
                              <TableCell>{formatUtilizationTableValue(row.cpu)}</TableCell>
                              <TableCell>{formatUtilizationTableValue(row.gpu)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                </Collapse>
              </Collapse>
            </Paper>


            {/* Memory Utilization */}
            <Paper
              id="memory-util"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box
                sx={{ ...SECTION_TOGGLE_SX, mb: expandMemorySection ? 3 : 0 }}
                onClick={() => setExpandMemorySection(!expandMemorySection)}
              >
                <IconButton size="small">
                  {expandMemorySection ? (
                    <ExpandMoreIcon />
                  ) : (
                    <KeyboardArrowRightIcon />
                  )}
                </IconButton>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  GPU Memory Footprint
                </Typography>
              </Box>
              <Collapse in={expandMemorySection}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 2,
                    mb: 2,
                  }}
                >
                  <FormControl size="small" sx={{ minWidth: 300 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mb: 0.5 }}
                    >
                      Granularity
                    </Typography>
                    <Select
                      value={memoryGranularity}
                      onChange={(e) =>
                        setMemoryGranularity(e.target.value as ResourceGranularity)
                      }
                    >
                      <MenuItem value="job">
                        Job level (median across nodes)
                      </MenuItem>
                      <MenuItem value="node">
                        Node level (median across GPUs)
                      </MenuItem>
                      <MenuItem value="gpu">GPU level (raw)</MenuItem>
                    </Select>
                  </FormControl>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Average GPU frame-buffer memory used from nersc_ldms_dcgm_fb_used."
                  >
                    <Box
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.gpu}`,
                      }}
                    >
                      <MemoryIcon
                        sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.gpu }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        GPU Memory{' '}
                        {gpuMemoryAvg === null
                          ? 'N/A'
                          : `${formatNumber(gpuMemoryAvg, 1)} MiB`}
                      </Typography>
                    </Box>
                  </Tooltip>
                </Box>
                {isGpuMemoryLoading ? (
                  <Box
                    sx={{
                      height: 330,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1.5,
                      color: COLOR_TOKENS.textSecondary,
                    }}
                  >
                    <CircularProgress size={24} />
                    <Typography variant="body2">
                      Loading GPU memory data...
                    </Typography>
                  </Box>
                ) : gpuMemoryError ? (
                  <Alert severity="error" variant="outlined" sx={{ my: 2 }}>
                    {gpuMemoryError}
                  </Alert>
                ) : hasGpuMemoryPlotData ? (
                  <Plot
                    data={memoryPlotData as any}
                    layout={{
                      autosize: true,
                      height: 330,
                      margin: { l: 70, r: 20, t: 20, b: 50 },
                      xaxis: {
                        title: 'Floored Relative Time (s)',
                      },
                      yaxis: {
                        title: 'GPU Memory (MiB)',
                        rangemode: 'tozero',
                      },
                      showlegend: memoryGranularity !== 'job',
                      legend:
                        memoryGranularity !== 'job'
                          ? {
                              orientation: 'v',
                              x: 1.02,
                              y: 1,
                              xanchor: 'left',
                            }
                          : undefined,
                      hovermode: 'x unified',
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    style={{ width: '100%' }}
                  />
                ) : (
                  <Alert severity="info" variant="outlined" sx={{ my: 2 }}>
                    No GPU memory samples were returned for this job.
                  </Alert>
                )}
                <Divider sx={{ mt: 2, mb: 1.5 }} />
                <Box
                  id="memory-nodes"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    py: 1,
                  }}
                  onClick={() => setExpandMemoryUtilization(!expandMemoryUtilization)}
                >
                  <IconButton size="small">
                    {expandMemoryUtilization ? (
                      <ExpandMoreIcon />
                    ) : (
                      <KeyboardArrowRightIcon />
                    )}
                  </IconButton>
                  <Typography variant="h6" sx={{ fontWeight: 500 }}>
                    {memoryDetailTitle}
                  </Typography>
                </Box>
                <Collapse in={expandMemoryUtilization}>
                  <Box sx={{ scrollMarginTop: '80px' }}>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Legend</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>
                              {memoryEntityColumnLabel}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>
                              {memoryValueColumnLabel}
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {displayedMemoryRows.map((row) => (
                            <TableRow key={`memory-${row.id}`}>
                              <TableCell>
                                <Typography
                                  variant="body1"
                                  sx={{ color: row.color, lineHeight: 1 }}
                                >
                                  {getMarkerGlyph(row.symbol)}
                                </Typography>
                              </TableCell>
                              <TableCell>{row.label}</TableCell>
                              <TableCell>{formatMibTableValue(row.memory)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                </Collapse>
              </Collapse>
            </Paper>
            

            {/* Power */}
            <Paper id="power" sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}>
              <Box
                sx={{ ...SECTION_TOGGLE_SX, mb: expandPowerSection ? 2 : 0 }}
                onClick={() => setExpandPowerSection(!expandPowerSection)}
              >
                <IconButton size="small">
                  {expandPowerSection ? (
                    <ExpandMoreIcon />
                  ) : (
                    <KeyboardArrowRightIcon />
                  )}
                </IconButton>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  Power
                </Typography>
              </Box>
              <Collapse in={expandPowerSection}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 2,
                  mb: 2,
                }}
              >
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 0.5, display: 'block' }}
                  >
                    Aggregation
                  </Typography>
                  <Select
                    value={powerAggregation}
                    onChange={(e) => setPowerAggregation(e.target.value)}
                  >
                    <MenuItem value="mean">Mean across Nodes</MenuItem>
                    <MenuItem value="min">Min across Nodes</MenuItem>
                    <MenuItem value="max">Max across Nodes</MenuItem>
                  </Select>
                </FormControl>
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                <Box
                  onClick={() => setShowCpuPower(!showCpuPower)}
                  sx={{
                    ...METRIC_CHIP_BASE_SX,
                    border: `2px solid ${COLOR_TOKENS.cpu}`,
                    opacity: showCpuPower ? 1 : 0.45,
                  }}
                >
                  <MemoryIcon
                    sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.cpu }}
                  />
                  <Typography sx={METRIC_CHIP_LABEL_SX}>
                    CPU {cpuPowerAvg.toFixed(1)} W
                  </Typography>
                </Box>
                <Box
                  onClick={() => setShowGpuPower(!showGpuPower)}
                  sx={{
                    ...METRIC_CHIP_BASE_SX,
                    border: `2px solid ${COLOR_TOKENS.gpu}`,
                    opacity: showGpuPower ? 1 : 0.45,
                  }}
                >
                  <MemoryIcon
                    sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.gpu }}
                  />
                  <Typography sx={METRIC_CHIP_LABEL_SX}>
                    GPU {gpuPowerAvg.toFixed(1)} W
                  </Typography>
                </Box>
                <Box
                  onClick={() => setShowMemoryPower(!showMemoryPower)}
                  sx={{
                    ...METRIC_CHIP_BASE_SX,
                    border: `2px solid ${COLOR_TOKENS.memory}`,
                    opacity: showMemoryPower ? 1 : 0.45,
                  }}
                >
                  <MemoryIcon
                    sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.memory }}
                  />
                  <Typography sx={METRIC_CHIP_LABEL_SX}>
                    Memory {memoryPowerAvg.toFixed(1)} W
                  </Typography>
                </Box>
                <Box
                  onClick={() => setShowNodePower(!showNodePower)}
                  sx={{
                    ...METRIC_CHIP_BASE_SX,
                    border: `2px solid ${COLOR_TOKENS.network}`,
                    opacity: showNodePower ? 1 : 0.45,
                  }}
                >
                  <MemoryIcon
                    sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.network }}
                  />
                  <Typography sx={METRIC_CHIP_LABEL_SX}>
                    Node {nodePowerAvg.toFixed(1)} W
                  </Typography>
                </Box>
                </Box>
              </Box>
              <Plot
                data={filteredPowerData.length ? filteredPowerData : powerData}
                layout={{
                  autosize: true,
                  height: 300,
                  margin: { l: 50, r: 20, t: 20, b: 50 },
                  xaxis: {
                    title: 'Relative Time',
                    showline: true,
                    showticklabels: true,
                    ticks: 'outside',
                    tickvals: [0, 12.5, 25, 37, 47, 58, 68, 78, 88, 100],
                    ticktext: [
                      '0%',
                      '12%',
                      '25%',
                      '37%',
                      '47%',
                      '58%',
                      '68%',
                      '78%',
                      '88%',
                      '100%',
                    ],
                  },
                  yaxis: {
                    title: 'Power (W)',
                  },
                  showlegend: false,
                  hovermode: 'x unified',
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
              <Divider sx={{ mt: 2, mb: 1.5 }} />
              <Box
                id="power-nodes"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
                  py: 1,
                }}
                onClick={() => setExpandPowerNodes(!expandPowerNodes)}
              >
                <IconButton size="small">
                  {expandPowerNodes ? (
                    <ExpandMoreIcon />
                  ) : (
                    <KeyboardArrowRightIcon />
                  )}
                </IconButton>
                <Typography variant="h6" sx={{ fontWeight: 500 }}>
                  View the tabular power data across individual nodes
                </Typography>
              </Box>
              <Collapse in={expandPowerNodes}>
                <Box sx={{ scrollMarginTop: '80px' }}>
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Nodes</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {powerTableMetricPrefix} CPU Power
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {powerTableMetricPrefix} GPU Power
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {powerTableMetricPrefix} Memory Power
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {powerTableMetricPrefix} Node Power
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {displayedPowerNodeRows.map((row) => (
                          <TableRow key={`power-${row.node}`}>
                            <TableCell>{row.node}</TableCell>
                            <TableCell>{row.cpu.toFixed(3)} W</TableCell>
                            <TableCell>{row.gpu.toFixed(3)} W</TableCell>
                            <TableCell>{row.mem.toFixed(3)} W</TableCell>
                            <TableCell>{row.nodePower.toFixed(3)} W</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Collapse>
              </Collapse>
            </Paper>

            {/* PCIe Bandwidth */}
            <Paper
              id="pcie-bandwidth"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box
                sx={{ ...SECTION_TOGGLE_SX, mb: expandPcieSection ? 3 : 0 }}
                onClick={() => setExpandPcieSection(!expandPcieSection)}
              >
                <IconButton size="small">
                  {expandPcieSection ? (
                    <ExpandMoreIcon />
                  ) : (
                    <KeyboardArrowRightIcon />
                  )}
                </IconButton>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  PCIe Bandwidth
                </Typography>
              </Box>
              <Collapse in={expandPcieSection}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 2,
                  mb: 2,
                }}
              >
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 0.5 }}
                  >
                    Aggregation
                  </Typography>
                  <Select
                    value={pcieAggregation}
                    onChange={(e) => setPcieAggregation(e.target.value)}
                  >
                    <MenuItem value="mean">Mean across Nodes</MenuItem>
                    <MenuItem value="min">Min across Nodes</MenuItem>
                    <MenuItem value="max">Max across Nodes</MenuItem>
                    <MenuItem value="all">See all nodes</MenuItem>
                  </Select>
                </FormControl>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Average PCIe read bandwidth across nodes."
                  >
                    <Box
                      onClick={() => setShowPcieRead(!showPcieRead)}
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.cpu}`,
                        opacity: showPcieRead ? 1 : 0.45,
                      }}
                    >
                      <MemoryIcon
                        sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.cpu }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        Read {pcieReadAvg.toFixed(1)} GB/s
                      </Typography>
                    </Box>
                  </Tooltip>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Average PCIe write bandwidth across nodes."
                  >
                    <Box
                      onClick={() => setShowPcieWrite(!showPcieWrite)}
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.gpu}`,
                        opacity: showPcieWrite ? 1 : 0.45,
                      }}
                    >
                      <MemoryIcon
                        sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.gpu }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        Write {pcieWriteAvg.toFixed(1)} GB/s
                      </Typography>
                    </Box>
                  </Tooltip>
                </Box>
              </Box>
              <Plot
                data={pcieCombinedPlotData.filter(Boolean) as any}
                layout={{
                  autosize: true,
                  height: 330,
                  margin: { l: 60, r: 20, t: 20, b: 50 },
                  xaxis: {
                    title: 'Relative Time',
                    tickvals: [0, 12.5, 25, 37, 47, 58, 68, 78, 88, 100],
                    ticktext: [
                      '0%',
                      '12%',
                      '25%',
                      '37%',
                      '47%',
                      '58%',
                      '68%',
                      '78%',
                      '88%',
                      '100%',
                    ],
                  },
                  yaxis: {
                    title: 'PCIe Bandwidth (GB/s)',
                    rangemode: 'tozero',
                  },
                  showlegend: false,
                  legend:
                    pcieAggregation === 'all'
                      ? { orientation: 'v', x: 1.02, y: 1, xanchor: 'left' }
                      : { orientation: 'h', x: 0.5, y: 1.12, xanchor: 'center' },
                  hovermode: 'x unified',
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
              <Divider sx={{ mt: 2, mb: 1.5 }} />
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
                  py: 1,
                }}
                onClick={() => setExpandPcieBandwidth(!expandPcieBandwidth)}
              >
                <IconButton size="small">
                  {expandPcieBandwidth ? (
                    <ExpandMoreIcon />
                  ) : (
                    <KeyboardArrowRightIcon />
                  )}
                </IconButton>
                <Typography variant="h6" sx={{ fontWeight: 500 }}>
                  View the tabular PCIe bandwidth data across individual nodes
                </Typography>
              </Box>
              <Collapse in={expandPcieBandwidth}>
                <Box sx={{ scrollMarginTop: '80px' }}>
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Legend</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Nodes</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {pcieTableMetricPrefix} PCIe Read
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {pcieTableMetricPrefix} PCIe Write
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {displayedPcieNodeRows.map((row) => (
                          <TableRow key={`pcie-${row.node}`}>
                            <TableCell>
                              <Typography
                                variant="body1"
                                sx={{ color: row.color, lineHeight: 1 }}
                              >
                                {getMarkerGlyph(row.symbol)}
                              </Typography>
                            </TableCell>
                            <TableCell>{row.node}</TableCell>
                            <TableCell>{row.read.toFixed(3)} GB/s</TableCell>
                            <TableCell>{row.write.toFixed(3)} GB/s</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Collapse>
              </Collapse>
            </Paper>

            {/* GPU and Inter-Node Network */}
            <Paper
              id="gpu-inter-node-network"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box
                sx={{ ...SECTION_TOGGLE_SX, mb: expandNetworkSection ? 3 : 0 }}
                onClick={() => setExpandNetworkSection(!expandNetworkSection)}
              >
                <IconButton size="small">
                  {expandNetworkSection ? (
                    <ExpandMoreIcon />
                  ) : (
                    <KeyboardArrowRightIcon />
                  )}
                </IconButton>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  GPU and Inter-Node Network
                </Typography>
              </Box>
              <Collapse in={expandNetworkSection}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 2,
                  mb: 2,
                }}
              >
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 0.5 }}
                  >
                    Aggregation
                  </Typography>
                  <Select
                    value={networkAggregation}
                    onChange={(e) => setNetworkAggregation(e.target.value)}
                  >
                    <MenuItem value="mean">Mean across Nodes</MenuItem>
                    <MenuItem value="min">Min across Nodes</MenuItem>
                    <MenuItem value="max">Max across Nodes</MenuItem>
                    <MenuItem value="all">See all nodes</MenuItem>
                  </Select>
                </FormControl>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Avg. intra-node GPU network traffic over NVLink."
                  >
                    <Box
                      onClick={() => setShowNvlinkNetwork(!showNvlinkNetwork)}
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.gpu}`,
                        opacity: showNvlinkNetwork ? 1 : 0.45,
                      }}
                    >
                      <MemoryIcon
                        sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.gpu }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        NVLink {nvlinkAvg.toFixed(1)} GB/s
                      </Typography>
                    </Box>
                  </Tooltip>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Avg. inter-node network traffic over Slingshot."
                  >
                    <Box
                      onClick={() =>
                        setShowSlingshotNetwork(!showSlingshotNetwork)
                      }
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.network}`,
                        opacity: showSlingshotNetwork ? 1 : 0.45,
                      }}
                    >
                      <MemoryIcon
                        sx={{
                          ...METRIC_CHIP_ICON_SX,
                          color: COLOR_TOKENS.network,
                        }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        Slingshot {slingshotAvg.toFixed(1)} GB/s
                      </Typography>
                    </Box>
                  </Tooltip>
                </Box>
              </Box>
              <Plot
                data={networkPlotData as any}
                layout={{
                  autosize: true,
                  height: 330,
                  margin: { l: 60, r: 20, t: 20, b: 50 },
                  xaxis: {
                    title: 'Relative Time',
                    tickvals: [0, 12.5, 25, 37, 47, 58, 68, 78, 88, 100],
                    ticktext: [
                      '0%',
                      '12%',
                      '25%',
                      '37%',
                      '47%',
                      '58%',
                      '68%',
                      '78%',
                      '88%',
                      '100%',
                    ],
                  },
                  yaxis: {
                    title: 'Network Bandwidth (GB/s)',
                    rangemode: 'tozero',
                  },
                  showlegend: networkAggregation === 'all',
                  legend:
                    networkAggregation === 'all'
                      ? {
                          orientation: 'v',
                          x: 1.02,
                          y: 1,
                          xanchor: 'left',
                        }
                      : undefined,
                  hovermode: 'x unified',
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
              <Divider sx={{ mt: 2, mb: 1.5 }} />
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
                  py: 1,
                }}
                onClick={() => setExpandNetworkUtilization(!expandNetworkUtilization)}
              >
                <IconButton size="small">
                  {expandNetworkUtilization ? (
                    <ExpandMoreIcon />
                  ) : (
                    <KeyboardArrowRightIcon />
                  )}
                </IconButton>
                <Typography variant="h6" sx={{ fontWeight: 500 }}>
                  View the tabular network data across individual nodes
                </Typography>
              </Box>
              <Collapse in={expandNetworkUtilization}>
                <Box sx={{ scrollMarginTop: '80px' }}>
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Legend</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Nodes</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {networkTableMetricPrefix} NVLink
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {networkTableMetricPrefix} Slingshot
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {displayedNetworkNodeRows.map((row) => (
                          <TableRow key={`network-${row.node}`}>
                            <TableCell>
                              <Typography
                                variant="body1"
                                sx={{ color: row.color, lineHeight: 1 }}
                              >
                                {getMarkerGlyph(row.symbol)}
                              </Typography>
                            </TableCell>
                            <TableCell>{row.node}</TableCell>
                            <TableCell>{row.nvlink.toFixed(3)} GB/s</TableCell>
                            <TableCell>{row.slingshot.toFixed(3)} GB/s</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Collapse>
              </Collapse>
            </Paper>

            {/* Roofline Analysis */}
            <Paper id="roofline" sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}>
              <Box
                sx={{ ...SECTION_TOGGLE_SX, mb: expandRooflineSection ? 2 : 0 }}
                onClick={() => setExpandRooflineSection(!expandRooflineSection)}
              >
                <IconButton size="small">
                  {expandRooflineSection ? (
                    <ExpandMoreIcon />
                  ) : (
                    <KeyboardArrowRightIcon />
                  )}
                </IconButton>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  Roofline Analysis
                </Typography>
              </Box>
              <Collapse in={expandRooflineSection}>
              <Plot
                data={rooflineData}
                layout={{
                  autosize: true,
                  height: 420,
                  margin: { l: 80, r: 130, t: 20, b: 70 },
                  xaxis: {
                    title: 'Operational Intensity (FLOPs/Byte)',
                    range: [0, 10],
                    dtick: 1,
                    gridcolor: '#d1d5db',
                    griddash: 'dot',
                    zeroline: false,
                  },
                  yaxis: {
                    title: 'Performance (GFLOPS)',
                    range: [0, 25],
                    dtick: 5,
                    gridcolor: '#d1d5db',
                    griddash: 'dot',
                    zeroline: false,
                  },
                  showlegend: true,
                  legend: {
                    orientation: 'h',
                    x: 0.5,
                    y: 1.14,
                    xanchor: 'center',
                  },
                  hovermode: 'closest',
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                  Summary & Insights:
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Kernels analyzed
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      5233
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Memory bound kernels
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      93 (40%)
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Compute bound kernels
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      139 (60%)
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Avg. Operational Intensity
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      2.11710 FLOPs/Byte
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Avg. Performance
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      5.50 TFlops
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
              <Divider sx={{ my: 3 }} />
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600, mb: 1 }}
                  >
                    Optimization Recommendations
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Most kernels are compute-bound. To improve performance:
                  </Typography>
                  <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                    <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                      Maximize vectorization and thread/block occupancy.
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                      Use optimized math libraries for critical operations.
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                      Break dependency chains and unroll loops where beneficial.
                    </Typography>
                    <Typography component="li" variant="body2">
                      Profile top runtime kernels and target them with
                      micro-optimizations.
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600, mb: 1 }}
                  >
                    General Recommendations
                  </Typography>
                  <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                    <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                      Profile outliers: Focus optimization efforts on kernels
                      with highest TFLOPs, or those farthest from the roofline.
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                      Balance workloads: For memory-bound kernels near the knee,
                      data access improvements may provide better ROI than
                      compute optimizations.
                    </Typography>
                    <Typography component="li" variant="body2">
                      Re-run the job after optimizations and compare metrics
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <Link href="#" sx={ACTION_LINK_SX}>
                  Learn how to improve performance{' '}
                  <ArrowForwardIcon fontSize="small" />
                </Link>
              </Box>
              </Collapse>
            </Paper>
          </Grid>

          {/* Right Sidebar - On This Page */}
          <Grid item xs={12} md="auto" sx={{ width: { md: 220, lg: 240 } }}>
            <Box sx={{ p: 2, position: 'sticky', top: 40 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                On This Page
              </Typography>
              <Stack spacing={1}>
                <Link
                  component="button"
                  onClick={() => handleNavClick('job-details')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'job-details'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'job-details' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Job Details
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('insights')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'insights'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'insights' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Insights and Hints
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('gpu-throughput')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'gpu-throughput'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'gpu-throughput' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Performance summary
                </Link>
                <Link
                  component="button"
                  onClick={() =>
                    handleNavClick('runtime-resource-distribution')
                  }
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'runtime-resource-distribution'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight:
                      activeSection === 'runtime-resource-distribution'
                        ? 600
                        : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Resource Utilization Split
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('resource-util')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'resource-util'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'resource-util' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  GPU/ CPU Utilization
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('memory-util')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'memory-util'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'memory-util' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Memory Utilization
                </Link>
                
                <Link
                  component="button"
                  onClick={() => handleNavClick('power')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'power'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'power' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Power
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('pcie-bandwidth')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'pcie-bandwidth'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'pcie-bandwidth' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  PCIe Bandwidth
                </Link>
                 <Link
                  component="button"
                  onClick={() => handleNavClick('gpu-inter-node-network')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'gpu-inter-node-network'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight:
                      activeSection === 'gpu-inter-node-network' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  GPU and Inter-Node Network
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('roofline')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'roofline'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'roofline' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Roofline Analysis
                </Link>
              </Stack>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const NODE_MARKERS = [
  'circle',
  'square',
  'diamond',
  'triangle-up',
  'triangle-down',
  'cross',
] as const;
type NodeMarker = (typeof NODE_MARKERS)[number];
const NODE_COLORS = [
  '#1f77b4',
  '#2ca02c',
  '#ff7f0e',
  '#9467bd',
  '#d62728',
  '#17becf',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#393b79',
  '#637939',
];

const getMarkerGlyph = (symbol: NodeMarker) => {
  if (symbol === 'square') return '■';
  if (symbol === 'diamond') return '◆';
  if (symbol === 'triangle-up') return '▲';
  if (symbol === 'triangle-down') return '▼';
  if (symbol === 'cross') return '✚';
  return '●';
};

const parseExportTimestampMs = (timestamp?: string | number | null) => {
  if (timestamp === undefined || timestamp === null || timestamp === '') {
    return null;
  }

  if (typeof timestamp === 'number') {
    if (!Number.isFinite(timestamp)) {
      return null;
    }

    return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  }

  const numericTimestamp = Number(timestamp);

  if (Number.isFinite(numericTimestamp) && timestamp.trim() !== '') {
    return numericTimestamp > 1_000_000_000_000
      ? numericTimestamp
      : numericTimestamp * 1000;
  }

  const normalizedTimestamp = timestamp
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1');
  const timestampMs = Date.parse(normalizedTimestamp);

  return Number.isNaN(timestampMs) ? null : timestampMs;
};

const normalizeGpuUtilizationValue = (value: unknown) => {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return null;
  }

  return clampPercent(Math.abs(numericValue) <= 1 ? numericValue * 100 : numericValue);
};

const getMedianValue = (values: number[]) => {
  const sortedValues = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 0
    ? (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
    : sortedValues[midpoint];
};

function buildGpuUtilizationRangePoints(
  jobMetricsExport?: JobMetricsExport
): GpuUtilizationRangePoint[] {
  const samplesBySecond = new Map<number, number[]>();

  (jobMetricsExport?.data ?? []).forEach((row) => {
    const value = normalizeGpuUtilizationValue(
      row.nersc_ldms_dcgm_gr_engine_active ??
        row.nersc_ldms_dcgm_gpu_utilization
    );
    const timestampMs = parseExportTimestampMs(row.timestamp);

    if (value === null || timestampMs === null) {
      return;
    }

    const timestampSeconds = Math.floor(timestampMs / 1000);
    const values = samplesBySecond.get(timestampSeconds) ?? [];
    values.push(value);
    samplesBySecond.set(timestampSeconds, values);
  });

  const sortedTimestampSeconds = Array.from(samplesBySecond.keys()).sort(
    (left, right) => left - right
  );
  const firstTimestampSeconds = sortedTimestampSeconds[0] ?? 0;

  return sortedTimestampSeconds.map((timestampSeconds) => {
    const values = samplesBySecond.get(timestampSeconds) ?? [];

    return {
      time: timestampSeconds - firstTimestampSeconds,
      timestamp: new Date(timestampSeconds * 1000).toLocaleString(),
      min: Math.min(...values),
      median: getMedianValue(values),
      max: Math.max(...values),
    };
  });
}

function buildGpuUtilizationDeviceTraces(jobMetricsExport?: JobMetricsExport) {
  const firstTimestampMs = (jobMetricsExport?.data ?? []).reduce<number | null>(
    (earliestTimestampMs, row) => {
      const timestampMs = parseExportTimestampMs(row.timestamp);

      if (timestampMs === null) {
        return earliestTimestampMs;
      }

      return earliestTimestampMs === null
        ? timestampMs
        : Math.min(earliestTimestampMs, timestampMs);
    },
    null
  );

  if (firstTimestampMs === null) {
    return [];
  }

  const seriesByDevice = new Map<
    string,
    { x: number[]; y: number[]; label: string }
  >();

  (jobMetricsExport?.data ?? []).forEach((row) => {
    const timestampMs = parseExportTimestampMs(row.timestamp);
    const value = normalizeGpuUtilizationValue(
      row.nersc_ldms_dcgm_gr_engine_active ??
        row.nersc_ldms_dcgm_gpu_utilization
    );

    if (timestampMs === null || value === null) {
      return;
    }

    const hostname = row.hostname ?? 'unknown-node';
    const gpuId = row.gpu_id ?? 'unknown';
    const key = `${hostname}-${gpuId}`;
    const series = seriesByDevice.get(key) ?? {
      x: [],
      y: [],
      label: `${hostname} GPU ${gpuId}`,
    };

    series.x.push((timestampMs - firstTimestampMs) / 1000);
    series.y.push(value);
    seriesByDevice.set(key, series);
  });

  return Array.from(seriesByDevice.values()).map((series, index) => ({
    x: series.x,
    y: series.y,
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: series.label,
    line: {
      color: NODE_COLORS[index % NODE_COLORS.length],
      width: 1.6,
    },
    marker: {
      symbol: NODE_MARKERS[index % NODE_MARKERS.length],
      size: 5,
    },
    hovertemplate:
      `<br><b>${series.label}</b><br>` +
      `GPU Utilization: <b>%{y:.2f}%</b><br>` +
      `Time: %{x:.1f}s<extra></extra>`,
  }));
}

const averageValues = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const formatUtilizationTableValue = (value: number | null) =>
  value === null ? 'N/A' : `${value.toFixed(3)}%`;

const formatMibTableValue = (value: number | null) =>
  value === null ? 'N/A' : `${formatNumber(value, 1)} MiB`;

const normalizeGpuMemoryMiBValue = (value: unknown) => {
  const numericValue = toFiniteNumber(value);

  return numericValue === null ? null : Math.max(0, numericValue);
};

type GpuMemorySample = {
  hostname: string;
  gpuId: number | string;
  timestampMs: number;
  timestampSeconds: number;
  value: number;
};

const getGpuMemorySamples = (
  jobMetricsSource?: JobMetricsCacheSource
): GpuMemorySample[] =>
  getJobMetricsExportRows(jobMetricsSource).flatMap((row) => {
    const timestampMs = parseExportTimestampMs(row.timestamp);
    const value = normalizeGpuMemoryMiBValue(row.nersc_ldms_dcgm_fb_used);

    if (timestampMs === null || value === null) {
      return [];
    }

    return [
      {
        hostname: row.hostname ?? 'unknown-node',
        gpuId: row.gpu_id ?? 'unknown',
        timestampMs,
        timestampSeconds: Math.floor(timestampMs / 1000),
        value,
      },
    ];
  });

function buildGpuMemoryRangePoints(
  jobMetricsSource?: JobMetricsCacheSource
): GpuUtilizationRangePoint[] {
  const samplesBySecond = new Map<number, number[]>();

  getGpuMemorySamples(jobMetricsSource).forEach((sample) => {
    const values = samplesBySecond.get(sample.timestampSeconds) ?? [];
    values.push(sample.value);
    samplesBySecond.set(sample.timestampSeconds, values);
  });

  const sortedTimestampSeconds = Array.from(samplesBySecond.keys()).sort(
    (left, right) => left - right
  );
  const firstTimestampSeconds = sortedTimestampSeconds[0] ?? 0;

  return sortedTimestampSeconds.map((timestampSeconds) => {
    const values = samplesBySecond.get(timestampSeconds) ?? [];

    return {
      time: timestampSeconds - firstTimestampSeconds,
      timestamp: new Date(timestampSeconds * 1000).toLocaleString(),
      min: Math.min(...values),
      median: getMedianValue(values),
      max: Math.max(...values),
    };
  });
}

function buildGpuMemoryNodeRows(
  jobMetricsSource?: JobMetricsCacheSource
): GpuMemoryNodeRow[] {
  const parsedRows = getGpuMemorySamples(jobMetricsSource);

  if (!parsedRows.length) {
    return [];
  }

  const firstTimestampSeconds = Math.min(
    ...parsedRows.map((row) => row.timestampSeconds)
  );
  const nodeTimeAxis = Array.from(
    new Set(
      parsedRows.map((row) => row.timestampSeconds - firstTimestampSeconds)
    )
  ).sort((left, right) => left - right);
  const samplesByNode = new Map<string, Map<number, number[]>>();

  parsedRows.forEach((row) => {
    const relativeSeconds = row.timestampSeconds - firstTimestampSeconds;
    const samplesByTime = samplesByNode.get(row.hostname) ?? new Map();
    const samples = samplesByTime.get(relativeSeconds) ?? [];
    samples.push(row.value);
    samplesByTime.set(relativeSeconds, samples);
    samplesByNode.set(row.hostname, samplesByTime);
  });

  return Array.from(samplesByNode.entries()).map(
    ([node, samplesByTime], index) => {
      const measuredValues = Array.from(samplesByTime.values()).flat();
      const memorySeries = nodeTimeAxis.map((time) => {
        const samples = samplesByTime.get(time) ?? [];

        return samples.length ? getMedianValue(samples) : null;
      });

      return {
        node,
        color: NODE_COLORS[index % NODE_COLORS.length],
        symbol: NODE_MARKERS[index % NODE_MARKERS.length],
        time: nodeTimeAxis,
        memorySeries,
        memoryMean: measuredValues.length ? averageValues(measuredValues) : null,
        memoryMin: measuredValues.length ? Math.min(...measuredValues) : null,
        memoryMax: measuredValues.length ? Math.max(...measuredValues) : null,
      };
    }
  );
}

function buildGpuMemoryDeviceTraces(jobMetricsSource?: JobMetricsCacheSource) {
  const parsedRows = getGpuMemorySamples(jobMetricsSource);
  const firstTimestampMs = parsedRows.length
    ? Math.min(...parsedRows.map((row) => row.timestampMs))
    : null;

  if (firstTimestampMs === null) {
    return [];
  }

  const seriesByDevice = new Map<
    string,
    {
      label: string;
      samples: Array<{ timestampMs: number; value: number }>;
    }
  >();

  parsedRows.forEach((row) => {
    const key = `${row.hostname}-${row.gpuId}`;
    const series = seriesByDevice.get(key) ?? {
      label: `${row.hostname} GPU ${row.gpuId}`,
      samples: [],
    };

    series.samples.push({
      timestampMs: row.timestampMs,
      value: row.value,
    });
    seriesByDevice.set(key, series);
  });

  return Array.from(seriesByDevice.values()).map((series, index) => {
    const samples = [...series.samples].sort(
      (left, right) => left.timestampMs - right.timestampMs
    );

    return {
      x: samples.map((sample) => (sample.timestampMs - firstTimestampMs) / 1000),
      y: samples.map((sample) => sample.value),
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: series.label,
      line: {
        color: NODE_COLORS[index % NODE_COLORS.length],
        width: 1.6,
      },
      marker: {
        symbol: NODE_MARKERS[index % NODE_MARKERS.length],
        size: 5,
      },
      hovertemplate:
        `<br><b>${series.label}</b><br>` +
        'GPU Memory: <b>%{y:.1f} MiB</b><br>' +
        'Time: %{x:.1f}s<extra></extra>',
    };
  });
}

function buildGpuMemoryDeviceRows(
  jobMetricsSource?: JobMetricsCacheSource
): GpuMemoryDetailRow[] {
  const deviceSamples = new Map<string, {
    hostname: string;
    gpuId: number | string;
    values: number[];
  }>();

  getGpuMemorySamples(jobMetricsSource).forEach((row) => {
    const key = `${row.hostname}-${row.gpuId}`;
    const device = deviceSamples.get(key) ?? {
      hostname: row.hostname,
      gpuId: row.gpuId,
      values: [],
    };

    device.values.push(row.value);
    deviceSamples.set(key, device);
  });

  return Array.from(deviceSamples.values()).map((device, index) => ({
    id: `${device.hostname}-${device.gpuId}`,
    label: `${device.hostname} GPU ${device.gpuId}`,
    color: NODE_COLORS[index % NODE_COLORS.length],
    symbol: NODE_MARKERS[index % NODE_MARKERS.length],
    memory: averageValues(device.values),
  }));
}

function buildGpuMemoryRangeAreaTraces(
  gpuMemoryRangePoints: GpuUtilizationRangePoint[],
  color: string = COLOR_TOKENS.gpu
) {
  const gpuTimeAxis = gpuMemoryRangePoints.map((point) => point.time);

  if (!gpuTimeAxis.length) {
    return [];
  }

  return [
    {
      x: gpuTimeAxis,
      y: gpuMemoryRangePoints.map((point) => point.max),
      type: 'scatter' as const,
      mode: 'lines' as const,
      line: { color: rgba(color, 0.18), width: 1 },
      hoverinfo: 'skip' as const,
      showlegend: false,
      name: 'GPU Memory Max',
    },
    {
      x: gpuTimeAxis,
      y: gpuMemoryRangePoints.map((point) => point.min),
      type: 'scatter' as const,
      mode: 'lines' as const,
      line: { color: rgba(color, 0.18), width: 1 },
      fill: 'tonexty' as const,
      fillcolor: rgba(color, 0.10),
      hoverinfo: 'skip' as const,
      showlegend: false,
      name: 'GPU Memory Min-Max Range',
    },
  ];
}

function buildGpuMemoryJobTraces(
  gpuMemoryRangePoints: GpuUtilizationRangePoint[]
) {
  const color = COLOR_TOKENS.gpu;

  if (!gpuMemoryRangePoints.length) {
    return [];
  }

  return [
    ...buildGpuMemoryRangeAreaTraces(gpuMemoryRangePoints, color),
    {
      x: gpuMemoryRangePoints.map((point) => point.time),
      y: gpuMemoryRangePoints.map((point) => point.median),
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: 'GPU Memory Median',
      line: { color, width: 2.8 },
      marker: { size: 6 },
      customdata: gpuMemoryRangePoints.map((point) => [
        point.min,
        point.max,
        point.median,
        point.timestamp,
      ]),
      hovertemplate:
        '<br><b>GPU Memory</b><br>' +
        'Median: <b>%{customdata[2]:.1f} MiB</b><br>' +
        'Min: %{customdata[0]:.1f} MiB<br>' +
        'Max: %{customdata[1]:.1f} MiB<br>' +
        'Timestamp: %{customdata[3]}<extra></extra>',
    },
  ];
}

function buildGpuUtilizationNodeRows(
  jobMetricsExport: JobMetricsExport | undefined,
  cpuSeries: number[],
  timeAxis: number[]
): UtilizationNodeRow[] {
  const parsedRows = (jobMetricsExport?.data ?? []).flatMap((row) => {
    const timestampMs = parseExportTimestampMs(row.timestamp);
    const value = normalizeGpuUtilizationValue(
      row.nersc_ldms_dcgm_gr_engine_active ??
        row.nersc_ldms_dcgm_gpu_utilization
    );

    if (timestampMs === null || value === null || !row.hostname) {
      return [];
    }

    return [
      {
        hostname: row.hostname,
        timestampSeconds: Math.floor(timestampMs / 1000),
        value,
      },
    ];
  });

  if (!parsedRows.length) {
    return [];
  }

  const firstTimestampSeconds = Math.min(
    ...parsedRows.map((row) => row.timestampSeconds)
  );
  const samplesByNode = new Map<string, Map<number, number[]>>();

  parsedRows.forEach((row) => {
    const relativeSeconds = row.timestampSeconds - firstTimestampSeconds;
    const samplesByTime = samplesByNode.get(row.hostname) ?? new Map();
    const samples = samplesByTime.get(relativeSeconds) ?? [];
    samples.push(row.value);
    samplesByTime.set(relativeSeconds, samples);
    samplesByNode.set(row.hostname, samplesByTime);
  });

  const fallbackTimeAxis = Array.from(
    new Set(
      parsedRows.map((row) => row.timestampSeconds - firstTimestampSeconds)
    )
  ).sort((left, right) => left - right);
  const nodeTimeAxis = timeAxis.length ? timeAxis : fallbackTimeAxis;
  const baselineCpuSeries =
    cpuSeries.length === nodeTimeAxis.length
      ? cpuSeries
      : buildDummyCpuUtilizationSeries(nodeTimeAxis);

  return Array.from(samplesByNode.entries()).map(
    ([node, samplesByTime], index) => {
      const marker = NODE_MARKERS[index % NODE_MARKERS.length];
      const color = NODE_COLORS[index % NODE_COLORS.length];
      const gpuSeries = nodeTimeAxis.map((time) => {
        const samples = samplesByTime.get(Math.round(time)) ?? [];

        return samples.length ? getMedianValue(samples) : 0;
      });
      const measuredGpuValues = Array.from(samplesByTime.values()).flat();
      const cpuNodeSeries = baselineCpuSeries.map((value, step) =>
        clampPercent(
          value * (0.86 + index * 0.02) + 1.5 * Math.cos(step / 4 + index)
        )
      );
      const cpuMean = averageValues(cpuNodeSeries);
      const gpuMean = averageValues(measuredGpuValues);

      return {
        node,
        color,
        symbol: marker,
        time: nodeTimeAxis,
        cpuSeries: cpuNodeSeries,
        gpuSeries,
        cpuMean,
        cpuMin: Math.min(...cpuNodeSeries),
        cpuMax: Math.max(...cpuNodeSeries),
        gpuMean,
        gpuMin: Math.min(...measuredGpuValues),
        gpuMax: Math.max(...measuredGpuValues),
      };
    }
  );
}

function buildGpuUtilizationDeviceRows(
  jobMetricsExport: JobMetricsExport | undefined,
  cpuSeries: number[]
): UtilizationDetailRow[] {
  const deviceSamples = new Map<string, {
    hostname: string;
    gpuId: number | string;
    values: number[];
  }>();

  (jobMetricsExport?.data ?? []).forEach((row) => {
    const value = normalizeGpuUtilizationValue(
      row.nersc_ldms_dcgm_gr_engine_active ??
        row.nersc_ldms_dcgm_gpu_utilization
    );

    if (value === null || !row.hostname) {
      return;
    }

    const gpuId = row.gpu_id ?? 'unknown';
    const key = `${row.hostname}-${gpuId}`;
    const device = deviceSamples.get(key) ?? {
      hostname: row.hostname,
      gpuId,
      values: [],
    };

    device.values.push(value);
    deviceSamples.set(key, device);
  });

  const baselineCpu = cpuSeries.length ? averageValues(cpuSeries) : null;

  return Array.from(deviceSamples.values()).map((device, index) => ({
    id: `${device.hostname}-${device.gpuId}`,
    label: `${device.hostname} GPU ${device.gpuId}`,
    color: NODE_COLORS[index % NODE_COLORS.length],
    symbol: NODE_MARKERS[index % NODE_MARKERS.length],
    cpu: baselineCpu === null
      ? null
      : clampPercent(baselineCpu * (0.9 + index * 0.01)),
    gpu: averageValues(device.values),
  }));
}

const buildDummyCpuUtilizationSeries = (timeAxis: number[]) => {
  const axis = timeAxis.length
    ? timeAxis
    : Array.from({ length: 50 }, (_, index) => index * 2);

  return axis.map((time, index) =>
    clampPercent(28 + 14 * Math.sin(time / 18) + (index % 5) * 1.8)
  );
};

function buildGpuUtilizationRangeAreaTraces(
  gpuUtilizationRangePoints: GpuUtilizationRangePoint[],
  color: string = COLOR_TOKENS.gpu
) {
  const gpuTimeAxis = gpuUtilizationRangePoints.map((point) => point.time);

  if (!gpuTimeAxis.length) {
    return [];
  }

  return [
    {
      x: gpuTimeAxis,
      y: gpuUtilizationRangePoints.map((point) => point.max),
      type: 'scatter' as const,
      mode: 'lines' as const,
      line: { color: rgba(color, 0.18), width: 1 },
      hoverinfo: 'skip' as const,
      showlegend: false,
      name: 'GPU Max',
    },
    {
      x: gpuTimeAxis,
      y: gpuUtilizationRangePoints.map((point) => point.min),
      type: 'scatter' as const,
      mode: 'lines' as const,
      line: { color: rgba(color, 0.18), width: 1 },
      fill: 'tonexty' as const,
      fillcolor: rgba(color, 0.10),
      hoverinfo: 'skip' as const,
      showlegend: false,
      name: 'GPU Min-Max Range',
    },
  ];
}

// Build utilization curves from GPU utilization reference metrics.
function generateResourceUtilizationData(
  metricsByJob: MetricsByJob | undefined,
  jobId: string,
  gpuUtilizationRangePoints: GpuUtilizationRangePoint[] = []
) {
  if (gpuUtilizationRangePoints.length) {
    const timeAxis = gpuUtilizationRangePoints.map((point) => point.time);

    return [
      {
        x: timeAxis,
        y: buildDummyCpuUtilizationSeries(timeAxis),
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'CPU',
        line: { color: COLOR_TOKENS.cpu, width: 2 },
      },
      {
        x: timeAxis,
        y: gpuUtilizationRangePoints.map((point) => point.median),
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: 'GPU',
        line: { color: COLOR_TOKENS.gpu, width: 2.5 },
      },
    ];
  }

  const rows = metricsByJob?.[jobId] ?? [];
  const sortedRows = [...rows].sort(
    (a, b) => a['Floored Relative Time'] - b['Floored Relative Time']
  );

  const fallbackTimePoints = Array.from({ length: 50 }, (_, i) => i * 2);
  if (!sortedRows.length) {
    const gpuFallback = fallbackTimePoints.map((t, idx) =>
      clampPercent(30 + 20 * Math.sin(t / 12) + (idx % 5) * 2)
    );
    const cpuFallback = buildDummyCpuUtilizationSeries(fallbackTimePoints);

    return [
      {
        x: fallbackTimePoints,
        y: cpuFallback,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'CPU',
        line: { color: COLOR_TOKENS.cpu, width: 2 },
      },
      {
        x: fallbackTimePoints,
        y: gpuFallback,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'GPU',
        line: { color: COLOR_TOKENS.gpu, width: 2 },
      },
    ];
  }

  const referenceGpu = sortedRows.map((row) =>
    Number(row.nersc_ldms_dcgm_gpu_utilization ?? 0)
  );
  const timeAxis = sortedRows.map((row) => row['Floored Relative Time']);

  // Keep GPU utilization points aligned with metrics-data.json values.
  const gpuSeries = referenceGpu;
  const cpuSeries = buildDummyCpuUtilizationSeries(timeAxis);

  return [
    {
      x: timeAxis,
      y: cpuSeries,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'CPU',
      line: { color: COLOR_TOKENS.cpu, width: 2 },
    },
    {
      x: timeAxis,
      y: gpuSeries,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'GPU',
      line: { color: COLOR_TOKENS.gpu, width: 2 },
    },
  ];
}

function generatePcieBandwidthData(
  metricsByJob: MetricsByJob | undefined,
  jobId: string
) {
  const rows = metricsByJob?.[jobId] ?? [];
  const sortedRows = [...rows].sort(
    (a, b) => a['Floored Relative Time'] - b['Floored Relative Time']
  );

  const fallbackTimePoints = Array.from({ length: 50 }, (_, i) => i * 2);
  if (!sortedRows.length) {
    const readFallback = fallbackTimePoints.map((t, idx) =>
      Math.max(0, 32 + 10 * Math.sin(t / 12) + (idx % 4) * 1.2)
    );
    const writeFallback = readFallback.map((read, idx) =>
      Math.max(0, read * 0.82 + 2.5 * Math.cos(idx / 3))
    );
    return [
      {
        x: fallbackTimePoints,
        y: readFallback,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'PCIe Read',
        line: { color: COLOR_TOKENS.cpu, width: 2 },
      },
      {
        x: fallbackTimePoints,
        y: writeFallback,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'PCIe Write',
        line: { color: COLOR_TOKENS.gpu, width: 2 },
      },
    ];
  }

  const maxRelativeTime = Math.max(
    ...sortedRows.map((row) => row['Floored Relative Time']),
    1
  );
  const gpuRef = sortedRows.map((row) =>
    clampPercent(Number(row.nersc_ldms_dcgm_gpu_utilization ?? 0))
  );
  const relativeTimePercent = sortedRows.map((row) =>
    (row['Floored Relative Time'] / maxRelativeTime) * 100
  );
  const readSeries = gpuRef.map((gpu, idx) =>
    Math.max(0, gpu * 0.64 + 8 + 2.5 * Math.sin(idx / 4))
  );
  const writeSeries = readSeries.map((read, idx) =>
    Math.max(0, read * 0.76 + 1.8 * Math.cos(idx / 3))
  );

  return [
    {
      x: relativeTimePercent,
      y: readSeries,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'PCIe Read',
      line: { color: COLOR_TOKENS.cpu, width: 2 },
    },
    {
      x: relativeTimePercent,
      y: writeSeries,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'PCIe Write',
      line: { color: COLOR_TOKENS.gpu, width: 2 },
    },
  ];
}

function generateGpuInterNodeNetworkData(
  metricsByJob: MetricsByJob | undefined,
  jobId: string
) {
  const rows = metricsByJob?.[jobId] ?? [];
  const sortedRows = [...rows].sort(
    (a, b) => a['Floored Relative Time'] - b['Floored Relative Time']
  );

  const fallbackTimePoints = Array.from({ length: 50 }, (_, i) => i * 2);
  if (!sortedRows.length) {
    const nvlinkFallback = fallbackTimePoints.map((t, idx) =>
      Math.max(0, 120 + 36 * Math.sin(t / 9) + (idx % 4) * 6)
    );
    const slingshotFallback = nvlinkFallback.map((value, idx) =>
      Math.max(0, value * 0.58 + 10 + 4 * Math.cos(idx / 4))
    );
    return [
      {
        x: fallbackTimePoints,
        y: nvlinkFallback,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'GPU Network (NVLink)',
        line: { color: COLOR_TOKENS.gpu, width: 2 },
      },
      {
        x: fallbackTimePoints,
        y: slingshotFallback,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Inter-Node Network (Slingshot)',
        line: { color: COLOR_TOKENS.network, width: 2 },
      },
    ];
  }

  const maxRelativeTime = Math.max(
    ...sortedRows.map((row) => row['Floored Relative Time']),
    1
  );
  const gpuRef = sortedRows.map((row) =>
    clampPercent(Number(row.nersc_ldms_dcgm_gpu_utilization ?? 0))
  );
  const relativeTimePercent = sortedRows.map((row) =>
    (row['Floored Relative Time'] / maxRelativeTime) * 100
  );
  const nvlinkSeries = gpuRef.map((gpu, idx) =>
    Math.max(0, gpu * 1.9 + 36 + 4 * Math.sin(idx / 4))
  );
  const slingshotSeries = nvlinkSeries.map((value, idx) =>
    Math.max(0, value * 0.56 + 6 + 2.2 * Math.cos(idx / 3))
  );

  return [
    {
      x: relativeTimePercent,
      y: nvlinkSeries,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'GPU Network (NVLink)',
      line: { color: COLOR_TOKENS.gpu, width: 2 },
    },
    {
      x: relativeTimePercent,
      y: slingshotSeries,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Inter-Node Network (Slingshot)',
      line: { color: COLOR_TOKENS.network, width: 2 },
    },
  ];
}

function generatePcieNodesData(
  readSeries: number[],
  writeSeries: number[],
  timeAxis: number[]
) {
  const readBase =
    readSeries.length > 0
      ? readSeries.reduce((sum, value) => sum + value, 0) / readSeries.length
      : 0;
  const writeBase =
    writeSeries.length > 0
      ? writeSeries.reduce((sum, value) => sum + value, 0) / writeSeries.length
      : 0;

  return Array.from({ length: 12 }, (_, idx) => {
    const nodeId = `nid${String(8670 + idx).padStart(6, '0')}`;
    const symbol = NODE_MARKERS[idx % NODE_MARKERS.length];
    const color = NODE_COLORS[idx % NODE_COLORS.length];
    const readNodeSeries = readSeries.map((value, step) =>
      Math.max(0, value * (0.8 + idx * 0.02) + 2 * Math.sin(step / 5 + idx))
    );
    const writeNodeSeries = writeSeries.map((value, step) =>
      Math.max(0, value * (0.82 + idx * 0.018) + 1.6 * Math.cos(step / 6 + idx))
    );
    const readMean = readBase * (0.8 + idx * 0.02);
    const writeMean = writeBase * (0.82 + idx * 0.018);
    return {
      node: nodeId,
      color,
      symbol,
      time: timeAxis,
      readSeries: readNodeSeries,
      writeSeries: writeNodeSeries,
      readMean,
      readMin: readMean * 0.74,
      readMax: readMean * 1.22,
      writeMean,
      writeMin: writeMean * 0.76,
      writeMax: writeMean * 1.2,
    };
  });
}

// Helper function to generate power chart data
function generatePowerData() {
  const timePoints = Array.from({ length: 50 }, (_, i) => i * 2);

  return [
    {
      x: timePoints,
      y: timePoints.map(() => 35 + Math.random() * 10),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'CPU',
      line: { color: COLOR_TOKENS.cpu, width: 2 },
    },
    {
      x: timePoints,
      y: timePoints.map(() => 165 + Math.random() * 10),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'GPU',
      line: { color: COLOR_TOKENS.gpu, width: 2 },
    },
    {
      x: timePoints,
      y: timePoints.map(() => 345 + Math.random() * 15),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Memory',
      line: { color: COLOR_TOKENS.memory, width: 2 },
    },
    {
      x: timePoints,
      y: timePoints.map(() => 240 + Math.random() * 15),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Node',
      line: { color: COLOR_TOKENS.network, width: 2 },
    },
  ];
}

// Helper function to generate roofline analysis data
function generateRooflineData() {
  const ridgeX = 1.7;
  const ridgeY = 21.5;

  // Generate clustered kernel samples near common operating regions.
  const sampleKernelPoints = (
    centerX: number,
    centerY: number,
    count: number,
    xSpread: number,
    ySpread: number
  ) =>
    Array.from({ length: count }, () => ({
      x: Math.max(0, Math.min(10, centerX + (Math.random() - 0.5) * xSpread)),
      y: Math.max(0, Math.min(25, centerY + (Math.random() - 0.5) * ySpread)),
    }));

  const kernels = [
    ...sampleKernelPoints(2.0, 15.0, 90, 0.8, 4.0),
    ...sampleKernelPoints(2.8, 13.0, 60, 0.6, 3.5),
    ...sampleKernelPoints(3.4, 14.0, 50, 0.6, 3.0),
    ...sampleKernelPoints(4.2, 13.0, 30, 0.45, 2.8),
    ...sampleKernelPoints(5.4, 12.0, 10, 0.3, 1.8),
  ];

  // Bin kernels on a coarse grid and plot each occupied bin as a colored square.
  const xBin = 0.2;
  const yBin = 2.0;
  const binMap = new Map<string, { x: number; y: number; count: number }>();
  kernels.forEach((point) => {
    const xCenter = Math.round(point.x / xBin) * xBin;
    const yCenter = Math.round(point.y / yBin) * yBin;
    const key = `${xCenter.toFixed(2)}-${yCenter.toFixed(2)}`;
    const existing = binMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      binMap.set(key, { x: xCenter, y: yCenter, count: 1 });
    }
  });
  const bins = [...binMap.values()];

  return [
    {
      x: [0, ridgeX, 9.9],
      y: [0, ridgeY, ridgeY],
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Roofline Boundary',
      line: { color: COLOR_TOKENS.cpu, width: 4 },
    },
    {
      x: [ridgeX, ridgeX],
      y: [0, 25],
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Ridge Point',
      line: { color: COLOR_TOKENS.network, width: 2, dash: 'dot' as const },
    },
    {
      x: [null],
      y: [null],
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: 'Actual Performance',
      marker: { symbol: 'square', size: 10, color: COLOR_TOKENS.memory },
      hoverinfo: 'skip' as const,
    },
    {
      x: bins.map((bin) => bin.x),
      y: bins.map((bin) => bin.y),
      type: 'scatter' as const,
      mode: 'markers' as const,
      showlegend: false,
      marker: {
        symbol: 'square',
        size: 15,
        color: bins.map((bin) => bin.count),
        colorscale: [
          [0, '#e5e7eb'],
          [0.25, '#e8c99c'],
          [0.5, '#d9a354'],
          [0.75, '#c7740a'],
          [1, '#8a4f00'],
        ],
        cmin: 1,
        cmax: Math.max(40, ...bins.map((bin) => bin.count)),
        showscale: true,
        colorbar: {
          title: { text: 'No. of Kernels' },
          tickvals: [1, 10, 20, 30, 40],
        },
        line: { color: '#ffffff', width: 0 },
      },
      customdata: bins.map((bin) => bin.count),
      hovertemplate:
        'Operational Intensity: %{x:.2f}<br>Performance: %{y:.1f} GFLOPS<br>Kernels: %{customdata}<extra></extra>',
    },
    {
      x: [ridgeX + 0.05],
      y: [ridgeY + 0.6],
      type: 'scatter' as const,
      mode: 'text' as const,
      showlegend: false,
      text: ['Ridge Point'],
      textposition: 'top left' as const,
      textfont: { color: COLOR_TOKENS.network, size: 16 },
      hoverinfo: 'skip' as const,
    },
  ];
}

// Build node-level utilization rows derived from utilization series.
function generateUtilizationNodesData(
  cpuSeries: number[],
  gpuSeries: number[],
  timeAxis: number[]
): UtilizationNodeRow[] {
  const baseCpu =
    cpuSeries.length > 0
      ? cpuSeries.reduce((sum, value) => sum + value, 0) / cpuSeries.length
      : 0;
  const baseGpu =
    gpuSeries.length > 0
      ? gpuSeries.reduce((sum, value) => sum + value, 0) / gpuSeries.length
      : 0;

  return Array.from({ length: 12 }, (_, idx) => {
    const nodeId = `nid${String(8670 + idx).padStart(6, '0')}`;
    const marker = NODE_MARKERS[idx % NODE_MARKERS.length];
    const color = NODE_COLORS[idx % NODE_COLORS.length];
    const cpuNodeSeries = cpuSeries.map((value, step) =>
      clampPercent(value * (0.78 + idx * 0.018) + 2 * Math.cos(step / 4 + idx))
    );
    const gpuNodeSeries = gpuSeries.map((value, step) =>
      clampPercent(value * (0.82 + idx * 0.02) + 2.5 * Math.sin(step / 5 + idx))
    );
    const cpuMean = clampPercent(baseCpu * (0.78 + idx * 0.02));
    const gpuMean = clampPercent(baseGpu * (0.82 + idx * 0.018));

    return {
      node: nodeId,
      color,
      symbol: marker,
      time: timeAxis,
      cpuSeries: cpuNodeSeries,
      gpuSeries: gpuNodeSeries,
      cpuMean,
      cpuMin: clampPercent(cpuMean * 0.72),
      cpuMax: clampPercent(cpuMean * 1.24),
      gpuMean,
      gpuMin: clampPercent(gpuMean * 0.74),
      gpuMax: clampPercent(gpuMean * 1.22),
    };
  });
}

function buildUtilizationBandTraces(
  nodeRows: UtilizationNodeRow[],
  meanTraces: Array<{
    x: number[];
    y: number[];
    name: string;
    line?: { color?: string; width?: number };
  }>,
  gpuUtilizationRangePoints: GpuUtilizationRangePoint[] = []
) {
  if (!nodeRows.length) {
    return [];
  }

  const time = nodeRows[0]?.time ?? [];
  const buildMetricTraces = (
    trace: {
      x: number[];
      y: number[];
      name: string;
      line?: { color?: string; width?: number };
    },
    seriesKey: 'cpuSeries' | 'gpuSeries'
  ) => {
    const label = trace.name as 'CPU' | 'GPU';
    const color =
      trace.line?.color ??
      (label === 'CPU' ? COLOR_TOKENS.cpu : COLOR_TOKENS.gpu);
    const stats = time.map((_, index) => {
      const values = nodeRows.map((row) => row[seriesKey][index] ?? 0);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const mean = Number(trace.y[index] ?? 0);

      return { min, max, mean };
    });

    return [
      {
        x: time,
        y: stats.map((point) => point.max),
        type: 'scatter' as const,
        mode: 'lines' as const,
        line: { color: 'transparent', width: 0 },
        hoverinfo: 'skip' as const,
        showlegend: false,
        name: `${label} Max`,
      },
      {
        x: time,
        y: stats.map((point) => point.min),
        type: 'scatter' as const,
        mode: 'lines' as const,
        line: { color: 'transparent', width: 0 },
        fill: 'tonexty' as const,
        fillcolor: rgba(color, 0.14),
        hoverinfo: 'skip' as const,
        showlegend: false,
        name: `${label} Range`,
      },
      {
        x: trace.x,
        y: trace.y,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: label,
        line: { color, width: trace.line?.width ?? 2.5 },
        customdata: stats.map((point) => [point.min, point.max, point.mean]),
        hovertemplate:
          `<br><b>${label}</b><br>` +
          `Mean: <b>%{customdata[2]:.2f}%</b><br>` +
          `Min: %{customdata[0]:.2f}%<br>` +
          `Max: %{customdata[1]:.2f}%<extra></extra>`,
      },
    ];
  };
  const buildGpuExportTraces = (
    trace: {
      x: number[];
      y: number[];
      name: string;
      line?: { color?: string; width?: number };
    }
  ) => {
    const color = trace.line?.color ?? COLOR_TOKENS.gpu;
    const gpuTimeAxis = gpuUtilizationRangePoints.map((point) => point.time);
    const customData = gpuUtilizationRangePoints.map((point) => [
      point.min,
      point.max,
      point.median,
      point.timestamp,
    ]);

    return [
      ...buildGpuUtilizationRangeAreaTraces(gpuUtilizationRangePoints, color),
      {
        x: gpuTimeAxis,
        y: gpuUtilizationRangePoints.map((point) => point.median),
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: 'GPU Median',
        line: { color, width: trace.line?.width ?? 2.8 },
        marker: { size: 6 },
        customdata: customData,
        hovertemplate:
          '<br><b>GPU Utilization</b><br>' +
          'Median: <b>%{customdata[2]:.2f}%</b><br>' +
          'Min: %{customdata[0]:.2f}%<br>' +
          'Max: %{customdata[1]:.2f}%<br>' +
          'Timestamp: %{customdata[3]}<extra></extra>',
      },
    ];
  };

  const gpuTrace = meanTraces.find((trace) => trace.name === 'GPU');
  const cpuTrace = meanTraces.find((trace) => trace.name === 'CPU');

  return [
    ...(cpuTrace ? buildMetricTraces(cpuTrace, 'cpuSeries') : []),
    ...(gpuTrace
      ? gpuUtilizationRangePoints.length
        ? buildGpuExportTraces(gpuTrace)
        : buildMetricTraces(gpuTrace, 'gpuSeries')
      : []),
  ];
}

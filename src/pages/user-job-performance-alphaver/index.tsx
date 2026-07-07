import {
  Box,
  Chip,
  Divider,
  Drawer,
  Stack,
  Paper,
  Typography,
  Button,
  Breadcrumbs,
  Checkbox,
  Link as MuiLink,
  IconButton,
  Menu,
  MenuItem,
  Popover,
  Tooltip,
  FormControlLabel,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { createFileRoute, Link as RouterLink, useNavigate } from '@tanstack/react-router';
import { MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { FilterContext } from '../../components/FilterContext';
import { SciDataGrid } from '../../components/SciDataGrid';
import {
  GridColDef,
  GridColumnVisibilityModel,
  GridRenderCellParams,
  GridRowSelectionModel,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
} from '@mui/x-data-grid';
import { useDataFromSource } from '../../hooks/useDataFromSource';
import Plot from 'react-plotly.js';
import {
  buildComputePerformanceSnapshot,
  buildRecentJobPerformanceRows,
  ComputeMetricsByJob,
  ComputeMetricsExport,
  getJobPerformanceSummary,
  IrisJobData,
  MetricsByJob,
  LegacyUserJobData,
  MetricStats,
  MetricFetchStatus,
  NetworkPerformanceSnapshot,
  PerformanceSnapshot,
} from './-controllers/recentJobPerformance.controller';
import { useIrisGpuUtilization } from './-controllers/irisGpuUtilization.controller';
import { cleanPath } from '../../utils/queryParams.utils';

export const Route = createFileRoute('/user-job-performance-alphaver/')({
  component: UserJobPerformance,
});

const parseJobTimestamp = (value: string) => new Date(value.replace(' ', 'T'));

const shortDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const fullDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

const formatShortDateTime = (value: string) => {
  const timestamp = parseJobTimestamp(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return shortDateTimeFormatter.format(timestamp);
};

const formatFullDateTime = (value: string) => {
  const timestamp = parseJobTimestamp(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return fullDateTimeFormatter.format(timestamp);
};

const TERTIARY_ACTION_COLOR = '#374151';
const ACTIONS_COLUMN_WIDTH = 152;
const PANEL_WIDTH = 500;
const ACTIONS_COLUMN_FIELD = 'actions';
const DEFAULT_COLUMN_ORDER = [
  'jobId',
  'submitTime',
  'qos',
  'waitTime',
  'executionTime',
  'jobStatus',
  'nodeCount',
  'energyConsumed',
  'jobName',
  'projectId',
  'nodeHours',
  'gpuMemoryUtilization',
  'endTime',
  ACTIONS_COLUMN_FIELD,
];
const DEFAULT_VISIBLE_COLUMN_FIELDS = new Set([
  'jobId',
  'submitTime',
  'qos',
  'executionTime',
  'jobStatus',
  'nodeCount',
  'energyConsumed',
  ACTIONS_COLUMN_FIELD,
]);
const DEFAULT_COLUMN_VISIBILITY_MODEL = DEFAULT_COLUMN_ORDER.reduce<GridColumnVisibilityModel>(
  (model, field) => {
    if (!DEFAULT_VISIBLE_COLUMN_FIELDS.has(field)) {
      model[field] = false;
    }

    return model;
  },
  {}
);
const ORDER_LOCKED_COLUMN_FIELDS = new Set([ACTIONS_COLUMN_FIELD]);
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

interface PowerMetricRow {
  [key: string]: number | string | null | undefined;
}

interface PowerConsumptionSummary {
  nodePower: number | null;
  cpuPower: number | null;
  gpuPower: number | null;
  memoryPower: number | null;
}

const getLocalDataSourcePath = (dataSource: string) => {
  const base = document.querySelector('base')?.getAttribute('href') ?? '';
  const basePath = import.meta.env.VITE_BASE_URL || '';
  const leadingSlash = basePath ? '/' : '';
  const basename = cleanPath(leadingSlash + base + basePath);

  return `${basename}/${dataSource}`;
};

function useJobComputeMetricsExport(jobId: string | null) {
  const [computeMetricsExportState, setComputeMetricsExportState] =
    useState<{ jobId: string; data: ComputeMetricsExport } | undefined>();

  useEffect(() => {
    let isActive = true;

    if (!jobId) {
      setComputeMetricsExportState(undefined);
      return () => {
        isActive = false;
      };
    }

    const fetchComputeMetricsExport = async () => {
      const dataSourcePath = getLocalDataSourcePath(
        `data/user-job-performance/job_exports/job_${jobId}.json`
      );

      try {
        const response = await fetch(dataSourcePath);

        if (!response.ok) {
          if (isActive) {
            setComputeMetricsExportState(undefined);
          }
          return;
        }

        const nextComputeMetricsExport = await response.json() as ComputeMetricsExport;

        if (isActive) {
          setComputeMetricsExportState({
            jobId,
            data: nextComputeMetricsExport,
          });
        }
      } catch {
        if (isActive) {
          setComputeMetricsExportState(undefined);
        }
      }
    };

    setComputeMetricsExportState(undefined);
    fetchComputeMetricsExport();

    return () => {
      isActive = false;
    };
  }, [jobId]);

  return computeMetricsExportState?.jobId === jobId
    ? computeMetricsExportState.data
    : undefined;
}

const getUtilizationBarColor = (value: number) => {
  if (value >= 70) {
    return '#16a34a';
  }
  if (value >= 40) {
    return '#d29731';
  }
  return '#dc2626';
};

const getJobStatusTone = (status: string) => {
  const normalized = status.toLowerCase();

  if (normalized.includes('complete')) {
    return {
      color: '#166534',
      backgroundColor: '#dcfce7',
      borderColor: '#86efac',
    };
  }
  if (normalized.includes('running')) {
    return {
      color: '#1d4ed8',
      backgroundColor: '#dbeafe',
      borderColor: '#93c5fd',
    };
  }
  if (normalized.includes('wait')) {
    return {
      color: '#475569',
      backgroundColor: '#e2e8f0',
      borderColor: '#cbd5e1',
    };
  }

  return {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  };
};

const formatJobStatusLabel = (status: string) => {
  const normalized = status.trim();

  if (!normalized) {
    return 'Unknown';
  }

  return normalized
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

function UtilizationBarCell({
  value,
  status,
}: {
  value: number | null;
  status?: MetricFetchStatus;
}) {
  if (status === 'loading') {
    return (
      <Typography variant="body2" sx={{ color: '#2563eb', fontWeight: 600 }}>
        Loading
      </Typography>
    );
  }

  if (status === 'failed' || value === null) {
    return (
      <Typography variant="body2" sx={{ color: '#6b7280' }}>
        N/A
      </Typography>
    );
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return (
      <Typography variant="body2" sx={{ color: '#6b7280' }}>
        N/A
      </Typography>
    );
  }

  const utilization = Math.max(0, Math.min(100, numericValue));

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, width: '100%' }}>
      <Box
        sx={{
          width: 56,
          height: 9,
          bgcolor: '#d1d5db',
          overflow: 'hidden',
          borderRadius: 999,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: `${utilization}%`,
            height: '100%',
            bgcolor: getUtilizationBarColor(utilization),
          }}
        />
      </Box>
      <Typography
        variant="body2"
        sx={{ minWidth: '38px', fontVariantNumeric: 'tabular-nums' }}
      >
        {utilization}%
      </Typography>
    </Box>
  );
}

const formatSnapshotValue = (value: number | null, unit: string) => {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A';
  }

  const formattedValue = value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });

  return unit === '%' ? `${formattedValue}%` : `${formattedValue} ${unit}`;
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

const getFiniteMetricStatsValues = (stats: MetricStats) => (
  [stats.min, stats.max, stats.median]
    .filter((value): value is number => (
      typeof value === 'number' && Number.isFinite(value)
    ))
);

const getMetricRangeDomain = (stats: MetricStats, unit: string): [number, number] => {
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

function ComputePerformanceCard({
  snapshot,
}: {
  snapshot: PerformanceSnapshot;
}) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
        Compute Performance
      </Typography>
      <Divider sx={{ mb: 0.5 }} />
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
    </Paper>
  );
}

function PowerConsumptionCard({
  powerConsumption,
}: {
  powerConsumption: PowerConsumptionSummary;
}) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
        Power Consumption
      </Typography>
      <Divider sx={{ mb: 0.5 }} />
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
    </Paper>
  );
}

function NetworkPerformanceCard({
  networkPerformance,
}: {
  networkPerformance: NetworkPerformanceSnapshot;
}) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
        Network Performance
      </Typography>
      <Divider sx={{ mb: 0.5 }} />
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
    </Paper>
  );
}

function getColumnLabel(column: GridColDef) {
  return column.headerName || column.field;
}

function ColumnSettingsButton({
  columns,
  columnVisibilityModel,
  onColumnVisibilityModelChange,
  onMoveColumn,
  onResetColumnSettings,
}: {
  columns: GridColDef[];
  columnVisibilityModel: GridColumnVisibilityModel;
  onColumnVisibilityModelChange: (model: GridColumnVisibilityModel) => void;
  onMoveColumn: (field: string, direction: -1 | 1) => void;
  onResetColumnSettings: () => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchorEl);
  const reorderableFields = useMemo(
    () => columns
      .filter((column) => !ORDER_LOCKED_COLUMN_FIELDS.has(column.field))
      .map((column) => column.field),
    [columns]
  );

  const openColumnSettings = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const closeColumnSettings = () => {
    setAnchorEl(null);
  };

  const toggleColumnVisibility = (field: string, isVisible: boolean) => {
    const nextModel = { ...columnVisibilityModel };

    if (isVisible) {
      delete nextModel[field];
    } else {
      nextModel[field] = false;
    }

    onColumnVisibilityModelChange(nextModel);
  };

  return (
    <>
      <Button
        size="small"
        startIcon={<ViewColumnIcon />}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : undefined}
        onClick={openColumnSettings}
      >
        Columns
      </Button>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={closeColumnSettings}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            width: 390,
            maxWidth: 'calc(100vw - 32px)',
            mt: 1,
            borderRadius: 2,
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Column settings
          </Typography>
          <Tooltip title="Reset columns">
            <IconButton
              size="small"
              aria-label="Reset columns"
              onClick={onResetColumnSettings}
            >
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Divider />
        <Box
          component="ul"
          sx={{
            m: 0,
            p: 0.75,
            listStyle: 'none',
            maxHeight: 390,
            overflow: 'auto',
          }}
        >
          {columns.map((column) => {
            const label = getColumnLabel(column);
            const isVisible = columnVisibilityModel[column.field] !== false;
            const canHide = column.hideable !== false;
            const canMove = !ORDER_LOCKED_COLUMN_FIELDS.has(column.field);
            const reorderIndex = reorderableFields.indexOf(column.field);

            return (
              <Box
                component="li"
                key={column.field}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  minHeight: 42,
                  px: 0.75,
                  borderRadius: 1,
                  '&:hover': {
                    bgcolor: '#f8fafc',
                  },
                }}
              >
                <FormControlLabel
                  control={(
                    <Checkbox
                      size="small"
                      checked={isVisible}
                      disabled={!canHide}
                      onChange={(event) => (
                        toggleColumnVisibility(column.field, event.target.checked)
                      )}
                    />
                  )}
                  label={(
                    <Typography
                      variant="body2"
                      sx={{
                        color: canHide ? '#111827' : '#4b5563',
                        fontWeight: canHide ? 500 : 700,
                      }}
                    >
                      {label}
                    </Typography>
                  )}
                  sx={{
                    m: 0,
                    minWidth: 0,
                    flex: '1 1 auto',
                    '& .MuiFormControlLabel-label': {
                      minWidth: 0,
                    },
                  }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <Tooltip title="Move up">
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Move ${label} up`}
                        disabled={!canMove || reorderIndex <= 0}
                        onClick={() => onMoveColumn(column.field, -1)}
                      >
                        <KeyboardArrowUpIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move down">
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Move ${label} down`}
                        disabled={!canMove || reorderIndex === reorderableFields.length - 1}
                        onClick={() => onMoveColumn(column.field, 1)}
                      >
                        <KeyboardArrowDownIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Popover>
    </>
  );
}

function JobTableToolbar({
  setPanelAnchorEl,
  columns,
  columnVisibilityModel,
  onColumnVisibilityModelChange,
  onMoveColumn,
  onResetColumnSettings,
}: {
  setPanelAnchorEl: (element: HTMLDivElement | null) => void;
  columns: GridColDef[];
  columnVisibilityModel: GridColumnVisibilityModel;
  onColumnVisibilityModelChange: (model: GridColumnVisibilityModel) => void;
  onMoveColumn: (field: string, direction: -1 | 1) => void;
  onResetColumnSettings: () => void;
}) {
  const handlePanelAnchorRef = useCallback(
    (element: HTMLDivElement | null) => {
      setPanelAnchorEl(element);
    },
    [setPanelAnchorEl]
  );

  return (
    <GridToolbarContainer
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
      }}
    >
      <GridToolbarQuickFilter
        quickFilterParser={(input) =>
          input
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        }
        sx={{
          minWidth: 320,
          maxWidth: 440,
          flex: '1 1 320px',
          '& .MuiInputBase-root': {
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#111827',
            bgcolor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 2,
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
            px: 1,
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          },
          '& .MuiInputBase-root:hover': {
            borderColor: '#94a3b8',
          },
          '& .MuiInputBase-root.Mui-focused': {
            borderColor: '#2563eb',
            boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.14)',
          },
          '& .MuiInputBase-input': {
            py: 1,
          },
          '& .MuiSvgIcon-root': {
            color: '#64748b',
          },
        }}
      />
      <Box
        ref={handlePanelAnchorRef}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 0.75,
          flexWrap: 'wrap',
          '& .MuiButton-root': {
            minWidth: 'auto',
            px: 1,
            py: 0.5,
            fontSize: '0.75rem',
            fontWeight: 500,
            textTransform: 'none',
            color: TERTIARY_ACTION_COLOR,
          },
          '& .MuiButton-startIcon': {
            mr: 0.5,
          },
          '& .MuiSvgIcon-root': {
            fontSize: 18,
            color: TERTIARY_ACTION_COLOR,
          },
        }}
      >
        <ColumnSettingsButton
          columns={columns}
          columnVisibilityModel={columnVisibilityModel}
          onColumnVisibilityModelChange={onColumnVisibilityModelChange}
          onMoveColumn={onMoveColumn}
          onResetColumnSettings={onResetColumnSettings}
        />
        <GridToolbarFilterButton />
        <GridToolbarDensitySelector />
      </Box>
    </GridToolbarContainer>
  );
}

/**
 * User Job Performance page component
 */
function UserJobPerformance() {
  const navigate = useNavigate();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeDrawerJobId, setActiveDrawerJobId] = useState<string | null>(null);
  const [maxSelectionTooltipOpen, setMaxSelectionTooltipOpen] = useState(false);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>([]);
  const [panelAnchorEl, setPanelAnchorEl] = useState<HTMLDivElement | null>(null);
  const [columnVisibilityModel, setColumnVisibilityModel] =
    useState<GridColumnVisibilityModel>(() => ({ ...DEFAULT_COLUMN_VISIBILITY_MODEL }));
  const [columnOrder, setColumnOrder] = useState<string[]>(() => [...DEFAULT_COLUMN_ORDER]);

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
  const {
    summariesByJob: irisGpuUtilizationByJob,
    status: irisGpuUtilizationStatus,
  } = useIrisGpuUtilization(Boolean(irisJobsData?.length));

  const openActionsMenu = useCallback((event: MouseEvent<HTMLElement>, jobId: string) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setSelectedJobId(jobId);
  }, []);

  const closeActionsMenu = () => {
    setMenuAnchorEl(null);
  };

  const closeJobSummaryDrawer = () => {
    setActiveDrawerJobId(null);
  };

  const openJobSummaryDrawer = useCallback((jobId: string) => {
    setActiveDrawerJobId(jobId);
  }, []);

  const handlePanelAnchorElChange = useCallback((element: HTMLDivElement | null) => {
    setPanelAnchorEl((currentElement) => (
      currentElement === element ? currentElement : element
    ));
  }, []);

  const moveColumn = useCallback((field: string, direction: -1 | 1) => {
    if (ORDER_LOCKED_COLUMN_FIELDS.has(field)) {
      return;
    }

    setColumnOrder((currentOrder) => {
      const reorderableFields = currentOrder.filter(
        (columnField) => !ORDER_LOCKED_COLUMN_FIELDS.has(columnField)
      );
      const currentIndex = reorderableFields.indexOf(field);
      const targetIndex = currentIndex + direction;

      if (currentIndex === -1 || targetIndex < 0 || targetIndex >= reorderableFields.length) {
        return currentOrder;
      }

      const nextReorderableFields = [...reorderableFields];
      const [movedField] = nextReorderableFields.splice(currentIndex, 1);
      nextReorderableFields.splice(targetIndex, 0, movedField);

      return [...nextReorderableFields, ACTIONS_COLUMN_FIELD];
    });
  }, []);

  const resetColumnSettings = useCallback(() => {
    setColumnOrder([...DEFAULT_COLUMN_ORDER]);
    setColumnVisibilityModel({ ...DEFAULT_COLUMN_VISIBILITY_MODEL });
  }, []);

  const viewRealData = () => {
    if (!selectedJobId) {
      return;
    }

    navigate({
      to: '/user-job-performance-alphaver/performance/$id',
      params: { id: selectedJobId },
    });
    closeActionsMenu();
  };

  const jobData = useMemo(
    () => buildRecentJobPerformanceRows({
      legacyJobs: userJobsData,
      irisJobs: irisJobsData,
      metricsByJob,
      irisGpuUtilizationByJob,
      irisGpuUtilizationStatus,
    }),
    [irisGpuUtilizationByJob, irisGpuUtilizationStatus, irisJobsData, metricsByJob, userJobsData]
  );
  const activeJob = jobData.find((job) => job.id === activeDrawerJobId) ?? null;
  const selectedJobCount = rowSelectionModel.length;
  const activeJobMetricsByJob = activeJob?.gpuUtilizationStatus
    ? undefined
    : metricsByJob;
  const performanceSummary = activeJob
    ? getJobPerformanceSummary(activeJob, activeJobMetricsByJob)
    : null;
  const activeJobComputeMetricsExport = useJobComputeMetricsExport(activeJob?.jobId ?? null);
  const computeMetricsByJob = useMemo<ComputeMetricsByJob | undefined>(
    () => (activeJob && activeJobComputeMetricsExport
      ? { [activeJob.jobId]: activeJobComputeMetricsExport }
      : undefined),
    [activeJob, activeJobComputeMetricsExport]
  );
  const computePerformanceSnapshot = activeJob && performanceSummary
    ? buildComputePerformanceSnapshot({
      jobId: activeJob.jobId,
      baseSnapshot: performanceSummary.snapshot,
      computeMetricsByJob,
    })
    : null;
  const powerConsumptionSummary = activeJob
    ? getPowerConsumptionSummary({
      jobId: activeJob.jobId,
      metricsByJob,
      nodePowerRows,
      cpuPowerRows,
      gpuPowerRows,
      memoryPowerRows,
    })
    : null;
  const donutSegments = performanceSummary ? (() => {
    const activeShare = 100 - performanceSummary.idlePercent;
    const basis = [
      { label: 'GPU', value: performanceSummary.gpuUtilization, color: '#10b981' },
      { label: 'CPU', value: performanceSummary.cpuUtilization, color: '#3b82f6' },
      { label: 'Memory', value: performanceSummary.memoryUtilization, color: '#f59e0b' },
    ];
    const totalBasis = basis.reduce((sum, item) => sum + item.value, 0) || 1;

    return [
      ...basis.map((item) => ({
        ...item,
        share: Number(((activeShare * item.value) / totalBasis).toFixed(1)),
      })),
      {
        label: 'Others',
        value: performanceSummary.idlePercent,
        share: Number(performanceSummary.idlePercent.toFixed(1)),
        color: '#94a3b8',
      },
    ];
  })() : [];

  // Table columns definition
  const columns = useMemo<GridColDef[]>(() => [
    {
      field: 'jobId',
      headerName: 'Job ID',
      minWidth: 112,
      flex: 0.65,
      hideable: false,
      renderCell: (params: GridRenderCellParams) => (
        <RouterLink
          to="/user-job-performance-alphaver/$id"
          params={{ id: String(params.row.jobId) }}
          style={{
            color: '#2563eb',
            fontWeight: 500,
            textAlign: 'left',
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          {String(params.value)}
        </RouterLink>
      ),
    },
    {
      field: 'jobName',
      headerName: 'Job Name',
      minWidth: 160,
      flex: 1,
    },
    {
      field: 'submitTime',
      headerName: 'Submit time',
      minWidth: 168,
      flex: 1,
      renderCell: (params: GridRenderCellParams) => (
        <Tooltip title={formatFullDateTime(params.value as string)} arrow>
          <Typography variant="body2">{formatShortDateTime(params.value as string)}</Typography>
        </Tooltip>
      ),
    },
    {
      field: 'projectId',
      headerName: 'Project ID',
      minWidth: 104,
      flex: 0.6,
    },
    {
      field: 'qos',
      headerName: 'QOS',
      minWidth: 96,
      flex: 0.65,
    },
    {
      field: 'nodeHours',
      headerName: 'Node Hours',
      minWidth: 112,
      flex: 0.6,
      type: 'number',
    },
    {
      field: 'nodeCount',
      headerName: 'No. of Nodes',
      minWidth: 112,
      flex: 0.65,
      type: 'number',
    },
    {
      field: 'waitTime',
      headerName: 'Wait Time',
      minWidth: 104,
      flex: 0.6,
    },
    {
      field: 'executionTime',
      headerName: 'Run Time',
      minWidth: 104,
      flex: 0.6,
    },
    {
      field: 'jobStatus',
      headerName: 'Job Status',
      minWidth: 116,
      flex: 0.65,
      renderCell: (params: GridRenderCellParams) => {
        const status = String(params.value ?? '');
        const statusTone = getJobStatusTone(status);

        return (
          <Chip
            label={formatJobStatusLabel(status)}
            size="small"
            sx={{
              height: 22,
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: statusTone.color,
              bgcolor: statusTone.backgroundColor,
              border: `1px solid ${statusTone.borderColor}`,
              '& .MuiChip-label': {
                px: 0.75,
              },
            }}
          />
        );
      },
    },
    {
      field: 'gpuMemoryUtilization',
      headerName: 'GPU Memory',
      minWidth: 168,
      flex: 1,
      renderCell: (params: GridRenderCellParams) => (
        <UtilizationBarCell
          value={params.value === null ? null : Number(params.value)}
          status={params.row.gpuUtilizationStatus}
        />
      ),
    },
    {
      field: 'energyConsumed',
      headerName: 'Energy Consumed (J)',
      minWidth: 144,
      flex: 0.8,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">{params.value}</Typography>
      ),
    },
    {
      field: 'endTime',
      headerName: 'End time',
      minWidth: 168,
      flex: 1,
      renderCell: (params: GridRenderCellParams) => (
        <Tooltip title={formatFullDateTime(params.value as string)} arrow>
          <Typography variant="body2">{formatShortDateTime(params.value as string)}</Typography>
        </Tooltip>
      ),
    },
    {
      field: ACTIONS_COLUMN_FIELD,
      headerName: 'Actions',
      width: ACTIONS_COLUMN_WIDTH,
      sortable: false,
      filterable: false,
      hideable: false,
      disableReorder: true,
      disableColumnMenu: true,
      headerClassName: 'sticky-actions-column',
      cellClassName: 'sticky-actions-column',
      renderCell: (params: GridRenderCellParams) => (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 0.5,
            width: '100%',
            whiteSpace: 'nowrap',
          }}
        >
          <RouterLink
            to="/user-job-performance-alphaver/$id"
            params={{ id: String(params.row.id) }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openJobSummaryDrawer(params.row.id);
            }}
            style={{
              fontSize: '0.875rem',
              textDecoration: 'none',
              color: '#2563eb',
            }}
          >
            Quick View
          </RouterLink>
          <IconButton
            size="small"
            aria-label="More actions"
            onClick={(event) => {
              event.stopPropagation();
              openActionsMenu(event, params.row.id);
            }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ], [openActionsMenu, openJobSummaryDrawer]);
  const orderedColumns = useMemo(() => {
    const columnsByField = new Map(columns.map((column) => [column.field, column]));
    const orderedFields = columnOrder.filter((field) => columnsByField.has(field));
    const orderedFieldLookup = new Set(orderedFields);
    const orderedDataColumns = orderedFields
      .filter((field) => field !== ACTIONS_COLUMN_FIELD)
      .map((field) => columnsByField.get(field)!);
    const missingColumns = columns.filter(
      (column) => (
        column.field !== ACTIONS_COLUMN_FIELD && !orderedFieldLookup.has(column.field)
      )
    );
    const actionsColumn = columnsByField.get(ACTIONS_COLUMN_FIELD);

    return actionsColumn
      ? [...orderedDataColumns, ...missingColumns, actionsColumn]
      : [...orderedDataColumns, ...missingColumns];
  }, [columnOrder, columns]);

  const toolbarSlot = useCallback(
    () => (
      <JobTableToolbar
        setPanelAnchorEl={handlePanelAnchorElChange}
        columns={orderedColumns}
        columnVisibilityModel={columnVisibilityModel}
        onColumnVisibilityModelChange={setColumnVisibilityModel}
        onMoveColumn={moveColumn}
        onResetColumnSettings={resetColumnSettings}
      />
    ),
    [
      columnVisibilityModel,
      handlePanelAnchorElChange,
      moveColumn,
      orderedColumns,
      resetColumnSettings,
    ]
  );

  return (
    <FilterContext>
      <Box
        sx={{
          width: '80%',
          maxWidth: '1800px',
          margin: '0 auto',
          padding: 3,
        }}
      >
        {/* Breadcrumb */}
        <Breadcrumbs sx={{ mb: 2 }}>
          <MuiLink underline="hover" color="primary" href="#">
            Alpha ver.
          </MuiLink>
          <Typography color="text.primary">User Job Performance Metrics</Typography>
        </Breadcrumbs>

        {/* Page Header */}
        <Box sx={{ 
          mb: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Typography
            variant="h4"
            sx={{ fontWeight: 700, color: '#1a1a1a', mb: 1 }}
          >
            Your Jobs and Performance - Alpha ver.
          </Typography>

          <Tooltip
              open={maxSelectionTooltipOpen}
              title="Max 5 jobs can be compared"
              placement="top"
              arrow
            >
              <Button
                variant={selectedJobCount > 0 ? 'contained' : 'outlined'}
                onClick={() => navigate({ to: '/user-job-performance-alphaver/compare' })}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: '#1a2f5a',
                  color: selectedJobCount > 0 ? '#ffffff' : '#1a2f5a',
                  bgcolor: selectedJobCount > 0 ? '#1a2f5a' : 'transparent',
                  '&:hover': {
                    borderColor: '#1a2f5a',
                    bgcolor: selectedJobCount > 0 ? '#0f1f42' : 'rgba(26, 47, 90, 0.08)',
                    color: selectedJobCount > 0 ? '#ffffff' : '#1a2f5a',
                  },
                }}
              >
                Compare More Metrics →
              </Button>
            </Tooltip>
        </Box>

        {/* Recent Jobs and Performance Section */}
        <Box>

          <Paper sx={{ p: 1, width: '100%' }}>
            {userJobsData === undefined && irisJobsData === undefined ? (
              <Box sx={{ p: 3 }}>
                <Typography>Loading job data...</Typography>
              </Box>
            ) : (
              <SciDataGrid
                rows={jobData}
                columns={orderedColumns}
                pagination
                paginationMode="client"
                checkboxSelection
                disableVirtualization
                disableColumnSelector
                disableRowSelectionOnClick
                getRowId={(row) => row.id}
                autoHeight
                rowSelectionModel={rowSelectionModel}
                onRowSelectionModelChange={(newSelectionModel) => {
                  if (newSelectionModel.length > 5) {
                    setMaxSelectionTooltipOpen(true);
                    window.setTimeout(() => setMaxSelectionTooltipOpen(false), 1800);
                  }
                  const cappedSelection = newSelectionModel.slice(0, 5);
                  setRowSelectionModel(cappedSelection);
                }}
                columnVisibilityModel={columnVisibilityModel}
                onColumnVisibilityModelChange={setColumnVisibilityModel}
                initialState={{
                  pagination: { paginationModel: { page: 0, pageSize: 25 } },
                }}
                pageSizeOptions={[10, 25, 50]}
                slots={{
                  toolbar: toolbarSlot,
                }}
                slotProps={{
                  panel: {
                    anchorEl: panelAnchorEl,
                    placement: 'bottom-end',
                  },
                }}
                onRowClick={(params) => {
                  openJobSummaryDrawer(params.row.id);
                }}
                sx={{
                  width: '100%',
                  '& .MuiDataGrid-toolbarContainer': {
                    px: 1,
                    pt: 1,
                    pb: 0.5,
                    gap: 1,
                  },
                  '& .MuiDataGrid-columnHeaders': {
                    bgcolor: '#f5f5f5',
                    fontWeight: 600,
                  },
                  '& .MuiDataGrid-cellCheckbox, & .MuiDataGrid-columnHeaderCheckbox': {
                    justifyContent: 'center',
                  },
                  '& .MuiDataGrid-columnHeader, & .MuiDataGrid-columnHeaderTitleContainer, & .MuiDataGrid-columnHeaderTitleContainerContent': {
                    justifyContent: 'flex-start',
                  },
                  '& .MuiDataGrid-columnHeaderTitle': {
                    width: '100%',
                    textAlign: 'left',
                  },
                  '& .MuiDataGrid-cell': {
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                  },
                  '& .MuiDataGrid-cell--textRight, & .MuiDataGrid-cell--withRenderer': {
                    justifyContent: 'flex-start',
                  },
                  '& .MuiDataGrid-row': {
                    cursor: 'pointer',
                  },
                  '& .sticky-actions-column': {
                    position: 'sticky !important',
                    right: 0,
                    zIndex: 3,
                    backgroundColor: '#ffffff',
                    boxShadow: '-8px 0 12px -12px rgba(15, 23, 42, 0.45)',
                  },
                  '& .MuiDataGrid-columnHeader.sticky-actions-column': {
                    zIndex: 4,
                    backgroundColor: '#f5f5f5',
                  },
                }}
              />
            )}
          </Paper>
          <Menu
            anchorEl={menuAnchorEl}
            open={Boolean(menuAnchorEl)}
            onClose={closeActionsMenu}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <MenuItem onClick={viewRealData}>
              View Real Data
            </MenuItem>
          </Menu>
        </Box>
      </Box>
      <Drawer
        anchor="right"
        open={Boolean(activeJob)}
        onClose={closeJobSummaryDrawer}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: PANEL_WIDTH },
            bgcolor: '#f8fafc',
          },
        }}
      >
        {activeJob && performanceSummary && computePerformanceSnapshot && powerConsumptionSummary && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {(() => {
              const statusTone = getJobStatusTone(activeJob.jobStatus);
              const statusLabel = formatJobStatusLabel(activeJob.jobStatus);

              return (
                <>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <Box
              sx={{
                px: 3,
                py: 2.5,
                bgcolor: '#f8fafc',
                color: '#111827',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline" sx={{ letterSpacing: '0.08em', opacity: 0.75 }}>
                    Job Summary
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {activeJob.jobId}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <Typography variant="body2" sx={{ color: '#4b5563' }}>
                      Job Name {activeJob.jobName}
                    </Typography>
                    <Chip
                      label={statusLabel}
                      size="small"
                      sx={{
                        height: 24,
                        fontWeight: 700,
                        color: statusTone.color,
                        bgcolor: statusTone.backgroundColor,
                        border: `1px solid ${statusTone.borderColor}`,
                        '& .MuiChip-label': {
                          px: 1,
                        },
                      }}
                    />
                  </Box>
                </Box>
                <IconButton
                  onClick={closeJobSummaryDrawer}
                  sx={{ color: '#111827', mt: -0.5, mr: -1 }}
                  aria-label="Close summary panel"
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>

            <Box sx={{ p: 3 }}>
              <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 2 }}>
                  Overview
                </Typography>
                <Stack spacing={1.25}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Submit time</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                      {formatFullDateTime(activeJob.submitTime)}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>End time</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                      {formatFullDateTime(activeJob.endTime)}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Wait time</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                      {activeJob.waitTime}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Run time</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                      {activeJob.executionTime}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Job status</Typography>
                    <Chip
                      label={statusLabel}
                      size="small"
                      sx={{
                        height: 24,
                        fontWeight: 700,
                        color: statusTone.color,
                        bgcolor: statusTone.backgroundColor,
                        border: `1px solid ${statusTone.borderColor}`,
                        '& .MuiChip-label': {
                          px: 1,
                        },
                      }}
                    />
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Project</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                      {activeJob.projectId}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>QOS</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                      {activeJob.qos}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Partition</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                      {activeJob.partition}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Nodes</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                      {activeJob.nodeCount ?? 'N/A'}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Node Hours</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                      {activeJob.nodeHours.toFixed(2)}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>

              <Paper
                sx={{
                  p: 2,
                  borderRadius: 3,
                  mb: 2.5,
                  bgcolor: '#eff6ff',
                  border: '1px solid #bfdbfe',
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '999px',
                        bgcolor: '#2563eb',
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e3a8a' }}>
                        Performance Hints
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#1d4ed8' }}>
                        Hints may be available
                      </Typography>
                    </Box>
                  </Box>
                  <RouterLink
                    to="/user-job-performance-alphaver/$id"
                    params={{ id: activeJob.id }}
                    style={{ textDecoration: 'none', flexShrink: 0 }}
                  >
                    <Button
                      variant="outlined"
                      size="small"
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        color: '#1d4ed8',
                        borderColor: '#93c5fd',
                        bgcolor: '#ffffff',
                        '&:hover': {
                          borderColor: '#60a5fa',
                          bgcolor: '#dbeafe',
                        },
                      }}
                    >
                      Explore
                    </Button>
                  </RouterLink>
                </Box>
              </Paper>

              <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 2 }}>
                  Runtime Resource Distribution
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 170px',
                    gap: 2,
                    alignItems: 'center',
                  }}
                >
                  <Stack spacing={1.25}>
                    {donutSegments.map((segment) => (
                      <Box
                        key={segment.label}
                        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: segment.color,
                            }}
                          />
                          <Typography variant="body2" sx={{ color: '#111827', fontWeight: 600 }}>
                            {segment.label}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ color: '#475569' }}>
                          {segment.share.toFixed(1)}%
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                  <Plot
                    data={[
                      {
                        type: 'pie',
                        hole: 0.62,
                        values: donutSegments.map((segment) => segment.share),
                        labels: donutSegments.map((segment) => segment.label),
                        marker: {
                          colors: donutSegments.map((segment) => segment.color),
                          line: { color: '#f8fafc', width: 4 },
                        },
                        textinfo: 'none',
                        hovertemplate: '%{label}: %{value:.1f}%<extra></extra>',
                        sort: false,
                        showlegend: false,
                      },
                    ]}
                    layout={{
                      autosize: true,
                      height: 180,
                      margin: { l: 0, r: 0, t: 0, b: 0 },
                      paper_bgcolor: 'rgba(0,0,0,0)',
                      plot_bgcolor: 'rgba(0,0,0,0)',
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    style={{ width: '100%' }}
                  />
                </Box>
              </Paper>

              <ComputePerformanceCard snapshot={computePerformanceSnapshot} />
              <PowerConsumptionCard powerConsumption={powerConsumptionSummary} />
              <NetworkPerformanceCard
                networkPerformance={performanceSummary.networkPerformance}
              />
            </Box>
            </Box>
            <Box
              sx={{
                position: 'sticky',
                bottom: 0,
                px: 3,
                py: 2,
                borderTop: '1px solid #e2e8f0',
                bgcolor: 'rgba(248, 250, 252, 0.96)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <RouterLink
                to="/user-job-performance-alphaver/$id"
                params={{ id: activeJob.id }}
                style={{ textDecoration: 'none' }}
              >
                <Button
                  variant="contained"
                  fullWidth
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: '#0f172a',
                    '&:hover': {
                      bgcolor: '#1e293b',
                    },
                  }}
                >
                  View Performance Details
                </Button>
              </RouterLink>
            </Box>
                </>
              );
            })()}
          </Box>
        )}
      </Drawer>
    </FilterContext>
  );
}

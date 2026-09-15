import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  Stack,
  Paper,
  Typography,
  Button,
  Checkbox,
  IconButton,
  Menu,
  MenuItem,
  Popover,
  Tooltip,
  FormControlLabel,
  TextField,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CloseIcon from '@mui/icons-material/Close';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { createFileRoute, Link as RouterLink, useNavigate } from '@tanstack/react-router';
import type { VirtualElement } from '@popperjs/core';
import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilterContext } from '../../components/FilterContext';
import { SciDataGrid } from '../../components/SciDataGrid';
import {
  GridColDef,
  GridColumnVisibilityModel,
  GridRenderCellParams,
  GridRowSelectionModel,
  GridToolbarContainer,
  GridToolbarQuickFilter,
} from '@mui/x-data-grid';
import { useDataFromSource } from '../../hooks/useDataFromSource';
import Plot from 'react-plotly.js';
import {
  buildRecentJobPerformanceRows,
  getJobPerformanceSummary,
  IrisJobData,
  MetricsByJob,
  LegacyUserJobData,
  MetricFetchStatus,
} from './-controllers/recentJobPerformance.controller';
import {
  clearLoadedJobPerformanceBrowserCache,
  fetchJobMetricsSummary,
  fetchNerscJobById,
  JobMetricsSummary,
  readLoadedJobMetricsBrowserCache,
  mergeLoadedJobsBrowserCache,
  parseSelectedJobIds,
  readSelectedUserBrowserCache,
  readLoadedJobsBrowserCache,
  writeSelectedUserBrowserCache,
} from '../../utils/userJobPerformanceLoadedJobs';

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

const chartDayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const formatShortDateTime = (value: string) => {
  const timestamp = parseJobTimestamp(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return shortDateTimeFormatter.format(timestamp);
};

const getStartOfDay = (date: Date) => (
  new Date(date.getFullYear(), date.getMonth(), date.getDate())
);

const formatDateKey = (date: Date) => (
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
);

const formatFullDateTime = (value: string) => {
  const timestamp = parseJobTimestamp(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return fullDateTimeFormatter.format(timestamp);
};

const PRIMARY_ACTION_COLOR = '#1B4684';
const PRIMARY_ACTION_HOVER_BACKGROUND = 'rgba(27, 70, 132, 0.08)';
const SECTION_BORDER_COLOR = '#E8E8E8';
const TERTIARY_ACTION_COLOR = PRIMARY_ACTION_COLOR;
const ACTIONS_COLUMN_WIDTH = 152;
const PANEL_WIDTH = 500;
const SIDE_PANEL_LABEL_SX = { color: '#475569', fontWeight: 700 };
const SIDE_PANEL_VALUE_SX = { color: '#111827', fontWeight: 500 };
const ACTIONS_COLUMN_FIELD = 'actions';
const DEFAULT_COLUMN_ORDER = [
  'jobId',
  'submitTime',
  'startTime',
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
  'hostname',
  ACTIONS_COLUMN_FIELD,
];
const DEFAULT_VISIBLE_COLUMN_FIELDS = new Set([
  'jobId',
  'submitTime',
  'startTime',
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
      <Typography variant="body2" sx={{ color: PRIMARY_ACTION_COLOR, fontWeight: 600 }}>
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

const formatSnapshotValue = (value: number | null, unit: string, maximumFractionDigits = 1) => {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A';
  }

  const formattedValue = value.toLocaleString(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: unit === '%' ? maximumFractionDigits : 0,
  });

  return unit === '%' ? `${formattedValue}%` : `${formattedValue} ${unit}`;
};

type DrawerMetricSeriesPoint = { x: number; y: number };

const toExecutionTimeMs = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value > 1_000_000_000_000) {
    return value;
  }

  return value * 1000;
};

const formatExecutionTime = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds)) {
    return '0 sec';
  }

  if (milliseconds < 1000) {
    return `${Math.round(milliseconds).toLocaleString()} ms`;
  }

  if (milliseconds < 60_000) {
    return `${(milliseconds / 1000).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })} sec`;
  }

  if (milliseconds < 3_600_000) {
    return `${(milliseconds / 60_000).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })} min`;
  }

  return `${(milliseconds / 3_600_000).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })} hr`;
};

const buildExecutionTimeTicks = (series: DrawerMetricSeriesPoint[]) => {
  const maxTime = Math.max(0, ...series.map((point) => point.x));
  const tickValues = [0, 0.25, 0.5, 0.75, 1].map((fraction) => maxTime * fraction);

  return {
    tickValues,
    tickText: tickValues.map(formatExecutionTime),
  };
};

const buildConstantMetricSeries = (value: number | null, sampleCount = 8): DrawerMetricSeriesPoint[] => {
  if (value === null || !Number.isFinite(value)) {
    return [];
  }

  return Array.from({ length: sampleCount }, (_, index) => ({
    x: index * 1000,
    y: value,
  }));
};

const buildMockGpuUtilizationSeries = (
  jobId: string,
  metricsByJob: MetricsByJob | undefined
): DrawerMetricSeriesPoint[] => (
  metricsByJob?.[jobId] ?? []
).map((row, index) => ({
  x: Number(row['Floored Relative Time']) || index + 1,
  y: Number(row.nersc_ldms_dcgm_gpu_utilization),
})).filter((point) => Number.isFinite(point.y));

const normalizeRelativeTimeSeries = (
  series: DrawerMetricSeriesPoint[]
): DrawerMetricSeriesPoint[] => {
  if (series.length <= 1) {
    return series.map((point) => ({ ...point, x: 0 }));
  }

  const xValues = series.map((point) => point.x).filter((value) => Number.isFinite(value));
  const elapsedTimeValues = xValues.map(toExecutionTimeMs);
  const minX = Math.min(...elapsedTimeValues);
  const maxX = Math.max(...elapsedTimeValues);
  const span = maxX - minX;

  if (!Number.isFinite(span) || span <= 0) {
    const denominator = Math.max(1, series.length - 1);

    return series.map((point, index) => ({
      ...point,
      x: (index / denominator) * 1000,
    }));
  }

  return series.map((point) => ({
    ...point,
    x: Math.max(0, toExecutionTimeMs(point.x) - minX),
  }));
};

function PerformanceLineChart({
  label,
  loading = false,
  series,
  value,
  unit,
}: {
  label: string;
  loading?: boolean;
  series: DrawerMetricSeriesPoint[];
  value: number | null;
  unit: string;
}) {
  const hasSeries = series.length > 0;
  const chartSeries = normalizeRelativeTimeSeries(
    hasSeries ? series : buildConstantMetricSeries(value)
  );
  const executionTimeTicks = buildExecutionTimeTicks(chartSeries);
  const isGpuUtilization = label === 'GPU utilization';
  const valueFractionDigits = isGpuUtilization && unit === '%' ? 3 : 1;
  const plotValueFormat = isGpuUtilization && unit === '%' ? '.3f' : '.1f';

  return (
    <Box
      sx={{
        py: 1.25,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 0.75 }}>
        <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>
          {label}
        </Typography>
        {!loading && (
          <Typography
            variant="body2"
            sx={{
              ...SIDE_PANEL_VALUE_SX,
              color: value === null ? '#94a3b8' : '#111827',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            Avg. {formatSnapshotValue(value, unit, valueFractionDigits)}
          </Typography>
        )}
      </Box>
      {loading ? (
        <CircularProgress size={16} thickness={5} sx={{ color: PRIMARY_ACTION_COLOR }} />
      ) : chartSeries.length ? (
        <Box
          sx={{
            height: 142,
            width: '100%',
            border: `1px solid ${SECTION_BORDER_COLOR}`,
            borderRadius: 1,
            p: 1,
          }}
        >
          <Plot
            data={[{
              x: chartSeries.map((point) => point.x),
              y: chartSeries.map((point) => point.y),
              type: 'scatter',
              mode: 'lines',
              line: {
                color: isGpuUtilization ? '#1d4ed8' : '#16a34a',
                width: 2,
                shape: 'linear',
              },
              customdata: chartSeries.map((point) => formatExecutionTime(point.x)),
              hovertemplate: `Execution Time: %{customdata}<br>${label}: %{y:${plotValueFormat}}${unit === '%' ? '%' : ` ${unit}`}<extra></extra>`,
            }]}
            layout={{
              autosize: true,
              margin: { l: 34, r: 8, t: 4, b: 30 },
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              xaxis: {
                title: { text: 'Execution Time', font: { size: 10 } },
                range: [0, Math.max(1, ...chartSeries.map((point) => point.x))],
                showgrid: false,
                zeroline: false,
                tickvals: executionTimeTicks.tickValues,
                ticktext: executionTimeTicks.tickText,
                tickfont: { size: 10, color: '#64748b' },
              },
              yaxis: {
                ticksuffix: unit === '%' ? '%' : '',
                showgrid: true,
                gridcolor: '#e5e7eb',
                zeroline: false,
                tickfont: { size: 10, color: '#64748b' },
              },
              showlegend: false,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
          />
        </Box>
      ) : (
        <Typography
          variant="body2"
          sx={{
            ...SIDE_PANEL_VALUE_SX,
            color: '#94a3b8',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          No samples available
        </Typography>
      )}
    </Box>
  );
}

function ComputePerformanceCard({
  metricsSummary,
  metricsStatus,
  originalError,
  isRealData,
}: {
  metricsSummary: Pick<JobMetricsSummary, 'avgGpuUtilization' | 'avgCpuPower' | 'error' | 'series'> | null;
  metricsStatus: 'idle' | 'loading' | 'success' | 'failed';
  originalError?: string | null;
  isRealData: boolean;
}) {
  const isLoading = isRealData && !metricsSummary && metricsStatus !== 'failed';
  const errorMessage = originalError ?? metricsSummary?.error ?? null;
  const hasError = metricsStatus === 'failed' || Boolean(errorMessage);
  const hasUnavailableValue = !isLoading && [
    metricsSummary?.avgGpuUtilization,
    metricsSummary?.avgCpuPower,
  ].some((value) => value === null || value === undefined);
  const overviewStatus = hasError ? 'error' : hasUnavailableValue ? 'unavailable' : null;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        mb: 2.5,
      }}
    >
      <Box sx={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827' }}>
          Performance Overview
        </Typography>
        {overviewStatus && (
          <Chip
            color={overviewStatus === 'error' ? 'error' : 'default'}
            label={overviewStatus}
            size="small"
            variant="outlined"
          />
        )}
      </Box>
      <Divider sx={{ mb: 0.5 }} />
      <Stack divider={<Divider flexItem />} spacing={0}>
        <PerformanceLineChart
          label="GPU utilization"
          loading={isLoading}
          series={metricsSummary?.series?.gpuUtilization ?? []}
          value={metricsSummary?.avgGpuUtilization ?? null}
          unit="%"
        />
        <PerformanceLineChart
          label="CPU power"
          loading={isLoading}
          series={metricsSummary?.series?.cpuPower ?? []}
          value={metricsSummary?.avgCpuPower ?? null}
          unit="W"
        />
      </Stack>
      {errorMessage && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {errorMessage}
        </Alert>
      )}
    </Paper>
  );
}

interface DailyJobCount {
  key: string;
  label: string;
  perlmutterCpu: number;
  perlmutterGpu: number;
}

type HostnameCategory = 'perlmutterCpu' | 'perlmutterGpu';

const normalizeHostnameCategory = (hostname: string): HostnameCategory => (
  hostname.toLowerCase().includes('cpu') ? 'perlmutterCpu' : 'perlmutterGpu'
);

const buildPastMonthJobCounts = (
  jobs: Array<{ submitTime: string; hostname: string }>
): DailyJobCount[] => {
  const validSubmittedJobs = jobs
    .map((job) => ({
      ...job,
      submitDate: parseJobTimestamp(job.submitTime),
    }))
    .filter((job) => !Number.isNaN(job.submitDate.getTime()));
  const endDate = getStartOfDay(
    validSubmittedJobs.length
      ? new Date(Math.max(...validSubmittedJobs.map((job) => job.submitDate.getTime())))
      : new Date()
  );
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - (29 - index));

    return {
      key: formatDateKey(date),
      label: chartDayFormatter.format(date),
      perlmutterCpu: 0,
      perlmutterGpu: 0,
    };
  });
  const countsByDay = new Map(days.map((day) => [day.key, {
    perlmutterCpu: 0,
    perlmutterGpu: 0,
  }]));

  validSubmittedJobs.forEach((job) => {
    const key = formatDateKey(getStartOfDay(job.submitDate));
    const dayCounts = countsByDay.get(key);

    if (dayCounts) {
      dayCounts[normalizeHostnameCategory(job.hostname)] += 1;
    }
  });

  return days.map((day) => ({
    ...day,
    ...(countsByDay.get(day.key) ?? {
      perlmutterCpu: 0,
      perlmutterGpu: 0,
    }),
  }));
};

function JobsPastMonthBarChart({
  data,
}: {
  data: DailyJobCount[];
}) {
  const totalJobs = data.reduce(
    (total, day) => total + day.perlmutterCpu + day.perlmutterGpu,
    0
  );
  const labels = data.map((day) => day.label);
  const keys = data.map((day) => day.key);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 2,
        border: `1px solid ${SECTION_BORDER_COLOR}`,
        borderRadius: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1.5,
        }}
      >
        <Typography variant="subtitle1" sx={{ color: '#111827', fontWeight: 700 }}>
          Jobs in the Past 30 Days
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
          {totalJobs} jobs
        </Typography>
      </Box>
      <Plot
        data={[
          {
            type: 'bar',
            name: 'Perlmutter CPU',
            x: labels,
            y: data.map((day) => day.perlmutterCpu),
            marker: {
              color: '#55CFF2',
              line: { color: '#259fbd', width: 1 },
            },
            customdata: keys,
            hovertemplate: '%{x}<br>Perlmutter CPU: %{y} jobs<extra></extra>',
          },
          {
            type: 'bar',
            name: 'Perlmutter GPU',
            x: labels,
            y: data.map((day) => day.perlmutterGpu),
            marker: {
              color: '#0075BF',
              line: { color: '#005f99', width: 1 },
            },
            customdata: keys,
            hovertemplate: '%{x}<br>Perlmutter GPU: %{y} jobs<extra></extra>',
          },
        ]}
        layout={{
          autosize: true,
          height: 260,
          margin: { l: 42, r: 18, t: 16, b: 48 },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          barmode: 'stack',
          bargap: 0.32,
          xaxis: {
            fixedrange: true,
            tickfont: { color: '#64748b', size: 11 },
            showgrid: false,
            zeroline: false,
          },
          yaxis: {
            fixedrange: true,
            rangemode: 'tozero',
            dtick: 1,
            title: { text: 'Jobs', font: { color: '#64748b', size: 12 } },
            tickfont: { color: '#64748b', size: 11 },
            gridcolor: '#e2e8f0',
            zerolinecolor: '#cbd5e1',
          },
          font: {
            family: 'Inter, Roboto, Helvetica, Arial, sans-serif',
          },
          legend: {
            orientation: 'h',
            x: 0,
            y: 1.16,
            xanchor: 'left',
            yanchor: 'top',
            font: { color: '#475569', size: 12 },
          },
          showlegend: true,
        }}
        config={{
          responsive: true,
          displayModeBar: false,
        }}
        style={{ width: '100%' }}
      />
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
        size="medium"
        startIcon={<ViewColumnIcon />}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : undefined}
        onClick={openColumnSettings}
      >
        Customize Columns
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
  compareJobsTooltipOpen,
  selectedJobCount,
  onCompareJobMetrics,
  onColumnVisibilityModelChange,
  onMoveColumn,
  onResetColumnSettings,
}: {
  setPanelAnchorEl: (element: HTMLDivElement | null) => void;
  columns: GridColDef[];
  columnVisibilityModel: GridColumnVisibilityModel;
  compareJobsTooltipOpen: boolean;
  selectedJobCount: number;
  onCompareJobMetrics: () => void;
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
            fontWeight: 500,
            textTransform: 'none',
            color: TERTIARY_ACTION_COLOR,
          },
          '& .MuiButton-startIcon': {
            mr: 0.5,
          },
          '& .MuiSvgIcon-root': {
            fontSize: 20,
            color: TERTIARY_ACTION_COLOR,
          },
        }}
      >
        <Tooltip
          open={compareJobsTooltipOpen}
          title="Please select at least 1 job"
          placement="top"
          arrow
          disableFocusListener
          disableHoverListener
          disableTouchListener
        >
          <Button
            size="medium"
            variant={selectedJobCount > 0 ? 'contained' : 'outlined'}
            startIcon={<CompareArrowsIcon />}
            onClick={onCompareJobMetrics}
            sx={{
              mr: 1.25,
              borderColor: PRIMARY_ACTION_COLOR,
              color: selectedJobCount > 0 ? '#ffffff !important' : `${PRIMARY_ACTION_COLOR} !important`,
              bgcolor: selectedJobCount > 0 ? PRIMARY_ACTION_COLOR : 'transparent',
              '& .MuiButton-startIcon .MuiSvgIcon-root': {
                color: selectedJobCount > 0 ? '#ffffff' : PRIMARY_ACTION_COLOR,
              },
              '&:hover': {
                borderColor: PRIMARY_ACTION_COLOR,
                bgcolor: selectedJobCount > 0 ? PRIMARY_ACTION_COLOR : PRIMARY_ACTION_HOVER_BACKGROUND,
                color: selectedJobCount > 0 ? '#ffffff !important' : `${PRIMARY_ACTION_COLOR} !important`,
                '& .MuiButton-startIcon .MuiSvgIcon-root': {
                  color: selectedJobCount > 0 ? '#ffffff' : PRIMARY_ACTION_COLOR,
                },
              },
            }}
          >
            Compare Jobs
          </Button>
        </Tooltip>
        <ColumnSettingsButton
          columns={columns}
          columnVisibilityModel={columnVisibilityModel}
          onColumnVisibilityModelChange={onColumnVisibilityModelChange}
          onMoveColumn={onMoveColumn}
          onResetColumnSettings={onResetColumnSettings}
        />
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
  const [compareJobsTooltipOpen, setCompareJobsTooltipOpen] = useState(false);
  const [maxSelectionTooltipAnchor, setMaxSelectionTooltipAnchor] = useState<VirtualElement | null>(null);
  const compareJobsTooltipTimeoutRef = useRef<number | null>(null);
  const maxSelectionTooltipTimeoutRef = useRef<number | null>(null);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>([]);
  const [panelAnchorEl, setPanelAnchorEl] = useState<HTMLDivElement | null>(null);
  const [columnVisibilityModel, setColumnVisibilityModel] =
    useState<GridColumnVisibilityModel>(() => ({ ...DEFAULT_COLUMN_VISIBILITY_MODEL }));
  const [columnOrder, setColumnOrder] = useState<string[]>(() => [...DEFAULT_COLUMN_ORDER]);
  const [selectedUserFilter, setSelectedUserFilter] = useState(
    () => readSelectedUserBrowserCache()
  );
  const [selectedJobsFilter, setSelectedJobsFilter] = useState('');
  const [loadedJobCacheEntries, setLoadedJobCacheEntries] = useState(() => readLoadedJobsBrowserCache());
  const [loadedJobMetricsCacheEntries, setLoadedJobMetricsCacheEntries] = useState(
    () => readLoadedJobMetricsBrowserCache()
  );
  const [isLoadingSelectedJobs, setIsLoadingSelectedJobs] = useState(false);
  const [loadJobsError, setLoadJobsError] = useState<string | null>(null);
  const [jobMetricsSummaryStatusByJob, setJobMetricsSummaryStatusByJob] = useState<
    Record<string, 'idle' | 'loading' | 'success' | 'failed'>
  >({});
  const [jobMetricsSummaryErrorByJob, setJobMetricsSummaryErrorByJob] = useState<
    Record<string, string>
  >({});

  const userJobsData = useDataFromSource(
    'data/user-job-performance/user-jobs.json'
  ) as LegacyUserJobData[] | undefined;
  const irisJobsData = useDataFromSource(
    'data/user-job-performance/job-data-iris-export.json'
  ) as IrisJobData[] | undefined;
  const metricsByJob = useDataFromSource(
    'data/user-job-performance/metrics-data.json'
  ) as MetricsByJob | undefined;

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
      loadedJobs: loadedJobCacheEntries.map((entry) => entry.job),
      metricsByJob,
    }),
    [
      irisJobsData,
      loadedJobCacheEntries,
      metricsByJob,
      userJobsData,
    ]
  );
  const loadedJobIdLookup = useMemo(
    () => new Set(loadedJobCacheEntries.map((entry) => entry.jobId)),
    [loadedJobCacheEntries]
  );
  const displayedJobData = useMemo(() => {
    const loadedJobs = loadedJobCacheEntries
      .map((entry) => jobData.find((job) => job.id === entry.jobId) ?? null)
      .filter((job): job is typeof jobData[number] => Boolean(job));
    const remainingJobs = jobData.filter((job) => !loadedJobIdLookup.has(job.id));

    return [...loadedJobs, ...remainingJobs];
  }, [jobData, loadedJobCacheEntries, loadedJobIdLookup]);
  const pastMonthJobCounts = useMemo(
    () => buildPastMonthJobCounts(displayedJobData),
    [displayedJobData]
  );
  const loadSelectedJobs = async () => {
    setRowSelectionModel([]);
    setActiveDrawerJobId(null);
    setLoadJobsError(null);

    const requestedJobIds = parseSelectedJobIds(selectedJobsFilter);

    if (!requestedJobIds.length) {
      return;
    }

    setIsLoadingSelectedJobs(true);

    try {
      const results = await Promise.all(
        requestedJobIds.map(async (jobId) => {
          const jobResult = await fetchNerscJobById(jobId)
            .then((job) => ({ status: 'fulfilled' as const, value: job }))
            .catch((reason: unknown) => ({ status: 'rejected' as const, reason }));

          return { jobId, jobResult };
        })
      );
      const successfulJobs = results
        .filter((result): result is {
          jobId: string;
          jobResult: PromiseFulfilledResult<Awaited<ReturnType<typeof fetchNerscJobById>>>;
        } => result.jobResult.status === 'fulfilled')
        .map(({ jobResult }) => jobResult.value);
      const failedResults = results.flatMap(({ jobId, jobResult }) => {
        const errors: string[] = [];

        if (jobResult.status === 'rejected') {
          errors.push(`${jobId}: ${jobResult.reason instanceof Error ? jobResult.reason.message : 'Unable to load job.'}`);
        }

        return errors;
      });

      if (successfulJobs.length) {
        mergeLoadedJobsBrowserCache(successfulJobs);
        setLoadedJobCacheEntries(readLoadedJobsBrowserCache());
      }

      if (failedResults.length) {
        setLoadJobsError(failedResults.join(' | '));
      }
    } finally {
      setIsLoadingSelectedJobs(false);
    }
  };
  const clearLoadedJobPerformanceCache = () => {
    clearLoadedJobPerformanceBrowserCache();
    setLoadedJobCacheEntries(readLoadedJobsBrowserCache());
    setLoadedJobMetricsCacheEntries(readLoadedJobMetricsBrowserCache());
    setJobMetricsSummaryStatusByJob({});
    setJobMetricsSummaryErrorByJob({});
    setRowSelectionModel([]);
    setActiveDrawerJobId(null);
    setLoadJobsError(null);
  };
  const activeJob = jobData.find((job) => job.id === activeDrawerJobId) ?? null;
  const activeLoadedJobCacheEntry = useMemo(
    () => (
      activeDrawerJobId
        ? loadedJobCacheEntries.find((entry) => entry.jobId === activeDrawerJobId) ?? null
        : null
    ),
    [activeDrawerJobId, loadedJobCacheEntries]
  );
  const selectedJobCount = rowSelectionModel.length;
  const showCompareJobsTooltip = useCallback(() => {
    setCompareJobsTooltipOpen(true);
    if (compareJobsTooltipTimeoutRef.current !== null) {
      window.clearTimeout(compareJobsTooltipTimeoutRef.current);
    }
    compareJobsTooltipTimeoutRef.current = window.setTimeout(() => {
      setCompareJobsTooltipOpen(false);
      compareJobsTooltipTimeoutRef.current = null;
    }, 5000);
  }, []);
  const showMaxSelectionTooltip = useCallback(() => {
    setMaxSelectionTooltipOpen(true);
    if (maxSelectionTooltipTimeoutRef.current !== null) {
      window.clearTimeout(maxSelectionTooltipTimeoutRef.current);
    }
    maxSelectionTooltipTimeoutRef.current = window.setTimeout(() => {
      setMaxSelectionTooltipOpen(false);
      maxSelectionTooltipTimeoutRef.current = null;
    }, 5000);
  }, []);
  const updateMaxSelectionTooltipPosition = useCallback((
    eventTarget: EventTarget,
    fallbackElement: HTMLElement
  ) => {
    const targetElement = eventTarget instanceof Element ? eventTarget : null;
    const checkboxElement = targetElement?.closest('.MuiCheckbox-root') ??
      fallbackElement.querySelector('.MuiCheckbox-root');
    const anchorElement = checkboxElement instanceof HTMLElement
      ? checkboxElement
      : fallbackElement;
    setMaxSelectionTooltipAnchor({
      contextElement: anchorElement,
      getBoundingClientRect: () => anchorElement.getBoundingClientRect(),
    });
  }, []);
  const compareSelectedJobMetrics = useCallback(() => {
    const selectedJobIds = rowSelectionModel.map((jobId) => String(jobId)).slice(0, 5);

    if (!selectedJobIds.length) {
      showCompareJobsTooltip();
      return;
    }

    setCompareJobsTooltipOpen(false);
    navigate({
      to: '/user-job-performance-alphaver/compare',
      search: { jobIds: selectedJobIds.join(',') },
    });
  }, [navigate, rowSelectionModel, showCompareJobsTooltip]);
  const activeJobMetricsSummary = useMemo(
    () => (
      activeJob
        ? loadedJobMetricsCacheEntries.find((entry) => entry.jobId === activeJob.jobId)?.summary ?? null
        : null
    ),
    [activeJob, loadedJobMetricsCacheEntries]
  );
  const activeJobMetricsSummaryStatus = activeJob
    ? jobMetricsSummaryStatusByJob[activeJob.jobId] ?? 'idle'
    : 'idle';
  const activeJobMetricsSummaryError = activeJob
    ? jobMetricsSummaryErrorByJob[activeJob.jobId] ?? null
    : null;
  const activeJobUsesRealData = activeJob?.dataSource === 'real';
  const activeMockMetricsSummary = useMemo(() => {
    if (!activeJob || activeJobUsesRealData) {
      return null;
    }

    const summary = getJobPerformanceSummary(
      activeJob,
      activeJob.gpuUtilizationStatus ? undefined : metricsByJob
    );
    const gpuUtilizationSeries = buildMockGpuUtilizationSeries(activeJob.jobId, metricsByJob);

    return {
      avgGpuUtilization: summary.snapshot.gpuUtilization.avg,
      avgCpuPower: null,
      series: {
        gpuUtilization: gpuUtilizationSeries,
        cpuPower: [],
      },
    };
  }, [activeJob, activeJobUsesRealData, metricsByJob]);

  useEffect(() => {
    let isActive = true;

    if (!activeJob?.jobId || !activeJobUsesRealData || activeJobMetricsSummary) {
      return () => {
        isActive = false;
      };
    }

    setJobMetricsSummaryStatusByJob((currentStatus) => (
      currentStatus[activeJob.jobId] === 'loading'
        ? currentStatus
        : { ...currentStatus, [activeJob.jobId]: 'loading' }
    ));

    fetchJobMetricsSummary(activeJob.jobId, {
      machineId: typeof activeLoadedJobCacheEntry?.job.machine === 'string'
        ? activeLoadedJobCacheEntry.job.machine
        : undefined,
      userId: selectedUserFilter.trim() || (
        typeof activeLoadedJobCacheEntry?.job.user === 'string'
          ? activeLoadedJobCacheEntry.job.user
          : undefined
      ),
    })
      .then(() => {
        if (!isActive) {
          return;
        }

        setLoadedJobMetricsCacheEntries(readLoadedJobMetricsBrowserCache());
        setJobMetricsSummaryErrorByJob((currentErrors) => {
          const nextErrors = { ...currentErrors };
          delete nextErrors[activeJob.jobId];
          return nextErrors;
        });
        setJobMetricsSummaryStatusByJob((currentStatus) => ({
          ...currentStatus,
          [activeJob.jobId]: 'success',
        }));
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setJobMetricsSummaryErrorByJob((currentErrors) => ({
          ...currentErrors,
          [activeJob.jobId]: error instanceof Error ? error.message : String(error),
        }));
        setJobMetricsSummaryStatusByJob((currentStatus) => ({
          ...currentStatus,
          [activeJob.jobId]: 'failed',
        }));
      });

    return () => {
      isActive = false;
    };
  }, [activeJob, activeJobMetricsSummary, activeJobUsesRealData, activeLoadedJobCacheEntry, selectedUserFilter]);

  useEffect(() => () => {
    if (compareJobsTooltipTimeoutRef.current !== null) {
      window.clearTimeout(compareJobsTooltipTimeoutRef.current);
    }
    if (maxSelectionTooltipTimeoutRef.current !== null) {
      window.clearTimeout(maxSelectionTooltipTimeoutRef.current);
    }
  }, []);

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
            alignItems: 'center',
            color: PRIMARY_ACTION_COLOR,
            display: 'inline-flex',
            gap: 6,
            fontWeight: 500,
            textAlign: 'left',
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          {params.row.dataSource === 'real' && (
            <Box
              component="span"
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: '#2563EB',
                flexShrink: 0,
              }}
            />
          )}
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
      field: 'startTime',
      headerName: 'Start Time',
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
      headerAlign: 'left',
      align: 'left',
    },
    {
      field: 'nodeCount',
      headerName: 'No. of Nodes',
      minWidth: 112,
      flex: 0.65,
      type: 'number',
      headerAlign: 'left',
      align: 'left',
    },
    {
      field: 'waitTime',
      headerName: 'Wait Time',
      minWidth: 104,
      flex: 0.6,
    },
    {
      field: 'executionTime',
      headerName: 'Run Duration',
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
      field: 'hostname',
      headerName: 'Hostname',
      minWidth: 150,
      flex: 0.8,
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
              color: PRIMARY_ACTION_COLOR,
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
        compareJobsTooltipOpen={compareJobsTooltipOpen}
        selectedJobCount={selectedJobCount}
        onCompareJobMetrics={compareSelectedJobMetrics}
        onColumnVisibilityModelChange={setColumnVisibilityModel}
        onMoveColumn={moveColumn}
        onResetColumnSettings={resetColumnSettings}
      />
    ),
    [
      columnVisibilityModel,
      compareJobsTooltipOpen,
      compareSelectedJobMetrics,
      handlePanelAnchorElChange,
      moveColumn,
      orderedColumns,
      resetColumnSettings,
      selectedJobCount,
    ]
  );

  return (
    <FilterContext>
      <Box sx={{ minHeight: '100vh', bgcolor: '#ffffff' }}>
        <Box
          sx={{
            width: '100%',
            px: 3,
            py: 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: 'linear-gradient(90deg, #ffffff 0%, #55cff2 10%, #ffffff 100%)',
          borderBottom: `1px solid ${SECTION_BORDER_COLOR}`,
          }}
        >
          <Typography variant="subtitle2" sx={{ color: '#475569', fontWeight: 400 }}>
            User's name
          </Typography>
          <Box
            component="span"
            sx={{
              position: 'relative',
              minHeight: 24,
              display: 'inline-flex',
              alignItems: 'center',
              px: 0.5,
              color: PRIMARY_ACTION_COLOR,
              fontWeight: 400,
              '&::after': {
                content: '""',
                position: 'absolute',
                left: 4,
                right: 4,
                bottom: 0,
                height: 3,
                borderRadius: 999,
                bgcolor: PRIMARY_ACTION_COLOR,
              },
            }}
        >
          Jobs
        </Box>
      </Box>
        <Box
          sx={{
            width: '80%',
            maxWidth: '1800px',
            margin: '0 auto',
            padding: 3,
          }}
        >
        <Paper
          elevation={0}
          sx={{
            mb: 2,

          }}
        >
          <Box
            sx={{
              p: 2,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <TextField
              size="small"
              label="Select user"
              value={selectedUserFilter}
              onChange={(event) => {
                const userId = event.target.value;
                setSelectedUserFilter(userId);
                writeSelectedUserBrowserCache(userId);
              }}
              sx={{ minWidth: { xs: '100%', sm: 220 } }}
            />
            <TextField
              size="small"
              label="Select jobs"
              placeholder="12345, 67890"
              value={selectedJobsFilter}
              onChange={(event) => setSelectedJobsFilter(event.target.value)}
              sx={{ minWidth: { xs: '100%', sm: 320 } }}
            />
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="contained"
              onClick={loadSelectedJobs}
              disabled={isLoadingSelectedJobs}
              sx={{
                minHeight: 40,
                px: 2.5,
                ml: { xs: 0, sm: 'auto' },
                textTransform: 'none',
                fontWeight: 700,
                bgcolor: PRIMARY_ACTION_COLOR,
                '&:hover': {
                  bgcolor: PRIMARY_ACTION_COLOR,
                },
              }}
            >
              {isLoadingSelectedJobs ? 'Loading Jobs...' : 'Load Jobs'}
            </Button>
            <Button
              variant="text"
              startIcon={<RefreshIcon />}
              onClick={clearLoadedJobPerformanceCache}
              disabled={isLoadingSelectedJobs}
              sx={{
                minHeight: 40,
                px: 1.5,
                textTransform: 'none',
                fontWeight: 700,
                color: TERTIARY_ACTION_COLOR,
                '&:hover': {
                  bgcolor: PRIMARY_ACTION_HOVER_BACKGROUND,
                },
              }}
            >
              Clear cache
            </Button>
          </Box>
          {loadJobsError && (
            <Alert severity="warning" sx={{ mx: 2, mb: 2 }}>
              {loadJobsError}
            </Alert>
          )}
        </Paper>

        <JobsPastMonthBarChart data={pastMonthJobCounts} />

        {/* Recent Jobs and Performance Section */}
        <Box>

          <Paper
            elevation={0}
            sx={{
              p: 1,
              width: '100%',
              border: `1px solid ${SECTION_BORDER_COLOR}`,
              borderRadius: 2,
            }}
          >
            {maxSelectionTooltipAnchor && (
              <Tooltip
                open={maxSelectionTooltipOpen}
                title="Max 5 jobs can be compared"
                placement="right"
                arrow
                disableFocusListener
                disableHoverListener
                disableTouchListener
                PopperProps={{ anchorEl: maxSelectionTooltipAnchor }}
              >
                <Box
                  component="span"
                  sx={{ display: 'inline-block' }}
                />
              </Tooltip>
            )}
            {userJobsData === undefined && irisJobsData === undefined ? (
              <Box sx={{ p: 3 }}>
                <Typography>Loading job data...</Typography>
              </Box>
            ) : (
              <SciDataGrid
                rows={displayedJobData}
                columns={orderedColumns}
                pagination
                paginationMode="client"
                checkboxSelection
                disableVirtualization
                disableColumnSelector
                disableRowSelectionOnClick
                getRowId={(row) => row.id}
                getRowClassName={(params) => [
                  params.indexRelativeToCurrentPage % 2 === 1 ? 'alternate-job-row' : '',
                  loadedJobIdLookup.has(params.row.id) ? 'loaded-job-row' : '',
                ].filter(Boolean).join(' ')}
                autoHeight
                rowSelectionModel={rowSelectionModel}
                onCellClick={(params, event) => {
                  if (params.field === '__check__') {
                    updateMaxSelectionTooltipPosition(event.target, event.currentTarget);
                  }
                }}
                onColumnHeaderClick={(params, event) => {
                  if (params.field === '__check__') {
                    updateMaxSelectionTooltipPosition(event.target, event.currentTarget);
                  }
                }}
                onRowSelectionModelChange={(newSelectionModel) => {
                  if (newSelectionModel.length > 5) {
                    showMaxSelectionTooltip();
                  }
                  const cappedSelection = newSelectionModel.slice(0, 5);
                  if (cappedSelection.length) {
                    setCompareJobsTooltipOpen(false);
                  }
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
                    pb: 1.5,
                    gap: 1,
                  },
                  '& .MuiDataGrid-columnHeaders': {
                    backgroundColor: '#ffffff !important',
                    borderTop: `1px solid ${SECTION_BORDER_COLOR}`,
                    fontWeight: 600,
                  },
                  '& .MuiDataGrid-topContainer, & .MuiDataGrid-filler, & .MuiDataGrid-scrollbarFiller, & .MuiDataGrid-columnHeader, & .MuiDataGrid-columnHeaderCheckbox, & .MuiDataGrid-columnHeader--sortable, & .MuiDataGrid-columnHeaderTitleContainer, & .MuiDataGrid-columnHeaderTitleContainerContent': {
                    backgroundColor: '#ffffff !important',
                  },
                  '& .MuiDataGrid-cellCheckbox, & .MuiDataGrid-columnHeaderCheckbox': {
                    justifyContent: 'center',
                  },
                  '& .MuiDataGrid-columnHeader, & .MuiDataGrid-columnHeaderTitleContainer, & .MuiDataGrid-columnHeaderTitleContainerContent': {
                    justifyContent: 'flex-start',
                  },
                  '& .MuiDataGrid-columnHeader--alignRight .MuiDataGrid-columnHeaderTitleContainer': {
                    justifyContent: 'flex-start',
                  },
                  '& .MuiDataGrid-columnHeaderTitle': {
                    width: '100%',
                    textAlign: 'left',
                    color: '#111827 !important',
                  },
                  '& .MuiDataGrid-columnHeader .MuiTypography-root': {
                    color: '#111827 !important',
                  },
                  '& .MuiDataGrid-cell': {
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
                    backgroundColor: '#ffffff',
                  },
                  '& .MuiDataGrid-row.alternate-job-row, & .MuiDataGrid-row.alternate-job-row .MuiDataGrid-cell, & .MuiDataGrid-row.alternate-job-row .sticky-actions-column': {
                    backgroundColor: '#F8FAFC',
                  },
                  '& .MuiDataGrid-row.alternate-job-row:hover, & .MuiDataGrid-row.alternate-job-row:hover .MuiDataGrid-cell, & .MuiDataGrid-row.alternate-job-row:hover .sticky-actions-column': {
                    backgroundColor: '#F1F3F3',
                  },
                  '& .MuiDataGrid-row:not(.alternate-job-row) .sticky-actions-column': {
                    backgroundColor: '#ffffff',
                  },
                  '& .sticky-actions-column': {
                    position: 'sticky !important',
                    right: 0,
                    zIndex: 3,
                    borderLeft: `1px solid ${SECTION_BORDER_COLOR}`,
                  },
                  '& .MuiDataGrid-columnHeader.sticky-actions-column': {
                    zIndex: 4,
                    backgroundColor: '#ffffff',
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
      </Box>
      <Drawer
        anchor="right"
        open={Boolean(activeJob)}
        onClose={closeJobSummaryDrawer}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: PANEL_WIDTH },
            bgcolor: '#ffffff',
            boxShadow: 'none',
          },
        }}
      >
        {activeJob && (
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
                bgcolor: '#ffffff',
                color: '#111827',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 1,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline" sx={{ letterSpacing: '0.08em', opacity: 0.75 }}>
                    Job ID
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1 }}>
                    {activeJob.jobId}
                  </Typography>
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

            <Box sx={{ px: 2, py: 1, bgcolor: '#ffffff' }}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  mb: 3,
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 2 }}>
                  Overview
                </Typography>
                <Stack spacing={1.25}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>Submit time</Typography>
                    <Typography variant="body2" sx={{ ...SIDE_PANEL_VALUE_SX, textAlign: 'right' }}>
                      {formatFullDateTime(activeJob.submitTime)}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>Job Name</Typography>
                    <Typography variant="body2" sx={{ ...SIDE_PANEL_VALUE_SX, textAlign: 'right' }}>
                      {activeJob.jobName}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>Start time</Typography>
                    <Typography variant="body2" sx={{ ...SIDE_PANEL_VALUE_SX, textAlign: 'right' }}>
                      {formatFullDateTime(activeJob.startTime)}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>End time</Typography>
                    <Typography variant="body2" sx={{ ...SIDE_PANEL_VALUE_SX, textAlign: 'right' }}>
                      {formatFullDateTime(activeJob.endTime)}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>Total wait time</Typography>
                    <Typography variant="body2" sx={SIDE_PANEL_VALUE_SX}>
                      {activeJob.waitTime}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>Total run time</Typography>
                    <Typography variant="body2" sx={SIDE_PANEL_VALUE_SX}>
                      {activeJob.executionTime}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>Job status</Typography>
                    <Chip
                      label={statusLabel}
                      size="small"
                      sx={{
                        height: 24,
                        fontWeight: 500,
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
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>Project</Typography>
                    <Typography variant="body2" sx={{ ...SIDE_PANEL_VALUE_SX, textAlign: 'right' }}>
                      {activeJob.projectId}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>QOS</Typography>
                    <Typography variant="body2" sx={{ ...SIDE_PANEL_VALUE_SX, textAlign: 'right' }}>
                      {activeJob.qos}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>Partition</Typography>
                    <Typography variant="body2" sx={{ ...SIDE_PANEL_VALUE_SX, textAlign: 'right' }}>
                      {activeJob.partition}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>Nodes</Typography>
                    <Typography variant="body2" sx={SIDE_PANEL_VALUE_SX}>
                      {activeJob.nodeCount ?? 'N/A'}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>Node Hours</Typography>
                    <Typography variant="body2" sx={SIDE_PANEL_VALUE_SX}>
                      {activeJob.nodeHours.toFixed(2)}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  mb: 2.5,
                  bgcolor: '#eff6ff',
                  border: `1px solid ${SECTION_BORDER_COLOR}`,
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
                        color: PRIMARY_ACTION_COLOR,
                        borderColor: PRIMARY_ACTION_COLOR,
                        bgcolor: '#ffffff',
                        '&:hover': {
                          borderColor: PRIMARY_ACTION_COLOR,
                          bgcolor: PRIMARY_ACTION_HOVER_BACKGROUND,
                        },
                      }}
                    >
                      Explore
                    </Button>
                  </RouterLink>
                </Box>
              </Paper>

              <ComputePerformanceCard
                metricsSummary={activeJobUsesRealData ? activeJobMetricsSummary : activeMockMetricsSummary}
                metricsStatus={activeJobMetricsSummaryStatus}
                originalError={activeJobMetricsSummaryError}
                isRealData={activeJobUsesRealData}
              />
            </Box>
            </Box>
            <Box
              sx={{
                position: 'sticky',
                bottom: 0,
                px: 3,
                py: 2,
                borderTop: `1px solid ${SECTION_BORDER_COLOR}`,
                bgcolor: 'rgba(255, 255, 255, 0.96)',
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
                    bgcolor: PRIMARY_ACTION_COLOR,
                    '&:hover': {
                      bgcolor: PRIMARY_ACTION_COLOR,
                    },
                  }}
                >
                  View Job Details
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

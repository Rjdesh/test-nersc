import { createFileRoute, Link as RouterLink } from '@tanstack/react-router';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Breadcrumbs,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Container,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import SearchIcon from '@mui/icons-material/Search';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { SyntheticEvent, useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { useDataFromSource } from '../../hooks/useDataFromSource';
import {
  readLoadedJobMetricsBrowserCache,
  readLoadedJobsBrowserCache,
} from '../../utils/userJobPerformanceLoadedJobs';
import {
  COMPARE_METRIC_CATEGORIES,
  CPU_POWER_API_METRIC,
  GPU_UTILIZATION_METRIC,
  NODE_POWER_API_METRIC,
  type CompareMetricDefinition,
} from './-utils/compareMetricDefinitions';

interface CompareSearch {
  jobIds?: string;
  source?: string;
}

const normalizeSearchValue = (value: unknown) => (
  typeof value === 'string' ? value : undefined
);

const parseCompareJobIds = (value: string | undefined) => {
  if (!value) {
    return [];
  }

  return Array.from(new Set(
    value
      .split(',')
      .map((jobId) => jobId.trim())
      .filter(Boolean)
  )).slice(0, 5);
};

export const Route = createFileRoute('/user-job-performance-alphaver/compare')({
  validateSearch: (search: Record<string, unknown>): CompareSearch => ({
    jobIds: normalizeSearchValue(search.jobIds),
    source: normalizeSearchValue(search.source),
  }),
  component: CompareJobsPage,
});

interface MetricRow {
  'Job ID': number;
  'Floored Relative Time': number;
  [key: string]: number | null;
}

interface UserJobData {
  'Job ID': number;
  'Project': string;
  'QOS'?: string;
  'Job Status'?: string;
  'Job Name'?: string;
  'Submit Time'?: string;
  'Start Time'?: string;
  'End Time'?: string;
  'Hostname'?: string;
  'Charged Node Hours'?: number;
  'Node hours charged'?: number;
  'No. of nodes Allocated'?: number;
  'Elapsed secs'?: number;
  'State'?: string;
}

type MetricsByJob = Record<string, MetricRow[]>;
type PlotGranularity = 'job-level' | 'node-level' | 'gpu-level';
type RawMetricRecordsByJob = Record<string, Record<string, unknown>[]>;

interface JobOption {
  id: string;
  jobName: string;
  projectId: string;
  searchText: string;
}

interface CuratedMetric extends CompareMetricDefinition {
  categoryId: string;
  categoryTitle: string;
  metricId: string;
  searchText: string;
  availableAlias: string | undefined;
  isAvailable: boolean;
}

type RelativeFocusWindow = [number, number];

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

const parseJobTimestamp = (value: string | undefined) => {
  if (!value) {
    return new Date(Number.NaN);
  }

  return new Date(value.replace(' ', 'T'));
};

const formatDurationFromSeconds = (value: number | undefined) => {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  const totalSeconds = Math.max(0, Math.round(value ?? 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (seconds > 0 || !parts.length) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
};

const formatDurationBetween = (
  startTime: string | undefined,
  endTime: string | undefined
) => {
  const start = parseJobTimestamp(startTime);
  const end = parseJobTimestamp(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'N/A';
  }

  return formatDurationFromSeconds((end.getTime() - start.getTime()) / 1000);
};

const formatNumberValue = (value: unknown, maximumFractionDigits = 2) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 'N/A';
  }

  return numericValue.toLocaleString(undefined, { maximumFractionDigits });
};

const formatMetricName = (metric: string) =>
  metric.replace('nersc_ldms_dcgm_', '').replace(/_/g, ' ');

const toFiniteNumber = (value: unknown) => {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
};

const getMedianValue = (values: number[]) => {
  if (!values.length) {
    return null;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 0
    ? (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
    : sortedValues[midpoint];
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const normalizeUtilizationValue = (value: unknown) => {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return null;
  }

  return clampPercent(Math.abs(numericValue) <= 1 ? numericValue * 100 : numericValue);
};

const parseMetricTimestamp = (value: unknown, fallbackIndex: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === 'string' && value.trim()) {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue)) {
      return numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000;
    }

    const parsedValue = Date.parse(value.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1'));

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return fallbackIndex;
};

const normalizeRelativeAxis = (timeValues: number[]) => {
  if (timeValues.length <= 1) {
    return timeValues.map(() => 0);
  }

  const minTime = Math.min(...timeValues);
  const maxTime = Math.max(...timeValues);
  const span = maxTime - minTime;

  if (!Number.isFinite(span) || span <= 0) {
    const denominator = Math.max(1, timeValues.length - 1);

    return timeValues.map((_time, index) => Number(((index / denominator) * 100).toFixed(3)));
  }

  return timeValues.map((time) => Number((((time - minTime) / span) * 100).toFixed(3)));
};

const getRecordNodeLabel = (record: Record<string, unknown>) => {
  const rawNode = record.hostname;

  return typeof rawNode === 'string' && rawNode.trim()
    ? rawNode.trim()
    : 'Node aggregate';
};

const getRecordGpuLabel = (record: Record<string, unknown>) => {
  const rawGpu = record.gpu_id;

  if (rawGpu === undefined || rawGpu === null || rawGpu === '') {
    return null;
  }

  const gpuLabel = String(rawGpu).trim();

  if (!gpuLabel) {
    return null;
  }

  return gpuLabel.toLowerCase().startsWith('gpu') ? gpuLabel : `GPU ${gpuLabel}`;
};

const isGpuMetricValue = (metric: string, label: string) => (
  metric.includes('_dcgm_') || label.toLowerCase().includes('gpu')
);

const getRecordMetricValue = (
  record: Record<string, unknown>,
  aliases: string[],
  label: string
) => {
  const shouldNormalizePercent = label.toLowerCase().includes('utilization');

  for (const alias of aliases) {
    const value = shouldNormalizePercent
      ? normalizeUtilizationValue(record[alias])
      : toFiniteNumber(record[alias]);

    if (value !== null) {
      return value;
    }
  }

  return null;
};

const parseNodeList = (value: string | undefined) => {
  if (!value?.trim()) {
    return [];
  }

  return Array.from(new Set(
    value
      .split(/[,\s]+/)
      .map((node) => node.trim())
      .filter(Boolean)
  ));
};

const buildLineTrace = (
  x: number[],
  y: number[],
  name: string,
  color: string,
  width = 2,
  options: {
    dash?: string;
    markerSymbol?: string;
    mode?: 'lines' | 'lines+markers';
    xAxisLabel?: string;
    yAxisLabel?: string;
    xValueSuffix?: string;
  } = {}
) => ({
  x,
  y,
  type: 'scatter' as const,
  mode: options.mode ?? 'lines' as const,
  name,
  line: { width, color, ...(options.dash ? { dash: options.dash } : {}) },
  hovertemplate: `${options.xAxisLabel ?? 'x'}: %{x}${options.xValueSuffix ?? ''}<br>${options.yAxisLabel ?? 'y'}: %{y}<extra>%{fullData.name}</extra>`,
  ...(options.markerSymbol
    ? {
      marker: {
        size: 6,
        symbol: options.markerSymbol,
        color,
      },
    }
    : {}),
});

const formatValue = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 3 });
const COLOR_TOKENS = {
  pageBg: '#ffffff',
  textPrimary: '#111827',
  textSecondary: '#4b5563',
  label: '#475569',
} as const;

const TITLE_SX = {
  fontWeight: 700,
  color: COLOR_TOKENS.textPrimary,
  letterSpacing: '-0.01em',
};

const LEFT_PANEL_TITLE_SX = {
  fontWeight: 700,
  color: COLOR_TOKENS.textPrimary,
};

const LEFT_PANEL_SECTION_LABEL_SX = {
  fontWeight: 700,
  fontSize: '0.95rem',
  color: COLOR_TOKENS.textPrimary,
};

const SECTION_TITLE_SX = {
  fontWeight: 700,
  color: COLOR_TOKENS.textPrimary,
};

const SECTION_TOGGLE_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  cursor: 'pointer',
  py: 0.5,
};

const LEFT_PANEL_SUBLABEL_SX = {
  fontWeight: 700,
  color: COLOR_TOKENS.label,
};

const LEFT_PANEL_OPTION_LABEL_SX = {
  fontWeight: 500,
  color: COLOR_TOKENS.textPrimary,
};

const LEFT_PANEL_META_SX = {
  color: COLOR_TOKENS.textSecondary,
};

const JOB_METADATA_HEADER_CELL_SX = {
  color: COLOR_TOKENS.label,
  fontWeight: 700,
  py: 1.75,
};

const JOB_METADATA_BODY_CELL_SX = {
  py: 1.75,
};

const DUMMY_JOB_COUNT = 5;
const SYNTHETIC_PROJECT_IDS = ['m842', 'm984', 'm2137', 'm5560', 'm7781'] as const;
const DEFAULT_SELECTED_METRIC_LABELS = [
  'GPU Utilization (%)',
] as const;
const DETAILS_SELECTED_METRIC_LABELS = [
  'GPU Utilization (%)',
  'GPU Memory Bandwidth Utilization (%)',
  'CPU Memory Utilization',
  'CPU Power',
  'PCIe Throughput (MB/s)',
  'NVLink Throughput (GB/s)',
  'Slingshot Throughput',
] as const;
function CompareJobsPage() {
  const compareSearch = Route.useSearch();
  const stickySidebarTop = 24;
  const metricsByJob = useDataFromSource(
    'data/user-job-performance/metrics-data.json'
  ) as MetricsByJob | undefined;
  const userJobs = useDataFromSource(
    'data/user-job-performance/user-jobs.json'
  ) as UserJobData[] | undefined;
  const irisJobs = useDataFromSource(
    'data/user-job-performance/job-data-iris-export.json'
  ) as UserJobData[] | undefined;
  const loadedJobCacheEntries = useMemo(() => readLoadedJobsBrowserCache(), []);
  const loadedJobMetricsCacheEntries = useMemo(() => readLoadedJobMetricsBrowserCache(), []);

  const [machine, setMachine] = useState('perlmutter gpu');
  const [jobSearchInput, setJobSearchInput] = useState('');
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [comparedJobs, setComparedJobs] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [plotAggregationByMetric, setPlotAggregationByMetric] = useState<Record<string, string>>({});
  const [expandedMetricSections, setExpandedMetricSections] = useState<Record<string, boolean>>({});
  const [hasInitializedSelectedMetric, setHasInitializedSelectedMetric] = useState(false);
  const [downsamplingFunction, setDownsamplingFunction] = useState('median');
  const [downsamplingWindowValue, setDownsamplingWindowValue] = useState(1);
  const [downsamplingWindowUnit, setDownsamplingWindowUnit] = useState('sec');
  const [focusNodesByJob, setFocusNodesByJob] = useState<Record<string, string[]>>({});
  const [nodeSearchInputByJob, setNodeSearchInputByJob] = useState<Record<string, string>>({});
  const [commonRelativeFocusWindow, setCommonRelativeFocusWindow] = useState<RelativeFocusWindow>([
    0, 100,
  ]);
  const [metricSearchInput, setMetricSearchInput] = useState('');
  const [pinnedMetricIds, setPinnedMetricIds] = useState<string[]>([]);
  const [isDownsamplingExpanded, setIsDownsamplingExpanded] = useState(false);
  const [isFocusExpanded, setIsFocusExpanded] = useState(false);
  const [isJobMetadataExpanded, setIsJobMetadataExpanded] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['efficiency-snapshot']);
  const [hasInitializedSelectedJobs, setHasInitializedSelectedJobs] = useState(false);
  const requestedCompareJobIds = useMemo(
    () => parseCompareJobIds(compareSearch.jobIds),
    [compareSearch.jobIds]
  );
  const defaultSelectedMetricLabels = compareSearch.source === 'job-details'
    ? DETAILS_SELECTED_METRIC_LABELS
    : DEFAULT_SELECTED_METRIC_LABELS;
  const [activeSidebarSection, setActiveSidebarSection] = useState<
    'machine' | 'jobs' | 'metrics' | 'data-sampling' | null
  >('machine');
  const mergedUserJobs = useMemo<UserJobData[]>(() => {
    const jobsById = new Map<string, UserJobData>();

    (userJobs ?? []).forEach((job) => {
      jobsById.set(job['Job ID'].toString(), job);
    });

    (irisJobs ?? []).forEach((job) => {
      jobsById.set(job['Job ID'].toString(), {
        ...job,
        'Charged Node Hours': job['Charged Node Hours'] ?? job['Node hours charged'],
      });
    });

    loadedJobCacheEntries.forEach(({ job, jobId }) => {
      const elapsedSeconds = Number(job.elapsedraw);
      const nodeCount = Number(job.nnodes ?? job.allocnodes);
      const chargedNodeHours = Number.isFinite(elapsedSeconds) && Number.isFinite(nodeCount)
        ? Number(((elapsedSeconds * nodeCount) / 3600).toFixed(2))
        : 0;

      jobsById.set(jobId, {
        'Job ID': Number(jobId),
        Project: job.account ?? 'N/A',
        'Job Name': job.jobname ?? `Perlmutter job ${jobId}`,
        'Job Status': job.state ?? 'N/A',
        'QOS': job.qos ?? 'N/A',
        'Submit Time': job.submit,
        'Start Time': job.start ?? job.submit,
        'End Time': job.end,
        Hostname: job.nodelist ?? job.machine ?? 'perlmutter',
        'Charged Node Hours': chargedNodeHours,
        'No. of nodes Allocated': Number.isFinite(nodeCount) ? nodeCount : undefined,
        'Elapsed secs': Number.isFinite(elapsedSeconds) ? elapsedSeconds : undefined,
      });
    });

    return Array.from(jobsById.values());
  }, [irisJobs, loadedJobCacheEntries, userJobs]);

  const cachedMetricsByJob = useMemo<MetricsByJob>(() => {
    const nextCachedMetricsByJob: MetricsByJob = {};

    loadedJobMetricsCacheEntries.forEach(({ jobId, summary }) => {
      const gpuUtilizationSeries = summary.series?.gpuUtilization ?? [];
      const nodePowerSeries = summary.series?.nodePower ?? [];
      const cpuPowerSeries = summary.series?.cpuPower ?? [];

      if (!gpuUtilizationSeries.length && !nodePowerSeries.length && !cpuPowerSeries.length) {
        return;
      }

      const rowsByTime = new Map<number, MetricRow>();
      const ensureRow = (time: number) => {
        const existingRow = rowsByTime.get(time);

        if (existingRow) {
          return existingRow;
        }

        const row: MetricRow = {
          'Job ID': Number(jobId),
          'Floored Relative Time': time,
        };
        rowsByTime.set(time, row);

        return row;
      };

      gpuUtilizationSeries.forEach((point) => {
        ensureRow(point.x)[GPU_UTILIZATION_METRIC] = point.y;
      });
      nodePowerSeries.forEach((point) => {
        ensureRow(point.x)[NODE_POWER_API_METRIC] = point.y;
      });
      cpuPowerSeries.forEach((point) => {
        ensureRow(point.x)[CPU_POWER_API_METRIC] = point.y;
      });

      nextCachedMetricsByJob[jobId] = Array.from(rowsByTime.values()).sort(
        (left, right) => left['Floored Relative Time'] - right['Floored Relative Time']
      );
    });

    return nextCachedMetricsByJob;
  }, [loadedJobMetricsCacheEntries]);

  const cachedRawMetricRecordsByJob = useMemo<RawMetricRecordsByJob>(() => {
    const recordsByJob: RawMetricRecordsByJob = {};

    loadedJobMetricsCacheEntries.forEach(({ jobId, summary }) => {
      recordsByJob[jobId] = [
        ...(summary.records?.gpuUtilization ?? []),
        ...(summary.records?.nodePower ?? []),
        ...(summary.records?.cpuPower ?? []),
      ];
    });

    return recordsByJob;
  }, [loadedJobMetricsCacheEntries]);

  const baseMetricJobIds = useMemo(
    () => new Set([
      ...Object.keys(metricsByJob ?? {}),
      ...Object.keys(cachedMetricsByJob),
    ]),
    [cachedMetricsByJob, metricsByJob]
  );

  const allMetricsByJob = useMemo(() => {
    if (!metricsByJob && !Object.keys(cachedMetricsByJob).length) {
      return undefined;
    }

    const baseMetricsByJob = {
      ...(metricsByJob ?? {}),
      ...cachedMetricsByJob,
    };
    const entries = Object.entries(baseMetricsByJob);
    if (!entries.length) {
      return baseMetricsByJob;
    }

    const numericIds = Object.keys(baseMetricsByJob)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    const maxId = numericIds.length ? Math.max(...numericIds) : 100000;

    const syntheticMetricsByJob: MetricsByJob = { ...baseMetricsByJob };
    for (let index = 0; index < DUMMY_JOB_COUNT; index += 1) {
      const sourceSeries = entries[index % entries.length][1];
      const syntheticJobId = String(maxId + index + 1);

      syntheticMetricsByJob[syntheticJobId] = sourceSeries.map((row, rowIndex) => {
        const clonedRow: MetricRow = {
          'Job ID': Number(syntheticJobId),
          'Floored Relative Time': row['Floored Relative Time'],
        };

        Object.entries(row).forEach(([key, value]) => {
          if (key === 'Job ID' || key === 'Floored Relative Time') {
            return;
          }
          if (typeof value === 'number') {
            const modifier = 1 + ((((index + 1) * 5 + rowIndex) % 9) - 4) * 0.015;
            clonedRow[key] = Number((value * modifier).toFixed(3));
            return;
          }
          clonedRow[key] = value;
        });

        return clonedRow;
      });
    }

    return syntheticMetricsByJob;
  }, [cachedMetricsByJob, metricsByJob]);

  const dummyJobIds = useMemo(() => {
    if (!allMetricsByJob) {
      return new Set<string>();
    }

    return new Set(
      Object.keys(allMetricsByJob).filter((jobId) => !baseMetricJobIds.has(jobId))
    );
  }, [allMetricsByJob, baseMetricJobIds]);

  const metricNames = useMemo(() => {
    if (!allMetricsByJob) {
      return [];
    }

    const names = new Set<string>();

    Object.values(allMetricsByJob).forEach((series) => {
      series.forEach((row) => {
        Object.keys(row).forEach((key) => {
          if (key !== 'Job ID' && key !== 'Floored Relative Time') {
            names.add(key);
          }
        });
      });
    });

    return Array.from(names);
  }, [allMetricsByJob]);

  const availableMetricNames = useMemo(() => new Set(metricNames), [metricNames]);

  const curatedMetricGroups = useMemo(() => {
    return COMPARE_METRIC_CATEGORIES.map((category) => {
      const metrics = category.metrics.map((metric) => {
        const availableAlias = metric.aliases.find((alias) => availableMetricNames.has(alias));
        return {
          ...metric,
          categoryId: category.id,
          categoryTitle: category.title,
          metricId: `${category.id}:${metric.label}`,
          searchText: `${category.title} ${metric.label} ${metric.aliases.join(' ')}`.toLowerCase(),
          availableAlias,
          isAvailable: Boolean(availableAlias),
        } satisfies CuratedMetric;
      });

      return {
        ...category,
        metrics,
      };
    });
  }, [availableMetricNames]);

  const filteredMetricGroups = useMemo(() => {
    const search = metricSearchInput.trim().toLowerCase();
    const pinnedMetricIdSet = new Set(pinnedMetricIds);

    return curatedMetricGroups
      .map((category) => {
        const metrics = category.metrics.filter((metric) => {
          const matchesSearch = !search || metric.searchText.includes(search);
          return matchesSearch && !pinnedMetricIdSet.has(metric.metricId);
        });

        return {
          ...category,
          metrics,
        };
      })
      .filter((category) => category.metrics.length > 0);
  }, [curatedMetricGroups, metricSearchInput, pinnedMetricIds]);

  const pinnedMetrics = useMemo(() => {
    const pinnedMetricIdSet = new Set(pinnedMetricIds);

    return curatedMetricGroups
      .flatMap((category) => category.metrics)
      .filter((metric) => pinnedMetricIdSet.has(metric.metricId));
  }, [curatedMetricGroups, pinnedMetricIds]);

  const metricLabelByValue = useMemo(() => {
    const labels = new Map<string, string>();

    curatedMetricGroups
      .flatMap((category) => category.metrics)
      .forEach((metric) => {
        labels.set(metric.metricId, metric.label);
        metric.aliases.forEach((alias) => labels.set(alias, metric.label));
      });

    return labels;
  }, [curatedMetricGroups]);

  const metricAliasesByValue = useMemo(() => {
    const aliasesByValue = new Map<string, string[]>();

    curatedMetricGroups
      .flatMap((category) => category.metrics)
      .forEach((metric) => {
        aliasesByValue.set(metric.metricId, metric.aliases);
        metric.aliases.forEach((alias) => aliasesByValue.set(alias, metric.aliases));
      });

    return aliasesByValue;
  }, [curatedMetricGroups]);

  const jobOptions = useMemo<JobOption[]>(() => {
    if (!allMetricsByJob) {
      return [];
    }
    const jobIds = Array.from(new Set([
      ...Object.keys(allMetricsByJob),
      ...mergedUserJobs.map((job) => job['Job ID'].toString()),
      ...requestedCompareJobIds,
    ]));
    const userJobById = new Map<string, UserJobData>();
    mergedUserJobs.forEach((job) => {
      userJobById.set(job['Job ID'].toString(), job);
    });
    return jobIds.map((jobId, index) => {
      const matchedJob = userJobById.get(jobId);
      const projectId =
        matchedJob?.Project ?? SYNTHETIC_PROJECT_IDS[index % SYNTHETIC_PROJECT_IDS.length];
      const jobName =
        matchedJob?.['Job Name']?.trim() ||
        (matchedJob
          ? `Perlmutter GPU job ${jobId}`
          : `Optimization candidate ${index + 1}`);

      return {
        id: jobId,
        jobName,
        projectId,
        searchText: `${jobId} ${jobName} ${projectId}`.toLowerCase(),
      };
    });
  }, [allMetricsByJob, mergedUserJobs, requestedCompareJobIds]);

  const selectedJobOptions = useMemo(() => {
    const jobOptionById = new Map(jobOptions.map((job) => [job.id, job]));
    return selectedJobs
      .map((jobId) => jobOptionById.get(jobId))
      .filter((job): job is JobOption => Boolean(job));
  }, [jobOptions, selectedJobs]);

  const searchableJobOptions = useMemo(() => {
    const selectedJobIds = new Set(selectedJobs);
    return jobOptions.filter((job) => !selectedJobIds.has(job.id));
  }, [jobOptions, selectedJobs]);

  const listViewOrderedJobOptions = useMemo(() => {
    const jobOptionById = new Map(jobOptions.map((job) => [job.id, job]));
    const listedJobIds = mergedUserJobs
      .map((job) => ({
        id: job['Job ID'].toString(),
        submitTime: parseJobTimestamp(job['Submit Time']).getTime(),
        startTime: parseJobTimestamp(job['Start Time']).getTime(),
      }))
      .sort((left, right) => {
        const leftTimestamp = Number.isNaN(left.submitTime) ? left.startTime : left.submitTime;
        const rightTimestamp = Number.isNaN(right.submitTime) ? right.startTime : right.submitTime;

        return (Number.isNaN(rightTimestamp) ? 0 : rightTimestamp) -
          (Number.isNaN(leftTimestamp) ? 0 : leftTimestamp);
      })
      .map((job) => job.id);
    const listedJobIdLookup = new Set(listedJobIds);
    const listedOptions = listedJobIds
      .map((jobId) => jobOptionById.get(jobId))
      .filter((job): job is JobOption => Boolean(job));
    const unlistedOptions = jobOptions.filter((job) => !listedJobIdLookup.has(job.id));

    return [...listedOptions, ...unlistedOptions];
  }, [jobOptions, mergedUserJobs]);

  const jobSelectorOptions = useMemo(() => {
    const selectedJobIds = new Set(selectedJobs);

    if (jobSearchInput.trim()) {
      return searchableJobOptions;
    }

    return listViewOrderedJobOptions
      .filter((job) => !selectedJobIds.has(job.id))
      .slice(0, 10);
  }, [jobSearchInput, listViewOrderedJobOptions, searchableJobOptions, selectedJobs]);

  const jobMetadataById = useMemo(() => {
    const metadata = new Map<string, UserJobData>();
    mergedUserJobs.forEach((job) => {
      metadata.set(job['Job ID'].toString(), job);
    });
    return metadata;
  }, [mergedUserJobs]);

  const focusableJobOptions = useMemo(() => {
    const jobOptionById = new Map(jobOptions.map((job) => [job.id, job]));
    return comparedJobs
      .map((jobId) => jobOptionById.get(jobId))
      .filter((job): job is JobOption => Boolean(job))
      .slice(0, 5);
  }, [comparedJobs, jobOptions]);

  const nodeOptionsByJob = useMemo(() => {
    const entries = focusableJobOptions.map((job) => {
      const jobMetadata = jobMetadataById.get(job.id);
      const nodesFromRecords = Array.from(new Set(
        (cachedRawMetricRecordsByJob[job.id] ?? [])
          .map(getRecordNodeLabel)
          .filter((node) => node !== 'Node aggregate')
      )).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
      const nodes = nodesFromRecords.length
        ? nodesFromRecords
        : parseNodeList(jobMetadata?.Hostname);

      return [job.id, nodes] as const;
    });

    return Object.fromEntries(entries);
  }, [cachedRawMetricRecordsByJob, focusableJobOptions, jobMetadataById]);

  useEffect(() => {
    setFocusNodesByJob((current) => {
      const nextEntries = Object.entries(current)
        .map(([jobId, selectedNodes]) => {
          const availableNodes = new Set(nodeOptionsByJob[jobId] ?? []);
          return [
            jobId,
            selectedNodes.filter((node) => availableNodes.has(node)),
          ] as const;
        })
        .filter(([_jobId, selectedNodes]) => selectedNodes.length > 0);

      if (
        nextEntries.length === Object.keys(current).length &&
        nextEntries.every(([jobId, selectedNodes]) => (
          selectedNodes.length === current[jobId]?.length
        ))
      ) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [nodeOptionsByJob]);

  useEffect(() => {
    if (!hasInitializedSelectedMetric && !selectedMetrics.length && metricNames.length) {
      const defaultMetricLabels = new Set<string>(defaultSelectedMetricLabels);
      const defaultMetrics = curatedMetricGroups
        .flatMap((category) => category.metrics)
        .filter((metric) => defaultMetricLabels.has(metric.label))
        .map((metric) => metric.availableAlias ?? metric.metricId);
      setSelectedMetrics(defaultMetrics.length ? defaultMetrics : [metricNames[0]]);
      setHasInitializedSelectedMetric(true);
    }
  }, [
    curatedMetricGroups,
    defaultSelectedMetricLabels,
    hasInitializedSelectedMetric,
    metricNames,
    selectedMetrics.length,
  ]);

  useEffect(() => {
    if (hasInitializedSelectedJobs || !jobOptions.length) {
      return;
    }

    const availableJobIds = new Set(jobOptions.map((job) => job.id));
    const requestedJobs = requestedCompareJobIds.filter((jobId) => availableJobIds.has(jobId));
    const initialJobs = requestedJobs.length
      ? requestedJobs
      : jobOptions.slice(0, 1).map((job) => job.id);

    setSelectedJobs(initialJobs);
    setComparedJobs(initialJobs);
    setHasInitializedSelectedJobs(true);
  }, [hasInitializedSelectedJobs, jobOptions, requestedCompareJobIds]);

  useEffect(() => {
    setPlotAggregationByMetric((current) => {
      const selectedMetricSet = new Set(selectedMetrics);
      const nextAggregations = Object.fromEntries(
        Object.entries(current).filter(([metric]) => selectedMetricSet.has(metric))
      );

      return Object.keys(nextAggregations).length === Object.keys(current).length
        ? current
        : nextAggregations;
    });
  }, [selectedMetrics]);

  useEffect(() => {
    setExpandedMetricSections((current) => {
      const nextSections = Object.fromEntries(
        selectedMetrics.map((metric) => [metric, current[metric] ?? true])
      );

      return Object.keys(nextSections).length === Object.keys(current).length &&
        Object.entries(nextSections).every(([metric, expanded]) => current[metric] === expanded)
        ? current
        : nextSections;
    });
  }, [selectedMetrics]);

  const metricComparisonSections = useMemo(() => {
    if (!allMetricsByJob || !selectedMetrics.length) {
      return [];
    }
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444'];
    const nodeColors = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#dc2626'];
    const nodeDashStyles = ['dash', 'dot', 'dashdot', 'longdash', 'longdashdot'];
    const nodeMarkerSymbols = ['circle', 'square', 'diamond', 'cross', 'x', 'triangle-up'];
    const getGranularTraceStyle = (jobIndex: number, traceIndex: number) => {
      const isSingleJob = comparedJobs.length <= 1;

      if (isSingleJob) {
        return {
          color: nodeColors[traceIndex % nodeColors.length],
          dash: 'dash',
          markerSymbol: undefined,
          mode: 'lines' as const,
        };
      }

      return {
        color: colors[jobIndex % colors.length],
        dash: nodeDashStyles[traceIndex % nodeDashStyles.length],
        markerSymbol: nodeMarkerSymbols[traceIndex % nodeMarkerSymbols.length],
        mode: 'lines+markers' as const,
      };
    };
    const getJobLegendName = (jobId: string) => `Job ${jobId}${dummyJobIds.has(jobId) ? ' (dum.)' : ''}`;
    const buildCompactJobTrace = (
      jobId: string,
      index: number,
      metric: string,
      yAxisLabel: string
    ) => {
      const series = allMetricsByJob[jobId] ?? [];
      const points = series
        .map((row) => ({
          time: Number(row['Floored Relative Time']),
          value: toFiniteNumber(row[metric]),
        }))
        .filter((point): point is { time: number; value: number } => (
          Number.isFinite(point.time) && point.value !== null
        ));

      if (!points.length) {
        return [];
      }

      return [
        buildLineTrace(
          normalizeRelativeAxis(points.map((point) => point.time)),
          points.map((point) => point.value),
          getJobLegendName(jobId),
          colors[index % colors.length],
          2,
          {
            xAxisLabel: 'Relative Time',
            yAxisLabel,
            xValueSuffix: '%',
          }
        ),
      ];
    };
    const buildDemoGranularTraces = (
      jobId: string,
      jobIndex: number,
      metric: string,
      yAxisLabel: string,
      level: 'node-level' | 'gpu-level'
    ) => {
      const baseTrace = buildCompactJobTrace(jobId, jobIndex, metric, yAxisLabel)[0];

      if (!baseTrace) {
        return [];
      }

      const traceLabels = level === 'node-level'
        ? (nodeOptionsByJob[jobId] ?? []).slice(0, 4)
        : Array.from({ length: 4 }, (_value, gpuIndex) => `GPU ${gpuIndex}`);
      const labels = traceLabels.length ? traceLabels : ['Node aggregate'];

      return labels.map((label, labelIndex) => {
        const modifier = 1 + ((labelIndex - (labels.length - 1) / 2) * 0.035);
        const y = (baseTrace.y as number[]).map((value, pointIndex) =>
          Number((value * modifier + ((pointIndex + labelIndex) % 3) * 0.2).toFixed(3))
        );
        const name = level === 'node-level'
          ? `${getJobLegendName(jobId)} / ${label}`
          : `${getJobLegendName(jobId)} / ${label}`;

        const nodeTraceStyle = getGranularTraceStyle(jobIndex, labelIndex);

        return buildLineTrace(
          baseTrace.x as number[],
          y,
          name,
          nodeTraceStyle.color,
          1.8,
          {
            ...nodeTraceStyle,
            xAxisLabel: 'Relative Time',
            yAxisLabel,
            xValueSuffix: '%',
          }
        );
      });
    };
    const buildRecordGranularTraces = (
      jobId: string,
      jobIndex: number,
      metric: string,
      yAxisLabel: string,
      metricAliases: string[],
      level: 'node-level' | 'gpu-level'
    ) => {
      const records = cachedRawMetricRecordsByJob[jobId] ?? [];
      const groupedValues = new Map<string, {
        label: string;
        time: number;
        values: number[];
      }>();

      records.forEach((record, recordIndex) => {
        const value = getRecordMetricValue(record, metricAliases, yAxisLabel);

        if (value === null) {
          return;
        }

        const time = parseMetricTimestamp(record.timestamp, recordIndex);
        const nodeLabel = getRecordNodeLabel(record);
        const gpuLabel = level === 'gpu-level' ? getRecordGpuLabel(record) : null;

        if (level === 'gpu-level' && !gpuLabel) {
          return;
        }

        const label = level === 'node-level'
          ? nodeLabel
          : `${nodeLabel} / ${gpuLabel}`;
        const key = `${label}-${time}`;
        const existingGroup = groupedValues.get(key);

        if (existingGroup) {
          existingGroup.values.push(value);
          return;
        }

        groupedValues.set(key, {
          label,
          time,
          values: [value],
        });
      });

      const points = Array.from(groupedValues.values())
        .map((group) => ({
          label: group.label,
          time: group.time,
          value: level === 'node-level'
            ? getMedianValue(group.values)
            : group.values[0],
        }))
        .filter((point): point is { label: string; time: number; value: number } => (
          point.value !== null
        ));

      if (!points.length) {
        return [];
      }

      const uniqueTimes = Array.from(new Set(points.map((point) => point.time))).sort(
        (left, right) => left - right
      );
      const relativeTimeByTime = new Map(
        uniqueTimes.map((time, index) => [time, normalizeRelativeAxis(uniqueTimes)[index]])
      );
      const selectedNodes = new Set(focusNodesByJob[jobId] ?? []);
      const pointsByLabel = points.reduce<Record<string, Array<{ x: number; y: number }>>>(
        (groups, point) => {
          if (level === 'node-level' && selectedNodes.size > 0 && !selectedNodes.has(point.label)) {
            return groups;
          }

          const x = relativeTimeByTime.get(point.time) ?? 0;

          if (x < commonRelativeFocusWindow[0] || x > commonRelativeFocusWindow[1]) {
            return groups;
          }

          return {
            ...groups,
            [point.label]: [
              ...(groups[point.label] ?? []),
              { x, y: point.value },
            ],
          };
        },
        {}
      );

      return Object.entries(pointsByLabel).map(([label, tracePoints], traceIndex) => {
        const sortedPoints = [...tracePoints].sort((left, right) => left.x - right.x);

        const nodeTraceStyle = getGranularTraceStyle(jobIndex, traceIndex);

        return buildLineTrace(
          sortedPoints.map((point) => point.x),
          sortedPoints.map((point) => point.y),
          `${getJobLegendName(jobId)} / ${label}`,
          nodeTraceStyle.color,
          1.8,
          {
            ...nodeTraceStyle,
            xAxisLabel: 'Relative Time',
            yAxisLabel,
            xValueSuffix: '%',
          }
        );
      });
    };

    return selectedMetrics.map((metric) => {
      const label = metricLabelByValue.get(metric) ?? formatMetricName(metric);
      const metricAliases = metricAliasesByValue.get(metric) ?? [metric];
      const isGpuMetric = isGpuMetricValue(metric, label);
      const selectedGranularity = (plotAggregationByMetric[metric] ?? 'job-level') as PlotGranularity;
      const granularity = selectedGranularity === 'gpu-level' && !isGpuMetric
        ? 'job-level'
        : selectedGranularity;
      const traces = comparedJobs.flatMap((jobId, index) => {
        if (granularity === 'job-level') {
          return buildCompactJobTrace(jobId, index, metric, label);
        }

        const recordTraces = buildRecordGranularTraces(
          jobId,
          index,
          metric,
          label,
          metricAliases,
          granularity
        );

        return recordTraces.length
          ? recordTraces
          : buildDemoGranularTraces(jobId, index, metric, label, granularity);
      });

      const summaryRows = comparedJobs.map((jobId) => {
        const values =
          (allMetricsByJob[jobId] ?? [])
            .map((row) => row[metric])
            .filter((value): value is number => typeof value === 'number') ?? [];

        if (!values.length) {
          return { jobId, mean: 0, avg: 0, min: 0, max: 0 };
        }

        const sum = values.reduce((total, value) => total + value, 0);
        return {
          jobId,
          mean: sum / values.length,
          avg: sum / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
        };
      });

      return {
        metric,
        label,
        isGpuMetric,
        granularity,
        traces,
        summaryRows,
      };
    });
  }, [
    allMetricsByJob,
    cachedRawMetricRecordsByJob,
    commonRelativeFocusWindow,
    comparedJobs,
    dummyJobIds,
    focusNodesByJob,
    metricAliasesByValue,
    metricLabelByValue,
    nodeOptionsByJob,
    plotAggregationByMetric,
    selectedMetrics,
  ]);

  const handleJobAdd = (_event: SyntheticEvent, value: JobOption | null) => {
    if (!value || selectedJobs.includes(value.id)) {
      setJobSearchInput('');
      return;
    }

    const nextSelectedJobs = [...selectedJobs, value.id];
    setSelectedJobs(nextSelectedJobs);
    setComparedJobs(nextSelectedJobs);
    setJobSearchInput('');
  };

  const handleRemoveComparedJob = (jobIdToRemove: string) => {
    const nextSelectedJobs = selectedJobs.filter((jobId) => jobId !== jobIdToRemove);
    setSelectedJobs(nextSelectedJobs);
    setComparedJobs(nextSelectedJobs);
  };

  const handleMetricCategoryToggle = (categoryId: string) => (
    _event: SyntheticEvent,
    expanded: boolean
  ) => {
    setExpandedCategories((current) =>
      expanded ? [...new Set([...current, categoryId])] : current.filter((id) => id !== categoryId)
    );
  };

  const handleTogglePinnedMetric = (metricId: string) => {
    setPinnedMetricIds((current) =>
      current.includes(metricId)
        ? current.filter((id) => id !== metricId)
        : [...current, metricId]
    );
  };

  const handleToggleSelectedMetric = (metric: string) => {
    setSelectedMetrics((current) =>
      current.includes(metric)
        ? current.filter((selectedMetric) => selectedMetric !== metric)
        : [...current, metric]
    );
  };

  const handlePlotAggregationChange = (metric: string, value: string) => {
    setPlotAggregationByMetric((current) => ({
      ...current,
      [metric]: value,
    }));
  };

  const handleMetricSectionToggle = (metric: string) => {
    setExpandedMetricSections((current) => ({
      ...current,
      [metric]: !(current[metric] ?? true),
    }));
  };

  const handleFocusedNodesChange = (jobId: string, value: string[]) => {
    setFocusNodesByJob((current) => ({
      ...current,
      [jobId]: value,
    }));
  };

  const handleNodeAdd = (jobId: string, value: string | null) => {
    if (!value) {
      setNodeSearchInputByJob((current) => ({ ...current, [jobId]: '' }));
      return;
    }

    const currentNodes = focusNodesByJob[jobId] ?? [];
    if (!currentNodes.includes(value)) {
      handleFocusedNodesChange(jobId, [...currentNodes, value]);
    }

    setNodeSearchInputByJob((current) => ({ ...current, [jobId]: '' }));
  };

  const handleNodeRemove = (jobId: string, nodeToRemove: string) => {
    handleFocusedNodesChange(
      jobId,
      (focusNodesByJob[jobId] ?? []).filter((node) => node !== nodeToRemove)
    );
  };

  const handleRelativeFocusWindowChange = (value: number[]) => {
    setCommonRelativeFocusWindow([value[0], value[1]]);
  };

  const downsamplingFunctionLabelByValue: Record<string, string> = {
    median: 'Median',
    mean: 'Mean',
    max: 'Max',
    min: 'Min',
    p95: 'P95',
  };

  const selectedMetricLabels = selectedMetrics.map((metric) => ({
    metric,
    label: metricLabelByValue.get(metric) ?? formatMetricName(metric),
  }));
  const comparedJobMetadataRows = useMemo(() => {
    const jobOptionById = new Map(jobOptions.map((job) => [job.id, job]));

    return comparedJobs.map((jobId) => {
      const metadata = jobMetadataById.get(jobId);
      const option = jobOptionById.get(jobId);
      const nodeHours = metadata?.['Charged Node Hours'] ?? metadata?.['Node hours charged'];
      const elapsedSeconds = Number(metadata?.['Elapsed secs']);
      const runTime = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0
        ? formatDurationFromSeconds(elapsedSeconds)
        : formatDurationBetween(metadata?.['Start Time'], metadata?.['End Time']);
      const waitTime = formatDurationBetween(metadata?.['Submit Time'], metadata?.['Start Time']);

      return {
        jobId,
        jobName: metadata?.['Job Name']?.trim() || option?.jobName || `Job ${jobId}`,
        jobStatus: metadata?.['Job Status'] ?? metadata?.State ?? 'N/A',
        runTime,
        waitTime,
        qos: metadata?.QOS ?? 'N/A',
        nodeCount: formatNumberValue(metadata?.['No. of nodes Allocated'], 0),
        nodeChargeHours: formatNumberValue(nodeHours),
      };
    });
  }, [comparedJobs, jobMetadataById, jobOptions]);
  const downsamplingWindowLabel = `${downsamplingWindowValue} ${downsamplingWindowUnit}`;
  const hasFocusedNodes = Object.values(focusNodesByJob).some((nodes) => nodes.length > 0);
  const hasCustomRelativeFocusWindow =
    commonRelativeFocusWindow[0] !== 0 || commonRelativeFocusWindow[1] !== 100;
  const leftPanelTagSx = {
    height: 32,
    bgcolor: '#DEF6FF',
    color: '#002E59',
    border: '1px solid currentColor',
    '& .MuiChip-label': {
      px: 1.25,
      fontWeight: 500,
    },
    '& .MuiChip-deleteIcon': {
      color: '#1C73B9',
      fontSize: 16,
      '&:hover': {
        color: '#002E59',
      },
    },
  };

  const handleSidebarSectionToggle =
    (section: 'machine' | 'jobs' | 'metrics' | 'data-sampling') =>
    (_event: SyntheticEvent, expanded: boolean) => {
      setActiveSidebarSection(expanded ? section : null);
    };

  return (
    <Box sx={{ bgcolor: COLOR_TOKENS.pageBg, minHeight: '100vh', pt: 3, pb: 4 }}>
      <Container maxWidth="xl">
        <Breadcrumbs
          separator={<NavigateNextIcon fontSize="small" />}
          sx={{ mb: 1.5 }}
          aria-label="breadcrumb"
        >
          <Link
            component={RouterLink}
            to="/user-job-performance-alphaver"
            underline="hover"
            sx={{ color: '#1B4684', fontWeight: 500 }}
          >
            Jobs
          </Link>
          <Typography sx={{ color: COLOR_TOKENS.textPrimary, fontWeight: 500 }}>
            Performance Analyzer
          </Typography>
        </Breadcrumbs>
        <Box
          sx={{
            mb: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Typography variant="h4" sx={TITLE_SX}>
            Performance Analyzer
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="text"
              size="large"
              startIcon={<DownloadOutlinedIcon fontSize="small" />}
              sx={{ textTransform: 'none', color: '#475569', fontWeight: 600 }}
            >
              Export Data
            </Button>
            <Button
              variant="text"
              size="large"
              startIcon={<DescriptionOutlinedIcon fontSize="small" />}
              sx={{ textTransform: 'none', color: '#475569', fontWeight: 600 }}
            >
              Export Report
            </Button>
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: { xs: 2, md: 3 },
            alignItems: 'flex-start',
          }}
        >
          <Box
            sx={{
              width: { xs: '100%', md: 320, lg: 360 },
              flexShrink: 0,
            }}
          >
          <Paper
            elevation={0}
            sx={{
              position: { xs: 'relative', md: 'sticky' },
              top: { xs: 'auto', md: `${stickySidebarTop}px` },
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: { xs: 'auto', md: 'clamp(360px, calc(100vh), 680px)' },
              overflow: 'hidden',
              alignSelf: 'flex-start',
              boxShadow: 'none',
              boxSizing: 'border-box',
              borderRadius: 0,
              borderRight: { xs: 'none', md: '1px solid #E5E7EB' },
              pr: { xs: 0, md: 2 },
              '& .MuiInputLabel-root': {
                color: COLOR_TOKENS.label,
                fontWeight: 500,
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: '#1B4684',
              },
            }}
          >
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, pb: 0 }}>
              <Box sx={{ mb: 2, px: 1.5 }}>
                <Typography
                  variant="h6"
                  sx={{ ...LEFT_PANEL_TITLE_SX, mb: 1.25 }}
                >
                  Select Filters
                </Typography>
              </Box>

              <Accordion
                disableGutters
                expanded={activeSidebarSection === 'machine'}
                onChange={handleSidebarSectionToggle('machine')}
                sx={{
                  boxShadow: 'none',
                  borderTop: '1px solid #e2e8f0',
                  borderBottom: activeSidebarSection === 'machine' ? '1px solid #e2e8f0' : 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderRadius: 0,
                  mb: 1.5,
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  sx={{
                    px: 1.5,
                    alignItems: 'center',
                    '& .MuiAccordionSummary-content': {
                      my: 1,
                      display: 'flex',
                      alignItems: 'center',
                    },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="subtitle1"
                      sx={LEFT_PANEL_SECTION_LABEL_SX}
                    >
                      Machine
                    </Typography>
                    {activeSidebarSection !== 'machine' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
                        <Chip size="medium" label={machine} sx={leftPanelTagSx} />
                      </Box>
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2, pt: 1, pb: 1.75 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Machine</InputLabel>
                    <Select
                      label="Machine"
                      value={machine}
                      onChange={(event) => setMachine(event.target.value)}
                    >
                      <MenuItem value="perlmutter gpu">perlmutter gpu</MenuItem>
                      <MenuItem value="perlmutter cpu">perlmutter cpu</MenuItem>
                    </Select>
                  </FormControl>
                </AccordionDetails>
              </Accordion>

              <Accordion
                disableGutters
                expanded={activeSidebarSection === 'jobs'}
                onChange={handleSidebarSectionToggle('jobs')}
                sx={{
                  boxShadow: 'none',
                  borderTop: '1px solid #e2e8f0',
                  borderBottom: activeSidebarSection === 'jobs' ? '1px solid #e2e8f0' : 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderRadius: 0,
                  mb: 1.5,
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  sx={{
                    px: 1.5,
                    alignItems: 'center',
                    '& .MuiAccordionSummary-content': {
                      my: 1,
                      display: 'flex',
                      alignItems: 'center',
                    },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="subtitle1"
                      sx={LEFT_PANEL_SECTION_LABEL_SX}
                    >
                      Jobs
                    </Typography>
                    {activeSidebarSection !== 'jobs' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
                        {selectedJobOptions.length ? (
                          selectedJobOptions.map((job) => (
                            <Tooltip
                              key={job.id}
                              title={`${job.jobName} • Project ${job.projectId}`}
                              arrow
                            >
                              <Chip size="medium" label={job.id} sx={leftPanelTagSx} />
                            </Tooltip>
                          ))
                        ) : (
                          <Chip size="medium" label="No jobs selected" sx={leftPanelTagSx} />
                        )}
                      </Box>
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2, pt: 1, pb: 1.75 }}>
                  <Stack spacing={2.25}>
                    <Autocomplete
                      options={jobSelectorOptions}
                      value={null}
                      inputValue={jobSearchInput}
                      onInputChange={(_event, value) => setJobSearchInput(value)}
                      onChange={handleJobAdd}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      getOptionLabel={(option) => option.id}
                      filterOptions={(options, state) => {
                        const query = state.inputValue.trim().toLowerCase();
                        if (!query) {
                          return options;
                        }

                        return options.filter((option) => option.searchText.includes(query));
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Select Jobs"
                          placeholder="Search job data and select to add"
                          size="small"
                        />
                      )}
                      renderOption={(props, option) => {
                        const { key, ...optionProps } = props;
                        return (
                          <Box component="li" key={key} {...optionProps}>
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                              <Typography variant="body2" sx={LEFT_PANEL_OPTION_LABEL_SX}>
                                {option.id}
                              </Typography>
                              <Typography variant="caption" sx={LEFT_PANEL_META_SX}>
                                {option.jobName} • Project {option.projectId}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      }}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      {selectedJobOptions.map((job) => (
                        <Tooltip
                          key={job.id}
                          title={`${job.jobName} • Project ${job.projectId}`}
                          arrow
                        >
                          <Chip
                            size="medium"
                            label={job.id}
                            onDelete={() => handleRemoveComparedJob(job.id)}
                            sx={leftPanelTagSx}
                          />
                        </Tooltip>
                      ))}
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              <Accordion
                disableGutters
                expanded={activeSidebarSection === 'metrics'}
                onChange={handleSidebarSectionToggle('metrics')}
                sx={{
                  boxShadow: 'none',
                  borderTop: '1px solid #e2e8f0',
                  borderBottom: activeSidebarSection === 'metrics' ? '1px solid #e2e8f0' : 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderRadius: 0,
                  mb: 1.5,
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  sx={{
                    px: 1.5,
                    alignItems: 'center',
                    '& .MuiAccordionSummary-content': {
                      my: 1,
                      display: 'flex',
                      alignItems: 'center',
                    },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="subtitle1"
                      sx={LEFT_PANEL_SECTION_LABEL_SX}
                    >
                      Metrics
                    </Typography>
                    {activeSidebarSection !== 'metrics' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
                        {selectedMetricLabels.length ? (
                          selectedMetricLabels.map((metric) => (
                            <Chip
                              key={metric.metric}
                              size="medium"
                              label={metric.label}
                              sx={leftPanelTagSx}
                            />
                          ))
                        ) : (
                          <Chip size="medium" label="No metric selected" sx={leftPanelTagSx} />
                        )}
                      </Box>
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2, pt: 1, pb: 1.75 }}>
                  <Stack spacing={1.75}>
                    <TextField
                      value={metricSearchInput}
                      onChange={(event) => setMetricSearchInput(event.target.value)}
                      placeholder="Search metrics or categories"
                      size="small"
                      InputProps={{
                        startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1, fontSize: 20 }} />,
                      }}
                    />

                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          ...LEFT_PANEL_SUBLABEL_SX,
                          display: 'block',
                          px:1.5,
                          mb: 0.75,
                        }}
                      >
                        Selected Metrics:
                      </Typography>
                      <Box sx={{ px:1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {selectedMetricLabels.length ? (
                          selectedMetricLabels.map((metric) => (
                            <Chip
                              key={metric.metric}
                              size="medium"
                              label={metric.label}
                              onDelete={() => handleToggleSelectedMetric(metric.metric)}
                              sx={leftPanelTagSx}
                            />
                          ))
                        ) : (
                          <Chip size="medium" label="No metric selected" sx={leftPanelTagSx} />
                        )}
                      </Box>
                    </Box>

                    <Box>
                      {pinnedMetrics.length > 0 && (
                        <Box
                          sx={{
                            borderTop: '1px solid #e2e8f0',
                            borderBottom: '1px solid #e2e8f0',
                            py: 1,
                            mb: 0.5,
                          }}
                        >
                          <Box sx={{ px: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <PushPinIcon sx={{ color: '#94a3b8', fontSize: 14, flexShrink: 0 }} />
                            <Typography variant="subtitle2" sx={LEFT_PANEL_SUBLABEL_SX}>
                              Pinned Metrics
                            </Typography>
                          </Box>
                          {pinnedMetrics.map((metric) => {
                            const optionValue = metric.availableAlias ?? metric.metricId;

                            return (
                              <FormControlLabel
                                key={metric.metricId}
                                value={optionValue}
                                control={
                                  <Checkbox
                                    size="small"
                                    checked={selectedMetrics.includes(optionValue)}
                                    onChange={() => handleToggleSelectedMetric(optionValue)}
                                  />
                                }
                                sx={{
                                  alignItems: 'flex-start',
                                  mx: 0,
                                  my: 0.25,
                                  px: 1.5,
                                  '&:hover .metric-pin-button, &:hover .metric-availability-dot': {
                                    opacity: 1,
                                  },
                                }}
                                label={
                                  <Box
                                    sx={{
                                      py: 0.25,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 1,
                                      width: '100%',
                                    }}
                                  >
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography variant="body2" sx={LEFT_PANEL_OPTION_LABEL_SX}>
                                        {metric.label}
                                      </Typography>
                                      <Typography variant="caption" sx={LEFT_PANEL_META_SX}>
                                        {metric.categoryTitle}
                                      </Typography>
                                    </Box>
                                    <Box
                                      sx={{
                                        ml: 'auto',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-end',
                                        gap: 0.5,
                                        minWidth: 36,
                                        flexShrink: 0,
                                      }}
                                    >
                                      <IconButton
                                        className="metric-pin-button"
                                        size="small"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          handleTogglePinnedMetric(metric.metricId);
                                        }}
                                        sx={{ p: 0.5, opacity: 0, transition: 'opacity 0.16s ease' }}
                                      >
                                        <PushPinIcon sx={{ fontSize: 16, color: '#000000' }} />
                                      </IconButton>
                                      <Box
                                        className="metric-availability-dot"
                                        sx={{
                                          width: 8,
                                          height: 8,
                                          borderRadius: '50%',
                                          bgcolor: metric.isAvailable ? '#16a34a' : 'transparent',
                                          flexShrink: 0,
                                          opacity: 0,
                                          transition: 'opacity 0.16s ease',
                                        }}
                                      />
                                    </Box>
                                  </Box>
                                }
                              />
                            );
                          })}
                        </Box>
                      )}

                      {filteredMetricGroups.map((category) => (
                        <Accordion
                          key={category.id}
                          disableGutters
                          expanded={expandedCategories.includes(category.id)}
                          onChange={handleMetricCategoryToggle(category.id)}
                          sx={{
                            boxShadow: 'none',
                            border: '1px solid #e2e8f0',
                            borderRadius: 2,
                            bgcolor: '#ffffff',
                            overflow: 'hidden',
                            mb: 1,
                            '&:before': { display: 'none' },
                          }}
                        >
                          <AccordionSummary
                            expandIcon={<ExpandMoreIcon />}
                            sx={{
                              px: 1.75,
                              py: 0.25,
                              flexDirection: 'row-reverse',
                              '& .MuiAccordionSummary-content': {
                                my: 1,
                              },
                              '& .MuiAccordionSummary-expandIconWrapper': {
                                mr: 1,
                              },
                            }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography variant="subtitle2" sx={LEFT_PANEL_SUBLABEL_SX}>
                                  {category.title}
                                </Typography>
                              </Box>
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails
                            sx={{
                              px: 1.5,
                              pt: 0,
                              pb: 1.25,
                              display: category.id === 'power-usage' ? 'flex' : 'block',
                              flexDirection: category.id === 'power-usage' ? 'column' : undefined,
                              alignItems: category.id === 'power-usage' ? 'stretch' : undefined,
                            }}
                          >
                            {category.metrics.map((metric) => {
                              const optionValue = metric.availableAlias ?? metric.metricId;
                              const isPinned = pinnedMetricIds.includes(metric.metricId);

                              return (
                                <FormControlLabel
                                  key={metric.metricId}
                                  value={optionValue}
                                  control={
                                    <Checkbox
                                      size="small"
                                      checked={selectedMetrics.includes(optionValue)}
                                      onChange={() => handleToggleSelectedMetric(optionValue)}
                                    />
                                  }
                                  sx={{
                                    alignItems: 'flex-start',
                                    display: 'flex',
                                    width: '100%',
                                    mx: 0,
                                    my: 0.25,
                                    '&:hover .metric-pin-button, &:hover .metric-availability-dot': {
                                      opacity: 1,
                                    },
                                  }}
                                  label={
                                    <Box
                                      sx={{
                                        py: 0.25,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 1,
                                        width: '100%',
                                      }}
                                    >
                                      <Typography variant="body2" sx={LEFT_PANEL_OPTION_LABEL_SX}>
                                        {metric.label}
                                      </Typography>
                                      <Box
                                        sx={{
                                          ml: 'auto',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'flex-end',
                                          gap: 0.5,
                                          minWidth: 36,
                                          flexShrink: 0,
                                        }}
                                      >
                                        <IconButton
                                          className="metric-pin-button"
                                          size="small"
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            handleTogglePinnedMetric(metric.metricId);
                                          }}
                                          sx={{ p: 0.5, opacity: isPinned ? 1 : 0, transition: 'opacity 0.16s ease' }}
                                        >
                                          {isPinned ? (
                                            <PushPinIcon sx={{ fontSize: 16, color: '#0f766e' }} />
                                          ) : (
                                            <PushPinOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                                          )}
                                        </IconButton>
                                        <Box
                                          className="metric-availability-dot"
                                          sx={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            bgcolor: metric.isAvailable ? '#16a34a' : 'transparent',
                                            flexShrink: 0,
                                            opacity: 0,
                                            transition: 'opacity 0.16s ease',
                                          }}
                                        />
                                      </Box>
                                    </Box>
                                  }
                                />
                              );
                            })}
                          </AccordionDetails>
                        </Accordion>
                      ))}
                    </Box>

                    {!filteredMetricGroups.length && (
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          border: '1px dashed #cbd5e1',
                          bgcolor: '#f8fafc',
                        }}
                      >
                        <Typography variant="body2" sx={LEFT_PANEL_OPTION_LABEL_SX}>
                          No metrics match this filter
                        </Typography>
                        <Typography variant="caption" sx={LEFT_PANEL_META_SX}>
                          Try clearing the search.
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </AccordionDetails>
              </Accordion>

              <Accordion
                disableGutters
                expanded={activeSidebarSection === 'data-sampling'}
                onChange={handleSidebarSectionToggle('data-sampling')}
                sx={{
                  boxShadow: 'none',
                  borderTop: '1px solid #e2e8f0',
                  borderBottom:
                    activeSidebarSection === 'data-sampling' ? '1px solid #e2e8f0' : 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderRadius: 0,
                  mb: 1.5,
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  sx={{
                    px: 1.5,
                    alignItems: 'center',
                    '& .MuiAccordionSummary-content': {
                      my: 1,
                      display: 'flex',
                      alignItems: 'center',
                    },
                  }}
                >
                  <Box
                    sx={{
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 0.75,
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      sx={LEFT_PANEL_SECTION_LABEL_SX}
                    >
                      Data Sampling
                    </Typography>
                    {activeSidebarSection !== 'data-sampling' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          size="medium"
                          label={downsamplingFunctionLabelByValue[downsamplingFunction]}
                          sx={leftPanelTagSx}
                        />
                        <Chip
                          size="medium"
                          label={downsamplingWindowLabel}
                          sx={leftPanelTagSx}
                        />
                      </Box>
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2, pt: 1, pb: 1.75 }}>
                  <Stack spacing={1}>
                    {/* <Accordion
                      disableGutters
                      expanded={isAggregationExpanded}
                      onChange={(_event, expanded) => setIsAggregationExpanded(expanded)}
                      sx={{
                        boxShadow: 'none',
                        borderTop: '1px solid #e2e8f0',
                        borderBottom: '1px solid #e2e8f0',
                        borderLeft: 'none',
                        borderRight: 'none',
                        borderRadius: 0,
                        bgcolor: 'transparent',
                        mt: '-1px',
                        '&:before': { display: 'none' },
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        sx={{
                          px: 1.5,
                          flexDirection: 'row-reverse',
                          '& .MuiAccordionSummary-content': {
                            my: 1,
                            display: 'block',
                          },
                          '& .MuiAccordionSummary-expandIconWrapper': {
                            mr: 1,
                          },
                        }}
                      >
                        <Box
                          sx={{
                            minWidth: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 0.75,
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Data Aggregation
                          </Typography>
                          {!isAggregationExpanded && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Chip
                                size="medium"
                                label={granularityLabelByValue[granularity]}
                                sx={leftPanelTagSx}
                              />
                              <Chip
                                size="medium"
                                label={aggregationLabelByValue[aggregation]}
                                sx={leftPanelTagSx}
                              />
                            </Box>
                          )}
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.25 }}>
                        <Stack spacing={2}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Granularity</InputLabel>
                            <Select
                              label="Granularity"
                              value={granularity}
                              onChange={(event) => setGranularity(event.target.value)}
                            >
                              <MenuItem value="job-level">Job level</MenuItem>
                              <MenuItem value="node-level">Node level</MenuItem>
                              <MenuItem value="gpu-level">GPU level</MenuItem>
                            </Select>
                          </FormControl>

                          <FormControl fullWidth size="small">
                            <InputLabel>Aggregation Level</InputLabel>
                            <Select
                              label="Aggregation Level"
                              value={aggregation}
                              onChange={(event) => setAggregation(event.target.value)}
                            >
                              <MenuItem value="mean">Mean over GPUs (Intra Node)</MenuItem>
                              <MenuItem value="sum_gpus">Sum over GPUs (Intra Node)</MenuItem>
                              <MenuItem value="average">Mean over Nodes</MenuItem>
                              <MenuItem value="sum_nodes">Sum over Nodes</MenuItem>
                            </Select>
                          </FormControl>
                        </Stack>
                      </AccordionDetails>
                    </Accordion> */}

                    <Accordion
                      disableGutters
                      expanded={isDownsamplingExpanded}
                      onChange={(_event, expanded) => setIsDownsamplingExpanded(expanded)}
                      sx={{
                        boxShadow: 'none',
                        border: '1px solid #e2e8f0',
                        borderRadius: 2,
                        bgcolor: '#ffffff',
                        overflow: 'hidden',
                        '&:before': { display: 'none' },
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        sx={{
                          px: 1.75,
                          py: 0.25,
                          flexDirection: 'row-reverse',
                          '& .MuiAccordionSummary-content': {
                            my: 1,
                            display: 'block',
                          },
                          '& .MuiAccordionSummary-expandIconWrapper': {
                            mr: 1,
                            alignSelf: 'center',
                          },
                        }}
                      >
                        <Box
                          sx={{
                            minWidth: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 0.75,
                          }}
                        >
                          <Typography variant="subtitle2" sx={LEFT_PANEL_SUBLABEL_SX}>
                            Data Downsampling
                          </Typography>
                          {!isDownsamplingExpanded && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Chip
                                size="medium"
                                label={downsamplingFunctionLabelByValue[downsamplingFunction]}
                                sx={leftPanelTagSx}
                              />
                              <Chip
                                size="medium"
                                label={downsamplingWindowLabel}
                                sx={leftPanelTagSx}
                              />
                            </Box>
                          )}
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.25 }}>
                        <Stack spacing={2}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Downsampling Function</InputLabel>
                            <Select
                              label="Downsampling Function"
                              value={downsamplingFunction}
                              onChange={(event) => setDownsamplingFunction(event.target.value)}
                            >
                              <MenuItem value="median">Median</MenuItem>
                              <MenuItem value="mean">Mean</MenuItem>
                              <MenuItem value="max">Max</MenuItem>
                              <MenuItem value="min">Min</MenuItem>
                            </Select>
                          </FormControl>

                          <Stack direction="row" spacing={1.25}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Window"
                              type="number"
                              value={downsamplingWindowValue}
                              onChange={(event) =>
                                setDownsamplingWindowValue(
                                  Math.max(1, Number(event.target.value) || 1)
                                )
                              }
                              inputProps={{ min: 1 }}
                            />

                            <FormControl fullWidth size="small">
                              <InputLabel>Unit</InputLabel>
                              <Select
                                label="Unit"
                                value={downsamplingWindowUnit}
                                onChange={(event) => setDownsamplingWindowUnit(event.target.value)}
                              >
                                <MenuItem value="sec">sec</MenuItem>
                                <MenuItem value="min">min</MenuItem>
                                <MenuItem value="hour">hour</MenuItem>
                              </Select>
                            </FormControl>
                          </Stack>
                        </Stack>
                      </AccordionDetails>
                    </Accordion>

                    <Accordion
                      disableGutters
                      expanded={isFocusExpanded}
                      onChange={(_event, expanded) => setIsFocusExpanded(expanded)}
                      sx={{
                        boxShadow: 'none',
                        border: '1px solid #e2e8f0',
                        borderRadius: 2,
                        bgcolor: '#ffffff',
                        overflow: 'hidden',
                        '&:before': { display: 'none' },
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        sx={{
                          px: 1.75,
                          py: 0.25,
                          flexDirection: 'row-reverse',
                          '& .MuiAccordionSummary-content': {
                            my: 1,
                            display: 'block',
                          },
                          '& .MuiAccordionSummary-expandIconWrapper': {
                            mr: 1,
                            alignSelf: 'center',
                          },
                        }}
                      >
                        <Box
                          sx={{
                            minWidth: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 0.75,
                          }}
                        >
                          <Typography variant="subtitle2" sx={LEFT_PANEL_SUBLABEL_SX}>
                            Data Focus
                          </Typography>
                          
                          {!isFocusExpanded && (hasFocusedNodes || hasCustomRelativeFocusWindow) && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              {hasCustomRelativeFocusWindow && (
                                <Chip
                                  size="medium"
                                  label={`${commonRelativeFocusWindow[0]}% - ${commonRelativeFocusWindow[1]}%`}
                                  sx={leftPanelTagSx}
                                />
                              )}
                              {hasFocusedNodes && (
                                <Chip
                                  size="medium"
                                  label="Selected nodes"
                                  sx={leftPanelTagSx}
                                />
                              )}
                            </Box>
                          )}
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.25 }}>
                        <Stack spacing={2}>

                          <Stack spacing={1.5}>
                            {focusableJobOptions.map((job) => {
                              const nodesForJob = nodeOptionsByJob[job.id] ?? [];
                              const selectedNodes = focusNodesByJob[job.id] ?? [];
                              const searchableNodes = nodesForJob.filter(
                                (node) => !selectedNodes.includes(node)
                              );

                              return (
                                <Box
                                  key={job.id}
                                  sx={{
                                    p: 1.25,
                                    borderRadius: 2,
                                    border: '1px solid #e2e8f0',
                                    bgcolor: '#f8fafc',
                                  }}
                                >
                                  <Stack spacing={1.25}>
                                    <Box>
                                      <Typography variant="body2" sx={LEFT_PANEL_OPTION_LABEL_SX}>
                                        {job.jobName}
                                      </Typography>
                                      <Typography variant="caption" sx={LEFT_PANEL_META_SX}>
                                        Job ID {job.id} • Project {job.projectId}
                                      </Typography>
                                    </Box>

                                    <Autocomplete
                                      size="small"
                                      options={searchableNodes}
                                      value={null}
                                      inputValue={nodeSearchInputByJob[job.id] ?? ''}
                                      onInputChange={(_event, value) =>
                                        setNodeSearchInputByJob((current) => ({
                                          ...current,
                                          [job.id]: value,
                                        }))
                                      }
                                      onChange={(_event, value) => handleNodeAdd(job.id, value)}
                                      renderInput={(params) => (
                                        <TextField
                                          {...params}
                                          label="Search Nodes"
                                          placeholder="Find a node to add"
                                        />
                                      )}
                                    />

                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                      {selectedNodes.length ? (
                                        selectedNodes.map((node) => (
                                          <Chip
                                            key={node}
                                            size="medium"
                                            label={node}
                                            onDelete={() => handleNodeRemove(job.id, node)}
                                            sx={leftPanelTagSx}
                                          />
                                        ))
                                      ) : null}
                                    </Box>
                                  </Stack>
                                </Box>
                              );
                            })}
                          </Stack>

                          <Box
                            sx={{
                              p: 1.25,
                              borderRadius: 2,
                              border: '1px solid #e2e8f0',
                              bgcolor: '#f8fafc',
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                ...LEFT_PANEL_SUBLABEL_SX,
                                display: 'block',
                                mb: 1,
                              }}
                            >
                              Relative Time Window
                            </Typography>
                            <Slider
                              value={commonRelativeFocusWindow}
                              onChange={(_event, value) =>
                                handleRelativeFocusWindowChange(value as number[])
                              }
                              valueLabelDisplay="auto"
                              valueLabelFormat={(value) => `${value}%`}
                              step={5}
                              min={0}
                              max={100}
                              disableSwap
                            />
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                mt: 0.5,
                              }}
                            >
                              <Typography variant="caption" sx={LEFT_PANEL_META_SX}>
                                Start {commonRelativeFocusWindow[0]}%
                              </Typography>
                              <Typography variant="caption" sx={LEFT_PANEL_META_SX}>
                                End {commonRelativeFocusWindow[1]}%
                              </Typography>
                            </Box>
                          </Box>
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </Box>

            <Box
              sx={{
                position: 'sticky',
                bottom: 0,
                p: 2,
                borderTop: '1px solid #e2e8f0',
                bgcolor: '#ffffff',
              }}
            >
              <Button
                fullWidth
                variant="contained"
                sx={{ textTransform:'none', letterSpacing:0.5, fontSize: '1rem', fontWeight: 600, height: 44, bgcolor: '#0b2e63' }}
                onClick={() => setComparedJobs(selectedJobs)}
              >
                Analyze
              </Button>
            </Box>
          </Paper>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Paper elevation={0} sx={{ p: 2, boxShadow: 'none' }}>
            <Stack spacing={3}>
              <Accordion
                disableGutters
                expanded={isJobMetadataExpanded}
                onChange={(_event, expanded) => setIsJobMetadataExpanded(expanded)}
                sx={{
                  boxShadow: 'none',
                  border: '1px solid #e2e8f0',
                  borderRadius: 0,
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  sx={{
                    px: 2,
                    minHeight: 56,
                    flexDirection: 'row-reverse',
                    justifyContent: 'flex-end',
                    gap: 1,
                    '& .MuiAccordionSummary-content': {
                      my: 1.25,
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: 2,
                    },
                    '& .MuiAccordionSummary-expandIconWrapper': {
                      mr: 0,
                    },
                  }}
                >
                  <ExpandMoreIcon
                    sx={{
                      color: COLOR_TOKENS.textSecondary,
                      transform: isJobMetadataExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 150ms ease',
                    }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" sx={SECTION_TITLE_SX}>
                      Job details
                    </Typography>
                    <Typography variant="body2" sx={{ color: COLOR_TOKENS.textSecondary }}>
                      {comparedJobMetadataRows.length} compared{' '}
                      {comparedJobMetadataRows.length === 1 ? 'job' : 'jobs'}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
                  <TableContainer
                    sx={{
                      border: '1px solid #e2e8f0',
                      bgcolor: '#ffffff',
                    }}
                  >
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={JOB_METADATA_HEADER_CELL_SX}>Job ID</TableCell>
                          <TableCell sx={JOB_METADATA_HEADER_CELL_SX}>Job Name</TableCell>
                          <TableCell sx={JOB_METADATA_HEADER_CELL_SX}>Job Status</TableCell>
                          <TableCell sx={JOB_METADATA_HEADER_CELL_SX}>Run Time</TableCell>
                          <TableCell sx={JOB_METADATA_HEADER_CELL_SX}>Wait Time</TableCell>
                          <TableCell sx={JOB_METADATA_HEADER_CELL_SX}>QOS</TableCell>
                          <TableCell sx={JOB_METADATA_HEADER_CELL_SX}>No. of Nodes</TableCell>
                          <TableCell sx={JOB_METADATA_HEADER_CELL_SX}>Node Charge Hours</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {comparedJobMetadataRows.length ? (
                          comparedJobMetadataRows.map((job) => (
                            <TableRow key={job.jobId} hover>
                              <TableCell sx={{ ...JOB_METADATA_BODY_CELL_SX, fontWeight: 600 }}>
                                {job.jobId}
                              </TableCell>
                              <TableCell sx={JOB_METADATA_BODY_CELL_SX}>{job.jobName}</TableCell>
                              <TableCell sx={JOB_METADATA_BODY_CELL_SX}>
                                <Chip
                                  label={formatJobStatusLabel(job.jobStatus)}
                                  size="small"
                                  sx={{
                                    height: 24,
                                    fontWeight: 500,
                                    color: getJobStatusTone(job.jobStatus).color,
                                    bgcolor: getJobStatusTone(job.jobStatus).backgroundColor,
                                    border: `1px solid ${getJobStatusTone(job.jobStatus).borderColor}`,
                                    '& .MuiChip-label': {
                                      px: 1,
                                    },
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={JOB_METADATA_BODY_CELL_SX}>{job.runTime}</TableCell>
                              <TableCell sx={JOB_METADATA_BODY_CELL_SX}>{job.waitTime}</TableCell>
                              <TableCell sx={JOB_METADATA_BODY_CELL_SX}>{job.qos}</TableCell>
                              <TableCell sx={JOB_METADATA_BODY_CELL_SX}>{job.nodeCount}</TableCell>
                              <TableCell sx={JOB_METADATA_BODY_CELL_SX}>{job.nodeChargeHours}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={8} sx={JOB_METADATA_BODY_CELL_SX}>
                              <Typography variant="body2" sx={{ color: COLOR_TOKENS.textSecondary }}>
                                No jobs selected for comparison.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </AccordionDetails>
              </Accordion>
              
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    flexWrap: 'wrap',
                  }}
                >
                  <Typography variant="body1" sx={{ color: '#475569' }}>
                    Comparing {comparedJobs.length} jobs over {selectedMetrics.length}{' '}
                    selected {selectedMetrics.length === 1 ? 'metric' : 'metrics'}
                  </Typography>
                </Box>
             

              {metricComparisonSections.length ? (
                <Stack spacing={2.5}>
                  {metricComparisonSections.map((section) => {
                    const isExpanded = expandedMetricSections[section.metric] ?? true;

                    return (
                      <Paper
                        key={section.metric}
                        elevation={0}
                        sx={{
                          p: 2,
                          bgcolor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          boxShadow: 'none',
                        }}
                      >
                        <Box
                          sx={{ ...SECTION_TOGGLE_SX, mb: isExpanded ? 2 : 0 }}
                          onClick={() => handleMetricSectionToggle(section.metric)}
                        >
                          <IconButton size="small">
                            {isExpanded ? <ExpandMoreIcon /> : <KeyboardArrowRightIcon />}
                          </IconButton>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="h6"
                              sx={{ ...SECTION_TITLE_SX}}
                            >
                              {section.label}
                            </Typography>
                          </Box>
                        </Box>

                        <Collapse in={isExpanded}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'flex-end',
                              mb: 2,
                            }}
                          >
                            <FormControl size="small" sx={{ minWidth: 260 }}>
                              <InputLabel>Granularity</InputLabel>
                              <Select
                                label="Granularity"
                                value={section.granularity}
                                onChange={(event) =>
                                  handlePlotAggregationChange(section.metric, event.target.value)
                                }
                              >
                                <MenuItem value="job-level">
                                  Job level (median across nodes)
                                </MenuItem>
                                <MenuItem value="node-level">
                                  Node level (median across GPUs)
                                </MenuItem>
                                {section.isGpuMetric && (
                                  <MenuItem value="gpu-level">
                                    gpu level (no aggregation)
                                  </MenuItem>
                                )}
                              </Select>
                            </FormControl>
                          </Box>

                          <Box
                            sx={{
                              p: 2,
                              bgcolor: '#f8fafc',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <Plot
                              data={section.traces as any}
                              layout={{
                                autosize: true,
                                height: 390,
                                margin: { l: 70, r: 30, t: 20, b: 50 },
                                xaxis: {
                                  title: 'Relative Time',
                                  ticksuffix: '%',
                                  range: [0, 100],
                                  tick0: 0,
                                  dtick: 20,
                                  gridcolor: '#e2e8f0',
                                },
                                yaxis: { title: section.label, gridcolor: '#e2e8f0' },
                                paper_bgcolor: '#f8fafc',
                                plot_bgcolor: '#f8fafc',
                                legend: { x: 1.02, y: 1, xanchor: 'left' },
                              }}
                              config={{ responsive: true, displayModeBar: false }}
                              style={{ width: '100%' }}
                            />
                          </Box>

                          <Divider sx={{ mt: 2, mb: 1.5 }} />

                          <TableContainer>
                            <Table>
                              <TableHead>
                                <TableRow>
                                  <TableCell sx={{ fontWeight: 700 }}>Jobs</TableCell>
                                  <TableCell sx={{ fontWeight: 700 }}>
                                    {section.label} Mean
                                  </TableCell>
                                  <TableCell sx={{ fontWeight: 700 }}>
                                    {section.label} Avg
                                  </TableCell>
                                  <TableCell sx={{ fontWeight: 700 }}>
                                    {section.label} Min
                                  </TableCell>
                                  <TableCell sx={{ fontWeight: 700 }}>
                                    {section.label} Max
                                  </TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {section.summaryRows.map((row) => (
                                  <TableRow key={row.jobId}>
                                    <TableCell>{row.jobId}</TableCell>
                                    <TableCell>{formatValue(row.mean)}</TableCell>
                                    <TableCell>{formatValue(row.avg)}</TableCell>
                                    <TableCell>{formatValue(row.min)}</TableCell>
                                    <TableCell>{formatValue(row.max)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Collapse>
                      </Paper>
                    );
                  })}
                </Stack>
              ) : (
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    bgcolor: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    boxShadow: 'none',
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 700, color: COLOR_TOKENS.textPrimary }}>
                    Select one or more metrics
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#475569', mt: 0.5 }}>
                    Charts and tables will appear here for every selected metric.
                  </Typography>
                </Paper>
              )}
            </Stack>
          </Paper>
        </Box>
      </Box>
      </Container>
    </Box>
  );
}

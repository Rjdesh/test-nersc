import { createFileRoute, Link as RouterLink, useNavigate } from '@tanstack/react-router';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Container,
  Paper,
  Typography,
  Grid,
  Button,
  Alert,
  AlertTitle,
  Link,
  Breadcrumbs,
  Divider,
  Stack,
} from '@mui/material';
import { useState, useEffect, useMemo } from 'react';
import { useDetailQuery } from '../../hooks/useDetailQuery';
import { useDataFromSource } from '../../hooks/useDataFromSource';
import { cleanPath } from '../../utils/queryParams.utils';
import Plot from 'react-plotly.js';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  buildRecentJobPerformanceRows,
  findUserJobMetadataById,
  type IrisJobData,
  type JobGridRow,
  type LegacyUserJobData,
} from './-controllers/recentJobPerformance.controller';
import {
  fetchJobMetricsSummary,
  type JobMetricsSummary,
  readLoadedJobMetricsBrowserCache,
  readLoadedJobsBrowserCache,
  readSelectedUserBrowserCache,
} from '../../utils/userJobPerformanceLoadedJobs';

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
  nersc_ldms_dcgm_cpu_utilization?: number | string | null;
  nersc_ldms_dcgm_gr_engine_active?: number | string | null;
  nersc_ldms_dcgm_gpu_utilization?: number | string | null;
  nersc_ldms_cpu_utilization?: number | string | null;
  nersc_ldms_dcgm_fb_used?: number | string | null;
  [key: string]: unknown;
}

interface JobMetricsExport {
  job_id?: number | string;
  data?: JobExportMetricRow[];
  [key: string]: JobExportMetricRow[] | string | number | null | undefined;
}

type JobMetricsCacheSource = JobMetricsExport | JobExportMetricRow[];

type JobMetadata = Partial<LegacyUserJobData & IrisJobData> & {
  'Job ID'?: number;
  Project?: string;
  QOS?: string;
};

const COLOR_TOKENS = {
  pageBg: '#ffffff',
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

const NODE_TRACE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#0f766e',
  '#dc2626',
  '#64748b',
];

const TITLE_SX = {
  fontWeight: 700,
  color: COLOR_TOKENS.textPrimary,
  letterSpacing: '-0.01em',
};

const SECTION_TITLE_SX = {
  fontWeight: 700,
  color: COLOR_TOKENS.textPrimary,
};

const SUBSECTION_TITLE_SX = {
  fontWeight: 700,
  color: COLOR_TOKENS.textPrimary,
  fontSize: '0.95rem',
};

const ACTION_LINK_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.75,
  color: COLOR_TOKENS.link,
  fontWeight: 500,
  textDecoration: 'none',
};

const SIDE_PANEL_LABEL_SX = { color: '#475569', fontWeight: 700 };
const SIDE_PANEL_VALUE_SX = { color: '#111827', fontWeight: 500 };

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

const buildExecutionTimeTicks = (traces: Array<{ x?: unknown }>) => {
  const xValues = traces.flatMap((trace) => (
    Array.isArray(trace.x) ? trace.x : []
  )).map(Number).filter(Number.isFinite);
  const maxTime = Math.max(0, ...xValues);
  const tickValues = [0, 0.25, 0.5, 0.75, 1].map((fraction) => maxTime * fraction);

  return {
    range: [0, Math.max(1, maxTime)],
    tickText: tickValues.map(formatExecutionTime),
    tickValues,
  };
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

const getLocalDataSourcePath = (dataSource: string) => {
  const base = document.querySelector('base')?.getAttribute('href') ?? '';
  const basePath = import.meta.env.VITE_BASE_URL || '';
  const leadingSlash = basePath ? '/' : '';
  const basename = cleanPath(leadingSlash + base + basePath);

  return cleanPath(`${basename}/${dataSource}`);
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
  const energyConsumed =
    selectedJob?.energyConsumed ??
    toFiniteNumber(metadata?.['Energy consumed']);
  const jobStatus =
    selectedJob?.jobStatus ??
    metadata?.['Job Status'] ??
    metadata?.State ??
    'N/A';

  return [
    { label: 'Submit time', value: formatJobDateTime(submitTime) },
    { label: 'Start time', value: formatJobDateTime(startTime) },
    { label: 'End time', value: formatJobDateTime(endTime) },
    { label: 'Wait time', value: selectedJob?.waitTime ?? 'N/A' },
    { label: 'Run time', value: duration },
    {
      label: 'Job status',
      value: jobStatus,
      variant: 'status' as const,
    },
    {
      label: 'Energy consumed',
      value: energyConsumed === null ? 'N/A' : `${formatNumber(energyConsumed)} J`,
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

/**
 * Detail view for a selected job from the User Job Performance page.
 */
function JobPerformanceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

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
  const loadedJobCacheEntries = useMemo(() => readLoadedJobsBrowserCache(), []);
  const [loadedJobMetricsCacheEntries, setLoadedJobMetricsCacheEntries] = useState(
    () => readLoadedJobMetricsBrowserCache()
  );
  const [jobMetricsSummaryStatus, setJobMetricsSummaryStatus] = useState<
    'idle' | 'loading' | 'success' | 'failed'
  >('idle');
  const [jobMetricsSummaryError, setJobMetricsSummaryError] = useState<string | null>(null);
  const jobRows = useMemo(
    () => buildRecentJobPerformanceRows({
      legacyJobs: userJobsData,
      irisJobs: irisJobsData,
      loadedJobs: loadedJobCacheEntries.map((entry) => entry.job),
      metricsByJob,
    }),
    [irisJobsData, loadedJobCacheEntries, metricsByJob, userJobsData]
  );
  const selectedJob = useMemo(
    () => jobRows.find((job) => job.id === id) ?? null,
    [id, jobRows]
  );
  const selectedJobMetricsSummary = useMemo(
    () => loadedJobMetricsCacheEntries.find((entry) => entry.jobId === id)?.summary ?? null,
    [id, loadedJobMetricsCacheEntries]
  );
  const selectedLoadedJobCacheEntry = useMemo(
    () => loadedJobCacheEntries.find((entry) => entry.jobId === id) ?? null,
    [id, loadedJobCacheEntries]
  );
  const metadata = useMemo(
    () =>
      (detailData as JobMetadata | undefined) ??
      findUserJobMetadataById(
        id,
        userJobsData,
        irisJobsData,
        loadedJobCacheEntries.map((entry) => entry.job)
      ),
    [detailData, id, irisJobsData, loadedJobCacheEntries, userJobsData]
  );
  const pageJobId = selectedJob?.jobId ?? metadata?.['Job ID'] ?? id;
  const pageProject = selectedJob?.projectId ?? metadata?.Project ?? 'N/A';
  const jobDetailItems = useMemo(
    () => buildJobDetailItems(selectedJob, metadata),
    [metadata, selectedJob]
  );
  const jobDetailColumns = useMemo(() => {
    const midpoint = Math.ceil(jobDetailItems.length / 2);

    return [
      jobDetailItems.slice(0, midpoint),
      jobDetailItems.slice(midpoint),
    ];
  }, [jobDetailItems]);
  const selectedJobUsesRealData = selectedJob?.dataSource === 'real';
  const jobMetricsExport = useJobMetricsExport(id);
  const gpuUtilizationChartData = buildNodeUtilizationChartData(
    'gpu',
    metricsByJob,
    id,
    jobMetricsExport,
    selectedJobMetricsSummary
  );
  const powerData = buildCpuPowerChartData(selectedJobMetricsSummary, {
    allowFallback: !selectedJobUsesRealData,
  });
  const isJobMetricsSummaryLoading =
    selectedJobUsesRealData && !selectedJobMetricsSummary && jobMetricsSummaryStatus !== 'failed';
  const cpuPowerErrorMessage = jobMetricsSummaryError ?? selectedJobMetricsSummary?.error ?? null;
  const cpuPowerStatusMessage = selectedJobUsesRealData
    ? cpuPowerErrorMessage ??
      (!isJobMetricsSummaryLoading && !powerData.length
        ? 'No CPU power samples were returned for this loaded job.'
        : null)
    : null;
  const cpuPowerPlotData = cpuPowerStatusMessage ? [] : powerData;
  const gpuExecutionTimeTicks = buildExecutionTimeTicks(gpuUtilizationChartData);
  const powerExecutionTimeTicks = buildExecutionTimeTicks(cpuPowerPlotData);

  useEffect(() => {
    let isActive = true;

    if (!selectedJob?.jobId || selectedJob.dataSource !== 'real' || selectedJobMetricsSummary) {
      return () => {
        isActive = false;
      };
    }

    setJobMetricsSummaryStatus('loading');
    setJobMetricsSummaryError(null);
    fetchJobMetricsSummary(selectedJob.jobId, {
      machineId: typeof selectedLoadedJobCacheEntry?.job.machine === 'string'
        ? selectedLoadedJobCacheEntry.job.machine
        : undefined,
      userId: readSelectedUserBrowserCache() || (
        typeof selectedLoadedJobCacheEntry?.job.user === 'string'
          ? selectedLoadedJobCacheEntry.job.user
          : undefined
      ),
    })
      .then(() => {
        if (!isActive) {
          return;
        }

        setLoadedJobMetricsCacheEntries(readLoadedJobMetricsBrowserCache());
        setJobMetricsSummaryError(null);
        setJobMetricsSummaryStatus('success');
      })
      .catch((error: unknown) => {
        if (isActive) {
          setJobMetricsSummaryError(error instanceof Error ? error.message : String(error));
          setJobMetricsSummaryStatus('failed');
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedJob, selectedJobMetricsSummary, selectedLoadedJobCacheEntry]);

  if (!selectedJob && !metadata) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: COLOR_TOKENS.pageBg, minHeight: '100vh', pb: 4 }}>
      <Box
        sx={{
          width: '100%',
          px: 3,
          py: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: 'linear-gradient(90deg, #ffffff 0%, #55cff2 10%, #ffffff 100%)',
          borderBottom: '1px solid #E8E8E8',
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
            color: '#1B4684',
            fontWeight: 400,
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 4,
              right: 4,
              bottom: 0,
              height: 3,
              borderRadius: 999,
              bgcolor: '#1B4684',
            },
          }}
        >
          Jobs
        </Box>
      </Box>

      <Container maxWidth="xl" sx={{ mt: 3 }}>
        {/* Page Header */}
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Box sx={{ mb: 3 }}>
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
                  Job details
                </Typography>
              </Breadcrumbs>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Typography variant="h4" sx={{ ...TITLE_SX, mb: 2 }}>
                  {pageJobId} ({pageProject})
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          {/* Main Content */}
          <Grid item xs={12} md>
            {/* Job Details Table */}
            <Paper
              id="job-details"
              elevation={0}
              sx={{ p: 2, mb: 3, scrollMarginTop: '80px' }}
            >
              <Typography variant="h6" sx={{ ...SECTION_TITLE_SX, mb: 2 }}>
                Job Details
              </Typography>
              <Grid container columnSpacing={{ xs: 1.5, md: 8 }} rowSpacing={1.5}>
                {jobDetailColumns.map((column, columnIndex) => (
                  <Grid item xs={12} md={6} key={`job-detail-column-${columnIndex}`}>
                    <Stack spacing={1.25} divider={<Divider />}>
                      {column.map((item) => (
                        <Box
                          key={item.label}
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: {
                              xs: 'minmax(120px, max-content) minmax(0, 1fr)',
                              sm: 'minmax(150px, max-content) minmax(0, 1fr)',
                            },
                            columnGap: 2,
                            alignItems: 'flex-start',
                          }}
                        >
                          <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>
                            {item.label}
                          </Typography>
                          {item.variant === 'status' ? (
                            <Chip
                              label={formatJobStatusLabel(String(item.value))}
                              size="small"
                              sx={{
                                justifySelf: 'start',
                                height: 24,
                                fontWeight: 500,
                                color: getJobStatusTone(String(item.value)).color,
                                bgcolor: getJobStatusTone(String(item.value)).backgroundColor,
                                border: `1px solid ${getJobStatusTone(String(item.value)).borderColor}`,
                                '& .MuiChip-label': {
                                  px: 1,
                                },
                              }}
                            />
                          ) : (
                            <Typography
                              variant="body2"
                              sx={{
                                ...SIDE_PANEL_VALUE_SX,
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {item.value}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  </Grid>
                ))}
              </Grid>
            </Paper>
            <Divider sx={{ mb: 3 }} />

            <Accordion
              id="gpu-throughput"
              defaultExpanded
              elevation={0}
              disableGutters
              sx={{
                mb: 3,
                scrollMarginTop: '80px',
                '&::before': { display: 'none' },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls="performance-summary-content"
                id="performance-summary-header"
                sx={{
                  px: 1,
                  py: 2,
                  flexDirection: 'row-reverse',
                  justifyContent: 'flex-end',
                  gap: 1,
                  minHeight: 'auto',
                  '& .MuiAccordionSummary-content': { my: 0, flex: 1 },
                  '& .MuiAccordionSummary-expandIconWrapper': {
                    mr: 0,
                  },
                }}
              >
                <Box sx={{ alignItems: 'center', display: 'flex', gap: 2, justifyContent: 'space-between', width: '100%' }}>
                  <Typography variant="h6" sx={SECTION_TITLE_SX}>
                    Performance Summary
                  </Typography>
                  <Button
                    variant="contained"
                    endIcon={<ArrowForwardIcon />}
                    size="medium"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate({
                        to: '/user-job-performance-alphaver/compare',
                        search: { jobIds: String(pageJobId), source: 'job-details' },
                      });
                    }}
                    onFocus={(event) => event.stopPropagation()}
                    sx={{
                      textTransform: 'none',
                      bgcolor: '#1a2f5a',
                      color: '#ffffff',
                      flexShrink: 0,
                      '&:hover': {
                        bgcolor: '#132341',
                        color: '#ffffff',
                      },
                    }}
                  >
                    View Performance Details
                  </Button>
                </Box>
              </AccordionSummary>
              <AccordionDetails
                id="performance-summary-content"
                sx={{ px: 4, pt: 0, pb: 4 }}
              >
                <Typography
                  id="insights"
                  variant="subtitle1"
                  sx={{ ...SUBSECTION_TITLE_SX, mb: 2, scrollMarginTop: '80px' }}
                >
                  Insights and Hints
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
                        Learn about Power Capping{' '}
                        <ArrowForwardIcon fontSize="small" />
                      </Link>
                    </Alert>
                  </Grid>
                </Grid>
                <Box sx={{ mt: 5 }} />
                <Typography variant="subtitle1" sx={{ ...SUBSECTION_TITLE_SX, mb: 2 }}>
                 Performance Charts
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <Box
                      sx={{
                        height: '100%',
                        p: 2,
                        border: '1px solid #e2e8f0',
                        borderRadius: 1,
                        bgcolor: '#ffffff',
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ ...SECTION_TITLE_SX, mb: 2 }}>
                        GPU Utilization by Node
                      </Typography>
                      <Plot
                        data={gpuUtilizationChartData as any}
                        layout={{
                          autosize: true,
                          height: 320,
                          margin: { l: 55, r: 20, t: 20, b: 50 },
                          xaxis: {
                            title: 'Execution Time',
                            range: gpuExecutionTimeTicks.range,
                            tickvals: gpuExecutionTimeTicks.tickValues,
                            ticktext: gpuExecutionTimeTicks.tickText,
                          },
                          yaxis: {
                            title: 'Utilization %',
                            autorange: false,
                            range: [0, 100],
                            ticksuffix: '%',
                            tickvals: [0, 25, 50, 75, 100],
                          },
                          legend: {
                            orientation: 'h',
                            x: 0.5,
                            y: 1.12,
                            xanchor: 'center',
                          },
                          hovermode: 'x unified',
                        }}
                        config={{ responsive: true, displayModeBar: false }}
                        style={{ width: '100%' }}
                      />
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box
                      sx={{
                        height: '100%',
                        p: 2,
                        border: '1px solid #e2e8f0',
                        borderRadius: 1,
                        bgcolor: '#ffffff',
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ ...SECTION_TITLE_SX, mb: 2 }}>
                        CPU Power by Node
                      </Typography>
                      {cpuPowerStatusMessage && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                          {cpuPowerStatusMessage}
                        </Alert>
                      )}
                      <Plot
                        data={cpuPowerPlotData}
                        layout={{
                          autosize: true,
                          height: 320,
                          margin: { l: 55, r: 20, t: 20, b: 50 },
                          xaxis: {
                            title: 'Execution Time',
                            range: powerExecutionTimeTicks.range,
                            showline: true,
                            showticklabels: true,
                            ticks: 'outside',
                            tickvals: powerExecutionTimeTicks.tickValues,
                            ticktext: powerExecutionTimeTicks.tickText,
                          },
                          yaxis: {
                            title: 'Power (W)',
                          },
                          legend: {
                            orientation: 'h',
                            x: 0.5,
                            y: 1.12,
                            xanchor: 'center',
                          },
                          hovermode: 'x unified',
                        }}
                        config={{ responsive: true, displayModeBar: false }}
                        style={{ width: '100%' }}
                      />
                    </Box>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
            <Divider sx={{ mb: 3 }} />

          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const parseExportTimestampMs = (timestamp?: unknown) => {
  if (timestamp === undefined || timestamp === null || timestamp === '') {
    return null;
  }

  if (typeof timestamp === 'number') {
    if (!Number.isFinite(timestamp)) {
      return null;
    }

    return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  }

  if (typeof timestamp !== 'string') {
    return null;
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

const normalizeUtilizationValue = (value: unknown) => {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return null;
  }

  return clampPercent(Math.abs(numericValue) <= 1 ? numericValue * 100 : numericValue);
};

const buildFallbackCpuUtilizationSeries = (timeAxis: number[]) => (
  timeAxis.map((time, index) =>
    clampPercent(28 + 14 * Math.sin(time / 18) + (index % 5) * 1.8)
  )
);

const normalizeFlooredRelativeTimeAxis = (timeAxis: number[]) => {
  if (timeAxis.length <= 1) {
    return timeAxis.map(() => 0);
  }

  const finiteValues = timeAxis.filter((value) => Number.isFinite(value));

  if (!finiteValues.length) {
    return timeAxis.map(() => 0);
  }

  const elapsedTimeValues = finiteValues.map(toExecutionTimeMs);
  const minTime = Math.min(...elapsedTimeValues);
  const maxTime = Math.max(...elapsedTimeValues);
  const span = maxTime - minTime;

  if (!Number.isFinite(span) || span <= 0) {
    const denominator = Math.max(1, timeAxis.length - 1);

    return timeAxis.map((_, index) => (index / denominator) * 1000);
  }

  return timeAxis.map((time) => Math.max(0, toExecutionTimeMs(time) - minTime));
};

const normalizeFlooredRelativeTimeValues = (timeAxis: number[]) => {
  const normalizedAxis = normalizeFlooredRelativeTimeAxis(timeAxis);

  return timeAxis.map((time, index) => [time, normalizedAxis[index]] as const);
};

const getNodeLabel = (row: Record<string, unknown>) => {
  const rawNode =
    row.hostname ??
    row.Hostname ??
    row.node ??
    row.nid ??
    row.host;

  return typeof rawNode === 'string' && rawNode.trim()
    ? rawNode.trim()
    : 'Node aggregate';
};

const getNormalizedUtilizationMetricValue = (
  row: Record<string, unknown>,
  aliases: string[]
) => {
  for (const alias of aliases) {
    const value = normalizeUtilizationValue(row[alias]);

    if (value !== null) {
      return value;
    }
  }

  return null;
};

const getMetricValue = (
  row: Record<string, unknown>,
  aliases: string[],
  scale = 1
) => {
  for (const alias of aliases) {
    const value = toFiniteNumber(row[alias]);

    if (value !== null) {
      return value * scale;
    }
  }

  return null;
};

const buildNodeMetricTracesFromPoints = (
  points: Array<{ nodeLabel: string; time: number; value: number }>,
  metricLabel: string,
  options: { color?: string; unit?: string; valueFormat?: string; valueSuffix?: string } = {}
) => {
  if (!points.length) {
    return [];
  }

  const normalizedTimeByRawTime = new Map(
    normalizeFlooredRelativeTimeValues(points.map((point) => point.time))
  );
  const pointsByNode = points.reduce<Record<string, Array<{ x: number; y: number }>>>(
    (groups, point) => {
    const x = normalizedTimeByRawTime.get(point.time) ?? 0;

      return {
        ...groups,
        [point.nodeLabel]: [
          ...(groups[point.nodeLabel] ?? []),
          { x, y: point.value },
        ],
      };
    },
    {}
  );

  return Object.entries(pointsByNode).map(([nodeLabel, nodePoints], index) => ({
    x: nodePoints.map((point) => point.x),
    y: nodePoints.map((point) => point.y),
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: nodeLabel,
    showlegend: true,
    line: {
      color: options.color ?? NODE_TRACE_COLORS[index % NODE_TRACE_COLORS.length],
      width: 2,
    },
    customdata: nodePoints.map((point) => formatExecutionTime(point.x)),
    hovertemplate: `- %{fullData.name}, ${metricLabel}: %{y:${options.valueFormat ?? '.1f'}}${options.valueSuffix ?? ''}${options.unit ? ` ${options.unit}` : ''}<br>Execution Time: %{customdata}<extra></extra>`,
  }));
};

const buildNodeMetricTracesFromRows = (
  rows: Record<string, unknown>[],
  aliases: string[],
  metricLabel: string,
  options: { scale?: number; unit?: string; valueSuffix?: string } = {}
) => {
  const groupedPoints = rows.reduce<
    Record<string, Array<{ nodeLabel: string; timestampMs: number; value: number }>>
  >((groups, row) => {
    const timestampMs = parseExportTimestampMs(row.timestamp);
    const value = getMetricValue(row, aliases, options.scale);

    if (timestampMs === null || value === null) {
      return groups;
    }

    const nodeLabel = getNodeLabel(row);
    const pointKey = `${nodeLabel}-${timestampMs}`;

    return {
      ...groups,
      [pointKey]: [
        ...(groups[pointKey] ?? []),
        { nodeLabel, timestampMs, value },
      ],
    };
  }, {});
  const averagedPoints = Object.values(groupedPoints).map((rowsAtTime) => ({
    nodeLabel: rowsAtTime[0].nodeLabel,
    time: rowsAtTime[0].timestampMs,
    value: rowsAtTime.reduce((sum, row) => sum + row.value, 0) / rowsAtTime.length,
  }));

  return buildNodeMetricTracesFromPoints(averagedPoints, metricLabel, {
    unit: options.unit,
    valueSuffix: options.valueSuffix,
  });
};

const buildNodeUtilizationTracesFromRows = (
  rows: Record<string, unknown>[],
  aliases: string[],
  metricLabel: string
) => {
  const groupedPoints = rows.reduce<
    Record<string, Array<{ nodeLabel: string; timestampMs: number; value: number }>>
  >((groups, row) => {
    const timestampMs = parseExportTimestampMs(row.timestamp);
    const value = getNormalizedUtilizationMetricValue(row, aliases);

    if (timestampMs === null || value === null) {
      return groups;
    }

    const nodeLabel = getNodeLabel(row);
    const pointKey = `${nodeLabel}-${timestampMs}`;

    return {
      ...groups,
      [pointKey]: [
        ...(groups[pointKey] ?? []),
        { nodeLabel, timestampMs, value },
      ],
    };
  }, {});
  const averagedPoints = Object.values(groupedPoints).map((rowsAtTime) => ({
    nodeLabel: rowsAtTime[0].nodeLabel,
    time: rowsAtTime[0].timestampMs,
    value: rowsAtTime.reduce((sum, row) => sum + row.value, 0) / rowsAtTime.length,
  }));

  return buildNodeMetricTracesFromPoints(averagedPoints, metricLabel, {
    valueFormat: metricLabel === 'GPU utilization' ? '.3f' : '.1f',
    valueSuffix: '%',
  });
};

function buildNodeUtilizationChartData(
  metric: 'cpu' | 'gpu',
  metricsByJob: MetricsByJob | undefined,
  jobId: string,
  jobMetricsExport?: JobMetricsExport,
  fetchedMetricsSummary?: JobMetricsSummary | null
) {
  const metricLabel = metric === 'cpu' ? 'CPU utilization' : 'GPU utilization';
  const metricAliases = metric === 'cpu'
    ? ['nersc_ldms_dcgm_cpu_utilization', 'nersc_ldms_cpu_utilization']
    : ['nersc_ldms_dcgm_gr_engine_active', 'nersc_ldms_dcgm_gpu_utilization'];
  const cachedGpuSeries = metric === 'gpu'
    ? fetchedMetricsSummary?.series?.gpuUtilization ?? []
    : [];
  const cachedRows = metric === 'gpu'
    ? fetchedMetricsSummary?.records?.gpuUtilization ?? []
    : [];

  const cachedRecordTraces = buildNodeUtilizationTracesFromRows(
    cachedRows,
    metricAliases,
    metricLabel
  );

  if (cachedRecordTraces.length) {
    return cachedRecordTraces;
  }

  if (cachedGpuSeries.length) {
    const timeAxis = normalizeFlooredRelativeTimeAxis(
      cachedGpuSeries.map((point) => point.x)
    );

    return [
      {
        x: timeAxis,
        y: cachedGpuSeries.map((point) => point.y),
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Node aggregate',
        showlegend: true,
        line: { color: COLOR_TOKENS.gpu, width: 2 },
        customdata: timeAxis.map(formatExecutionTime),
        hovertemplate: '- %{fullData.name}, GPU utilization: %{y:.3f}%<br>Execution Time: %{customdata}<extra></extra>',
      },
    ];
  }

  const exportTraces = buildNodeUtilizationTracesFromRows(
    getJobMetricsExportRows(jobMetricsExport),
    metricAliases,
    metricLabel
  );

  if (exportTraces.length) {
    return exportTraces;
  }

  const metricRows = [...(metricsByJob?.[jobId] ?? [])].sort(
    (left, right) => (
      Number(left['Floored Relative Time']) - Number(right['Floored Relative Time'])
    )
  );
  const timeAxis = metricRows.length
    ? normalizeFlooredRelativeTimeAxis(
        metricRows.map((row) => Number(row['Floored Relative Time']))
      )
    : Array.from({ length: 50 }, (_, index) => index * 2);
  const metricSeries = metricRows.length
    ? metricRows.map((row) => (
        getNormalizedUtilizationMetricValue(row, metricAliases) ?? 0
      ))
    : timeAxis.map((time, index) =>
        metric === 'cpu'
          ? buildFallbackCpuUtilizationSeries(timeAxis)[index]
          : clampPercent(30 + 20 * Math.sin(time / 12) + (index % 5) * 2)
      );

  return [
    {
      x: timeAxis,
      y: metricSeries,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Node aggregate',
      showlegend: true,
      line: { color: metric === 'cpu' ? COLOR_TOKENS.cpu : COLOR_TOKENS.gpu, width: 2 },
      customdata: timeAxis.map(formatExecutionTime),
      hovertemplate: `- %{fullData.name}, ${metricLabel}: %{y:${metric === 'gpu' ? '.3f' : '.1f'}}%<br>Execution Time: %{customdata}<extra></extra>`,
    },
  ];
}

function buildCpuPowerChartData(
  fetchedMetricsSummary?: JobMetricsSummary | null,
  options: { allowFallback?: boolean } = {}
) {
  const cachedCpuPowerRows = fetchedMetricsSummary?.records?.cpuPower ?? [];
  const cachedCpuPowerSeries = fetchedMetricsSummary?.series?.cpuPower ?? [];
  const cachedCpuPowerTraces = buildNodeMetricTracesFromRows(
    cachedCpuPowerRows,
    ['cpu_power'],
    'CPU power',
    { scale: 1, unit: 'W' }
  );

  if (cachedCpuPowerTraces.length) {
    return cachedCpuPowerTraces;
  }

  if (cachedCpuPowerSeries.length) {
    const timeAxis = normalizeFlooredRelativeTimeAxis(
      cachedCpuPowerSeries.map((point) => point.x)
    );

    return [
      {
        x: timeAxis,
        y: cachedCpuPowerSeries.map((point) => point.y),
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'CPU aggregate',
        showlegend: true,
        line: { color: COLOR_TOKENS.cpu, width: 2 },
        customdata: timeAxis.map(formatExecutionTime),
        hovertemplate: '- %{fullData.name}, CPU power: %{y:.1f} W<br>Execution Time: %{customdata}<extra></extra>',
      },
    ];
  }

  if (!options.allowFallback) {
    return [];
  }

  const timePoints = Array.from({ length: 50 }, (_, i) => i * 2000);

  return [
    {
      x: timePoints,
      y: timePoints.map(() => Number((35 + Math.random() * 10).toFixed(1))),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'CPU aggregate',
      showlegend: true,
      line: { color: COLOR_TOKENS.cpu, width: 2 },
      customdata: timePoints.map(formatExecutionTime),
      hovertemplate: '- %{fullData.name}, CPU power: %{y:.1f} W<br>Execution Time: %{customdata}<extra></extra>',
    },
  ];
}

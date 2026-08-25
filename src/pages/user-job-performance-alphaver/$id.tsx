import { createFileRoute, Link as RouterLink } from '@tanstack/react-router';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
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
  buildComputePerformanceSnapshot,
  buildRecentJobPerformanceRows,
  findUserJobMetadataById,
  getJobPerformanceSummary,
  type ComputeMetricsByJob,
  type IrisJobData,
  type JobGridRow,
  type LegacyUserJobData,
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

const PERFORMANCE_SNAPSHOT_ROWS = [
  { key: 'gpuUtilization', label: 'Avg. GPU utilization', unit: '%' },
  { key: 'cpuUtilization', label: 'Avg. CPU utilization', unit: '%' },
  { key: 'gpuMemoryBandwidth', label: 'Avg. GPU Memory Bandwidth', unit: '%' },
  { key: 'cpuMemoryBandwidth', label: 'Avg. CPU Memory Bandwidth', unit: '%' },
] as const;

const POWER_CONSUMPTION_ROWS = [
  { key: 'nodePower', label: 'Avg. Node Power', unit: 'W' },
  { key: 'cpuPower', label: 'Avg. CPU Power', unit: 'W' },
  { key: 'gpuPower', label: 'Avg. GPU Power', unit: 'W' },
  { key: 'memoryPower', label: 'Avg. Memory Power', unit: 'W' },
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

function PerformanceSummaryMetrics({
  snapshot,
  powerConsumption,
}: {
  snapshot: PerformanceSnapshot;
  powerConsumption: PowerConsumptionSummary;
}) {
  const metrics = [
    ...PERFORMANCE_SNAPSHOT_ROWS.map((row) => ({
      label: row.label,
      value: formatSnapshotValue(snapshot[row.key].avg, row.unit),
    })),
    ...POWER_CONSUMPTION_ROWS.map((row) => ({
      label: row.label,
      value: formatSnapshotValue(powerConsumption[row.key], row.unit),
    })),
  ];
  const midpoint = Math.ceil(metrics.length / 2);
  const columns = [metrics.slice(0, midpoint), metrics.slice(midpoint)];

  return (
    <Grid container columnSpacing={{ xs: 1.5, md: 8 }} rowSpacing={1.5}>
      {columns.map((column, columnIndex) => (
        <Grid item xs={12} md={6} key={`performance-summary-column-${columnIndex}`}>
          <Stack spacing={1.25} divider={<Divider />}>
            {column.map((item) => (
              <Box
                key={item.label}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'minmax(120px, max-content) minmax(0, 1fr)',
                    sm: 'minmax(190px, max-content) minmax(0, 1fr)',
                  },
                  columnGap: 2,
                  alignItems: 'flex-start',
                }}
              >
                <Typography variant="body2" sx={SIDE_PANEL_LABEL_SX}>
                  {item.label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    ...SIDE_PANEL_VALUE_SX,
                    fontVariantNumeric: 'tabular-nums',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.value}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
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

/**
 * Detail view for a selected job from the User Job Performance page.
 */
function JobPerformanceDetailPage() {
  const { id } = Route.useParams();

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
  const utilizationChartData = buildUtilizationChartData(
    metricsByJob,
    id,
    jobMetricsExport
  );
  const powerData = generatePowerData();

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
                          <Typography
                            variant="body2"
                            sx={{
                              ...SIDE_PANEL_VALUE_SX,
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {item.value}
                          </Typography>
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
                  '& .MuiAccordionSummary-content': { my: 0 },
                  '& .MuiAccordionSummary-expandIconWrapper': {
                    mr: 0,
                  },
                }}
              >
                <Typography variant="h6" sx={SECTION_TITLE_SX}>
                  Performance Summary
                </Typography>
              </AccordionSummary>
              <AccordionDetails
                id="performance-summary-content"
                sx={{ px: 4, pt: 0, pb: 4 }}
              >
                <Typography variant="subtitle1" sx={{ ...SUBSECTION_TITLE_SX, mb: 2 }}>
                  Metrics
                </Typography>
                {performanceSummary && computePerformanceSnapshot && powerConsumptionSummary ? (
                  <PerformanceSummaryMetrics
                    snapshot={computePerformanceSnapshot}
                    powerConsumption={powerConsumptionSummary}
                  />
                ) : (
                  <Typography variant="body2" sx={{ color: COLOR_TOKENS.textSecondary }}>
                    Loading performance summary...
                  </Typography>
                )}
                <Box sx={{ mt: 5 }} />
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
                        CPU & GPU Utilization
                      </Typography>
                      <Plot
                        data={utilizationChartData as any}
                        layout={{
                          autosize: true,
                          height: 320,
                          margin: { l: 55, r: 20, t: 20, b: 50 },
                          xaxis: {
                            title: 'Floored Relative Time (s)',
                          },
                          yaxis: {
                            title: 'Utilization %',
                            range: [0, 100],
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
                        Power
                      </Typography>
                      <Plot
                        data={powerData}
                        layout={{
                          autosize: true,
                          height: 320,
                          margin: { l: 55, r: 20, t: 20, b: 50 },
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
                <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 3 }}>
                  <Button
                    component={RouterLink}
                    to="/user-job-performance-alphaver/compare"
                    variant="contained"
                    endIcon={<ArrowForwardIcon />}
                    size="medium"
                    sx={{
                      textTransform: 'none',
                      bgcolor: '#1a2f5a',
                      color: '#ffffff',
                      '&:hover': {
                        bgcolor: '#132341',
                        color: '#ffffff',
                      },
                    }}
                  >
                    View Performance Report
                  </Button>
                </Box>
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

function buildUtilizationChartData(
  metricsByJob: MetricsByJob | undefined,
  jobId: string,
  jobMetricsExport?: JobMetricsExport
) {
  const exportRows = getJobMetricsExportRows(jobMetricsExport)
    .map((row) => {
      const timestampMs = parseExportTimestampMs(row.timestamp);
      const gpuValue = normalizeUtilizationValue(
        row.nersc_ldms_dcgm_gr_engine_active ??
          row.nersc_ldms_dcgm_gpu_utilization
      );

      return timestampMs === null || gpuValue === null
        ? null
        : { timestampMs, gpuValue };
    })
    .filter((row): row is { timestampMs: number; gpuValue: number } => row !== null)
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (exportRows.length) {
    const firstTimestampMs = exportRows[0].timestampMs;
    const timeAxis = exportRows.map((row) => (row.timestampMs - firstTimestampMs) / 1000);

    return [
      {
        x: timeAxis,
        y: buildFallbackCpuUtilizationSeries(timeAxis),
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'CPU',
        line: { color: COLOR_TOKENS.cpu, width: 2 },
      },
      {
        x: timeAxis,
        y: exportRows.map((row) => row.gpuValue),
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: 'GPU',
        line: { color: COLOR_TOKENS.gpu, width: 2 },
        marker: { size: 5 },
      },
    ];
  }

  const metricRows = [...(metricsByJob?.[jobId] ?? [])].sort(
    (left, right) => left['Floored Relative Time'] - right['Floored Relative Time']
  );
  const timeAxis = metricRows.length
    ? metricRows.map((row) => row['Floored Relative Time'])
    : Array.from({ length: 50 }, (_, index) => index * 2);
  const cpuSeries = metricRows.map((row) =>
    normalizeUtilizationValue(
      row.nersc_ldms_dcgm_cpu_utilization ?? row.nersc_ldms_cpu_utilization
    )
  );
  const hasCpuSeries = cpuSeries.some((value) => value !== null);
  const gpuSeries = metricRows.length
    ? metricRows.map((row) =>
        normalizeUtilizationValue(row.nersc_ldms_dcgm_gpu_utilization) ?? 0
      )
    : timeAxis.map((time, index) =>
        clampPercent(30 + 20 * Math.sin(time / 12) + (index % 5) * 2)
      );

  return [
    {
      x: timeAxis,
      y: hasCpuSeries
        ? cpuSeries.map((value) => value ?? 0)
        : buildFallbackCpuUtilizationSeries(timeAxis),
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

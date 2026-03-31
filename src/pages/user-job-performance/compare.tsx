import { createFileRoute, Link as RouterLink } from '@tanstack/react-router';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Stack,
  Switch,
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
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { SyntheticEvent, useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { useDataFromSource } from '../../hooks/useDataFromSource';

export const Route = createFileRoute('/user-job-performance/compare')({
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
  'Job Name'?: string;
  'Start Time'?: string;
  'End Time'?: string;
  'Hostname'?: string;
  'Charged Node Hours'?: number;
}

type MetricsByJob = Record<string, MetricRow[]>;

interface JobOption {
  id: string;
  jobName: string;
  projectId: string;
  searchText: string;
}

interface MetricDefinition {
  label: string;
  aliases: string[];
}

interface MetricCategory {
  id: string;
  title: string;
  metrics: MetricDefinition[];
}

interface CuratedMetric extends MetricDefinition {
  categoryId: string;
  categoryTitle: string;
  metricId: string;
  searchText: string;
  availableAlias: string | undefined;
  isAvailable: boolean;
}

interface FocusTimeWindow {
  start: string;
  end: string;
}

type RelativeFocusWindow = [number, number];

const formatMetricName = (metric: string) =>
  metric.replace('nersc_ldms_dcgm_', '').replace(/_/g, ' ');

const toDateTimeLocalValue = (value?: string) => (value ? value.replace(' ', 'T') : '');

const formatValue = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 3 });
const DUMMY_JOB_COUNT = 5;
const SYNTHETIC_PROJECT_IDS = ['m842', 'm984', 'm2137', 'm5560', 'm7781'] as const;
const METRIC_CATEGORIES: MetricCategory[] = [
  {
    id: 'efficiency-snapshot',
    title: 'Efficiency Snapshot',
    metrics: [
      { label: 'GPU Utilization (%)', aliases: ['nersc_ldms_dcgm_gpu_utilization'] },
      { label: 'GPU Memory footprint: FB Used, FB Free', aliases: ['nersc_ldms_dcgm_fb_used', 'nersc_ldms_dcgm_fb_free'] },
      { label: 'GPU Memory Bandwidth Utilization (%)', aliases: ['nersc_ldms_dcgm_dram_active'] },
      { label: 'CPU Utilization (%)', aliases: ['nersc_ldms_dcgm_cpu_utilization', 'nersc_ldms_cpu_utilization'] },
      { label: 'CPU Host Memory Usage', aliases: ['nersc_ldms_cpu_host_memory_usage', 'nersc_ldms_mem_used'] },
      { label: 'CPU Memory Bandwidth', aliases: ['nersc_ldms_cpu_memory_bandwidth'] },
    ],
  },
  {
    id: 'gpu-compute',
    title: 'More GPU Compute Metrics',
    metrics: [
      { label: 'GPU SM Active (%)', aliases: ['nersc_ldms_dcgm_sm_active'] },
      { label: 'GPU Tensor Active (%)', aliases: ['nersc_ldms_dcgm_tensor_active'] },
      { label: 'GPU Tensor HMMA Active', aliases: ['nersc_ldms_dcgm_tensor_hmma_active'] },
      { label: 'GPU Tensor IMMA Active', aliases: ['nersc_ldms_dcgm_tensor_imma_active'] },
      { label: 'GPU FP16 Active', aliases: ['nersc_ldms_dcgm_fp16_active'] },
      { label: 'GPU FP32 Active', aliases: ['nersc_ldms_dcgm_fp32_active'] },
      { label: 'GPU FP64 Active', aliases: ['nersc_ldms_dcgm_fp64_active'] },
    ],
  },
  {
    id: 'power-usage',
    title: 'Power Usage',
    metrics: [
      { label: 'GPU Power', aliases: ['nersc_ldms_dcgm_power_usage'] },
      { label: 'CPU Power', aliases: ['nersc_ldms_cpu_power'] },
      { label: 'Node Power', aliases: ['nersc_ldms_node_power'] },
      { label: 'Memory Power', aliases: ['nersc_ldms_memory_power'] },
      { label: 'Total GPU Energy Consumed', aliases: ['nersc_ldms_dcgm_total_energy_consumption', 'nersc_ldms_dcgm_energy_consumption'] },
    ],
  },
  {
    id: 'communication-network',
    title: 'Communication / Network Metrics',
    metrics: [
      { label: 'PCIe Throughput (MB/s)', aliases: ['nersc_ldms_dcgm_pcie_tx_throughput', 'nersc_ldms_dcgm_pcie_rx_throughput'] },
      { label: 'NVLink Throughput (GB/s)', aliases: ['nersc_ldms_dcgm_nvlink_tx_throughput', 'nersc_ldms_dcgm_nvlink_rx_throughput'] },
      { label: 'Internode Network Throughput', aliases: ['nersc_ldms_network_throughput', 'nersc_ldms_internode_network_throughput'] },
      { label: 'NIC Utilization Balance', aliases: ['nersc_ldms_nic_utilization_balance'] },
      { label: 'NIC Throughput (Packets/sec)', aliases: ['nersc_ldms_nic_throughput_packets_sec', 'nersc_ldms_nic_packets_per_sec'] },
    ],
  },
];

function CompareJobsPage() {
  const metricsByJob = useDataFromSource(
    'data/user-job-performance/metrics-data.json'
  ) as MetricsByJob | undefined;
  const userJobs = useDataFromSource(
    'data/user-job-performance/user-jobs.json'
  ) as UserJobData[] | undefined;

  const [machine, setMachine] = useState('perlmutter gpu');
  const [jobSearchInput, setJobSearchInput] = useState('');
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [comparedJobs, setComparedJobs] = useState<string[]>([]);
  const [selectedMetric, setSelectedMetric] = useState('');
  const [granularity, setGranularity] = useState('job-level');
  const [aggregation, setAggregation] = useState('mean');
  const [downsamplingFunction, setDownsamplingFunction] = useState('mean');
  const [downsamplingWindow, setDownsamplingWindow] = useState('1 min');
  const [useRelativeFocusWindow, setUseRelativeFocusWindow] = useState(false);
  const [focusNodesByJob, setFocusNodesByJob] = useState<Record<string, string[]>>({});
  const [focusTimeWindowByJob, setFocusTimeWindowByJob] = useState<Record<string, FocusTimeWindow>>({});
  const [relativeFocusWindowByJob, setRelativeFocusWindowByJob] = useState<Record<string, RelativeFocusWindow>>({});
  const [metricSearchInput, setMetricSearchInput] = useState('');
  const [pinnedMetricIds, setPinnedMetricIds] = useState<string[]>([]);
  const [isAggregationExpanded, setIsAggregationExpanded] = useState(false);
  const [isDownsamplingExpanded, setIsDownsamplingExpanded] = useState(false);
  const [isFocusExpanded, setIsFocusExpanded] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['efficiency-snapshot']);

  const allMetricsByJob = useMemo(() => {
    if (!metricsByJob) {
      return undefined;
    }

    const entries = Object.entries(metricsByJob);
    if (!entries.length) {
      return metricsByJob;
    }

    const numericIds = Object.keys(metricsByJob)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    const maxId = numericIds.length ? Math.max(...numericIds) : 100000;

    const syntheticMetricsByJob: MetricsByJob = { ...metricsByJob };
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
  }, [metricsByJob]);

  const metricNames = useMemo(() => {
    const firstSeries = allMetricsByJob
      ? allMetricsByJob[Object.keys(allMetricsByJob)[0]]
      : undefined;
    if (!firstSeries || !firstSeries.length) {
      return [];
    }
    return Object.keys(firstSeries[0]).filter(
      (key) => key !== 'Job ID' && key !== 'Floored Relative Time'
    );
  }, [allMetricsByJob]);

  const availableMetricNames = useMemo(() => new Set(metricNames), [metricNames]);

  const curatedMetricGroups = useMemo(() => {
    return METRIC_CATEGORIES.map((category) => {
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

  const jobOptions = useMemo<JobOption[]>(() => {
    if (!allMetricsByJob) {
      return [];
    }
    const metricsJobIds = Object.keys(allMetricsByJob);
    const userJobById = new Map<string, UserJobData>();
    (userJobs ?? []).forEach((job) => {
      userJobById.set(job['Job ID'].toString(), job);
    });
    return metricsJobIds.map((jobId, index) => {
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
  }, [allMetricsByJob, userJobs]);

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

  const jobMetadataById = useMemo(() => {
    const metadata = new Map<string, UserJobData>();
    (userJobs ?? []).forEach((job) => {
      metadata.set(job['Job ID'].toString(), job);
    });
    return metadata;
  }, [userJobs]);

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
      const hostname = jobMetadata?.Hostname?.trim() || 'perlmutter-gpu';
      const baseName = hostname.toLowerCase().replace(/\s+/g, '-');
      const estimatedNodeCount = Math.min(
        5,
        Math.max(2, Math.round((jobMetadata?.['Charged Node Hours'] ?? 0.75) * 4))
      );
      const nodes = Array.from({ length: estimatedNodeCount }, (_value, index) =>
        `${baseName}-node-${String(index + 1).padStart(2, '0')}`
      );

      return [job.id, nodes] as const;
    });

    return Object.fromEntries(entries);
  }, [focusableJobOptions, jobMetadataById]);

  useEffect(() => {
    if (!selectedMetric && metricNames.length) {
      setSelectedMetric(
        metricNames.find((metric) => metric.includes('power_usage')) ?? metricNames[0]
      );
    }
  }, [selectedMetric, metricNames]);

  useEffect(() => {
    if (!selectedJobs.length && jobOptions.length) {
      const defaultJobs = jobOptions.slice(0, 2).map((job) => job.id);
      setSelectedJobs(defaultJobs);
      setComparedJobs(defaultJobs);
    }
  }, [jobOptions, selectedJobs.length]);

  useEffect(() => {
    if (!focusableJobOptions.length) {
      return;
    }

    setFocusTimeWindowByJob((current) => {
      const next = { ...current };
      let changed = false;

      focusableJobOptions.forEach((job) => {
        const jobId = job.id;
        if (!next[jobId]) {
          const jobMetadata = jobMetadataById.get(jobId);
          next[jobId] = {
            start: toDateTimeLocalValue(jobMetadata?.['Start Time']),
            end: toDateTimeLocalValue(jobMetadata?.['End Time']),
          };
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [focusableJobOptions, jobMetadataById]);

  const chartTraces = useMemo(() => {
    if (!allMetricsByJob || !selectedMetric) {
      return [];
    }
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444'];
    return comparedJobs.flatMap((jobId, index) => {
        const series = allMetricsByJob[jobId];
        if (!series || !series.length) {
          return [];
        }
        const maxTime = Math.max(...series.map((row) => row['Floored Relative Time']), 1);
        return [{
          x: series.map((row) => Math.round((row['Floored Relative Time'] / maxTime) * 100)),
          y: series.map((row) => row[selectedMetric]),
          type: 'scatter' as const,
          mode: 'lines' as const,
          name: `Job ${jobId}`,
          line: { width: 2, color: colors[index % colors.length] },
        }];
      });
  }, [allMetricsByJob, comparedJobs, selectedMetric]);

  const summaryRows = useMemo(() => {
    if (!allMetricsByJob || !selectedMetric) {
      return [];
    }
    return comparedJobs.map((jobId) => {
      const values =
        (allMetricsByJob[jobId] ?? [])
          .map((row) => row[selectedMetric])
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
  }, [allMetricsByJob, comparedJobs, selectedMetric]);

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

  const handleFocusedNodesChange = (jobId: string, value: string[]) => {
    setFocusNodesByJob((current) => ({
      ...current,
      [jobId]: value,
    }));
  };

  const handleFocusTimeWindowChange = (
    jobId: string,
    field: keyof FocusTimeWindow,
    value: string
  ) => {
    setFocusTimeWindowByJob((current) => ({
      ...current,
      [jobId]: {
        start: current[jobId]?.start ?? '',
        end: current[jobId]?.end ?? '',
        [field]: value,
      },
    }));
  };

  const handleRelativeFocusWindowChange = (jobId: string, value: number[]) => {
    setRelativeFocusWindowByJob((current) => ({
      ...current,
      [jobId]: [value[0], value[1]],
    }));
  };

  const granularityLabelByValue: Record<string, string> = {
    'job-level': 'Job level',
    'node-level': 'Node level',
    'gpu-level': 'GPU level',
  };

  const aggregationLabelByValue: Record<string, string> = {
    mean: 'Mean over GPUs (Intra Node)',
    sum_gpus: 'Sum over GPUs (Intra Node)',
    average: 'Mean over Nodes',
    sum_nodes: 'Sum over Nodes',
  };

  const downsamplingFunctionLabelByValue: Record<string, string> = {
    mean: 'Mean',
    max: 'Max',
    min: 'Min',
    p95: 'P95',
  };

  const downsamplingWindowLabelByValue: Record<string, string> = {
    '1 min': '1 min',
    '5 min': '5 min',
    '15 min': '15 min',
    '30 min': '30 min',
  };

  return (
    <Box sx={{ bgcolor: '#f5f5f5', minHeight: '100vh', p: 3 }}>
      <Breadcrumbs
        separator={<NavigateNextIcon fontSize="small" />}
        sx={{ mb: 2 }}
      >
        <Link component={RouterLink} to="/center-performance" underline="hover" color="primary">
          For Users
        </Link>
        <Link component={RouterLink} to="/user-job-performance" underline="hover" color="primary">
          Your Job Performance
        </Link>
        <Typography color="text.primary">Compare Jobs</Typography>
      </Breadcrumbs>
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 3, color: '#1d2430' }}>
        Compare Jobs
      </Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={4}>
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
          </Grid>
          <Grid item xs={12} md={7}>
            <Autocomplete
              options={searchableJobOptions}
              value={null}
              inputValue={jobSearchInput}
              onInputChange={(_event, value) => setJobSearchInput(value)}
              onChange={handleJobAdd}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              getOptionLabel={(option) => `Job ${option.id} - ${option.jobName}`}
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
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {option.jobName}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                        Job ID {option.id} • Project {option.projectId}
                      </Typography>
                    </Box>
                  </Box>
                );
              }}
            />
          </Grid>
          <Grid item xs={12} md={1}>
            <Button
              fullWidth
              variant="contained"
              sx={{ textTransform: 'none', height: 40, bgcolor: '#0b2e63' }}
              onClick={() => setComparedJobs(selectedJobs)}
            >
              Compare
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {selectedJobOptions.length} jobs selected:
          </Typography>
          {selectedJobOptions.map((job) => (
            <Tooltip
              key={job.id}
              title={`Project ${job.projectId} • Job ID ${job.id}`}
              arrow
            >
              <Chip
                label={job.jobName}
                onDelete={() => handleRemoveComparedJob(job.id)}
                variant="outlined"
                sx={{ bgcolor: '#fff' }}
              />
            </Tooltip>
          ))}
        </Box>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={3} lg={2.5}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Metrics
                </Typography>
              </Box>

              <TextField
                value={metricSearchInput}
                onChange={(event) => setMetricSearchInput(event.target.value)}
                placeholder="Search metrics or categories"
                size="small"
                InputProps={{
                  startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1, fontSize: 20 }} />,
                }}
              />

              <RadioGroup
                value={selectedMetric}
                onChange={(event) => setSelectedMetric(event.target.value)}
              >
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
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Pinned Metrics
                      </Typography>
                    </Box>
                    {pinnedMetrics.map((metric) => {
                      const optionValue = metric.availableAlias ?? metric.metricId;

                      return (
                        <FormControlLabel
                          key={metric.metricId}
                          value={optionValue}
                          control={<Radio size="small" />}
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
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {metric.label}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#64748b' }}>
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
                        },
                        '& .MuiAccordionSummary-expandIconWrapper': {
                          mr: 1,
                        },
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
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
                            control={<Radio size="small" />}
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
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
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
              </RadioGroup>

              {!filteredMetricGroups.length && (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px dashed #cbd5e1',
                    bgcolor: '#f8fafc',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    No metrics match this filter
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Try clearing the search.
                  </Typography>
                </Box>
              )}

              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Controls
                </Typography>
              <Accordion
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
                          size="small"
                          label={granularityLabelByValue[granularity]}
                          sx={{
                            height: 22,
                            bgcolor: '#f1f5f9',
                            color: '#334155',
                            '& .MuiChip-label': { px: 1 },
                          }}
                        />
                        <Chip
                          size="small"
                          label={aggregationLabelByValue[aggregation]}
                          sx={{
                            height: 22,
                            bgcolor: '#f1f5f9',
                            color: '#334155',
                            '& .MuiChip-label': { px: 1 },
                          }}
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
              </Accordion>

              <Accordion
                disableGutters
                expanded={isDownsamplingExpanded}
                onChange={(_event, expanded) => setIsDownsamplingExpanded(expanded)}
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
                      Data Downsampling
                    </Typography>
                    {!isDownsamplingExpanded && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          label={downsamplingFunctionLabelByValue[downsamplingFunction]}
                          sx={{
                            height: 22,
                            bgcolor: '#f1f5f9',
                            color: '#334155',
                            '& .MuiChip-label': { px: 1 },
                          }}
                        />
                        <Chip
                          size="small"
                          label={downsamplingWindowLabelByValue[downsamplingWindow]}
                          sx={{
                            height: 22,
                            bgcolor: '#f1f5f9',
                            color: '#334155',
                            '& .MuiChip-label': { px: 1 },
                          }}
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
                        <MenuItem value="mean">Mean</MenuItem>
                        <MenuItem value="max">Max</MenuItem>
                        <MenuItem value="min">Min</MenuItem>
                      </Select>
                    </FormControl>

                    <FormControl fullWidth size="small">
                      <InputLabel>Window</InputLabel>
                      <Select
                        label="Window"
                        value={downsamplingWindow}
                        onChange={(event) => setDownsamplingWindow(event.target.value)}
                      >
                        <MenuItem value="1 min">1 min</MenuItem>
                        <MenuItem value="5 min">5 min</MenuItem>
                        <MenuItem value="15 min">15 min</MenuItem>
                        <MenuItem value="30 min">30 min</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>
                </AccordionDetails>
              </Accordion>

              <Accordion
                disableGutters
                expanded={isFocusExpanded}
                onChange={(_event, expanded) => setIsFocusExpanded(expanded)}
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
                      Data Focus
                    </Typography>
                    {!isFocusExpanded && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          label={useRelativeFocusWindow ? 'Relative time window' : 'Specific time window'}
                          sx={{
                            height: 22,
                            bgcolor: '#f1f5f9',
                            color: '#334155',
                            '& .MuiChip-label': { px: 1 },
                          }}
                        />
                        <Chip
                          size="small"
                          label={`${focusableJobOptions.length} jobs`}
                          sx={{
                            height: 22,
                            bgcolor: '#f1f5f9',
                            color: '#334155',
                            '& .MuiChip-label': { px: 1 },
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.25 }}>
                  <Stack spacing={2}>
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                      Narrow analysis for the jobs already selected on the page. Use the toggle to
                      switch between a specific time window per job or one shared relative window.
                    </Typography>

                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        py: 0.25,
                      }}
                    >
                      
                      <Switch
                        checked={useRelativeFocusWindow}
                        onChange={(event) => setUseRelativeFocusWindow(event.target.checked)}
                      />
                      <Box>
                        <Typography variant="body2">
                          Use relative time window
                        </Typography>
                      </Box>
                    </Box>

                    <Stack spacing={1.5}>
                        {focusableJobOptions.map((job) => {
                          const nodesForJob = nodeOptionsByJob[job.id] ?? [];
                          const jobTimeWindow = focusTimeWindowByJob[job.id] ?? {
                            start: '',
                            end: '',
                          };
                          const relativeFocusWindow = relativeFocusWindowByJob[job.id] ?? [25, 75];

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
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {job.jobName}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                                    Job ID {job.id} • Project {job.projectId}
                                  </Typography>
                                </Box>

                                <Autocomplete
                                  multiple
                                  size="small"
                                  options={nodesForJob}
                                  value={focusNodesByJob[job.id] ?? []}
                                  onChange={(_event, value) => handleFocusedNodesChange(job.id, value)}
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      label="Nodes"
                                      placeholder="Search or select nodes"
                                    />
                                  )}
                                />

                                {useRelativeFocusWindow ? (
                                  <Box sx={{ px: 0.5, pt: 0.25 }}>
                                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                                      Relative Time Window
                                    </Typography>
                                    <Slider
                                      value={relativeFocusWindow}
                                      onChange={(_event, value) =>
                                        handleRelativeFocusWindowChange(job.id, value as number[])
                                      }
                                      valueLabelDisplay="auto"
                                      valueLabelFormat={(value) => `${value}%`}
                                      step={5}
                                      min={0}
                                      max={100}
                                      disableSwap
                                      sx={{ mt: 1 }}
                                    />
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        mt: 0.5,
                                      }}
                                    >
                                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                                        Start {relativeFocusWindow[0]}%
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                                        End {relativeFocusWindow[1]}%
                                      </Typography>
                                    </Box>
                                  </Box>
                                ) : (
                                  <Box sx={{ px: 0.5, pt: 0.25 }}>
                                    <Grid container spacing={1.25}>
                                      <Grid item xs={12}>
                                        <TextField
                                          fullWidth
                                          size="small"
                                          label="Start Time"
                                          type="datetime-local"
                                          value={jobTimeWindow.start}
                                          onChange={(event) =>
                                            handleFocusTimeWindowChange(job.id, 'start', event.target.value)
                                          }
                                          InputLabelProps={{ shrink: true }}
                                        />
                                      </Grid>
                                      <Grid item xs={12}>
                                        <TextField
                                          fullWidth
                                          size="small"
                                          label="End Time"
                                          type="datetime-local"
                                          value={jobTimeWindow.end}
                                          onChange={(event) =>
                                            handleFocusTimeWindowChange(job.id, 'end', event.target.value)
                                          }
                                          InputLabelProps={{ shrink: true }}
                                        />
                                      </Grid>
                                    </Grid>
                                  </Box>
                                )}
                              </Stack>
                            </Box>
                          );
                        })}
                      </Stack>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={9} lg={9.5}>
          <Paper sx={{ p: 2 }}>
            <Paper sx={{ p: 2, bgcolor: '#f8fafc', mb: 3 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 0.5 }}>
                {formatMetricName(selectedMetric)}
              </Typography>
              <Typography variant="body1" sx={{ textAlign: 'center', color: '#475569', mb: 1 }}>
                Comparing {comparedJobs.length} jobs over 1 selected metric
              </Typography>
              <Plot
                data={chartTraces as any}
                layout={{
                  autosize: true,
                  height: 390,
                  margin: { l: 70, r: 30, t: 20, b: 50 },
                  xaxis: { title: 'Relative Time', ticksuffix: '%', gridcolor: '#e2e8f0' },
                  yaxis: { title: formatMetricName(selectedMetric), gridcolor: '#e2e8f0' },
                  paper_bgcolor: '#f8fafc',
                  plot_bgcolor: '#f8fafc',
                  legend: { x: 1.02, y: 1, xanchor: 'left' },
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </Paper>

            <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
              {formatMetricName(selectedMetric)} across Jobs
            </Typography>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Jobs</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {formatMetricName(selectedMetric)} Mean
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {formatMetricName(selectedMetric)} Avg
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {formatMetricName(selectedMetric)} Min
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {formatMetricName(selectedMetric)} Max
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summaryRows.map((row) => (
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
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

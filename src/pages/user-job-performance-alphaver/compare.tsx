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
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { SyntheticEvent, useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { useDataFromSource } from '../../hooks/useDataFromSource';

export const Route = createFileRoute('/user-job-performance-alphaver/compare')({
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

type RelativeFocusWindow = [number, number];

const formatMetricName = (metric: string) =>
  metric.replace('nersc_ldms_dcgm_', '').replace(/_/g, ' ');

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
  const stickySidebarTop = 24;
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
  const [plotAggregation, setPlotAggregation] = useState('none');
  const [hasInitializedSelectedMetric, setHasInitializedSelectedMetric] = useState(false);
  const [downsamplingFunction, setDownsamplingFunction] = useState('mean');
  const [downsamplingWindowValue, setDownsamplingWindowValue] = useState(15);
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
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['efficiency-snapshot']);
  const [activeSidebarSection, setActiveSidebarSection] = useState<
    'jobs' | 'metrics' | 'data-sampling' | null
  >('jobs');

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
    if (!hasInitializedSelectedMetric && !selectedMetric && metricNames.length) {
      setSelectedMetric(
        metricNames.find((metric) => metric.includes('power_usage')) ?? metricNames[0]
      );
      setHasInitializedSelectedMetric(true);
    }
  }, [hasInitializedSelectedMetric, selectedMetric, metricNames]);

  useEffect(() => {
    if (!selectedJobs.length && jobOptions.length) {
      const defaultJobs = jobOptions.slice(0, 2).map((job) => job.id);
      setSelectedJobs(defaultJobs);
      setComparedJobs(defaultJobs);
    }
  }, [jobOptions, selectedJobs.length]);

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
    mean: 'Mean',
    max: 'Max',
    min: 'Min',
    p95: 'P95',
  };

  const selectedMetricLabel = selectedMetric ? formatMetricName(selectedMetric) : '';
  const downsamplingWindowLabel = `${downsamplingWindowValue} ${downsamplingWindowUnit}`;
  const hasFocusedNodes = Object.values(focusNodesByJob).some((nodes) => nodes.length > 0);
  const hasCustomRelativeFocusWindow =
    commonRelativeFocusWindow[0] !== 0 || commonRelativeFocusWindow[1] !== 100;
  const leftPanelTagSx = {
    height: 24,
    bgcolor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    '& .MuiChip-label': {
      px: 1,
      fontWeight: 600,
    },
  };

  const handleSidebarSectionToggle =
    (section: 'jobs' | 'metrics' | 'data-sampling') =>
    (_event: SyntheticEvent, expanded: boolean) => {
      setActiveSidebarSection(expanded ? section : null);
    };

  return (
    <Box sx={{ bgcolor: '#f5f5f5', minHeight: '80vh', p: 3 }}>
      <Breadcrumbs
        separator={<NavigateNextIcon fontSize="small" />}
        sx={{ mb: 2 }}
      >
        <Link component={RouterLink} to="/center-performance" underline="hover" color="primary">
          For Users
        </Link>
        <Link component={RouterLink} to="/user-job-performance-alphaver" underline="hover" color="primary">
          Your Job Performance
        </Link>
        <Typography color="text.primary">Compare More Metrics</Typography>
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
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#1d2430' }}>
          Compare More Metrics
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
          gap: 2,
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
            sx={{
              position: { xs: 'relative', md: 'sticky' },
              top: { xs: 'auto', md: `${stickySidebarTop}px` },
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              minHeight: { xs: 'auto', md: '70vh' },
              maxHeight: { xs: 'none', md: `calc(100vh - ${stickySidebarTop}px)` },
              overflow: 'hidden',
              alignSelf: 'flex-start',
            }}
          >
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, pb: 0 }}>
              <Box sx={{ mb: 2, px: 1.5 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    color: '#475569',
                    mb: 1.25,
                  }}
                >
                  Data Controls
                </Typography>
              </Box>

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
                  bgcolor: activeSidebarSection === 'jobs' ? '#f8fafc' : 'transparent',
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
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: '#64748b',
                      }}
                    >
                      Machine & Jobs
                    </Typography>
                    {activeSidebarSection !== 'jobs' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
                        {selectedJobOptions.length ? (
                          selectedJobOptions.map((job) => (
                            <Tooltip
                              key={job.id}
                              title={`Project ${job.projectId} • Job ID ${job.id}`}
                              arrow
                            >
                              <Chip size="small" label={job.jobName} sx={leftPanelTagSx} />
                            </Tooltip>
                          ))
                        ) : (
                          <Chip size="small" label="No jobs selected" sx={leftPanelTagSx} />
                        )}
                      </Box>
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2, pt: 1, pb: 1.75 }}>
                  <Stack spacing={2.25}>
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

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
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
                  bgcolor: activeSidebarSection === 'metrics' ? '#f8fafc' : 'transparent',
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
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: '#64748b',
                      }}
                    >
                      Metrics
                    </Typography>
                    {activeSidebarSection !== 'metrics' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
                        {selectedMetricLabel ? (
                          <Chip
                            size="small"
                            label={selectedMetricLabel}
                            sx={leftPanelTagSx}
                          />
                        ) : (
                          <Chip size="small" label="No metric selected" sx={leftPanelTagSx} />
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
                          display: 'block',
                          fontWeight: 700,
                          px:1.5,
                          mb: 0.75,
                        }}
                      >
                        Selected Metric:
                      </Typography>
                      <Box sx={{ px:1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {selectedMetricLabel ? (
                          <Chip
                            size="small"
                            label={selectedMetricLabel}
                            onDelete={() => setSelectedMetric('')}
                            sx={leftPanelTagSx}
                          />
                        ) : (
                          <Chip size="small" label="No metric selected" sx={leftPanelTagSx} />
                        )}
                      </Box>
                    </Box>

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
                  bgcolor: activeSidebarSection === 'data-sampling' ? '#f8fafc' : 'transparent',
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
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: '#64748b',
                      }}
                    >
                      Data Sampling
                    </Typography>
                    {activeSidebarSection !== 'data-sampling' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          label={downsamplingFunctionLabelByValue[downsamplingFunction]}
                          sx={leftPanelTagSx}
                        />
                        <Chip
                          size="small"
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
                                size="small"
                                label={granularityLabelByValue[granularity]}
                                sx={leftPanelTagSx}
                              />
                              <Chip
                                size="small"
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
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Data Downsampling
                          </Typography>
                          {!isDownsamplingExpanded && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Chip
                                size="small"
                                label={downsamplingFunctionLabelByValue[downsamplingFunction]}
                                sx={leftPanelTagSx}
                              />
                              <Chip
                                size="small"
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
                              <MenuItem value="stddev">Std dev.</MenuItem>
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
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            Data Focus
                          </Typography>
                          
                          {!isFocusExpanded && (hasFocusedNodes || hasCustomRelativeFocusWindow) && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              {hasCustomRelativeFocusWindow && (
                                <Chip
                                  size="small"
                                  label={`${commonRelativeFocusWindow[0]}% - ${commonRelativeFocusWindow[1]}%`}
                                  sx={leftPanelTagSx}
                                />
                              )}
                              {hasFocusedNodes && (
                                <Chip
                                  size="small"
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
                                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {job.jobName}
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: '#64748b' }}>
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
                                display: 'block',
                                fontWeight: 700,
                                letterSpacing: 0.4,
                                textTransform: 'uppercase',
                                color: '#64748b',
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
                              <Typography variant="caption" sx={{ color: '#64748b' }}>
                                Start {commonRelativeFocusWindow[0]}%
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>
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
          <Paper sx={{ p: 2 }}>
            <Paper sx={{ p: 2, bgcolor: '#f8fafc', mb: 3 }}>
              <Box
                sx={{
                  mb: 1.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 2,
                  flexWrap: 'wrap',
                }}
              >
                <Box sx={{ flex: 1, minWidth: 240 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, textAlign: 'center', textTransform:'uppercase', mb: 0.5 }}>
                    {formatMetricName(selectedMetric)}
                  </Typography>
                  <Typography variant="body1" sx={{ textAlign: 'center', color: '#475569' }}>
                    Comparing {comparedJobs.length} jobs over 1 selected metric
                  </Typography>
                </Box>

                <FormControl size="small" sx={{ minWidth: 260 }}>
                  <InputLabel>Aggregate data</InputLabel>
                  <Select
                    label="Aggregate data"
                    value={plotAggregation}
                    onChange={(event) => setPlotAggregation(event.target.value)}
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="sum-gpus">Sum Over GPU(s) (Intra Node)</MenuItem>
                    <MenuItem value="sum-nodes">Sum Over Node(s)</MenuItem>
                    <MenuItem value="mean-gpus">Mean Over GPU(s) (Intra Node)</MenuItem>
                    <MenuItem value="mean-nodes">Mean Over Node(s)</MenuItem>
                  </Select>
                </FormControl>
              </Box>

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

            <Typography variant="h6" sx={{ textTransform:'uppercase', fontWeight: 700, mb: 2 }}>
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
        </Box>
      </Box>
    </Box>
  );
}

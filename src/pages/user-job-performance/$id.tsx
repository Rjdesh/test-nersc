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
} from '@mui/material';
import { useState, useEffect } from 'react';
import { useDetailQuery } from '../../hooks/useDetailQuery';
import { useDataFromSource } from '../../hooks/useDataFromSource';
import Plot from 'react-plotly.js';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import MemoryIcon from '@mui/icons-material/Memory';

export const Route = createFileRoute('/user-job-performance/$id')({
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

const COLOR_TOKENS = {
  pageBg: '#f3f4f6',
  textPrimary: '#111827',
  textSecondary: '#4b5563',
  neutralTrack: '#d1d5db',
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

/**
 * Detail view for a selected job from the User Job Performance page.
 */
function JobPerformanceDetailPage() {
  const { id } = Route.useParams();
  const [expandUtilization, setExpandUtilization] = useState(false);
  const [expandPowerNodes, setExpandPowerNodes] = useState(false);
  const [powerAggregation, setPowerAggregation] = useState('mean');
  const [resourceAggregation, setResourceAggregation] = useState('mean');
  const [showCpuUtilization, setShowCpuUtilization] = useState(true);
  const [showGpuUtilization, setShowGpuUtilization] = useState(true);
  const [expandGpuPerformance, setExpandGpuPerformance] = useState(false);
  const [gpuPerformanceAggregation, setGpuPerformanceAggregation] =
    useState('mean');
  const [showGpuPerformanceUtilization, setShowGpuPerformanceUtilization] =
    useState(true);
  const [showGpuPerformanceMemory, setShowGpuPerformanceMemory] =
    useState(true);
  const [expandMemoryUtilization, setExpandMemoryUtilization] = useState(false);
  const [memoryAggregation, setMemoryAggregation] = useState('mean');
  const [showCpuMemory, setShowCpuMemory] = useState(true);
  const [showGpuMemory, setShowGpuMemory] = useState(true);
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

  useEffect(() => {
    if (resourceAggregation === 'all') {
      setExpandUtilization(true);
    }
  }, [resourceAggregation]);

  useEffect(() => {
    if (gpuPerformanceAggregation === 'all') {
      setExpandGpuPerformance(true);
    }
  }, [gpuPerformanceAggregation]);

  useEffect(() => {
    if (memoryAggregation === 'all') {
      setExpandMemoryUtilization(true);
    }
  }, [memoryAggregation]);

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
  const { data } = useDetailQuery({
    dataSource: 'data/user-job-performance/user-jobs.json',
    dataIdField: 'Job ID',
    paramId: id,
    queryMode: 'client',
    staticParams: null,
  });
  const metricsByJob = useDataFromSource(
    'data/user-job-performance/metrics-data.json'
  ) as MetricsByJob | undefined;

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
        'gpu-performance',
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
    id
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
  const nodeUtilizationRows = generateUtilizationNodesData(
    cpuUtilizationSeries,
    gpuUtilizationSeries,
    resourceTimeAxis
  );
  const displayedNodeRows =
    resourceAggregation === 'all'
      ? nodeUtilizationRows.map((row) => ({
          color: row.color,
          symbol: row.symbol,
          node: row.node,
          cpu: row.cpuMean,
          gpu: row.gpuMean,
        }))
      : nodeUtilizationRows.map((row) => ({
          color: row.color,
          symbol: row.symbol,
          node: row.node,
          cpu:
            resourceAggregation === 'max'
              ? row.cpuMax
              : resourceAggregation === 'min'
                ? row.cpuMin
                : row.cpuMean,
          gpu:
            resourceAggregation === 'max'
              ? row.gpuMax
              : resourceAggregation === 'min'
                ? row.gpuMin
                : row.gpuMean,
        }));
  const tableMetricPrefix =
    resourceAggregation === 'max'
      ? 'Max.'
      : resourceAggregation === 'min'
        ? 'Min.'
        : 'Avg.';
  const resourcePlotData =
    resourceAggregation === 'all'
      ? nodeUtilizationRows.flatMap((row) => {
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
        })
      : filteredResourceUtilizationData.length
        ? filteredResourceUtilizationData
        : resourceUtilizationData;
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
  const displayedPowerNodeRows = nodeUtilizationRows.map((row, idx) => {
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
  const memoryUtilizationData = generateMemoryUtilizationData(metricsByJob, id);
  const cpuMemorySeries = memoryUtilizationData.find(
    (series) => series.name === 'CPU Memory'
  )?.y ?? [];
  const gpuMemorySeries = memoryUtilizationData.find(
    (series) => series.name === 'GPU Memory'
  )?.y ?? [];
  const memoryTimeAxis = memoryUtilizationData.find(
    (series) => series.name === 'CPU Memory'
  )?.x ?? [];
  const cpuMemoryAvg = cpuMemorySeries.length
    ? cpuMemorySeries.reduce((sum, value) => sum + value, 0) /
      cpuMemorySeries.length
    : 0;
  const gpuMemoryAvg = gpuMemorySeries.length
    ? gpuMemorySeries.reduce((sum, value) => sum + value, 0) /
      gpuMemorySeries.length
    : 0;
  const filteredMemoryUtilizationData = memoryUtilizationData.filter(
    (series) =>
      (series.name === 'CPU Memory' && showCpuMemory) ||
      (series.name === 'GPU Memory' && showGpuMemory)
  );
  const memoryNodeRows = generateUtilizationNodesData(
    cpuMemorySeries,
    gpuMemorySeries,
    memoryTimeAxis
  );
  const displayedMemoryNodeRows =
    memoryAggregation === 'all'
      ? memoryNodeRows.map((row) => ({
          color: row.color,
          symbol: row.symbol,
          node: row.node,
          cpu: row.cpuMean,
          gpu: row.gpuMean,
        }))
      : memoryNodeRows.map((row) => ({
          color: row.color,
          symbol: row.symbol,
          node: row.node,
          cpu:
            memoryAggregation === 'max'
              ? row.cpuMax
              : memoryAggregation === 'min'
                ? row.cpuMin
                : row.cpuMean,
          gpu:
            memoryAggregation === 'max'
              ? row.gpuMax
              : memoryAggregation === 'min'
                ? row.gpuMin
                : row.gpuMean,
        }));
  const memoryTableMetricPrefix =
    memoryAggregation === 'max'
      ? 'Max.'
      : memoryAggregation === 'min'
        ? 'Min.'
        : 'Avg.';
  const memoryPlotData =
    memoryAggregation === 'all'
      ? memoryNodeRows.flatMap((row) => {
          const traces = [];
          if (showCpuMemory) {
            traces.push({
              x: row.time,
              y: row.cpuSeries,
              type: 'scatter' as const,
              mode: 'lines+markers' as const,
              name: `${row.node} CPU Memory`,
              line: { color: row.color, width: 1.6, dash: 'dot' as const },
              marker: { symbol: row.symbol, size: 5 },
            });
          }
          if (showGpuMemory) {
            traces.push({
              x: row.time,
              y: row.gpuSeries,
              type: 'scatter' as const,
              mode: 'lines+markers' as const,
              name: `${row.node} GPU Memory`,
              line: { color: row.color, width: 1.8 },
              marker: { symbol: row.symbol, size: 5 },
            });
          }
          return traces;
        })
      : filteredMemoryUtilizationData.length
        ? filteredMemoryUtilizationData
        : memoryUtilizationData;
  const displayedGpuPerformanceRows = memoryNodeRows.map((memoryRow, idx) => {
    const utilizationRow = nodeUtilizationRows[idx] ?? memoryRow;
    return {
      color: utilizationRow.color,
      symbol: utilizationRow.symbol,
      node: utilizationRow.node,
      gpuUtilization:
        gpuPerformanceAggregation === 'max'
          ? utilizationRow.gpuMax
          : gpuPerformanceAggregation === 'min'
            ? utilizationRow.gpuMin
            : utilizationRow.gpuMean,
      gpuMemoryUtilization:
        gpuPerformanceAggregation === 'max'
          ? memoryRow.gpuMax
          : gpuPerformanceAggregation === 'min'
            ? memoryRow.gpuMin
            : memoryRow.gpuMean,
    };
  });
  const gpuPerformanceTableMetricPrefix =
    gpuPerformanceAggregation === 'max'
      ? 'Max.'
      : gpuPerformanceAggregation === 'min'
        ? 'Min.'
        : 'Avg.';
  const gpuPerformanceUtilizationPlotData =
    gpuPerformanceAggregation === 'all'
      ? showGpuPerformanceUtilization
        ? nodeUtilizationRows.map((row) => ({
            x: row.time,
            y: row.gpuSeries,
            type: 'scatter' as const,
            mode: 'lines+markers' as const,
            name: row.node,
            line: { color: COLOR_TOKENS.gpu, width: 1.8 },
            marker: { symbol: row.symbol, size: 5 },
          }))
        : []
      : showGpuPerformanceUtilization
        ? resourceUtilizationData
            .filter((series) => series.name === 'GPU')
            .map((series) => ({
              ...series,
              line: { ...(series.line ?? {}), color: COLOR_TOKENS.gpu },
            }))
        : [];
  const gpuPerformanceMemoryPlotData =
    gpuPerformanceAggregation === 'all'
      ? showGpuPerformanceMemory
        ? memoryNodeRows.map((row) => ({
            x: row.time,
            y: row.gpuSeries,
            type: 'scatter' as const,
            mode: 'lines+markers' as const,
            name: row.node,
            line: { color: COLOR_TOKENS.memory, width: 1.8 },
            marker: { symbol: row.symbol, size: 5 },
          }))
        : []
      : showGpuPerformanceMemory
        ? memoryUtilizationData
            .filter((series) => series.name === 'GPU Memory')
            .map((series) => ({
              ...series,
              line: { ...(series.line ?? {}), color: COLOR_TOKENS.memory },
            }))
        : [];
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

  if (!data) {
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
            to="/user-job-performance"
            underline="hover"
            color="primary"
          >
            For Users
          </Link>
          <Link
            component={RouterLink}
            to="/user-job-performance"
            underline="hover"
            color="primary"
          >
            Performance Overview
          </Link>
          <Typography color="text.primary">
            Details for Job {data['Job ID']}
          </Typography>
        </Breadcrumbs>
      </Box>

      <Container maxWidth="xl" sx={{ mt: 3 }}>
        {/* Page Header */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={10}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h4" sx={{ ...TITLE_SX, mb: 2 }}>
                Performance for Job : {data['Job ID']} ({data.Project})
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Box sx={{ flex: 1 }} />
                <Button
                  component={RouterLink}
                  to="/user-job-performance/compare"
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
                  Compare with other Jobs
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
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Start time
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Fri Jul 7, 2025 18:32 PT
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    End time
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Fri Jul 7, 2025 21:12 PT
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Duration
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    2 hrs 40 min
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Queue
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {data.QOS}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    No. of Nodes
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    233
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Node Hours Charged
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    24.36
                  </Typography>
                </Grid>
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
                    <Link
                      href="#"
                      variant="body2"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      Learn about Power Capping{' '}
                      <ArrowForwardIcon fontSize="small" />
                    </Link>
                  </Alert>
                </Grid>
              </Grid>
            </Paper>

            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid item xs={12} lg={6}>
                <Paper
                  id="gpu-throughput"
                  sx={{ p: 4, height: '100%', scrollMarginTop: '80px' }}
                >
                  <Typography variant="h5" sx={{ ...SECTION_TITLE_SX, mb: 4 }}>
                    GPU Throughput Overview
                  </Typography>
                  {[
                    { label: 'Compute (SM) Throughput', value: 39.88 },
                    { label: 'Memory Throughput', value: 80.88 },
                    { label: 'DRAM Throughput', value: 80.88 },
                  ].map((item) => (
                    <Box
                      key={item.label}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '280px 1fr 80px',
                        alignItems: 'center',
                        gap: 2,
                        mb: 4,
                      }}
                    >
                      <Typography
                        variant="subtitle1"
                        sx={{ ...SECTION_TITLE_SX, fontWeight: 600 }}
                      >
                        {item.label}
                      </Typography>
                      <Box
                        sx={{
                          height: 20,
                          borderRadius: 0.5,
                          bgcolor: COLOR_TOKENS.neutralTrack,
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            width: `${item.value}%`,
                            height: '100%',
                            bgcolor: COLOR_TOKENS.throughputFill,
                          }}
                        />
                      </Box>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {item.value.toFixed(2)}%
                      </Typography>
                    </Box>
                  ))}
                  <Typography
                    variant="body1"
                    sx={{ maxWidth: 760, mb: 2, color: COLOR_TOKENS.textSecondary }}
                  >
                    Kernel shows high throughput, using &gt;80% of available
                    compute or memory. Consider shifting work off the bottleneck,
                    further analyze DRAM to investigate more.
                  </Typography>
                  <Link href="#" sx={ACTION_LINK_SX}>
                    See more GPU throughput metrics <ArrowForwardIcon />
                  </Link>
                </Paper>
              </Grid>
              <Grid item xs={12} lg={6}>
                <Paper
                  id="runtime-resource-distribution"
                  sx={{ p: 3, height: '100%', scrollMarginTop: '80px' }}
                >
                  <Typography variant="h5" sx={{ ...SECTION_TITLE_SX, mb: 2 }}>
                    Runtime Resource Distribution
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={5}>
                      <Stack spacing={2.5} sx={{ mt: 2 }}>
                        {[
                          { label: 'GPU', value: '52.3%', color: COLOR_TOKENS.cpu },
                          { label: 'I/O', value: '62.4%', color: COLOR_TOKENS.gpu },
                          { label: 'CPU', value: '62.4%', color: COLOR_TOKENS.memory },
                          { label: 'Network', value: '62.4%', color: COLOR_TOKENS.network },
                        ].map((item) => (
                          <Box
                            key={item.label}
                            sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
                          >
                            <MemoryIcon sx={{ color: item.color }} />
                            <Typography variant="subtitle1" sx={{ ...SECTION_TITLE_SX, minWidth: 86 }}>
                              {item.label}
                            </Typography>
                            <Typography variant="subtitle1">{item.value}</Typography>
                          </Box>
                        ))}
                      </Stack>
                      <Link href="#" sx={{ ...ACTION_LINK_SX, mt: 4 }}>
                        Learn about Efficient Resource Distribution{' '}
                        <ArrowForwardIcon />
                      </Link>
                    </Grid>
                    <Grid item xs={12} md={7}>
                      <Plot
                        data={[
                          {
                            type: 'pie',
                            hole: 0.62,
                            values: [35, 45, 20, 25],
                            labels: ['GPU', 'I/O', 'CPU', 'Network'],
                            text: ['35%', '45%', '20%', '25%'],
                            textinfo: 'text',
                            texttemplate: '%{label}<br>%{text}',
                            textposition: 'inside',
                            insidetextorientation: 'horizontal',
                            sort: false,
                            marker: {
                              colors: [
                                COLOR_TOKENS.cpu,
                                COLOR_TOKENS.gpu,
                                COLOR_TOKENS.memory,
                                COLOR_TOKENS.network,
                              ],
                              line: { color: COLOR_TOKENS.pageBg, width: 6 },
                            },
                            hoverinfo: 'label+percent',
                            showlegend: false,
                          },
                        ]}
                        layout={{
                          autosize: true,
                          height: 360,
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                        }}
                        config={{ responsive: true, displayModeBar: false }}
                        style={{ width: '100%' }}
                      />
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            </Grid>

            {/* Resource Utilization */}
            <Paper
              id="resource-util"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  GPU & CPU Utilization
                </Typography>
              </Box>
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
                    value={resourceAggregation}
                    onChange={(e) => setResourceAggregation(e.target.value)}
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
                  showlegend: resourceAggregation === 'all',
                  legend:
                    resourceAggregation === 'all'
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
                  View the tabular data across individual nodes
                </Typography>
              </Box>
              <Collapse in={expandUtilization}>
                <Box sx={{ scrollMarginTop: '80px' }}>
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Legend</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Nodes</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {tableMetricPrefix} CPU Utilization
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {tableMetricPrefix} GPU Utilization
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {displayedNodeRows.map((row) => (
                          <TableRow key={row.node}>
                            <TableCell>
                              <Typography
                                variant="body1"
                                sx={{ color: row.color, lineHeight: 1 }}
                              >
                                {getMarkerGlyph(row.symbol)}
                              </Typography>
                            </TableCell>
                            <TableCell>{row.node}</TableCell>
                            <TableCell>{row.cpu.toFixed(3)}%</TableCell>
                            <TableCell>{row.gpu.toFixed(3)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Collapse>
            </Paper>


            {/* Memory Utilization */}
            <Paper
              id="memory-util"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  Memory Utilization
                </Typography>
              </Box>
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
                    value={memoryAggregation}
                    onChange={(e) => setMemoryAggregation(e.target.value)}
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
                    title="Avg. CPU memory utilization across all nodes for the selected job."
                  >
                    <Box
                      onClick={() => setShowCpuMemory(!showCpuMemory)}
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.cpu}`,
                        opacity: showCpuMemory ? 1 : 0.45,
                      }}
                    >
                      <MemoryIcon
                        sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.cpu }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        CPU Memory {cpuMemoryAvg.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Tooltip>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Avg. GPU memory utilization across all nodes for the selected job."
                  >
                    <Box
                      onClick={() => setShowGpuMemory(!showGpuMemory)}
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.gpu}`,
                        opacity: showGpuMemory ? 1 : 0.45,
                      }}
                    >
                      <MemoryIcon
                        sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.gpu }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        GPU Memory {gpuMemoryAvg.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Tooltip>
                </Box>
              </Box>
              <Plot
                data={memoryPlotData as any}
                layout={{
                  autosize: true,
                  height: 330,
                  margin: { l: 50, r: 20, t: 20, b: 50 },
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
                    title: 'Memory Utilization %',
                    range: [0, 100],
                  },
                  showlegend: memoryAggregation === 'all',
                  legend:
                    memoryAggregation === 'all'
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
                  View the tabular memory data across individual nodes
                </Typography>
              </Box>
              <Collapse in={expandMemoryUtilization}>
                <Box sx={{ scrollMarginTop: '80px' }}>
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Legend</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Nodes</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {memoryTableMetricPrefix} CPU Memory
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {memoryTableMetricPrefix} GPU Memory
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {displayedMemoryNodeRows.map((row) => (
                          <TableRow key={`memory-${row.node}`}>
                            <TableCell>
                              <Typography
                                variant="body1"
                                sx={{ color: row.color, lineHeight: 1 }}
                              >
                                {getMarkerGlyph(row.symbol)}
                              </Typography>
                            </TableCell>
                            <TableCell>{row.node}</TableCell>
                            <TableCell>{row.cpu.toFixed(3)}%</TableCell>
                            <TableCell>{row.gpu.toFixed(3)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Collapse>
            </Paper>
            {/* GPU Performance */}
            <Paper
              id="gpu-performance"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  GPU Performance
                </Typography>
              </Box>
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
                    value={gpuPerformanceAggregation}
                    onChange={(e) => setGpuPerformanceAggregation(e.target.value)}
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
                    title="Avg. GPU utilization across all nodes for the selected job."
                  >
                    <Box
                      onClick={() =>
                        setShowGpuPerformanceUtilization(
                          !showGpuPerformanceUtilization
                        )
                      }
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.gpu}`,
                        opacity: showGpuPerformanceUtilization ? 1 : 0.45,
                      }}
                    >
                      <MemoryIcon
                        sx={{ ...METRIC_CHIP_ICON_SX, color: COLOR_TOKENS.gpu }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        GPU Utilization {gpuUtilizationAvg.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Tooltip>
                  <Tooltip
                    arrow
                    placement="top"
                    title="Avg. GPU memory utilization across all nodes for the selected job."
                  >
                    <Box
                      onClick={() =>
                        setShowGpuPerformanceMemory(!showGpuPerformanceMemory)
                      }
                      sx={{
                        ...METRIC_CHIP_BASE_SX,
                        border: `2px solid ${COLOR_TOKENS.memory}`,
                        opacity: showGpuPerformanceMemory ? 1 : 0.45,
                      }}
                    >
                      <MemoryIcon
                        sx={{
                          ...METRIC_CHIP_ICON_SX,
                          color: COLOR_TOKENS.memory,
                        }}
                      />
                      <Typography sx={METRIC_CHIP_LABEL_SX}>
                        GPU Memory {gpuMemoryAvg.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Tooltip>
                </Box>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    GPU Utilization
                  </Typography>
                  <Plot
                    data={gpuPerformanceUtilizationPlotData.filter(Boolean) as any}
                    layout={{
                      autosize: true,
                      height: 320,
                      margin: { l: 50, r: 20, t: 20, b: 50 },
                      xaxis: {
                        title: 'Floored Relative Time (s)',
                      },
                      yaxis: { title: 'GPU Utilization %', range: [0, 100] },
                      showlegend: gpuPerformanceAggregation === 'all',
                      legend:
                        gpuPerformanceAggregation === 'all'
                          ? { orientation: 'v', x: 1.02, y: 1, xanchor: 'left' }
                          : undefined,
                      hovermode: 'x unified',
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    style={{ width: '100%' }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    GPU Memory
                  </Typography>
                  <Plot
                    data={gpuPerformanceMemoryPlotData.filter(Boolean) as any}
                    layout={{
                      autosize: true,
                      height: 320,
                      margin: { l: 50, r: 20, t: 20, b: 50 },
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
                      yaxis: { title: 'GPU Memory Utilization %', range: [0, 100] },
                      showlegend: gpuPerformanceAggregation === 'all',
                      legend:
                        gpuPerformanceAggregation === 'all'
                          ? { orientation: 'v', x: 1.02, y: 1, xanchor: 'left' }
                          : undefined,
                      hovermode: 'x unified',
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    style={{ width: '100%' }}
                  />
                </Grid>
              </Grid>
              <Divider sx={{ mt: 2, mb: 1.5 }} />
              <Box
                id="gpu-performance-nodes"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
                  py: 1,
                }}
                onClick={() => setExpandGpuPerformance(!expandGpuPerformance)}
              >
                <IconButton size="small">
                  {expandGpuPerformance ? (
                    <ExpandMoreIcon />
                  ) : (
                    <KeyboardArrowRightIcon />
                  )}
                </IconButton>
                <Typography variant="h6" sx={{ fontWeight: 500 }}>
                  View the tabular GPU performance data across individual nodes
                </Typography>
              </Box>
              <Collapse in={expandGpuPerformance}>
                <Box sx={{ scrollMarginTop: '80px' }}>
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Legend</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Nodes</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {gpuPerformanceTableMetricPrefix} GPU Utilization
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {gpuPerformanceTableMetricPrefix} GPU Memory
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {displayedGpuPerformanceRows.map((row) => (
                          <TableRow key={`gpu-performance-${row.node}`}>
                            <TableCell>
                              <Typography
                                variant="body1"
                                sx={{ color: row.color, lineHeight: 1 }}
                              >
                                {getMarkerGlyph(row.symbol)}
                              </Typography>
                            </TableCell>
                            <TableCell>{row.node}</TableCell>
                            <TableCell>{row.gpuUtilization.toFixed(3)}%</TableCell>
                            <TableCell>
                              {row.gpuMemoryUtilization.toFixed(3)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Collapse>
            </Paper>

            

            {/* Power */}
            <Paper id="power" sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={SECTION_TITLE_SX}>
                  Power
                </Typography>
              </Box>
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
            </Paper>

            {/* PCIe Bandwidth */}
            <Paper
              id="pcie-bandwidth"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  PCIe Bandwidth
                </Typography>
              </Box>
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
            </Paper>

            {/* GPU and Inter-Node Network */}
            <Paper
              id="gpu-inter-node-network"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={SECTION_TITLE_SX}>
                  GPU and Inter-Node Network
                </Typography>
              </Box>
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
            </Paper>

            {/* Roofline Analysis */}
            <Paper id="roofline" sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}>
              <Typography variant="h6" sx={{ ...SECTION_TITLE_SX, mb: 2 }}>
                Roofline Analysis
              </Typography>
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
                  GPU Throughput
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
                  onClick={() => handleNavClick('gpu-performance')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'gpu-performance'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'gpu-performance' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  GPU Performance
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

const getMarkerGlyph = (symbol: (typeof NODE_MARKERS)[number]) => {
  if (symbol === 'square') return '■';
  if (symbol === 'diamond') return '◆';
  if (symbol === 'triangle-up') return '▲';
  if (symbol === 'triangle-down') return '▼';
  if (symbol === 'cross') return '✚';
  return '●';
};

// Build utilization curves from GPU utilization reference metrics.
function generateResourceUtilizationData(
  metricsByJob: MetricsByJob | undefined,
  jobId: string
) {
  const rows = metricsByJob?.[jobId] ?? [];
  const sortedRows = [...rows].sort(
    (a, b) => a['Floored Relative Time'] - b['Floored Relative Time']
  );

  const fallbackTimePoints = Array.from({ length: 50 }, (_, i) => i * 2);
  if (!sortedRows.length) {
    const gpuFallback = fallbackTimePoints.map((t, idx) =>
      clampPercent(30 + 20 * Math.sin(t / 12) + (idx % 5) * 2)
    );
    const cpuFallback = gpuFallback.map((gpu, idx) =>
      clampPercent(gpu * 0.72 + 6 + 2 * Math.cos(idx / 3))
    );

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
  const cpuSeries = referenceGpu.map((gpu, idx) =>
    clampPercent(gpu * 0.7 + 6 + 2 * Math.cos(idx / 3))
  );

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
      mode: 'lines+markers' as const,
      name: 'GPU',
      line: { color: COLOR_TOKENS.gpu, width: 2 },
      marker: { size: 4 },
    },
  ];
}

// Build memory utilization curves from DRAM active reference points.
function generateMemoryUtilizationData(
  metricsByJob: MetricsByJob | undefined,
  jobId: string
) {
  const rows = metricsByJob?.[jobId] ?? [];
  const sortedRows = [...rows].sort(
    (a, b) => a['Floored Relative Time'] - b['Floored Relative Time']
  );

  const fallbackTimePoints = Array.from({ length: 50 }, (_, i) => i * 2);
  if (!sortedRows.length) {
    const gpuMemoryFallback = fallbackTimePoints.map((t, idx) =>
      clampPercent(48 + 16 * Math.sin(t / 10) + (idx % 4) * 1.8)
    );
    const cpuMemoryFallback = gpuMemoryFallback.map((gpu, idx) =>
      clampPercent(gpu * 0.78 + 6 + 2 * Math.cos(idx / 3))
    );
    return [
      {
        x: fallbackTimePoints,
        y: cpuMemoryFallback,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'CPU Memory',
        line: { color: '#1976d2', width: 2 },
      },
      {
        x: fallbackTimePoints,
        y: gpuMemoryFallback,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'GPU Memory',
        line: { color: '#4caf50', width: 2 },
      },
    ];
  }

  const maxRelativeTime = Math.max(
    ...sortedRows.map((row) => row['Floored Relative Time']),
    1
  );
  const dramPoints = sortedRows.map((row) =>
    Number(row.nersc_ldms_dcgm_dram_active ?? 0)
  );
  const maxDram = Math.max(...dramPoints.map((value) => Math.abs(value)), 1e-12);
  // Copy DRAM active data point pattern into a visible utilization range.
  const gpuMemorySeries = dramPoints.map((value, idx) =>
    clampPercent((Math.abs(value) / maxDram) * 82 + 8 + 2.5 * Math.sin(idx / 4))
  );
  const cpuMemorySeries = gpuMemorySeries.map((gpu, idx) =>
    clampPercent(gpu * 0.76 + 7 + 1.5 * Math.cos(idx / 3))
  );
  const relativeTimePercent = sortedRows.map((row) =>
    (row['Floored Relative Time'] / maxRelativeTime) * 100
  );

  return [
    {
      x: relativeTimePercent,
      y: cpuMemorySeries,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'CPU Memory',
      line: { color: COLOR_TOKENS.cpu, width: 2 },
    },
    {
      x: relativeTimePercent,
      y: gpuMemorySeries,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'GPU Memory',
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
) {
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

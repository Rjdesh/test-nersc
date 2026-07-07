export interface LegacyUserJobData {
  'Job ID': number;
  'Job Name'?: string;
  'Job Status'?: string;
  'User': string;
  'Project': string;
  'Partition': string;
  'QOS': string;
  'Start Time': string;
  'End Time': string;
  'Hostname': string;
  'Charged Node Hours': number;
}

export interface IrisJobData {
  'Job ID': number;
  'Job Name'?: string;
  'Project': string;
  'QOS': string;
  'Submit Time'?: string;
  'Start Time': string;
  'End Time': string;
  'Node hours charged'?: number;
  'No. of nodes Allocated'?: number;
  'State'?: string;
  'Energy consumed'?: number;
  'Elapsed secs'?: number;
  'CPUs used'?: number;
}

export interface MetricsRow {
  'Job ID': number;
  'Floored Relative Time': number;
  nersc_ldms_dcgm_dram_active?: number | null;
  nersc_ldms_dcgm_gpu_utilization?: number | null;
  [key: string]: number | null | undefined;
}

export type MetricsByJob = Record<string, MetricsRow[]>;

export interface ComputeMetricsRow {
  [key: string]: number | string | null | undefined;
}

export interface ComputeMetricsExport {
  job_id?: string | number;
  data?: ComputeMetricsRow[];
  [key: string]: ComputeMetricsRow[] | string | number | null | undefined;
}

export type ComputeMetricsSource = ComputeMetricsRow[] | ComputeMetricsExport | undefined;
export type ComputeMetricsByJob = Record<string, ComputeMetricsSource>;

export interface MetricStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  median: number | null;
  sampleCount: number;
}

export interface PerformanceSnapshot {
  gpuUtilization: MetricStats;
  cpuUtilization: MetricStats;
  gpuMemoryBandwidth: MetricStats;
  cpuMemoryBandwidth: MetricStats;
}

export interface NetworkMetricSummary {
  total: number | null;
  avgUpload: number | null;
  avgDownload: number | null;
}

export interface NetworkPerformanceSnapshot {
  pcieThroughput: NetworkMetricSummary;
  nvlinkThroughput: NetworkMetricSummary;
  slingshotThroughput: NetworkMetricSummary;
}

export interface IrisGpuUtilizationSummary {
  jobId: number;
  avgGpuUtilization: number | null;
  avgCpuUtilization: number | null;
  gpuSampleCount: number;
  cpuSampleCount: number;
  gpuMetricName: string;
  cpuMetricName: string;
  error?: string;
}

export type IrisGpuUtilizationByJob = Record<string, IrisGpuUtilizationSummary>;
export type IrisGpuUtilizationFetchStatus = 'idle' | 'loading' | 'success' | 'error';
export type MetricFetchStatus = 'loading' | 'success' | 'failed';

export interface JobGridRow {
  id: string;
  submitTime: string;
  startTime: string;
  endTime: string;
  jobId: string;
  jobName: string;
  projectId: string;
  nodeHours: number;
  nodeCount: number | null;
  waitTime: string;
  executionTime: string;
  jobStatus: string;
  cpuUtilization: number | null;
  avgGpuUtilization: number | null;
  gpuMemoryUtilization: number | null;
  gpuUtilizationStatus?: MetricFetchStatus;
  cpuUtilizationStatus?: MetricFetchStatus;
  energyConsumed: number;
  energyStatus: 'high' | 'warning' | 'medium';
  qos: string;
  user: string;
  partition: string;
  hostname: string;
}

export interface JobPerformanceSummaryInput {
  jobId: string;
  avgGpuUtilization: number | null;
  cpuUtilization?: number | null;
}

interface BuildRecentJobRowsInput {
  legacyJobs?: LegacyUserJobData[];
  irisJobs?: IrisJobData[];
  metricsByJob?: MetricsByJob;
  irisGpuUtilizationByJob?: IrisGpuUtilizationByJob;
  irisGpuUtilizationStatus?: IrisGpuUtilizationFetchStatus;
}

interface BuildComputePerformanceSnapshotInput {
  jobId: string;
  baseSnapshot: PerformanceSnapshot;
  computeMetricsByJob?: ComputeMetricsByJob;
}

const fallbackJobStatuses = ['Failed', 'Aborted', 'Waiting', 'Running', 'Completed'] as const;
const fallbackWaitTimes = ['4m', '18m', '42m', '7m', '0m', '11m'] as const;

const average = (values: number[]) => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const emptyStats = (): MetricStats => ({
  min: null,
  max: null,
  avg: null,
  median: null,
  sampleCount: 0,
});

const roundMetricValue = (value: number) => Number(value.toFixed(1));

const getStats = (values: number[]): MetricStats => {
  const numericValues = values.filter((value) => Number.isFinite(value));

  if (!numericValues.length) {
    return emptyStats();
  }

  const sortedValues = [...numericValues].sort((left, right) => left - right);
  const midpoint = Math.floor(sortedValues.length / 2);
  const median = sortedValues.length % 2 === 0
    ? (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
    : sortedValues[midpoint];

  return {
    min: roundMetricValue(sortedValues[0]),
    max: roundMetricValue(sortedValues[sortedValues.length - 1]),
    avg: roundMetricValue(average(numericValues)),
    median: roundMetricValue(median),
    sampleCount: numericValues.length,
  };
};

const getFirstAvailableMetricSeries = (
  rows: MetricsRow[],
  aliases: string[],
  normalizeValue: (value: number, metricName: string) => number = (value) => value
) => {
  for (const alias of aliases) {
    const values = rows
      .map((row) => row[alias])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map((value) => normalizeValue(value, alias));

    if (values.length) {
      return values;
    }
  }

  return [];
};

const getFirstAvailableComputeMetricSeries = (
  rows: ComputeMetricsRow[],
  aliases: string[],
  normalizeValue: (value: number, metricName: string) => number = (value) => value
) => {
  for (const alias of aliases) {
    const values = rows
      .map((row) => row[alias])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map((value) => normalizeValue(value, alias));

    if (values.length) {
      return values;
    }
  }

  return [];
};

const getComputeMetricsRows = (source: ComputeMetricsSource) => {
  if (Array.isArray(source)) {
    return source;
  }

  return source?.data ?? [];
};

const normalizePercentMetric = (value: number, metricName: string) => {
  if (metricName === 'nersc_ldms_dcgm_gr_engine_active' || Math.abs(value) <= 1) {
    return value * 100;
  }

  return value;
};

const buildCpuUtilizationSeries = (
  rows: MetricsRow[],
  gpuSeries: number[],
  fallbackCpuUtilization?: number | null
) => {
  const cpuMetricSeries = getFirstAvailableMetricSeries(
    rows,
    [
      'nersc_ldms_dcgm_cpu_utilization',
      'nersc_ldms_cpu_utilization',
    ],
    normalizePercentMetric
  );

  if (cpuMetricSeries.length) {
    return cpuMetricSeries.map(clampPercent);
  }

  if (typeof fallbackCpuUtilization === 'number' && fallbackCpuUtilization >= 0 && fallbackCpuUtilization <= 100) {
    return [clampPercent(fallbackCpuUtilization)];
  }

  return gpuSeries.map((gpu, index) =>
    clampPercent(gpu * 0.7 + 6 + 2 * Math.cos(index / 3))
  );
};

const buildMemoryBandwidthSeries = (rows: MetricsRow[], gpuSeries: number[]) => {
  const gpuMemoryMetricSeries = getFirstAvailableMetricSeries(
    rows,
    ['nersc_ldms_dcgm_dram_active'],
    normalizePercentMetric
  );
  const gpuMemorySeries = gpuMemoryMetricSeries.length
    ? gpuMemoryMetricSeries.map(clampPercent)
    : gpuSeries.map((gpu, index) =>
      clampPercent(gpu * 0.78 + 18 + 2.5 * Math.sin(index / 4))
    );
  const cpuMemoryMetricSeries = getFirstAvailableMetricSeries(
    rows,
    ['nersc_ldms_cpu_memory_bandwidth'],
    normalizePercentMetric
  );
  const cpuMemorySeries = cpuMemoryMetricSeries.length
    ? cpuMemoryMetricSeries.map(clampPercent)
    : gpuMemorySeries.map((gpuMemory, index) =>
      clampPercent(gpuMemory * 0.76 + 7 + 1.5 * Math.cos(index / 3))
    );

  return {
    gpuMemorySeries,
    cpuMemorySeries,
  };
};

const generateFallbackPcieSeries = (gpuSeries: number[]) => {
  const downloadSeries = gpuSeries.map((gpu, index) =>
    Math.max(0, gpu * 0.64 + 8 + 2.5 * Math.sin(index / 4))
  );
  const uploadSeries = downloadSeries.map((download, index) =>
    Math.max(0, download * 0.76 + 1.8 * Math.cos(index / 3))
  );

  return {
    downloadSeries,
    uploadSeries,
  };
};

const generateFallbackNetworkSeries = (gpuSeries: number[]) => {
  const nvlinkTotalSeries = gpuSeries.map((gpu, index) =>
    Math.max(0, gpu * 1.9 + 36 + 4 * Math.sin(index / 4))
  );
  const slingshotTotalSeries = nvlinkTotalSeries.map((value, index) =>
    Math.max(0, value * 0.56 + 6 + 2.2 * Math.cos(index / 3))
  );

  return {
    nvlinkDownloadSeries: nvlinkTotalSeries.map((value) => value * 0.54),
    nvlinkUploadSeries: nvlinkTotalSeries.map((value) => value * 0.46),
    slingshotDownloadSeries: slingshotTotalSeries.map((value) => value * 0.57),
    slingshotUploadSeries: slingshotTotalSeries.map((value) => value * 0.43),
  };
};

const roundNullableMetricValue = (value: number | null) => (
  value === null ? null : roundMetricValue(value)
);

const averageOrNull = (values: number[]) => (
  values.length ? average(values) : null
);

const buildNetworkMetricSummary = ({
  uploadSeries,
  downloadSeries,
  totalSeries,
  fallbackUploadSeries,
  fallbackDownloadSeries,
}: {
  uploadSeries: number[];
  downloadSeries: number[];
  totalSeries?: number[];
  fallbackUploadSeries: number[];
  fallbackDownloadSeries: number[];
}): NetworkMetricSummary => {
  const hasDirectionalData = uploadSeries.length > 0 || downloadSeries.length > 0;
  const hasTotalData = Boolean(totalSeries?.length);
  const effectiveUploadSeries = uploadSeries.length
    ? uploadSeries
    : hasDirectionalData || hasTotalData
      ? []
      : fallbackUploadSeries;
  const effectiveDownloadSeries = downloadSeries.length
    ? downloadSeries
    : hasDirectionalData || hasTotalData
      ? []
      : fallbackDownloadSeries;
  const avgUpload = roundNullableMetricValue(averageOrNull(effectiveUploadSeries));
  const avgDownload = roundNullableMetricValue(averageOrNull(effectiveDownloadSeries));
  const directionalTotal = avgUpload !== null || avgDownload !== null
    ? (avgUpload ?? 0) + (avgDownload ?? 0)
    : null;
  const total = directionalTotal ?? averageOrNull(totalSeries ?? []);

  return {
    total: roundNullableMetricValue(total),
    avgUpload,
    avgDownload,
  };
};

const getPerformanceSnapshot = (
  rows: MetricsRow[],
  fallbackGpuUtilization: number | null,
  fallbackCpuUtilization?: number | null
): PerformanceSnapshot => {
  const gpuMetricSeries = getFirstAvailableMetricSeries(
    rows,
    [
      'nersc_ldms_dcgm_gpu_utilization',
      'nersc_ldms_dcgm_gr_engine_active',
    ],
    normalizePercentMetric
  );
  const gpuSeries = gpuMetricSeries.length
    ? gpuMetricSeries.map(clampPercent)
    : [clampPercent(fallbackGpuUtilization ?? 0)];
  const cpuSeries = buildCpuUtilizationSeries(rows, gpuSeries, fallbackCpuUtilization);
  const { gpuMemorySeries, cpuMemorySeries } = buildMemoryBandwidthSeries(rows, gpuSeries);

  return {
    gpuUtilization: getStats(gpuSeries),
    cpuUtilization: getStats(cpuSeries),
    gpuMemoryBandwidth: getStats(gpuMemorySeries),
    cpuMemoryBandwidth: getStats(cpuMemorySeries),
  };
};

const getNetworkPerformanceSnapshot = (
  rows: MetricsRow[],
  gpuUtilizationValues: number[]
): NetworkPerformanceSnapshot => {
  const pcieDownloadSeries = getFirstAvailableMetricSeries(
    rows,
    ['nersc_ldms_dcgm_pcie_rx_throughput']
  );
  const pcieUploadSeries = getFirstAvailableMetricSeries(
    rows,
    ['nersc_ldms_dcgm_pcie_tx_throughput']
  );
  const nvlinkDownloadSeries = getFirstAvailableMetricSeries(
    rows,
    ['nersc_ldms_dcgm_nvlink_rx_throughput']
  );
  const nvlinkUploadSeries = getFirstAvailableMetricSeries(
    rows,
    ['nersc_ldms_dcgm_nvlink_tx_throughput']
  );
  const nvlinkTotalSeries = getFirstAvailableMetricSeries(
    rows,
    ['nersc_ldms_dcgm_nvlink_bandwidth_total']
  );
  const slingshotDownloadSeries = getFirstAvailableMetricSeries(
    rows,
    [
      'nersc_ldms_slingshot_rx_throughput',
      'nersc_ldms_slingshot_download_throughput',
      'nersc_ldms_network_rx_throughput',
      'nersc_ldms_internode_network_rx_throughput',
    ]
  );
  const slingshotUploadSeries = getFirstAvailableMetricSeries(
    rows,
    [
      'nersc_ldms_slingshot_tx_throughput',
      'nersc_ldms_slingshot_upload_throughput',
      'nersc_ldms_network_tx_throughput',
      'nersc_ldms_internode_network_tx_throughput',
    ]
  );
  const slingshotTotalSeries = getFirstAvailableMetricSeries(
    rows,
    [
      'nersc_ldms_slingshot_throughput',
      'nersc_ldms_slingshot_network_throughput',
      'nersc_ldms_network_throughput',
      'nersc_ldms_internode_network_throughput',
    ]
  );
  const fallbackPcie = generateFallbackPcieSeries(gpuUtilizationValues);
  const fallbackNetwork = generateFallbackNetworkSeries(gpuUtilizationValues);

  return {
    pcieThroughput: buildNetworkMetricSummary({
      uploadSeries: pcieUploadSeries,
      downloadSeries: pcieDownloadSeries,
      fallbackUploadSeries: fallbackPcie.uploadSeries,
      fallbackDownloadSeries: fallbackPcie.downloadSeries,
    }),
    nvlinkThroughput: buildNetworkMetricSummary({
      uploadSeries: nvlinkUploadSeries,
      downloadSeries: nvlinkDownloadSeries,
      totalSeries: nvlinkTotalSeries,
      fallbackUploadSeries: fallbackNetwork.nvlinkUploadSeries,
      fallbackDownloadSeries: fallbackNetwork.nvlinkDownloadSeries,
    }),
    slingshotThroughput: buildNetworkMetricSummary({
      uploadSeries: slingshotUploadSeries,
      downloadSeries: slingshotDownloadSeries,
      totalSeries: slingshotTotalSeries,
      fallbackUploadSeries: fallbackNetwork.slingshotUploadSeries,
      fallbackDownloadSeries: fallbackNetwork.slingshotDownloadSeries,
    }),
  };
};

export const buildComputePerformanceSnapshot = ({
  jobId,
  baseSnapshot,
  computeMetricsByJob,
}: BuildComputePerformanceSnapshotInput): PerformanceSnapshot => {
  const rows = getComputeMetricsRows(computeMetricsByJob?.[jobId]);

  if (!rows.length) {
    return baseSnapshot;
  }

  const gpuUtilizationSeries = getFirstAvailableComputeMetricSeries(
    rows,
    ['nersc_ldms_dcgm_gr_engine_active'],
    normalizePercentMetric
  ).map(clampPercent);
  const gpuMemoryBandwidthSeries = getFirstAvailableComputeMetricSeries(
    rows,
    ['nersc_ldms_dcgm_dram_active'],
    normalizePercentMetric
  ).map(clampPercent);

  return {
    ...baseSnapshot,
    ...(gpuUtilizationSeries.length
      ? { gpuUtilization: getStats(gpuUtilizationSeries) }
      : {}),
    ...(gpuMemoryBandwidthSeries.length
      ? { gpuMemoryBandwidth: getStats(gpuMemoryBandwidthSeries) }
      : {}),
  };
};

const getSeededValue = (seed: number, min: number, max: number) => {
  const normalized = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;

  return Math.round(min + normalized * (max - min));
};

const parseJobTimestamp = (value?: string) => {
  if (!value) {
    return new Date(Number.NaN);
  }

  return new Date(value.replace(' ', 'T'));
};

const formatDurationFromSecondsValue = (totalSeconds: number) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return 'N/A';
  }

  const roundedSeconds = Math.round(totalSeconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;
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

const formatDurationFromSeconds = (totalSeconds?: number) => {
  if (!Number.isFinite(totalSeconds)) {
    return 'N/A';
  }

  return formatDurationFromSecondsValue(totalSeconds ?? 0);
};

const formatExecutionTime = (startTime?: string, endTime?: string) => {
  const start = parseJobTimestamp(startTime);
  const end = parseJobTimestamp(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'N/A';
  }

  return formatDurationFromSecondsValue((end.getTime() - start.getTime()) / 1000);
};

const calculateNodeCount = (startTime: string, endTime: string, nodeHours: number) => {
  const start = parseJobTimestamp(startTime);
  const end = parseJobTimestamp(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const runtimeHours = Math.max(0, (end.getTime() - start.getTime()) / 3600000);

  if (runtimeHours <= 0) {
    return null;
  }

  return Math.max(1, Math.round(nodeHours / runtimeHours));
};

const calculateWaitTime = (submitTime?: string, startTime?: string, fallback?: string) => {
  const submit = parseJobTimestamp(submitTime);
  const start = parseJobTimestamp(startTime);

  if (Number.isNaN(submit.getTime()) || Number.isNaN(start.getTime())) {
    return fallback ?? 'N/A';
  }

  return formatDurationFromSecondsValue(
    Math.max(0, (start.getTime() - submit.getTime()) / 1000)
  );
};

const normalizePartition = (qos: string) => {
  if (qos.includes('shared')) {
    return 'shared_gpu_ss11';
  }

  if (qos.includes('regular') || qos.includes('interactive')) {
    return 'gpu_ss11';
  }

  return 'N/A';
};

const generateEnergyStatus = (
  energy: number
): JobGridRow['energyStatus'] => {
  if (energy > 1400) return 'high';
  if (energy > 1100) return 'warning';
  return 'medium';
};

const getIrisAverageGpuUtilization = (
  jobId: number,
  irisGpuUtilizationByJob?: IrisGpuUtilizationByJob
) => {
  const value = irisGpuUtilizationByJob?.[jobId.toString()]?.avgGpuUtilization;

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const getIrisAverageCpuUtilization = (
  jobId: number,
  irisGpuUtilizationByJob?: IrisGpuUtilizationByJob
) => {
  const value = irisGpuUtilizationByJob?.[jobId.toString()]?.avgCpuUtilization;

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const hasIrisGpuUtilizationResponse = (
  jobId: number,
  irisGpuUtilizationByJob?: IrisGpuUtilizationByJob
) => irisGpuUtilizationByJob?.[jobId.toString()] !== undefined;

const hasIrisGpuUtilizationError = (
  jobId: number,
  irisGpuUtilizationByJob?: IrisGpuUtilizationByJob
) => Boolean(irisGpuUtilizationByJob?.[jobId.toString()]?.error);

export const getJobPerformanceSummary = (
  row: JobPerformanceSummaryInput,
  metricsByJob: MetricsByJob | undefined
) => {
  const metricRows = metricsByJob?.[row.jobId] ?? [];
  const snapshot = getPerformanceSnapshot(
    metricRows,
    row.avgGpuUtilization,
    row.cpuUtilization
  );
  const gpuSnapshotSeries = metricRows.length
    ? getFirstAvailableMetricSeries(
      metricRows,
      [
        'nersc_ldms_dcgm_gpu_utilization',
        'nersc_ldms_dcgm_gr_engine_active',
      ],
      normalizePercentMetric
    ).map(clampPercent)
    : [snapshot.gpuUtilization.avg ?? 0];
  const networkPerformance = getNetworkPerformanceSnapshot(
    metricRows,
    gpuSnapshotSeries.length ? gpuSnapshotSeries : [snapshot.gpuUtilization.avg ?? 0]
  );

  if (!metricRows.length) {
    const gpuUtilization = row.avgGpuUtilization === null
      ? 0
      : clampPercent(row.avgGpuUtilization);
    const cpuUtilization = snapshot.cpuUtilization.avg ?? clampPercent(gpuUtilization * 0.7 + 6);
    const memoryUtilization = snapshot.gpuMemoryBandwidth.avg ?? clampPercent(gpuUtilization * 0.78 + 18);
    const idlePercent = clampPercent(
      100 - average([cpuUtilization, gpuUtilization, memoryUtilization])
    );

    return {
      cpuUtilization,
      gpuUtilization,
      memoryUtilization,
      idlePercent,
      snapshot,
      networkPerformance,
    };
  }

  const gpuSeries = gpuSnapshotSeries.length
    ? gpuSnapshotSeries
    : metricRows.map((metric) =>
      clampPercent(Number(metric.nersc_ldms_dcgm_gpu_utilization ?? 0))
    );
  const cpuSeries = gpuSeries.map((gpu, index) =>
    clampPercent(gpu * 0.7 + 6 + 2 * Math.cos(index / 3))
  );
  const dramPoints = metricRows.map((metric) =>
    Number(metric.nersc_ldms_dcgm_dram_active ?? 0)
  );
  const maxDram = Math.max(...dramPoints.map((value) => Math.abs(value)), 1e-12);
  const memorySeries = dramPoints.map((value, index) =>
    clampPercent((Math.abs(value) / maxDram) * 82 + 8 + 2.5 * Math.sin(index / 4))
  );
  const cpuUtilization = average(cpuSeries);
  const gpuUtilization = average(gpuSeries);
  const memoryUtilization = average(memorySeries);
  const idlePercent = clampPercent(
    100 - average([cpuUtilization, gpuUtilization, memoryUtilization])
  );

  return {
    cpuUtilization,
    gpuUtilization,
    memoryUtilization,
    idlePercent,
    snapshot,
    networkPerformance,
  };
};

const buildLegacyRow = (
  job: LegacyUserJobData,
  index: number,
  metricsByJob?: MetricsByJob
): JobGridRow => {
  const fallbackGpuUtilization = getSeededValue(job['Job ID'], 40, 75);
  const energyConsumed = getSeededValue(job['Job ID'] + 17, 800, 1600);
  const performanceSnapshot = getJobPerformanceSummary(
    {
      jobId: job['Job ID'].toString(),
      avgGpuUtilization: fallbackGpuUtilization,
    },
    metricsByJob
  );

  return {
    id: job['Job ID'].toString(),
    submitTime: job['Start Time'],
    startTime: job['Start Time'],
    endTime: job['End Time'],
    jobId: job['Job ID'].toString(),
    jobName: job['Job Name'] ?? `${job.Partition} job`,
    projectId: job.Project,
    nodeHours: job['Charged Node Hours'],
    nodeCount: calculateNodeCount(
      job['Start Time'],
      job['End Time'],
      job['Charged Node Hours']
    ),
    waitTime: fallbackWaitTimes[index % fallbackWaitTimes.length],
    executionTime: formatExecutionTime(job['Start Time'], job['End Time']),
    jobStatus: job['Job Status'] ?? fallbackJobStatuses[index % fallbackJobStatuses.length],
    avgGpuUtilization: Number(performanceSnapshot.gpuUtilization.toFixed(1)),
    cpuUtilization: Number(performanceSnapshot.cpuUtilization.toFixed(1)),
    gpuMemoryUtilization: Number(performanceSnapshot.memoryUtilization.toFixed(1)),
    energyConsumed,
    energyStatus: generateEnergyStatus(energyConsumed),
    qos: job.QOS,
    user: job.User,
    partition: job.Partition,
    hostname: job.Hostname,
  };
};

const buildIrisRow = (
  job: IrisJobData,
  index: number,
  irisGpuUtilizationByJob?: IrisGpuUtilizationByJob,
  irisGpuUtilizationStatus: IrisGpuUtilizationFetchStatus = 'idle'
): JobGridRow => {
  const fetchedGpuUtilization = getIrisAverageGpuUtilization(
    job['Job ID'],
    irisGpuUtilizationByJob
  );
  const fetchedCpuUtilization = getIrisAverageCpuUtilization(
    job['Job ID'],
    irisGpuUtilizationByJob
  );
  const hasGpuUtilizationResponse = hasIrisGpuUtilizationResponse(
    job['Job ID'],
    irisGpuUtilizationByJob
  );
  const hasGpuUtilizationError = hasIrisGpuUtilizationError(
    job['Job ID'],
    irisGpuUtilizationByJob
  );
  const gpuUtilizationStatus: MetricFetchStatus = fetchedGpuUtilization !== undefined
    ? 'success'
    : hasGpuUtilizationResponse || hasGpuUtilizationError || irisGpuUtilizationStatus === 'error'
      ? 'failed'
      : 'loading';
  const cpuUtilizationStatus: MetricFetchStatus = fetchedCpuUtilization !== undefined
    ? 'success'
    : hasGpuUtilizationResponse || hasGpuUtilizationError || irisGpuUtilizationStatus === 'error'
      ? 'failed'
      : 'loading';
  const performanceSnapshot = getJobPerformanceSummary(
    {
      jobId: job['Job ID'].toString(),
      avgGpuUtilization: fetchedGpuUtilization ?? null,
    },
    undefined
  );
  const energyConsumed = Number(job['Energy consumed'] ?? 0);
  const nodeHours = Number(job['Node hours charged'] ?? 0);
  const nodeCountRaw = job['No. of nodes Allocated'];
  const nodeCount = Number.isFinite(nodeCountRaw) ? Math.round(nodeCountRaw ?? 0) : null;

  return {
    id: job['Job ID'].toString(),
    submitTime: job['Submit Time'] ?? job['Start Time'],
    startTime: job['Start Time'],
    endTime: job['End Time'],
    jobId: job['Job ID'].toString(),
    jobName: job['Job Name'] ?? 'Untitled job',
    projectId: job.Project,
    nodeHours,
    nodeCount,
    waitTime: calculateWaitTime(
      job['Submit Time'],
      job['Start Time'],
      fallbackWaitTimes[index % fallbackWaitTimes.length]
    ),
    executionTime: Number(job['Elapsed secs']) > 0
      ? formatDurationFromSeconds(job['Elapsed secs'])
      : formatExecutionTime(job['Start Time'], job['End Time']),
    jobStatus: job.State ?? fallbackJobStatuses[index % fallbackJobStatuses.length],
    avgGpuUtilization: gpuUtilizationStatus === 'success'
      ? Number(performanceSnapshot.gpuUtilization.toFixed(1))
      : null,
    cpuUtilization: cpuUtilizationStatus === 'success'
      ? Number((fetchedCpuUtilization ?? 0).toFixed(1))
      : null,
    gpuMemoryUtilization: gpuUtilizationStatus === 'success'
      ? Number(performanceSnapshot.memoryUtilization.toFixed(1))
      : null,
    gpuUtilizationStatus,
    cpuUtilizationStatus,
    energyConsumed,
    energyStatus: generateEnergyStatus(energyConsumed),
    qos: job.QOS,
    user: 'N/A',
    partition: normalizePartition(job.QOS.toLowerCase()),
    hostname: 'perlmutter gpu',
  };
};

const getSortTimestamp = (row: JobGridRow) => {
  const submitTime = parseJobTimestamp(row.submitTime);
  const startTime = parseJobTimestamp(row.startTime);

  if (!Number.isNaN(submitTime.getTime())) {
    return submitTime.getTime();
  }

  if (!Number.isNaN(startTime.getTime())) {
    return startTime.getTime();
  }

  return 0;
};

export const buildRecentJobPerformanceRows = ({
  legacyJobs,
  irisJobs,
  metricsByJob,
  irisGpuUtilizationByJob,
  irisGpuUtilizationStatus = 'idle',
}: BuildRecentJobRowsInput): JobGridRow[] => {
  const mergedRows = new Map<string, JobGridRow>();

  (legacyJobs ?? []).forEach((job, index) => {
    const row = buildLegacyRow(job, index, metricsByJob);
    mergedRows.set(row.id, row);
  });

  (irisJobs ?? []).forEach((job, index) => {
    const row = buildIrisRow(
      job,
      index,
      irisGpuUtilizationByJob,
      irisGpuUtilizationStatus
    );
    mergedRows.set(row.id, row);
  });

  return Array.from(mergedRows.values()).sort(
    (left, right) => getSortTimestamp(right) - getSortTimestamp(left)
  );
};

export const findUserJobMetadataById = (
  jobId: string,
  legacyJobs?: LegacyUserJobData[],
  irisJobs?: IrisJobData[]
) => {
  const legacyJob = (legacyJobs ?? []).find(
    (job) => job['Job ID'].toString() === jobId
  );

  if (legacyJob) {
    return legacyJob;
  }

  const irisJob = (irisJobs ?? []).find(
    (job) => job['Job ID'].toString() === jobId
  );

  if (!irisJob) {
    return undefined;
  }

  return {
    'Job ID': irisJob['Job ID'],
    Project: irisJob.Project,
    QOS: irisJob.QOS,
  };
};

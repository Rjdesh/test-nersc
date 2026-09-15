export interface IrisGpuUtilizationCache {
  expiresAt: number;
  payload: string;
}

export interface SfApiCredentials {
  clientId: string;
  privateKey: Record<string, string>;
}

export interface LdmsTaskResponse {
  task_id?: string;
}

export interface LdmsTaskResultResponse {
  task_status?: string;
  task_result?: {
    result_status?: string;
    result_context?: string;
    data?: string;
    error?: unknown;
  };
}

export interface MetricRecord {
  [key: string]: unknown;
}

export interface FetchJobMetricRecordsOptions {
  aggregation?: string;
  timewindow?: number;
  timewindowUnit?: string;
}

export interface IrisJobPerformanceSummary {
  jobId: number;
  avgGpuUtilization: number | null;
  avgCpuUtilization: number | null;
  gpuSampleCount: number;
  cpuSampleCount: number;
  gpuMetricName: string;
  cpuMetricName: string;
  error?: string;
}

export interface JobMetricSummaryValue {
  average: number | null;
  metricName: string | null;
  sampleCount: number;
}

export interface JobMetricSeriesPoint {
  x: number;
  y: number;
}

export interface JobMetricsSummary {
  avgCpuPower: number | null;
  avgGpuMemoryBandwidth: number | null;
  avgGpuUtilization: number | null;
  avgNodePower: number | null;
  error?: string;
  jobId: string;
  machineId: string;
  sampleCounts: Partial<Record<
    'avgCpuPower' | 'avgGpuMemoryBandwidth' | 'avgGpuUtilization' | 'avgNodePower',
    number
  >>;
  series?: Partial<Record<'gpuUtilization' | 'nodePower' | 'cpuPower', JobMetricSeriesPoint[]>>;
  records?: Partial<Record<'gpuUtilization' | 'nodePower' | 'cpuPower', MetricRecord[]>>;
  userId: string;
}

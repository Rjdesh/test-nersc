export type JobMetricSource = 'metrics' | 'power';

export interface JobMetricDefinition {
  displayName: string;
  apiMetricName: string;
  source: JobMetricSource;
}

// Keep display labels and LDMS metric identifiers together so API requests and UI copy cannot drift.
export const JOB_METRIC_DEFINITIONS = {
  gpuUtilization: {
    displayName: 'GPU Utilization',
    apiMetricName: 'nersc_ldms_dcgm_gr_engine_active',
    source: 'metrics',
  },
  gpuMemoryBandwidth: {
    displayName: 'GPU memory throughput',
    apiMetricName: 'nersc_ldms_dcgm_dram_active',
    source: 'metrics',
  },
  nodePower: {
    displayName: 'Node power',
    apiMetricName: 'node_power',
    source: 'power',
  },
  cpuPower: {
    displayName: 'CPU power',
    apiMetricName: 'cpu_power',
    source: 'power',
  },
} as const satisfies Record<string, JobMetricDefinition>;

export const JOB_METRICS_API_METRICS = Object.values(JOB_METRIC_DEFINITIONS)
  .filter((definition) => definition.source === 'metrics')
  .map((definition) => definition.apiMetricName);

export const JOB_POWER_API_METRICS = Object.values(JOB_METRIC_DEFINITIONS)
  .filter((definition) => definition.source === 'power')
  .map((definition) => definition.apiMetricName);

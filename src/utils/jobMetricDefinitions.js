// Keep display labels and LDMS metric identifiers together so API requests and UI copy cannot drift.
export const JOB_METRIC_DEFINITIONS = {
    gpuUtilization: {
        displayName: 'GPU Utilization',
        apiMetricName: 'nersc_ldms_dcgm_gr_engine_active',
        source: 'metrics',
    },
    cpuUtilization: {
        displayName: 'CPU Utilization',
        apiMetricName: 'nersc_ldms_meminfo_Active',
        source: 'metrics',
    },
    gpuMemoryBandwidth: {
        displayName: 'GPU memory throughput',
        apiMetricName: 'nersc_ldms_dcgm_dram_active',
        source: 'metrics',
    },
    cpuMemoryBandwidth: {
        displayName: 'CPU Memory Bandwidth',
        apiMetricName: 'nersc_ldms_cpu_memory_bandwidth',
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
};
export const JOB_METRICS_API_METRICS = Object.values(JOB_METRIC_DEFINITIONS)
    .filter((definition) => definition.source === 'metrics')
    .map((definition) => definition.apiMetricName);
export const JOB_POWER_API_METRICS = Object.values(JOB_METRIC_DEFINITIONS)
    .filter((definition) => definition.source === 'power')
    .map((definition) => definition.apiMetricName);

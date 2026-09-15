export const IRIS_GPU_UTILIZATION_API_PATH = '/api/user-job-performance/iris-gpu-utilization';
export const JOB_GPU_MEMORY_API_PATH = '/api/user-job-performance/job-gpu-memory';
export const JOB_METRICS_SUMMARY_API_PATH = '/api/user-job-performance/job-metrics-summary';
export const JOB_METADATA_TASK_API_PATH = '/api/user-job-performance/job-metadata-task';
export const NERSC_JOB_DETAILS_API_PATH = '/api/user-job-performance/nersc-job-details';
export const TOKEN_URL = 'https://oidc.nersc.gov/c2id/token';
export const LDMS_API_URL = 'https://perfmon.nersc.gov/api/v1';
export const NERSC_COMPUTE_API_URL = 'https://api.nersc.gov/api/v1.2/compute/jobs/perlmutter';
export const GPU_UTILIZATION_METRIC = 'nersc_ldms_dcgm_gr_engine_active';
export const CPU_UTILIZATION_METRIC = 'nersc_ldms_meminfo_Active';
export const GPU_MEMORY_METRIC = 'nersc_ldms_dcgm_fb_used';
export const CPU_UTILIZATION_METRIC_ALIASES = [
    'nersc_ldms_dcgm_cpu_utilization',
    'nersc_ldms_cpu_utilization',
    CPU_UTILIZATION_METRIC,
];
export const GPU_MEMORY_BANDWIDTH_METRIC = 'nersc_ldms_dcgm_dram_active';
export const CPU_MEMORY_BANDWIDTH_METRIC_ALIASES = [
    'nersc_ldms_cpu_memory_bandwidth',
];
export const NODE_POWER_METRIC_ALIASES = [
    'nersc_ldms_node_power',
];
export const GPU_UTILIZATION_VALUE_SCALE = 100;
export const CPU_UTILIZATION_VALUE_SCALE = 1;
export const GPU_MEMORY_BANDWIDTH_VALUE_SCALE = 100;
export const CPU_MEMORY_BANDWIDTH_VALUE_SCALE = 100;
export const NODE_POWER_VALUE_SCALE = 1;
export const DEFAULT_NERSC_USER_ID = 'rjdesh';
export const DEFAULT_MACHINE_ID = 'perlmutter gpu';
export const TASK_POLL_RETRIES = 30;
export const TASK_POLL_INTERVAL_MS = 5000;
export const JOB_FETCH_CONCURRENCY = 2;
export const CACHE_TTL_MS = 300000;

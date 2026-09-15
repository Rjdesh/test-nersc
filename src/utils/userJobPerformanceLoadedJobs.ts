import { getApiUrl } from './api';

export interface LoadedNerscJobData {
  account?: string;
  allocnodes?: number | string;
  consumedenergy?: number | string;
  consumedenergyraw?: number | string;
  created_at?: string;
  elapsedraw?: number | string;
  end?: string;
  jobid?: number | string;
  jobidraw?: number | string;
  jobname?: string;
  machine?: string;
  nodelist?: string;
  nnodes?: number | string;
  partition?: string;
  qos?: string;
  start?: string;
  state?: string;
  submit?: string;
  task_id?: string;
  user?: string;
  [key: string]: unknown;
}

interface LoadedJobCacheEntry {
  fetchedAt: string;
  job: LoadedNerscJobData;
  jobId: string;
}

interface LoadedJobCachePayload {
  jobs: Record<string, LoadedJobCacheEntry>;
  version: 1;
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
  series?: Partial<Record<'gpuUtilization' | 'nodePower' | 'cpuPower', Array<{ x: number; y: number }>>>;
  records?: Partial<Record<'gpuUtilization' | 'nodePower' | 'cpuPower', Array<Record<string, unknown>>>>;
  userId: string;
}

interface LoadedMetricCacheEntry {
  fetchedAt: string;
  jobId: string;
  summary: JobMetricsSummary;
}

interface LoadedMetricsCachePayload {
  jobs: Record<string, LoadedMetricCacheEntry>;
  version: 1;
}

interface NerscJobApiResponse {
  error?: unknown;
  output?: LoadedNerscJobData | LoadedNerscJobData[] | null;
  status?: string;
}

interface JobMetadataTaskApiResponse {
  error?: string;
  task_id?: string;
}

interface JobMetricsSummaryApiResponse extends JobMetricsSummary {
  error?: string;
}

const LOADED_JOBS_CACHE_KEY = 'user-job-performance-loaded-jobs-v1';
// v4 includes raw returned metric rows and timestamp-averaged compact series for quick-view charts.
const LOADED_JOB_METRICS_CACHE_KEY = 'user-job-performance-loaded-job-metrics-v4';
const SELECTED_USER_CACHE_KEY = 'user-job-performance-selected-user-v1';

const getBrowserStorage = () => (
  typeof window === 'undefined' ? null : window.localStorage
);

const getJobId = (job: LoadedNerscJobData) => {
  const rawJobId = job.jobid ?? job.jobidraw;

  return rawJobId === undefined || rawJobId === null ? '' : String(rawJobId).trim();
};

const readCachePayload = (): LoadedJobCachePayload => {
  const storage = getBrowserStorage();

  if (!storage) {
    return { jobs: {}, version: 1 };
  }

  const cachedValue = storage.getItem(LOADED_JOBS_CACHE_KEY);

  if (!cachedValue) {
    return { jobs: {}, version: 1 };
  }

  try {
    const parsedValue = JSON.parse(cachedValue) as LoadedJobCachePayload;
    return parsedValue?.jobs ? parsedValue : { jobs: {}, version: 1 };
  } catch {
    return { jobs: {}, version: 1 };
  }
};

const writeCachePayload = (payload: LoadedJobCachePayload) => {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  storage.setItem(LOADED_JOBS_CACHE_KEY, JSON.stringify(payload));
};

const readMetricsCachePayload = (): LoadedMetricsCachePayload => {
  const storage = getBrowserStorage();

  if (!storage) {
    return { jobs: {}, version: 1 };
  }

  const cachedValue = storage.getItem(LOADED_JOB_METRICS_CACHE_KEY);

  if (!cachedValue) {
    return { jobs: {}, version: 1 };
  }

  try {
    const parsedValue = JSON.parse(cachedValue) as LoadedMetricsCachePayload;
    return parsedValue?.jobs ? parsedValue : { jobs: {}, version: 1 };
  } catch {
    return { jobs: {}, version: 1 };
  }
};

const writeMetricsCachePayload = (payload: LoadedMetricsCachePayload) => {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  storage.setItem(LOADED_JOB_METRICS_CACHE_KEY, JSON.stringify(payload));
};

export const readSelectedUserBrowserCache = () => {
  const storage = getBrowserStorage();

  return storage?.getItem(SELECTED_USER_CACHE_KEY)?.trim() ?? '';
};

export const writeSelectedUserBrowserCache = (userId: string) => {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  const normalizedUserId = userId.trim();

  if (normalizedUserId) {
    storage.setItem(SELECTED_USER_CACHE_KEY, normalizedUserId);
  } else {
    storage.removeItem(SELECTED_USER_CACHE_KEY);
  }
};

export const clearLoadedJobPerformanceBrowserCache = () => {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(LOADED_JOBS_CACHE_KEY);
  storage.removeItem(LOADED_JOB_METRICS_CACHE_KEY);
};

const extractJobRecord = (
  jobId: string,
  responsePayload: NerscJobApiResponse
): LoadedNerscJobData => {
  const output = responsePayload.output;
  const candidateJob = Array.isArray(output) ? output[0] : output;

  if (!candidateJob || typeof candidateJob !== 'object') {
    throw new Error(
      typeof responsePayload.error === 'string'
        ? responsePayload.error
        : 'No job data returned from the NERSC API.'
    );
  }

  return {
    ...candidateJob,
    jobid: candidateJob.jobid ?? candidateJob.jobidraw ?? jobId,
  };
};

export const parseSelectedJobIds = (value: string) => Array.from(
  new Set(
    value
      .split(',')
      .map((jobId) => jobId.trim())
      .filter(Boolean)
  )
);

export const readLoadedJobsBrowserCache = (): LoadedJobCacheEntry[] => {
  const payload = readCachePayload();

  return Object.values(payload.jobs).sort(
    (left, right) => (
      new Date(right.fetchedAt).getTime() - new Date(left.fetchedAt).getTime()
    )
  );
};

export const mergeLoadedJobsBrowserCache = (jobs: LoadedNerscJobData[]) => {
  const payload = readCachePayload();
  const nextJobs = { ...payload.jobs };
  const fetchedAt = new Date().toISOString();

  jobs.forEach((job) => {
    const jobId = getJobId(job);

    if (!jobId) {
      return;
    }

    nextJobs[jobId] = {
      fetchedAt,
      job,
      jobId,
    };
  });

  writeCachePayload({
    jobs: nextJobs,
    version: 1,
  });
};

export const readLoadedJobMetricsBrowserCache = (): LoadedMetricCacheEntry[] => {
  const payload = readMetricsCachePayload();

  return Object.values(payload.jobs).sort(
    (left, right) => (
      new Date(right.fetchedAt).getTime() - new Date(left.fetchedAt).getTime()
    )
  );
};

export const readLoadedJobMetricsSummary = (jobId: string) => {
  const payload = readMetricsCachePayload();

  return payload.jobs[jobId]?.summary;
};

export const mergeLoadedJobMetricsBrowserCache = (summaries: JobMetricsSummary[]) => {
  const payload = readMetricsCachePayload();
  const nextJobs = { ...payload.jobs };
  const fetchedAt = new Date().toISOString();

  summaries.forEach((summary) => {
    const jobId = summary.jobId.trim();

    if (!jobId) {
      return;
    }

    nextJobs[jobId] = {
      fetchedAt,
      jobId,
      summary,
    };
  });

  writeMetricsCachePayload({
    jobs: nextJobs,
    version: 1,
  });
};

export const fetchNerscJobById = async (jobId: string): Promise<LoadedNerscJobData> => {
  const url = new URL(getApiUrl('/user-job-performance/nersc-job-details'), window.location.origin);
  url.searchParams.set('jobId', jobId);
  const response = await fetch(url.toString());

  if (!response.ok) {
    let errorMessage = '';

    try {
      const payload = await response.clone().json() as { error?: string };
      errorMessage = payload.error ?? '';
    } catch {
      errorMessage = await response.text();
    }

    throw new Error(errorMessage || `Unable to load job ${jobId}.`);
  }

  const payload = await response.json() as NerscJobApiResponse;

  return extractJobRecord(jobId, payload);
};

export const fetchJobMetadataTaskId = async (jobId: string, userId: string) => {
  const response = await fetch(getApiUrl('/user-job-performance/job-metadata-task'), {
    body: JSON.stringify({ jobId, userId }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const payload = await response.json() as JobMetadataTaskApiResponse;

  if (!response.ok || !payload.task_id) {
    throw new Error(payload.error ?? `Unable to load metadata task for job ${jobId}.`);
  }

  return payload.task_id;
};

export const fetchJobMetricsSummary = async (
  jobId: string,
  options?: {
    machineId?: string;
    userId?: string;
  }
) => {
  const url = new URL(
    getApiUrl('/user-job-performance/job-metrics-summary'),
    window.location.origin
  );
  url.searchParams.set('jobId', jobId);

  if (options?.userId) {
    url.searchParams.set('userId', options.userId);
  }

  if (options?.machineId) {
    url.searchParams.set('machineId', options.machineId);
  }

  const response = await fetch(url.toString());
  const payload = await response.json() as JobMetricsSummaryApiResponse;

  if (!response.ok || !payload.jobId) {
    throw new Error(payload.error ?? `Unable to load metrics for job ${jobId}.`);
  }

  mergeLoadedJobMetricsBrowserCache([payload]);
  return payload;
};

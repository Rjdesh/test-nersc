import { createPrivateKey, createSign, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

const IRIS_GPU_UTILIZATION_API_PATH = '/api/user-job-performance/iris-gpu-utilization';
const JOB_GPU_MEMORY_API_PATH = '/api/user-job-performance/job-gpu-memory';
const TOKEN_URL = 'https://oidc.nersc.gov/c2id/token';
const LDMS_API_URL = 'https://perfmon.nersc.gov/api/v1';
const GPU_UTILIZATION_METRIC = 'nersc_ldms_dcgm_gr_engine_active';
const CPU_UTILIZATION_METRIC = 'nersc_ldms_meminfo_Active';
const GPU_MEMORY_METRIC = 'nersc_ldms_dcgm_fb_used';
const GPU_UTILIZATION_VALUE_SCALE = 100;
const CPU_UTILIZATION_VALUE_SCALE = 1;
const DEFAULT_NERSC_USER_ID = 'rjdesh';
const DEFAULT_MACHINE_ID = 'perlmutter gpu';
const TASK_POLL_RETRIES = 30;
const TASK_POLL_INTERVAL_MS = 5000;
const JOB_FETCH_CONCURRENCY = 2;
const CACHE_TTL_MS = 300000;

interface IrisGpuUtilizationCache {
  expiresAt: number;
  payload: string;
}

interface SfApiCredentials {
  clientId: string;
  privateKey: Record<string, string>;
}

interface LdmsTaskResponse {
  task_id?: string;
}

interface LdmsTaskResultResponse {
  task_status?: string;
  task_result?: {
    result_status?: string;
    result_context?: string;
    data?: string;
    error?: unknown;
  };
}

interface MetricRecord {
  [key: string]: unknown;
}

interface FetchJobMetricRecordsOptions {
  aggregation?: string;
  timewindow?: number;
  timewindowUnit?: string;
}

interface IrisJobPerformanceSummary {
  jobId: number;
  avgGpuUtilization: number | null;
  avgCpuUtilization: number | null;
  gpuSampleCount: number;
  cpuSampleCount: number;
  gpuMetricName: string;
  cpuMetricName: string;
  error?: string;
}

const sendJson = (
  res: ServerResponse,
  statusCode: number,
  payload: unknown
) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const getEnvValue = (
  env: Record<string, string>,
  name: string,
  fallback = ''
) => env[name] || fallback;

const base64UrlJson = (value: unknown) => (
  Buffer.from(JSON.stringify(value)).toString('base64url')
);

const getCredentialsFromEnv = (
  env: Record<string, string>
): SfApiCredentials => {
  const clientId = getEnvValue(env, 'SFAPI_CLIENT_ID');
  const privateKeyJson = getEnvValue(env, 'SFAPI_PRIVATE_KEY_JSON');

  if (!clientId || !privateKeyJson) {
    throw new Error('Set SFAPI_CLIENT_ID and SFAPI_PRIVATE_KEY_JSON in the environment.');
  }

  return {
    clientId,
    privateKey: JSON.parse(privateKeyJson) as Record<string, string>,
  };
};

const signPrivateKeyJwt = (
  credentials: SfApiCredentials
) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({
    alg: 'RS256',
    typ: 'JWT',
  });
  const payload = base64UrlJson({
    iss: credentials.clientId,
    sub: credentials.clientId,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 300,
    jti: randomUUID(),
  });
  const signingInput = `${header}.${payload}`;
  const keyObject = createPrivateKey({
    key: credentials.privateKey,
    format: 'jwk',
  } as Parameters<typeof createPrivateKey>[0]);
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();

  return `${signingInput}.${signer.sign(keyObject).toString('base64url')}`;
};

const fetchAccessToken = async (
  credentials: SfApiCredentials
) => {
  const clientAssertion = signPrivateKeyJwt(credentials);
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: credentials.clientId,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`SF API token request failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) {
    throw new Error('SF API token response did not include access_token.');
  }

  return payload.access_token;
};

const fetchLdmsJson = async <T>(
  accessToken: string,
  pathname: string,
  init: RequestInit = {}
) => {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  if (init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${LDMS_API_URL}${pathname}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(`LDMS request failed for ${pathname}: ${response.status} ${await response.text()}`);
  }

  return await response.json() as T;
};

const wait = (milliseconds: number) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const parseJsonLines = (data: string | undefined) => (
  (data ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MetricRecord)
);

const pollLdmsTask = async (
  accessToken: string,
  taskId: string
) => {
  for (let attempt = 0; attempt < TASK_POLL_RETRIES; attempt += 1) {
    const task = await fetchLdmsJson<LdmsTaskResultResponse>(
      accessToken,
      `/tasks/${taskId}?offset=0&size=0`
    );

    if (task.task_status === 'SUCCESS') {
      const result = task.task_result;
      if (result?.result_status === 'error') {
        throw new Error(`LDMS task ${taskId} failed: ${JSON.stringify(result.error)}`);
      }

      if (result?.result_context !== 'query data') {
        throw new Error(`LDMS task ${taskId} returned unexpected context ${result?.result_context}.`);
      }

      return parseJsonLines(result.data);
    }

    if (task.task_status === 'FAILURE' || task.task_status === 'UNKNOWN') {
      throw new Error(`LDMS task ${taskId} returned status ${task.task_status}.`);
    }

    await wait(TASK_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for LDMS task ${taskId}.`);
};

const averageMetricValue = (
  records: MetricRecord[],
  metricName: string,
  scale: number
) => {
  const values = records
    .map((record) => Number(record[metricName]))
    .filter((value) => Number.isFinite(value));
  const average = values.length
    ? (values.reduce((sum, value) => sum + value, 0) / values.length) * scale
    : null;

  return {
    average: average === null ? null : Number(average.toFixed(1)),
    sampleCount: values.length,
  };
};

const fetchJobMetricRecords = async (
  accessToken: string,
  jobId: number,
  userId: string,
  machineId: string,
  metricName: string,
  options: FetchJobMetricRecordsOptions = {}
) => {
  const {
    aggregation = 'median',
    timewindow = 1,
    timewindowUnit = 's',
  } = options;
  const task = await fetchLdmsJson<LdmsTaskResponse>(
    accessToken,
    '/fetch_metrics',
    {
      method: 'POST',
      body: JSON.stringify({
        userid: userId,
        jobid: String(jobId),
        machineid: machineId,
        metrics_list: [metricName],
        estimate_num_samples_without_fetching_data: false,
        user_defined_slices: null,
        aggr_func_input: {
          aggr_func: aggregation,
          timewindow,
          timewindow_unit: timewindowUnit,
        },
      }),
    }
  );

  if (!task.task_id) {
    throw new Error(`LDMS did not return task_id for job ${jobId}.`);
  }

  return await pollLdmsTask(accessToken, task.task_id);
};

const getSettledAverage = (
  result: PromiseSettledResult<MetricRecord[]>,
  metricName: string,
  scale: number
) => (
  result.status === 'fulfilled'
    ? averageMetricValue(result.value, metricName, scale)
    : { average: null, sampleCount: 0 }
);

const fetchJobPerformanceMetrics = async (
  accessToken: string,
  jobId: number,
  userId: string,
  machineId: string
): Promise<IrisJobPerformanceSummary> => {
  const [gpuResult, cpuResult] = await Promise.allSettled([
    fetchJobMetricRecords(accessToken, jobId, userId, machineId, GPU_UTILIZATION_METRIC),
    fetchJobMetricRecords(accessToken, jobId, userId, machineId, CPU_UTILIZATION_METRIC),
  ]);
  const gpu = getSettledAverage(
    gpuResult,
    GPU_UTILIZATION_METRIC,
    GPU_UTILIZATION_VALUE_SCALE
  );
  const cpu = getSettledAverage(
    cpuResult,
    CPU_UTILIZATION_METRIC,
    CPU_UTILIZATION_VALUE_SCALE
  );
  const errors = [
    gpuResult.status === 'rejected'
      ? `GPU: ${gpuResult.reason instanceof Error ? gpuResult.reason.message : 'Unable to fetch metric.'}`
      : '',
    cpuResult.status === 'rejected'
      ? `CPU: ${cpuResult.reason instanceof Error ? cpuResult.reason.message : 'Unable to fetch metric.'}`
      : '',
  ].filter(Boolean);

  return {
    jobId,
    avgGpuUtilization: gpu.average,
    avgCpuUtilization: cpu.average,
    gpuSampleCount: gpu.sampleCount,
    cpuSampleCount: cpu.sampleCount,
    gpuMetricName: GPU_UTILIZATION_METRIC,
    cpuMetricName: CPU_UTILIZATION_METRIC,
    error: errors.length ? errors.join(' ') : undefined,
  };
};

const loadIrisJobIds = async () => {
  const sourcePath = path.resolve(
    process.cwd(),
    'public/data/user-job-performance/job-data-iris-export.json'
  );
  const source = await readFile(sourcePath, 'utf8');
  const jobs = JSON.parse(source) as Array<Record<string, unknown>>;
  const seen = new Set<number>();
  const jobIds: number[] = [];

  jobs.forEach((job) => {
    const jobId = Number(job['Job ID']);
    if (Number.isFinite(jobId) && !seen.has(jobId)) {
      seen.add(jobId);
      jobIds.push(jobId);
    }
  });

  return jobIds;
};

const mapWithConcurrency = async <T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>
) => {
  const results: U[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    }
  );

  await Promise.all(workers);
  return results;
};

const fetchIrisGpuUtilization = async (
  env: Record<string, string>
) => {
  const credentials = getCredentialsFromEnv(env);
  const accessToken = await fetchAccessToken(credentials);
  const userId = getEnvValue(env, 'NERSC_USER_ID', DEFAULT_NERSC_USER_ID);
  const machineId = getEnvValue(env, 'NERSC_MACHINE_ID', DEFAULT_MACHINE_ID);
  const jobIds = await loadIrisJobIds();
  const summaries = await mapWithConcurrency(
    jobIds,
    JOB_FETCH_CONCURRENCY,
    async (jobId) => {
      try {
        return await fetchJobPerformanceMetrics(accessToken, jobId, userId, machineId);
      } catch (error) {
        return {
          jobId,
          avgGpuUtilization: null,
          avgCpuUtilization: null,
          gpuSampleCount: 0,
          cpuSampleCount: 0,
          gpuMetricName: GPU_UTILIZATION_METRIC,
          cpuMetricName: CPU_UTILIZATION_METRIC,
          error: error instanceof Error ? error.message : 'Unable to fetch job metric.',
        };
      }
    }
  );
  const jobs = Object.fromEntries(
    summaries.map((summary) => [String(summary.jobId), summary])
  );

  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    userId,
    machineId,
    metricNames: [GPU_UTILIZATION_METRIC, CPU_UTILIZATION_METRIC],
    jobs,
  });
};

const fetchJobGpuMemoryMetrics = async (
  env: Record<string, string>,
  jobId: number,
  requestUserId?: string | null,
  requestMachineId?: string | null
) => {
  const credentials = getCredentialsFromEnv(env);
  const accessToken = await fetchAccessToken(credentials);
  const userId = requestUserId || getEnvValue(env, 'NERSC_USER_ID', DEFAULT_NERSC_USER_ID);
  const machineId = requestMachineId || getEnvValue(env, 'NERSC_MACHINE_ID', DEFAULT_MACHINE_ID);
  const records = await fetchJobMetricRecords(
    accessToken,
    jobId,
    userId,
    machineId,
    GPU_MEMORY_METRIC,
    {
      aggregation: 'raw',
      timewindow: 1,
      timewindowUnit: 's',
    }
  );

  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    jobId,
    userId,
    machineId,
    metricName: GPU_MEMORY_METRIC,
    data: records,
  });
};

const irisGpuUtilizationPlugin = (
  env: Record<string, string>
): Plugin => {
  let cache: IrisGpuUtilizationCache | null = null;
  let pendingFetch: Promise<string> | null = null;

  return {
    name: 'iris-gpu-utilization-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        IRIS_GPU_UTILIZATION_API_PATH,
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'Method not allowed' });
            return;
          }

          const requestUrl = new URL(req.url ?? '/', 'http://localhost');
          const forceRefresh = requestUrl.searchParams.get('refresh') === '1';
          const now = Date.now();

          if (!forceRefresh && cache && cache.expiresAt > now) {
            res.setHeader('Content-Type', 'application/json');
            res.end(cache.payload);
            return;
          }

          try {
            if (!pendingFetch) {
              pendingFetch = fetchIrisGpuUtilization(env).finally(() => {
                pendingFetch = null;
              });
            }

            const payload = await pendingFetch;
            cache = {
              payload,
              expiresAt: now + CACHE_TTL_MS,
            };
            res.setHeader('Content-Type', 'application/json');
            res.end(payload);
          } catch (error) {
            sendJson(res, 500, {
              error: error instanceof Error ? error.message : 'Unable to fetch job performance metrics.',
            });
          }
        }
      );
    },
  };
};

const jobGpuMemoryPlugin = (
  env: Record<string, string>
): Plugin => ({
  name: 'job-gpu-memory-api',
  configureServer(server: ViteDevServer) {
    server.middlewares.use(
      JOB_GPU_MEMORY_API_PATH,
      async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        const requestUrl = new URL(req.url ?? '/', 'http://localhost');
        const jobId = Number(requestUrl.searchParams.get('jobId'));

        if (!Number.isFinite(jobId)) {
          sendJson(res, 400, { error: 'jobId query parameter is required.' });
          return;
        }

        try {
          const payload = await fetchJobGpuMemoryMetrics(
            env,
            jobId,
            requestUrl.searchParams.get('userId'),
            requestUrl.searchParams.get('machineId')
          );
          res.setHeader('Content-Type', 'application/json');
          res.end(payload);
        } catch (error) {
          sendJson(res, 500, {
            error: error instanceof Error ? error.message : 'Unable to fetch GPU memory metrics.',
          });
        }
      }
    );
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load private prototype credentials too. They are only used in Vite server middleware.
  const env = {
    ...loadEnv(mode, process.cwd(), ''),
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => (
        typeof entry[1] === 'string'
      ))
    ),
  };

  return {
    plugins: [
      TanStackRouterVite({ autoCodeSplitting: true }),
      react(),
      irisGpuUtilizationPlugin(env),
      jobGpuMemoryPlugin(env),
    ],
    base: env.VITE_BASE_URL,
    server: {
      port: 5175,
      strictPort: true,
    },
  };
});

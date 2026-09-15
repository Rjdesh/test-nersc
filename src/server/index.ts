/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import {
  CACHE_TTL_MS,
  IRIS_GPU_UTILIZATION_API_PATH,
  JOB_GPU_MEMORY_API_PATH,
  JOB_METRICS_SUMMARY_API_PATH,
  JOB_METADATA_TASK_API_PATH,
  NERSC_JOB_DETAILS_API_PATH,
} from './constants.js';
import { loadServerEnv } from './env.js';
import {
  fetchIrisGpuUtilization,
  fetchJobMetadataTaskId,
  fetchJobMetricsSummary,
  fetchJobGpuMemoryMetrics,
  fetchNerscJobDetails,
  NerscApiError,
} from './nerscApi.js';
import type { IrisGpuUtilizationCache } from './types.js';

loadServerEnv();

const SERVER_PORT = Number(process.env.PORT || process.env.API_PORT || '3000');
const DIST_DIR = path.resolve(process.cwd(), 'dist');
const INDEX_HTML_PATH = path.join(DIST_DIR, 'index.html');
const CACHEABLE_ASSET_PATHS = ['/assets/', '/data/'];
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

const env = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string'
  ))
);

const sendJson = (
  res: ServerResponse,
  statusCode: number,
  payload: unknown
) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(payload));
};

const setSuccessHeaders = (res: ServerResponse) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
};

const readJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString('utf8').trim();

  if (!body) {
    return null;
  }

  return JSON.parse(body) as unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const setContentTypeHeader = (res: ServerResponse, filePath: string) => {
  const extension = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME_TYPES[extension] ?? 'application/octet-stream');
};

const isCacheableAssetPath = (pathname: string) => (
  CACHEABLE_ASSET_PATHS.some((assetPath) => pathname.startsWith(assetPath))
);

const resolveStaticFilePath = (pathname: string) => {
  const sanitizedPath = pathname.replace(/^\/+/, '');
  const normalizedPath = path.normalize(sanitizedPath);
  const absolutePath = path.resolve(DIST_DIR, normalizedPath);

  if (!absolutePath.startsWith(DIST_DIR)) {
    return null;
  }

  return absolutePath;
};

const serveStaticFile = async (
  res: ServerResponse,
  filePath: string,
  pathname: string
) => {
  try {
    const fileContents = await readFile(filePath);
    res.statusCode = 200;
    setContentTypeHeader(res, filePath);
    if (isCacheableAssetPath(pathname)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    res.end(fileContents);
    return true;
  } catch {
    return false;
  }
};

const serveFrontend = async (
  req: IncomingMessage,
  res: ServerResponse,
  requestUrl: URL
) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const candidatePath = requestUrl.pathname === '/'
    ? INDEX_HTML_PATH
    : resolveStaticFilePath(requestUrl.pathname);

  if (candidatePath && await serveStaticFile(res, candidatePath, requestUrl.pathname)) {
    return;
  }

  if (await serveStaticFile(res, INDEX_HTML_PATH, '/index.html')) {
    return;
  }

  sendJson(res, 500, { error: 'Frontend build is unavailable.' });
};

let cache: IrisGpuUtilizationCache | null = null;
let pendingFetch: Promise<string> | null = null;

const handleIrisGpuUtilization = async (
  req: IncomingMessage,
  res: ServerResponse,
  requestUrl: URL
) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const forceRefresh = requestUrl.searchParams.get('refresh') === '1';
  const now = Date.now();

  if (!forceRefresh && cache && cache.expiresAt > now) {
    setSuccessHeaders(res);
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
    setSuccessHeaders(res);
    res.end(payload);
  } catch (error) {
    console.error('[api] GPU utilization request failed', error, '\n');
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unable to fetch job performance metrics.',
    });
  }
};

const handleJobGpuMemory = async (
  req: IncomingMessage,
  res: ServerResponse,
  requestUrl: URL
) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

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
    setSuccessHeaders(res);
    res.end(payload);
  } catch (error) {
    console.error(`[api] GPU memory request failed for job ${jobId}`, error, '\n');
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unable to fetch GPU memory metrics.',
    });
  }
};

const handleJobMetricsSummary = async (
  req: IncomingMessage,
  res: ServerResponse,
  requestUrl: URL
) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const jobId = requestUrl.searchParams.get('jobId')?.trim();

  if (!jobId) {
    sendJson(res, 400, { error: 'jobId query parameter is required.' });
    return;
  }

  console.info(
    `[api] request GET ${JOB_METRICS_SUMMARY_API_PATH} jobId=${jobId} userId=${requestUrl.searchParams.get('userId') ?? ''} machineId=${requestUrl.searchParams.get('machineId') ?? ''}\n`
  );

  try {
    const payload = await fetchJobMetricsSummary(
      env,
      jobId,
      requestUrl.searchParams.get('userId'),
      requestUrl.searchParams.get('machineId')
    );
    console.info(
      `[api] response GET ${JOB_METRICS_SUMMARY_API_PATH} 200: ${payload}\n`
    );
    setSuccessHeaders(res);
    res.end(payload);
  } catch (error) {
    const payload = {
      error: error instanceof Error ? error.message : String(error),
    };
    console.error(
      `[api] response GET ${JOB_METRICS_SUMMARY_API_PATH} 500: ${JSON.stringify(payload)}\n`
    );
    sendJson(res, 500, payload);
  }
};

const handleJobMetadataTask = async (
  req: IncomingMessage,
  res: ServerResponse
) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const payload = await readJsonBody(req);

    if (!isRecord(payload)) {
      sendJson(res, 400, { error: 'A JSON request body is required.' });
      return;
    }

    const jobId = typeof payload.jobId === 'string' || typeof payload.jobId === 'number'
      ? String(payload.jobId).trim()
      : '';
    const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';

    if (!jobId || !userId) {
      sendJson(res, 400, { error: 'jobId and userId are required.' });
      return;
    }

    const { machineId, taskId } = await fetchJobMetadataTaskId(env, jobId, userId);
    sendJson(res, 200, {
      jobId,
      machineId,
      task_id: taskId,
      userId,
    });
  } catch (error) {
    console.error('[api] Job metadata task request failed', error, '\n');
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unable to fetch the job metadata task.',
    });
  }
};

const handleNerscJobDetails = async (
  req: IncomingMessage,
  res: ServerResponse,
  requestUrl: URL
) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const jobId = requestUrl.searchParams.get('jobId')?.trim();

  if (!jobId) {
    sendJson(res, 400, { error: 'jobId query parameter is required.' });
    return;
  }

  try {
    sendJson(res, 200, await fetchNerscJobDetails(env, jobId));
  } catch (error) {
    console.error(`[api] NERSC job details request failed for ${jobId}`, error, '\n');
    sendJson(res, error instanceof NerscApiError ? error.status : 500, {
      error: error instanceof Error ? error.message : 'Unable to fetch NERSC job details.',
    });
  }
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (requestUrl.pathname === IRIS_GPU_UTILIZATION_API_PATH) {
    await handleIrisGpuUtilization(req, res, requestUrl);
    return;
  }

  if (requestUrl.pathname === JOB_GPU_MEMORY_API_PATH) {
    await handleJobGpuMemory(req, res, requestUrl);
    return;
  }

  if (requestUrl.pathname === JOB_METRICS_SUMMARY_API_PATH) {
    await handleJobMetricsSummary(req, res, requestUrl);
    return;
  }

  if (requestUrl.pathname === JOB_METADATA_TASK_API_PATH) {
    await handleJobMetadataTask(req, res);
    return;
  }

  if (requestUrl.pathname === NERSC_JOB_DETAILS_API_PATH) {
    await handleNerscJobDetails(req, res, requestUrl);
    return;
  }

  await serveFrontend(req, res, requestUrl);
});

server.listen(SERVER_PORT, '0.0.0.0');

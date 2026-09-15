/* eslint-disable no-console */
import { createPrivateKey, createSign, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CPU_UTILIZATION_METRIC, CPU_UTILIZATION_VALUE_SCALE, DEFAULT_MACHINE_ID, DEFAULT_NERSC_USER_ID, GPU_MEMORY_METRIC, GPU_MEMORY_BANDWIDTH_VALUE_SCALE, GPU_UTILIZATION_METRIC, GPU_UTILIZATION_VALUE_SCALE, JOB_FETCH_CONCURRENCY, LDMS_API_URL, NERSC_COMPUTE_API_URL, NODE_POWER_VALUE_SCALE, TASK_POLL_INTERVAL_MS, TASK_POLL_RETRIES, TOKEN_URL, } from './constants.js';
import { JOB_METRIC_DEFINITIONS, JOB_METRICS_API_METRICS } from './jobMetricDefinitions.js';
const getEnvValue = (env, name, fallback = '') => env[name] || fallback;
const base64UrlJson = (value) => (Buffer.from(JSON.stringify(value)).toString('base64url'));
const getCredentialsFromEnv = (env) => {
    const clientId = getEnvValue(env, 'SFAPI_CLIENT_ID');
    const privateKeyJson = getEnvValue(env, 'SFAPI_PRIVATE_KEY_JSON');
    if (!clientId || !privateKeyJson) {
        throw new Error('Set SFAPI_CLIENT_ID and SFAPI_PRIVATE_KEY_JSON in the environment.');
    }
    return {
        clientId,
        privateKey: JSON.parse(privateKeyJson),
    };
};
const getOriginalErrorMessage = (error, fallback) => {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (error === undefined || error === null) {
        return fallback;
    }
    return JSON.stringify(error);
};
export class NerscApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.name = 'NerscApiError';
        this.status = status;
    }
}
const signPrivateKeyJwt = (credentials) => {
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
    });
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    return `${signingInput}.${signer.sign(keyObject).toString('base64url')}`;
};
const fetchAccessToken = async (credentials) => {
    const startedAt = Date.now();
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
        const responseText = await response.text();
        console.error(`[nersc] response POST OIDC token endpoint ${response.status} (${Date.now() - startedAt}ms): ${responseText}\n`);
        throw new Error(`SF API token request failed: ${response.status} ${responseText}`);
    }
    const payload = await response.json();
    if (!payload.access_token) {
        throw new Error('SF API token response did not include access_token.');
    }
    return payload.access_token;
};
const fetchLdmsJson = async (accessToken, pathname, init = {}) => {
    const startedAt = Date.now();
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    if (init.body) {
        headers.set('Content-Type', 'application/json');
    }
    console.info(`[nersc] request ${method} LDMS ${pathname}${init.body ? ` body=${String(init.body)}` : ''}\n`);
    const response = await fetch(`${LDMS_API_URL}${pathname}`, {
        ...init,
        headers,
    });
    const responseText = await response.text();
    console.info(`[nersc] response ${method} LDMS ${pathname} ${response.status} (${Date.now() - startedAt}ms): ${responseText}\n`);
    if (!response.ok) {
        throw new Error(responseText || response.statusText);
    }
    return JSON.parse(responseText);
};
const wait = (milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
});
const parseJsonLines = (data) => ((data ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line)));
const pollLdmsTask = async (accessToken, taskId) => {
    for (let attempt = 0; attempt < TASK_POLL_RETRIES; attempt += 1) {
        const task = await fetchLdmsJson(accessToken, `/tasks/${taskId}?offset=0&size=0`);
        if (task.task_status === 'SUCCESS') {
            const result = task.task_result;
            if (result?.result_status === 'error') {
                throw new Error(getOriginalErrorMessage(result.error, 'LDMS task failed.'));
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
const averageMetricValue = (records, metricName, scale, fractionDigits = 1) => {
    const values = records
        .map((record) => Number(record[metricName]))
        .filter((value) => Number.isFinite(value));
    const average = values.length
        ? (values.reduce((sum, value) => sum + value, 0) / values.length) * scale
        : null;
    return {
        average: average === null ? null : Number(average.toFixed(fractionDigits)),
        sampleCount: values.length,
    };
};
const metricSeriesValues = (records, metricName, scale, fractionDigits = 1) => {
    const groups = new Map();
    records.forEach((record, index) => {
        const value = Number(record[metricName]);
        if (!Number.isFinite(value)) {
            return;
        }
        const rawTimestamp = record.timestamp;
        const timestampValue = typeof rawTimestamp === 'number'
            ? rawTimestamp
            : typeof rawTimestamp === 'string'
                ? (() => {
                    const numericTimestamp = Number(rawTimestamp);
                    return Number.isFinite(numericTimestamp) ? numericTimestamp : Date.parse(rawTimestamp);
                })()
                : null;
        const hasTimestamp = timestampValue !== null && Number.isFinite(timestampValue);
        const key = hasTimestamp ? String(timestampValue) : `record-${index}`;
        const existingGroup = groups.get(key);
        if (existingGroup) {
            existingGroup.values.push(value);
            return;
        }
        groups.set(key, {
            order: index,
            timestampValue: hasTimestamp ? timestampValue : null,
            values: [value],
        });
    });
    return Array.from(groups.values())
        .sort((left, right) => {
        if (left.timestampValue !== null && right.timestampValue !== null) {
            return left.timestampValue - right.timestampValue;
        }
        return left.order - right.order;
    })
        .map((group, index) => {
        const average = group.values.reduce((sum, value) => sum + value, 0) / group.values.length;
        return {
            x: group.timestampValue ?? index + 1,
            y: Number((average * scale).toFixed(fractionDigits)),
        };
    });
};
const fetchJobMetricRecords = async (accessToken, jobId, userId, machineId, metricName, options = {}) => {
    const { aggregation = 'median', timewindow = 1, timewindowUnit = 's', } = options;
    const task = await fetchLdmsJson(accessToken, '/fetch_metrics', {
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
    });
    if (!task.task_id) {
        throw new Error(`LDMS did not return task_id for job ${jobId}.`);
    }
    return pollLdmsTask(accessToken, task.task_id);
};
const fetchJobPowerMetricRecords = async (accessToken, jobId, userId, machineId, metricName, options = {}) => {
    const { aggregation = 'median', timewindow = 1, timewindowUnit = 's', } = options;
    const task = await fetchLdmsJson(accessToken, '/fetch_power_metrics', {
        method: 'POST',
        body: JSON.stringify({
            userid: userId,
            jobid: String(jobId),
            machineid: machineId,
            metric: metricName,
            estimate_num_samples_without_fetching_data: false,
            user_defined_slices: null,
            aggr_func_input: {
                aggr_func: aggregation,
                timewindow,
                timewindow_unit: timewindowUnit,
            },
        }),
    });
    if (!task.task_id) {
        throw new Error(`LDMS did not return task_id for power metric ${metricName} on job ${jobId}.`);
    }
    return pollLdmsTask(accessToken, task.task_id);
};
const fetchJobMetricsRecords = async (accessToken, jobId, userId, machineId, metricNames, options = {}) => {
    const { aggregation = 'median', timewindow = 1, timewindowUnit = 's', } = options;
    const task = await fetchLdmsJson(accessToken, '/fetch_metrics', {
        method: 'POST',
        body: JSON.stringify({
            userid: userId,
            jobid: String(jobId),
            machineid: machineId,
            metrics_list: metricNames,
            estimate_num_samples_without_fetching_data: false,
            user_defined_slices: null,
            aggr_func_input: {
                aggr_func: aggregation,
                timewindow,
                timewindow_unit: timewindowUnit,
            },
        }),
    });
    if (!task.task_id) {
        throw new Error(`LDMS did not return task_id for job ${jobId}.`);
    }
    return pollLdmsTask(accessToken, task.task_id);
};
const getSettledAverage = (result, metricName, scale) => (result.status === 'fulfilled'
    ? averageMetricValue(result.value, metricName, scale)
    : { average: null, sampleCount: 0 });
const fetchJobPerformanceMetrics = async (accessToken, jobId, userId, machineId) => {
    const [gpuResult, cpuResult] = await Promise.allSettled([
        fetchJobMetricRecords(accessToken, jobId, userId, machineId, GPU_UTILIZATION_METRIC),
        fetchJobMetricRecords(accessToken, jobId, userId, machineId, CPU_UTILIZATION_METRIC),
    ]);
    const gpu = getSettledAverage(gpuResult, GPU_UTILIZATION_METRIC, GPU_UTILIZATION_VALUE_SCALE);
    const cpu = getSettledAverage(cpuResult, CPU_UTILIZATION_METRIC, CPU_UTILIZATION_VALUE_SCALE);
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
    const sourcePath = path.resolve(process.cwd(), 'public/data/user-job-performance/job-data-iris-export.json');
    const source = await readFile(sourcePath, 'utf8');
    const jobs = JSON.parse(source);
    const seen = new Set();
    const jobIds = [];
    jobs.forEach((job) => {
        const jobId = Number(job['Job ID']);
        if (Number.isFinite(jobId) && !seen.has(jobId)) {
            seen.add(jobId);
            jobIds.push(jobId);
        }
    });
    return jobIds;
};
const mapWithConcurrency = async (items, concurrency, mapper) => {
    const results = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex]);
        }
    });
    await Promise.all(workers);
    return results;
};
export const fetchIrisGpuUtilization = async (env) => {
    const credentials = getCredentialsFromEnv(env);
    const accessToken = await fetchAccessToken(credentials);
    const userId = getEnvValue(env, 'NERSC_USER_ID', DEFAULT_NERSC_USER_ID);
    const machineId = getEnvValue(env, 'NERSC_MACHINE_ID', DEFAULT_MACHINE_ID);
    const jobIds = await loadIrisJobIds();
    const summaries = await mapWithConcurrency(jobIds, JOB_FETCH_CONCURRENCY, async (jobId) => {
        try {
            return await fetchJobPerformanceMetrics(accessToken, jobId, userId, machineId);
        }
        catch (error) {
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
    });
    const jobs = Object.fromEntries(summaries.map((summary) => [String(summary.jobId), summary]));
    return JSON.stringify({
        generatedAt: new Date().toISOString(),
        userId,
        machineId,
        metricNames: [GPU_UTILIZATION_METRIC, CPU_UTILIZATION_METRIC],
        jobs,
    });
};
export const fetchJobGpuMemoryMetrics = async (env, jobId, requestUserId, requestMachineId) => {
    const credentials = getCredentialsFromEnv(env);
    const accessToken = await fetchAccessToken(credentials);
    const userId = requestUserId || getEnvValue(env, 'NERSC_USER_ID', DEFAULT_NERSC_USER_ID);
    const machineId = requestMachineId || getEnvValue(env, 'NERSC_MACHINE_ID', DEFAULT_MACHINE_ID);
    const records = await fetchJobMetricRecords(accessToken, jobId, userId, machineId, GPU_MEMORY_METRIC, {
        aggregation: 'raw',
        timewindow: 1,
        timewindowUnit: 's',
    });
    return JSON.stringify({
        generatedAt: new Date().toISOString(),
        jobId,
        userId,
        machineId,
        metricName: GPU_MEMORY_METRIC,
        data: records,
    });
};
export const fetchJobMetricsSummary = async (env, jobId, requestUserId, requestMachineId) => {
    const credentials = getCredentialsFromEnv(env);
    const accessToken = await fetchAccessToken(credentials);
    const numericJobId = Number(jobId);
    if (!Number.isFinite(numericJobId)) {
        throw new Error(`Invalid jobId ${jobId}.`);
    }
    const userId = requestUserId || getEnvValue(env, 'NERSC_USER_ID', DEFAULT_NERSC_USER_ID);
    const machineId = requestMachineId || getEnvValue(env, 'NERSC_MACHINE_ID', DEFAULT_MACHINE_ID);
    const [metricsResult, nodePowerResult, cpuPowerResult] = await Promise.allSettled([
        fetchJobMetricsRecords(accessToken, numericJobId, userId, machineId, JOB_METRICS_API_METRICS),
        fetchJobPowerMetricRecords(accessToken, numericJobId, userId, machineId, JOB_METRIC_DEFINITIONS.nodePower.apiMetricName),
        fetchJobPowerMetricRecords(accessToken, numericJobId, userId, machineId, JOB_METRIC_DEFINITIONS.cpuPower.apiMetricName),
    ]);
    const metricSummary = (metricKey, scale, fractionDigits = 1) => (metricsResult.status === 'fulfilled'
        ? averageMetricValue(metricsResult.value, JOB_METRIC_DEFINITIONS[metricKey].apiMetricName, scale, fractionDigits)
        : { average: null, sampleCount: 0 });
    const powerSummary = (result, metricKey) => (result.status === 'fulfilled'
        ? averageMetricValue(result.value, JOB_METRIC_DEFINITIONS[metricKey].apiMetricName, NODE_POWER_VALUE_SCALE)
        : { average: null, sampleCount: 0 });
    const gpuUtilization = metricSummary('gpuUtilization', GPU_UTILIZATION_VALUE_SCALE, 3);
    const gpuMemoryBandwidth = metricSummary('gpuMemoryBandwidth', GPU_MEMORY_BANDWIDTH_VALUE_SCALE);
    const nodePower = powerSummary(nodePowerResult, 'nodePower');
    const cpuPower = powerSummary(cpuPowerResult, 'cpuPower');
    const errors = [
        metricsResult.status === 'rejected' ? getOriginalErrorMessage(metricsResult.reason, 'Unable to fetch metrics.') : '',
        nodePowerResult.status === 'rejected' ? getOriginalErrorMessage(nodePowerResult.reason, 'Unable to fetch metric.') : '',
        cpuPowerResult.status === 'rejected' ? getOriginalErrorMessage(cpuPowerResult.reason, 'Unable to fetch metric.') : '',
    ].filter(Boolean);
    if (errors.length) {
        console.warn(`[api] Job metrics summary partial failure for ${jobId} (${machineId}/${userId}): ${errors.join(' ')}\n`);
    }
    const summary = {
        avgCpuPower: cpuPower.average,
        avgGpuMemoryBandwidth: gpuMemoryBandwidth.average,
        avgGpuUtilization: gpuUtilization.average,
        avgNodePower: nodePower.average,
        ...(errors.length ? { error: errors.join(' ') } : {}),
        jobId: String(jobId),
        machineId,
        sampleCounts: {
            avgCpuPower: cpuPower.sampleCount,
            avgGpuMemoryBandwidth: gpuMemoryBandwidth.sampleCount,
            avgGpuUtilization: gpuUtilization.sampleCount,
            avgNodePower: nodePower.sampleCount,
        },
        series: {
            gpuUtilization: metricsResult.status === 'fulfilled'
                ? metricSeriesValues(metricsResult.value, JOB_METRIC_DEFINITIONS.gpuUtilization.apiMetricName, GPU_UTILIZATION_VALUE_SCALE, 3)
                : [],
            cpuPower: cpuPowerResult.status === 'fulfilled'
                ? metricSeriesValues(cpuPowerResult.value, JOB_METRIC_DEFINITIONS.cpuPower.apiMetricName, NODE_POWER_VALUE_SCALE)
                : [],
            nodePower: nodePowerResult.status === 'fulfilled'
                ? metricSeriesValues(nodePowerResult.value, JOB_METRIC_DEFINITIONS.nodePower.apiMetricName, NODE_POWER_VALUE_SCALE)
                : [],
        },
        records: {
            gpuUtilization: metricsResult.status === 'fulfilled' ? metricsResult.value : [],
            nodePower: nodePowerResult.status === 'fulfilled' ? nodePowerResult.value : [],
            cpuPower: cpuPowerResult.status === 'fulfilled' ? cpuPowerResult.value : [],
        },
        userId,
    };
    return JSON.stringify(summary);
};
export const fetchJobMetadataTaskId = async (env, jobId, userId) => {
    const credentials = getCredentialsFromEnv(env);
    const accessToken = await fetchAccessToken(credentials);
    const machineId = getEnvValue(env, 'NERSC_MACHINE_ID', DEFAULT_MACHINE_ID);
    const task = await fetchLdmsJson(accessToken, '/fetch_job_metadata', {
        method: 'POST',
        body: JSON.stringify({
            userid: userId,
            jobid: jobId,
            machineid: machineId,
        }),
    });
    if (!task.task_id) {
        throw new Error(`LDMS did not return task_id for job ${jobId}.`);
    }
    return {
        machineId,
        taskId: task.task_id,
    };
};
export const fetchNerscJobDetails = async (env, jobId) => {
    const credentials = getCredentialsFromEnv(env);
    const accessToken = await fetchAccessToken(credentials);
    const fetchJob = async (useSacct) => {
        const url = new URL(`${NERSC_COMPUTE_API_URL}/${encodeURIComponent(jobId)}`);
        url.searchParams.set('sacct', String(useSacct));
        url.searchParams.set('cached', 'false');
        return fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
    };
    let response = await fetchJob(true);
    if (response.status === 500) {
        const responseText = await response.text();
        console.warn(`[api] NERSC sacct job details failed for ${jobId}; retrying without sacct: ${response.status} ${responseText}\n`);
        response = await fetchJob(false);
    }
    if (!response.ok) {
        const responseText = await response.text();
        throw new NerscApiError(`NERSC job request failed for ${jobId}: ${response.status} ${responseText}`, response.status);
    }
    return await response.json();
};

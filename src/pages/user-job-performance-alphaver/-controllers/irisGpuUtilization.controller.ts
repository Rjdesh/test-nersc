import { useEffect, useState } from 'react';

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

interface IrisGpuUtilizationApiResponse {
  generatedAt?: string;
  jobs?: IrisGpuUtilizationByJob;
  error?: string;
}

export const useIrisGpuUtilization = (enabled: boolean) => {
  const [summariesByJob, setSummariesByJob] = useState<IrisGpuUtilizationByJob>();
  const [status, setStatus] = useState<IrisGpuUtilizationFetchStatus>('idle');

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return undefined;
    }

    const abortController = new AbortController();
    setStatus('loading');

    const fetchSummaries = async () => {
      try {
        const response = await fetch('/api/user-job-performance/iris-gpu-utilization', {
          signal: abortController.signal,
        });

        if (!response.ok) {
          setSummariesByJob({});
          setStatus('error');
          return;
        }

        const payload = await response.json() as IrisGpuUtilizationApiResponse;
        if (payload.jobs) {
          setSummariesByJob(payload.jobs);
          setStatus('success');
          return;
        }

        setSummariesByJob({});
        setStatus(payload.error ? 'error' : 'success');
      } catch {
        if (!abortController.signal.aborted) {
          setSummariesByJob({});
          setStatus('error');
        }
      }
    };

    fetchSummaries();

    return () => {
      abortController.abort();
    };
  }, [enabled]);

  return {
    summariesByJob,
    status,
  };
};

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
import json
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple, Union

import pandas as pd
from pandas.api.types import is_numeric_dtype

try:
    from sf_api_interface import (
        LdmsCredentials,
        create_ldms_session,
        get_ldms_api_interface,
        load_credentials_from_env,
        load_credentials_from_module,
    )
except ImportError:  # Allows `python -m src.utils.job_performance_helper`.
    from .sf_api_interface import (
        LdmsCredentials,
        create_ldms_session,
        get_ldms_api_interface,
        load_credentials_from_env,
        load_credentials_from_module,
    )


JSONPrimitive = Union[str, int, float, bool, None]
JSONValue = Union[JSONPrimitive, List['JSONValue'], Dict[str, 'JSONValue']]
MetricsByJob = Dict[str, List[Dict[str, JSONValue]]]
GpuUtilizationSummaryByJob = Dict[str, Dict[str, JSONValue]]


class JobPerformanceError(RuntimeError):
    """Raised when job performance telemetry cannot be fetched or normalized."""


DEFAULT_GPU_PERFORMANCE_METRICS: Tuple[str, ...] = (
    'nersc_ldms_dcgm_gpu_utilization',
    'nersc_ldms_dcgm_dram_active',
    'nersc_ldms_dcgm_fb_free',
    'nersc_ldms_dcgm_fb_used',
    'nersc_ldms_dcgm_power_usage',
    'nersc_ldms_dcgm_sm_occupancy',
    'nersc_ldms_dcgm_sm_active',
    'nersc_ldms_dcgm_fp16_active',
    'nersc_ldms_dcgm_fp32_active',
    'nersc_ldms_dcgm_fp64_active',
    'nersc_ldms_dcgm_tensor_active',
    'nersc_ldms_dcgm_tensor_hmma_active',
    'nersc_ldms_dcgm_tensor_imma_active',
)


@dataclass(frozen=True)
class JobPerformanceRequest:
    user_id: str
    job_id: Union[int, str]
    machine_id: str
    metrics: Sequence[str] = field(default_factory=lambda: list(DEFAULT_GPU_PERFORMANCE_METRICS))


@dataclass(frozen=True)
class MetricFetchOptions:
    estimate_size_only: bool = False
    aggregation: str = 'median'
    timewindow: int = 15
    timewindow_unit: str = 's'
    offset: int = 0
    size: int = 0
    retries: int = 30
    interval: int = 5
    user_defined_slices: Optional[Sequence[Mapping[str, Any]]] = None


def load_job_ids_from_index_sources(
    json_paths: Sequence[Union[str, Path]],
    *,
    job_id_key: str = 'Job ID',
) -> List[int]:
    """Load unique job ids from the JSON files consumed by user-job-performance/index.tsx."""
    seen: set[int] = set()
    job_ids: List[int] = []

    for json_path in json_paths:
        path = Path(json_path)
        payload = json.loads(path.read_text())
        if not isinstance(payload, list):
            raise JobPerformanceError(
                f'Expected a JSON array in {path}, received {type(payload).__name__}.'
            )

        for entry in payload:
            job_id = _extract_job_id(entry, job_id_key=job_id_key, source_path=path)
            if job_id not in seen:
                seen.add(job_id)
                job_ids.append(job_id)

    return job_ids


def build_job_performance_requests(
    job_ids: Iterable[Union[int, str]],
    *,
    user_id: str,
    machine_id: str,
    metrics: Sequence[str] = DEFAULT_GPU_PERFORMANCE_METRICS,
) -> List[JobPerformanceRequest]:
    """Create typed LDMS metric requests for a list of index-page job ids."""
    return [
        JobPerformanceRequest(
            user_id=user_id,
            job_id=_coerce_int(job_id, field_name='job_id'),
            machine_id=machine_id,
            metrics=tuple(metrics),
        )
        for job_id in job_ids
    ]


def fetch_job_performance_metrics(
    session: Any,
    request: JobPerformanceRequest,
    *,
    options: MetricFetchOptions = MetricFetchOptions(),
) -> List[Dict[str, JSONValue]]:
    """Fetch and normalize one job's LDMS metrics into the frontend metrics-data.json row shape."""
    ldms = get_ldms_api_interface()
    response_payload = ldms.fetch_metrics(
        session,
        request.user_id,
        str(request.job_id),
        request.machine_id,
        list(request.metrics),
        estimate_number_samples_without_fetching_data=options.estimate_size_only,
        aggr_func=options.aggregation,
        timewindow=options.timewindow,
        timewindow_unit=options.timewindow_unit,
        user_defined_slices=options.user_defined_slices,
    )
    task_id = _extract_task_id(response_payload, request)

    if options.estimate_size_only:
        estimate = ldms.get_exepected_dataframe_numsamples(
            session,
            task_id,
            offset=options.offset,
            size=options.size,
            retries=options.retries,
            interval=options.interval,
        )
        return [
            {
                'Job ID': _coerce_int(request.job_id, field_name='job_id'),
                'Estimated Samples': _to_json_value(estimate),
            }
        ]

    dataframe_result = ldms.get_dataframe(
        session,
        task_id,
        offset=options.offset,
        size=options.size,
        retries=options.retries,
        interval=options.interval,
    )

    if dataframe_result is None:
        raise JobPerformanceError(f'LDMS returned no metric dataframe for job {request.job_id}.')

    dataframe, _data_length = dataframe_result
    return normalize_metric_dataframe(
        dataframe,
        job_id=request.job_id,
        metrics=request.metrics,
        sample_spacing_seconds=options.timewindow,
    )


def fetch_many_job_performance_metrics(
    requests: Sequence[JobPerformanceRequest],
    credentials: LdmsCredentials,
    *,
    options: MetricFetchOptions = MetricFetchOptions(),
    max_workers: int = 1,
) -> MetricsByJob:
    """Fetch metrics for multiple jobs, keyed by job id for `metrics-data.json`."""
    if not requests:
        return {}

    worker_count = max(1, min(max_workers, len(requests)))
    if worker_count == 1:
        session = create_ldms_session(credentials)
        return {
            str(request.job_id): fetch_job_performance_metrics(session, request, options=options)
            for request in requests
        }

    metrics_by_job: MetricsByJob = {}
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_map = {
            executor.submit(
                _fetch_one_with_new_session,
                request,
                credentials,
                options,
            ): request
            for request in requests
        }
        for future in as_completed(future_map):
            request = future_map[future]
            metrics_by_job[str(request.job_id)] = future.result()

    return {str(request.job_id): metrics_by_job[str(request.job_id)] for request in requests}


def normalize_metric_dataframe(
    dataframe: pd.DataFrame,
    *,
    job_id: Union[int, str],
    metrics: Sequence[str],
    sample_spacing_seconds: int = 15,
) -> List[Dict[str, JSONValue]]:
    """Keep metric columns and add `Job ID` plus `Floored Relative Time` for React charts."""
    if dataframe.empty:
        return []

    frame = dataframe.copy()
    frame['Job ID'] = _coerce_int(job_id, field_name='job_id')
    frame['Floored Relative Time'] = _build_relative_time_seconds(
        frame,
        sample_spacing_seconds=sample_spacing_seconds,
    )

    metric_columns = _select_metric_columns(frame, metrics)
    ordered_columns = ['Job ID', 'Floored Relative Time', *metric_columns]
    records: List[Dict[str, JSONValue]] = []

    for raw_record in frame[ordered_columns].to_dict(orient='records'):
        records.append({
            str(key): _to_json_value(value)
            for key, value in raw_record.items()
        })

    return records


def write_metrics_by_job_json(
    output_path: Union[str, Path],
    metrics_by_job: Mapping[str, Sequence[Mapping[str, JSONValue]]],
    *,
    indent: int = 2,
) -> None:
    """Persist frontend-ready metric records to a JSON file."""
    Path(output_path).write_text(json.dumps(metrics_by_job, indent=indent))


def fetch_index_page_metrics(
    job_source_paths: Sequence[Union[str, Path]],
    *,
    credentials: LdmsCredentials,
    user_id: str,
    machine_id: str = 'perlmutter gpu',
    metrics: Sequence[str] = DEFAULT_GPU_PERFORMANCE_METRICS,
    options: MetricFetchOptions = MetricFetchOptions(),
    max_workers: int = 1,
) -> MetricsByJob:
    """Fetch frontend-ready metric records for the job list page."""
    job_ids = load_job_ids_from_index_sources(job_source_paths)
    requests = build_job_performance_requests(
        job_ids,
        user_id=user_id,
        machine_id=machine_id,
        metrics=metrics,
    )
    metrics_by_job = fetch_many_job_performance_metrics(
        requests,
        credentials,
        options=options,
        max_workers=max_workers,
    )
    return metrics_by_job


def fetch_and_write_index_page_metrics(
    job_source_paths: Sequence[Union[str, Path]],
    output_path: Union[str, Path],
    *,
    credentials: LdmsCredentials,
    user_id: str,
    machine_id: str = 'perlmutter gpu',
    metrics: Sequence[str] = DEFAULT_GPU_PERFORMANCE_METRICS,
    options: MetricFetchOptions = MetricFetchOptions(),
    max_workers: int = 1,
) -> MetricsByJob:
    """End-to-end controller for refreshing metrics-data.json for the job list page."""
    metrics_by_job = fetch_index_page_metrics(
        job_source_paths,
        credentials=credentials,
        user_id=user_id,
        machine_id=machine_id,
        metrics=metrics,
        options=options,
        max_workers=max_workers,
    )
    write_metrics_by_job_json(output_path, metrics_by_job)
    return metrics_by_job


def summarize_average_gpu_utilization(
    metrics_by_job: Mapping[str, Sequence[Mapping[str, JSONValue]]],
    *,
    metric_name: str = 'nersc_ldms_dcgm_gpu_utilization',
) -> GpuUtilizationSummaryByJob:
    """Compute average GPU utilization percentages by job from normalized metric records."""
    summaries: GpuUtilizationSummaryByJob = {}

    for job_id, rows in metrics_by_job.items():
        values: List[float] = []
        for row in rows:
            value = row.get(metric_name)
            if value is None:
                continue
            try:
                values.append(float(value))
            except (TypeError, ValueError):
                continue

        average_value = sum(values) / len(values) if values else None
        summaries[str(job_id)] = {
            'jobId': _coerce_int(job_id, field_name='job_id'),
            'avgGpuUtilization': (
                round(average_value, 1) if average_value is not None else None
            ),
            'sampleCount': len(values),
            'metricName': metric_name,
        }

    return summaries


def write_gpu_utilization_summary_json(
    output_path: Union[str, Path],
    summaries_by_job: Mapping[str, Mapping[str, JSONValue]],
    *,
    indent: int = 2,
) -> None:
    """Persist average GPU utilization summaries for the UI app endpoint."""
    payload = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'jobs': summaries_by_job,
    }
    Path(output_path).write_text(json.dumps(payload, indent=indent))


def _fetch_one_with_new_session(
    request: JobPerformanceRequest,
    credentials: LdmsCredentials,
    options: MetricFetchOptions,
) -> List[Dict[str, JSONValue]]:
    session = create_ldms_session(credentials)
    return fetch_job_performance_metrics(session, request, options=options)


def _extract_task_id(response_payload: Any, request: JobPerformanceRequest) -> str:
    if not isinstance(response_payload, Mapping):
        raise JobPerformanceError(
            f'Expected LDMS task response to be an object for job {request.job_id}, '
            f'received {type(response_payload).__name__}.'
        )

    task_id = response_payload.get('task_id')
    if not task_id:
        raise JobPerformanceError(
            f'LDMS did not return a task_id for job {request.job_id}: {response_payload!r}'
        )

    return str(task_id)


def _build_relative_time_seconds(
    frame: pd.DataFrame,
    *,
    sample_spacing_seconds: int,
) -> pd.Series:
    if 'Floored Relative Time' in frame:
        return pd.to_numeric(frame['Floored Relative Time'], errors='coerce').fillna(0).astype(int)

    if 'timestamp' in frame:
        timestamps = _parse_timestamp_series(frame['timestamp'])
        if timestamps.notna().any():
            start_time = timestamps.dropna().min()
            return (
                (timestamps - start_time)
                .dt.total_seconds()
                .fillna(0)
                .clip(lower=0)
                .astype(int)
            )

    if 'index' in frame:
        index_values = pd.to_numeric(frame['index'], errors='coerce').fillna(0)
    else:
        index_values = pd.Series(range(len(frame)), index=frame.index)

    return (index_values * sample_spacing_seconds).astype(int)


def _parse_timestamp_series(series: pd.Series) -> pd.Series:
    if is_numeric_dtype(series):
        numeric = pd.to_numeric(series, errors='coerce')
        max_timestamp = numeric.abs().max()
        unit = 'ms' if pd.notna(max_timestamp) and max_timestamp > 1_000_000_000_000 else 's'
        return pd.to_datetime(numeric, unit=unit, errors='coerce')

    return pd.to_datetime(series, errors='coerce')


def _select_metric_columns(frame: pd.DataFrame, requested_metrics: Sequence[str]) -> List[str]:
    requested = [metric for metric in requested_metrics if metric in frame.columns]
    discovered = [
        column
        for column in frame.columns
        if column.startswith('nersc_ldms_') and column not in requested
    ]

    metric_columns: List[str] = []
    for column in [*requested, *discovered]:
        numeric_values = pd.to_numeric(frame[column], errors='coerce')
        if numeric_values.notna().any():
            frame[column] = numeric_values
            metric_columns.append(column)

    return metric_columns


def _extract_job_id(entry: Any, *, job_id_key: str, source_path: Path) -> int:
    if isinstance(entry, int):
        return entry

    if isinstance(entry, str) and entry.strip().isdigit():
        return int(entry)

    if isinstance(entry, Mapping) and job_id_key in entry:
        return _coerce_int(entry[job_id_key], field_name=job_id_key)

    raise JobPerformanceError(
        f'Unable to extract a job id from {source_path}: {entry!r}. Expected an integer, '
        f'a numeric string, or an object containing {job_id_key!r}.'
    )


def _coerce_int(value: Any, *, field_name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise JobPerformanceError(
            f'Unable to coerce field {field_name!r} to int from value {value!r}.'
        ) from exc


def _to_json_value(value: Any) -> JSONValue:
    if value is None:
        return None

    if isinstance(value, Mapping):
        return {str(key): _to_json_value(nested_value) for key, nested_value in value.items()}

    if isinstance(value, (list, tuple)):
        return [_to_json_value(item) for item in value]

    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    if hasattr(value, 'item'):
        value = value.item()

    if isinstance(value, (str, int, float, bool)) or value is None:
        return value

    return str(value)


def _parse_metrics(metrics_argument: str) -> Sequence[str]:
    metrics = [metric.strip() for metric in metrics_argument.split(',') if metric.strip()]
    return metrics or DEFAULT_GPU_PERFORMANCE_METRICS


def _build_cli_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description='Fetch LDMS job performance metrics for the user job performance page.'
    )
    parser.add_argument('--user-id', required=True, help='NERSC user id to use for LDMS job requests.')
    parser.add_argument('--machine-id', default='perlmutter gpu', help='LDMS machine id.')
    parser.add_argument(
        '--job-source',
        action='append',
        required=True,
        help='JSON file read by the job list page. Can be provided more than once.',
    )
    parser.add_argument('--output', help='Path to write metrics-data.json.')
    parser.add_argument(
        '--gpu-utilization-summary-output',
        help='Path to write computed average GPU utilization summaries.',
    )
    parser.add_argument(
        '--credentials-module',
        help='Optional Python module containing client_id and private_key. Defaults to SFAPI_CLIENT_ID and SFAPI_PRIVATE_KEY_JSON.',
    )
    parser.add_argument(
        '--metrics',
        default=','.join(DEFAULT_GPU_PERFORMANCE_METRICS),
        help='Comma-separated LDMS metric names to request.',
    )
    parser.add_argument('--aggregation', default='median', help='LDMS aggregation function.')
    parser.add_argument('--timewindow', type=int, default=15, help='Aggregation time window value.')
    parser.add_argument('--timewindow-unit', default='s', help='Aggregation time window unit.')
    parser.add_argument('--max-workers', type=int, default=1, help='Number of jobs to fetch concurrently.')
    return parser


def main() -> None:
    parser = _build_cli_parser()
    args = parser.parse_args()
    if not args.output and not args.gpu_utilization_summary_output:
        parser.error('Provide --output, --gpu-utilization-summary-output, or both.')

    credentials = (
        load_credentials_from_module(args.credentials_module)
        if args.credentials_module
        else load_credentials_from_env()
    )
    options = MetricFetchOptions(
        aggregation=args.aggregation,
        timewindow=args.timewindow,
        timewindow_unit=args.timewindow_unit,
    )
    metrics_by_job = fetch_index_page_metrics(
        args.job_source,
        credentials=credentials,
        user_id=args.user_id,
        machine_id=args.machine_id,
        metrics=_parse_metrics(args.metrics),
        options=options,
        max_workers=args.max_workers,
    )
    if args.output:
        write_metrics_by_job_json(args.output, metrics_by_job)
    if args.gpu_utilization_summary_output:
        write_gpu_utilization_summary_json(
            args.gpu_utilization_summary_output,
            summarize_average_gpu_utilization(metrics_by_job),
        )


if __name__ == '__main__':
    main()

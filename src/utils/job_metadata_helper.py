from __future__ import annotations

from functools import lru_cache
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Union

try:
    from sf_api_interface import create_ldms_session, get_ldms_api_interface
except ImportError:  # Allows `python -m src.utils.job_metadata_helper`.
    from .sf_api_interface import create_ldms_session, get_ldms_api_interface


JSONPrimitive = Union[str, int, float, bool, None]
JSONValue = Union[JSONPrimitive, List['JSONValue'], Dict[str, 'JSONValue']]


class JobMetadataError(RuntimeError):
    """Raised when job metadata cannot be fetched or normalized."""


@dataclass(frozen=True)
class LdmsCredentials:
    client_id: str
    private_key: Any


@dataclass(frozen=True)
class JobMetadataRequest:
    user_id: str
    job_id: Union[int, str]
    machine_id: str


@dataclass(frozen=True)
class UserJobMetadata:
    job_id: int
    job_name: Optional[str]
    job_status: Optional[str]
    user: str
    project: str
    partition: str
    qos: str
    start_time: str
    end_time: str
    hostname: str
    charged_node_hours: float

    def to_index_page_record(self) -> Dict[str, JSONValue]:
        record: Dict[str, JSONValue] = {
            'Job ID': self.job_id,
            'User': self.user,
            'Project': self.project,
            'Partition': self.partition,
            'QOS': self.qos,
            'Start Time': self.start_time,
            'End Time': self.end_time,
            'Hostname': self.hostname,
            'Charged Node Hours': self.charged_node_hours,
        }

        if self.job_name:
            record['Job Name'] = self.job_name
        if self.job_status:
            record['Job Status'] = self.job_status

        return record


def load_job_ids_from_json(json_path: Union[str, Path], job_id_key: str = 'Job ID') -> List[int]:
    """Load job ids from a JSON file containing either ids or job-like objects."""
    path = Path(json_path)
    payload = json.loads(path.read_text())

    if not isinstance(payload, list):
        raise ValueError(f'Expected a JSON array in {path}, received {type(payload).__name__}.')

    job_ids: List[int] = []
    for entry in payload:
        if isinstance(entry, int):
            job_ids.append(entry)
            continue

        if isinstance(entry, str) and entry.strip().isdigit():
            job_ids.append(int(entry))
            continue

        if isinstance(entry, Mapping) and job_id_key in entry:
            job_ids.append(_coerce_int(entry[job_id_key], field_name=job_id_key))
            continue

        raise ValueError(
            f'Unable to extract a job id from entry {entry!r}. Supported forms are integers, numeric strings, '
            f'or objects containing {job_id_key!r}.'
        )

    return job_ids


def fetch_index_page_job_metadata(
    requests: Sequence[JobMetadataRequest],
    credentials: LdmsCredentials,
    *,
    max_workers: int = 1,
) -> List[Dict[str, JSONValue]]:
    """Fetch and normalize LDMS job metadata into the shape used by user-job-performance/index.tsx."""
    jobs = fetch_many_job_metadata(requests, credentials, max_workers=max_workers)
    return [job.to_index_page_record() for job in jobs]


def fetch_many_job_metadata(
    requests: Sequence[JobMetadataRequest],
    credentials: LdmsCredentials,
    *,
    max_workers: int = 1,
) -> List[UserJobMetadata]:
    """Fetch and normalize job metadata for multiple jobs, preserving request order."""
    if not requests:
        return []

    worker_count = max(1, min(max_workers, len(requests)))
    if worker_count == 1:
        return [fetch_single_job_metadata(request, credentials) for request in requests]

    ordered_results: Dict[int, UserJobMetadata] = {}
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_map = {
            executor.submit(fetch_single_job_metadata, request, credentials): index
            for index, request in enumerate(requests)
        }
        for future in as_completed(future_map):
            index = future_map[future]
            ordered_results[index] = future.result()

    return [ordered_results[index] for index in range(len(requests))]


def fetch_single_job_metadata(
    request: JobMetadataRequest,
    credentials: LdmsCredentials,
) -> UserJobMetadata:
    """Fetch job metadata for a single job and normalize it for downstream consumers."""
    ldms = _load_ldms_api_interface_module()
    session = create_ldms_session(credentials)

    response = ldms.fetch_job_metadata(
        session,
        userid=request.user_id,
        jobid=str(request.job_id),
        machine_id=request.machine_id,
    )
    task_id = _extract_task_id(response, request)
    raw_metadata = ldms.get_job_metadata(session, task_id)
    if raw_metadata is None:
        raise JobMetadataError(f'LDMS returned no job metadata for job {request.job_id}.')

    return normalize_job_metadata(raw_metadata, request=request)


def normalize_job_metadata(
    raw_metadata: Mapping[str, Any],
    *,
    request: Optional[JobMetadataRequest] = None,
) -> UserJobMetadata:
    """Map raw LDMS metadata into the page-friendly job metadata schema."""
    hostname_default = request.machine_id if request else ''
    normalized = UserJobMetadata(
        job_id=_get_int(raw_metadata, ['job_id', 'jobid', 'Job ID'], fallback=request.job_id if request else None),
        job_name=_get_optional_str(raw_metadata, ['job_name', 'jobname', 'name', 'Job Name']),
        job_status=_get_optional_str(raw_metadata, ['job_state', 'job_status', 'status', 'state', 'Job Status']),
        user=_get_required_str(raw_metadata, ['user', 'userid', 'username', 'full_name', 'User']),
        project=_get_required_str(raw_metadata, ['project', 'project_id', 'repo', 'account', 'Project']),
        partition=_get_required_str(raw_metadata, ['partition', 'queue', 'cluster_partition', 'Partition']),
        qos=_get_required_str(raw_metadata, ['qos', 'quality_of_service', 'QOS']),
        start_time=_get_required_str(raw_metadata, ['start_time', 'start', 'start_ts', 'Start Time']),
        end_time=_get_required_str(raw_metadata, ['end_time', 'end', 'end_ts', 'End Time']),
        hostname=_get_required_str(
            raw_metadata,
            ['hostname', 'machine', 'machine_id', 'system', 'Hostname'],
            fallback=hostname_default,
        ),
        charged_node_hours=_get_float(
            raw_metadata,
            ['charged_node_hours', 'node_hours', 'charged_nodehrs', 'Charged Node Hours'],
        ),
    )

    return normalized


def build_job_metadata_requests(
    job_ids: Iterable[Union[int, str]],
    *,
    user_id: str,
    machine_id: str,
) -> List[JobMetadataRequest]:
    """Create typed metadata requests from a list of job ids."""
    return [
        JobMetadataRequest(user_id=user_id, job_id=_coerce_int(job_id, field_name='job_id'), machine_id=machine_id)
        for job_id in job_ids
    ]


def write_index_page_metadata_json(
    output_path: Union[str, Path],
    records: Sequence[Mapping[str, JSONValue]],
    *,
    indent: int = 2,
) -> None:
    """Persist normalized index-page records as JSON."""
    path = Path(output_path)
    path.write_text(json.dumps(list(records), indent=indent))


def fetch_and_write_index_page_metadata(
    job_ids_json_path: Union[str, Path],
    output_path: Union[str, Path],
    *,
    credentials: LdmsCredentials,
    user_id: str,
    machine_id: str,
    max_workers: int = 1,
    job_id_key: str = 'Job ID',
) -> List[Dict[str, JSONValue]]:
    """End-to-end utility for loading job ids, fetching metadata, and writing output JSON."""
    job_ids = load_job_ids_from_json(job_ids_json_path, job_id_key=job_id_key)
    requests = build_job_metadata_requests(job_ids, user_id=user_id, machine_id=machine_id)
    records = fetch_index_page_job_metadata(requests, credentials, max_workers=max_workers)
    write_index_page_metadata_json(output_path, records)
    return records


def _extract_task_id(response_payload: Any, request: JobMetadataRequest) -> str:
    if not isinstance(response_payload, Mapping):
        raise JobMetadataError(
            f'Expected LDMS task response to be an object for job {request.job_id}, received '
            f'{type(response_payload).__name__}.'
        )

    task_id = response_payload.get('task_id')
    if not task_id:
        raise JobMetadataError(
            f'LDMS did not return a task_id for job {request.job_id}: {response_payload!r}'
        )
    return str(task_id)


def _get_required_str(
    payload: Mapping[str, Any],
    candidate_keys: Sequence[str],
    *,
    fallback: Optional[Any] = None,
) -> str:
    value = _lookup_value(payload, candidate_keys)
    if value is None:
        value = fallback
    if value is None:
        raise JobMetadataError(f'Missing required metadata field. Checked keys: {candidate_keys!r}')

    text = str(value).strip()
    if not text:
        raise JobMetadataError(f'Metadata field is empty. Checked keys: {candidate_keys!r}')
    return text


def _get_optional_str(payload: Mapping[str, Any], candidate_keys: Sequence[str]) -> Optional[str]:
    value = _lookup_value(payload, candidate_keys)
    if value is None:
        return None

    text = str(value).strip()
    return text or None


def _get_int(
    payload: Mapping[str, Any],
    candidate_keys: Sequence[str],
    *,
    fallback: Optional[Any] = None,
) -> int:
    value = _lookup_value(payload, candidate_keys)
    if value is None:
        value = fallback
    return _coerce_int(value, field_name=candidate_keys[0])


def _get_float(payload: Mapping[str, Any], candidate_keys: Sequence[str]) -> float:
    value = _lookup_value(payload, candidate_keys)
    if value is None:
        raise JobMetadataError(f'Missing required numeric metadata field. Checked keys: {candidate_keys!r}')

    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise JobMetadataError(
            f'Unable to coerce metadata field {candidate_keys[0]!r} to float from value {value!r}.'
        ) from exc


def _coerce_int(value: Any, *, field_name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise JobMetadataError(
            f'Unable to coerce field {field_name!r} to int from value {value!r}.'
        ) from exc


def _lookup_value(payload: Mapping[str, Any], candidate_keys: Sequence[str]) -> Any:
    for key in candidate_keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    return None


@lru_cache(maxsize=1)
def _load_ldms_api_interface_module():
    return get_ldms_api_interface()

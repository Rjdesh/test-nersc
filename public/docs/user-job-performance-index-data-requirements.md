# User Job Performance Index: UI Data Requirements

Source review:
- List view implementation: `src/pages/user-job-performance/index.tsx`
- Metadata normalization helper: `src/utils/job_metadata_helper.py`
- Current sample payloads: `public/data/user-job-performance/user-jobs.json`, `public/data/user-job-performance/metrics-data.json`

## Purpose

This table maps the **Recent Jobs and Performance** index page UI to the data required to render it. It is grouped by the main feature areas on the page and distinguishes:
- direct source fields already available
- derived values computed in the UI
- placeholder values that should become explicit API/data requirements

## Summary By Main Feature

| Main feature | UI element / data displayed | UI field or computation | Current source field(s) | Requirement type | Notes / requirement gap |
| --- | --- | --- | --- | --- | --- |
| Page chrome | Breadcrumb label `For Users` / `Performance Metrics` | Static text | None | Static | No backend dependency. |
| Page chrome | Page title `Your Job Performance` | Static text | None | Static | No backend dependency. |
| Recent jobs list | Job Name | `jobName` | `Job Name` | Required source field | Falls back to ``${Partition} job`` if missing. Backend should provide a real job name whenever possible. |
| Recent jobs list | Submit time | `startTime` | `Start Time` | Required source field | Displayed in short format with tooltip using full datetime. |
| Recent jobs list | Job ID | `jobId` | `Job ID` | Required source field | Used for routing, row identity, selection, drawer lookup, compare flow, and metrics join. |
| Recent jobs list | Project ID | `projectId` | `Project` | Required source field | Label in UI is `Project ID`; source payload currently uses `Project`. |
| Recent jobs list | QOS | `qos` | `QOS` | Required source field | Direct display. |
| Recent jobs list | Node Hours | `nodeHours` | `Charged Node Hours` | Required source field | Numeric value shown directly in grid and drawer. |
| Recent jobs list | No. of Nodes | `nodeCount` | Derived from `Start Time`, `End Time`, `Charged Node Hours` | Derived field | UI computes `round(nodeHours / runtimeHours)`. Preferred backend field: explicit allocated node count. |
| Recent jobs list | Wait Time | `waitTime` | None | Missing source field | Currently hard-coded from `fallbackWaitTimes`. This should become an explicit requirement from scheduler/job metadata. |
| Recent jobs list | Run Time | `executionTime` | Derived from `Start Time`, `End Time` | Derived field | UI computes elapsed time. Backend may provide canonical runtime to avoid timezone/parsing inconsistencies. |
| Recent jobs list | Job Status | `jobStatus` | `Job Status` | Required source field | Falls back to rotating demo statuses if missing. Backend should provide authoritative job state. |
| Recent jobs list | GPU Utilization | `avgGpuUtilization` | Currently seeded from `Job ID`; could derive from `nersc_ldms_dcgm_gpu_utilization` | Missing / should be sourced | Grid currently shows dummy values. Requirement should be average GPU utilization per job over runtime. |
| Recent jobs list | GPU Memory | `gpuMemoryUtilization` | Derived from `nersc_ldms_dcgm_dram_active` | Derived field | UI converts DRAM activity samples into a normalized percent. Confirm if this is the intended KPI. |
| Recent jobs list | CPU Utilization | `cpuUtilization` | Derived from GPU utilization series or dummy heuristic | Missing / should be sourced | Current value is synthetic. Requirement should define true CPU utilization metric and aggregation. |
| Recent jobs list | Energy Consumed (J) | `energyConsumed` | None | Missing source field | Currently seeded from `Job ID`. Requirement should specify authoritative energy total and units. |
| Recent jobs list | End time | `endTime` | `End Time` | Required source field | Displayed in short format with tooltip using full datetime. |
| Recent jobs list | Row checkbox selection | `rowSelectionModel` keyed by `id` | `Job ID` | Required source field | Needed to compare jobs. Max supported selected rows in UI is 5. |
| List toolbar | Quick filter search | Data grid quick filter against visible columns | All visible list columns | Derived behavior | Searchability depends on the fields present in the row model. |
| List toolbar | Column chooser | Column visibility model | All non-locked grid columns | Derived behavior | `jobName`, `jobStatus`, and selection/actions are intentionally non-toggleable. |
| Compare CTA | Compare button enabled state | `selectedJobCount > 0` | `Job ID` | Derived behavior | Button state depends on row selection, not additional backend data. |
| Compare CTA | Max selection tooltip | `selectedJobCount <= 5` | `Job ID` | Derived behavior | UI enforces max 5 jobs for compare workflow. |
| Row actions | Quick View link | Opens drawer for selected row | `Job ID` and row payload | Required source field | Depends on complete row data plus metrics join for summary cards. |
| Row actions | More actions menu `View Real Data` | Navigates to performance detail page | `Job ID` | Required source field | No extra payload required on index page beyond route param. |
| Quick view drawer | Drawer header job name | `activeJob.jobName` | `Job Name` | Required source field | Same fallback caveat as grid. |
| Quick view drawer | Drawer header job ID | `activeJob.jobId` | `Job ID` | Required source field | Direct display and deep-linking. |
| Quick view drawer | Drawer header status chip | `activeJob.jobStatus` | `Job Status` | Required source field | Same fallback caveat as grid. |
| Quick view drawer | Overview: submit time | `activeJob.startTime` | `Start Time` | Required source field | Formatted with full datetime. |
| Quick view drawer | Overview: end time | `activeJob.endTime` | `End Time` | Required source field | Formatted with full datetime. |
| Quick view drawer | Overview: wait time | `activeJob.waitTime` | None | Missing source field | Same current gap as grid. |
| Quick view drawer | Overview: run time | `activeJob.executionTime` | Derived from `Start Time`, `End Time` | Derived field | Same current derivation as grid. |
| Quick view drawer | Overview: project | `activeJob.projectId` | `Project` | Required source field | Direct display. |
| Quick view drawer | Overview: QOS | `activeJob.qos` | `QOS` | Required source field | Direct display. |
| Quick view drawer | Overview: partition | `activeJob.partition` | `Partition` | Required source field | Direct display. |
| Quick view drawer | Overview: nodes | `activeJob.nodeCount` | Derived from `Start Time`, `End Time`, `Charged Node Hours` | Derived field | Prefer explicit source field if available. |
| Quick view drawer | Overview: node hours | `activeJob.nodeHours` | `Charged Node Hours` | Required source field | Rendered to two decimals in drawer. |
| Quick view drawer | Performance Hints card | `3 hints available` | None | Placeholder / future requirement | Current card is static today and needs content requirements. |
| Quick view drawer | Runtime Resource Distribution legend and donut | `donutSegments` | `nersc_ldms_dcgm_gpu_utilization`, `nersc_ldms_dcgm_dram_active`, synthetic CPU derivation | Derived field | CPU, GPU, memory, and idle shares are computed in UI; CPU is not sourced directly today. |
| Quick view drawer | Node Hours Idle | `idleNodeHours` | `Charged Node Hours` + derived `idlePercent` | Derived field | Requires a trustworthy utilization basis to be meaningful. |
| Quick view drawer | GPU Throughput: GPU Utilization | `performanceSummary.gpuUtilization` | `nersc_ldms_dcgm_gpu_utilization` | Derived aggregate | Currently averaged across metric rows for the job. |
| Quick view drawer | GPU Throughput: Memory Utilization | `performanceSummary.memoryUtilization` | `nersc_ldms_dcgm_dram_active` | Derived aggregate | Current normalization is heuristic; metric definition should be confirmed. |
| Quick view drawer | Footer CTA `View Performance Details` | Route param | `Job ID` | Required source field | Detail page dependency only needs job identifier from index page. |

## Base Data Contract Needed For The Index Page

The index page currently expects a per-job row model that can support both the grid and the quick-view drawer:

| Logical field | Current payload / derivation | Needed for |
| --- | --- | --- |
| `jobId` | `Job ID` | Row key, routing, drawer state, compare selection, metrics join |
| `jobName` | `Job Name` | Grid, drawer header |
| `jobStatus` | `Job Status` | Grid chip, drawer chip |
| `user` | `User` | Present in row model but not currently displayed on index page |
| `projectId` | `Project` | Grid, drawer overview |
| `partition` | `Partition` | Drawer overview, job name fallback |
| `qos` | `QOS` | Grid, drawer overview |
| `startTime` | `Start Time` | Grid, drawer overview, derived runtime/node count |
| `endTime` | `End Time` | Grid, drawer overview, derived runtime/node count |
| `hostname` | `Hostname` | Present in row model but not currently displayed on index page |
| `nodeHours` | `Charged Node Hours` | Grid, drawer overview, idle node hours |
| `nodeCount` | Currently derived | Grid, drawer overview |
| `waitTime` | Currently placeholder | Grid, drawer overview |
| `avgGpuUtilization` | Currently placeholder / should be aggregated from metrics | Grid, drawer, donut basis |
| `gpuMemoryUtilization` | Derived from metrics | Grid, drawer |
| `cpuUtilization` | Currently placeholder / synthetic | Grid, drawer, donut basis |
| `energyConsumed` | Currently placeholder | Grid |

## Recommended Backend / Data Requirements To Formalize

| Priority | Data requirement | Why it should be formalized |
| --- | --- | --- |
| High | Canonical `job_status` | The UI currently falls back to demo statuses when absent. |
| High | Actual `wait_time` | Currently not sourced at all and shown in both grid and drawer. |
| High | Actual `cpu_utilization_avg` | Current CPU utilization is synthetic, which weakens performance guidance. |
| High | Actual `gpu_utilization_avg` | Grid KPI is currently seeded from job id instead of real measurements. |
| High | Actual `energy_consumed_joules` | Displayed as a key KPI but currently dummy data. |
| Medium | Explicit `node_count` | Prevents approximation from runtime and charged node hours. |
| Medium | Defined `gpu_memory_utilization_avg` metric | Current DRAM-based normalization is heuristic and should be validated. |
| Medium | Performance hints payload | Drawer card is static today and needs content requirements. |
| Low | Canonical runtime duration | Avoids recomputing from timestamps in the frontend. |

## Current Gaps / Implementation Notes

- `src/utils/job_metadata_helper.py` currently normalizes only job metadata fields needed for the basic row shell. It does **not** provide wait time, node count, energy, CPU utilization, or aggregated performance KPIs.
- `src/pages/user-job-performance/index.tsx` fills several KPIs with demo logic:
  - `waitTime` from `fallbackWaitTimes`
  - `jobStatus` from `fallbackJobStatuses` when missing
  - `avgGpuUtilization` from `generateDummyGpuUtil(jobId)`
  - `energyConsumed` from `generateDummyEnergy(jobId)`
  - `cpuUtilization` from a heuristic based on GPU utilization
- The metrics payload currently supports at least:
  - `nersc_ldms_dcgm_gpu_utilization`
  - `nersc_ldms_dcgm_dram_active`
  - `nersc_ldms_dcgm_power_usage`
- If this page is moving from prototype to production-ready data requirements, the cleanest contract is:
  - one job-summary dataset for grid rows
  - one per-job metrics/telemetry dataset for trend or composition views

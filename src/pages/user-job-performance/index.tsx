import {
  Box,
  Chip,
  Divider,
  Drawer,
  Stack,
  Paper,
  Typography,
  Button,
  Breadcrumbs,
  Link as MuiLink,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CloseIcon from '@mui/icons-material/Close';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { MouseEvent, useCallback, useState } from 'react';
import { FilterContext } from '../../components/FilterContext';
import { SciDataGrid } from '../../components/SciDataGrid';
import {
  GridColDef,
  GridColumnVisibilityModel,
  GridRenderCellParams,
  GridRowSelectionModel,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
} from '@mui/x-data-grid';
import { useDataFromSource } from '../../hooks/useDataFromSource';
import Plot from 'react-plotly.js';

export const Route = createFileRoute('/user-job-performance/')({
  component: UserJobPerformance,
});

interface UserJobData {
  'Job ID': number;
  'Job Name'?: string;
  'Job Status'?: string;
  'User': string;
  'Project': string;
  'Partition': string;
  'QOS': string;
  'Start Time': string;
  'End Time': string;
  'Hostname': string;
  'Charged Node Hours': number;
}

interface MetricsRow {
  'Job ID': number;
  'Floored Relative Time': number;
  nersc_ldms_dcgm_dram_active?: number | null;
  nersc_ldms_dcgm_gpu_utilization?: number | null;
}

type MetricsByJob = Record<string, MetricsRow[]>;

interface JobGridRow {
  id: string;
  startTime: string;
  endTime: string;
  jobId: string;
  jobName: string;
  projectId: string;
  nodeHours: number;
  nodeCount: number | null;
  waitTime: string;
  executionTime: string;
  jobStatus: string;
  cpuUtilization: number;
  avgGpuUtilization: number;
  gpuMemoryUtilization: number;
  energyConsumed: number;
  energyStatus: 'high' | 'warning' | 'medium';
  qos: string;
  user: string;
  partition: string;
  hostname: string;
}

const parseJobTimestamp = (value: string) => new Date(value.replace(' ', 'T'));
const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const shortDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const fullDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

const formatShortDateTime = (value: string) => {
  const timestamp = parseJobTimestamp(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return shortDateTimeFormatter.format(timestamp);
};

const formatFullDateTime = (value: string) => {
  const timestamp = parseJobTimestamp(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return fullDateTimeFormatter.format(timestamp);
};

const formatExecutionTime = (startTime: string, endTime: string) => {
  const start = parseJobTimestamp(startTime);
  const end = parseJobTimestamp(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'N/A';
  }

  const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
};

const calculateNodeCount = (startTime: string, endTime: string, nodeHours: number) => {
  const start = parseJobTimestamp(startTime);
  const end = parseJobTimestamp(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const runtimeHours = Math.max(0, (end.getTime() - start.getTime()) / 3600000);

  if (runtimeHours <= 0) {
    return null;
  }

  return Math.max(1, Math.round(nodeHours / runtimeHours));
};

const getSeededValue = (seed: number, min: number, max: number) => {
  const normalized = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;

  return Math.round(min + normalized * (max - min));
};

const fallbackJobStatuses = ['Failed', 'Aborted', 'Waiting', 'Running', 'Completed'] as const;
const fallbackWaitTimes = ['4m', '18m', '42m', '7m', '0m', '11m'] as const;
const TERTIARY_ACTION_COLOR = '#374151';
const ACTIONS_COLUMN_WIDTH = 184;
const PANEL_WIDTH = 440;

const average = (values: number[]) => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

const getUtilizationTone = (value: number) => {
  if (value >= 70) {
    return { label: 'Good', color: '#16a34a' };
  }
  if (value >= 40) {
    return { label: 'Medium', color: '#f59e0b' };
  }
  return { label: 'Low', color: '#dc2626' };
};

const getJobStatusTone = (status: string) => {
  const normalized = status.toLowerCase();

  if (normalized.includes('complete')) {
    return {
      color: '#166534',
      backgroundColor: '#dcfce7',
      borderColor: '#86efac',
    };
  }
  if (normalized.includes('running')) {
    return {
      color: '#1d4ed8',
      backgroundColor: '#dbeafe',
      borderColor: '#93c5fd',
    };
  }
  if (normalized.includes('wait')) {
    return {
      color: '#475569',
      backgroundColor: '#e2e8f0',
      borderColor: '#cbd5e1',
    };
  }

  return {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  };
};

const getJobPerformanceSummary = (
  row: JobGridRow,
  metricsByJob: MetricsByJob | undefined
) => {
  const metricRows = metricsByJob?.[row.jobId] ?? [];

  if (!metricRows.length) {
    const gpuUtilization = clampPercent(row.avgGpuUtilization);
    const cpuUtilization = clampPercent(gpuUtilization * 0.7 + 6);
    const memoryUtilization = clampPercent(gpuUtilization * 0.78 + 18);
    const idlePercent = clampPercent(
      100 - average([cpuUtilization, gpuUtilization, memoryUtilization])
    );

    return {
      cpuUtilization,
      gpuUtilization,
      memoryUtilization,
      idlePercent,
    };
  }

  const gpuSeries = metricRows.map((metric) =>
    clampPercent(Number(metric.nersc_ldms_dcgm_gpu_utilization ?? 0))
  );
  const cpuSeries = gpuSeries.map((gpu, index) =>
    clampPercent(gpu * 0.7 + 6 + 2 * Math.cos(index / 3))
  );
  const dramPoints = metricRows.map((metric) =>
    Number(metric.nersc_ldms_dcgm_dram_active ?? 0)
  );
  const maxDram = Math.max(...dramPoints.map((value) => Math.abs(value)), 1e-12);
  const memorySeries = dramPoints.map((value, index) =>
    clampPercent((Math.abs(value) / maxDram) * 82 + 8 + 2.5 * Math.sin(index / 4))
  );
  const cpuUtilization = average(cpuSeries);
  const gpuUtilization = average(gpuSeries);
  const memoryUtilization = average(memorySeries);
  const idlePercent = clampPercent(
    100 - average([cpuUtilization, gpuUtilization, memoryUtilization])
  );

  return {
    cpuUtilization,
    gpuUtilization,
    memoryUtilization,
    idlePercent,
  };
};

function UtilizationIndicator({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const tone = getUtilizationTone(value);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        py: 1.25,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ color: '#111827', fontWeight: 700 }}>
          {label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: tone.color,
              flexShrink: 0,
            }}
          />
          <Typography variant="body2" sx={{ color: '#4b5563' }}>
            {tone.label} utilization
          </Typography>
        </Box>
      </Box>
      <Typography variant="h6" sx={{ color: '#111827', fontWeight: 700 }}>
        {value.toFixed(1)}%
      </Typography>
    </Box>
  );
}

function JobTableToolbar({
  setPanelAnchorEl,
}: {
  setPanelAnchorEl: (element: HTMLDivElement | null) => void;
}) {
  const handlePanelAnchorRef = useCallback(
    (element: HTMLDivElement | null) => {
      setPanelAnchorEl(element);
    },
    [setPanelAnchorEl]
  );

  return (
    <GridToolbarContainer
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
      }}
    >
      <GridToolbarQuickFilter
        quickFilterParser={(input) =>
          input
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        }
        sx={{
          minWidth: 320,
          maxWidth: 440,
          flex: '1 1 320px',
          '& .MuiInputBase-root': {
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#111827',
            bgcolor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 2,
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
            px: 1,
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          },
          '& .MuiInputBase-root:hover': {
            borderColor: '#94a3b8',
          },
          '& .MuiInputBase-root.Mui-focused': {
            borderColor: '#2563eb',
            boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.14)',
          },
          '& .MuiInputBase-root': {
            color: '#111827',
          },
          '& .MuiInputBase-input': {
            py: 1,
          },
          '& .MuiSvgIcon-root': {
            color: '#64748b',
          },
        }}
      />
      <Box
        ref={handlePanelAnchorRef}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 0.75,
          flexWrap: 'wrap',
          '& .MuiButton-root': {
            minWidth: 'auto',
            px: 1,
            py: 0.5,
            fontSize: '0.75rem',
            fontWeight: 500,
            textTransform: 'none',
            color: TERTIARY_ACTION_COLOR,
          },
          '& .MuiButton-startIcon': {
            mr: 0.5,
          },
          '& .MuiSvgIcon-root': {
            fontSize: 18,
            color: TERTIARY_ACTION_COLOR,
          },
        }}
      >
        <GridToolbarColumnsButton />
        <GridToolbarFilterButton />
        <GridToolbarDensitySelector />
      </Box>
    </GridToolbarContainer>
  );
}

/**
 * User Job Performance page component
 */
function UserJobPerformance() {
  const navigate = useNavigate();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeDrawerJobId, setActiveDrawerJobId] = useState<string | null>(null);
  const [maxSelectionTooltipOpen, setMaxSelectionTooltipOpen] = useState(false);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>([]);
  const [panelAnchorEl, setPanelAnchorEl] = useState<HTMLDivElement | null>(null);
  const [columnVisibilityModel, setColumnVisibilityModel] =
    useState<GridColumnVisibilityModel>({});

  // Load real data from user-jobs.json
  const userJobsData = useDataFromSource('data/user-job-performance/user-jobs.json') as UserJobData[] | undefined;
  const metricsByJob = useDataFromSource(
    'data/user-job-performance/metrics-data.json'
  ) as MetricsByJob | undefined;

  const openActionsMenu = (event: MouseEvent<HTMLElement>, jobId: string) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setSelectedJobId(jobId);
  };

  const closeActionsMenu = () => {
    setMenuAnchorEl(null);
  };

  const closeJobSummaryDrawer = () => {
    setActiveDrawerJobId(null);
  };

  const openJobSummaryDrawer = (jobId: string) => {
    setActiveDrawerJobId(jobId);
  };

  const handlePanelAnchorElChange = useCallback((element: HTMLDivElement | null) => {
    setPanelAnchorEl((currentElement) => (
      currentElement === element ? currentElement : element
    ));
  }, []);

  const toolbarSlot = useCallback(
    () => <JobTableToolbar setPanelAnchorEl={handlePanelAnchorElChange} />,
    [handlePanelAnchorElChange]
  );
  const getTogglableColumns = useCallback(
    (gridColumns: GridColDef[]) => (
      gridColumns
        .filter((column) => !['__check__', 'jobName', 'jobStatus'].includes(column.field))
        .map((column) => column.field)
    ),
    []
  );

  const viewRealData = () => {
    if (!selectedJobId) {
      return;
    }

    navigate({
      to: '/user-job-performance/performance/$id',
      params: { id: selectedJobId },
    });
    closeActionsMenu();
  };

  // Generate dummy data for GPU utilization and energy consumed
  const generateDummyGpuUtil = (jobId: number) => getSeededValue(jobId, 40, 75);
  const generateDummyEnergy = (jobId: number) => getSeededValue(jobId + 17, 800, 1600);
  const generateEnergyStatus = (energy: number) => {
    if (energy > 1400) return 'high';
    if (energy > 1100) return 'warning';
    return 'medium';
  };

  // Transform the data for the grid
  const jobData: JobGridRow[] = (userJobsData as UserJobData[] | undefined)?.map((job: UserJobData, index: number) => {
    const gpuUtil = generateDummyGpuUtil(job['Job ID']);
    const energy = generateDummyEnergy(job['Job ID']);
    const baseRow = {
      id: job['Job ID'].toString(),
      startTime: job['Start Time'],
      endTime: job['End Time'],
      jobId: job['Job ID'].toString(),
      jobName: job['Job Name'] ?? `${job.Partition} job`,
      projectId: job.Project,
      nodeHours: job['Charged Node Hours'],
      nodeCount: calculateNodeCount(
        job['Start Time'],
        job['End Time'],
        job['Charged Node Hours']
      ),
      waitTime: fallbackWaitTimes[index % fallbackWaitTimes.length],
      executionTime: formatExecutionTime(job['Start Time'], job['End Time']),
      jobStatus: job['Job Status'] ?? fallbackJobStatuses[index % fallbackJobStatuses.length],
      avgGpuUtilization: gpuUtil,
      energyConsumed: energy,
      energyStatus: generateEnergyStatus(energy),
      qos: job.QOS,
      user: job.User,
      partition: job.Partition,
      hostname: job.Hostname,
    };
    const performanceSnapshot = getJobPerformanceSummary(baseRow, metricsByJob);

    return {
      ...baseRow,
      cpuUtilization: Number(performanceSnapshot.cpuUtilization.toFixed(1)),
      gpuMemoryUtilization: Number(performanceSnapshot.memoryUtilization.toFixed(1)),
    };
  }) || [];
  const activeJob = jobData.find((job) => job.id === activeDrawerJobId) ?? null;
  const selectedJobCount = rowSelectionModel.length;
  const performanceSummary = activeJob
    ? getJobPerformanceSummary(activeJob, metricsByJob)
    : null;
  const donutSegments = performanceSummary ? (() => {
    const activeShare = 100 - performanceSummary.idlePercent;
    const basis = [
      { label: 'GPU', value: performanceSummary.gpuUtilization, color: '#10b981' },
      { label: 'CPU', value: performanceSummary.cpuUtilization, color: '#3b82f6' },
      { label: 'Memory', value: performanceSummary.memoryUtilization, color: '#f59e0b' },
    ];
    const totalBasis = basis.reduce((sum, item) => sum + item.value, 0) || 1;

    return [
      ...basis.map((item) => ({
        ...item,
        share: Number(((activeShare * item.value) / totalBasis).toFixed(1)),
      })),
      {
        label: 'Others',
        value: performanceSummary.idlePercent,
        share: Number(performanceSummary.idlePercent.toFixed(1)),
        color: '#94a3b8',
      },
    ];
  })() : [];
  const idleNodeHours = activeJob && performanceSummary
    ? (activeJob.nodeHours * performanceSummary.idlePercent) / 100
    : 0;

  // Table columns definition
  const columns: GridColDef[] = [
    {
      field: 'jobName',
      headerName: 'Job Name',
      width: 150,
      hideable: false,
      renderCell: (params: GridRenderCellParams) => (
        <MuiLink
          component={Link}
          to="/user-job-performance/$id"
          params={{ id: params.row.jobId }}
          underline="hover"
          sx={{
            color: '#2563eb',
            fontWeight: 500,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          {params.value}
        </MuiLink>
      ),
    },
    {
      field: 'startTime',
      headerName: 'Submit time',
      width: 176,
      renderCell: (params: GridRenderCellParams) => (
        <Tooltip title={formatFullDateTime(params.value as string)} arrow>
          <Typography variant="body2">{formatShortDateTime(params.value as string)}</Typography>
        </Tooltip>
      ),
    },
    {
      field: 'jobId',
      headerName: 'Job ID',
      width: 88,
    },
    {
      field: 'projectId',
      headerName: 'Project ID',
      width: 82,
    },
    {
      field: 'qos',
      headerName: 'QOS',
      width: 112,
    },
    {
      field: 'nodeHours',
      headerName: 'Node Hours',
      width: 104,
      type: 'number',
    },
    {
      field: 'nodeCount',
      headerName: 'No. of Nodes',
      width: 112,
      type: 'number',
    },
    {
      field: 'waitTime',
      headerName: 'Wait Time',
      width: 96,
    },
    {
      field: 'executionTime',
      headerName: 'Run Time',
      width: 96,
    },
    {
      field: 'jobStatus',
      headerName: 'Job Status',
      width: 108,
      hideable: false,
      renderCell: (params: GridRenderCellParams) => {
        const statusTone = getJobStatusTone(String(params.value ?? ''));

        return (
          <Chip
            label={String(params.value ?? 'Unknown')}
            size="small"
            sx={{
              height: 22,
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: statusTone.color,
              bgcolor: statusTone.backgroundColor,
              border: `1px solid ${statusTone.borderColor}`,
              '& .MuiChip-label': {
                px: 0.75,
              },
            }}
          />
        );
      },
    },
    {
      field: 'avgGpuUtilization',
      headerName: 'GPU Utilization',
      width: 148,
      renderCell: (params: GridRenderCellParams) => {
        const utilization = Math.max(0, Math.min(100, Number(params.value) || 0));
        const utilizationColor = utilization >= 70
          ? '#16a34a'
          : utilization >= 40
            ? '#d29731'
            : '#dc2626';

        return (
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, width: '100%' }}
          >
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                height: 10,
                bgcolor: '#cfcfcf',
                overflow: 'hidden',
                borderRadius: 999,
              }}
            >
              <Box
                sx={{
                  width: `${utilization}%`,
                  height: '100%',
                  bgcolor: utilizationColor,
                }}
              />
            </Box>
            <Typography variant="body2" sx={{ minWidth: '38px' }}>
              {utilization}%
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'gpuMemoryUtilization',
      headerName: 'GPU Memory',
      width: 188,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">{params.value}%</Typography>
      ),
    },
    {
      field: 'cpuUtilization',
      headerName: 'CPU Utilization',
      width: 142,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">{params.value}%</Typography>
      ),
    },
    {
      field: 'energyConsumed',
      headerName: 'Energy Consumed (J)',
      width: 136,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">{params.value}</Typography>
      ),
    },
    {
      field: 'endTime',
      headerName: 'End time',
      width: 176,
      renderCell: (params: GridRenderCellParams) => (
        <Tooltip title={formatFullDateTime(params.value as string)} arrow>
          <Typography variant="body2">{formatShortDateTime(params.value as string)}</Typography>
        </Tooltip>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: ACTIONS_COLUMN_WIDTH,
      sortable: false,
      filterable: false,
      hideable: false,
      disableColumnMenu: true,
      headerClassName: 'sticky-actions-column',
      cellClassName: 'sticky-actions-column',
      renderCell: (params: GridRenderCellParams) => (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 0.5,
            width: '100%',
            whiteSpace: 'nowrap',
          }}
        >
          <Link
            to="/user-job-performance/$id"
            params={{ id: params.row.id }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openJobSummaryDrawer(params.row.id);
            }}
            style={{
              fontSize: '0.875rem',
              textDecoration: 'none',
              color: '#2563eb',
            }}
          >
            Quick View
          </Link>
          <IconButton
            size="small"
            aria-label="More actions"
            onClick={(event) => {
              event.stopPropagation();
              openActionsMenu(event, params.row.id);
            }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <FilterContext>
      <Box
        sx={{
          width: '80%',
          maxWidth: '1800px',
          margin: '0 auto',
          padding: 3,
        }}
      >
        {/* Breadcrumb */}
        <Breadcrumbs sx={{ mb: 2 }}>
          <MuiLink underline="hover" color="primary" href="#">
            For Users
          </MuiLink>
          <Typography color="text.primary">Performance Metrics</Typography>
        </Breadcrumbs>

        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h3"
            sx={{ fontWeight: 700, color: '#1a1a1a', mb: 1 }}
          >
            Your Job Performance
          </Typography>
        </Box>

        {/* Recent Jobs and Performance Section */}
        <Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography
              variant="h5"
              sx={{ fontWeight: 600, color: '#1a2f5a' }}
            >
              Recent Jobs and Performance
            </Typography>
            <Tooltip
              open={maxSelectionTooltipOpen}
              title="Max 5 jobs can be compared"
              placement="top"
              arrow
            >
              <Button
                variant={selectedJobCount > 0 ? 'contained' : 'outlined'}
                onClick={() => navigate({ to: '/user-job-performance/compare' })}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: '#1a2f5a',
                  color: selectedJobCount > 0 ? '#ffffff' : '#1a2f5a',
                  bgcolor: selectedJobCount > 0 ? '#1a2f5a' : 'transparent',
                  '&:hover': {
                    borderColor: '#1a2f5a',
                    bgcolor: selectedJobCount > 0 ? '#0f1f42' : 'rgba(26, 47, 90, 0.08)',
                    color: selectedJobCount > 0 ? '#ffffff' : '#1a2f5a',
                  },
                }}
              >
                Compare More Metrics →
              </Button>
            </Tooltip>
          </Box>

          <Paper sx={{ p: 1, width: '100%' }}>
            {!userJobsData ? (
              <Box sx={{ p: 3 }}>
                <Typography>Loading job data...</Typography>
              </Box>
            ) : (
              <SciDataGrid
                rows={jobData}
                columns={columns}
                pagination
                paginationMode="client"
                checkboxSelection
                disableVirtualization
                disableColumnSelector={false}
                disableRowSelectionOnClick
                getRowId={(row) => row.id}
                autoHeight
                rowSelectionModel={rowSelectionModel}
                onRowSelectionModelChange={(newSelectionModel) => {
                  if (newSelectionModel.length > 5) {
                    setMaxSelectionTooltipOpen(true);
                    window.setTimeout(() => setMaxSelectionTooltipOpen(false), 1800);
                  }
                  const cappedSelection = newSelectionModel.slice(0, 5);
                  setRowSelectionModel(cappedSelection);
                }}
                columnVisibilityModel={columnVisibilityModel}
                onColumnVisibilityModelChange={setColumnVisibilityModel}
                initialState={{
                  pagination: { paginationModel: { page: 0, pageSize: 10 } },
                }}
                pageSizeOptions={[10, 25, 50]}
                slots={{
                  toolbar: toolbarSlot,
                }}
                slotProps={{
                  columnsManagement: {
                    getTogglableColumns,
                  },
                  panel: {
                    anchorEl: panelAnchorEl,
                    placement: 'bottom-end',
                  },
                }}
                onRowClick={(params) => {
                  openJobSummaryDrawer(params.row.id);
                }}
                sx={{
                  width: '100%',
                  '& .MuiDataGrid-toolbarContainer': {
                    px: 1,
                    pt: 1,
                    pb: 0.5,
                    gap: 1,
                  },
                  '& .MuiDataGrid-columnHeaders': {
                    bgcolor: '#f5f5f5',
                    fontWeight: 600,
                  },
                  '& .MuiDataGrid-cellCheckbox, & .MuiDataGrid-columnHeaderCheckbox': {
                    justifyContent: 'center',
                  },
                  '& .MuiDataGrid-columnHeader, & .MuiDataGrid-columnHeaderTitleContainer, & .MuiDataGrid-columnHeaderTitleContainerContent': {
                    justifyContent: 'flex-start',
                  },
                  '& .MuiDataGrid-columnHeaderTitle': {
                    width: '100%',
                    textAlign: 'left',
                  },
                  '& .MuiDataGrid-cell': {
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                  },
                  '& .MuiDataGrid-cell--textRight, & .MuiDataGrid-cell--withRenderer': {
                    justifyContent: 'flex-start',
                  },
                  '& .MuiDataGrid-columnHeadersInner': {
                    pr: `${ACTIONS_COLUMN_WIDTH}px`,
                  },
                  '& .MuiDataGrid-virtualScrollerRenderZone .MuiDataGrid-row': {
                    pr: `${ACTIONS_COLUMN_WIDTH}px`,
                  },
                  '& .MuiDataGrid-row': {
                    cursor: 'pointer',
                  },
                  '& .sticky-actions-column': {
                    position: 'sticky !important',
                    right: 0,
                    zIndex: 3,
                    backgroundColor: '#ffffff',
                    boxShadow: '-8px 0 12px -12px rgba(15, 23, 42, 0.45)',
                  },
                  '& .MuiDataGrid-columnHeader.sticky-actions-column': {
                    zIndex: 4,
                    backgroundColor: '#f5f5f5',
                  },
                }}
              />
            )}
          </Paper>
          <Menu
            anchorEl={menuAnchorEl}
            open={Boolean(menuAnchorEl)}
            onClose={closeActionsMenu}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <MenuItem onClick={viewRealData}>
              View Real Data
            </MenuItem>
          </Menu>
        </Box>
      </Box>
      <Drawer
        anchor="right"
        open={Boolean(activeJob)}
        onClose={closeJobSummaryDrawer}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: PANEL_WIDTH },
            bgcolor: '#f8fafc',
          },
        }}
      >
        {activeJob && performanceSummary && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {(() => {
              const statusTone = getJobStatusTone(activeJob.jobStatus);

              return (
                <>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <Box
              sx={{
                px: 3,
                py: 2.5,
                bgcolor: '#f8fafc',
                color: '#111827',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline" sx={{ letterSpacing: '0.08em', opacity: 0.75 }}>
                    Job Summary
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {activeJob.jobName}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <Typography variant="body2" sx={{ color: '#4b5563' }}>
                      Job ID {activeJob.jobId}
                    </Typography>
                    <Chip
                      label={activeJob.jobStatus}
                      size="small"
                      sx={{
                        height: 24,
                        fontWeight: 700,
                        color: statusTone.color,
                        bgcolor: statusTone.backgroundColor,
                        border: `1px solid ${statusTone.borderColor}`,
                        '& .MuiChip-label': {
                          px: 1,
                        },
                      }}
                    />
                  </Box>
                </Box>
                <IconButton
                  onClick={closeJobSummaryDrawer}
                  sx={{ color: '#111827', mt: -0.5, mr: -1 }}
                  aria-label="Close summary panel"
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>

            <Box sx={{ p: 3 }}>
              <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 2 }}>
                  Overview
                </Typography>
                <Stack spacing={1.25}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Submit time</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                      {formatFullDateTime(activeJob.startTime)}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>End time</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                      {formatFullDateTime(activeJob.endTime)}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Wait time</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                      {activeJob.waitTime}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Run time</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                      {activeJob.executionTime}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Job status</Typography>
                    <Chip
                      label={activeJob.jobStatus}
                      size="small"
                      sx={{
                        height: 24,
                        fontWeight: 700,
                        color: statusTone.color,
                        bgcolor: statusTone.backgroundColor,
                        border: `1px solid ${statusTone.borderColor}`,
                        '& .MuiChip-label': {
                          px: 1,
                        },
                      }}
                    />
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Project</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                      {activeJob.projectId}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>QOS</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                      {activeJob.qos}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Partition</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                      {activeJob.partition}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Nodes</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                      {activeJob.nodeCount ?? 'N/A'}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>Node Hours</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                      {activeJob.nodeHours.toFixed(2)}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>

              <Paper
                sx={{
                  p: 2,
                  borderRadius: 3,
                  mb: 2.5,
                  bgcolor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '999px',
                        bgcolor: '#2563eb',
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e3a8a' }}>
                        Performance Hints
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#1d4ed8' }}>
                        3 hints available
                      </Typography>
                    </Box>
                  </Box>
                  <Button
                    component={Link}
                    to="/user-job-performance/$id"
                    params={{ id: activeJob.id }}
                    variant="outlined"
                    size="small"
                    sx={{
                      flexShrink: 0,
                      textTransform: 'none',
                      fontWeight: 600,
                      color: '#1d4ed8',
                      borderColor: '#93c5fd',
                      bgcolor: '#ffffff',
                      '&:hover': {
                        borderColor: '#60a5fa',
                        bgcolor: '#dbeafe',
                      },
                    }}
                  >
                    Explore
                  </Button>
                </Box>
              </Paper>

              <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 2 }}>
                  Runtime Resource Distribution
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 170px',
                    gap: 2,
                    alignItems: 'center',
                  }}
                >
                  <Stack spacing={1.25}>
                    {donutSegments.map((segment) => (
                      <Box
                        key={segment.label}
                        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: segment.color,
                            }}
                          />
                          <Typography variant="body2" sx={{ color: '#111827', fontWeight: 600 }}>
                            {segment.label}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ color: '#475569' }}>
                          {segment.share.toFixed(1)}%
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                  <Plot
                    data={[
                      {
                        type: 'pie',
                        hole: 0.62,
                        values: donutSegments.map((segment) => segment.share),
                        labels: donutSegments.map((segment) => segment.label),
                        marker: {
                          colors: donutSegments.map((segment) => segment.color),
                          line: { color: '#f8fafc', width: 4 },
                        },
                        textinfo: 'none',
                        hovertemplate: '%{label}: %{value:.1f}%<extra></extra>',
                        sort: false,
                        showlegend: false,
                      },
                    ]}
                    layout={{
                      autosize: true,
                      height: 180,
                      margin: { l: 0, r: 0, t: 0, b: 0 },
                      paper_bgcolor: 'rgba(0,0,0,0)',
                      plot_bgcolor: 'rgba(0,0,0,0)',
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    style={{ width: '100%' }}
                  />
                </Box>
              </Paper>

              <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
                  Node Hours Idle
                </Typography>
                <Typography variant="body2" sx={{ color: '#6b7280', mb: 1.5 }}>
                  Estimated idle node hours based on average runtime utilization.
                </Typography>
                <Typography variant="h4" sx={{ color: '#111827', fontWeight: 700 }}>
                  {idleNodeHours.toFixed(2)}
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                  node hours idle
                </Typography>
              </Paper>

              <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
                  GPU Throughput
                </Typography>
                <Divider sx={{ mb: 1 }} />
                <UtilizationIndicator
                  label="GPU Utilization"
                  value={performanceSummary.gpuUtilization}
                />
                <Divider />
                <UtilizationIndicator
                  label="Memory Utilization"
                  value={performanceSummary.memoryUtilization}
                />
              </Paper>
            </Box>
            </Box>
            <Box
              sx={{
                position: 'sticky',
                bottom: 0,
                px: 3,
                py: 2,
                borderTop: '1px solid #e2e8f0',
                bgcolor: 'rgba(248, 250, 252, 0.96)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Button
                component={Link}
                to="/user-job-performance/$id"
                params={{ id: activeJob.id }}
                variant="contained"
                fullWidth
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: '#0f172a',
                  '&:hover': {
                    bgcolor: '#1e293b',
                  },
                }}
              >
                View Performance Details
              </Button>
            </Box>
                </>
              );
            })()}
          </Box>
        )}
      </Drawer>
    </FilterContext>
  );
}

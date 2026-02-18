import {
  Box,
  Paper,
  Typography,
  Button,
  Breadcrumbs,
  Link as MuiLink,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { MouseEvent, useState } from 'react';
import { FilterContext } from '../../components/FilterContext';
import { SciDataGrid } from '../../components/SciDataGrid';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useDataFromSource } from '../../hooks/useDataFromSource';

export const Route = createFileRoute('/user-job-performance/')({
  component: UserJobPerformance,
});

interface UserJobData {
  'Job ID': number;
  'User': string;
  'Project': string;
  'Partition': string;
  'QOS': string;
  'Start Time': string;
  'End Time': string;
  'Hostname': string;
  'Charged Node Hours': number;
}

/**
 * User Job Performance page component
 */
function UserJobPerformance() {
  const navigate = useNavigate();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Load real data from user-jobs.json
  const userJobsData = useDataFromSource('data/user-job-performance/user-jobs.json') as UserJobData[] | undefined;

  const openActionsMenu = (event: MouseEvent<HTMLElement>, jobId: string) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setSelectedJobId(jobId);
  };

  const closeActionsMenu = () => {
    setMenuAnchorEl(null);
  };

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
  const generateDummyGpuUtil = () => Math.floor(40 + Math.random() * 35);
  const generateDummyEnergy = () => Math.floor(800 + Math.random() * 800);
  const generateEnergyStatus = (energy: number) => {
    if (energy > 1400) return 'high';
    if (energy > 1100) return 'warning';
    return 'medium';
  };

  // Transform the data for the grid
  const jobData = (userJobsData as UserJobData[] | undefined)?.map((job: UserJobData) => {
    const gpuUtil = generateDummyGpuUtil();
    const energy = generateDummyEnergy();
    return {
      id: job['Job ID'].toString(),
      startTime: job['Start Time'],
      endTime: job['End Time'],
      jobId: job['Job ID'].toString(),
      projectId: job['Project'],
      chargedNodeHours: job['Charged Node Hours'],
      avgGpuUtilization: gpuUtil,
      energyConsumed: energy,
      energyStatus: generateEnergyStatus(energy),
      qos: job['QOS'],
    };
  }) || [];

  // Table columns definition
  const columns: GridColDef[] = [
    {
      field: 'startTime',
      headerName: 'Start time (PST)',
      width: 140,
    },
    {
      field: 'endTime',
      headerName: 'End time (PST)',
      width: 140,
    },
    {
      field: 'jobId',
      headerName: 'Job ID',
      width: 100,
    },
    {
      field: 'projectId',
      headerName: 'Project ID',
      width: 90,
    },
    {
      field: 'chargedNodeHours',
      headerName: 'Charged Node Hours',
      width: 150,
      type: 'number',
    },
    {
      field: 'avgGpuUtilization',
      headerName: 'Avg. GPU Utilization',
      width: 220,
      renderCell: (params: GridRenderCellParams) => {
        const utilization = Math.max(0, Math.min(100, Number(params.value) || 0));

        return (
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}
          >
            <Box
              sx={{
                flex: 1,
                height: 16,
                bgcolor: '#cfcfcf',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  width: `${utilization}%`,
                  height: '100%',
                  bgcolor: '#0b3a6b',
                }}
              />
            </Box>
            <Typography variant="body2" sx={{ minWidth: '48px' }}>
              {utilization}%
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'energyConsumed',
      headerName: 'Energy Consumed (J)',
      width: 160,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">{params.value}</Typography>
      ),
    },
    {
      field: 'qos',
      headerName: 'QOS',
      width: 140,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 180,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Link
            to="/user-job-performance/$id"
            params={{ id: params.row.id }}
            style={{
              fontSize: '0.875rem',
              textDecoration: 'none',
              color: '#1976d2',
            }}
          >
            View Performance
          </Link>
          <IconButton
            size="small"
            aria-label="More actions"
            onClick={(event) => openActionsMenu(event, params.row.id)}
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
          maxWidth: '1400px',
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
            <Button
              variant="outlined"
              onClick={() => navigate({ to: '/user-job-performance/compare' })}
              sx={{
                textTransform: 'none',
                borderColor: '#1a2f5a',
                color: '#1a2f5a',
                '&:hover': {
                    borderColor: '#1a2f5a',
                    bgcolor: 'rgba(26, 47, 90)',
                    color: '#ffffff',
                },
              }}
            >
              Compare More Metrics →
            </Button>
          </Box>

          <Paper sx={{ p: 1 }}>
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
                getRowId={(row) => row.id}
                disableColumnSelector
                autoHeight
                initialState={{
                  pagination: { paginationModel: { page: 0, pageSize: 10 } },
                }}
                pageSizeOptions={[10, 25, 50]}
                sx={{
                  '& .MuiDataGrid-columnHeaders': {
                    bgcolor: '#f5f5f5',
                    fontWeight: 600,
                  },
                  '& .MuiDataGrid-cell': {
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    alignItems: 'center',
                  },
                }}
              />
            )}
          </Paper>
          <Menu
            anchorEl={menuAnchorEl}
            open={Boolean(menuAnchorEl)}
            onClose={closeActionsMenu}
          >
            <MenuItem onClick={viewRealData}>
              View Real Data
            </MenuItem>
          </Menu>
        </Box>
      </Box>
    </FilterContext>
  );
}

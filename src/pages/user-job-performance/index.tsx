import {
  Box,
  Paper,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  Breadcrumbs,
  Link as MuiLink,
} from '@mui/material';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import Plot from 'react-plotly.js';
import { FilterContext } from '../../components/FilterContext';
import { SciDataGrid } from '../../components/SciDataGrid';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { LinearMeter } from '../../components/LinearMeter';

export const Route = createFileRoute('/user-job-performance/')({
  component: UserJobPerformance,
});

// Dummy data for the performance chart
const generatePerformanceData = () => {
  const jobs = [
    { id: '40030776', color: '#4472c4' },
    { id: '40030778', color: '#70ad47' },
    { id: '40030779', color: '#ffc000' },
    { id: '40030780', color: '#a349a4' },
    { id: '40030781', color: '#ff6b9d' },
  ];

  const timePoints = Array.from({ length: 21 }, (_, i) => i * 5); // 0%, 5%, 10%, ... 100%

  return jobs.map((job) => {
    const yValues = timePoints.map(() => {
      // Generate random GPU power values between 0-200
      return Math.random() * 150 + 25;
    });

    return {
      x: timePoints,
      y: yValues,
      type: 'scatter',
      mode: 'lines',
      name: `Job ${job.id}`,
      line: { color: job.color, width: 2 },
    };
  });
};

// Dummy job data
const jobData = [
  {
    id: '1232XXX',
    startTime: 'Today, 12:30 PM',
    endTime: 'Today, 2:00 PM',
    jobId: '1232XXX',
    projectId: 'm1232X',
    avgGpuUtilization: 55,
    energyConsumed: 1550,
    energyStatus: 'high',
    qos: 'Regular',
  },
  {
    id: '1232XXY',
    startTime: 'Today, 11:30 AM',
    endTime: 'Today, 8:00 AM',
    jobId: '1232XXY',
    projectId: 'm1232X',
    avgGpuUtilization: 51,
    energyConsumed: 920,
    energyStatus: 'medium',
    qos: 'Regular',
  },
  {
    id: '1232XXZ',
    startTime: '29 Apr, 11:30 PM',
    endTime: 'Today, 7:00 AM',
    jobId: '1232XXZ',
    projectId: 'm1232X',
    avgGpuUtilization: 72,
    energyConsumed: 950,
    energyStatus: 'medium',
    qos: 'Regular',
  },
  {
    id: '1232XX0',
    startTime: '29 Apr, 11:30 PM',
    endTime: '29 Apr, 9:30 PM',
    jobId: '1232XX0',
    projectId: 'm1232X',
    avgGpuUtilization: 46,
    energyConsumed: 1250,
    energyStatus: 'warning',
    qos: 'Regular',
  },
  {
    id: '1232XX1',
    startTime: '29 Apr, 11:30 PM',
    endTime: '29 Apr, 9:30 PM',
    jobId: '1232XX1',
    projectId: 'm1232X',
    avgGpuUtilization: 46,
    energyConsumed: 1250,
    energyStatus: 'warning',
    qos: 'Regular',
  },
  {
    id: '1232XX2',
    startTime: '29 Apr, 11:30 PM',
    endTime: '29 Apr, 9:30 PM',
    jobId: '1232XX2',
    projectId: 'm1232X',
    avgGpuUtilization: 46,
    energyConsumed: 1250,
    energyStatus: 'warning',
    qos: 'Regular',
  },
  {
    id: '1232XX3',
    startTime: '29 Apr, 11:30 PM',
    endTime: '29 Apr, 9:30 PM',
    jobId: '1232XX3',
    projectId: 'm1232X',
    avgGpuUtilization: 46,
    energyConsumed: 1250,
    energyStatus: 'warning',
    qos: 'Regular',
  },
  {
    id: '1232XX4',
    startTime: '29 Apr, 11:30 PM',
    endTime: '29 Apr, 9:30 PM',
    jobId: '1232XX4',
    projectId: 'm1232X',
    avgGpuUtilization: 46,
    energyConsumed: 1250,
    energyStatus: 'warning',
    qos: 'Regular',
  },
  {
    id: '1232XX5',
    startTime: '28 Apr, 5:30 PM',
    endTime: '29 Apr, 9:30 PM',
    jobId: '1232XX5',
    projectId: 'm1232X',
    avgGpuUtilization: 46,
    energyConsumed: 1250,
    energyStatus: 'warning',
    qos: 'Regular',
  },
];

/**
 * User Job Performance page component
 */
function UserJobPerformance() {
  const [project, setProject] = useState('m123123');
  const [compareJobs, setCompareJobs] = useState('Recent 5 Jobs');
  const [metric, setMetric] = useState('GPU Power');

  const performanceData = generatePerformanceData();

  // Table columns definition
  const columns: GridColDef[] = [
    {
      field: 'startTime',
      headerName: 'Start time (PST)',
      width: 160,
    },
    {
      field: 'endTime',
      headerName: 'End time (PST)',
      width: 160,
    },
    {
      field: 'jobId',
      headerName: 'Job ID',
      width: 120,
    },
    {
      field: 'projectId',
      headerName: 'Project ID',
      width: 120,
    },
    {
      field: 'avgGpuUtilization',
      headerName: 'Avg. GPU Utilization',
      width: 200,
      renderCell: (params: GridRenderCellParams) => (
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}
        >
          <Box sx={{ flex: 1 }}>
            <LinearMeter value={params.value} />
          </Box>
          <Typography variant="body2" sx={{ minWidth: '40px' }}>
            {params.value}%
          </Typography>
        </Box>
      ),
    },
    {
      field: 'energyConsumed',
      headerName: 'Energy Consumed (J)',
      width: 180,
      renderCell: (params: GridRenderCellParams) => {
        const status = params.row.energyStatus;
        let color: string = '#4caf50';

        if (status === 'high') {
          color = '#f44336';
        } else if (status === 'warning') {
          color = '#ff9800';
        }

        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: color,
              }}
            />
            <Typography variant="body2">{params.value}</Typography>
          </Box>
        );
      },
    },
    {
      field: 'qos',
      headerName: 'QOS',
      width: 100,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 220,
      renderCell: (params: GridRenderCellParams) => (
        <Link
          to="/user-job-performance/$id"
          params={{ id: params.row.id }}
          style={{
            fontSize: '0.875rem',
            textDecoration: 'none',
            color: '#1976d2',
          }}
        >
          View Performance Summary
        </Link>
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

        {/* Recent Performance Trend Section */}
        <Box sx={{ mb: 5 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 600, color: '#1a2f5a' }}>
              Recent Performance Trend for Project - m123123
            </Typography>
            <Button
              variant="outlined"
              sx={{
                textTransform: 'none',
                borderColor: '#1a2f5a',
                color: '#1a2f5a',
                '&:hover': {
                  borderColor: '#1a2f5a',
                  bgcolor: 'rgba(26, 47, 90, 0.04)',
                },
              }}
            >
              Compare More Metrics →
            </Button>
          </Box>

          <Paper sx={{ p: 3 }}>
            {/* Filters */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <Box sx={{ minWidth: 150 }}>
                <Typography
                  variant="caption"
                  sx={{ color: '#666', mb: 0.5, display: 'block' }}
                >
                  Project
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                    sx={{ bgcolor: 'white' }}
                  >
                    <MenuItem value="m123123">m123123</MenuItem>
                    <MenuItem value="m123124">m123124</MenuItem>
                    <MenuItem value="m123125">m123125</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ minWidth: 180 }}>
                <Typography
                  variant="caption"
                  sx={{ color: '#666', mb: 0.5, display: 'block' }}
                >
                  Compare Jobs
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={compareJobs}
                    onChange={(e) => setCompareJobs(e.target.value)}
                    sx={{ bgcolor: 'white' }}
                  >
                    <MenuItem value="Recent 5 Jobs">Recent 5 Jobs</MenuItem>
                    <MenuItem value="Recent 10 Jobs">Recent 10 Jobs</MenuItem>
                    <MenuItem value="All Jobs">All Jobs</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ minWidth: 180 }}>
                <Typography
                  variant="caption"
                  sx={{ color: '#666', mb: 0.5, display: 'block' }}
                >
                  Comparison metric
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                    sx={{ bgcolor: 'white' }}
                  >
                    <MenuItem value="GPU Power">GPU Power</MenuItem>
                    <MenuItem value="GPU Utilization">GPU Utilization</MenuItem>
                    <MenuItem value="Memory Usage">Memory Usage</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>

            {/* Performance Chart */}
            <Box sx={{ bgcolor: '#fafafa', p: 2, borderRadius: 1 }}>
              <Plot
                data={performanceData as any}
                layout={{
                  autosize: true,
                  height: 400,
                  margin: { l: 60, r: 120, t: 20, b: 60 },
                  xaxis: {
                    title: 'Relative Time',
                    tickmode: 'linear',
                    tick0: 0,
                    dtick: 10,
                    ticksuffix: '%',
                    gridcolor: '#e0e0e0',
                    showgrid: true,
                  },
                  yaxis: {
                    title: 'GPU Power',
                    gridcolor: '#e0e0e0',
                    showgrid: true,
                    range: [0, 200],
                  },
                  plot_bgcolor: 'white',
                  paper_bgcolor: '#fafafa',
                  showlegend: true,
                  legend: {
                    x: 1.02,
                    y: 1,
                    xanchor: 'left',
                    yanchor: 'top',
                  },
                }}
                config={{
                  responsive: true,
                  displayModeBar: false,
                }}
                style={{ width: '100%' }}
              />
            </Box>
          </Paper>
        </Box>

        {/* Recent Jobs and Performance Section */}
        <Box>
          <Typography
            variant="h5"
            sx={{ fontWeight: 600, color: '#1a2f5a', mb: 2 }}
          >
            Recent Jobs and Performance
          </Typography>

          <Paper sx={{ p: 0 }}>
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
                },
              }}
            />
          </Paper>
        </Box>
      </Box>
    </FilterContext>
  );
}

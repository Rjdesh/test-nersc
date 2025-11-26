import {
  Container,
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Breadcrumbs,
  Link as MuiLink,
  IconButton,
} from '@mui/material';
import { createFileRoute, Link } from '@tanstack/react-router';
import Plot from 'react-plotly.js';
import { useState } from 'react';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

export const Route = createFileRoute('/center-performance/')({
  component: CenterPerformance,
});

/**
 * Center Performance page component
 */
function CenterPerformance() {
  const [timeRange, setTimeRange] = useState('This week');
  const [system, setSystem] = useState('Perlmutter');
  const [showQueueWaitTable, setShowQueueWaitTable] = useState(true);
  const [showQueuedJobsTable, setShowQueuedJobsTable] = useState(true);

  // Dummy data for Queue Wait Times Heatmap
  const queueWaitHeatmapData = {
    z: [
      [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0,
      ], // 1 node
      [
        5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 16, 15, 14, 13, 12, 11,
        10, 9, 8, 7, 6, 5, 8,
      ], // 2-3 nodes
      [
        12, 14, 16, 18, 20, 22, 24, 26, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19,
        18, 17, 16, 15, 14, 13, 12, 18,
      ], // 4-7 nodes
      [
        18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 39, 38, 37, 36, 35, 34,
        33, 32, 31, 30, 29, 28, 27, 28,
      ], // 8-15 nodes
      [
        25, 28, 31, 34, 37, 40, 43, 46, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40,
        39, 38, 37, 36, 35, 34, 33, 35,
      ], // 16-31 nodes
      [
        32, 36, 40, 44, 48, 52, 56, 60, 58, 56, 54, 52, 50, 48, 46, 44, 42, 40,
        38, 36, 34, 32, 30, 28, 26, 48,
      ], // 32-63 nodes
      [
        45, 50, 55, 60, 65, 70, 75, 80, 85, 83, 81, 79, 77, 75, 73, 71, 69, 67,
        65, 63, 61, 59, 57, 55, 53, 68,
      ], // 64-127 nodes
      [
        58, 64, 70, 76, 82, 88, 94, 100, 98, 96, 94, 92, 90, 88, 86, 84, 82, 80,
        78, 76, 74, 72, 70, 68, 66, 85,
      ], // 128-255 nodes
      [
        72, 79, 86, 93, 100, 107, 114, 121, 128, 125, 122, 119, 116, 113, 110,
        107, 104, 101, 98, 95, 92, 89, 86, 83, 80, 102,
      ], // 256-511 nodes
      [
        88, 96, 104, 112, 120, 128, 136, 144, 152, 148, 144, 140, 136, 132, 128,
        124, 120, 116, 112, 108, 104, 100, 96, 92, 88, 128,
      ], // 512-1023 nodes
      [
        105, 115, 125, 135, 145, 155, 165, 175, 185, 180, 175, 170, 165, 160,
        155, 150, 145, 140, 135, 130, 125, 120, 115, 110, 105, 155,
      ], // 1024-2047 nodes
      [
        125, 137, 149, 161, 173, 185, 197, 209, 221, 215, 209, 203, 197, 191,
        185, 179, 173, 167, 161, 155, 149, 143, 137, 131, 125, 185,
      ], // 2048-4095 nodes
      [
        148, 162, 176, 190, 204, 218, 232, 246, 260, 253, 246, 239, 232, 225,
        218, 211, 204, 197, 190, 183, 176, 169, 162, 155, 148, 215,
      ], // 4096-8191 nodes
      [
        172, 188, 204, 220, 236, 252, 268, 284, 300, 292, 284, 276, 268, 260,
        252, 244, 236, 228, 220, 212, 204, 196, 188, 180, 172, 248,
      ], // 8192+ nodes
    ],
    x: [
      '<1',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '20',
      '21',
      '22',
      '23',
      '24',
      '24+',
    ],
    y: [
      '8192+',
      '4096-8191',
      '2048-4095',
      '1024-2047',
      '512-1023',
      '256-511',
      '128-255',
      '64-127',
      '32-63',
      '16-31',
      '8-15',
      '4-7',
      '2-3',
      '1',
    ],
  };

  // Dummy data for Queue Wait Times Table
  const queueWaitTableData = [
    {
      nodes: '1',
      debug: 0.3,
      interactive: 0.04,
      jupyter: 0.33,
      overrun: 400.78,
      preempt: 28.8,
      realtime: 0.0,
      regular: 189.23,
      shared: 6.28,
      other: 2.07,
      all: 41.6,
      longest: 18511.0,
    },
    {
      nodes: '2 - 3',
      debug: 0.14,
      interactive: 0.05,
      jupyter: 0.0,
      overrun: 31.0,
      preempt: 25.38,
      realtime: 0.0,
      regular: 15.37,
      shared: 0.0,
      other: 0.44,
      all: 6.51,
      longest: 254.05,
    },
    {
      nodes: '4 - 7',
      debug: 0.09,
      interactive: 0.05,
      jupyter: 0.31,
      overrun: 40.33,
      preempt: 14.44,
      realtime: 0.17,
      regular: 21.09,
      shared: 0.0,
      other: 0.65,
      all: 17.32,
      longest: 274.16,
    },
    {
      nodes: '8 - 15',
      debug: 0.33,
      interactive: 0.0,
      jupyter: 0.0,
      overrun: 49.5,
      preempt: 38.5,
      realtime: 0.0,
      regular: 34.56,
      shared: 0.0,
      other: 1.15,
      all: 18.36,
      longest: 371.38,
    },
    {
      nodes: '16 - 31',
      debug: 0.0,
      interactive: 0.0,
      jupyter: 0.0,
      overrun: 0.0,
      preempt: 20.44,
      realtime: 0.0,
      regular: 28.61,
      shared: 0.0,
      other: 3.09,
      all: 24.9,
      longest: 363.58,
    },
    {
      nodes: '32 - 63',
      debug: 0.0,
      interactive: 0.0,
      jupyter: 0.0,
      overrun: 27.79,
      preempt: 17.67,
      realtime: 0.0,
      regular: 37.76,
      shared: 0.0,
      other: 0.34,
      all: 32.91,
      longest: 398.7,
    },
    {
      nodes: '64 - 127',
      debug: 0.0,
      interactive: 0.0,
      jupyter: 0.0,
      overrun: 34.0,
      preempt: 22.1,
      realtime: 0.0,
      regular: 19.21,
      shared: 0.0,
      other: 0.1,
      all: 18.32,
      longest: 85.53,
    },
    {
      nodes: '128 - 255',
      debug: 0.0,
      interactive: 0.0,
      jupyter: 0.0,
      overrun: 0.0,
      preempt: 30.0,
      realtime: 0.0,
      regular: 16.86,
      shared: 0.0,
      other: 0.3,
      all: 13.73,
      longest: 50.84,
    },
    {
      nodes: '256 - 511',
      debug: 0.0,
      interactive: 0.0,
      jupyter: 0.0,
      overrun: 0.0,
      preempt: 0.0,
      realtime: 0.0,
      regular: 36.18,
      shared: 0.0,
      other: 3.25,
      all: 34.96,
      longest: 102.74,
    },
    {
      nodes: '512 - 1023',
      debug: 0.0,
      interactive: 0.0,
      jupyter: 0.0,
      overrun: 1195.0,
      preempt: 0.0,
      realtime: 0.0,
      regular: 27.0,
      shared: 0.0,
      other: 2.5,
      all: 180.36,
      longest: 1185.12,
    },
    {
      nodes: '1024 - 2047',
      debug: 0.0,
      interactive: 0.0,
      jupyter: 0.0,
      overrun: 0.0,
      preempt: 0.0,
      realtime: 0.0,
      regular: 24.0,
      shared: 0.0,
      other: 0.0,
      all: 24.0,
      longest: 32.82,
    },
    {
      nodes: '2048 - 4095',
      debug: 0.0,
      interactive: 0.0,
      jupyter: 0.0,
      overrun: 0.0,
      preempt: 0.0,
      realtime: 0.0,
      regular: 0.0,
      shared: 0.0,
      other: 0.0,
      all: 0.0,
      longest: 0.0,
    },
  ];

  // Dummy data for Queued Jobs Heatmap
  const queuedJobsHeatmapData = {
    z: [
      [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0,
      ], // 1 node
      [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0,
      ], // 2-3 nodes
      [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0,
      ], // 4-7 nodes
      [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0,
      ], // 8-15 nodes
      [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0,
      ], // 16-31 nodes
      [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0,
      ], // 32-63 nodes
      [
        28, 30, 32, 35, 38, 40, 42, 45, 48, 50, 52, 48, 44, 40, 38, 35, 32, 30,
        28, 25, 22, 20, 18, 15, 12, 30,
      ], // 64-127 nodes
      [
        52, 55, 60, 65, 68, 72, 75, 78, 82, 85, 88, 90, 87, 82, 78, 74, 70, 65,
        60, 55, 50, 48, 45, 42, 40, 72,
      ], // 128-255 nodes
      [
        45, 50, 55, 58, 62, 65, 68, 72, 75, 78, 80, 78, 75, 72, 68, 65, 62, 58,
        55, 52, 48, 45, 42, 38, 35, 61,
      ], // 256-511 nodes
      [
        82, 88, 92, 95, 98, 102, 105, 108, 112, 115, 118, 120, 118, 115, 112,
        108, 105, 102, 98, 95, 92, 88, 85, 82, 78, 88,
      ], // 512-1023 nodes
      [
        105, 112, 118, 125, 130, 135, 140, 145, 150, 155, 158, 160, 158, 155,
        150, 145, 140, 135, 130, 125, 120, 115, 110, 108, 105, 122,
      ], // 1024-2047 nodes
      [
        142, 148, 155, 162, 168, 175, 180, 185, 190, 195, 198, 200, 198, 195,
        190, 185, 180, 175, 168, 162, 155, 150, 145, 142, 138, 158,
      ], // 2048-4095 nodes
      [
        185, 192, 198, 205, 212, 218, 225, 230, 235, 240, 245, 248, 245, 240,
        235, 230, 225, 218, 212, 205, 198, 192, 188, 185, 180, 208,
      ], // 4096-8191 nodes
      [
        210, 218, 225, 232, 238, 245, 252, 258, 265, 270, 275, 278, 275, 270,
        265, 258, 252, 245, 238, 232, 225, 220, 215, 210, 205, 230,
      ], // 8192+ nodes
    ],
    x: [
      '<1',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '20',
      '21',
      '22',
      '23',
      '24',
      '24+',
    ],
    y: [
      '8192+',
      '4096-8191',
      '2048-4095',
      '1024-2047',
      '512-1023',
      '256-511',
      '128-255',
      '64-127',
      '32-63',
      '16-31',
      '8-15',
      '4-7',
      '2-3',
      '1',
    ],
  };

  // Dummy data for Queued Jobs Table
  const queuedJobsTableData = [
    {
      nodes: '1',
      debug: 21169,
      interactive: 1169,
      jupyter: 3017,
      overrun: 65,
      preempt: 24,
      realtime: 88,
      regular: 497,
      shared: 208032,
      other: 175934,
      all: 508632,
      percent: 99.77,
    },
    {
      nodes: '2 - 3',
      debug: 3808,
      interactive: 1199,
      jupyter: 10,
      overrun: 0,
      preempt: 1180,
      realtime: 210,
      regular: 6344,
      shared: 0,
      other: 265,
      all: 13027,
      percent: 2.38,
    },
    {
      nodes: '4 - 7',
      debug: 3913,
      interactive: 3070,
      jupyter: 90,
      overrun: 0,
      preempt: 255,
      realtime: 375,
      regular: 8963,
      shared: 0,
      other: 344,
      all: 17807,
      percent: 3.25,
    },
    {
      nodes: '8 - 15',
      debug: 2486,
      interactive: 0,
      jupyter: 0,
      overrun: 0,
      preempt: 288,
      realtime: 0,
      regular: 3704,
      shared: 0,
      other: 65,
      all: 6543,
      percent: 1.19,
    },
    {
      nodes: '16 - 31',
      debug: 0,
      interactive: 0,
      jupyter: 0,
      overrun: 0,
      preempt: 25,
      realtime: 0,
      regular: 855,
      shared: 0,
      other: 43,
      all: 923,
      percent: 0.17,
    },
    {
      nodes: '32 - 63',
      debug: 0,
      interactive: 0,
      jupyter: 0,
      overrun: 0,
      preempt: 16,
      realtime: 0,
      regular: 820,
      shared: 0,
      other: 5,
      all: 860,
      percent: 0.16,
    },
    {
      nodes: '64 - 127',
      debug: 0,
      interactive: 0,
      jupyter: 0,
      overrun: 0,
      preempt: 43,
      realtime: 0,
      regular: 358,
      shared: 0,
      other: 2,
      all: 403,
      percent: 0.07,
    },
    {
      nodes: '128 - 255',
      debug: 0,
      interactive: 0,
      jupyter: 0,
      overrun: 0,
      preempt: 18,
      realtime: 0,
      regular: 31,
      shared: 0,
      other: 0,
      all: 49,
      percent: 0.01,
    },
    {
      nodes: '256 - 511',
      debug: 0,
      interactive: 0,
      jupyter: 0,
      overrun: 0,
      preempt: 0,
      realtime: 0,
      regular: 24,
      shared: 0,
      other: 0,
      all: 24,
      percent: 0.0,
    },
    {
      nodes: '512 - 1023',
      debug: 0,
      interactive: 0,
      jupyter: 0,
      overrun: 0,
      preempt: 0,
      realtime: 0,
      regular: 5,
      shared: 0,
      other: 0,
      all: 8,
      percent: 0.0,
    },
    {
      nodes: '1024 - 2047',
      debug: 0,
      interactive: 0,
      jupyter: 0,
      overrun: 0,
      preempt: 0,
      realtime: 0,
      regular: 4,
      shared: 0,
      other: 0,
      all: 4,
      percent: 0.0,
    },
    {
      nodes: '2048 - 4095',
      debug: 0,
      interactive: 0,
      jupyter: 0,
      overrun: 0,
      preempt: 0,
      realtime: 0,
      regular: 0,
      shared: 0,
      other: 0,
      all: 0,
      percent: 0.0,
    },
  ];

  // Generate dummy data for Full System Power Usage (30 days)
  const generatePowerUsageData = () => {
    const dates = [];
    const power = [];
    const now = new Date();

    for (let i = 30; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      dates.push(date);

      // Generate random power usage between 1.5 and 4.5 MW with some spikes
      let baseValue = 2.5 + Math.random() * 0.5;
      if (Math.random() > 0.95) {
        baseValue += Math.random() * 1.5; // occasional spikes
      }
      power.push(baseValue);
    }

    return { dates, power };
  };

  // Generate dummy data for Jobs Completed vs Submitted (2 weeks)
  const generateJobsData = () => {
    const dates = [];
    const submitted = [];
    const completed = [];
    const now = new Date();

    for (let i = 14; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      dates.push(
        date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      );

      const baseSubmitted = 500 + Math.random() * 300;
      const baseCompleted = baseSubmitted - 50 + Math.random() * 100;

      submitted.push(Math.floor(baseSubmitted));
      completed.push(Math.floor(baseCompleted));
    }

    return { dates, submitted, completed };
  };

  // Generate dummy data for Backlog (2 weeks)
  const generateBacklogData = () => {
    const dates = [];
    const nodeHoursAdded = [];
    const backlogExecuted = [];
    const now = new Date();

    for (let i = 14; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      dates.push(
        date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      );

      nodeHoursAdded.push(Math.floor(800 + Math.random() * 200));
      backlogExecuted.push(Math.floor(400 + Math.random() * 200));
    }

    return { dates, nodeHoursAdded, backlogExecuted };
  };

  const powerData = generatePowerUsageData();
  const jobsData = generateJobsData();
  const backlogData = generateBacklogData();

  // Programs on NERSC donut chart data
  const programsData = {
    labels: ['HEP', 'ASCR', 'BER', 'BES', 'NP', 'Others'],
    values: [3500, 5000, 2300, 1000, 800, 500],
    colors: ['#1f4788', '#4472c4', '#5b9bd5', '#a5c8e4', '#8fce00', '#c0c0c0'],
  };

  return (
    <Container
      maxWidth="xl"
      sx={{
        marginBottom: 3,
        marginTop: 3,
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
          Center Performance
        </Typography>
        <Typography variant="body1" color="text.secondary">
          View current system load and review monthly performance trends
        </Typography>
      </Box>

      {/* Queue Wait Times Section */}
      <Box sx={{ mb: 6 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Box>
            <Typography
              variant="h5"
              sx={{ fontWeight: 600, color: '#1a2f5a', mb: 0.5 }}
            >
              Queue Wait Times
            </Typography>
            <Typography variant="body2" color="text.secondary">
              See how long jobs are waiting to start
            </Typography>
          </Box>
          <Link
            to="/user-job-performance"
            style={{
              fontSize: '0.875rem',
              textDecoration: 'none',
              color: '#1976d2',
            }}
          >
            View Metrics for your Jobs →
          </Link>
        </Box>

        {/* Queue Wait Times Heatmap */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 500 }}>
              Avg. Queue Wait Time by Node Count and Duration
            </Typography>
            <IconButton size="small">
              <FullscreenIcon />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select defaultValue="All" sx={{ bgcolor: 'white' }}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="Debug">Debug</MenuItem>
                <MenuItem value="Regular">Regular</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select defaultValue="All" sx={{ bgcolor: 'white' }}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="1-4">1-4 hours</MenuItem>
                <MenuItem value="4-8">4-8 hours</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select defaultValue="All" sx={{ bgcolor: 'white' }}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="Interactive">Interactive</MenuItem>
              </Select>
            </FormControl>
            <Button variant="outlined" size="small" sx={{ ml: 'auto' }}>
              Today
            </Button>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select defaultValue="Oct 9 - Oct 9" sx={{ bgcolor: 'white' }}>
                <MenuItem value="Oct 9 - Oct 9">Oct 9 - Oct 9</MenuItem>
                <MenuItem value="Last 7 days">Last 7 days</MenuItem>
                <MenuItem value="Last 30 days">Last 30 days</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Plot
            data={[
              {
                z: queueWaitHeatmapData.z,
                x: queueWaitHeatmapData.x,
                y: queueWaitHeatmapData.y,
                type: 'heatmap',
                colorscale: [
                  [0, '#ffffff'],
                  [0.2, '#c6e48b'],
                  [0.4, '#7bc96f'],
                  [0.6, '#239a3b'],
                  [0.8, '#ff9800'],
                  [1, '#d73027'],
                ],
                showscale: true,
                hovertemplate:
                  '<b>Queue Wait Time</b><br><br>' +
                  'Nodes Requested: <b>%{y}</b><br>' +
                  'Hours Requested: <b>%{x}</b><br>' +
                  'Avg Wait Time: <b>%{z} minutes</b><extra></extra>',
              },
            ]}
            layout={{
              autosize: true,
              height: 450,
              margin: { l: 100, r: 80, t: 20, b: 80 },
              xaxis: {
                title: 'Hours Requested',
                side: 'bottom',
              },
              yaxis: {
                title: 'Number of Nodes Requested',
                autorange: 'reversed',
              },
              plot_bgcolor: 'white',
              paper_bgcolor: 'white',
              // hovermode: 'closest',
            }}
            config={{
              responsive: true,
              displayModeBar: true,
              // modeBarButtonsToRemove: ['zoom2d', 'pan2d', 'select2d', 'lasso2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d'],
              displaylogo: false,
              staticPlot: false,
            }}
            style={{ width: '100%' }}
          />
        </Paper>

        {/* Queue Wait Times Table */}
        <Paper sx={{ p: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 500 }}>
              Avg. Queue Wait Time across different Queues
            </Typography>
            <IconButton
              size="small"
              onClick={() => setShowQueueWaitTable(!showQueueWaitTable)}
            >
              {showQueueWaitTable ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          {showQueueWaitTable && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  mb: 2,
                  justifyContent: 'flex-end',
                }}
              >
                <Button variant="outlined" size="small">
                  Today
                </Button>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <Select
                    defaultValue="Oct 9 - Oct 9"
                    sx={{ bgcolor: 'white' }}
                  >
                    <MenuItem value="Oct 9 - Oct 9">Oct 9 - Oct 9</MenuItem>
                    <MenuItem value="Last 7 days">Last 7 days</MenuItem>
                    <MenuItem value="Last 30 days">Last 30 days</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <TableContainer>
                <Table size="small" sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Nodes</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Debug</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        Interactive
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Jupyter</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Overrun</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Preempt</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Realtime</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Regular</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Shared</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Other</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>All</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Longest</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {queueWaitTableData.map((row, index) => (
                      <TableRow
                        key={index}
                        sx={{ '&:nth-of-type(odd)': { bgcolor: '#fafafa' } }}
                      >
                        <TableCell>{row.nodes}</TableCell>
                        <TableCell>{row.debug.toFixed(2)}</TableCell>
                        <TableCell>{row.interactive.toFixed(2)}</TableCell>
                        <TableCell>{row.jupyter.toFixed(2)}</TableCell>
                        <TableCell>{row.overrun.toFixed(2)}</TableCell>
                        <TableCell>{row.preempt.toFixed(2)}</TableCell>
                        <TableCell>{row.realtime.toFixed(2)}</TableCell>
                        <TableCell>{row.regular.toFixed(2)}</TableCell>
                        <TableCell>{row.shared.toFixed(2)}</TableCell>
                        <TableCell>{row.other.toFixed(2)}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          {row.all.toFixed(2)}
                        </TableCell>
                        <TableCell>{row.longest.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Paper>
      </Box>

      {/* Queued Jobs Section */}
      <Box sx={{ mb: 6 }}>
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="h5"
            sx={{ fontWeight: 600, color: '#1a2f5a', mb: 0.5 }}
          >
            Queued Jobs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            See how many jobs are waiting to start
          </Typography>
        </Box>

        {/* Queued Jobs Heatmap */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 500 }}>
              Jobs by Node Count and Duration
            </Typography>
            <IconButton size="small">
              <FullscreenIcon />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select defaultValue="All" sx={{ bgcolor: 'white' }}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="Debug">Debug</MenuItem>
                <MenuItem value="Regular">Regular</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select defaultValue="All" sx={{ bgcolor: 'white' }}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="1-4">1-4 hours</MenuItem>
                <MenuItem value="4-8">4-8 hours</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select defaultValue="All" sx={{ bgcolor: 'white' }}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="Interactive">Interactive</MenuItem>
              </Select>
            </FormControl>
            <Button variant="outlined" size="small" sx={{ ml: 'auto' }}>
              Today
            </Button>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select defaultValue="Oct 9 - Oct 9" sx={{ bgcolor: 'white' }}>
                <MenuItem value="Oct 9 - Oct 9">Oct 9 - Oct 9</MenuItem>
                <MenuItem value="Last 7 days">Last 7 days</MenuItem>
                <MenuItem value="Last 30 days">Last 30 days</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Plot
            data={[
              {
                z: queuedJobsHeatmapData.z,
                x: queuedJobsHeatmapData.x,
                y: queuedJobsHeatmapData.y,
                type: 'heatmap',
                colorscale: [
                  [0, '#ffffff'],
                  [0.2, '#c6e48b'],
                  [0.4, '#7bc96f'],
                  [0.6, '#239a3b'],
                  [0.8, '#ff9800'],
                  [1, '#d73027'],
                ],
                showscale: true,
                hovertemplate:
                  '<b>Queued Jobs</b><br><br>' +
                  'Nodes Requested: <b>%{y}</b><br>' +
                  'Hours Requested: <b>%{x}</b><br>' +
                  'Number of Jobs: <b>%{z}</b><extra></extra>',
              },
            ]}
            layout={{
              autosize: true,
              height: 450,
              margin: { l: 100, r: 80, t: 20, b: 80 },
              xaxis: {
                title: 'Hours Requested',
                side: 'bottom',
              },
              yaxis: {
                title: 'Number of Nodes Requested',
                autorange: 'reversed',
              },
              plot_bgcolor: 'white',
              paper_bgcolor: 'white',
              hovermode: 'closest',
            }}
            config={{
              responsive: true,
              displayModeBar: true,
              modeBarButtonsToRemove: [
                'zoom2d',
                'pan2d',
                'select2d',
                'lasso2d',
                'zoomIn2d',
                'zoomOut2d',
                'autoScale2d',
                'resetScale2d',
              ],
              displaylogo: false,
              staticPlot: false,
            }}
            style={{ width: '100%' }}
          />
        </Paper>

        {/* Queued Jobs Table */}
        <Paper sx={{ p: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 500 }}>
              Jobs across different Queues
            </Typography>
            <IconButton
              size="small"
              onClick={() => setShowQueuedJobsTable(!showQueuedJobsTable)}
            >
              {showQueuedJobsTable ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          {showQueuedJobsTable && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  mb: 2,
                  justifyContent: 'flex-end',
                }}
              >
                <Button variant="outlined" size="small">
                  Today
                </Button>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <Select
                    defaultValue="Oct 9 - Oct 9"
                    sx={{ bgcolor: 'white' }}
                  >
                    <MenuItem value="Oct 9 - Oct 9">Oct 9 - Oct 9</MenuItem>
                    <MenuItem value="Last 7 days">Last 7 days</MenuItem>
                    <MenuItem value="Last 30 days">Last 30 days</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <TableContainer>
                <Table size="small" sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Nodes</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Debug</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        Interactive
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Jupyter</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Overrun</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Preempt</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Realtime</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Regular</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Shared</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Other</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>All</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Percent</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {queuedJobsTableData.map((row, index) => (
                      <TableRow
                        key={index}
                        sx={{ '&:nth-of-type(odd)': { bgcolor: '#fafafa' } }}
                      >
                        <TableCell>{row.nodes}</TableCell>
                        <TableCell>{row.debug.toLocaleString()}</TableCell>
                        <TableCell>
                          {row.interactive.toLocaleString()}
                        </TableCell>
                        <TableCell>{row.jupyter.toLocaleString()}</TableCell>
                        <TableCell>{row.overrun.toLocaleString()}</TableCell>
                        <TableCell>{row.preempt.toLocaleString()}</TableCell>
                        <TableCell>{row.realtime.toLocaleString()}</TableCell>
                        <TableCell>{row.regular.toLocaleString()}</TableCell>
                        <TableCell>{row.shared.toLocaleString()}</TableCell>
                        <TableCell>{row.other.toLocaleString()}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          {row.all.toLocaleString()}
                        </TableCell>
                        <TableCell>{row.percent.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Paper>
      </Box>

      {/* Existing NERSC Power Usage Section */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 600, color: '#1a1a1a' }}>
          NERSC Power Usage
        </Typography>
        <Link to="/user-job-performance" style={{ textDecoration: 'none' }}>
          <Button
            variant="contained"
            sx={{
              textTransform: 'none',
              bgcolor: '#3f51b5',
              '&:hover': {
                bgcolor: '#303f9f',
              },
            }}
          >
            View Performance for Your Jobs →
          </Button>
        </Link>
      </Box>

      {/* Full System Power Usage */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Typography variant="h6" sx={{ color: '#555', fontWeight: 500 }}>
            Full System Power Usage (Last 30 days)
          </Typography>
          <Typography variant="caption" sx={{ color: '#888' }}>
            Updated 2min ago
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              sx={{ bgcolor: 'white' }}
            >
              <MenuItem value="This week">This week</MenuItem>
              <MenuItem value="Last week">Last week</MenuItem>
              <MenuItem value="Last month">Last month</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              sx={{ bgcolor: 'white' }}
            >
              <MenuItem value="Perlmutter">Perlmutter</MenuItem>
              <MenuItem value="Cori">Cori</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ textAlign: 'right', mb: 1 }}>
          <Typography
            variant="caption"
            sx={{ color: '#888', fontStyle: 'italic' }}
          >
            Click and drag in plot area to zoom in
          </Typography>
        </Box>

        <Plot
          data={[
            {
              x: powerData.dates,
              y: powerData.power,
              type: 'scatter',
              mode: 'lines',
              line: { color: '#2196f3', width: 2 },
              fill: 'tozeroy',
              fillcolor: 'rgba(33, 150, 243, 0.1)',
            },
          ]}
          layout={{
            autosize: true,
            height: 300,
            margin: { l: 50, r: 20, t: 20, b: 50 },
            xaxis: {
              title: 'Time',
              gridcolor: '#f0f0f0',
              showgrid: true,
            },
            yaxis: {
              title: 'Power (MW)',
              gridcolor: '#f0f0f0',
              showgrid: true,
              range: [0, 8],
            },
            plot_bgcolor: 'white',
            paper_bgcolor: 'white',
            dragmode: 'zoom',
          }}
          config={{
            responsive: true,
            displayModeBar: false,
          }}
          style={{ width: '100%' }}
        />

        <Typography
          variant="caption"
          sx={{ color: '#666', mt: 2, display: 'block' }}
        >
          <strong>Note:</strong> Full system power usage is calculated from the
          substation power. Sections without measured data are empty in chart.{' '}
          <a href="#" style={{ color: '#2196f3' }}>
            Learn more.
          </a>
        </Typography>

        <Box sx={{ textAlign: 'right', mt: 1 }}>
          <Typography variant="caption" sx={{ color: '#888' }}>
            Updated 11/12/2025
          </Typography>
        </Box>
      </Paper>

      {/* Daily Jobs Completed and Programs on NERSC */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Typography
            variant="h5"
            sx={{ fontWeight: 600, color: '#1a1a1a', mb: 2 }}
          >
            Daily Jobs Completed
          </Typography>

          <Paper sx={{ p: 3 }}>
            <Typography
              variant="h6"
              sx={{ color: '#555', fontWeight: 500, mb: 2 }}
            >
              Daily Jobs Completes vs Submitted (Last 2 weeks)
            </Typography>

            <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: '#ff9800',
                    border: '2px solid #ff9800',
                  }}
                />
                <Typography variant="body2">
                  Jobs Submitted <strong>12,123</strong>
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: '#4caf50',
                    border: '2px solid #4caf50',
                  }}
                />
                <Typography variant="body2">
                  Jobs Completed <strong>12,002</strong>
                </Typography>
              </Box>
            </Box>

            <Plot
              data={[
                {
                  x: jobsData.dates,
                  y: jobsData.submitted,
                  type: 'scatter',
                  mode: 'lines',
                  name: 'Jobs Submitted',
                  line: { color: '#ff9800', width: 2 },
                },
                {
                  x: jobsData.dates,
                  y: jobsData.completed,
                  type: 'scatter',
                  mode: 'lines',
                  name: 'Jobs Completed',
                  line: { color: '#4caf50', width: 2 },
                },
              ]}
              layout={{
                autosize: true,
                height: 300,
                margin: { l: 50, r: 20, t: 20, b: 50 },
                xaxis: {
                  gridcolor: '#f0f0f0',
                  showgrid: true,
                },
                yaxis: {
                  gridcolor: '#f0f0f0',
                  showgrid: true,
                  range: [0, 1200],
                },
                plot_bgcolor: 'white',
                paper_bgcolor: 'white',
                showlegend: false,
              }}
              config={{
                responsive: true,
                displayModeBar: false,
              }}
              style={{ width: '100%' }}
            />

            <Box sx={{ textAlign: 'right', mt: 1 }}>
              <Typography variant="caption" sx={{ color: '#888' }}>
                Updated 11/12/2025
              </Typography>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography
            variant="h5"
            sx={{ fontWeight: 600, color: '#1a1a1a', mb: 2 }}
          >
            Programs on NERSC
          </Typography>

          <Paper sx={{ p: 3 }}>
            <Typography
              variant="h6"
              sx={{ color: '#555', fontWeight: 500, mb: 2 }}
            >
              Hours on NERSC (Last 2 weeks)
            </Typography>

            <Plot
              data={[
                {
                  values: programsData.values,
                  labels: programsData.labels,
                  type: 'pie',
                  hole: 0.5,
                  marker: {
                    colors: programsData.colors,
                  },
                  textinfo: 'label+value',
                  textposition: 'outside',
                  automargin: true,
                },
              ]}
              layout={{
                autosize: true,
                height: 350,
                margin: { l: 20, r: 20, t: 20, b: 20 },
                showlegend: false,
                plot_bgcolor: 'white',
                paper_bgcolor: 'white',
                annotations: [
                  {
                    text: '',
                    showarrow: false,
                    font: { size: 20 },
                  },
                ],
              }}
              config={{
                responsive: true,
                displayModeBar: false,
              }}
              style={{ width: '100%' }}
            />

            <Typography
              variant="caption"
              sx={{ color: '#666', display: 'block', mt: 1 }}
            >
              <strong>Note:</strong> Contact your allocation manager for
              questions about your DOE Mission Science Allocation at NERSC.
              <a href="#" style={{ color: '#2196f3' }}>
                Learn more.
              </a>
            </Typography>

            <Box sx={{ textAlign: 'right', mt: 1 }}>
              <Typography variant="caption" sx={{ color: '#888' }}>
                Updated 11/12/2025
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Backlog Chart */}
      <Typography
        variant="h5"
        sx={{ fontWeight: 600, color: '#1a1a1a', mb: 2 }}
      >
        Daily Jobs Completed
      </Typography>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ color: '#555', fontWeight: 500, mb: 2 }}>
          Backlog in terms of Node Hours (Last 2 weeks)
        </Typography>

        <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                bgcolor: '#5b9bd5',
              }}
            />
            <Typography variant="body2">
              Total Node Hours added by new Jobs <strong>25,1233</strong>
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                bgcolor: '#ff9800',
              }}
            />
            <Typography variant="body2">
              Total Backlog Executed <strong>42,1202</strong>
            </Typography>
          </Box>
        </Box>

        <Plot
          data={[
            {
              x: backlogData.dates,
              y: backlogData.nodeHoursAdded,
              type: 'scatter',
              mode: 'lines',
              name: 'Total Node Hours',
              fill: 'tonexty',
              fillcolor: 'rgba(91, 155, 213, 0.3)',
              line: { color: '#5b9bd5', width: 2 },
            },
            {
              x: backlogData.dates,
              y: backlogData.backlogExecuted,
              type: 'scatter',
              mode: 'lines',
              name: 'Total Backlog Executed',
              fill: 'tozeroy',
              fillcolor: 'rgba(255, 152, 0, 0.3)',
              line: { color: '#ff9800', width: 2 },
            },
          ]}
          layout={{
            autosize: true,
            height: 300,
            margin: { l: 50, r: 20, t: 20, b: 50 },
            xaxis: {
              gridcolor: '#f0f0f0',
              showgrid: true,
            },
            yaxis: {
              gridcolor: '#f0f0f0',
              showgrid: true,
              range: [0, 1200],
            },
            plot_bgcolor: 'white',
            paper_bgcolor: 'white',
            showlegend: false,
          }}
          config={{
            responsive: true,
            displayModeBar: false,
          }}
          style={{ width: '100%' }}
        />

        <Box sx={{ textAlign: 'right', mt: 1 }}>
          <Typography variant="caption" sx={{ color: '#888' }}>
            Updated 11/12/2025
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}

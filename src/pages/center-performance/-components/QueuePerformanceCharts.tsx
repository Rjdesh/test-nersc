import {
  Box,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  CircularProgress,
  Alert,
  AlertTitle,
  InputLabel,
} from '@mui/material';
import Plot from 'react-plotly.js';
import { useState, useMemo } from 'react';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import {
  useCenterPerformanceData,
  transformToHeatmapData,
  formatTableData,
} from '../../../hooks/useCenterPerformanceData';

/**
 * Component that displays Queue Wait Times and Queued Jobs heatmaps and tables
 * using real data from the NERSC REST API
 */
export function QueuePerformanceCharts() {
  // State for filter controls
  const [machine, setMachine] = useState('perlmutter');
  const [arch, setArch] = useState('gpu');
  const [qos, setQos] = useState('regular');
  const [startDate, setStartDate] = useState<Date>(
    new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // 14 days ago
  );
  const [endDate, setEndDate] = useState<Date>(new Date());

  // State for collapsible tables
  const [showQueueWaitTable, setShowQueueWaitTable] = useState(true);
  const [showQueuedJobsTable, setShowQueuedJobsTable] = useState(true);

  // Convert dates to Unix timestamps
  const params = useMemo(
    () => ({
      machine,
      arch,
      start: Math.floor(startDate.getTime() / 1000),
      end: Math.floor(endDate.getTime() / 1000),
      qos,
    }),
    [machine, arch, startDate, endDate, qos]
  );

  // Fetch data from API
  const { data, isLoading, isError, error, refetch } =
    useCenterPerformanceData(params);

  // Transform data for heatmaps
  const queueWaitHeatmapData = useMemo(() => {
    if (!data?.wait) return null;
    return transformToHeatmapData(data.wait);
  }, [data?.wait]);

  const queuedJobsHeatmapData = useMemo(() => {
    if (!data?.jobs) return null;
    return transformToHeatmapData(data.jobs);
  }, [data?.jobs]);

  // Format table data
  const queueWaitTableData = useMemo(() => {
    if (!data?.wait_table) return null;
    return formatTableData(data.wait_table);
  }, [data?.wait_table]);

  const queuedJobsTableData = useMemo(() => {
    if (!data?.jobs_table) return null;
    return formatTableData(data.jobs_table);
  }, [data?.jobs_table]);

  // Format date for display
  const formatDateRange = () => {
    const start = startDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const end = endDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    return `${start} - ${end}`;
  };

  // Loading State
  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading performance data...</Typography>
      </Box>
    );
  }

  // Error State
  if (isError) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        <AlertTitle>Error Loading Data</AlertTitle>
        {error instanceof Error
          ? error.message
          : 'An unexpected error occurred'}
        <Button onClick={() => refetch()} sx={{ mt: 1 }}>
          Try Again
        </Button>
      </Alert>
    );
  }

  return (
    <>
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

          {/* Filter Controls */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="select-label-machine">Machine</InputLabel>
              <Select
                value={`${machine}-${arch}`}
                labelId="select-label-machine"
                id="select-machine"
                label="Machine"
                onChange={(e) => {
                  const [newMachine, newArch] = e.target.value.split('-');
                  setMachine(newMachine);
                  setArch(newArch);
                }}
                sx={{ bgcolor: 'white' }}
              >
                <MenuItem value="perlmutter-all">Perlmutter (All)</MenuItem>
                <MenuItem value="perlmutter-gpu">Perlmutter (GPU)</MenuItem>
                <MenuItem value="perlmutter-cpu">Perlmutter (CPU)</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="select-label-qos">QOS</InputLabel>
              <Select
                value={qos}
                labelId="select-label-qos"
                id="select-qos"
                label="QOS"
                onChange={(e) => setQos(e.target.value)}
                sx={{ bgcolor: 'white' }}
              >
                <MenuItem value="regular">Regular</MenuItem>
                <MenuItem value="debug">Debug</MenuItem>
                <MenuItem value="interactive">Interactive</MenuItem>
                <MenuItem value="jupyter">Jupyter</MenuItem>
                <MenuItem value="preempt">Preempt</MenuItem>
                <MenuItem value="shared">Shared</MenuItem>
              </Select>
            </FormControl>

            <Button variant="outlined" size="small" sx={{ ml: 'auto' }}>
              Today
            </Button>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select value={formatDateRange()} sx={{ bgcolor: 'white' }}>
                <MenuItem value={formatDateRange()}>
                  {formatDateRange()}
                </MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Wait Time Heatmap */}
          {queueWaitHeatmapData && (
            <Plot
              data={[
                {
                  z: queueWaitHeatmapData.z,
                  x: queueWaitHeatmapData.x,
                  y: queueWaitHeatmapData.y,
                  type: 'heatmap',
                  colorscale: [
                    [0, '#73D216'],
                    [0.25, '#EDD400'],
                    [0.5, '#F57900'],
                    [1, '#EF2929'],
                  ],
                  showscale: true,
                  zmin: 0,
                  zmax: 96, 
                  zauto: false,
                  connectgaps: false,
                  hoverongaps: false,
                  xgap: 1,  // Gap between cells horizontally
                  ygap: 1,  // Gap between cells vertically 
                  hovertemplate:
                    '<b>Queue Wait Time</b><br><br>' +
                    'Nodes Requested: <b>%{y}</b><br>' +
                    'Hours Requested: <b>%{x}</b><br>' +
                    'Avg Wait Time: <b>%{z} hours</b><extra></extra>',
                },
              ]}
              layout={{
                autosize: true,
                height: 450,
                margin: { l: 100, r: 80, t: 20, b: 80 },
                xaxis: {
                  title: 'Hours Requested',
                  side: 'bottom',
                  showgrid: true,
                  gridcolor: '#f0f0f0',
                  gridwidth: 1,
                  zeroline: false,
                  type: 'category',
                  // Force tick values to match your data
                  tickmode: 'array',
                  tickvals: queueWaitHeatmapData.x,  // Use your actual x values
                  ticktext: queueWaitHeatmapData.x.map(String),  // Convert to strings
                },
                yaxis: {
                  title: 'Number of Nodes Requested',
                  showgrid: true,
                  gridcolor: '#f0f0f0',
                  gridwidth: 1,
                  zeroline: false,
                  // autorange: 'reversed',
                },
                plot_bgcolor: 'white',
                paper_bgcolor: 'white',
              }}
              config={{
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                staticPlot: false,
              }}
              style={{ width: '100%' }}
            />
          )}
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

          {showQueueWaitTable && queueWaitTableData && (
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
                  <Select value={formatDateRange()} sx={{ bgcolor: 'white' }}>
                    <MenuItem value={formatDateRange()}>
                      {formatDateRange()}
                    </MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <TableContainer>
                <Table size="small" sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      {queueWaitTableData.categories.map((category, index) => (
                        <TableCell key={index} sx={{ fontWeight: 600 }}>
                          {category}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {queueWaitTableData.values.map((row, rowIndex) => (
                      <TableRow
                        key={rowIndex}
                        sx={{ '&:nth-of-type(odd)': { bgcolor: '#fafafa' } }}
                      >
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex}>
                            {typeof cell === 'number' && cellIndex > 0
                              ? cell.toFixed(2)
                              : cell}
                          </TableCell>
                        ))}
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

          {/* Filter Controls */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="select-label-machine">Machine</InputLabel>
              <Select
                value={`${machine}-${arch}`}
                labelId="select-label-machine"
                id="select-machine"
                label="Machine"
                onChange={(e) => {
                  const [newMachine, newArch] = e.target.value.split('-');
                  setMachine(newMachine);
                  setArch(newArch);
                }}
                sx={{ bgcolor: 'white' }}
              >
                <MenuItem value="perlmutter-all">Perlmutter (All)</MenuItem>
                <MenuItem value="perlmutter-gpu">Perlmutter (GPU)</MenuItem>
                <MenuItem value="perlmutter-cpu">Perlmutter (CPU)</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="select-label-qos">QOS</InputLabel>
              <Select
                value={qos}
                labelId="select-label-qos"
                id="select-qos"
                label="QOS"
                onChange={(e) => setQos(e.target.value)}
                sx={{ bgcolor: 'white' }}
              >
                <MenuItem value="regular">Regular</MenuItem>
                <MenuItem value="debug">Debug</MenuItem>
                <MenuItem value="interactive">Interactive</MenuItem>
                <MenuItem value="jupyter">Jupyter</MenuItem>
                <MenuItem value="preempt">Preempt</MenuItem>
                <MenuItem value="shared">Shared</MenuItem>
              </Select>
            </FormControl>

            <Button variant="outlined" size="small" sx={{ ml: 'auto' }}>
              Today
            </Button>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select value={formatDateRange()} sx={{ bgcolor: 'white' }}>
                <MenuItem value={formatDateRange()}>
                  {formatDateRange()}
                </MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Queued Jobs Heatmap */}
          {queuedJobsHeatmapData && (
            <Plot
              data={[
                {
                  z: queuedJobsHeatmapData.z,
                  x: queuedJobsHeatmapData.x,
                  y: queuedJobsHeatmapData.y,
                  type: 'heatmap',
                  colorscale: [
                    [0, '#73D216'],
                    [0.05, '#EDD400'],
                    [0.25, '#F57900'],
                    [1, '#EF2929'],
                  ],
                  showscale: true,
                  zmin: 0,
                  zmax: 4000, 
                  zauto: false,
                  connectgaps: false,
                  hoverongaps: false,
                  xgap: 1,  // Gap between cells horizontally
                  ygap: 1,  // Gap between cells vertically  
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
                  showgrid: true,
                  gridcolor: '#f0f0f0',
                  gridwidth: 1,
                  zeroline: false,
                  type: 'category',
                  // Force tick values to match your data
                  tickmode: 'array',
                  tickvals: queueWaitHeatmapData.x,  // Use your actual x values
                  ticktext: queueWaitHeatmapData.x.map(String),  // Convert to strings
                },
                yaxis: {
                  title: 'Number of Nodes Requested',
                  showgrid: true,
                  gridcolor: '#f0f0f0',
                  gridwidth: 1,
                  zeroline: false,
                  // autorange: 'reversed',
                },
                plot_bgcolor: 'white',
                paper_bgcolor: 'white',
                hovermode: 'closest',
              }}
              config={{
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                staticPlot: false,
              }}
              style={{ width: '100%' }}
            />
          )}
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

          {showQueuedJobsTable && queuedJobsTableData && (
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
                  <Select value={formatDateRange()} sx={{ bgcolor: 'white' }}>
                    <MenuItem value={formatDateRange()}>
                      {formatDateRange()}
                    </MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <TableContainer>
                <Table size="small" sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      {queuedJobsTableData.categories.map((category, index) => (
                        <TableCell key={index} sx={{ fontWeight: 600 }}>
                          {category}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {queuedJobsTableData.values.map((row, rowIndex) => (
                      <TableRow
                        key={rowIndex}
                        sx={{ '&:nth-of-type(odd)': { bgcolor: '#fafafa' } }}
                      >
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex}>
                            {typeof cell === 'number' && cellIndex > 0
                              ? cellIndex ===
                                queuedJobsTableData.categories.length - 1
                                ? `${cell.toFixed(2)}%` // Format percent column
                                : cell.toLocaleString() // Format job counts with commas
                              : cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Paper>
      </Box>
    </>
  );
}
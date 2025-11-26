import { createFileRoute, Link as RouterLink } from '@tanstack/react-router';
import {
  Box,
  Container,
  Paper,
  Typography,
  Grid,
  Tabs,
  Tab,
  Button,
  Alert,
  AlertTitle,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  FormControl,
  Breadcrumbs,
  Collapse,
  IconButton,
  Divider,
  Stack,
} from '@mui/material';
import { useState, useEffect } from 'react';
import { useDetailQuery } from '../../hooks/useDetailQuery';
import Plot from 'react-plotly.js';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

export const Route = createFileRoute('/user-job-performance/$id')({
  component: JobPerformanceDetailPage,
});

/**
 * Detail view for a selected job from the User Job Performance page.
 */
function JobPerformanceDetailPage() {
  const { id } = Route.useParams();
  const [activeTab, setActiveTab] = useState(0);
  const [expandUtilization, setExpandUtilization] = useState(false);
  const [expandPowerNodes, setExpandPowerNodes] = useState(true);
  const [aggregation, setAggregation] = useState('Mean');
  const [activeSection, setActiveSection] = useState('job-details');

  // Define query for this page and fetch data item
  const { data } = useDetailQuery({
    dataSource: 'dummy-data/user_job_performance.json',
    dataIdField: 'id',
    paramId: id,
    queryMode: 'client',
    staticParams: null,
  });

  // Track active section for navigation highlighting
  useEffect(() => {
    const handleScroll = () => {
      const sections = [
        'job-details',
        'insights',
        'resource-util',
        'util-nodes',
        'power',
        'power-nodes',
        'roofline',
      ];

      const scrollPosition = window.scrollY + 100;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i]);
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(sections[i]);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    if (section) {
      const offset = 80; // Account for any fixed headers
      const elementPosition = section.offsetTop;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  // Generate dummy data for charts
  const resourceUtilizationData = generateResourceUtilizationData();
  const powerData = generatePowerData();
  const rooflineData = generateRooflineData();

  if (!data) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: '#f5f5f5', minHeight: '100vh', pb: 4 }}>
      {/* Breadcrumbs */}
      <Box
        sx={{
          bgcolor: 'white',
          borderBottom: '1px solid #e0e0e0',
          px: 3,
          py: 1.5,
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
          <Link
            component={RouterLink}
            to="/user-job-performance"
            underline="hover"
            color="primary"
          >
            For Users
          </Link>
          <Link
            component={RouterLink}
            to="/user-job-performance"
            underline="hover"
            color="primary"
          >
            Performance Overview
          </Link>
          <Typography color="text.primary">
            Details for Job {data.jobId}
          </Typography>
        </Breadcrumbs>
      </Box>

      <Container maxWidth="xl" sx={{ mt: 3 }}>
        {/* Page Header */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={9}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
                Performance for Job : {data.jobId} ({data.projectId})
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                  <Tab label="Performance Overview" />
                  <Tab label="Advanced Details" />
                </Tabs>
                <Box sx={{ flex: 1 }} />
                <Button
                  variant="outlined"
                  endIcon={<ArrowForwardIcon />}
                  size="small"
                >
                  Compare with other Jobs
                </Button>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12} md={3}>
            {/*intentional blank*/}
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          {/* Main Content */}
          <Grid item xs={12} md={9}>
            {/* Job Details Table */}
            <Paper
              id="job-details"
              sx={{ p: 2, mb: 3, scrollMarginTop: '80px' }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Job Details
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Start time
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Fri Jul 7, 2025 18:32 PT
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    End time
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Fri Jul 7, 2025 21:12 PT
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Duration
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    2 hrs 40 min
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Queue
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {data.qos}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    No. of Nodes
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    233
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Node Hours Charged
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    24.36
                  </Typography>
                </Grid>
              </Grid>
            </Paper>

            {/* Insights & Hints */}
            <Paper id="insights" sx={{ p: 2, mb: 3, scrollMarginTop: '80px' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Insights & Hints
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Alert
                    severity="warning"
                    variant="outlined"
                    icon={<WarningIcon />}
                    sx={{ height: '100%' }}
                  >
                    <AlertTitle sx={{ fontWeight: 600 }}>
                      Compute bound performance
                    </AlertTitle>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      Consider improving vectorization or use multi-threading.
                      Review roofline analysis chart in the performance summary
                      for more details.
                    </Typography>
                    <Link
                      href="#"
                      variant="body2"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      Learn about Roofline Analysis{' '}
                      <ArrowForwardIcon fontSize="small" />
                    </Link>
                  </Alert>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Alert
                    severity="warning"
                    variant="outlined"
                    icon={<WarningIcon />}
                    sx={{ height: '100%' }}
                  >
                    <AlertTitle sx={{ fontWeight: 600 }}>
                      Network imbalance detected
                    </AlertTitle>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      High I/O or CPU utilization imbalance across ~20% of
                      nodes. Distribute network traffic evenly across available
                      nodes to improve potential performance.
                    </Typography>
                    <Link
                      href="#"
                      variant="body2"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      Learn about Network Performance{' '}
                      <ArrowForwardIcon fontSize="small" />
                    </Link>
                  </Alert>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Alert
                    severity="info"
                    variant="outlined"
                    icon={<InfoIcon />}
                    sx={{ height: '100%' }}
                  >
                    <AlertTitle sx={{ fontWeight: 600 }}>
                      Explore power capping
                    </AlertTitle>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      Prepare for power-limited compute landscape. Power capping
                      can offer incentives of node hour discounts, priority
                      boosts, or access to free queues.
                    </Typography>
                    <Link
                      href="#"
                      variant="body2"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      Learn about Power Capping{' '}
                      <ArrowForwardIcon fontSize="small" />
                    </Link>
                  </Alert>
                </Grid>
              </Grid>
            </Paper>

            {/* Resource Utilization */}
            <Paper
              id="resource-util"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Resource Utilization
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  (PMT)
                </Typography>
              </Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#1976d2',
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      CPU
                    </Typography>
                    <Typography variant="body2">52.3%</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#4caf50',
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      GPU
                    </Typography>
                    <Typography variant="body2">62.4%</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#ff9800',
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      I/O
                    </Typography>
                    <Typography variant="body2">75.3%</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#9c27b0',
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Network
                    </Typography>
                    <Typography variant="body2">52.1%</Typography>
                  </Box>
                </Grid>
              </Grid>
              <Plot
                data={resourceUtilizationData}
                layout={{
                  autosize: true,
                  height: 300,
                  margin: { l: 50, r: 20, t: 20, b: 50 },
                  xaxis: {
                    title: 'Relative Time',
                    tickvals: [0, 12.5, 25, 37, 47, 58, 68, 78, 88, 100],
                    ticktext: [
                      '0%',
                      '12%',
                      '25%',
                      '37%',
                      '47%',
                      '58%',
                      '68%',
                      '78%',
                      '88%',
                      '100%',
                    ],
                  },
                  yaxis: {
                    title: '% Consumed',
                    range: [0, 100],
                  },
                  showlegend: false,
                  hovermode: 'x unified',
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </Paper>

            {/* Utilization across Nodes */}
            <Paper
              id="util-nodes"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 2,
                }}
              >
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Resource Utilization across Nodes
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    See detailed charts in 'Advanced Metrics' tab
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => setExpandUtilization(!expandUtilization)}
                >
                  {expandUtilization ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>

              <Collapse in={expandUtilization}>
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 0.5, display: 'block' }}
                  >
                    Aggregation
                  </Typography>
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <Select
                      value={aggregation}
                      onChange={(e) => setAggregation(e.target.value)}
                    >
                      <MenuItem value="Mean">Mean</MenuItem>
                      <MenuItem value="Median">Median</MenuItem>
                      <MenuItem value="Max">Max</MenuItem>
                      <MenuItem value="Min">Min</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Nodes</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          CPU Utilization
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          GPU Utilization
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          Memory Utilization
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          Network Bandwidth %
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {generateUtilizationNodesData().map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{row.node}</TableCell>
                          <TableCell>{row.cpu}</TableCell>
                          <TableCell>{row.gpu}</TableCell>
                          <TableCell>{row.memory}</TableCell>
                          <TableCell>{row.network}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Paper>

            {/* Power */}
            <Paper id="power" sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Power
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  (PM1/NRAT)
                </Typography>
              </Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#1976d2',
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      CPU
                    </Typography>
                    <Typography variant="body2">40.3 W</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#4caf50',
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      GPU
                    </Typography>
                    <Typography variant="body2">170.5 W</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#ff9800',
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Memory
                    </Typography>
                    <Typography variant="body2">351 W</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: '#9c27b0',
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Node
                    </Typography>
                    <Typography variant="body2">245.9 W</Typography>
                  </Box>
                </Grid>
              </Grid>
              <Plot
                data={powerData}
                layout={{
                  autosize: true,
                  height: 300,
                  margin: { l: 50, r: 20, t: 20, b: 50 },
                  xaxis: {
                    title: 'Relative Time',
                  },
                  yaxis: {
                    title: 'Power (W)',
                  },
                  showlegend: false,
                  hovermode: 'x unified',
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </Paper>

            {/* Power across Nodes */}
            <Paper
              id="power-nodes"
              sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 2,
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Power across Nodes
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setExpandPowerNodes(!expandPowerNodes)}
                >
                  {expandPowerNodes ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>
              <Collapse in={expandPowerNodes}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Expand to see the chart for metrics across individual nodes
                  involved.
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <Select
                      value={aggregation}
                      onChange={(e) => setAggregation(e.target.value)}
                    >
                      <MenuItem value="Mean">Mean</MenuItem>
                      <MenuItem value="Median">Median</MenuItem>
                      <MenuItem value="Max">Max</MenuItem>
                      <MenuItem value="Min">Min</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Nodes</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          CPU Power
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          GPU Power
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          Memory Power
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          Node Power
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[
                        {
                          node: 'nid00876',
                          cpu: 12.321,
                          gpu: 14.591,
                          mem: 11.312,
                          nodePower: 35.412,
                        },
                        {
                          node: 'nid00876',
                          cpu: 11.312,
                          gpu: 20.731,
                          mem: 11.312,
                          nodePower: 35.213,
                        },
                        {
                          node: 'nid00876',
                          cpu: 19.211,
                          gpu: 21.329,
                          mem: 10.123,
                          nodePower: 31.245,
                        },
                        {
                          node: 'nid00876',
                          cpu: 12.522,
                          gpu: 23.425,
                          mem: 11.212,
                          nodePower: 33.411,
                        },
                        {
                          node: 'nid00876',
                          cpu: 11.22,
                          gpu: 21.325,
                          mem: 7.112,
                          nodePower: 32.512,
                        },
                      ].map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{row.node}</TableCell>
                          <TableCell>{row.cpu}</TableCell>
                          <TableCell>{row.gpu}</TableCell>
                          <TableCell>{row.mem}</TableCell>
                          <TableCell>{row.nodePower}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Paper>

            {/* Roofline Analysis */}
            <Paper id="roofline" sx={{ p: 3, mb: 3, scrollMarginTop: '80px' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Roofline Analysis
              </Typography>
              <Plot
                data={rooflineData}
                layout={{
                  autosize: true,
                  height: 400,
                  margin: { l: 60, r: 100, t: 20, b: 60 },
                  xaxis: {
                    title: 'Operational Intensity (FLOPs/Byte)',
                    type: 'log',
                    range: [-1, 2],
                  },
                  yaxis: {
                    title: 'Performance (TFLOPs)',
                    type: 'log',
                    range: [-1, 2],
                  },
                  showlegend: true,
                  legend: {
                    x: 1.05,
                    y: 1,
                    xanchor: 'left',
                  },
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                  Summary & Insights:
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Kernels analyzed
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      5233
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Memory bound kernels
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      93 (40%)
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Compute bound kernels
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      139 (60%)
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Avg. Operational Intensity
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      2.11710 FLOPs/Byte
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Avg. Performance
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      5.50 TFlops
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
              <Divider sx={{ my: 3 }} />
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600, mb: 1 }}
                  >
                    Optimization Recommendations
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Most kernels are compute-bound. To improve performance:
                  </Typography>
                  <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                    <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                      Maximize vectorization and thread/block occupancy.
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                      Use optimized math libraries for critical operations.
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                      Break dependency chains and unroll loops where beneficial.
                    </Typography>
                    <Typography component="li" variant="body2">
                      Profile top runtime kernels and target them with
                      micro-optimizations.
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600, mb: 1 }}
                  >
                    General Recommendations
                  </Typography>
                  <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                    <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                      Profile outliers: Focus optimization efforts on kernels
                      with highest TFLOPs, or those farthest from the roofline.
                    </Typography>
                    <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
                      Balance workloads: For memory-bound kernels near the knee,
                      data access improvements may provide better ROI than
                      compute optimizations.
                    </Typography>
                    <Typography component="li" variant="body2">
                      Re-run the job after optimizations and compare metrics
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <Link
                  href="#"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  Learn how to improve performance{' '}
                  <ArrowForwardIcon fontSize="small" />
                </Link>
              </Box>
            </Paper>
          </Grid>

          {/* Right Sidebar - On This Page */}
          <Grid item xs={12} md={3}>
            <Box sx={{ p: 2, position: 'sticky', top: 40 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                On This Page
              </Typography>
              <Stack spacing={1}>
                <Link
                  component="button"
                  onClick={() => handleNavClick('job-details')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'job-details'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'job-details' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Job Details
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('insights')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'insights'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'insights' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Insights and Hints
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('resource-util')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'resource-util'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'resource-util' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Resource Utilization
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('util-nodes')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'util-nodes'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'util-nodes' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Utilization across Nodes
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('power')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'power'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'power' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Power
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('power-nodes')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'power-nodes'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'power-nodes' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Power across Nodes
                </Link>
                <Link
                  component="button"
                  onClick={() => handleNavClick('roofline')}
                  underline="hover"
                  variant="body2"
                  sx={{
                    textAlign: 'left',
                    color:
                      activeSection === 'roofline'
                        ? 'primary.main'
                        : 'text.primary',
                    fontWeight: activeSection === 'roofline' ? 600 : 400,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                  }}
                >
                  Roofline Analysis
                </Link>
              </Stack>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

// Helper function to generate resource utilization chart data
function generateResourceUtilizationData() {
  const timePoints = Array.from({ length: 50 }, (_, i) => i * 2);

  return [
    {
      x: timePoints,
      y: timePoints.map(() => 45 + Math.random() * 20),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'CPU',
      line: { color: '#1976d2', width: 2 },
    },
    {
      x: timePoints,
      y: timePoints.map(() => 55 + Math.random() * 20),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'GPU',
      line: { color: '#4caf50', width: 2 },
    },
    {
      x: timePoints,
      y: timePoints.map(() => 70 + Math.random() * 15),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'I/O',
      line: { color: '#ff9800', width: 2 },
    },
    {
      x: timePoints,
      y: timePoints.map(() => 45 + Math.random() * 25),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Network',
      line: { color: '#9c27b0', width: 2 },
    },
  ];
}

// Helper function to generate power chart data
function generatePowerData() {
  const timePoints = Array.from({ length: 50 }, (_, i) => i * 2);

  return [
    {
      x: timePoints,
      y: timePoints.map(() => 35 + Math.random() * 10),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'CPU',
      line: { color: '#1976d2', width: 2 },
    },
    {
      x: timePoints,
      y: timePoints.map(() => 165 + Math.random() * 10),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'GPU',
      line: { color: '#4caf50', width: 2 },
    },
    {
      x: timePoints,
      y: timePoints.map(() => 345 + Math.random() * 15),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Memory',
      line: { color: '#ff9800', width: 2 },
    },
    {
      x: timePoints,
      y: timePoints.map(() => 240 + Math.random() * 15),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Node',
      line: { color: '#9c27b0', width: 2 },
    },
  ];
}

// Helper function to generate roofline analysis data
function generateRooflineData() {
  // Roofline boundary
  const rooflineX = [0.1, 1, 10, 100];
  const rooflineY = rooflineX.map((x) => Math.min(x * 10, 50));

  // Ridge point
  const ridgeX = [5];
  const ridgeY = [50];

  // Actual performance points (kernels)
  const numKernels = 100;
  const kernelX = Array.from(
    { length: numKernels },
    () => 0.1 + Math.random() * 20
  );
  const kernelY = kernelX.map(
    (x) => Math.min(x * 8, 40) * (0.5 + Math.random() * 0.8)
  );
  const kernelColors = kernelY.map((y) => Math.floor(y / 2));

  return [
    {
      x: rooflineX,
      y: rooflineY,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Roofline Boundary',
      line: { color: '#1976d2', width: 2 },
    },
    {
      x: ridgeX,
      y: ridgeY,
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: 'Ridge Point',
      marker: { color: '#1976d2', size: 10, symbol: 'star' },
    },
    {
      x: kernelX,
      y: kernelY,
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: 'Actual Performance',
      marker: {
        size: 8,
        color: kernelColors,
        colorscale: [
          [0, '#ffffcc'],
          [0.25, '#ffeda0'],
          [0.5, '#feb24c'],
          [0.75, '#f03b20'],
          [1, '#bd0026'],
        ],
        showscale: true,
        colorbar: {
          title: 'No. of Kernels',
          titleside: 'right',
          tickvals: [0, 10, 20, 30, 40],
          ticktext: ['1', '10', '20', '30', '40'],
        },
      },
    },
  ];
}

// Helper function to generate utilization nodes data
function generateUtilizationNodesData() {
  const nodeNames = [
    'nid008676',
    'nid008676',
    'nid008676',
    'nid008676',
    'nid008676',
  ];

  return nodeNames.map((node) => ({
    node,
    cpu: `${(60 + Math.random() * 10).toFixed(0)}%`,
    gpu: `${(82 + Math.random() * 10).toFixed(1)}%`,
    memory: `${(7 + Math.random() * 7).toFixed(1)}%`,
    network: `${(30 + Math.random() * 10).toFixed(2)}%`,
  }));
}

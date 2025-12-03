import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Breadcrumbs,
  Link as MuiLink,
} from '@mui/material';
import { createFileRoute, Link } from '@tanstack/react-router';
import Plot from 'react-plotly.js';
import { QueuePerformanceCharts } from './-components/QueuePerformanceCharts';
import PowerTimeSeriesPlot from './-components/PowerTimeSeriesPlot';

export const Route = createFileRoute('/center-performance/')({
  component: CenterPerformance,
});

/**
 * Center Performance page component
 */
function CenterPerformance() {

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

  // const powerData = generatePowerUsageData();
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
          View general system load and performance metrics
        </Typography>
      </Box>

      {/* Queue Performance Charts - Using real API data */}
      <QueuePerformanceCharts />

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
          NERSC Performance
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
            View Performance of Your Jobs →
          </Button>
        </Link>
      </Box>

      {/* Full System Power Usage */}
      <PowerTimeSeriesPlot csvFilePath="/data/perlmutter-system-power-2025-05.csv" />

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
              questions about your DOE Mission Science Allocation at NERSC.{' '}
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

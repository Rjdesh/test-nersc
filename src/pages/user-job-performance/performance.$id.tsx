import { createFileRoute, Link as RouterLink } from '@tanstack/react-router';
import {
  Alert,
  Box,
  Breadcrumbs,
  Container,
  Grid,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { useDataFromSource } from '../../hooks/useDataFromSource';

export const Route = createFileRoute('/user-job-performance/performance/$id')({
  component: JobPerformancePage,
});

interface MetricRow {
  'Job ID': number;
  'Floored Relative Time': number;
  [key: string]: number | null;
}

type MetricsByJob = Record<string, MetricRow[]>;

const METADATA_KEYS = new Set(['Job ID', 'Floored Relative Time']);

const formatMetricName = (metric: string) =>
  metric.replace('nersc_ldms_dcgm_', '').replace(/_/g, ' ');

const metricAnchorId = (metric: string) =>
  `metric-${metric.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

function JobPerformancePage() {
  const { id } = Route.useParams();
  const [activeSection, setActiveSection] = useState('');
  const metricsByJob = useDataFromSource(
    'data/user-job-performance/metrics-data.json'
  ) as MetricsByJob | undefined;

  const series = useMemo(() => metricsByJob?.[id] ?? [], [metricsByJob, id]);

  const metricNames = useMemo(
    () =>
      series.length
        ? Object.keys(series[0]).filter((key) => !METADATA_KEYS.has(key))
        : [],
    [series]
  );

  const hasData = series.length > 0 && metricNames.length > 0;
  const metricSectionIds = useMemo(
    () => metricNames.map((metric) => metricAnchorId(metric)),
    [metricNames]
  );

  useEffect(() => {
    if (metricSectionIds.length && !activeSection) {
      setActiveSection(metricSectionIds[0]);
    }
  }, [metricSectionIds, activeSection]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100;
      for (let i = metricSectionIds.length - 1; i >= 0; i -= 1) {
        const sectionId = metricSectionIds[i];
        const section = document.getElementById(sectionId);
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(sectionId);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [metricSectionIds]);

  const handleNavClick = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }
    const offset = 80;
    const offsetPosition = section.offsetTop - offset;
    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth',
    });
    setActiveSection(sectionId);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/user-job-performance" underline="hover" color="primary">
          For Users
        </Link>
        <Typography color="text.primary">Job Performance</Typography>
      </Breadcrumbs>

      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Performance Widgets for Job {id}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Time-series charts and tabular metrics from collected HPC telemetry.
        </Typography>
      </Box>

      {!metricsByJob && (
        <Paper sx={{ p: 3 }}>
          <Typography>Loading metrics data...</Typography>
        </Paper>
      )}

      {metricsByJob && !hasData && (
        <Alert severity="warning">
          No metrics were found for job <strong>{id}</strong> in `metrics-data.json`.
        </Alert>
      )}

      {hasData && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={9} lg={9}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {metricNames.map((metric) => (
                <Paper
                  key={metric}
                  id={metricAnchorId(metric)}
                  sx={{ p: 3, scrollMarginTop: 24 }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {formatMetricName(metric)}
                  </Typography>
                  <Plot
                    data={[
                      {
                        x: series.map((row) => row['Floored Relative Time']),
                        y: series.map((row) => row[metric]),
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: formatMetricName(metric),
                        line: { width: 2, color: '#1976d2' },
                        marker: { size: 4 },
                      },
                    ]}
                    layout={{
                      autosize: true,
                      height: 320,
                      margin: { l: 60, r: 20, t: 20, b: 50 },
                      xaxis: { title: 'Relative Time (s)', gridcolor: '#ececec' },
                      yaxis: { title: formatMetricName(metric), gridcolor: '#ececec' },
                      plot_bgcolor: 'white',
                      paper_bgcolor: 'white',
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    style={{ width: '100%' }}
                  />
                </Paper>
              ))}
            </Box>
          </Grid>

          <Grid item xs={12} md="auto" sx={{ width: { md: 220, lg: 240 } }}>
            <Box sx={{ p: 2, position: 'sticky', top: 40 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
                On This Page
              </Typography>
              <Stack spacing={1}>
                {metricNames.map((metric) => {
                  const sectionId = metricAnchorId(metric);
                  return (
                    <Link
                      key={metric}
                      component="button"
                      onClick={() => handleNavClick(sectionId)}
                      underline="hover"
                      variant="body2"
                      sx={{
                        textAlign: 'left',
                        color:
                          activeSection === sectionId
                            ? 'primary.main'
                            : 'text.primary',
                        fontWeight: activeSection === sectionId ? 600 : 400,
                        cursor: 'pointer',
                        border: 'none',
                        background: 'none',
                        padding: 0,
                      }}
                    >
                      {formatMetricName(metric)}
                    </Link>
                  );
                })}
              </Stack>
            </Box>
          </Grid>
        </Grid>
      )}
    </Container>
  );
}

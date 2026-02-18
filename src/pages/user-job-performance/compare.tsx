import { createFileRoute, Link as RouterLink } from '@tanstack/react-router';
import {
  Box,
  Breadcrumbs,
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  ListItemText,
  Link,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { useDataFromSource } from '../../hooks/useDataFromSource';

export const Route = createFileRoute('/user-job-performance/compare')({
  component: CompareJobsPage,
});

interface MetricRow {
  'Job ID': number;
  'Floored Relative Time': number;
  [key: string]: number | null;
}

interface UserJobData {
  'Job ID': number;
  'Project': string;
}

type MetricsByJob = Record<string, MetricRow[]>;

const formatMetricName = (metric: string) =>
  metric.replace('nersc_ldms_dcgm_', '').replace(/_/g, ' ');

const formatValue = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 3 });
const DUMMY_JOB_COUNT = 5;

function CompareJobsPage() {
  const metricsByJob = useDataFromSource(
    'data/user-job-performance/metrics-data.json'
  ) as MetricsByJob | undefined;
  const userJobs = useDataFromSource(
    'data/user-job-performance/user-jobs.json'
  ) as UserJobData[] | undefined;

  const [machine, setMachine] = useState('perlmutter gpu');
  const [project, setProject] = useState('m123123');
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [comparedJobs, setComparedJobs] = useState<string[]>([]);
  const [selectedMetric, setSelectedMetric] = useState('');
  const [granularity, setGranularity] = useState('job-level');
  const [aggregation, setAggregation] = useState('mean');

  const allMetricsByJob = useMemo(() => {
    if (!metricsByJob) {
      return undefined;
    }

    const entries = Object.entries(metricsByJob);
    if (!entries.length) {
      return metricsByJob;
    }

    const numericIds = Object.keys(metricsByJob)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    const maxId = numericIds.length ? Math.max(...numericIds) : 100000;

    const syntheticMetricsByJob: MetricsByJob = { ...metricsByJob };
    for (let index = 0; index < DUMMY_JOB_COUNT; index += 1) {
      const sourceSeries = entries[index % entries.length][1];
      const syntheticJobId = String(maxId + index + 1);

      syntheticMetricsByJob[syntheticJobId] = sourceSeries.map((row, rowIndex) => {
        const clonedRow: MetricRow = {
          'Job ID': Number(syntheticJobId),
          'Floored Relative Time': row['Floored Relative Time'],
        };

        Object.entries(row).forEach(([key, value]) => {
          if (key === 'Job ID' || key === 'Floored Relative Time') {
            return;
          }
          if (typeof value === 'number') {
            const modifier = 1 + ((((index + 1) * 5 + rowIndex) % 9) - 4) * 0.015;
            clonedRow[key] = Number((value * modifier).toFixed(3));
            return;
          }
          clonedRow[key] = value;
        });

        return clonedRow;
      });
    }

    return syntheticMetricsByJob;
  }, [metricsByJob]);

  const metricNames = useMemo(() => {
    const firstSeries = allMetricsByJob
      ? allMetricsByJob[Object.keys(allMetricsByJob)[0]]
      : undefined;
    if (!firstSeries || !firstSeries.length) {
      return [];
    }
    return Object.keys(firstSeries[0]).filter(
      (key) => key !== 'Job ID' && key !== 'Floored Relative Time'
    );
  }, [allMetricsByJob]);

  const gpuMetrics = useMemo(
    () => metricNames.filter((metric) => metric.includes('gpu') || metric.includes('sm_') || metric.includes('tensor')),
    [metricNames]
  );
  const cpuMetrics = useMemo(() => metricNames.filter((metric) => metric.includes('cpu')), [metricNames]);
  const networkMetrics = useMemo(
    () => metricNames.filter((metric) => metric.includes('network') || metric.includes('net')),
    [metricNames]
  );
  const otherMetrics = useMemo(
    () => metricNames.filter((metric) => !gpuMetrics.includes(metric) && !cpuMetrics.includes(metric) && !networkMetrics.includes(metric)),
    [metricNames, gpuMetrics, cpuMetrics, networkMetrics]
  );

  const jobOptions = useMemo(() => {
    if (!allMetricsByJob) {
      return [];
    }
    const metricsJobIds = Object.keys(allMetricsByJob);
    const projectByJob = new Map<string, string>();
    (userJobs ?? []).forEach((job) => {
      projectByJob.set(job['Job ID'].toString(), job['Project']);
    });
    return metricsJobIds.map((jobId) => ({
      id: jobId,
      label: `Job ID ${jobId}`,
      projectId: projectByJob.get(jobId) ?? 'Unknown',
    }));
  }, [allMetricsByJob, userJobs]);

  useEffect(() => {
    if (!selectedMetric && metricNames.length) {
      setSelectedMetric(
        metricNames.find((metric) => metric.includes('power_usage')) ?? metricNames[0]
      );
    }
  }, [selectedMetric, metricNames]);

  useEffect(() => {
    if (!selectedJobs.length && jobOptions.length) {
      const defaultJobs = jobOptions.slice(0, 6).map((job) => job.id);
      setSelectedJobs(defaultJobs);
      setComparedJobs(defaultJobs);
      if (jobOptions[0].projectId !== 'Unknown') {
        setProject(jobOptions[0].projectId);
      }
    }
  }, [selectedJobs.length, jobOptions]);

  const chartTraces = useMemo(() => {
    if (!allMetricsByJob || !selectedMetric) {
      return [];
    }
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444'];
    return comparedJobs.flatMap((jobId, index) => {
        const series = allMetricsByJob[jobId];
        if (!series || !series.length) {
          return [];
        }
        const maxTime = Math.max(...series.map((row) => row['Floored Relative Time']), 1);
        return [{
          x: series.map((row) => Math.round((row['Floored Relative Time'] / maxTime) * 100)),
          y: series.map((row) => row[selectedMetric]),
          type: 'scatter' as const,
          mode: 'lines' as const,
          name: `Job ${jobId}`,
          line: { width: 2, color: colors[index % colors.length] },
        }];
      });
  }, [allMetricsByJob, comparedJobs, selectedMetric]);

  const summaryRows = useMemo(() => {
    if (!allMetricsByJob || !selectedMetric) {
      return [];
    }
    return comparedJobs.map((jobId) => {
      const values =
        (allMetricsByJob[jobId] ?? [])
          .map((row) => row[selectedMetric])
          .filter((value): value is number => typeof value === 'number') ?? [];

      if (!values.length) {
        return { jobId, mean: 0, avg: 0, min: 0, max: 0 };
      }

      const sum = values.reduce((total, value) => total + value, 0);
      return {
        jobId,
        mean: sum / values.length,
        avg: sum / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    });
  }, [allMetricsByJob, comparedJobs, selectedMetric]);

  const handleJobsChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    const nextSelectedJobs = typeof value === 'string' ? value.split(',') : value;
    setSelectedJobs(nextSelectedJobs);
    setComparedJobs(nextSelectedJobs);
  };

  const handleRemoveComparedJob = (jobIdToRemove: string) => {
    const nextSelectedJobs = selectedJobs.filter((jobId) => jobId !== jobIdToRemove);
    setSelectedJobs(nextSelectedJobs);
    setComparedJobs(nextSelectedJobs);
  };

  return (
    <Box sx={{ bgcolor: '#f5f5f5', minHeight: '100vh', p: 3 }}>
      <Breadcrumbs
        separator={<NavigateNextIcon fontSize="small" />}
        sx={{ mb: 2 }}
      >
        <Link component={RouterLink} to="/center-performance" underline="hover" color="primary">
          For Users
        </Link>
        <Link component={RouterLink} to="/user-job-performance" underline="hover" color="primary">
          Your Job Performance
        </Link>
        <Typography color="text.primary">Compare Jobs</Typography>
      </Breadcrumbs>
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 3, color: '#1d2430' }}>
        Compare Jobs
      </Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Machine</InputLabel>
              <Select
                label="Machine"
                value={machine}
                onChange={(event) => setMachine(event.target.value)}
              >
                <MenuItem value="perlmutter gpu">perlmutter gpu</MenuItem>
                <MenuItem value="perlmutter cpu">perlmutter cpu</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Project</InputLabel>
              <Select
                label="Project"
                value={project}
                onChange={(event) => setProject(event.target.value)}
              >
                <MenuItem value={project}>{project}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Select Jobs</InputLabel>
              <Select
                multiple
                label="Select Jobs"
                value={selectedJobs}
                onChange={handleJobsChange}
                renderValue={(selected) =>
                  selected.length ? selected.map((jobId) => `Job ${jobId}`).join(', ') : 'Select Jobs'
                }
              >
                {jobOptions.map((job) => (
                  <MenuItem key={job.id} value={job.id}>
                    <Checkbox checked={selectedJobs.includes(job.id)} size="small" />
                    <ListItemText primary={job.label} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={1}>
            <Button
              fullWidth
              variant="contained"
              sx={{ textTransform: 'none', height: 40, bgcolor: '#0b2e63' }}
              onClick={() => setComparedJobs(selectedJobs)}
            >
              Compare
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={3} lg={2.5}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Metrics
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              GPU Metrics
            </Typography>
            <RadioGroup value={selectedMetric} onChange={(event) => setSelectedMetric(event.target.value)}>
              {(gpuMetrics.length ? gpuMetrics : metricNames.slice(0, 6)).map((metric) => (
                <FormControlLabel
                  key={metric}
                  value={metric}
                  control={<Radio size="small" />}
                  label={formatMetricName(metric)}
                />
              ))}
              {otherMetrics.map((metric) => (
                <FormControlLabel
                  key={metric}
                  value={metric}
                  control={<Radio size="small" />}
                  label={formatMetricName(metric)}
                />
              ))}
            </RadioGroup>

            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              CPU Metrics
            </Typography>
            {(cpuMetrics.length ? cpuMetrics : ['No CPU metrics']).map((metric) => (
              <Typography key={metric} variant="body2" sx={{ color: '#64748b', ml: 1 }}>
                {metric === 'No CPU metrics' ? metric : formatMetricName(metric)}
              </Typography>
            ))}

            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              Network Metrics
            </Typography>
            {(networkMetrics.length ? networkMetrics : ['No network metrics']).map((metric) => (
              <Typography key={metric} variant="body2" sx={{ color: '#64748b', ml: 1 }}>
                {metric === 'No network metrics' ? metric : formatMetricName(metric)}
              </Typography>
            ))}

            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              Data Aggregation
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, color: '#64748b' }}>
              Granularity
            </Typography>
            <RadioGroup value={granularity} onChange={(event) => setGranularity(event.target.value)}>
              <FormControlLabel value="job-level" control={<Radio size="small" />} label="Job level" />
              <FormControlLabel value="node-level" control={<Radio size="small" />} label="Node level" />
              <FormControlLabel value="gpu-level" control={<Radio size="small" />} label="GPU level" />
            </RadioGroup>

            <Typography variant="body2" sx={{ mt: 1, color: '#64748b' }}>
              Aggregation Logic
            </Typography>
            <RadioGroup value={aggregation} onChange={(event) => setAggregation(event.target.value)}>
              <FormControlLabel value="mean" control={<Radio size="small" />} label="Mean" />
              <FormControlLabel value="average" control={<Radio size="small" />} label="Average" />
              <FormControlLabel value="min" control={<Radio size="small" />} label="Min" />
            </RadioGroup>
          </Paper>
        </Grid>

        <Grid item xs={12} md={9} lg={9.5}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Selected Jobs:
              </Typography>
              {comparedJobs.map((jobId) => (
                <Chip
                  key={jobId}
                  label={`Job ID ${jobId}`}
                  onDelete={() => handleRemoveComparedJob(jobId)}
                  sx={{ bgcolor: '#eceff3' }}
                />
              ))}
            </Box>

            <Paper sx={{ p: 2, bgcolor: '#f8fafc', mb: 3 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 0.5 }}>
                {formatMetricName(selectedMetric)}
              </Typography>
              <Typography variant="body1" sx={{ textAlign: 'center', color: '#475569', mb: 1 }}>
                Comparing {comparedJobs.length} jobs over 1 selected metric
              </Typography>
              <Plot
                data={chartTraces as any}
                layout={{
                  autosize: true,
                  height: 390,
                  margin: { l: 70, r: 30, t: 20, b: 50 },
                  xaxis: { title: 'Relative Time', ticksuffix: '%', gridcolor: '#e2e8f0' },
                  yaxis: { title: formatMetricName(selectedMetric), gridcolor: '#e2e8f0' },
                  paper_bgcolor: '#f8fafc',
                  plot_bgcolor: '#f8fafc',
                  legend: { x: 1.02, y: 1, xanchor: 'left' },
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </Paper>

            <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
              {formatMetricName(selectedMetric)} across Jobs
            </Typography>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Jobs</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {formatMetricName(selectedMetric)} Mean
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {formatMetricName(selectedMetric)} Avg
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {formatMetricName(selectedMetric)} Min
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {formatMetricName(selectedMetric)} Max
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summaryRows.map((row) => (
                    <TableRow key={row.jobId}>
                      <TableCell>{row.jobId}</TableCell>
                      <TableCell>{formatValue(row.mean)}</TableCell>
                      <TableCell>{formatValue(row.avg)}</TableCell>
                      <TableCell>{formatValue(row.min)}</TableCell>
                      <TableCell>{formatValue(row.max)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

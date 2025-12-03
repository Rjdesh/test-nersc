import React, { useState, useEffect, useMemo } from 'react';
import Plot from 'react-plotly.js';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  InputLabel,
  FormControl,
  MenuItem,
  Select
} from '@mui/material';

interface DataPoint {
  time: number;
  power: number;
}

interface PowerTimeSeriesPlotProps {
  csvFilePath: string;
}

type DateRangeFilter = '24h' | '7d' | '30d' | 'all';

const PowerTimeSeriesPlot: React.FC<PowerTimeSeriesPlotProps> = ({ csvFilePath }) => {
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeFilter>('24h');

  const parseCSV = (csvText: string): DataPoint[] => {
    const lines = csvText.trim().split('\n');
    const dataPoints: DataPoint[] = [];

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const [timeStr, powerStr] = line.split(',');
      const time = parseFloat(timeStr);
      const power = parseFloat(powerStr);

      if (!isNaN(time) && !isNaN(power)) {
        dataPoints.push({ time, power });
      }
    }

    return dataPoints;
  };

  useEffect(() => {
    const loadCSV = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(csvFilePath);
        
        if (!response.ok) {
          throw new Error(`Failed to load CSV file: ${response.statusText}`);
        }

        const csvText = await response.text();
        const parsedData = parseCSV(csvText);

        if (parsedData.length === 0) {
          setError('No valid data found in the CSV file');
        } else {
          setData(parsedData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading CSV file');
      } finally {
        setLoading(false);
      }
    };

    loadCSV();
  }, [csvFilePath]);

  // Filter data based on selected date range
  const filteredData = useMemo(() => {
    if (dateRange === 'all' || data.length === 0) {
      return data;
    }

    // Find the maximum timestamp in the data
    const maxTime = Math.max(...data.map(point => point.time));
    let cutoffTime: number;

    switch (dateRange) {
      case '24h':
        cutoffTime = maxTime - (24 * 60 * 60 * 1000); // 24 hours in ms
        break;
      case '7d':
        cutoffTime = maxTime - (7 * 24 * 60 * 60 * 1000); // 7 days in ms
        break;
      case '30d':
        cutoffTime = maxTime - (30 * 24 * 60 * 60 * 1000); // 30 days in ms
        break;
      default:
        return data;
    }
    return data.filter(point => point.time >= cutoffTime);
  }, [data, dateRange]);

  // Last updated time is the last available time in data
    const lastUpdatedTime = useMemo(() => {
        if (data.length === 0) return null;
        
        const maxTime = Math.max(...data.map(point => point.time));
        return new Date(maxTime);
        }, [data]);


  // Convert milliseconds to date objects for x-axis
  const dates = filteredData.map((point) => new Date(point.time));
  const powers = filteredData.map((point) => point.power);

  return (
    <Box
     sx={{ width: '100%', mb: 5 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          System Power Usage
        </Typography>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {data.length > 0 && !loading && (
          <>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel id="date-range-label">Date Range</InputLabel>
                    <Select
                    labelId="date-range-label"
                    id="date-range-select"
                    value={dateRange}
                    label="Date Range"
                    onChange={(event) => setDateRange(event.target.value as DateRangeFilter)}
                    sx={{
                        textTransform: 'none',
                    }}
                    >
                    <MenuItem value="24h" sx={{ textTransform: 'none' }}>
                        Last 24 Hours
                    </MenuItem>
                    <MenuItem value="7d" sx={{ textTransform: 'none' }}>
                        Last 7 Days
                    </MenuItem>
                    <MenuItem value="30d" sx={{ textTransform: 'none' }}>
                        Last 30 Days
                    </MenuItem>
                    <MenuItem value="all" sx={{ textTransform: 'none' }}>
                        All Data
                    </MenuItem>
                    </Select>
                </FormControl>
            </Box>

            <Box sx={{ width: '100%', height: '500px', mb: 3 }}>
              <Plot
                data={[
                  {
                    x: dates,
                    y: powers,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Power',
                    line: { color: '#2196f3', width: 2 },
                  },
                ]}
                layout={{
                  autosize: true,
                  xaxis: {
                    title: 'Time',
                    type: 'date',
                    gridcolor: '#f0f0f0',
                    showgrid: true,
                  },
                  yaxis: {
                    title: 'Power (W)',
                    gridcolor: '#f0f0f0',
                    showgrid: true,
                  },
                  hovermode: 'closest',
                  margin: { l: 50, r: 20, t: 20, b: 50 },
                  dragmode: 'zoom',
                }}
                config={{
                  responsive: true,
                  displayModeBar: false,
                  displaylogo: false,
                }}
                style={{ width: '100%', height: '100%' }}
              />
            </Box>
          </>
        )}
        <Typography
          variant="body1"
          sx={{ color: '#666', mt: 2, display: 'block' }}
        >
          <strong>Note:</strong> Full system power usage is calculated from the
          substation power. Sections without measured data are empty in chart.{' '}
          <a href="#" style={{ color: '#2196f3' }}>
            Learn more.
          </a>
        </Typography>

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Displaying {filteredData.length} of {data.length} data points
            </Typography>

            {lastUpdatedTime && (
                <Typography 
                variant="caption" 
                sx={{ 
                    color: 'text.secondary',
                }}
                >
                Last updated: {lastUpdatedTime.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })}
                </Typography>
            )}
        </Box>
       
      </Paper>
        
    </Box>
  );
};

export default PowerTimeSeriesPlot;
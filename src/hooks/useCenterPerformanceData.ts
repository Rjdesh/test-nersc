import { useQuery } from '@tanstack/react-query';

/**
 * Interface for the queue wait times and jobs data from NERSC API
 */
export interface QueueWaitTimesData {
  wait: number[][]; // 2D array for heatmap data [x, y, value]
  jobs: number[][]; // 2D array for jobs heatmap data [x, y, value]
  wait_table: {
    categories: string[];
    values: (string | number)[][];
  };
  jobs_table: {
    categories: string[];
    values: (string | number)[][];
  };
}

export interface CenterPerformanceParams {
  machine: string;
  arch: string;
  start: number; // Unix timestamp
  end: number; // Unix timestamp
  qos: string;
}

/**
 * Custom hook to fetch center performance data from NERSC REST API
 * This hook fetches queue wait times and queued jobs data for heatmaps and tables
 * 
 * @param params - Parameters for the API request (machine, arch, start, end, qos)
 * @returns Query result with queue wait and jobs data
 */
export const useCenterPerformanceData = (params: CenterPerformanceParams) => {
  const { machine, arch, start, end, qos } = params;

  return useQuery<QueueWaitTimesData>({
    queryKey: ['centerPerformance', machine, arch, start, end, qos],
    queryFn: async (): Promise<QueueWaitTimesData> => {
      const restBaseURL = 'https://rest.nersc.gov/REST';
      const baseURL = `${restBaseURL}/mynersc/queuewaittimes.php`;
      
      const queryParams = new URLSearchParams({
        machine,
        arch,
        start: start.toString(),
        end: end.toString(),
        qos,
      });

      const response = await fetch(`${baseURL}?${queryParams.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }

      const data: QueueWaitTimesData = await response.json();
      return data;
    },
    // Refetch every 2 minutes (120000 ms) to keep data fresh
    refetchInterval: 120000,
    // Keep data for 5 minutes
    staleTime: 300000,
    retry: 2,
  });
};

/**
 * Helper function to convert API data to Plotly heatmap format
 * The API returns data in format [[x, y, value], ...] which needs to be
 * transformed into separate x, y, and z arrays for Plotly
 */
export const transformToHeatmapData = (apiData: number[][]) => {
  if (!apiData || apiData.length === 0) {
    return { x: [], y: [], z: [] };
  }

  // Find unique x and y values
  const xSet = new Set<number>();
  const ySet = new Set<number>();
  
  apiData.forEach(([x, y]) => {
    xSet.add(x);
    ySet.add(y);
  });

  const xValues = Array.from(xSet).sort((a, b) => a - b);
  const yValues = Array.from(ySet).sort((a, b) => a - b);

  // Create z matrix with null values
  const z: number[][] = Array(yValues.length)
    .fill(null)
    .map(() => Array(xValues.length).fill(null));

  // Fill z matrix with values
  apiData.forEach(([x, y, value]) => {
    const xIndex = xValues.indexOf(x);
    const yIndex = yValues.indexOf(y);
    if (xIndex !== -1 && yIndex !== -1) {
      z[yIndex][xIndex] = value;
    }
  });

  // Convert x and y to category labels
  const hourCategories = xValues.map((val, i) => {
    if (val === 0) return '<1';
    if (i === xValues.length - 1) return `${val}+`;
    return val.toString();
  });

  const nodeCategories = yValues.map((val, i) => {
    const lower = Math.pow(2, val);
    const upper = Math.pow(2, val + 1) - 1;
    if (val === 0) return '1';
    if (i === yValues.length - 1) return `${lower}+`;
    return `${lower} - ${upper}`;
  });

  return {
    x: hourCategories,
    y: nodeCategories,
    z: z,
  };
};

/**
 * Helper function to format table data from API response
 */
export const formatTableData = (tableData: {
  categories: string[];
  values: (string | number)[][];
}) => {
  if (!tableData || !tableData.categories || !tableData.values) {
    return { categories: [], values: [] };
  }

  // Capitalize category names
  const formattedCategories = tableData.categories.map((cat) =>
    cat.charAt(0).toUpperCase() + cat.slice(1)
  );

  return {
    categories: formattedCategories,
    values: tableData.values,
  };
};

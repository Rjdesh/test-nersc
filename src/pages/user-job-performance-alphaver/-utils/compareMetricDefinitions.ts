export interface CompareMetricDefinition {
  label: string;
  apiMetricName: string;
  aliases: string[];
}

export interface CompareMetricCategory {
  id: string;
  title: string;
  metrics: CompareMetricDefinition[];
}

export const GPU_UTILIZATION_METRIC = 'nersc_ldms_dcgm_gpu_utilization';
export const GPU_UTILIZATION_API_METRIC = 'nersc_ldms_dcgm_gr_engine_active';
export const NODE_POWER_API_METRIC = 'node_power';
export const CPU_POWER_API_METRIC = 'cpu_power';

const metric = (
  label: string,
  apiMetricName: string,
  aliases: string[] = [apiMetricName]
): CompareMetricDefinition => ({
  label,
  apiMetricName,
  aliases,
});

export const COMPARE_METRIC_CATEGORIES: CompareMetricCategory[] = [
  {
    id: 'efficiency-snapshot',
    title: 'Efficiency Snapshot',
    metrics: [
      metric('GPU Utilization (%)', GPU_UTILIZATION_API_METRIC, [
        GPU_UTILIZATION_METRIC,
        GPU_UTILIZATION_API_METRIC,
      ]),
      metric('GPU Memory footprint: FB Used, FB Free', 'nersc_ldms_dcgm_fb_used', [
        'nersc_ldms_dcgm_fb_used',
        'nersc_ldms_dcgm_fb_free',
      ]),
      metric('GPU Memory Bandwidth Utilization (%)', 'nersc_ldms_dcgm_dram_active'),
      metric('CPU Utilization (%)', 'nersc_ldms_dcgm_cpu_utilization', [
        'nersc_ldms_dcgm_cpu_utilization',
        'nersc_ldms_cpu_utilization',
      ]),
      metric('CPU Memory Utilization', 'nersc_ldms_cpu_host_memory_usage', [
        'nersc_ldms_cpu_host_memory_usage',
        'nersc_ldms_mem_used',
      ]),
      metric('CPU Memory Bandwidth', 'nersc_ldms_cpu_memory_bandwidth'),
    ],
  },
  {
    id: 'gpu-compute',
    title: 'More GPU Compute Metrics',
    metrics: [
      metric('GPU SM Active (%)', 'nersc_ldms_dcgm_sm_active'),
      metric('GPU Tensor Active (%)', 'nersc_ldms_dcgm_tensor_active'),
      metric('GPU Tensor HMMA Active', 'nersc_ldms_dcgm_tensor_hmma_active'),
      metric('GPU Tensor IMMA Active', 'nersc_ldms_dcgm_tensor_imma_active'),
      metric('GPU FP16 Active', 'nersc_ldms_dcgm_fp16_active'),
      metric('GPU FP32 Active', 'nersc_ldms_dcgm_fp32_active'),
      metric('GPU FP64 Active', 'nersc_ldms_dcgm_fp64_active'),
    ],
  },
  {
    id: 'power-usage',
    title: 'Power Usage',
    metrics: [
      metric('GPU Power', 'nersc_ldms_dcgm_power_usage'),
      metric('CPU Power', CPU_POWER_API_METRIC, ['nersc_ldms_cpu_power', CPU_POWER_API_METRIC]),
      metric('Node Power', NODE_POWER_API_METRIC, ['nersc_ldms_node_power', NODE_POWER_API_METRIC]),
      metric('Memory Power', 'nersc_ldms_memory_power'),
      metric('Total GPU Energy Consumed', 'nersc_ldms_dcgm_total_energy_consumption', [
        'nersc_ldms_dcgm_total_energy_consumption',
        'nersc_ldms_dcgm_energy_consumption',
      ]),
    ],
  },
  {
    id: 'communication-network',
    title: 'Communication / Network Metrics',
    metrics: [
      metric('PCIe Throughput (MB/s)', 'nersc_ldms_dcgm_pcie_tx_throughput', [
        'nersc_ldms_dcgm_pcie_tx_throughput',
        'nersc_ldms_dcgm_pcie_rx_throughput',
      ]),
      metric('NVLink Throughput (GB/s)', 'nersc_ldms_dcgm_nvlink_tx_throughput', [
        'nersc_ldms_dcgm_nvlink_tx_throughput',
        'nersc_ldms_dcgm_nvlink_rx_throughput',
      ]),
      metric('Slingshot Throughput', 'nersc_ldms_slingshot_throughput', [
        'nersc_ldms_slingshot_throughput',
        'nersc_ldms_slingshot_network_throughput',
        'nersc_ldms_network_throughput',
        'nersc_ldms_internode_network_throughput',
      ]),
      metric('NIC Utilization Balance', 'nersc_ldms_nic_utilization_balance'),
      metric('NIC Throughput (Packets/sec)', 'nersc_ldms_nic_throughput_packets_sec', [
        'nersc_ldms_nic_throughput_packets_sec',
        'nersc_ldms_nic_packets_per_sec',
      ]),
    ],
  },
];

import type { ProxyOptions } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, process.cwd(), ''),
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => (
        typeof entry[1] === 'string'
      ))
    ),
  };
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';
  const apiProxy: ProxyOptions = {
    target: apiProxyTarget,
    changeOrigin: true,
  };

  return {
    plugins: [
      TanStackRouterVite({ autoCodeSplitting: true }),
      react(),
    ],
    base: mode === 'development' ? '/' : env.VITE_BASE_URL,
    server: {
      port: 5175,
      strictPort: true,
      proxy: {
        '/api': apiProxy,
      },
    },
  };
});

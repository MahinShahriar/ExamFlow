import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Proxy API routes to the backend to avoid CORS during development
          '/api': {
            target: 'http://localhost:8000',
            changeOrigin: true,
            secure: false,
          },
          // Proxy user endpoints (used by getCurrentUser) as well
          '/users': {
            target: 'http://localhost:8000',
            changeOrigin: true,
            secure: false,
          },
          // Proxy auth endpoints (login/register) to backend
          '/auth': {
            target: 'http://localhost:8000',
            changeOrigin: true,
            secure: false,
          },
          // Proxy media files to backend static files
          '/media': {
            target: 'http://localhost:8000',
            changeOrigin: true,
            secure: false,
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

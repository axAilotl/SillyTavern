import { defineConfig } from '@playwright/test';

export default defineConfig({
    testMatch: '*.e2e.js',
    use: {
        baseURL: 'http://127.0.0.1:8000',
        video: 'on',
        screenshot: 'only-on-failure',
    },
});

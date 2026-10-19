import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', timeout: 120000, workers: 1, expect: { timeout: 30000 }, use: { baseURL: 'http://127.0.0.1:3000', headless: true, navigationTimeout: 90000, reducedMotion: 'reduce' }, reporter: 'list' });

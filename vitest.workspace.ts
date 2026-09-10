import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'core',
      environment: 'node',
      globals: true,
      include: ['packages/core/src/**/*.test.ts']
    }
  },
  {
    extends: './apps/web/vite.config.ts',
    test: {
      name: 'web',
      include: ['apps/web/src/**/*.test.{ts,tsx}']
    }
  }
]);

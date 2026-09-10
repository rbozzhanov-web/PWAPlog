import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './apps/web/vite.config.ts',
    test: {
      name: 'web'
    }
  }
]);

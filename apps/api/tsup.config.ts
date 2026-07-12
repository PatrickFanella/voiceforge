import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/server.ts', 'src/migrate.ts'], format: ['esm'], platform: 'node', target: 'node22', sourcemap: true, clean: true, noExternal: [/^@voiceforge\//] });

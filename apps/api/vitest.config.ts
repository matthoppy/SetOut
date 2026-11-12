import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Tests run inside the Workers runtime against a real D1 database, with the
// same migrations production gets.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            // A test-only binding, so a setup file can apply the migrations.
            TEST_MIGRATIONS: migrations,
            // The designer's address and the workspace's, as production has. Any other host serves everything by path.
            DESIGNER_HOST: 'designer.test',
            APP_HOST: 'app.test',
            // SetOut's own site, which production has too.
            SITE_HOST: 'site.test',
          },
          // A small stand-in for the built apps, served by the real file
          // binding, so these tests need no build and still meet the real
          // rules: a folder serves its index page, and an unknown path falls
          // back to the workspace page.
          assets: {
            directory: path.join(import.meta.dirname, 'test', 'site'),
            binding: 'ASSETS',
            assetConfig: { not_found_handling: 'single-page-application' },
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});

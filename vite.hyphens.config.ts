import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Produces a standalone UMD bundle of the `hyphenation.en-us` pattern data so
// it can be loaded via a `<script>` tag (used by `src/demos/bookmarklet.js`
// via `unpkg.com/tex-linebreak/dist/hyphens_en-us.js`).
export default defineConfig({
  build: {
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(import.meta.resolve('hyphenation.en-us')),
      formats: ['umd'],
      name: 'texLineBreak_hyphens_en-us',
      fileName: () => 'hyphens_en-us.js',
    },
  },
});

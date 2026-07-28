import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The app ships as one self-contained HTML file: `og_run()` / `og_init()` copy
// `inst/site/index.html` into a project (or snapshot branch) root, where it
// fetches the published payload over HTTP. Building straight into inst/site
// keeps the packaged SPA and site/src in step — previously the bundle landed in
// the repo root as a stray artifact that had to be copied by hand.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: '../inst/site',
    emptyOutDir: false,
    // Only the bundle ships; site/public holds dev-server fixtures.
    copyPublicDir: false,
  },
});

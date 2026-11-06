import { defineConfig, type Plugin } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

const CRAZYGAMES_SDK = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/**
 * Only the `crazygames` build loads the CrazyGames SDK (in <head>, as the docs
 * ask). The GitHub Pages build makes no external request at all.
 */
function crazyGamesSdk(mode: string): Plugin {
  return {
    name: 'crazygames-sdk',
    transformIndexHtml(html) {
      const tag = mode === 'crazygames' ? `<script src="${CRAZYGAMES_SDK}"></script>` : '';
      return html.replace('<!--crazygames-sdk-->', tag);
    },
  };
}

// Everything (code, CSS, fonts) is inlined into a single dist/index.html.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [crazyGamesSdk(mode), viteSingleFile()],
  build: {
    target: 'es2020',
    reportCompressedSize: true,
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));

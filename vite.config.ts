import { defineConfig, type Plugin } from 'vitest/config';

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

// base './' keeps every asset path relative, so the same build works on
// GitHub Pages (/Choice-Chaos/) and inside the CrazyGames iframe.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [crazyGamesSdk(mode)],
  build: {
    target: 'es2020',
    assetsInlineLimit: 4096,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));

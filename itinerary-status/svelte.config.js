import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',   // <-- Output for Cloudflare Pages
      assets: 'build',
      fallback: 'index.html'
    })
  }
};

export default config;

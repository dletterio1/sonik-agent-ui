import adapter from "@sveltejs/adapter-cloudflare";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
  },
};

export default config

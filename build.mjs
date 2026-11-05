import {writeFile} from 'node:fs/promises';
import {build} from 'esbuild';

const config = {};
if (process.env.WAYSTEP_FIREBASE_CONFIG) {
  const firebase = JSON.parse(process.env.WAYSTEP_FIREBASE_CONFIG);
  const keys = ['apiKey', 'authDomain', 'projectId', 'appId'];
  for (const key of keys) {
    if (typeof firebase?.[key] !== 'string' || !firebase[key].trim()) throw Error('Missing Firebase web config field: ' + key);
  }
  config.firebase = Object.fromEntries(keys.map(key => [key, firebase[key]]));
}
if (process.env.WAYSTEP_MCP_URL) {
  const url = new URL(process.env.WAYSTEP_MCP_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw Error('WAYSTEP_MCP_URL must be a public HTTPS endpoint.');
  }
  config.mcpUrl = url.href;
}

await build({
  entryPoints: ['src/cloud.mjs'],
  outfile: 'dist/cloud-bundle.js',
  format: 'esm',
  bundle: true,
  minify: true
});
await writeFile('dist/cloud-config.js', 'window.WAYSTEP_CONFIG = ' + JSON.stringify(config) + ';\n');

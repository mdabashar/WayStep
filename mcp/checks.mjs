import assert from 'node:assert/strict';
import {once} from 'node:events';
import {gunzipSync} from 'node:zlib';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createApp} from './server.mjs';

const server = createApp('https://mdabashar.github.io/WayStep/').listen(0, '127.0.0.1');
await once(server, 'listening');
const endpoint = new URL('http://127.0.0.1:' + server.address().port + '/mcp');
const client = new Client({name: 'Waystep test', version: '1.0.0'});
try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  assert.equal((await client.listTools()).tools[0].name, 'send_trip_draft');
  const trip = {title: 'Brisbane → Sydney', steps: [{title: 'Catch the train', mode: 'train', departure: '2026-11-08T14:00', notes: 'Bring a book.'}]};
  const result = await client.callTool({name: 'send_trip_draft', arguments: {trip}});
  assert.ok(!result.isError, JSON.stringify(result));
  const review = new URL(result.content.find(item => item.type === 'resource_link').uri);
  assert.equal(review.pathname, '/WayStep/');
  assert.equal(review.search, '');
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(review.hash.slice('#draft='.length), 'base64url'))), trip);
  const invalid = await client.callTool({name: 'send_trip_draft', arguments: {trip: {...trip, steps: []}}});
  assert.equal(invalid.isError, true);
  assert.equal((await fetch(endpoint, {method: 'POST', headers: {Origin: 'https://another-site.example'}})).status, 403);
  assert.equal((await fetch(endpoint)).status, 405);
  console.log('Passed: remote MCP discovery, draft handoff, validation, and HTTP origin handling.');
} finally {
  await client.close();
  server.close();
}

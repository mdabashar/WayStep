import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import express from 'express';
import {z} from 'zod';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const date = z.iso.date().or(z.literal('')).optional();
const time = z.iso.datetime({local: true, precision: -1}).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).or(z.literal('')).optional();
const title = z.string().trim().min(1).max(200);
const detail = z.string().max(1000).optional();
const notes = z.string().max(5000).optional();
const step = z.object({
  title, mode: z.enum(['walk', 'bicycle', 'car', 'taxi', 'bus', 'train', 'ferry', 'flight', 'other']),
  from: detail, to: detail, service: detail, departure: time, arrival: time, booking: detail, notes
});
const draft = z.object({title, start: date, end: date, notes, steps: z.array(step).min(1).max(200)})
  .refine(trip => !trip.start || !trip.end || trip.start <= trip.end, 'The trip end date must be on or after its start date.');

export function createApp(reviewPage) {
  const review = new URL(reviewPage);
  if (review.protocol !== 'https:' && !(review.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(review.hostname))) {
    throw Error('Set WAYSTEP_AI_URL to an HTTPS review page.');
  }
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_, res) => res.send('OK'));
  app.use('/mcp', (req, res, next) => {
    if (req.headers.origin && req.headers.origin !== review.origin) return res.sendStatus(403);
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.set('Allow', 'POST').sendStatus(405);
    next();
  }, express.json({limit: '256kb'}));
  app.post('/mcp', async (req, res) => {
    const server = new McpServer({name: 'WaystepAI', version: '1.0.0'});
    server.registerTool('send_trip_draft', {
      title: 'Send draft to WaystepAI',
      description: 'Create a review link for a trip you planned in this chat. The link contains the draft. Present it unchanged to the user. They can review and save it in WaystepAI. Omit unknown times and never guess booking codes.',
      inputSchema: {trip: draft},
      annotations: {readOnlyHint: true, idempotentHint: true, openWorldHint: true}
    }, ({trip}) => {
      const encoded = gzipSync(JSON.stringify(trip)).toString('base64url');
      if (encoded.length > 10000) {
        return {isError: true, content: [{type: 'text', text: 'This draft is too large for a review link. Give the user a Waystep JSON file or split the itinerary into smaller drafts.'}]};
      }
      const url = new URL(review);
      url.hash = 'draft=' + encoded;
      return {content: [
        {type: 'text', text: 'Show the user this exact link. It contains their draft. [Review your draft in WaystepAI](' + url.href + ')'},
        {type: 'resource_link', uri: url.href, name: 'Review your draft in WaystepAI'}
      ]};
    });
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true});
    res.on('close', () => void server.close());
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({jsonrpc: '2.0', id: null, error: {code: -32603, message: 'Unable to create a draft link.'}});
    }
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const page = process.env.WAYSTEP_AI_URL || 'https://mdabashar.github.io/WayStep/ai.html';
  createApp(page).listen(Number(process.env.PORT || 8080), '0.0.0.0');
}

import {pathToFileURL} from 'node:url';
import express from 'express';
import {createDraftServer, publishedReviewPage} from './draft.mjs';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';

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
    const server = createDraftServer(review);
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
  const page = process.env.WAYSTEP_AI_URL || publishedReviewPage;
  createApp(page).listen(Number(process.env.PORT || 8080), '0.0.0.0');
}

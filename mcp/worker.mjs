import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createDraftServer, publishedReviewPage} from './draft.mjs';

const review = new URL(publishedReviewPage);
const maxBodyBytes = 256 * 1024;

export default {
  async fetch(request, _env, ctx) {
    const {pathname} = new URL(request.url);
    if (pathname === '/health' && request.method === 'GET') return new Response('OK');
    if (pathname !== '/mcp') return new Response('Not found', {status: 404});

    const headers = {'Cache-Control': 'no-store'};
    const origin = request.headers.get('Origin');
    if (origin && origin !== review.origin) return new Response('Forbidden', {status: 403, headers});
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {status: 405, headers: {...headers, Allow: 'POST'}});
    }
    // Bound streamed requests too, even when Content-Length is absent.
    if (Number(request.headers.get('Content-Length')) > maxBodyBytes) {
      return new Response('Payload too large', {status: 413, headers});
    }
    const reader = request.body?.getReader();
    const bytes = new Uint8Array(maxBodyBytes);
    let length = 0;
    if (reader) {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (length + value.byteLength > maxBodyBytes) {
          ctx.waitUntil(reader.cancel());
          return new Response('Payload too large', {status: 413, headers});
        }
        bytes.set(value, length);
        length += value.byteLength;
      }
    }
    const bounded = new Request(request.url, {method: 'POST', headers: request.headers, body: bytes.subarray(0, length)});
    const server = createDraftServer(review);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, enableJsonResponse: true
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(bounded);
      const output = new Response(response.body, response);
      output.headers.set('Cache-Control', 'no-store');
      return output;
    } finally {
      ctx.waitUntil(server.close());
    }
  }
};

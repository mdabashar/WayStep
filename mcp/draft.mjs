import {gzipSync} from 'node:zlib';
import {z} from 'zod';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';

export const publishedReviewPage = 'https://mdabashar.github.io/WayStep/';

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

export function createDraftServer(review) {
  const server = new McpServer({name: 'Waystep', version: '1.0.0'});
  server.registerTool('send_trip_draft', {
    title: 'Send draft to Waystep',
    description: 'Create a review link for a trip you planned in this chat. The link contains the draft. Present it unchanged to the user. They can review and save it in Waystep. Omit unknown times and never guess booking codes.',
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
      {type: 'text', text: 'Show the user this exact link. It contains their draft. [Review your draft in Waystep](' + url.href + ')'},
      {type: 'resource_link', uri: url.href, name: 'Review your draft in Waystep'}
    ]};
  });
  return server;
}

import { EventEmitter } from "node:events";

// One process-wide bus; events are namespaced per campaign so an SSE
// connection only hears about the campaign it opened a stream for.
const bus = new EventEmitter();
bus.setMaxListeners(100);

function channel(campaignId) {
  return `campaign:${campaignId}`;
}

export function emitProgress(campaignId, event) {
  bus.emit(channel(campaignId), { ...event, ts: new Date().toISOString() });
}

/** Returns an unsubscribe function. */
export function subscribeProgress(campaignId, handler) {
  const ch = channel(campaignId);
  bus.on(ch, handler);
  return () => bus.off(ch, handler);
}

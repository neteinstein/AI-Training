// OpenNext adapter settings for Cloudflare Workers. See https://opennext.js.org/cloudflare/caching
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

export default defineCloudflareConfig({
  // "use cache" results (the public catalogue) are kept in KV ...
  incrementalCache: kvIncrementalCache,
  // ... and updateTag(CATALOG_TAG) is recorded in D1, which is consistent at once (KV is not).
  tagCache: d1NextTagCache,
  queue: memoryQueue,
});

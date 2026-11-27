// The browser build: plain JavaScript everywhere. The Node build of the library loads
// `worker_threads` through `createRequire`, which the Cloudflare Worker runtime does not offer;
// the synchronous classes used here need neither.
import { Zip, ZipDeflate, ZipPassThrough } from "fflate/browser";

export type ZipEntry = {
  /** Path inside the archive, with "/" between folders. */
  name: string;
  /** Text and small data are compressed; a stream is stored as it is (files are mostly PDFs,
   *  images and videos, which are compressed already). */
  data: string | Uint8Array | ReadableStream<Uint8Array>;
  modifiedAt?: Date;
};

/**
 * The format has no room for sizes and positions past 4 GiB without its ZIP64 extension,
 * which the library does not write. A backup that would pass this is refused before it starts.
 */
export const ZIP_SIZE_LIMIT = 4 * 1024 ** 3 - 64 * 1024 ** 2;

const encoder = new TextEncoder();

/**
 * A ZIP archive written as it is read. Entries are taken one at a time, and a stream entry is
 * read only as fast as the archive is downloaded, so the server never holds more than a chunk
 * of any file, however large the backup.
 *
 * Should a stream entry fail half-way, the archive fails too: an archive that ends early is
 * reported by the browser as a failed download, where one with a cut file inside would look
 * complete.
 */
export function zipStream(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const chunks = writeZip(entries);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

async function* writeZip(entries: AsyncIterable<ZipEntry>): AsyncGenerator<Uint8Array> {
  const ready: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else if (chunk.length > 0) ready.push(chunk);
  });

  function* drain() {
    if (failure) throw failure;
    while (ready.length > 0) yield ready.shift()!;
  }

  for await (const entry of entries) {
    const stored = entry.data instanceof ReadableStream;
    const file = stored ? new ZipPassThrough(entry.name) : new ZipDeflate(entry.name, { level: 6 });
    file.mtime = entry.modifiedAt ?? new Date();
    zip.add(file);

    if (entry.data instanceof ReadableStream) {
      const reader = entry.data.getReader();
      let finished = false;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          file.push(value, false);
          yield* drain();
        }
        finished = true;
      } finally {
        // A failure, or the download being cancelled: stop fetching the rest of the file.
        if (!finished) await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      file.push(new Uint8Array(0), true);
    } else {
      file.push(typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data, true);
    }
    yield* drain();
  }

  zip.end();
  yield* drain();
}

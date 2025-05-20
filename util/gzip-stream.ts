import { forEach } from "@cloudydeno/stream-observables/transforms/for-each.ts";

export interface CompressionStats {
  rawSize: number;
  compressedSize: number;
  ratio: number;
  durationMillis: number;
}

/**
 * Compresses a stream using gzip and reports the final compression ratio.
 * @param readable The input data to be compressed.
 * @returns A tuple, with the compressed output stream and a statistics promise.
 */
export function gzipStream(readable: ReadableStream<Uint8Array>): [
  ReadableStream<Uint8Array>,
  Promise<CompressionStats>,
] {
  let rawSize = 0;
  let compressedSize = 0;
  const startTime = performance.now();

  let statsOk: (stats: CompressionStats) => void;
  const statsPromise = new Promise<CompressionStats>(ok => statsOk = ok);

  const compressedStream = readable
    .pipeThrough(forEach(x => rawSize += x.byteLength))
    .pipeThrough(new CompressionStream("gzip"))
    .pipeThrough(forEach(x => compressedSize += x.byteLength))
    .pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
      flush: () => statsOk({
        rawSize,
        compressedSize,
        ratio: (rawSize - compressedSize) / rawSize,
        durationMillis: performance.now() - startTime,
      }),
    }));

  statsPromise.then(stats => console.error('   ',
    'gzipped', Math.round(stats.rawSize/1024), 'KiB',
    'to', Math.round(stats.compressedSize/1024), 'KiB',
    `-`, Math.round(stats.ratio*10000)/100, '% smaller',
    `- in`, stats.durationMillis, 'ms'));

  return [compressedStream, statsPromise];
}

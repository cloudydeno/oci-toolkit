import { single } from "@cloudydeno/stream-observables/sinks/single.ts";

import { Sha256 } from "./sha256.ts";

/** Computes a hex digest of the given stream of bytes */
export async function sha256stream(byteStream: ReadableStream<Uint8Array>): Promise<string> {
  // Until SubtleCrypto can digest a ReadableStream, this will have to do
  let digest: Sha256;

  const hashStream = new TransformStream<Uint8Array, string>(
    {
      start() {
        digest = new Sha256();
      },
      transform(chunk) {
        digest.update(chunk);
      },
      flush(controller) {
        controller.enqueue(digest.toString());
      },
    },
    { highWaterMark: 1 },
    { highWaterMark: 0 },
  );

  return await single(byteStream.pipeThrough(hashStream));
}

/** Computes a hex digest of the given byte array */
export async function sha256bytes(message: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', message);
  return bytesToHex(hash);
}

function bytesToHex(data: ArrayBuffer) {
  return [...new Uint8Array(data)]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

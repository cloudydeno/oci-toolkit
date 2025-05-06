import { forEach, ProgressBar } from "../deps.ts";

export function showStreamProgress(totalSize: number): TransformStream<Uint8Array> {
  const progressBar = new ProgressBar({
    total: totalSize,
    output: Deno.stderr,
  });

  let bytesSoFar = 0;
  return forEach<Uint8Array>(buffer => {
    bytesSoFar += buffer.byteLength;
    progressBar.render(bytesSoFar);
  });
}

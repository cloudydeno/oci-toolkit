import ProgressBar from "@deno-library/progress";
import { forEach } from "@cloudydeno/stream-observables/transforms/for-each.ts";

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

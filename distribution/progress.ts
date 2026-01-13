import ProgressBar from "@deno-library/progress";
import { forEach } from "@cloudydeno/stream-observables/transforms/for-each";

export function showStreamProgress(totalSize: number): TransformStream<Uint8Array<ArrayBuffer>> {
  const progressBar = new ProgressBar({
    total: totalSize,
    output: Deno.stderr,
  });

  let bytesSoFar = 0;
  return forEach<Uint8Array<ArrayBuffer>>(buffer => {
    bytesSoFar += buffer.byteLength;
    progressBar.render(bytesSoFar);
  });
}

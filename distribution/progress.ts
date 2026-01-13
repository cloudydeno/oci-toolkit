import ProgressBar from "@deno-library/progress";
import { forEach } from "@cloudydeno/stream-observables/transforms/for-each";
import type { ByteArray } from "@cloudydeno/docker-registry-client/types";

export function showStreamProgress(totalSize: number): TransformStream<ByteArray> {
  const progressBar = new ProgressBar({
    total: totalSize,
    output: Deno.stderr,
  });

  let bytesSoFar = 0;
  return forEach<ByteArray>(buffer => {
    bytesSoFar += buffer.byteLength;
    progressBar.render(bytesSoFar);
  });
}

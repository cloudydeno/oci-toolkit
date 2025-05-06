import { UntarStream, forEach, joinPath, dirnamePath } from "../deps.ts";

/** Streams thru a Tar archive and writes out its files underneath the given path */
export async function extractTarArchive(
  tarStream: ReadableStream<Uint8Array>,
  destPath: string,
): Promise<{
  fileCount: number;
  fileSize: number;
}> {
  let fileCount = 0;
  let fileSize = 0;
  const madeDirs = new Set<string>();
  for await (const entry of tarStream.pipeThrough(new UntarStream)) {
    if (!entry.readable) continue;

    // console.error(entry.fileName, entry.fileSize);
    const fullPath = joinPath(destPath, entry.path);

    const dirname = dirnamePath(fullPath);
    if (!madeDirs.has(dirname)) {
      await Deno.mkdir(dirname, { recursive: true });
      madeDirs.add(dirname);
    }

    fileCount++;
    await Deno.writeFile(fullPath,
      entry.readable.pipeThrough(forEach(
        x => fileSize += x.byteLength)));
  }

  return {
    fileCount,
    fileSize,
  };
}

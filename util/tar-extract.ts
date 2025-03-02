import { copy, path, readerFromIterable, Untar } from "../deps.ts";

// This is to be rewritten with a streams-based Untar

export async function extractTarArchive(tar: ReadableStream<Uint8Array>, destFolder: string) {
  const untar = new Untar(readerFromIterable(tar));

  let fileCount = 0;
  let fileSize = 0;
  const madeDirs = new Set<string>();
  for await (const entry of untar) {
    // console.error(entry.fileName, entry.fileSize);
    const fullPath = path.join(destFolder, entry.fileName);

    const dirname = path.dirname(fullPath);
    if (!madeDirs.has(dirname)) {
      await Deno.mkdir(dirname, { recursive: true });
      madeDirs.add(dirname);
    }

    const target = await Deno.open(fullPath, {
      write: true, truncate: true, create: true,
    });
    fileSize += await copy(entry, target);
    target.close();
    fileCount++;
  }

  return {
    fileCount,
    fileSize,
  };
}

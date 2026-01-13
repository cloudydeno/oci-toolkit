#!/usr/bin/env -S deno run --allow-read --allow-write=deno.json

import { expandGlob } from "jsr:@std/fs@1.0.21/expand-glob";

const contents = JSON.parse(await Deno.readTextFile('deno.json'));
contents.exports = await getExports();
await Deno.writeTextFile('deno.json', JSON.stringify(contents, null, 2) + '\n');

async function getExports(): Promise<Record<string, string>> {
  const exports: [string, string][] = [];

  const results = expandGlob("**/*.ts*", {
    includeDirs: false,
  });

  for await (const entry of results) {
    if (!entry) continue;

    const path = `./${entry.path.slice(Deno.cwd().length+1)}`;
    // const name = path.replace(/\.tsx?$/, '').replace(/\/mod$/, '');

    if (path.startsWith('./hack/')) continue;

    if (path == './mod.ts') {
      exports.push(['.', path]);
    }
    exports.push([path, path]);
  }

  exports.sort(([a], [b]) => a.localeCompare(b));

  return Object.fromEntries(exports);
}

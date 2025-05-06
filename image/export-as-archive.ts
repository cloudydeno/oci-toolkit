// make a tarball for a built artifact
// https://github.com/opencontainers/image-spec/blob/main/image-layout.md

import {
  type ManifestOCI,
  type ManifestOCIIndex,
  type ManifestV2,
  type ManifestV2List,
  MEDIATYPE_MANIFEST_LIST_V2,
  MEDIATYPE_MANIFEST_V2,
  MEDIATYPE_OCI_MANIFEST_INDEX_V1,
  MEDIATYPE_OCI_MANIFEST_V1,
  TarStream,
  TarStreamInput,
} from "../deps.ts";
import { OciStoreApi } from "../storage/api.ts";
import { sha256bytes } from "../util/digest.ts";
import { stableJsonSerialize } from "../util/json-serialize.ts";

type ExportOpts = {
  manifestDigest: string;
  destination: WritableStream<Uint8Array>;
  store: OciStoreApi;
  fullRef?: string;
  format: 'docker' | 'oci';
};

/**
 * Given a description of an OCI or Docker image,
 * stream the contents of the image to a Tar archive.
 *
 * The whole artifact can be referenced from OciStores by digest.
 * It's also possible to specify inline Manifest info,
 *   including an optional inline Config blob.
 * However all Layer blobs must be stored in the OciStores.
 *
 * When "format" is "docker", the results can be loaded with `docker load`.
 * When "format" is "oci", an OCI Image Layout is created instead.
 * Podman is supposed to be able to load OCI Image Layouts.
 * We'll also be able to load denodir artifact layouts eventually.
 */
export async function exportArtifactAsArchive(opts: ExportOpts): Promise<void> {

  const manifestBytes = await opts.store.getFullLayer('manifest', opts.manifestDigest);
  const manifestData = JSON.parse(new TextDecoder().decode(manifestBytes)) as ManifestV2 | ManifestOCI | ManifestV2List | ManifestOCIIndex;

  // When given a multi-arch manifest, pick one to use
  if (manifestData.mediaType == MEDIATYPE_OCI_MANIFEST_INDEX_V1
    || manifestData.mediaType == MEDIATYPE_MANIFEST_LIST_V2) {

    // TODO: something better, or at least reusable
    const selectedManifest = manifestData.manifests.find(archManifest => {
      const platform = archManifest.platform;
      if (!platform) return false;
      if (platform.os === 'unknown') return false;
      if (platform.architecture == 'arm64' && Deno.build.arch == 'aarch64') {
        return true;
      }
      if (platform.architecture == 'amd64' && Deno.build.arch == 'x86_64') {
        return true;
      }
    })
    if (!selectedManifest) throw new Error(
      `TODO: No suitable manifest found in multimanifest artifact`);

    return await exportArtifactAsArchive({
      ...opts,
      manifestDigest: selectedManifest.digest,
    });

  } else if (manifestData.mediaType !== MEDIATYPE_MANIFEST_V2
   && manifestData.mediaType !== MEDIATYPE_OCI_MANIFEST_V1) {
    throw new Error(`Base manifest at ${opts.manifestDigest} has unsupported mediaType`);
  }

  switch (opts.format) {
  case 'docker':
    await ReadableStream
      .from(emitAsDocker(opts, manifestData))
      .pipeThrough(new TarStream())
      .pipeTo(opts.destination);
    break;

  case 'oci':
    await ReadableStream
      .from(emitAsOCI(opts, manifestBytes, manifestData))
      .pipeThrough(new TarStream())
      .pipeTo(opts.destination);
    break;

  default:
    throw new Error(`Unsupported archive export format "${opts.format}"`);
  }
}

async function* emitAsDocker(opts: ExportOpts, manifestData: ManifestV2 | ManifestOCI): AsyncGenerator<TarStreamInput> {

  // docker can't handle non-image OCI artifacts: "invalid image JSON, no RootFS key"
  if (manifestData.config.mediaType !== "application/vnd.oci.image.config.v1+json") {
    throw new Error(`docker cannot load non-image artifacts, perhaps export to 'oci' format`);
  }

  const tarManifest = {
    Config: `${encodeDigest(manifestData.config.digest)}.json`,
    RepoTags: opts.fullRef ? [opts.fullRef] : [],
    Layers: new Array<string>(), // ['<sha256>.tar'],
  };

  yield tarBytes(tarManifest.Config,
    await opts.store.getFullLayer('blob', manifestData.config.digest));

  let parent: string | undefined = undefined;

  // Export each layer
  for (const layer of manifestData.layers) {
    const dirname = encodeDigest(layer.digest);
    const compressedSha256 = layer.digest.split(':')[1];

    tarManifest.Layers.push(dirname+'/layer.tar');
    yield {
      path: dirname+'/layer.tar',
      type: 'file',
      readable: await opts.store.getLayerStream('blob', layer.digest),
      size: layer.size,
      options: {
        mtime: 0,
        mode: 0o444,
      },
    };
    yield tarBytes(dirname+'/VERSION', new TextEncoder().encode('1.0'));
    yield tarJson(dirname+'/json', {
      id: compressedSha256,
      parent,
    });

    parent = compressedSha256;
  }

  yield tarJson('manifest.json', [tarManifest]);
  if (opts.fullRef) {
    yield tarJson('repositories', {
      [opts.fullRef.split(':')[0]]: {
        [opts.fullRef.split(':')[1]]: parent,
      },
    });
  }
}

async function* emitAsOCI(opts: ExportOpts, manifestBytes: Uint8Array, manifestData: ManifestV2 | ManifestOCI): AsyncGenerator<TarStreamInput> {
  // TODO: find a way to verify OCI image layout archive

  const manifestDigest = await sha256bytes(manifestBytes);

  yield tarJson('oci-layout', {
    "imageLayoutVersion": "1.0.0",
  });

  const tarIndex: ManifestOCIIndex = {
    schemaVersion: 2,
    manifests: [{
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      size: manifestBytes.byteLength,
      digest: `sha256:${manifestDigest}`,
      // TODO: way to specify the platform
      // platform: {
      //   os: baseConfig.os,
      //   architecture: baseConfig.architecture,
      // },
      annotations: opts.fullRef ? {
        'org.opencontainers.image.ref.name': opts.fullRef,
      } : {},
    }],
  };
  yield tarJson('index.json', [tarIndex]);

  yield tarBytes(`blobs/sha256/${manifestDigest}`, manifestBytes);

  // Config blob
  yield tarBytes(`blobs/${encodeDigest(manifestData.config.digest)}`,
    await opts.store.getFullLayer('blob', manifestData.config.digest));

  // Layer blobs
  for (const layer of manifestData.layers) {
    yield {
      path: `blobs/${encodeDigest(layer.digest)}`,
      type: 'file',
      readable: await opts.store.getLayerStream('blob', layer.digest),
      size: layer.size,
      options: {
        mtime: 0,
        mode: 0o444,
      },
    };
  }
}

function tarJson(path: string, data: unknown) {
  return tarBytes(path, stableJsonSerialize(data));
}

function tarBytes(path: string, raw: Uint8Array): TarStreamInput {
  return {
    path,
    type: 'file',
    readable: ReadableStream.from([raw]),
    size: raw.byteLength,
    options: {
      mtime: 0,
      mode: 0o444,
    },
  };
}

function encodeDigest(digest: string) {
  return digest.replaceAll(':', '/');
}

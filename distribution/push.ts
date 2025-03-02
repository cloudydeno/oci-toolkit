import {
  ManifestOCI,
  ManifestOCIIndex,
  parseRepoAndRef,
  ManifestOCIDescriptor,
} from "../deps.ts";
import { OciStoreApi } from "../storage/api.ts";
import { newRegistryStore, RegistryStore } from "../storage/providers/registry.ts";
import { showStreamProgress } from "./progress.ts";

export async function pushFullArtifact(sourceStore: OciStoreApi, manifestDigest: string, destinationRef: string, forceTag?: string) {
  const manifestRaw = await sourceStore.getFullLayer('manifest', manifestDigest);
  const manifest: ManifestOCI | ManifestOCIIndex = JSON.parse(new TextDecoder().decode(manifestRaw));

  let destination = parseRepoAndRef(destinationRef);
  if (forceTag) {
    destination = parseRepoAndRef(`${destination.canonicalName}:${forceTag}`);
  }

  const ref = destination.tag ?? destination.digest;
  if (!ref) throw 'No desired tag or digest found';

  const client = await newRegistryStore(destination, ['pull', 'push']);

  if (manifest.mediaType == 'application/vnd.oci.image.manifest.v1+json') {
    const resp = await pushFullImage({
      manifest,
      manifestRaw,
      ref,
      sourceStore,
      client,
    });
    if (resp.digest !== manifestDigest) {
      throw new Error(`Assert failed: ${resp.digest} != ${manifestDigest}`);
    }
    console.error('==>', 'Image upload complete!', resp.digest);

  } else if (manifest.mediaType == 'application/vnd.oci.image.index.v1+json') {
    for (const item of manifest.manifests) {
      const innerManifestRaw = await sourceStore.getFullLayer('manifest', item.digest);
      const innerManifest: ManifestOCI = JSON.parse(new TextDecoder().decode(innerManifestRaw));

      await pushFullImage({
        manifest: innerManifest,
        manifestRaw: innerManifestRaw,
        ref: item.digest,
        sourceStore,
        client,
      });
    }

    const resp = await client.api.putManifest({
      manifestData: manifestRaw,
      mediaType: manifest.mediaType,
      ref: ref,
    });
    if (resp.digest !== manifestDigest) {
      throw new Error(`Assert failed: ${resp.digest} != ${manifestDigest}`);
    }
    console.error('==>', 'Index upload complete!', resp.digest);

  } else throw new Error(`Unhandled manifest mediaType ${JSON.stringify(manifest.mediaType)}`);

  const descriptor: ManifestOCIDescriptor = {
    digest: manifestDigest,
    mediaType: manifest.mediaType,
    size: manifestRaw.byteLength,
  };

  return {
    destination,
    descriptor,
  }
}

export async function pushFullImage(opts: {
  sourceStore: OciStoreApi;
  manifest: ManifestOCI;
  manifestRaw: Uint8Array;
  client: RegistryStore;
  ref: string;
}) {
  for (const layer of [opts.manifest.config, ...opts.manifest.layers]) {
    if (await opts.client.hasBlob(layer.digest)) {
      console.error('   ', 'Registry already has', layer.digest);
    } else {
      console.error('   ', 'Uploading', layer.digest, '...');
      await opts.client.uploadBlob(layer, () => opts.sourceStore
        .getLayerStream('blob', layer.digest)
        .then(stream => stream
          .pipeThrough(showStreamProgress(layer.size))));
      console.error('-->', 'Layer', layer.digest, 'uploaded!');
    }
  }

  return await opts.client.api.putManifest({
    manifestData: opts.manifestRaw,
    mediaType: opts.manifest.mediaType,
    ref: opts.ref,
  });
}

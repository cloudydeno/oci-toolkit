import {
  MEDIATYPE_MANIFEST_LIST_V2,
  MEDIATYPE_MANIFEST_V2,
  MEDIATYPE_OCI_MANIFEST_INDEX_V1,
  MEDIATYPE_OCI_MANIFEST_V1,
  parseRepoAndRef,
  type Manifest,
  type ManifestOCI,
  type ManifestOCIDescriptor,
  type ManifestOCIIndex,
  type ManifestV2,
  type RegistryImage,
  type RegistryRepo,
} from "../deps.ts";
import { OciStoreApi } from "../storage/api.ts";
import { newRegistryStore } from "../storage/providers/registry.ts";
import { showStreamProgress } from "./progress.ts";

export async function pullFullArtifact(store: OciStoreApi, reference: string): Promise<{
  descriptor: ManifestOCIDescriptor;
  reference: RegistryImage;
}> {

  const rar = parseRepoAndRef(reference);
  const ref = rar.tag ?? rar.digest;
  if (!ref) throw 'No desired tag or digest found';

  const puller = await ArtifactPuller.makeForReference(store, rar);

  const descriptor = await puller.resolveRef(ref);

  return {
    descriptor: await puller.pullArtifact(descriptor),
    reference: rar,
  };
}

class ArtifactPuller {
  constructor(
    private readonly sourceStore: OciStoreApi,
    private readonly targetStore: OciStoreApi,
    public readonly image: RegistryRepo,
  ) {}

  static async makeForReference(targetStore: OciStoreApi, image: RegistryRepo): Promise<ArtifactPuller> {
    const client = await newRegistryStore(image, ['pull']);
    return new ArtifactPuller(client, targetStore, image);
  }

  async readManifest(digestOrTag: string): Promise<{
    bytes: Uint8Array;
    json: Manifest;
}> {
    const blob = await this.sourceStore.getFullLayer('manifest', digestOrTag);
    const json: Manifest = JSON.parse(new TextDecoder().decode(blob));
    return {bytes: blob, json};
  }

  async resolveRef(ref: string): Promise<ManifestOCIDescriptor> {
    const stat = await this.sourceStore.describeManifest(ref);
    if (!stat?.digest) throw new Error(`Failed to resolve remote ref ${ref}`);
    return stat;
  }

  async pullArtifact(descriptor: ManifestOCIDescriptor): Promise<ManifestOCIDescriptor> {
    if (descriptor.mediaType == MEDIATYPE_MANIFEST_LIST_V2
        || descriptor.mediaType == MEDIATYPE_OCI_MANIFEST_INDEX_V1) {
      return await this.pullList(descriptor);
    }

    if (descriptor.mediaType != MEDIATYPE_OCI_MANIFEST_V1
        && descriptor.mediaType != MEDIATYPE_MANIFEST_V2) {
      throw new Error(`Received manifest of unsupported type "${descriptor.mediaType}. Is this actually a Denodir artifact, or just a normal Docker image?`);
    }

    return await this.pullImage(descriptor);
  }

  async pullList(descriptor: ManifestOCIDescriptor): Promise<ManifestOCIDescriptor> {
    const manifest = await this.readManifest(descriptor.digest);

    const indexManifest = manifest.json as ManifestOCIIndex;
    for (const childManifest of indexManifest.manifests) {
      await this.pullImage(childManifest);
    }

    const result = await this.targetStore.putLayerFromBytes('manifest', {
      mediaType: manifest.json.mediaType ?? descriptor.mediaType,
      digest: descriptor.digest,
      annotations: {
        ...descriptor.annotations,
        'vnd.denodir.origin': this.image.canonicalName ?? '',
      },
    }, manifest.bytes);

    console.error('==>', `Pull of ${indexManifest.manifests.length} images complete!`, descriptor.digest);
    return result;
  }

  async pullImage(descriptor: ManifestOCIDescriptor): Promise<ManifestOCIDescriptor> {
    const manifest = await this.readManifest(descriptor.digest);

    const manifestMediaType = manifest.json.mediaType ?? descriptor.mediaType;
    if (manifestMediaType != MEDIATYPE_OCI_MANIFEST_V1
        && manifestMediaType != MEDIATYPE_MANIFEST_V2) {
      throw new Error(`Received manifest of unsupported type "${manifestMediaType}". Is this actually a normal container image?`);
    }
    const manifestJson = manifest.json as ManifestV2 | ManifestOCI;

    for (const layer of [manifestJson.config, ...manifestJson.layers]) {
      const layerStat = await this.targetStore.statLayer('blob', layer.digest);
      if (layerStat) {
        if (layerStat.size !== layer.size) {
          throw new Error(`Digest ${layer.digest} clashed (size: ${layerStat.size} vs ${layer.size}). This isn't supposed to happen`);
        }
        console.error('   ', 'Layer', layer.digest, 'is already present on disk');
      } else {
        console.error('   ', 'Need to download', layer.digest, '...');
        await this.targetStore.putLayerFromStream('blob', layer, await this.sourceStore
          .getLayerStream('blob', layer.digest)
          .then(stream => stream
            .pipeThrough(showStreamProgress(layer.size))));
        console.error('-->', 'Layer', layer.digest, 'downloaded!');
      }
    }

    const result = await this.targetStore.putLayerFromBytes('manifest', {
      mediaType: manifestMediaType,
      digest: descriptor.digest,
      annotations: {
        ...descriptor.annotations,
        'vnd.denodir.origin': this.image.canonicalName ?? '',
      },
    }, manifest.bytes);

    console.error('==>', 'Pull complete!', descriptor.digest);
    return result;
  }
}

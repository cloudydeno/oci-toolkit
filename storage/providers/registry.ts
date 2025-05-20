import {
  RegistryClientV2,
  RegistryHttpError,
  type ManifestOCIDescriptor,
  type RegistryClientOpts,
  type RegistryRepo,
} from "@cloudydeno/docker-registry-client";

import { fetchDockerCredential } from "../../util/docker-credentials.ts";
import { sha256bytes } from "../../util/digest.ts";
import type { OciStoreApi } from "../api.ts";

/** Simple API around an OCI / Docker registry. */
export class RegistryStore implements OciStoreApi {
  constructor(
    public readonly api: RegistryClientV2,
  ) {}

  async hasBlob(digest: string): Promise<boolean> {
    return await this.api
      .headBlob({ digest })
      .catch(nullIf404)
      .then(x => !!x);
  }

  async uploadBlob(
    layer: ManifestOCIDescriptor,
    streamFactory: () => Promise<ReadableStream<Uint8Array>>,
  ): Promise<void> {
    await this.api.blobUpload({
      digest: layer.digest,
      contentLength: layer.size,
      stream: await streamFactory(),
    });
  }

  async getBlobStream(digest: string): Promise<ReadableStream<Uint8Array>> {
    const bundle = await this.api.createBlobReadStream({digest});
    return bundle.stream;
  }


  putLayerFromFile(_flavor: "blob"|"manifest", _descriptor: ManifestOCIDescriptor, _sourcePath: string): Promise<ManifestOCIDescriptor> {
    throw new Error("Method not implemented.");
  }
  putLayerFromStream(_flavor: "blob"|"manifest", _descriptor: ManifestOCIDescriptor, _stream: ReadableStream<Uint8Array>): Promise<ManifestOCIDescriptor> {
    throw new Error("Method not implemented.");
  }
  async putLayerFromBytes(flavor: "blob"|"manifest",descriptor: Omit<ManifestOCIDescriptor,"digest"|"size">&{ digest?: string|undefined; },rawData: Uint8Array): Promise<ManifestOCIDescriptor> {
    if (flavor == 'blob') {
      const digest = descriptor.digest ?? `sha256:${await sha256bytes(rawData)}`;
      const fullDescriptor: ManifestOCIDescriptor = {
        ...descriptor,
        digest,
        size: rawData.byteLength,
      };
      await this.uploadBlob(fullDescriptor, () => Promise.resolve(ReadableStream.from([rawData])));
      return fullDescriptor;
    } else if (flavor == 'manifest') {
      // TODO
    }
    throw new Error(`TODO: putLayerFromBytes for flavor "${flavor}" is not implemented.`);
  }
  async statLayer(flavor: "blob"|"manifest", ref: string): Promise<{ size: number; digest: string }|null> {
    if (flavor == 'blob') {
      const resp = await this.api.headBlob({ digest: ref });
      console.log({headers:resp[0].headers})
      throw new Error("Method not implemented.");
    }
    if (flavor == 'manifest') {
      // TODO: this should only be a HEAD request; needs library support
      const {resp} = await this.api.getManifest({ ref });
      const contentLength = resp.headers.get('content-length');
      const contentDigest = resp.headers.get('docker-content-digest');
      if (!contentLength || !contentDigest) throw new Error(`Registry didn't give length/digest`);
      return {
        size: parseInt(contentLength),
        digest: contentDigest,
      };
    }
    throw new Error("Flavor not implemented.");
  }

  async describeManifest(reference: string): Promise<ManifestOCIDescriptor> {
    // TODO: Fix up library support for manifest head (aka resolving a tag)
    await this.api.login();
    //@ts-expect-error private field
    const headers = new Headers(this.api._headers);
    headers.set('accept', [
      'application/vnd.docker.distribution.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.v1+prettyjws',
      'application/vnd.docker.distribution.manifest.v2+json',
      'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
      'application/vnd.oci.image.index.v1+json',
    ].join(','));
    const [resp] = await this.api._makeHttpRequest({
      method: 'HEAD',
      path: `/v2/${encodeURI(this.api.repo.remoteName ?? '')}/manifests/${encodeURI(reference)}`,
      headers: headers
    });

    const contentType = resp.headers.get('content-type');
    const contentLength = resp.headers.get('content-length');
    const contentDigest = resp.headers.get('docker-content-digest');
    if (!contentType || !contentLength || !contentDigest) throw new Error(
      `Registry didn't give type/length/digest headers for ${reference}`);

    return {
      mediaType: contentType,
      size: parseInt(contentLength),
      digest: contentDigest,
    };
  }

  async getFullLayer(flavor: "blob"|"manifest",digest: string): Promise<Uint8Array> {
    if (flavor == 'blob') {
      const resps = await this.api._headOrGetBlob('GET', digest)
      return resps.slice(-1)[0].dockerBody();
    }
    if (flavor == 'manifest') {
      const { resp } = await this.api.getManifest({
        ref: digest,
        acceptOCIManifests: true,
        acceptManifestLists: true,
      });
      return await resp.dockerBody();
    }
    throw new Error("Flavor not implemented.");
  }
  async getLayerStream(flavor: "blob"|"manifest",digest: string): Promise<ReadableStream<Uint8Array>> {
    if (flavor == 'blob') {
      const bundle = await this.api.createBlobReadStream({digest});
      return bundle.stream;
    }
    throw new Error("Flavor not implemented.");
  }
}

function nullIf404(err: unknown) {
  if (err instanceof RegistryHttpError && err.resp.status == 404) return null;
  throw err;
}


export async function newRegistryStore(repo: RegistryRepo, scopes: Array<'pull' | 'push'>): Promise<RegistryStore> {
  const config: RegistryClientOpts = {
    repo, scopes,
    acceptOCIManifests: true,
    acceptManifestLists: true,
  };

  const credential = await fetchDockerCredential(repo.index.name);
  if (credential) {
    config.username = credential.Username;
    config.password = credential.Secret;
  }

  // Workaround for https://github.com/denoland/deno/issues/27830
  // Trigger is response headers size when initializing blob uploads
  if (repo.index.name.endsWith('.pkg.dev') && scopes.includes('push')) {
    config.client = Deno.createHttpClient({ http2: false });
  }

  console.error('-->', 'Creating OCI client for', repo.index.name,
    'for', scopes, 'as', config.username);
  const apiClient = new RegistryClientV2(config);
  return new RegistryStore(apiClient);
}

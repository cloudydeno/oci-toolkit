import type { ManifestOCI, ManifestOCIDescriptor } from "@cloudydeno/docker-registry-client";

export const DescriptorEmptyJSON: ManifestOCIDescriptor & {data: 'e30='} = {
  "mediaType": "application/vnd.oci.empty.v1+json",
  "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
  "size": 2,
  "data": "e30=",
};

export class OciManifestBuilder {
  setConfig(descriptor: ManifestOCIDescriptor): void {
    this.data.config = descriptor;
  }
  addLayer(descriptor: ManifestOCIDescriptor): void {
    this.data.layers.push(descriptor);
  }
  async writeBlob(props: { mediaType: string; content: Uint8Array; }): Promise<ManifestOCIDescriptor> {
    const hash = await sha256bytes(props.content);
    const descriptor: ManifestOCIDescriptor = {
      mediaType: props.mediaType,
      size: props.content.byteLength,
      digest: `sha256:${hash}`,
    };
    this.blobs.set(descriptor.digest, {
      descriptor,
      bytes: props.content,
    });
    return descriptor;
  }
  setAnnotation(key: string, value: string): void {
    this.data.annotations[key] = value;
  }

  public readonly data: Required<ManifestOCI> = {
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    schemaVersion: 2,
    config: DescriptorEmptyJSON, // placeholder, to be filled in
    layers: [],
    annotations: {},
  };

  public readonly blobs: Map<string, {
    descriptor: ManifestOCIDescriptor;
    bytes: Uint8Array;
  }> = new Map;
}

async function sha256bytes(message: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', message);
  return bytesToHex(hash);
}
function bytesToHex(data: ArrayBuffer) {
  return [...new Uint8Array(data)]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

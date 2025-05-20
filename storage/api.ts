import type {
  ManifestOCIDescriptor,
} from "@cloudydeno/docker-registry-client";

export interface OciStoreApi {

  putLayerFromFile(
    flavor: 'blob' | 'manifest',
    descriptor: ManifestOCIDescriptor,
    sourcePath: string,
  ): Promise<ManifestOCIDescriptor>;

  putLayerFromStream(
    flavor: 'blob' | 'manifest',
    descriptor: ManifestOCIDescriptor,
    stream: ReadableStream<Uint8Array>,
  ): Promise<ManifestOCIDescriptor>;

  putLayerFromBytes(
    flavor: 'blob' | 'manifest',
    descriptor: Omit<ManifestOCIDescriptor, 'digest' | 'size'> & { digest?: string },
    rawData: Uint8Array,
  ): Promise<ManifestOCIDescriptor>;

  statLayer(flavor: 'blob' | 'manifest', digest: string): Promise<{
    size: number;
  } | null>;

  describeManifest(reference: string): Promise<ManifestOCIDescriptor>;

  getFullLayer(flavor: 'blob' | 'manifest', digest: string): Promise<Uint8Array>;

  getLayerStream(flavor: 'blob' | 'manifest', digest: string): Promise<ReadableStream<Uint8Array>>;
}

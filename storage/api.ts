import type {
  ManifestOCIDescriptor,
} from "@cloudydeno/docker-registry-client";

export type ByteArray = Uint8Array<ArrayBuffer>;

export interface OciStoreApi {

  putLayerFromFile(
    flavor: 'blob' | 'manifest',
    descriptor: ManifestOCIDescriptor,
    sourcePath: string,
  ): Promise<ManifestOCIDescriptor>;

  putLayerFromStream(
    flavor: 'blob' | 'manifest',
    descriptor: ManifestOCIDescriptor,
    stream: ReadableStream<ByteArray>,
  ): Promise<ManifestOCIDescriptor>;

  putLayerFromBytes(
    flavor: 'blob' | 'manifest',
    descriptor: Omit<ManifestOCIDescriptor, 'digest' | 'size'> & { digest?: string },
    rawData: ByteArray,
  ): Promise<ManifestOCIDescriptor>;

  statLayer(flavor: 'blob' | 'manifest', digest: string): Promise<{
    size: number;
  } | null>;

  describeManifest(reference: string): Promise<ManifestOCIDescriptor>;

  getFullLayer(flavor: 'blob' | 'manifest', digest: string): Promise<ByteArray>;

  getLayerStream(flavor: 'blob' | 'manifest', digest: string): Promise<ReadableStream<ByteArray>>;
}

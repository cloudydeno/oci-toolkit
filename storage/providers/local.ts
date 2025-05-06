import {
  assertEquals,
  ManifestOCIDescriptor,
  joinPath,
} from "../../deps.ts";
import { OciStoreApi } from "../api.ts";
import { sha256bytes } from "../../util/digest.ts";

export class LocalStore implements OciStoreApi {
  /** @param identifier Either a keyword for isolated storage in the user's homedir,
   * or a relative path (./) for storage within the working directory. */
  constructor(
    readonly identifier = 'storage',
  ) {
    this.rootPath = identifier.startsWith('./')
      ? identifier
      : joinPath(
        Deno.env.get('HOME') ?? '.',
        '.local', 'share', 'deno-oci-toolkit',
        this.identifier);
  }
  public readonly rootPath: string;

  async init(): Promise<void> {
    await Deno.mkdir(joinPath(this.rootPath, 'blobs', 'sha256'), {recursive: true});
    await Deno.mkdir(joinPath(this.rootPath, 'manifests', 'sha256'), {recursive: true});
    // await Deno.mkdir(joinPath(this.rootPath, 'references'), {recursive: true});
  }

  describeManifest(_reference: string): Promise<ManifestOCIDescriptor> {
    throw new Error("Method not implemented.");
  }

  async putLayerFromFile(
    flavor: 'blob' | 'manifest',
    descriptor: ManifestOCIDescriptor,
    sourcePath: string,
  ): Promise<ManifestOCIDescriptor> {
    const [digestType, digestValue] = descriptor.digest.split(':');
    const layerPath = joinPath(this.rootPath, `${flavor}s`, digestType, digestValue);
    const layerStat = await Deno.stat(layerPath)
      .catch(err => err instanceof Deno.errors.NotFound ? null : Promise.reject(err));

    if (!layerStat) {
      await Deno.copyFile(sourcePath, layerPath);
    } else if (layerStat.size !== descriptor.size) {
      throw new Error(`Digest ${descriptor.digest} clashed (size: ${layerStat.size} vs ${descriptor.size}). This isn't supposed to happen`);
    }

    return descriptor;
  }

  async putLayerFromStream(
    flavor: 'blob' | 'manifest',
    descriptor: ManifestOCIDescriptor,
    stream: ReadableStream<Uint8Array>,
  ): Promise<ManifestOCIDescriptor> {
    const [digestType, digestValue] = descriptor.digest.split(':');
    const layerPath = joinPath(this.rootPath, `${flavor}s`, digestType, digestValue);

    const target = await Deno.open(layerPath, {
      write: true, truncate: true, create: true,
    });
    await stream.pipeTo(target.writable);

    return descriptor;
  }

  async putLayerFromBytes(
    flavor: 'blob' | 'manifest',
    descriptor: Omit<ManifestOCIDescriptor, 'digest' | 'size'> & { digest?: string },
    rawData: Uint8Array
  ): Promise<ManifestOCIDescriptor> {
    const size = rawData.byteLength;
    const digest = `sha256:${await sha256bytes(rawData)}`;

    if (descriptor.digest) {
      assertEquals(digest, descriptor.digest);
    }

    const [digestType, digestValue] = digest.split(':');
    const layerPath = joinPath(this.rootPath, `${flavor}s`, digestType, digestValue);
    const layerStat = await Deno.stat(layerPath)
      .catch(err => err instanceof Deno.errors.NotFound ? null : Promise.reject(err));

    if (!layerStat) {
      await Deno.writeFile(layerPath, rawData);
    } else if (layerStat.size !== size) {
      throw new Error(`Digest ${digest} clashed (size: ${layerStat.size} vs ${size}). This isn't supposed to happen`);
    }

    return {
      ...descriptor,
      digest, size,
    }
  }

  async statLayer(flavor: 'blob' | 'manifest', digest: string): Promise<{
    size: number;
} | null> {
    const [digestType, digestValue] = digest.split(':');
    const layerPath = joinPath(this.rootPath, `${flavor}s`, digestType, digestValue);

    return await Deno.stat(layerPath)
      .catch(err => err instanceof Deno.errors.NotFound ? null : Promise.reject(err));
  }

  async getFullLayer(flavor: 'blob' | 'manifest', digest: string): Promise<Uint8Array> {
    const [digestType, digestValue] = digest.split(':');
    assertEquals(digestType, 'sha256');
    const layerPath = joinPath(this.rootPath, `${flavor}s`, digestType, digestValue);

    return await Deno.readFile(layerPath)
      .catch(cause => {
        if (cause instanceof Deno.errors.NotFound) throw new Deno.errors.NotFound(
          `Local ${flavor} with digest ${digest} not found.`, { cause });
        throw cause;
      });
  }

  async getLayerStream(flavor: 'blob' | 'manifest', digest: string): Promise<ReadableStream<Uint8Array>> {
    const [digestType, digestValue] = digest.split(':');
    const layerPath = joinPath(this.rootPath, `${flavor}s`, digestType, digestValue);

    return await Deno.open(layerPath, {read: true})
      .then(x => x.readable)
      .catch(cause => {
        if (cause instanceof Deno.errors.NotFound) throw new Deno.errors.NotFound(
          `Local ${flavor} with digest ${digest} not found.`, { cause });
        throw cause;
      });
  }
}

export async function newLocalStore(identifier?: string): Promise<LocalStore> {
  const store = new LocalStore(identifier);
  await store.init();
  return store;
}

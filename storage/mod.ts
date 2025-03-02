export type { OciStoreApi } from "./api.ts";
export { OciRegistry, newRegistryStore } from "./providers/registry.ts";
export { OciStoreInmem, newInMemoryStore } from "./providers/in-memory.ts";
export { OciStoreLocal, newLocalStore } from "./providers/local.ts";
export { StackedStore, createStackedStore } from "./providers/stacked.ts";

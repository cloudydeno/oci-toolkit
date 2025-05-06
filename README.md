# `@cloudydeno/oci-toolkit` on JSR
A collection of classes and routines for leveraging OCI artifacts and registries.

Versions `0.1.x` are published at `/x/oci_toolkit` instead of JSR.

## Functionality
* Access and store OCI manifests and blobs on disk, in memory, or on a Docker registry
* Pull and push whole artifacts (images or indexes) from Docker registries
* Author an OCI manifest or an image config with builder functions
* Export whole artifacts as OCI or Docker tar archives
* Also exposes a handful of hodge-podge `util/` modules

## TODO
* Efficient server-to-server copies
  * Usecase: denodir-oci 'ejection' (stacking local layer onto existing image) to remote registry without downloading base image
  * Need to decide an API for consumers to bring in remote blobs from code.
  * Could use a `StackedStore` to expose the blobs, but we also need to detect remote-to-remote blobs within the push routine in order to optimistically request a server-to-server transfer.
* Pull and and push layers in parallel
  * Limited to 5 or so in parallel
  * The progress library has a `MultiProgress` implementation for CLI invocations.

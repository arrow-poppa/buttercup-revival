// Firefox's chrome namespace uses callbacks; the shared modules use promises.
// This file is included only in the Gecko build, before any shared scripts.
globalThis.chrome = browser;

import packageJson = require("@morpho-org/midnight-sdk/package.json");

/**
 * Exact package version sent to the Midnight API through the `sdk-version`
 * request header.
 *
 * @example
 * ```ts
 * import { MIDNIGHT_SDK_VERSION } from "@morpho-org/midnight-sdk";
 *
 * console.log(MIDNIGHT_SDK_VERSION);
 * ```
 */
export const MIDNIGHT_SDK_VERSION = packageJson.version;

import { type Address, getAddress, type Hex } from "viem";

/**
 * Canonical address of the `ecrecover` precompile — `0x…0001` on every EVM
 * chain. Installing a state-override `code` here replaces signature recovery
 * for the simulated bundle, which is how {@link buildEcrecoverShimCode} fakes a
 * signer (see `SimulateParams.ecrecoverOverride`).
 */
export const ECRECOVER_PRECOMPILE_ADDRESS =
  "0x0000000000000000000000000000000000000001" as const;

/**
 * Address the real `ecrecover` precompile is relocated to when the shim takes
 * over `0x…0001`. `eth_simulateV1`'s `movePrecompileToAddress` (and Tenderly's
 * equivalent) preserves the genuine precompile here so a backend can keep it
 * reachable; standard contracts call `0x…0001` directly and therefore hit the
 * shim regardless. The sentinel spells `ec1ec` to read as "ecrec".
 */
export const ECRECOVER_RELOCATED_ADDRESS =
  "0x00000000000000000000000000000000000ec1ec" as const;

/**
 * Build the runtime bytecode for an `ecrecover` shim that ignores its calldata
 * and always returns `owner`, ABI-encoded as a left-padded 32-byte word — the
 * exact shape genuine `ecrecover` returns. Overriding the precompile's `code`
 * with this makes any signature-gated path (e.g. EIP-2612 `permit`) validate
 * against `owner` without a real signature, which is what
 * `SimulateParams.ecrecoverOverride` wires into both simulation backends.
 *
 * The bytecode is `PUSH20 <owner>; PUSH1 0x00; MSTORE; PUSH1 0x20; PUSH1 0x00;
 * RETURN` — `0x73 <owner> 6000 52 6020 6000 f3`.
 *
 * @param owner - The address every recovery should resolve to. Normalized with
 *   `getAddress`, so any casing is accepted.
 * @returns The shim's runtime bytecode as a `Hex` string.
 * @throws {InvalidAddressError} (from viem `getAddress`) when `owner` is not a
 *   valid address.
 * @example
 * ```ts
 * import { buildEcrecoverShimCode } from "@morpho-org/evm-simulation";
 *
 * buildEcrecoverShimCode("0x1111111111111111111111111111111111111111");
 * // "0x73111111111111111111111111111111111111111160005260206000f3"
 * ```
 */
export function buildEcrecoverShimCode(owner: Address): Hex {
  const word = getAddress(owner).slice(2).toLowerCase();
  return `0x73${word}60005260206000f3`;
}

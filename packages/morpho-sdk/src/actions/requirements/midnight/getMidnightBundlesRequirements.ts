import { MathLib } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddresses } from "@morpho-org/morpho-ts";
import {
  type Address,
  bytesToHex,
  type Client,
  erc20Abi,
  hexToBigInt,
  isAddressEqual,
} from "viem";
import { readContract } from "viem/actions";
import { validateChainId } from "../../../helpers/index.js";
import {
  type ActionRequirement,
  CryptoUnavailableError,
} from "../../../types/index.js";
import { encodeErc20Permit } from "../encode/index.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";
import { encodeMidnightBundlesPermit2Transfer } from "./encodeMidnightBundlesPermit2Transfer.js";

/** Parameters for {@link getMidnightBundlesRequirements}. */
export type GetMidnightBundlesRequirementsParams =
  | {
      readonly viemClient: Client;
      readonly chainId: number;
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
      readonly amount: bigint;
      readonly supportDeployless?: boolean;
      readonly supportSignature: false;
    }
  | {
      readonly viemClient: Client;
      readonly chainId: number;
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
      readonly amount: bigint;
      readonly supportDeployless?: boolean;
      readonly supportSignature: true;
      /**
       * Prefer the ERC-2612 simple-permit path when the SDK detects support.
       * Leave unset or set to `false` to force the Permit2 fallback when a token is known to be
       * incompatible despite passing the SDK's shallow `nonces(owner)` probe.
       */
      readonly useSimplePermit?: boolean;
    };

/**
 * Resolves token-pull prerequisites for Midnight bundle calls.
 *
 * Reads the user's direct ERC-20 allowance to the Midnight bundle, then picks one of three flows:
 *
 * 1. **`supportSignature: false`** - classic ERC-20 `approve` transaction to the Midnight bundle.
 * 2. **`supportSignature: true` + EIP-2612 nonce detected + `useSimplePermit`** - single permit
 *    signature against the token itself, except for DAI's non-standard permit shape.
 * 3. **`supportSignature: true`, default** - Permit2 SignatureTransfer: optional ERC-20 approval
 *    to Permit2, followed by a one-shot Permit2 signature scoped to the Midnight bundle spender.
 *
 * The simple-permit compatibility check is intentionally shallow: the SDK only verifies that
 * `nonces(owner)` is readable, and excludes DAI. Leaving `useSimplePermit` unset, or passing
 * `false`, is the caller escape hatch for tokens that expose `nonces` but are still incompatible
 * with the SDK's ERC-2612 encoder. This opt-out has proven useful in the past, but the SDK does
 * not encode a token-specific example here. DAI is handled as a built-in version of that
 * incompatibility: it exposes `nonces(owner)` but is always routed to Permit2 SignatureTransfer
 * or classic approval instead of DAI-specific permit signing.
 *
 * @param params - Requirement resolution parameters.
 * @param params.useSimplePermit - When `supportSignature` is `true`, prefer EIP-2612 permit if
 *   the `nonces(owner)` probe detects support. Leave unset or pass `false` to force the Permit2
 *   fallback for tokens known to be incompatible despite passing that probe.
 * @returns Ordered approval transactions and/or signature requirements for the bundle token pull.
 * @throws {ChainIdMismatchError} when the viem client is connected to another chain.
 * @throws {CryptoUnavailableError} when the runtime crypto API is unavailable for Permit2 nonce generation.
 * @example
 * ```ts
 * import { getMidnightBundlesRequirements } from "@morpho-org/morpho-sdk";
 *
 * const requirements = await getMidnightBundlesRequirements({
 *   viemClient: client,
 *   chainId: 1,
 *   token: loanToken,
 *   owner: user,
 *   spender: midnightBundles,
 *   amount: 1_000_000n,
 *   supportSignature: true,
 * });
 * ```
 */
export const getMidnightBundlesRequirements = async (
  params: GetMidnightBundlesRequirementsParams,
): Promise<readonly ActionRequirement[]> => {
  validateChainId(params.viemClient.chain?.id, params.chainId);

  if (params.amount === 0n) return [];

  const directAllowance = await readContract(params.viemClient, {
    address: params.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [params.owner, params.spender],
  });

  if (directAllowance >= params.amount) return [];

  if (params.supportSignature) {
    const chainAddresses = getChainAddresses(params.chainId);
    const supportSimplePermit =
      params.useSimplePermit === true &&
      (chainAddresses.dai == null ||
        !isAddressEqual(params.token, chainAddresses.dai));

    if (supportSimplePermit) {
      const nonce = await readContract(params.viemClient, {
        address: params.token,
        abi: erc2612Abi,
        functionName: "nonces",
        args: [params.owner],
      }).catch(() => undefined);

      if (nonce !== undefined) {
        return [
          await encodeErc20Permit(params.viemClient, {
            token: params.token,
            spender: params.spender,
            amount: params.amount,
            chainId: params.chainId,
            nonce,
            supportDeployless: params.supportDeployless,
          }),
        ];
      }
    }

    if (chainAddresses.permit2 != null) {
      const permit2Allowance = await readContract(params.viemClient, {
        address: params.token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [params.owner, chainAddresses.permit2],
      });
      const nonceBytes = new Uint8Array(32);
      if (globalThis.crypto?.getRandomValues == null) {
        throw new CryptoUnavailableError("Permit2 unordered nonce generation");
      }
      globalThis.crypto.getRandomValues(nonceBytes);
      const nonce = hexToBigInt(bytesToHex(nonceBytes));

      return [
        ...getRequirementsApproval({
          address: params.token,
          chainId: params.chainId,
          args: {
            spender: chainAddresses.permit2,
            spendAmount: params.amount,
            approvalAmount: MathLib.MAX_UINT_160,
          },
          allowances: permit2Allowance,
        }),
        encodeMidnightBundlesPermit2Transfer({
          token: params.token,
          spender: params.spender,
          amount: params.amount,
          chainId: params.chainId,
          nonce,
        }),
      ];
    }
  }

  return getRequirementsApproval({
    address: params.token,
    chainId: params.chainId,
    args: {
      spender: params.spender,
      spendAmount: params.amount,
      approvalAmount: params.amount,
    },
    allowances: directAllowance,
  });
};

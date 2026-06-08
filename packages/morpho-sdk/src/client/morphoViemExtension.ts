import { type MarketParams, MarketUtils } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { MorphoBlue, MorphoVaultV1, MorphoVaultV2 } from "../entities/index.js";
import {
  MarketIdMismatchError,
  type Metadata,
  type MorphoClientType,
} from "../types/index.js";

/**
 * Builds the stateless `morpho` namespace exposed on an extended viem client. Wraps the supplied
 * viem `Client` plus a frozen options bag and exposes factory methods for the protocol entities.
 *
 * Holds no state beyond configuration: no cache, no `init()`, no warm-up. Each factory call
 * (`vaultV1`, `vaultV2`, `blue`) returns a fresh entity bound to this client.
 *
 * @internal
 */
function createMorphoNamespace(
  viemClient: Client,
  options?: {
    readonly supportSignature?: boolean;
    readonly supportDeployless?: boolean;
    readonly metadata?: Metadata;
  },
): MorphoClientType {
  const namespace: MorphoClientType = {
    viemClient,
    options: deepFreeze({
      ...options,
      metadata:
        options?.metadata === undefined ? undefined : { ...options.metadata },
      supportSignature: options?.supportSignature ?? false,
      supportDeployless: options?.supportDeployless,
    }),

    vaultV1(vault: Address, chainId: number) {
      return new MorphoVaultV1(namespace, vault, chainId);
    },

    vaultV2(vault: Address, chainId: number) {
      return new MorphoVaultV2(namespace, vault, chainId);
    },

    blue(marketParams: MarketParams, chainId: number) {
      const derivedId = MarketUtils.getMarketId(marketParams);
      // Can happen with one-time/hardcoded/agent-written possibly inconsistent input market params.
      if (marketParams.id !== derivedId) {
        throw new MarketIdMismatchError(marketParams.id, derivedId);
      }
      return new MorphoBlue(namespace, marketParams, chainId);
    },
  };

  return namespace;
}

/**
 * Returns a viem `extend(...)` function that adds a stateless `morpho` namespace to a viem client.
 * The namespace rides on top of the same client (one transport / chain / account) and exposes the
 * protocol entity factories under `client.morpho`, so reads and writes share one client.
 *
 * Holds no state beyond configuration: no cache, no `init()`, no warm-up. Each factory call
 * (`client.morpho.vaultV1`, `vaultV2`, `blue`) returns a fresh entity bound to the client.
 *
 * @param _options - Optional SDK-wide options forwarded to the `morpho` namespace.
 * @param _options.metadata - Optional analytics metadata applied to every transaction the
 *   `morpho` namespace builds.
 * @param _options.supportSignature - Whether the integrator can collect EIP-712 signatures for
 *   permit / permit2. Defaults to `false` (classic approvals only).
 * @param _options.supportDeployless - Whether entity fetchers may use deployless multicall.
 * @returns A viem extension function — `client.extend(morphoViemExtension(...))` adds
 *   `client.morpho`.
 * @example
 * ```ts
 * import { createWalletClient, http, publicActions } from "viem";
 * import { mainnet } from "viem/chains";
 * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
 *
 * const client = createWalletClient({
 *   chain: mainnet,
 *   transport: http(),
 *   account: user,
 * })
 *   .extend(publicActions)
 *   .extend(morphoViemExtension({ supportSignature: true }));
 *
 * // Native viem reads and Morpho factories share the same client:
 * const block = await client.getBlockNumber();
 * const vault = client.morpho.vaultV1(vaultAddress, 1);
 * const vaultData = await vault.getData();
 * const { buildTx } = vault.deposit({
 *   amount: 1_000_000n,
 *   userAddress: user,
 *   vaultData,
 * });
 * const tx = buildTx();
 * ```
 */
export function morphoViemExtension(_options?: {
  readonly metadata?: Metadata;
  readonly supportSignature?: boolean;
  readonly supportDeployless?: boolean;
}) {
  return <TClient extends Client>(client: TClient) => {
    return {
      morpho: createMorphoNamespace(client, _options),
    };
  };
}

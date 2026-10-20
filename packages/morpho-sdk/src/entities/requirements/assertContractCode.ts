import type { AddressLabel } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { getBytecode } from "viem/actions";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import {
  ChainIdMismatchError,
  MissingContractCodeError,
} from "../../types/index.js";

/**
 * Asserts that a configured contract address holds deployed code on the client's chain.
 *
 * A call to a code-less address succeeds on-chain as a no-op, so entity flows check each
 * registered target before returning requirements. The `eth_getCode` read runs at the
 * client's default block; transport failures propagate unwrapped because they are
 * infrastructure failures, not configuration failures.
 *
 * @param client - Connected viem client used for the `eth_getCode` read.
 * @param params - Assertion parameters.
 * @param params.address - Contract address expected to hold code.
 * @param params.chainId - Chain id the flow targets, reported on the error.
 * @param params.role - Registry label naming the address's role in the flow.
 * @returns Nothing when the address holds code.
 * @throws {MissingContractCodeError} when the address has no deployed bytecode.
 * @throws {viem.BaseError} when the `eth_getCode` read itself fails.
 * @internal
 */
export const assertContractCode = async (
  client: Client,
  params: {
    readonly address: Address;
    readonly chainId: number;
    readonly role: AddressLabel;
  },
): Promise<void> => {
  const bytecode = await getBytecode(client, { address: params.address });
  if (bytecode === undefined || bytecode === "0x") {
    throw new MissingContractCodeError(
      params.address,
      params.chainId,
      params.role,
    );
  }
};

/**
 * Asserts that each distinct target in a flow's write-surface list holds code.
 *
 * One `eth_getCode` per distinct address runs before any other requirement read.
 * A wrong-chain RPC reports no code at every target, so on the first
 * {@link MissingContractCodeError} a single `eth_chainId` probe decides: a served
 * chain mismatch surfaces as {@link ChainIdMismatchError} (never as missing
 * code), a failed probe keeps the original missing-code error, and a matching
 * chain rethrows it unchanged. Other assertion errors propagate unwrapped.
 *
 * @param client - Connected viem client used for the `eth_getCode` reads.
 * @param chainId - Chain id the flow targets, reported on the errors.
 * @param targets - Distinct-by-address targets to check, in reporting order.
 * @returns Nothing when every target holds code.
 * @throws {MissingContractCodeError} when a target has no deployed bytecode on
 *   the endpoint's chain.
 * @throws {ChainIdMismatchError} when the endpoint serves another chain id.
 * @throws {viem.BaseError} when an `eth_getCode` read itself fails.
 * @internal
 */
// biome-ignore lint/complexity/useMaxParams: positional (client, chainId, targets) signature
export const assertRegistryTargetsHaveCode = async (
  client: Client,
  chainId: number,
  targets: readonly {
    readonly role: AddressLabel;
    readonly address: Address;
  }[],
): Promise<void> => {
  const seen = new Set<Address>();
  for (const target of targets) {
    if (seen.has(target.address)) continue;
    seen.add(target.address);
    try {
      await assertContractCode(client, {
        address: target.address,
        chainId,
        role: target.role,
      });
    } catch (error) {
      if (!(error instanceof MissingContractCodeError)) throw error;
      try {
        await validateClientChainId(client, chainId);
      } catch (probeError) {
        throw probeError instanceof ChainIdMismatchError ? probeError : error;
      }
      throw error;
    }
  }
};

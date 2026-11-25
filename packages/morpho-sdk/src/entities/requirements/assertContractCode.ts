import type { AddressLabel } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { getBytecode } from "viem/actions";
import {
  type ChainCheck,
  createChainCheck,
} from "../../actions/requirements/chainCheck.js";
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
 * One `eth_getCode` per distinct address launches concurrently, preserving the
 * first occurrence's reporting order. Each read's rejection handler attaches
 * immediately; outcomes are then consumed in target order, so a known earlier
 * failure does not wait for later reads to settle. Later rejections stay observed
 * even after this assertion returns early.
 * Before any other requirement read, a selected {@link MissingContractCodeError}
 * uses the invocation's lazy chain preflight (reusing an earlier result): a served
 * chain mismatch surfaces as {@link ChainIdMismatchError} (never as missing
 * code), a failed probe keeps the original missing-code error, and a matching
 * chain rethrows it unchanged. Other assertion errors propagate unwrapped.
 *
 * @param client - Connected viem client used for the `eth_getCode` reads.
 * @param chainId - Chain id the flow targets, reported on the errors.
 * @param targets - Targets to deduplicate by address and check, in reporting order.
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
  chainCheck: ChainCheck = createChainCheck(client, chainId),
): Promise<void> => {
  const seen = new Set<Address>();
  const checks: Promise<PromiseSettledResult<void>>[] = [];
  for (const target of targets) {
    if (seen.has(target.address)) {
      continue;
    }
    seen.add(target.address);
    checks.push(
      assertContractCode(client, {
        address: target.address,
        chainId,
        role: target.role,
      }).then(
        () => ({ status: "fulfilled" as const, value: undefined }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      ),
    );
  }
  // Every started read is already observed; await only the next ordered outcome,
  // not all reads together, so stalled later targets cannot hide an earlier error.
  for (const check of checks) {
    const result = await check;
    if (result.status === "rejected") {
      const error: unknown = result.reason;
      if (!(error instanceof MissingContractCodeError)) {
        throw error;
      }
      try {
        await chainCheck();
      } catch (probeError) {
        throw probeError instanceof ChainIdMismatchError ? probeError : error;
      }
      throw error;
    }
  }
};

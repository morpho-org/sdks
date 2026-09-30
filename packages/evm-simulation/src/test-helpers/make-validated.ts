import type { Address } from "viem";
import type {
  ParsedRequest,
  ValidatedAuthorizations,
} from "../domain/stages.js";
import { brandDecoded, brandPinned, brandValidated } from "../domain/stages.js";

/**
 * Minimal `ValidatedAuthorizations` for transport/evidence tests: no
 * operations, no preparations, empty pre-state.
 */
export function makeValidated(params: {
  readonly request: ParsedRequest;
  readonly owner: Address;
}): ValidatedAuthorizations {
  const { request, owner } = params;
  return brandValidated({
    inputs: brandPinned({
      bundle: brandDecoded({
        request,
        owner,
        operations: [],
      }),
      context: {
        chainId: request.chainId,
        stateBlockNumber: 20_000_000n,
        stateBlockHash: `0x${"ab".repeat(32)}`,
        stateBlockTimestamp: 1_700_000_000n,
        blockNumber: 20_000_000n,
        blockTimestamp: 1_700_000_000n,
      },
      before: {
        wallet: [],
        permissions: [],
        positions: [],
        vaults: [],
        markets: [],
      },
      internals: { vaultData: new Map() },
    }),
    limits: {
      maxSlippageWad: 0n,
      minLltvBufferWad: 0n,
      maxSignatureLifetimeSeconds: 0n,
      wallet: { maxDebit: [], minCredit: [] },
      operations: [],
    },
    preparations: [],
    matches: [],
    expected: [],
  });
}

import {
  type Address,
  type Chain,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  numberToHex,
} from "viem";
import type { AnvilTestClient } from "./client.js";
import { AnvilFeeTokenFundingError } from "./errors.js";

const TEMPO_CHAIN_ID = 4217;
const TEMPO_FEE_TOKEN: Address = "0x20C0000000000000000000000000000000000000";
const TEMPO_FEE_TOKEN_BALANCES_SLOT = 9n;

/**
 * Sets an account's gas fee-token balance on chains that pay gas in an ERC-20 fee token.
 * @internal
 *
 * Tempo's pathUSD balance is set directly in the forked Anvil state. This is a no-op on chains
 * that pay gas in the native token.
 *
 * @param client - Anvil test client configured for the target chain.
 * @param params.account - Account whose fee-token balance is set.
 * @param params.amount - Desired fee-token balance.
 * @returns Resolves with `void` after funding is verified, or immediately on a native-gas chain.
 * @throws {AnvilFeeTokenFundingError} when the resulting fee-token balance differs from `amount`.
 * @example
 * ```ts
 * const account = client.account.address;
 * const amount = maxUint128;
 * await setFeeTokenBalance(client, { account, amount });
 * ```
 */
export const setFeeTokenBalance = async (
  client: Pick<
    AnvilTestClient<Chain>,
    "chain" | "setStorageAt" | "readContract"
  >,
  params: { readonly account: Address; readonly amount: bigint },
): Promise<void> => {
  if (client.chain.id !== TEMPO_CHAIN_ID) return;

  const index = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [params.account, TEMPO_FEE_TOKEN_BALANCES_SLOT],
    ),
  );
  await client.setStorageAt({
    address: TEMPO_FEE_TOKEN,
    index,
    value: numberToHex(params.amount, { size: 32 }),
  });
  const actual = await client.readContract({
    address: TEMPO_FEE_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [params.account],
  });

  if (actual !== params.amount)
    throw new AnvilFeeTokenFundingError({
      token: TEMPO_FEE_TOKEN,
      account: params.account,
      actual,
      expected: params.amount,
      balancesSlot: TEMPO_FEE_TOKEN_BALANCES_SLOT,
    });
};

import {
  type Address,
  type Chain,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  numberToHex,
} from "viem";
import { mainnet, tempo } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import type { AnvilTestClient } from "./client.js";
import { AnvilFeeTokenFundingError } from "./errors.js";
import { setFeeTokenBalance } from "./feeToken.js";

const feeToken: Address = "0x20C0000000000000000000000000000000000000";
const account: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const balancesSlot = 9n;

const createClient = (chain: Chain) => {
  const setStorageAt = vi.fn().mockResolvedValue(undefined);
  const readContract = vi.fn().mockResolvedValue(123n);

  return {
    client: {
      chain,
      readContract,
      setStorageAt,
    } as unknown as AnvilTestClient<Chain>,
    readContract,
    setStorageAt,
  };
};

describe("internal fee-token balance funding", () => {
  test("sets and verifies Tempo's fee-token balance", async () => {
    const amount = 123n;
    const { client, readContract, setStorageAt } = createClient(tempo);

    await setFeeTokenBalance(client, { account, amount });

    const index = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [account, balancesSlot],
      ),
    );
    expect(setStorageAt).toHaveBeenCalledWith({
      address: feeToken,
      index,
      value: numberToHex(amount, { size: 32 }),
    });
    expect(readContract).toHaveBeenCalledWith({
      address: feeToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
  });

  test("does nothing on chains that pay gas in the native token", async () => {
    const { client, readContract, setStorageAt } = createClient(mainnet);

    await setFeeTokenBalance(client, { account, amount: 123n });

    expect(setStorageAt).not.toHaveBeenCalled();
    expect(readContract).not.toHaveBeenCalled();
  });

  test("throws when the fee-token balance is not set to the requested amount", async () => {
    const { client, readContract } = createClient(tempo);
    readContract.mockResolvedValueOnce(0n);

    await expect(
      setFeeTokenBalance(client, { account, amount: 123n }),
    ).rejects.toBeInstanceOf(AnvilFeeTokenFundingError);
  });
});

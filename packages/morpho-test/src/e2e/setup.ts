import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import { type Address, type Chain, numberToHex, parseEther } from "viem";
import { E2E_ASSET_BYTECODE, E2E_ASSET_STORAGE, getE2eAsset } from "./asset.js";

/** Address of the fixed-price oracle installed on every fork. */
const E2E_ORACLE: Address = "0xE2E0000000000000000000000000000000000001";

/**
 * Installs the E2E test asset code and storage at `address`.
 *
 * @param client - Anvil client used to install the asset.
 * @param address - Address where the E2E asset should be installed.
 */
export const installE2eAsset = async (
  client: AnvilTestClient<Chain>,
  address: Address,
) => {
  await client.setCode({
    address,
    bytecode: E2E_ASSET_BYTECODE,
  });
  for (const { slot, value } of E2E_ASSET_STORAGE)
    await client.setStorageAt({
      address,
      index: slot,
      value,
    });
};

/**
 * Installs the fixed 1:1 oracle used by E2E markets.
 *
 * @param client - Anvil client used to install the oracle.
 * @returns The registered oracle address.
 */
export const installE2eOracle = async (
  client: AnvilTestClient<Chain>,
): Promise<Address> => {
  // PUSH15 price; PUSH1 0; MSTORE; PUSH1 32; PUSH1 0; RETURN: answers `price()` with 1e36.
  await client.setCode({
    address: E2E_ORACLE,
    bytecode: `0x6e${numberToHex(ORACLE_PRICE_SCALE, { size: 15 }).slice(2)}60005260206000f3`,
  });
  return E2E_ORACLE;
};

/** Minimal ABI for wrapping native currency into wNative. */
const wNativeDepositAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

/**
 * Adds `amount` wNative to the selected account. Fork-installed assets use `client.deal` because
 * chains like Tempo reject native value transfers; real wNative is funded by wrapping native
 * tokens. A second ERC-20 `client.deal` after `setUpVault` fails on Robinhood with "cannot find
 * valid balanceOf storage slot", so wrapping remains for real wNative.
 *
 * @param params.account - Account to fund; defaults to the test account.
 */
export const wrapE2eNative = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly wNative: Address;
    readonly amount: bigint;
    readonly account?: Address;
  },
) => {
  const account = params.account ?? client.account.address;
  if (getE2eAsset(client.chain.id).requiresInstall) {
    await client.deal({
      erc20: params.wNative,
      account,
      amount:
        (await client.balanceOf({ erc20: params.wNative, owner: account })) +
        params.amount,
    });
    return;
  }

  if (params.account == null) {
    await client.deal({ amount: params.amount + parseEther("1") });
  } else {
    await client.setBalance({
      address: account,
      value:
        (await client.getBalance({ address: account })) +
        params.amount +
        parseEther("1"),
    });
  }
  await client.writeContract({
    account,
    address: params.wNative,
    abi: wNativeDepositAbi,
    functionName: "deposit",
    value: params.amount,
  });
};

import {
  addressesRegistry,
  ChainId,
  MathLib,
  NATIVE_ADDRESS,
} from "@morpho-org/blue-sdk";

import {
  type Address,
  ContractFunctionExecutionError,
  erc20Abi,
  maxUint256,
  zeroAddress,
} from "viem";
import { describe, expect } from "vitest";
import { erc3643Abi } from "../src/abis.js";
import { Holding } from "../src/augment/Holding.js";
import { fetchHolding } from "../src/fetch/Holding.js";
import {
  abi as getHoldingAbi,
  code as getHoldingCode,
} from "../src/queries/GetHolding.js";
import { erc3643Test, test } from "./setup.js";

const {
  blue: morpho,
  permit2,
  wNative,
  wbC3M,
} = addressesRegistry[ChainId.EthMainnet];
const {
  blue: morphoBlue,
  bundles: { blueBundlesV1 },
} = addressesRegistry[ChainId.BaseMainnet];
// Base deployment (token and registry): https://basescan.org/tx/0xb6ea1a1dd39a02dacdeb4d07e4bf107207fd382b1bf328da33011c07a74ada0f
// Supporting onchain evidence only; an issuer address record or human identity check is still required.
const gro: Address = "0x3dCce9e05Fc9c30A6a4E9FC1c0ec1Ff15C16e0b5";
const groIdentityRegistry: Address =
  "0x98bFde16AD8Fd5eB43Cf218A4e8A112870d9659D";
const usdcBase: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

describe("augment/Holding", () => {
  test("should fetch user WETH data with deployless", async ({ client }) => {
    const expectedData = new Holding({
      token: wNative,
      user: client.account.address,
      erc20Allowances: {
        blue: 1n,
        permit2: 3n,
      },
      balance: 10n * MathLib.WAD,
      canTransfer: true,
    });

    await client.deal({
      erc20: wNative,
      amount: expectedData.balance,
    });
    await client.approve({
      address: wNative,
      args: [morpho, expectedData.erc20Allowances.blue],
    });
    await client.approve({
      address: wNative,
      args: [permit2, expectedData.erc20Allowances.permit2],
    });

    const value = await Holding.fetch(client.account.address, wNative, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch user WETH data without deployless", async ({ client }) => {
    const expectedData = new Holding({
      token: wNative,
      user: client.account.address,
      erc20Allowances: {
        blue: 1n,
        permit2: 3n,
      },
      balance: 10n * MathLib.WAD,
      canTransfer: true,
    });

    await client.deal({
      erc20: wNative,
      amount: expectedData.balance,
    });
    await client.approve({
      address: wNative,
      args: [morpho, expectedData.erc20Allowances.blue],
    });
    await client.approve({
      address: wNative,
      args: [permit2, expectedData.erc20Allowances.permit2],
    });

    const value = await Holding.fetch(client.account.address, wNative, client, {
      deployless: false,
    });

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch native user holding", async ({ client }) => {
    const token = NATIVE_ADDRESS;

    const expectedData = new Holding({
      token,
      user: client.account.address,
      erc20Allowances: {
        blue: maxUint256,
        permit2: maxUint256,
      },
      balance: 10000000000000000000000n,
      canTransfer: undefined,
    });

    const value = await Holding.fetch(client.account.address, token, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch backed token user holding with deployless", async ({
    client,
  }) => {
    const expectedData = new Holding({
      token: wbC3M,
      user: client.account.address,
      erc20Allowances: {
        blue: 6n,
        permit2: 5n,
      },
      balance: 2853958n,
      erc2612Nonce: 0n,
      canTransfer: false,
    });

    await client.deal({
      erc20: wbC3M,
      amount: expectedData.balance,
    });
    await client.approve({
      address: wbC3M,
      args: [morpho, expectedData.erc20Allowances.blue],
    });
    await client.approve({
      address: wbC3M,
      args: [permit2, expectedData.erc20Allowances.permit2],
    });

    const value = await Holding.fetch(client.account.address, wbC3M, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch backed token user holding without deployless", async ({
    client,
  }) => {
    const expectedData = new Holding({
      token: wbC3M,
      user: client.account.address,
      erc20Allowances: {
        blue: 6n,
        permit2: 5n,
      },
      balance: 2853958n,
      erc2612Nonce: 0n,
      canTransfer: false,
    });

    await client.deal({
      erc20: wbC3M,
      amount: expectedData.balance,
    });
    await client.approve({
      address: wbC3M,
      args: [morpho, expectedData.erc20Allowances.blue],
    });
    await client.approve({
      address: wbC3M,
      args: [permit2, expectedData.erc20Allowances.permit2],
    });

    const value = await Holding.fetch(client.account.address, wbC3M, client, {
      deployless: false,
    });

    expect(value).toStrictEqual(expectedData);
  });

  test("deployless query does not revert when Permit2 is absent", async ({
    client,
  }) => {
    // Some chains have no Permit2 deployment; `fetchHolding` then passes `address(0)`.
    // The deployless query must skip the Permit2 allowance read instead of reverting on an
    // addressless contract, leaving its ERC20 allowance at zero so it matches the multicall
    // fallback (which returns 0 without any read). The Morpho allowance must still be
    // reported. Exercised here on mainnet by
    // passing `zeroAddress` directly as the Permit2 argument.
    await client.deal({ erc20: wNative, amount: 10n * MathLib.WAD });
    await client.approve({ address: wNative, args: [morpho, 6n] });

    const res = await client.readContract({
      abi: getHoldingAbi,
      code: getHoldingCode,
      functionName: "query",
      args: [
        wNative,
        client.account.address,
        morpho,
        zeroAddress,
        false,
        false,
      ],
    });

    expect(res.balance).toBe(10n * MathLib.WAD);
    expect(res.erc20Allowances).toEqual({
      blue: 6n,
      permit2: 0n,
    });
  });
});

describe("fetchHolding ERC-3643", () => {
  erc3643Test(
    "verifies GRO identity and registry wiring on Base",
    async ({ client }) => {
      expect(
        await client.readContract({
          address: gro,
          abi: erc20Abi,
          functionName: "name",
        }),
      ).toBe("GromaCoin");
      expect(
        await client.readContract({
          address: gro,
          abi: erc20Abi,
          functionName: "symbol",
        }),
      ).toBe("GRO");
      expect(
        await client.readContract({
          address: gro,
          abi: erc3643Abi,
          functionName: "identityRegistry",
        }),
      ).toBe(groIdentityRegistry);
      expect(await client.getCode({ address: groIdentityRegistry })).not.toBe(
        "0x",
      );
    },
  );

  const cases = [
    {
      name: "unverified BlueBundlesV1 recipient",
      user: blueBundlesV1,
      token: gro,
      canTransfer: false,
    },
    {
      name: "verified Morpho Blue recipient",
      user: morphoBlue,
      token: gro,
      canTransfer: true,
    },
    {
      name: "non-ERC-3643 USDC recipient",
      user: blueBundlesV1,
      token: usdcBase,
      canTransfer: true,
    },
  ] as const;

  for (const { name, deployless } of [
    { name: "multicall", deployless: false },
    { name: "deployless", deployless: "force" },
  ] as const) {
    erc3643Test.for(cases)(
      `${name}: reports transfer eligibility for $name`,
      async ({ user, token, canTransfer }, { client }) => {
        const holding = await fetchHolding(user, token, client, { deployless });

        expect(holding.canTransfer).toBe(canTransfer);
      },
    );
  }

  for (const deployless of [false, true, "force"] as const) {
    erc3643Test.for([
      {
        name: "identityRegistry",
        address: gro,
        code: "0x60003560e01c63134e18f414601957600160005260206000f35b600160005360016000f3",
      },
      {
        name: "isVerified",
        address: groIdentityRegistry,
        code: "0x600160005360016000f3",
      },
    ] as const)(
      `rejects malformed $name replies (deployless: ${deployless})`,
      async ({ address, code }, { client }) => {
        // The token override answers other selectors with a valid 32-byte word; the probe returns one byte.
        await expect(
          fetchHolding(blueBundlesV1, gro, client, {
            deployless,
            stateOverride: [{ address, code }],
          }),
        ).rejects.toBeInstanceOf(ContractFunctionExecutionError);
      },
    );

    erc3643Test.for([
      {
        name: "identityRegistry",
        address: gro,
        code: "0x60003560e01c63134e18f414601957600160005260206000f35b60006000f3",
      },
      {
        name: "isVerified",
        address: groIdentityRegistry,
        code: "0x60006000f3",
      },
    ] as const)(
      `handles empty $name replies (deployless: ${deployless})`,
      async ({ name, address, code }, { client }) => {
        const holding = await fetchHolding(blueBundlesV1, gro, client, {
          deployless,
          stateOverride: [{ address, code }],
        });
        expect(holding.canTransfer).toBe(
          name === "isVerified" ? undefined : true,
        );
      },
    );

    erc3643Test(
      `reports unknown eligibility when isVerified reverts (deployless: ${deployless})`,
      async ({ client }) => {
        const holding = await fetchHolding(blueBundlesV1, gro, client, {
          deployless,
          stateOverride: [
            { address: groIdentityRegistry, code: "0x60006000fd" },
          ],
        });
        expect(holding.canTransfer).toBeUndefined();
      },
    );

    erc3643Test(
      `ignores a registry without code (deployless: ${deployless})`,
      async ({ client }) => {
        const holding = await fetchHolding(blueBundlesV1, gro, client, {
          deployless,
          stateOverride: [{ address: groIdentityRegistry, code: "0x" }],
        });
        expect(holding.canTransfer).toBe(true);
      },
    );
  }
});

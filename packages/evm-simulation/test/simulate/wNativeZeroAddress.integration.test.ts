/**
 * Solidity helper compiled with `~/.foundry/bin/forge`:
 * ```solidity
 * // SPDX-License-Identifier: MIT
 * pragma solidity ^0.8.0;
 *
 * interface IWETH {
 *   function withdraw(uint256 wad) external;
 *   function transfer(address dst, uint256 wad) external returns (bool);
 * }
 *
 * contract WNativeZeroAddressHelper {
 *   IWETH private constant WETH =
 *     IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
 *
 *   receive() external payable {}
 *
 *   function unwrapAndBurn() external {
 *     WETH.withdraw(1 ether);
 *     require(WETH.transfer(address(0), 1 ether));
 *   }
 * }
 * ```
 */
import {
  type Address,
  type Hex,
  isAddressEqual,
  parseEther,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { simulate } from "../../src/index.js";
import { test } from "../setup.js";

const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const HELPER: Address = "0x0000000000000000000000000000000000001563";
const AMOUNT = parseEther("1");
const HELPER_BYTECODE: Hex =
  "0x608060405260043610610021575f3560e01c8063e8d1eb731461002c57610028565b3661002857005b5f5ffd5b348015610037575f5ffd5b50610040610042565b005b73c02aaa39b223fe8d0a0e5c4f27ead9083c756cc273ffffffffffffffffffffffffffffffffffffffff16632e1a7d4d670de0b6b3a76400006040518263ffffffff1660e01b815260040161009791906101b0565b5f604051808303815f87803b1580156100ae575f5ffd5b505af11580156100c0573d5f5f3e3d5ffd5b5050505073c02aaa39b223fe8d0a0e5c4f27ead9083c756cc273ffffffffffffffffffffffffffffffffffffffff1663a9059cbb5f670de0b6b3a76400006040518363ffffffff1660e01b815260040161011b929190610208565b6020604051808303815f875af1158015610137573d5f5f3e3d5ffd5b505050506040513d601f19601f8201168201806040525081019061015b9190610268565b610163575f5ffd5b565b5f819050919050565b5f819050919050565b5f819050919050565b5f61019a61019561019084610165565b610177565b61016e565b9050919050565b6101aa81610180565b82525050565b5f6020820190506101c35f8301846101a1565b92915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6101f2826101c9565b9050919050565b610202816101e8565b82525050565b5f60408201905061021b5f8301856101f9565b61022860208301846101a1565b9392505050565b5f5ffd5b5f8115159050919050565b61024781610233565b8114610251575f5ffd5b50565b5f815190506102628161023e565b92915050565b5f6020828403121561027d5761027c61022f565b5b5f61028a84828501610254565b9150509291505056fea2646970667358221220a40270d8e66efa86ee06b7d9f58eb71f91398e9da4377b849a4d581673d267f664736f6c63430008250033";

describe("simulate — unwrapped WETH sent to zero", () => {
  test("reports the Withdrawal and genuine zero-address Transfer burns", async ({
    client,
  }) => {
    await client.setCode({ address: HELPER, bytecode: HELPER_BYTECODE });
    await client.deal({ erc20: WETH, account: HELPER, amount: AMOUNT * 2n });
    expect(await client.balanceOf({ erc20: WETH, owner: HELPER })).toBe(
      AMOUNT * 2n,
    );
    await client.call({ to: HELPER, data: "0xe8d1eb73" });

    const result = await simulate(
      {
        timeoutMs: 30_000,
        chains: new Map([
          [mainnet.id, { simulateV1Url: client.transport.url! }],
        ]),
      },
      {
        chainId: mainnet.id,
        limits: "none",
        transactions: [
          {
            from: client.account.address,
            to: HELPER,
            data: "0xe8d1eb73",
          },
        ],
      },
    );

    const burns = result.transfers.filter(
      ({ token, from, to }) =>
        isAddressEqual(token, WETH) &&
        isAddressEqual(from, HELPER) &&
        isAddressEqual(to, zeroAddress),
    );
    expect(burns).toEqual([
      {
        token: WETH,
        from: HELPER,
        to: zeroAddress,
        amount: AMOUNT,
        txIdx: 0,
      },
      {
        token: WETH,
        from: HELPER,
        to: zeroAddress,
        amount: AMOUNT,
        txIdx: 0,
      },
    ]);
    expect(
      result.assetChanges
        .find(({ account }) => isAddressEqual(account, HELPER))
        ?.changes.find(({ token }) => isAddressEqual(token, WETH))?.diff,
    ).toBe(-2n * AMOUNT);
  }, 60_000);
});

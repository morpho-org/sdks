import { getChainAddresses } from "@morpho-org/morpho-ts";
import { type Address, type Hex, maxUint256, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  BundlesPermitMismatchError,
  DepositOwnerMismatchError,
  type Erc2612RequirementSignature,
} from "../../types/index.js";
import { getBundlesSharesPermit } from "../bundles/common.js";
import { vaultV2Deposit } from "../vaultV2/deposit.js";
import { vaultV2ForceWithdraw } from "../vaultV2/forceWithdraw.js";
import { vaultV2InKindRedeem } from "../vaultV2/inKindRedeem.js";
import { vaultV2Redeem } from "../vaultV2/redeem.js";
import { vaultV2Withdraw } from "../vaultV2/withdraw.js";
import { vaultV1Deposit } from "./deposit.js";
import { vaultV1InKindRedeem } from "./inKindRedeem.js";
import { vaultV1MigrateToV2 } from "./migrateToV2.js";
import { vaultV1Redeem } from "./redeem.js";
import { vaultV1Withdraw } from "./withdraw.js";

type Wrap = <T extends object>(value: T) => T;
const identity: Wrap = (value) => value;
const other = "0x0000000000000000000000000000000000000012";
const addresses = getChainAddresses(1);
const bundles = addresses.bundles!;
const vault = { chainId: 1, address: zeroAddress, asset: addresses.wNative! };
const common = { userAddress: zeroAddress, deadline: 1_900_000_000n };
const market = {
  loanToken: zeroAddress,
  collateralToken: zeroAddress,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
};
const permit = ({
  owner,
  asset,
  spender,
}: {
  owner: Address;
  asset: Address;
  spender: Address;
}): Erc2612RequirementSignature => ({
  args: {
    owner,
    asset,
    amount: maxUint256,
    nonce: 0n,
    deadline: common.deadline,
    signature: `0x${"11".repeat(64)}1b` as Hex,
  },
  action: {
    type: "permit",
    args: { spender, amount: maxUint256, nonce: 0n, deadline: common.deadline },
  },
});

describe.each(["prototype", "non-enumerable", "own getter"])(
  "Vault snapshots preserve %s fields",
  (mode) => {
    const wrap: Wrap = (value) => {
      const descriptors = Object.fromEntries(
        Object.entries(value).map(([key, field]) => [
          key,
          { get: () => field, enumerable: mode === "own getter" },
        ]),
      );
      const fields = Object.defineProperties({}, descriptors);
      return (
        mode === "prototype" ? Object.create(fields) : fields
      ) as typeof value;
    };

    for (const [version, deposit, withdraw, redeem, inKind] of [
      [
        "V1",
        vaultV1Deposit,
        vaultV1Withdraw,
        vaultV1Redeem,
        vaultV1InKindRedeem,
      ],
      [
        "V2",
        vaultV2Deposit,
        vaultV2Withdraw,
        vaultV2Redeem,
        vaultV2InKindRedeem,
      ],
    ] as const) {
      const sharePermit = (owner: Address, exit = false) =>
        permit({
          owner,
          asset: vault.address,
          spender: exit ? bundles.vaultExitBundlesV1! : bundles.vaultBundlesV1!,
        });
      const cases = [
        [
          "deposit",
          (copy: Wrap, owner: Address) =>
            deposit(
              copy({
                vault: copy(vault),
                args: copy({
                  ...common,
                  amount: maxUint256,
                  maxSharePrice: 1n,
                  requirementSignature: permit({
                    owner,
                    asset: vault.asset,
                    spender: bundles.vaultBundlesV1!,
                  }),
                }),
              }),
            ),
          DepositOwnerMismatchError,
        ],
        [
          "withdraw",
          (copy: Wrap, owner: Address) =>
            withdraw(
              copy({
                vault: copy(vault),
                args: copy({
                  ...common,
                  amount: 1n,
                  requirementSignature: sharePermit(owner),
                }),
              }),
            ),
          BundlesPermitMismatchError,
        ],
        [
          "redeem",
          (copy: Wrap, owner: Address) =>
            redeem(
              copy({
                vault: copy(vault),
                args: copy({
                  ...common,
                  shares: 1n,
                  requirementSignature: sharePermit(owner),
                }),
              }),
            ),
          BundlesPermitMismatchError,
        ],
        [
          "inKindRedeem",
          (copy: Wrap, owner: Address) =>
            inKind(
              copy({
                vault: copy(vault),
                args: copy({
                  ...common,
                  amount: 1n,
                  adapter: zeroAddress,
                  marketParamsList: [market],
                  requirementSignature: sharePermit(owner, true),
                }),
              }),
            ),
          BundlesPermitMismatchError,
        ],
      ] as const;
      for (const [name, build, error] of cases) {
        test(`${version} ${name} keeps calldata and checks the share owner`, () => {
          expect(build(wrap, zeroAddress)).toEqual(
            build(identity, zeroAddress),
          );
          expect(() => build(wrap, other)).toThrow(error);
        });
      }
    }

    test.each(["migrateToV2", "forceWithdraw"])(
      "%s preserves the permit owner check",
      (name) => {
        const exit = name === "forceWithdraw";
        const requirementSignature = permit({
          owner: other,
          asset: vault.address,
          spender: exit ? bundles.vaultExitBundlesV1! : bundles.vaultBundlesV1!,
        });
        expect(() =>
          exit
            ? vaultV2ForceWithdraw(
                wrap({
                  vault: wrap(vault),
                  args: wrap({
                    ...common,
                    adapter: zeroAddress,
                    exitAssets: 1n,
                    minSharePriceE27: 0n,
                    requirementSignature,
                  }),
                }),
              )
            : vaultV1MigrateToV2(
                wrap({
                  vault: wrap(vault),
                  args: wrap({
                    ...common,
                    assets: 1n,
                    targetVault: other,
                    targetAsset: vault.asset,
                    maxSharePriceVaultV2: 1n,
                    requirementSignature,
                  }),
                }),
              ),
        ).toThrow(BundlesPermitMismatchError);
      },
    );

    test.each(["owner", "spender", "signature"])(
      "share-permit helper retains %s",
      (field) => {
        const params = {
          vault: vault.address,
          deadline: common.deadline,
          owner: zeroAddress,
          spender: bundles.vaultBundlesV1!,
          amount: 1n,
          requirementSignature: permit({
            owner: field === "owner" ? other : zeroAddress,
            asset: vault.address,
            spender: field === "spender" ? other : bundles.vaultBundlesV1!,
          }),
        };
        if (field === "signature") {
          expect(getBundlesSharesPermit(wrap(params))).toEqual(
            getBundlesSharesPermit(params),
          );
        } else {
          expect(() => getBundlesSharesPermit(wrap(params))).toThrow(
            BundlesPermitMismatchError,
          );
        }
      },
    );

    test("a changing deadline is checked and encoded from the same read", () => {
      let reads = 0;
      const tx = vaultV1Redeem({
        vault,
        args: {
          ...common,
          shares: 1n,
          get deadline() {
            return ++reads === 1 ? common.deadline : 0n;
          },
        },
      });
      expect(reads).toBe(1);
      expect(tx).toEqual(
        vaultV1Redeem({ vault, args: { ...common, shares: 1n } }),
      );
    });
  },
);

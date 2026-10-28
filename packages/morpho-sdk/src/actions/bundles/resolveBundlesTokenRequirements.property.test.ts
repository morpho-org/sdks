import { fc, test } from "@fast-check/vitest";
import { addressesRegistry } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  maxUint96,
  maxUint256,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  addressArbitrary as address,
  amountArbitrary,
  propertyDeadline as deadline,
  pinPropertyClock,
  UINT128_MAX,
} from "../../../test/fixtures/properties.js";
import {
  isRequirementApproval,
  isRequirementSignature,
} from "../../types/index.js";
import { resolveBundlesTokenRequirements } from "./resolveBundlesTokenRequirements.js";

const chainId = mainnet.id;
const { usdc, usdt, permit2 } = addressesRegistry[chainId];
const spenders = [
  getChainAddress(chainId, "bundles.blueBundlesV1"),
  getChainAddress(chainId, "bundles.vaultBundlesV1"),
] as const;

const allowanceArbitrary = fc.oneof(
  fc.constant(0n),
  fc.bigInt({ min: 0n, max: UINT128_MAX }),
);
// Mainnet tokens that need a zero reset before a new non-zero approval (USDT, CRV).
const resetTokens: readonly Address[] = [
  usdt,
  "0xD533a949740bb3306d119CC777fa900bA034cd52",
];
// Mainnet tokens that revert on approvals above uint96 (UNI, ONDO, COMP, FLUID).
const uint96CappedTokens: readonly Address[] = [
  "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
  "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3",
  "0xc00e94Cb662C3520282E6f5717214004A7f26888",
  "0x6f40d4A6237C257fff2dB00FA0510DeEECd303eb",
];
const tokenArbitrary = fc.oneof(
  fc.constantFrom(usdc, ...resetTokens, ...uint96CappedTokens),
  address,
);

pinPropertyClock();

// bundles TokenLib.sol pullOrWrapNative: the bundle pulls exactly `assets` from msg.sender via
// transferFrom (allowance to the bundle), or Permit2 permitTransferFrom (SignatureTransfer).
describe("resolveBundlesTokenRequirements", () => {
  test.prop(
    [
      fc.record({
        token: tokenArbitrary,
        spender: fc.constantFrom(...spenders),
        owner: address,
        amount: amountArbitrary,
        allowance: allowanceArbitrary,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: classic approvals target only the token and bundle spender and set the token's maximum",
    ({ token, spender, owner, amount, allowance }) => {
      const requirements = resolveBundlesTokenRequirements({
        token,
        spender,
        owner,
        chainId,
        amount,
        deadline,
        state: { type: "approval", allowance },
      });
      if (allowance >= amount) {
        expect(requirements).toEqual([]);
        return;
      }
      expect(requirements.length).toBeGreaterThan(0);
      const approvals = requirements.map((requirement) => {
        if (!isRequirementApproval(requirement)) {
          throw new TypeError("Expected an ERC-20 approval requirement");
        }
        expect(requirement.to).toBe(token);
        const decoded = decodeFunctionData({
          abi: erc20Abi,
          data: requirement.data,
        });
        if (decoded.functionName !== "approve") {
          throw new TypeError("Expected an ERC-20 approve call");
        }
        return decoded.args;
      });
      const approved = uint96CappedTokens.includes(token)
        ? maxUint96
        : maxUint256;
      const resets = resetTokens.includes(token) && allowance > 0n;
      expect(approvals).toEqual(
        resets
          ? [
              [spender, 0n],
              [spender, approved],
            ]
          : [[spender, approved]],
      );
    },
  );

  test.prop(
    [
      fc.record({
        token: tokenArbitrary,
        spender: fc.constantFrom(...spenders),
        owner: address,
        amount: amountArbitrary,
        permit2Allowance: allowanceArbitrary,
        permit2Nonce: fc.bigInt({ min: 0n, max: 255n }),
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: Permit2 SignatureTransfer signs exactly the pulled amount to the bundle spender",
    ({ token, spender, owner, amount, permit2Allowance, permit2Nonce }) => {
      const requirements = resolveBundlesTokenRequirements({
        token,
        spender,
        owner,
        chainId,
        amount,
        deadline,
        state: {
          type: "permit2SignatureTransfer",
          permit2Allowance,
          permit2Nonce,
          nonceBitmap: 0n,
        },
      });
      const signature = requirements.at(-1);
      if (!isRequirementSignature(signature)) {
        throw new TypeError("Expected a Permit2 signature requirement");
      }
      expect(signature.action).toMatchObject({
        type: "permit2SignatureTransfer",
        args: { spender, amount, nonce: permit2Nonce, deadline },
      });
      expect(signature.action.typedData.message).toMatchObject({
        permitted: { token, amount },
        spender,
        nonce: permit2Nonce,
        deadline,
      });
      expect(signature.action.typedData.primaryType).toBe("PermitTransferFrom");
      expect(signature.action.typedData.domain).toMatchObject({
        chainId,
        verifyingContract: permit2,
      });
      // The only token approval allowed on this path is the reusable one to canonical Permit2,
      // which can only move funds through a signed, amount-bounded transfer.
      const approvals = requirements.slice(0, -1).map((requirement) => {
        if (!isRequirementApproval(requirement)) {
          throw new TypeError("Expected an ERC-20 approval requirement");
        }
        expect(requirement.to).toBe(token);
        const decoded = decodeFunctionData({
          abi: erc20Abi,
          data: requirement.data,
        });
        if (decoded.functionName !== "approve") {
          throw new TypeError("Expected an ERC-20 approve call");
        }
        return decoded.args;
      });
      const needsApproval = permit2Allowance < amount;
      const resets =
        needsApproval && resetTokens.includes(token) && permit2Allowance > 0n;
      const approved = uint96CappedTokens.includes(token)
        ? maxUint96
        : maxUint256;
      expect(approvals).toEqual([
        ...(resets ? [[permit2, 0n]] : []),
        ...(needsApproval ? [[permit2, approved]] : []),
      ]);
    },
  );
});

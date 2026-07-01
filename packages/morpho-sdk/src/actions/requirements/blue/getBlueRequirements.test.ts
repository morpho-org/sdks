import {
  addressesRegistry,
  type ChainAddresses,
  Holding,
  MathLib,
  registerCustomAddresses,
} from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  ApprovalAmountLessThanSpendAmountError,
  ChainIdMismatchError,
  isRequirementApproval,
  isRequirementSignature,
  Permit2ExpirationMissingError,
} from "../../../types/index.js";
import { getBundler3RequirementsPermit } from "../bundler3/getBundler3RequirementsPermit.js";
import { getRequirementsAction } from "../getRequirementsAction.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";
import { getBlueRequirements } from "./getBlueRequirements.js";

vi.mock("@morpho-org/blue-sdk-viem", async (_importOriginal) => {
  return {
    fetchHolding: vi.fn(),
    fetchToken: vi.fn(),
  };
});

import { fetchHolding, fetchToken } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";

describe("getBlueRequirements", () => {
  const {
    dai,
    usdc,
    wNative,
    permit2,
    bundler3: { generalAdapter1 },
  } = addressesRegistry[mainnet.id];

  const mockFrom: Address = "0x1234567890123456789012345678901234567890";
  const mockAmount = 1000000n;
  const noPermit2ChainId = 9_101_003;

  let mockClient: Client;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      chain: {
        id: mainnet.id,
      },
    } as unknown as Client;

    // Mock fetchToken to return token data required for permit signing
    vi.mocked(fetchToken).mockResolvedValue({
      address: usdc,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      fromUsd: () => 0n,
      toUsd: () => 0n,
    });

    registerCustomAddresses({
      addresses: {
        [noPermit2ChainId]: {
          morpho: addressesRegistry[mainnet.id].morpho,
          bundler3: addressesRegistry[mainnet.id].bundler3,
          adaptiveCurveIrm: addressesRegistry[mainnet.id].adaptiveCurveIrm,
        } satisfies ChainAddresses,
      },
    });
  });

  describe("ChainId validation", () => {
    test("should throw ChainIdMismatchError when chainId does not match", async () => {
      const clientWithWrongChain = {
        chain: {
          id: 137, // Polygon instead of mainnet
        },
      } as unknown as Client;

      await expect(
        getBlueRequirements(clientWithWrongChain, {
          supportSignature: false,
          address: usdc,
          chainId: mainnet.id,
          args: { amount: mockAmount, from: mockFrom },
        }),
      ).rejects.toThrow(new ChainIdMismatchError(137, mainnet.id));
    });
  });

  describe("Flow 1: supportSignature = false (classic approval)", () => {
    test("should return approval when allowance is less than amount", async () => {
      vi.mocked(fetchHolding).mockResolvedValue(
        new Holding({
          user: mockFrom,
          token: usdc,
          erc20Allowances: {
            morpho: 0n,
            "bundler3.generalAdapter1": 500000n,
            permit2: 0n,
          },
          permit2BundlerAllowance: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          erc2612Nonce: undefined,
          canTransfer: false,
          balance: 0n,
        }),
      );

      const requirements = await getBlueRequirements(mockClient, {
        supportSignature: false,
        address: usdc,
        chainId: mainnet.id,
        args: { amount: mockAmount, from: mockFrom },
      });

      expect(requirements).toHaveLength(1);
      const approval = requirements[0];
      if (!isRequirementApproval(approval)) {
        throw new Error("Requirement is not an approval transaction");
      }
      expect(approval.action.type).toBe("erc20Approval");
      expect(approval.action.args.spender).toBe(generalAdapter1);
      expect(approval.action.args.amount).toBe(mockAmount);
    });

    test("should return empty array when allowance is sufficient", async () => {
      vi.mocked(fetchHolding).mockResolvedValue(
        new Holding({
          user: mockFrom,
          token: usdc,
          erc20Allowances: {
            morpho: 0n,
            "bundler3.generalAdapter1": 2000000n,
            permit2: 0n,
          },
          permit2BundlerAllowance: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
          erc2612Nonce: undefined,
          canTransfer: false,
          balance: 0n,
        }),
      );

      const requirements = await getBlueRequirements(mockClient, {
        supportSignature: false,
        address: usdc,
        chainId: mainnet.id,
        args: { amount: mockAmount, from: mockFrom },
      });

      expect(requirements).toHaveLength(0);
    });
  });

  describe("supportSignature = true", () => {
    describe("Flow 2: Simple permit (EIP-2612)", () => {
      test("should return simple permit requirement when erc2612Nonce is defined", async () => {
        vi.mocked(fetchHolding).mockResolvedValue(
          new Holding({
            user: mockFrom,
            token: usdc,
            erc20Allowances: {
              morpho: 0n,
              "bundler3.generalAdapter1": 0n,
              permit2: 0n,
            },
            permit2BundlerAllowance: {
              amount: 0n,
              expiration: 0n,
              nonce: 0n,
            },
            erc2612Nonce: 0n,
            canTransfer: false,
            balance: 0n,
          }),
        );

        const requirements = await getBlueRequirements(mockClient, {
          supportSignature: true,
          address: usdc,
          chainId: mainnet.id,
          args: { amount: mockAmount, from: mockFrom },
          useSimplePermit: true,
        });

        expect(requirements).toHaveLength(1);
        const permit = requirements[0];
        if (!isRequirementSignature(permit)) {
          throw new Error("Requirement is not a permit transaction");
        }
        expect(permit.action.type).toBe("permit");
        expect(permit.action.args.spender).toBe(generalAdapter1);
        expect(permit.action.args.amount).toBe(mockAmount);
      });

      test("should return empty array when allowance is sufficient", async () => {
        vi.mocked(fetchHolding).mockResolvedValue(
          new Holding({
            user: mockFrom,
            token: usdc,
            erc20Allowances: {
              morpho: 0n,
              "bundler3.generalAdapter1": 2000000n,
              permit2: 0n,
            },
            permit2BundlerAllowance: {
              amount: 0n,
              expiration: 0n,
              nonce: 0n,
            },
            erc2612Nonce: 0n,
            canTransfer: false,
            balance: 0n,
          }),
        );

        const requirements = await getBlueRequirements(mockClient, {
          supportSignature: true,
          address: usdc,
          chainId: mainnet.id,
          args: { amount: mockAmount, from: mockFrom },
        });

        expect(requirements).toHaveLength(0);
      });
    });

    describe("Flow 3: Permit2", () => {
      test("should return permit2 requirement with prior approval for permit2", async () => {
        vi.mocked(fetchHolding).mockResolvedValue(
          new Holding({
            user: mockFrom,
            token: usdc,
            erc20Allowances: {
              morpho: 0n,
              "bundler3.generalAdapter1": 0n,
              permit2: 0n,
            },
            permit2BundlerAllowance: {
              amount: 0n,
              expiration: 0n,
              nonce: 0n,
            },
            erc2612Nonce: undefined,
            canTransfer: false,
            balance: 0n,
          }),
        );

        const requirements = await getBlueRequirements(mockClient, {
          supportSignature: true,
          address: wNative,
          chainId: mainnet.id,
          args: { amount: mockAmount, from: mockFrom },
        });

        // Should return permit2 approval + permit2 requirement
        expect(requirements.length).toBe(2);

        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Requirement is not an approval transaction");
        }
        expect(approval.action.type).toBe("erc20Approval");
        expect(approval.action.args.spender).toBe(permit2);
        expect(approval.action.args.amount).toBe(MathLib.MAX_UINT_160); // Always approve infinite.

        // Check for permit2 requirement
        const permit2Requirement = requirements[1];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a requirement signature");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
        expect(permit2Requirement.action.args.amount).toBe(mockAmount);
      });

      test("should return permit2 only when prior approval for permit2 is sufficient", async () => {
        vi.mocked(fetchHolding).mockResolvedValue(
          new Holding({
            user: mockFrom,
            token: usdc,
            erc20Allowances: {
              morpho: 0n,
              "bundler3.generalAdapter1": 0n,
              permit2: 2000000n,
            },
            permit2BundlerAllowance: {
              amount: 0n,
              expiration: 0n,
              nonce: 0n,
            },
            erc2612Nonce: undefined,
            canTransfer: false,
            balance: 0n,
          }),
        );

        const requirements = await getBlueRequirements(mockClient, {
          supportSignature: true,
          address: wNative,
          chainId: mainnet.id,
          args: { amount: mockAmount, from: mockFrom },
        });

        expect(requirements).toHaveLength(1);
        const permit2Requirement = requirements[0];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a requirement signature");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
        expect(permit2Requirement.action.args.amount).toBe(mockAmount);
      });

      test("should return empty array when permit2 allowance is sufficient and not expired", async () => {
        const now = Time.timestamp();
        vi.mocked(fetchHolding).mockResolvedValue(
          new Holding({
            user: mockFrom,
            token: usdc,
            erc20Allowances: {
              morpho: 0n,
              "bundler3.generalAdapter1": 0n,
              permit2: 2000000n, // Sufficient permit2 allowance
            },
            permit2BundlerAllowance: {
              amount: 2000000n, // Sufficient amount
              expiration: now + Time.s.from.h(5n), // Not expired with 5 hours margin
              nonce: 0n,
            },
            erc2612Nonce: undefined,
            canTransfer: false,
            balance: 0n,
          }),
        );

        const requirements = await getBlueRequirements(mockClient, {
          supportSignature: true,
          address: wNative,
          chainId: mainnet.id,
          args: { amount: mockAmount, from: mockFrom },
        });

        // Should return empty array when everything is sufficient
        expect(requirements).toHaveLength(0);
      });

      test("should return permit2 requirement when expiration is expired", async () => {
        const now = Time.timestamp();
        const expiration = now - 1000n;
        vi.mocked(fetchHolding).mockResolvedValue(
          new Holding({
            user: mockFrom,
            token: usdc,
            erc20Allowances: {
              morpho: 0n,
              "bundler3.generalAdapter1": 0n,
              permit2: 2000000n, // Sufficient permit2 allowance
            },
            permit2BundlerAllowance: {
              amount: 2000000n, // Sufficient amount
              expiration: expiration, // Expired
              nonce: 0n,
            },
            erc2612Nonce: undefined,
            canTransfer: false,
            balance: 0n,
          }),
        );

        const requirements = await getBlueRequirements(mockClient, {
          supportSignature: true,
          address: wNative,
          chainId: mainnet.id,
          args: { amount: mockAmount, from: mockFrom },
        });

        expect(requirements).toHaveLength(1);
        const permit2Requirement = requirements[0];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a requirement signature");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
        expect(permit2Requirement.action.args.amount).toBe(mockAmount);
      });

      test("should return permit2 requirement when DAI exposes nonce and simple permit is requested", async () => {
        vi.mocked(fetchHolding).mockResolvedValue(
          new Holding({
            user: mockFrom,
            token: dai,
            erc20Allowances: {
              morpho: 0n,
              "bundler3.generalAdapter1": 0n,
              permit2: 0n,
            },
            permit2BundlerAllowance: {
              amount: 0n,
              expiration: 0n,
              nonce: 0n,
            },
            erc2612Nonce: 0n,
            canTransfer: false,
            balance: 0n,
          }),
        );

        const requirements = await getBlueRequirements(mockClient, {
          supportSignature: true,
          address: dai,
          chainId: mainnet.id,
          args: { amount: mockAmount, from: mockFrom },
          useSimplePermit: true,
        });

        expect(requirements).toHaveLength(2);

        const approvalPermit2 = requirements[0];
        if (!isRequirementApproval(approvalPermit2)) {
          throw new Error("Requirement is not an approval transaction");
        }
        expect(approvalPermit2.action.type).toBe("erc20Approval");
        expect(approvalPermit2.action.args.spender).toBe(permit2);
        expect(approvalPermit2.action.args.amount).toBe(MathLib.MAX_UINT_160);

        const permit2Requirement = requirements[1];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a permit transaction");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
        expect(permit2Requirement.action.args.amount).toBe(mockAmount);
      });

      test("should compare DAI case-insensitively before excluding simple permit", async () => {
        const lowerCaseDai = dai.toLowerCase() as Address;
        vi.mocked(fetchHolding).mockResolvedValue(
          new Holding({
            user: mockFrom,
            token: lowerCaseDai,
            erc20Allowances: {
              morpho: 0n,
              "bundler3.generalAdapter1": 0n,
              permit2: 0n,
            },
            permit2BundlerAllowance: {
              amount: 0n,
              expiration: 0n,
              nonce: 0n,
            },
            erc2612Nonce: 0n,
            canTransfer: false,
            balance: 0n,
          }),
        );

        const requirements = await getBlueRequirements(mockClient, {
          supportSignature: true,
          address: lowerCaseDai,
          chainId: mainnet.id,
          args: { amount: mockAmount, from: mockFrom },
          useSimplePermit: true,
        });

        expect(requirements).toHaveLength(2);

        const approvalPermit2 = requirements[0];
        if (!isRequirementApproval(approvalPermit2)) {
          throw new Error("Requirement is not an approval transaction");
        }
        expect(approvalPermit2.action.type).toBe("erc20Approval");
        expect(approvalPermit2.action.args.spender).toBe(permit2);

        const permit2Requirement = requirements[1];
        if (!isRequirementSignature(permit2Requirement)) {
          throw new Error("Requirement is not a permit transaction");
        }
        expect(permit2Requirement.action.type).toBe("permit2");
        expect(permit2Requirement.action.args.spender).toBe(generalAdapter1);
      });

      test("should fall back to classic approval when a chain has no Permit2", async () => {
        vi.mocked(fetchHolding).mockResolvedValue(
          new Holding({
            user: mockFrom,
            token: usdc,
            erc20Allowances: {
              morpho: 0n,
              "bundler3.generalAdapter1": 0n,
              permit2: 0n,
            },
            permit2BundlerAllowance: {
              amount: 0n,
              expiration: 0n,
              nonce: 0n,
            },
            erc2612Nonce: undefined,
            canTransfer: false,
            balance: 0n,
          }),
        );
        mockClient = { chain: { id: noPermit2ChainId } } as unknown as Client;

        const requirements = await getBlueRequirements(mockClient, {
          supportSignature: true,
          address: usdc,
          chainId: noPermit2ChainId,
          args: { amount: mockAmount, from: mockFrom },
        });

        expect(requirements).toHaveLength(1);
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Requirement is not an approval transaction");
        }
        expect(approval.action.args.spender).toBe(
          addressesRegistry[mainnet.id].bundler3.generalAdapter1,
        );
      });
    });
  });

  describe("direct requirement helpers", () => {
    test("getRequirementsAction throws when permit2 signature args omit expiration", () => {
      expect(() =>
        getRequirementsAction({
          asset: usdc,
          amount: mockAmount,
          recipient: generalAdapter1,
          requirementSignature: {
            args: {
              owner: mockFrom,
              signature: "0x00",
              deadline: 1n,
              amount: mockAmount,
              asset: usdc,
              nonce: 0n,
            },
            action: {
              type: "permit2",
              args: {
                spender: generalAdapter1,
                amount: mockAmount,
                deadline: 1n,
                expiration: 2n,
              },
            },
          },
        }),
      ).toThrow(Permit2ExpirationMissingError);
    });

    test("getRequirementsApproval rejects approval amounts below spend amount", () => {
      expect(() =>
        getRequirementsApproval({
          address: usdc,
          chainId: mainnet.id,
          args: {
            spendAmount: mockAmount,
            approvalAmount: mockAmount - 1n,
            spender: generalAdapter1,
          },
          allowances: 0n,
        }),
      ).toThrow(ApprovalAmountLessThanSpendAmountError);
    });

    test("getBundler3RequirementsPermit returns no requirement when allowance is sufficient", async () => {
      await expect(
        getBundler3RequirementsPermit(mockClient, {
          token: usdc,
          chainId: mainnet.id,
          args: { amount: mockAmount },
          allowancesGeneralAdapter: mockAmount,
          nonce: 0n,
        }),
      ).resolves.toEqual([]);
    });
  });
});

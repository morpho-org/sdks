import {
  addressesRegistry,
  type ChainAddresses,
  getChainAddresses,
  Holding,
  MathLib,
  registerCustomAddresses,
} from "@morpho-org/blue-sdk";
import { createMockClient, type MockClientHandle } from "@morpho-org/test/mock";
import {
  type Address,
  type Chain,
  type Client,
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  ApprovalAmountLessThanSpendAmountError,
  ChainIdMismatchError,
  isRequirementApproval,
  isRequirementSignature,
  Permit2ExpirationMissingError,
  type PermitRequirementSignature,
  UnexpectedRequirementSignatureError,
} from "../../../types/index.js";
import { getTokenRequirementActions } from "../../signatures/getTokenRequirementActions.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";
import { getGeneralAdapterRequirements } from "./getGeneralAdapterRequirements.js";
import { getGeneralAdapterRequirementsPermit } from "./getGeneralAdapterRequirementsPermit.js";

vi.mock("@morpho-org/blue-sdk-viem", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@morpho-org/blue-sdk-viem")>();
  return {
    ...original,
    fetchToken: vi.fn(),
  };
});

import { erc2612Abi, fetchToken, permit2Abi } from "@morpho-org/blue-sdk-viem";

describe("getGeneralAdapterRequirements", () => {
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
  let mockHandle: MockClientHandle;

  const useMockClient = (chain: Chain = mainnet) => {
    mockHandle = createMockClient(chain);
    mockClient = mockHandle.client;
  };

  const mockHoldingReads = (holding: Holding) => {
    mockHandle.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_chainId") {
        return `0x${mockHandle.chain.id.toString(16)}`;
      }

      if (method !== "eth_call") {
        throw new Error(`Unhandled RPC method ${method}`);
      }

      const [tx] = (params ?? []) as [{ to?: Address; data?: Hex }];
      if (tx?.to == null || tx.data == null) {
        throw new Error("Malformed eth_call");
      }

      const to = tx.to.toLowerCase();
      const { permit2: chainPermit2 } = getChainAddresses(mockHandle.chain.id);

      if (chainPermit2 == null || to !== chainPermit2.toLowerCase()) {
        try {
          const call = decodeFunctionData({ abi: erc20Abi, data: tx.data });

          if (call.functionName === "allowance") {
            const [, spender] = call.args;
            return encodeFunctionResult({
              abi: erc20Abi,
              functionName: "allowance",
              result:
                chainPermit2 != null &&
                spender.toLowerCase() === chainPermit2.toLowerCase()
                  ? holding.erc20Allowances.permit2
                  : holding.erc20Allowances["bundler3.generalAdapter1"],
            });
          }
        } catch {
          // The token read may be an ERC-2612 nonce probe instead of ERC-20 allowance.
        }

        const nonceCall = decodeFunctionData({
          abi: erc2612Abi,
          data: tx.data,
        });
        if (nonceCall.functionName === "nonces") {
          if (holding.erc2612Nonce == null) {
            throw new Error("ERC-2612 nonce unavailable");
          }

          return encodeFunctionResult({
            abi: erc2612Abi,
            functionName: "nonces",
            result: holding.erc2612Nonce,
          });
        }
      }

      if (chainPermit2 != null && to === chainPermit2.toLowerCase()) {
        const call = decodeFunctionData({ abi: permit2Abi, data: tx.data });
        if (call.functionName === "allowance") {
          return encodeFunctionResult({
            abi: permit2Abi,
            functionName: "allowance",
            result: [
              holding.permit2BundlerAllowance.amount,
              Number(holding.permit2BundlerAllowance.expiration),
              Number(holding.permit2BundlerAllowance.nonce),
            ],
          });
        }
      }

      throw new Error(`Unhandled eth_call to ${tx.to}`);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useMockClient();

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
        getGeneralAdapterRequirements(clientWithWrongChain, {
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
      mockHoldingReads(
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

      const requirements = await getGeneralAdapterRequirements(mockClient, {
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
      mockHoldingReads(
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

      const requirements = await getGeneralAdapterRequirements(mockClient, {
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
        mockHoldingReads(
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

        const requirements = await getGeneralAdapterRequirements(mockClient, {
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

      test("should return simple permit when direct allowance is sufficient", async () => {
        mockHoldingReads(
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

        const requirements = await getGeneralAdapterRequirements(mockClient, {
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
        expect(permit.action.args.amount).toBe(mockAmount);
      });
    });

    describe("Flow 3: Permit2", () => {
      test("should return permit2 requirement with prior approval for permit2", async () => {
        mockHoldingReads(
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

        const requirements = await getGeneralAdapterRequirements(mockClient, {
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
        mockHoldingReads(
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

        const requirements = await getGeneralAdapterRequirements(mockClient, {
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

      test("should return permit2 requirement when residual permit2 allowance is sufficient", async () => {
        mockHoldingReads(
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
              expiration: 2n ** 48n - 1n,
              nonce: 0n,
            },
            erc2612Nonce: undefined,
            canTransfer: false,
            balance: 0n,
          }),
        );

        const requirements = await getGeneralAdapterRequirements(mockClient, {
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

      test("should return permit2 requirement when residual permit2 allowance is expired", async () => {
        mockHoldingReads(
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
              expiration: 0n, // Expired
              nonce: 0n,
            },
            erc2612Nonce: undefined,
            canTransfer: false,
            balance: 0n,
          }),
        );

        const requirements = await getGeneralAdapterRequirements(mockClient, {
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
        mockHoldingReads(
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

        const requirements = await getGeneralAdapterRequirements(mockClient, {
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
        mockHoldingReads(
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

        const requirements = await getGeneralAdapterRequirements(mockClient, {
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
        useMockClient({ ...mainnet, id: noPermit2ChainId });
        mockHoldingReads(
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

        const requirements = await getGeneralAdapterRequirements(mockClient, {
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
    test("getTokenRequirementActions emits ERC-20 transfer when no signature is provided", () => {
      expect(
        getTokenRequirementActions({
          asset: usdc,
          amount: mockAmount,
          recipient: generalAdapter1,
        }),
      ).toEqual([
        {
          type: "erc20TransferFrom",
          args: [usdc, mockAmount, generalAdapter1, false],
        },
      ]);
    });

    test("getTokenRequirementActions throws when permit2 signature args omit expiration", () => {
      expect(() =>
        getTokenRequirementActions({
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
          } as unknown as PermitRequirementSignature,
        }),
      ).toThrow(Permit2ExpirationMissingError);
    });

    test("getTokenRequirementActions rejects BlueBundlesV1 SignatureTransfer results", () => {
      expect(() =>
        getTokenRequirementActions({
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
              type: "permit2SignatureTransfer",
              args: {
                spender: generalAdapter1,
                amount: mockAmount,
                nonce: 0n,
                deadline: 1n,
              },
            },
          } as unknown as PermitRequirementSignature,
        }),
      ).toThrow(UnexpectedRequirementSignatureError);
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

    test("getGeneralAdapterRequirementsPermit returns an exact permit requirement", async () => {
      const requirements = await getGeneralAdapterRequirementsPermit(
        mockClient,
        {
          token: usdc,
          chainId: mainnet.id,
          args: { amount: mockAmount },
          nonce: 0n,
        },
      );

      expect(requirements).toHaveLength(1);
      expect(requirements[0]?.action.type).toBe("permit");
      expect(requirements[0]?.action.args.amount).toBe(mockAmount);
    });
  });
});

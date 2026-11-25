import { getChainAddresses, Token } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import {
  type getBundlesTokenRequirements,
  type getParsedBundlesTokenRequirements,
  parseGetBundlesTokenRequirements,
} from "../../entities/requirements/getBundlesTokenRequirements.js";
import {
  type getParsedUnusedPermit2Nonce,
  type getUnusedPermit2Nonce,
  parseUnusedPermit2Nonce,
} from "../../entities/requirements/getUnusedPermit2Nonce.js";
import {
  type getParsedVaultBundlesSharesRequirements,
  type getVaultBundlesSharesRequirements,
  parseVaultBundlesSharesRequirements,
} from "../../entities/requirements/getVaultBundlesSharesRequirements.js";
import {
  ExpiredDeadlineError,
  NegativeInputError,
  NonPositiveInputError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../types/index.js";
import {
  parseBundlesTokenRequirements,
  type resolveBundlesTokenRequirements,
  type resolveParsedBundlesTokenRequirements,
} from "../bundles/resolveBundlesTokenRequirements.js";
import {
  getBlueAuthorizationRequirement,
  type getParsedBlueAuthorizationRequirement,
  parseBlueAuthorizationRequirement,
} from "./blue/getBlueAuthorizationRequirement.js";
import {
  encodeBlueSignatureAuthorization,
  encodeParsedBlueSignatureAuthorization,
  parseBlueSignatureAuthorization,
} from "./encode/encodeBlueSignatureAuthorization.js";
import {
  type encodeErc20Approval,
  type encodeParsedErc20Approval,
  parseErc20Approval,
} from "./encode/encodeErc20Approval.js";
import {
  encodeErc20Permit,
  type encodeParsedErc20Permit,
  parseErc20Permit,
} from "./encode/encodeErc20Permit.js";
import {
  encodeErc20Permit2SignatureTransfer,
  encodeParsedErc20Permit2SignatureTransfer,
  parseErc20Permit2SignatureTransfer,
} from "./encode/encodeErc20Permit2SignatureTransfer.js";
import {
  type encodeParsedVaultSharesPermit,
  type encodeVaultSharesPermit,
  parseVaultSharesPermit,
} from "./encode/encodeVaultSharesPermit.js";
import {
  type getParsedRequirementsApproval,
  type getRequirementsApproval,
  parseRequirementsApproval,
} from "./getRequirementsApproval.js";
import {
  type getMidnightApprovalRequirements,
  type getParsedMidnightApprovalRequirements,
  parseMidnightApprovalRequirements,
} from "./midnight/getMidnightApprovalRequirements.js";
import {
  type getMidnightAuthorizationRequirement,
  type getParsedMidnightAuthorizationRequirement,
  parseMidnightAuthorizationRequirement,
} from "./midnight/getMidnightAuthorizationRequirement.js";

const chainId = mainnet.id;
const owner = "0x0000000000000000000000000000000000000001" as const;
const token = getChainAddress(chainId, "usdc");
const spender = getChainAddress(chainId, "bundles.blueBundlesV1");

describe("requirement whole-operation constructors", () => {
  test("constructors preserve fields inherited from a params prototype", () => {
    const handle = createMockClient(mainnet);
    const own = <T extends object>(input: T): T => input;
    const inherited = <T extends object>(input: T): T => Object.create(input);
    const construct = (wrap: typeof own) => {
      const permit = {
        token,
        spender,
        owner,
        chainId,
        amount: 1n,
        nonce: 0n,
        deadline: 200n,
        now: 100n,
      };
      const vault = new Token({ address: token, name: "Vault" });
      const shares = {
        vault,
        version: "vaultV2" as const,
        spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
        owner,
        chainId,
        nonce: 0n,
        deadline: 200n,
        now: 100n,
      };
      const midnight = getChainAddress(chainId, "midnightBundlesV2");
      return [
        parseErc20Approval(wrap({ token, spender, amount: 1n, chainId })),
        parseRequirementsApproval(
          wrap({
            address: token,
            chainId,
            args: wrap({ spendAmount: 1n, spender }),
            allowances: 0n,
          }),
        ),
        parseErc20Permit(handle.client, wrap(permit)),
        parseErc20Permit2SignatureTransfer(wrap(permit)),
        parseVaultSharesPermit(wrap(shares)),
        parseBlueSignatureAuthorization(
          handle.client,
          wrap({ ...permit, authorized: spender }),
        ),
        parseBlueAuthorizationRequirement(
          wrap({
            viemClient: handle.client,
            userAddress: owner,
            chainId,
            deadline: 200n,
            supportSignature: true,
          }),
        ),
        parseMidnightApprovalRequirements(
          wrap({
            viemClient: handle.client,
            token,
            owner,
            chainId,
            spender: midnight,
            amount: 1n,
          }),
        ),
        parseMidnightAuthorizationRequirement(
          wrap({
            viemClient: handle.client,
            owner,
            chainId,
            authorized: midnight,
          }),
        ),
        parseGetBundlesTokenRequirements(
          handle.client,
          wrap({ ...permit, supportSignature: true }),
        ),
        parseVaultBundlesSharesRequirements(
          handle.client,
          wrap({
            ...shares,
            vaultData: vault,
            requiredShareAllowance: 1n,
            supportSignature: true,
          }),
        ),
        parseUnusedPermit2Nonce(handle.client, wrap({ owner, chainId })),
      ];
    };
    expect(construct(inherited)).toEqual(construct(own));
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("constructors and checked implementations remain outside the public barrels", () => {
    type InternalNames =
      | `parse${string}`
      | `encodeParsed${string}`
      | `getParsed${string}`
      | `resolveParsed${string}`
      | `complete${string}`
      | "prepareKnownSpenderApproval"
      | `${string}Input`;
    type RequirementsBarrel = keyof typeof import("./index.js");
    type BundlesBarrel = keyof typeof import("../bundles/index.js");
    type EntityRequirementsBarrel =
      keyof typeof import("../../entities/requirements/index.js");
    expectTypeOf<
      Extract<RequirementsBarrel, InternalNames>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<BundlesBarrel, InternalNames>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<EntityRequirementsBarrel, InternalNames>
    >().toEqualTypeOf<never>();
  });

  test("each constructor accepts the entire public invocation, not field witnesses", () => {
    expectTypeOf<Parameters<typeof parseErc20Approval>>().toEqualTypeOf<
      Parameters<typeof encodeErc20Approval>
    >();
    expectTypeOf<Parameters<typeof parseRequirementsApproval>>().toEqualTypeOf<
      Parameters<typeof getRequirementsApproval>
    >();
    expectTypeOf<Parameters<typeof parseErc20Permit>>().toEqualTypeOf<
      Parameters<typeof encodeErc20Permit>
    >();
    expectTypeOf<
      Parameters<typeof parseErc20Permit2SignatureTransfer>
    >().toEqualTypeOf<Parameters<typeof encodeErc20Permit2SignatureTransfer>>();
    expectTypeOf<Parameters<typeof parseVaultSharesPermit>>().toEqualTypeOf<
      Parameters<typeof encodeVaultSharesPermit>
    >();
    expectTypeOf<
      Parameters<typeof parseBlueSignatureAuthorization>
    >().toEqualTypeOf<Parameters<typeof encodeBlueSignatureAuthorization>>();
    expectTypeOf<
      Parameters<typeof parseBlueAuthorizationRequirement>
    >().toEqualTypeOf<Parameters<typeof getBlueAuthorizationRequirement>>();
    expectTypeOf<
      Parameters<typeof parseMidnightApprovalRequirements>
    >().toEqualTypeOf<Parameters<typeof getMidnightApprovalRequirements>>();
    expectTypeOf<
      Parameters<typeof parseMidnightAuthorizationRequirement>
    >().toEqualTypeOf<Parameters<typeof getMidnightAuthorizationRequirement>>();
    expectTypeOf<
      Parameters<typeof parseBundlesTokenRequirements>
    >().toEqualTypeOf<Parameters<typeof resolveBundlesTokenRequirements>>();
    expectTypeOf<
      Parameters<typeof parseGetBundlesTokenRequirements>
    >().toEqualTypeOf<Parameters<typeof getBundlesTokenRequirements>>();
    expectTypeOf<
      Parameters<typeof parseVaultBundlesSharesRequirements>
    >().toEqualTypeOf<Parameters<typeof getVaultBundlesSharesRequirements>>();
    expectTypeOf<Parameters<typeof parseUnusedPermit2Nonce>>().toEqualTypeOf<
      Parameters<typeof getUnusedPermit2Nonce>
    >();
  });

  test("raw invocations cannot bypass constructors to enter parsed implementations", () => {
    expectTypeOf<Parameters<typeof encodeErc20Approval>[0]>().not.toExtend<
      Parameters<typeof encodeParsedErc20Approval>[0]
    >();
    expectTypeOf<Parameters<typeof getRequirementsApproval>[0]>().not.toExtend<
      Parameters<typeof getParsedRequirementsApproval>[0]
    >();
    expectTypeOf<Parameters<typeof encodeErc20Permit>[1]>().not.toExtend<
      Parameters<typeof encodeParsedErc20Permit>[1]
    >();
    expectTypeOf<
      Parameters<typeof encodeErc20Permit2SignatureTransfer>[0]
    >().not.toExtend<
      Parameters<typeof encodeParsedErc20Permit2SignatureTransfer>[0]
    >();
    expectTypeOf<Parameters<typeof encodeVaultSharesPermit>[0]>().not.toExtend<
      Parameters<typeof encodeParsedVaultSharesPermit>[0]
    >();
    expectTypeOf<
      Parameters<typeof encodeBlueSignatureAuthorization>[1]
    >().not.toExtend<
      Parameters<typeof encodeParsedBlueSignatureAuthorization>[0]
    >();
    expectTypeOf<
      Parameters<typeof getBlueAuthorizationRequirement>[0]
    >().not.toExtend<
      Parameters<typeof getParsedBlueAuthorizationRequirement>[0]
    >();
    expectTypeOf<
      Parameters<typeof getMidnightApprovalRequirements>[0]
    >().not.toExtend<
      Parameters<typeof getParsedMidnightApprovalRequirements>[0]
    >();
    expectTypeOf<
      Parameters<typeof getMidnightAuthorizationRequirement>[0]
    >().not.toExtend<
      Parameters<typeof getParsedMidnightAuthorizationRequirement>[0]
    >();
    expectTypeOf<
      Parameters<typeof resolveBundlesTokenRequirements>[0]
    >().not.toExtend<
      Parameters<typeof resolveParsedBundlesTokenRequirements>[0]
    >();
    expectTypeOf<
      Parameters<typeof getBundlesTokenRequirements>[1]
    >().not.toExtend<Parameters<typeof getParsedBundlesTokenRequirements>[1]>();
    expectTypeOf<
      Parameters<typeof getVaultBundlesSharesRequirements>[1]
    >().not.toExtend<
      Parameters<typeof getParsedVaultBundlesSharesRequirements>[1]
    >();
    expectTypeOf<Parameters<typeof getUnusedPermit2Nonce>[1]>().not.toExtend<
      Parameters<typeof getParsedUnusedPermit2Nonce>[1]
    >();
  });

  test("constructors complete defaults without RPC or freezing a caller's client or vault", () => {
    const handle = createMockClient(mainnet);
    const invocation = {
      token,
      spender,
      owner,
      chainId,
      amount: 1n,
      deadline: 200n,
      now: 100n,
    };
    const parsed = parseGetBundlesTokenRequirements(handle.client, {
      ...invocation,
      supportSignature: true,
    });
    expect(parsed.useSimplePermit).toBe(true);
    expect(parsed).toMatchObject(invocation);
    const nonce = parseUnusedPermit2Nonce(handle.client, { owner, chainId });
    expect(nonce.startNonce).toBe(0n);
    const blue = parseBlueAuthorizationRequirement({
      viemClient: handle.client,
      chainId,
      userAddress: owner,
    });
    expect(blue.authorized).toBe(spender);
    const midnight = getChainAddress(chainId, "midnightBundlesV2");
    expect(
      parseMidnightAuthorizationRequirement({
        viemClient: handle.client,
        chainId,
        owner,
        authorized: midnight,
      }).authorized,
    ).toBe(midnight);
    expect(
      parseMidnightApprovalRequirements({
        ...invocation,
        viemClient: handle.client,
        spender: midnight,
      }).amount,
    ).toBe(1n);
    const vault = new Token({ address: token, name: "Vault" });
    const shares = parseVaultBundlesSharesRequirements(handle.client, {
      vaultData: vault,
      version: "vaultV2",
      chainId,
      owner,
      deadline: 200n,
      now: 100n,
      supportSignature: true,
      requiredShareAllowance: 1n,
    });
    expect(shares.vaultData).toBe(vault);
    expect(handle.request).not.toHaveBeenCalled();
    expect(Object.isFrozen(handle.client)).toBe(false);
    expect(Object.isFrozen(vault)).toBe(false);
  });

  // These clock-spy cases share Time.timestamp, so they must not overlap within this file.
  test.sequential("static signature constructors never observe a clock or make RPC calls", () => {
    const handle = createMockClient(mainnet);
    const timestamp = vi.spyOn(Time, "timestamp");
    try {
      const params = { token, spender, owner, chainId, amount: 1n, nonce: 0n };
      parseErc20Permit(handle.client, params);
      parseBlueSignatureAuthorization(handle.client, {
        ...params,
        authorized: spender,
      });
      parseErc20Permit2SignatureTransfer({ ...params, deadline: 200n });
      parseBundlesTokenRequirements({
        ...params,
        deadline: 200n,
        state: {
          type: "permit2SignatureTransfer",
          permit2Allowance: 0n,
          permit2Nonce: 0n,
          nonceBitmap: 0n,
        },
      });
      parseVaultSharesPermit({
        vault: new Token({ address: token }),
        version: "vaultV2",
        spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
        owner,
        chainId,
        nonce: 0n,
        deadline: 200n,
      });
      expect(timestamp).not.toHaveBeenCalled();
      expect(handle.request).not.toHaveBeenCalled();
    } finally {
      timestamp.mockRestore();
    }
  });

  test("approval construction reads the nested invocation once", () => {
    const args = vi
      .fn()
      .mockReturnValueOnce({ spendAmount: 1n, spender })
      .mockReturnValue({ spendAmount: 0n, spender: zeroAddress });
    const parsed = parseRequirementsApproval({
      address: token,
      chainId,
      get args() {
        return args();
      },
      allowances: 0n,
    });
    expect(args).toHaveBeenCalledTimes(1);
    expect(parsed.args).toEqual({ spendAmount: 1n, spender });
    expect(parsed.approvals[0]?.spender).toBe(spender);
  });

  test("a complete approval constructor cannot bless an arbitrary raw spender", () => {
    expect(() =>
      parseRequirementsApproval({
        address: token,
        chainId,
        args: { spendAmount: 1n, spender: zeroAddress },
        allowances: 0n,
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
    expect(() =>
      parseErc20Permit2SignatureTransfer({
        token,
        spender: zeroAddress,
        chainId,
        amount: 1n,
        nonce: 0n,
        deadline: 200n,
        now: 100n,
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
  });

  test.sequential("checked signatures keep dynamic expiry at consumption, including explicit now", async () => {
    const handle = createMockClient(mainnet);
    const timestamp = vi.spyOn(Time, "timestamp").mockReturnValue(200n);
    try {
      const params = {
        token,
        spender,
        owner,
        chainId,
        amount: 1n,
        nonce: 0n,
        deadline: 150n,
      };
      const blue = parseBlueSignatureAuthorization(handle.client, {
        ...params,
        authorized: spender,
      });
      const permit2 = parseErc20Permit2SignatureTransfer(params);
      expect(timestamp).not.toHaveBeenCalled();
      await expect(
        encodeParsedBlueSignatureAuthorization(blue),
      ).rejects.toBeInstanceOf(ExpiredDeadlineError);
      expect(() => encodeParsedErc20Permit2SignatureTransfer(permit2)).toThrow(
        ExpiredDeadlineError,
      );
      const explicit = await encodeBlueSignatureAuthorization(handle.client, {
        ...params,
        authorized: spender,
        now: 100n,
      });
      expect(explicit.action.args.deadline).toBe(150n);
      expect(handle.request).not.toHaveBeenCalled();
    } finally {
      timestamp.mockRestore();
    }
  });

  test.sequential("legacy Permit2 retains quantity-before-clock and expiry-before-spender errors", () => {
    const timestamp = vi.spyOn(Time, "timestamp").mockReturnValue(200n);
    const params = {
      token,
      spender: zeroAddress,
      chainId,
      amount: 1n,
      nonce: 0n,
      deadline: 150n,
    };
    try {
      expect(() =>
        encodeErc20Permit2SignatureTransfer({ ...params, amount: -1n }),
      ).toThrow(NegativeInputError);
      expect(() =>
        encodeErc20Permit2SignatureTransfer({ ...params, deadline: 0n }),
      ).toThrow(NonPositiveInputError);
      expect(timestamp).not.toHaveBeenCalled();
      expect(() => encodeErc20Permit2SignatureTransfer(params)).toThrow(
        ExpiredDeadlineError,
      );
      expect(timestamp).toHaveBeenCalledTimes(1);
      expect(() =>
        encodeErc20Permit2SignatureTransfer({ ...params, now: 100n }),
      ).toThrow(UnsupportedErc20ApprovalSpenderError);
      expect(timestamp).toHaveBeenCalledTimes(1);
    } finally {
      timestamp.mockRestore();
    }
  });

  test.sequential("ERC-2612 uses one default-clock observation and no explicit-now clock", async () => {
    const handle = createMockClient(mainnet);
    for (const [functionName, result] of [
      ["decimals", 6],
      ["name", "USD Coin"],
      ["symbol", "USDC"],
    ] as const) {
      mockRead(handle, { address: token, abi: erc20Abi, functionName, result });
    }
    handle.dispatch.set(`${token.toLowerCase()}|0x84b0196e`, "0x");
    const timestamp = vi
      .spyOn(Time, "timestamp")
      .mockReturnValueOnce(100n)
      .mockReturnValue(101n);
    const params = {
      token,
      spender,
      owner,
      chainId,
      amount: 1n,
      nonce: 0n,
      supportDeployless: false,
    };
    try {
      const legacy = encodeErc20Permit(handle.client, params);
      expect(timestamp).toHaveBeenCalledTimes(1);
      expect((await legacy).action.args.deadline).toBe(7_300n);
      timestamp.mockClear();
      await expect(
        encodeErc20Permit(handle.client, {
          ...params,
          deadline: 100n,
          now: 100n,
        }),
      ).rejects.toBeInstanceOf(ExpiredDeadlineError);
      expect(timestamp).not.toHaveBeenCalled();
    } finally {
      timestamp.mockRestore();
    }
  });

  test.sequential("Blue signature freshness is rechecked after nonce reads without changing the RPC trace", async () => {
    const handle = createMockClient(mainnet);
    const { blue } = getChainAddresses(chainId);
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: false,
    });
    mockRead(handle, {
      address: blue,
      abi: blueAbi,
      functionName: "nonce",
      result: 3n,
    });
    const timestamp = vi
      .spyOn(Time, "timestamp")
      .mockReturnValueOnce(100n)
      .mockReturnValue(200n);
    try {
      await expect(
        getBlueAuthorizationRequirement({
          viemClient: handle.client,
          chainId,
          userAddress: owner,
          supportSignature: true,
          deadline: 150n,
        }),
      ).rejects.toBeInstanceOf(ExpiredDeadlineError);
      expect(handle.request.mock.calls.map(([call]) => call.method)).toEqual([
        "eth_chainId",
        "eth_call",
        "eth_call",
      ]);
    } finally {
      timestamp.mockRestore();
    }
  });
});

import type { MarketId } from "@morpho-org/blue-sdk";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { type Address, getAddress } from "viem";
import type { SimulationAuthorization } from "../../domain/authorizations.js";
import type { VerificationSnapshot } from "../../domain/evidence.js";
import type { EffectiveSimulationLimits } from "../../domain/limits.js";
import type { DecodedOperation } from "../../domain/operations.js";
import type { DecodedBundle, PinnedInputs } from "../../domain/stages.js";
import { AuthorizationRequestMismatchError } from "../../errors.js";
import { checkRequests, deriveExpectedRequests } from "./policy.js";

const addresses = getChainAddresses(1);
const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const USDT: Address = getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7");
const VAULT: Address = getAddress("0x2222222222222222222222222222222222222222");
const BUNDLE = addresses.bundles!.vaultBundlesV1!;
const BLUE_BUNDLE = addresses.bundles!.blueBundlesV1!;
const MORPHO = addresses.blue;
const PERMIT2 = addresses.permit2!;
const WNATIVE = addresses.wNative;

const MARKET = {
  marketId: `0x${"cd".repeat(32)}` as MarketId,
  params: {
    loanToken: TOKEN,
    collateralToken: TOKEN,
    oracle: getAddress("0x4444444444444444444444444444444444444444"),
    irm: getAddress("0x5555555555555555555555555555555555555555"),
    lltv: 8n * 10n ** 17n,
  },
};

const NOW = 1_700_000_000n;
const DEADLINE = NOW + 3_600n;

const limits: EffectiveSimulationLimits = {
  maxSlippageWad: 10n ** 15n,
  minLltvBufferWad: 5n * 10n ** 15n,
  maxSignatureLifetimeSeconds: 7_200n,
  wallet: { maxDebit: [], minCredit: [] },
  operations: [],
};

const depositOp = (overrides: Record<string, unknown> = {}): DecodedOperation =>
  ({
    type: "vaultV1Deposit",
    transactionIndex: 0,
    callPath: [],
    chainId: 1,
    deployment: BUNDLE,
    owner: OWNER,
    route: "vaultBundlesV1",
    vault: VAULT,
    asset: TOKEN,
    receiver: OWNER,
    deadline: DEADLINE,
    referralFee: { rateWad: 0n, recipient: OWNER },
    tokenSignature: { type: "none" },
    maxSharePriceE27: 0n,
    funding: { type: "erc20", token: TOKEN, assets: 1_000_000n },
    ...overrides,
  }) as DecodedOperation;

const supplyOp = (overrides: Record<string, unknown> = {}): DecodedOperation =>
  ({
    type: "blueSupply",
    transactionIndex: 0,
    callPath: [],
    chainId: 1,
    deployment: BLUE_BUNDLE,
    owner: OWNER,
    route: "blueBundlesV1",
    market: MARKET,
    onBehalf: OWNER,
    receiver: OWNER,
    deadline: DEADLINE,
    referralFee: { rateWad: 0n, recipient: OWNER },
    tokenSignature: { type: "none" },
    authorizationSignature: { type: "none" },
    assets: 1_000_000n,
    funding: { type: "erc20", token: TOKEN, assets: 1_000_000n },
    ...overrides,
  }) as unknown as DecodedOperation;

const borrowOp = (
  overrides: Record<string, unknown> = {},
  index = 0,
): DecodedOperation =>
  ({
    type: "blueBorrow",
    transactionIndex: index,
    callPath: [],
    chainId: 1,
    deployment: BLUE_BUNDLE,
    owner: OWNER,
    route: "blueBundlesV1",
    market: MARKET,
    onBehalf: OWNER,
    receiver: OWNER,
    deadline: DEADLINE,
    referralFee: { rateWad: 0n, recipient: OWNER },
    tokenSignature: { type: "none" },
    authorizationSignature: { type: "none" },
    borrowAssets: 1_000_000n,
    maxLtvWad: 0n,
    reallocations: [],
    ...overrides,
  }) as unknown as DecodedOperation;

const blueAuthorizationOp = (
  overrides: Record<string, unknown> = {},
): DecodedOperation =>
  ({
    type: "blueAuthorization",
    transactionIndex: 0,
    callPath: [],
    chainId: 1,
    deployment: MORPHO,
    owner: OWNER,
    route: "morpho",
    authorizer: OWNER,
    authorized: BLUE_BUNDLE,
    isAuthorized: true,
    operator: { type: "bundles" },
    signature: { type: "none" },
    ...overrides,
  }) as unknown as DecodedOperation;

// biome-ignore lint/complexity/useMaxParams: test fixture reads clearest positionally
const makeInputs = (
  operations: readonly DecodedOperation[],
  before?: Partial<VerificationSnapshot>,
  authorizations: readonly SimulationAuthorization[] = [],
  mode: "preview" | "final" = "preview",
): PinnedInputs =>
  ({
    bundle: {
      request: { chainId: 1, mode, authorizations },
      owner: OWNER,
      operations,
    } as DecodedBundle,
    context: {
      chainId: 1,
      stateBlockNumber: 24_000_000n,
      stateBlockHash: `0x${"ab".repeat(32)}`,
      stateBlockTimestamp: NOW,
      blockNumber: 24_000_000n,
      blockTimestamp: NOW,
    },
    before: {
      wallet: [],
      permissions: [],
      positions: [],
      vaults: [],
      markets: [],
      ...before,
    },
    internals: { vaultData: new Map() },
  }) as unknown as PinnedInputs;

const approval = (
  overrides: Partial<
    Extract<SimulationAuthorization, { type: "erc20Approval" }>
  > = {},
): SimulationAuthorization => ({
  type: "erc20Approval",
  token: TOKEN,
  owner: OWNER,
  spender: BUNDLE,
  amount: 1_000_000n,
  ...overrides,
});

const permit = (
  overrides: {
    spender?: Address;
    value?: bigint;
    nonce?: bigint;
    deadline?: bigint;
    verifyingContract?: Address;
    chainId?: number | bigint;
    owner?: Address;
  } = {},
): SimulationAuthorization => ({
  type: "erc2612Permit",
  typedData: {
    domain: {
      chainId: overrides.chainId ?? 1,
      verifyingContract: overrides.verifyingContract ?? TOKEN,
    },
    primaryType: "Permit",
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    message: {
      owner: overrides.owner ?? OWNER,
      spender: overrides.spender ?? BUNDLE,
      value: overrides.value ?? 1_000_000n,
      nonce: overrides.nonce ?? 0n,
      deadline: overrides.deadline ?? DEADLINE,
    },
  },
});

const permit2Transfer = (
  overrides: {
    token?: Address;
    amount?: bigint;
    spender?: Address;
    nonce?: bigint;
    deadline?: bigint;
    verifyingContract?: Address;
    owner?: Address;
  } = {},
): SimulationAuthorization => ({
  type: "permit2SignatureTransfer",
  owner: overrides.owner ?? OWNER,
  typedData: {
    domain: {
      chainId: 1,
      verifyingContract: overrides.verifyingContract ?? PERMIT2,
    },
    primaryType: "PermitTransferFrom",
    types: {
      PermitTransferFrom: [
        { name: "permitted", type: "TokenPermissions" },
        { name: "spender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
      TokenPermissions: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    },
    message: {
      permitted: {
        token: overrides.token ?? TOKEN,
        amount: overrides.amount ?? 1_000_000n,
      },
      spender: overrides.spender ?? BLUE_BUNDLE,
      nonce: overrides.nonce ?? 0n,
      deadline: overrides.deadline ?? DEADLINE,
    },
  },
});

const blueAuthorization = (
  overrides: Partial<
    Extract<SimulationAuthorization, { type: "blueAuthorization" }>
  > = {},
): SimulationAuthorization => ({
  type: "blueAuthorization",
  authorizer: OWNER,
  authorized: BLUE_BUNDLE,
  isAuthorized: true,
  ...overrides,
});

const blueAuthorizationSignature = (
  overrides: {
    authorized?: Address;
    authorizer?: Address;
    nonce?: bigint;
    deadline?: bigint;
    verifyingContract?: Address;
  } = {},
): SimulationAuthorization => ({
  type: "blueAuthorizationSignature",
  typedData: {
    domain: {
      chainId: 1,
      verifyingContract: overrides.verifyingContract ?? MORPHO,
    },
    primaryType: "Authorization",
    types: {
      Authorization: [
        { name: "authorizer", type: "address" },
        { name: "authorized", type: "address" },
        { name: "isAuthorized", type: "bool" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    message: {
      authorizer: overrides.authorizer ?? OWNER,
      authorized: overrides.authorized ?? BLUE_BUNDLE,
      isAuthorized: true,
      nonce: overrides.nonce ?? 0n,
      deadline: overrides.deadline ?? DEADLINE,
    },
  },
});

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const expectMismatch = (
  fn: () => unknown,
  location: unknown,
  messagePart?: string,
): void => {
  try {
    fn();
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthorizationRequestMismatchError);
    expect(
      (error as AuthorizationRequestMismatchError).context.location,
    ).toEqual(location);
    if (messagePart != null)
      expect((error as Error).message).toContain(messagePart);
  }
};

describe("deriveExpectedRequests", () => {
  test("default: an unsigned erc20 funding pull yields an exact tokenPull", () => {
    const inputs = makeInputs([depositOp()]);
    const expected = deriveExpectedRequests({
      bundle: inputs.bundle,
      inputs,
      limits,
      context: inputs.context,
    });
    expect(expected).toEqual([
      {
        type: "tokenPull",
        operationIndex: 0,
        token: TOKEN,
        owner: OWNER,
        spender: BUNDLE,
        amount: 1_000_000n,
        signature: { type: "none" },
      },
    ]);
  });

  test("behavior: native funding creates no tokenPull", () => {
    const inputs = makeInputs([
      supplyOp({
        funding: { type: "native", wrappedToken: WNATIVE, assets: 5n },
      }),
    ]);
    const expected = deriveExpectedRequests({
      bundle: inputs.bundle,
      inputs,
      limits,
      context: inputs.context,
    });
    expect(expected).toEqual([]);
  });

  test("behavior: a blueAuthorization op issues no request and satisfies later authority", () => {
    const inputs = makeInputs([blueAuthorizationOp(), borrowOp({}, 1)]);
    const expected = deriveExpectedRequests({
      bundle: inputs.bundle,
      inputs,
      limits,
      context: inputs.context,
    });
    expect(expected).toEqual([
      {
        type: "blueOperatorAuthority",
        operationIndex: 1,
        authorizer: OWNER,
        authorized: BLUE_BUNDLE,
        signature: { type: "none" },
        satisfiedByEarlierOp: true,
      },
    ]);
  });

  test("behavior: force-redeem burns shares inside the vault multicall — no pull request", () => {
    const op = {
      type: "vaultV2ForceRedeem",
      transactionIndex: 0,
      callPath: [],
      chainId: 1,
      deployment: VAULT,
      owner: OWNER,
      route: "vaultV2Multicall",
      vault: VAULT,
      asset: TOKEN,
      onBehalf: OWNER,
      receiver: OWNER,
      shares: 42n,
      deallocations: [],
    } as unknown as DecodedOperation;
    const inputs = makeInputs([op]);
    const expected = deriveExpectedRequests({
      bundle: inputs.bundle,
      inputs,
      limits,
      context: inputs.context,
    });
    expect(expected).toEqual([]);
  });
});

describe("checkRequests", () => {
  describe("preview", () => {
    test("default: a matching approval passes and yields an approve call", () => {
      const inputs = makeInputs([depositOp()], {}, [approval()]);
      const validated = checkRequests({ inputs, limits });
      expect(validated.preparations).toHaveLength(1);
      const prep = validated.preparations[0]!;
      expect(prep.authorizationIndex).toBe(0);
      expect(prep.calls).toHaveLength(1);
      expect(prep.calls[0]!.to).toBe(TOKEN);
      expect(prep.expected).toEqual([
        {
          type: "erc20Allowance",
          token: TOKEN,
          owner: OWNER,
          spender: BUNDLE,
          amount: 1_000_000n,
        },
      ]);
    });

    test("behavior: an erc2612Permit covers a tokenPull", () => {
      const inputs = makeInputs(
        [supplyOp()],
        {
          permissions: [
            {
              type: "erc2612Nonce",
              verifyingContract: TOKEN,
              owner: OWNER,
              nonce: 7n,
            },
          ],
        },
        [permit({ spender: BLUE_BUNDLE, nonce: 7n })],
      );
      const validated = checkRequests({ inputs, limits });
      expect(validated.preparations).toHaveLength(1);
      expect(validated.preparations[0]!.calls[0]!.to).toBe(TOKEN);
    });

    test("behavior: a permit2SignatureTransfer covers a tokenPull with a pending permit2 approval", () => {
      const inputs = makeInputs([supplyOp()], {}, [
        permit2Transfer({ spender: BLUE_BUNDLE }),
        approval({
          spender: PERMIT2,
          amount: 1_000_000n,
        }),
      ]);
      const validated = checkRequests({ inputs, limits });
      expect(validated.preparations).toHaveLength(2);
    });

    test("behavior: a permit2SignatureTransfer also passes with a pinned permit2 allowance", () => {
      const inputs = makeInputs(
        [supplyOp()],
        {
          permissions: [
            {
              type: "erc20Allowance",
              token: TOKEN,
              owner: OWNER,
              spender: PERMIT2,
              amount: 2n ** 200n,
            },
          ],
        },
        [permit2Transfer({ spender: BLUE_BUNDLE })],
      );
      expect(() => checkRequests({ inputs, limits })).not.toThrow();
    });

    test("behavior: a blueAuthorization covers operator authority", () => {
      const inputs = makeInputs([borrowOp()], {}, [blueAuthorization()]);
      const validated = checkRequests({ inputs, limits });
      expect(validated.preparations[0]!.calls[0]!.to).toBe(MORPHO);
      expect(validated.preparations[0]!.expected).toEqual([
        {
          type: "blueAuthorization",
          morpho: MORPHO,
          authorizer: OWNER,
          authorized: BLUE_BUNDLE,
          isAuthorized: true,
        },
      ]);
    });

    test("behavior: a blueAuthorizationSignature covers operator authority", () => {
      const inputs = makeInputs(
        [borrowOp()],
        {
          permissions: [
            {
              type: "blueAuthorizationNonce",
              verifyingContract: MORPHO,
              owner: OWNER,
              nonce: 3n,
            },
          ],
        },
        [blueAuthorizationSignature({ nonce: 3n })],
      );
      expect(() => checkRequests({ inputs, limits })).not.toThrow();
    });

    test("behavior: an earlier blueAuthorization op satisfies a later borrow", () => {
      const inputs = makeInputs([blueAuthorizationOp(), borrowOp({}, 1)]);
      expect(() => checkRequests({ inputs, limits })).not.toThrow();
    });

    test("error: AuthorizationRequestMismatchError on a non-exact amount", () => {
      const inputs = makeInputs([depositOp()], {}, [approval({ amount: 2n })]);
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "authorization", authorizationIndex: 0 },
        "exact",
      );
    });

    test("error: AuthorizationRequestMismatchError on the wrong spender", () => {
      const inputs = makeInputs([depositOp()], {}, [
        approval({ spender: BLUE_BUNDLE }),
      ]);
      expectMismatch(() => checkRequests({ inputs, limits }), {
        type: "authorization",
        authorizationIndex: 0,
      });
    });

    test("error: AuthorizationRequestMismatchError on an uncovered requirement", () => {
      const inputs = makeInputs([depositOp()], {}, []);
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "transaction", txIdx: 0, callPath: [] },
        "not covered",
      );
    });

    test("error: AuthorizationRequestMismatchError on a redundant authorization", () => {
      const inputs = makeInputs(
        [depositOp()],
        {
          permissions: [
            {
              type: "erc20Allowance",
              token: TOKEN,
              owner: OWNER,
              spender: BUNDLE,
              amount: 2n ** 200n,
            },
          ],
        },
        [approval()],
      );
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "authorization", authorizationIndex: 0 },
        "redundant",
      );
    });

    test("error: AuthorizationRequestMismatchError on a duplicate authorization", () => {
      const inputs = makeInputs([depositOp()], {}, [approval(), approval()]);
      expectMismatch(() => checkRequests({ inputs, limits }), {
        type: "authorization",
        authorizationIndex: 1,
      });
    });

    test("behavior: zero-reset accepted under all three conditions", () => {
      const inputs = makeInputs(
        [
          depositOp({
            asset: USDT,
            funding: { type: "erc20", token: USDT, assets: 9n },
          }),
        ],
        {
          permissions: [
            {
              type: "erc20Allowance",
              token: USDT,
              owner: OWNER,
              spender: BUNDLE,
              amount: 1n,
            },
          ],
        },
        [
          approval({ token: USDT, amount: 0n }),
          approval({ token: USDT, amount: 9n }),
        ],
      );
      const validated = checkRequests({ inputs, limits });
      expect(validated.preparations).toHaveLength(2);
      expect(validated.preparations[0]!.calls[0]!.to).toBe(USDT);
    });

    test.each([
      [
        "not immediately before",
        [
          approval({ token: USDT, amount: 0n }),
          approval({ token: TOKEN }),
          approval({ token: USDT, amount: 9n }),
        ],
      ],
      ["not approve-only-once", [approval({ amount: 0n }), approval()]],
    ])(
      "error: AuthorizationRequestMismatchError on a zero-reset %s",
      (_name, auths) => {
        const inputs = makeInputs(
          [depositOp()],
          {
            permissions: [
              {
                type: "erc20Allowance",
                token: TOKEN,
                owner: OWNER,
                spender: BUNDLE,
                amount: 1n,
              },
            ],
          },
          auths as SimulationAuthorization[],
        );
        expectMismatch(() => checkRequests({ inputs, limits }), {
          type: "authorization",
          authorizationIndex: 0,
        });
      },
    );

    test("error: AuthorizationRequestMismatchError on a zero-reset without a pinned allowance", () => {
      const inputs = makeInputs(
        [
          depositOp({
            asset: USDT,
            funding: { type: "erc20", token: USDT, assets: 9n },
          }),
        ],
        {},
        [
          approval({ token: USDT, amount: 0n }),
          approval({ token: USDT, amount: 9n }),
        ],
      );
      expectMismatch(() => checkRequests({ inputs, limits }), {
        type: "authorization",
        authorizationIndex: 0,
      });
    });

    test.each([
      ["expired", NOW],
      ["over the lifetime bound", NOW + 7_201n],
    ])(
      "error: AuthorizationRequestMismatchError on a deadline %s",
      (_name, deadline) => {
        const inputs = makeInputs(
          [supplyOp()],
          {
            permissions: [
              {
                type: "erc2612Nonce",
                verifyingContract: TOKEN,
                owner: OWNER,
                nonce: 0n,
              },
            ],
          },
          [permit({ spender: BLUE_BUNDLE, deadline: deadline as bigint })],
        );
        expectMismatch(() => checkRequests({ inputs, limits }), {
          type: "authorization",
          authorizationIndex: 0,
        });
      },
    );

    test("error: AuthorizationRequestMismatchError on a wrong erc2612 nonce", () => {
      const inputs = makeInputs(
        [supplyOp()],
        {
          permissions: [
            {
              type: "erc2612Nonce",
              verifyingContract: TOKEN,
              owner: OWNER,
              nonce: 4n,
            },
          ],
        },
        [permit({ spender: BLUE_BUNDLE, nonce: 5n })],
      );
      expectMismatch(() => checkRequests({ inputs, limits }), {
        type: "authorization",
        authorizationIndex: 0,
      });
    });

    test("error: AuthorizationRequestMismatchError for a used permit2 bit", () => {
      const inputs = makeInputs(
        [supplyOp()],
        {
          permissions: [
            {
              type: "permit2Nonce",
              permit2: PERMIT2,
              owner: OWNER,
              nonce: 0n,
              wordPosition: 0n,
              bitmap: 1n,
              consumed: true,
            },
            {
              type: "erc20Allowance",
              token: TOKEN,
              owner: OWNER,
              spender: PERMIT2,
              amount: 2n ** 200n,
            },
          ],
        },
        [permit2Transfer({ spender: BLUE_BUNDLE })],
      );
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "authorization", authorizationIndex: 0 },
        "already used",
      );
    });

    test("error: AuthorizationRequestMismatchError when the permit2 prerequisite allowance is missing", () => {
      const inputs = makeInputs([supplyOp()], {}, [
        permit2Transfer({ spender: BLUE_BUNDLE }),
      ]);
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "authorization", authorizationIndex: 0 },
        "Permit2 allowance",
      );
    });
  });

  describe("final", () => {
    test("behavior: passes when the pinned allowance covers the pull", () => {
      const inputs = makeInputs(
        [depositOp()],
        {
          permissions: [
            {
              type: "erc20Allowance",
              token: TOKEN,
              owner: OWNER,
              spender: BUNDLE,
              amount: 1_000_000n,
            },
          ],
        },
        [],
        "final",
      );
      const validated = checkRequests({ inputs, limits });
      expect(validated.preparations).toEqual([]);
    });

    test("error: AuthorizationRequestMismatchError when the allowance is missing", () => {
      const inputs = makeInputs([depositOp()], {}, [], "final");
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "transaction", txIdx: 0, callPath: [] },
        "below the required",
      );
    });

    test("error: AuthorizationRequestMismatchError on authorizations in final mode", () => {
      const inputs = makeInputs([depositOp()], {}, [approval()], "final");
      expectMismatch(() => checkRequests({ inputs, limits }), {
        type: "authorization",
        authorizationIndex: 0,
      });
    });

    test("behavior: an embedded erc2612Permit needs a matching nonce and a live deadline", () => {
      const op = supplyOp({
        tokenSignature: {
          type: "erc2612Permit",
          nonce: 2n,
          deadline: DEADLINE,
        },
      });
      const inputs = makeInputs(
        [op],
        {
          permissions: [
            {
              type: "erc2612Nonce",
              verifyingContract: TOKEN,
              owner: OWNER,
              nonce: 2n,
            },
          ],
        },
        [],
        "final",
      );
      expect(() => checkRequests({ inputs, limits })).not.toThrow();
    });

    test("error: AuthorizationRequestMismatchError on an embedded permit nonce mismatch", () => {
      const op = supplyOp({
        tokenSignature: {
          type: "erc2612Permit",
          nonce: 2n,
          deadline: DEADLINE,
        },
      });
      const inputs = makeInputs(
        [op],
        {
          permissions: [
            {
              type: "erc2612Nonce",
              verifyingContract: TOKEN,
              owner: OWNER,
              nonce: 9n,
            },
          ],
        },
        [],
        "final",
      );
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "transaction", txIdx: 0, callPath: [] },
        "pinned nonce",
      );
    });

    test("error: AuthorizationRequestMismatchError on an expired embedded signature", () => {
      const op = supplyOp({
        tokenSignature: { type: "erc2612Permit", nonce: 0n, deadline: NOW },
      });
      const inputs = makeInputs([op], {}, [], "final");
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "transaction", txIdx: 0, callPath: [] },
        "not after",
      );
    });

    test("behavior: an embedded permit2 transfer needs an unused bit and permit2 allowance", () => {
      const op = supplyOp({
        tokenSignature: {
          type: "permit2SignatureTransfer",
          nonce: 0n,
          deadline: DEADLINE,
        },
      });
      const inputs = makeInputs(
        [op],
        {
          permissions: [
            {
              type: "permit2Nonce",
              permit2: PERMIT2,
              owner: OWNER,
              nonce: 0n,
              wordPosition: 0n,
              bitmap: 0n,
              consumed: false,
            },
            {
              type: "erc20Allowance",
              token: TOKEN,
              owner: OWNER,
              spender: PERMIT2,
              amount: 1_000_000n,
            },
          ],
        },
        [],
        "final",
      );
      expect(() => checkRequests({ inputs, limits })).not.toThrow();
    });

    test("error: AuthorizationRequestMismatchError when the embedded permit2 bit is used", () => {
      const op = supplyOp({
        tokenSignature: {
          type: "permit2SignatureTransfer",
          nonce: 0n,
          deadline: DEADLINE,
        },
      });
      const inputs = makeInputs(
        [op],
        {
          permissions: [
            {
              type: "permit2Nonce",
              permit2: PERMIT2,
              owner: OWNER,
              nonce: 0n,
              wordPosition: 0n,
              bitmap: 1n,
              consumed: true,
            },
            {
              type: "erc20Allowance",
              token: TOKEN,
              owner: OWNER,
              spender: PERMIT2,
              amount: 1_000_000n,
            },
          ],
        },
        [],
        "final",
      );
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "transaction", txIdx: 0, callPath: [] },
        "already used",
      );
    });

    test("error: AuthorizationRequestMismatchError when the embedded permit2 lacks the permit2 allowance", () => {
      const op = supplyOp({
        tokenSignature: {
          type: "permit2SignatureTransfer",
          nonce: 0n,
          deadline: DEADLINE,
        },
      });
      const inputs = makeInputs(
        [op],
        {
          permissions: [
            {
              type: "permit2Nonce",
              permit2: PERMIT2,
              owner: OWNER,
              nonce: 0n,
              wordPosition: 0n,
              bitmap: 0n,
              consumed: false,
            },
          ],
        },
        [],
        "final",
      );
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "transaction", txIdx: 0, callPath: [] },
        "Permit2",
      );
    });

    test("behavior: pinned isAuthorized satisfies operator authority", () => {
      const inputs = makeInputs(
        [borrowOp()],
        {
          permissions: [
            {
              type: "blueAuthorization",
              morpho: MORPHO,
              authorizer: OWNER,
              authorized: BLUE_BUNDLE,
              isAuthorized: true,
            },
          ],
        },
        [],
        "final",
      );
      expect(() => checkRequests({ inputs, limits })).not.toThrow();
    });

    test("behavior: an earlier blueAuthorization op satisfies operator authority", () => {
      const inputs = makeInputs(
        [blueAuthorizationOp(), borrowOp({}, 1)],
        {},
        [],
        "final",
      );
      expect(() => checkRequests({ inputs, limits })).not.toThrow();
    });

    test("error: AuthorizationRequestMismatchError when authority is not granted", () => {
      const inputs = makeInputs([borrowOp()], {}, [], "final");
      expectMismatch(
        () => checkRequests({ inputs, limits }),
        { type: "transaction", txIdx: 0, callPath: [] },
        "not granted",
      );
    });
  });
});

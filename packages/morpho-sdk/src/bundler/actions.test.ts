import {
  ChainId,
  getChainAddresses,
  type InputMarketParams,
} from "@morpho-org/blue-sdk";
import {
  erc2612Abi,
  permit2Abi,
  publicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import { BundlerAction as LegacyBundlerAction } from "@morpho-org/bundler-sdk-viem";
import fc from "fast-check";
import {
  type Address,
  bytesToHex,
  decodeFunctionData,
  encodeAbiParameters,
  type Hex,
  keccak256,
  parseSignature,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import { bundler3Abi, coreAdapterAbi, generalAdapter1Abi } from "../abis.js";
import { BundlerErrors } from "../types/index.js";
import {
  type Action,
  BundlerAction,
  type BundlerCall,
  type Permit2PermitSingle,
} from "./index.js";

describe("BundlerAction", () => {
  const chainId = ChainId.EthMainnet;
  const {
    permit2,
    publicAllocator,
    bundler3: { bundler3, generalAdapter1 },
  } = getChainAddresses(chainId);

  const owner = "0x0000000000000000000000000000000000000001";
  const asset = "0x0000000000000000000000000000000000000002";
  const recipient = "0x0000000000000000000000000000000000000003";
  const adapter = "0x0000000000000000000000000000000000000004";
  const erc4626 = "0x0000000000000000000000000000000000000005";
  const vault = "0x0000000000000000000000000000000000000006";
  const loanToken = "0x0000000000000000000000000000000000000007";
  const collateralToken = "0x0000000000000000000000000000000000000008";
  const oracle = "0x0000000000000000000000000000000000000009";
  const irm = "0x0000000000000000000000000000000000000010";

  const market = {
    loanToken,
    collateralToken,
    oracle,
    irm,
    lltv: 860_000000000000000000n,
  } satisfies InputMarketParams;

  const permitSingle = {
    details: {
      token: asset,
      amount: 11n,
      expiration: 123,
      nonce: 7,
    },
    sigDeadline: 456n,
  } satisfies Permit2PermitSingle;

  const signature =
    "0x111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222221b";

  const addressArbitrary = fc
    .uint8Array({ minLength: 20, maxLength: 20 })
    .map((bytes) => bytesToHex(bytes) as Address);
  const amountArbitrary = fc.bigInt({ min: 0n, max: 10n ** 24n });
  const permitNumberArbitrary = fc.integer({ min: 0, max: 1_000_000 });
  const skipRevertArbitrary = fc.boolean();
  const marketArbitrary = fc.record({
    loanToken: addressArbitrary,
    collateralToken: addressArbitrary,
    oracle: addressArbitrary,
    irm: addressArbitrary,
    lltv: fc.bigInt({ min: 0n, max: 1_000000000000000000n }),
  });
  const permitSingleArbitrary = fc.record({
    details: fc.record({
      token: addressArbitrary,
      amount: amountArbitrary,
      expiration: permitNumberArbitrary,
      nonce: permitNumberArbitrary,
    }),
    sigDeadline: amountArbitrary,
  });
  const reallocationArbitrary = fc.record({
    marketParams: marketArbitrary,
    amount: amountArbitrary,
  });
  const callbackActionArbitrary = fc
    .tuple(
      addressArbitrary,
      addressArbitrary,
      amountArbitrary,
      addressArbitrary,
      skipRevertArbitrary,
    )
    .map(
      (args) =>
        ({
          type: "erc20Transfer",
          args,
        }) satisfies Action,
    );
  const actionArbitrary: fc.Arbitrary<Action> = fc.oneof(
    fc
      .tuple(
        addressArbitrary,
        addressArbitrary,
        amountArbitrary,
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "nativeTransfer",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        addressArbitrary,
        addressArbitrary,
        amountArbitrary,
        addressArbitrary,
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "erc20Transfer",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        addressArbitrary,
        amountArbitrary,
        addressArbitrary,
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "erc20TransferFrom",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        addressArbitrary,
        addressArbitrary,
        amountArbitrary,
        amountArbitrary,
        fc.constant(signature as Hex),
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "permit",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        addressArbitrary,
        permitSingleArbitrary,
        fc.constant(signature as Hex),
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "approve2",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        addressArbitrary,
        amountArbitrary,
        addressArbitrary,
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "transferFrom2",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        addressArbitrary,
        amountArbitrary,
        amountArbitrary,
        addressArbitrary,
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "erc4626Deposit",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        addressArbitrary,
        amountArbitrary,
        amountArbitrary,
        addressArbitrary,
        addressArbitrary,
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "erc4626Redeem",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        marketArbitrary,
        amountArbitrary,
        addressArbitrary,
        fc.array(callbackActionArbitrary, { maxLength: 2 }),
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "morphoSupplyCollateral",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        marketArbitrary,
        amountArbitrary,
        amountArbitrary,
        amountArbitrary,
        addressArbitrary,
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "morphoBorrow",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        marketArbitrary,
        amountArbitrary,
        amountArbitrary,
        amountArbitrary,
        addressArbitrary,
        fc.array(callbackActionArbitrary, { maxLength: 2 }),
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "morphoRepay",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        marketArbitrary,
        amountArbitrary,
        addressArbitrary,
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "morphoWithdrawCollateral",
            args,
          }) satisfies Action,
      ),
    fc
      .tuple(
        addressArbitrary,
        amountArbitrary,
        fc.array(reallocationArbitrary, { maxLength: 2 }),
        marketArbitrary,
        skipRevertArbitrary,
      )
      .map(
        (args) =>
          ({
            type: "reallocateTo",
            args,
          }) satisfies Action,
      ),
    fc.tuple(amountArbitrary, addressArbitrary, skipRevertArbitrary).map(
      (args) =>
        ({
          type: "wrapNative",
          args,
        }) satisfies Action,
    ),
  );

  const onlyCall = (calls: readonly BundlerCall[]) => {
    expect(calls).toHaveLength(1);
    const [call] = calls;
    if (call == null) throw new Error("Expected one BundlerCall");

    return call;
  };

  const callbackCall = {
    to: adapter,
    data: "0x1234",
    value: 5n,
    skipRevert: true,
    callbackHash: zeroHash,
  } satisfies BundlerCall;

  const parityActions = [
    {
      type: "nativeTransfer",
      args: [owner, generalAdapter1, 100n, false],
    },
    {
      type: "nativeTransfer",
      args: [owner, bundler3, 23n, false],
    },
    {
      type: "nativeTransfer",
      args: [bundler3, generalAdapter1, 11n, false],
    },
    {
      type: "nativeTransfer",
      args: [generalAdapter1, recipient, 7n, true],
    },
    {
      type: "erc20Transfer",
      args: [asset, recipient, 5n, adapter, false],
    },
    {
      type: "erc20TransferFrom",
      args: [asset, 3n, recipient, false],
    },
    {
      type: "permit",
      args: [owner, asset, 4n, 5n, signature, false],
    },
    {
      type: "approve2",
      args: [owner, permitSingle, signature, false],
    },
    {
      type: "transferFrom2",
      args: [asset, 6n, recipient, false],
    },
    {
      type: "erc4626Deposit",
      args: [erc4626, 7n, 8n, recipient, false],
    },
    {
      type: "erc4626Redeem",
      args: [erc4626, 9n, 10n, recipient, owner, false],
    },
    {
      type: "morphoSupplyCollateral",
      args: [
        market,
        11n,
        owner,
        [{ type: "erc20Transfer", args: [asset, recipient, 12n, adapter] }],
        false,
      ],
    },
    {
      type: "morphoBorrow",
      args: [market, 13n, 0n, 14n, recipient, false],
    },
    {
      type: "morphoRepay",
      args: [
        market,
        15n,
        0n,
        16n,
        owner,
        [{ type: "erc20Transfer", args: [asset, recipient, 17n, adapter] }],
        false,
      ],
    },
    {
      type: "morphoWithdrawCollateral",
      args: [market, 18n, recipient, false],
    },
    {
      type: "reallocateTo",
      args: [
        vault,
        19n,
        [{ marketParams: market, amount: 20n }],
        market,
        false,
      ],
    },
    {
      type: "wrapNative",
      args: [21n, recipient, false],
    },
  ] satisfies Action[];

  const thrownMessage = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      if (error instanceof Error) return error.message;

      throw error;
    }

    throw new Error("Expected function to throw");
  };

  describe("bundler-sdk-viem parity", () => {
    test("matches encodeBundle dispatch while recomputing value locally", () => {
      const tx = BundlerAction.encodeBundle(chainId, parityActions);
      const legacyTx = LegacyBundlerAction.encodeBundle(chainId, parityActions);

      expect(tx.to).toBe(legacyTx.to);
      expect(tx.data).toBe(legacyTx.data);
      expect(tx.value).toBe(130n);
      expect(legacyTx.value).toBe(123n);
    });

    test.each(
      parityActions.map((action) => [action.type, action] as const),
    )("matches encode for %s", (_type, action) => {
      expect(BundlerAction.encode(chainId, action)).toStrictEqual(
        LegacyBundlerAction.encode(chainId, action),
      );
    });

    test("matches callback reentry encoding for Morpho callback actions", () => {
      expect(
        BundlerAction.morphoSupplyCollateral(chainId, market, 1n, owner, [
          callbackCall,
        ]),
      ).toStrictEqual(
        LegacyBundlerAction.morphoSupplyCollateral(chainId, market, 1n, owner, [
          callbackCall,
        ]),
      );

      expect(
        BundlerAction.morphoRepay(chainId, market, 1n, 0n, 2n, owner, [
          callbackCall,
        ]),
      ).toStrictEqual(
        LegacyBundlerAction.morphoRepay(chainId, market, 1n, 0n, 2n, owner, [
          callbackCall,
        ]),
      );
    });

    test("matches unsupported-chain errors for extracted chain lookups", () => {
      expect(
        thrownMessage(() =>
          BundlerAction.approve2(
            ChainId.WorldChainMainnet,
            owner,
            permitSingle,
            signature,
          ),
        ),
      ).toBe(
        thrownMessage(() =>
          LegacyBundlerAction.approve2(
            ChainId.WorldChainMainnet,
            owner,
            permitSingle,
            signature,
          ),
        ),
      );

      expect(
        thrownMessage(() =>
          BundlerAction.publicAllocatorReallocateTo(
            ChainId.TempoMainnet,
            vault,
            1n,
            [{ marketParams: market, amount: 2n }],
            market,
          ),
        ),
      ).toBe(
        thrownMessage(() =>
          LegacyBundlerAction.publicAllocatorReallocateTo(
            ChainId.TempoMainnet,
            vault,
            1n,
            [{ marketParams: market, amount: 2n }],
            market,
          ),
        ),
      );
    });
  });

  test("encode accepts arbitrary supported actions deterministically", () => {
    fc.assert(
      fc.property(actionArbitrary, (action) => {
        const calls = BundlerAction.encode(chainId, action);

        expect(calls).toStrictEqual(BundlerAction.encode(chainId, action));
        for (const call of calls) {
          expect(call.to).toMatch(/^0x[0-9a-f]{40}$/i);
          expect(call.data).toMatch(/^0x(?:[0-9a-f]{2})*$/i);
          expect(call.value >= 0n).toBe(true);
          expect(call.callbackHash).toMatch(/^0x[0-9a-f]{64}$/i);
        }
      }),
      { numRuns: 100, seed: 669 },
    );
  });

  test("encodeBundle", () => {
    const actions: Action[] = [
      {
        type: "nativeTransfer",
        args: [owner, generalAdapter1, 100n, false],
      },
      {
        type: "nativeTransfer",
        args: [owner, bundler3, 23n, false],
      },
      {
        type: "nativeTransfer",
        args: [bundler3, generalAdapter1, 11n, false],
      },
      {
        type: "nativeTransfer",
        args: [generalAdapter1, recipient, 7n, true],
      },
      {
        type: "erc20Transfer",
        args: [asset, recipient, 5n, adapter, false],
      },
    ];

    const tx = BundlerAction.encodeBundle(chainId, actions);

    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(123n);

    const decoded = decodeFunctionData({
      abi: bundler3Abi,
      data: tx.data,
    });

    expect(decoded.functionName).toBe("multicall");
    expect(decoded.args[0]).toMatchInlineSnapshot(`
      [
        {
          "callbackHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
          "data": "0x",
          "skipRevert": false,
          "to": "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0",
          "value": 100n,
        },
        {
          "callbackHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
          "data": "0x",
          "skipRevert": false,
          "to": "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0",
          "value": 11n,
        },
        {
          "callbackHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
          "data": "0xf2522bcd00000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000007",
          "skipRevert": false,
          "to": "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0",
          "value": 0n,
        },
        {
          "callbackHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
          "data": "0x3790767d000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000005",
          "skipRevert": false,
          "to": "0x0000000000000000000000000000000000000004",
          "value": 0n,
        },
      ]
    `);
  });

  test("encodeBundle includes reallocateTo fees in transaction value", () => {
    const withdrawals = [{ marketParams: market, amount: 2n }];
    const tx = BundlerAction.encodeBundle(chainId, [
      {
        type: "reallocateTo",
        args: [vault, 5n, withdrawals, market, false],
      },
    ]);

    expect(tx.value).toBe(5n);

    const decoded = decodeFunctionData({
      abi: bundler3Abi,
      data: tx.data,
    });

    expect(decoded.functionName).toBe("multicall");
    const calls = decoded.args[0] ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]?.value).toBe(5n);
  });

  test("encodeBundle uses native transfers to Bundler3 before adding call value", () => {
    const withdrawals = [{ marketParams: market, amount: 2n }];
    const tx = BundlerAction.encodeBundle(chainId, [
      {
        type: "nativeTransfer",
        args: [owner, bundler3, 5n, false],
      },
      {
        type: "reallocateTo",
        args: [vault, 5n, withdrawals, market, false],
      },
    ]);

    expect(tx.value).toBe(5n);

    const decoded = decodeFunctionData({
      abi: bundler3Abi,
      data: tx.data,
    });

    expect(decoded.functionName).toBe("multicall");
    const calls = decoded.args[0] ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]?.value).toBe(5n);
  });

  test("encodeBundle matches registry addresses case-insensitively", () => {
    const lowerBundler3 = bundler3.toLowerCase() as Address;
    const lowerGeneralAdapter1 = generalAdapter1.toLowerCase() as Address;
    const preloadTx = BundlerAction.encodeBundle(chainId, [
      {
        type: "nativeTransfer",
        args: [owner, lowerBundler3, 5n, false],
      },
    ]);
    const tx = BundlerAction.encodeBundle(chainId, [
      {
        type: "nativeTransfer",
        args: [owner, lowerBundler3, 5n, false],
      },
      {
        type: "nativeTransfer",
        args: [owner, lowerGeneralAdapter1, 7n, false],
      },
    ]);

    expect(preloadTx.value).toBe(5n);
    expect(tx.value).toBe(7n);

    const decoded = decodeFunctionData({
      abi: bundler3Abi,
      data: tx.data,
    });

    expect(decoded.functionName).toBe("multicall");
    const calls = decoded.args[0] ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]?.to.toLowerCase()).toBe(lowerGeneralAdapter1);
    expect(calls[0]?.value).toBe(7n);
  });

  test.each(
    (
      [
        [
          "nativeTransfer",
          {
            type: "nativeTransfer",
            args: [owner, recipient, 1n, false],
          },
          BundlerAction.nativeTransfer(chainId, owner, recipient, 1n, false),
        ],
        [
          "erc20Transfer",
          {
            type: "erc20Transfer",
            args: [asset, recipient, 2n, adapter, false],
          },
          BundlerAction.erc20Transfer(asset, recipient, 2n, adapter, false),
        ],
        [
          "erc20TransferFrom",
          {
            type: "erc20TransferFrom",
            args: [asset, 3n, recipient, false],
          },
          BundlerAction.erc20TransferFrom(chainId, asset, 3n, recipient, false),
        ],
        [
          "permit",
          {
            type: "permit",
            args: [owner, asset, 4n, 5n, signature, false],
          },
          BundlerAction.permit(chainId, owner, asset, 4n, 5n, signature, false),
        ],
        [
          "approve2",
          {
            type: "approve2",
            args: [owner, permitSingle, signature, false],
          },
          BundlerAction.approve2(
            chainId,
            owner,
            permitSingle,
            signature,
            false,
          ),
        ],
        [
          "transferFrom2",
          {
            type: "transferFrom2",
            args: [asset, 6n, recipient, false],
          },
          BundlerAction.transferFrom2(chainId, asset, 6n, recipient, false),
        ],
        [
          "erc4626Deposit",
          {
            type: "erc4626Deposit",
            args: [erc4626, 7n, 8n, recipient, false],
          },
          BundlerAction.erc4626Deposit(
            chainId,
            erc4626,
            7n,
            8n,
            recipient,
            false,
          ),
        ],
        [
          "erc4626Redeem",
          {
            type: "erc4626Redeem",
            args: [erc4626, 9n, 10n, recipient, owner, false],
          },
          BundlerAction.erc4626Redeem(
            chainId,
            erc4626,
            9n,
            10n,
            recipient,
            owner,
            false,
          ),
        ],
        [
          "morphoSupplyCollateral",
          {
            type: "morphoSupplyCollateral",
            args: [
              market,
              11n,
              owner,
              [
                {
                  type: "erc20Transfer",
                  args: [asset, recipient, 12n, adapter],
                },
              ],
              false,
            ],
          },
          BundlerAction.morphoSupplyCollateral(
            chainId,
            market,
            11n,
            owner,
            BundlerAction.erc20Transfer(asset, recipient, 12n, adapter),
            false,
          ),
        ],
        [
          "morphoBorrow",
          {
            type: "morphoBorrow",
            args: [market, 13n, 0n, 14n, recipient, false],
          },
          BundlerAction.morphoBorrow(
            chainId,
            market,
            13n,
            0n,
            14n,
            recipient,
            false,
          ),
        ],
        [
          "morphoRepay",
          {
            type: "morphoRepay",
            args: [
              market,
              15n,
              0n,
              16n,
              owner,
              [
                {
                  type: "erc20Transfer",
                  args: [asset, recipient, 17n, adapter],
                },
              ],
              false,
            ],
          },
          BundlerAction.morphoRepay(
            chainId,
            market,
            15n,
            0n,
            16n,
            owner,
            BundlerAction.erc20Transfer(asset, recipient, 17n, adapter),
            false,
          ),
        ],
        [
          "morphoWithdrawCollateral",
          {
            type: "morphoWithdrawCollateral",
            args: [market, 18n, recipient, false],
          },
          BundlerAction.morphoWithdrawCollateral(
            chainId,
            market,
            18n,
            recipient,
            false,
          ),
        ],
        [
          "reallocateTo",
          {
            type: "reallocateTo",
            args: [
              vault,
              19n,
              [{ marketParams: market, amount: 20n }],
              market,
              false,
            ],
          },
          BundlerAction.publicAllocatorReallocateTo(
            chainId,
            vault,
            19n,
            [{ marketParams: market, amount: 20n }],
            market,
            false,
          ),
        ],
        [
          "wrapNative",
          {
            type: "wrapNative",
            args: [21n, recipient, false],
          },
          BundlerAction.wrapNative(chainId, 21n, recipient, false),
        ],
      ] satisfies [Action["type"], Action, BundlerCall[]][]
    ).map(([type, action, calls]) => ({ type, action, calls })),
  )("encode dispatches $type", ({ action, calls }) => {
    expect(BundlerAction.encode(chainId, action)).toStrictEqual(calls);
  });

  test("nativeTransfer", () => {
    const lowerBundler3 = bundler3.toLowerCase() as Address;
    const lowerGeneralAdapter1 = generalAdapter1.toLowerCase() as Address;

    expect(
      BundlerAction.nativeTransfer(chainId, owner, bundler3, 1n),
    ).toStrictEqual([]);
    expect(
      BundlerAction.nativeTransfer(chainId, owner, lowerBundler3, 1n),
    ).toStrictEqual([]);

    const adapterCall = onlyCall(
      BundlerAction.nativeTransfer(
        chainId,
        generalAdapter1,
        recipient,
        2n,
        true,
      ),
    );
    const adapterCallData = decodeFunctionData({
      abi: coreAdapterAbi,
      data: adapterCall.data,
    });

    expect(adapterCall.to).toBe(generalAdapter1);
    expect(adapterCall.skipRevert).toBe(false);
    expect(adapterCallData.functionName).toBe("nativeTransfer");
    expect(adapterCallData.args).toEqual([recipient, 2n]);

    const lowercasedAdapterCall = onlyCall(
      BundlerAction.nativeTransfer(
        chainId,
        lowerGeneralAdapter1,
        recipient,
        2n,
        true,
      ),
    );
    const lowercasedAdapterCallData = decodeFunctionData({
      abi: coreAdapterAbi,
      data: lowercasedAdapterCall.data,
    });

    expect(lowercasedAdapterCall.to).toBe(generalAdapter1);
    expect(lowercasedAdapterCall.skipRevert).toBe(false);
    expect(lowercasedAdapterCallData.functionName).toBe("nativeTransfer");
    expect(lowercasedAdapterCallData.args).toEqual([recipient, 2n]);

    const directCall = onlyCall(
      BundlerAction.nativeTransfer(chainId, owner, recipient, 3n, true),
    );

    expect(directCall).toStrictEqual({
      to: recipient,
      data: "0x",
      value: 3n,
      skipRevert: true,
      callbackHash: zeroHash,
    });
  });

  test("erc20Transfer", () => {
    const call = onlyCall(
      BundlerAction.erc20Transfer(asset, recipient, 1n, adapter, true),
    );
    const decoded = decodeFunctionData({
      abi: coreAdapterAbi,
      data: call.data,
    });

    expect(call.to).toBe(adapter);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("erc20Transfer");
    expect(decoded.args).toEqual([asset, recipient, 1n]);
  });

  test("erc20TransferFrom", () => {
    const call = onlyCall(
      BundlerAction.erc20TransferFrom(chainId, asset, 1n, recipient, true),
    );
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("erc20TransferFrom");
    expect(decoded.args).toEqual([asset, recipient, 1n]);
  });

  test("permit", () => {
    const call = onlyCall(
      BundlerAction.permit(chainId, owner, asset, 1n, 2n, signature, false),
    );
    const decoded = decodeFunctionData({
      abi: erc2612Abi,
      data: call.data,
    });
    const { r, s, yParity } = parseSignature(signature);

    expect(call.to).toBe(asset);
    expect(decoded.functionName).toBe("permit");
    expect(decoded.args).toEqual([
      owner,
      generalAdapter1,
      1n,
      2n,
      yParity + 27,
      r,
      s,
    ]);
  });

  test("approve2", () => {
    const call = onlyCall(
      BundlerAction.approve2(chainId, owner, permitSingle, signature, false),
    );
    const decoded = decodeFunctionData({
      abi: permit2Abi,
      data: call.data,
    });

    expect(call.to).toBe(permit2);
    expect(decoded.functionName).toBe("permit");
    expect(decoded.args).toEqual([
      owner,
      { ...permitSingle, spender: generalAdapter1 },
      signature,
    ]);
  });

  test("transferFrom2", () => {
    const call = onlyCall(
      BundlerAction.transferFrom2(chainId, asset, 1n, recipient, true),
    );
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("permit2TransferFrom");
    expect(decoded.args).toEqual([asset, recipient, 1n]);
  });

  test("erc4626Deposit", () => {
    const call = onlyCall(
      BundlerAction.erc4626Deposit(chainId, erc4626, 1n, 2n, recipient, true),
    );
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("erc4626Deposit");
    expect(decoded.args).toEqual([erc4626, 1n, 2n, recipient]);
  });

  test("erc4626Redeem", () => {
    const call = onlyCall(
      BundlerAction.erc4626Redeem(
        chainId,
        erc4626,
        1n,
        2n,
        recipient,
        owner,
        true,
      ),
    );
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("erc4626Redeem");
    expect(decoded.args).toEqual([erc4626, 1n, 2n, recipient, owner]);
  });

  test("morphoSupplyCollateral", () => {
    const call = onlyCall(
      BundlerAction.morphoSupplyCollateral(
        chainId,
        market,
        1n,
        owner,
        [],
        true,
      ),
    );
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.callbackHash).toBe(zeroHash);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("morphoSupplyCollateral");
    expect(decoded.args).toEqual([market, 1n, owner, "0x"]);
  });

  test("morphoBorrow", () => {
    const call = onlyCall(
      BundlerAction.morphoBorrow(chainId, market, 1n, 0n, 2n, recipient, true),
    );
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("morphoBorrow");
    expect(decoded.args).toEqual([market, 1n, 0n, 2n, recipient]);
  });

  test("morphoRepay", () => {
    const reenterAbiInputs = bundler3Abi.find(
      (item) => item.type === "function" && item.name === "reenter",
    )!.inputs;
    const reenterData = encodeAbiParameters(reenterAbiInputs, [[callbackCall]]);
    const call = onlyCall(
      BundlerAction.morphoRepay(
        chainId,
        market,
        1n,
        0n,
        2n,
        owner,
        [callbackCall],
        true,
      ),
    );
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.callbackHash).toBe(keccak256(reenterData));
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("morphoRepay");
    expect(decoded.args).toEqual([market, 1n, 0n, 2n, owner, reenterData]);
  });

  test("morphoWithdrawCollateral", () => {
    const call = onlyCall(
      BundlerAction.morphoWithdrawCollateral(
        chainId,
        market,
        1n,
        recipient,
        true,
      ),
    );
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("morphoWithdrawCollateral");
    expect(decoded.args).toEqual([market, 1n, recipient]);
  });

  test("publicAllocatorReallocateTo", () => {
    const withdrawals = [{ marketParams: market, amount: 1n }];
    const call = onlyCall(
      BundlerAction.publicAllocatorReallocateTo(
        chainId,
        vault,
        2n,
        withdrawals,
        market,
        true,
      ),
    );
    const decoded = decodeFunctionData({
      abi: publicAllocatorAbi,
      data: call.data,
    });

    expect(call.to).toBe(publicAllocator);
    expect(call.value).toBe(2n);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("reallocateTo");
    expect(decoded.args).toEqual([vault, withdrawals, market]);
  });

  test("wrapNative", () => {
    const call = onlyCall(
      BundlerAction.wrapNative(chainId, 1n, recipient, true),
    );
    const decoded = decodeFunctionData({
      abi: generalAdapter1Abi,
      data: call.data,
    });

    expect(call.to).toBe(generalAdapter1);
    expect(call.skipRevert).toBe(true);
    expect(decoded.functionName).toBe("wrapNative");
    expect(decoded.args).toEqual([1n, recipient]);
  });

  test("error: MissingSignature", () => {
    expect(() =>
      BundlerAction.encode(chainId, {
        type: "permit",
        args: [owner, asset, 1n, 1n, null, false],
      }),
    ).toThrow(BundlerErrors.MissingSignature);

    expect(() =>
      BundlerAction.encode(chainId, {
        type: "approve2",
        args: [owner, permitSingle, null, false],
      }),
    ).toThrow(BundlerErrors.MissingSignature);
  });

  test("error: UnexpectedAction", () => {
    expect(() =>
      BundlerAction.approve2(
        ChainId.WorldChainMainnet,
        owner,
        permitSingle,
        signature,
      ),
    ).toThrow(BundlerErrors.UnexpectedAction);

    expect(() =>
      BundlerAction.publicAllocatorReallocateTo(
        ChainId.TempoMainnet,
        vault,
        1n,
        [{ marketParams: market, amount: 2n }],
        market,
      ),
    ).toThrow(BundlerErrors.UnexpectedAction);
  });
});

import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { SimulationAuthorization } from "../../domain/authorizations.js";
import type { PermissionState } from "../../domain/evidence.js";
import type {
  CompleteEvidence,
  DecodedBundle,
  ExecutionEvidence,
  PinnedInputs,
  ValidatedAuthorizations,
} from "../../domain/stages.js";
import { brandPinned, brandValidated } from "../../domain/stages.js";
import {
  MissingVerificationEvidenceError,
  PermissionChangeMismatchError,
} from "../../errors.js";
import { verifyPermissions } from "../effects/permissions.js";
import { proveAuthorizations } from "./prove.js";

const addresses = getChainAddresses(1);
const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const BUNDLE = addresses.bundles!.vaultBundlesV1!;

const NOW = 1_700_000_000n;

const authorization: SimulationAuthorization = {
  type: "erc20Approval",
  token: TOKEN,
  owner: OWNER,
  spender: BUNDLE,
  amount: 500_000n,
};

const expectedPermission: PermissionState = {
  type: "erc20Allowance",
  token: TOKEN,
  owner: OWNER,
  spender: BUNDLE,
  amount: 500_000n,
};

const bundle = (
  authorizations: readonly SimulationAuthorization[],
  mode: "preview" | "final" = "preview",
): DecodedBundle =>
  ({
    request: { chainId: 1, mode, authorizations },
    owner: OWNER,
    operations: [],
  }) as unknown as DecodedBundle;

const inputs = (auth: readonly SimulationAuthorization[] = []): PinnedInputs =>
  brandPinned({
    bundle: bundle(auth),
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
    },
    internals: { vaultData: new Map() },
  });

const evidence = (
  auth: readonly SimulationAuthorization[] = [],
): ExecutionEvidence =>
  ({
    plan: {
      request: bundle(auth).request,
      owner: OWNER,
      calls: [
        {
          identity: {
            type: "probe",
            probeId: `erc20Allowance:${TOKEN}:${OWNER}:${BUNDLE}`,
            phase: "prepared",
          },
          transaction: {
            from: OWNER,
            to: TOKEN,
            data: "0x",
            value: 0n,
          },
          read: {
            type: "erc20Allowance",
            token: TOKEN,
            owner: OWNER,
            spender: BUNDLE,
          },
        },
      ],
      stateOverrides: [],
    },
    context: {
      chainId: 1,
      stateBlockNumber: 24_000_000n,
      stateBlockHash: `0x${"ab".repeat(32)}`,
      stateBlockTimestamp: NOW,
      blockNumber: 24_000_000n,
      blockTimestamp: NOW,
    },
    calls: [],
    probeReads: {
      before: [],
      prepared: [
        {
          type: "erc20Allowance",
          token: TOKEN,
          owner: OWNER,
          spender: BUNDLE,
          value: 500_000n,
        },
      ],
      intermediate: [],
      after: [],
    },
    preparations: [
      {
        authorizationIndex: 0,
        calls: [
          {
            logs: [],
            status: true,
            returnData: "0x",
            gasUsed: 46_000n,
          },
        ],
      },
    ],
    snapshots: [],
  }) as unknown as ExecutionEvidence;

const validated = (
  expectedPermissionState: readonly PermissionState[] = [expectedPermission],
): ValidatedAuthorizations =>
  brandValidated({
    inputs: inputs([authorization]),
    limits: {
      maxSlippageWad: 10n ** 15n,
      minLltvBufferWad: 0n,
      maxSignatureLifetimeSeconds: 7_200n,
      wallet: { maxDebit: [], minCredit: [] },
      operations: [],
    },
    preparations: [
      {
        authorizationIndex: 0,
        calls: [
          {
            from: OWNER,
            to: TOKEN,
            data: `0x${"09".repeat(68)}`,
            value: 0n,
          },
        ],
        expected: expectedPermissionState,
      },
    ],
    matches: [{ authorizationIndex: 0, expectedIndex: 0 }],
    expected: [
      {
        type: "tokenPull",
        operationIndex: 0,
        token: TOKEN,
        owner: OWNER,
        spender: BUNDLE,
        amount: 500_000n,
        signature: { type: "none" },
      },
    ],
  });

describe("proveAuthorizations", () => {
  test("default: matching prepared read-back passes", () => {
    const complete = proveAuthorizations(
      evidence([authorization]),
      validated(),
    );
    expect(complete.authorizations).toHaveLength(1);
    expect(complete.authorizations[0]?.authorizationIndex).toBe(0);
    expect(complete.authorizations[0]?.readBack).toHaveLength(1);
    expect(complete.authorizations[0]?.readBack[0]?.observed).toEqual(
      expectedPermission,
    );
  });

  test("final mode: no preparations produces empty authorizations", () => {
    const finalValidated = brandValidated({
      inputs: inputs([]),
      limits: {
        maxSlippageWad: 10n ** 15n,
        minLltvBufferWad: 0n,
        maxSignatureLifetimeSeconds: 7_200n,
        wallet: { maxDebit: [], minCredit: [] },
        operations: [],
      },
      preparations: [],
      matches: [],
      expected: [],
    });
    const complete = proveAuthorizations(evidence([]), finalValidated);
    expect(complete.authorizations).toEqual([]);
  });

  test("error: MissingVerificationEvidenceError when prepared read is absent", () => {
    const ev = evidence([authorization]);
    expect(() =>
      proveAuthorizations(
        {
          ...ev,
          probeReads: { ...ev.probeReads, prepared: [] },
        } as ExecutionEvidence,
        validated(),
      ),
    ).toThrow(MissingVerificationEvidenceError);
  });

  test("error: PermissionChangeMismatchError on disagreeing read-back", () => {
    const ev = evidence([authorization]);
    expect(() =>
      proveAuthorizations(
        {
          ...ev,
          probeReads: {
            ...ev.probeReads,
            prepared: [
              {
                type: "erc20Allowance",
                token: TOKEN,
                owner: OWNER,
                spender: BUNDLE,
                value: 400_000n,
              },
            ],
          },
        } as ExecutionEvidence,
        validated(),
      ),
    ).toThrow(PermissionChangeMismatchError);
  });
});

describe("verifyPermissions", () => {
  const snapshot = (amount: bigint) => ({
    wallet: [],
    permissions: [
      {
        type: "erc20Allowance",
        token: TOKEN,
        owner: OWNER,
        spender: BUNDLE,
        amount,
      } satisfies PermissionState,
    ],
    positions: [],
    vaults: [],
    markets: [],
  });

  test("allowance decrease explained by a tokenPull is accepted", () => {
    const complete = {} as CompleteEvidence;
    expect(
      verifyPermissions({
        validated: validated(),
        evidence: complete,
        before: snapshot(600_000n),
        after: snapshot(100_000n),
      }),
    ).toEqual([]);
  });

  test("error: unexplained allowance increase rejected", () => {
    const complete = {} as CompleteEvidence;
    expect(() =>
      verifyPermissions({
        validated: validated(),
        evidence: complete,
        before: snapshot(100_000n),
        after: snapshot(600_000n),
      }),
    ).toThrow(PermissionChangeMismatchError);
  });
});

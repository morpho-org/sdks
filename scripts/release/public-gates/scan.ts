#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { basename, join, matchesGlob, relative, sep } from "node:path";
import { parseArgs } from "node:util";

import {
  type EntryLister,
  loadBundledTar,
} from "../../ci/verify-tarball-collisions.ts";

/** Default location of the scan policy, relative to the repository root. */
export const POLICY_PATH = "scripts/release/public-gates/scan-policy.json";

// Key-like names, shared by the wallet rules. No leading boundary, so prefixed
// names such as `DEPLOYER_PRIVATE_KEY` and `walletPrivateKey` match. Any
// `<role>_KEY` / `<role>-key` counts. Matching ignores case, so camelCase
// matches for the listed roles (`walletKey`, `signingKey`), but not for other
// names such as `marketKey`, which hold 32-byte hashes. A bare `KEY` or `SECRET`
// counts too, and so do `keys`/`secrets` when assigned or holding a list or
// object (not prose like `secrets: inherit`).
const KEY_NAME =
  "(?:(?<![a-z0-9_$])(?:key|secret)(?:s(?=\\s*(?:(?::[^=;\\n]{0,40})?=(?!=)|:\\s*[[{])))?(?![a-z0-9_$])|priv(?:ate)?[_-]?key|secret[_-]?key|(?:signer|signing|deployer|wallet|owner|account)[_-]?key|[a-z]+[_-]key|pk(?:ey)?(?![a-z])|(?<![a-z])sk(?![a-z]))";
// Calls that take a raw key: viem's `privateKeyToAccount`/`privateKeyToAddress`,
// `hdKeyToAccount`, ethers' `new Wallet(…)`/`new SigningKey(…)`, Foundry cheatcodes
// (`vm.startBroadcast(0x…)`) and noble's `secp256k1` (the key is `sign`'s second
// argument).
const KEY_SINK = String.raw`(?:privateKey|hdKey)\w*\(|\bnew\s+(?:[\w$]+\.)*(?:Wallet|SigningKey)\(|\bvm\.(?:startBroadcast|broadcast|rememberKey|addr|sign)\(|\bsecp256k1\.(?:getPublicKey|getSharedSecret)\(|\bsecp256k1\.sign\([^,()\n]{0,200},`;
// A CLI flag with a space-separated value (`--private-key 0x…`), also across a
// shell line continuation.
const KEY_FLAG = String.raw`--?${KEY_NAME}\w*(?:[ \t]*\\\n\s*|[ \t]+)`;
const MNEMONIC_NAME =
  "(?:mnemonic|seed(?:[_-]?(?:phrase|words))?|(?:recovery|secret|wallet)[_-]?(?:phrase|words)|(?<![a-z])phrase)";
// viem's `mnemonicToAccount`, ethers' `Wallet.fromPhrase`/`fromMnemonic`,
// bip39's `mnemonicToSeed(Sync)`/`mnemonicToEntropy`, and Foundry's `vm.deriveKey`.
const MNEMONIC_SINK = String.raw`(?:mnemonicToAccount|fromPhrase|fromMnemonic|mnemonicToSeed(?:Sync)?|mnemonicToEntropy|deriveKey)\(`;

/** Text that must never reach the public repository or npm. */
const RULES = {
  // Linear team keys of the morpho-labs workspace. Lookarounds instead of `\b`,
  // so a key next to `_` (`test_SDK-1`, `sdk-1_notes.md`) still matches.
  "linear-key":
    /(?<![A-Za-z0-9])(?:APPS|API|CRTR|INTEG|MAR|MKT|PLA|PRO|ROU|SDK|SEC|VAU|VRM)-\d+(?!\d)/gi,
  "linear-url": /\blinear\.app\b/gi,
  "slack-url": /\b(?:[a-z0-9-]+\.)?slack\.com\b/gi,
  "notion-url": /\bnotion\.(?:so|site)\b/gi,
  // Session links, including Devin Desktop's `app.devin.ai/desktop/session/<id>`.
  "devin-session": /\b(?:app\.)?devin\.ai\/(?:[\w-]+\/)*sessions?\b/gi,
  "internal-repo": /\bmorpho-org\/sdks-internal\b/gi,
  "internal-host": /\b(?:[a-z0-9-]+\.)*internal\.morpho\.[a-z]+\b/gi,
  "private-key": /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  // BIP32 extended private keys: one controls every account of its HD wallet.
  "extended-private-key": /\b[xyzt]prv[1-9A-HJ-NP-Za-km-z]{100,112}\b/g,
  "github-token":
    /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/g,
  "npm-token": /\bnpm_[A-Za-z0-9]{36}\b/g,
  "linear-token": /\blin_(?:api|oauth)_[A-Za-z0-9]{32,}\b/g,
  "aws-key": /\bAKIA[0-9A-Z]{16}\b/g,
  "slack-token": /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  "anthropic-key": /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  // Wallet keys and mnemonics only next to a key-like name or sink, since bare
  // 32-byte hex values (market ids, hashes) are everywhere. A type annotation
  // starts with a letter or backtick and is short, so it can't run across a key
  // value. `??` and `||` catch hard-coded env fallbacks, also after
  // `env["KEY"]`, `getEnv("KEY")` or a chain of env reads (`?? env.B ??`); `\"`
  // catches code embedded in JSON.
  "wallet-key": new RegExp(
    String.raw`(?:${KEY_NAME}\w*\\?["'\`]?[\])]?\s*(?:(?:\?\?|\|\|)\s*(?![0-9a-f]{64}\b)[a-z_$][\w$]*(?:\??\.(?![0-9a-f]{64}\b)[a-z_$][\w$]*)*(?:(?:\?\.)?\[["'\`](?![0-9a-f]{64}\b)[a-z_$][\w$]*["'\`]\]|\(["'\`](?![0-9a-f]{64}\b)[a-z_$][\w$]*["'\`]\))?\s*)*(?:(?::\s*[a-z\`][^=;\n"',]{0,40})?[:=](?!=)|\?\?|\|\|)|${KEY_SINK}|${KEY_FLAG})\s*\\?["'\`]?(?<secret>(?:0x)?[0-9a-f]{64})n?\b`,
    "gi",
  ),
  // The same names and sinks, plus Hardhat's `accounts`, as the start of a whole
  // value: a list, a wrapper, a ternary, a fallback or a delimited string. Every
  // 64-hex value up to the end of that value is checked (see `valueSecrets`), so
  // `[ANVIL_KEY, "0x…"]`, `"0x<anvil>,0x…"` and `cond ? "0x…" : env.PK` are
  // caught whatever comes first. A quoted name followed by a comma starts the
  // next call argument: `vi.stubEnv("PRIVATE_KEY", "0x…")`, checked the same way.
  "wallet-key-list": new RegExp(
    String.raw`(?:${KEY_NAME}\w*\\?["'\`]?\s*[:=](?!=)|${KEY_NAME}\w*\\?["'\`]\s*,|${KEY_SINK}|\baccounts\\?["'\`]?\s*[:=])`,
    "gi",
  ),
  // A hard-coded fallback or ternary branch after an env read with no assignment
  // in front, or a logical assignment: `(process.env.PK as Hex) ?? "0x…"`,
  // `env.PK ?? ("0x…" as Hex)`, `privateKey ??= "0x…"`.
  "wallet-key-fallback": new RegExp(
    String.raw`${KEY_NAME}\w*(?:(?![0-9a-f]{64}\b)[^;\n]){0,120}?(?:\?\?|\|\||\?(?![.?=]))=?\s*(?:(?:\(|(?:hexToBytes|toBytes)\()\s*)*\\?["'\`]?(?<secret>(?:0x)?[0-9a-f]{64})n?\b`,
    "gi",
  ),
  // Words are joined by spaces or tabs only, so a phrase can't run into the next line.
  mnemonic: new RegExp(
    String.raw`(?:${MNEMONIC_NAME}\w*\\?["'\`]?[\])]?\s*(?:[:=]|(?:\?\?|\|\|)=?)|${MNEMONIC_SINK}|--${MNEMONIC_NAME}\w*(?:[ \t]*\\\n\s*|[ \t]+))\s*\\?["'\`]?(?<secret>[a-z]+(?:[ \t]+[a-z]+){11,23})\b`,
    "gi",
  ),
  // A seed phrase hard-coded behind an env read or in a ternary branch:
  // `mnemonicToAccount(process.env.M ?? "…")`, `mnemonic: env.M ? env.M : ("…")`.
  "mnemonic-fallback": new RegExp(
    String.raw`(?:${MNEMONIC_NAME}\w*|${MNEMONIC_SINK})[^;\n]{0,120}?(?:\?\?|\|\||\?(?![.?=])|:)=?\s*\(?\s*\\?["'\`](?<secret>[a-z]+(?:[ \t]+[a-z]+){11,23})\b`,
    "gi",
  ),
  // The same names and sinks as the start of a whole value, so a list or ternary
  // with the Anvil phrase first still has every quoted phrase checked.
  "mnemonic-list": new RegExp(
    String.raw`(?:${MNEMONIC_NAME}\w*\\?["'\`]?\s*[:=]|${MNEMONIC_SINK})`,
    "gi",
  ),
  // Any scheme (`https`, `wss`, ...). A port followed by a block number
  // (`http://localhost:8545@19000000`) is a fork URL, and `${VAR}` is filled in
  // at run time.
  "url-credentials":
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@"'`]*:(?!\d+@\d+(?![\w.])|\$\{)[^\s/@"'`]+@/gi,
  "rpc-key":
    /\b(?:alchemy(?:api)?\.(?:com|io)\/v2\/[A-Za-z0-9_-]{20,}|infura\.io\/(?:ws\/)?v3\/[0-9a-f]{32})\b/gi,
} as const satisfies Record<string, RegExp>;

type RuleId = keyof typeof RULES | "blocked-term";

// Rules whose match holds a credential, printed redacted so a caught leak doesn't
// end up in CI logs.
const SECRET_RULES: ReadonlySet<RuleId> = new Set<RuleId>([
  "private-key",
  "extended-private-key",
  "github-token",
  "npm-token",
  "linear-token",
  "aws-key",
  "slack-token",
  "anthropic-key",
  "wallet-key",
  "wallet-key-list",
  "wallet-key-fallback",
  "mnemonic",
  "mnemonic-fallback",
  "mnemonic-list",
  "url-credentials",
  "rpc-key",
]);

// How far a value, or the receiver of a mapped list, is read before the scan fails
// closed.
const VALUE_WINDOW = 4096;

// The rules that follow names passed to a sink, and their sinks.
const SINKS = [
  ["wallet-key-list", KEY_SINK],
  ["mnemonic-list", MNEMONIC_SINK],
] as const;

/**
 * Shortens every part of a path that looks like a credential to its first four
 * characters, so a file named after a key or token doesn't print it in CI logs.
 *
 * @param path - File or tarball entry path.
 * @returns The path, safe to print.
 */
export function redactPath(path: string): string {
  let where = path;
  for (const id of SECRET_RULES) {
    if (id === "blocked-term") continue;
    where = where.replaceAll(RULES[id], (found) => `${found.slice(0, 4)}…`);
  }
  return where.replaceAll(
    /(?:0x)?[0-9a-f]{32,}|[a-z]+(?:[ \t_-]+[a-z]+){11,}/gi,
    (found) => `${found.slice(0, 4)}…`,
  );
}

/** One allowed occurrence: the same rule matching the same text in matching files. */
export interface ScanException {
  /** Glob (`matchesGlob`) over POSIX paths relative to the public tree root. */
  readonly path: string;
  /** Rule that must report the occurrence. */
  readonly rule: RuleId;
  /** Exact matched text. */
  readonly match: string;
  /** Why the occurrence may stay public. */
  readonly reason: string;
}

/** Content of `scan-policy.json`. Private: it never ships. */
export interface ScanPolicy {
  /** Case-insensitive terms such as unannounced partner or chain names. */
  readonly blockedTerms: readonly string[];
  readonly exceptions: readonly ScanException[];
}

/**
 * One match of a rule: file, line (1-based; 0 when the match is in the file path),
 * rule and matched text. `tarball` marks a match in a packed tarball.
 */
export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly rule: RuleId;
  readonly match: string;
  readonly tarball?: true;
}

/**
 * A file to scan: a tree path, or `<tarball>.tgz:package/...` with `tarball` set
 * for a tarball entry.
 */
export interface ScannedFile {
  readonly path: string;
  readonly content: Buffer;
  readonly tarball?: true;
}

/**
 * Checks that a policy is well formed, so a typo can't silently allow a leak.
 *
 * @param policy - Parsed `scan-policy.json`.
 * @param policyPath - Where the policy was read from, for error messages.
 * @returns The policy, typed.
 * @throws If the policy has the wrong shape, an exception is incomplete or names an
 *   unknown rule, or two exceptions are duplicates.
 */
export function parsePolicy(
  policy: unknown,
  policyPath: string = POLICY_PATH,
): ScanPolicy {
  if (
    typeof policy !== "object" ||
    policy === null ||
    !("blockedTerms" in policy) ||
    !Array.isArray(policy.blockedTerms) ||
    !policy.blockedTerms.every(
      (term: unknown) =>
        typeof term === "string" && term !== "" && term === term.trim(),
    ) ||
    !("exceptions" in policy) ||
    !Array.isArray(policy.exceptions)
  ) {
    throw new Error(
      `"${policyPath}" needs a "blockedTerms" array of non-empty strings with no surrounding spaces and an "exceptions" array.`,
    );
  }
  const seen = new Set<string>();
  for (const exception of policy.exceptions as unknown[]) {
    if (
      typeof exception !== "object" ||
      exception === null ||
      !["path", "rule", "match", "reason"].every(
        (key) =>
          key in exception &&
          typeof (exception as Record<string, unknown>)[key] === "string" &&
          (exception as Record<string, string>)[key]?.trim() !== "",
      )
    ) {
      throw new Error(
        `Every exception in "${policyPath}" needs a non-empty "path", "rule", "match" and "reason": ${JSON.stringify(exception)}.`,
      );
    }
    const { path, rule, match } = exception as ScanException;
    if (rule !== "blocked-term" && !Object.hasOwn(RULES, rule)) {
      throw new Error(`Exception for "${path}" names unknown rule "${rule}".`);
    }
    const id = JSON.stringify([path, rule, match]);
    if (seen.has(id)) {
      throw new Error(`Duplicate exception for "${match}" in "${path}".`);
    }
    seen.add(id);
  }
  return policy as ScanPolicy;
}

// Published test values: the Hardhat/Anvil default mnemonic and its first account
// key. Fixtures and the published test package use them. Keys with 48 leading zero
// hex digits (values that fit in 64 bits, like 0x…01) are skipped as trivial too.
const PUBLIC_TEST_SECRETS = new Set([
  "test test test test test test test test test test test junk",
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
]);

/**
 * Finds rule matches in files. Each distinct key or mnemonic value is reported
 * once per file, under the first rule (in rule order) that matches it, which may
 * not be its earliest line. NUL bytes are dropped first, so UTF-16 text and
 * text inside binaries are still scanned. A key or mnemonic whose value is exactly
 * a published test value (Anvil defaults) is skipped, and so is any key with 48
 * leading zero hex digits (a value that fits in 64 bits). File paths are scanned
 * too (the part after `.tgz:` for tarball entries); their findings have line 0.
 * Tarball findings carry `tarball: true`.
 *
 * @param files - Files to scan.
 * @param blockedTerms - Extra case-insensitive terms to block.
 * @returns Matches, in file then line order.
 */
export function scanFiles(
  files: Iterable<ScannedFile>,
  blockedTerms: readonly string[] = [],
): Finding[] {
  const rules: [RuleId, RegExp][] = Object.entries(RULES) as [RuleId, RegExp][];
  if (blockedTerms.length > 0) {
    const escaped = blockedTerms.map((term) =>
      term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    rules.push([
      "blocked-term",
      new RegExp(`(?<!\\w)(?:${escaped.join("|")})(?!\\w)`, "gi"),
    ]);
  }

  // Whole-text matching, so a formatter-wrapped `KEY =\n  "0x…"` still matches.
  const scanned = [...files].map((file) => ({
    ...file,
    source: (file.content.includes(0)
      ? Buffer.from(file.content.filter((byte) => byte !== 0))
      : file.content
    ).toString("utf8"),
  }));
  // Names in an expression: a plain name, or the last member of a chain
  // (`CFG.deployer` gives member `deployer`). Number parts (`0x`) are skipped.
  const references = (expression: string) =>
    [
      ...expression.matchAll(
        /(?<![\w$.])([a-z_$][\w$]*)((?:\s*\??\.\s*[a-z_$][\w$]*)*)/gi,
      ),
    ].map(([, root = "", chain = ""]) => {
      const member = /[\w$]+$/.exec(chain)?.[0];
      return member === undefined
        ? { name: root, member: false }
        : { name: member, member: true };
    });
  // Names passed to a sink in any file, so a key exported by a shared module and
  // used in another file is still checked (see the per-file loop).
  const sinkNames = new Map(
    SINKS.map(([rule, sink]) => [
      rule,
      scanned.flatMap(({ source }) =>
        [...source.matchAll(new RegExp(sink, "gi"))].flatMap(
          ({ 0: call, index }) => {
            const start = index + call.length;
            const limit = Math.min(source.length, start + VALUE_WINDOW);
            const end = valueEnd(source, { opener: call, start, limit });
            return references(source.slice(start, end));
          },
        ),
      ),
    ]),
  );

  const findings: Finding[] = [];
  for (const { path, source, tarball } of scanned) {
    const fileFindings: Finding[] = [];
    // Several wallet rules can match one key; report each value once per file.
    const reported = new Set<string>();
    const name = tarball
      ? path.slice(path.indexOf(".tgz:") + ".tgz:".length)
      : path;
    const marker = tarball ? { tarball } : {};
    for (const [rule, pattern] of rules) {
      for (const [match] of name.matchAll(pattern)) {
        fileFindings.push({ path, line: 0, rule, match, ...marker });
      }
    }
    const lineStarts = [0];
    for (let index = source.indexOf("\n"); index !== -1; ) {
      lineStarts.push(index + 1);
      index = source.indexOf("\n", index + 1);
    }
    // A sink fed a constant by name: also check every value assigned to a name
    // in its first argument, whatever the name, as `const deployer = "0x…"`.
    // Casts and template parts (`\`0x${raw}\``) count. For a member
    // (`CFG.deployer`), only that member's value is checked (`deployer: …`,
    // `.deployer = …`), not the whole object. Every name in the whole
    // right-hand side of such an assignment is followed too, through any number of
    // aliases. A list
    // mapped through a sink (`[A, "0x…"].map(privateKeyToAccount)`,
    // `keys.map((k) => privateKeyToAccount(k))`) counts as passed to it.
    const assigned: [RuleId, string, number][] = [];
    // Mapped lists whose start is out of reach: reported, as the scan fails closed.
    const overlong: [RuleId, string, number][] = [];
    for (const [rule, sink] of SINKS) {
      const mapped = new RegExp(
        String.raw`\.(?:map|flatMap|forEach)\(\s*(?:(?:async\s*)?(?:\([^)]{0,80}\)|[\w$]+)\s*=>\s*\{?\s*(?:return\s+)?)?(?:${sink.replaceAll("\\(", String.raw`(?:\(|\s*\))`)})`,
        "gi",
      );
      // The whole value starting at `start`, as `valueSecrets` delimits it.
      const span = (opener: string, start: number) =>
        source.slice(
          start,
          valueEnd(source, {
            opener,
            start,
            limit: Math.min(source.length, start + VALUE_WINDOW),
          }),
        );
      const seen = new Set<string>();
      let names = [...source.matchAll(new RegExp(sink, "gi"))].flatMap(
        ({ 0: call, index }) => references(span(call, index + call.length)),
      );
      // A name passed to a sink in another file: only this file's `export`ed
      // declaration of it is checked, and only for a key or phrase it holds, as
      // generic names (`hex`, `items`) would otherwise fail every long value.
      const kind = rule === "mnemonic-list" ? "mnemonic" : "key";
      for (const ident of new Set(
        sinkNames.get(rule)?.map((ref) => ref.name),
      )) {
        const exported = new RegExp(
          String.raw`\bexport\s+(?:const|let|var)\s+${ident.replace(/\$/g, "\\$")}\s*(?::[^=;\n]{0,40})?=(?![=>])`,
          "g",
        );
        for (const { 0: opener, index } of source.matchAll(exported)) {
          const start = index + opener.length;
          if (
            valueSecrets(source, { opener, start, kind }).some(
              // The overflow marker has no secret but must still fail the scan.
              ({ secret, match }) =>
                secret !== undefined ||
                match.endsWith(
                  `(value longer than ${VALUE_WINDOW} characters)`,
                ),
            )
          ) {
            assigned.push([rule, opener, index]);
          }
        }
      }
      for (const { 0: call, index } of source.matchAll(mapped)) {
        let end = index;
        while (end > 0 && /\s/.test(source[end - 1] ?? "")) end--;
        // Walk back over the whole receiver: names, `.`, calls and indexes, as
        // `Object.values(SIGNERS)`, `LIST.split(",")` or `DEPLOYERS[chain]`. A `[`
        // with no name, `)` or `]` before it opens a list literal.
        const floor = Math.max(0, end - VALUE_WINDOW);
        let start = end;
        let list: number | undefined;
        let literal: number | undefined;
        let overflow = false;
        for (;;) {
          const close = source[start - 1];
          if (close === ")" || close === "]") {
            const opens = close === ")" ? "(" : "[";
            let open = start - 1;
            for (let depth = 0; open >= floor; open--) {
              if (source[open] === close) depth++;
              else if (source[open] === opens && --depth === 0) break;
            }
            if (open < floor) {
              overflow = true;
              break;
            }
            let before = open;
            while (before > 0 && /\s/.test(source[before - 1] ?? "")) before--;
            start = open;
            if (/[\w$)\]]/.test(source[before - 1] ?? "")) {
              start = before;
              continue;
            }
            if (close === "]") list = open;
            break;
          }
          // A string receiver (`"0x…,0x…".split(",")`) is a value to check.
          if (close === '"' || close === "'" || close === "`") {
            let open = start - 2;
            while (
              open >= floor &&
              (source[open] !== close || source[open - 1] === "\\")
            ) {
              open--;
            }
            if (open < floor) {
              overflow = true;
              break;
            }
            start = open;
            literal = open;
            break;
          }
          if (start > floor && /[\w$.?]/.test(close ?? "")) {
            start--;
            continue;
          }
          break;
        }
        if (overflow) {
          overlong.push([rule, call, index]);
          continue;
        }
        if (literal === start) {
          // `valueSecrets` starts at `index + opener.length`: the opening quote.
          assigned.push([rule, call, start - call.length]);
          continue;
        }
        if (list === start) {
          names.push(...references(source.slice(start + 1, end - 1)));
          // `valueSecrets` starts at `index + opener.length`: the list's `[`.
          assigned.push([rule, call, start - call.length]);
          continue;
        }
        const receiver = source.slice(start, end);
        names.push(
          ...references(receiver),
          // Roots too: `LIST` in `LIST.split(",")`.
          ...[...receiver.matchAll(/(?<![\w$.])[a-z_$][\w$]*/gi)].map(
            ([root]) => ({ name: root, member: false }),
          ),
        );
      }
      // Each name is looked up once, so this ends however long the alias chain.
      while (names.length > 0) {
        const next: typeof names = [];
        for (const { name: ident, member } of names) {
          const key = `${member ? "." : ""}${ident}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const escaped = ident.replace(/\$/g, "\\$");
          const declaration = new RegExp(
            member
              ? String.raw`(?:(?<![\w$.])["']?${escaped}["']?\s*:(?!:)|\.${escaped}\s*=(?![=>]))`
              : String.raw`(?<![\w$.])${escaped}\s*(?::[^=;\n]{0,40})?=(?![=>])`,
            "g",
          );
          for (const { 0: opener, index } of source.matchAll(declaration)) {
            assigned.push([rule, opener, index]);
            next.push(...references(span(opener, index + opener.length)));
          }
          // A shorthand property (`{ deployer }`) holds the plain name's value.
          if (
            member &&
            new RegExp(String.raw`[{,]\s*${escaped}\s*[,}]`).test(source)
          ) {
            next.push({ name: ident, member: false });
          }
        }
        names = next;
      }
    }
    for (const [rule, call, at] of overlong) {
      const line = lineStarts.findLastIndex((start) => start <= at) + 1;
      fileFindings.push({
        path,
        line,
        rule,
        match: `${call}…(list longer than ${VALUE_WINDOW} characters)`,
        ...marker,
      });
    }
    for (const [rule, pattern] of rules) {
      const matches = [
        ...[...source.matchAll(pattern)].map(
          ({ 0: opener, index, groups }) => ({ opener, index, groups }),
        ),
        ...assigned
          .filter(([assignedRule]) => assignedRule === rule)
          .map(([, opener, index]) => ({ opener, index, groups: undefined })),
      ];
      for (const { opener, index, groups } of matches) {
        // A value can hold a test key and a real key, so each one is checked.
        const candidates =
          rule === "wallet-key-list" || rule === "mnemonic-list"
            ? valueSecrets(source, {
                opener,
                start: index + opener.length,
                kind: rule === "mnemonic-list" ? "mnemonic" : "key",
              })
            : [{ secret: groups?.secret, at: index, match: opener }];
        for (const { secret, at, match } of candidates) {
          const value = secret?.toLowerCase().replace(/^0x/, "");
          if (
            value !== undefined &&
            (PUBLIC_TEST_SECRETS.has(value) ||
              /^0{48}[0-9a-f]{16}$/.test(value) ||
              reported.has(value))
          ) {
            continue;
          }
          if (value !== undefined) reported.add(value);
          const line = lineStarts.findLastIndex((start) => start <= at) + 1;
          fileFindings.push({ path, line, rule, match, ...marker });
        }
      }
    }
    fileFindings.sort(
      (a, b) => a.line - b.line || a.rule.localeCompare(b.rule),
    );
    findings.push(...fileFindings);
  }
  return findings;
}

/**
 * Finds where the named value starting at `start` ends, with the rules
 * described on {@link valueSecrets}.
 *
 * @param source - Whole file text.
 * @param value - The matched opener, the offset just after it, and the offset
 * the walk stops at.
 * @returns The offset just after the value.
 */
function valueEnd(
  source: string,
  value: { opener: string; start: number; limit: number },
): number {
  const { opener, start, limit } = value;
  const lineStart = source.lastIndexOf("\n", start - opener.length - 1) + 1;
  // Strict dotenv shape: `NAME=` with no space before `=` and no dotted name, so
  // a JS reassignment (`privateKey = …`, `this.pk = …`) isn't cut at the newline.
  const dotenv =
    /\S=$/.test(opener) &&
    /^[ \t]*(?:export[ \t]+)?[\w-]*$/.test(
      source.slice(lineStart, start - opener.length),
    ) &&
    !/^[ \t]*[[({]/.test(source.slice(start, start + 200));
  let depth = 0;
  let end = start;
  let seen = false;
  let quote: string | undefined;
  for (; end < limit; end++) {
    const char = source[end];
    if (char === "\n") {
      // A dotenv value ends at the line end unless it opened a quote or the next
      // line continues it.
      if (
        dotenv &&
        quote === undefined &&
        !/^\s*[?:|&.]/.test(source.slice(end + 1, end + 200))
      ) {
        break;
      }
      if (!dotenv && (quote === '"' || quote === "'")) quote = undefined;
    }
    if (quote !== undefined) {
      if (char === "\\") end++;
      else if (char === quote) quote = undefined;
      continue;
    }
    // Only a quote at its start makes a dotenv value multi-line.
    if (dotenv && /\S/.test(source.slice(start, end))) continue;
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      seen = true;
      continue;
    }
    if (dotenv) continue;
    if (
      (char === "#" || (char === "/" && source[end + 1] === "/")) &&
      !/\S/.test(source[end - 1] ?? " ")
    ) {
      const next = source.indexOf("\n", end);
      end = next === -1 ? limit : next - 1;
      continue;
    }
    if (char === "/" && source[end + 1] === "*") {
      const next = source.indexOf("*/", end + 2);
      end = next === -1 ? limit : next + 1;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") {
      if (--depth < 0) break;
    } else if (depth === 0 && (char === "," || char === ";")) break;
    else if (depth === 0 && char === "\n" && seen) {
      if (!/^\s*[?:|&.]/.test(source.slice(end + 1, end + 200))) break;
    }
    if (char !== undefined && /\S/.test(char)) seen = true;
  }
  return end;
}

/**
 * Lists every 64-hex value (`kind: "key"`) or quoted 12–24-word phrase
 * (`kind: "mnemonic"`) in the named value that starts at `start`, plus the
 * items of a YAML block list under the name. The value ends at a `,`, `;` or
 * closing bracket outside any nesting or string, or at a line break unless the
 * next line continues it (`?`, `:`, `|`, `&`, `.`). A dotenv-style `NAME=` at the
 * start of a line (no space before `=`, no dotted name) runs to the end of the
 * line, unless the value opens a bracket, starts with a quote (then it runs until
 * the quote closes, across lines) or the next line continues it. A value still
 * open after 4096 characters is reported as a candidate with no secret, so the
 * gate fails closed. Outside dotenv values, whitespace-preceded `//` and `#`
 * comments and `/* *\/` comments are skipped, so a closing bracket, `,` or `;` in
 * a comment can't end the value early. YAML lists may hold blank and `#` comment
 * lines.
 *
 * @param source - Whole file text.
 * @param value - The matched opener, the offset just after it, and what to look for.
 * @returns Each candidate secret, its offset, and the text to report.
 */
export function valueSecrets(
  source: string,
  value: { opener: string; start: number; kind?: "key" | "mnemonic" },
) {
  const { opener, start } = value;
  const mnemonic = value.kind === "mnemonic";
  const limit = Math.min(source.length, start + VALUE_WINDOW);
  const end = valueEnd(source, { opener, start, limit });
  const hex = mnemonic
    ? /["'`](?<secret>[a-z]+(?:[ \t]+[a-z]+){11,23})["'`]/gi
    : /(?<![\w$])(?<secret>(?:0x)?[0-9a-f]{64})n?(?![\w$])/gi;
  const inSpan = [...source.slice(start, end).matchAll(hex)].map(
    ({ 0: match, index, groups }) => ({ match, at: start + index, groups }),
  );
  const yaml =
    /^[ \t]*(?:#[^\n]*)?\r?\n((?:[ \t]*(?:#[^\n]*)?\r?\n|[ \t]*-[ \t]+[^\n]*(?:\n|$))+)/.exec(
      source.slice(start, limit),
    );
  const list = yaml?.[1] ?? "";
  const listStart = start + (yaml?.[0].length ?? 0) - list.length;
  const items = [
    ...list.matchAll(
      mnemonic
        ? /-[ \t]+["']?(?<secret>[a-z]+(?:[ \t]+[a-z]+){11,23})\b/gi
        : /-[ \t]+["']?(?<secret>(?:0x)?[0-9a-f]{64})\b/gi,
    ),
  ].map(({ 0: match, index, groups }) => ({
    match,
    at: listStart + index,
    groups,
  }));
  const truncated =
    limit < source.length &&
    (end >= limit ||
      (yaml != null && yaml.index + yaml[0].length >= limit - start));
  const overflow = truncated
    ? [
        {
          match: `(value longer than ${VALUE_WINDOW} characters)`,
          at: start,
          groups: undefined,
        },
      ]
    : [];
  return [...inSpan, ...items, ...overflow].map(({ match, at, groups }) => ({
    secret: groups?.secret,
    at,
    match: `${opener}…${match}`,
  }));
}

/**
 * Splits findings into blocking ones and allowed ones, and reports exceptions that
 * matched nothing so stale entries get removed. Tarball findings
 * (`tarball: true`) always block, whatever the exception glob: an
 * excepted file must not ship to npm.
 *
 * @param findings - Output of {@link scanFiles}.
 * @param exceptions - Allowed occurrences.
 * @returns Blocking findings and unused exceptions.
 */
export function applyExceptions(
  findings: readonly Finding[],
  exceptions: readonly ScanException[],
): { blocking: Finding[]; unused: ScanException[] } {
  const used = new Set<ScanException>();
  const blocking = findings.filter((finding) => {
    if (finding.tarball) return true;
    const exception = exceptions.find(
      ({ path, rule, match }) =>
        rule === finding.rule &&
        match === finding.match &&
        matchesGlob(finding.path, path),
    );
    if (exception) used.add(exception);
    return exception == null;
  });
  return {
    blocking,
    unused: exceptions.filter((exception) => !used.has(exception)),
  };
}

/**
 * Lists files under a directory, as POSIX paths relative to it. A symlink is
 * listed with its target string as content, so its name and target get scanned;
 * the generator already checked the target stays in the tree.
 *
 * @param dir - Directory to walk.
 * @returns The files.
 */
export function readTree(dir: string): ScannedFile[] {
  const files: ScannedFile[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const stat = lstatSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile() || stat.isSymbolicLink()) {
        files.push({
          path: relative(dir, full).split(sep).join("/"),
          content: stat.isFile()
            ? readFileSync(full)
            : Buffer.from(readlinkSync(full)),
        });
      }
    }
  };
  walk(dir);
  return files;
}

/**
 * Reads every file in npm tarballs with npm's bundled node-tar, the parser npm
 * publish uses. Paths look like `<tarball>.tgz:package/...`.
 *
 * @param tarballs - Paths to `.tgz` files.
 * @param reader - node-tar; defaults to the copy bundled with npm.
 * @returns The files.
 * @throws If a tarball holds anything other than regular files and directories,
 * or yields no `package/package.json` (a reader that never reported its entries).
 */
export async function readTarballs(
  tarballs: readonly string[],
  reader: EntryLister = loadBundledTar(
    execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
  ),
): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  for (const tarball of tarballs) {
    const irregular: string[] = [];
    let hasManifest = false;
    await reader.list({
      file: tarball,
      strict: true,
      onReadEntry: (entry) => {
        if (entry.type !== "File" && entry.type !== "OldFile") {
          if (entry.type !== "Directory") {
            irregular.push(`${redactPath(entry.path)} (${entry.type})`);
          }
          entry.resume();
          return;
        }
        if (entry.path === "package/package.json") hasManifest = true;
        const chunks: Buffer[] = [];
        entry.on("data", (chunk) => chunks.push(chunk));
        entry.on("end", () =>
          files.push({
            path: `${basename(tarball)}:${entry.path}`,
            content: Buffer.concat(chunks),
            tarball: true,
          }),
        );
      },
    });
    if (irregular.length > 0) {
      throw new Error(
        `"${tarball}" has entries that are not regular files: ${irregular.join(", ")}.`,
      );
    }
    if (!hasManifest) {
      throw new Error(`"${tarball}" has no package/package.json.`);
    }
  }
  return files;
}

/**
 * Decides the outcome of a scan run.
 *
 * @param result - Findings after exceptions, how many tree files and tarballs were
 * read (`undefined` when not requested), and the policy path for messages.
 * @returns The exit code and the lines to print.
 */
export function evaluate(result: {
  blocking: readonly Finding[];
  unused: readonly ScanException[];
  treeFiles?: number;
  tarballs?: number;
  scannedFiles: number;
  policyPath: string;
}): { exitCode: 0 | 1; errors: string[]; summary?: string } {
  const errors: string[] = [];
  if (result.treeFiles === 0) errors.push("The tree is empty.");
  if (result.tarballs === 0) errors.push("No .tgz files to scan.");
  for (const { path, line, rule, match } of result.blocking) {
    const secret = SECRET_RULES.has(rule);
    const shown = secret
      ? `${JSON.stringify(match.slice(0, 4))}… (${match.length} characters, redacted)`
      : JSON.stringify(match);
    // A credential in a file name would otherwise be printed with every finding
    // on the file, and a `*-list` finding's match is only its opener.
    errors.push(`${redactPath(path)}:${line}: ${rule}: ${shown}`);
  }
  // Exceptions apply to tree findings only, so stale exceptions are reported on
  // tree scans only.
  if (result.treeFiles !== undefined) {
    for (const { path, rule, match } of result.unused) {
      errors.push(
        `Unused exception: ${rule} ${JSON.stringify(match)} in "${path}". Remove it from "${result.policyPath}".`,
      );
    }
  }
  if (errors.length > 0) return { exitCode: 1, errors };
  return {
    exitCode: 0,
    errors,
    summary: `Scanned ${result.scannedFiles} files: nothing internal found.`,
  };
}

/**
 * Checks the `--tree` and `--tarballs` flags, so an unset shell variable can't
 * silently turn off a scan.
 *
 * @param flags - Parsed flag values.
 * @returns The directories to scan.
 * @throws If a flag is an empty string, or both are missing.
 */
export function parseTargets(flags: {
  readonly tree?: string;
  readonly tarballs?: string;
}): { tree?: string; tarballs?: string } {
  if (flags.tree === "" || flags.tarballs === "") {
    throw new Error(
      "--tree and --tarballs need a directory, not an empty string.",
    );
  }
  if (flags.tree === undefined && flags.tarballs === undefined) {
    throw new Error(
      "Usage: scan.ts [--tree <dir>] [--tarballs <dir>] [--policy <file>]",
    );
  }
  return { tree: flags.tree, tarballs: flags.tarballs };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      tree: { type: "string" },
      tarballs: { type: "string" },
      policy: { type: "string", default: POLICY_PATH },
    },
  });
  const { tree, tarballs: tarballDir } = parseTargets(values);
  const policy = parsePolicy(
    JSON.parse(readFileSync(values.policy, "utf8")),
    values.policy,
  );
  const treeFiles = tree === undefined ? undefined : readTree(tree);
  const tarballs =
    tarballDir === undefined
      ? undefined
      : readdirSync(tarballDir)
          .filter((name) => name.endsWith(".tgz"))
          .sort()
          .map((name) => join(tarballDir, name));
  const files = [
    ...(treeFiles ?? []),
    ...(tarballs ? await readTarballs(tarballs) : []),
  ];
  const { blocking, unused } = applyExceptions(
    scanFiles(files, policy.blockedTerms),
    policy.exceptions,
  );
  const { exitCode, errors, summary } = evaluate({
    blocking,
    unused,
    treeFiles: treeFiles?.length,
    tarballs: tarballs?.length,
    scannedFiles: files.length,
    policyPath: values.policy,
  });
  for (const error of errors) console.error(error);
  if (summary) console.log(summary);
  process.exitCode = exitCode;
}

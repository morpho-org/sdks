import type { RuleTester } from "oxlint/plugins-dev";
import { getAddress } from "viem";

type OxlintRule = Parameters<RuleTester["run"]>[1];
type RuleContext = Parameters<NonNullable<OxlintRule["create"]>>[0];

export default {
  meta: { name: "morpho-sdk" },
  rules: {
    "checksum-address": {
      meta: {
        type: "problem",
        fixable: "code",
      },
      create(context: RuleContext) {
        if (!/\.[jt]s$/.test(context.filename)) return {};
        const { sourceCode } = context;

        return {
          Program() {
            // The old address check covered raw source, including comments and templates.
            for (const match of sourceCode.text.matchAll(
              /0x[0-9a-f]{40}(?![0-9a-f])/gi,
            )) {
              const [address] = match;
              const checksum = getAddress(`0x${address.slice(2)}`);
              if (address === checksum) continue;

              const start = match.index;
              const end = start + address.length;
              context.report({
                loc: {
                  start: sourceCode.getLocFromIndex(start),
                  end: sourceCode.getLocFromIndex(end),
                },
                message: `Use the checksummed address ${checksum}.`,
                fix: (fixer) => fixer.replaceTextRange([start, end], checksum),
              });
            }
          },
        };
      },
    },
  },
};

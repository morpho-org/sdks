module.exports = {
  embeddedLanguageFormatting: "off",
  importOrder: [
    "^react.*",
    "^(?![@\\.]).*",
    "^@(?!morpho|/).*",
    "^@morpho.*",
    "^@",
    "^\\.\\.",
    "^\\.",
  ],
  importOrderSeparation: true,
  importOrderParserPlugins: ["typescript", "decorators-legacy"],
  plugins: [require("@trivago/prettier-plugin-sort-imports")],
};

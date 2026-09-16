/**
 * Removes source-file exclusions from an API Extractor model without mutating it.
 * API Extractor separately trims declarations tagged as internal.
 * @param {object} model - A parsed API Extractor doc model or member.
 * @returns {object} A model excluding test, internal, and generated GraphQL members.
 * @example
 * import { filterDocModel } from "./model.mjs";
 * const model = filterDocModel({ members: [{ fileUrlPath: "src/internal/helper.d.ts" }] });
 * // model.members is empty.
 */
export function filterDocModel(model) {
  if (!model.members) return model;
  return {
    ...model,
    members: model.members
      .filter((member) => {
        const path = (member.fileUrlPath ?? "").replaceAll("\\", "/");
        return !/(?:^|\/)internal\/|\.test\.d\.ts$|(?:^|\/)api\/(?:sdk|types)\.d\.ts$/.test(
          path,
        );
      })
      .map(filterDocModel),
  };
}

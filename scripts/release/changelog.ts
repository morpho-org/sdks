/**
 * Changesets changelog generator that writes only the change text.
 *
 * Entries carry no PR links, commit SHAs or author credits, so the same
 * `CHANGELOG.md` can be published from a repository that holds none of the
 * development history.
 */

interface ReleaseChangeset {
  summary: string;
}

interface UpdatedDependency {
  name: string;
  newVersion: string;
}

/**
 * Formats one changeset as a Markdown list item.
 *
 * @param changeset - Changeset whose summary becomes the entry.
 * @returns The first summary line as a bullet, further lines indented under it.
 */
async function getReleaseLine(changeset: ReleaseChangeset): Promise<string> {
  const [firstLine, ...futureLines] = changeset.summary
    .split("\n")
    .map((line) => line.trimEnd());
  return [
    `- ${firstLine}`,
    ...futureLines.map((line) => (line ? `  ${line}` : "")),
  ].join("\n");
}

/**
 * Lists the workspace dependencies bumped alongside a release.
 *
 * @param _changesets - Changesets that caused the dependency bumps (unused).
 * @param dependenciesUpdated - Dependencies whose version changed.
 * @returns A bullet listing each `name@version`, or `""` when nothing changed.
 */
async function getDependencyReleaseLine(
  _changesets: readonly ReleaseChangeset[],
  dependenciesUpdated: readonly UpdatedDependency[],
): Promise<string> {
  if (dependenciesUpdated.length === 0) return "";
  return [
    "- Updated dependencies",
    ...dependenciesUpdated.map(
      ({ name, newVersion }) => `  - ${name}@${newVersion}`,
    ),
  ].join("\n");
}

export default { getReleaseLine, getDependencyReleaseLine };

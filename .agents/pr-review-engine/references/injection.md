# Injection — canonical rubric

Code execution / HTML interpretation paths that take untrusted input and
hand it to a renderer or interpreter without sanitization. Single owner
for this concern across the agent set; agents cross-check this file via
the pointer line `Cross-check \`references/injection.md\` when this concern
applies.`

## What counts as injection

- **HTML / XSS**: `dangerouslySetInnerHTML`, `innerHTML =`, `outerHTML =`,
  `document.write`, `<Streamdown>` / similar markdown renderers fed
  user-controlled input without sanitization config.
- **JS evaluation**: `eval()`, `new Function(...)`, `setTimeout(string, ...)`,
  `setInterval(string, ...)`, vm-context `runInNewContext` with attacker
  input, jsonp callbacks computed from user input.
- **Shell**: `child_process.exec(string)` with interpolated input,
  template-literal `exec` calls, `os.system()` with user input,
  `subprocess.run(..., shell=True)` with concatenation.
- **SQL**: hand-built query strings via concatenation or template literals
  rather than parameterized queries.
- **CI workflow expression injection**: `${{ github.event.* }}`,
  `${{ github.head_ref }}`, comment / PR title interpolated directly into
  a workflow `run:` block. Owned by `ci-security`; cross-listed here for
  reference.

## Where to flag

| Pattern | Severity |
|---|---|
| `dangerouslySetInnerHTML={{ __html: <user-derived> }}` without a sanitizer call on the path | **Critical** |
| `eval(<user-derived>)` / `new Function(<user-derived>)` | **Critical** |
| `exec(...)` with shell=true and concatenated user input | **Critical** |
| SQL built via concatenation / template literal (parameterized query exists) | **High** |
| `<Streamdown source={ai-output} />` without `sanitize` config | **High** when input is untrusted |
| `setTimeout("code", ...)` with a string argument | **Medium** |
| Refs to `Function()` constructor on diff path that doesn't take user input | **Low** (note only) |

## How to fix

1. **HTML**: route the input through a sanitizer (`DOMPurify.sanitize`, the
   framework's built-in escape helper); flag if the project has a
   `Sanitizer` utility in `<PROJECT_CONTEXT>` that isn't being used here.
2. **JS evaluation**: refactor to a switch / lookup table; if dynamic
   code execution is genuinely required, sandbox in a Worker or
   isolated-vm with a strict allowlist.
3. **Shell**: use array-form arguments (`spawn`, `execFile` with arg
   array, `subprocess.run([...])` without `shell=True`) so the shell
   does not interpret separator characters.
4. **SQL**: parameterized query via the driver's `?` / `$1` / named
   placeholder mechanism.
5. **Streamdown / markdown**: pass `sanitize` / `allowedTags` config or
   wrap in `DOMPurify.sanitize` upstream.

## Out of scope

- Generic input validation patterns — see `correctness` (forbidden patterns).
- Authn/authz logic — out of scope for this rubric; flag separately.
- Path traversal — adjacent concern but distinct rubric; flag under
  `correctness` if it touches the diff.

## Consumers

- `correctness` — `dangerouslySetInnerHTML`, `eval`, `new Function`, generic
  injection surfaces in source code.
- `ai-sdk` — `<Streamdown>` rendering AI output without sanitization.
- `ci-security` — workflow expression injection (cross-listed; owned there).

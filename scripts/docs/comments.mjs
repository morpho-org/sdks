import { parse } from "@babel/parser";

// JSDoc types can contain nested object types; stop at the matching closing brace.
function splitType(text) {
  if (!text.startsWith("{")) return ["", text];
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "{") depth++;
    if (text[index] === "}" && --depth === 0)
      return [text.slice(1, index), text.slice(index + 1).trimStart()];
  }
  throw new SyntaxError(`Unclosed JSDoc type: ${text}`);
}

/**
 * Adapts source JSDoc conventions to TSDoc in an emitted declaration file.
 * Nested parameter descriptions become remarks so API Extractor retains them.
 * Destructured parameters receive documented names in the declaration copy;
 * parameter types, string literals, and examples stay intact.
 * @param {string} source - Declaration file contents.
 * @returns {string} Declarations with compatible documentation comments.
 * @throws {SyntaxError} When declarations or a JSDoc type cannot be parsed.
 * @example
 * import { normalizeDeclarationComments } from "./comments.mjs";
 * const source = "/** @throws {RangeError} when out of range. " + "*" + "/";
 * const output = normalizeDeclarationComments(`${source}\nexport declare function check(): void;`);
 * // output documents RangeError using an inline code span.
 */
export function normalizeDeclarationComments(source) {
  const { comments, program } = parse(source, {
    sourceType: "module",
    plugins: [["typescript", { dts: true }]],
  });
  const replacements = [];
  const parameterNames = new Map();
  for (const comment of comments) {
    if (comment.type !== "CommentBlock" || !comment.value.startsWith("*"))
      continue;

    const blocks = [{ tag: "", lines: [] }];
    let fence = "";
    for (const rawLine of comment.value.slice(1).split(/\r?\n/)) {
      const line = rawLine.replace(/^\s*\* ?/, "");
      const delimiter = line.trimStart().match(/^(`{3,}|~{3,})/)?.[1];
      if (delimiter) {
        if (!fence) fence = delimiter;
        else if (delimiter[0] === fence[0] && delimiter.length >= fence.length)
          fence = "";
      }
      const tag =
        !fence && !delimiter && line.trimStart().match(/^@(\w+)\b\s*(.*)/);
      if (tag) blocks.push({ tag: tag[1], lines: [tag[2]] });
      else blocks.at(-1).lines.push(line);
    }

    const summary = [];
    const tags = [];
    const remarks = [];
    const fields = [];
    const returns = [];
    const names = new Set();
    for (const block of blocks) {
      const text = block.lines.join("\n").trim();
      switch (block.tag) {
        case "":
        case "inheritdoc":
          // Legacy @inheritdoc blocks contain local prose, not a declaration reference.
          if (text) summary.push(text);
          break;
        case "param": {
          const [, parameter] = splitType(text);
          const match = parameter.match(
            /^(\[[^\]]+\]|[^\s]+)\s*(?:-\s*)?([\s\S]*)$/,
          );
          if (!match) throw new SyntaxError(`Invalid JSDoc parameter: ${text}`);
          const [, rawName, description] = match;
          const optional = rawName.startsWith("[");
          const [name, defaultValue] = (
            optional ? rawName.slice(1, -1) : rawName
          ).split(/=(.*)/s);
          names.add(name.split(/[.[]/)[0]);
          const details = [
            optional ? "Optional." : "",
            defaultValue ? `Default: \`${defaultValue}\`.` : "",
            description,
          ]
            .filter(Boolean)
            .join(" ");
          if (/^[\w$]+$/.test(name)) tags.push(`@param ${name} - ${details}`);
          else fields.push(`- \`${name}\`: ${details}`);
          break;
        }
        case "returns":
        case "return": {
          const [, description] = splitType(text);
          returns.push(description);
          break;
        }
        case "throws": {
          const [type, description] = splitType(text);
          tags.push(`@throws ${type ? `\`${type}\` ` : ""}${description}`);
          break;
        }
        case "remarks":
          remarks.push(text);
          break;
        case "warning":
        case "overload":
          remarks.push(
            `${block.tag === "warning" ? "Warning" : "Overloads"}:\n\n${text}`,
          );
          break;
        case "example":
          tags.push(`@example\n${text}`);
          break;
        case "default":
          tags.push(`@defaultValue ${text}`);
          break;
        default:
          tags.push(`@${block.tag}${text ? ` ${text}` : ""}`);
      }
    }
    if (fields.length)
      remarks.push(`Parameter details:\n\n${fields.join("\n\n")}`);
    if (remarks.length) tags.unshift(`@remarks\n${remarks.join("\n\n")}`);
    if (returns.length) tags.push(`@returns ${returns.join("\n\n")}`);
    const body = [...summary, ...tags].join("\n\n");
    parameterNames.set(comment.start, [...names]);
    replacements.push({
      start: comment.start,
      end: comment.end,
      text: `/**\n${body
        .split("\n")
        .map((line) => ` *${line ? ` ${line}` : ""}`)
        .join("\n")}\n */`,
    });
  }

  // API Extractor otherwise emits duplicate/untyped parameter rows for binding patterns.
  // Rename only the binding, preserving the original type annotation and optional marker.
  const pending = [{ node: program, names: [] }];
  while (pending.length) {
    const { node, names: inheritedNames } = pending.pop();
    const documentedNames =
      (node.leadingComments ?? [])
        .map((comment) => parameterNames.get(comment.start))
        .findLast((names) => names?.length) ?? inheritedNames;
    const parameters = node.params ?? node.parameters;
    if (Array.isArray(parameters)) {
      const used = new Set(
        parameters
          .filter((parameter) => parameter.type === "Identifier")
          .map((parameter) => parameter.name),
      );
      for (const [index, parameter] of parameters.entries()) {
        if (
          (parameter.type !== "ObjectPattern" &&
            parameter.type !== "ArrayPattern") ||
          !parameter.typeAnnotation
        )
          continue;
        let name =
          documentedNames.find((candidate) => !used.has(candidate)) ??
          `input${index || ""}`;
        while (used.has(name)) name = `_${name}`;
        used.add(name);
        replacements.push({
          start: parameter.start,
          end: parameter.typeAnnotation.start,
          text: `${name}${parameter.optional ? "?" : ""}`,
        });
      }
    }
    for (const value of Object.values(node)) {
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (
          child &&
          typeof child === "object" &&
          typeof child.type === "string"
        )
          pending.push({ node: child, names: documentedNames });
      }
    }
  }
  let output = source;
  for (const replacement of replacements.sort(
    (left, right) => right.start - left.start,
  )) {
    output =
      output.slice(0, replacement.start) +
      replacement.text +
      output.slice(replacement.end);
  }
  return output;
}

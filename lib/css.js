const postcss = require("postcss");

function rewriteCSS(css, baseURL, proxyURL) {
  const root = postcss.parse(css);

  function rewriteURL(value) {
    const input = value.trim().replace(/^(['"])(.*)\1$/, "$2");

    if (
      !input ||
      input.startsWith("#") ||
      /^(data:|blob:|javascript:|mailto:|tel:)/i.test(input)
    ) {
      return null;
    }

    try {
      const url = new URL(input, baseURL);

      if (!["http:", "https:"].includes(url.protocol)) {
        return null;
      }

      return proxyURL(url.href);
    } catch {
      return null;
    }
  }

  function rewriteFunctions(value) {
    let output = "";
    let index = 0;

    while (index < value.length) {
      const match = value.slice(index).match(/^url\s*\(/i);

      if (!match) {
        output += value[index];
        index++;
        continue;
      }

      const start = index;
      let cursor = index + match[0].length;
      let quote = null;
      let escaped = false;
      let depth = 1;

      while (cursor < value.length && depth > 0) {
        const char = value[cursor];

        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (quote) {
          if (char === quote) quote = null;
        } else if (char === '"' || char === "'") {
          quote = char;
        } else if (char === "(") {
          depth++;
        } else if (char === ")") {
          depth--;
        }

        cursor++;
      }

      if (depth !== 0) {
        output += value.slice(start);
        break;
      }

      const original = value.slice(start, cursor);
      const inner = value.slice(
        start + match[0].length,
        cursor - 1
      ).trim();

      const rewritten = rewriteURL(inner);

      output += rewritten
        ? `url("${rewritten}")`
        : original;

      index = cursor;
    }

    return output;
  }

  root.walkDecls(decl => {
    decl.value = rewriteFunctions(decl.value);
  });

  root.walkAtRules("import", rule => {
    const params = rule.params.trim();
    const quoted = params.match(/^(['"])(.*?)\1/);

    if (quoted) {
      const rewritten = rewriteURL(quoted[2]);

      if (rewritten) {
        rule.params =
          `"${rewritten}"` +
          params.slice(quoted[0].length);
      }
    } else {
      rule.params = rewriteFunctions(rule.params);
    }
  });

  return root.toString();
}

module.exports = {
  rewriteCSS
};

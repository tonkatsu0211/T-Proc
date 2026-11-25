const postcss = require("postcss");

function rewriteCSS(css, baseURL, proxyURL) {
  const root = postcss.parse(css);

  function rewriteURL(value) {
    const input = value.trim().replace(/^(['"])(.*)\1$/, "$2");

    if (
      !input ||
      input.startsWith("#") ||
      /^(data:|blob:|javascript:)/i.test(input)
    ) {
      return value;
    }

    try {
      const url = new URL(input, baseURL);

      if (!["http:", "https:"].includes(url.protocol)) {
        return value;
      }

      return `url("${proxyURL(url.href)}")`;
    } catch {
      return value;
    }
  }

  root.walkDecls(decl => {
    decl.value = decl.value.replace(
      /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
      (_, quote, value) => rewriteURL(`"${value}"`)
    );
  });

  root.walkAtRules("import", rule => {
    const match = rule.params.match(/^(['"])(.*?)\1/);

    if (match) {
      try {
        const url = new URL(match[2], baseURL);

        if (["http:", "https:"].includes(url.protocol)) {
          rule.params = `"${proxyURL(url.href)}"` +
            rule.params.slice(match[0].length);
        }
      } catch {}
    }
  });

  return root.toString();
}

module.exports = {
  rewriteCSS
};

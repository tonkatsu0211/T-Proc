const cheerio = require("cheerio");

function rewriteHTML(html, baseURL, proxyURL) {
  const $ = cheerio.load(html);
  const attributes = [
    ["a", "href"],
    ["img", "src"],
    ["script", "src"],
    ["link", "href"],
    ["iframe", "src"],
    ["source", "src"],
    ["video", "src"],
    ["audio", "src"],
    ["form", "action"]
  ];

  function rewriteURL(value) {
    if (
      !value ||
      value.startsWith("#") ||
      /^(data:|blob:|javascript:|mailto:|tel:)/i.test(value)
    ) {
      return value;
    }

    try {
      const url = new URL(value, baseURL);

      if (!["http:", "https:"].includes(url.protocol)) {
        return value;
      }

      return proxyURL(url.href);
    } catch {
      return value;
    }
  }

  for (const [selector, attribute] of attributes) {
    $(selector).each((_, element) => {
      const value = $(element).attr(attribute);

      if (value) {
        $(element).attr(attribute, rewriteURL(value));
      }
    });
  }

  $("img[srcset], source[srcset]").each((_, element) => {
    const value = $(element).attr("srcset");

    if (!value) return;

    const rewritten = value.split(",").map(item => {
      const parts = item.trim().split(/\s+/);

      if (parts[0]) {
        parts[0] = rewriteURL(parts[0]);
      }

      return parts.join(" ");
    }).join(", ");

    $(element).attr("srcset", rewritten);
  });

  return $.html();
}

module.exports = {
  rewriteHTML
};

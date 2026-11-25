const cheerio = require("cheerio");
const { rewriteCSS } = require("./css");

function rewriteHTML(html, baseURL, proxyURL) {
  const $ = cheerio.load(html);

  let effectiveBase = baseURL;
  const baseElement = $("base[href]").first();

  if (baseElement.length) {
    try {
      effectiveBase = new URL(
        baseElement.attr("href"),
        baseURL
      ).href;
    } catch {}
  }

  $("base").remove();

  function rewriteURL(value) {
    if (
      !value ||
      value.startsWith("#") ||
      /^(data:|blob:|javascript:|mailto:|tel:|about:)/i.test(value.trim())
    ) {
      return value;
    }

    try {
      const url = new URL(value.trim(), effectiveBase);

      if (!["http:", "https:"].includes(url.protocol)) {
        return value;
      }

      return proxyURL(url.href);
    } catch {
      return value;
    }
  }

  function rewriteSrcset(value) {
    const result = [];
    let index = 0;

    while (index < value.length) {
      while (index < value.length && /[\s,]/.test(value[index])) {
        index++;
      }

      if (index >= value.length) break;

      const start = index;

      while (index < value.length && !/\s/.test(value[index])) {
        index++;
      }

      let url = value.slice(start, index);
      let trailingCommas = "";

      while (url.endsWith(",")) {
        trailingCommas += ",";
        url = url.slice(0, -1);
      }

      let descriptor = "";

      if (!trailingCommas) {
        while (index < value.length && value[index] !== ",") {
          descriptor += value[index];
          index++;
        }

        if (value[index] === ",") index++;
      }

      if (url) {
        result.push(
          rewriteURL(url) + descriptor.trimEnd()
        );
      }
    }

    return result.join(", ");
  }

  const attributes = [
    ["a", "href"],
    ["area", "href"],
    ["img", "src"],
    ["img", "data-src"],
    ["script", "src"],
    ["link", "href"],
    ["iframe", "src"],
    ["source", "src"],
    ["video", "src"],
    ["audio", "src"],
    ["track", "src"],
    ["video", "poster"],
    ["object", "data"],
    ["embed", "src"],
    ["input", "src"],
    ["button", "formaction"],
    ["input", "formaction"],
    ["image", "href"],
    ["use", "href"],
    ["image", "xlink:href"],
    ["use", "xlink:href"],
    ["form", "action"]
  ];

  for (const [selector, attribute] of attributes) {
    $(selector).each((_, element) => {
      if (
        selector === "form" &&
        attribute === "action" &&
        ($(element).attr("method") || "get").toLowerCase() !== "get"
      ) {
        return;
      }
      const value = $(element).attr(attribute);

      if (value) {
        $(element).attr(attribute, rewriteURL(value));
      }
    });
  }

  $("[srcset]").each((_, element) => {
    const value = $(element).attr("srcset");

    if (value) {
      $(element).attr("srcset", rewriteSrcset(value));
    }
  });

  $("[style]").each((_, element) => {
    const value = $(element).attr("style");

    if (value) {
      try {
        $(element).attr(
          "style",
          rewriteCSS(value, effectiveBase, proxyURL)
        );
      } catch {}
    }
  });

  $("style").each((_, element) => {
    const value = $(element).html();

    if (value) {
      try {
        $(element).html(
          rewriteCSS(value, effectiveBase, proxyURL)
        );
      } catch {}
    }
  });

  return $.html();
}

module.exports = {
  rewriteHTML
};

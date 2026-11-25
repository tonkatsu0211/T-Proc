const { rewriteHTML } = require("./html");
const { rewriteCSS } = require("./css");
const config = require("../config");

async function readLimited(stream, limit) {
  const chunks = [];
  let size = 0;

  for await (const chunk of stream) {
    size += chunk.length;

    if (size > limit) {
      throw new Error("Response size limit exceeded");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function processResponse(response, baseURL, proxyURL) {
  const contentType = response.headers.get("content-type") || "";
  const mime = contentType.split(";")[0].trim().toLowerCase();

  if (!response.body) {
    return {
      body: null,
      contentType,
      transformed: false
    };
  }

  if (mime === "text/html" || mime === "application/xhtml+xml") {
    const buffer = await readLimited(
      response.body,
      config.maxTextSize
    );

    const html = new TextDecoder("utf-8").decode(buffer);

    return {
      body: Buffer.from(
        rewriteHTML(html, baseURL, proxyURL),
        "utf8"
      ),
      contentType: "text/html; charset=utf-8",
      transformed: true
    };
  }

  if (mime === "text/css") {
    const buffer = await readLimited(
      response.body,
      config.maxTextSize
    );

    const css = new TextDecoder("utf-8").decode(buffer);

    return {
      body: Buffer.from(
        rewriteCSS(css, baseURL, proxyURL),
        "utf8"
      ),
      contentType: "text/css; charset=utf-8",
      transformed: true
    };
  }

  return {
    body: response.body,
    contentType,
    transformed: false
  };
}

module.exports = {
  processResponse
};

const { rewriteHTML } = require("./html");
const { rewriteCSS } = require("./css");
const config = require("../config");

async function readLimited(stream, limit) {
  const chunks = [];
  let size = 0;

  try {
    for await (const chunk of stream) {
      size += chunk.length;

      if (size > limit) {
        throw new Error("Response size limit exceeded");
      }

      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks, size);
  } catch (error) {
    await stream.cancel?.().catch(() => {});
    throw error;
  }
}

function getCharset(contentType) {
  const match = contentType.match(
    /charset\s*=\s*["']?([^;"'\s]+)/i
  );

  return match ? match[1].toLowerCase() : "utf-8";
}

async function processResponse(response, baseURL, proxyURL) {
  const contentType =
    response.headers.get("content-type") || "";

  const mime = contentType
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!response.body) {
    return {
      body: null,
      contentType,
      transformed: false
    };
  }

  const isHTML = [
    "text/html",
    "application/xhtml+xml"
  ].includes(mime);

  const isCSS = mime === "text/css";

  if (!isHTML && !isCSS) {
    return {
      body: response.body,
      contentType,
      transformed: false
    };
  }

  const buffer = await readLimited(
    response.body,
    config.maxTextSize
  );

  const charset = getCharset(contentType);

  if (charset !== "utf-8" && charset !== "utf8") {
    return {
      body: buffer,
      contentType,
      transformed: false
    };
  }

  const text = new TextDecoder("utf-8", {
    fatal: false
  }).decode(buffer);

  if (isHTML) {
    return {
      body: Buffer.from(
        rewriteHTML(text, baseURL, proxyURL),
        "utf8"
      ),
      contentType: "text/html; charset=utf-8",
      transformed: true
    };
  }

  return {
    body: Buffer.from(
      rewriteCSS(text, baseURL, proxyURL),
      "utf8"
    ),
    contentType: "text/css; charset=utf-8",
    transformed: true
  };
}

module.exports = {
  processResponse
};

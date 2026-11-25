const express = require("express");
const crypto = require("node:crypto");
const { fetchTarget } = require("../lib/fetcher");
const config = require("../config");

const router = express.Router();

function authenticate(req, res, next) {
  const expected = process.env.PROXY_ACCESS_TOKEN;
  const received = req.headers["x-proxy-token"];

  if (!expected || !received) {
    return res.status(401).json({
      error: "Authentication required"
    });
  }

  const a = Buffer.from(expected);
  const b = Buffer.from(received);

  if (
    a.length !== b.length ||
    !crypto.timingSafeEqual(a, b)
  ) {
    return res.status(403).json({
      error: "Invalid token"
    });
  }

  next();
}

router.all("/", authenticate, async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const target = req.query.url;

  if (typeof target !== "string" || !target) {
    return res.status(400).json({
      error: "URL is required"
    });
  }

  let result;

  try {
    result = await fetchTarget(target, {
      method: req.method,
      headers: req.headers
    });

    const response = result.response;

    res.status(response.status);

    const allowedHeaders = [
      "content-type",
      "content-language",
      "cache-control",
      "expires",
      "last-modified",
      "etag"
    ];

    for (const name of allowedHeaders) {
      const value = response.headers.get(name);

      if (value) {
        res.setHeader(name, value);
      }
    }

    if (req.method === "HEAD" || !response.body) {
      return res.end();
    }

    let total = 0;

    for await (const chunk of response.body) {
      total += chunk.length;

      if (total > config.maxResponseSize) {
        res.destroy();
        return;
      }

      if (!res.write(chunk)) {
        await new Promise(resolve => res.once("drain", resolve));
      }
    }

    res.end();
  } catch (error) {
    console.error("Proxy error:", error.message);

    if (!res.headersSent && !res.destroyed) {
      res.status(502).json({
        error: "Upstream request failed"
      });
    } else if (!res.destroyed) {
      res.destroy();
    }
  } finally {
    if (result?.agent) {
      await result.agent.close().catch(() => {});
    }
  }
});

module.exports = router;

const express = require("express");
const { fetchTarget } = require("../lib/fetcher");
const { processResponse } = require("../lib/response");
const config = require("../config");
const { requireAuth } = require("../lib/auth");

const router = express.Router();

router.all("/", requireAuth, async (req, res) => {
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
    const clientController = new AbortController();
    
    const abortRequest = () => {
      clientController.abort();
    };
    
    res.on("close", abortRequest);
    
    result = await fetchTarget(target, {
      method: req.method,
      headers: req.headers,
      signal: clientController.signal
    });

    const response = result.response;

    res.status(response.status);

    const allowedHeaders = [
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

    const contentType = response.headers.get("content-type");

    if (contentType) {
      res.setHeader("content-type", contentType);
    }

    if (req.method === "HEAD" || !response.body) {
      return res.end();
    }

    const proxyURL = value =>
      `/p?url=${encodeURIComponent(value)}`;

    const processed = await processResponse(
      response,
      result.finalUrl.href,
      proxyURL
    );

    if (processed.transformed) {
      res.removeHeader("etag");
      res.removeHeader("last-modified");
      res.removeHeader("expires");
    }

    if (processed.contentType) {
      res.setHeader("content-type", processed.contentType);
    }

    if (!processed.body) {
      return res.end();
    }

    if (Buffer.isBuffer(processed.body)) {
      if (processed.body.length > config.maxResponseSize) {
        return res.status(413).end("Response too large");
      }

      return res.end(processed.body);
    }

    let total = 0;

    for await (const chunk of processed.body) {
      if (res.destroyed) {
        return;
      }

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

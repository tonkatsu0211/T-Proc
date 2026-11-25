const { Agent, fetch } = require("undici");
const { validateTarget } = require("./security");
const config = require("../config");

function createPinnedAgent(hostname, addresses) {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("No verified IP available");
  }

  const normalizedHostname = hostname.toLowerCase();

  return new Agent({
    connect: {
      lookup(name, options, callback) {
        if (name.toLowerCase() !== normalizedHostname) {
          return callback(new Error("Unexpected hostname"));
        }

        const records = addresses.filter(item =>
          (!options.family || item.family === options.family) &&
          item.address
        );

        if (!records.length) {
          return callback(new Error("No verified IP available"));
        }

        if (options.all) {
          return callback(null, records);
        }

        callback(
          null,
          records[0].address,
          records[0].family
        );
      }
    }
  });
}

async function fetchTarget(input, options = {}) {
  let target;

  try {
    target = new URL(input);
  } catch {
    throw new Error("Invalid URL");
  }

  const method = options.method || "GET";

  if (!["GET", "HEAD"].includes(method)) {
    throw new Error("Method not allowed");
  }

  const headers = {};

  for (const name of [
    "accept",
    "accept-language",
    "user-agent"
  ]) {
    const value = options.headers?.[name];

    if (typeof value === "string") {
      headers[name] = value;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Request timeout")),
    config.requestTimeout
  );

  const abortFromClient = () => {
    controller.abort(new Error("Client disconnected"));
  };

  options.signal?.addEventListener(
    "abort",
    abortFromClient,
    { once: true }
  );

  let activeAgent = null;

  try {
    for (let i = 0; i <= config.maxRedirects; i++) {
      if (controller.signal.aborted) {
        throw controller.signal.reason;
      }

      const verified = await validateTarget(target.href);
      const hostname = verified.url.hostname.replace(/^\[|\]$/g, "");

      activeAgent = createPinnedAgent(
        hostname,
        verified.addresses
      );

      let response;

      try {
        response = await fetch(verified.url, {
          method,
          headers,
          dispatcher: activeAgent,
          redirect: "manual",
          signal: controller.signal
        });
      } catch (error) {
        await activeAgent.close().catch(() => {});
        activeAgent = null;
        throw error;
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");

        if (location) {
          await response.body?.cancel();

          if (i === config.maxRedirects) {
            throw new Error("Too many redirects");
          }

          target = new URL(location, verified.url);

          await activeAgent.close();
          activeAgent = null;

          continue;
        }
      }

      return {
        response,
        agent: activeAgent,
        finalUrl: verified.url,
        abort: () => controller.abort()
      };
    }

    throw new Error("Too many redirects");
  } catch (error) {
    if (activeAgent) {
      await activeAgent.close().catch(() => {});
    }

    throw error;
  } finally {
    clearTimeout(timeout);

    options.signal?.removeEventListener(
      "abort",
      abortFromClient
    );
  }
}

module.exports = {
  fetchTarget
};

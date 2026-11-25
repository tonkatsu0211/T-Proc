const { Agent, fetch } = require("undici");
const { validateTarget } = require("./security");
const config = require("../config");

function createPinnedAgent(hostname, addresses) {
  return new Agent({
    connect: {
      lookup(name, options, callback) {
        if (name.toLowerCase() !== hostname.toLowerCase()) {
          return callback(new Error("Unexpected hostname"));
        }

        const records = addresses.filter(item =>
          !options.family || item.family === options.family
        );

        if (!records.length) {
          return callback(new Error("No verified IP available"));
        }

        if (options.all) {
          return callback(null, records);
        }

        callback(null, records[0].address, records[0].family);
      }
    }
  });
}

async function fetchTarget(input, options = {}) {
  let target = new URL(input);
  const method = options.method || "GET";
  const headers = {};

  if (!["GET", "HEAD"].includes(method)) {
    throw new Error("Method not allowed");
  }

  for (const name of ["accept", "accept-language", "user-agent"]) {
    const value = options.headers?.[name];

    if (typeof value === "string") {
      headers[name] = value;
    }
  }

  for (let i = 0; i <= config.maxRedirects; i++) {
    const verified = await validateTarget(target.href);
    const hostname = verified.url.hostname.replace(/^\[|\]$/g, "");
    const agent = createPinnedAgent(hostname, verified.addresses);

    try {
      const response = await fetch(verified.url, {
        method,
        headers,
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(config.requestTimeout)
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");

        if (location) {
          await response.body?.cancel();

          if (i === config.maxRedirects) {
            throw new Error("Too many redirects");
          }

          target = new URL(location, verified.url);
          await agent.close();
          continue;
        }
      }

      return {
        response,
        agent,
        finalUrl: verified.url
      };
    } catch (error) {
      await agent.close().catch(() => {});
      throw error;
    }
  }

  throw new Error("Too many redirects");
}

module.exports = {
  fetchTarget
};

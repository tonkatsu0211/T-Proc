const { Agent, fetch } = require("undici");
const { validateTarget } = require("./security");
const config = require("../config");

function createPinnedAgent(hostname, addresses) {
  const agent = new Agent({
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

  return agent;
}

async function fetchTarget(input, options = {}) {
  let target = new URL(input);
  const method = options.method || "GET";
  const headers = {};

  if (!["GET", "HEAD"].includes(method)) {
    throw new Error("Method not allowed");
  }

  for (const name of ["accept", "accept-language", "user-agent"]) {
    if (options.headers?.[name]) {
      headers[name] = options.headers[name];
    }
  }

  for (let i = 0; i <= config.maxRedirects; i++) {
    const verified = await validateTarget(target.href);
    const agent = createPinnedAgent(
      verified.url.hostname.replace(/^\[|\]$/g, ""),
      verified.addresses
    );

    let response;

    try {
      response = await fetch(verified.url, {
        method,
        headers,
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(config.requestTimeout)
      });
    } catch (error) {
      await agent.close();
      throw error;
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");

      if (!location) {
        return { response, agent };
      }

      await response.body?.cancel();
      await agent.close();

      if (i === config.maxRedirects) {
        throw new Error("Too many redirects");
      }

      target = new URL(location, verified.url);
      continue;
    }

    return {
      response,
      agent,
      finalUrl: verified.url
    };
  }

  throw new Error("Too many redirects");
}

module.exports = {
  fetchTarget
};

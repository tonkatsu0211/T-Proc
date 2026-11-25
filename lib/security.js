const dns = require("node:dns/promises");
const ipaddr = require("ipaddr.js");

function isPublicIP(address) {
  try {
    return ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}

async function validateTarget(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported protocol");
  }

  if (url.username || url.password) {
    throw new Error("URL credentials are not allowed");
  }

  const expectedPort = url.protocol === "https:" ? "443" : "80";

  if (url.port && url.port !== expectedPort) {
    throw new Error("Port not allowed");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Hostname not allowed");
  }

  let addresses;

  if (ipaddr.isValid(hostname)) {
    addresses = [{
      address: hostname,
      family: ipaddr.parse(hostname).kind() === "ipv4" ? 4 : 6
    }];
  } else {
    addresses = await dns.lookup(hostname, {
      all: true,
      verbatim: true
    });
  }

  if (
    !addresses.length ||
    addresses.some(item => !isPublicIP(item.address))
  ) {
    throw new Error("Destination IP is not allowed");
  }

  return {
    url,
    addresses
  };
}

module.exports = {
  validateTarget,
  isPublicIP
};

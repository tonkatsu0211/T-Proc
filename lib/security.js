onst dns = require("node:dns/promises");
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

  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Port not allowed");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (!hostname || hostname.endsWith(".") && hostname.length === 1) {
    throw new Error("Invalid hostname");
  }

  let addresses;

  if (ipaddr.isValid(hostname)) {
    addresses = [{ address: hostname }];
  } else {
    if (!hostname.includes(".")) {
      throw new Error("Invalid hostname");
    }

    addresses = await dns.lookup(hostname, {
      all: true,
      verbatim: true
    });
  }

  if (!addresses.length || addresses.some(item => !isPublicIP(item.address))) {
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

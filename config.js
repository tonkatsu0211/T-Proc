module.exports = {
  port: process.env.PORT || 3000,
  proxyPrefix: "/p/",
  maxRedirects: 5,
  requestTimeout: 30000,
  maxResponseSize: 50 * 1024 * 1024,
  allowedProtocols: ["http:", "https:"],
  allowedPorts: ["80", "443"],
  requireAuthentication: true
};

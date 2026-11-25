function requireAuth(req, res, next) {
  if (!req.session?.authenticated) {
    return res.status(401).json({
      error: "Authentication required",
      login: "/auth/login"
    });
  }

  next();
}

module.exports = {
  requireAuth
};

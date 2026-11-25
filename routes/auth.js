const express = require("express");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const first = Buffer.from(a);
  const second = Buffer.from(b);

  return first.length === second.length &&
    crypto.timingSafeEqual(first, second);
}

router.get("/login", (req, res) => {
  if (req.session.authenticated) {
    return res.redirect("/");
  }

  const csrfToken = crypto.randomBytes(32).toString("hex");

  req.session.csrfToken = csrfToken;

  res.render("login", {
    csrfToken,
    error: null
  });
});

router.post("/login", loginLimiter, async (req, res, next) => {
  const validCSRF = safeCompare(
    req.session.csrfToken,
    req.body.csrfToken
  );

  if (!validCSRF) {
    return res.status(403).render("login", {
      csrfToken: "",
      error: "Invalid request"
    });
  }

  const validUser = safeCompare(
    process.env.PROXY_USERNAME,
    req.body.username
  );

  const validPassword = safeCompare(
    process.env.PROXY_PASSWORD,
    req.body.password
  );

  if (!validUser || !validPassword) {
    return res.status(401).render("login", {
      csrfToken: crypto.randomBytes(32).toString("hex"),
      error: "ログインに失敗しました"
    });
  }

  req.session.regenerate(error => {
    if (error) return next(error);

    req.session.authenticated = true;

    req.session.save(error => {
      if (error) return next(error);

      res.redirect("/");
    });
  });
});

router.post("/logout", (req, res, next) => {
  const validCSRF = safeCompare(
    req.session.csrfToken,
    req.body.csrfToken
  );

  if (!validCSRF) {
    return res.sendStatus(403);
  }

  req.session.destroy(error => {
    if (error) return next(error);

    res.clearCookie("proxy.sid", {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    res.redirect("/login");
  });
});

module.exports = router;

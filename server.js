const express = require("express");
const http = require("node:http");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const config = require("./config");
const pool = require("./lib/database");
const authRouter = require("./routes/auth");
const proxyRouter = require("./routes/proxy");
const { requireAuth } = require("./lib/auth");

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required");
}

const app = express();
const server = http.createServer(app);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", "./views");

app.use(express.urlencoded({
  extended: false,
  limit: "10kb"
}));

app.use(express.static("public"));

app.use(session({
  name: "proxy.sid",
  store: new PgSession({
    pool,
    tableName: "proxy_sessions",
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/"
  }
}));

app.use("/auth", authRouter);

app.get("/", requireAuth, (req, res) => {
  res.render("index");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    name: "Tonkatsu Proxy",
    version: "1.0.0"
  });
});

app.use("/p", proxyRouter);

app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).send("Internal Server Error");
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Tonkatsu Proxy listening on ${config.port}`);
});

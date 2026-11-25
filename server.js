const express = require("express");
const http = require("node:http");
const config = require("./config");

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

const proxyRouter = require("./routes/proxy");

app.use("/p", proxyRouter);

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    name: "Tonkatsu Proxy",
    version: "1.0.0"
  });
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Tonkatsu Proxy listening on ${config.port}`);
});

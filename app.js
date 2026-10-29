const express = require("express");
const helmet = require("helmet");
const app = express();
const cookieParser = require("cookie-parser");
const sanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const compression = require("compression");
const cors = require("cors");
const path = require("path");

const globalErrorHandler = require("./Controllers/errorController");
const apiRoutes = require("./Routes/apiRoutes");

const stadiumRoutes = require("./Routes/stadiumRoutes");
const teamRoutes = require("./Routes/teamRoutes");
const compRoutes = require("./Routes/competitionRoutes");
const matchRoutes = require("./Routes/matchRoutes");
const ticketRoutes = require("./Routes/ticketRoutes");
const authRoutes = require("./Routes/authRoutes");

const { AppError } = require("./utilities/errorHandler");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);
app.use(express.json({ limit: "15kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sanitize());
app.use(cors());
app.options("*", cors());
app.use(xss());
app.use(hpp());
app.use(compression());
app.use(express.static(path.join(__dirname, "Static")));
app.use(express.static(path.join(__dirname, "client", "dist")));
app.use("/api", apiRoutes);

app.use("/api", (req, res, next) => next(new AppError("API endpoint not found", 404)));
app.use("/auth", authRoutes);
app.use("/stadium", stadiumRoutes);
app.use("/teams", teamRoutes);
app.get("/match/:id", (req, res) => {
  res.redirect(302, `/matches/${encodeURIComponent(req.params.id)}`);
});
app.use("/match", matchRoutes);
app.use("/competitions", compRoutes);
app.use("/tickets", ticketRoutes);
app.get("*", (req, res, next) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"), (err) => {
    if (err) next(new AppError("Frontend build not found. Run npm run build.", 503));
  });
});
app.all("*", (req, res, next) => next(new AppError("Route not found", 404)));

app.use(globalErrorHandler);
module.exports = app;

if (require.main === module) {
  require("./server");
}

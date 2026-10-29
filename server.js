const mongoose = require("mongoose");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

if (process.env.NODE_ENV !== "production" && process.env.ENV !== "production") {
  const defaultEnvPath = fs.existsSync(path.join(__dirname, ".env"))
    ? path.join(__dirname, ".env")
    : path.join(__dirname, "config.env");
  dotenv.config({ path: process.env.ENV_FILE || defaultEnvPath });
}

const app = require("./app");

const startApp = async () => {
  const connectionString = process.env.DATABASE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error(
      "DATABASE_CONNECTION_STRING is required. Add it to .env or your deployment environment."
    );
  }
  console.log("Connecting to MongoDB...");
  await mongoose.connect(connectionString);
  console.log("MongoDB connected.");
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Ticketify is listening on port ${port}`);
  });
};

startApp().catch((error) => {
  const uri = process.env.DATABASE_CONNECTION_STRING || "";
  let details = String(error.message || "No additional error details.");
  if (uri) details = details.replaceAll(uri, "[MongoDB URI redacted]");
  details = details
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[MongoDB URI redacted]")
    .replace(/\b(password|passwd|pwd)\s*[:=]\s*[^,\s;&]+/gi, "$1=[redacted]");
  const errorName = error.name || "unknown error";
  console.error(`Ticketify failed to start (${errorName}): ${details}`);
  if (errorName === "MongooseServerSelectionError") {
    console.error(
      "Check the Atlas driver URI, database username/password, and Atlas Network Access IP access list."
    );
  }
  process.exitCode = 1;
});

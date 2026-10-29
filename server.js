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
  if (error.name === "MongooseServerSelectionError") {
    console.error(
      "MongoDB is unreachable. Start the MongoDB service or check that DATABASE_CONNECTION_STRING points to a reachable database."
    );
  } else {
    console.error(`Ticketify failed to start (${error.name || "unknown error"}).`);
  }
  process.exitCode = 1;
});

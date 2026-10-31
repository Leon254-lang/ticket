const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

if (process.env.NODE_ENV !== "production" && process.env.ENV !== "production") {
  dotenv.config({ path: process.env.ENV_FILE || path.join(__dirname, ".env") });
}

const app = require("./app");
const { getDatabaseConnectionString } = require("./utilities/database");

const startApp = async () => {
  const connectionString = getDatabaseConnectionString();
  console.log("Connecting to MongoDB...");
  await mongoose.connect(connectionString);
  console.log("MongoDB connected.");
  const { expirePendingBookings } = require("./Controllers/apiController");
  const expireBookings = () => {
    expirePendingBookings().catch((error) => {
      console.error(`Could not expire pending bookings: ${error.message}`);
    });
  };
  expireBookings();
  const bookingExpiryTimer = setInterval(expireBookings, 30 * 1000);
  bookingExpiryTimer.unref();
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

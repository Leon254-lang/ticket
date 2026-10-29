const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

if (process.env.NODE_ENV !== "production" && process.env.ENV !== "production") {
  const defaultEnvPath = fs.existsSync(path.join(__dirname, "..", ".env"))
    ? path.join(__dirname, "..", ".env")
    : path.join(__dirname, "..", "config.env");
  dotenv.config({ path: process.env.ENV_FILE || defaultEnvPath });
}

const userModel = require("../Models/userModel");

const seedAdmin = async () => {
  const connectionString = process.env.DATABASE_CONNECTION_STRING;
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!connectionString) {
    throw new Error("DATABASE_CONNECTION_STRING is required.");
  }
  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD for this command.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error("ADMIN_PASSWORD must be between 8 and 128 characters.");
  }

  await mongoose.connect(connectionString);
  let user = await userModel.findOne({ email }).select("+password");
  const isNewUser = !user;

  if (!user) {
    user = new userModel({
      firstname: "Admin",
      lastname: "Administrator",
      email,
      joindate: new Date(),
    });
  }

  user.role = "admin";
  user.verifiedEmail = true;
  user.password = await user.hashPassword(password);
  user.passwordChangedAt = new Date();
  await user.save();

  console.log(
    `Admin account ${isNewUser ? "created" : "updated"} for ${email}.`
  );
};

seedAdmin()
  .catch((error) => {
    console.error(error.message || "Admin seeding failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

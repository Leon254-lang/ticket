const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const stripe = require("stripe")(
  process.env.STRIPE_SECRET_KEY
);

const ticketController = require("./../Controllers/ticketController");
const authController = require("./../Controllers/authController");
router.use(authController.protect);
router.post("/", ticketController.purchaseTicket);

module.exports = router;

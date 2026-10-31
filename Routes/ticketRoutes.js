const express = require("express");
const router = express.Router();
const authController = require("./../Controllers/authController");
const apiController = require("./../Controllers/apiController");
router.use(authController.protect);
router.post("/", apiController.rejectLegacyTicketPurchase);

module.exports = router;

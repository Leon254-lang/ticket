const express = require("express");
const api = require("../Controllers/apiController");
const confirmEmail = require("../API/confirmEmail");

const router = express.Router();
const admin = [api.protect, api.requireAdmin];

router.post("/auth/signup", api.signup);
router.post("/auth/login", api.login);
router.post("/auth/logout", api.protect, api.logout);
router.post("/auth/forgot-password", api.forgotPassword);
router.post("/auth/reset-password/:token", api.resetPassword);
router.get("/auth/me", api.protect, api.getCurrentUser);
router.post("/auth/email/send-code", api.protect, confirmEmail.sendConfirmationCode);
router.post("/auth/email/verify", api.protect, confirmEmail.verifyEmail);
router.patch("/auth/email", api.protect, api.updateEmail);
router.patch("/auth/password", api.protect, api.changePassword);

router.get("/matches", api.getMatches);
router.get("/matches/:id", api.getMatch);
router.get("/teams", api.getTeams);
router.get("/stadiums", api.getStadiums);
router.get("/competitions", api.getCompetitions);

router.get("/users/me", api.protect, api.getCurrentUser);
router.patch("/users/me", api.protect, api.updateProfile);
router.get("/users/me/tickets", api.protect, api.getMyTickets);
router.get("/dashboard/me", api.protect, api.getUserDashboard);
router.post("/tickets", api.protect, api.purchaseTicket);

router.get("/admin/dashboard", ...admin, api.getAdminDashboard);
router.get("/admin/users", ...admin, api.getUsers);
router.get("/admin/tickets", ...admin, api.getTickets);
router.get("/admin/matches", ...admin, (req, res, next) => {
  req.query.admin = true;
  api.getMatches(req, res, next);
});
router.get("/admin/matches/:id", ...admin, (req, res, next) => {
  req.query.admin = true;
  api.getMatch(req, res, next);
});

router.post("/:resource(teams|stadiums|competitions|matches)", ...admin, api.createResource);
router.patch("/:resource(teams|stadiums|competitions|matches)/:id", ...admin, api.updateResource);
router.delete("/:resource(teams|stadiums|competitions|matches)/:id", ...admin, api.deleteResource);

module.exports = router;

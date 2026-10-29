const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const userModel = require("../Models/userModel");
const matchModel = require("../Models/matchModel");
const teamModel = require("../Models/teamModel");
const stadiumModel = require("../Models/stadiumModel");
const competitionModel = require("../Models/competitionModel");
const ticketModel = require("../Models/ticketModel");
const EmailSender = require("../utilities/email");
const { catchAsync, AppError } = require("../utilities/errorHandler");

const publicUser = (user) => {
  const data = user.toObject ? user.toObject() : { ...user };
  [
    "password",
    "confirmPassword",
    "passwordChangedAt",
    "passwordResetToken",
    "passwordResetExpires",
    "emailConfirmationCode",
    "emailConfiramtionCodeExpiryDate",
  ].forEach((key) => delete data[key]);
  return data;
};

const makeSlug = (value) =>
  `${value}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const setAuthCookie = (res, token, req) => {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
  res.cookie("jwt", token, cookieOptions);
};

const createToken = (user, res, req) => {
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET_CODE,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
  setAuthCookie(res, token, req);
  return token;
};

const parsePagination = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const respondWithPage = (res, items, total, page, limit) => {
  res.json({
    data: items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

const findEntity = async (Model, id, label) => {
  if (!id || !/^[0-9a-fA-F]{24}$/.test(String(id))) {
    throw new AppError(`Invalid ${label} id`, 400);
  }
  const entity = await Model.findById(id);
  if (!entity) throw new AppError(`${label} not found`, 404);
  return entity;
};

exports.protect = catchAsync(async (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) throw new AppError("Please sign in to continue", 401);
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET_CODE);
  const user = await userModel.findById(decoded.id).select("-password");
  if (!user) throw new AppError("Please sign in to continue", 401);
  if (
    user.passwordChangedAt &&
    user.changedPasswordAfter &&
    user.changedPasswordAfter(decoded.iat)
  ) {
    throw new AppError("Your password changed. Please sign in again", 401);
  }
  req.user = user;
  next();
});

exports.requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return next(new AppError("Administrator access is required", 403));
  }
  next();
};

exports.getCurrentUser = (req, res) => {
  res.json({ data: publicUser(req.user) });
};

exports.signup = catchAsync(async (req, res) => {
  const { firstname, lastname, email, password, confirmPassword } = req.body;
  if (!firstname || !lastname || !email || !password) {
    throw new AppError("First name, last name, email, and password are required", 400);
  }
  if (password !== confirmPassword) {
    throw new AppError("Passwords do not match", 400);
  }
  if (await userModel.findOne({ email: email.toLowerCase() })) {
    throw new AppError("An account already exists for this email", 409);
  }
  const user = new userModel({
    firstname,
    lastname,
    email: email.toLowerCase(),
    password: await userModel.prototype.hashPassword(password),
    passwordChangedAt: new Date(),
    joindate: new Date(),
    role: "user",
  });
  await user.save();
  createToken(user, res, req);
  res.status(201).json({ data: publicUser(user) });
});

exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError("Email and password are required", 400);
  const user = await userModel.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user || !(await user.comparePassowrd(password, user.password))) {
    throw new AppError("Email or password is incorrect", 401);
  }
  createToken(user, res, req);
  res.json({ data: publicUser(user) });
});

exports.logout = (req, res) => {
  res.clearCookie("jwt", {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
  });
  res.status(204).end();
};

exports.forgotPassword = catchAsync(async (req, res) => {
  const emailAddress = String(req.body.email || "").toLowerCase();
  if (!emailAddress) throw new AppError("Email is required", 400);
  const user = await userModel.findOne({ email: emailAddress });
  if (!user) throw new AppError("No account was found for this email", 404);
  const resetToken = await user.creatPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  const resetURL = `${req.protocol}://${req.get("host")}/user/resetpassword/${resetToken}`;
  await new EmailSender().sendResetToken(resetURL);
  res.status(202).json({ message: "Password reset instructions have been sent" });
});

exports.resetPassword = catchAsync(async (req, res) => {
  const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");
  const user = await userModel.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });
  if (!user) throw new AppError("This password reset link is invalid or expired", 400);
  if (!req.body.password || req.body.password !== req.body.confirmPassword) {
    throw new AppError("Enter matching new passwords", 400);
  }
  user.password = await user.hashPassword(req.body.password);
  user.passwordChangedAt = new Date();
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  res.json({ message: "Password updated. You can now sign in." });
});

exports.updateProfile = catchAsync(async (req, res) => {
  const allowed = [
    "firstname",
    "lastname",
    "idNumber",
    "passportNumber",
    "gender",
    "birthdate",
    "country",
    "province",
    "city",
  ];
  const updates = {};
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      updates[key] = req.body[key] === "" ? undefined : req.body[key];
    }
  });
  const user = await userModel.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  }).select("-password");
  res.json({ data: publicUser(user) });
});

exports.changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const user = await userModel.findById(req.user._id).select("+password");
  if (!currentPassword || !(await user.comparePassowrd(currentPassword, user.password))) {
    throw new AppError("Current password is incorrect", 401);
  }
  if (!newPassword || newPassword !== confirmPassword) {
    throw new AppError("Enter matching new passwords", 400);
  }
  user.password = await user.hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  createToken(user, res, req);
  res.json({ message: "Password updated successfully" });
});

exports.updateEmail = catchAsync(async (req, res) => {
  const email = String(req.body.email || "").toLowerCase();
  if (!email) throw new AppError("Email is required", 400);
  if (email === req.user.email) throw new AppError("This is already your email", 400);
  const user = await userModel.findById(req.user._id);
  user.email = email;
  user.verifiedEmail = false;
  user.emailConfirmationCode = undefined;
  await user.save();
  res.json({ data: publicUser(user) });
});

exports.getMatches = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.sport && req.query.sport !== "all") {
    filter.sport = String(req.query.sport).toLowerCase();
  }
  if (!(req.user && req.user.role === "admin" && req.query.admin === true)) {
    filter.matchDate = { $gt: new Date() };
    filter.visibleDate = { $lt: new Date() };
    filter.endBuyDate = { $gt: new Date() };
    filter.isDisabled = false;
  }
  if (req.query.search) {
    const search = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (search) {
      filter.$or = [
        { "homeTeam.name": { $regex: search, $options: "i" } },
        { "awayTeam.name": { $regex: search, $options: "i" } },
        { fixture: { $regex: search, $options: "i" } },
      ];
    }
  }
  const [matches, total] = await Promise.all([
    matchModel.find(filter).sort({ matchDate: 1 }).skip(skip).limit(limit)
      .populate("stadium", "name country city stands capacity image")
      .populate("competition", "name logo"),
    matchModel.countDocuments(filter),
  ]);
  respondWithPage(res, matches, total, page, limit);
});

exports.getMatch = catchAsync(async (req, res) => {
  const match = await matchModel.findOne({
    $or: [{ slug: req.params.id }, ...( /^[0-9a-fA-F]{24}$/.test(req.params.id) ? [{ _id: req.params.id }] : [])],
  })
    .populate("stadium", "name country city province address stands capacity image")
    .populate("competition", "name logo");
  if (!match) throw new AppError("Match not found", 404);
  if (
    !(req.user && req.user.role === "admin" && req.query.admin === true) &&
    (
      match.visibleDate > new Date() ||
      match.endBuyDate < new Date() ||
      match.matchDate < new Date() ||
      match.isDisabled
    )
  ) {
    throw new AppError("This match is not available", 404);
  }
  res.json({ data: match });
});

exports.getTeams = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.sport && req.query.sport !== "all") filter.sport = req.query.sport;
  const [items, total] = await Promise.all([
    teamModel.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    teamModel.countDocuments(filter),
  ]);
  respondWithPage(res, items, total, page, limit);
});

exports.getStadiums = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    stadiumModel.find().sort({ name: 1 }).skip(skip).limit(limit),
    stadiumModel.countDocuments(),
  ]);
  respondWithPage(res, items, total, page, limit);
});

exports.getCompetitions = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    competitionModel.find().sort({ name: 1 }).skip(skip).limit(limit),
    competitionModel.countDocuments(),
  ]);
  respondWithPage(res, items, total, page, limit);
});

exports.getUsers = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    userModel.find().select("-password -passwordChangedAt -passwordResetToken -passwordResetExpires")
      .sort({ joindate: -1 }).skip(skip).limit(limit),
    userModel.countDocuments(),
  ]);
  respondWithPage(res, items.map(publicUser), total, page, limit);
});

exports.getTickets = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    ticketModel.find().sort({ purchaseDate: -1 }).skip(skip).limit(limit)
      .populate("user", "firstname lastname email")
      .populate({ path: "match", select: "homeTeam awayTeam fixture matchDate", populate: { path: "stadium", select: "name city country" } }),
    ticketModel.countDocuments(),
  ]);
  respondWithPage(res, items, total, page, limit);
});

exports.getAdminDashboard = catchAsync(async (req, res) => {
  const [users, matches, tickets, competitions, stadiums, teams] = await Promise.all([
    userModel.countDocuments(),
    matchModel.countDocuments(),
    ticketModel.countDocuments(),
    competitionModel.countDocuments(),
    stadiumModel.countDocuments(),
    teamModel.countDocuments(),
  ]);
  res.json({ data: { users, matches, tickets, competitions, stadiums, teams } });
});

exports.getUserDashboard = catchAsync(async (req, res) => {
  const tickets = await ticketModel.find({ user: req.user._id })
    .sort({ purchaseDate: -1 }).populate({
      path: "match",
      select: "homeTeam awayTeam fixture matchDate sport cover",
      populate: { path: "stadium", select: "name city country" },
    });
  const usableTickets = tickets.filter((ticket) => ticket.match);
  const spent = usableTickets.reduce((sum, ticket) => sum + ticket.price, 0);
  res.json({
    data: {
      user: publicUser(req.user),
      tickets: usableTickets,
      ticketCount: usableTickets.length,
      spent,
      nextMatch: usableTickets.find((ticket) => new Date(ticket.match.matchDate) > new Date()) || null,
    },
  });
});

exports.getMyTickets = catchAsync(async (req, res) => {
  const tickets = await ticketModel.find({ user: req.user._id })
    .sort({ purchaseDate: -1 }).populate({
      path: "match",
      select: "homeTeam awayTeam fixture matchDate sport cover",
      populate: { path: "stadium", select: "name city country" },
    });
  res.json({ data: tickets.filter((ticket) => ticket.match) });
});

exports.purchaseTicket = catchAsync(async (req, res) => {
  const { matchId, standId } = req.body;
  if (!matchId || !standId) throw new AppError("Choose a match and stand", 400);
  if (!req.user.verifiedEmail) throw new AppError("Verify your email before booking", 403);
  if (!req.user.idNumber && !req.user.passportNumber) {
    throw new AppError("Add an ID or passport number before booking", 403);
  }
  const match = await matchModel.findById(matchId);
  if (!match || match.isDisabled) throw new AppError("This match is not available", 404);
  const now = new Date();
  if (
    now < match.visibleDate ||
    now < match.startBuyDate ||
    now > match.endBuyDate ||
    now > match.matchDate
  ) {
    throw new AppError("Ticket sales are not open for this match", 400);
  }
  if (await ticketModel.findOne({ match: matchId, user: req.user._id })) {
    throw new AppError("You already have a ticket for this match", 409);
  }
  const stadium = await stadiumModel.findById(match.stadium);
  const stand = stadium && stadium.stands.find((item) => item.id === standId && item.availablity);
  if (!stand) throw new AppError("That stand is unavailable", 400);
  const sold = match.tickets.filter((item) => item.stand === standId).length;
  if (sold >= stand.capacity) throw new AppError("That stand is sold out", 409);
  const ticket = await ticketModel.create({
    user: req.user._id,
    match: match._id,
    stand: stand.id,
    purchaseDate: now,
    price: stand.price,
  });
  match.tickets.push({
    ticketID: ticket._id,
    stand: stand.id,
    userID: req.user.idNumber,
    userPassportNO: req.user.passportNumber,
    userMail: req.user.email,
  });
  await match.save();
  req.user.tickets.push({
    id: ticket._id,
    price: ticket.price,
    match: match._id,
    matchDate: match.matchDate,
  });
  await req.user.save();
  res.status(201).json({ data: ticket });
});

const resourceModels = {
  teams: teamModel,
  stadiums: stadiumModel,
  competitions: competitionModel,
  matches: matchModel,
};

exports.createResource = catchAsync(async (req, res) => {
  const { resource } = req.params;
  if (resource === "matches") {
    const { homeTeam, awayTeam, stadium, competition, fixture } = req.body;
    if (homeTeam === awayTeam) throw new AppError("A team cannot play itself", 400);
    const [home, away, venue, league] = await Promise.all([
      findEntity(teamModel, homeTeam, "Home team"),
      findEntity(teamModel, awayTeam, "Away team"),
      findEntity(stadiumModel, stadium, "Stadium"),
      findEntity(competitionModel, competition, "Competition"),
    ]);
    if (home.sport !== away.sport || home.sport !== venue.sport) {
      throw new AppError("The teams and stadium must use the same sport", 400);
    }
    const matchDate = new Date(req.body.matchDate);
    const match = await matchModel.create({
      ...req.body,
      homeTeam: { id: home._id, name: home.name, logo: home.logo },
      awayTeam: { id: away._id, name: away.name, logo: away.logo },
      fixture: `${league.name} - ${fixture}`,
      matchDate,
      sport: venue.sport,
      slug: makeSlug(`${home.name}-${away.name}-${matchDate.toDateString()}`),
      tickets: [],
    });
    return res.status(201).json({ data: match });
  }
  const Model = resourceModels[resource];
  if (!Model) throw new AppError("Unknown resource", 404);
  const item = await Model.create(req.body);
  res.status(201).json({ data: item });
});

exports.updateResource = catchAsync(async (req, res) => {
  const { resource, id } = req.params;
  const Model = resourceModels[resource];
  if (!Model) throw new AppError("Unknown resource", 404);
  if (resource === "matches") {
    const match = await findEntity(matchModel, id, "Match");
    const updates = { ...req.body };
    const [home, away] = await Promise.all([
      findEntity(teamModel, updates.homeTeam || match.homeTeam.id, "Home team"),
      findEntity(teamModel, updates.awayTeam || match.awayTeam.id, "Away team"),
    ]);
    const stadiumId = updates.stadium || match.stadium;
    if (updates.stadium && String(updates.stadium) !== String(match.stadium)) {
      if (match.startBuyDate <= new Date()) {
        throw new AppError("The stadium cannot be changed after ticket sales begin", 400);
      }
    }
    const stadium = await findEntity(stadiumModel, stadiumId, "Stadium");
    if (home.sport !== away.sport || home.sport !== stadium.sport) {
      throw new AppError("The teams and stadium must use the same sport", 400);
    }
    match.homeTeam = { id: home._id, name: home.name, logo: home.logo };
    match.awayTeam = { id: away._id, name: away.name, logo: away.logo };
    match.stadium = stadium._id;
    match.sport = stadium.sport;
    const previousCompetition = await competitionModel.findById(match.competition);
    let competitionName = "";
    if (updates.competition) {
      const competition = await findEntity(competitionModel, updates.competition, "Competition");
      match.competition = competition._id;
      competitionName = competition.name;
    } else {
      competitionName = previousCompetition?.name || "";
    }
    ["matchDate", "visibleDate", "startBuyDate", "endBuyDate", "cover", "isDisabled"].forEach((key) => {
      if (updates[key] !== undefined) match[key] = updates[key];
    });
    if (updates.fixture !== undefined || updates.competition !== undefined) {
      const oldPrefix = previousCompetition ? `${previousCompetition.name} - ` : "";
      const oldFixtureDetail = oldPrefix && match.fixture.startsWith(oldPrefix)
        ? match.fixture.slice(oldPrefix.length)
        : match.fixture;
      const fixtureDetail = updates.fixture === undefined ? oldFixtureDetail : updates.fixture;
      match.fixture = `${competitionName} - ${fixtureDetail}`;
    }
    await match.save();
    return res.json({ data: match });
  }
  const item = await Model.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!item) throw new AppError("Resource not found", 404);
  res.json({ data: item });
});

exports.deleteResource = catchAsync(async (req, res) => {
  const Model = resourceModels[req.params.resource];
  if (!Model) throw new AppError("Unknown resource", 404);
  const item = await Model.findByIdAndDelete(req.params.id);
  if (!item) throw new AppError("Resource not found", 404);
  res.status(204).end();
});

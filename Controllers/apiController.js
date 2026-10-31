const crypto = require("crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const userModel = require("../Models/userModel");
const matchModel = require("../Models/matchModel");
const teamModel = require("../Models/teamModel");
const stadiumModel = require("../Models/stadiumModel");
const competitionModel = require("../Models/competitionModel");
const ticketModel = require("../Models/ticketModel");
const bookingModel = require("../Models/bookingModel");
const contactMessageModel = require("../Models/contactMessageModel");
const EmailSender = require("../utilities/email");
const { catchAsync, AppError } = require("../utilities/errorHandler");
const { ensureMatchInventory } = require("../utilities/ticketInventory");
const {
  initiateStkPush,
  normalizePhoneNumber,
  queryStkPush,
} = require("../utilities/daraja");

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
  await ensureMatchInventory(match);
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

exports.getAdminUser = catchAsync(async (req, res) => {
  const user = await userModel.findById(req.params.id)
    .select("-password -passwordChangedAt -passwordResetToken -passwordResetExpires");
  if (!user) throw new AppError("User not found", 404);
  res.json({ data: publicUser(user) });
});

exports.updateAdminUser = catchAsync(async (req, res) => {
  const allowed = ["firstname", "lastname", "idNumber", "passportNumber", "gender", "birthdate", "country", "province", "city", "role"];
  const updates = {};
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      updates[key] = req.body[key] === "" ? undefined : req.body[key];
    }
  });
  if (String(req.user._id) === req.params.id && updates.role && updates.role !== req.user.role) {
    throw new AppError("You cannot change your own administrator role", 400);
  }
  const user = await userModel.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  }).select("-password");
  if (!user) throw new AppError("User not found", 404);
  res.json({ data: publicUser(user) });
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

exports.submitContactMessage = catchAsync(async (req, res) => {
  const { name, email, subject, message } = req.body;
  const item = await contactMessageModel.create({ name, email, subject, message });
  res.status(201).json({
    data: { id: item._id, submittedAt: item.submittedAt },
    message: "Thanks for getting in touch. Your message has been received.",
  });
});

exports.getContactMessages = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status) {
    if (!["new", "read", "resolved"].includes(req.query.status)) {
      throw new AppError("Invalid message status", 400);
    }
    filter.status = req.query.status;
  }
  const [items, total] = await Promise.all([
    contactMessageModel.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit),
    contactMessageModel.countDocuments(filter),
  ]);
  respondWithPage(res, items, total, page, limit);
});

exports.updateContactMessage = catchAsync(async (req, res) => {
  const { status } = req.body;
  if (!["new", "read", "resolved"].includes(status)) {
    throw new AppError("Choose a valid message status", 400);
  }
  const item = await contactMessageModel.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );
  if (!item) throw new AppError("Message not found", 404);
  res.json({ data: item });
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

const releaseBooking = async (bookingId, status, reason, transactionId) => {
  const session = await mongoose.startSession();
  let released = false;
  try {
    await session.withTransaction(async () => {
      const booking = await bookingModel.findOneAndUpdate(
        { _id: bookingId, status: { $in: ["pending_payment", "stk_prompt_sent"] } },
        {
          $set: {
            status,
            paymentFailure: reason,
            ...(transactionId ? { transactionId: String(transactionId) } : {}),
          },
        },
        { new: true, session }
      );
      if (!booking) return;
      const result = await matchModel.updateOne(
        {
          _id: booking.match,
          ticketTypes: {
            $elemMatch: {
              id: booking.ticketTypeId,
              reservedQuantity: { $gte: booking.quantity },
            },
          },
        },
        {
          $inc: {
            "ticketTypes.$.reservedQuantity": -booking.quantity,
            "ticketTypes.$.availableQuantity": booking.quantity,
          },
        },
        { session }
      );
      if (!result.modifiedCount) {
        throw new AppError("Could not release the reserved ticket inventory", 500);
      }
      released = true;
    });
  } finally {
    await session.endSession();
  }
  return released;
};

const completeDarajaPayment = async (booking, transactionId) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const current = await bookingModel.findById(booking._id).session(session);
      if (!current) {
        result = current;
        return;
      }
      if (current.status === "paid" || current.status === "paid_after_expiry") {
        if (current.transactionId && current.transactionId !== transactionId) {
          throw new AppError("Booking was already processed with a different transaction", 409);
        }
        if (!current.transactionId) {
          current.transactionId = transactionId;
          await current.save({ session });
        }
        result = current;
        return;
      }
      if (current.transactionId && current.transactionId !== transactionId) {
        throw new AppError("Booking is already associated with a different transaction", 409);
      }

      const wasReserved = ["pending_payment", "stk_prompt_sent"].includes(current.status);
      const inventoryFilter = {
        _id: current.match,
        ticketTypes: {
          $elemMatch: {
            id: current.ticketTypeId,
            ...(wasReserved
              ? { reservedQuantity: { $gte: current.quantity } }
              : { availableQuantity: { $gte: current.quantity } }),
          },
        },
      };
      const inventoryUpdate = wasReserved
        ? {
            $inc: {
              "ticketTypes.$.reservedQuantity": -current.quantity,
              "ticketTypes.$.soldQuantity": current.quantity,
            },
          }
        : {
            $inc: {
              "ticketTypes.$.availableQuantity": -current.quantity,
              "ticketTypes.$.soldQuantity": current.quantity,
            },
          };
      const inventoryResult = await matchModel.updateOne(
        inventoryFilter,
        inventoryUpdate,
        { session }
      );
      if (!inventoryResult.modifiedCount) {
        current.status = "paid_after_expiry";
        current.transactionId = transactionId;
        current.paymentFailure =
          "Payment arrived after the reservation was released and inventory was no longer available";
        await current.save({ session });
        result = current;
        return;
      }

      const ticketData = Array.from({ length: current.quantity }, () => ({
        user: current.user,
        match: current.match,
        stand: current.ticketTypeId,
        purchaseDate: new Date(),
        price: current.unitPrice,
        currency: current.currency,
        booking: current._id,
      }));
      const tickets = await ticketModel.create(ticketData, { session });
      const matchEntries = tickets.map((ticket) => ({
        ticketID: ticket._id,
        stand: current.ticketTypeId,
        userID: "",
        userPassportNO: "",
        userMail: current.customer.email,
      }));
      const userEntries = tickets.map((ticket) => ({
        id: ticket._id,
        price: ticket.price,
        match: current.match,
        matchDate: current.eventDate,
      }));
      await Promise.all([
        matchModel.updateOne(
          { _id: current.match },
          { $push: { tickets: { $each: matchEntries } } },
          { session }
        ),
        userModel.updateOne(
          { _id: current.user },
          { $push: { tickets: { $each: userEntries } } },
          { session }
        ),
      ]);
      current.status = "paid";
      current.transactionId = transactionId;
      current.paidAt = new Date();
      current.tickets = tickets.map((ticket) => ticket._id);
      current.paymentFailure = undefined;
      await current.save({ session });
      result = current;
    });
    return result;
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.transactionId) {
      throw new AppError("M-Pesa transaction has already been processed", 409);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

exports.createBooking = catchAsync(async (req, res) => {
  const matchId = req.body.matchId;
  const ticketTypeId = String(req.body.ticketTypeId || "").trim();
  if (!req.user.verifiedEmail) throw new AppError("Verify your email before booking", 403);
  if (!req.user.idNumber && !req.user.passportNumber) {
    throw new AppError("Add an ID or passport number before booking", 403);
  }
  if (!matchId || !ticketTypeId) throw new AppError("Choose a match and ticket type", 400);
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new AppError("Choose between 1 and 10 tickets", 400);
  }
  const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);

  const session = await mongoose.startSession();
  let booking;
  try {
    await session.withTransaction(async () => {
      let match = await matchModel.findById(matchId).session(session);
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
      await ensureMatchInventory(match, session);
      const updatedMatch = await matchModel.findOneAndUpdate(
        {
          _id: match._id,
          ticketTypes: {
            $elemMatch: {
              id: ticketTypeId,
              enabled: true,
              availableQuantity: { $gte: quantity },
            },
          },
        },
        {
          $inc: {
            "ticketTypes.$.availableQuantity": -quantity,
            "ticketTypes.$.reservedQuantity": quantity,
          },
        },
        { new: true, session }
      );
      if (!updatedMatch) throw new AppError("Not enough tickets are available", 409);
      const ticketType = updatedMatch.ticketTypes.find((item) => item.id === ticketTypeId);
      const name = `${req.user.firstname} ${req.user.lastname}`.trim();
      const [createdBooking] = await bookingModel.create(
        [
          {
            reference: `TKT-${Date.now()}-${crypto.randomBytes(12).toString("hex")}`,
            user: req.user._id,
            match: match._id,
            eventName: match.fixture,
            eventDate: match.matchDate,
            ticketTypeId,
            ticketTypeName: ticketType.name,
            quantity,
            unitPrice: ticketType.price,
            amount: Number((ticketType.price * quantity).toFixed(2)),
            currency: ticketType.currency,
            customer: {
              name,
              email: req.user.email,
              phoneNumber,
            },
            status: "pending_payment",
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        ],
        { session }
      );
      booking = createdBooking;
    });
  } finally {
    await session.endSession();
  }

  let stkPush;
  try {
    stkPush = await initiateStkPush(booking, phoneNumber);
  } catch (error) {
    await releaseBooking(booking._id, "failed", "Could not initialize payment");
    throw error;
  }

  booking.checkoutRequestId = stkPush.checkoutRequestId;
  booking.merchantRequestId = stkPush.merchantRequestId;
  booking.status = "stk_prompt_sent";
  await booking.save();

  res.status(201).json({
    data: {
      reference: booking.reference,
      status: booking.status,
      amount: booking.amount,
      currency: booking.currency,
      expiresAt: booking.expiresAt,
      message: "M-Pesa prompt sent. Enter your PIN on your phone to complete payment.",
    },
  });
});

exports.getBooking = catchAsync(async (req, res) => {
  const booking = await bookingModel.findOne({
    reference: req.params.reference,
    user: req.user._id,
  }).select("reference eventName eventDate ticketTypeName quantity amount currency status expiresAt tickets");
  if (!booking) throw new AppError("Booking not found", 404);
  res.json({ data: booking });
});

exports.darajaCallback = catchAsync(async (req, res) => {
  const callback = req.body?.Body?.stkCallback;
  const checkoutRequestId = String(callback?.CheckoutRequestID || "");
  if (!callback || !checkoutRequestId) {
    throw new AppError("Invalid M-Pesa callback payload", 400);
  }

  const booking = await bookingModel.findOne({
    checkoutRequestId,
  });
  if (!booking) {
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
  if (
    booking.merchantRequestId &&
    String(callback.MerchantRequestID || "") !== booking.merchantRequestId
  ) {
    throw new AppError("M-Pesa callback did not match the booking request", 400);
  }

  const verification = await queryStkPush(booking.checkoutRequestId);
  if (
    String(verification.CheckoutRequestID || "") !== booking.checkoutRequestId ||
    String(verification.ResponseCode) !== "0"
  ) {
    throw new AppError("Safaricom could not verify the M-Pesa request", 502);
  }

  const callbackResultCode = String(callback.ResultCode);
  if (
    verification.ResultCode == null ||
    String(verification.ResultCode) !== callbackResultCode
  ) {
    throw new AppError("M-Pesa callback status did not match Safaricom verification", 502);
  }
  if (callbackResultCode !== "0") {
    await releaseBooking(
      booking._id,
      "failed",
      String(callback.ResultDesc || "M-Pesa payment was not completed").slice(0, 250)
    );
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const metadata = callback.CallbackMetadata?.Item;
  const metadataValue = (name) =>
    metadata?.find((item) => item.Name === name)?.Value;
  const receipt = String(metadataValue("MpesaReceiptNumber") || "").trim();
  const amount = Number(metadataValue("Amount"));
  const callbackPhone = normalizePhoneNumber(metadataValue("PhoneNumber"));
  if (
    !receipt ||
    booking.currency !== "KES" ||
    !Number.isFinite(amount) ||
    Math.round(amount * 100) !== Math.round(booking.amount * 100) ||
    callbackPhone !== normalizePhoneNumber(booking.customer.phoneNumber)
  ) {
    throw new AppError("M-Pesa payment details did not match the booking", 400);
  }

  await completeDarajaPayment(booking, receipt);
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

exports.expirePendingBookings = async () => {
  const expired = await bookingModel.find({
    status: { $in: ["pending_payment", "stk_prompt_sent"] },
    expiresAt: { $lte: new Date() },
  }).select("_id").limit(100);
  for (const booking of expired) {
    await releaseBooking(booking._id, "expired", "Payment window expired");
  }
};

exports.rejectLegacyTicketPurchase = (req, res) => {
  res.status(410).json({
    message: "Direct ticket purchases are disabled. Start a hosted checkout from the match page.",
  });
};

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
      ticketTypes: venue.stands.map((stand) => ({
        id: stand.id,
        name: stand.name || stand.id,
        location: stand.location,
        price: stand.price,
        currency: stand.currency || "USD",
        quantity: stand.capacity,
        availableQuantity: stand.capacity,
        reservedQuantity: 0,
        soldQuantity: 0,
        enabled: stand.availablity,
      })),
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

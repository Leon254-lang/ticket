const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    user: {
      type: mongoose.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    match: {
      type: mongoose.Types.ObjectId,
      ref: "matches",
      required: true,
      index: true,
    },
    eventName: { type: String, required: true },
    eventDate: { type: Date, required: true },
    ticketTypeId: { type: String, required: true },
    ticketTypeName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phoneNumber: { type: String },
    },
    status: {
      type: String,
      enum: ["pending_payment", "paid", "failed", "expired", "paid_after_expiry"],
      default: "pending_payment",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    paymentUrl: { type: String },
    transactionId: { type: String },
    paymentFailure: { type: String },
    paidAt: { type: Date },
    tickets: [{ type: mongoose.Types.ObjectId, ref: "tickets" }],
  },
  { timestamps: true }
);

bookingSchema.index({ status: 1, expiresAt: 1 });
bookingSchema.index(
  { transactionId: 1 },
  { unique: true, sparse: true, name: "unique_flutterwave_transaction_id" }
);

module.exports = mongoose.model("bookings", bookingSchema);
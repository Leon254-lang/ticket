const mongoose = require("mongoose");

const contactMessageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Your name is required"],
    trim: true,
    minlength: [2, "Your name must have at least 2 characters"],
    maxlength: [80, "Your name must have at most 80 characters"],
  },
  email: {
    type: String,
    required: [true, "Your email is required"],
    trim: true,
    lowercase: true,
    maxlength: [254, "Your email must have at most 254 characters"],
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address"],
  },
  subject: {
    type: String,
    required: [true, "A subject is required"],
    trim: true,
    minlength: [3, "The subject must have at least 3 characters"],
    maxlength: [120, "The subject must have at most 120 characters"],
  },
  message: {
    type: String,
    required: [true, "A message is required"],
    trim: true,
    minlength: [10, "Your message must have at least 10 characters"],
    maxlength: [5000, "Your message must have at most 5000 characters"],
  },
  status: {
    type: String,
    enum: ["new", "read", "resolved"],
    default: "new",
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("contactMessages", contactMessageSchema);

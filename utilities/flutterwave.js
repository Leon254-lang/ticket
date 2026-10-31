const axios = require("axios");
const { AppError } = require("./errorHandler");

const api = axios.create({ baseURL: "https://api.flutterwave.com/v3" });

const headers = () => {
  if (!process.env.FLUTTERWAVE_SECRET_KEY) {
    throw new AppError("Payment processing is not configured", 503);
  }
  return { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` };
};

exports.createCheckout = async (booking, redirectUrl) => {
  try {
    const response = await api.post(
      "/payments",
      {
        tx_ref: booking.reference,
        amount: booking.amount,
        currency: booking.currency,
        redirect_url: redirectUrl,
        customer: {
          email: booking.customer.email,
          name: booking.customer.name,
          ...(booking.customer.phoneNumber
            ? { phonenumber: booking.customer.phoneNumber }
            : {}),
        },
        payment_options: "card, mpesa",
        configurations: { session_duration: 10, max_retry_attempt: 3 },
        customizations: {
          title: "Ticketify",
          description: `${booking.quantity} ticket(s) for ${booking.eventName}`,
        },
      },
      { headers: headers() }
    );
    const checkoutUrl = response.data?.data?.link;
    if (
      response.data?.status !== "success" ||
      !checkoutUrl ||
      !checkoutUrl.startsWith("https://checkout.flutterwave.com/")
    ) {
      throw new AppError("Flutterwave did not return a valid checkout link", 502);
    }
    return checkoutUrl;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Could not start hosted checkout. Please try again", 502);
  }
};

exports.verifyTransaction = async (transactionId) => {
  try {
    const response = await api.get(
      `/transactions/${encodeURIComponent(transactionId)}/verify`,
      { headers: headers() }
    );
    if (response.data?.status !== "success" || !response.data?.data) {
      throw new AppError("Flutterwave could not verify this transaction", 502);
    }
    return response.data.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Could not verify payment with Flutterwave", 502);
  }
};
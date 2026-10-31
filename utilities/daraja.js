const axios = require("axios");
const { AppError } = require("./errorHandler");

let cachedToken;
let tokenExpiresAt = 0;

const getConfig = () => {
  const required = [
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE",
    "MPESA_PASSKEY",
    "MPESA_CALLBACK_URL",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new AppError(`M-Pesa is not configured: missing ${missing.join(", ")}`, 503);
  }

  const environment = process.env.MPESA_ENV || "sandbox";
  if (!["sandbox", "production"].includes(environment)) {
    throw new AppError("MPESA_ENV must be sandbox or production", 503);
  }
  const transactionType =
    process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline";
  if (!["CustomerPayBillOnline", "CustomerBuyGoodsOnline"].includes(transactionType)) {
    throw new AppError(
      "MPESA_TRANSACTION_TYPE must be CustomerPayBillOnline or CustomerBuyGoodsOnline",
      503
    );
  }

  let callbackUrl;
  try {
    callbackUrl = new URL(process.env.MPESA_CALLBACK_URL);
  } catch {
    throw new AppError("MPESA_CALLBACK_URL must be a valid public HTTPS URL", 503);
  }
  if (
    callbackUrl.protocol !== "https:" ||
    ["localhost", "127.0.0.1", "::1"].includes(callbackUrl.hostname) ||
    !callbackUrl.pathname.endsWith("/api/mpesa/callback")
  ) {
    throw new AppError(
      "MPESA_CALLBACK_URL must be a public HTTPS URL ending in /api/mpesa/callback",
      503
    );
  }

  return {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    callbackUrl: callbackUrl.toString(),
    transactionType,
    baseUrl: environment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke",
  };
};

const getTimestamp = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date())
    .reduce((values, part) => {
      if (part.type !== "literal") values[part.type] = part.value;
      return values;
    }, {});
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
};

const getPassword = (shortcode, passkey, timestamp) =>
  Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

const getAccessToken = async (config) => {
  if (cachedToken && tokenExpiresAt > Date.now() + 30_000) return cachedToken;

  try {
    const credentials = Buffer.from(
      `${config.consumerKey}:${config.consumerSecret}`
    ).toString("base64");
    const response = await axios.get(
      `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${credentials}` } }
    );
    if (!response.data?.access_token) {
      throw new AppError("Safaricom did not return an OAuth access token", 502);
    }

    cachedToken = response.data.access_token;
    tokenExpiresAt = Date.now() + Number(response.data.expires_in || 3600) * 1000;
    return cachedToken;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Could not authenticate with Safaricom Daraja", 502);
  }
};

exports.normalizePhoneNumber = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (/^[17]\d{8}$/.test(digits)) digits = `254${digits}`;
  else if (/^0[17]\d{8}$/.test(digits)) digits = `254${digits.slice(1)}`;

  if (!/^254[17]\d{8}$/.test(digits)) {
    throw new AppError("Enter a valid Kenyan M-Pesa phone number", 400);
  }
  return digits;
};

exports.initiateStkPush = async (booking, phoneNumber) => {
  const config = getConfig();
  if (booking.currency !== "KES" || !Number.isSafeInteger(booking.amount) || booking.amount < 1) {
    throw new AppError("M-Pesa payments require a whole-number amount in KES", 400);
  }
  const timestamp = getTimestamp();
  const payload = {
    BusinessShortCode: config.shortcode,
    Password: getPassword(config.shortcode, config.passkey, timestamp),
    Timestamp: timestamp,
    TransactionType: config.transactionType,
    Amount: booking.amount,
    PartyA: phoneNumber,
    PartyB: config.shortcode,
    PhoneNumber: phoneNumber,
    CallBackURL: config.callbackUrl,
    AccountReference: booking.reference.slice(-12),
    TransactionDesc: `Ticket ${booking.reference}`.slice(0, 20),
  };

  try {
    const accessToken = await getAccessToken(config);
    const response = await axios.post(
      `${config.baseUrl}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (
      String(response.data?.ResponseCode) !== "0" ||
      !response.data?.CheckoutRequestID ||
      !response.data?.MerchantRequestID
    ) {
      throw new AppError(
        response.data?.CustomerMessage || "Safaricom did not accept the M-Pesa payment request",
        502
      );
    }
    return {
      checkoutRequestId: String(response.data.CheckoutRequestID),
      merchantRequestId: String(response.data.MerchantRequestID),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Could not send the M-Pesa prompt. Please try again", 502);
  }
};

exports.queryStkPush = async (checkoutRequestId) => {
  const config = getConfig();
  const timestamp = getTimestamp();

  try {
    const accessToken = await getAccessToken(config);
    const response = await axios.post(
      `${config.baseUrl}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: config.shortcode,
        Password: getPassword(config.shortcode, config.passkey, timestamp),
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return response.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Could not verify the M-Pesa payment with Safaricom", 502);
  }
};

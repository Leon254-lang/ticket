const getDatabaseConnectionString = () => {
  const connectionString = String(process.env.DATABASE_CONNECTION_STRING || "").trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_CONNECTION_STRING is required. Set it in .env or your deployment environment."
    );
  }
  if (!/^mongodb\+srv:\/\//i.test(connectionString)) {
    throw new Error(
      "DATABASE_CONNECTION_STRING must be a MongoDB Atlas SRV URI beginning with mongodb+srv://."
    );
  }

  return connectionString;
};

module.exports = { getDatabaseConnectionString };

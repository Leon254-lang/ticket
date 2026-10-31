const matchModel = require("../Models/matchModel");
const stadiumModel = require("../Models/stadiumModel");

const ensureMatchInventory = async (match, session) => {
  if (match.ticketTypes && match.ticketTypes.length) return match.ticketTypes;

  const stadiumId = match.stadium?._id || match.stadium;
  let stadiumQuery = stadiumModel.findById(stadiumId);
  if (session) stadiumQuery = stadiumQuery.session(session);
  const stadium = await stadiumQuery;
  if (!stadium) return [];

  const ticketTypes = stadium.stands.map((stand) => {
    const soldQuantity = (match.tickets || []).filter(
      (ticket) => ticket.stand === stand.id
    ).length;
    return {
      id: stand.id,
      name: stand.name || stand.id,
      location: stand.location,
      price: stand.price,
      currency: stand.currency || "USD",
      quantity: stand.capacity,
      availableQuantity: Math.max(0, stand.capacity - soldQuantity),
      reservedQuantity: 0,
      soldQuantity,
      enabled: stand.availablity,
    };
  });

  let update = matchModel.updateOne(
    { _id: match._id, "ticketTypes.0": { $exists: false } },
    { $set: { ticketTypes } }
  );
  if (session) update = update.session(session);
  await update;
  match.ticketTypes = ticketTypes;
  return ticketTypes;
};

module.exports = { ensureMatchInventory };
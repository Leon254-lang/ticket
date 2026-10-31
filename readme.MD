# Ticketify

Ticketify is a match-ticketing app with a React frontend, an Express API, and MongoDB storage.

## Stack

- Frontend: React 18, React Router, and Vite (`client/`)
- Backend: Node.js and Express (`Controllers/`, `Routes/`, `Models/`)
- Database: MongoDB through Mongoose 9 and its bundled current Node.js driver

## MongoDB Atlas setup

Ticketify uses MongoDB Atlas for both local development and deployment. The backend and admin seed command share `DATABASE_CONNECTION_STRING`; local development loads it from `.env`, while production uses the deployment environment. Atlas SRV URIs (`mongodb+srv://`) are required.

1. Create an Atlas cluster, a database user, and an IP access-list entry that allows your development machine. Copy the Node.js driver connection string from Atlas's **Connect → Drivers** page.

2. Install Node.js and project dependencies:

   ```sh
   npm install
   ```

3. Copy `.env.example` to `.env`. Replace the `DATABASE_CONNECTION_STRING` placeholder with the complete Atlas driver URI, including the database username, URL-encoded password, and cluster hostname. Replace `JWT_SECRET_CODE` with a long random secret. Keep `.env` private; it is ignored by Git.

   MongoDB credentials belong only in the backend environment. The React app calls the Express API and must never connect to MongoDB directly.
   The backend reuses one Mongoose connection and leaves pool settings at driver defaults for this low-traffic application.

4. Start the backend and frontend in separate terminals:

   ```sh
   npm run start:dev
   ```

   ```sh
   npm run dev:frontend
   ```

   Open the Vite URL printed in the frontend terminal. Vite proxies `/api` requests to the local Express server.

5. To build the production frontend and serve it from Express:

   ```sh
   npm run build
   npm start
   ```

   Deployments should provide the Atlas `DATABASE_CONNECTION_STRING` and `JWT_SECRET_CODE` as environment variables. `heroku-postbuild` builds the React app during a Heroku deployment.

## Render deployment

The included `render.yaml` configures the Render build command as `npm install && npm run build` and the start command as `npm start`. If configuring the service in the Render dashboard instead, use those same commands. For compatibility with existing services configured to run `node app.js`, that entry point now delegates to the server bootstrap.

Set `DATABASE_CONNECTION_STRING` to the Atlas connection URI and `JWT_SECRET_CODE` to a long random secret in the Render environment settings. Do not commit `.env` or paste database credentials into the build or start command.

## Create or reset an admin account

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` only in the current terminal session, then run `npm run seed:admin`. The command creates the account if it does not exist, or promotes and resets the matching account if it does. It stores only the bcrypt password hash in MongoDB; do not commit credentials or add them to seed data.

For PowerShell:

```powershell
$env:ADMIN_EMAIL = Read-Host "Admin email"
$securePassword = Read-Host "Admin password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
npm run seed:admin
Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
```

## Frontend routes

- Public: `/`, `/matches/:id`, `/signin`, `/signup`, `/user/resetpassword`
- User account: `/panel/dashboard`, `/panel/tickets`, `/panel/account`, `/panel/contactus`
- Admin: `/adminpanel/dashboard`, `/adminpanel/users`, `/adminpanel/matches`, `/adminpanel/teams`, `/adminpanel/stadiums`, `/adminpanel/competitions`, `/adminpanel/tickets`, `/adminpanel/messages`

The client also redirects the previous `.html` page URLs to the corresponding React routes where possible.

## API overview

All new API routes are under `/api` and return JSON. Authentication uses the existing HTTP-only `jwt` cookie.

| Method | Endpoint | Access |
|---|---|---|
| `POST` | `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout` | Public / signed-in |
| `GET` | `/api/auth/me` | Signed-in |
| `GET` | `/api/matches`, `/api/matches/:id` | Public |
| `GET` | `/api/teams`, `/api/stadiums`, `/api/competitions` | Public |
| `GET` | `/api/uploads/:id` | Public image |
| `POST` | `/api/admin/uploads` | Admin (PNG, JPEG, WebP, or GIF; 5 MB max) |
| `POST` | `/api/tickets` | Signed-in; reserves server-priced tickets and sends an M-Pesa STK prompt |
| `GET` | `/api/bookings/:reference` | Signed-in owner |
| `POST` | `/api/mpesa/callback` | Public Safaricom Daraja STK callback |
| `GET` | `/api/users/me/tickets`, `/api/dashboard/me` | Signed-in |
| `GET` | `/api/admin/dashboard`, `/api/admin/users`, `/api/admin/tickets`, `/api/admin/matches` | Admin |
| `POST` | `/api/contact` | Public |
| `GET`, `PATCH` | `/api/admin/messages[/:id]` | Admin |
| `GET`, `PATCH` | `/api/admin/users[/:id]` | Admin |
| `POST`, `PATCH`, `DELETE` | `/api/:resource[/:id]` | Admin |

Supported catalog resources are `matches`, `teams`, `stadiums`, and `competitions`. Contact submissions are stored in MongoDB and managed from the admin message center; account profile and role changes are available in admin user details. Successful collection requests return a `data` array and pagination information; errors return a JSON `message`.

Admins can upload team logos and backgrounds, stadium images, competition logos, and match cover images from the resource forms. Images are stored in MongoDB Atlas GridFS (not Render's temporary filesystem); supported formats are PNG, JPEG, WebP, and GIF, up to 5 MB per image.

## Email and payments

Email verification and password-reset flows require the `NODE_MAILER_*` settings. Configure `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, and `MPESA_CALLBACK_URL` in the server environment. Use the Daraja sandbox app and set `MPESA_ENV=sandbox` for testing; after Safaricom approves the Go Live process, set `MPESA_ENV=production` and use the live shortcode/passkey. The callback URL must be a publicly reachable HTTPS URL ending in `/api/mpesa/callback`. Use `MPESA_TRANSACTION_TYPE=CustomerPayBillOnline` for a PayBill or `CustomerBuyGoodsOnline` for a Till. Keep all Daraja credentials server-side and never add them to frontend variables.

Each new match snapshots its stadium stands into event-specific `ticketTypes` inventory. A stand's `id` and `name` identify its ticket type; `price`, ISO 4217 `currency`, `quantity`, `availableQuantity`, `reservedQuantity`, and `soldQuantity` are stored on the match. Configure a stand in the stadium `stands` JSON, for example `{"id":"A1","name":"West stand","location":"west","floor":"1","capacity":100,"price":25,"currency":"KES","availablity":true}`. Existing matches get their inventory initialized from their stadium the first time match details are read or a booking is started.

The browser sends only the match, ticket type, quantity, and M-Pesa phone number. The API reads price and currency from MongoDB, atomically reserves inventory in a MongoDB transaction, and creates a `pending_payment` booking that expires after 10 minutes. Once Daraja accepts the STK Push request, the booking moves to `stk_prompt_sent`; the result page tells the customer to enter their PIN and waits for Safaricom's callback. M-Pesa payments require whole-number KES prices. The callback is matched to the stored checkout and merchant request IDs, checked against an authenticated Daraja STK query, and validated against the booking amount, currency, and phone before inventory is permanently reduced and tickets are issued. M-Pesa receipt numbers and checkout request IDs have unique sparse database indexes, so callback retries cannot issue duplicate tickets or associate a payment with another booking. Issued ticket IDs are displayed on the payment result and in the user's tickets page. Pending reservations are released by the server expiry worker. If a verified payment arrives after its reservation was released and inventory is gone, the booking is marked `paid_after_expiry` for support/refund handling rather than overselling.

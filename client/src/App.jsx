import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import api from "./api.js";

const AuthContext = createContext(null);
const sports = ["football", "basketball", "volleyball"];
const adminSections = [
  ["Dashboard", "/adminpanel/dashboard"],
  ["Users", "/adminpanel/users"],
  ["Matches", "/adminpanel/matches"],
  ["Teams", "/adminpanel/teams"],
  ["Stadiums", "/adminpanel/stadiums"],
  ["Competitions", "/adminpanel/competitions"],
  ["Tickets", "/adminpanel/tickets"],
  ["Messages", "/adminpanel/messages"],
];
const userSections = [
  ["Overview", "/panel/dashboard"],
  ["My tickets", "/panel/tickets"],
  ["Account", "/panel/account"],
  ["Contact", "/panel/contactus"],
];

const useAuth = () => useContext(AuthContext);

function useRequest(path, dependencies = []) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const reload = async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const result = await api(path);
      setState({ loading: false, data: result?.data ?? result, error: "" });
    } catch (error) {
      setState({ loading: false, data: null, error: error.message });
    }
  };
  useEffect(() => {
    let active = true;
    api(path)
      .then((result) => {
        if (active) setState({ loading: false, data: result?.data ?? result, error: "" });
      })
      .catch((error) => {
        if (active) setState({ loading: false, data: null, error: error.message });
      });
    return () => {
      active = false;
    };
  }, dependencies);
  return { ...state, reload };
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const result = await api("/auth/me");
      setUser(result.data);
      return result.data;
    } catch (error) {
      if (error.message !== "Please sign in to continue") setUser(null);
      else setUser(null);
      return null;
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const authValue = useMemo(
    () => ({ user, setUser, refreshUser, authLoading }),
    [user, authLoading]
  );

  return (
    <AuthContext.Provider value={authValue}>
      <div className="app-shell">
        <SiteHeader />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/matches/:id" element={<MatchPage />} />
          <Route path="/signin" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/user/resetpassword" element={<ForgotPasswordPage />} />
          <Route path="/user/resetpassword/:token" element={<ResetPasswordPage />} />
          <Route element={<RequireUser />}>
            <Route path="/panel" element={<Navigate to="/panel/dashboard" replace />} />
            <Route path="/panel/dashboard" element={<UserDashboardPage />} />
            <Route path="/panel/tickets" element={<UserTicketsPage />} />
            <Route path="/panel/account" element={<AccountPage />} />
            <Route path="/panel/contactus" element={<ContactPage />} />
          </Route>
          <Route element={<RequireUser admin />}>
            <Route path="/adminpanel" element={<Navigate to="/adminpanel/dashboard" replace />} />
            <Route path="/adminpanel/dashboard" element={<AdminDashboardPage />} />
            <Route path="/adminpanel/messages" element={<MessagesPage />} />
            <Route path="/adminpanel/:resource" element={<AdminResourcePage />} />
            <Route path="/adminpanel/:resource/new" element={<AdminResourcePage />} />
            <Route path="/adminpanel/:resource/:id/edit" element={<AdminResourcePage />} />
          </Route>
          <Route path="/contact" element={<ContactPage />} />
          <Route path="*" element={<LegacyRedirect />} />
        </Routes>
        <SiteFooter />
      </div>
    </AuthContext.Provider>
  );
}

function RequireUser({ admin = false }) {
  const { user, authLoading } = useAuth();
  const location = useLocation();
  if (authLoading) return <Loading />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location }} />;
  if (admin && user.role !== "admin") return <AccessDenied />;
  return <Outlet />;
}

function SiteHeader() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      navigate("/");
    } catch (error) {
      window.alert(error.message);
    }
  };

  return (
    <header className="site-header">
      <Link className="brand" to="/" aria-label="Ticketify home">
        <span className="brand-mark">T</span>
        <span>ticketify<span className="brand-period">.</span></span>
      </Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link to="/">Discover</Link>
        <div className="sports-menu">
          <span>Sports <i className="bi bi-chevron-down" /></span>
          <div className="sports-menu-panel">
            {sports.map((sport) => (
              <Link key={sport} to={`/?sport=${sport}`}>{capitalize(sport)}</Link>
            ))}
          </div>
        </div>
      </nav>
      <form
        className="header-search"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(`/?search=${encodeURIComponent(search)}`);
        }}
      >
        <i className="bi bi-search" />
        <input
          aria-label="Search matches"
          placeholder="Search matches"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit" aria-label="Submit search"><i className="bi bi-arrow-return-left" /></button>
      </form>
      <div className="header-actions">
        {user ? (
          <>
            <Link className="text-link" to={user.role === "admin" ? "/adminpanel/dashboard" : "/panel/dashboard"}>
              {user.firstname || "My account"}
            </Link>
            <button className="button button-outline button-small" onClick={logout}>Sign out</button>
          </>
        ) : (
          <>
            <Link className="text-link" to="/signin">Sign in</Link>
            <Link className="button button-small" to="/signup">Create account</Link>
          </>
        )}
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link className="brand brand-footer" to="/"><span className="brand-mark">T</span><span>ticketify<span className="brand-period">.</span></span></Link>
      <span>Make memories. Live the game.</span>
      <div><Link to="/contact">Contact</Link><span>© {new Date().getFullYear()} Ticketify</span></div>
    </footer>
  );
}

function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sport = searchParams.get("sport") || "all";
  const search = searchParams.get("search") || "";
  const query = new URLSearchParams({ sport, search, limit: "50" }).toString();
  const { loading, data, error } = useRequest(`/matches?${query}`, [query]);
  const matches = Array.isArray(data) ? data : data?.data || [];

  return (
    <main>
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> THE GAME IS BETTER LIVE</span>
          <h1>Make room for<br /><em>the moment.</em></h1>
          <p>Find your next unforgettable match. Great seats, electric crowds, and memories that stay with you.</p>
          <a className="button" href="#matches">Explore upcoming matches <i className="bi bi-arrow-down-right" /></a>
          <div className="hero-note"><span className="avatar-stack"><b>J</b><b>M</b><b>A</b></span><span>Fans are finding their next big day out</span></div>
        </div>
        <div className="hero-art" aria-label="A night match in a full stadium">
          <div className="hero-art-glow" />
          <div className="hero-art-card">
            <span className="live-tag"><span /> MATCH DAY</span>
            <div className="hero-score">
              <div><span className="team-crest crest-blue">FC</span><b>FC Barcelona</b></div>
              <span className="versus">VS</span>
              <div><span className="team-crest crest-gold">RM</span><b>Real Madrid</b></div>
            </div>
            <div className="hero-art-bottom"><span><i className="bi bi-geo-alt" /> Estadi Olímpic</span><span>THE CLASSIC</span></div>
          </div>
          <span className="floating-ticket"><i className="bi bi-ticket-perforated" /> Your seat is waiting</span>
          <span className="hero-orbit orbit-one" /><span className="hero-orbit orbit-two" />
        </div>
      </section>
      <section className="trust-strip">
        <span>YOUR NEXT GREAT DAY OUT STARTS HERE</span>
        <div><i className="bi bi-shield-check" /> Secure booking</div>
        <div><i className="bi bi-lightning-charge" /> Instant confirmation</div>
        <div><i className="bi bi-heart" /> Made for fans</div>
      </section>
      <section className="content-section" id="matches">
        <div className="section-heading">
          <div><span className="eyebrow">FIND YOUR FIXTURE</span><h2>Coming up next</h2></div>
          <label className="filter-select">
            <span className="sr-only">Filter by sport</span>
            <select value={sport} onChange={(event) => setSearchParams({ sport: event.target.value, search })}>
              <option value="all">All sports</option>
              {sports.map((item) => <option key={item} value={item}>{capitalize(item)}</option>)}
            </select>
          </label>
        </div>
        {search && <p className="results-note">Showing results for <strong>{search}</strong> <button className="inline-button" onClick={() => setSearchParams(sport === "all" ? {} : { sport })}>Clear</button></p>}
        {loading ? <Loading /> : error ? <ErrorMessage message={error} /> : matches.length ? (
          <div className="match-grid">{matches.map((match) => <MatchCard key={match._id} match={match} />)}</div>
        ) : (
          <EmptyState title="No upcoming matches yet" text="Try another sport or check back soon for new fixtures." />
        )}
      </section>
      <section className="closing-banner">
        <div><span className="eyebrow">MAKE IT A DAY TO REMEMBER</span><h2>The best seat in the house<br />is the one you’re in.</h2></div>
        <a className="button button-light" href="#matches">Find your match <i className="bi bi-arrow-up-right" /></a>
      </section>
    </main>
  );
}

function MatchCard({ match }) {
  const matchDate = match.matchDate ? new Date(match.matchDate) : null;
  return (
    <article className="match-card">
      <Link to={`/matches/${match.slug || match._id}`} className="match-card-link">
        <div className="match-card-image">
          {match.cover ? <img src={imageUrl(match.cover, "matches")} alt="" /> : <div className="match-image-fallback"><i className="bi bi-trophy" /></div>}
          <span className="sport-pill">{capitalize(match.sport || "sport")}</span>
          <span className="match-card-date">{matchDate && !Number.isNaN(matchDate.valueOf()) ? matchDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Date TBA"}</span>
        </div>
        <div className="match-card-content">
          <span className="card-kicker">{match.competition?.name || match.fixture || "Upcoming fixture"}</span>
          <div className="card-teams"><strong>{match.homeTeam?.name || "Home team"}</strong><span>vs</span><strong>{match.awayTeam?.name || "Away team"}</strong></div>
          <p><i className="bi bi-geo-alt" /> {match.stadium?.name || "Venue to be announced"}{match.stadium?.city ? ` · ${match.stadium.city}` : ""}</p>
          <div className="match-card-cta">View match <i className="bi bi-arrow-up-right" /></div>
        </div>
      </Link>
    </article>
  );
}

function MatchPage() {
  const { id } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { loading, data: match, error } = useRequest(`/matches/${encodeURIComponent(id)}`, [id]);
  const [standId, setStandId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const stands = (match?.stadium?.stands || []).filter((stand) => stand.availablity);
  useEffect(() => {
    if (stands.length && !standId) setStandId(stands[0].id);
  }, [match]);

  const book = async (event) => {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      await api("/tickets", { method: "POST", body: { matchId: match._id, standId } });
      await refreshUser();
      navigate("/panel/tickets", { state: { notice: "Your booking is confirmed." } });
    } catch (requestError) {
      setMessage(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <main className="page-main"><Loading /></main>;
  if (error) return <main className="page-main"><ErrorMessage message={error} /><Link className="text-link" to="/">Back to matches</Link></main>;
  const matchDate = new Date(match.matchDate);
  const hasBookingWindow = new Date(match.startBuyDate) <= new Date() && new Date(match.endBuyDate) >= new Date();
  return (
    <main className="page-main">
      <div className="breadcrumbs"><Link to="/">Discover</Link><i className="bi bi-chevron-right" /><span>Match details</span></div>
      <section className="match-detail">
        <div className="match-detail-copy">
          <span className="eyebrow">{capitalize(match.sport)}{match.competition?.name ? ` · ${match.competition.name}` : ""}</span>
          <h1>{match.homeTeam.name}<em> vs </em>{match.awayTeam.name}</h1>
          <p className="match-lead">Be there for every moment. Find your place in the crowd.</p>
          <div className="match-facts">
            <div><i className="bi bi-calendar-event" /><span>DATE</span><strong>{Number.isNaN(matchDate.valueOf()) ? "To be announced" : matchDate.toLocaleString()}</strong></div>
            <div><i className="bi bi-geo-alt" /><span>VENUE</span><strong>{match.stadium?.name || "To be announced"}{match.stadium?.city ? `, ${match.stadium.city}` : ""}</strong></div>
            <div><i className="bi bi-ticket-perforated" /><span>FIXTURE</span><strong>{match.fixture}</strong></div>
          </div>
        </div>
        {match.cover && <img className="match-detail-cover" src={imageUrl(match.cover, "matches")} alt={`${match.homeTeam.name} vs ${match.awayTeam.name}`} />}
      </section>
      <section className="booking-panel">
        <div><span className="eyebrow">YOUR MATCH DAY</span><h2>Choose your stand</h2><p>Select the place you want to experience the game from.</p></div>
        {!user ? (
          <div className="booking-gate"><p>Sign in to choose your seat and book.</p><Link className="button" to="/signin">Sign in to book</Link></div>
        ) : !hasBookingWindow ? (
          <div className="notice notice-info">Ticket sales are not open for this match yet.</div>
        ) : stands.length ? (
          <form className="booking-form" onSubmit={book}>
            <label className="field"><span>Available stand</span><select value={standId} onChange={(event) => setStandId(event.target.value)}>{stands.map((stand) => <option key={stand.id} value={stand.id}>{stand.id} · {capitalize(stand.location)} · ${stand.price}</option>)}</select></label>
            {message && <div className="notice notice-error">{message}</div>}
            <button className="button" disabled={busy}>{busy ? "Booking…" : "Book this ticket"} <i className="bi bi-arrow-right" /></button>
            {!user.verifiedEmail && <p className="form-hint">Email verification is required before booking.</p>}
          </form>
        ) : <EmptyState title="No stands are available" text="Please check back later." />}
      </section>
    </main>
  );
}

function AuthPage({ mode }) {
  const signup = mode === "signup";
  const { setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstname: "", lastname: "", email: "", password: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const returnTo = location.state?.from?.pathname || "/panel/dashboard";

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const result = await api(`/auth/${signup ? "signup" : "login"}`, { method: "POST", body: form });
      setUser(result.data);
      navigate(result.data.role === "admin" ? "/adminpanel/dashboard" : returnTo, { replace: true });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-aside">
        <span className="eyebrow">TICKETIFY · LIVE THE GAME</span>
        <h1>{signup ? "Every great day out starts somewhere." : "Welcome back to the moment."}</h1>
        <p>{signup ? "Create your account, find your fixture, and get ready to be there." : "Sign in and get one step closer to your next unforgettable match."}</p>
        <div className="auth-aside-mark"><i className="bi bi-ticket-perforated" /><span>Find your place in the crowd.</span></div>
      </div>
      <section className="auth-card">
        <span className="eyebrow">{signup ? "JOIN THE CROWD" : "YOUR ACCOUNT"}</span>
        <h2>{signup ? "Create account" : "Sign in"}</h2>
        <p>{signup ? "It only takes a minute to get started." : "Enter your details to continue."}</p>
        <form className="form-stack" onSubmit={submit}>
          {signup && <div className="form-row">
            <Field label="First name" value={form.firstname} onChange={(value) => setForm({ ...form, firstname: value })} required autoComplete="given-name" />
            <Field label="Last name" value={form.lastname} onChange={(value) => setForm({ ...form, lastname: value })} required autoComplete="family-name" />
          </div>}
          <Field label="Email address" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required autoComplete="email" />
          <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} required autoComplete={signup ? "new-password" : "current-password"} />
          {signup && <Field label="Confirm password" type="password" value={form.confirmPassword} onChange={(value) => setForm({ ...form, confirmPassword: value })} required autoComplete="new-password" />}
          {!signup && <Link className="text-link form-inline-link" to="/user/resetpassword">Forgot your password?</Link>}
          {message && <div className="notice notice-error">{message}</div>}
          <button className="button button-full" disabled={busy}>{busy ? "Please wait…" : signup ? "Create your account" : "Sign in"} <i className="bi bi-arrow-right" /></button>
        </form>
        <p className="auth-switch">{signup ? "Already have an account?" : "New to Ticketify?"} <Link to={signup ? "/signin" : "/signup"}>{signup ? "Sign in" : "Create account"}</Link></p>
      </section>
    </main>
  );
}

function ForgotPasswordPage() {
  return <SimpleAuthForm title="Reset your password" endpoint="/auth/forgot-password" submitLabel="Send reset link" fields={[{ name: "email", label: "Email address", type: "email" }]} />;
}

function ResetPasswordPage() {
  const { token } = useParams();
  return <SimpleAuthForm title="Choose a new password" endpoint={`/auth/reset-password/${encodeURIComponent(token)}`} submitLabel="Save new password" fields={[{ name: "password", label: "New password", type: "password" }, { name: "confirmPassword", label: "Confirm new password", type: "password" }]} />;
}

function SimpleAuthForm({ title, endpoint, submitLabel, fields }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api(endpoint, { method: "POST", body: form });
      setSuccess(true);
      setMessage(result.message || "Request completed.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="narrow-page">
      <section className="surface-card auth-simple">
        <span className="eyebrow">ACCOUNT RECOVERY</span><h1>{title}</h1>
        <form className="form-stack" onSubmit={submit}>
          {fields.map((field) => <Field key={field.name} {...field} value={form[field.name] || ""} onChange={(value) => setForm({ ...form, [field.name]: value })} required />)}
          {message && <div className={`notice ${success ? "notice-success" : "notice-error"}`}>{message}</div>}
          {!success && <button className="button" disabled={busy}>{busy ? "Please wait…" : submitLabel}</button>}
        </form>
        {success && <button className="button button-outline" onClick={() => navigate("/signin")}>Back to sign in</button>}
      </section>
    </main>
  );
}

function UserDashboardPage() {
  const { data, loading, error } = useRequest("/dashboard/me");
  if (loading) return <PanelShell sections={userSections} title="Your dashboard"><Loading /></PanelShell>;
  if (error) return <PanelShell sections={userSections} title="Your dashboard"><ErrorMessage message={error} /></PanelShell>;
  const nextMatch = data.nextMatch?.match;
  return (
    <PanelShell sections={userSections} title={`Good to see you, ${data.user.firstname}`}>
      <div className="stats-grid">
        <StatCard label="Tickets booked" value={data.ticketCount} icon="bi-ticket-perforated" />
        <StatCard label="Total spent" value={`$${Number(data.spent).toFixed(2)}`} icon="bi-wallet2" />
        <StatCard label="Email status" value={data.user.verifiedEmail ? "Verified" : "Needs verification"} icon="bi-shield-check" />
      </div>
      <section className="surface-card panel-content-card">
        <div className="section-heading compact"><div><span className="eyebrow">YOUR NEXT DAY OUT</span><h2>Next match</h2></div><Link className="text-link" to="/panel/tickets">All tickets <i className="bi bi-arrow-right" /></Link></div>
        {nextMatch ? <MatchCard match={nextMatch} /> : <EmptyState title="No upcoming match booked" text="Find a fixture you love and make a day of it." action={<Link className="button" to="/">Explore matches</Link>} />}
      </section>
    </PanelShell>
  );
}

function UserTicketsPage() {
  const { data, loading, error } = useRequest("/users/me/tickets");
  const location = useLocation();
  const [notice, setNotice] = useState(location.state?.notice || "");
  return (
    <PanelShell sections={userSections} title="My tickets">
      {notice && <div className="notice notice-success">{notice}<button className="notice-close" onClick={() => setNotice("")}>×</button></div>}
      {loading ? <Loading /> : error ? <ErrorMessage message={error} /> : data?.length ? (
        <div className="ticket-list">{data.map((ticket) => <TicketCard key={ticket._id} ticket={ticket} />)}</div>
      ) : <EmptyState title="Your next match is waiting" text="You haven't booked any tickets yet." action={<Link className="button" to="/">Browse matches</Link>} />}
    </PanelShell>
  );
}

function TicketCard({ ticket }) {
  const match = ticket.match;
  const date = new Date(match.matchDate);
  return (
    <article className="ticket-card">
      <div className="ticket-card-main">
        <div className="ticket-team-row"><span>{match.homeTeam?.name}</span><b>VS</b><span>{match.awayTeam?.name}</span></div>
        <p>{match.fixture}</p>
      </div>
      <div className="ticket-card-detail"><span>DATE</span><strong>{Number.isNaN(date.valueOf()) ? "TBA" : date.toLocaleDateString()}</strong></div>
      <div className="ticket-card-detail"><span>STAND</span><strong>{ticket.stand}</strong></div>
      <div className="ticket-card-detail"><span>PRICE</span><strong>${Number(ticket.price).toFixed(2)}</strong></div>
    </article>
  );
}

function AccountPage() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState(() => ({
    firstname: user.firstname || "",
    lastname: user.lastname || "",
    gender: user.gender || "",
    idNumber: user.idNumber || "",
    passportNumber: user.passportNumber || "",
    birthdate: user.birthdate ? new Date(user.birthdate).toISOString().slice(0, 10) : "",
    country: user.country || "",
    province: user.province || "",
    city: user.city || "",
  }));
  const [email, setEmail] = useState(user.email || "");
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [code, setCode] = useState("");

  const saveProfile = async (event) => {
    event.preventDefault();
    setMessage(""); setSuccess("");
    try {
      const result = await api("/users/me", { method: "PATCH", body: profile });
      setUser(result.data);
      setSuccess("Your profile has been updated.");
    } catch (error) { setMessage(error.message); }
  };
  const saveEmail = async (event) => {
    event.preventDefault();
    setMessage(""); setSuccess("");
    try {
      const result = await api("/auth/email", { method: "PATCH", body: { email } });
      setUser(result.data);
      setSuccess("Email updated. Verify the new address to book tickets.");
    } catch (error) { setMessage(error.message); }
  };
  const changePassword = async (event) => {
    event.preventDefault();
    setMessage(""); setSuccess("");
    try {
      const result = await api("/auth/password", { method: "PATCH", body: password });
      setSuccess(result.message);
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) { setMessage(error.message); }
  };
  const sendCode = async () => {
    setMessage(""); setSuccess("");
    try {
      const result = await api("/auth/email/send-code", { method: "POST", body: {} });
      setSuccess(result.message);
    } catch (error) { setMessage(error.message); }
  };
  const verifyEmail = async (event) => {
    event.preventDefault();
    try {
      const result = await api("/auth/email/verify", { method: "POST", body: { code } });
      setSuccess(result.message);
      await refreshUserData(setUser);
    } catch (error) { setMessage(error.message); }
  };
  return (
    <PanelShell sections={userSections} title="Account settings">
      {message && <div className="notice notice-error">{message}</div>}
      {success && <div className="notice notice-success">{success}</div>}
      <div className="account-grid">
        <form className="surface-card form-stack" onSubmit={saveProfile}>
          <div className="form-card-heading"><span className="eyebrow">YOUR DETAILS</span><h2>Personal information</h2></div>
          <div className="form-row"><Field label="First name" value={profile.firstname} onChange={(value) => setProfile({ ...profile, firstname: value })} required /><Field label="Last name" value={profile.lastname} onChange={(value) => setProfile({ ...profile, lastname: value })} required /></div>
          <SelectField label="Gender" value={profile.gender} onChange={(value) => setProfile({ ...profile, gender: value })} options={[["", "Prefer not to say"], ["female", "Female"], ["male", "Male"], ["other", "Other"]]} />
          <div className="form-row"><Field label="ID number" value={profile.idNumber} onChange={(value) => setProfile({ ...profile, idNumber: value })} /><Field label="Passport number" value={profile.passportNumber} onChange={(value) => setProfile({ ...profile, passportNumber: value })} /></div>
          <Field label="Birth date" type="date" value={profile.birthdate} onChange={(value) => setProfile({ ...profile, birthdate: value })} />
          <div className="form-row"><Field label="Country" value={profile.country} onChange={(value) => setProfile({ ...profile, country: value })} /><Field label="Province / state" value={profile.province} onChange={(value) => setProfile({ ...profile, province: value })} /></div>
          <Field label="City" value={profile.city} onChange={(value) => setProfile({ ...profile, city: value })} />
          <button className="button">Save profile</button>
        </form>
        <div className="account-side">
          <form className="surface-card form-stack" onSubmit={saveEmail}>
            <div className="form-card-heading"><span className="eyebrow">CONTACT</span><h2>Email address</h2></div>
            <Field label="Email" type="email" value={email} onChange={setEmail} required />
            <p className={`verification-state ${user.verifiedEmail ? "is-verified" : ""}`}><i className={`bi ${user.verifiedEmail ? "bi-check-circle-fill" : "bi-exclamation-circle"}`} /> {user.verifiedEmail ? "Email verified" : "Email not verified"}</p>
            <button className="button button-outline">Update email</button>
          </form>
          {!user.verifiedEmail && <form className="surface-card form-stack" onSubmit={verifyEmail}>
            <div className="form-card-heading"><span className="eyebrow">VERIFY EMAIL</span><h2>Confirm your address</h2></div>
            <p className="muted">Request a confirmation code, then enter it here to enable ticket booking.</p>
            <button className="button button-outline" type="button" onClick={sendCode}>Send confirmation code</button>
            <Field label="Confirmation code" value={code} onChange={setCode} required />
            <button className="button">Verify email</button>
          </form>}
          <form className="surface-card form-stack" onSubmit={changePassword}>
            <div className="form-card-heading"><span className="eyebrow">SECURITY</span><h2>Change password</h2></div>
            <Field label="Current password" type="password" value={password.currentPassword} onChange={(value) => setPassword({ ...password, currentPassword: value })} required />
            <Field label="New password" type="password" value={password.newPassword} onChange={(value) => setPassword({ ...password, newPassword: value })} required />
            <Field label="Confirm password" type="password" value={password.confirmPassword} onChange={(value) => setPassword({ ...password, confirmPassword: value })} required />
            <button className="button button-outline">Update password</button>
          </form>
        </div>
      </div>
    </PanelShell>
  );
}

async function refreshUserData(setUser) {
  const result = await api("/auth/me");
  setUser(result.data);
}

function ContactPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: user ? `${user.firstname || ""} ${user.lastname || ""}`.trim() : "",
    email: user?.email || "",
    subject: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      ...current,
      name: current.name || `${user.firstname || ""} ${user.lastname || ""}`.trim(),
      email: current.email || user.email || "",
    }));
  }, [user]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setSuccess("");
    setError("");
    try {
      const result = await api("/contact", { method: "POST", body: form });
      setSuccess(result.message);
      setForm((current) => ({ ...current, subject: "", message: "" }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="narrow-page">
      <section className="surface-card contact-card">
        <span className="eyebrow">WE’RE HERE TO HELP</span><h1>Talk to the Ticketify team.</h1>
        <p>Questions about your account or an upcoming match? Send us a message and include your booking details if you have them.</p>
        <form className="form-stack contact-form" onSubmit={submit}>
          <div className="form-row">
            <Field label="Your name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required autoComplete="name" />
            <Field label="Email address" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required autoComplete="email" />
          </div>
          <Field label="Subject" value={form.subject} onChange={(value) => setForm({ ...form, subject: value })} required maxLength={120} />
          <Field label="How can we help?" value={form.message} onChange={(value) => setForm({ ...form, message: value })} required multiline maxLength={5000} />
          {error && <div className="notice notice-error">{error}</div>}
          {success && <div className="notice notice-success">{success}</div>}
          <button className="button" disabled={busy}>{busy ? "Sending…" : "Send message"} <i className="bi bi-arrow-right" /></button>
        </form>
      </section>
    </main>
  );
}

function AdminDashboardPage() {
  const { loading, data, error } = useRequest("/admin/dashboard");
  return (
    <PanelShell sections={adminSections} title="Admin overview" admin>
      {loading ? <Loading /> : error ? <ErrorMessage message={error} /> : (
        <>
          <div className="stats-grid">
            <StatCard label="Registered users" value={data.users} icon="bi-people" />
            <StatCard label="Upcoming fixtures" value={data.matches} icon="bi-calendar-event" />
            <StatCard label="Tickets sold" value={data.tickets} icon="bi-ticket-perforated" />
            <StatCard label="Competitions" value={data.competitions} icon="bi-trophy" />
            <StatCard label="Teams" value={data.teams} icon="bi-shield" />
            <StatCard label="Stadiums" value={data.stadiums} icon="bi-building" />
          </div>
          <section className="surface-card admin-welcome"><span className="eyebrow">MANAGE TICKETIFY</span><h2>Everything for match day, in one place.</h2><p>Manage fixtures, clubs, venues, competitions, users, and ticket activity from the admin navigation.</p></section>
        </>
      )}
    </PanelShell>
  );
}

const resourceConfig = {
  users: {
    title: "Users",
    endpoint: "/admin/users",
    fields: [
      { name: "firstname", label: "First name", required: true },
      { name: "lastname", label: "Last name", required: true },
      { name: "email", label: "Email address", readOnly: true },
      { name: "role", label: "Role", type: "select", options: [["user", "User"], ["admin", "Administrator"], ["stadiumAdmin", "Stadium administrator"], ["matchAdmin", "Match administrator"]] },
      { name: "gender", label: "Gender", type: "select", options: [["", "Prefer not to say"], ["female", "Female"], ["male", "Male"], ["other", "Other"]] },
      { name: "idNumber", label: "ID number" },
      { name: "passportNumber", label: "Passport number" },
      { name: "birthdate", label: "Birth date", type: "date" },
      { name: "country", label: "Country" },
      { name: "province", label: "Province / state" },
      { name: "city", label: "City" },
    ],
  },
  teams: {
    title: "Teams",
    endpoint: "/teams",
    fields: [
      { name: "name", label: "Team name", required: true },
      { name: "sport", label: "Sport", type: "select", options: sports },
      { name: "logo", label: "Team logo", type: "image", required: true },
      { name: "bgImage", label: "Team background image", type: "image", required: true },
    ],
  },
  stadiums: {
    title: "Stadiums",
    endpoint: "/stadiums",
    fields: [
      { name: "name", label: "Stadium name", required: true },
      { name: "sport", label: "Sport", type: "select", options: sports },
      { name: "image", label: "Stadium image", type: "image", required: true },
      { name: "country", label: "Country", required: true },
      { name: "province", label: "Province / state", required: true },
      { name: "city", label: "City", required: true },
      { name: "address", label: "Address", required: true },
      { name: "stands", label: "Stands (JSON)", type: "textarea", required: true },
    ],
  },
  competitions: {
    title: "Competitions",
    endpoint: "/competitions",
    fields: [
      { name: "name", label: "Competition name", required: true },
      { name: "logo", label: "Competition logo", type: "image", required: true },
    ],
  },
  matches: {
    title: "Matches",
    endpoint: "/admin/matches",
    fields: [
      { name: "homeTeam", label: "Home team", type: "team", required: true },
      { name: "awayTeam", label: "Away team", type: "team", required: true },
      { name: "stadium", label: "Stadium", type: "stadium", required: true },
      { name: "competition", label: "Competition", type: "competition", required: true },
      { name: "fixture", label: "Fixture details", required: true },
      { name: "visibleDate", label: "Visible from", type: "datetime-local", required: true },
      { name: "startBuyDate", label: "Ticket sales start", type: "datetime-local", required: true },
      { name: "endBuyDate", label: "Ticket sales end", type: "datetime-local", required: true },
      { name: "matchDate", label: "Match date", type: "datetime-local", required: true },
      { name: "cover", label: "Match cover image", type: "image" },
      { name: "isDisabled", label: "Disabled", type: "checkbox" },
    ],
  },
};

function AdminResourcePage() {
  const { resource, id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const config = resourceConfig[resource];
  const isNew = location.pathname.endsWith("/new");
  const isEdit = Boolean(id);
  const endpoint = resource === "users"
    ? isEdit ? `/admin/users/${id}` : "/admin/users"
    : resource === "tickets" ? "/admin/tickets" : config?.endpoint;
  const { loading, data, error, reload } = useRequest(
    endpoint ? `${endpoint}?limit=100` : "/admin/users",
    [endpoint, resource, id]
  );
  const [form, setForm] = useState({});
  const [related, setRelated] = useState({ teams: [], stadiums: [], competitions: [] });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew && !isEdit) return;
    if (resource !== "matches") return;
    Promise.all([api("/teams?limit=100"), api("/stadiums?limit=100"), api("/competitions?limit=100")])
      .then(([teams, stadiums, competitions]) => setRelated({
        teams: teams.data,
        stadiums: stadiums.data,
        competitions: competitions.data,
      }))
      .catch((requestError) => setFormError(requestError.message));
  }, [resource, isNew, isEdit]);

  useEffect(() => {
    if (isNew && config) {
      setForm({
        ...(resource === "teams" || resource === "stadiums" ? { sport: sports[0] } : {}),
        ...(resource === "stadiums" ? { stands: "[]" } : {}),
        ...(resource === "matches" ? { isDisabled: false } : {}),
      });
      return;
    }
    if (!isEdit || !data) return;
    const item = resource === "users" ? data : data.find((entry) => entry._id === id);
    if (item) setForm(toFormValues(resource, item));
  }, [data, id, isEdit, isNew, resource]);

  if (!config && resource !== "tickets") {
    return <PanelShell sections={adminSections} title="Page not found" admin><EmptyState title="Unknown admin section" text="Choose a section from the navigation." /></PanelShell>;
  }
  if (resource === "users" && isNew) return <Navigate to="/adminpanel/users" replace />;
  if (isEdit && loading) return <PanelShell sections={adminSections} title="Edit user" admin><Loading /></PanelShell>;
  if (isEdit && error) return <PanelShell sections={adminSections} title="Edit user" admin><ErrorMessage message={error} /></PanelShell>;
  const isListing = !isNew && !isEdit;
  const heading = isListing ? (config?.title || capitalize(resource)) : `${isNew ? "Add" : "Edit"} ${config.title.toLowerCase()}`;

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (resource === "matches") {
        const missingRelations = config.fields
          .filter((field) => ["team", "stadium", "competition"].includes(field.type))
          .filter((field) => !/^[0-9a-f]{24}$/i.test(String(form[field.name] || "")));
        if (missingRelations.length) {
          throw new Error(
            `${missingRelations.map((field) => field.label).join(", ")} must match an existing record. Type to search, or add the missing record below.`
          );
        }
      }
      const body = toRequestValues(resource, form);
      for (const field of config.fields.filter((item) => item.type === "image" && form[item.name] instanceof File)) {
        const upload = new FormData();
        upload.append("image", form[field.name]);
        const result = await api("/admin/uploads", { method: "POST", body: upload });
        body[field.name] = result.data.url;
      }
      const response = await api(
        resource === "users" ? `/admin/users/${id}` : isEdit ? `/${resource}/${id}` : `/${resource}`,
        { method: isEdit ? "PATCH" : "POST", body }
      );
      navigate(`/adminpanel/${resource}`);
      if (!response) reload();
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete this ${resource.slice(0, -1)}? This cannot be undone.`)) return;
    try {
      await api(`/${resource}/${item._id}`, { method: "DELETE" });
      reload();
    } catch (requestError) {
      setFormError(requestError.message);
    }
  };

  return (
    <PanelShell sections={adminSections} title={heading} admin>
      {isListing ? (
        <>
          {error && <ErrorMessage message={error} />}
          {resourceConfig[resource] && resource !== "users" && <div className="list-toolbar"><p>Manage your {resource} catalog.</p><Link className="button" to={`/adminpanel/${resource}/new`}><i className="bi bi-plus-lg" /> Add {resource.slice(0, -1)}</Link></div>}
          {formError && <div className="notice notice-error">{formError}</div>}
          {loading ? <Loading /> : <AdminTable resource={resource} rows={Array.isArray(data) ? data : data?.data || []} onDelete={remove} />}
        </>
      ) : (
        <section className="surface-card admin-form-card">
          <div className="form-card-heading"><span className="eyebrow">CATALOG MANAGEMENT</span><h2>{heading}</h2><p>Fields marked with * are required.</p></div>
          {resource === "matches" && (
            <div className="match-prerequisites">
              <p>Type in each field to search existing records. A match needs two teams, a stadium, and a competition already added to your catalog.</p>
              <div>
                {[
                  ["teams", "Teams", related.teams.length],
                  ["stadiums", "Stadiums", related.stadiums.length],
                  ["competitions", "Competitions", related.competitions.length],
                ].map(([path, label, count]) => (
                  <span className={count ? "prerequisite-ready" : "prerequisite-empty"} key={path}>
                    <i className={`bi ${count ? "bi-check-circle-fill" : "bi-exclamation-circle"}`} />
                    {count} {label}
                    {!count && <Link to={`/adminpanel/${path}/new`}>Add</Link>}
                  </span>
                ))}
              </div>
            </div>
          )}
          <form className="form-stack" onSubmit={save}>
            {config.fields.map((field) => <AdminField key={field.name} field={field} value={form[field.name]} onChange={(value) => setForm({ ...form, [field.name]: value })} related={related} />)}
            {formError && <div className="notice notice-error">{formError}</div>}
            <div className="form-actions"><button type="button" className="button button-outline" onClick={() => navigate(`/adminpanel/${resource}`)}>Cancel</button><button className="button" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save changes" : "Create"} <i className="bi bi-arrow-right" /></button></div>
          </form>
        </section>
      )}
    </PanelShell>
  );
}

function AdminTable({ resource, rows, onDelete }) {
  if (!rows.length) return <EmptyState title={`No ${resource} yet`} text="Add your first item to get started." />;
  if (resource === "users") return (
    <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Email status</th><th>Actions</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row._id}><td>{row.firstname} {row.lastname}</td><td>{row.email}</td><td><span className="status-pill">{row.role}</span></td><td>{formatDate(row.joindate)}</td><td>{row.verifiedEmail ? "Verified" : "Not verified"}</td><td><Link className="text-link" to={`/adminpanel/users/${row._id}/edit`}>Edit</Link></td></tr>)}
    </tbody></table></div>
  );
  if (resource === "tickets") return (
    <div className="table-wrap"><table><thead><tr><th>Match</th><th>Customer</th><th>Stand</th><th>Price</th><th>Purchased</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row._id}><td>{row.match ? `${row.match.homeTeam?.name} vs ${row.match.awayTeam?.name}` : "Match unavailable"}</td><td>{row.user ? `${row.user.firstname} ${row.user.lastname}` : "Unknown"}</td><td>{row.stand}</td><td>${Number(row.price).toFixed(2)}</td><td>{formatDate(row.purchaseDate)}</td></tr>)}
    </tbody></table></div>
  );
  const labels = resource === "matches" ? ["Fixture", "Sport", "Venue", "Match date"] : resource === "stadiums" ? ["Name", "Sport", "Location", "Capacity"] : resource === "competitions" ? ["Name", "Logo"] : ["Name", "Sport", "Logo"];
  return (
    <div className="catalog-grid">
      {rows.map((row) => {
        const title = resource === "matches" ? `${row.homeTeam?.name} vs ${row.awayTeam?.name}` : row.name;
        const subtitle = resource === "matches"
          ? `${row.fixture} · ${row.stadium?.name || "Venue not set"} · ${formatDate(row.matchDate)}`
          : resource === "stadiums"
            ? `${capitalize(row.sport)} · ${row.city}, ${row.country} · ${row.capacity} seats`
            : resource === "competitions" ? "Competition" : capitalize(row.sport);
        const image = resource === "matches" ? row.cover : resource === "stadiums" ? row.image : resource === "competitions" ? row.logo : row.logo;
        return (
          <article className="catalog-card" key={row._id}>
            {image ? <img src={imageUrl(image, resource === "matches" ? "matches" : resource === "teams" ? "teams" : resource === "stadiums" ? "stadiums" : "competitions")} alt="" /> : <div className="catalog-image-placeholder"><i className="bi bi-trophy" /></div>}
            <div className="catalog-card-body"><span className="eyebrow">{resource === "matches" ? capitalize(row.sport) : resourceConfig[resource]?.title}</span><h3>{title}</h3><p>{subtitle}</p>
              <div className="catalog-actions">{resourceConfig[resource] && <Link to={`/adminpanel/${resource}/${row._id}/edit`}>Edit <i className="bi bi-arrow-up-right" /></Link>}<button onClick={() => onDelete(row)}>Delete</button></div>
              <small>ID: {row._id}</small>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AdminField({ field, value, onChange, related }) {
  if (field.type === "team" || field.type === "stadium" || field.type === "competition") {
    const options = field.type === "team" ? related.teams : field.type === "stadium" ? related.stadiums : related.competitions;
    return <SearchableEntityField field={field} value={value || ""} onChange={onChange} options={options} />;
  }
  if (field.type === "select") {
    const options = field.options.map((item) => Array.isArray(item) ? item : [item, capitalize(item)]);
    return <SelectField label={field.label} value={value || ""} onChange={onChange} required={field.required} options={options} />;
  }
  if (field.type === "image") {
    return <ImageUploadField field={field} value={value} onChange={onChange} />;
  }
  if (field.type === "checkbox") return <label className="checkbox-field"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span>{field.label}</span></label>;
  return <Field label={field.label} type={field.type || "text"} value={value ?? ""} onChange={onChange} required={field.required} readOnly={field.readOnly} multiline={field.type === "textarea"} hint={field.name === "stands" ? 'Example: [{"id":"A1","location":"west","floor":"1","capacity":100,"price":25,"availablity":true}]' : ""} />;
}

function ImageUploadField({ field, value, onChange }) {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (value instanceof File) {
      const objectUrl = URL.createObjectURL(value);
      setPreview(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    setPreview(value ? imageUrl(value) : "");
  }, [value]);

  return (
    <label className="field image-upload-field">
      <span>{field.label}{field.required && <b> *</b>}</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        required={field.required && !value}
        onChange={(event) => onChange(event.target.files?.[0] || value || "")}
      />
      <small className="field-hint">PNG, JPEG, WebP, or GIF · up to 5 MB. Images are stored with your MongoDB Atlas data.</small>
      {preview && <img className="image-upload-preview" src={preview} alt={`${field.label} preview`} />}
    </label>
  );
}

function SearchableEntityField({ field, value, onChange, options }) {
  const listId = `options-${field.name}`;
  const selected = options.find((item) => item._id === value);
  const [query, setQuery] = useState(selected?.name || "");

  useEffect(() => {
    setQuery(selected?.name || "");
  }, [selected?.name, value]);

  const addPath = field.type === "team" ? "teams" : field.type === "stadium" ? "stadiums" : "competitions";

  return (
    <label className="field">
      <span>{field.label}{field.required && <b> *</b>}</span>
      <input
        type="search"
        list={listId}
        value={query}
        required={field.required}
        autoComplete="off"
        placeholder={options.length ? `Type to search ${field.label.toLowerCase()}` : `No ${addPath} added yet`}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          const match = options.find((item) => item.name.toLowerCase() === nextQuery.trim().toLowerCase());
          onChange(match?._id || "");
        }}
      />
      <datalist id={listId}>
        {options.map((item) => <option key={item._id} value={item.name} />)}
      </datalist>
      <small className="field-hint">
        {options.length ? "Can't find it?" : `No ${addPath} available yet.`}{" "}
        <Link className="text-link" to={`/adminpanel/${addPath}/new`}>Create {field.type}</Link>
      </small>
    </label>
  );
}

function toFormValues(resource, item) {
  const values = { ...item };
  if (resource === "users" && item.birthdate) {
    const birthdate = new Date(item.birthdate);
    values.birthdate = Number.isNaN(birthdate.valueOf()) ? "" : birthdate.toISOString().slice(0, 10);
  }
  if (resource === "matches") {
    values.homeTeam = item.homeTeam?.id?._id || item.homeTeam?.id || "";
    values.awayTeam = item.awayTeam?.id?._id || item.awayTeam?.id || "";
    values.stadium = item.stadium?._id || item.stadium || "";
    values.competition = item.competition?._id || item.competition || "";
    const competitionPrefix = item.competition?.name ? `${item.competition.name} - ` : "";
    values.fixture = competitionPrefix && item.fixture?.startsWith(competitionPrefix)
      ? item.fixture.slice(competitionPrefix.length)
      : item.fixture || "";
    ["visibleDate", "startBuyDate", "endBuyDate", "matchDate"].forEach((key) => { values[key] = toLocalDateTime(item[key]); });
  }
  if (resource === "stadiums") values.stands = JSON.stringify(item.stands || [], null, 2);
  return values;
}

function toRequestValues(resource, values) {
  const body = { ...values };
  if (resource === "matches") {
    ["visibleDate", "startBuyDate", "endBuyDate", "matchDate"].forEach((key) => {
      if (body[key]) body[key] = new Date(body[key]).toISOString();
    });
    body.isDisabled = Boolean(body.isDisabled);
  }
  if (resource === "stadiums" && typeof body.stands === "string") {
    body.stands = JSON.parse(body.stands);
  }
  return body;
}

function MessagesPage() {
  const { data, loading, error, reload } = useRequest("/admin/messages?limit=100");
  const [updating, setUpdating] = useState("");
  const [updateError, setUpdateError] = useState("");
  const messages = Array.isArray(data) ? data : data?.data || [];

  const updateStatus = async (id, status) => {
    setUpdating(id);
    setUpdateError("");
    try {
      await api(`/admin/messages/${id}`, { method: "PATCH", body: { status } });
      await reload();
    } catch (requestError) {
      setUpdateError(requestError.message);
    } finally {
      setUpdating("");
    }
  };

  return (
    <PanelShell sections={adminSections} title="Messages" admin>
      {updateError && <ErrorMessage message={updateError} />}
      {loading ? <Loading /> : error ? <ErrorMessage message={error} /> : messages.length ? (
        <div className="message-list">
          {messages.map((item) => (
            <article className="surface-card message-card" key={item._id}>
              <div className="message-card-heading">
                <div><span className="eyebrow">{formatDate(item.submittedAt)}</span><h2>{item.subject}</h2></div>
                <label className="field message-status-field">
                  <span>Status</span>
                  <select value={item.status} disabled={updating === item._id} onChange={(event) => updateStatus(item._id, event.target.value)}>
                    <option value="new">New</option><option value="read">Read</option><option value="resolved">Resolved</option>
                  </select>
                </label>
              </div>
              <p className="message-body">{item.message}</p>
              <div className="message-sender"><strong>{item.name}</strong><a className="text-link" href={`mailto:${encodeURIComponent(item.email)}`}>{item.email}</a></div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="Your inbox is clear" text="Customer contact messages will appear here." />}
    </PanelShell>
  );
}

function PanelShell({ sections, title, admin = false, children }) {
  const location = useLocation();
  return (
    <main className="panel-layout">
      <aside className="panel-sidebar">
        <div className="panel-user">
          <span className="panel-avatar"><i className={`bi ${admin ? "bi-grid-1x2" : "bi-person"}`} /></span>
          <span><small>{admin ? "TICKETIFY ADMIN" : "YOUR ACCOUNT"}</small><strong>{title}</strong></span>
        </div>
        <nav>{sections.map(([label, path]) => <Link className={location.pathname === path ? "active" : ""} key={path} to={path}><i className={`bi ${navIcon(label)}`} />{label}<i className="bi bi-chevron-right nav-chevron" /></Link>)}</nav>
        <Link className="back-to-site" to="/"><i className="bi bi-arrow-left" /> Back to Ticketify</Link>
      </aside>
      <section className="panel-content">
        <div className="panel-heading"><div><span className="eyebrow">{admin ? "ADMINISTRATION" : "ACCOUNT CENTER"}</span><h1>{title}</h1></div></div>
        {children}
      </section>
    </main>
  );
}

function Field({ label, type = "text", value, onChange, required, autoComplete, multiline = false, hint, maxLength, readOnly }) {
  return (
    <label className="field">
      <span>{label}{required && <b> *</b>}</span>
      {multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} required={required} rows={7} maxLength={maxLength} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} autoComplete={autoComplete} maxLength={maxLength} readOnly={readOnly} />}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

function SelectField({ label, value, onChange, options, required }) {
  return <label className="field"><span>{label}{required && <b> *</b>}</span><select required={required} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</select></label>;
}

function StatCard({ label, value, icon }) {
  return <article className="stat-card"><span className="stat-icon"><i className={`bi ${icon}`} /></span><span className="stat-label">{label}</span><strong>{value}</strong></article>;
}

function EmptyState({ title, text, action }) {
  return <div className="empty-state"><span className="empty-icon"><i className="bi bi-ticket-perforated" /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function Loading() {
  return <div className="loading-state"><span className="spinner" /> Loading Ticketify…</div>;
}

function ErrorMessage({ message }) {
  return <div className="notice notice-error"><i className="bi bi-exclamation-circle" /> {message}</div>;
}

function AccessDenied() {
  return <main className="narrow-page"><EmptyState title="Administrator access required" text="This area is only available to administrator accounts." action={<Link className="button" to="/">Return home</Link>} /></main>;
}

function LegacyRedirect() {
  const location = useLocation();
  const legacyPages = {
    "index.html": "/",
    "signin.html": "/signin",
    "signup.html": "/signup",
    "reset_password.html": "/user/resetpassword",
    "change_password.html": "/user/resetpassword",
    "panel_dashboard.html": "/panel/dashboard",
    "panel_tickets.html": "/panel/tickets",
    "panel_account.html": "/panel/account",
    "panel_contactus.html": "/panel/contactus",
    "adminpanel_dashboard.html": "/adminpanel/dashboard",
    "adminpanel_users.html": "/adminpanel/users",
    "adminpanel_matches.html": "/adminpanel/matches",
    "adminpanel_teams.html": "/adminpanel/teams",
    "adminpanel_stadiums.html": "/adminpanel/stadiums",
    "adminpanel_competitions.html": "/adminpanel/competitions",
    "adminpanel_tickets.html": "/adminpanel/tickets",
    "adminpanel_messages.html": "/adminpanel/messages",
    "adminpanel_c_user.html": "/adminpanel/users",
    "adminpanel_c_match.html": "/adminpanel/matches/new",
    "adminpanel_c_team.html": "/adminpanel/teams/new",
    "adminpanel_c_stadium.html": "/adminpanel/stadiums/new",
    "adminpanel_c_competition.html": "/adminpanel/competitions/new",
    "adminpanel_e_match.html": "/adminpanel/matches",
    "adminpanel_e_team.html": "/adminpanel/teams",
    "adminpanel_e_stadium.html": "/adminpanel/stadiums",
    "adminpanel_e_competition.html": "/adminpanel/competitions",
    "404.html": "/not-found",
    "error.html": "/not-found",
  };
  const file = location.pathname.split("/").pop();
  const direct = legacyPages[file];
  if (direct) return <Navigate to={`${direct}${location.search}`} replace />;
  const oldEdit = location.pathname.match(
    /^\/(?:user\/)?adminpanel\/update\/(matches|teams|stadiums|competitions)\/([^/]+)$/
  );
  if (oldEdit) {
    return <Navigate to={`/adminpanel/${oldEdit[1]}/${oldEdit[2]}/edit`} replace />;
  }
  const oldMatch = location.pathname.match(/^\/match\/([^/]+)$/);
  if (oldMatch) return <Navigate to={`/matches/${oldMatch[1]}`} replace />;
  const oldUserPath = location.pathname.replace(/^\/user(?=\/)/, "");
  if (oldUserPath !== location.pathname) {
    if (oldUserPath.startsWith("/adminpanel")) return <Navigate to={oldUserPath} replace />;
    if (oldUserPath.startsWith("/panel")) return <Navigate to={oldUserPath} replace />;
    if (oldUserPath === "/signin" || oldUserPath === "/signup") return <Navigate to={oldUserPath} replace />;
  }
  return <main className="narrow-page"><EmptyState title="Page not found" text="The page you are looking for may have moved." action={<Link className="button" to="/">Back to home</Link>} /></main>;
}

function navIcon(label) {
  const icons = {
    Dashboard: "bi-grid-1x2",
    Overview: "bi-grid-1x2",
    Users: "bi-people",
    Matches: "bi-calendar-event",
    Teams: "bi-shield",
    Stadiums: "bi-building",
    Competitions: "bi-trophy",
    Tickets: "bi-ticket-perforated",
    "My tickets": "bi-ticket-perforated",
    Account: "bi-person",
    Contact: "bi-chat-dots",
    Messages: "bi-envelope",
  };
  return icons[label] || "bi-circle";
}

function imageUrl(value, folder = "") {
  if (!value) return "";
  if (/^(https?:|data:|\/)/i.test(value)) return value;
  return `/images/${folder ? `${folder}/` : ""}${encodeURIComponent(value)}`;
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString();
}

function capitalize(value = "") {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

export default App;

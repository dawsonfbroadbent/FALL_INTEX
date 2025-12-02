// Dawson Broadbent, Ashlynn Burgess, Markus Walker
// index.js - Express routing + auth (Manager vs Common) + EJS + Knex (PostgreSQL)

require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");

// Optional hardening (extra mile) — install first if you use them
// const helmet = require("helmet");
// const csrf = require("csurf");
// const flash = require("connect-flash");

const knex = require("knex")({
  client: "pg",
  connection: process.env.DATABASE_URL || {
    host: process.env.PGHOST || process.env.RDS_HOST || "localhost",
    user: process.env.PGUSER || process.env.RDS_USER || "postgres",
    password: process.env.PGPASSWORD || process.env.RDS_PASSWORD || "admin",
    database: process.env.PGDATABASE || process.env.RDS_NAME || "is403",
    port: Number(process.env.PGPORT || process.env.RDS_PORT || 5432),
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  },
});

const app = express();
const port = process.env.PORT || 5000;
const host = "0.0.0.0";

// ---- Express / EJS setup ----
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// app.use(helmet()); // optional

// ---- Sessions ----
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, //process.env.NODE_ENV === "production", // true when HTTPS in production
      maxAge: 1000 * 60 * 60 * 6, // 6 hours
    },
  })
);

// app.use(flash()); // optional

// Make session available in all EJS views automatically
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// ---- Helpers ----
function isManager(level) {
  // Accept a few common representations:
  // "manager", "Manager", 1, "1", "M"
  if (level === undefined || level === null) return false;
  const v = String(level).trim().toLowerCase();
  return v === "manager" || v === "m" || v === "1";
}

function requireAuth(req, res, next) {
  if (req.session?.isLoggedIn) return next();
  return res.redirect("/login");
}

function requireManager(req, res, next) {
  if (req.session?.isLoggedIn && isManager(req.session.level)) return next();
  return res.status(403).send("Forbidden: Manager access only.");
}

// ---- Public Landing Page (AUTO roots to index.ejs) ----
app.get("/", async (req, res) => {
  // Public landing page for donors/supporters.
  // If logged in, we also show lightweight dashboard counts.
  try {
    let counts = null;

    if (req.session?.isLoggedIn) {
      const [
        participantsCount,
        eventsCount,
        surveysCount,
        milestonesCount,
        donationsCount,
      ] = await Promise.all([
        knex("participants").count("* as count").first(),
        knex("events").count("* as count").first(),
        knex("surveys").count("* as count").first(),
        knex("milestones").count("* as count").first(),
        knex("donations").count("* as count").first(),
      ]);

      counts = {
        participants: Number(participantsCount?.count || 0),
        events: Number(eventsCount?.count || 0),
        surveys: Number(surveysCount?.count || 0),
        milestones: Number(milestonesCount?.count || 0),
        donations: Number(donationsCount?.count || 0),
      };
    }

    res.render("index", {
      counts, // your index.ejs can optionally display these
      error_message: "",
    });
  } catch (err) {
    // Still render landing page even if DB tables aren’t ready yet
    res.render("index", {
      counts: null,
      error_message: `Database error on landing page: ${err.message}`,
    });
  }
});

// Optional: separate internal dashboard route (if you want it)
app.get("/dashboard", requireAuth, async (req, res) => {
  // Reuse index.ejs if you want, or create dashboard.ejs later
  return res.redirect("/");
});

// ---- Login / Logout ----
app.get("/login", (req, res) => {
  res.render("login", { error_message: "" });
});

app.post("/login", async (req, res) => {
  const username = (req.body.username || "").trim();
  const password = (req.body.password || "").trim();

  try {
    const user = await knex("users")
      .select("id", "username", "password", "level")
      .where({ username })
      .first();

    if (!user) {
      return res.render("login", { error_message: "Invalid login" });
    }

    // NOTE: For extra credit, replace with bcrypt compare against hashed password
    // const bcrypt = require("bcrypt");
    // const ok = await bcrypt.compare(password, user.password);
    const ok = password === user.password;

    if (!ok) {
      return res.render("login", { error_message: "Invalid login" });
    }

    req.session.isLoggedIn = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.level = user.level;

    return res.redirect("/"); // goes to landing page, now “logged-in”
  } catch (err) {
    return res.render("login", { error_message: `Login error: ${err.message}` });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Redirect to Givebutter donation page
app.get("/donate", (req, res) => {
  res.redirect(302, "https://givebutter.com/EllaRises");
});

app.get("/about", (req, res) => {
  res.render("about", { error_message: "" });
});

// ---- Public Donations Page (accessible to ANY visitor) ----
app.get("/donations", async (req, res) => {
  // Public-facing donation page.
  // If logged in, we can also show donation records.
  try {
    let donations = [];
    if (req.session?.isLoggedIn) {
      donations = await knex("donations").select("*").orderBy("donation_date", "desc");
    }
    res.render("donations", {
      donations,
      isPublic: !req.session?.isLoggedIn,
      canEdit: req.session?.isLoggedIn && isManager(req.session.level),
      error_message: "",
    });
  } catch (err) {
    res.render("donations", {
      donations: [],
      isPublic: !req.session?.isLoggedIn,
      canEdit: req.session?.isLoggedIn && isManager(req.session.level),
      error_message: err.message,
    });
  }
});

//Get contact route
app.get("/contact", (req, res) => {
  res.render("contact", { error_message: "" })
});

// Public donation submit (for donors/supporters). Adjust fields to match your DB columns.
app.post("/donations/public", async (req, res) => {
  // Example expected body fields (rename to match your table):
  // donor_name, donor_email, amount, donation_date
  try {
    const newDonation = {
      donor_name: req.body.donor_name || null,
      donor_email: req.body.donor_email || null,
      amount: req.body.amount ? Number(req.body.amount) : null,
      donation_date: req.body.donation_date || new Date(),
      created_at: new Date(),
    };

    await knex("donations").insert(newDonation);
    return res.redirect("/donations");
  } catch (err) {
    // Render the same donations view with error
    return res.render("donations", {
      donations: [],
      isPublic: true,
      canEdit: false,
      error_message: `Could not submit donation: ${err.message}`,
    });
  }
});

// Manager-only donation maintenance (example delete)
app.post("/donations/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("donations").where({ id: req.params.id }).del();
    res.redirect("/donations");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ---- Authenticated Pages (Common can view, Manager can maintain) ----
app.get("/participants", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  try {
    let query = knex("participants").select("*").orderBy("id", "asc");

    // Simple search (adjust columns to whatever you actually have)
    if (q) {
      query = query.where((b) => {
        b.whereILike("first_name", `%${q}%`)
          .orWhereILike("last_name", `%${q}%`)
          .orWhereILike("email", `%${q}%`);
      });
    }

    const participants = await query;

    res.render("participants", {
      participants,
      q,
      canEdit: isManager(req.session.level),
      error_message: "",
    });
  } catch (err) {
    res.render("participants", {
      participants: [],
      q,
      canEdit: isManager(req.session.level),
      error_message: err.message,
    });
  }
});

app.post("/participants/add", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("participants").insert(req.body); // best practice: whitelist fields
    res.redirect("/participants");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/participants/:id/edit", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("participants").where({ id: req.params.id }).update(req.body);
    res.redirect("/participants");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/participants/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("participants").where({ id: req.params.id }).del();
    res.redirect("/participants");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/events", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  try {
    let query = knex("events").select("*").orderBy("event_date", "desc");
    if (q) {
      query = query.where((b) => {
        b.whereILike("event_name", `%${q}%`).orWhereILike("location", `%${q}%`);
      });
    }
    const events = await query;

    res.render("events", {
      events,
      q,
      canEdit: isManager(req.session.level),
      error_message: "",
    });
  } catch (err) {
    res.render("events", {
      events: [],
      q,
      canEdit: isManager(req.session.level),
      error_message: err.message,
    });
  }
});

app.post("/events/add", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("events").insert(req.body);
    res.redirect("/events");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/events/:id/edit", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("events").where({ id: req.params.id }).update(req.body);
    res.redirect("/events");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/events/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("events").where({ id: req.params.id }).del();
    res.redirect("/events");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/surveys", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  try {
    let query = knex("surveys").select("*").orderBy("created_at", "desc");
    if (q) {
      query = query.where((b) => {
        b.whereILike("title", `%${q}%`).orWhereILike("participant_email", `%${q}%`);
      });
    }
    const surveys = await query;

    res.render("surveys", {
      surveys,
      q,
      canEdit: isManager(req.session.level),
      error_message: "",
    });
  } catch (err) {
    res.render("surveys", {
      surveys: [],
      q,
      canEdit: isManager(req.session.level),
      error_message: err.message,
    });
  }
});

app.post("/surveys/add", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("surveys").insert(req.body);
    res.redirect("/surveys");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/surveys/:id/edit", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("surveys").where({ id: req.params.id }).update(req.body);
    res.redirect("/surveys");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/surveys/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("surveys").where({ id: req.params.id }).del();
    res.redirect("/surveys");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Milestones (1-to-many with participants)
app.get("/milestones", requireAuth, async (req, res) => {
  const participantId = req.query.participant_id; // optional filter
  try {
    let query = knex("milestones").select("*").orderBy("milestone_date", "desc");
    if (participantId) query = query.where({ participant_id: participantId });

    const milestones = await query;

    res.render("milestones", {
      milestones,
      participant_id: participantId || "",
      canEdit: isManager(req.session.level),
      error_message: "",
    });
  } catch (err) {
    res.render("milestones", {
      milestones: [],
      participant_id: participantId || "",
      canEdit: isManager(req.session.level),
      error_message: err.message,
    });
  }
});

app.post("/milestones/add", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("milestones").insert(req.body);
    res.redirect("/milestones");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/milestones/:id/edit", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("milestones").where({ id: req.params.id }).update(req.body);
    res.redirect("/milestones");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/milestones/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("milestones").where({ id: req.params.id }).del();
    res.redirect("/milestones");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ---- Manager-only User Maintenance ----
app.get("/users", requireAuth, requireManager, async (req, res) => {
  const q = (req.query.q || "").trim();
  try {
    let query = knex("users").select("id", "username", "level").orderBy("username", "asc");
    if (q) {
      query = query.whereILike("username", `%${q}%`);
    }
    const users = await query;

    res.render("maintainUsers", { users, q, error_message: "" });
  } catch (err) {
    res.render("maintainUsers", { users: [], q, error_message: err.message });
  }
});

app.post("/users/add", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("users").insert(req.body); // best practice: whitelist fields
    res.redirect("/users");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/users/:id/edit", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("users").where({ id: req.params.id }).update(req.body);
    res.redirect("/users");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/users/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("users").where({ id: req.params.id }).del();
    res.redirect("/users");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ---- HTTP 418 route (rubric) ----
app.get("/teapot", (req, res) => {
  res.status(418).send("I’m a teapot. ☕");
});

// ---- 404 ----
app.use((req, res) => {
  res.status(404).send("404 - Not Found");
});

// ---- Start server ----
app.listen(port, host, () => {
  console.log(`Server running on http://${host}:${port}`);
});
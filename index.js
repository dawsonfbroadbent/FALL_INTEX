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
    host: process.env.PGHOST || process.env.RDS_HOSTNAME || "localhost",
    user: process.env.PGUSER || process.env.RDS_USERNAME || "postgres",
    password: process.env.PGPASSWORD || process.env.RDS_PASSWORD || "admin",
    database: process.env.PGDATABASE || process.env.RDS_DB_NAME || "is403",
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

// ---- Sessions ----
app.use(
    session({
      secret: process.env.SESSION_SECRET || 'fallback-secret-key',
      resave: false,
      saveUninitialized: false,
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
  return String(level).trim() === "M";
}

function requireAuth(req, res, next) {
  if (req.session?.isLoggedIn) return next();
  return res.redirect("/login");
}

function requireManager(req, res, next) {
  if (req.session?.isLoggedIn && isManager(req.session.level)) return next();
  return res.status(403).send("Forbidden: Manager access only.");
}

// Root route that directs the user to the index.ejs page
app.get("/", async (req, res) => {
  res.render("index", { error_message: "" });
});

// Optional: separate internal dashboard route (if you want it)
app.get("/dashboard", requireAuth, async (req, res) => {
  // Reuse index.ejs if you want, or create dashboard.ejs later
  return res.redirect("/");
});

// Login page route
app.get("/login", (req, res) => {
  res.render("login", { error_message: "" });
});

// Login route that evalues input username and password against credentials stored in database
app.post("/login", async (req, res) => {
  const username = req.body.username.trim();
  const password = req.body.password.trim();

  try {
    // Search for the user in the database by username, and check to make sure a user was returned
    const user = await knex("users")
      .select("id", "username", "password", "level")
      .where({ username })
      .first();

    if (!user) {
      return res.render("login", { error_message: "Invalid login" });
    }

    // Check if password matches password in database associated with the user
    const ok = password === user.password;
    if (!ok) {
      return res.render("login", { error_message: "Invalid login" });
    }

    // Set session variables according to user information
    req.session.isLoggedIn = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.level = user.level;

    // Go to landing page, now logged in
    return res.redirect("/");
  } catch (err) {
    return res.render("login", { error_message: `Login error: ${err.message}` });
  }
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Donation page route
app.get("/donate", (req, res) => {
  res.redirect(302, "https://givebutter.com/EllaRises"); // Build new page and redirect to it rather than use external page
});

// About page route
app.get("/about", (req, res) => {
  res.render("about", { error_message: "" });
});

// ---- Public Donations Page (accessible to ANY visitor) ----
app.get("/donations", async (req, res) => {
  try {
    // Create donations array and fill with donation info from database if user is logged in
    let donations = [];
    let all = [];
    if (req.session.isLoggedIn) {
      all = await knex("donations").orderBy("donationdate", "desc");
    }

    // Create donation object and push to donations array
    for (let iCount = 0; iCount < all.length; iCount++) {
      let donationDate = all[iCount].donationdate;
      let formattedDate = new Date(donationDate).toLocaleDateString("en-US", {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
      });
      let donationAmount = all[iCount].donationamount;
      let donor = await knex("participant").select("participantfirstname", "participantlastname").where({"participantid": all[iCount].participantid}).first();
      let donorFullName = donor.participantfirstname + " " + donor.participantlastname;
      donations.push({
        date: formattedDate,
        amount: donationAmount,
        donor: donorFullName
      });
    };

    // Render donations page with permissions based on user logged in status and level
    res.render("donations", {
      donations,
      isPublic: !req.session?.isLoggedIn,
      canEdit: req.session?.isLoggedIn && isManager(req.session.level),
      error_message: "",
    });
  } catch (err) {
    // If error is caught, render donations page with error message
    res.render("donations", {
      donations: [],
      isPublic: !req.session?.isLoggedIn,
      canEdit: req.session?.isLoggedIn && isManager(req.session.level),
      error_message: err.message,
    });
  }
});

// Contact page route
app.get('/contact', (req, res) => {
  res.render('contact', {
    // session: req.session || {},
    error_message: ""
  });
});

// Programs page route
app.get('/programs', (req, res) => {
  res.render('programs', {
    // session: req.session || {}
  });
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
    // Delete donation record with associated ID from database and redirect to donations route
    await knex("donations").where({ id: req.params.id }).del();
    res.redirect("/donations");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Participants page route
app.get("/participants", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  try {
    let query = knex("participant").select("*").orderBy("participantid", "asc");

    // Search for participant if included in the request
    if (q) {
      query = query.where((b) => {
        b.whereILike("participantfirstname", `%${q}%`)
          .orWhereILike("participantlastname", `%${q}%`)
          .orWhereILike("participantemail", `%${q}%`);
      });
    }

    const participants = await query;

    // Render participants page with particpants information from database and access level information
    res.render("participants", {
      participants,
      q,
      canEdit: isManager(req.session.level),
      error_message: "",
    });
  } catch (err) {
    // Render participants page with empty array and error message if error is caught
    res.render("participants", {
      participants: [],
      q,
      canEdit: isManager(req.session.level),
      error_message: err.message,
    });
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/participants/add", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("participant").insert(req.body); // best practice: whitelist fields
    res.redirect("/participants");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/participants/:id/edit", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("participant").where({ id: req.params.id }).update(req.body);
    res.redirect("/participants");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Delete participant route
app.post("/participants/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("participant").where({ id: req.params.id }).del();
    res.redirect("/participants");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Events page route
app.get("/events", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  try {
    // Retrieve events from evenoccurrence table (if request includes search, incldue in knex query)
    let query = knex("eventoccurrence").select("*").orderBy("eventdatetimestart", "desc");
    if (q) {
      query = query.where((b) => {
        b.whereILike("eventname", `%${q}%`).orWhereILike("eventlocation", `%${q}%`);
      });
    }
    const events = await query;

    // Render events page with array of events and user level information
    res.render("events", {
      events,
      q,
      canEdit: isManager(req.session.level),
      error_message: "",
    });
  } catch (err) {
    // If error is caught, render events page with empty array of events and an error message
    res.render("events", {
      events: [],
      q,
      canEdit: isManager(req.session.level),
      error_message: err.message,
    });
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/events/add", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("events").insert(req.body);
    res.redirect("/events");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/events/:id/edit", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("events").where({ id: req.params.id }).update(req.body);
    res.redirect("/events");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Delete event route
app.post("/events/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("events").where({ id: req.params.id }).del();
    res.redirect("/events");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Survey page route
app.get("/surveys", requireAuth, async (req, res) => {
  // Retrive survey responses from database (if request includes search, incldue in knex query)
  const q = (req.query.q || "").trim();
  try {
    let query = knex("surveyresponse").select("*").orderBy("surveysubmissiondate", "desc");
    if (q) {
      query = query
      .join("participant", 'surveyresponse.participantid', 'participant.participantid')
      .join("eventoccurrence", 'surveyresponse.eventid', 'eventoccurrence.eventid').where((b) => {
        b.whereILike("participant.participantemail", `%${q}%`).orWhereILike("eventoccurrence.eventname", `%${q}%`)
        .orWhereILike("eventoccurrence.eventlocation", `%${q}%`);
      });
    }
    const surveys = await query;

    // Render surveys page with array of survey responses
    res.render("surveys", {
      surveys,
      q,
      canEdit: isManager(req.session.level),
      error_message: "",
    });
  } catch (err) {
    // Render surveys page with empty array and an error message
    res.render("surveys", {
      surveys: [],
      q,
      canEdit: isManager(req.session.level),
      error_message: err.message,
    });
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/surveys/add", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("surveyresponse").insert(req.body);
    res.redirect("/surveys");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/surveys/:id/edit", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("surveyresponse").where({ id: req.params.id }).update(req.body);
    res.redirect("/surveys");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Delete survey response route
app.post("/surveys/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("surveyresponse").where({ id: req.params.id }).del();
    res.redirect("/surveys");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Milestones (1-to-many with participants)
app.get("/milestones", requireAuth, async (req, res) => {
  const participantId = req.query.participant_id;
  const q = (req.query.q || "").trim();
  try {
    // Get all milestones from database (search for individual's milestones if included in request)
    let query = knex("milestones").select("*").orderBy("milestone_date", "desc");
    if (participantId) query = query
    .join("participant", 'milestones.participantid', 'participant.participantid')
    .where((b) => {
      b.whereILike("participant.participantemail", `%${q}%`).orWhereILike("participant.participantfirstname", `%${q}%`)
      .orWhereILike("participant.participantlastname", `%${q}%`).orWhereILike("milestones.milestonetitle", `%${q}%`)});
    const milestones = await query;

    // Render milestones page with array of milestones and user access level
    res.render("milestones", {
      milestones,
      participant_id: participantId || "",
      canEdit: isManager(req.session.level),
      error_message: "",
    });
  } catch (err) {
    // Render milestones page with empty array and an error message
    res.render("milestones", {
      milestones: [],
      participant_id: participantId || "",
      canEdit: isManager(req.session.level),
      error_message: err.message,
    });
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/milestones/add", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("milestones").insert(req.body);
    res.redirect("/milestones");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/milestones/:id/edit", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("milestones").where({ id: req.params.id }).update(req.body);
    res.redirect("/milestones");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Delete milestone route
app.post("/milestones/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("milestones").where({ id: req.params.id }).del();
    res.redirect("/milestones");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Users page route
app.get("/users", requireAuth, requireManager, async (req, res) => {
  const q = (req.query.q || "").trim();
  try {
    // Get array of users from database (search by username if included in request)
    let query = knex("users").select("id", "username", "level").orderBy("username", "asc");
    if (q) {
      query = query.whereILike("username", `%${q}%`);
    }
    const users = await query;

    // Render maintainUsers page with array of users
    res.render("maintainUsers", { users, q, error_message: "" });
  } catch (err) {
    // Render maintainUsers page with an error message
    res.render("maintainUsers", { users: [], q, error_message: err.message });
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/users/add", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("users").insert(req.body); // best practice: whitelist fields
    res.redirect("/users");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/users/:id/edit", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("users").where({ id: req.params.id }).update(req.body);
    res.redirect("/users");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Delete user route
app.post("/users/:id/delete", requireAuth, requireManager, async (req, res) => {
  try {
    await knex("users").where({ id: req.params.id }).del();
    res.redirect("/users");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ---- HTTP 418 route ----
app.get("/teapot", (req, res) => {
  res.status(418).send("I'm a teapot. ☕");
});

// ---- 404 ----
app.use((req, res) => {
  res.status(404).send("404 - Not Found");
});

// ---- Start server ----
app.listen(port, host, () => {
  console.log(`Server running on http://${host}:${port}`);
});
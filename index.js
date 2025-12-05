// Dawson Broadbent, Ashlynn Burgess, Markus Walker
// index.js - Express routing + auth (Admin vs Participant) + EJS + Knex (PostgreSQL)

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
const port = process.env.PORT || 3000;
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
function isAdmin(level) {
  // Accepts admin
  if (level === undefined || level === null) return false;
  return String(level).trim().toLowerCase() === "admin";
}

function requireAuth(req, res, next) {
  if (req.session?.isLoggedIn) return next();
  return res.redirect("/login");
}

function requireAdmin(req, res, next) {
  if (req.session?.isLoggedIn && isAdmin(req.session.level)) return next();
  return res.status(403).send("Forbidden: Admin access only.");
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
  const participantemail = (req.body.email ?? "").trim().toLowerCase();
  const password = (req.body.password ?? "").trim();

  if (!participantemail || !password) {
    return res.status(400).render("login", { error_message: "Invalid login" });
  }

  try {
    // Search for the user in the database by username, and check to make sure a user was returned
    const user = await knex("participant")
      .select("participantid", "participantemail", "password", "participantfirstname", "participantlastname", "participantrole")
      .where({ participantemail })
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
    req.session.userId = user.participantid;
    req.session.username = user.participantemail;
    req.session.firstname = user.participantfirstname;
    req.session.lastname = user.participantlastname;
    req.session.level = user.participantrole;

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

//  Donations Data Page
app.get("/donations", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();

  const canEdit = isAdmin(req.session.level);

  try {
    const query = knex("donations as d")
      .leftJoin("participant as p", "p.participantid", "d.participantid")
      .select(
        "d.participantid",
        "d.donationnumber",
        "d.donationdate",
        "d.donationamount",
        "p.participantfirstname",
        "p.participantlastname"
      )
      .orderBy("d.participantid", "asc")
      .orderBy("d.donationdate", "desc");

    if (q) {
      query.where(function () {
        this.where("p.participantfirstname", "ilike", `%${q}%`)
          .orWhere("p.participantlastname", "ilike", `%${q}%`)
          .orWhereRaw(`concat(p.participantfirstname, ' ', p.participantlastname) ilike ?`, [`%${q}%`])
          .orWhereRaw(`d.donationamount::text ilike ?`, [`%${q}%`])
          .orWhereRaw(`d.donationnumber::text ilike ?`, [`%${q}%`])
          .orWhereRaw(`d.participantid::text ilike ?`, [`%${q}%`])
          .orWhereRaw(`to_char(d.donationdate, 'MM/DD/YYYY') ilike ?`, [`%${q}%`]);
      });
    }

    const rows = await query;

    const donations = rows.map((r) => {
      const formattedDate = r.donationdate
        ? new Date(r.donationdate).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
        : "";

      const donorFullName = [r.participantfirstname, r.participantlastname].filter(Boolean).join(" ").trim() || "(Unknown donor)";

      return {
        date: formattedDate,
        amount: r.donationamount,
        donor: donorFullName,
        id: r.participantid,
        number: r.donationnumber,
        // keep raw date for edit modal (date-only string)
        isoDate: r.donationdate ? new Date(r.donationdate).toISOString().slice(0, 10) : "",
      };
    });

    res.render("donations", {
      donations,
      q,
      canEdit,
      isPublic: false,   // no longer used, but safe
      error_message: "",
    });
  } catch (err) {
    res.render("donations", {
      donations: [],
      q,
      canEdit: isAdmin(req.session.level),
      isPublic: false,
      error_message: err.message,
    });
  }
});

// Add donation route
app.post("/donations/add", async (req, res) => {
  try {
    let participantResult = await knex("participant").select("participantid").where({"participantemail": req.body.participant_email}).first();
    if (!participantResult) {
      return res.status(404).send("Participant not found with that email");
    };
    let participantid = participantResult.participantid;
    let donationamount = req.body.amount;
    let donationdate = new Date();
    let lastdonation = await knex("donations").where({"participantid": participantid}).max("donationnumber as max").first();
    let donationnumber;
    if (!lastdonation || lastdonation.max === null) {
      donationnumber = 1;
    } else {
      donationnumber = lastdonation.max + 1;
    };
    const newDonation = {participantid, donationnumber, donationdate, donationamount};

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

// Delete donation route
app.post("/donations/:participantid/:donationnumber/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    await knex("donations").where({ "participantid": req.params.participantid }).andWhere({ "donationnumber": req.params.donationnumber }).del();
    res.redirect("/donations");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Get participants route
app.get("/participants", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();

  try {
    const query = knex("participant")
      .select("*")
      .orderBy("participantid", "asc");

    if (q) {
      const qLower = q.toLowerCase();
      const roleAlias =
        ["admins", "admin"].includes(qLower) ? "admin" :
        ["participants", "participant"].includes(qLower) ? "participant" :
        null;

      query.where(function () {
        this.where("participantfirstname", "ilike", `%${q}%`)
          .orWhere("participantlastname", "ilike", `%${q}%`)
          .orWhere("participantemail", "ilike", `%${q}%`)
          .orWhere("participantcity", "ilike", `%${q}%`)
          .orWhere("participantstate", "ilike", `%${q}%`)
          .orWhere("participantschooloremployer", "ilike", `%${q}%`)
          .orWhere("participantfieldofinterest", "ilike", `%${q}%`)
          .orWhere("participantrole", "ilike", `%${q}%`);

        // If they typed "admins" or "participants", also match the canonical role value
        if (roleAlias) {
          this.orWhere("participantrole", roleAlias);
        }
      });
    }

    const participants = await query;

    res.render("participants", {
      participants,
      q,
      canEdit: isAdmin(req.session.level),
      error_message: "",
    });
  } catch (err) {
    res.render("participants", {
      participants: [],
      q,
      canEdit: isAdmin(req.session.level),
      error_message: err.message,
    });
  }
});

// Add participant route
app.post("/participants/add", requireAuth, requireAdmin, async (req, res) => {
  try {
    let participantfirstname = req.body.firstname;
    let participantlastname = req.body.lastname;
    let participantemail = req.body.email;
    let password = req.body.password;
    let participantdob = req.body.dob;
    let participantrole = "participant";
    let participantphone = req.body.phone;
    let participantcity = req.body.city;
    let participantstate = req.body.state;
    let participantzip = req.body.zip;
    let participantschooloremployer = req.body.school_employer;
    let participantfieldofinterest = req.body.field_of_interest;

    let newParticipant = {
      participantemail,
      password,
      participantfirstname,
      participantlastname,
      participantdob,
      participantrole,
      participantphone, 
      participantcity,
      participantstate,
      participantzip, 
      participantschooloremployer,
      participantfieldofinterest
    };
    await knex("participant").insert(newParticipant);
    res.redirect("/participants");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Edit participant route
app.post("/participants/:participantid/edit", requireAuth, requireAdmin, async (req, res) => {
  try {
    const participantid = req.params.participantid;

    const updates = {
      participantfirstname: req.body.firstname,
      participantlastname: req.body.lastname,
      participantemail: req.body.email,
      password: req.body.password,
      participantdob: req.body.dob || null,
      participantphone: req.body.phone || null,
      participantcity: req.body.city || null,
      participantstate: req.body.state || null,
      participantzip: req.body.zip || null,
      participantschooloremployer: req.body.school_employer || null,
      participantfieldofinterest: req.body.field_of_interest || null,
    };

    await knex("participant")
      .where({ participantid })
      .update(updates);

    res.redirect("/participants");
  } catch (err) {
    console.error("Edit participant error:", err);
    res.redirect("/participants?error=Edit%20failed");
  }
});

// Delete participant route
app.post("/participants/:participantid/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    await knex("participant").where({ "participantid": req.params.participantid }).del();
    res.redirect("/participants");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Event occurrence page route
app.get("/events", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  const error_message = req.query.error_message || "";

  try {
    let query = knex("eventoccurrence").select("*").orderBy("eventdatetimestart", "desc");
    if (q) {
      query = query.where((b) => {
        b.whereILike("eventname", `%${q}%`).orWhereILike("eventlocation", `%${q}%`);
      });
    }

    const [events, eventtemplates, locations] = await Promise.all([
      query,
      knex("eventtemplate").select("eventname").orderBy("eventname"),
      knex("locationcapacity")
        .distinct("eventlocation")
        .whereNotNull("eventlocation")
        .orderBy("eventlocation"),
    ]);

    res.render("events", {
      events,
      eventtemplates,
      locations,
      q,
      canEdit: isAdmin(req.session.level),
      error_message,
    });
  } catch (err) {
    // keep page renderable even on error
    const [eventtemplates, locations] = await Promise.all([
      knex("eventtemplate").select("eventname").orderBy("eventname"),
      knex("locationcapacity")
        .distinct("eventlocation")
        .whereNotNull("eventlocation")
        .orderBy("eventlocation"),
    ]);

    res.render("events", {
      events: [],
      eventtemplates,
      locations,
      q,
      canEdit: isAdmin(req.session.level),
      error_message: err.message,
    });
  }
});

// Add event route
app.post("/events/add", requireAuth, requireAdmin, async (req, res) => {
  try {
    let eventname = req.body.event_name;
    let eventdatetimestart = req.body.eventdatetimestart;
    let eventdatetimeend = req.body.eventdatetimeend;
    let eventlocation = req.body.eventlocation;
    let eventregistrationdeadline = req.body.eventregistrationdeadline;
    let newEvent = {eventname, eventdatetimestart, eventdatetimeend, eventlocation, eventregistrationdeadline};
    await knex("eventoccurrence").insert(newEvent);
    res.redirect("/events");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

//Edit Event Occurrence Route
app.post("/events/:eventid/edit", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.eventid;
    const {
      eventname,
      eventdatetimestart,
      eventdatetimeend,
      eventlocation,
      eventregistrationdeadline
    } = req.body;

    console.log("Editing event ID:", id); // Debug log
    console.log("Request body:", req.body); // Debug log

    const updated = await knex("eventoccurrence")
      .where({ eventid: id })
      .update({
        eventname,
        eventdatetimestart,
        eventdatetimeend,
        eventlocation,
        eventregistrationdeadline
      });

    console.log(`Updated ${updated} event(s)`); // Debug log

    res.redirect("/events");
  } catch (err) {
    console.error("Error updating event:", err);
    res.redirect("/events?error_message=" + encodeURIComponent("Failed to update event."));
  }
});

// Delete event occurrence route
app.post("/events/:eventid/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    await knex("eventoccurrence").where({ "eventid": req.params.eventid }).del();
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
    let query = knex("surveyresponse")
    .select(
      'surveyresponse.participantid',
      'surveyresponse.eventid',
      'surveyresponse.surveysubmissiondate',
      'surveyresponse.surveysatisfactionscore',
      'surveyresponse.surveyusefulnessscore',
      'surveyresponse.surveyinstructorscore',
      'surveyresponse.surveyrecommendationscore',
      'surveyresponse.surveycomments',
      // Join and select fields from other tables
      knex.raw("?? || ' ' || ?? as participantname", ['participant.participantfirstname', 'participant.participantlastname']),
      'eventoccurrence.eventname',
      'npsbucket.surveynpsbucket'
    )
    .leftJoin('participant', 'surveyresponse.participantid', 'participant.participantid')
    .leftJoin('eventoccurrence', 'surveyresponse.eventid', 'eventoccurrence.eventid')
    .leftJoin('npsbucket', 'surveyresponse.surveyrecommendationscore', 'npsbucket.surveyrecommendationscore')
    .orderBy("surveysubmissiondate", "desc");
    if (q) {
        query.where((b) => {
            b.whereILike("participant.participantemail", `%${q}%`)
              .orWhereILike("eventoccurrence.eventname", `%${q}%`)
              .orWhereILike("eventoccurrence.eventlocation", `%${q}%`);
        });
    }
    const surveys = await query;

    // Render surveys page with array of survey responses
    res.render("surveys", {
      surveys,
      q,
      canEdit: isAdmin(req.session.level),
      error_message: "",
    });
  } catch (err) {
    // Render surveys page with empty array and an error message
    res.render("surveys", {
      surveys: [],
      q,
      canEdit: isAdmin(req.session.level),
      error_message: err.message,
    });
  }
});


// Add survey route
app.post("/surveys/add", requireAuth, requireAdmin, async (req, res) => {
  try {
    let participantResult = await knex("participant").select("participantid").where({"participantemail": req.body.participant_email}).first()
    if (!participantResult) {
      return res.status(404).send("Participant not found with that email");
    }
    let participantid = participantResult.participantid
    let eventid = req.body.event;
    let surveysatisfactionscore = req.body.sat;
    let surveyusefulnessscore = req.body.use;
    let surveyinstructorscore = req.body.inst;
    let surveyrecommendationscore = req.body.rec;
    let surveycomments = req.body.comment;
    let surveysubmissiondate = req.body.submissiondate;
    let newSurvey = {participantid, eventid, surveysatisfactionscore, surveyusefulnessscore, surveyinstructorscore, surveyrecommendationscore, surveycomments, surveysubmissiondate};
    await knex("surveyresponse").insert(newSurvey);
    res.redirect("/surveys");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/*
We need to change this to redirect to another ejs file
*/
app.post("/surveys/:participantid/:eventid/edit", requireAuth, requireAdmin, async (req, res) => {
  try {
    await knex("surveyresponse").where({ id: req.params.id }).update(req.body);
    res.redirect("/surveys");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Delete survey response route
app.post("/surveys/:participantid/:eventid/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    await knex("surveyresponse").where({ "participantid": req.params.participantid }).andWhere({ "eventid": req.params.eventid }).del();
    res.redirect("/surveys");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Milestones (1-to-many with participants)
app.get("/milestones", requireAuth, async (req, res) => {
  const participantid = req.query.participantid;
  const q = (req.query.q || "").trim();
  try {
    // Get all milestones from database (search for individual's milestones if included in request)
    let query = knex("milestones").select("*").orderBy("milestonedate", "desc");
    if (participantid) query = query.where({"participantid": participantid});
    if (q) query = query.join("participant", 'milestones.participantid', 'participant.participantid')
    .where((b) => {
      b.whereILike("participant.participantfirstname", `%${q}%`)
      .orWhereILike("participant.participantlastname", `%${q}%`).orWhereILike("milestones.milestonetitle", `%${q}%`)});
    const all = await query;

    let milestones = [];
    for (let iCount = 0; iCount < all.length; iCount++) {
      let milestoneDate = all[iCount].milestonedate;
      let formattedDate = new Date(milestoneDate).toLocaleDateString("en-US", {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
      let milestoneTitle = all[iCount].milestonetitle
      let donor = await knex("participant").select("participantfirstname", "participantlastname").where({"participantid": all[iCount].participantid}).first();
      let donorFullName = donor.participantfirstname + " " + donor.participantlastname;
      milestones.push({
        date: formattedDate,
        title: milestoneTitle,
        participant: donorFullName,
        participantid: all[iCount].participantid
      });
    };

    // Render milestones page with array of milestones and user access level
    res.render("milestones", {
      milestones,
      participantid: participantid || "",
      canEdit: isAdmin(req.session.level),
      error_message: "",
    });
  } catch (err) {
    // Render milestones page with empty array and an error message
    res.render("milestones", {
      milestones: [],
      participantid: participantId || "",
      canEdit: isAdmin(req.session.level),
      error_message: err.message,
    });
  }
});

// Add milestone route
app.post("/milestones/add", requireAuth, requireAdmin, async (req, res) => {
  try {
    let participantResult = await knex("participant").select("participantid").where({"participantemail": req.body.participant_email}).first();
    if (!participantResult) {
      return res.status(404).send("Participant not found with that email");
    };
    let participantid = participantResult.participantid;
    let milestonetitle = req.body.milestonetitle;
    let milestonedate = req.body.milestonedate;
    let newMilestone = {participantid, milestonetitle, milestonedate};
    await knex("milestones").insert(newMilestone);
    res.redirect("/milestones");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Edit Milestone Route
app.post("/milestones/:participantid/:oldtitle/edit", requireAuth, requireAdmin, async (req, res) => {
  try {
    const participantid = req.params.participantid;
    const oldtitle = decodeURIComponent(req.params.oldtitle);
    const { milestonedate, milestonetitle } = req.body;

    console.log('Edit params:', { participantid, oldtitle, milestonedate, milestonetitle });

    await knex.transaction(async (trx) => {
      // Delete old record using the PK (participantid + old title)
      const deleted = await trx("milestones")
        .where({ 
          participantid: participantid,
          milestonetitle: oldtitle 
        })
        .delete();

      console.log('Rows deleted:', deleted);

      // Insert new record with updated values
      await trx("milestones").insert({
        participantid: participantid,
        milestonedate: milestonedate,
        milestonetitle: milestonetitle,
      });
    });

    res.redirect("/milestones");
  } catch (err) {
    console.error("Edit milestone error:", err);
    res.redirect("/milestones?error=Edit%20failed");
  }
});

// Delete Milestone Route (also needs updating)
app.post("/milestones/:participantid/:title/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    const participantid = req.params.participantid;
    const title = decodeURIComponent(req.params.title);

    await knex("milestones")
      .where({ 
        participantid: participantid,
        milestonetitle: title 
      })
      .delete();

    res.redirect("/milestones");
  } catch (err) {
    console.error("Delete milestone error:", err);
    res.redirect("/milestones?error=Delete%20failed");
  }
});

// Users page route
app.get("/users", requireAuth, requireAdmin, async (req, res) => {
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
app.post("/users/add", requireAuth, requireAdmin, async (req, res) => {
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
app.post("/users/:id/edit", requireAuth, requireAdmin, async (req, res) => {
  try {
    await knex("users").where({ id: req.params.id }).update(req.body);
    res.redirect("/users");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Delete user route
app.post("/users/:id/delete", requireAuth, requireAdmin, async (req, res) => {
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
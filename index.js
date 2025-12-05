// Dawson Broadbent, Ashlynn Burgess, Markus Walker
// index.js - Express routing + auth (Admin vs Participant) + EJS + Knex (PostgreSQL)

//Import libraries and packages
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");

//Connecting to our database
const knex = require("knex")({
  client: "pg",
  connection: process.env.DATABASE_URL || {
    host: process.env.PGHOST || process.env.RDS_HOSTNAME || "localhost",
    user: process.env.PGUSER || process.env.RDS_USERNAME || "postgres",
    password: process.env.PGPASSWORD || process.env.RDS_PASSWORD || "admin",
    database: process.env.PGDATABASE || process.env.RDS_DB_NAME || "is403",
    port: Number(process.env.PGPORT || process.env.RDS_PORT || 5433),
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  },
});


// Setting up variables
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

// Fuctions
//Checks if user is an admin
function isAdmin(level) {
  // Accepts admin
  if (level === undefined || level === null) return false;
  return String(level).trim().toLowerCase() === "admin";
}

//Requires the user to be logged in to continue, else redirects to the login page
function requireAuth(req, res, next) {
  if (req.session?.isLoggedIn) return next();
  return res.redirect("/login");
}

// Requires the user to be an Admin to access
function requireAdmin(req, res, next) {
  if (req.session?.isLoggedIn && isAdmin(req.session.level)) return next();
  return res.status(403).send("Forbidden: Admin access only.");
}

// Root route that directs the user to the index.ejs page
app.get("/", async (req, res) => {
  res.render("index", { error_message: "" });
});

//Dashboard Route
app.get("/dashboard", requireAuth, (req, res) => {
  res.render("dashboard", { session: req.session });
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

// Gets the Create Account page
app.get("/createaccount", (req, res) => {
  res.render("createaccount", { error_message: "" });
});

// Posts the Created Account
app.post("/createaccount", async (req, res) => {
  try {
    const participantfirstname = (req.body.firstname || "").trim();
    const participantlastname  = (req.body.lastname || "").trim();
    const participantemail     = (req.body.email || "").trim().toLowerCase();
    const password             = (req.body.password || "").trim();
    const confirmPassword      = (req.body.confirm_password || "").trim();

    const participantdob       = req.body.dob || null;
    const participantphone     = (req.body.phone || "").trim() || null;
    const participantcity      = (req.body.city || "").trim() || null; // only if you add city field later
    const participantstate     = (req.body.state || "").trim().toUpperCase() || null;
    const participantzip       = (req.body.zip || "").trim() || null;
    const participantschooloremployer = (req.body.school_employer || "").trim() || null;

    // The radio values here are Art / STEM / Both
    const participantfieldofinterest  = (req.body.field_of_interest || "").trim();

    const participantrole = "participant";

    // Basic required checks
    if (!participantfirstname || !participantlastname || !participantemail || !password) {
      return res.status(400).render("createaccount", {
        error_message: "Please fill out all required fields."
      });
    }

    // Confirm password check
    if (password !== confirmPassword) {
      return res.status(400).render("createaccount", {
        error_message: "Passwords do not match. Please try again."
      });
    }

    // Basic field-of-interest validation
    const allowedInterests = new Set(["Art", "STEM", "Both"]);
    if (!allowedInterests.has(participantfieldofinterest)) {
      return res.status(400).render("createaccount", {
        error_message: "Please select a valid field of interest."
      });
    }

    // Prevent duplicate email
    const existing = await knex("participant")
      .where({ participantemail })
      .first();

    if (existing) {
      return res.status(409).render("createaccount", {
        error_message: "An account with that email already exists. Try logging in."
      });
    }

    // Build insert object (include only columns that exist in your table)
    const newParticipant = {
      participantemail,
      password, // NOTE: consider hashing later
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

    //Connects to the participant database and inserts our new object
    await knex("participant").insert(newParticipant);

    // After creating an account, send them to login
    return res.redirect("/login");
  } catch (err) {
    console.error(err);
    return res.status(500).render("createaccount", {
      error_message: "Something went wrong creating your account. Please try again."
    });
  }
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Donation page route
app.get("/donate", (req, res) => {
  res.render('donate.ejs', { error_message: "" });
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
  //Thsi is the search query and the user level
  const q = (req.query.q || "").trim();
  const canEdit = isAdmin(req.session.level);

  try {
    //Retrieves donations and names from the database tables
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

    //This is the search functionality
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

    // Execute the built query and get all matching rows from the database
    const rows = await query;

    // Transform raw DB rows into a cleaner donations array for the view
    const donations = rows.map((r) => {
      // Format the donation date as MM/DD/YYYY for display, or blank if null
      const formattedDate = r.donationdate
        ? new Date(r.donationdate).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
        : "";

      // Format the donation date as MM/DD/YYYY for display, or blank if null
      const donorFullName = [r.participantfirstname, r.participantlastname].filter(Boolean).join(" ").trim() || "(Unknown donor)";

      // Format the donation date as MM/DD/YYYY for display, or blank if null
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

    //Renders the donations page again
    res.render("donations", {
      donations,
      q,
      canEdit,
      isPublic: false,   // no longer used, but safe
      error_message: "",
    });

  //Error Handling
  } catch (err) {
    res.render("donations", {
      donations: [],
      q: "",
      canEdit: isAdmin(req.session.level),
      isPublic: false,
      error_message: err.message,
    });
  }
});

// Add donation route
app.post("/donations/add", async (req, res) => {
  try {
    // Look up an existing participant by the email provided in the donation form
    let participantResult = await knex("participant").select("participantid").where({"participantemail": req.body.participant_email}).first();
    // If no participant exists, create a minimal participant record and look it up again
    if (!participantResult) {
      let participantfirstname = req.body.firstname;
      let participantlastname = req.body.lastname;
      let participantemail = req.body.participant_email;
      let participantrole = "participant";
      let newParticipant = {participantfirstname, participantlastname, participantemail, participantrole};
      await knex("participant").insert(newParticipant);
      participantResult = await knex("participant").select("participantid").where({"participantemail": req.body.participant_email}).first();
    };

    // Use the participant's ID to tie this donation to them
    let participantid = participantResult.participantid;
    let donationamount = req.body.amount;
    let donationdate = new Date();

    // Find the last donation number for this participant to increment it (1, 2, 3, ...)
    let lastdonation = await knex("donations").where({"participantid": participantid}).max("donationnumber as max").first();
    let donationnumber;
    if (!lastdonation || lastdonation.max === null) {
      donationnumber = 1;
    } else {
      donationnumber = lastdonation.max + 1;
    };

    // New donation record linked to participant
    const newDonation = {participantid, donationnumber, donationdate, donationamount};

    await knex("donations").insert(newDonation);

    // If a staff member is logged in, go back to donations admin page; otherwise send public donor home
    if (req.session.isLoggedIn) {
      return res.redirect("/donations");
    } else {
      return res.redirect("/");
    }
  } catch (err) {
    // On error, re-render the public donations page with an error message
    return res.render("donations", {
      donations: [],
      q: "",
      isPublic: true,
      canEdit: false,
      error_message: `Could not submit donation: ${err.message}`,
    });
  }
});

// Edit donation route
app.post("/donations/:participantid/:donationnumber/edit", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Sets variables for the selected donation to edit
    const participantid = req.params.participantid;
    const donationnumber = req.params.donationnumber;

    // The edited information
    const amount = req.body.amount;
    const donation_date = req.body.donation_date; // YYYY-MM-DD from input[type="date"]

    // Connects to the DB and updates with the edited information
    const updated = await knex("donations")
      .where({ participantid })
      .andWhere({ donationnumber })
      .update({
        donationamount: amount,
        donationdate: donation_date,
      });

    //Logs how many rows are updated and redirects back to donations
    console.log("Donations rows updated:", updated);
    res.redirect("/donations");

  // Error Handling
  } catch (err) {
    console.error("Edit donation error:", err);
    res.redirect("/donations?error=Edit%20failed");
  }
});

// Delete donation route
app.post("/donations/:participantid/:donationnumber/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Deletes the selected donation and reroutes back to the donations page
    await knex("donations").where({ "participantid": req.params.participantid }).andWhere({ "donationnumber": req.params.donationnumber }).del();
    res.redirect("/donations");
  //Error handling
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Get participants route
app.get("/participants", requireAuth, async (req, res) => {
  // Grab the search query from ?q=... and normalize whitespace
  const q = (req.query.q || "").trim();


  try {
    // Base query: select all participants ordered by ID
    const query = knex("participant")
      .select("*")
      .orderBy("participantid", "asc");

    // If there is a search term, add flexible filtering
    if (q) {
      const qLower = q.toLowerCase();
      const roleAlias =
        ["admins", "admin"].includes(qLower) ? "admin" :
        ["participants", "participant"].includes(qLower) ? "participant" :
        null;

      // Wrap filters in a WHERE (...) block so we can OR multiple fields
      query.where(function () {
        // Search across multiple participant fields using ILIKE for case-insensitive match
        this.where("participantfirstname", "ilike", `%${q}%`)
          .orWhere("participantlastname", "ilike", `%${q}%`)
          .orWhere("participantemail", "ilike", `%${q}%`)
          .orWhere("participantcity", "ilike", `%${q}%`)
          .orWhere("participantstate", "ilike", `%${q}%`)
          .orWhere("participantschooloremployer", "ilike", `%${q}%`)
          .orWhere("participantfieldofinterest", "ilike", `%${q}%`)
          .orWhere("participantrole", "ilike", `%${q}%`);

        // If they typed "admins" or "participants", also match the exact role value
        if (roleAlias) {
          this.orWhere("participantrole", roleAlias);
        }
      });
    }

    // Execute the built participants query
    const participants = await query;

    // Render the participants page and keep the search term
    res.render("participants", {
      participants,
      q,
      canEdit: isAdmin(req.session.level),
      error_message: "",
    });
  
  // Error Handling
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
    // Pull form fields from the request body
    let participantfirstname = req.body.firstname;
    let participantlastname = req.body.lastname;
    let participantemail = req.body.email;
    let password = req.body.password;
    let participantdob = req.body.dob;

    // Allow DOB to be optional (store as NULL if blank)
    if (!participantdob || participantdob.trim() === '') {
      participantdob = null;
    }

    // New participants created here are always "participant" role (not admin)
    let participantrole = "participant";
    let participantphone = req.body.phone;
    let participantcity = req.body.city;
    let participantstate = req.body.state;
    let participantzip = req.body.zip;
    let participantschooloremployer = req.body.school_employer;
    let participantfieldofinterest = req.body.field_of_interest;

    // Build the object to insert into the participant table
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
    
    // Connect to the database and insert the new participant, then reload the participants page
    await knex("participant").insert(newParticipant);
    res.redirect("/participants");
  
  //Error Handling
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Edit participant route
app.post("/participants/:participantid/edit", requireAuth, requireAdmin, async (req, res) => {
  try {
    //Gets the paricipant Id of the participant we want to edit
    const participantid = req.params.participantid;

    //Gets our updates from the form
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

    //Sends those updates to the database
    await knex("participant")
      .where({ participantid })
      .update(updates);

    //Reloads the participants page
    res.redirect("/participants");

  // Error Handling
  } catch (err) {
    console.error("Edit participant error:", err);
    res.redirect("/participants?error=Edit%20failed");
  }
});

// Delete participant route
app.post("/participants/:participantid/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    //Connects to the database, deletes the participant we selected by ID, and reloads the participants page
    await knex("participant").where({ "participantid": req.params.participantid }).del();
    res.redirect("/participants");
  
  // Error Handling
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Event occurrence page route
app.get("/events", requireAuth, async (req, res) => {
  // Search term from query string and any error passed via redirect
  const q = (req.query.q || "").trim();
  const error_message = req.query.error_message || "";

  try {
    // Base query: all event occurrences ordered by most recent first
    let query = knex("eventoccurrence").select("*").orderBy("eventdatetimestart", "desc");

    // If a search term exists, filter by event name or location (case-insensitive)
    if (q) {
      query = query.where((b) => {
        b.whereILike("eventname", `%${q}%`).orWhereILike("eventlocation", `%${q}%`);
      });
    }

    // Load filtered events, list of event templates, and distinct locations
    const [events, eventtemplates, locations] = await Promise.all([
      query,
      knex("eventtemplate").select("eventname").orderBy("eventname"),
      knex("locationcapacity")
        .distinct("eventlocation")
        .whereNotNull("eventlocation")
        .orderBy("eventlocation"),
    ]);

    // Render events page with data, search term, and admin edit permissions
    res.render("events", {
      events,
      eventtemplates,
      locations,
      q,
      canEdit: isAdmin(req.session.level),
      error_message,
    });
  
  // Error Handling
  } catch (err) {
    // keep page renderable even on error
    const [eventtemplates, locations] = await Promise.all([
      knex("eventtemplate").select("eventname").orderBy("eventname"),
      knex("locationcapacity")
        .distinct("eventlocation")
        .whereNotNull("eventlocation")
        .orderBy("eventlocation"),
    ]);

    // Render the Events Page
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
    //Gets info from the form body
    let eventname = req.body.event_name;
    let eventdatetimestart = req.body.eventdatetimestart;
    let eventdatetimeend = req.body.eventdatetimeend;
    let eventlocation = req.body.eventlocation;
    let eventregistrationdeadline = req.body.eventregistrationdeadline;
    let newEvent = {eventname, eventdatetimestart, eventdatetimeend, eventlocation, eventregistrationdeadline};

    // Connects to the Database and inserts the new event 
    await knex("eventoccurrence").insert(newEvent);
    res.redirect("/events");

  // Error Handling
  } catch (err) {
    res.status(500).send(err.message);
  }
});

//Edit Event Occurrence Route
app.post("/events/:eventid/edit", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Event ID we want to update, pulled from the URL parameter
    const id = req.params.eventid;

    // Destructure updated fields from the submitted form
    const {
      eventname,
      eventdatetimestart,
      eventdatetimeend,
      eventlocation,
      eventregistrationdeadline
    } = req.body;

    //Debug Logs
    console.log("Editing event ID:", id); // Debug log
    console.log("Request body:", req.body); // Debug log

    // Apply updates to the eventoccurrence record that matches this eventid
    const updated = await knex("eventoccurrence")
      .where({ eventid: id })
      .update({
        eventname,
        eventdatetimestart,
        eventdatetimeend,
        eventlocation,
        eventregistrationdeadline
      });

    // Debug Log
    console.log(`Updated ${updated} event(s)`); // Debug log

    //Redirects back to the events page
    res.redirect("/events");

  // Error Handling
  } catch (err) {
    console.error("Error updating event:", err);
    res.redirect("/events?error_message=" + encodeURIComponent("Failed to update event."));
  }
});

// Delete event occurrence route
app.post("/events/:eventid/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Finds the event we selected and deletes that instance, then redirects back to events
    await knex("eventoccurrence").where({ "eventid": req.params.eventid }).del();
    res.redirect("/events");

  // Error handling
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Survey page route
app.get("/surveys", requireAuth, async (req, res) => {
  // Retrieve search term from query string (used to filter surveys)
  const q = (req.query.q || "").trim();

  try {
    // Base query: survey responses joined with participant, event, and NPS bucket
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
      
      // Build participant full name from first + last
      knex.raw("?? || ' ' || ?? as participantname", ['participant.participantfirstname', 'participant.participantlastname']),
      // Additional joined fields
      'participant.participantemail',
      'eventoccurrence.eventname',
      'npsbucket.surveynpsbucket'
    )
    // Joins tables
    .leftJoin('participant', 'surveyresponse.participantid', 'participant.participantid')
    .leftJoin('eventoccurrence', 'surveyresponse.eventid', 'eventoccurrence.eventid')
    .leftJoin('npsbucket', 'surveyresponse.surveyrecommendationscore', 'npsbucket.surveyrecommendationscore')
    .orderBy("surveysubmissiondate", "desc");

    // If there is a search term, filter by participant email, event name, or event location
    if (q) {
        query.where((b) => {
            b.whereILike("participant.participantemail", `%${q}%`)
              .orWhereILike("eventoccurrence.eventname", `%${q}%`)
              .orWhereILike("eventoccurrence.eventlocation", `%${q}%`);
        });
    }

    // Execute the query and get all matching survey rows
    const surveys = await query;

    // Render surveys page with array of survey responses
    res.render("surveys", {
      surveys,
      q,
      canEdit: isAdmin(req.session.level),
      error_message: "",
    });

  //Error Handling
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
    // Look up the participant by email from the form
    let participantResult = await knex("participant").select("participantid").where({"participantemail": req.body.participant_email}).first()
    
    // If the email doesn't match any participant, stop and return 404
    if (!participantResult) {
      return res.status(404).send("Participant not found with that email");
    }

    // Extract the participant ID and form fields
    let participantid = participantResult.participantid
    let eventid = req.body.event;
    let surveysatisfactionscore = req.body.sat;
    let surveyusefulnessscore = req.body.use;
    let surveyinstructorscore = req.body.inst;
    let surveyrecommendationscore = req.body.rec;
    let surveycomments = req.body.comment;
    let surveysubmissiondate = req.body.submissiondate;
    
    // Build the new survey response record
    let newSurvey = {participantid, eventid, surveysatisfactionscore, surveyusefulnessscore, surveyinstructorscore, surveyrecommendationscore, surveycomments, surveysubmissiondate};
    
    // Insert the survey into the surveyresponse table and redirect to surveys
    await knex("surveyresponse").insert(newSurvey);
    res.redirect("/surveys");

  // Error Handling
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Edit survey response route
app.post("/surveys/:participantid/:eventid/edit", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Identify the survey row by participant + event from URL params
    const participantid = req.params.participantid;
    const eventid = req.params.eventid;

    // Updated information from the edit form
    let surveysatisfactionscore = req.body.sat;
    let surveyusefulnessscore = req.body.use;
    let surveyinstructorscore = req.body.inst;
    let surveyrecommendationscore = req.body.rec;
    let surveycomments = req.body.comment;

    //// Build object with updated fields to write back to the DB
    let newSurvey = {participantid, eventid, surveysatisfactionscore, surveyusefulnessscore, surveyinstructorscore, surveyrecommendationscore, surveycomments};

    // Build object with updated fields to write back to the DB, then redirect back to the surveys page
    await knex("surveyresponse").where({ "participantid": participantid }).andWhere({ "eventid": eventid})
    .update(newSurvey);
    res.redirect("/surveys");

  //Error Handling
  } catch (err) {
    console.error("Error updating event:", err);
    res.redirect("/surveys?error_message=" + encodeURIComponent("Failed to update survey response."));
  }
});

// Delete survey response route
app.post("/surveys/:participantid/:eventid/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Gets the Survey we selected by Participant and Event ID and deletes that record, then redirects back to surveys
    await knex("surveyresponse").where({ "participantid": req.params.participantid }).andWhere({ "eventid": req.params.eventid }).del();
    res.redirect("/surveys");

  // Error Handling
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Milestones (1-to-many with participants)
app.get("/milestones", requireAuth, async (req, res) => {
  // Optional filters: specific participant and/or search term
  const participantid = req.query.participantid;
  const q = (req.query.q || "").trim();

  try {
    // Get all milestones from database (search for individual's milestones if included in request)
    let query = knex("milestones").select("*").orderBy("milestonedate", "desc");

    // If a specific participant ID is provided, filter to that participant's milestones
    if (participantid) query = query.where({"participantid": participantid});

    // If a search term is provided, join to participant and search by name or milestone title
    if (q) query = query.join("participant", 'milestones.participantid', 'participant.participantid')
    .where((b) => {
      b.whereILike("participant.participantfirstname", `%${q}%`)
      .orWhereILike("participant.participantlastname", `%${q}%`).orWhereILike("milestones.milestonetitle", `%${q}%`)});
    
    // Run the query and get all matching milestone rows
      const all = await query;

    // Map DB rows into a display-friendly milestones array
    let milestones = [];
    for (let iCount = 0; iCount < all.length; iCount++) {
      // Format milestone date as MM/DD/YYYY
      let milestoneDate = all[iCount].milestonedate;
      let formattedDate = new Date(milestoneDate).toLocaleDateString("en-US", {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

      // Milestone title from the row
      let milestoneTitle = all[iCount].milestonetitle

      // Look up participant name for this milestone
      let donor = await knex("participant").select("participantfirstname", "participantlastname").where({"participantid": all[iCount].participantid}).first();
      let donorFullName = donor.participantfirstname + " " + donor.participantlastname;
      
      // Push a simplified milestone object for the view
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

  // Error Handling
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
    // Look up the participant by email from the form
    let participantResult = await knex("participant").select("participantid").where({"participantemail": req.body.participant_email}).first();
    
    // If there is no participant with that email, stop and return 404
    if (!participantResult) {
      return res.status(404).send("Participant not found with that email");
    };

    // Extract the participant ID and milestone details from the form
    let participantid = participantResult.participantid;
    let milestonetitle = req.body.milestonetitle;
    let milestonedate = req.body.milestonedate;

    // Build milestone record linked to this participant
    let newMilestone = {participantid, milestonetitle, milestonedate};

    // Insert the new milestone into the milestones table and redirect back to milestones
    await knex("milestones").insert(newMilestone);
    res.redirect("/milestones");

  // Error Handling
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Edit Milestone Route (admin-only)
// Uses a transaction to "replace" a milestone whose title is part of the composite key
app.post("/milestones/:participantid/:oldtitle/edit", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Identify which milestone to edit via URL params
    const participantid = req.params.participantid;
    const oldtitle = decodeURIComponent(req.params.oldtitle);

    // New values submitted from the form
    const { milestonedate, milestonetitle } = req.body;

    // Debug log
    console.log('Edit params:', { participantid, oldtitle, milestonedate, milestonetitle });

    // Wrap delete + insert in a transaction so it's all-or-nothing
    await knex.transaction(async (trx) => {
      // Delete old record using the composite key (participantid + old title)
      const deleted = await trx("milestones")
        .where({ 
          participantid: participantid,
          milestonetitle: oldtitle 
        })
        .delete();

      // Debug log for deleted row
      console.log('Rows deleted:', deleted);

      // Insert new record with updated title/date for the same participant
      await trx("milestones").insert({
        participantid: participantid,
        milestonedate: milestonedate,
        milestonetitle: milestonetitle,
      });
    });

    // On success, go back to milestones list
    res.redirect("/milestones");

  // Error Handling
  } catch (err) {
    console.error("Edit milestone error:", err);
    res.redirect("/milestones?error=Edit%20failed");
  }
});

// Delete Milestone Route (admin-only)
// Identifies a milestone by participant ID + title and removes it
app.post("/milestones/:participantid/:title/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Gets teh participant id and milestone title from the url
    const participantid = req.params.participantid;
    const title = decodeURIComponent(req.params.title);

    // Delete the milestone that matches this participant and title
    await knex("milestones")
      .where({ 
        participantid: participantid,
        milestonetitle: title 
      })
      .delete();

    // Redirect back to milestones
    res.redirect("/milestones");

  //Error Handling
  } catch (err) {
    console.error("Delete milestone error:", err);
    res.redirect("/milestones?error=Delete%20failed");
  }
});

// ---- HTTP 418 route ----
app.get("/teapot", (req, res) => {
  res.status(418).send("I'm a teapot. ☕");
});

// 404 Route
app.use((req, res) => {
  res.status(404).send("404 - Not Found");
});

// ---- Start server ----
app.listen(port, host, () => {
  console.log(`Server running on http://${host}:${port}`);
});
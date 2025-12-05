# 🌸 Ella Rises Program Management Platform  
_INTEX Capstone • Node.js + Express + EJS + PostgreSQL_

A full-stack web application built to help **Ella Rises** manage participants, events, surveys, milestones, and donations — while giving managers a clean analytics view of impact over time.

---

## 🔗 Live Site & Demo Logins

**Live App:** https://intex-1-7.is404.net  

Use these example accounts to explore the different roles:

### Manager / Admin Account
- **Email:** `ella.johnson0@learners.net`  
- **Password:** `ella.johnson1!`  

### Common User (Participant) Account
- **Email:** `penelope.martinez4@studentmail.org`  
- **Password:** `penelope.martinez1!`  

> ⚠️ These credentials are for **demo / grading purposes only**.  

## 🌼 Project Overview

Ella Rises is a nonprofit focused on empowering young women through **STEAM (STEM + Arts)** programs.  
This application is an internal/external platform that:

- Provides a **public-facing experience** for donors and supporters.
- Gives **managers/admins** a secure way to manage:
  - Participants
  - Events
  - Post-event surveys
  - Participant milestones
  - Donations
  - User accounts
- Embeds a **dashboard** to track satisfaction, usefulness, recommendation scores, and long-term impact KPIs.

The app is designed to match the visual language of **https://www.ellarises.org/** with:
- Clean, spacious layouts  
- **Charcoal** base text, **blush/pink** accents, and **warm peach** highlights  
- Rounded cards, soft shadows, and accessible typography  

---

## ✨ Core Features

### Authentication & Roles
- Email + password login using **Express sessions**.
- Two primary roles:
  - **Manager/Admin** – full CRUD access to all entities + user management.
  - **Common User/Participant** – view-only for most data, limited actions.

### Public Site & Donation Flow
- Public landing-style donate page at `/donate`.
- Visitors can:
  - Submit contact info and donation amount.
  - See inline validation errors and success messages.
- Donations are stored in a **relational Postgres database** for reporting.

### Participants
- Manage basic participant info (name, contact details, school/employer, field of interest).
- Field of interest aligned with mission: **Arts, STEM, or Both**.
- Search bar for quick filtering by:
  - Name
  - Email
  - Role (e.g., search “admin” or “participant”)
  - Other common fields

### Events
- CRUD for Ella Rises events:
  - Name, type, start/end datetime, location, capacity.
- List + table view with:
  - Search/filter bar (e.g., by event name or type).
  - Action buttons (edit, delete) for managers.
- Edit flow uses a **modal / form-style experience** consistent with the site’s design.

### Surveys (Post-Event)
- Surveys link **participants** to **events**.
- Captures key scores:
  - Satisfaction (S)
  - Usefulness (U)
  - Instructor (I)
  - Recommendation (R)
  - Overall (O)
  - NPS (Net Promoter Score)
- Table view with:
  - Clean layout
  - Legend for score abbreviations
  - Long free-text comments truncated with a “see more” style toggle to keep the table readable.

### Milestones
- Milestones model the journey of each participant:
  - Examples: application submitted, program completed, scholarship received, STEAM major, STEAM job, etc.
- Implemented as a **1-to-many** relationship between participants and milestones via a join table.
- Accessible from the Participants page via a dedicated “Milestones” action.

### Donations (Internal View)
- Managers can browse a table of donations:
  - Donor name, email, amount, date, notes.
- Search functionality to filter by donor name, email, or other fields.
- Supports both **public donation submission** and **internal review**.

### User Maintenance (Manager Only)
- Admin/manager role can:
  - View list of users.
  - Control roles (manager vs participant) as needed.
- Protected via role-based middleware.

---

## 🔐 Roles & Permissions
Route protection is handled via middleware such as:

- `requireAuth` – ensures the user is logged in.
- `requireAdmin` – ensures the user has manager/admin privileges.

---

## 🧰 Tech Stack

**Backend**
- Node.js  
- Express.js  
- Knex.js (SQL query builder)  
- PostgreSQL (managed on AWS RDS in production)

**Frontend**
- EJS templates (server-side rendering)  
- CSS (custom styles in `/public/css/styles.css`)  
- Responsive layouts with centered containers and scrollable tables

**Auth & Sessions**
- `express-session` for login sessions
- Server-side role checks for access control

**Hosting & Infrastructure**
- AWS Elastic Beanstalk (Node.js app)
- AWS RDS (PostgreSQL database)
- Custom domain + HTTPS via AWS

---

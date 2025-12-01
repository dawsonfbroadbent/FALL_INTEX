# Ella Rises - Community Organization Web Application

## Overview
A Node.js Express application with EJS templating for managing community programs, participants, events, surveys, and donations for the Ella Rises nonprofit organization.

## Project Structure
- `index.js` - Main Express server with routes and authentication
- `views/` - EJS view templates
  - `partials/` - Header and footer partials
  - Individual page templates (index, login, participants, events, etc.)
- `public/` - Static assets
  - `css/styles.css` - Main stylesheet

## Tech Stack
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Templating**: EJS
- **Database**: PostgreSQL (via Knex.js)
- **Session**: express-session

## Running the Application
The application runs on port 5000 with host 0.0.0.0 for Replit compatibility.

```bash
npm start
```

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (Replit provides this)
- `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT` - Alternative PostgreSQL credentials
- `SESSION_SECRET` - Session encryption key
- `NODE_ENV` - Environment (production/development)

## Features
- Public landing page with mission information
- Public donation submission
- User authentication (manager/common roles)
- Participant management
- Event management
- Survey management
- Milestone tracking
- User administration (managers only)

## Authentication
- Managers have full CRUD access
- Common users have read-only access
- Public visitors can view landing page and submit donations

## Recent Changes
- Configured for Replit environment (port 5000, 0.0.0.0 host)
- Added EJS view templates matching Ella Rises branding
- Added CSS styling with blush pink/coral color scheme
- Updated database configuration for Replit PostgreSQL

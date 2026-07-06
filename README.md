# Minddrop split structure

Upload these files to the root of the GitHub repository:

- index.html
- app.html
- styles.css
- auth.js
- app.js
- config.js

Flow:
- index.html handles signup, sign-in, and PIN.
- app.html handles the dashboard.
- auth.js redirects to app.html after a valid PIN.
- app.js redirects back to index.html if the user is not signed in or unlocked.

Keep the existing Supabase SQL setup and routine migration already run in the project.

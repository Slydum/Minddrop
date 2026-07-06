# Minddrop + Supabase

A static, GitHub Pages-friendly starter for Minddrop.

## 1. Create the Supabase project

1. Create a new project in Supabase.
2. Open **SQL Editor**.
3. Paste and run `supabase/schema.sql`.
4. Open **Project Settings → API**.
5. Copy the project URL and publishable key.
6. Paste both values into `config.js`.

Do not put a `service_role` key in this website. The browser should only use
the publishable/anon key, with Row Level Security protecting each user's data.

## 2. Configure authentication

In Supabase:

1. Go to **Authentication → URL Configuration**.
2. Set **Site URL** to your future GitHub Pages URL:
   `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/`
3. Add the same URL under redirect URLs.
4. Email/password authentication can remain enabled.

For faster testing, you may temporarily disable email confirmation in the
email provider settings. Re-enable it before sharing the app publicly.

## 3. Test locally

Because the app uses JavaScript modules, serve the folder rather than opening
`index.html` directly:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## 4. Push to GitHub

```bash
git init
git add .
git commit -m "Initial Minddrop Supabase app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/minddrop.git
git push -u origin main
```

## 5. Turn on GitHub Pages

1. Open the repository's **Settings**.
2. Choose **Pages**.
3. Under source, select **Deploy from a branch**.
4. Select `main` and `/ (root)`.
5. Save.

After GitHub gives you the public URL, add it to the Supabase authentication
Site URL and redirect URL settings.

## Current behavior

- Works locally without Supabase using browser local storage.
- Uses Supabase after a user signs in.
- Each user can only read and modify their own rows because RLS is enabled.
- Enter saves; Shift+Enter creates a new line.
- Tasks are automatically sorted into four categories.
- Dark and beige light modes are included.

## Next database tables

After the first deployment works, add:

- `daily_routines`
- `weekly_routines`
- `routine_completions`
- `user_preferences`

Keep the first release small until sign-in, saving, loading, updating, and
deleting are confirmed.

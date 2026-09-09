# MoveList · Our Home

A private, multi-user move-in shopping tracker designed specifically around the supplied house floor plans.

## What this version adds

- Email/password login
- One admin account that can create additional accounts
- No public self-registration
- A shared household list visible/editable by every signed-in account
- A private personal list for each account
- Cloud-backed data that survives sign-out and works across devices
- The supplied ground-floor and first-floor plans built directly into the site
- Room shortcuts from each floor plan
- Dedicated **Office** room for the garage conversion
- Purchase links, quantities, priority, status, estimates and actual spend
- “Added by …” attribution on shared items
- Account display-name and password changes
- Responsive phone/desktop design

## Architecture

GitHub Pages hosts the static website. Supabase provides:

- Auth for secure sign-in
- Postgres for persistent shared/private lists
- Row Level Security (RLS) so personal lists remain private
- One small Edge Function used by the admin to create new accounts securely

**Important:** GitHub Pages by itself cannot securely provide login + cross-device persistent data because it only serves static files. The browser-facing Supabase publishable/anon key is safe to put in `config.js` when RLS is configured. Never put a Supabase `service_role` secret in GitHub or any browser file.

---

# Setup — about 15 minutes

## 1. Create a Supabase project

Create a project at Supabase and keep it open.

## 2. Run the database setup

In Supabase:

1. Open **SQL Editor**.
2. Create a new query.
3. Paste the entire contents of `supabase/schema.sql`.
4. Run it.

This creates the profiles/items tables, permissions, RLS policies and user-profile trigger.

## 3. Create the first admin login

In Supabase Auth, create your first user manually using the email/password you want for the admin.

Then return to **SQL Editor** and run:

```sql
select public.set_admin_by_email('YOUR-ADMIN-EMAIL@example.com');
```

Use the exact email address you created.

## 4. Disable public sign-up

In Supabase Auth settings, turn off public/new-user sign-up. The exact wording can vary slightly by dashboard version.

New users will then only be created from MoveList by the admin account.

## 5. Deploy the `create-user` Edge Function

### Option A — Supabase CLI

Install/login to the Supabase CLI, then from this project folder:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy create-user
```

The function uses Supabase's built-in server environment variables, including the service-role key. Do **not** copy the service-role key into the website.

### Option B — Supabase Dashboard

You can also create/deploy an Edge Function from the Supabase dashboard and paste the contents of:

`supabase/functions/create-user/index.ts`

Name the function exactly:

`create-user`

## 6. Put the public Supabase values in `config.js`

Open:

`config.js`

Replace the placeholders with your Supabase project URL and the browser-safe **publishable key** (or legacy anon key):

```js
window.MOVELIST_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_KEY: "YOUR_PUBLIC_KEY"
};
```

These values can be committed to a public GitHub Pages repository. Security is enforced in the database with RLS.

## 7. Publish to GitHub Pages

1. Create a GitHub repository.
2. Upload everything in this folder to the repository root.
3. Commit/push the files.
4. Go to **Settings → Pages**.
5. Set deployment to **Deploy from a branch**.
6. Select `main` and `/ (root)`.
7. Save.

Once Pages finishes deploying, open the generated URL and sign in with the admin account.

---

# Admin workflow

After signing in as the admin:

1. Tap **Admin** in the top-right.
2. Enter a name, email and temporary password.
3. Create the account.
4. Give the new user those credentials.
5. They can sign in and change their password from **Account**.

Every account receives:

- **Shared list** — everyone can see/add/edit/delete items.
- **Their own list** — only that signed-in account can see or change it.

# Rooms included

- Whole House
- Living / Dining
- Kitchen
- Hall
- Downstairs WC
- Ground Floor Store
- Bedroom 1
- En Suite
- Bedroom 2
- Bedroom 3
- Bathroom
- First Floor Store
- Office
- Garden

The Office is intentionally separate because the garage conversion is not shown on the original floor plan.

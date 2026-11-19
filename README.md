# Pulsify — full-stack community chat starter

Pulsify is a Discord-inspired community app built with React + Vite, Supabase Auth/Postgres/Realtime/Storage, and Cloudflare Pages hosting.

## Included in this package

- Email/password sign-up and sign-in
- Profiles (display name, username, bio, role field)
- Servers and server membership
- Text channels
- Realtime message refresh through Supabase Realtime
- Edit/delete own messages
- Replies (stored as a parent message reference)
- Emoji reactions
- Pin field in the database
- File/image attachments
- Friend request records
- Direct-message database table
- Reports, audit log, badges, XP/level profile fields
- Responsive dark/light interface

## Honest feature boundaries

This is a functional community-chat foundation, not a complete Discord clone. The current interface wires up accounts, servers, channels, messages, reactions, basic replies, profile editing, friend request creation, and attachments. Some schema-backed features (full DM conversation UI, invite links, server discovery, moderation dashboard, badge assignment, XP award rules, and pin management) still need their own UI and trusted server-side workflows. Voice/video, screen sharing, push notifications, end-to-end encryption, and unlimited scale are not supplied by this free-tier stack.

Do not treat a public storage bucket as private file storage. Files in `pulsify-uploads` are publicly readable to anyone with the URL. Use it only for non-sensitive community media. For private uploads, change the bucket to private and implement signed URL access before launch.

## Part 1 — Create Supabase

1. Go to https://supabase.com/ and create an account.
2. Create a new project named `Pulsify`.
3. Choose a strong database password and save it somewhere safe. Do not put it in the website files.
4. Wait until the project finishes provisioning.
5. Open **SQL Editor** → **New query**.
6. Open `supabase/schema.sql` from this project, copy the entire file, paste it into SQL Editor, and click **Run**.
7. Check the results for errors. If a line fails, stop and share the exact error rather than continuing with a partly-created database.
8. Open **Project Settings → API** (or API Keys). Copy the Project URL and the publishable key (or legacy anon/public key). Never copy the `service_role` secret key into the frontend.

Supabase documentation: https://supabase.com/docs

## Part 2 — Configure email sign-in

1. In Supabase, open **Authentication → Providers → Email**.
2. Keep Email enabled.
3. For easiest initial testing, you can turn off email confirmation temporarily in **Authentication → Settings** if that option is available in your project. Before inviting the public, turn email confirmation back on and configure the email templates/SMTP options you need.
4. In **Authentication → URL Configuration**, add your eventual Cloudflare Pages URL to the Site URL and Redirect URLs after you deploy. For local testing, add `http://localhost:5173`.

Do not share accounts or passwords. Use test accounts you control.

## Part 3 — Add your Supabase keys to Pulsify

1. Extract the ZIP file.
2. In the `Pulsify_Complete` folder, find `.env.example`.
3. Make a copy and name the copy `.env` (the filename begins with a dot).
4. Open `.env` in a text editor.
5. Replace the placeholder values:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
   ```

6. Save. The publishable/anon key is designed for frontend use when RLS is configured. Never use the service-role key here.

## Part 4 — Run locally (optional)

You need Node.js installed. On a Chromebook, Linux development environment may need to be enabled first; if you do not have that, skip local testing and use GitHub + Cloudflare Pages.

In a terminal, inside the `Pulsify_Complete` folder:

```bash
npm install
npm run dev
```

Open the local URL Vite prints, usually `http://localhost:5173`.

## Part 5 — Upload to GitHub

1. Go to https://github.com/ and create/sign in to an account.
2. Create a new repository named `pulsify`. A private repository is fine.
3. Upload the contents of the extracted `Pulsify_Complete` folder to the repository. Upload the files and folders inside it, not the ZIP itself.
4. Do not upload `.env`. The `.gitignore` is included to help prevent that if using Git.
5. Confirm the repository contains `package.json`, `index.html`, `src/`, and `supabase/`.

GitHub's browser upload can be used for small projects. If it is easier, you can use GitHub Desktop on a supported computer.

## Part 6 — Deploy on Cloudflare Pages

1. Go to https://dash.cloudflare.com/ and create/sign in to an account.
2. Open **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Connect GitHub and choose the `pulsify` repository.
4. Set:
   - Framework preset: **Vite**
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Under environment variables, add:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable/anon key
6. Click **Save and Deploy**.
7. When it finishes, open the `https://your-project.pages.dev` address Cloudflare gives you.

Cloudflare's current Vite deployment guide: https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite-site/  
Build settings reference: https://developers.cloudflare.com/pages/configuration/build-configuration/

## Part 7 — Connect Supabase Auth to your public URL

1. Copy your Cloudflare Pages URL.
2. In Supabase, open **Authentication → URL Configuration**.
3. Set **Site URL** to your Pages URL.
4. Add the Pages URL to **Redirect URLs**.
5. Save.

## Part 8 — Test it

1. Open the public Pages URL.
2. Create an account.
3. Create a server.
4. Create a channel.
5. Send a message and test reactions/edit/delete.
6. Open the site in another browser profile and create a second test account.
7. Invite/join flow is not yet implemented in this package, so the second account will not automatically see the first account's private server. Do not loosen RLS to make it public; proper invite links need a secure server-side join function.

## Troubleshooting

- **"Supabase connection missing"**: Check that the Cloudflare environment variables are set exactly and redeploy.
- **Invalid API key**: Use the publishable/anon key, not the service-role secret.
- **Email confirmation message**: Confirm the account from its email or adjust the Auth confirmation setting for testing.
- **No servers shown**: The signed-in user has to be a member of a server. Server creation should add the owner membership row.
- **Messages fail**: Check that `schema.sql` ran completely and that the current user is a member of the selected server.
- **Cloudflare build fails**: Check that `package.json`, `src/`, and `index.html` are at the repository root and the build settings are `npm run build` / `dist`.

## Security checklist before public launch

- Keep Row Level Security enabled on every table.
- Never put the Supabase service-role key in frontend code or GitHub.
- Use email confirmation and a sensible password policy.
- Add rate limiting / abuse controls and moderation workflows before opening to strangers.
- Avoid collecting personal details you do not need.
- The included public storage bucket is only for non-sensitive images/files.
- Free tiers have quotas and can change; review provider pricing/limits before inviting a large community.

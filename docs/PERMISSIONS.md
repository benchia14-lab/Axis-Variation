# Permissions

Who can see and do what in Axis Variations.

## Profiles

Everyone who signs in with Microsoft gets a profile, keyed by their email
(Supabase table `av_users`). **Administrator settings → Profiles** lists them:
name, email, level, offices, first and last sign-in.

## Levels

| Level | Can |
|---|---|
| **Administrator** | Everything, in every office, including Settings and Administrator settings |
| **Editor** | Create, edit, save and issue variations; set up projects — in their offices and projects |
| **View only** | Open the offices, projects, dashboards and variations they are given; nothing is saved |
| **No access** | Nothing: the app says to ask the administrator |

Each person is also given **offices** (every office, or chosen ones) and, per
office, **projects** (every project, or chosen ones). Projects and variations
outside that are not shown, and a save to them is refused.

Settings (the office register) and Administrator settings are for
administrators only.

## Setting it up

1. Sign in, open **Settings → Administrator settings** (password), **Permissions**.
2. Pick yourself and make yourself **Administrator**. Until somebody is an
   administrator nothing is restricted, so nobody is locked out the day this
   goes live; saving the first administrator switches it on.
3. Everyone else appears once they have signed in. Pick each one, give them a
   level, offices and projects, and save. They get it the next time they open
   or reload the app.
4. Under **Someone signing in for the first time**, choose what a new profile
   starts with (default: No access, until you set them up).

## How far it goes

These permissions decide what the app shows and what it will save. They are
not a lock on the database itself: the database answers anyone holding the
app's publishable key, which is in the page. Making the database refuse
people needs Supabase sign-in linked to Microsoft (Entra) and row-level
policies per person — a further step, if it is ever wanted.

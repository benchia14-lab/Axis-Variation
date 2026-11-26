# Supabase — where the app keeps its data now

Projects, the variation log, the variation files and each project's agreed
schedule of rates now live in **Supabase**, not in SharePoint lists. The only
thing still sent to SharePoint is the **issued PDF**: **Download PDF** files it
into the project's folder, through the *File the PDF* flow, as before.

| What | Was | Now |
|---|---|---|
| Projects | The SharePoint project register, read by flow 1 | **Project setup** in the app, per office → `av_projects` |
| The variation log | The Variation History list, read by flow 4, written by flow 5 | `av_variations` |
| Variation files (the form plus its attachments) | Attached to the log row by flow 5, read back by flow 6 | The `av-files` bucket, `variation-files/<office>/<project>/<ref>.json` |
| Agreed schedules of rates | An Excel file named in the register's `RatesFile` column, fetched by flow 7 | Dropped into the project's setup → `av-files`, `rates/<project>/…` |
| The office register (letterhead, logo, colour) | Edits saved to one browser, or exported as `assets/state-register.js` | Settings → Office register → **Save register** → `av_offices` |
| The issued PDF | Filed by flow 2 | **Unchanged** — filed by flow 2 into the project's SharePoint folder |

The Supabase project is **`jpodxbzhzgndujdaqldl`** (the same one as the other
Axis apps). The app's address and publishable key are in
`assets/supabase-config.js`; blank either and the app falls back to the
SharePoint flows exactly as before.

---

## Setting a project up

On an office's projects page: **+ New project**. On a project's dashboard:
**Project setup** to change it. The fields are the register's:

Project name · Project number · Head contractor · Attention · Recipient address ·
Issued by · Position · PM email · Clause ref · SharePoint folder for the PDFs ·
SharePoint site (only if it is not the filing flow's usual one) · Active

**Agreed schedule of rates:** drop the project's Excel workbook on the form (or
browse to it). It is read straight away — a file that is not a schedule of
rates is turned away, saying why — and stored when you save. Every variation on
the project is then priced from it; without one the master rates are used.
Drop another workbook to replace it, or **Remove** to go back to the master
rates.

Projects are never deleted. Untick **Active** and the project leaves the
projects page and the cover sheet's list; the projects page lists inactive
projects at the bottom, and opening one lets you tick it back.

---

## Bringing the SharePoint data across

**Administrator settings → E · Bring projects and variations across from
SharePoint.**

1. In SharePoint, open the project register and **Export → Export to CSV**.
   Do the same for the Variation History list.
2. Drop each CSV on its box and press **Import**.

- Projects go into their office's setup. Rows with no State go to the office
  picked beside the button.
- Variations go into the log with their saved forms, statuses, values,
  approvals, builder commentary and issued dates. Variations deleted in
  SharePoint stay deleted (they are in **Deleted variations**).
- A variation whose project is not in the register export — another office's,
  usually — gets its project set up from what the variation says about it.
- **Safe to run again.** A project already set up (same office, and the same
  register ID or the same name) is left as it is; a variation is saved over its
  own row.
- **Variation files do not come across**: a CSV export has no attachments. For
  each variation that had one, open its `.json` from the SharePoint list with
  *open a file from this computer* on the cover sheet, then **Attach to the log
  now** on the review tab.
- Do one office's register at a time if they are separate lists; the history
  can be the group-wide one.

---

## The flows now

| # | Flow | Status |
|---|---|---|
| 1 | Get projects | **No longer used** — projects are set up in the app |
| 2 | File the PDF | **Still used** — files each issued PDF into the project's SharePoint folder |
| 3 | Write professionally | Still used if you want it (optional; not a SharePoint list) |
| 4 | Variation log — read | **No longer used** |
| 5 | Variation log — write | **No longer used** |
| 6 | Open a variation file | **No longer used** |
| 7 | Get agreed rates | **No longer used** — rates are dropped into the project's setup |

Turn flows 1, 4, 5, 6 and 7 off in Power Automate once the import is done and
the team is using the app (**My flows → … → Turn off**). Keep them, turned off,
until you are sure nothing is missing. Their URLs can stay in
`assets/flow-config.js`; the app no longer calls them, and Administrator
settings hides their boxes.

**SharePoint itself:** the project register and the Variation History list are
no longer read or written. Keep them as a read-only archive, or delete them
once you have checked the import. The project folders stay — that is where the
PDFs are filed.

---

## Who can read and write it

The same model as the other Axis apps in this Supabase project: the app's
**publishable key** can read and write the `av_` tables and the `av-files`
bucket (row-level security policies `av read …`, `av add …`, `av update …`).
There is **no delete policy**: nothing can be deleted through the key —
variations are marked deleted and projects made inactive.

The publishable key is in the page, as it is in every Supabase web app, so the
Microsoft sign-in stops people *using* the app but not someone who has the key
calling Supabase directly. To close that, the policies need to require a
signed-in user: Supabase's own sign-in with the Azure (Entra) provider, or a
check on a Microsoft token in an edge function. That is a change for all the
Axis apps sharing this project together, not this one alone.

---

## The tables

**`av_projects`** — `id`, `state`, `title`, `project_number`, `head_contractor`,
`recipient_address`, `attention`, `issued_by`, `position`, `pm_email`,
`folder_path`, `site_url`, `clause_ref`, `active`, `rates_path`, `rates_name`,
`rates_uploaded_at`, `legacy_id` (the SharePoint register's ID, for imported
projects), `created_by`, `created_at`, `updated_at`.

**`av_variations`** — one row per office + project + reference (unique):
`state`, `project_id`, `variation_ref`, `base_ref`, `revision`, the letter's
fields as columns (`project`, `project_number`, `variation_description`,
`head_contractor`, … `drawings_text`, `day_sheets_text`), `status`,
`value_ex_gst`, `approved_value`, `approved_date`, `builder_commentary`,
`deleted`/`deleted_at`/`deleted_by`, `payload` (the whole form, as the app saves
it), `variation_file_path`, `downloaded_at`, `updated_at`.

**`av_offices`** — one row per office code: `code`, `details` (only the fields
changed from `assets/state-register.js` — name, entity, ABN, ACN, phone,
email, address, logo, brand colour, intro, closing), `updated_by`,
`updated_at`. **Reset to shipped values** empties every row's `details`.

The columns are there to read and report on (Supabase's table editor, or a
Power BI connection); the app restores a variation from `payload`.

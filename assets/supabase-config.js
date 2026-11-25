/* Where the app keeps its projects, its variation log, the variation files
   and each project's agreed schedule of rates: a Supabase project, shared by
   everyone who opens the site.

   The publishable key is meant to be public -- it is in every Supabase web
   app. What it may do is set by the row-level security policies on the av_
   tables and the av-files bucket (docs/SUPABASE.md). Blank either value and
   the app falls back to the SharePoint flows. */
const SUPABASE = {
  url: 'https://jpodxbzhzgndujdaqldl.supabase.co',
  key: 'sb_publishable_Kh79N8riw46JdQDkClAT_A_MqtwGuRz'
};

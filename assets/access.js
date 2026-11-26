/* ============================================================================
   ACCESS — who is signed in, and what they may see and do
   ============================================================================
   Everyone who signs in gets a profile (av_users), keyed by their Microsoft
   email. The administrator gives each one, in Administrator settings →
   Permissions:

     level     admin    everything, every office, and the settings
               editor   creates, edits and issues variations and sets up
                        projects, in their offices and projects
               viewer   sees them, changes nothing
               none     nothing yet: the app tells them to ask

     offices   every office ("*"), or a chosen few
     projects  per office: every project in it ("*"), or a chosen few

   Nothing is restricted until at least one profile is an admin, so the day
   this goes live nobody is locked out -- the first job is to make yourself an
   admin. A copy opened from this computer (no sign-in) is never restricted.

   What a person sees is narrowed in assets/db.js, where every read and write
   goes: projects and variations they have no access to are never returned,
   and a save they are not allowed is refused there.

   HOW FAR THIS GOES. This decides what the app shows and does. It is not a
   lock on the database: the database answers anyone holding the app's
   publishable key, which is in the page. Keeping someone out of the data
   itself needs Supabase sign-in tied to Microsoft and row-level policies per
   person -- see docs/PERMISSIONS.md.
============================================================================ */

const Access = (function(){

  const LEVELS = ['admin', 'editor', 'viewer', 'none'];
  const LABELS = { admin: 'Administrator', editor: 'Editor', viewer: 'View only', none: 'No access' };

  let me = null;          // the profile, or null when nothing is enforced
  let enforced = false;
  let problem = '';

  const email = () => String((window.AXIS_USER && window.AXIS_USER.username) || '').trim().toLowerCase();
  const dbOn = () => typeof AxisDb !== 'undefined' && AxisDb.on();

  // called once, by boot.js, before the app starts
  async function load(){
    me = null; enforced = false; problem = '';
    const who = email();
    if(!who || !dbOn()) return;          // local copy, or no database: nothing to enforce against
    try {
      let profile = await AxisDb.getUser(who);
      if(!profile){
        // a first sign-in gets what new people are set to get
        const start = (await AxisDb.getSetting('new_user')) || {};
        await AxisDb.addUser({ email: who, name: window.AXIS_USER.name || '',
          level: LEVELS.indexOf(start.level) !== -1 ? start.level : 'none',
          offices: Array.isArray(start.offices) ? start.offices : [], projects: {} });
        profile = await AxisDb.getUser(who);
      } else {
        AxisDb.touchUser(who, window.AXIS_USER.name || profile.name).catch(() => {});
      }
      enforced = await AxisDb.hasAdmin();
      me = profile;
    } catch(err){
      console.error(err);
      // the profile could not be read: show nothing rather than everything
      problem = err.message || 'Your access could not be checked.';
      enforced = true;
      me = { email: who, level: 'none', offices: [], projects: {} };
    }
  }

  const level = () => !enforced ? 'admin' : (me ? me.level : 'none');
  const isAdmin = () => level() === 'admin';

  function canOffice(code){
    if(!enforced || isAdmin()) return true;
    if(level() === 'none' || !me) return false;
    return me.offices.indexOf('*') !== -1 || me.offices.indexOf(code) !== -1;
  }

  function canProject(code, projectId){
    if(!enforced || isAdmin()) return true;
    if(!canOffice(code)) return false;
    const rule = me.projects[code];
    if(rule === undefined || rule === '*') return true;
    return Array.isArray(rule) && rule.map(String).indexOf(String(projectId)) !== -1;
  }

  // a change: an editor, in an office (and project) they have; with no
  // office known, being an editor somewhere is as far as it can be checked
  function canEdit(code, projectId){
    if(!enforced || isAdmin()) return true;
    if(level() !== 'editor') return false;
    if(!code) return true;
    return projectId ? canProject(code, projectId) : canOffice(code);
  }

  // what the page shows: body classes the stylesheet hides buttons by
  function apply(){
    const l = level();
    document.body.classList.toggle('perm-view', enforced && l === 'viewer');
    document.body.classList.toggle('perm-noadmin', enforced && l !== 'admin');
  }

  return {
    load: load, apply: apply, level: level, isAdmin: isAdmin, canOffice: canOffice, canProject: canProject,
    canEdit: canEdit, enforced: () => enforced, me: () => me, problem: () => problem,
    LEVELS: LEVELS, LABELS: LABELS
  };
})();

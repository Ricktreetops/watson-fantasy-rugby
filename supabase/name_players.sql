-- Backup only. You do not need this if Richard uses Family logins on the site.
-- Replace the three email addresses, then run once in the Supabase SQL editor
-- after those people have been invited. Richard is named by the first invite.

update public.profiles p
set display_name = v.display_name
from (
  values
    ('REPLACE_WITH_SHARON_EMAIL', 'Sharon'),
    ('REPLACE_WITH_BROOKE_EMAIL', 'Brooke'),
    ('REPLACE_WITH_CAMERON_EMAIL', 'Cameron')
) as v(email, display_name)
join auth.users u on lower(u.email) = lower(v.email)
where p.id = u.id
  and p.display_name is distinct from 'Richard';

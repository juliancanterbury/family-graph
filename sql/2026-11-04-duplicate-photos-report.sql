-- ============================================================
-- READ-ONLY report: likely duplicate photos and where the names are.
-- Changes nothing. Run in the Supabase SQL Editor to see whether names
-- were lost or are just spread across copies of the same photo.
--
-- Before photos have fingerprints, copies are matched on original filename
-- plus pixel size (a copy uploaded twice keeps both). Admin > Find duplicate
-- photos matches on the image itself and is more thorough.
-- ============================================================
with keyed as (
  select p.*,
         coalesce(p.content_hash, lower(coalesce(p.original_filename,'')) || '|' || coalesce(p.width,0) || 'x' || coalesce(p.height,0)) as dup_key
  from photos p
),
groups as (
  select dup_key from keyed
  where dup_key not like '|%' and dup_key not like 'scanned-photo-%' and dup_key not like 'original.%' -- generic names; see the second query
  group by dup_key having count(*) > 1
)
select k.dup_key,
       k.id as photo_id,
       k.created_at,
       k.taken_date,
       (select count(*) from faces f where f.photo_id = k.id) as face_boxes,
       (select string_agg(coalesce(pe.display_name, f.label), ', ' order by pe.display_name)
          from faces f left join people pe on pe.id = f.person_id
         where f.photo_id = k.id and f.person_id is not null) as names_on_this_copy,
       (select count(*) from comments c where c.photo_id = k.id) as comments
from keyed k
join groups g using (dup_key)
order by k.dup_key, k.created_at;

-- Accidental re-uploads: before the 2026-11-04 fix, dragging on the photo in Edit mode (e.g.
-- missing a face box) and letting go over it uploaded the photo again. Those copies most likely
-- came in with the stored file's own name, "original.<ext>". List them with their names:
select p.id, p.created_at, p.original_filename,
       (select string_agg(coalesce(pe.display_name, f.label), ', ')
          from faces f left join people pe on pe.id = f.person_id
         where f.photo_id = p.id and f.person_id is not null) as names_on_this_copy
from photos p
where p.original_filename ilike 'original.%'
order by p.created_at;

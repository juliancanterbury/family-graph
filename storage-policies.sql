-- Create a private bucket named family-media first.

create policy "family media read"
on storage.objects for select to authenticated
using (bucket_id = 'family-media');

create policy "family media upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'family-media');

create policy "family media update"
on storage.objects for update to authenticated
using (bucket_id = 'family-media')
with check (bucket_id = 'family-media');

create policy "family media delete"
on storage.objects for delete to authenticated
using (bucket_id = 'family-media');

-- After removing the "additional operating card" from the Documents page
-- (it's managed exclusively from the dedicated Operating Cards page from
-- now on), the admin asked to wipe every existing row of that type outright
-- rather than leave old data sitting under a slot the Documents page no
-- longer shows anywhere. This is a full, unconditional delete across every
-- company — including any "extra card" currently assigned to a real rider
-- via the Operating Cards page itself, since both pages share this exact
-- same table/doc_type. The admin was warned of this before confirming.
--
-- The card's FORM (operating_card_extra_form) is deliberately NOT included
-- here (an earlier draft of this migration did delete it too, before the
-- admin asked for the form to keep showing in the Documents page per rider,
-- same as the card's own file) — its rows are left untouched.
--
-- Storage objects the deleted rows referenced are NOT removed by this
-- migration (Supabase Storage isn't reachable from plain SQL) — their files
-- become orphaned, unreferenced objects in the rider-documents bucket.

DELETE FROM public.rider_documents
WHERE doc_type = 'operating_card_extra';

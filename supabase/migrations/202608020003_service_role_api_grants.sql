-- The project intentionally disables automatic Data API grants for new tables.
-- The server-only Supabase client still needs explicit access via service_role.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;

alter default privileges in schema public
  grant all privileges on sequences to service_role;

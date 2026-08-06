-- Create Langfuse database in the shared Postgres container.
-- This runs once on first container start via /docker-entrypoint-initdb.d/.
SELECT 'CREATE DATABASE langfuse'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'langfuse')\gexec

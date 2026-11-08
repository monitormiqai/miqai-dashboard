# MIQAI Dashboard

Dashboard mobile-first for viewing a monitored environment, current readings, and content already returned by the MIQAI CORE.

## Current experience

- Five mobile steps: Agora, Cenário, Impactos, Ação, and Fundamento.
- Measurements are displayed from stored readings.
- Scenario, impacts, actions, diagnoses, evidence, and references are displayed only when the CORE supplied them.
- The dashboard creates no intelligence, score, classifications, or recommendations.
- The interface describes the environment and device, never the database connection.

## Supabase access

`src/js/config.js` contains the project's **publishable** key, which is intended to be visible in browser code. Supabase Auth and the database's row-level security policies authorize access to readings. Never put a `service_role` key, secret API key, or device credential in this repository or frontend.

The current MVP grants read-only access for the test user to the MIQAI_SAUDE client and Sala01 environment. The site itself is public; protected readings require a valid Supabase Auth session and are filtered by RLS.

## Run locally

Serve this directory with any static HTTP server and open its local URL. Do not open `index.html` using `file://`.

## Publish

The workflow in `.github/workflows/deploy.yml` publishes only `index.html`, `assets/`, and `src/` to GitHub Pages when changes reach `main`. Documentation and SQL files are excluded from the public website artifact.

## Project references

- [MVP map and integration boundaries](docs/MAPA_MVP.md)
- [Read-only test access SQL](docs/sql/MIQAI_MVP_READ_ONLY_TEST_ACCESS.sql)

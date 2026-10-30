# Agent setup: GridSync Oracle experiment

This repository is a local Oracle XE / JDBC experiment. It serves the included frontend and a Node.js API from one server; charging and payments are simulated. It is not the Supabase deployment and must not be treated as production software.

## Start here

Read `README.md` for the complete Windows and SQL*Plus setup. Check `git status` before changing files. Preserve user data and local configuration. The database setup scripts target Oracle XE 11g and are for a **fresh, empty schema**; they are not idempotent migrations. Do not rerun them against an existing schema or recreate/drop an Oracle user as part of normal startup or testing.

Prerequisites: Oracle XE and listener, SQL*Plus, Java 17 JDK, a compatible Oracle JDBC JAR, Node.js and npm. This project was tested on Windows with Oracle XE 11g. Other platforms or Oracle versions may require changes.

From the repository root, after the database is already configured:

```powershell
Get-Service OracleServiceXE, OracleXETNSListener
npm ci
New-Item -ItemType Directory -Force build
javac -d build src/OracleRead.java src/OracleWrite.java
$env:ORACLE_JDBC_JAR = 'D:\ORACLE\app\oracle\product\11.2.0\server\jdbc\lib\ojdbc6.jar'
npm start
```

Set the JDBC path to the actual driver location. The server listens on `127.0.0.1:3199` by default and serves the frontend at `/login`; `PORT` can override the port. The database connection is read from an untracked `db.properties` based on `db.properties.example`. Never print, commit, upload or include its password in logs or issue reports.

The login page has two distinct modes. The browser demo stores its own data in the browser; use **Use real account login** to reach the local Oracle-backed API. The README documents the local test accounts and simulated workflows. New local signup creates an Oracle `APP_USER` row and stores a salted password hash in the ignored `.local-accounts.json` file. Preserve this file: deleting it prevents the associated users from signing in. It is not part of the SQL schema and is not suitable as production authentication.

## Code map

- `frontend/`: browser UI and browser-only demo. The UI calls `/api` on the same origin.
- `server.cjs`: Express API, local login/signup, JDBC process orchestration and request logging.
- `flows.js`: reservation, checkout and charging-session workflows and invoice creation.
- `src/OracleRead.java` / `src/OracleWrite.java`: JDBC database access; recompile both after Java changes.
- `sql-logger.js`: display-only SQL formatting. Keep passwords, bind values and fetched rows out of logs.
- `sql/schema.sql`: initial tables and seed data. `sql/maintenance.sql`, `sql/simulated_flows.sql` and `sql/utc_defaults.sql` are applied afterward; each exits SQL*Plus. See README before running any SQL setup.
- `tests/`: local integration scripts. They require an isolated, configured Oracle experiment database, not a shared or production database.

The Node server starts Java processes for database operations. JDBC queries and request events are printed to the server console; the SQL logger is not a durable Oracle audit log. Avoid assuming a one-to-one relationship between API requests and SQL statements: one request can perform several reads and a PL/SQL block can contain several statements.

## Verify changes

Run checks appropriate to the change. These tests connect to Oracle and may create or modify test records; inspect them before use and run only against an isolated test database. The flow and overlap scripts can leave simulated records behind. The signup and logging scripts clean up their own test records but still touch the database and signup file. Do not delete or overwrite other users' data or credential files to make a test pass.

```powershell
# With the local server already running on port 3199:
node tests/flows.cjs
node tests/overlap.cjs
node tests/signup.cjs

# Starts its own temporary server on port 3201:
node tests/sql-logging.cjs
```

`tests/flows.cjs` and `tests/signup.cjs` accept `TEST_PORT`; `tests/overlap.cjs` currently targets port 3199. The logging test requires port 3201 to be free. The browser demo uses a different data store and is not proof that Oracle integration works. For UI changes, distinguish an actual browser check from API/database tests in your report.

## Current limitations

Local account passwords are stored as hashes outside Oracle because the existing schema has no password column. Fleet mission creation, invoice payments/refunds and invoice PDFs are not implemented. Real payment processing and physical charger control are absent. The local server has simplified authorization and serializes writes in one process; do not infer production security or multi-instance concurrency guarantees.

# GridSync: local Oracle experiment

Run the existing frontend and a Node.js backend locally, using Oracle XE through JDBC. This is an isolated simulated experiment; it does not connect to Supabase or real chargers.

## Prerequisites

- Windows, Oracle XE 11g (database and listener), and SQL*Plus.
- Java JDK 17 (`java` and `javac`) and Node.js/npm.
- An Oracle JDBC driver (`ojdbc6.jar` on the machine used to develop this project).

## 1. Start Oracle

In PowerShell, check the database and listener:

```powershell
Get-Service OracleServiceXE, OracleXETNSListener
```

If necessary, start them from an elevated PowerShell window:

```powershell
Start-Service OracleServiceXE
Start-Service OracleXETNSListener
```

Service names and connection details may differ for another Oracle installation.

## 2. Set up the database once

Skip this section if your Oracle schema already contains this experiment's tables. These scripts are for a **fresh, empty schema** and are not designed to be rerun.

Create a dedicated user. For Oracle XE 11g with local administrative authentication:

```powershell
$env:ORACLE_SID = 'XE'
sqlplus / as sysdba
```

At the SQL*Plus prompt, replace the example password and run:

```sql
CREATE USER gridsync_exp IDENTIFIED BY "YourLocalPassword"
  DEFAULT TABLESPACE users;
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE TRIGGER TO gridsync_exp;
ALTER USER gridsync_exp QUOTA UNLIMITED ON users;
EXIT;
```

From the repository root, connect as the new user and run the scripts below **in order**. Each script exits SQL*Plus, so reconnect before running the next one:

```powershell
sqlplus gridsync_exp@localhost:1521/XE
```

Enter your Oracle password at the prompt, then run:

```sql
@sql/schema.sql
```

Reconnect in the same way for each remaining command:

```sql
@sql/maintenance.sql
@sql/simulated_flows.sql
@sql/utc_defaults.sql
```

Run one command per SQL*Plus connection. `schema.sql` creates the tables and sample data. The other scripts add the maintenance trigger and fields needed for simulated workflows.

## 3. Configure and start the backend

From the repository root, install the Node dependencies:

```powershell
npm ci
```

Copy the database configuration and edit it with your Oracle schema password and connection details:

```powershell
Copy-Item db.properties.example db.properties
notepad db.properties
```

`db.properties` is ignored by Git. Do not commit or share it.

Compile both JDBC programs:

```powershell
New-Item -ItemType Directory -Force build
javac -d build src/OracleRead.java src/OracleWrite.java
```

Set the JDBC driver path for this PowerShell session, then start the backend:

```powershell
$env:ORACLE_JDBC_JAR = 'D:\ORACLE\app\oracle\product\11.2.0\server\jdbc\lib\ojdbc6.jar'
npm start
```

Use the actual path to your Oracle JDBC JAR if it differs. Keep this terminal open. The backend serves the frontend and API on `127.0.0.1:3199`.

## 4. Open the frontend

Go to **http://127.0.0.1:3199/login**. Click **Use real account login** to select the local Oracle-backed API, then sign in:

| Role | Email | Password |
| --- | --- | --- |
| Customer | `customer@local.test` | `LocalExperiment123!` |
| Manager | `manager@local.test` | `LocalExperiment123!` |

These are fixed test accounts. Browser-demo login uses separate browser-local data. The sample customer has vehicle `LOCAL001`.

A customer can create a simulated reservation and request a charging session. A manager can start the session, enter simulated meter readings and complete it to create an invoice. Real charger and payment integrations are not provided. Registration, fleet missions, invoice payments/refunds and invoice PDFs are not implemented in this experiment.

## Stop and restart

Press `Ctrl+C` in the backend terminal to stop it. For later runs, start the Oracle services if needed, set `ORACLE_JDBC_JAR` in the terminal and run `npm start`. The database setup and Java compilation only need to be repeated for a fresh database or after Java source changes.

This is a single-machine prototype with local test credentials and simplified authorization. Keep it on localhost and use test data only.

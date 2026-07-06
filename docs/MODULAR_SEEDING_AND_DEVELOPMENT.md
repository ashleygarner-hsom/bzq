# BZQ Modular Development & Seeding Framework Guide

This guide describes how to develop new code modules (projects) for the BZQ platform, configure their seed data, and authenticate the deployment and seeding utility.

---

## 1. Authentication Methods

The seeding script (`scripts/seed-sheets.js`) supports two distinct authentication methods.

### Method A: Google Cloud Service Account Keys (Recommended for Team Dev & CI/CD)
To bypass manual user authentication, developers can use a Google Cloud Service Account JSON key:

1. **Obtain JSON Key**: Create a Service Account in your Google Cloud Project with the **Service Account Token Creator** and **Drive/Sheets API** enabled. Generate and download a Private Key in JSON format.
2. **Save to Workspace**: Save the key file to the repository root as `service-account.json`. (This file is ignored by `.gitignore` to prevent credentials exposure).
3. **Grant Folder Access**: Copy the Service Account's email address (e.g. `my-sa@project.iam.gserviceaccount.com`) and add it as a **Contributor** or **Content Manager** directly on your target Shared Drive folder.
4. **Automatic Detection**: The seed utility automatically locates `service-account.json` at execution time, signs claims using RS256, fetches access tokens via native `crypto` JWT assertions, and performs all operations under the Service Account identity.

### Method B: User Account OAuth Credentials (Default Fallback)
If `service-account.json` is missing, the tool falls back to the local developer's user credentials:

1. **Clasp/ADC Login**: Run the login command to authenticate:
   ```bash
   gcloud auth application-default login --scopes="https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform"
   ```
2. **Credential Resolution**: The tool reads local clasp authentication files (`~/.clasprc.json`) or application default credentials (`~/.config/gcloud/application_default_credentials.json`) and refreshes them dynamically.

---

## 2. The Lookup & Relationship Engine

Because sequence starting numbers and prefixes are customized at runtime during the installation wizard, all relationship links and lookups must be resolved dynamically.

### How Lookups Work
In Google Sheets, tables reference other tables using key formatting. For example, a Sequence row has the ID `xSC-10000`, and a separate Object Configuration references it by that exact ID.

If the installer shifts the sequence start number to `50000`, the hardcoded references in other tables must also shift to maintain database integrity!

### How to Use Lookups in Seed Files
When writing your module's `seed-data.json`, do not guess what final ID a record will receive. Instead, use the **Template Default ID** (e.g. index-based `00001` or absolute `10000` matching the template starting number):

* **Example: Referencing Sequences in Objects**:
  If `AppsUtilities/seed-data.json` defines the `Sequence` configurations:
  ```json
  "__SequenceConfiguration": [
    ["Sequence", "Sequence Number", "Sequence Name", ...],
    ["", "xSC-00001", "Sequence", ...],
    ["", "xSC-00002", "Objects", ...]
  ]
  ```
  And you want to link an Object Configuration to the `Objects` sequence, use `xSC-00002` in that row:
  ```json
  "__ObjectConfiguration": [
    ["Object ID", "Object Name", "Sequence ID Reference", ...],
    ["", "MyNewObject", "xSC-00002", ...]
  ]
  ```

### The Translation Algorithm
During installation, the engine maps the custom starting numbers you chose:
1. **Identify the Offset**: `offset = Custom Start - Default Start`.
2. **Translate References**: The engine scans every cell value. If it matches a sequence prefix:
   * **Index-Based IDs** (e.g., `xSC-00002`): Translates to `customStart + 2 - 1 = 50001` (formatted as `xSC-50001`).
   * **Absolute IDs** (e.g., `xSC-10002`): Translates to `customStart + (10002 - 10000) = 50002` (formatted as `xSC-50002`).

This ensures all lookup relations and formulas (e.g., `=importrange` references or combined ID columns) are correctly adjusted at runtime.

---

## 3. Parity: Sequence Manager vs. Installation Seed Engine

There is a logical duplication between the Google Apps Script runtime environment and the local Node.js installation seed engine:

* **Apps Script Runtime (`SequenceManager.js`)**: Increments the `Current Value` counter column in `__SequenceConfiguration` by `+1` each time a user creates an object row at runtime. It formats the ID string using:
  ```javascript
  return `${prefix}${currentValue}`;
  ```
* **Node Seeding Utility (`seed-sheets.js`)**: Performs the initial counter allocation during environment bootstrapping and module installs. It counts the number of data rows being seeded for a sheet and sets:
  ```javascript
  row[7] = startingNumber + seededRowsCount;
  ```
  It formats sequence IDs during parsing using:
  ```javascript
  const formattedNum = String(absNum).padStart(formatStr.length, '0');
  return `${newPrefix}${formattedNum}`;
  ```

### Developer Requirement
Both files must be maintained in tandem. If you modify the ID formatting string rules (e.g., adding suffixes, separators, or changing digit padding calculations) in `AppsUtilities/SequenceManager.js`, you **MUST** update the formatting math in `scripts/seed-sheets.js` to ensure that initially seeded records and runtime-generated records share identical formatting patterns.

---

## 4. Module Conventions & Directory Structure

To maintain a repeatable, self-contained pattern, every BZQ module (Apps Script project) is structured as a dedicated folder in the repository:

```text
{Module Name}/
├── appsscript.json            # Google Apps Script project manifest and dependencies
├── seed-data.json             # Seed data to write/append when this module is installed
└── {Source Files}.js          # Class definitions, business logic, and scripts
```

---

## 5. CLI Execution & Bootstrapping

### To Cold-Deploy a Dev Environment from Nothing:
```bash
./bzq bootstrap-dev <env-name> <parent-folder-id>
```
*Example:*
```bash
./bzq bootstrap-dev LOCAL_ASHLEYGARNER-HSOM 13n8-ylbfDFcu8ZGlB9JTTLP2crFVEj3J
```

### To Install or Update a Single Module on an Existing Environment:
```bash
./bzq install-module <module-name> <env-name> <parent-folder-id>
```
*Example:*
```bash
./bzq install-module FormsEngine LOCAL_ASHLEYGARNER-HSOM 13n8-ylbfDFcu8ZGlB9JTTLP2crFVEj3J
```

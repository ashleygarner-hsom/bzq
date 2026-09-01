# BZQ Modular Development & Seeding Framework Guide

This guide describes how to develop new code modules (projects) for the BZQ platform, configure their seed data using our **Namespaced Stable ID Seeding** architecture, and manage environmental deployment.

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

## 2. Namespaced Stable ID Seeding Architecture

To keep the platform robust, extensible, and upgradable, BZQ modules are fully compiled and seeded using schema-driven App Script metadata files: `Objects.js` and `Data.js`. This architecture separates object schemas from row data records, guaranteeing zero data loss during package updates and localizations.

### A. Object Definitions (`Objects.js`)
Each BZQ module declares its managed business objects in an `Objects.js` file, assigning a unique, permanent `StableId` integer:

```javascript
// AppsUtilities/Objects.js
function getObjects_AppsUtilities() {
  return [
    { Name: "Sequence", StableId: 1000, Datasheet: "SequenceConfiguration" },
    { Name: "Object", StableId: 1001, Datasheet: "ObjectConfiguration" },
    { Name: "Lookup", StableId: 1002, Datasheet: "LookupConfiguration" }
  ];
}
```

### B. Seed Records (`Data.js`)
All seed data rows are configured as structured key-value maps inside `Data.js`, keyed by their stringified `StableId`:

```javascript
// AppsUtilities/Data.js
function getSeedData_AppsUtilities() {
  return {
    "1000": [ // SequenceConfiguration
      {
        "Sequence Name": "Sequence",
        "Datasheet Name": "SequenceConfiguration",
        "Sequence Prefix": "xSC-",
        "Starting Number": 10000,
        "Format": "0000#",
        "Current Value": 10000,
        "Enabled": true
      }
    ],
    "1001": [ // ObjectConfiguration
      {
        "Object Name": "Sequence",
        "Datasheet": "SequenceConfiguration",
        "Enabled For Validation": true,
        "Spreadsheet": "AppsUtilities.1005.1",
        "Id Field Name": "Sequence Number",
        "Header Number": 1,
        "Sequence": "AppsUtilities.1000.1"
      }
    ]
  };
}
```

### C. Delta Seeding & Schema Extensions
The seeding engine supports **Delta Seeding**. Downstream modules (like `FormsEngine`) can append new fields/columns and update rows on upstream objects (like those in `AppsUtilities`) by specifying namespaced stable ID keys:

* **Append Schema Columns**: If a downstream seed record introduces a new column (e.g., `"Default Form"`), the compiler dynamically appends that header to the first row of the physical worksheet.
* **Preserve Calculated Columns**: Any field omitted in a seed row object (such as formulas calculated via `=ARRAYFORMULA(...)`) is preserved and completely untouched, preventing formula corruption.

---

## 3. Database Schema Reference

To prevent column shifting, data truncation, or formula corruption, all BZQ database sheets MUST adhere strictly to the following standard multi-column layouts:

### A. `ObjectConfiguration` (13 Columns)
Defines metadata, target locations, validation parameters, and sequence associations for all business objects.

| Column Index | Field Name | Type / Formula | Purpose / Description |
| :---: | :--- | :--- | :--- |
| **0** | `Object` | `Formula` | Calculated concatenated identifier. <br>Formula: `=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,"0000#") & " - " & C2:C, ), ))` |
| **1** | `Object Number` | `String` | Unique sequential identifier generated by the `Objects` sequence (e.g., `xOC-1001`). |
| **2** | `Object Name` | `String` | Friendly name of the object. |
| **3** | `Datasheet` | `String` | The physical name of the sheet tab inside its container spreadsheet. |
| **4** | `Enabled For Validation` | `Boolean` | Flag (`true`/`false`) defining whether cells should be evaluated against validation context. |
| **5** | `Spreadsheet` | `String` | Friendly lookup name of the spreadsheet defining where this object resides. |
| **6** | `Spreadsheet Id` | `String` | The 44-character Google Workspace spreadsheet file ID. |
| **7** | `Spreadsheet Url` | `Formula` | Hyperlink to open the spreadsheet directly. <br>Formula: `=if(not(isblank(G2:G)),"https://docs.google.com/spreadsheets/d/"&G2:G,"")` |
| **8** | `Primary Fields` | `String` | Comma-delimited list of primary fields required by the validation context. |
| **9** | `Id Field Name` | `String` | The name of the specific sheet column where the unique sequence auto-number is written. |
| **10** | `Header Number` | `Integer` | The sheet row number containing column headers (the next sequential row is data row 1). |
| **11** | `Sequence` | `String` | Lookup reference linking this object to its primary auto-number sequence definition. |
| **12** | `Custom Line Trigger` | `String` | Optional field name triggering the validation engine to re-run on specific edit events. |

---

### B. `ConfigurationProperties` (3 Columns)
Central registry of environment-level system parameters, API settings, and formatting tokens.

| Column Index | Field Name | Type | Purpose / Description |
| :---: | :--- | :--- | :--- |
| **0** | `Configuration Key` | `String` | Unique uppercase identifier key used to lookup a configuration (e.g. `DEBUG_MODE`). |
| **1** | `Value` | `Any` | System configuration value (Boolean, stringified JSON, or numerical string). |
| **2** | `Notes` | `String` | Developer documentation and comments describing the property's role. |

---

### C. `SequenceConfiguration` (9 Columns)
Defines auto-incrementing sequencing rules, prefix formats, and current values.

| Column Index | Field Name | Type / Formula | Purpose / Description |
| :---: | :--- | :--- | :--- |
| **0** | `Sequence` | `Formula` | Concatenated lookup identifier. <br>Formula: `=arrayformula(if(not(isblank(B2:B)),if(not(isblank(C2:C)),text(B2:B,"0000#") & " - " & C2:C,),))` |
| **1** | `Sequence Number` | `String` | Unique sequence metadata identifier (e.g. `xSC-10001`). |
| **2** | `Sequence Name` | `String` | Human-readable name of the sequence context (e.g. `Objects`). |
| **3** | `Datasheet Name` | `String` | Target sheet name where the generated sequence is consumed. |
| **4** | `Sequence Prefix` | `String` | Text value prefixed to the start of each generated ID (e.g., `xOC-`). |
| **5** | `Starting Number` | `Integer` | Baseline reference number for the first generated sequence value (e.g., `1000`). |
| **6** | `Format` | `String` | Digit format and length styling rules (e.g. `000#`). |
| **7** | `Current Value` | `Integer` | The current numerical counter of the sequence, incremented dynamically at runtime. |
| **8** | `Enabled` | `Boolean` | Enables or disables generating new IDs from this sequence. |

---

### D. `Spreadsheets` (7 Columns)
The primary index workbook list containing registered spokes and paths.

| Column Index | Field Name | Type / Formula | Purpose / Description |
| :---: | :--- | :--- | :--- |
| **0** | `Spreadsheet` | `Formula` | Concatenated lookup identifier. <br>Formula: `=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,"0000#") & " - " & C2:C, ), ))` |
| **1** | `Spreadsheet Number` | `String` | Unique sequential identifier (e.g. `xSS-1001`). |
| **2** | `Spreadsheet Name` | `String` | Human-readable friendly name of the workbook (e.g. `Forms Engine`). |
| **3** | `Spreadsheet Id` | `String` | The physical Google Spreadsheet ID dynamically populated during environment setup. |
| **4** | `Spreadsheet Url` | `Formula` | Absolute URL of the workbook. <br>Formula: `=if(not(isblank(D2:D)),"https://docs.google.com/spreadsheets/d/"&D2:D,"")` |
| **5** | `Folder Path` | `String` | Google Drive folder structure path where the spoke resides. |
| **6** | `Notes` | `String` | Documentation notes detailing the workbook's purpose. |

---

### E. `LookupConfiguration` (6 Columns)
Declares relational maps between objects (e.g. dynamic lookup drop-downs in forms and layouts).

| Column Index | Field Name | Type / Formula | Purpose / Description |
| :---: | :--- | :--- | :--- |
| **0** | `Lookup` | `Formula` | Concatenated lookup identifier. <br>Formula: `=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,"0000#") & " - " & C2:C, ), ))` |
| **1** | `Lookup Number` | `String` | Unique sequence lookup configuration key (e.g., `xLC-10001`). |
| **2** | `Lookup Name` | `Formula` | Dynamically formulated description. <br>Formula: `=if(and(not(isblank(D2:D)),not(isblank(E2:E))),D2:D&" lookup to "&E2:E,"")` |
| **3** | `Source Object` | `String` | Parent object that contains the field. |
| **4** | `Target Object` | `String` | Target object whose values are referenced. |
| **5** | `Column Name` | `String` | The target column where lookup validation or values are applied. |

---

### F. `DropdownConfiguration` (5 Columns)
Registers custom dropdown configs and values assigned to layout fields.

| Column Index | Field Name | Type / Formula | Purpose / Description |
| :---: | :--- | :--- | :--- |
| **0** | `Dropdown` | `Formula` | Concatenated lookup identifier. <br>Formula: `=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,"0000#") & " - " & C2:C, ), ))` |
| **1** | `Dropdown Number` | `String` | Unique dropdown key (e.g., `xDC-10001`). |
| **2** | `Dropdown Name` | `String` | Descriptive name of the dropdown. |
| **3** | `Object` | `String` | Lookup reference of the object this dropdown is scoped to. |
| **4** | `Values` | `String` | Comma-delimited list of custom values (e.g., `Yes, No`). |

---

### G. `GlobalDropdownConfiguration` (7 Columns)
Lists global key-value arrays available organization-wide across all worksheets.

| Column Index | Field Name | Type / Formula | Purpose / Description |
| :---: | :--- | :--- | :--- |
| **0** | `Global Dropdown`| `Formula` | Concatenated lookup identifier. <br>Formula: `=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,"0000#") & " - " & C2:C, ), ))` |
| **1** | `Global Dropdown Number` | `String` | Unique global dropdown config key. |
| **2** | `Dropdown Name` | `String` | Key name used to reference this global dropdown list. |
| **3** | `Field Name` | `String` | Specific field this validation context links to. |
| **4** | `Value` | `String` | Individual list item string value. |
| **5** | `Order` | `Integer` | Sorting order placement index. |
| **6** | `Active` | `Boolean` | If this global list value is enabled for use. |

---

## 4. The Lookup & Relationship Engine

Because sequence starting numbers are generated dynamically during environmental setup, all cross-module relationship links and sequence mappings must be resolved at compiler execution time.

### A. Dot-Notation Row References
To map lookups or dependencies in seed files, use our **Namespaced Dot-Notation Indexing** pattern:
`{ModuleName}.{StableId}.{Index}`

* **Example (Index-Based)**:
  `"AppsUtilities.1001.2"` refers to the 2nd record of stable ID `1001` (Object) defined inside `AppsUtilities`.
  At compile-time, the engine automatically calculates its sequence ID (e.g., `"xOC-1001"`) and converts it to its fully combined descriptor `"xOC-1001 - Object"` seamlessly!

### B. Query-Based Filtering
For highly resilient references that survive sorting or item additions, use the **Query-Based Filter** pattern:
`{ModuleName}.{StableId}.filter({FieldName} == "{Value}")`

* **Example (Filter-Based)**:
  `"AppsUtilities.1005.filter(Spreadsheet Name == \"Forms Engine\")"`
  The compiler scans the pre-compiled registry of `AppsUtilities.1005` (Spreadsheets), locates the exact row where `"Spreadsheet Name"` matches `"Forms Engine"`, and resolves it directly to `"xSS-1001 - Forms Engine"`!

### C. Seeding Engine Safety & Strictness Rules
To prevent data contamination or silent sequence corruption, `ModuleManager` enforces strict compile-time checks:
1. **Duplicate StableId Rejection**: If any duplicate StableId definitions are discovered within a single module's `Objects.js`, compilation fails instantly.
2. **Explicit Sequence ID Rejection**: Seed row objects in `Data.js` must **NEVER** contain hardcoded sequence IDs (e.g., `"xOC-1000"`). If the engine detects an explicit sequence prefix in an ID column, it immediately throws an error and rejects the execution.

---

## 5. Parity: Sequence Manager vs. Installation Seed Engine

There is a logical duplication between the Google Apps Script runtime environment and the local Node.js installation seed engine:

* **Apps Script Runtime (`SequenceManager.js`)**: Increments the `Current Value` counter column in `SequenceConfiguration` by `+1` each time a user creates an object row at runtime. It formats the ID string using:
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
//TODO Add automated test(s) to check that both sets of logic match at build time.

---

## 6. CLI Execution & Parameter Sanitization

### CLI Parameter Whitespace & Newline Sanitization
To prevent script failures from terminal wrapping or manual copy-pasting, the BZQ CLI (`bzq-core.sh`) automatically sanitizes incoming parameters. When running bootstrapping or single-module installations, the CLI automatically strips all whitespaces, carriage returns (`\r`), and newline (`\n`) characters from the `env_name`, `parent_id`, and `module_name` variables.

### Troubleshooting Standalone Script Provisioning Errors
If the bootstrap pipeline halts on AppsUtilities or core standalone script provisioning with errors like `Request contains an invalid argument` or authentication re-auth prompts, perform the following verification:
1. **Invalid Auth Session**: Your clasp local credentials session may have expired. Force a refresh by running:
   ```bash
   ./bzq login
   ```
2. **Permission Checks**: Ensure your authorized developer account has owner or manager privileges on the target Parent Folder ID inside Google Drive.

### To Cold-Deploy a Dev Environment from Nothing:
```bash
./bzq bootstrap-dev <env-name> <parent-folder-id> [project-number]
```
*Example (with GCP Linking and Bound Spoke script provisioning):*
```bash
./bzq bootstrap-dev LOCAL_ASHLEYGARNER-HSOM 13n8-ylbfDFcu8ZGlB9JTTLP2crFVEj3J 35459168254
```

> [!NOTE]
> **Google Cloud Platform (GCP) Linking**: 
> Specifying a GCP Project Number (e.g. `35459168254` for `bzq-developers`) automatically triggers:
> 1. Strict validation via `gcloud` to ensure required Workspace APIs (`sheets.googleapis.com`, `drive.googleapis.com`, and `script.googleapis.com`) are fully enabled.
> 2. Automated silent linking of the standalone libraries and Chrome extension projects to the Cloud Project in `.clasp.json`.
> 3. Dynamic provisioning of container-bound script projects inside the newly created Spoke spreadsheets, pushing trigger wrappers and library configurations via the Google Apps Script REST API out-of-the-box.
> 
> *If the GCP project is invalid or missing required APIs, the CLI displays missing dependencies and prompts whether to continue with a standard non-linked deployment as a fallback.*

### To Install or Update a Single Module on an Existing Environment:
```bash
./bzq install-module <module-name> <env-name> <parent-folder-id>
```
*Example:*
```bash
./bzq install-module FormsEngine LOCAL_ASHLEYGARNER-HSOM 13n8-ylbfDFcu8ZGlB9JTTLP2crFVEj3J
```

## 7. CI/CD Staging, Production, & Runtime Authentication Architecture

### A. CI/CD & Pipeline Deployments (Staging / Production)
When deploying higher-order environments programmatically via a CI/CD pipeline (e.g., GitHub Actions, GitLab CI, Cloud Build), direct Service Account authentication (`service-account.json`) will fail when trying to programmatically provision bound Apps Script projects, because Service Accounts are restricted from enabling the required user-level Apps Script API setting.

To resolve this and achieve seamless headless pipeline runs, use one of the following architectural strategies:

1. **OAuth Refresh Tokens for Dedicated Deployer Accounts (Recommended)**:
   - Create a standard Google Workspace User account dedicated to deployments (e.g., `deploy@yourdomain.com`).
   - Log in as this user and toggle the Apps Script API switch to **"On"** at `https://script.google.com/home/usersettings`.
   - Obtain an OAuth Refresh Token for this user (via `clasp login` or OAuth playground).
   - Store the Client ID, Client Secret, and Refresh Token as secrets in your CI/CD repository settings.
   - Configure the pipeline to inject these credentials during execution. Because this runs in a real user context, all programmatic script project and file creations succeed flawlessly.

2. **Domain-Wide Delegation of Authority (DWD)**:
   - If using a GCP Service Account is mandatory, your Google Workspace Administrator can configure **Domain-Wide Delegation** on the Service Account.
   - Authorize the Service Account's Client ID inside the Workspace Admin Console (`admin.google.com`) with the scope:
     `https://www.googleapis.com/auth/script.projects`
   - Configure your deployment scripts to perform user impersonation (e.g., setting the `sub` claim to impersonate `deploy@yourdomain.com` when generating OAuth access tokens).

### B. In-App Runtime Dynamic Provisioning
At runtime, whenever BZQ's core system (such as `ModuleManager` or `SpreadsheetManager`) needs to programmatically provision a new Spoke sheet, custom workflow, or sub-project for a tenant:

- **No Service Accounts / Domain-Wide Delegation Required**: The code is running *natively inside Google Apps Script*.
- **Active User Context Delegation**: Apps Script provides the BZQ runtime with an authorized access token for the **active logged-in user** via `ScriptApp.getOAuthToken()`.
- Because the calling context represents a real Workspace user who has consented to BZQ and already has their Apps Script developer switch enabled, all dynamic REST calls to `https://script.googleapis.com/v1/projects` succeed out-of-the-box securely.

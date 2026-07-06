# BZQ Modular Development & Seeding Framework Guide

This guide describes how to develop new code modules (projects) for the BZQ platform and configure their seed data so that the platform can bootstrap and seed them automatically.

---

## 1. Module Conventions & Directory Structure

To maintain a repeatable, self-contained pattern, every BZQ module (Apps Script project) is structured as a dedicated folder in the repository:

```text
{Module Name}/
├── appsscript.json            # Google Apps Script project manifest and dependencies
├── seed-data.json             # Seed data to write/append when this module is installed
├── .clasp.json                # Project association (locally gitignored, generated on init)
├── {Module}GlobalProperties.js # Global configuration properties available at runtime
└── {Source Files}.js          # Class definitions, business logic, and scripts
```

### Manifest Guidelines (`appsscript.json`)
* Declare pinned version library dependencies (e.g. referencing `AppsUtilities` or `FormsEngine`).
* Place OAuth scopes under `oauthScopes` so the GWAO extension prompts the administrator correctly upon deployment.

### Global Properties
* Every module has a file named `{Module Name}GlobalProperties.js` exposing workbook IDs and configuration variables at runtime. 
* Target sheet IDs are initialized at runtime using the script properties lookup (populated dynamically during bootstrap).

---

## 2. Seed Data Specification (`seed-data.json`)

The `seed-data.json` file defines the initial database records, sequences, lookups, and configurations required for the module's core functionality to operate.

### JSON Structure
The seed file is a dictionary mapping **Spreadsheet Tab Names** to a 2D array representing data rows (headers included):

```json
{
  "__ConfigurationProperties": [
    ["Configuration Key", "Value", "Notes"],
    ["FORMS_ENGINE_ENABLED", true, "Enables BZQ HTML Forms Engine layout parsing"]
  ],
  "__Spreadsheets": [
    ["Spreadsheet Name", "Spreadsheet ID"],
    ["Forms Engine", "${FORMS_SS_ID}"]
  ]
}
```

### Special Placeholders
The installer dynamically replaces these template strings with real Google resources at runtime:
* `${CONFIG_SS_ID}`: The newly created BZQ Core Configuration spreadsheet ID.
* `${FORMS_SS_ID}`: The newly created BZQ Forms Engine spoke spreadsheet ID.
* `${APPS_UTILITIES_SCRIPT_ID}`: The deployed script ID of the `AppsUtilities` library.
* `${FORMS_ENGINE_SCRIPT_ID}`: The deployed script ID of the `FormsEngine` library.
* `${EXTENSION_SCRIPT_ID}`: The deployed script ID of the `extension_scaffold` Add-on.

### Working with Formulas
Seeded cell values starting with `=` (such as `=ARRAYFORMULA(...)` or `=SUM(...)`) are written using the `USER_ENTERED` Sheets API option. Google Sheets automatically parses and evaluates these formulas immediately.

---

## 3. Dynamic Sequence Wizard & Interactive Prompts

When bootstrapping a developer environment using the BZQ CLI:
1. The installer scans all module folders and merges their `__SequenceConfiguration` seed data rows.
2. For each sequence, the BZQ CLI prompts the developer directly in the terminal to customize the **Prefix** and **Starting Number**, showing default baselines:
   ```text
   Configuring Sequence: "Sequence"
     Enter Sequence Prefix (default: xSC-): 
     Enter Starting Number (default: 10000): 
   ```
3. Based on the number of seeded records in the respective sheet (e.g. if we seed 6 sequence configuration rows), the counter's `Current Value` is initialized to `Starting Number + count` (e.g. `10006`) to prevent ID collisions on new record creations.

---

## 4. Runtime Lookup & ID Translations

Because sequences (prefixes and start values) can be customized by developers or administrators at install time, all record IDs and lookup references must be recalculated dynamically.

### Translation Algorithm
The installer tracks the offset between your custom starting value and the template's default value:
$$\text{offset} = \text{Custom Start} - \text{Template Default Start}$$

When parsing the JSON seed data, the installer matches template ID tags (e.g., `xSC-00001` or `xSC-10002`):
* **Index-Based IDs** (where digits are less than the template start, e.g. `xSC-00001` with start `10000`):
  $$\text{Absolute ID} = \text{Custom Start} + \text{digits} - 1$$
* **Absolute-Based IDs** (where digits are greater/equal to the template start, e.g. `xSC-10002` with start `10000`):
  $$\text{Absolute ID} = \text{Custom Start} + (\text{digits} - \text{Template Default Start})$$

### Formatting String Application
The calculated ID is pad-left formatted using the sequence's declared `Format` column (e.g., `0000#` ensures a length of 5, producing `xSC-10000`).

This ensures that all lookup relationship entries (e.g., in `__LookupConfiguration` mapping `xSC-10000 - Sequence` or spoke spreadsheets linking objects) maintain valid integrity at runtime.

---

## 5. CLI Execution & Bootstrapping

To cold-deploy your workspace environment from the terminal:

1. **Verify ADC Scopes**:
   Ensure you have authorized sheets/drive permissions for your Application Default Credentials:
   ```bash
   gcloud auth application-default login --scopes="https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform"
   ```
2. **Execute Bootstrapper**:
   ```bash
   ./bzq bootstrap-dev <env-name> <parent-folder-id>
   ```
   *Example:*
   ```bash
   ./bzq bootstrap-dev LOCAL_ASHLEYGARNER-HSOM 13n8-ylbfDFcu8ZGlB9JTTLP2crFVEj3J
   ```

### To Install or Update a Single Module on an Existing Environment
If you are developing a new module (e.g. `FormsEngine`) and want to deploy it to an existing environment without destroying it:

1. **Execute Module Installation**:
   ```bash
   ./bzq install-module <module-name> <env-name> <parent-folder-id>
   ```
   *Example:*
   ```bash
   ./bzq install-module FormsEngine LOCAL_ASHLEYGARNER-HSOM 13n8-ylbfDFcu8ZGlB9JTTLP2crFVEj3J
   ```

2. **How Upserts are Merged**:
   * **Script Linking**: Resolves current library IDs (like `AppsUtilities`) from your local clasp configurations.
   * **Spreadsheet Lookup**: Dynamically checks your Google Drive folder for `BZQ Core Configuration [envName]` and links to it.
   * **Non-Destructive Merge**: Compares table keys (e.g. key indices in `__ConfigurationProperties` or `__SequenceConfiguration`). It appends only missing records to the existing spreadsheet sheets, preserving user configurations and counters.

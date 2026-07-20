# Biz Qops (pronounced "Biz Chops")

Biz Qops is a business management suite built directly on top of out-of-the-box **Google Workspace** services. It allows small and mid-sized businesses to run core operations such as accounting, sales, point of sale (POS), and vendor management—without expensive third-party subscriptions.

---

## 📂 Repository Structure

The platform is built around a modular architecture where each Google Workspace/Sheets workbook acts as an independent application component linked to a local Git directory:

```text
ESR-Biz_Qops/
├── .gitignore              # Project exclusions
├── README.md               # Onboarding and architecture documentation
├── bzq                     # Master CLI entrypoint (Biz Chops manager)
├── AppsUtilities/          # Core library (business objects, sheet properties, sequencing)
│   ├── .clasp.json         # Apps Script linkage (Git ignored secrets protected)
│   ├── .claspignore        # Target folders upload prevention
│   └── appsscript.json     # Apps Script Manifest
└── BZQ-cli/                # Core CLI source
    ├── bzq-core.sh         # Helper functions and CLI engines
    └── .claspignore-template
```

### Planned Modules
As the suite expands, new directories will follow the same pattern as `AppsUtilities`:
- **`FormsEngine/`** - Dynamic forms schema definition and handling.
- **`AccountingEngine/`** - Ledgers, double-entry transactions, and financial reporting.
- **`SalesEngine/`** - Customer pipelines, CRM integrations, and invoice trackers.
- **`PosEngine/`** - Retail Point-Of-Sale registers and barcode sheet mapping.
- **`VendorManagement/`** - Purchase ordering, supply chains, and vendor ratings.

---

## 🛠️ Onboarding: From Scratch to Development

Follow these steps to set up your local development environment:

### 1. Prerequisites
Ensure you have **Node.js** installed on your system. You can check your version by running:
```bash
node -v
```

### 2. Authenticate with Google
Run the built-in login tool. This will launch a standard Google OAuth consent screen in your web browser:
```bash
./bzq login
```
*Note: Your credentials are saved securely in your system's user home directory (`~/.clasprc.json`) and are never committed to Git.*

### 3. Sync Down a Module
To clone an existing Google Sheets script project (for example, `AppsUtilities`) for the first time, obtain its **Script ID** (found in your Apps Script Project Settings -> Settings -> Script ID) and run:
```bash
./bzq pull AppsUtilities <SCRIPT_ID>
```
This initializes the directory, generates `.clasp.json`, downloads all your online `.gs` files as standard local `.js` files, and sets up a local `.claspignore` ruleset.

### 4. Bootstrapping a Complete Local Environment
If you are starting on a brand new development instance or preparing an environment for an agent to work, you can provision and seed a complete set of application workbooks and script projects in a single step.

Create a parent folder in your Google Drive (e.g., `LOCAL_ASHLEYGARNER-HSOM`), copy its folder ID from the URL, and run:
```bash
./bzq bootstrap-dev LOCAL_ASHLEYGARNER-HSOM <DRIVE_FOLDER_ID>
```
This automatically:
1. Deploys the standalone Apps Script files (`AppsUtilities`, `FormsEngine`, `extension_scaffold`) to your target folder in Google Drive.
2. Dynamically creates a local, git-ignored `EnvConfig.js` mapping file in each workspace.
3. Seeds your Google Drive with the necessary database spreadsheets (e.g., `BZQ Core Configuration LOCAL_ASHLEYGARNER-HSOM`) and configuration tables.

---

## 🧪 UI Testing & Browser Automation

BZQ components are designed with testability in mind. To verify end-to-end user journeys (such as the BZQ Workspace Add-on sidebar, forms, and custom sheets interactions), both developers and AI agents should follow the browser-based test guidelines.

Refer to the official [Testing & Browser Automation Standards](docs/TESTING_AND_BROWSER_AUTOMATION.md) for details on:
- Navigating and testing within Workspace sidebars.
- Simulating mobile viewport/emulated screen layout.
- Accessing console log messages for error assertions.
- Interface design standards for visual correctness and test coverage.

---

## 🤖 Developing and Deploying with Antigravity

Antigravity is your autonomous AI coding partner. By combining the power of local JavaScript development with clasp, you can safely write, refactor, and deploy code without risking workbook data corruption.

### The Development Workflow

```mermaid
graph TD
    A[Ask Antigravity to build feature or fix bug] --> B[Antigravity modifies local JS files]
    B --> C[Run ./bzq push <folder> to upload changes]
    C --> D[Test modifications directly inside the Google Workbook]
    D --> E{Working correctly?}
    E -- Yes --> F[Commit local files to Git repository]
    E -- No --> A
```

### Best Practices:
1. **Interactive Development:** 
   When working on UI widgets, custom sidebars, or complex sheet bindings, tell Antigravity what you want. It will modify your local JavaScript and HTML source files inside your module folder.
2. **Real-time Synchronization:**
   To automatically push saves to your Google Sheets document while editing code, run:
   ```bash
   ./bzq push AppsUtilities --watch
   ```
   Any change saved locally will reflect in Google Sheets within 2 seconds.
3. **Version Control Integration:**
   Always run Git commands on your local environment to track code history.
   ```bash
   git add AppsUtilities/
   git commit -m "feat: implement document sequence manager"
   ```
4. **Deploying Releases:**
   Once testing is successful, tag your deployment via the CLI:
   ```bash
   ./bzq deploy AppsUtilities "Release Description"
   ```

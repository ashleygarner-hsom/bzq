# BZQ CLI (`BZQ-cli`)

The **BZQ CLI** (`BZQ-cli`) provides local development tooling, environment orchestration, automated clasp project management, and database seeding utilities for the **BZQ ERP** platform.

---

## 1. Module Identity & Purpose

- **Tool Name (ID)**: `BZQ-cli`
- **Display Name**: BZQ CLI
- **Executable**: `./bzq` (root wrapper) and `BZQ-cli/bzq-core.sh`
- **Business Purpose**: Streamlines developer onboarding, cold environment provisioning, continuous deployment, and schema seeding for the multi-project BZQ ecosystem.

---

## 2. Developer & Maintainer Information

- **Organization**: HSOM Advisors
- **Email**: [bzqinfo@hsomadvisors.com](mailto:bzqinfo@hsomadvisors.com)
- **Address**: 
- **Phone**: 

---

## 3. CLI Architecture & Workflow

### 3.1 Component Architecture
```mermaid
graph TD
    classDef cli fill:#eceff1,stroke:#455a64,stroke-width:2px;
    classDef clasp fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef remote fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;

    subgraph LocalCLI ["BZQ-cli Layer"]
        BZQ["./bzq (Main Executable)"]:::cli
        CORE["BZQ-cli/bzq-core.sh"]:::cli
        SEED["scripts/seed-sheets.js"]:::cli
    end

    subgraph Toolchain ["Deployment Toolchain"]
        CLASP["@google/clasp"]:::clasp
        NODE["Node.js Runtime"]:::clasp
        AUTH["~/.clasprc.json"]:::clasp
    end

    subgraph GoogleCloud ["Google Workspace Cloud"]
        GAS["Apps Script Projects"]:::remote
        DRIVE["Google Drive Folders"]:::remote
        SHEETS["Google Sheets Databases"]:::remote
    end

    BZQ --> CORE
    CORE --> CLASP
    CORE --> SEED
    CLASP --> AUTH
    CLASP --> GAS
    SEED --> SHEETS
    CORE --> DRIVE
```

### 3.2 Environment Bootstrapping Sequence
```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant CLI as ./bzq CLI
    participant Core as bzq-core.sh
    participant Clasp as clasp
    participant Seed as seed-sheets.js
    participant Google as Google Workspace

    Dev->>CLI: ./bzq bootstrap-dev DEV <PARENT_FOLDER_ID>
    CLI->>Core: deploy_core(DEV, PARENT_ID)
    Core->>Clasp: Create & Push AppsUtilities, FormsEngine, ModuleManager, bzq_gwao
    Clasp-->>Google: Standalone Projects Provisioned
    Core->>Seed: seed_db(DEV, PARENT_ID)
    Seed->>Google: Create Core Config & Spoke Worksheets
    Seed->>Google: Seed Objects 1000-3001 Records & Formulas
    Core-->>Dev: Bootstrapping Complete & Manifests Linked
```

---

## 4. Command Reference

| Command | Usage | Description |
| :--- | :--- | :--- |
| **`login`** | `./bzq login` | Authenticate clasp with your Google Account. |
| **`init`** | `./bzq init <folder> [parent-id]` | Initialize a new Google Apps Script project. |
| **`pull`** | `./bzq pull <folder> [script-id]` | Pull latest code down from Google Apps Script. |
| **`push`** | `./bzq push [<folder> \| --all]` | Push local code to Google Apps Script. |
| **`deploy`** | `./bzq deploy <folder> [desc]` | Create a versioned deployment in Apps Script. |
| **`status`** | `./bzq status [<folder>]` | Show project configuration and git/clasp status. |
| **`open`** | `./bzq open <folder>` | Open project in the Apps Script online editor. |
| **`bootstrap-dev`** | `./bzq bootstrap-dev <env> <parent-id>` | Complete cold deployment and database seeding. |
| **`deploy-core`** | `./bzq deploy-core <env> <parent-id>` | Provision the 4 core standalone projects. |
| **`seed-db`** | `./bzq seed-db <env> <parent-id>` | Seed configuration databases and worksheets. |
| **`install-module`** | `./bzq install-module <module> <env> <id>` | Deploy and configure an individual module. |

---

## 5. Environment Configuration

During bootstrapping, `BZQ-cli` automatically generates a local, git-ignored `EnvConfig.js` in each project directory containing the active environment parameters:

```javascript
// EnvConfig.js (Auto-generated, git-ignored)
var BZQ_ENV = "DEV";
var BZQ_PARENT_FOLDER_ID = "1abc...xyz";
var BZQ_CONFIG_SS_ID = "1sheet...id";
```

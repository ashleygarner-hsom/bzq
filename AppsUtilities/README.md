# BZQ ERP Core Application (`AppsUtilities`)

The **AppsUtilities** module serves as the foundational operating core of the **BZQ ERP** platform. It provides the core business object registries, sequence generation engines, cross-workbook relational lookup resolution, data validation services, and global configuration management.

---

## 1. Module Identity & Purpose

- **Module Name (ID)**: `AppsUtilities`
- **Display Name**: BZQ ERP Core Application
- **Stable Object Range**: `1000` – `1999`
- **Business Purpose**: Orchestrates core spreadsheet data structures, relational integrity, auto-sequencing, and validation across all modular spoke worksheets and Google Drive containers.

---

## 2. Developer & Maintainer Information

- **Organization**: HSOM Advisors
- **Email**: [bzqinfo@hsomadvisors.com](mailto:bzqinfo@hsomadvisors.com)
- **Address**: 
- **Phone**: 

---

## 3. Module Dependencies

`AppsUtilities` is the root foundational module in BZQ ERP. It has zero upstream module dependencies.

| Dependency Module | Required Stable ID Range | Notes |
| :--- | :--- | :--- |
| *(None)* | Root Module | Serves as the base library for all other BZQ modules. |

---

## 4. Architecture & Process Flows

### 4.1 Component Architecture
```mermaid
graph TD
    classDef core fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef service fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef sheet fill:#fff3e0,stroke:#f57c00,stroke-width:2px;

    subgraph AppsUtilities ["AppsUtilities Core Subsystem"]
        SR["SpreadsheetRegistry"]:::service
        SM["SpreadsheetManager"]:::service
        CR["ConfigurationRegistry"]:::service
        VC["ValidationContext"]:::service
        OM["Objects.js (Schema)"]:::core
    end

    subgraph Storage ["Google Drive Storage Layer"]
        CW["BZQ Core Configuration Workbook"]:::sheet
        SW["Spoke Workbooks"]:::sheet
    end

    OM --> SR
    SR --> CW
    SM --> SW
    CR --> CW
    VC --> SW
```

### 4.2 Spoke Sheet Creation & Configuration Seeding Sequence
```mermaid
sequenceDiagram
    autonumber
    actor Admin as System / CLI
    participant SM as SpreadsheetManager
    participant SR as SpreadsheetRegistry
    participant SS as Google Sheets API
    participant DB as Core Config Workbook

    Admin->>SM: postProcessSpoke(spokeId, moduleObjects, moduleSeedData)
    SM->>SS: Ensure Datasheets & Named Ranges
    SM->>SS: Inject Formula Columns & Validations
    SM->>SR: registerSpreadsheet(spokeName, spokeId)
    SR->>DB: Record in Spreadsheets Object (1005)
    SM-->>Admin: Spoke Initialized & Ready
```

### 4.3 Process Flow: Data Validation & ID Generation
```mermaid
flowchart TD
    Start([Row Edit / Form Submission]) --> CheckObj{Object Registered in 1001?}
    CheckObj -- No --> Reject([Reject Edit / Log Warning])
    CheckObj -- Yes --> CheckSeq{Has Sequence Rule in 1000?}
    CheckSeq -- Yes --> GenId[Generate Formatted Unique ID e.g. xSC-10001]
    CheckSeq -- No --> CheckLookup{Has Lookups in 1002?}
    GenId --> CheckLookup
    CheckLookup -- Yes --> ValLookup[Validate Foreign Key against Target Sheet]
    CheckLookup -- No --> Commit[Commit Row to Target Worksheet]
    ValLookup -- Valid --> Commit
    ValLookup -- Invalid --> Reject
```

---

## 5. Module BZQ Objects

The following objects are declared and managed by `AppsUtilities`. Source code definitions are located in [`Objects.js`](./Objects.js).

| Object Name | Stable ID | Full Stable ID | Datasheet | Primary Key Field(s) | ID Field | Sequence Prefix | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Sequence** | `1000` | `AppsUtilities.1000` | `SequenceConfiguration` | `Sequence Name` | `Sequence Number` | `xSC-` | Defines auto-incrementing document numbering rules, prefixes, and formatting. |
| **Object** | `1001` | `AppsUtilities.1001` | `ObjectConfiguration` | `Object Name` | `Object Number` | `xOC-` | Central registry of business objects, worksheets, and validation bindings. |
| **Lookup** | `1002` | `AppsUtilities.1002` | `LookupConfiguration` | `Lookup Name` | `Lookup Number` | `xLC-` | Defines foreign key relational bindings and dynamic lookup helper sheet rules. |
| **Dropdown** | `1003` | `AppsUtilities.1003` | `DropdownConfiguration` | `Dropdown Name` | `Dropdown Number` | `xDC-` | Defines static dropdown value sets scoped to specific business objects. |
| **GlobalDropdown** | `1004` | `AppsUtilities.1004` | `GlobalDropdownConfiguration` | `Global Dropdown Name` | `Global Dropdown Number` | `xGD-` | Defines global dropdown value sets accessible system-wide across all worksheets. |
| **Spreadsheet** | `1005` | `AppsUtilities.1005` | `Spreadsheets` | `Spreadsheet Name` | `Spreadsheet Number` | `xSS-` | Maintains registry of physical Google Drive workbooks and container links. |
| **ConfigurationProperty** | `1006` | `AppsUtilities.1006` | `ConfigurationProperties` | `Configuration Key` | `Property Number` | *(None)* | System key-value runtime configuration properties and feature toggles. |

---

## 6. Development & Deployment

To push changes to this module's Apps Script project:

```bash
# Push to active Apps Script project
./bzq push AppsUtilities

# Deploy a versioned release
./bzq deploy AppsUtilities "Release description"
```

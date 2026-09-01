# Entry Forms Engine (`FormsEngine`)

The **FormsEngine** module is the data capture and UI rendering subsystem of **BZQ ERP**. It dynamically generates responsive HTML forms, sidebars, and modals from declarative spreadsheet layouts and metadata schemas.

---

## 1. Module Identity & Purpose

- **Module Name (ID)**: `FormsEngine`
- **Display Name**: Entry Forms Engine
- **Stable Object Range**: `2000` – `2999`
- **Business Purpose**: Translates declarative form layout tables in Google Sheets into interactive, validated HTML sidebar and dialog interfaces for rapid ERP data entry.

---

## 2. Developer & Maintainer Information

- **Organization**: HSOM Advisors
- **Email**: [bzqinfo@hsomadvisors.com](mailto:bzqinfo@hsomadvisors.com)
- **Address**: 
- **Phone**: 

---

## 3. Module Dependencies

`FormsEngine` depends directly on `AppsUtilities` for object registry lookups, sequences, dropdowns, and data validation.

| Dependency Module | Required Stable ID Range | Notes |
| :--- | :--- | :--- |
| **`AppsUtilities`** | `1000` – `1006` | Provides core object definitions, sequence generation, and relational lookups. |

---

## 4. Architecture & Process Flows

### 4.1 Component Architecture
```mermaid
graph TD
    classDef engine fill:#ede7f6,stroke:#512da8,stroke-width:2px;
    classDef util fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef ui fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;

    subgraph FormsEngine ["FormsEngine Module"]
        FB["FormBuilder"]:::engine
        FSS["FormSubmissionService"]:::engine
        FLR["FormLayoutReader"]:::engine
        FO["Objects.js (Schema 2000)"]:::engine
    end

    subgraph AppsUtilities ["Core Dependencies"]
        AU["AppsUtilities Library"]:::util
        SR["SpreadsheetRegistry"]:::util
    end

    subgraph UserInterface ["Client Add-on Sidebar"]
        HTML["Dynamic HTML Form"]:::ui
        JS["Client Validation / Handler"]:::ui
    end

    FLR --> AU
    FB --> FLR
    FB --> HTML
    HTML --> JS
    JS --> FSS
    FSS --> AU
```

### 4.2 Form Rendering & Submission Sequence
```mermaid
sequenceDiagram
    autonumber
    actor User as Business User
    participant Sidebar as Add-on Sidebar
    participant FE as FormsEngine
    participant AU as AppsUtilities
    participant DB as Spoke Worksheet

    User->>Sidebar: Select "New Customer" Form
    Sidebar->>FE: getFormHtml("New customer")
    FE->>AU: Fetch Layout & Field Metadata
    AU-->>FE: Return Layout (Fields, Types, Lookups)
    FE-->>Sidebar: Render HTML Form Template
    User->>Sidebar: Enter Data & Click Submit
    Sidebar->>FE: submitFormData(formName, formData)
    FE->>AU: Validate Constraints & Generate Sequence ID
    AU->>DB: Append Row with Validated Values
    DB-->>FE: Success Confirmation
    FE-->>Sidebar: Show Success Notification
```

### 4.3 Process Flow: Dynamic Field Layout Engine
```mermaid
flowchart TD
    Req([Form Request Received]) --> ReadLayout[Read Layout Sheet e.g. 'New prospect']
    ReadLayout --> LoopField{For Each Field in Layout}
    LoopField -- AUTOID --> GenReadOnly[Render Disabled / Auto-generated Field]
    LoopField -- LOOKUP --> FetchRel[Query Target Object Lookups via AppsUtilities]
    LoopField -- DROPDOWN --> FetchOpts[Retrieve Configured Dropdown Options]
    LoopField -- TEXT/NUMBER --> RenderInput[Render Standard Input with Validation Pattern]
    FetchRel --> RenderSelect[Render Select Element with Dynamic Options]
    FetchOpts --> RenderSelect
    GenReadOnly --> Assemble[Assemble HTML Container]
    RenderInput --> Assemble
    RenderSelect --> Assemble
    Assemble --> Done([Return Complete Form Component])
```

---

## 5. Module BZQ Objects

The following objects are declared and managed by `FormsEngine`. Source code definitions are located in [`Objects.js`](./Objects.js).

| Object Name | Stable ID | Full Stable ID | Datasheet | Primary Key Field(s) | ID Field | Sequence Prefix | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Form** | `2000` | `FormsEngine.2000` | `Forms` | `Form Name` | `Form Number` | `xFM-` | Defines dynamic HTML form layouts, field mappings, and submission validation rules. |

---

## 6. Development & Deployment

To push changes to this module's Apps Script project:

```bash
# Push to active Apps Script project
./bzq push FormsEngine

# Deploy a versioned release
./bzq deploy FormsEngine "Release description"
```

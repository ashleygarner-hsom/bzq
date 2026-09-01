# Module Manager (`ModuleManager`)

The **ModuleManager** module orchestrates the modular ecosystem of **BZQ ERP**. It provides automated module discovery, dependency graphing, topological order execution, and lifecycle status tracking across all installed extensions.

---

## 1. Module Identity & Purpose

- **Module Name (ID)**: `ModuleManager`
- **Display Name**: Module Manager
- **Stable Object Range**: `3000` – `3999`
- **Business Purpose**: Dynamically discovers installed BZQ modules, verifies prerequisite dependency hierarchies, and coordinates system-wide lifecycle initialization.

---

## 2. Developer & Maintainer Information

- **Organization**: HSOM Advisors
- **Email**: [bzqinfo@hsomadvisors.com](mailto:bzqinfo@hsomadvisors.com)
- **Address**: 
- **Phone**: 

---

## 3. Module Dependencies

`ModuleManager` depends on `AppsUtilities` for core database storage, object configuration registries, and sequence generation.

| Dependency Module | Required Stable ID Range | Notes |
| :--- | :--- | :--- |
| **`AppsUtilities`** | `1000` – `1006` | Provides core object registries and sequence generation. |

---

## 4. Architecture & Process Flows

### 4.1 Component Architecture
```mermaid
graph TD
    classDef mgr fill:#e0f2f1,stroke:#00796b,stroke-width:2px;
    classDef core fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef module fill:#fff8e1,stroke:#fbc02d,stroke-width:2px;

    subgraph ModuleManager ["ModuleManager Subsystem"]
        MDE["ModuleDiscoveryEngine"]:::mgr
        DGR["DependencyGraphResolver"]:::mgr
        MLS["ModuleLifecycleService"]:::mgr
        MO["Objects.js (3000, 3001)"]:::mgr
    end

    subgraph AppsUtilities ["Core Services"]
        AU["AppsUtilities Library"]:::core
        SR["SpreadsheetRegistry"]:::core
    end

    subgraph RegisteredModules ["Installed BZQ Modules"]
        FE["FormsEngine (2000)"]:::module
        OM["OrderManagement (4000)"]:::module
        INV["Inventory (5000)"]:::module
    end

    MDE --> AU
    MDE --> RegisteredModules
    DGR --> MDE
    MLS --> DGR
    MLS --> SR
```

### 4.2 Module Discovery & Dependency Resolution Sequence
```mermaid
sequenceDiagram
    autonumber
    actor Boot as System Boot / CLI
    participant MM as ModuleManager
    participant AU as AppsUtilities
    participant Graph as DependencyGraphResolver
    participant Spoke as Module Manager Workbook

    Boot->>MM: discoverAndInitialize()
    MM->>AU: Query Global Scope for getObjects_*()
    AU-->>MM: Discovered Modules [AppsUtilities, FormsEngine, ModuleManager, ...]
    MM->>Graph: Build Dependency Graph
    Graph->>Graph: Perform Topological Sort & Cycle Detection
    Graph-->>MM: Valid Execution Order Resolved
    MM->>Spoke: Sync Records in Modules (3000) & Dependencies (3001)
    MM-->>Boot: Initialization Complete
```

### 4.3 Process Flow: Dependency Validation
```mermaid
flowchart TD
    Scan[Scan Active Project Manifests & Libraries] --> Build[Build Node & Edge Adjacency List]
    Build --> DetectCycle{Cycle Detected?}
    DetectCycle -- Yes --> Error([Throw Circular Dependency Error])
    DetectCycle -- No --> CheckPrereqs{All Prerequisites Installed?}
    CheckPrereqs -- Missing --> Warn([Log Missing Prerequisite & Disable Module])
    CheckPrereqs -- Complete --> Order[Resolve Topological Sort Order]
    Order --> Activate([Mark Modules Enabled in Registry 3000])
```

---

## 5. Module BZQ Objects

The following objects are declared and managed by `ModuleManager`. Source code definitions are located in [`Objects.js`](./Objects.js).

| Object Name | Stable ID | Full Stable ID | Datasheet | Primary Key Field(s) | ID Field | Sequence Prefix | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Module** | `3000` | `ModuleManager.3000` | `Modules` | `Module Name` | `Module Number` | `xMD-` | Maintains registry of modular extensions, version descriptors, and lifecycle status. |
| **ModuleDependency** | `3001` | `ModuleManager.3001` | `Module Dependencies` | `Dependency Number` | `Dependency Number` | `xDD-` | Defines directed dependency graphs and prerequisite requirements between modules. |

---

## 6. Development & Deployment

To push changes to this module's Apps Script project:

```bash
# Push to active Apps Script project
./bzq push ModuleManager

# Deploy a versioned release
./bzq deploy ModuleManager "Release description"
```

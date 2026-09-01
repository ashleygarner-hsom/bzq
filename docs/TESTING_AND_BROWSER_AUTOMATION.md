# BZQ Testing & Browser Automation Standards

This document establishes the official standards, architectures, and guidelines for testing the **BZQ ERP** Google Workspace Add-on, custom sidebars, dialogs, and spreadsheet-linked interfaces. These instructions apply to both **human developers** and **autonomous AI agents** (such as Antigravity) to enable full end-to-end user-flow validation, visual testing, error logging, and viewport emulation.

---

## 1. Testing Infrastructure & Core Philosophy

BZQ's unique design spans Google Drive, Google Sheets, standalone Google Apps Script (GAS) servers, and client-side HTML/CSS sidebars. Therefore, complete system testing cannot be achieved solely via isolated unit tests; it requires **live, end-to-end browser-based automation and console inspection**.

### Testability Standards for Interface Design
Every UI component built or modified in BZQ must prioritize testability by adhering to the following rules:
1. **Explicit, Descriptive element IDs**: All interactive elements (buttons, inputs, status tags, toggle containers) MUST have a unique, semantic `id` attribute. Avoid generic labels.
2. **Semantic HTML5**: Use correct structural elements (`<main>`, `<header>`, `<section>`, `<dialog>`) rather than unstructured divs. This simplifies element locating and improves accessibility (a11y).
3. **Data-test Attributes**: For repeated list structures or dynamic tables, use custom `data-test-*` attributes (e.g., `data-test-record-id="${id}"`) to let automation frameworks query specific rows easily.
4. **Visual State Indicators**: Loading, active, offline, and error states must render explicit text labels or classes (e.g., `class="loading"`, `status="Online"`) that can be matched or verified visually or via DOM selectors.

---

## 2. Live Browser-Based Testing Workflow (For Agents)

As an Antigravity agent, you have access to browser automation capabilities via the `chrome-devtools-mcp` tools. You can navigate Google Workspace pages, open spreadsheets, launch the BZQ add-on sidebar, inspect elements, capture logs, and take screenshots.

### Step 1: Navigating to Google Drive & Google Sheets
To inspect the developer's Workspace environment, find and open the target spreadsheets:
1. Search Google Drive using the `drive_search_files` tool to find the relevant configuration spreadsheet (e.g., `BZQ Core Configuration LOCAL_ASHLEYGARNER-HSOM`).
2. Retrieve the `webViewLink` from the file metadata.
3. Call the browser tool to navigate to that URL:
   - Use `navigate_page` to open the Google Sheet.
   - Wait for the sheet to load fully before executing further DOM commands.

### Step 2: Emulating Mobile Frame / Viewport Constraints
Google Workspace Add-ons on desktop appear as narrow sidebars, which are structurally and visually identical to the mobile-optimized interface. To test this end-user experience correctly:
1. Call the `emulate` or `resize_page` tool to constrain the viewport.
2. Recommended Mobile viewport specifications:
   - **Width**: `360px` or `412px` (typical mobile device width and GAS sidebar width).
   - **Height**: `800px` (provides sufficient vertical screen space).
3. This ensures all responsive layout styles, flexbox scaling, and element wraps render correctly and do not overflow or cause horizontal scrollbars.

### Step 3: Accessing and Interacting with the Add-on Sidebar
Inside Google Sheets, sidebars are rendered inside cross-origin `<iframe>` structures. 
- Use selectors that target the specific Apps Script iframe elements.
- When triggering actions, use `click` on specific DOM selectors (e.g., `#main-action-btn` or `.bzq-menu-item`).
- To input text into configurations, use `fill_form` or `type_text` on target input fields.

### Step 4: Accessing Console Logs and Assertions
During test execution, always check for Javascript errors or network failures:
1. Call `list_console_messages` to fetch all console outputs (warnings, errors, logs).
2. Check for failed network requests or authentication errors (e.g., script execution denied or CORS failures).
3. Execute custom verification assertions via the `evaluate_script` tool to query element states directly (e.g., verifying if `#connection-status` text matches `"Online"`).

---

## 3. Developer Responsibility & The "Grill Me" Protocol

All BZQ developers (both human and agentic) must be rigorously held accountable for interface modifications to prevent code bloat, regressions, and broken user journeys.

### The Developer's Pledge
- **No speculative code**: Every line of code added must have a direct, documented purpose.
- **Strict peer-review**: Every file modification must undergo a comprehensive line-by-line inspection to verify sanity, edge cases, and layout correctness.
- **Grilling Alignment**: Prior to coding, the designer must "grill" the developer on the proposed design using the **Grill Me Method**:
  1. Ask one architectural or logical question at a time.
  2. Provide a logical recommended option.
  3. Wait for full explicit alignment before proceeding.
  4. Ensure both the developer and reviewer understand exactly how the user flow is verified.

---

## 4. Troubleshooting Local Development Environments

If the BZQ Add-on displays a `"Connected: BZQ Core Configuration [PROD]"` status in a local environment:
1. **Empty BZQ_ENV Script Property**: The Apps Script runtime cannot find the `BZQ_ENV` script property. Run the `./bzq bootstrap-dev <env-name> <parent-id>` command to push a fresh, localized `EnvConfig.js` containing the correct variables.
2. **Drive Scope Restriction**: Google Apps Script restricts the `DriveApp` scope to `drive.file` / `drive.readonly` in add-ons, which blocks calls to `DriveApp.getFileById(ScriptApp.getScriptId())`. Ensure the code uses the dynamic fallback to global `BZQ_ENV` constant instead of relying on slow, permission-restricted folder searches.
3. **Seeding spreadsheet ID duplication**: If you have multiple spreadsheets with the same name, clear out old files in your Google Drive or specify the correct file ID in `SpreadsheetRegistry` to resolve connection ambiguity.

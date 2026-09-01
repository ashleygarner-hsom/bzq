# BZQ Agent Instruction Guidelines

Welcome, AI Agent! You are pairing with the developer to build, refactor, and maintain BZQ. To ensure extreme quality, consistency, and alignment, you must strictly follow these operational instructions.

---

## 1. Code Cleanliness Constraints
You MUST strictly follow these rules for every line of code you generate or edit:
- **Function Length Limit**: Hard maximum of **20 lines** per function. If a function gets too long, refactor it into small, single-purpose helper functions.
- **Argument Count Limit**: Maximum of **3 positional parameters** per function. If more arguments are required, pass a single config options object.
- **Horizontal Length Limit**: Strict maximum of **120 characters** per line. Let lines wrap naturally or break them with proper spacing.
- **Cyclomatic Complexity**: No nested loops beyond 2 levels deep. Use map/filter/reduce or refactor to avoid deep nesting.
- **Purity & Mutations**: Functions must be pure; do not modify global state or mutate incoming parameters directly.
- **Strict Typing & Explicit Classes**: Passing generic, untyped "Object" parameters between functions is strictly forbidden. Define explicit ES6 classes or structured, well-documented schemas (even if restricted to their local execution scopes) to ensure clarity and type safety.

---

## 2. Interactive Protocol: The Grill Me Method
Before writing or modifying any implementation code or system configuration, you MUST follow this interviewer protocol:
1. **Ask one question at a time**: Do not overwhelm the user with multi-part questionnaires.
2. **Provide a recommended answer**: Explain your reasoning and recommend the best choice for the current step.
3. **Wait for feedback**: Pause and yield your turn to let the developer review, adjust, and approve.
4. **Stress-test the decision tree**: Inquire about edge cases, scale limits, and failure recovery before doing any hands-on coding.

---

## 3. UI Testing & Browser Automation with chrome-devtools-mcp
When tasked with testing BZQ features, verifying UI layout, checking sidebars, or validating workflow correctness, you must use browser automation:
- **Locate Target Sheet URL**: Use `drive_search_files` to find the correct spreadsheet by name and path, then extract its `webViewLink`.
- **Emulate Mobile Formats**: To emulate desktop sidebars (narrow viewport) and mobile layouts, use `emulate` or `resize_page` to set the viewport width to `360px` or `412px` and height to `800px`.
- **Interact with Cross-Origin iFrames**: Target Apps Script sidebars/HTML components inside their iframe containers.
- **Capture Console & Network Logs**: Use `list_console_messages` and `list_network_requests` to catch uncaught JavaScript exceptions, REST failures, or authentication errors. Do not allow silent failures or swallow errors with generic try-catches.
- **Assert Visual Integrity**: Capture screenshots using `take_screenshot` to verify layout alignment, fonts, and responsive behaviors before concluding that a task is complete.

---

## 4. Local Environment Provisioning (bootstrap-dev)
When a developer runs local bootstrapping, the system generates a local, git-ignored `EnvConfig.js` containing `BZQ_ENV` and `BZQ_PARENT_FOLDER_ID`.
- Always check for the presence of the global `BZQ_ENV` and `BZQ_PARENT_FOLDER_ID` constants in code (such as in `SpreadsheetRegistry` or `DevBootstrap`) as the primary fast-path environment identification fallback.
- Never write hardcoded parent folder IDs or environment names into files that will be committed to Git.

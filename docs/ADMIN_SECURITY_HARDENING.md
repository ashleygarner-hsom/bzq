# BZQ Enterprise Security Hardening & Administrative Guides

Google Workspace restricts the programmatic creation of Data Loss Prevention (DLP) and Admin Security Rules via third-party application APIs. This is a deliberate, highly secure design choice by Google to prevent third-party applications from altering corporate security postures.

Therefore, **we cannot automate the creation of Admin Rules**. Instead, the BZQ Setup Wizard **strongly encourages and guides** the Google Workspace Administrator to manually configure a Drive Security Rule in their Admin Console during initial onboarding.

---

## 🔒 The BZQ Onboarding Security Card

When a Google Workspace Administrator first opens and configures the BZQ Add-on, they are presented with an interactive **"Security Hardening"** card containing guided instructions and a direct link to the Admin Console.

```text
+------------------------------------------------------------+
| 🔒 BZQ Tenant Security Hardening                           |
+------------------------------------------------------------+
| To prevent unauthorized users from creating spoofed        |
| system files or registry files in their personal Drives,   |
| we highly recommend configuring a Drive Rule in your       |
| Google Admin Console.                                      |
|                                                            |
| [👉 Click here to open Admin Rules Portal ]                |
| (Redirects to https://admin.google.com/ac/rules)           |
|                                                            |
| Step-by-Step Configuration:                                |
| 1. Click "Create Rule" -> "Drive Rule"                     |
| 2. Set Trigger: "File Created, Modified, or Shared"        |
| 3. Set Condition:                                          |
|    - File Name MATCHES "BZQ Tenant Link*"                  |
|    - AND Creator IS NOT IN Your Admin Group                |
| 4. Set Action: "Block File Creation & Send Alert"          |
|                                                            |
| [ I have configured this rule (Proceed) ]                  |
+------------------------------------------------------------+
```

---

## 🛠️ Step-by-Step Admin Instructions (Full Guide)

If you are a Workspace Admin setting up BZQ for your tenant, follow these exact instructions to lock down the BZQ environment and prevent namespace collisions.

### Step 1: Open Google Workspace Admin Rules
1. Navigate to the [Google Workspace Admin Console](https://admin.google.com).
2. On the left sidebar, navigate to **Security** -> **Access and data control** -> **Rules** (or go directly to [https://admin.google.com/ac/rules](https://admin.google.com/ac/rules)).

### Step 2: Create a New Drive Rule
1. Click the **Create Rule** button.
2. Select **Drive Rule** from the dropdown menu (Note: This requires a Google Workspace Enterprise or Education Plus subscription).

### Step 3: Configure Rule Triggers and Conditions
1. **Name your Rule**: `BZQ System Registry Protection`
2. **Trigger**: Select **Document Created, Modified, or Shared**.
3. **Conditions**: Set the criteria to target unauthorized BZQ system file modifications:
   - **Condition 1**: `File Name` -> **Matches regex/pattern** -> `^(BZQ Tenant Link|BZQ Core Configuration)`
   - **Condition 2 (AND)**: `User` -> **Is not a member of** -> `bzq-admins@yourdomain.com` (Select your custom Google Group for BZQ System Admins).

### Step 4: Define Security Actions
1. **Actions**: Set the system behavior when a violation occurs:
   - **Block Action**: Toggle **Block document creation or upload**.
   - **Alerting**: Toggle **Send alert to alert center** and check **Send email notification to administrators**.

### Step 5: Activate and Test
1. Click **Active** to turn on the rule.
2. Test the configuration by signing in with a standard employee account and trying to create a Google Doc named `BZQ Tenant Link [PROD]` in their personal My Drive. The creation should be instantly blocked, and a security alert will trigger in the Admin Console.

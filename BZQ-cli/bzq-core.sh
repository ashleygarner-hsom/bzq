#!/usr/bin/env bash

# BZQ-cli Core Helpers
# Pronounced: "Biz Chops" - Business Operations Platform CLI

# Color Codes
NC='\033[0m' # No Color
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'

# Repo root path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Log Utilities
log_info() {
  echo -e "${CYAN}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✔${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} ${BOLD}WARNING:${NC} $1"
}

log_error() {
  echo -e "${RED}✘${NC} ${BOLD}ERROR:${NC} $1" >&2
  exit 1
}

log_failure() {
  echo -e "${RED}✘${NC} ${BOLD}ERROR:${NC} $1" >&2
}

log_auth_failure() {
  log_banner
  echo -e "${RED}✘ ERROR: Authentication Failed / Token Expired${NC}" >&2
  echo -e "${YELLOW}Your Google Apps Script authorization credentials are no longer valid.${NC}" >&2
  echo -e "To resolve this issue, please reauthenticate by running:" >&2
  echo -e "  ${BOLD}${CYAN}./bzq login${NC}" >&2
  echo -e "${YELLOW}Then, try your command again.${NC}" >&2
  echo -e "${PURPLE}====================================================${NC}" >&2
  exit 1
}

log_banner() {
  echo -e "${PURPLE}====================================================${NC}"
  echo -e "   ${BOLD}${CYAN}Biz Qops (Biz Chops) Platform CLI${NC}"
  echo -e "   ${BLUE}Google Workspace Enterprise Suite Manager${NC}"
  echo -e "${PURPLE}====================================================${NC}"
}

# Check for required system dependencies and version compatibility
check_dependencies() {
  if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js is not installed. Node.js is required to run clasp CLI."
  fi

  local current_version=$(node -v 2>/dev/null | tr -d 'v')
  local major_version=$(echo "$current_version" | cut -d'.' -f1)

  if [ -n "$major_version" ] && [ "$major_version" -ge 22 ]; then
    local brew_node20_path="/opt/homebrew/opt/node@20/bin"
    if [ -d "$brew_node20_path" ]; then
      export PATH="$brew_node20_path:$PATH"
    else
      log_warn "Node.js v$current_version detected (v22+). clasp may fail with 'Premature close'."
      log_warn "If clasp fails, run: brew install node@20"
    fi
  fi
}

# Check if authenticated with clasp
check_auth() {
  if [ ! -f "$HOME/.clasprc.json" ]; then
    log_warn "No clasp credentials found in your home directory (~/.clasprc.json)."
    log_warn "Please run './bzq login' first to authenticate with Google."
    echo ""
  fi
}

# Find the latest deployed version number for a given script
get_latest_deployment_version() {
  local target_dir="$1"
  [ ! -d "$target_dir" ] && log_error "Target directory '$target_dir' does not exist."
  
  (
    cd "$target_dir" || log_error "Failed to enter directory '$target_dir'"
    local out=$(npx @google/clasp deployments 2>&1)
    [ $? -ne 0 ] && log_error "Failed to retrieve deployments from clasp:\n$out"
    
    local version=$(echo "$out" | grep -o "@[0-9]\+" | tail -n 1 | tr -d "@")
    if [ -z "$version" ]; then
      log_warn "No active numeric deployments found. Defaulting to HEAD version."
      echo "HEAD"
    else
      echo "$version"
    fi
  )
}

# Fallback helper to write default .claspignore rules
write_default_claspignore_() {
  cat << 'EOF' > "$1"
# Ignore all local-only files
**/*.md
**/*.sh
.git/
node_modules/
BZQ-cli/
bzq
.claspignore
EOF
}

# Ensure .claspignore exists in the target folder
ensure_claspignore() {
  local target_dir="$1"
  local claspignore_path="$target_dir/.claspignore"
  local template_path="$SCRIPT_DIR/BZQ-cli/.claspignore-template"
  
  if [ ! -f "$claspignore_path" ]; then
    log_info "Creating '.claspignore' in '$target_dir' to prevent local file sync bloat..."
    if [ -f "$template_path" ]; then
      cp "$template_path" "$claspignore_path"
    else
      write_default_claspignore_ "$claspignore_path"
    fi
    log_success "Created '.claspignore' successfully."
  fi
}

# Link clasp project to GCP project
link_gcp_project() {
  local folder="$1"
  local project_id="$2"
  local target_dir="$SCRIPT_DIR/$folder"
  local clasp_config="$target_dir/.clasp.json"

  if [ ! -f "$clasp_config" ]; then
    log_error "Project not initialized in '$folder'. Run './bzq pull $folder <script-id>' first."
  fi

  log_info "Linking Apps Script project in '$folder' to GCP Project ID: $project_id..."
  node -e "
    const fs = require('fs');
    const file = '$clasp_config';
    const data = JSON.parse(fs.readFileSync(file));
    data.projectId = '$project_id';
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  "

  if [ $? -eq 0 ]; then
    log_success "Successfully linked project to GCP!"
    log_banner
    log_success "DOMAIN-WIDE MARKETPLACE REGISTRATION QUICK LINK:"
    log_info "Open this URL to enable and configure the Google Workspace Marketplace SDK:"
    log_info "  https://console.cloud.google.com/apis/api/workspace-marketplace/overview?project=$project_id"
    log_banner
  else
    log_error "Failed to link GCP project. Ensure the project ID exists and you have access."
  fi
}

# Initialize a new script project, optionally in a parent folder ID
init_script_project() {
  local folder="$1"
  local parent_id="$2"
  local target_dir="$SCRIPT_DIR/$folder"
  local clasp_config="$target_dir/.clasp.json"

  if [ -f "$clasp_config" ]; then
    log_error "Project already initialized in '$folder'. Run './bzq push $folder' or pull instead."
  fi

  log_info "Initializing stand-alone Apps Script project in '$folder'..."
  mkdir -p "$target_dir"

  local parent_args=()
  if [ -n "$parent_id" ]; then
    log_info "Targeting Shared Drive parent folder ID: $parent_id"
    parent_args+=("--parentId" "$parent_id")
  fi

  (
    cd "$target_dir" || log_error "Failed to access directory $target_dir"
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp create --title "BZQ $folder Extension" --type standalone "${parent_args[@]}"
  )

  if [ $? -eq 0 ]; then
    ensure_claspignore "$target_dir"
    log_success "Project successfully initialized inside '$folder'!"
  else
    log_error "Failed to create script project. Check your credentials or parent folder ID."
  fi
}

# Check if clasp project configuration was successfully created
check_clasp_project() {
  local path="$1"
  local module_name="$2"
  if [ ! -f "$path" ]; then
    log_banner
    log_error "Failed to provision standalone script project for $module_name."
    log_info "   👉 If you are using a new Google account, you must enable the Google Apps Script API in your browser:"
    log_info "      https://script.google.com/home/usersettings"
    log_info "   👉 If you have already enabled the Apps Script API, please check that you ran './bzq login' and that your account has access to the target Drive folder."
    log_banner
    exit 1
  fi
}

# Bootstrap a complete dev environment from scratch
bootstrap_dev_environment() {
  local env_name="$1"
  local parent_id="$2"

  log_banner
  log_info "STARTING COLD DEPLOY FOR DEV ENVIRONMENT: $env_name"
  log_info "Target Drive Parent Folder: $parent_id"
  log_banner

  # 1. Clean slate
  log_info "Cleaning up existing clasp project associations..."
  rm -f "$SCRIPT_DIR/AppsUtilities/.clasp.json"
  rm -f "$SCRIPT_DIR/FormsEngine/.clasp.json"
  rm -f "$SCRIPT_DIR/extension_scaffold/.clasp.json"

  # 2. Deploy AppsUtilities
  log_info "Provisioning AppsUtilities standalone script..."
  mkdir -p "$SCRIPT_DIR/AppsUtilities"
  (
    cd "$SCRIPT_DIR/AppsUtilities" || exit 1
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp create --title "AppsUtilities [$env_name]" --type standalone --parentId "$parent_id"
  )
  check_clasp_project "$SCRIPT_DIR/AppsUtilities/.clasp.json" "AppsUtilities"
  
  local apps_utilities_id
  apps_utilities_id=$(node -p "require('$SCRIPT_DIR/AppsUtilities/.clasp.json').scriptId")
  log_success "AppsUtilities Script ID: $apps_utilities_id"

  log_info "Pushing AppsUtilities codebase..."
  (
    cd "$SCRIPT_DIR/AppsUtilities" || exit 1
    ensure_claspignore "$SCRIPT_DIR/AppsUtilities"
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp push -f
    log_info "Deploying AppsUtilities version 1..."
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp deploy --description "Initial bootstrap v1"
  )

  # 3. Deploy FormsEngine
  log_info "Updating FormsEngine library dependency to use: $apps_utilities_id"
  node -e "
    const fs = require('fs');
    const path = '$SCRIPT_DIR/FormsEngine/appsscript.json';
    const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
    const lib = manifest.dependencies.libraries.find(l => l.userSymbol === 'AppsUtilities');
    if (lib) lib.libraryId = '$apps_utilities_id';
    fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
  "

  log_info "Provisioning FormsEngine standalone script..."
  mkdir -p "$SCRIPT_DIR/FormsEngine"
  (
    cd "$SCRIPT_DIR/FormsEngine" || exit 1
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp create --title "FormsEngine [$env_name]" --type standalone --parentId "$parent_id"
  )
  check_clasp_project "$SCRIPT_DIR/FormsEngine/.clasp.json" "FormsEngine"
  
  local forms_engine_id
  forms_engine_id=$(node -p "require('$SCRIPT_DIR/FormsEngine/.clasp.json').scriptId")
  log_success "FormsEngine Script ID: $forms_engine_id"

  log_info "Pushing FormsEngine codebase..."
  (
    cd "$SCRIPT_DIR/FormsEngine" || exit 1
    ensure_claspignore "$SCRIPT_DIR/FormsEngine"
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp push -f
    log_info "Deploying FormsEngine version 1..."
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp deploy --description "Initial bootstrap v1"
  )

  # 4. Deploy extension_scaffold
  log_info "Updating extension_scaffold library dependencies..."
  node -e "
    const fs = require('fs');
    const path = '$SCRIPT_DIR/extension_scaffold/appsscript.json';
    const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
    const libApps = manifest.dependencies.libraries.find(l => l.userSymbol === 'AppsUtilities');
    if (libApps) libApps.libraryId = '$apps_utilities_id';
    const libForms = manifest.dependencies.libraries.find(l => l.userSymbol === 'FormsEngine');
    if (libForms) libForms.libraryId = '$forms_engine_id';
    fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
  "

  log_info "Provisioning BZQ Extension standalone script..."
  mkdir -p "$SCRIPT_DIR/extension_scaffold"
  (
    cd "$SCRIPT_DIR/extension_scaffold" || exit 1
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp create --title "BZQ Extension [$env_name]" --type standalone --parentId "$parent_id"
  )
  check_clasp_project "$SCRIPT_DIR/extension_scaffold/.clasp.json" "extension_scaffold"
  
  local extension_id
  extension_id=$(node -p "require('$SCRIPT_DIR/extension_scaffold/.clasp.json').scriptId")
  log_success "BZQ Extension Script ID: $extension_id"

  log_info "Pushing BZQ Extension codebase..."
  (
    cd "$SCRIPT_DIR/extension_scaffold" || exit 1
    ensure_claspignore "$SCRIPT_DIR/extension_scaffold"
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp push -f
    log_info "Deploying BZQ Extension version 1..."
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp deploy --description "Initial bootstrap v1"
  )

  # 5. Provision and seed Spreadsheet databases
  log_info "Seeding configuration workbook databases..."
  node "$SCRIPT_DIR/scripts/seed-sheets.js" "$env_name" "$parent_id" "$apps_utilities_id" "$forms_engine_id" "$extension_id"
  if [ $? -ne 0 ]; then
    log_error "Database seeding failed! Please inspect the terminal output for the exact Google Drive / Sheets API error."
    exit 1
  fi

  log_banner
  log_success "COLD DEPLOY AND BOOTSTRAP COMPLETE!"
  log_info "1. BZQ Extension ID: $extension_id"
  log_info "2. Open and test your deployment: https://script.google.com/d/$extension_id/edit"
  log_banner
}

# Install and configure a single module on an existing environment
install_module() {
  local module_name="$1"
  local env_name="$2"
  local parent_id="$3"

  if [ ! -d "$SCRIPT_DIR/$module_name" ]; then
    log_error "Module folder '$module_name' not found in repository."
    exit 1
  fi

  log_banner
  log_info "INSTALLING MODULE '$module_name' ON ENVIRONMENT: $env_name"
  log_banner

  # 1. Resolve existing script IDs if they exist
  local apps_utilities_id=""
  if [ -f "$SCRIPT_DIR/AppsUtilities/.clasp.json" ]; then
    apps_utilities_id=$(node -p "require('$SCRIPT_DIR/AppsUtilities/.clasp.json').scriptId")
  fi
  local forms_engine_id=""
  if [ -f "$SCRIPT_DIR/FormsEngine/.clasp.json" ]; then
    forms_engine_id=$(node -p "require('$SCRIPT_DIR/FormsEngine/.clasp.json').scriptId")
  fi

  # 2. Update library dependencies in target module manifest if needed
  if [ "$module_name" = "FormsEngine" ] && [ -n "$apps_utilities_id" ]; then
    log_info "Updating FormsEngine library dependency to use: $apps_utilities_id"
    node -e "
      const fs = require('fs');
      const path = '$SCRIPT_DIR/FormsEngine/appsscript.json';
      const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
      const lib = manifest.dependencies.libraries.find(l => l.userSymbol === 'AppsUtilities');
      if (lib) lib.libraryId = '$apps_utilities_id';
      fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
    "
  fi

  if [ "$module_name" = "extension_scaffold" ]; then
    log_info "Updating extension_scaffold library dependencies..."
    node -e "
      const fs = require('fs');
      const path = '$SCRIPT_DIR/extension_scaffold/appsscript.json';
      const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
      const libApps = manifest.dependencies.libraries.find(l => l.userSymbol === 'AppsUtilities');
      if (libApps) libApps.libraryId = '$apps_utilities_id';
      const libForms = manifest.dependencies.libraries.find(l => l.userSymbol === 'FormsEngine');
      if (libForms) libForms.libraryId = '$forms_engine_id';
      fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
    "
  fi

  # 3. Provision standalone script project if missing
  if [ ! -f "$SCRIPT_DIR/$module_name/.clasp.json" ]; then
    log_info "Provisioning $module_name standalone script..."
    (
      cd "$SCRIPT_DIR/$module_name" || exit 1
      PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp create --title "$module_name [$env_name]" --type standalone --parentId "$parent_id"
    )
    check_clasp_project "$SCRIPT_DIR/$module_name/.clasp.json" "$module_name"
  fi

  local script_id
  script_id=$(node -p "require('$SCRIPT_DIR/$module_name/.clasp.json').scriptId")
  log_success "$module_name Script ID: $script_id"

  # 4. Push module code
  log_info "Pushing $module_name codebase..."
  (
    cd "$SCRIPT_DIR/$module_name" || exit 1
    ensure_claspignore "$SCRIPT_DIR/$module_name"
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp push -f
    log_info "Deploying $module_name version 1..."
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp deploy --description "Installed module v1"
  )

  # 5. Upsert seed data configuration
  log_info "Upserting seed database configurations..."
  node "$SCRIPT_DIR/scripts/seed-sheets.js" "$env_name" "$parent_id" "$apps_utilities_id" "$forms_engine_id" "$script_id" "--module=$module_name"
  if [ $? -ne 0 ]; then
    log_error "Database seeding failed for module $module_name!"
    exit 1
  fi

  log_banner
  log_success "MODULE '$module_name' INSTALLATION COMPLETE!"
  log_info "Open your Apps Script dashboard to view the project: https://script.google.com/d/$script_id/edit"
  log_banner
}



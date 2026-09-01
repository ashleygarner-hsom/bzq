#!/usr/bin/env bash

# BZQ CLI

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
  echo -e "   ${BOLD}${CYAN}BZQ CLI${NC}"
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

# Create clasp project without overwriting existing appsscript.json
create_clasp_project_safe() {
  local target_dir="$1"
  shift
  local clasp_args=("$@")
  local backup=""
  if [ -f "$target_dir/appsscript.json" ]; then
    backup=$(cat "$target_dir/appsscript.json")
  fi
  (
    cd "$target_dir" || exit 1
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp create "${clasp_args[@]}"
  )
  local status=$?
  if [ -n "$backup" ]; then
    echo "$backup" > "$target_dir/appsscript.json"
  fi
  return $status
}

# Link clasp project to GCP project
link_gcp_project() {
  local folder="$1"
  local project_id="$2"
  local silent="$3"
  local target_dir="$SCRIPT_DIR/$folder"
  local clasp_config="$target_dir/.clasp.json"

  if [ ! -f "$clasp_config" ]; then
    log_error "Project not initialized in '$folder'. Run './bzq pull $folder <script-id>' first."
  fi

  if [ "$silent" != "true" ]; then
    log_info "Linking Apps Script project in '$folder' to GCP Project ID: $project_id..."
  fi
  node -e "
    const fs = require('fs');
    const file = '$clasp_config';
    const data = JSON.parse(fs.readFileSync(file));
    data.projectId = '$project_id';
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  "

  if [ $? -eq 0 ]; then
    if [ "$silent" != "true" ]; then
      log_success "Successfully linked project to GCP!"
      log_banner
      log_success "DOMAIN-WIDE MARKETPLACE REGISTRATION QUICK LINK:"
      log_info "Open this URL to enable and configure the Google Workspace Marketplace SDK:"
      log_info "  https://console.cloud.google.com/apis/api/workspace-marketplace/overview?project=$project_id"
      log_banner
    else
      log_success "Linked '$folder' to GCP Project '$project_id'"
    fi
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

  create_clasp_project_safe "$target_dir" --title "BZQ $folder Extension" --type standalone "${parent_args[@]}"

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

# Generate local EnvConfig.js file before pushing
write_env_config() {
  local target_dir="$1"
  local env_name="$2"
  local parent_id="$3"
  local apps_utilities_id="$4"
  local forms_engine_id="$5"
  local module_manager_id="$6"
  log_info "Generating 'EnvConfig.js' in '$target_dir'..."
  cat << EOF > "$target_dir/EnvConfig.js"
// Generated dynamically by ./bzq. DO NOT COMMIT TO GIT.
const BZQ_ENV = "${env_name}";
const BZQ_PARENT_FOLDER_ID = "${parent_id}";
EOF
  if [ -n "$apps_utilities_id" ]; then
    echo "const BZQ_APPS_UTILITIES_ID = \"${apps_utilities_id}\";" >> "$target_dir/EnvConfig.js"
  fi
  if [ -n "$forms_engine_id" ]; then
    echo "const BZQ_FORMS_ENGINE_ID = \"${forms_engine_id}\";" >> "$target_dir/EnvConfig.js"
  fi
  if [ -n "$module_manager_id" ]; then
    echo "const BZQ_MODULE_MANAGER_ID = \"${module_manager_id}\";" >> "$target_dir/EnvConfig.js"
  fi
}

# Ask for user confirmation in bash
confirm_action() {
  local prompt_msg="$1"
  local ans
  printf "%b" "${BOLD}${prompt_msg} (y/N): ${NC}"
  read -r ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    return 0
  else
    return 1
  fi
}

# Validate GCP project number and its enabled APIs
validate_gcp_project() {
  local project_num="$1"
  if [ -z "$project_num" ]; then
    return 1
  fi

  log_info "Verifying Google Cloud Project Access for: $project_num..."
  local gcp_id
  gcp_id=$(gcloud projects describe "$project_num" --format="value(projectId)" 2>/dev/null)
  
  if [ -z "$gcp_id" ]; then
    log_warn "Unable to access GCP Project with number: $project_num."
    log_warn "Please ensure you have authenticated with 'gcloud auth login' and have permission."
    return 1
  fi

  log_success "Found GCP Project ID: $gcp_id"
  log_info "Checking required Google Workspace APIs..."

  local enabled_services
  enabled_services=$(gcloud services list --project="$gcp_id" --enabled --filter="name:(sheets.googleapis.com drive.googleapis.com script.googleapis.com)" --format="value(config.name)" 2>/dev/null)

  local has_sheets=false
  local has_drive=false
  local has_script=false

  if echo "$enabled_services" | grep -q "sheets.googleapis.com"; then
    has_sheets=true
  fi
  if echo "$enabled_services" | grep -q "drive.googleapis.com"; then
    has_drive=true
  fi
  if echo "$enabled_services" | grep -q "script.googleapis.com"; then
    has_script=true
  fi

  # Report status
  log_banner
  log_info "API Enablement Audit Status for '$gcp_id':"
  local missing_apis=""
  
  if [ "$has_sheets" = true ]; then
    log_success "  [✔] Google Sheets API (sheets.googleapis.com)"
  else
    echo -e "${RED}✘${NC}  [✘] Google Sheets API (sheets.googleapis.com) - REQUIRED"
    missing_apis="$missing_apis sheets.googleapis.com"
  fi

  if [ "$has_drive" = true ]; then
    log_success "  [✔] Google Drive API (drive.googleapis.com)"
  else
    echo -e "${RED}✘${NC}  [✘] Google Drive API (drive.googleapis.com) - REQUIRED"
    missing_apis="$missing_apis drive.googleapis.com"
  fi

  if [ "$has_script" = true ]; then
    log_success "  [✔] Google Apps Script API (script.googleapis.com)"
  else
    echo -e "${RED}✘${NC}  [✘] Google Apps Script API (script.googleapis.com) - REQUIRED"
    missing_apis="$missing_apis script.googleapis.com"
  fi
  log_banner

  if [ -n "$missing_apis" ]; then
    log_warn "MISSING REQUIRED APIs on project '$gcp_id':$missing_apis"
    log_warn "You can enable them using:"
    log_warn "  gcloud services enable$missing_apis --project=$gcp_id"
    return 1
  fi

  RESOLVED_GCP_ID="$gcp_id"
  return 0
}

# Bootstrap a complete dev environment from scratch
# Deploy central Apps Script standalone modules without seeding or GCP requirements
deploy_core() {
  local env_name=$(echo "$1" | tr -d '[:space:]')
  local parent_id=$(echo "$2" | tr -d '[:space:]')

  log_banner
  log_info "STARTING CORE SCRIPT DEPLOYMENT FOR ENVIRONMENT: $env_name"
  log_banner

  # Clean slate
  log_info "Cleaning up existing clasp project associations..."
  rm -f "$SCRIPT_DIR/AppsUtilities/.clasp.json"
  rm -f "$SCRIPT_DIR/FormsEngine/.clasp.json"
  rm -f "$SCRIPT_DIR/ModuleManager/.clasp.json"
  rm -f "$SCRIPT_DIR/bzq_gwao/.clasp.json"

  # Deploy AppsUtilities
  log_info "Provisioning AppsUtilities standalone script..."
  mkdir -p "$SCRIPT_DIR/AppsUtilities"
  create_clasp_project_safe "$SCRIPT_DIR/AppsUtilities" --title "AppsUtilities [$env_name]" --type standalone --parentId "$parent_id"
  check_clasp_project "$SCRIPT_DIR/AppsUtilities/.clasp.json" "AppsUtilities"
  
  local apps_utilities_id
  apps_utilities_id=$(node -p "require('$SCRIPT_DIR/AppsUtilities/.clasp.json').scriptId")
  log_success "AppsUtilities Script ID: $apps_utilities_id"

  log_info "Pushing AppsUtilities codebase..."
  (
    cd "$SCRIPT_DIR/AppsUtilities" || exit 1
    write_env_config "$SCRIPT_DIR/AppsUtilities" "$env_name" "$parent_id"
    ensure_claspignore "$SCRIPT_DIR/AppsUtilities"
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp push -f
    log_info "Deploying AppsUtilities version 1..."
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp deploy --description "Initial bootstrap v1"
  )

  # Deploy FormsEngine
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
  create_clasp_project_safe "$SCRIPT_DIR/FormsEngine" --title "FormsEngine [$env_name]" --type standalone --parentId "$parent_id"
  check_clasp_project "$SCRIPT_DIR/FormsEngine/.clasp.json" "FormsEngine"
  
  local forms_engine_id
  forms_engine_id=$(node -p "require('$SCRIPT_DIR/FormsEngine/.clasp.json').scriptId")
  log_success "FormsEngine Script ID: $forms_engine_id"

  log_info "Pushing FormsEngine codebase..."
  (
    cd "$SCRIPT_DIR/FormsEngine" || exit 1
    write_env_config "$SCRIPT_DIR/FormsEngine" "$env_name" "$parent_id"
    ensure_claspignore "$SCRIPT_DIR/FormsEngine"
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp push -f
    log_info "Deploying FormsEngine version 1..."
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp deploy --description "Initial bootstrap v1"
  )

  # Deploy ModuleManager
  log_info "Updating ModuleManager library dependency to use: $apps_utilities_id"
  node -e "
    const fs = require('fs');
    const path = '$SCRIPT_DIR/ModuleManager/appsscript.json';
    const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
    const lib = manifest.dependencies.libraries.find(l => l.userSymbol === 'AppsUtilities');
    if (lib) lib.libraryId = '$apps_utilities_id';
    fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
  "

  log_info "Provisioning ModuleManager standalone script..."
  mkdir -p "$SCRIPT_DIR/ModuleManager"
  create_clasp_project_safe "$SCRIPT_DIR/ModuleManager" --title "ModuleManager [$env_name]" --type standalone --parentId "$parent_id"
  check_clasp_project "$SCRIPT_DIR/ModuleManager/.clasp.json" "ModuleManager"
  
  local module_manager_id
  module_manager_id=$(node -p "require('$SCRIPT_DIR/ModuleManager/.clasp.json').scriptId")
  log_success "ModuleManager Script ID: $module_manager_id"

  log_info "Pushing ModuleManager codebase..."
  (
    cd "$SCRIPT_DIR/ModuleManager" || exit 1
    write_env_config "$SCRIPT_DIR/ModuleManager" "$env_name" "$parent_id"
    ensure_claspignore "$SCRIPT_DIR/ModuleManager"
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp push -f
    log_info "Deploying ModuleManager version 1..."
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp deploy --description "Initial bootstrap v1"
  )

  # Deploy bzq_gwao
  log_info "Updating bzq_gwao library dependencies..."
  node -e "
    const fs = require('fs');
    const path = '$SCRIPT_DIR/bzq_gwao/appsscript.json';
    const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
    const libApps = manifest.dependencies.libraries.find(l => l.userSymbol === 'AppsUtilities');
    if (libApps) libApps.libraryId = '$apps_utilities_id';
    const libForms = manifest.dependencies.libraries.find(l => l.userSymbol === 'FormsEngine');
    if (libForms) libForms.libraryId = '$forms_engine_id';
    const libMod = manifest.dependencies.libraries.find(l => l.userSymbol === 'ModuleManager');
    if (libMod) libMod.libraryId = '$module_manager_id';
    fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
  "

  log_info "Provisioning BZQ Extension standalone script..."
  mkdir -p "$SCRIPT_DIR/bzq_gwao"
  create_clasp_project_safe "$SCRIPT_DIR/bzq_gwao" --title "BZQ Extension [$env_name]" --type standalone --parentId "$parent_id"
  check_clasp_project "$SCRIPT_DIR/bzq_gwao/.clasp.json" "bzq_gwao"
  
  local extension_id
  extension_id=$(node -p "require('$SCRIPT_DIR/bzq_gwao/.clasp.json').scriptId")
  log_success "BZQ Extension Script ID: $extension_id"

  log_info "Pushing BZQ Extension codebase..."
  (
    cd "$SCRIPT_DIR/bzq_gwao" || exit 1
    write_env_config "$SCRIPT_DIR/bzq_gwao" "$env_name" "$parent_id" "$apps_utilities_id" "$forms_engine_id" "$module_manager_id"
    ensure_claspignore "$SCRIPT_DIR/bzq_gwao"
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp push -f
    log_info "Deploying BZQ Extension version 1..."
    PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx @google/clasp deploy --description "Initial bootstrap v1"
  )

  log_banner
  log_success "CORE SCRIPT PROJECTS DEPLOYED SUCCESSFULLY!"
  log_banner
}

# Associate core script projects with standard Google Cloud Platform project
link_gcp_all() {
  local env_name=$(echo "$1" | tr -d '[:space:]')
  local project_num=$(echo "$2" | tr -d '[:space:]')

  log_banner
  log_info "STARTING GCP LINKING FOR ENVIRONMENT: $env_name"
  log_banner

  # GCP project validation
  local gcp_id=""
  local RESOLVED_GCP_ID=""
  validate_gcp_project "$project_num"
  if [ $? -eq 0 ] && [ -n "$RESOLVED_GCP_ID" ]; then
    gcp_id="$RESOLVED_GCP_ID"
    log_success "GCP Project is valid and has appropriate scopes!"
  else
    log_error "GCP Project validation failed. Please check project number '$project_num'."
    exit 1
  fi

  # Binds GCP to all core standalone scripts
  if [ -f "$SCRIPT_DIR/AppsUtilities/.clasp.json" ]; then
    link_gcp_project "AppsUtilities" "$gcp_id" "true"
  fi
  if [ -f "$SCRIPT_DIR/FormsEngine/.clasp.json" ]; then
    link_gcp_project "FormsEngine" "$gcp_id" "true"
  fi
  if [ -f "$SCRIPT_DIR/ModuleManager/.clasp.json" ]; then
    link_gcp_project "ModuleManager" "$gcp_id" "true"
  fi
  if [ -f "$SCRIPT_DIR/bzq_gwao/.clasp.json" ]; then
    link_gcp_project "bzq_gwao" "$gcp_id" "true"
  fi

  local apps_utilities_id=$(node -p "require('$SCRIPT_DIR/AppsUtilities/.clasp.json').scriptId")
  local forms_engine_id=$(node -p "require('$SCRIPT_DIR/FormsEngine/.clasp.json').scriptId")
  local module_manager_id=$(node -p "require('$SCRIPT_DIR/ModuleManager/.clasp.json').scriptId")
  local extension_id=$(node -p "require('$SCRIPT_DIR/bzq_gwao/.clasp.json').scriptId")

  log_warn "===================================================="
  log_warn "  ⚠️ ACTION REQUIRED: LINK STANDALONE MODULES TO GCP"
  log_warn "  Please link the 4 central scripts to GCP Project Number"
  log_warn "  '$project_num' ($gcp_id) to ensure correct API scopes:"
  log_warn "  "
  log_warn "  1. AppsUtilities Standalone Library:"
  log_warn "     https://script.google.com/d/$apps_utilities_id/edit#settings"
  log_warn "  2. FormsEngine Standalone Library:"
  log_warn "     https://script.google.com/d/$forms_engine_id/edit#settings"
  log_warn "  3. ModuleManager Standalone Library:"
  log_warn "     https://script.google.com/d/$module_manager_id/edit#settings"
  log_warn "  4. BZQ Workspace Add-on (bzq_gwao):"
  log_warn "     https://script.google.com/d/$extension_id/edit#settings"
  log_warn "  "
  log_warn "  👉 For each link: Scroll to 'Google Cloud Platform (GCP) Project',"
  log_warn "     click 'Change project', paste '$project_num', and click 'Set project'."
  log_warn "===================================================="
  log_info "Please link all 4 projects above in your browser now."
  read -p "Press [Enter] once you have successfully linked all 4 scripts..."
}

# Run database configuration worksheets seeding
seed_db() {
  local env_name=$(echo "$1" | tr -d '[:space:]')
  local parent_id=$(echo "$2" | tr -d '[:space:]')
  local project_num=$(echo "$3" | tr -d '[:space:]')

  log_banner
  log_info "STARTING DATABASE SEEDING FOR ENVIRONMENT: $env_name"
  log_banner

  # Fetch script IDs from local .clasp.json config files
  local apps_utilities_id=""
  local forms_engine_id=""
  local module_manager_id=""
  local extension_id=""

  if [ -f "$SCRIPT_DIR/AppsUtilities/.clasp.json" ]; then
    apps_utilities_id=$(node -p "require('$SCRIPT_DIR/AppsUtilities/.clasp.json').scriptId")
  fi
  if [ -f "$SCRIPT_DIR/FormsEngine/.clasp.json" ]; then
    forms_engine_id=$(node -p "require('$SCRIPT_DIR/FormsEngine/.clasp.json').scriptId")
  fi
  if [ -f "$SCRIPT_DIR/ModuleManager/.clasp.json" ]; then
    module_manager_id=$(node -p "require('$SCRIPT_DIR/ModuleManager/.clasp.json').scriptId")
  fi
  if [ -f "$SCRIPT_DIR/bzq_gwao/.clasp.json" ]; then
    extension_id=$(node -p "require('$SCRIPT_DIR/bzq_gwao/.clasp.json').scriptId")
  fi

  if [ -z "$apps_utilities_id" ] || [ -z "$forms_engine_id" ] || [ -z "$module_manager_id" ] || [ -z "$extension_id" ]; then
    log_error "Missing one or more local clasp project configurations. Did you run './bzq deploy-core' first?"
    exit 1
  fi

  local seed_args=("--user-auth")
  if [ -n "$project_num" ]; then
    seed_args+=("--gcp-linked")
  fi

  log_info "Seeding configuration workbook databases..."
  node "$SCRIPT_DIR/scripts/seed-sheets.js" "$env_name" "$parent_id" "$apps_utilities_id" "$forms_engine_id" "$module_manager_id" "$extension_id" "--force" "${seed_args[@]}"
  if [ $? -ne 0 ]; then
    log_error "Database seeding failed!"
    exit 1
  fi

  log_banner
  log_success "SEEDING PROCESS COMPLETED SUCCESSFULLY!"
  log_banner
}

# Simplified cold deploy orchestrator
bootstrap_dev_environment() {
  local env_name=$(echo "$1" | tr -d '[:space:]')
  local parent_id=$(echo "$2" | tr -d '[:space:]')
  local project_num=$(echo "$3" | tr -d '[:space:]')

  deploy_core "$env_name" "$parent_id"
  if [ -n "$project_num" ]; then
    link_gcp_all "$env_name" "$project_num"
  fi
  seed_db "$env_name" "$parent_id" "$project_num"
}

# Install and configure a single module on an existing environment
install_module() {
  local module_name=$(echo "$1" | tr -d '[:space:]')
  local env_name=$(echo "$2" | tr -d '[:space:]')
  local parent_id=$(echo "$3" | tr -d '[:space:]')

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
  local module_manager_id=""
  if [ -f "$SCRIPT_DIR/ModuleManager/.clasp.json" ]; then
    module_manager_id=$(node -p "require('$SCRIPT_DIR/ModuleManager/.clasp.json').scriptId")
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

  if [ "$module_name" = "bzq_gwao" ]; then
    log_info "Updating bzq_gwao library dependencies..."
    node -e "
      const fs = require('fs');
      const path = '$SCRIPT_DIR/bzq_gwao/appsscript.json';
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
    create_clasp_project_safe "$SCRIPT_DIR/$module_name" --title "$module_name [$env_name]" --type standalone --parentId "$parent_id"
    check_clasp_project "$SCRIPT_DIR/$module_name/.clasp.json" "$module_name"
  fi

  local script_id
  script_id=$(node -p "require('$SCRIPT_DIR/$module_name/.clasp.json').scriptId")
  log_success "$module_name Script ID: $script_id"

  # 4. Push module code
  log_info "Pushing \$module_name codebase..."
  (
    cd "$SCRIPT_DIR/\$module_name" || exit 1
    write_env_config "$SCRIPT_DIR/\$module_name" "$env_name" "$parent_id"
    ensure_claspignore "$SCRIPT_DIR/\$module_name"
    PATH="/opt/homebrew/opt/node@20/bin:\$PATH" npx @google/clasp push -f
    log_info "Deploying \$module_name version 1..."
    PATH="/opt/homebrew/opt/node@20/bin:\$PATH" npx @google/clasp deploy --description "Installed module v1"
  )

  # 5. Upsert seed data configuration
  log_info "Upserting seed database configurations..."
  node "$SCRIPT_DIR/scripts/seed-sheets.js" "$env_name" "$parent_id" "$apps_utilities_id" "$forms_engine_id" "$module_manager_id" "$script_id" "--module=$module_name"
  if [ $? -ne 0 ]; then
    log_error "Database seeding failed for module $module_name!"
    exit 1
  fi

  log_banner
  log_success "MODULE '$module_name' INSTALLATION COMPLETE!"
  log_info "Open your Apps Script dashboard to view the project: https://script.google.com/d/$script_id/edit"
  log_banner
}



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
  local template_path="/Users/mitchgarner/source/repos/ESR-Biz_Qops/BZQ-cli/.claspignore-template"
  
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

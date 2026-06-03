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

log_banner() {
  echo -e "${PURPLE}====================================================${NC}"
  echo -e "   ${BOLD}${CYAN}Biz Qops (Biz Chops) Platform CLI${NC}"
  echo -e "   ${BLUE}Google Workspace Enterprise Suite Manager${NC}"
  echo -e "${PURPLE}====================================================${NC}"
}

# Check for required system dependencies
check_dependencies() {
  if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js is not installed. Node.js is required to run clasp CLI."
  fi
}

# Check if authenticated with clasp
check_auth() {
  # clasp has no silent "check auth" command, but we can verify if ~/.clasprc.json exists
  if [ ! -f "$HOME/.clasprc.json" ]; then
    log_warn "No clasp credentials found in your home directory (~/.clasprc.json)."
    log_warn "Please run './bzq login' first to authenticate with Google."
    echo ""
  fi
}

# Find the latest deployed version number for a given script
get_latest_deployment_version() {
  local target_dir="$1"
  
  if [ ! -d "$target_dir" ]; then
    log_error "Target directory '$target_dir' does not exist."
  fi
  
  # Go to directory to run clasp
  (
    cd "$target_dir" || log_error "Failed to enter directory '$target_dir'"
    
    # Run deployments and parse the output
    # Sample line: - AKfycbwEXAMPLE12345 @1 - Initial version
    # We want the highest version number
    local deployments_output
    deployments_output=$(npx @google/clasp deployments 2>&1)
    
    if [[ $? -ne 0 ]]; then
      log_error "Failed to retrieve deployments from clasp:\n$deployments_output"
    fi
    
    local version
    version=$(echo "$deployments_output" | grep -o "@[0-9]\+" | tail -n 1 | tr -d "@")
    
    if [ -z "$version" ]; then
      log_warn "No active numeric deployments found. Defaulting to HEAD version."
      echo "HEAD"
    else
      echo "$version"
    fi
  )
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
      # Fallback inline creation
      cat << 'EOF' > "$claspignore_path"
# Ignore all local-only files
**/*.md
**/*.sh
.git/
node_modules/
BZQ-cli/
bzq
.claspignore
EOF
    fi
    log_success "Created '.claspignore' successfully."
  fi
}

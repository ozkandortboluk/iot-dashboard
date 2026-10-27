#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - Terminal Styling & Output Utilities
# scripts/setup/lib/colors.sh
# ==============================================================================

# ANSI Color Codes
export CLR_RESET="\033[0m"
export CLR_BOLD="\033[1m"
export CLR_DIM="\033[2m"
export CLR_UNDERLINE="\033[4m"

export CLR_RED="\033[31m"
export CLR_GREEN="\033[32m"
export CLR_YELLOW="\033[33m"
export CLR_BLUE="\033[34m"
export CLR_MAGENTA="\033[35m"
export CLR_CYAN="\033[36m"
export CLR_WHITE="\033[37m"

export CLR_BG_DARK="\033[40m"
export CLR_BG_BLUE="\033[44m"

# Print Banner
print_banner() {
  cat << "EOF"
[36m[1m
  _   _                       _   _           _        ___    _____ 
 | \ | |                     | \ | |         | |      |_ _|  |_   _|
 |  \| | _____  ___   _ ___  |  \| | ___   __| | ___   | |     | |  
 | . ` |/ _ \ \/ / | | / __| | . ` |/ _ \ / _` |/ _ \  | |     | |  
 | |\  |  __/>  <| |_| \__ \ | |\  | (_) | (_| |  __/ _| |_    | |  
 |_| \_|\___/_/\_\\__,_|___/ |_| \_|\___/ \__,_|\___||_____|   |_|  
                                                                    
[0m[34m       >>> NexusNode IoT Cloud - Enterprise Zero-Touch Installer <<<[0m
[2m                 Production-Ready & Fully Automated Platform[0m
EOF
}

# Logging Functions
log_info() {
  echo -e "${CLR_BLUE}[INFO]${CLR_RESET} $*"
}

log_step() {
  echo -e "\n${CLR_CYAN}${CLR_BOLD}==>${CLR_RESET} ${CLR_BOLD}$*${CLR_RESET}"
}

log_success() {
  echo -e "${CLR_GREEN}${CLR_BOLD}[✓]${CLR_RESET} ${CLR_GREEN}$*${CLR_RESET}"
}

log_warn() {
  echo -e "${CLR_YELLOW}${CLR_BOLD}[!] UYARI:${CLR_RESET} ${CLR_YELLOW}$*${CLR_RESET}"
}

log_error() {
  echo -e "${CLR_RED}${CLR_BOLD}[✗] HATA:${CLR_RESET} ${CLR_RED}$*${CLR_RESET}" >&2
}

log_fatal() {
  echo -e "${CLR_RED}${CLR_BOLD}[FATAL] KRİTİK HATA:${CLR_RESET} ${CLR_RED}$*${CLR_RESET}" >&2
  exit 1
}

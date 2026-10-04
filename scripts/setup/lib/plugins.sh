#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - Extensible Modular Plugin & Hook Engine
# scripts/setup/lib/plugins.sh
# ==============================================================================

run_setup_hooks() {
  local HOOK_STAGE="$1"
  local PLUGINS_DIR="./scripts/setup/plugins.d"

  if [ ! -d "$PLUGINS_DIR" ]; then
    return 0
  fi

  local FOUND_SCRIPTS=()
  for file in "$PLUGINS_DIR"/*.sh; do
    [ -f "$file" ] && FOUND_SCRIPTS+=("$file")
  done

  if [ ${#FOUND_SCRIPTS[@]} -eq 0 ]; then
    return 0
  fi

  log_step "Eklenti Kancaları (Plugin Hooks) Çalıştırılıyor: [${HOOK_STAGE}]..."

  for plugin in "${FOUND_SCRIPTS[@]}"; do
    local PLUGIN_NAME
    PLUGIN_NAME=$(basename "$plugin")
    log_info "-> Eklenti yürütülüyor: ${CLR_BOLD}${PLUGIN_NAME}${CLR_RESET} (${HOOK_STAGE})"
    
    # Run plugin with hook stage argument
    if bash "$plugin" "$HOOK_STAGE"; then
      log_success "Eklenti tamamlandı: ${PLUGIN_NAME}"
    else
      log_warn "Eklenti (${PLUGIN_NAME}) sıfır dışı çıkış kodu döndürdü (Kod: $?)."
    fi
  done
}

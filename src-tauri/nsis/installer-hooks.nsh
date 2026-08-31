; Keep the technical product name compact for the install path and update key,
; while showing the human-readable name in Windows' installed-apps list.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "LogicBoard Studio"
!macroend

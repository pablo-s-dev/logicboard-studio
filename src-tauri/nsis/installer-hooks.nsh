; Keep technical identifiers compact for paths and upgrade detection while the
; product name shown to users remains "LogicBoard Studio".
!macro NSIS_HOOK_POSTINSTALL
  ; The standard template writes the spaced product name to Add/Remove Programs.
  ; Remove stale compact shortcuts left by releases that used the old name.
  Delete "$SMPROGRAMS\${TECHNICAL_PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\$AppStartMenuFolder\${TECHNICAL_PRODUCT_NAME}.lnk"
  Delete "$DESKTOP\${TECHNICAL_PRODUCT_NAME}.lnk"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Load the user-selected Start Menu folder before removing its legacy link.
  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  Delete "$SMPROGRAMS\${TECHNICAL_PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\$AppStartMenuFolder\${TECHNICAL_PRODUCT_NAME}.lnk"
  Delete "$DESKTOP\${TECHNICAL_PRODUCT_NAME}.lnk"
!macroend

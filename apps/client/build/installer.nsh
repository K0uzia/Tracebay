; Custom NSIS hooks for electron-builder (build.nsis.include).
; Required to exist even when empty: the Windows job fails if this path is missing.

!macro customInit
  ; Close a running instance so the installer can overwrite Tracebaie.exe.
  nsExec::Exec 'taskkill /F /IM Tracebaie.exe /T'
!macroend

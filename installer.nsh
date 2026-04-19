; ─── YGA Todo — NSIS özelleştirme ────────────────────────────────────────────
; Bu dosya electron-builder'ın oluşturduğu NSIS script'ine dahil edilir.
; Türkçe metin ve kurulum politikası buradan yönetilir.

; Kurulum başlamadan önce gösterilecek lisans/politika metni
!macro preInit
  ; Dil: Türkçe
  !define MUI_WELCOMEPAGE_TITLE      "YGA Todo Kurulum Sihirbazı"
  !define MUI_WELCOMEPAGE_TEXT       "YGA Todo kurulum sihirbazına hoş geldiniz.$\r$\n$\r$\nKurulumdan önce açık uygulamaları kapatmanız önerilir.$\r$\n$\r$\nDevam etmek için İleri düğmesine tıklayın."
  !define MUI_LICENSEPAGE_TEXT_TOP   "Lütfen lisans koşullarını dikkatle okuyun. Kuruluma devam etmek için koşulları kabul etmeniz gerekir."
  !define MUI_LICENSEPAGE_BUTTON     "Kabul Ediyorum"
  !define MUI_FINISHPAGE_TITLE       "Kurulum Tamamlandı"
  !define MUI_FINISHPAGE_TEXT        "YGA Todo başarıyla kuruldu.$\r$\n$\r$\nKapat düğmesine tıklayarak sihirbazdan çıkabilirsiniz."
  !define MUI_FINISHPAGE_RUN_TEXT    "YGA Todo'yu şimdi başlat"
  !define MUI_UNCONFIRMPAGE_TEXT_TOP "YGA Todo bilgisayarınızdan kaldırılacak."
!macroend

; Kurulum tamamlandıktan sonra çalışan makro
!macro customInstall
  ; Başlangıçta otomatik başlatma kaydı EKLEME — kullanıcı tercihi
  ; (İstersen aşağıdaki satırı aktif edebilirsin)
  ; WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "YGA Todo" "$INSTDIR\YGA Todo.exe"

  ; Kısayolları logo.ico ile açıkça yeniden oluştur
  Delete "$DESKTOP\YGA - TodoApp.lnk"
  CreateShortCut "$DESKTOP\YGA - TodoApp.lnk" "$INSTDIR\YGA - TodoApp.exe" "" "$INSTDIR\resources\public\logo.ico" 0

  Delete "$SMPROGRAMS\YGA - TodoApp.lnk"
  CreateShortCut "$SMPROGRAMS\YGA - TodoApp.lnk" "$INSTDIR\YGA - TodoApp.exe" "" "$INSTDIR\resources\public\logo.ico" 0
!macroend

; Kaldırma sırasında çalışan makro
!macro customUninstall
  ; Otomatik başlatma kaydını temizle
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "YGA Todo"
  ; Sadece gerçek kaldırmada kullanıcı verilerini temizle, güncellemede koru
  ${if} ${isUpdated}
    ; Guncelleme kaldirmasinda AppData temizlenmez
  ${else}
    ; Eski adlandırma varyantları için kullanıcı verilerini temizle
    RMDir /r "$APPDATA\YGA Todo"
    RMDir /r "$APPDATA\yga-todo-app"
    RMDir /r "$LOCALAPPDATA\YGA Todo"
    RMDir /r "$LOCALAPPDATA\yga-todo-app"
  ${endIf}
!macroend

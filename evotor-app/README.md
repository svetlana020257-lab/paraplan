# Параплан Касса для Эвотора

Android-приложение для смарт-терминалов Эвотор (5i, 6). Показывает плитку
«Параплан Касса» на главном экране и открывает кассу
`https://svetlana020257-lab.github.io/paraplan/kassa.html`.
Если при запуске нет интернета — открывается копия кассы, вшитая в приложение.

APK собирается автоматически (GitHub Actions → «Касса для Эвотора (APK)»)
при каждом изменении `kassa.html` или этой папки и выкладывается в релиз
`kassa-apk`: https://github.com/svetlana020257-lab/paraplan/releases/tag/kassa-apk

Пакет приложения: `ru.paraplan.kassa`.
UUID приложения Эвотора задаётся переменной репозитория `EVOTOR_APP_UUID`
(Settings → Secrets and variables → Actions → Variables).

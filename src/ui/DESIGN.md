# Veader: a cover-first personal library

The primary tasks are finding a book and resuming reading. Keep the existing purple identity in actions and selections, with neutral surfaces. The reader canvas remains independent of the app theme. Reference composition: Android content structure / Material 3; reading workflows: Mihon and Kobo. The approved baseline is design-preview.html (six static light/dark views; example progress is not user data).

- System type: page 24/32 600; section 18/26 600; body 15/22; book title 14/20 600; caption 12/18. Support system font scaling.
- Spacing: 4/8/12/16/24/32. Cover radius 6; ordinary containers 12; sheets 20. Covers use a 2:3 frame, contain fit, neutral backing and a title fallback.
- Library grid: 2 columns below 360dp, 3 below 600dp; wider layouts derive columns from minimum 120dp covers, maximum 6 and 1100dp content. Reduce columns for large text. Forms cap at 640dp.
- Compact continue-reading row; cards show cover, two-line title and a reading-position summary. Never present chapter position as completion or duplicate chapter/page progress bars. Detail may show one current-chapter progress bar.
- Navigation: 书架 / 分类 / 最近 / 设置. Preserve route keys and data. Management actions belong in labeled menus. History precedes analytics. Group settings by purpose; choices open a selected-value panel.
- Reuse Screen, ScreenHeader, BookCover, BookCard, SettingsRow/Group, ChoiceField, BottomSheet and reading summaries. Callers own persistence. Keep virtualized grids and chapter lists, with column-dependent keys.
- Safe areas: standalone Screen owns insets; tabs defer to AppShell. Controls have >=48dp hit areas. Sheets handle back, scrolling and keyboard; normal lists must not hide actions under navigation.
- Validate light/dark at 320/390/768/1024dp and font scales 1/1.3/2, plus missing covers, long titles, empty/error states and large libraries. Preserve reader gesture/cache behavior, Expo 51 and React Native architecture. Commit independently verified parts locally; no push.

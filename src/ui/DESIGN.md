# Veader: a cover-first personal library

The primary tasks are finding a book and resuming reading. Keep the existing purple identity in actions and selections, with neutral surfaces. The reader canvas remains independent of the app theme. Reference composition: Android content structure / Material 3; reading workflows: Mihon and Kobo. The original baseline is design-preview.html (six static light/dark views; example progress is not user data).

- System type: page 24/32 600; section 18/26 600; body 15/22; book title 14/20 600; caption 12/18. Support system font scaling.
- Spacing: 4/8/12/16/24/32. Cover radius 6; ordinary containers 12; sheets 20. Home shelf covers use fixed 2:3 frames, preserving image proportions while cropping overflow to fill the frame; missing/failed covers use a title fallback. Compact entries and detail thumbnails retain their existing contain frames.
- Library grid: 2 columns below 600dp; wider layouts derive columns from minimum 120dp covers, maximum 6 and 1100dp content. Retain two phone columns through 1.3 font scale; reduce columns for larger text. Forms cap at 640dp.
- Compact continue-reading row; cards show cover, two-line title and a reading-position summary. Never present chapter position as completion or duplicate chapter/page progress bars. Detail may show one current-chapter progress bar.
- Navigation: 书架 / 分类 / 最近 / 设置. Preserve route keys and data. Management actions belong in labeled menus. Recent reading starts with a compact Monday-to-Sunday chart, followed by history. Group settings by purpose; the header button cycles system, light and dark appearance, while other choices open a selected-value panel.
- Reuse Screen, ScreenHeader, BookCover, BookCard, SettingsRow/Group, ChoiceField, BottomSheet and reading summaries. Callers own persistence. Keep virtualized grids and chapter lists, with column-dependent keys. Home uses the virtualized FlashList grid with aligned rows and column-dependent remount keys.
- Safe areas: standalone Screen owns insets; tabs defer to AppShell. Back actions start at the page left inset in a 48dp top row; page titles sit on the next line. Reader overlays use the same left inset while keeping reader colors. Controls have >=48dp hit areas. Sheets handle back, scrolling and keyboard; normal lists must not hide actions under navigation.
- Validate light/dark at 320/390/768/1024dp and font scales 1/1.3/2, plus missing covers, long titles, empty/error states and large libraries. Preserve reader gesture/cache behavior, Expo 51 and React Native architecture. Commit independently verified parts locally; no push.

## September 20 refinements

- Four equal-width statistics metrics with centered numbers and labels; switch to a balanced 2x2 layout above 1.3 font scale.
- Share DailyBars between the full statistics chart and the compact weekly preview. Week totals use only Monday through Sunday; distinguish this from the rolling seven-day statistics filter.
- Detail header groups the cover, title, author, format/chapter metadata and reading action. Place one chapter-position row and progress bar below; omit duplicate author chips. At large text sizes place the action below the header.
- These refinements supersede the original three-column/detail composition in design-preview.html; runtime screenshots are the current visual reference.

- Statistics rankings show the series title and chapter title separately, keyed by chapter ID so identical chapter names remain distinct.

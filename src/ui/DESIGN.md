# Veader UI conventions

Preserve the purple identity and let book covers carry the visual emphasis. App navigation follows the selected app theme; the reading canvas has its own black/white preference. Reader sheets follow the app theme.

- Source of truth: theme.ts. Use semantic colors and typography roles; no per-screen palettes. Spacing uses 4/8/12/16/24/32.
- Screen owns safe areas for standalone pages. Tab content uses safeArea=false because AppShell owns the inset. Lists keep virtualization and use getGridLayout for gutters and column widths.
- ScreenHeader owns page/back titles. SectionHeader owns section labels. SettingsGroup and SettingsRow compose navigation, descriptions and sibling controls; do not nest independent controls in PressableScale.
- Button, IconButton and SegmentedControl own 48-point targets and accessible states. Inputs use TextField with a persistent label. Drafts with destructive consequences require an explicit save.
- BottomSheet owns the modal, Android back, keyboard avoidance, safe areas and reduced motion. Put long forms in a ScrollView with keyboardShouldPersistTaps=handled; keep virtualized chapter lists as FlatList.
- BookCover owns image loading/failure placeholders. BookCard composes a grid entry. ProgressBar is shared; chapter progress and reading statistics retain separate meanings.
- ReaderSettingsFields is shared by global defaults and per-book settings; persistence remains owned by each caller.
- Validate light/dark, compact/wide, large text, empty states, keyboard and reader transitions after changes. Do not change SDK or navigation architecture as part of visual work.

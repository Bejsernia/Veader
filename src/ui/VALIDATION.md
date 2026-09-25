# Cover-first redesign acceptance — 2026-09-20

## Build and automated checks

- TypeScript: `tsc --noEmit` passed.
- Jest: 26 suites / 75 tests passed. Includes source control independence, cache draft validation, preference choice/patch behavior, category editor, search with 0/3/100/1000 synthetic records, column changes and large-font single-column layout, failed/missing cover fallback and replacement-URI retry.
- Android release APK built and installed on `Veader_API_34` / `emulator-5554`. Uses the existing arm64 native libraries on the emulator; JS was rebuilt with Metro and Hermes. The Windows Reanimated CMake workaround reuses its unchanged, previously built native library.

## Device inspection

- Real library: three existing EPUB/MOBI/PDF works. At approximately 390×844dp and default font, continue-reading plus three complete cover/title/status entries fit above navigation.
- Library screen captured for light/dark × widths 320/390/768/1024dp × font scales 1/1.3/2 (24 combinations). Every capture retained the library navigation. Representative captures inspected for density, wrapping, cover proportions and safe areas. Large text intentionally reduces columns and increases scroll length.
- Inspected category cover previews, detail cover/position/chapter list, recent history and compact stats, grouped settings, global preferences and source forms. Checked native back from choices and nested reader/source choice panels.
- Final source form: with keyboard open, scrolling reaches the directory field and save button. No remote source was submitted.
- Concentrated corrections: compact settings group headings, detail button boundaries, small fallback covers, neutral inactive tags and text-scaled reader toolbar. Confirmed compact settings in both themes after rebuilding.
- Raw captures are local, ignored artifacts in `.tmp/refined-*.png`; reproducible static composition is `design-preview.html`.

## Limits

- The 1000-record check is an automated data/virtualization regression, not a device FPS or memory benchmark. The device contains three real works.
- iOS has not been built or visually validated on this Windows host.
- Existing reader/navigation/cache tests passed; this UI change does not constitute exhaustive new end-to-end verification of every format, gesture or network failure mode.

## Reader seek regression (2026-09-20)

- Slider preview uses its draft page. Android emits a final value-change event after sliding-complete; only the explicit sliding-start event enters dragging state, so that trailing event cannot suppress native scroll settlement.
- Programmatic seeks retain their target until a new seek or native drag. Late offsets cannot overwrite that target; nonanimated seeks also move the list explicitly.
- TypeScript passed; Jest: 27 suites / 80 tests. Added offset regressions for late/overlapping seeks and LTR/RTL/vertical double-page targets.
- Rebuilt and installed the release APK. Android RTL single-page EPUB: 37 -> seek 150 (stable) -> manual swipe 151 -> seek 43 (stable) -> leave/reopen 43. Simulator remains open. Other direction/spread cases have unit coverage, not new device coverage; iOS remains unverified.

## Library and statistics refinements (2026-09-20)

- Phone bookshelves and category grids now use two columns; 1.3 font scale retains two columns, 2.0 reduces density. Column-change/search regression tests passed.
- Four equal statistics metrics use a 2x2 fallback for large fonts. Recent reading uses the shared chart in a compact Monday-to-Sunday variant with weekly totals and a statistics entry.
- Book detail places its reading action beside the cover and metadata, with a full-width action at large fonts; duplicate author chips are removed. Page position is shown only when a saved page and page count are available, otherwise the chapter percentage is retained.
- TypeScript passed and all 27 Jest suites / 82 tests passed, including week boundaries and zero-filled days.
- Android inspection: default-size light bookshelf, recent chart, statistics and details; 320dp dark bookshelf/details; 2.0-font statistics and details. This exposed fixed chart-height whitespace and insufficient large-font Y-axis height; both corrected. Runtime images are ignored artifacts named `.tmp/adjust-*.png`.
- This was targeted validation of these changes, not a rerun of the entire earlier device matrix. iOS remains unverified.

## Natural-cover masonry and statistics labels (2026-09-20)

- Home uses the Expo 51 compatibility-listed FlashList 1.6.4 masonry implementation. Equal-width columns flow independently; BookCover natural mode adopts the decoded image ratio. Other cover contexts retain their existing dimensions; missing/error placeholders retain a title fallback.
- Statistics use edge-aligned outer metrics and centered inner metrics, with a two-column large-font fallback. Rankings fetch series title through the chapter relationship and render chapter titles separately, using chapter IDs as keys.
- TypeScript and 28 Jest suites / 84 tests passed. Coverage includes image-ratio changes when cells are recycled, missing covers, identical chapter names in different works, grid breakpoints and search with 0/3/100/1000 records.
- Android release built and installed, including the new FlashList native module. Its first build required fetching an uncached AndroidX dependency. The unchanged Reanimated native library was reused via the existing Windows build workaround.
- Device checks: three real books in light mode, unequal cover heights and independent columns after scroll, tab return, keyboard/search-empty and back, statistics right-edge alignment and book/chapter names. Also inspected 320dp dark mode and the single-column 2.0 font-scale layout. Restored normal size/font/light mode and left the emulator open.
- Screenshots: `.tmp/masonry-home.png`, `masonry-scroll.png`, `masonry-stats.png`, `masonry-small-dark.png`, `masonry-large-font.png`. No device-scale 1000-book FPS claim; iOS not built or tested.

## Centered metrics correction (2026-09-21)

- Replaced edge alignment with four equal-width cells, each with centered value and label; large text retains two equal-width centered columns.
- TypeScript passed. Rebuilt/installed Android APK and verified the four label centers at x=167/416/665/914px (249px intervals). Screenshot: `.tmp/stats-centered.png`.
- The Windows Ninja launch workaround reused unchanged SQLite and Reanimated native libraries. No business logic changed; the earlier full test results were not rerun for this style-only correction.

## Aligned home shelf (2026-09-25)

- Home returned to the virtualized FlashList row grid: two columns on phones, with column changes keyed for safe remounting. Its cover frames remain 2:3 and use `cover` fit, so source images keep their proportions while overflow is cropped. Other cover contexts keep `contain` fit.
- TypeScript and 29 Jest suites / 88 tests passed, including grid resizing, empty/search states, 0/3/100/1000 records and cover fitting.
- Android release APK was rebuilt and installed on the emulator. The first visible row has aligned cover/title/status positions with distinct source aspect ratios; the three appearance modes were also cycled on-device. iOS was not run.

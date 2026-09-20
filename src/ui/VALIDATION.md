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

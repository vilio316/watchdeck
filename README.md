# Watchdeck v0.3.0 — runtime sorting, list view and movie details

Working name; choose a product name later. A local Windows 11 desktop app for cataloguing an external-drive collection, choosing something unwatched, recording watch history, and fetching movie/series posters from TMDB.

## New in v0.3.0

- **Actual file runtime:** adding a folder or rescanning reads duration in the background with bundled FFprobe. **Read runtimes** rescans all registered folders and fills missing measurements. Successful measurements are cached by file path, size and modification time; changes invalidate them. Corrupt/unsupported files retain filename classification and show an inspection error in Details. Videos are read, never modified.
- **Automatic sorting:** a valid duration strictly below 4,800 seconds becomes a TV episode. Exactly 80 minutes does not trigger this rule. Explicit filename episodes stay episodes even when longer; other titles use the existing filename rules. Displayed minutes are rounded; Details also shows exact seconds. If logical duplicate copies disagree, the longest available measured copy is used and a notice appears.
- **Manual classification:** select Automatic, Movie or TV episode on a grid card or in Details. A manual choice takes priority and persists across rescans and restart. Returning to Automatic restores runtime/filename rules. Classification does not change the content ID, file names or watch history. Switching type changes the TMDB search/cache namespace; returning to Movie restores any prior movie match and cached details. A short film can therefore be corrected to Movie.
- **Grid / List:** switch above the collection. Both views share search, type, watched and review filters. The view choice is remembered. List rows offer Details, Open and Mark watched / Undo watched.
- **Title modal:** click a card poster/title/Details or a list title/Details. The native dialog supports Escape, keyboard focus containment and returning focus to its opener. The random picker uses the same decision surface, including Pick again. File paths, runtimes and classification controls remain available for movies and episodes.
- **Movies only:** confirmed movie matches fetch a short summary, up to eight starring actors and their roles, directors, writers, genres, release date, original language, rating and TMDB's listed runtime via movie details with appended credits. Listed runtime is informational: automatic sorting uses the inspected file duration. Episode matches use TV artwork only and never fetch/show these movie credits. Missing fields remain absent; movie metadata errors do not discard posters or watch history. Previously cached details remain readable offline, including after a failed refresh. Find/change a TMDB match from Details; Poster settings and Fetch posters continue to work.

Schema v4 adds runtime measurements, manual classification and movie metadata caches. Close and back up your existing user-data folder before the upgrade; earlier releases cannot read schema v4. The source archive contains the lockfile; `npm ci` installs FFprobe and Electron. Windows packaging unpacks FFprobe executables outside ASAR so the worker can launch them without a shell. The target remains Windows x64.

## Upgrade from an earlier release and enable TMDB

1. Close the old app. Back up its user-data folder (including the SQLite files) while closed. Keep the same Windows user, product name and app ID so the new version opens the same catalogue. The app automatically migrates schema v1/v2/v3 to v4; movie identities and watch history remain unchanged. Keep this backup if you want to return to v0.1; the old app cannot read schema v4.
2. Extract the new source to a fresh development folder or replace the old project source. Run `npm ci`, `npm test`, then `npm start` in the extracted `watchdeck` folder. To update an installed binary, run `npm run package:win` on Windows and install the generated v0.3.0 installer over the old version. Development and installed apps may use differently cased user-data folder names: do not assume history transferred until you see the existing catalogue. Do not delete the old data directory.
3. Create a TMDB account and obtain its **API Read Access Token** from account Settings → API: https://www.themoviedb.org/settings/api . Use the long read-access token, not the short API key. Do not paste it into chat or source files.
4. In Watchdeck, open **Poster settings**, paste the token, and save. It is stored with Electron safeStorage encryption (Windows DPAPI), and is never returned to the interface or included in the source archive. Saving a token enables poster lookup after future scans; use **Fetch posters** for the existing collection.
5. Matching extracts the title/year using the existing filename parser. Movies use `/search/movie` with `primary_release_year`; episodes use `/search/tv` with `first_air_date_year` and share one series-level cache entry. Only a unique exact normalized title/original-title with matching known year is auto-selected. If a search spans multiple result pages, no automatic selection is made. No results under the year filter trigger a yearless search for review candidates; a known-year mismatch never auto-matches.
6. Uncertain matches appear under **Needs review**. Click **Find poster** (or **Change poster match**) to correct the search title/year and choose a result. Example: change `Bakcrooms` to `Backrooms` in the search field; the media filename and watched record remain untouched. For TV, the year should be the series premiere year, which may differ from the episode's release year. Dororo's unknown season remains a separate episode-parsing issue even if its series poster is matched.
7. The app downloads the selected `w500` poster to its internal-drive `posters` directory and records metadata in SQLite. Cards and the random-pick dialog display the image and TMDB title; the original file-derived title is shown if different. Shared series artwork avoids per-episode requests. Cached posters work offline. Entries without artwork keep the letter placeholder.
8. Fetch posters fills missing movie details for confirmed movie matches, and skips re-downloading confirmed posters and cached review/no-result records; retry individual no-result/review items using Find poster. Fetch retries errors and missing cached images. Confirmed matches survive rescans and are not silently replaced. Stop after this title interrupts a bulk fetch between requests; an active request has a timeout. Network/auth errors explain what to retry, and completed work remains cached.

Searches send titles and years to TMDB, never video files or full paths. Credits include the official TMDB logo and attribution notice. TMDB's non-commercial API rules apply; commercial distribution needs a separate licensing review. Configuration docs: https://developer.themoviedb.org/docs/authentication-application . Poster image docs: https://developer.themoviedb.org/docs/image-basics .

## Run on Windows 11

1. Install **Node.js 24 LTS** from https://nodejs.org/ (the developer runtime; Electron bundles its own runtime). FFprobe is bundled through ffprobe-static; no separate Python, FFmpeg installation or database server is required.
2. Extract this project to an internal-drive folder, for example `C:\Projects\watchdeck`. Open PowerShell and run:

```powershell
cd C:\Projects\watchdeck
npm ci
npm test
npm start
```

`npm ci` installs dependencies and downloads Electron. Internet is needed for installation; core app features work offline afterward. A PowerShell execution-policy error for `npm.ps1` can be avoided by using `npm.cmd ci`, `npm.cmd test` and `npm.cmd start` without changing your execution policy.

3. Click **Add media folder** and select a small folder for the first scan. Then add your drive root `E:\` if you want the entire drive indexed. Discovery includes nested folders and ignores symbolic links, sample video filenames, zero-byte files, `$RECYCLE.BIN` and `System Volume Information`. Other inaccessible directories fail the scan rather than imply deleted media.
4. Use Movies / TV episodes to control the picker. Search and sidebar filters affect the catalogue display only. The picker chooses available unwatched movies/series and then the earliest available unwatched episode for a selected series. Review items are excluded. Opening launches your default player; use **Mark watched** afterward. **Undo watched** clears active completion records.
5. Click **Rescan** after adding files or reconnecting. If Windows changes the drive letter, use **Relink** on the existing root and select the same media folder at its new location. Never relink an existing root to an unrelated library.

The first scan should not modify your media files. All app writes are in the app's internal-drive user-data folder, normally `%APPDATA%\Watchdeck` or `%APPDATA%\watchdeck` depending on development/packaged naming. It contains `catalogue.sqlite` and may contain SQLite WAL/SHM files. Close the app completely before copying that directory as a backup. Keep the backup outside the media scan root.

## Included

- Electron application with isolated, sandboxed renderer and a narrow preload IPC API.
- React/TypeScript interface, catalogue/search/type filters, selection modal and file locations.
- Recursive scanner and parser based on the user's six real Windows paths.
- SQLite catalogue handled in a worker thread; committed scans reconcile availability atomically.
- Logical filename-derived content grouping, multiple file copies, persistent watch events and manual undo.
- Failed scans preserve file records/history and mark the root unavailable until a successful scan.
- Manual relink for drive-letter/folder changes.
- A uniform choice among eligible movies and series (not among all episode files).
- Versioned SQL schema (v3), with automatic v1/v2 migration and a shared artwork table. Node's built-in `node:sqlite` avoids a separately compiled database addon; Drizzle is deferred.

## Current boundaries of v0.2

- **Manual scans only.** No live watcher, automatic disconnect detection, system tray or login startup yet. Availability is the last successful scan's result. Opening rechecks the path; rescan updates a disconnected root's status. Closing the window quits the app.
- Local identity/year/quality come from filenames, not FFprobe. TMDB supplies display titles and series/movie posters independently of that identity. Poster-match correction is supported; editing the underlying parsed episode/season is still a later milestone. No fuzzy match is silently accepted.
- Content grouping uses normalized title/year/season/episode. It can merge same-name media with insufficient year evidence; metadata provider IDs and ambiguity resolution are later work. Moving a file preserves history when its parsed identity stays the same; changing the title/year in a filename can create a new identity.
- Multi-episode patterns are flagged when recognized, not fully mapped yet. Specials, absolute anime episode numbering and gap policies are unfinished. Folder text “Complete” does not prove completeness.
- No automatic playback tracking, network streaming, cloud sync, or delete-media features. Posters require an internet connection and a valid user-provided TMDB token for first fetch. Live TMDB requests and native Windows safeStorage/protocol display must be verified on your computer; automated tests use controlled responses.
- An active copy may be found by a manual scan; wait for copying to finish before scanning. File stability monitoring comes with the live watcher.
- Current catalogue UI and snapshot generation are suitable for an initial personal collection. Pagination/virtualization and indexed queries are planned for very large collections.
- Repeat picks are possible until you mark content watched; dismissal cooldown is deferred.

## Development and packaging

```powershell
cd C:\Projects\watchdeck
npm test
npm run build
npm run package:win
```

The last command builds an x64 Windows NSIS installer into `release\`. Build on Windows; installer signing and public distribution are separate tasks. An ARM64 machine requires a corresponding packaging target. The supplied archive is source code, not an installer. The Linux authoring environment verifies core behavior/build but cannot establish Windows USB-drive or default-player behavior; run the checks below on your PC.

`npm run preview` shows the interface in a browser with an explicit preview-only notice. Browser preview has no filesystem access; launch Electron with `npm start` for real operations. `npm start` rebuilds then launches; there is no HMR development setup in this first milestone.

## Windows acceptance checklist

1. Scan a small folder containing the example naming patterns and nested video files.
2. Rescan: counts remain stable; duplicate resolutions show as copies of the same logical movie.
3. Mark a movie watched, restart, and verify history persists and the picker excludes it.
4. Move a video without changing its title/year/episode naming, rescan, and verify history persists.
5. Disconnect the drive, rescan, and verify records/history remain but items become unavailable. Reconnect and rescan.
6. If the drive letter changes, relink the existing root; confirm history and availability.
7. Open a video in your associated Windows player; verify opening alone does not mark it watched.
8. Verify Dororo is shown under Needs review and is excluded from random TV selection.

## Source map

`core/parser.ts`: filename interpretation. `core/scanner.ts`: recursive filesystem discovery. `core/catalogue.ts`: SQLite, scan reconciliation, history and selection. `electron/worker.ts`: serialized background operations. `electron/main.ts`: native folder selection and IPC validation. `electron/preload.ts`: narrow renderer bridge. `src/`: React UI. `core/posters.ts`: TMDB search, exact matching and validated poster cache. `src/posters.tsx`: poster, token setup and match review. `test/`: parser, catalogue and poster integration checks.

## Next milestone

Add Chokidar monitoring with debouncing/file-stability checks, root reconnection detection, startup and periodic reconciliation. Preserve the successful-scan-only missing-file rule. Runtime inspection and movie metadata are included in v0.3.0. Remaining enrichment can include stream/resolution details and tray behavior.

## Poster acceptance checks

- Enter a valid token, Fetch posters, and confirm a known movie shows an image plus its title.
- Two episodes of the same series should show the same artwork.
- Use Find poster to correct a filename typo and choose a result; watch history should remain unchanged.
- Restart offline: previously downloaded posters should still appear.
- Try a wrong token: a useful error should appear without losing catalogue/history. Remove or replace it afterward.
- Check a remake with no year: review should show candidates rather than silently select one.
- Search a title with no results or no poster: the placeholder should remain usable.

## v0.2.1 filename cleanup

Known leading release-source prefixes are stripped before delimiter normalization and year extraction. The initial allowlist includes `@CC_Links`, `[MFA]`, `[YTS]`, `[YTS.AM]`, `[YTS.MX]`, `[PAHE]`, `[PAHE.IN]`, and `[I_C]`. Stacked prefixes are supported. Add proven source labels in `core/parser.ts` rather than deleting every bracketed word or every leading token. Unknown labels remain; real titles such as `[REC]`, numeric titles such as `1917`, and embedded words such as `MFA` are preserved. A filename parser produces a candidate title; confirmed TMDB metadata provides canonical display spelling and punctuation.

After upgrading, Rescan the relevant root. Corrections of existing known-prefix titles at the same root/file path retain watch history. Schema v3 stores identity aliases so later rescans and added clean copies stay grouped. Existing clean and prefixed copies are merged when this specific correction identifies the same movie/episode, with watch events preserved. Confirmed artwork is reused; no-match/review results for the old dirty name are not copied to the cleaned name, allowing a new poster lookup. Unrelated file replacement or arbitrary renaming is not treated as this migration.

Examples: `@CC_Links.The.Terminator.1984.720p.UHD.BluRay.x264.Pahe.mkv` becomes `The Terminator` (1984); `[MFA].Alien.1979.DC.UHD.720p.BluRay.x264-Pahe.mkv` becomes `Alien` (1979). Your files are not renamed.

Worker diagnostics now preserve and print the first worker error instead of replacing it with the subsequent exit-code message. This exposes a startup failure; it does not establish the cause of the previously reported Windows restart error.

## Appearance customization (included in v0.2.1)

Open **Appearance** beside Poster settings at the top of the app. The panel offers:

- Dark, Light, or Follow Windows. Follow Windows responds to your Windows app-theme preference while Watchdeck is running. Selecting a theme clears the custom background so the new theme is visible.
- Forest, Midnight, Charcoal, Ivory and Mist background presets, plus a native colour picker for a custom hex colour. Text, borders, controls and surface colours adapt for contrast. A custom colour overrides the theme background until you choose Use theme background.
- Segoe UI (system sans serif), Verdana (spacious sans serif), and Georgia (classic serif), applied across the interface. Fonts use your Windows installation; no external font service is contacted.
- Live preview, Save appearance, Cancel, and Reset to defaults. Cancel or Escape reverts unsaved changes; Reset previews the defaults and Save commits them. The native dialog keeps keyboard focus inside the panel and restores it when closed.

Preferences are stored in `appearance.json` in the same internal-drive app user-data directory as the catalogue, independently of the catalogue worker. An unreadable settings file falls back to defaults. Appearance settings do not touch watch history, posters or media files. The browser preview permits temporary customization; persistent saving is available in the Electron app.

Navigation keeps Library, Up next, Watched and Needs review in the same positions across themes. Selected filters have visible states, focus outlines are provided, and a Skip to collection link is available with the keyboard. The Appearance dialog scrolls at smaller window heights; reduced-motion preference is respected. Tests verify normal-text contrast of at least 4.5:1 across the generated UI surfaces and at least 3:1 for control borders on representative difficult colours, but do not establish a full accessibility certification or native visual acceptance.

### Appearance acceptance checks on Windows

1. Try each theme and font; verify catalogue, search, posters, badges and dialogs remain readable.
2. Select a custom background, save, restart, and confirm the settings remain.
3. Preview another appearance, then Cancel or press Escape; confirm the previous saved look returns.
4. Choose Follow Windows, clear a custom background if present, then change the Windows app theme and confirm Watchdeck follows.
5. Use Tab/Shift+Tab through the Appearance dialog, save/cancel, and confirm focus returns to its opener.
6. Reset to defaults and save; confirm dark mode, Segoe UI and the default background.

## v0.3.0 validation

Automated checks cover the strict 80-minute boundary, manual precedence, duration errors and cache invalidation, duplicate runtime conflicts, real FFprobe execution on a generated media fixture, a real worker scan/restart, movie-only metadata requests/caching/failure isolation, and list/modal markup. Existing parser, prefix correction, SQLite migration/history, poster matching/cache, TV ordering, scanner/relink and appearance tests remain in the suite. Production TypeScript/Vite build is checked.

Native Windows installer execution, default-player launch, interactive dialog focus/navigation and a live authenticated TMDB session still require a Windows acceptance run. On Windows, test a short file, an exactly 80-minute file, a feature film, an explicitly numbered episode, and a damaged file; then override a short film to Movie, rescan/restart, check history and TMDB details, switch views/themes and use the picker. Do not infer a completed Windows acceptance test from the automated checks.

FFprobe comes from the ffprobe-static package (MIT wrapper; FFmpeg binary licensing is separate). Package source and binary provenance: https://github.com/joshwnj/ffprobe-static . FFmpeg license and source information: https://ffmpeg.org/legal.html . Keep relevant third-party notices with any redistributed installer.

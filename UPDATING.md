# Updating Aerium (Windows)

How to move Aerium onto a newer Chromium release when the **Upstream
watch** workflow opens a tracking issue.

## Where things live

- **Base**: `ungoogled-chromium` submodule + this repo's Windows
  packaging (fork of `ungoogled-software/ungoogled-chromium-windows`).
  Chromium version is in `ungoogled-chromium/chromium_version.txt`.
- **Our changes**: `_apply_branding` in `build.py` (Chromium→Aerium,
  Dioide, logo swap), `patches/ungoogled-fatih/` (default-flags,
  bundled-external-extensions, aerium-first-run-page,
  aerium-battery-efficiency, aerium-https-first-balanced,
  aerium-global-privacy-control, aerium-widevine-toggle,
  aerium-search-engines), `brand/`
  (logo assets), the staged workflow under `.github/`.

## Sync procedure

Upstream (ungoogled-software) uses normal PRs, so a merge is safe here.

1. `git remote add upstream https://github.com/ungoogled-software/ungoogled-chromium-windows.git` (once)
2. `git fetch upstream && git merge upstream/master`
3. Resolve conflicts. Our files most likely to conflict: `build.py`
   (keep `_apply_branding` and the extension staging), `package.py`
   (keep `aerium_*` names + Extensions include), `.github/workflows/`
   (ours is a distinct staged pipeline — usually keep ours).
4. Bump the submodule if the merge didn't:
   `git -C ungoogled-chromium fetch --tags && git -C ungoogled-chromium checkout <tag>`.
5. Verify our patches still apply against the new Chromium:
   ```
   # in a scratch checkout of the new chromium source
   patch -p1 --dry-run < patches/ungoogled-fatih/default-flags.patch
   patch -p1 --dry-run < patches/ungoogled-fatih/bundled-external-extensions.patch
   patch -p1 --dry-run < patches/ungoogled-fatih/aerium-first-run-page.patch
   patch -p1 --dry-run < patches/ungoogled-fatih/aerium-battery-efficiency.patch
   patch -p1 --dry-run < patches/ungoogled-fatih/aerium-https-first-balanced.patch
   patch -p1 --dry-run < patches/ungoogled-fatih/aerium-global-privacy-control.patch
   patch -p1 --dry-run < patches/ungoogled-fatih/aerium-widevine-toggle.patch
   patch -p1 --dry-run < patches/ungoogled-fatih/aerium-search-engines.patch
   ```
6. Commit and dispatch **build-x64**.

## When a patch fails to apply

Our patches target specific Chromium files that occasionally move:

- `default-flags.patch` → `components/webui/flags/pref_service_flags_storage.cc`
- `bundled-external-extensions.patch` → `chrome/browser/extensions/external_provider_impl.cc`
- `aerium-first-run-page.patch` → `chrome/browser/ui/webui/ungoogled_first_run.h`
  (this file itself comes from ungoogled-chromium's own
  `patches/extra/ungoogled-chromium/first-run-page.patch`, not stock
  Chromium — if the whole file goes missing, check there first)
- `aerium-battery-efficiency.patch` → `components/performance_manager/user_tuning/prefs.cc`,
  `chrome/browser/preloading/preloading_prefs.cc`,
  `components/optimization_guide/core/optimization_guide_features.cc`,
  `components/domain_reliability/domain_reliability_prefs.cc`.
  Deliberately does **not** touch `kBackgroundModeEnabled` in
  `chrome/browser/background/extensions/background_mode_manager.cc` -
  ungoogled-chromium's own `patches/extra/inox-patchset/0006-modify-default-prefs.patch`
  already flips that pref to `false` and applies before our series, so a
  redundant hunk there fails with "reversed (or previously applied) patch
  detected", which aborts `apply_patches()` with an uncaught exception and
  silently skips every patch after it in the series (a real regression hit
  2026-07-18 - always check ungoogled-chromium's own patches for a pref
  before adding it here)
- `aerium-https-first-balanced.patch` → `chrome/browser/ui/browser_ui_prefs.cc`
- `aerium-global-privacy-control.patch` → `third_party/blink/renderer/core/frame/navigator.idl/.h/.cc`,
  `content/browser/loader/browser_initiated_resource_request.cc`,
  `content/renderer/render_frame_impl.cc`,
  `third_party/blink/renderer/platform/loader/fetch/url_loader/dedicated_or_shared_worker_global_scope_context_impl.cc`,
  `third_party/blink/renderer/modules/service_worker/web_service_worker_fetch_context_impl.cc`
  (each mirrors an existing DNT-header call site — grep for
  `kDoNotTrackHeader` if one of these moves, the GPC block should sit
  right next to it)
- `aerium-widevine-toggle.patch` → `chrome/browser/existing_switch_flag_entries.h`
  (this file comes from ungoogled-chromium's own
  `patches/extra/ungoogled-chromium/add-flags-for-existing-switches.patch`,
  same situation as `ungoogled_first_run.h` above) and
  `chrome/common/media/cdm_registration.cc`'s `RegisterCdmInfo()` — the
  `AddWidevine(cdms);` call, gated on the new `enable-widevine` switch
- `aerium-search-engines.patch` →
  `third_party/search_engines_data/resources/definitions/prepopulated_engines.json`
  and `regional_settings.json` (these live in the DEPS-pulled
  `external/search_engines_data` subproject, not the main Chromium repo —
  the pristine base for regeneration is the revision pinned in DEPS; note
  the prepopulated_engines.json hunks are diffed against the state *after*
  ungoogled-chromium's `replace-google-search-engine-with-nosearch.patch`,
  which rewrites the google entry in the same file),
  `components/regional_capabilities/regional_capabilities_utils.cc`
  (`GetRegionalSettings()` forced to the "ZZ" default list) and
  `components/search_engines/template_url_prepopulate_data.cc`
  (`GetPrepopulatedFallbackSearch()` → `startpage.id`). Our engine IDs
  start at 1001 so upstream additions can never collide; if upstream
  raises `kCurrentDataVersion` past 250, raise ours above it again.

If `--dry-run` reports a hunk failure, open the target file at the new
Chromium tag on
`https://chromium.googlesource.com/chromium/src/+/refs/tags/<version>/<path>`,
find the moved code, and regenerate the patch against it. The
`_apply_branding` string sweep in `build.py` is version-tolerant (it
greps for "Chromium" across grd/grdp/xtb) and rarely needs changes.

## Chrome Web Store crx pin

`build.py` pins the bundled extension by version + sha256
(`_CWS_VERSION`, `_CWS_SHA256`). If NeverDecaf/chromium-web-store
releases a new version, update both or the download check will fail.

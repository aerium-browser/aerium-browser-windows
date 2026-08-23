# winget submission

Aerium is submitted to the [Windows Package Manager][winget] as
**`Dioide.Aerium`**. The three files here are the manifest templates; the
`winget` job in `.github/workflows/publish-release.yml` renders them after a
release publishes and opens a pull request against `microsoft/winget-pkgs`.

## Why this is automated

`eloston.ungoogled-chromium` has been in winget since 2022 and its newest
manifest is `126.0.6478.182`, from mid-2024. Every version after that was
submitted by nobody, so `winget install ungoogled-chromium` still hands people
a build with a year of unpatched Chromium CVEs and reports it as current. A
stale package-manager entry is worse than no entry: it is a security promise
that quietly stopped being kept.

The submission is therefore wired into the release, not into a person.

## Versioning

`PackageVersion` is the plain Chromium version - `151.0.7922.173` - not the
`v151.0.7922.173-b94` release tag. winget manifests are immutable and there is
exactly one folder per version, so the `-b<run>` build counter has nowhere to
live and would collide the moment the same Chromium version were rebuilt.

The consequence is deliberate and worth stating: **only the first release of a
given Chromium version reaches winget.** If `151.0.7922.173` is rebuilt as
`-b95` to fix an Aerium-side bug, the job finds the version folder already
upstream and skips. Getting that fix to winget users needs a Chromium bump.
That is the cost of the plain-version scheme, and it is the right trade while
releases track upstream tags one-for-one.

## Setup this needs (one time)

The job is inert until both exist, and says so in the run summary rather than
failing:

1. **A fork of `microsoft/winget-pkgs`** on the account that owns the token.
   Defaults to `<this repo's owner>/winget-pkgs`; override with the
   `WINGET_FORK` repository variable.
2. **`WINGET_TOKEN`** - a PAT with `public_repo` scope. `GITHUB_TOKEN` cannot
   push to a repository outside this one, so it cannot be used here.

## Before the first submission

The first manifest sets what every later upgrade is compared against, so two
fields have to be confirmed against a real installation rather than derived
from the build scripts:

- **`AppsAndFeaturesEntries.DisplayName`** - currently `Aerium`, taken from
  `PRODUCT_FULLNAME` in `build.py`. Chromium's installer registers under
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<PRODUCT_FULLNAME>`,
  so this should be right, but a mismatch means `winget upgrade` never sees
  the installed copy and every upgrade reinstalls from scratch.
- **`Publisher`** - `Dioide`, from `_COMPANY_NAME`. winget moderators check
  this against the publisher string the installer itself reports.

Install a release, then check both:

```powershell
Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* |
  Where-Object DisplayName -like '*Aerium*' |
  Select-Object DisplayName, DisplayVersion, Publisher, UninstallString
```

[winget]: https://learn.microsoft.com/windows/package-manager/

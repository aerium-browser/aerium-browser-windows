<p align="center">
  <img src="brand/product_logo.svg" width="96" height="96" alt="Aerium logo">
</p>

<h1 align="center">Aerium for Windows</h1>

<p align="center"><i>by Dioide</i></p>

[![build-x64](https://img.shields.io/github/actions/workflow/status/fatih-gh/aerium-browser-windows/build-x64.yml?label=build)](https://github.com/fatih-gh/aerium-browser-windows/actions/workflows/build-x64.yml)
[![release](https://img.shields.io/github/v/release/fatih-gh/aerium-browser-windows)](https://github.com/fatih-gh/aerium-browser-windows/releases/latest)

A deep-navy, space-themed [ungoogled-chromium](https://github.com/ungoogled-software/ungoogled-chromium) build for Windows x64, with a bundled extension store and a curated set of privacy defaults. Built entirely on free GitHub Actions runners — no cloud budget, no self-hosted infrastructure.

[**Download the latest release**](https://github.com/fatih-gh/aerium-browser-windows/releases/latest)

## What's different from stock ungoogled-chromium

- **Full Aerium identity**: product name, every UI string that mentions the browser by name, icons, installer, start-menu tiles, and the user data directory (`%LOCALAPPDATA%\Aerium`) are all rebranded — no leftover "Chromium" anywhere in the UI.
- **Space-navy theme by default**: dark UI with a navy seed color, so the browser looks like Aerium out of the box instead of needing manual setup.
- **[Chromium Web Store](https://github.com/NeverDecaf/chromium-web-store) bundled and pre-installed**, so the Chrome Web Store works for installing and auto-updating extensions without any extra steps.
- **A curated set of privacy flags enabled by default** — canvas/client-rects/measuretext fingerprinting noise, reduced system info, spoofed WebGL info, forced punycode hostnames, parallel downloading, and a few others (see `patches/ungoogled-fatih/default-flags.patch` for the exact list). These are pref *defaults*, not locked-in: anything you change in `chrome://flags` behaves normally afterward.
- Widevine DRM stays off, consistent with upstream ungoogled-chromium's philosophy.

## Building it yourself

Builds run on GitHub Actions, staged across 16 sequential jobs to fit a full Chromium compile within the free tier's per-job time limit (each job hands off its build tree to the next via artifacts). To build your own:

1. Fork this repository.
2. Go to **Actions → build-x64 → Run workflow**.

A full build typically takes 1–2 days of wall-clock time across the staged jobs (all free). See [UPDATING.md](UPDATING.md) for the version-bump/maintenance playbook.

### Building locally instead

If you'd rather build outside CI, the underlying [ungoogled-chromium-windows](https://github.com/ungoogled-software/ungoogled-chromium-windows) build process still applies — see that project's documentation for the full local Visual Studio / depot_tools-free build setup. `build.py` and `package.py` in this repo work the same way locally; they just also carry the Aerium branding and extra patches described above.

## Credits

Built on [ungoogled-chromium](https://github.com/ungoogled-software/ungoogled-chromium) by Eloston and the [ungoogled-software](https://github.com/ungoogled-software) team, packaged for Windows via [ungoogled-chromium-windows](https://github.com/ungoogled-software/ungoogled-chromium-windows), on top of [Chromium](https://www.chromium.org/) itself. The bundled store extension is [chromium-web-store](https://github.com/NeverDecaf/chromium-web-store) by NeverDecaf. All credit for the underlying engineering goes to those projects; Aerium is our own fork, branding, theme, and set of default choices layered on top.

## License

Chromium's BSD-style license — see [LICENSE](LICENSE).

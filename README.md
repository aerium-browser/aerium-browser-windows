<p align="center">
  <img src="brand/product_logo.svg" width="96" height="96" alt="Aerium logo">
</p>

<h1 align="center">Aerium</h1>

<p align="center"><i>by Dioide</i></p>

[![build-x64](https://img.shields.io/github/actions/workflow/status/fatih-gh/aerium-browser-windows/build-x64.yml?label=build)](https://github.com/fatih-gh/aerium-browser-windows/actions/workflows/build-x64.yml)
[![release](https://img.shields.io/github/v/release/fatih-gh/aerium-browser-windows)](https://github.com/fatih-gh/aerium-browser-windows/releases/latest)

Aerium is a browser for people who'd rather their browser stayed out of the way. Dark, deep-navy interface by default. No telemetry calling home, no bundled Google services, no ad platform baked into the settings page. Extensions install straight from the Chrome Web Store — no sideloading, no workarounds.

[**Download for Windows**](https://github.com/fatih-gh/aerium-browser-windows/releases/latest)

## What you get

- **A browser that looks like Aerium, not like a rebadged default.** Frame, toolbar, and tab strip carry their own deep-navy palette, not just a dark-mode filter over stock Chromium.
- **Extensions that work out of the box.** The Chrome Web Store is available from the first launch — install and update the same way you would anywhere else.
- **Privacy defaults you don't have to hunt for.** Fingerprinting resistance, minimal referrers, reduced system info, and a handful of others are on from the start. Nothing's locked — change any of it in `chrome://flags` and it behaves like flags always have.
- **A first-run page that's actually useful.** Recommendations for an ad blocker, a bookmark sync tool, and a new-tab replacement — all free and open-source, none of them installed for you.
- **DRM off.** Widevine stays disabled.

## Building

Every push to `master` builds automatically on GitHub Actions, split across enough sequential jobs to fit a full compile inside the free tier's per-job time limit — each job hands its build tree to the next. A full build lands a couple of days after it starts, entirely on free infrastructure. Every finished build is published as a release.

Want your own build? Fork the repo and run the `build-x64` workflow from the Actions tab.

## Contributing

Issues and pull requests are welcome. See [UPDATING.md](UPDATING.md) for how the build stays in sync with upstream Chromium releases.

## About

Aerium is built on [Chromium](https://www.chromium.org/) via [ungoogled-chromium](https://github.com/ungoogled-software/ungoogled-chromium), with its own branding, theme, and defaults layered on top. The bundled store integration comes from [chromium-web-store](https://github.com/NeverDecaf/chromium-web-store). Licensed under Chromium's BSD-style license — see [LICENSE](LICENSE).

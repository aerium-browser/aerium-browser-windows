<p align="center">
  <img src="brand/product_logo.svg" width="96" height="96" alt="Aerium logo">
</p>

<h1 align="center">Aerium</h1>

<p align="center"><i>by Dioide</i></p>

[![build-x64](https://img.shields.io/github/actions/workflow/status/fatih-gh/aerium-browser-windows/build-x64.yml?label=build)](https://github.com/fatih-gh/aerium-browser-windows/actions/workflows/build-x64.yml)
[![release](https://img.shields.io/github/v/release/fatih-gh/aerium-browser-windows)](https://github.com/fatih-gh/aerium-browser-windows/releases/latest)

Aerium is a browser for people who'd rather their browser stayed out of the way. No telemetry calling home, no bundled Google services, no ad platform baked into the settings page. Extensions install straight from the Chrome Web Store — no sideloading, no workarounds.

[**Download for Windows**](https://github.com/fatih-gh/aerium-browser-windows/releases/latest)

## What you get

- **Its own name, its own icon — your own colors.** The appearance picker in Settings works exactly like it does in stock Chromium; nothing forces a palette on top of it.
- **Extensions that work out of the box.** The Chrome Web Store is available from the first launch — install and update the same way you would anywhere else.
- **Search that works from the first keystroke.** Startpage is the default engine, with DuckDuckGo, DuckDuckGo Lite, DuckDuckGo HTML, and SearXNG ready to pick in Settings — and any other engine addable by hand.
- **Privacy defaults you don't have to hunt for.** Fingerprinting resistance, minimal referrers, reduced system info, and a handful of others are on from the start. Nothing's locked — change any of it in `chrome://flags` and it behaves like flags always have.
- **HTTPS by default.** Balanced Mode upgrades navigations to HTTPS automatically, without the disruptive full-site warnings of strict HTTPS-only enforcement.
- **Global Privacy Control sent by default.** The `Sec-GPC` opt-out signal and `navigator.globalPrivacyControl` — recognized under CCPA, but still not implemented in stock Chromium — are on for every page, no toggle needed.
- **A first-run page that's actually useful.** Recommendations for an ad blocker, a bookmark sync tool, and a new-tab replacement — all free and open-source, none of them installed for you.
- **Lighter by default.** Memory Saver and Battery Saver are on out of the box, and a handful of background network chatter — hint prefetching, domain reliability pings — is off. The name comes from aerogel, the lightest solid there is.
- **DRM off by default, your call either way.** Widevine isn't registered unless you turn it on at `chrome://flags/#enable-widevine`.

## Building

Every push to `master` builds automatically on GitHub Actions, split across enough sequential jobs to fit a full compile inside the free tier's per-job time limit — each job hands its build tree to the next. A full build lands a couple of days after it starts, entirely on free infrastructure. Every finished build is published as a release.

Want your own build? Fork the repo and run the `build-x64` workflow from the Actions tab.

## Contributing

Issues and pull requests are welcome. See [UPDATING.md](UPDATING.md) for how the build stays in sync with upstream Chromium releases.

## About

Aerium is built on [Chromium](https://www.chromium.org/) via [ungoogled-chromium](https://github.com/ungoogled-software/ungoogled-chromium), with its own branding and defaults layered on top. The bundled store integration comes from [chromium-web-store](https://github.com/NeverDecaf/chromium-web-store). Licensed under Chromium's BSD-style license — see [LICENSE](LICENSE).

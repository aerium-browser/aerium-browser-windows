# Changelog

Written for people using Aerium rather than for people building it. Each
release on GitHub also links the full commit history if you want the detail
behind any of this.

## 151.0.7922.173-1 (next release)

**A look of its own**

- Aerium now has its own colours instead of Chromium's greys. The palette is
  taken from the logo: a blue accent throughout, pale blue surfaces in light
  mode, and deep navy in dark mode.
- Dark mode is properly dark. The first attempt sat at roughly the same
  lightness as Chromium's own dark theme, which is not dark enough to be worth
  calling dark; every surface now sits below it.
- The address bar and tabs have a shape of their own too — a slightly taller
  address bar with softer corners, and tabs to match. Small on purpose: enough
  to recognise, not enough to fight your muscle memory.

**Content blocker**

- The built-in content blocker has been dropped. It never shipped in a working
  build, and a browser is a poor place to maintain filter lists: uBlock Origin
  and uBlock Origin Lite already do the job better, are updated far more often,
  and let you decide what to block. Aerium's job is to run them well. Aerium
  Guard keeps its three modes and loses the blocker section.

## 151.0.7922.173-1-b62 and earlier

Earlier releases predate this file. The GitHub release notes for each carry
the commit history.

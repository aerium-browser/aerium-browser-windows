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

**Privacy and security**

- The **Never delete data for these sites** list is now reachable when it
  matters. It was only shown while "Delete browsing data when you close
  Aerium" was on — but the same list is what spares a site from **Delete site
  data when its last tab closes**, so anyone using only that second setting
  had no way to see it, let alone add to it. It now appears whenever either
  setting is on.
- New setting: **Clear cached files too**, off by default. Tab-close clearing
  took cookies and site storage but never the cache, so a site could still be
  recognised by what it had left in there. Off by default because clearing
  cache on every tab close means downloading images, fonts and scripts again
  on your next visit.
- The wording around it was misleading too. "Delete site data when its last
  tab closes" referred to "your keep list", a name that appeared nowhere in
  the browser; it now points at the list by the name written above it. And
  the list no longer describes itself as protecting only what you ticked
  above, since it protects both settings.

**Content blocker**

- The built-in content blocker has been dropped. It never shipped in a working
  build, and a browser is a poor place to maintain filter lists: uBlock Origin
  and uBlock Origin Lite already do the job better, are updated far more often,
  and let you decide what to block. Aerium's job is to run them well. Aerium
  Guard keeps its three modes and loses the blocker section.

## 151.0.7922.173-1-b62 and earlier

Earlier releases predate this file. The GitHub release notes for each carry
the commit history.

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

**Settings, tidied**

- Everything Aerium deletes on its own — on exit, when a tab's last window
  closes, and the per-site rules over both — now lives behind one **Automatic
  cleanup** row on Privacy and security instead of five switches, a number
  field and a table stacked on the page. Nothing was removed; open the row and
  every option is where it was.
- **Automatically pin new tab groups created on any device to the bookmarks
  bar** is gone from Appearance, and the behaviour is off. Chromium turned it
  on by default, which meant the browser rearranged your bookmarks bar without
  being asked; an option to stop that is not the same as not doing it.

**Privacy and security**

- The **Never delete data for these sites** list is now reachable when it
  matters. It was only shown while "Delete browsing data when you close
  Aerium" was on — but the same list is what spares a site from **Delete site
  data when its last tab closes**, so anyone using only that second setting
  had no way to see it, let alone add to it. It now appears whenever either
  setting is on.
- **Site rules** replaces the three separate site lists with one table, the
  shape Cookie AutoDelete uses. Each row names a site, says which list it is
  on — **Never delete**, **Keep until I close Aerium**, or **Reset when its
  last tab closes** — and ticks which kinds of data survive: cookies, cache,
  file system, IndexedDB, local storage, service workers.
- **The greylist finally has a UI.** "Keep until I close Aerium" — stay signed
  in while you work, signed out tomorrow — has worked under the covers for a
  while but there was no way to add a site to it. It is a row type now.
- **Sites can be matched with a regular expression.** A plain address still
  covers its subdomains, so example.com matches www.example.com. For anything
  more exact, write a pattern between slashes: `/^(www\.)?example\.com$/`.
- Rules match on the host rather than being folded to the registrable domain
  first, so a rule naming one subdomain now means that subdomain instead of
  quietly widening to the whole site. Your existing lists are carried over
  automatically, keeping everything they kept before.
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

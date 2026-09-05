# Changelog

Written for people using Aerium rather than for people building it. Each
release on GitHub also links the full commit history if you want the detail
behind any of this.

## 152.0.7977.82-1 (next release)

**Fingerprinting**

- New: audio fingerprint noise, on by default at
  `chrome://flags/#aerium-audio-noise`. The usual audio fingerprint builds an
  OfflineAudioContext, runs an oscillator through a compressor, renders it and
  hashes the samples - a value that is stable per device, survives clearing
  everything and is the same in Incognito. Aerium now scales what a page reads
  back by a fixed factor of about a hundredth of a percent, chosen once per
  site. Nothing you can hear changes, and none of these paths feeds playback.
- `AudioContext.baseLatency` is now rounded to a millisecond, the way
  `outputLatency` next to it already was. It is the audio hardware's buffer size
  divided by its sample rate, so at full precision it names the device.
- The canvas, measureText and getClientRects noise, the WebGL vendor/renderer
  spoof, `navigator.hardwareConcurrency` reporting 2 and the stripping of
  high-entropy client hints are now **on for every new profile**. They used to
  be offered as a first-run choice, which meant closing that tab left you with
  none of them - while the Android build had all four compiled in and always
  on. The same browser was easier to fingerprint on a desktop than on a phone
  for no reason anyone chose. All of them are still in `chrome://flags` and
  still one click to turn off.
- New: **Report a different time zone**, at
  `chrome://flags/#aerium-time-zone`. The time zone is one of the strongest
  signals a page can read without asking - it is stable, it survives clearing
  everything, and it is the same in Incognito. Turned on, each site is told a
  different one, chosen when the process for that site starts, so a site sees
  one consistent answer and two sites do not see the same one.
- It is off by default and it will make times wrong. A calendar, a booking site
  or a flight tracker will be out by the offset, with nothing on screen to
  explain why. That is the trade; make it deliberately.

**Speed, memory and battery**

- Tabs beyond the five you used most recently are now frozen, and thawed for
  five seconds every minute so notifications, refreshes and connections still
  work. Browsing with many tabs open stops costing processor time in proportion
  to how many.
- Cross-process subframes that are off-screen, or cover a small part of the
  page and have never been touched, now run at lower priority and half the
  frame rate. That is an advertising iframe, described by what it does rather
  than by a filter list.
- Background housekeeping is held back while a page you are looking at is
  loading or while you are typing, and released when neither is true.
- On Windows, tabs are also frozen when free memory drops below 15%.
- These were all written by Chromium and shipped switched off, waiting to be
  turned on from Google's servers. A browser that never talks to those servers
  never gets the message, so it is sent here instead.

**Aerogel tabs**

- New: a tab with a cookie jar of its own. **App menu › New Aerogel tab**, or
  right-click a link and choose **Open link in Aerogel tab**. Sign in to a
  second account on a site you are already signed in to, or open a link without
  handing it to the profile that knows who you are. Aerogel tabs sit in a
  labelled tab group so you can see which ones they are.
- The jar is never written to disk, and it is emptied when the tab closes. It
  cannot be reopened with Ctrl+Shift+T and it is not written to the session
  file, because a restored Aerogel tab would look identical and be signed in as
  your ordinary self, which is the one thing the feature exists to prevent.
- It is not Incognito. History, downloads and the address bar's memory belong
  to the profile and still record where you went. This separates identity, not
  traces; Incognito remains the answer to leaving nothing behind locally.

**Search**

- DuckDuckGo is now the default engine, with Startpage second. Existing
  installs keep whichever engine they are already using - the browser will not
  move you off one you chose.
- degoog (degoog.org) replaces the SearXNG entry in the list.

**Secure DNS**

- **Settings › Privacy and security › Use secure DNS** offers more, and better,
  providers: Mullvad and Mullvad's ad-blocking resolver are new, and Quad9 and
  NextDNS now appear at all. Quad9 shipped complete but behind a disabled
  feature flag, so nobody ever saw it; NextDNS was restricted to the United
  States for no reason its endpoint justifies.

**Media**

- DRM is off until you turn it on, in a new **Settings › Media** section.
  Aerium does not bundle Google's Widevine module, so it no longer tells sites
  it has one unless you ask it to.

**Under the hood**

- Chromium 152.0.7977.82, which brings upstream's latest security fixes.

## 151.0.7922.173-1

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

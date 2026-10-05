# Cookies Tukios -Consent

One script tag that adds a cookie consent banner to a site and connects the
visitor's choice to Google (Analytics and Ads) and the Facebook pixel.

It wraps the open-source Silktide Consent Manager v2.0.1, which is kept
unmodified in `/vendor`. Everything Tukios-specific is in `tukios-consent.js`.

## Install on a site

Add this in the site's Head HTML, **above the Tukios GTM snippet**:

```html
<script src="https://cdn.jsdelivr.net/gh/ORG/cookies-tukios@0/tukios-consent.js" data-mode="opt-in"></script>
```

- Do not add `async` or `defer`. The script has to run before GTM so Google
  sees the starting state first.
- Replace `ORG` with the GitHub account that owns the repo.
- `@0` follows the latest `0.x` release. While testing, pin an exact tag such
  as `@v0.1.0` so a cached copy is never served.

## Options

Set these as attributes on the script tag.

| Attribute | Values | Default | What it does |
| --- | --- | --- | --- |
| `data-mode` | `opt-in`, `opt-out` | `opt-in` | Starting behavior before the visitor chooses |
| `data-lang` | `en`, `fr` | `en` | Banner language |
| `data-policy-url` | a URL, or `none` | `/privacy-policy` | Privacy Policy link in the banner. `none` hides it |
| `data-fb-pixel` | a pixel ID | none | Loads the Facebook pixel only when marketing is allowed |
| `data-backdrop` | `true`, `false` | `true` | Dims and holds the page until the visitor chooses |
| `data-position` | `bottomRight`, `bottomLeft`, `bottomCenter`, `center` | `bottomRight` | Banner position |
| `data-icon-position` | `bottomLeft`, `bottomRight` | `bottomRight` | Position of the reopen icon |
| `data-primary-color` | a CSS color | `#2F4A5C` | Buttons, links, icon |
| `data-background-color` | a CSS color | `#FFFFFF` | Banner background |
| `data-text-color` | a CSS color | `#2B2B2B` | Banner text |
| `data-font-family` | a CSS font stack | `inherit` | Defaults to the site's font |
| `data-credit` | `show`, `hide` | `hide` | Shows or hides the Silktide logo and credit link |
| `data-geo-url` | a URL | none | Optional visitor location lookup (see below) |
| `data-debug` | `true` | off | Logs each step to the browser console |

A missing or misspelled `data-mode` falls back to `opt-in`, the stricter one.

### The two modes

- **`opt-in`**: Google and Facebook tracking start off and turn on only if the
  visitor accepts.
- **`opt-out`**: tracking starts on and turns off if the visitor rejects. If
  the visitor's browser sends the Global Privacy Control signal, marketing
  starts off for them.

The banner, buttons and saved choice are the same in both.

## Styling from the site's CSS

The banner's defaults are placed at the very top of the page head, so anything
in the site's own CSS wins. To match a site's brand, add this to the site CSS:

```css
#stcm-wrapper {
  --primaryColor: #7A2E3A;
  --backgroundColor: #FBF7F2;
  --textColor: #3A2A2A;
  --iconColor: #7A2E3A;
  --iconBackgroundColor: #FBF7F2;
}
```

Anything not covered by a variable can be targeted directly, for example
`#stcm-wrapper .stcm-button { border-radius: 0; }`.

The reopen icon is 48px by default. To resize it, set both the circle and the
graphic inside it:

```css
#stcm-wrapper #stcm-icon { width: 60px; height: 60px; }
#stcm-wrapper #stcm-icon svg { width: 38px; height: 38px; }
```

## Cookie settings link

Any link to `#cookie-settings` reopens the preferences. Add one to the footer:

```html
<a href="#cookie-settings">Cookie settings</a>
```

The small icon in the corner does the same thing.

## Facebook pixel

With `data-fb-pixel="1234567890"` the loader loads the pixel itself, and only
once marketing is allowed. **Remove any pasted pixel snippet from the site
when using this**, or the pasted copy will keep firing on page load.

A pixel that lives inside someone else's GTM container is not controlled by
this script. Its owner has to add a consent condition in that container.

## What it controls

- **Google tags in every GTM container on the page**, through Google Consent
  Mode v2. This includes containers added by firms and marketing companies.
- **The Facebook pixel**, when it is loaded through `data-fb-pixel`.

It does not control chat widgets, iframes, or other pixels pasted into a
site's HTML.

## For the manage2 handoff

Two seams are already built in, and one piece has to be added on the platform.

**1. Settings from manage2.** Define this object before the script tag and it
overrides the attributes. Keys are the attribute names in camelCase.

```html
<script>
  window.tukiosConsentConfig = {
    mode: 'opt-out',
    lang: 'en',
    policyUrl: '/privacy-policy',
    fbPixel: '1234567890',
    primaryColor: '#2F4A5C',
    text: { prompt: { acceptAllButtonText: 'Accept' } }
  };
</script>
```

**2. Visitor location.** Set `data-geo-url` to an endpoint that returns the
visitor's location as JSON:

```json
{ "country": "CA", "region": "QC" }
```

- It is only called on `opt-out` sites, once per browser session.
- Visitors in Canada, the EU, the UK and nearby countries are switched to
  `opt-in`. Everyone else gets the site's `data-mode`.
- It can only tighten. An `opt-in` site stays `opt-in` for every visitor.
- Tracking stays off while the lookup is pending. If it fails or takes longer
  than one second, the site's `data-mode` decides.

On AWS, CloudFront can attach the viewer's country and region to each request,
so the endpoint may only need to echo those headers.

**3. Obituary pages.** Obituaries are served by the Tukios obituary platform,
not DUDA, so the DUDA Head HTML does not reach them. Tested on a live site:
the script does not load on an individual obituary page.

- Add the same script tag to the obituary platform's page head, above its GTM
  snippets, with the same options the firm's DUDA site uses.
- The saved choice is shared as long as both sides use the same hostname.
- Those pages send a Content Security Policy in report-only mode. If it is
  ever enforced, allow the script's host, its stylesheet, and the inline style
  block the loader adds.

## Script API

```js
tukiosConsent.getMode();     // "opt-in" or "opt-out"
tukiosConsent.getConsent();  // { essential: true, analytics: false, marketing: false }
tukiosConsent.open();        // open the preferences
tukiosConsent.reset();       // clear the saved choice and show the banner again
```

A `stcm_consent_update` event is pushed to the `dataLayer` whenever consent
changes, for GTM triggers.

## Test page

`demo/index.html` switches between modes, languages, themes and simulated
visitor locations, and shows what Google is told at each step. Serve the repo
folder and open `/demo/`:

```
npx serve .
```

## Publishing

1. Push this folder to a public GitHub repo.
2. Tag a release, for example `v0.1.0`.
3. Sites reference `@0`, which follows the latest `0.x` release.

jsDelivr caches version aliases, so a new release can take several days to
reach every site unless the cache is purged from jsDelivr's purge tool.

## Checks on a real site

Run these after Reject and again after Accept.

1. **Tag Assistant:** the Consent tab shows the expected state in each container.
2. **Network tab, filter `collect`:** `gcs=G100` means denied, `gcs=G111` means
   granted. Requests still appear when denied; judge by the `gcs` value.
3. **Cookies:** in a fresh browser profile, no `_ga`, `_gcl_au` or `_fbp` after
   Reject.
4. **Obituary pages:** once the script is on the obituary platform, the choice
   made on the DUDA site carries over.
5. **DUDA editor and preview:** confirm the banner does not get in the way.

## Known limits

- The choice is saved in the browser per hostname. `www` and non-`www` are
  treated as separate sites.
- There is no record of consent on a server.
- The French wording should be reviewed by a French speaker before use.
- Banner wording and the choice of mode are legal decisions.
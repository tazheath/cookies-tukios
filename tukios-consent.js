/*!
 * Tukios Consent Loader v0.1.0
 * Wraps the Silktide Consent Manager v2.0.1 (MIT, unmodified, in /vendor).
 * Install in the site <head>, above the GTM snippet, without async or defer.
 * Options are documented in README.md.
 */
(function (window, document) {
  'use strict';

  // Never run twice on one page.
  if (window.tukiosConsent && window.tukiosConsent.version) { return; }

  var VERSION = '0.1.0';

  // 1. Options. window.tukiosConsentConfig overrides the data attributes.
  var script = document.currentScript ||
    document.querySelector('script[src*="tukios-consent"]');
  var attrs = (script && script.dataset) || {};
  var config = window.tukiosConsentConfig || {};

  function option(name, fallback) {
    if (config[name] !== undefined && config[name] !== null && config[name] !== '') { return config[name]; }
    if (attrs[name] !== undefined && attrs[name] !== '') { return attrs[name]; }
    return fallback;
  }

  function isOn(value) { return value === true || value === 'true'; }

  var debug = isOn(option('debug', false));
  function log() {
    if (!debug || !window.console) { return; }
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[tukios-consent]');
    console.log.apply(console, args);
  }

  var scriptSrc = (script && script.src) ? script.src.split('?')[0].split('#')[0] : '';
  var basePath = scriptSrc.replace(/[^\/]*$/, '');
  var vendorPath = option('vendorPath', basePath + 'vendor/');

  // A missing or misspelled mode falls back to opt-in, the stricter one.
  var siteMode = option('mode', 'opt-in') === 'opt-out' ? 'opt-out' : 'opt-in';
  var lang = String(option('lang', 'en')).toLowerCase().slice(0, 2) === 'fr' ? 'fr' : 'en';
  var policyUrl = option('policyUrl', '');
  var fbPixelId = String(option('fbPixel', '')).replace(/[^0-9]/g, '');
  var geoUrl = option('geoUrl', '');

  // 2. Consent types and their Google consent signals.
  var GOOGLE_SIGNALS = {
    analytics: ['analytics_storage'],
    marketing: ['ad_storage', 'ad_user_data', 'ad_personalization']
  };
  var OPTIONAL_TYPES = ['analytics', 'marketing'];

  // Global Privacy Control: in opt-out mode, marketing starts off.
  var gpc = window.navigator && window.navigator.globalPrivacyControl === true;

  // Silktide saves each choice in localStorage as stcm.consent.<id>.
  function storedChoice(id) {
    try {
      var value = window.localStorage.getItem('stcm.consent.' + id);
      return value === null ? null : value === 'true';
    } catch (e) {
      return null;
    }
  }

  function modeDefault(id, mode) {
    if (mode !== 'opt-out') { return false; }
    if (id === 'marketing' && gpc) { return false; }
    return true;
  }

  function currentState(id, mode) {
    var saved = storedChoice(id);
    return saved === null ? modeDefault(id, mode) : saved;
  }

  function googleConsent(stateFor) {
    var result = {};
    OPTIONAL_TYPES.forEach(function (id) {
      var value = stateFor(id) ? 'granted' : 'denied';
      GOOGLE_SIGNALS[id].forEach(function (signal) { result[signal] = value; });
    });
    return result;
  }

  // 3. Visitor location (optional, opt-out sites only). It can only tighten
  //    a visitor to opt-in. Expected response: { "country": "CA", "region": "QC" }
  var OPT_IN_COUNTRIES = [
    'CA', 'GB', 'CH', 'IS', 'LI', 'NO',
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
  ];
  var GEO_CACHE_KEY = 'tukiosConsent.country';
  var GEO_TIMEOUT_MS = 1000;

  function modeForCountry(country) {
    return OPT_IN_COUNTRIES.indexOf(String(country || '').toUpperCase()) !== -1 ? 'opt-in' : siteMode;
  }

  function cachedCountry() {
    try { return window.sessionStorage.getItem(GEO_CACHE_KEY); } catch (e) { return null; }
  }

  var mode = siteMode;
  var geoPending = false;

  if (siteMode === 'opt-out' && geoUrl) {
    var knownCountry = cachedCountry();
    if (knownCountry) {
      mode = modeForCountry(knownCountry);
    } else {
      mode = 'opt-in';   // stay strict until the lookup answers
      geoPending = true;
    }
  }

  // 4. Tell Google the starting state. This has to run before GTM loads.
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function () { window.dataLayer.push(arguments); };
  }

  var defaults = googleConsent(function (id) { return modeDefault(id, mode); });
  if (geoPending) { defaults.wait_for_update = GEO_TIMEOUT_MS; }
  window.gtag('consent', 'default', defaults);
  log('mode:', mode, geoPending ? '(waiting on location)' : '', '| defaults:', defaults);

  function sendSavedChoice() {
    var hasSaved = OPTIONAL_TYPES.some(function (id) { return storedChoice(id) !== null; });
    if (!hasSaved) { return; }
    var saved = googleConsent(function (id) { return currentState(id, mode); });
    window.gtag('consent', 'update', saved);
    log('saved choice applied:', saved);
  }
  sendSavedChoice();

  // 5. Facebook pixel: loaded here, and only once marketing is allowed.
  var fbLoadedHere = false;

  function loadFacebookPixel() {
    if (!fbPixelId || fbLoadedHere) { return; }
    if (window.fbq) {
      log('a Facebook pixel is already on this page; not loading a second one');
      return;
    }
    var fbq = window.fbq = function () {
      if (fbq.callMethod) { fbq.callMethod.apply(fbq, arguments); } else { fbq.queue.push(arguments); }
    };
    if (!window._fbq) { window._fbq = fbq; }
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(tag);
    fbq('init', fbPixelId);
    fbq('track', 'PageView');
    fbLoadedHere = true;
    log('Facebook pixel loaded:', fbPixelId);
  }

  function allowFacebook() {
    if (fbLoadedHere) { window.fbq('consent', 'grant'); return; }
    if (fbPixelId) { loadFacebookPixel(); return; }
    if (window.fbq) { window.fbq('consent', 'grant'); }
  }

  function blockFacebook() {
    if (window.fbq) { window.fbq('consent', 'revoke'); }
  }

  // 6. Styling. Defaults go at the top of <head> so the site's CSS wins.
  function cssValue(value) {
    return String(value).replace(/[^#(),.%\w\s'"-]/g, '');
  }

  function addStyles() {
    var primary = cssValue(option('primaryColor', '#2F4A5C'));
    var background = cssValue(option('backgroundColor', '#FFFFFF'));
    var text = cssValue(option('textColor', '#2B2B2B'));
    var font = cssValue(option('fontFamily', 'inherit'));

    var css =
      '#stcm-wrapper{' +
        '--fontFamily:' + font + ';' +
        '--primaryColor:' + primary + ';' +
        '--backgroundColor:' + background + ';' +
        '--textColor:' + text + ';' +
        '--iconColor:' + primary + ';' +
        '--iconBackgroundColor:' + background + ';' +
        '--backdropBackgroundColor:#00000033;' +
        '--backdropBackgroundBlur:0px;' +
      '}' +
      '#stcm-wrapper button{font-family:inherit;}';

    if (option('credit', 'hide') === 'hide') {
      css += '#stcm-wrapper .stcm-logo,#stcm-wrapper .stcm-credit-link{display:none !important;}';
    }

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'silktide-consent-manager-css';
    link.href = vendorPath + 'silktide-consent-manager.css';

    var style = document.createElement('style');
    style.id = 'tukios-consent-defaults';
    style.appendChild(document.createTextNode(css));

    var head = document.head || document.getElementsByTagName('head')[0];
    head.insertBefore(style, head.firstChild);
    head.insertBefore(link, style);
  }

  // 7. Wording. tukiosConsentConfig.text overrides these.
  var TEXT = {
    en: {
      policyLink: 'Privacy Policy',
      toggleOn: 'On',
      toggleOff: 'Off',
      types: {
        essential: {
          label: 'Essential',
          description: '<p>These cookies are necessary for the website to function properly and cannot be switched off. They help with things like remembering your privacy preferences.</p>'
        },
        analytics: {
          label: 'Analytics',
          description: '<p>These cookies help us improve the site by showing which pages are most popular and how visitors move around the site.</p>'
        },
        marketing: {
          label: 'Marketing',
          description: '<p>These cookies are used by us and our advertising partners to show you relevant ads on this site and elsewhere, and to measure how those campaigns perform.</p>'
        }
      },
      prompt: {
        description: 'We use cookies on our site to improve your experience and to understand how the site is used.',
        acceptAllButtonText: 'Accept all',
        acceptAllButtonAccessibleLabel: 'Accept all cookies',
        rejectNonEssentialButtonText: 'Reject non-essential',
        rejectNonEssentialButtonAccessibleLabel: 'Reject all non-essential cookies',
        preferencesButtonText: 'Preferences',
        preferencesButtonAccessibleLabel: 'Open cookie preferences'
      },
      preferences: {
        title: 'Customize your cookie preferences',
        description: 'We respect your right to privacy. You can choose not to allow some types of cookies. Your choices apply across our website.',
        saveButtonText: 'Save and close',
        saveButtonAccessibleLabel: 'Save your cookie preferences',
        creditLinkText: 'Get this banner for free',
        creditLinkAccessibleLabel: 'Get this banner for free'
      }
    },
    fr: {
      policyLink: 'Politique de confidentialité',
      toggleOn: 'Oui',
      toggleOff: 'Non',
      types: {
        essential: {
          label: 'Essentiels',
          description: '<p>Ces témoins sont nécessaires au bon fonctionnement du site et ne peuvent pas être désactivés. Ils servent notamment à mémoriser vos préférences de confidentialité.</p>'
        },
        analytics: {
          label: 'Analytiques',
          description: '<p>Ces témoins nous aident à améliorer le site en indiquant quelles pages sont les plus consultées et comment les visiteurs y naviguent.</p>'
        },
        marketing: {
          label: 'Marketing',
          description: '<p>Ces témoins sont utilisés par nous et par nos partenaires publicitaires pour vous présenter des publicités pertinentes, sur ce site et ailleurs, et pour mesurer le rendement de ces campagnes.</p>'
        }
      },
      prompt: {
        description: 'Nous utilisons des témoins (cookies) pour améliorer votre expérience et comprendre comment le site est utilisé.',
        acceptAllButtonText: 'Tout accepter',
        acceptAllButtonAccessibleLabel: 'Accepter tous les témoins',
        rejectNonEssentialButtonText: 'Refuser les non essentiels',
        rejectNonEssentialButtonAccessibleLabel: 'Refuser tous les témoins non essentiels',
        preferencesButtonText: 'Préférences',
        preferencesButtonAccessibleLabel: 'Ouvrir les préférences de témoins'
      },
      preferences: {
        title: 'Personnalisez vos préférences de témoins',
        description: 'Nous respectons votre droit à la vie privée. Vous pouvez refuser certains types de témoins. Vos choix s’appliquent à l’ensemble de notre site.',
        saveButtonText: 'Enregistrer et fermer',
        saveButtonAccessibleLabel: 'Enregistrer vos préférences de témoins',
        creditLinkText: 'Obtenez cette bannière gratuitement',
        creditLinkAccessibleLabel: 'Obtenez cette bannière gratuitement'
      }
    }
  };

  function merge(target, source) {
    var output = {};
    var key;
    for (key in target) { if (Object.prototype.hasOwnProperty.call(target, key)) { output[key] = target[key]; } }
    for (key in (source || {})) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) { continue; }
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        output[key] = merge(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }
    return output;
  }

  function escapeAttribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function paragraph(body, text) {
    var link = policyUrl
      ? ' <a href="' + escapeAttribute(policyUrl) + '">' + text.policyLink + '</a>'
      : '';
    return '<p>' + body + link + '</p>';
  }

  // 8. Build the Silktide settings and start the banner.
  var text = merge(TEXT[lang], config.text);

  function translateToggles() {
    var on = document.querySelectorAll('#stcm-modal .stcm-toggle-on');
    var off = document.querySelectorAll('#stcm-modal .stcm-toggle-off');
    Array.prototype.forEach.call(on, function (el) { el.textContent = text.toggleOn; });
    Array.prototype.forEach.call(off, function (el) { el.textContent = text.toggleOff; });
  }

  function buildSilktideConfig() {
    return {
      debug: debug,
      backdrop: { show: option('backdrop', 'true') !== 'false' && option('backdrop', 'true') !== false },
      prompt: { position: option('position', 'bottomRight') },
      icon: { position: option('iconPosition', 'bottomLeft') },
      onPreferencesOpen: translateToggles,
      consentTypes: [
        {
          id: 'essential',
          label: text.types.essential.label,
          description: text.types.essential.description,
          required: true
        },
        {
          id: 'analytics',
          label: text.types.analytics.label,
          description: text.types.analytics.description,
          defaultValue: modeDefault('analytics', mode),
          gtag: GOOGLE_SIGNALS.analytics
        },
        {
          id: 'marketing',
          label: text.types.marketing.label,
          description: text.types.marketing.description,
          defaultValue: modeDefault('marketing', mode),
          gtag: GOOGLE_SIGNALS.marketing,
          onAccept: allowFacebook,
          onReject: blockFacebook
        }
      ],
      text: {
        prompt: merge(text.prompt, { description: paragraph(text.prompt.description, text) }),
        preferences: merge(text.preferences, { description: paragraph(text.preferences.description, text) })
      }
    };
  }

  var vendorReady = false;
  var started = false;

  function start() {
    if (started || !vendorReady || geoPending) { return; }
    if (!window.silktideConsentManager) { return; }
    started = true;

    // First visit in opt-out mode: marketing is already allowed.
    if (currentState('marketing', mode)) { loadFacebookPixel(); }

    window.silktideConsentManager.init(buildSilktideConfig());
    log('banner started in', mode, 'mode');
  }

  function loadVendor() {
    var tag = document.createElement('script');
    tag.src = vendorPath + 'silktide-consent-manager.js';
    tag.onload = function () { vendorReady = true; start(); };
    tag.onerror = function () {
      if (window.console) { console.warn('[tukios-consent] could not load the consent banner from ' + tag.src); }
    };
    (document.head || document.documentElement).appendChild(tag);
  }

  function finishGeo(country) {
    if (!geoPending) { return; }
    geoPending = false;
    if (country) {
      try { window.sessionStorage.setItem(GEO_CACHE_KEY, country); } catch (e) { /* ignore */ }
      mode = modeForCountry(country);
    } else {
      mode = siteMode;   // lookup failed: the site's own setting decides
    }
    var updated = googleConsent(function (id) { return currentState(id, mode); });
    window.gtag('consent', 'update', updated);
    log('location:', country || 'unknown', '| mode:', mode, '| state:', updated);
    start();
  }

  function lookUpLocation() {
    var timer = window.setTimeout(function () { finishGeo(null); }, GEO_TIMEOUT_MS);
    try {
      window.fetch(geoUrl, { credentials: 'omit' })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (data) {
          window.clearTimeout(timer);
          finishGeo(data && data.country ? String(data.country).toUpperCase() : null);
        })
        .catch(function () { window.clearTimeout(timer); finishGeo(null); });
    } catch (e) {
      window.clearTimeout(timer);
      finishGeo(null);
    }
  }

  addStyles();
  loadVendor();
  if (geoPending) { lookUpLocation(); }

  // 9. Public API. Links to #cookie-settings reopen the preferences.
  function openPreferences() {
    var manager = window.silktideConsentManager;
    var instance = manager && manager.getInstance && manager.getInstance();
    if (instance) { instance.toggleModal(true); }
  }

  function resetConsent() {
    var manager = window.silktideConsentManager;
    if (!manager || !manager.getInstance || !manager.getInstance()) { return; }
    manager.resetConsent();
    var fresh = googleConsent(function (id) { return modeDefault(id, mode); });
    window.gtag('consent', 'update', fresh);
    if (!modeDefault('marketing', mode)) { blockFacebook(); }
  }

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest
      ? event.target.closest('a[href$="#cookie-settings"],[data-tukios-consent="open"]')
      : null;
    if (!target) { return; }
    event.preventDefault();
    openPreferences();
  });

  window.tukiosConsent = {
    version: VERSION,
    getMode: function () { return mode; },
    getConsent: function () {
      return {
        essential: true,
        analytics: currentState('analytics', mode),
        marketing: currentState('marketing', mode)
      };
    },
    open: openPreferences,
    reset: resetConsent
  };
})(window, document);
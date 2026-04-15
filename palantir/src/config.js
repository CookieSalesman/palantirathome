// ── CONFIG ──────────────────────────────────────────────────
// API keys are stored in localStorage so they survive refreshes
// but never leave the browser.

export const Config = {
  get googleMapsKey()   { return localStorage.getItem('pal_google')  || '' },
  get cesiumToken()     { return localStorage.getItem('pal_cesium')  || '' },
  get adsbKey()         { return localStorage.getItem('pal_adsb')    || '' },
  get openskyUser()     { return localStorage.getItem('pal_osk_u')   || '' },
  get openskyPass()     { return localStorage.getItem('pal_osk_p')   || '' },

  save({ google, cesium, adsb, openskyUser, openskyPass }) {
    if (google)      localStorage.setItem('pal_google',  google);
    if (cesium)      localStorage.setItem('pal_cesium',  cesium);
    if (adsb)        localStorage.setItem('pal_adsb',    adsb);
    if (openskyUser) localStorage.setItem('pal_osk_u',   openskyUser);
    if (openskyPass) localStorage.setItem('pal_osk_p',   openskyPass);
  },

  clear() {
    ['pal_google','pal_cesium','pal_adsb','pal_osk_u','pal_osk_p']
      .forEach(k => localStorage.removeItem(k));
  },

  hasGoogle()   { return !!this.googleMapsKey },
  hasAdsb()     { return !!this.adsbKey },
  hasOpensky()  { return !!this.openskyUser && !!this.openskyPass },
  hasAny()      { return this.hasGoogle() || this.hasAdsb() || this.hasOpensky() },
};

const assets = {
  "heroBackdrop": {
    "src": "/assets/design/heroBackdrop.svg",
    "width": 366,
    "height": 190
  },
  "heroDots": {
    "src": "/assets/design/heroDots.svg",
    "width": 33,
    "height": 7
  },
  "thankYou": {
    "src": "/assets/design/thankYou.svg",
    "width": 65.1639,
    "height": 80
  },
  "facebook": {
    "src": "/assets/design/facebook.svg",
    "width": 20,
    "height": 20
  },
  "googleGreen": {
    "src": "/assets/design/googleGreen.svg",
    "width": 15.0117,
    "height": 8.46484
  },
  "googleGreenShade": {
    "src": "/assets/design/googleGreenShade.svg",
    "width": 6.43358,
    "height": 5.73436
  },
  "googleYellow": {
    "src": "/assets/design/googleYellow.svg",
    "width": 4.94922,
    "height": 10.125
  },
  "googleBlue": {
    "src": "/assets/design/googleBlue.svg",
    "width": 10.5859,
    "height": 9.94921
  },
  "googleBlueShade": {
    "src": "/assets/design/googleBlueShade.svg",
    "width": 10,
    "height": 9.94921
  },
  "googleRed": {
    "src": "/assets/design/googleRed.svg",
    "width": 15.1771,
    "height": 8.46484
  },
  "googleRedShade": {
    "src": "/assets/design/googleRedShade.svg",
    "width": 6.59891,
    "height": 5.89858
  },
  "filter": {
    "src": "/assets/design/filter.svg",
    "width": 16.1463,
    "height": 16.1066
  },
  "search": {
    "src": "/assets/design/search.svg",
    "width": 22,
    "height": 22
  },
  "home": {
    "src": "/assets/design/home.svg",
    "width": 15.8333,
    "height": 16.6668
  },
  "shop": {
    "src": "/assets/design/shop.svg",
    "width": 20,
    "height": 20
  },
  "user": {
    "src": "/assets/design/user.svg",
    "width": 20,
    "height": 20
  },
  "favorite": {
    "src": "/assets/design/favorite.svg",
    "width": 28,
    "height": 28
  },
  "wallet": {
    "src": "/assets/design/wallet.svg",
    "width": 20.101,
    "height": 18.5781
  },
  "facebookFooter": {
    "src": "/assets/design/facebookFooter.svg",
    "width": 32,
    "height": 32
  },
  "instagramFooter": {
    "src": "/assets/design/instagramFooter.svg",
    "width": 32,
    "height": 32
  },
  "twitterFooter": {
    "src": "/assets/design/twitterFooter.svg",
    "width": 32,
    "height": 32
  },
  "linkedinFooter": {
    "src": "/assets/design/linkedinFooter.svg",
    "width": 32,
    "height": 32
  },
  "youtubeFooter": {
    "src": "/assets/design/youtubeFooter.svg",
    "width": 32,
    "height": 32
  }
} as const;
export function DesignAsset({name,className=""}:{name:keyof typeof assets;className?:string}) { return <img {...assets[name]} alt="" className={className} />; }
export function GoogleMark() { return <span className="google-mark" aria-hidden="true"><DesignAsset name="googleGreen" /><DesignAsset name="googleGreenShade" /><DesignAsset name="googleYellow" /><DesignAsset name="googleBlue" /><DesignAsset name="googleBlueShade" /><DesignAsset name="googleRed" /><DesignAsset name="googleRedShade" /></span>; }

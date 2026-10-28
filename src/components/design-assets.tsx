const assets = {
  accountActivity: {
    src: "/assets/design/accountActivity.svg",
    width: 18,
    height: 18,
  },
  accountDownload: {
    src: "/assets/design/accountDownload.svg",
    width: 15.375,
    height: 15.4565,
  },
  accountHeart: {
    src: "/assets/design/accountHeart.svg",
    width: 16,
    height: 16,
  },
  accountLogout: {
    src: "/assets/design/accountLogout.svg",
    width: 17.7779,
    height: 16.9167,
  },
  accountOffers: {
    src: "/assets/design/accountOffers.svg",
    width: 15.8547,
    height: 15.9022,
  },
  accountSupport: {
    src: "/assets/design/accountSupport.svg",
    width: 15.7499,
    height: 15,
  },
  accountUser: {
    src: "/assets/design/accountUser.svg",
    width: 18,
    height: 18,
  },
  accountWallet: {
    src: "/assets/design/accountWallet.svg",
    width: 13.7497,
    height: 16.2502,
  },
  bottomHeart: {
    src: "/assets/design/bottomHeart.svg",
    width: 20,
    height: 17.7936,
  },
  facebook: {
    src: "/assets/design/facebook.svg",
    width: 20,
    height: 20,
  },
  facebookFooter: {
    src: "/assets/design/facebookFooter.svg",
    width: 32,
    height: 32,
  },
  favorite: {
    src: "/assets/design/favorite.svg",
    width: 28,
    height: 28,
  },
  filter: {
    src: "/assets/design/filter.svg",
    width: 16.1463,
    height: 16.1066,
  },
  googleBlue: {
    src: "/assets/design/googleBlue.svg",
    width: 10.5859,
    height: 9.94921,
  },
  googleBlueShade: {
    src: "/assets/design/googleBlueShade.svg",
    width: 10,
    height: 9.94921,
  },
  googleGreen: {
    src: "/assets/design/googleGreen.svg",
    width: 15.0117,
    height: 8.46484,
  },
  googleGreenShade: {
    src: "/assets/design/googleGreenShade.svg",
    width: 6.43358,
    height: 5.73436,
  },
  googleRed: {
    src: "/assets/design/googleRed.svg",
    width: 15.1771,
    height: 8.46484,
  },
  googleRedShade: {
    src: "/assets/design/googleRedShade.svg",
    width: 6.59891,
    height: 5.89858,
  },
  googleYellow: {
    src: "/assets/design/googleYellow.svg",
    width: 4.94922,
    height: 10.125,
  },
  heroBackdrop: {
    src: "/assets/design/heroBackdrop.svg",
    width: 366,
    height: 190,
  },
  heroDots: {
    src: "/assets/design/heroDots.svg",
    width: 33,
    height: 7,
  },
  home: {
    src: "/assets/design/home.svg",
    width: 15.8333,
    height: 16.6668,
  },
  instagramFooter: {
    src: "/assets/design/instagramFooter.svg",
    width: 32,
    height: 32,
  },
  linkedinFooter: {
    src: "/assets/design/linkedinFooter.svg",
    width: 32,
    height: 32,
  },
  purchaseCart: {
    src: "/assets/design/purchaseCart.svg",
    width: 20,
    height: 20,
  },
  scanBottomLeft: {
    src: "/assets/design/scanBottomLeft.svg",
    width: 10.3456,
    height: 10.3127,
  },
  scanBottomRight: {
    src: "/assets/design/scanBottomRight.svg",
    width: 10.3167,
    height: 10.2514,
  },
  scanCircle: {
    src: "/assets/design/scanCircle.svg",
    width: 65,
    height: 65,
  },
  scanLine: {
    src: "/assets/design/scanLine.svg",
    width: 26.8227,
    height: 1.78827,
  },
  scanTopLeft: {
    src: "/assets/design/scanTopLeft.svg",
    width: 10.39,
    height: 10.3063,
  },
  scanTopRight: {
    src: "/assets/design/scanTopRight.svg",
    width: 10.3856,
    height: 10.2993,
  },
  search: {
    src: "/assets/design/search.svg",
    width: 22,
    height: 22,
  },
  shop: {
    src: "/assets/design/shop.svg",
    width: 20,
    height: 20,
  },
  thankYou: {
    src: "/assets/design/thankYou.svg",
    width: 65.1639,
    height: 80,
  },
  twitterFooter: {
    src: "/assets/design/twitterFooter.svg",
    width: 32,
    height: 32,
  },
  user: {
    src: "/assets/design/user.svg",
    width: 20,
    height: 20,
  },
  wallet: {
    src: "/assets/design/wallet.svg",
    width: 20.101,
    height: 18.5781,
  },
  youtubeFooter: {
    src: "/assets/design/youtubeFooter.svg",
    width: 32,
    height: 32,
  },
} as const;
export function DesignAsset({
  name,
  className = "",
}: {
  name: keyof typeof assets;
  className?: string;
}) {
  return <img {...assets[name]} alt="" className={className} />;
}
export function GoogleMark() {
  return (
    <span className="google-mark" aria-hidden="true">
      <DesignAsset name="googleGreen" />
      <DesignAsset name="googleGreenShade" />
      <DesignAsset name="googleYellow" />
      <DesignAsset name="googleBlue" />
      <DesignAsset name="googleBlueShade" />
      <DesignAsset name="googleRed" />
      <DesignAsset name="googleRedShade" />
    </span>
  );
}
export function ScanMark() {
  return (
    <span className="scan-mark" aria-hidden="true">
      <DesignAsset name="scanLine" />
      <DesignAsset name="scanBottomLeft" />
      <DesignAsset name="scanTopRight" />
      <DesignAsset name="scanBottomRight" />
      <DesignAsset name="scanTopLeft" />
    </span>
  );
}

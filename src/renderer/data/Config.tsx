import {BT, HTF, IF, TF, VTF, WF, ZF} from "./const";

interface SceneSettingsI {
  [key: string]: string|number|boolean;
  timingFunction: string;
  timingConstant: string;
  imageTypeFilter: string;
  weightFunction: string;
  randomize: boolean;
  forceAll: boolean;
  zoomType: string;
  effectLevel: number;
  horizTransType: string;
  vertTransType: string;
  crossFade: boolean;
  backgroundType: string;
  backgroundColor: string;
  playFullGif: boolean;
  generatorMax: number;
  overlaySceneID: number;
  overlaySceneOpacity: number;
  textKind: string;
  textSource: string;

  strobe: boolean;
  strobeTime: number;
  strobeColor: string;

  blinkColor: string;
  blinkFontSize: number;
  blinkFontFamily: string;

  captionColor: string;
  captionFontSize: number;
  captionFontFamily: string;

  captionBigColor: string;
  captionBigFontSize: number;
  captionBigFontFamily: string;

  countColor: string;
  countFontSize: number;
  countFontFamily: string;
}

interface RemoteSettingsI {
  [key: string]: string | Array<string>;
  tumblrKeys: Array<string>;
  tumblrSecrets: Array<string>;

  tumblrKey: string;
  tumblrSecret: string;
  tumblrOAuthToken: string;
  tumblrOAuthTokenSecret: string;

  redditUserAgent: string;
  redditClientID: string;
  redditDeviceID: string;
  redditRefreshToken: string;

  instagramUsername: string;
  instagramPassword: string;
}

interface CacheSettingsI {
  [key: string]: string | number | boolean;
  enabled: boolean;
  directory: string;
  maxSize: number;
}

interface DisplaySettingsI {
  [key: string]: number | boolean;
  alwaysOnTop: boolean;
  showMenu: boolean;
  fullScreen: boolean;
  startImmediately: boolean;

  minImageSize: number;
  minVideoSize: number;
  maxInMemory: number;
  maxLoadingAtOnce: number;
  maxInHistory: number;
}

export class SceneSettings implements SceneSettingsI {
  [key: string]: string | number | boolean;

  timingFunction = TF.constant;
  timingConstant = "1000";
  imageTypeFilter = IF.any;
  weightFunction = WF.sources;
  randomize = true;
  forceAll = false;
  zoomType = ZF.none;
  effectLevel = 5;
  horizTransType = HTF.none;
  vertTransType = VTF.none;
  crossFade = false;
  backgroundType = BT.blur;
  backgroundColor = "#000000";
  playFullGif = false;
  generatorMax = 100;
  overlaySceneID = 0;
  overlaySceneOpacity = 0.5;
  nextSceneID = 0;
  nextSceneTime = 900;
  textKind = "";
  textSource = "";

  strobe = false;
  strobeOverlay = false;
  strobeTime = 200;
  strobeColor = "#FFFFFF";

  blinkColor = "#FFFFFF";
  blinkFontSize = 20;
  blinkFontFamily = "Arial Black,Arial Bold,Gadget,sans-serif";

  captionColor = "#FFFFFF";
  captionFontSize = 8;
  captionFontFamily = "Helvetica Neue,Helvetica,Arial,sans-serif";

  captionBigColor = "#FFFFFF";
  captionBigFontSize = 12;
  captionBigFontFamily = "Arial Black,Arial Bold,Gadget,sans-serif";

  countColor = "#FFFFFF";
  countFontSize = 20;
  countFontFamily = "Arial Black,Arial Bold,Gadget,sans-serif";
}

export class RemoteSettings implements RemoteSettingsI {
  [key: string]: string | Array<string>;

  tumblrKeys = ["BaQquvlxQeRhKRyViknF98vseIdcBEyDrzJBpHxvAiMPHCKR2l",
    "G4iZd6FBiyDxHVUpNqtOTDu4woWzfp8WuH3tTrT3MC16GTmNzq",
    "y5uUQJYTCp15Nj3P80cLmNFqwSr1mxIhm3C4PCsGAfReydkF9m",
    "IZiOt6PYazf4g0sYWVfpfebMITRFWmtlKq2UKe6l0RsqKHPgui",
    "ATtwOUlruyVl8bEiHTnYcRpByEAzov2LtLEWOfDLqhPRZFmT4X"];
  tumblrSecrets = ["XWVCo7t0GMGkOAd9wsxMMkKPhQbl3RqauGzQtnzAnmHCJ7WdSn",
    "RmoWUh844NqVdw7btWI6EYldJ91KhwJyfCKPtAIcuVokFtRYgS",
    "xiEV5sJISJAwegJHTTLWtxnmFUkowxgMk2gOq4mc20VNLM2TpJ",
    "Iw3yKgjfMvrKPNCcqdUyRuxCkYWYyRlrMdFUojRHVkSSADOKCT",
    "cMM7xqJV1roUudEdBiZeOqv3n1H0pzNnGY1iAbp3oo3c29MXGq"];

  tumblrKey = "";
  tumblrSecret = "";
  tumblrOAuthToken = "";
  tumblrOAuthTokenSecret = "";

  redditUserAgent = "desktop:flipflip:v2.0.0 (by /u/ififfy)";
  redditClientID = "2Iqe-1CsO4VQlA";
  redditDeviceID = "";
  redditRefreshToken = "";

  instagramUsername = "";
  instagramPassword = "";
}

export class CacheSettings implements CacheSettingsI {
  [key: string]: string | number | boolean;

  enabled = true;
  directory = "";
  maxSize = 500; // Size in MB
}

export class DisplaySettings  implements DisplaySettingsI {
  [key: string]: number | boolean;

  alwaysOnTop = false;
  showMenu = true;
  fullScreen = false;
  startImmediately = false;

  minVideoSize = 200;
  minImageSize = 200;
  maxInMemory = 120;
  maxLoadingAtOnce = 5;
  maxInHistory = 500;
}

export default class Config {
  defaultScene = new SceneSettings();
  remoteSettings = new RemoteSettings();
  caching = new CacheSettings();
  displaySettings = new DisplaySettings();
  
  constructor(init?: Partial<Config>) {
    Object.assign(this, init);

    // Add any missing keys (keeps config up-to-date)
    for (let key of Object.keys(new SceneSettings())) {
      if (this.defaultScene[key] == null) {
        this.defaultScene[key] = new SceneSettings()[key];
      }
    }
    for (let key of Object.keys(new RemoteSettings())) {
      if (this.remoteSettings[key] == null) {
        this.remoteSettings[key] = new RemoteSettings()[key];
      }
    }
    for (let key of Object.keys(new CacheSettings())) {
      if (this.caching[key] == null) {
        this.caching[key] = new CacheSettings()[key];
      }
    }
    for (let key of Object.keys(new DisplaySettings())) {
      if (this.displaySettings[key] == null) {
        this.displaySettings[key] = new DisplaySettings()[key];
      }
    }
  }
}
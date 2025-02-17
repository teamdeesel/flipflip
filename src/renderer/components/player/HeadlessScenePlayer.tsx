import * as React from 'react';
import * as fs from "fs";
import recursiveReaddir from 'recursive-readdir';
import fileURL from 'file-url';
import wretch from 'wretch';
import http from 'http';
import Snoowrap from 'snoowrap';
import tumblr from "tumblr.js";
import imgur from "imgur";
import {IgApiClient} from "instagram-private-api";

import {IF, ST, WF} from '../../data/const';
import {
  CancelablePromise,
  convertURL,
  getCachePath,
  getFileGroup,
  getFileName,
  getSourceType,
  isImage,
  isVideo,
  isImageOrVideo,
} from "../../data/utils";
import Config from "../../data/Config";
import Scene from '../../data/Scene';
import ChildCallbackHack from './ChildCallbackHack';
import ImagePlayer from './ImagePlayer';

let redditAlerted = false;
let tumblrAlerted = false;
let tumblr429Alerted = false;
let instagramAlerted = false;

// Returns true if array is empty, or only contains empty arrays
const isEmpty = function (allURLs: any[]): boolean {
  return Array.isArray(allURLs) && allURLs.every(isEmpty);
};

function filterPathsToJustPlayable(imageTypeFilter: string, paths: Array<string>, strict: boolean): Array<string> {
  switch (imageTypeFilter) {
    default:
    case IF.any:
      return paths.filter((p) => isImageOrVideo(p, strict));
    case IF.stills:
      return paths.filter((p) => isImage(p, strict));
    case IF.gifs:
      return paths.filter((f) => f.toLowerCase().endsWith('.gif') || isVideo(f, strict));
  }
}

// Determine what kind of source we have based on the URL and return associated Promise
function getPromise(config: Config, url: string, filter: string, next: any): CancelablePromise {
  let promise;
  const sourceType = getSourceType(url);

  if (sourceType == ST.local) { // Local files
    promise = loadLocalDirectory(config, url, filter, null);
  } else if (sourceType == ST.list) { // Image List
    promise = loadRemoteImageURLList(config, url, filter, null);
  } else { // Paging sources
    let promiseFunction;
    let timeout;
    if (sourceType == ST.tumblr) {
      promiseFunction = loadTumblr;
      timeout = 3000;
    } else if (sourceType == ST.reddit) {
      promiseFunction = loadReddit;
      timeout = 3000;
    } else if (sourceType == ST.imagefap) {
      promiseFunction = loadImageFap;
      timeout = 8000;
    } else if (sourceType == ST.sexcom) {
      promiseFunction = loadSexCom;
      timeout = 8000;
    } else if (sourceType == ST.imgur) {
      promiseFunction = loadImgur;
      timeout = 3000;
    } else if (sourceType == ST.twitter) {
      promiseFunction = loadTwitter;
      timeout = 3000;
    } else if (sourceType == ST.deviantart) {
      promiseFunction = loadDeviantArt;
      timeout = 3000;
    } else if (sourceType == ST.instagram) {
      promiseFunction = loadInstagram;
      timeout = 3000;
    }
    if (next == -1) {
      const cachePath = getCachePath(url, config);
      if (fs.existsSync(cachePath) && config.caching.enabled) {
        // If the cache directory exists, use it
        promise = loadLocalDirectory(config, cachePath, filter, 0);
        timeout = 0;
      } else {
        promise = promiseFunction(config, url, filter, 0);
      }
    } else {
      promise = promiseFunction(config, url, filter, next);
    }
    promise.timeout = timeout;
  }
  promise.source = url;
  return promise;
}

function loadLocalDirectory(config: Config, url: string, filter: string, next: any): CancelablePromise {
  const blacklist = ['*.css', '*.html', 'avatar.png'];

  return new CancelablePromise((resolve) => {
    recursiveReaddir(url, blacklist, (err: any, rawFiles: Array<string>) => {
      if (err) {
        console.warn(err);
        resolve(null);
      } else {
        resolve({
          data: filterPathsToJustPlayable(filter, rawFiles, true).map((p) => fileURL(p)),
          next: next
        });
      }
    });
  });
}

function loadRemoteImageURLList(config: Config, url: string, filter: string, next: any): CancelablePromise {
  return new CancelablePromise((resolve) => {
    wretch(url)
      .get()
      .text(data => {
        const lines = data.match(/[^\r\n]+/g).filter((line) => line.startsWith("http"));
        if (lines.length > 0) {
          let convertedSource = Array<string>();
          let convertedCount = 0;
          for (let url of lines) {
            convertURL(url).then((urls: Array<string>) => {
              convertedSource = convertedSource.concat(urls);
              convertedCount++;
              if (convertedCount == lines.length) {
                resolve({
                  data: filterPathsToJustPlayable(filter, convertedSource, true),
                  next: null
                });
              }
            });
          }
        } else {
          console.warn("No lines in", url, "start with 'http://'");
          resolve(null)
        }
      })
      .catch((e) => {
        console.warn("Fetch error on", url);
        console.warn(e);
        resolve(null);
      });
  });
}

function loadTumblr(config: Config, url: string, filter: string, next: any): CancelablePromise {
  let configured = config.remoteSettings.tumblrOAuthToken != "" && config.remoteSettings.tumblrOAuthTokenSecret != "";
  if (configured) {
    return new CancelablePromise((resolve) => {
      const client = tumblr.createClient({
        consumer_key: config.remoteSettings.tumblrKey,
        consumer_secret: config.remoteSettings.tumblrSecret,
        token: config.remoteSettings.tumblrOAuthToken,
        token_secret: config.remoteSettings.tumblrOAuthTokenSecret,
      });
      // TumblrID takes the form of <blog_name>.tumblr.com
      let tumblrID = url.replace(/https?:\/\//, "");
      tumblrID = tumblrID.replace("/", "");
      client.blogPosts(tumblrID, {offset: next*20}, (err, data) => {
        if (err) {
          console.error("Error retriving " + tumblrID + (next == 0 ? "" : "(Page " + next + " )"));
          console.error(err);
          if (err.message.includes("429 Limit Exceeded") && !tumblr429Alerted && next == 0) {
            alert("Tumblr has temporarily throttled your FlipFlip due to high traffic. Try again in a few minutes or visit config to try a different Tumblr API key.");
            tumblr429Alerted = true;
          }
          resolve(null);
          return;
        }

        // End loop if we're at end of posts
        if (data.posts.length == 0) {
          resolve(null);
          return;
        }

        let images = [];
        for (let post of data.posts) {
          // Sometimes photos are listed separately
          if (post.photos) {
            for (let photo of post.photos) {
              images.push(photo.original_size.url);
            }
          }
          if (post.player) {
            for (let embed of post.player) {
              const regex = /<iframe[^(?:src|\/>)]*src=["']([^"']*)[^(?:\/>)]*\/?>/g;
              let imageSource;
              while ((imageSource = regex.exec(embed.embed_code)) !== null) {
                images.push(imageSource[1]);
              }
            }
          }
          if (post.body) {
            const regex = /<img[^(?:src|\/>)]*src=["']([^"']*)[^(?:\/>)]*\/?>/g;
            let imageSource;
            while ((imageSource = regex.exec(post.body)) !== null) {
              images.push(imageSource[1]);
            }
          }
          if (post.video_url) {
            images.push(post.video_url);
          }
        }

        if (images.length > 0) {
          let convertedSource = Array<string>();
          let convertedCount = 0;
          for (let url of images) {
            convertURL(url).then((urls: Array<string>) => {
              convertedSource = convertedSource.concat(urls);
              convertedCount++;
              if (convertedCount == images.length) {
                resolve({
                  data: filterPathsToJustPlayable(filter, convertedSource, true),
                  next: (next as number) + 1
                });
              }
            });
          }
        } else {
          resolve(null);
        }
      });
    });
  } else {
    if (!tumblrAlerted) {
      alert("You haven't authorized FlipFlip to work with Reddit yet.\nVisit Config and click 'Authorzie FlipFlip on Reddit'.");
      tumblrAlerted = true;
    }
    return new CancelablePromise((resolve) => {
      resolve(null);
    });
  }
}

function loadReddit(config: Config, url: string, filter: string, next: any): CancelablePromise {
  let configured = config.remoteSettings.redditRefreshToken != "";
  if (configured) {
      return new CancelablePromise((resolve) => {
        const reddit = new Snoowrap({
          userAgent: config.remoteSettings.redditUserAgent,
          clientId: config.remoteSettings.redditClientID,
          clientSecret: "",
          refreshToken: config.remoteSettings.redditRefreshToken,
        });
        if (url.includes("/r/")) {
          reddit.getSubreddit(getFileGroup(url)).getHot({after: next})
            .then((submissionListing: any) => {
              if (submissionListing.length > 0) {
                let convertedListing = Array<string>();
                let convertedCount = 0;
                for (let s of submissionListing) {
                  convertURL(s.url).then((urls: Array<string>) => {
                    convertedListing = convertedListing.concat(urls);
                    convertedCount++;
                    if (convertedCount == submissionListing.length) {
                      resolve({
                        data: filterPathsToJustPlayable(filter, convertedListing, true),
                        next: submissionListing[submissionListing.length - 1].name
                      });
                    }
                  });
                }
              } else {
                resolve(null);
              }
            })
            .catch((error: any) => {
              resolve(null);
            });
        } else if (url.includes("/user/") || url.includes("/u/")) {
          reddit.getUser(getFileGroup(url)).getSubmissions({after: next})
            .then((submissionListing: any) => {
            if (submissionListing.length > 0) {
              let convertedListing = Array<string>();
              let convertedCount = 0;
              for (let s of submissionListing) {
                convertURL(s.url).then((urls: Array<string>) => {
                  convertedListing = convertedListing.concat(urls);
                  convertedCount++;
                  if (convertedCount == submissionListing.length) {
                    resolve({
                      data: filterPathsToJustPlayable(filter, convertedListing, true),
                      next: submissionListing[submissionListing.length - 1].name
                    });
                  }
                });
              }
            } else {
              resolve(null);
            }
          }).catch((err: any) => {
            // If user is not authenticated for users, prompt to re-authenticate
            if (err.statusCode == 403) {
              alert("You have not authorized FlipFlip to work with Reddit users submissions. Visit config and authorize FlipFlip to work with Reddit. Try clearing and re-authorizing FlipFlip with Reddit.");
            }
            resolve(null);
          });
        }
      });
  } else {
    if (!redditAlerted) {
      alert("You haven't authorized FlipFlip to work with Reddit yet.\nVisit Config and click 'Authorzie FlipFlip on Reddit'.");
      redditAlerted = true;
    }
    return new CancelablePromise((resolve) => {
      resolve(null);
    });
  }
}

function loadImageFap(config: Config, url: string, filter: string, next: any): CancelablePromise {
  if (next == 0) {
    next = [0, 0];
  }
  return new CancelablePromise((resolve) => {
    if (url.includes("/pictures/")) {
      wretch("http://www.imagefap.com/gallery/" + getFileGroup(url) + "?view=2")
        .get()
        .setTimeout(5000)
        .onAbort((e) => resolve(null))
        .text((html) => {
          let imageEls = new DOMParser().parseFromString(html, "text/html").querySelectorAll(".expp-container > form > table > tbody > tr > td");
          if (imageEls.length > 0) {
            let imageCount = 0;
            let images = Array<string>();
            for (let image of imageEls) {
              wretch("http://www.imagefap.com/photo/" + image.id + "/")
                .get()
                .text((html) => {
                  imageCount++;
                  let contentURL = html.match("\"contentUrl\": \"(.*?)\",");
                  if (contentURL != null) {
                    images.push(contentURL[1]);
                  }
                  if (imageCount == imageEls.length) {
                    resolve({
                      data: filterPathsToJustPlayable(filter, images, true),
                      next: null
                    });
                  }
                })
            }
          } else {
            resolve(null);
          }
        });
    } else if (url.includes("/organizer/")) {
      wretch(url + "?page=" + next[0])
        .get()
        .setTimeout(5000)
        .onAbort((e) => resolve(null))
        .text((html) => {
          let albumEls = new DOMParser().parseFromString(html, "text/html").querySelectorAll("td.blk_galleries > font > a.blk_galleries");
          if (albumEls.length == 0) {
            resolve(null);
          } else if (albumEls.length > next[1]) {
            let albumEl = albumEls[next[1]];
            let albumID = albumEl.getAttribute("href").substring(albumEl.getAttribute("href").lastIndexOf("/") + 1);
            wretch("http://www.imagefap.com/gallery/" + albumID + "?view=2")
              .get()
              .text((html) => {
                let imageEls = new DOMParser().parseFromString(html, "text/html").querySelectorAll(".expp-container > form > table > tbody > tr > td");
                if (imageEls.length > 0) {
                  let images = Array<string>();
                  let imageCount = 0;
                  for (let image of imageEls) {
                    wretch("http://www.imagefap.com/photo/" + image.id + "/")
                      .get()
                      .text((html) => {
                        imageCount++;
                        let contentURL = html.match("\"contentUrl\": \"(.*?)\",");
                        if (contentURL != null) {
                          images.push(contentURL[1]);
                        }
                        if (imageCount == imageEls.length) {
                          next[1] += 1;
                          resolve({
                            data: filterPathsToJustPlayable(filter, images, true),
                            next: next
                          })
                        }
                      });
                  }
                } else {
                  next[1] += 1;
                  resolve({
                    data: [],
                    next: next
                  })
                }
              });
          } else {
            next[0] += 1;
            next[1] = 0;
            resolve({
              data: [],
              next: next
            })
          }
        });
    } else if (url.includes("/video.php?vid=")) {
      wretch(url)
        .get()
        .setTimeout(5000)
        .onAbort((e) => resolve(null))
        .text((html) => {
          let videoEls = new DOMParser().parseFromString(html, "text/html").querySelectorAll(".video-js");
          if (videoEls.length == 0) {
            resolve(null);
          } else {
            let videoURLs = Array<string>();
            for (let el of videoEls) {
              let videoURL = "";
              let videoDimension = 0;
              for (let source of el.querySelectorAll("source")) {
                if (parseInt(source.getAttribute("res"), 10) > videoDimension) {
                  videoDimension = parseInt(source.getAttribute("res"), 10);
                  videoURL = source.src;
                }
              }
              if (videoURL != "") {
                videoURLs.push(videoURL.split("?")[0]);
              }
            }
            resolve({
              data: videoURLs,
              next: null
            })
          }
        });
    }
  });
}

function loadSexCom(config: Config, url: string, filter: string, next: any): CancelablePromise {
  return new CancelablePromise((resolve) => {
    let requestURL;
    if (url.includes("/user/")) {
      requestURL = "http://www.sex.com/user/" + getFileGroup(url) + "?page=" + (next + 1);
    } else if (url.includes("/gifs/") || url.includes("/pics/") || url.includes("/videos/")) {
      requestURL = "http://www.sex.com/" + getFileGroup(url) + "?page=" + (next + 1);
    }
    wretch(requestURL)
      .get()
      .setTimeout(5000)
      .onAbort((e) => resolve(null))
      .notFound((e) => resolve(null))
      .text((html) => {
        let imageEls = new DOMParser().parseFromString(html, "text/html").querySelectorAll(".small_pin_box > .image_wrapper > img");
        if (imageEls.length > 0) {
          let videos = Array<string>();
          let images = Array<string>();
          for (let image of imageEls) {
            if (image.nextElementSibling || image.previousElementSibling) {
              videos.push(image.parentElement.getAttribute("href"));
            } else {
              images.push(image.getAttribute("data-src"));
            }
          }
          if (videos.length == 0) {
            resolve({
              data: filterPathsToJustPlayable(filter, images, true),
              next: next + 1
            })
          } else {
            let count = 0;
            for (let videoURL of videos) {
              wretch("http://www.sex.com" + videoURL)
                .get()
                .setTimeout(5000)
                .onAbort((e) => resolve({
                  data: filterPathsToJustPlayable(filter, images, true),
                  next: next + 1,
                }))
                .notFound((e) => resolve({
                  data: filterPathsToJustPlayable(filter, images, true),
                  next: next + 1,
                }))
                .text((html) => {
                  count += 1;

                  let vidID = null;
                  const vidIDRegex = /\/video\/stream\/(\d+)/g;
                  let regexResult = vidIDRegex.exec(html);
                  if (regexResult != null) {
                    vidID = regexResult[1];
                  }

                  let date = null;
                  const dateRegex = /\d{4}\/\d{2}\/\d{2}/g;
                  regexResult = dateRegex.exec(html);
                  if (regexResult != null) {
                    date = regexResult[0];
                  }

                  if (vidID != null && date != null) {
                    images.push("https://videos1.sex.com/stream/" + date + "/" + vidID +".mp4");
                  }
                  if (count == videos.length) {
                    resolve({
                      data: filterPathsToJustPlayable(filter, images, true),
                      next: next + 1
                    })
                  }
                });
            }
          }
        } else {
          resolve(null);
        }
      });
  });
}

function loadImgur(config: Config, url: string, filter: string, next: any): CancelablePromise {
  return new CancelablePromise((resolve) => {
    imgur.getAlbumInfo(getFileGroup(url))
      .then((json: any) => {
        resolve({
          data: filterPathsToJustPlayable(filter, json.data.images.map((i: any) => i.link), true),
          next: null
        })
      })
      .catch((err: any) => {
        console.error(err.message);
        resolve(null);
      });
  });
}

function loadTwitter(config: Config, url: string, filter: string, next: any): CancelablePromise {
  // TODO This endpoint doesn't provide video links (just photos) so a new endpoint or library will be necessary (like one with oauth)
  return new CancelablePromise((resolve) => {
      wretch("https://twitter.com/i/profiles/show/" + getFileGroup(url) + "/media_timeline" + (next != 0 ? next : ""))
        .get()
        .setTimeout(5000)
        .onAbort((e) => resolve(null))
        .notFound((e) => resolve(null))
        .json((json) => {
          const itemsHTML = new DOMParser().parseFromString(json.items_html, "text/html");
          const imageEls = itemsHTML.querySelectorAll(".AdaptiveMedia-photoContainer");
          let images = Array<string>();
          for (let image of imageEls) {
            images.push(image.getAttribute("data-image-url"));
          }
          const tweets = itemsHTML.querySelectorAll(".tweet");
          if (tweets.length == 0) {
            resolve(null);
            return;
          }
          const lastTweetID = tweets[tweets.length-1].getAttribute("data-tweet-id");
          resolve({
            data: filterPathsToJustPlayable(filter, images, true),
            next: "?last_note_ts=" + lastTweetID + "&max_position=" + (parseInt(lastTweetID, 10) - 1)
          });
        });
  });
}

function loadDeviantArt(config: Config, url: string, filter: string, next: any): CancelablePromise {
  return new CancelablePromise((resolve) => {
    wretch("http://backend.deviantart.com/rss.xml?type=deviation&q=by%3A" + getFileGroup(url) + "+sort%3Atime+meta%3Aall" + (next != 0 ? "&offset=" + next : ""))
      .get()
      .setTimeout(5000)
      .onAbort((e) => resolve(null))
      .notFound((e) => resolve(null))
      .text((text) => {
        const xml = new DOMParser().parseFromString(text, "text/xml");
        let hasNextPage = false;
        for (let link of xml.getElementsByTagName("atom:link")) {
          if (link.getAttribute("rel") == "next") hasNextPage = true;
        }
        let images = Array<string>();
        for (let item of xml.getElementsByTagName("item")) {
          next+=1;
          for (let content of item.getElementsByTagName("media:content")) {
            if (content.getAttribute("medium") == "image") {
              images.push(content.getAttribute("url"));
            }
          }
        }
        resolve({
          data: filterPathsToJustPlayable(filter, images, true),
          next: hasNextPage ? next : null
        });
      });
  });
}

let ig: IgApiClient = null;
let session: any = null;
function loadInstagram(config: Config, url: string, filter: string, next: any): CancelablePromise {
  const configured = config.remoteSettings.instagramUsername != "" && config.remoteSettings.instagramPassword != "";
  if (configured) {
    const processItems = (items: any, resolve: any, next: any) => {
      let images = Array<string>();
      for (let item of items) {
        if (item.carousel_media) {
          for (let media of item.carousel_media) {
            images.push(media.image_versions2.candidates[0].url);
          }
        }
        if (item.video_versions) {
          images.push(item.video_versions[0].url);
        } else if (item.image_versions2) {
          images.push(item.image_versions2.candidates[0].url);
        }
      }
      // Strict filter won't work because instagram media needs the extra parameters on the end
      resolve({
        data: filterPathsToJustPlayable(filter, images, false),
        next: next
      });
    };

    if (ig == null) {
      ig = new IgApiClient();
      ig.state.generateDevice(config.remoteSettings.instagramUsername);
      return new CancelablePromise((resolve) => {
        ig.account.login(config.remoteSettings.instagramUsername, config.remoteSettings.instagramPassword).then((loggedInUser) => {
          ig.state.serializeCookieJar().then((cookies) => {
            session = JSON.stringify(cookies);
            ig.user.getIdByUsername(getFileGroup(url)).then((id) => {
              const userFeed = ig.feed.user(id);
              userFeed.items().then((items) => {
                processItems(items, resolve, id + "~" + userFeed.serialize());
              }).catch((e) => {console.error(e);resolve(null)});
            }).catch((e) => {console.error(e);resolve(null)});
          }).catch((e) => {console.error(e);resolve(null)});
        }).catch((e) => {alert(e);console.error(e);ig = null;resolve(null)});
      });
    } else if (next == 0) {
      return new CancelablePromise((resolve) => {
        ig.user.getIdByUsername(getFileGroup(url)).then((id) => {
          const userFeed = ig.feed.user(id);
          userFeed.items().then((items) => {
            processItems(items, resolve, id + "~" + userFeed.serialize());
          }).catch((e) => {console.error(e);resolve(null)});
        }).catch((e) => {console.error(e);resolve(null)});
      });
    } else {
      return new CancelablePromise((resolve) => {
        ig.state.deserializeCookieJar(JSON.parse(session)).then((data) => {
          const id = (next as string).split("~")[0];
          const feedSession = (next as string).split("~")[1];
          const userFeed = ig.feed.user(id);
          userFeed.deserialize(feedSession);
          if (!userFeed.isMoreAvailable()) {
            resolve(null);
            return;
          }
          userFeed.items().then((items) => {
            processItems(items, resolve, id + "~" + userFeed.serialize());
          }).catch((e) => {console.error(e);resolve(null)});
        }).catch((e) => {console.error(e);resolve(null)});
      });
    }
  } else {
    if (!instagramAlerted) {
      alert("You haven't authorized FlipFlip to work with Instagram yet.\nVisit Config and populate your username and password.\nNote this information is only kept on your computer and never shared with anyone else.");
      instagramAlerted = true;
    }
    return new CancelablePromise((resolve) => {
      resolve(null);
    });
  }
}

export default class HeadlessScenePlayer extends React.Component {
  readonly props: {
    config: Config,
    scene: Scene,
    nextScene: Scene,
    opacity: number,
    isPlaying: boolean,
    strobe: boolean,
    strobeTime: number,
    historyOffset: number,
    advanceHack?: ChildCallbackHack,
    deleteHack?: ChildCallbackHack,
    setHistoryOffset: (historyOffset: number) => void,
    setHistoryPaths: (historyPaths: Array<any>) => void,
    firstImageLoaded: () => void,
    finishedLoading: (empty: boolean) => void,
    setProgress: (tota: number, current: number, message: string) => void,
    hasStarted: boolean,
  };

  readonly state = {
    promiseQueue: Array<{source: string, next: any}>(),
    promise: new CancelablePromise((resolve, reject) => {}),
    nextPromise: new CancelablePromise((resolve, reject) => {}),
    allURLs: new Map<string, Array<string>>(),
    restart: false,
    preload: false,
  };

  nextPromiseQueue = Array<{source: string, next: any}>();
  nextAllURLs = new Map<string, Array<string>>();

  render() {
    return (
      <div
        className="HeadlessScenePlayer"
        style={{opacity: this.props.opacity}}>

        {this.state.allURLs.size > 0 && this.state.restart == false && (
          <ImagePlayer
            config={this.props.config}
            scene={this.props.scene}
            isPlaying={this.props.isPlaying}
            historyOffset={this.props.historyOffset}
            setHistoryOffset={this.props.setHistoryOffset}
            setHistoryPaths={this.props.setHistoryPaths}
            maxInMemory={this.props.config.displaySettings.maxInMemory}
            maxLoadingAtOnce={this.props.config.displaySettings.maxLoadingAtOnce}
            maxToRememberInHistory={this.props.config.displaySettings.maxInHistory}
            advanceHack={this.props.advanceHack}
            deleteHack={this.props.deleteHack}
            strobe={this.props.strobe}
            strobeTime={this.props.strobeTime}
            hasStarted={this.props.hasStarted}
            allURLs={isEmpty(Array.from(this.state.allURLs.values())) ? null : this.state.allURLs}
            onLoaded={this.props.firstImageLoaded.bind(this)}/>)}
      </div>
    );
  }

  componentDidMount() {
    redditAlerted = false;
    tumblrAlerted = false;
    tumblr429Alerted = false;
    instagramAlerted = false;
    let n = 0;
    let newAllURLs = new Map<string, Array<string>>();

    let sourceLoop = () => {
      if (this.state.promise.hasCanceled) return;

      const d = this.props.scene.sources[n] != null ? this.props.scene.sources[n].url : "";

      let message = d;
      if (this.props.opacity != 1) {
        message = "<p>Loading Overlay...</p>" + message;
      }
      this.props.setProgress(this.props.scene.sources.length, n+1, message);

      const loadPromise = getPromise(this.props.config, d, this.props.scene.imageTypeFilter, -1);
      this.setState({promise: loadPromise});

      loadPromise
        .getPromise()
        .then((object) => {
          let newPromiseQueue = this.state.promiseQueue;
          n += 1;

          // Just add the new urls to the end of the list
          if (object != null) {
            if (this.props.scene.weightFunction == WF.sources) {
              newAllURLs.set(loadPromise.source, object.data);
            } else {
              for (let d of object.data) {
                newAllURLs.set(d, [loadPromise.source]);
              }
            }

            // If this is a remote URL, queue up the next promise
            if (object.next != null) {
              newPromiseQueue.push({source: d, next: object.next});
            }
          }

          this.setState({allURLs: newAllURLs, promiseQueue: newPromiseQueue});
          if (n < this.props.scene.sources.length) {
            setTimeout(sourceLoop, loadPromise.timeout);
          } else {
            this.props.finishedLoading(isEmpty(Array.from(newAllURLs.values())));
            promiseLoop();
            if (this.props.nextScene) {
              n = 0;
              nextSourceLoop();
            }
          }
        });
    };

    let nextSourceLoop = () => {
      if (this.state.nextPromise.hasCanceled) return;

      const d = this.props.nextScene.sources[n] != null ? this.props.nextScene.sources[n].url : "";
      const loadPromise = getPromise(this.props.config, d, this.props.nextScene.imageTypeFilter, -1);
      this.setState({nextPromise: loadPromise});

      loadPromise
        .getPromise()
        .then((object) => {
          n += 1;

          // Just add the new urls to the end of the list
          if (object != null) {
            if (this.props.nextScene.weightFunction == WF.sources) {
              this.nextAllURLs.set(loadPromise.source, object.data);
            } else {
              for (let d of object.data) {
                this.nextAllURLs.set(d, [loadPromise.source]);
              }
            }

            // If this is a remote URL, queue up the next promise
            if (object.next != null) {
              this.nextPromiseQueue.push({source: d, next: object.next})
            }
          }

          if (n < this.props.nextScene.sources.length) {
            setTimeout(nextSourceLoop, loadPromise.timeout);
          }
        });
    };

    let promiseLoop = () => {
      // Process until queue is empty or player has been stopped
      if (this.state.promiseQueue.length > 0 && !this.state.promise.hasCanceled) {
        const promiseData = this.state.promiseQueue.shift();
        const promise = getPromise(this.props.config, promiseData.source, this.props.scene.imageTypeFilter, promiseData.next);
        this.setState({promise: promise});

        promise
          .getPromise()
          .then((object) => {
            // If we are not at the end of a source
            if (object != null) {
              // Update the correct index with our new images
              let newAllURLs = this.state.allURLs;
              if (this.props.scene.weightFunction == WF.sources) {
                let sourceURLs = newAllURLs.get(promise.source);
                newAllURLs.set(promise.source, sourceURLs.concat(object.data.filter((u) => {
                  const fileName = getFileName(u);
                  return !sourceURLs.map((u) => getFileName(u)).includes(fileName);
                })));
              } else {
                for (let d of object.data) {
                  newAllURLs.set(d, [promise.source]);
                }
              }

              // Add the next promise to the queue
              let newPromiseQueue = this.state.promiseQueue;
              if (object.next != null) {
                newPromiseQueue.push({source: promise.source, next: object.next});
              }

              this.setState({allURLs: newAllURLs, promiseQueue: newPromiseQueue});
            }

            // If there is an overlay, double the timeout
            setTimeout(promiseLoop, promise.timeout);
          });
      }
    };

    if (this.state.preload) {
      this.setState({preload: false});
      promiseLoop();
      if (this.props.nextScene && isEmpty(Array.from(this.nextAllURLs.values()))) {
        n = 0;
        nextSourceLoop();
      }
    } else {
      sourceLoop();
    }
  }

  shouldComponentUpdate(props: any, state: any): boolean {
    return (props.scene.id !== this.props.scene.id ||
      (props.nextScene && this.props.nextScene &&
      props.nextScene.id !== this.props.nextScene.id) ||
      props.historyOffset !== this.props.historyOffset ||
      props.isPlaying !== this.props.isPlaying ||
      props.opacity !== this.props.opacity ||
      props.strobe !== this.props.strobe ||
      props.strobeTime !== this.props.strobeTime ||
      props.hasStarted !== this.props.hasStarted ||
      state.restart !== this.state.restart ||
      state.promise.source !== this.state.promise.source);
  }

  componentWillReceiveProps(props: any) {
    if (props.scene.id !== this.props.scene.id) {
      this.componentWillUnmount();
      if (props.scene.id === this.props.nextScene.id) { // If the next scene has been played
        if (props.nextScene.id === this.props.scene.id) { // Just swap values if we're coming back to this scene again
          const newAllURLs = this.nextAllURLs;
          const newPromiseQueue = this.nextPromiseQueue;
          this.nextAllURLs = this.state.allURLs;
          this.nextPromiseQueue = this.state.promiseQueue;
          this.setState({
            promiseQueue: newPromiseQueue,
            promise: new CancelablePromise((resolve, reject) => {}),
            nextPromise: new CancelablePromise((resolve, reject) => {}),
            allURLs: newAllURLs,
            preload: true,
            restart: true
          });

        } else { // Replace values
          this.setState({
            promiseQueue: this.nextPromiseQueue,
            promise: new CancelablePromise((resolve, reject) => {}),
            nextPromise: new CancelablePromise((resolve, reject) => {}),
            allURLs: this.nextAllURLs,
            preload: true,
            restart: true
          });
          this.nextPromiseQueue = Array<{source: string, next: any}>();
          this.nextAllURLs = new Map<string, Array<string>>();
        }
      } else {
        this.setState({
          promiseQueue: Array<{ source: string, next: any }>(),
          promise: new CancelablePromise((resolve, reject) => {}),
          nextPromise: new CancelablePromise((resolve, reject) => {}),
          allURLs: new Map<string, Array<string>>(),
          preload: false,
          restart: true
        });
      }
    }
  }

  componentDidUpdate() {
    if (this.state.restart == true) {
      this.setState({restart: false});
      this.componentDidMount();
    }
  }

  componentWillUnmount() {
    this.state.nextPromise.cancel();
    this.state.promise.cancel();
  }
}

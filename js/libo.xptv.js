// {
//   "site": "https://www.libvio.mov"
// }

const cheerio = createCheerio()
const $config = argsify($config_str)
const DEFAULT_SITE = $config.site || "https://www.libvio.mov"
const PUBLISH_SITE = "https://www.libvio.app/"
const CACHE_KEY = "libvio_site"
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
let SITE = ""

const appConfig = {
  ver: 1,
  title: "LIBVIO",
  site: "",
  tabs: [
    { name: "首页", ext: { url: "/", hasMore: false }, ui: 1 },
    { name: "电影", ext: { url: "/type/1-1.html" } },
    { name: "剧集", ext: { url: "/type/2-1.html" } },
    { name: "动漫", ext: { url: "/type/4-1.html" } },
    { name: "日韩剧", ext: { url: "/type/15-1.html" } },
    { name: "欧美剧", ext: { url: "/type/16-1.html" } }
  ]
}

function trimSlash(url) {
  return String(url || "").replace(/\/+$/, "")
}

function originOf(url) {
  const match = String(url || "").match(/^(https?:\/\/[^/?#]+)/i)
  return match ? match[1] : ""
}

function getHeaders(site) {
  site = trimSlash(site || SITE || DEFAULT_SITE)
  return {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": site + "/",
    "Origin": site
  }
}

function getRefererHeaders(referer) {
  referer = referer || trimSlash(SITE || DEFAULT_SITE) + "/"
  return {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": referer,
    "Origin": originOf(referer) || trimSlash(SITE || DEFAULT_SITE)
  }
}

function absUrl(url) {
  url = String(url || "").trim()
  if (!url) return ""
  if (url.indexOf("http") === 0) return url
  if (url.indexOf("//") === 0) return "https:" + url
  return trimSlash(SITE || DEFAULT_SITE) + (url.charAt(0) === "/" ? url : "/" + url)
}

function pageUrl(path, page) {
  path = path || "/"
  page = parseInt(page, 10) || 1
  if (page <= 1) return absUrl(path)
  return absUrl(path.replace(/-\d+\.html$/, "-" + page + ".html"))
}

function xorDecode(encoded, key) {
  return encoded.split(",").map(function (n, i) {
    return String.fromCharCode(Number(n) ^ key.charCodeAt(i % key.length))
  }).join("")
}

function base64Decode(str) {
  try {
    const CryptoJS = createCryptoJS()
    return CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(str))
  } catch (e) {
    return ""
  }
}

function urlDecode(str) {
  try { return unescape(str) } catch (e) {}
  try { return decodeURIComponent(str) } catch (e2) {}
  return str || ""
}

function isUsableHtml(html) {
  html = String(html || "")
  if (!html) return false
  if (html.indexOf("Service Unavailable") >= 0) return false
  if (html.indexOf("域名停用") >= 0 || html.indexOf("暂停使用") >= 0 || html.indexOf("停止访问") >= 0) return false
  return html.indexOf("stui-vodlist__thumb") >= 0
    || html.indexOf("/detail/") >= 0
    || html.indexOf("stui-content__playlist") >= 0
}

async function checkWebsite(site) {
  try {
    const resp = await $fetch.get(trimSlash(site), { headers: getHeaders(site), timeout: 12000 })
    return isUsableHtml(resp && resp.data)
  } catch (e) {
    return false
  }
}

function addCandidate(list, seen, site) {
  site = trimSlash(site)
  if (!site) return
  if (site.indexOf("http") !== 0) site = "https://" + site
  if (!seen[site]) {
    seen[site] = true
    list.push(site)
  }
}

async function getBackupSites() {
  const sites = []
  const seen = {}

  try {
    const resp = await $fetch.get(PUBLISH_SITE, { headers: getHeaders(PUBLISH_SITE), timeout: 12000 })
    const html = String(resp.data || "")
    const keyMatch = html.match(/const\s+_K\s*=\s*['"]([^'"]+)['"]/)
    if (!keyMatch) return sites

    const key = keyMatch[1]
    const re = /xorDecode\(\s*['"]([^'"]+)['"]\s*,\s*_K\s*\)/g
    let match
    while ((match = re.exec(html)) !== null) {
      addCandidate(sites, seen, xorDecode(match[1], key))
    }
  } catch (e) {}

  return sites
}

async function getWebsite() {
  const cached = $cache.get(CACHE_KEY)
  const candidates = []
  const seen = {}
  addCandidate(candidates, seen, DEFAULT_SITE)
  addCandidate(candidates, seen, cached)

  const backups = await getBackupSites()
  for (let i = 0; i < backups.length; i++) addCandidate(candidates, seen, backups[i])

  for (let j = 0; j < candidates.length; j++) {
    if (await checkWebsite(candidates[j])) {
      $cache.set(CACHE_KEY, candidates[j], 86400)
      return candidates[j]
    }
  }

  return trimSlash(DEFAULT_SITE)
}

async function initSite() {
  if (!SITE) {
    SITE = await getWebsite()
    appConfig.site = SITE
  }
  return SITE
}

function parseCards(html) {
  const $ = cheerio.load(String(html || ""))
  const seen = {}
  const list = []

  $("a.stui-vodlist__thumb").each(function (_, el) {
    const a = $(el)
    const href = a.attr("href") || ""
    if (href.indexOf("/detail/") !== 0 || seen[href]) return
    seen[href] = true
    list.push({
      vod_id: href,
      vod_name: a.attr("title") || "",
      vod_pic: absUrl(a.attr("data-original") || a.attr("data-src") || a.attr("src") || ""),
      vod_remarks: a.find(".text-right").text().trim(),
      ext: { url: absUrl(href) }
    })
  })

  return list
}

function parsePlayerUrl(html) {
  const text = String(html || "")
  const match = text.match(/var\s+player_[^=]*=\s*({[\s\S]*?})\s*</) || text.match(/var\s+player_[^=]*=\s*({[\s\S]*?});/)
  if (!match) return ""

  try {
    const player = JSON.parse(match[1])
    if (player.encrypt == "1") return urlDecode(player.url)
    if (player.encrypt == "2") return urlDecode(base64Decode(player.url))
    return player.url || ""
  } catch (e) {
    return ""
  }
}

async function getLocalInfo() {
  return jsonify({ ver: 1, name: "LIBVIO", api: "csp_libvio", type: 3 })
}

async function getConfig() {
  await initSite()
  return jsonify(appConfig)
}

async function getCards(ext) {
  await initSite()
  ext = argsify(ext)

  const page = parseInt(ext.page, 10) || 1
  if (ext.hasMore === false && page > 1) return jsonify({ list: [] })

  try {
    const resp = await $fetch.get(pageUrl(ext.url || "/", page), { headers: getHeaders(), timeout: 12000 })
    return jsonify({ list: parseCards(resp.data), page: page })
  } catch (e) {
    return jsonify({ list: [] })
  }
}

async function getTracks(ext) {
  await initSite()
  ext = argsify(ext)

  try {
    const resp = await $fetch.get(ext.url, { headers: getHeaders(), timeout: 12000 })
    const $ = cheerio.load(String(resp.data || ""))
    const list = []

    $("div.playlist-panel").each(function (_, panel) {
      const p = $(panel)
      const title = p.find(".panel-head h3").text().trim() || "播放线路"
      if (title.indexOf("猜你喜欢") >= 0) return

      const group = { title: title, tracks: [] }
      if (title.indexOf("下载") >= 0) {
        p.find(".netdisk-list a").each(function (_, item) {
          const a = $(item)
          const pan = a.attr("href") || ""
          if (!pan) return
          group.tracks.push({
            name: a.find(".netdisk-name").text().trim() || a.text().trim() || "网盘",
            pan: pan,
            ext: {}
          })
        })
      } else {
        p.find("ul.stui-content__playlist li a").each(function (_, item) {
          const a = $(item)
          group.tracks.push({
            name: a.text().trim(),
            ext: { url: absUrl(a.attr("href") || "") }
          })
        })
      }

      if (group.tracks.length) list.push(group)
    })

    return jsonify({ list: list })
  } catch (e) {
    return jsonify({ list: [] })
  }
}

async function getPlayinfo(ext) {
  await initSite()
  ext = argsify(ext)
  if (!ext.url) return jsonify({ urls: [] })

  try {
    const resp = await $fetch.get(ext.url, { headers: getRefererHeaders(ext.url), timeout: 12000 })
    const url = parsePlayerUrl(resp.data)
    if (!url) return jsonify({ urls: [] })
    return jsonify({ urls: [url], headers: [getRefererHeaders(ext.url)] })
  } catch (e) {
    return jsonify({ urls: [] })
  }
}

async function search(ext) {
  await initSite()
  ext = argsify(ext)

  const kw = ext.text || ""
  const page = parseInt(ext.page, 10) || 1
  if (!kw || page > 1) return jsonify({ list: [] })

  try {
    const url = SITE + "/search/-------------.html?wd=" + encodeURIComponent(kw) + "&submit="
    const resp = await $fetch.get(url, { headers: getHeaders(), timeout: 12000 })
    return jsonify({ list: parseCards(resp.data), page: page })
  } catch (e) {
    return jsonify({ list: [] })
  }
}

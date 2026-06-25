// {
//   "site": "https://gimytv.ai"
// }

const cheerio = createCheerio()
const $config = argsify($config_str)
const SITE = String($config.site || "https://gimytv.ai").replace(/\/+$/, "")
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"

const TABS = [
  { name: "首页", ext: { type: "home" }, ui: 1 },
  { name: "电影", ext: { id: "1" } },
  { name: "电视剧", ext: { id: "2" } },
  { name: "动漫", ext: { id: "4" } },
  { name: "综艺", ext: { id: "29" } },
  { name: "陆剧", ext: { id: "13" } },
  { name: "韩剧", ext: { id: "20" } },
  { name: "美剧", ext: { id: "16" } },
  { name: "日剧", ext: { id: "15" } },
  { name: "台剧", ext: { id: "14" } },
  { name: "港剧", ext: { id: "21" } },
  { name: "短剧", ext: { id: "34" } },
  { name: "海外剧", ext: { id: "31" } }
]

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim()
}

function cleanUrl(url) {
  return String(url || "")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .trim()
}

function absUrl(url) {
  url = cleanUrl(url)
  if (!url) return ""
  if (url.indexOf("http") === 0) return url
  if (url.indexOf("//") === 0) return "https:" + url
  return SITE + (url.charAt(0) === "/" ? url : "/" + url)
}

function getHeaders(referer) {
  return {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": referer || SITE + "/"
  }
}

function showUrl(id, page) {
  page = parseInt(page, 10) || 1
  if (page <= 1) return SITE + "/show/" + id + "-----------.html"
  return SITE + "/show/" + id + "--------" + page + "---.html"
}

function searchUrl(text, page) {
  page = parseInt(page, 10) || 1
  const kw = encodeURIComponent(text)
  if (page <= 1) return SITE + "/search/" + kw + "-------------.html"
  return SITE + "/search/" + kw + "----------" + page + "---.html"
}

function tryDecode(text) {
  text = String(text || "")
  try { return decodeURIComponent(text) } catch (e) {}
  try { return unescape(text) } catch (e) {}
  return text
}

function decodePlayerUrl(data) {
  let url = cleanUrl(data.url || "")
  if (!url) return ""
  if (String(data.encrypt) === "1") return tryDecode(url)
  if (String(data.encrypt) === "2") {
    const CryptoJS = createCryptoJS()
    url = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(url))
    return tryDecode(url)
  }
  return url
}

function isDirectMedia(url) {
  url = cleanUrl(url)
  return /\.(m3u8|mp4)([?#&]|$)/i.test(url) || /mime_type=video_mp4/i.test(url)
}

function lineScore(title) {
  title = String(title || "")
  if (/(2K|4K)/i.test(title)) return 0
  if (/(高清|新浪|如意|速播|優質|优质|清晰|順暢|顺畅|無盡|无尽|極速|极速|最大|量子|鈦快|钛快|暴風|暴风|非凡|魔都|OK|光速|豆瓣|雲|云|m3u8)/i.test(title)) return 0
  if (/(騰訊|腾讯|奇藝|奇艺|優酷|优酷|芒果|B站|藍光|蓝光|特清|短劇|短剧|Netflix|Disney)/i.test(title)) return 2
  return 1
}

function parsePageCount(html) {
  const $ = cheerio.load(String(html || ""))
  let count = 1
  $(".pager a[href]").each(function (_, el) {
    const text = cleanText($(el).text())
    const href = $(el).attr("href") || ""
    const page = parseInt(text, 10) || parseInt((href.match(/--------(\d+)---\.html/) || [])[1], 10) || 0
    if (page > count) count = page
  })
  return count
}

function parseCards(html) {
  const $ = cheerio.load(String(html || ""))
  const list = []
  const seen = {}

  $(".search-item").each(function (_, el) {
    const box = $(el)
    const link = box.find(".search-item__title a[href*='/vod/']").first()
    const thumb = box.find(".search-item__thumb").first()
    const href = link.attr("href") || thumb.attr("href") || ""
    const url = absUrl(href)
    const name = cleanText(link.text() || thumb.attr("aria-label"))
    if (!url || !name || seen[url]) return
    seen[url] = true
    list.push({
      vod_id: url,
      vod_name: name,
      vod_pic: absUrl(box.find("img").first().attr("data-src") || box.find("img").first().attr("src") || ""),
      vod_remarks: cleanText(box.find(".search-item__meta").first().text()),
      ext: { url: url }
    })
  })

  $(".card").each(function (_, el) {
    const box = $(el)
    const thumb = box.find("a.card__thumb[href*='/vod/']").first()
    const body = box.find("a.card__body[href*='/vod/']").first()
    const href = thumb.attr("href") || body.attr("href") || ""
    const url = absUrl(href)
    const img = box.find("img").first()
    const name = cleanText(box.find(".card__title").first().text() || thumb.attr("aria-label") || img.attr("alt"))
    if (!url || !name || seen[url]) return
    seen[url] = true
    list.push({
      vod_id: url,
      vod_name: name,
      vod_pic: absUrl(img.attr("data-src") || img.attr("src") || ""),
      vod_remarks: cleanText(box.find(".card__badge").first().text() || box.find(".card__meta").first().text()),
      ext: { url: url }
    })
  })

  return list
}

function parsePlayerData(html) {
  const match = String(html || "").match(/player_data\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
  return match ? argsify(match[1]) : {}
}

function parseData(data) {
  return typeof data === "string" ? argsify(data) : (data || {})
}

function parserType(player, playUrl) {
  const from = String(player.from || "")
  if (playUrl.indexOf("JD-") >= 0 || /^(JD2K|JD4K|JDQM|JDHG)$/i.test(from)) return "d"
  if (playUrl.indexOf("NSYS-") >= 0 || playUrl.indexOf("NS4K-") >= 0 || /^(NSYS|NS4K)$/i.test(from)) return "n"
  return ""
}

async function parseBotUrl(type, playUrl) {
  if (!type || !playUrl) return ""
  const page = "https://player.gimy.bot/" + type + "/?url=" + encodeURIComponent(playUrl)
  const api = "https://player.gimy.bot/" + type + "/parse.php?url=" + encodeURIComponent(playUrl)
  const { data } = await $fetch.get(api, { headers: getHeaders(page), timeout: 20000 })
  const json = parseData(data)
  return cleanUrl(json.url || json.video || json.playurl || "")
}

async function checkMediaUrl(url, referer) {
  url = cleanUrl(url)
  if (!/\.m3u8/i.test(url)) return true
  try {
    const { data } = await $fetch.get(url, { headers: { "User-Agent": UA, "Referer": referer || SITE + "/" }, timeout: 10000 })
    const body = String(data || "").trim()
    return body.indexOf("#EXTM3U") === 0 || body.indexOf("#EXT-X-") >= 0
  } catch (e) {
    return false
  }
}

async function getLocalInfo() {
  return jsonify({ ver: 1, name: "Gimy+ 劇迷", api: "csp_gimy", type: 3 })
}

async function getConfig() {
  return jsonify({ ver: 1, title: "Gimy+ 劇迷", site: SITE, tabs: TABS })
}

async function getCards(ext) {
  ext = argsify(ext)
  const page = parseInt(ext.page, 10) || 1
  const url = ext.type === "home" ? SITE + "/" : showUrl(ext.id || "1", page)

  try {
    const { data } = await $fetch.get(url, { headers: getHeaders(url), timeout: 20000 })
    return jsonify({ list: parseCards(data), page: page, pagecount: parsePageCount(data) })
  } catch (e) {
    return jsonify({ list: [], page: page, pagecount: 1 })
  }
}

async function getTracks(ext) {
  ext = argsify(ext)
  const url = absUrl(ext.url || ext.id || "")
  if (!url) return jsonify({ list: [] })

  try {
    const { data } = await $fetch.get(url, { headers: getHeaders(url), timeout: 20000 })
    const $ = cheerio.load(String(data || ""))
    const groups = []

    $(".playlist-block").each(function (_, el) {
      const box = $(el)
      const title = cleanText(box.find(".playlist-block__title").first().text()) || "默认线路"
      const tracks = []
      box.find(".playlist-grid a[href*='/ep/']").each(function (_, item) {
        const a = $(item)
        const href = a.attr("href") || ""
        const name = cleanText(a.text())
        if (href && name) tracks.push({ name: name, ext: { url: absUrl(href), referer: url } })
      })
      if (tracks.length) groups.push({ title: title, tracks: tracks })
    })

    groups.sort(function (a, b) {
      return lineScore(a.title) - lineScore(b.title)
    })

    if (!groups.length) {
      const tracks = []
      $(".detail-actions a[href*='/ep/']").each(function (_, item) {
        const a = $(item)
        const href = a.attr("href") || ""
        if (href) tracks.push({ name: cleanText(a.text()) || "播放", ext: { url: absUrl(href), referer: url } })
      })
      if (tracks.length) groups.push({ title: "默认线路", tracks: tracks })
    }

    const info = {
      vod_pic: absUrl($("meta[property='og:image']").attr("content") || $(".detail-cover img").first().attr("src") || ""),
      vod_desc: cleanText($(".detail-desc").first().text() || $("meta[name='description']").attr("content"))
    }
    return jsonify({ list: groups, info: info })
  } catch (e) {
    return jsonify({ list: [] })
  }
}

async function getPlayinfo(ext) {
  ext = argsify(ext)
  const url = absUrl(ext.url || "")
  if (!url) return jsonify({ urls: [] })

  if (isDirectMedia(url)) {
    return jsonify({ urls: [url], headers: [{ "User-Agent": UA, "Referer": ext.referer || SITE + "/" }] })
  }

  try {
    const { data } = await $fetch.get(url, { headers: getHeaders(ext.referer || url), timeout: 20000 })
    const player = parsePlayerData(data)
    const playUrl = decodePlayerUrl(player)
    if (!playUrl) return jsonify({ urls: [] })
    if (playUrl.indexOf("http") === 0 && isDirectMedia(playUrl)) {
      if (!(await checkMediaUrl(playUrl, url))) return jsonify({ urls: [] })
      return jsonify({ urls: [playUrl], headers: [{ "User-Agent": UA, "Referer": url }] })
    }

    const type = parserType(player, playUrl)
    const parsedUrl = type ? await parseBotUrl(type, playUrl) : ""
    if (parsedUrl && isDirectMedia(parsedUrl)) {
      const referer = "https://player.gimy.bot/" + type + "/"
      if (!(await checkMediaUrl(parsedUrl, referer))) return jsonify({ urls: [] })
      return jsonify({ urls: [parsedUrl], headers: [{ "User-Agent": UA, "Referer": referer }] })
    }

    return jsonify({ urls: [] })
  } catch (e) {
    return jsonify({ urls: [] })
  }
}

async function search(ext) {
  ext = argsify(ext)
  const text = cleanText(ext.text || ext.wd || "")
  const page = parseInt(ext.page, 10) || 1
  if (!text) return jsonify({ list: [], page: page, pagecount: 1 })

  try {
    const url = searchUrl(text, page)
    const { data } = await $fetch.get(url, { headers: getHeaders(url), timeout: 20000 })
    return jsonify({ list: parseCards(data), page: page, pagecount: parsePageCount(data) })
  } catch (e) {
    return jsonify({ list: [], page: page, pagecount: 1 })
  }
}

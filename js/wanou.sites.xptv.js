const $config = argsify($config_str)
const cheerio = createCheerio()

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
const RECOMMEND_CACHE_INTERVAL = 5 * 60000
const DOMAIN_CACHE_INTERVAL = 60 * 60000
const MONITOR_URL = "https://site.920410.xyz"
const MONITOR_KEY = "wanou_monitor_v1"
const AUTO_UPDATE = $config.autoUpdateDomains !== false && $config.autoUpdateDomains !== "false"

const SITES = [
  { id: "muou", name: "木偶", domains: ["https://666.666291.xyz", "https://123.666291.xyz", "https://www.muou.site", "https://www.muou.asia"], categories: [["25", "臻选"], ["1", "电影"], ["2", "电视剧"], ["3", "动漫"], ["4", "纪录片"], ["29", "综艺"], ["30", "原盘"]] },
  { id: "wanou", name: "玩偶", domains: ["https://www.wogg.net", "https://wogg.xxooo.cf", "https://woggpan.888484.xyz", "https://woggpan.xxooo.cf"], listSelector: ".module-item", categoryUrl: "/vodshow/{categoryId}--------{page}---.html", searchUrl: "/vodsearch/-------------.html?wd={keyword}&page={page}", categories: [["44", "臻彩"], ["1", "电影"], ["2", "电视剧"], ["3", "动漫"], ["4", "综艺"], ["5", "音乐"], ["6", "短剧"], ["46", "纪录片"]] },
  { id: "kuaiying", name: "快映", domains: ["http://xsayang.fun:12512", "http://154.201.83.50:12512"], categories: [["5", "臻彩"], ["1", "电影"], ["2", "电视剧"], ["3", "综艺"], ["4", "动漫"], ["6", "短剧"], ["30", "115"], ["35", "123"], ["36", "天移迅"]] },
  { id: "shandian", name: "闪电", domains: ["http://shandian.blog", "https://sd.sduc.site"], categories: [["1", "电影"], ["2", "电视剧"], ["3", "综艺"], ["4", "动漫"], ["30", "短剧"]] },
  { id: "duoduo", name: "多多", domains: ["https://tv.214521.xyz", "https://yydsys.de5.net", "https://tv.yydsys.cc", "https://tv.yydsys.top"], categories: [["1", "电影"], ["2", "剧集"], ["4", "动漫"], ["5", "短剧"], ["3", "综艺"], ["20", "纪录"]] }
]

const enabled = Array.isArray($config.enabledSites) ? $config.enabledSites : typeof $config.enabledSites === "string" ? $config.enabledSites.split(",") : []
const enabledIds = enabled.map(function (id) { return String(id).trim() }).filter(Boolean)
const ACTIVE_SITES = SITES.filter(function (site) { return !enabledIds.length || enabledIds.indexOf(site.id) >= 0 })
const SITE_INDEX = {}
for (let i = 0; i < ACTIVE_SITES.length; i++) SITE_INDEX[ACTIVE_SITES[i].id] = ACTIVE_SITES[i]
const RECOMMEND_SIGNATURE = JSON.stringify([ACTIVE_SITES.map(function (site) { return site.id }), $config.domains || {}])

function unique(values) {
  const seen = {}
  const result = []
  for (let i = 0; i < values.length; i++) {
    const value = String(values[i] || "").trim()
    if (value && !seen[value]) {
      seen[value] = true
      result.push(value)
    }
  }
  return result
}

function cacheGet(key) {
  try {
    const value = $cache.get(key)
    return typeof value === "string" ? JSON.parse(value) : value
  } catch (e) { return null }
}

function cacheSet(key, value) {
  $cache.set(key, JSON.stringify(value))
}

async function mapLimit(items, limit, action) {
  const result = new Array(items.length)
  let cursor = 0
  const workers = []
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push((async function () {
      while (cursor < items.length) {
        const index = cursor++
        result[index] = await action(items[index], index)
      }
    })())
  }
  await Promise.all(workers)
  return result
}

function checkStatus(response) {
  const status = Number(response.status || response.statusCode || 0)
  if (status && (status < 200 || status >= 300)) throw new Error("HTTP " + status)
}

function responseHtml(response) {
  checkStatus(response)
  let html = response.data
  if (typeof html === "string" && html.trim().charAt(0) === '"') {
    try { html = JSON.parse(html) } catch (e) {}
  }
  if (typeof html !== "string" || /just a moment|cf-browser-verification|challenge-platform|access denied|安全验证/i.test(html)) throw new Error("验证页面")
  return html
}

function validSitePage($, kind) {
  if (kind === "detail") return $(".module-info-heading, .module-row-one, .module-row-info, [data-clipboard-text], [data-link], a.btn-down[href^='http']").length > 0
  if (kind === "search") return $(".module-search-item").length > 0 || ($("body.search form input[name='wd']").length > 0 && $("#main .module-items").length > 0)
  if (kind === "category") return $("body.library #main .module-items").length > 0
  return $(".module-item .module-item-pic a[href], .module-item .module-item-title[href]").length > 0
}

function monitorDomains(data) {
  const result = {}
  if (!data || !data.sites) return result
  for (let i = 0; i < SITES.length; i++) {
    const site = SITES[i]
    const record = data.sites[site.name]
    if (!record || !Array.isArray(record.urls)) continue
    const urls = record.urls.map(function (item) {
      const match = String(item && item.url || "").trim().match(/^(https?:\/\/(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?)\/?$/i)
      return match ? match[1].toLowerCase() : ""
    }).filter(Boolean)
    if (urls.length) result[site.id] = unique(urls)
  }
  return result
}

async function refreshMonitor(force) {
  const old = cacheGet(MONITOR_KEY) || { sites: {} }
  if (!force && !AUTO_UPDATE && old.sites) return old
  if (!force && old.fetchedAt && Date.now() - old.fetchedAt < DOMAIN_CACHE_INTERVAL) return old
  try {
    const response = await $fetch.get(MONITOR_URL + "/api/data", {
      headers: { "User-Agent": UA, Accept: "application/json" }
    })
    const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data
    const snapshot = { fetchedAt: Date.now(), sites: monitorDomains(data) }
    cacheSet(MONITOR_KEY, snapshot)
    return snapshot
  } catch (e) { return old }
}

function siteDomains(site, snapshot) {
  let override = $config.domains && $config.domains[site.id]
  if (typeof override === "string") override = [override]
  const monitored = snapshot && snapshot.sites && snapshot.sites[site.id] || []
  return unique((override || []).concat(monitored, site.domains || []).map(function (value) {
    const match = String(value || "").trim().match(/^(https?:\/\/(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?)\/?$/i)
    return match ? match[1].toLowerCase() : ""
  }).filter(Boolean))
}

async function requestSite(site, path, kind) {
  const raw = String(path || "/").trim() || "/"
  const requestPath = raw.charAt(0) === "/" ? raw : "/" + raw
  const snapshot = cacheGet(MONITOR_KEY) || { sites: {} }
  const cachedDomain = $cache.get("wanou_domain_" + site.id)
  const domains = unique((cachedDomain ? [cachedDomain] : []).concat(siteDomains(site, snapshot)).map(function (value) {
    const match = String(value || "").trim().match(/^(https?:\/\/(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?)\/?$/i)
    return match ? match[1].toLowerCase() : ""
  }).filter(Boolean))
  let lastError = ""
  for (let i = 0; i < domains.length; i++) {
    try {
      const response = await $fetch.get(domains[i] + requestPath, {
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "zh-CN,zh;q=0.9" }
      })
      const $ = cheerio.load(responseHtml(response))
      if (!validSitePage($, kind)) throw new Error("页面无有效内容")
      $cache.set("wanou_domain_" + site.id, domains[i])
      return { $: $ }
    } catch (e) { lastError = e.message || String(e) }
  }
  throw new Error(site.name + "请求失败" + (lastError ? "：" + lastError : ""))
}

function categoryPath(site, id, page) {
  if (site.categoryUrl) return site.categoryUrl.replace(/\{categoryId\}/g, String(id)).replace(/\{page\}/g, String(page))
  return "/index.php/vod/show/id/" + encodeURIComponent(id) + "/page/" + page + ".html"
}

function searchPath(site, keyword, page) {
  if (site.searchUrl) return site.searchUrl.replace(/\{keyword\}/g, encodeURIComponent(keyword)).replace(/\{page\}/g, String(page))
  return "/index.php/vod/search/page/" + page + "/wd/" + encodeURIComponent(keyword) + ".html"
}

function parseCardList(site, $, selector, withSource) {
  const list = []
  const nodes = $(selector || site.listSelector || "#main .module-item").toArray()
  for (let i = 0; i < nodes.length; i++) {
    const item = $(nodes[i])
    const picture = item.find(".module-item-pic a").first()
    const titleLink = item.find(".module-item-title").first()
    const serial = item.find(".video-serial").first()
    const image = item.find(".module-item-pic img, img.lazyload, img").first()
    const href = serial.attr("href") || picture.attr("href") || titleLink.attr("href") || ""
    const name = String(serial.attr("title") || image.attr("alt") || titleLink.attr("title") || titleLink.text() || "").replace(/\s+/g, " ").trim()
    if (!href || !name) continue
    const pic = image.attr("data-src") || image.attr("data-original") || image.attr("data-lazy-src") || image.attr("src") || ""
    const remark = item.find(".module-item-text, .module-item-note").first().text().replace(/\s+/g, " ").trim()
    const yearText = item.find(".video-info-aux a[href*='/year/']").first().text() || item.find(".module-item-caption span").first().text()
    const year = (yearText.match(/\b(?:19|20)\d{2}\b/) || [""])[0]
    const sourceRemark = withSource ? site.name + (year ? " · " + year : "") + (remark ? " · " + remark : "") : remark
    list.push({ vod_id: site.id + ":" + href, vod_name: name, vod_pic: pic, vod_remarks: sourceRemark, ext: { year: year, sources: [{ siteId: site.id, path: href }] } })
  }
  return list
}

function pageCount($, current) {
  let count = 0
  const nodes = $("#page a[href]").toArray()
  for (let i = 0; i < nodes.length; i++) {
    const href = $(nodes[i]).attr("href") || ""
    const match = href.match(/\/page\/(\d+)|[?&]page=(\d+)|-(\d+)---\.html(?:[?#]|$)/i)
    const number = match ? Number(match[1] || match[2] || match[3]) : Number($(nodes[i]).text().trim())
    if (number > count) count = number
  }
  return count || Math.max(1, current)
}

async function fetchCards(site, path, page, kind, keyword) {
  try {
    const result = await requestSite(site, path, kind)
    const count = pageCount(result.$, page)
    const selector = kind === "search" ? ".module-search-item" : site.listSelector
    let list = page > count ? [] : parseCardList(site, result.$, selector, false)
    if (kind === "search") {
      const text = keyword.toLowerCase()
      list = list.filter(function (card) { return card.vod_name.toLowerCase().indexOf(text) >= 0 })
    }
    return { list: list, pagecount: count }
  } catch (e) { return { list: [], pagecount: page } }
}

async function fetchHome(site) {
  try {
    const result = await requestSite(site, "/", "home")
    let selector = ".module:first .module-item"
    if (!result.$(selector).length) selector = ".module-item"
    return parseCardList(site, result.$, selector, true).slice(0, 30)
  } catch (e) { return [] }
}

function sourceKey(source) { return String(source.siteId || "") + "|" + String(source.path || "") }

function addSources(target, incoming) {
  const used = {}
  for (let i = 0; i < target.length; i++) used[sourceKey(target[i])] = true
  for (let i = 0; i < (incoming || []).length; i++) {
    const source = incoming[i]
    if (!source || !SITE_INDEX[source.siteId] || typeof source.path !== "string" || !source.path.trim()) continue
    const key = sourceKey(source)
    if (!used[key]) {
      used[key] = true
      target.push({ siteId: source.siteId, path: source.path })
    }
  }
}

function sourceNames(sources) {
  const names = []
  for (let i = 0; i < sources.length; i++) {
    const site = SITE_INDEX[sources[i].siteId]
    if (site && names.indexOf(site.name) < 0) names.push(site.name)
  }
  return names
}

function aggregateCards(cards) {
  const groups = []
  const byTitle = new Map()
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const key = card.vod_name
    const year = String(card.ext && card.ext.year || "").trim()
    const candidates = byTitle.get(key) || []
    let group = null
    for (let j = 0; j < candidates.length; j++) {
      const old = candidates[j]
      if (old.year && year && old.year !== year) continue
      if (!old.year || !year) {
        const oldKeys = old.card.ext.sources.map(sourceKey)
        if (!(card.ext.sources || []).some(function (source) { return oldKeys.indexOf(sourceKey(source)) >= 0 })) continue
      }
      group = old
      break
    }
    if (!group) {
      group = { year: year, card: { vod_id: card.vod_id, vod_name: card.vod_name, vod_pic: card.vod_pic, vod_remarks: card.vod_remarks, ext: { year: year, sources: [] } } }
      addSources(group.card.ext.sources, card.ext.sources)
      groups.push(group)
      candidates.push(group)
      byTitle.set(key, candidates)
    } else {
      addSources(group.card.ext.sources, card.ext.sources)
      if (!group.year && year) group.year = year
    }
  }
  const result = []
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    const names = sourceNames(group.card.ext.sources)
    group.card.vod_id = group.card.ext.sources.length > 1 ? "agg:" + group.card.vod_name + ":" + group.year : group.card.vod_id
    group.card.vod_remarks = names.join("/") + (group.year ? " · " + group.year : "") + (names.length > 1 ? " · " + names.length + "站" : "")
    result.push(group.card)
  }
  return result
}

function categoryFilter(site) {
  return [{ key: "categoryId", name: "分类", init: site.categories[0] ? site.categories[0][0] : "", value: site.categories.map(function (item) { return { n: item[1], v: item[0] } }) }]
}

function recommendFilter() {
  return [{ key: "site", name: "来源", init: "all", value: [{ n: "全部", v: "all" }].concat(ACTIVE_SITES.map(function (site) { return { n: site.name, v: site.id } })) }]
}

function parsePanUrls($) {
  const urls = []
  const nodes = $(".module-row-one, .module-row-info, [data-clipboard-text], [data-link], a.btn-down[href^='http']").toArray()
  for (let i = 0; i < nodes.length; i++) {
    const box = $(nodes[i])
    const elements = [box].concat(box.find("[data-link], [data-clipboard-text], a[href^='http']").toArray())
    for (let j = 0; j < elements.length; j++) {
      const element = $(elements[j])
      const values = [element.attr("href"), element.attr("data-link"), element.attr("data-clipboard-text")].join(" ")
      const found = values.match(/https?:\/\/[^\s"'<>\\\u3000-\u303f\u3400-\u9fff\uff00-\uffef]+/ig) || []
      for (let k = 0; k < found.length; k++) {
        const url = found[k].trim().replace(/&amp;/ig, "&")
        if (/^https?:\/\//i.test(url)) urls.push(url)
      }
    }
  }
  return unique(urls)
}

async function fetchDetail(source) {
  const site = SITE_INDEX[source.siteId]
  if (!site || !source.path) return null
  try {
    const result = await requestSite(site, source.path, "detail")
    return { site: site, urls: parsePanUrls(result.$) }
  } catch (e) { return null }
}

async function getLocalInfo() {
  return jsonify({ ver: 1, name: "玩偶聚合", api: "csp_wanou_aggregate_local" })
}

async function getConfig() {
  const tabs = [{ name: "推荐", ext: { id: "recommend" } }]
  for (let i = 0; i < ACTIVE_SITES.length; i++) tabs.push({ name: ACTIVE_SITES[i].name, ext: { id: "site:" + ACTIVE_SITES[i].id } })
  tabs.push({ name: "更新网址", ext: { id: "update-domains" } })
  const first = ACTIVE_SITES[0]
  const site = first ? $cache.get("wanou_domain_" + first.id) || first.domains[0] : ""
  return jsonify({ ver: 1, title: "玩偶聚合", site: site, tabs: tabs })
}

async function updateDomains(sites) {
  await refreshMonitor(true)
  const lists = await mapLimit(sites, 3, fetchHome)
  for (let i = 0; i < sites.length; i++) {
    $cache.del("wanou_recommend_v1:recommend:" + sites[i].id)
  }
  $cache.del("wanou_recommend_v1:recommend:all")
  $cache.del("wanou_recommend_v1:update-domains:all")
  return lists
}

async function getCards(ext) {
  ext = argsify(ext)
  const page = Math.max(1, parseInt(ext.page, 10) || 1)
  const filters = ext.filters || {}
  const id = String(ext.id || "recommend")
  if (id === "recommend" || id === "update-domains") {
    const selected = id === "update-domains" ? "all" : String(filters.site || "all")
    const sites = selected === "all" ? ACTIVE_SITES : ACTIVE_SITES.filter(function (site) { return site.id === selected })
    const key = "wanou_recommend_v1:" + id + ":" + selected
    const cached = id === "update-domains" ? null : cacheGet(key)
    let cards
    if (cached && cached.signature === RECOMMEND_SIGNATURE && Date.now() - cached.fetchedAt < RECOMMEND_CACHE_INTERVAL) cards = cached.list
    else {
      const nested = id === "update-domains" && page === 1 ? await updateDomains(sites) : await mapLimit(sites, 3, fetchHome)
      cards = aggregateCards([].concat.apply([], nested))
      cacheSet(key, { signature: RECOMMEND_SIGNATURE, fetchedAt: Date.now(), list: cards })
    }
    if (page > 1) return jsonify({ list: [], filter: id === "recommend" ? recommendFilter() : [], page: page, pagecount: 1 })
    return jsonify({ list: cards, filter: id === "recommend" ? recommendFilter() : [], page: page, pagecount: 1 })
  }
  if (id.indexOf("site:") !== 0) return jsonify({ list: [] })
  const site = SITE_INDEX[id.substring(5)]
  if (!site) return jsonify({ list: [], filter: [] })
  const valid = site.categories.map(function (item) { return item[0] })
  let categoryId = String(filters.categoryId || valid[0] || "")
  if (valid.indexOf(categoryId) < 0) categoryId = valid[0] || ""
  if (!categoryId) return jsonify({ list: [], filter: categoryFilter(site) })
  const result = await fetchCards(site, categoryPath(site, categoryId, page), page, "category")
  return jsonify({ list: result.list, filter: categoryFilter(site), page: page, pagecount: result.pagecount })
}

async function getTracks(ext) {
  ext = argsify(ext)
  const sources = []
  addSources(sources, Array.isArray(ext.sources) ? ext.sources : [])
  if (!sources.length) addSources(sources, [ext])
  if (!sources.length) return jsonify({ list: [] })
  const details = await mapLimit(sources, 3, fetchDetail)
  const used = {}
  const groups = []
  for (let i = 0; i < details.length; i++) {
    const detail = details[i]
    if (!detail || !detail.urls.length) continue
    const tracks = []
    const counts = {}
    for (let j = 0; j < detail.urls.length; j++) {
      const url = detail.urls[j]
      if (used[url]) continue
      used[url] = true
      const label = detail.site.name
      counts[label] = (counts[label] || 0) + 1
      tracks.push({ name: label + (counts[label] > 1 ? " " + counts[label] : ""), pan: url })
    }
    if (tracks.length) groups.push({ title: detail.site.name, tracks: tracks })
  }
  return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
  return jsonify({ urls: [] })
}

async function search(ext) {
  ext = argsify(ext)
  const keyword = String(ext.text || ext.wd || "").trim()
  const page = Math.max(1, parseInt(ext.page, 10) || 1)
  if (!keyword) return jsonify({ list: [] })
  const nested = await mapLimit(ACTIVE_SITES, 3, function (site) { return fetchCards(site, searchPath(site, keyword, page), page, "search", keyword) })
  let cards = []
  let count = page
  for (let i = 0; i < nested.length; i++) {
    cards = cards.concat(nested[i].list)
    count = Math.max(count, nested[i].pagecount)
  }
  if ($config.aggregateSearch !== false && String($config.aggregateSearch || "true") !== "false") cards = aggregateCards(cards)
  return jsonify({ list: cards, page: page, pagecount: count })
}
const $config = argsify($config_str)
const cheerio = createCheerio()

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
const REQUEST_TIMEOUT = parseInt($config.timeout, 10) || 8000
const SEARCH_TIMEOUT = parseInt($config.searchTimeout, 10) || 7000
const RECOMMEND_PAGE_SIZE = 40
const RECOMMEND_CACHE_PREFIX = "wanou_aggregate_recommend_v1:"
const RECOMMEND_CACHE_INTERVAL = 5 * 60000
const RECOMMEND_SITE_LIMIT = Math.max(1, parseInt($config.recommendSiteLimit, 10) || 5)
const MAX_AGGREGATE_SITES = Math.max(1, parseInt($config.maxAggregateSites, 10) || 5)
const MONITOR_URL = "https://site.920410.xyz"
const MONITOR_CACHE_KEY = "wanou_aggregate_monitor_v1"
const DOMAIN_UPDATE_INTERVAL = Math.max(1, Number($config.domainUpdateHours) || 1) * 3600000
const MIRROR_CACHE_INTERVAL = Math.max(1, Number($config.mirrorCacheMinutes) || 30) * 60000
const AUTO_UPDATE_DOMAINS = $config.autoUpdateDomains !== false && $config.autoUpdateDomains !== "false"
let monitorTask = null

// 唯一的站点清单；顺序同时作为推荐与聚合的优先级。
const SITES = [
  {
    id: "muou",
    name: "木偶",
    domains: ["https://666.666291.xyz", "https://123.666291.xyz", "https://www.muou.site", "https://www.muou.asia"],
    categories: [["25", "臻选"], ["1", "电影"], ["2", "电视剧"], ["3", "动漫"], ["4", "纪录片"], ["29", "综艺"], ["30", "原盘"]]
  },
  {
    id: "wanou",
    name: "玩偶",
    domains: ["https://www.wogg.net", "https://wogg.xxooo.cf", "https://woggpan.888484.xyz", "https://woggpan.xxooo.cf"],
    listSelector: ".module-item",
    categoryUrl: "/vodshow/{categoryId}--------{page}---.html",
    searchUrl: "/vodsearch/-------------.html?wd={keyword}&page={page}",
    categories: [["44", "臻彩"], ["1", "电影"], ["2", "电视剧"], ["3", "动漫"], ["4", "综艺"], ["5", "音乐"], ["6", "短剧"], ["46", "纪录片"]]
  },
  {
    id: "kuaiying",
    name: "快映",
    domains: ["http://xsayang.fun:12512", "http://154.201.83.50:12512"],
    categories: [["5", "臻彩"], ["1", "电影"], ["2", "电视剧"], ["3", "综艺"], ["4", "动漫"], ["6", "短剧"], ["30", "115"], ["35", "123"], ["36", "天移迅"]]
  },
  {
    id: "shandian",
    name: "闪电",
    domains: ["http://shandian.blog", "https://sd.sduc.site"],
    categories: [["1", "电影"], ["2", "电视剧"], ["3", "综艺"], ["4", "动漫"], ["30", "短剧"]]
  },
  {
    id: "duoduo",
    name: "多多",
    domains: ["https://tv.214521.xyz", "https://yydsys.de5.net", "https://tv.yydsys.cc", "https://tv.yydsys.top"],
    categories: [["1", "电影"], ["2", "剧集"], ["4", "动漫"], ["5", "短剧"], ["3", "综艺"], ["20", "纪录"]]
  }
]

const enabledIds = (Array.isArray($config.enabledSites) ? $config.enabledSites :
  typeof $config.enabledSites === "string" ? $config.enabledSites.split(",") : [])
  .map(function (id) { return String(id).trim() }).filter(Boolean)
const ACTIVE_SITES = SITES.filter(function (site) { return !enabledIds.length || enabledIds.indexOf(site.id) >= 0 })
const SITE_INDEX = new Map(ACTIVE_SITES.map(function (site) { return [site.id, site] }))
const RECOMMEND_SIGNATURE = JSON.stringify([
  ACTIVE_SITES.map(function (site) { return site.id }), RECOMMEND_SITE_LIMIT,
  MAX_AGGREGATE_SITES, $config.domains || {}, REQUEST_TIMEOUT, AUTO_UPDATE_DOMAINS
])

function print(message) {
  try { $print("[玩偶聚合] " + message) } catch (e) {}
}

function absUrl(baseUrl, value) {
  const url = String(value || "").trim()
  if (!url) return ""
  if (/^https?:\/\//i.test(url)) return url
  if (url.indexOf("//") === 0) return "https:" + url
  return baseUrl + (url.charAt(0) === "/" ? url : "/" + url)
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(function (value) { return String(value || "").trim() }).filter(Boolean)))
}

function readCache(key) {
  try {
    const value = $cache.get(key)
    return typeof value === "string" ? JSON.parse(value) : value
  } catch (e) { return null }
}

function domainUrl(value) {
  const match = String(value || "").trim().match(/^(https?:\/\/(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?)\/?$/i)
  return match ? match[1].toLowerCase() : ""
}

async function mapLimit(items, limit, action) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = []
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push((async function () {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await action(items[index], index)
      }
    })())
  }
  await Promise.all(workers)
  return results
}

function checkStatus(response) {
  const status = Number(response.status || response.statusCode || 0)
  // 固定文档只展示 data；运行时提供状态码时再检查该字段。
  if (status && (status < 200 || status >= 300)) throw new Error("HTTP " + status)
}

function monitorDomains(data) {
  if (!data || !data.sites || typeof data.sites !== "object") throw new Error("目录数据缺少 sites")
  const sites = {}
  for (let i = 0; i < SITES.length; i++) {
    const site = SITES[i]
    const record = data.sites[site.name]
    if (!record || !Array.isArray(record.urls)) continue
    const urls = record.urls.filter(function (item) { return item && domainUrl(item.url) })
    urls.sort(function (a, b) {
      const healthOrder = Number(b.has_keyword === true) - Number(a.has_keyword === true)
      if (healthOrder) return healthOrder
      const aLatency = typeof a.latency === "number" && a.latency >= 0 ? a.latency : Infinity
      const bLatency = typeof b.latency === "number" && b.latency >= 0 ? b.latency : Infinity
      if (aLatency !== bLatency) return aLatency - bLatency
      return Number(b.url === record.best_url) - Number(a.url === record.best_url)
    })
    const domains = uniqueStrings(urls.map(function (item) { return domainUrl(item.url) }))
    if (domains.length) sites[site.id] = domains
  }
  if (!Object.keys(sites).length) throw new Error("目录中没有已支持站点的网址")
  return sites
}

async function refreshMonitor(force) {
  if (monitorTask) return monitorTask
  const previous = readCache(MONITOR_CACHE_KEY) || {}
  const now = Date.now()
  if (!force && (!AUTO_UPDATE_DOMAINS ||
    (previous.fetchedAt && now - previous.fetchedAt < DOMAIN_UPDATE_INTERVAL) ||
    (previous.attemptedAt && now - previous.attemptedAt < 60000))) return previous

  monitorTask = (async function () {
    const endpoints = ["/api/data", "/assets/data/monitor_data.json"]
    let lastError = ""
    for (let i = 0; i < endpoints.length; i++) {
      try {
        const response = await $fetch.get(MONITOR_URL + endpoints[i], {
          headers: { "User-Agent": UA, Accept: "application/json", "Cache-Control": "no-cache" },
          timeout: Math.min(REQUEST_TIMEOUT, 5000)
        })
        checkStatus(response)
        const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data
        const snapshot = {
          fetchedAt: Date.now(), attemptedAt: now,
          updatedAt: String(data && data.timestamp || ""),
          sites: monitorDomains(data)
        }
        $cache.set(MONITOR_CACHE_KEY, JSON.stringify(snapshot))
        return snapshot
      } catch (e) { lastError = e.message || String(e) }
    }
    previous.attemptedAt = now
    previous.error = lastError
    $cache.set(MONITOR_CACHE_KEY, JSON.stringify(previous))
    print("网址目录更新失败，沿用已保存地址：" + lastError)
    return previous
  })()
  try { return await monitorTask } finally { monitorTask = null }
}

function siteDomains(site, snapshot) {
  let override = $config.domains && $config.domains[site.id]
  if (typeof override === "string") override = [override]
  if (!Array.isArray(override)) override = []
  const cached = $cache.get("wanou_aggregate_domain_" + site.id)
  const monitored = snapshot && snapshot.sites && snapshot.sites[site.id] || []
  return uniqueStrings(override.concat(monitored, site.domains || [], cached ? [cached] : [])
    .map(domainUrl).filter(Boolean))
}

function responseHtml(response) {
  checkStatus(response)
  let html = response.data
  // 闪电的部分镜像返回 JSON 编码的 HTML 字符串。
  if (typeof html === "string" && html.trim().charAt(0) === '"') {
    try { html = JSON.parse(html) } catch (e) {}
  }
  if (typeof html !== "string" || /just a moment|cf-browser-verification|challenge-platform|access denied|安全验证/i.test(html)) {
    throw new Error("空页面或验证页面")
  }
  return html
}

function validSitePage($, kind) {
  if (kind === "detail") {
    return $(".module-info-heading, .module-row-one, .module-row-info, [data-clipboard-text], [data-link], a.btn-down[href^='http']").length > 0
  }
  if (kind === "search") {
    return $(".module-search-item").length > 0 ||
      ($("body.search form input[name='wd']").length > 0 && $("#main .module-items").length > 0)
  }
  if (kind === "category") {
    return $("body.library #main .module-items").length > 0
  }
  return $(".module-item .module-item-pic a[href], .module-item .module-item-title[href]").length > 0
}

async function requestSite(site, requestPath, timeout, kind, force) {
  const rawPath = String(requestPath || "/").trim() || "/"
  const absoluteMatch = rawPath.match(/^(https?:\/\/[^/?#]+)([/?#].*)?$/i)
  const relativePath = absoluteMatch ? (absoluteMatch[2] || "/") : (rawPath.charAt(0) === "/" ? rawPath : "/" + rawPath)
  let snapshot = await refreshMonitor(false)
  let domains = siteDomains(site, snapshot)
  if (absoluteMatch) domains = uniqueStrings(domains.concat(domainUrl(absoluteMatch[1]))).filter(Boolean)
  const cacheKey = "wanou_aggregate_mirrors_" + site.id
  const state = readCache(cacheKey)
  const attempted = []
  let lastError = ""

  async function probe(baseUrl) {
    const url = baseUrl + (relativePath.charAt(0) === "/" ? relativePath : "/" + relativePath)
    attempted.push(baseUrl)
    const startedAt = Date.now()
    try {
      const response = await $fetch.get(url, {
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9"
        },
        timeout: timeout || REQUEST_TIMEOUT
      })
      const latency = Date.now() - startedAt
      const $ = cheerio.load(responseHtml(response))
      if (!validSitePage($, kind)) throw new Error("页面不含所需站点内容")
      return { $: $, baseUrl: baseUrl, latency: latency }
    } catch (e) {
      lastError = e && e.message ? e.message : String(e)
      return null
    }
  }

  if (!force && state && state.candidates === domains.join("|") &&
    Date.now() - state.checkedAt < MIRROR_CACHE_INTERVAL && Array.isArray(state.order) && state.order.length) {
    for (let i = 0; i < state.order.length; i++) {
      const result = await probe(state.order[i])
      if (!result) continue
      if (i > 0) {
        // 提升可用备用镜像，保留原测速时间，避免延后完整检测。
        state.order = state.order.slice(i)
        $cache.set(cacheKey, JSON.stringify(state))
        $cache.set("wanou_aggregate_domain_" + site.id, result.baseUrl)
      }
      return result
    }
  }

  async function selectBest(candidates) {
    const results = await mapLimit(candidates, 3, probe)
    const available = results.filter(Boolean).sort(function (a, b) { return a.latency - b.latency })
    if (!available.length) return null
    $cache.set(cacheKey, JSON.stringify({
      checkedAt: Date.now(), candidates: domains.join("|"),
      order: available.map(function (item) { return item.baseUrl })
    }))
    $cache.set("wanou_aggregate_domain_" + site.id, available[0].baseUrl)
    return available[0]
  }

  let best = await selectBest(domains.filter(function (url) { return attempted.indexOf(url) < 0 }))
  if (best) return best
  // 已知镜像全失效时提前拉取目录；一分钟内的并发失败共用更新结果。
  if (AUTO_UPDATE_DOMAINS) {
    const latest = readCache(MONITOR_CACHE_KEY) || snapshot
    snapshot = Date.now() - (latest.attemptedAt || 0) >= 60000 ? await refreshMonitor(true) : latest
    domains = siteDomains(site, snapshot)
    best = await selectBest(domains.filter(function (url) { return attempted.indexOf(url) < 0 }))
    if (best) return best
  }
  throw new Error(site.name + "所有域名请求失败" + (lastError ? "：" + lastError : ""))
}

function categoryPath(site, categoryId, page) {
  if (site.categoryUrl) {
    return site.categoryUrl
      .replace(/\{categoryId\}/g, String(categoryId))
      .replace(/\{page\}/g, String(page))
  }
  return "/index.php/vod/show/id/" + encodeURIComponent(categoryId) + "/page/" + page + ".html"
}

function searchPath(site, keyword, page) {
  if (site.searchUrl) {
    return site.searchUrl
      .replace(/\{keyword\}/g, encodeURIComponent(keyword))
      .replace(/\{page\}/g, String(page))
  }
  return "/index.php/vod/search/page/" + page + "/wd/" + encodeURIComponent(keyword) + ".html"
}

function parseCardList(site, $, baseUrl, selector, sourceLabel) {
  const list = []
  const itemSelector = selector || site.listSelector || "#main .module-item"

  $(itemSelector).each(function (_, el) {
    const item = $(el)
    const pictureLink = item.find(".module-item-pic a").first()
    const titleLink = item.find(".module-item-title").first()
    const serialLink = item.find(".video-serial").first()
    const image = item.find(".module-item-pic img, img.lazyload, img").first()
    const href = serialLink.attr("href") || pictureLink.attr("href") || titleLink.attr("href") || ""
    const name = (serialLink.attr("title") || image.attr("alt") || titleLink.attr("title") || titleLink.text())
      .replace(/\s+/g, " ").trim()
    if (!href || !name) return

    const pic = absUrl(baseUrl,
      image.attr("data-src") || image.attr("data-original") || image.attr("data-lazy-src") || image.attr("src") || "")
    const remark = item.find(".module-item-text, .module-item-note").first().text().replace(/\s+/g, " ").trim()
    const yearText = item.find(".video-info-aux a[href*='/year/']").first().text() ||
      item.find(".module-item-caption span").first().text()
    const yearMatch = yearText.match(/\b(?:19|20)\d{2}\b/)
    const year = yearMatch ? yearMatch[0] : ""
    const sourceRemark = sourceLabel ? site.name + (year ? " · " + year : "") + (remark ? " · " + remark : "") : remark

    list.push({
      vod_id: site.id + ":" + href,
      vod_name: name,
      vod_pic: pic,
      vod_remarks: sourceRemark,
      ext: {
        year: year,
        sources: [{ siteId: site.id, path: href }]
      }
    })
  })

  return list
}

function pageCount($, page) {
  let count = 0
  $("#page a[href]").each(function (_, el) {
    const href = $(el).attr("href") || ""
    const match = href.match(/\/page\/(\d+)|[?&]page=(\d+)|-(\d+)---\.html(?:[?#]|$)/i)
    const number = match ? Number(match[1] || match[2] || match[3]) : Number($(el).text().trim())
    if (number > count) count = number
  })
  return count || Math.max(1, page)
}

async function fetchCardPage(site, path, page, kind, keyword) {
  try {
    const searching = kind === "search"
    const result = await requestSite(site, path, searching ? SEARCH_TIMEOUT : REQUEST_TIMEOUT, kind)
    const count = pageCount(result.$, page)
    let list = page > count ? [] : parseCardList(site, result.$, result.baseUrl,
      searching ? ".module-search-item" : site.listSelector, searching)
    if (searching) {
      const text = keyword.toLowerCase()
      list = list.filter(function (card) { return card.vod_name.toLowerCase().indexOf(text) >= 0 })
    }
    return { list: list, pagecount: count }
  } catch (e) {
    print((kind === "search" ? "搜索" : "分类") + "失败 " + site.name + "：" + e.message)
    return { list: [], pagecount: page }
  }
}

async function fetchHome(site, force) {
  try {
    const result = await requestSite(site, "/", REQUEST_TIMEOUT, "home", force)
    const $ = result.$
    let selector = ".module:first .module-item"
    if (!$(selector).length) selector = ".module-item"
    return parseCardList(site, $, result.baseUrl, selector, true).slice(0, 30)
  } catch (e) {
    print("推荐失败 " + site.name + "：" + e.message)
    return []
  }
}

function normalizedTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s·•:：,，.。!！?？()（）\[\]【】_-]+/g, "")
    .replace(/(?:国语|粤语|中字|高清|超清|完整版|未删减版)$/g, "")
}

function sourceKey(source) {
  return String(source.siteId || "") + "|" + String(source.path || "")
}

function appendSources(target, incoming) {
  const used = {}
  for (let i = 0; i < target.length; i++) used[sourceKey(target[i])] = true
  for (let j = 0; j < incoming.length && target.length < MAX_AGGREGATE_SITES; j++) {
    const source = incoming[j]
    if (!source || !SITE_INDEX.has(source.siteId) || typeof source.path !== "string" || !source.path.trim()) continue
    const key = sourceKey(source)
    if (used[key]) continue
    used[key] = true
    target.push({ siteId: source.siteId, path: source.path })
  }
}

function sourceNames(sources) {
  const names = []
  for (let i = 0; i < sources.length; i++) {
    const site = SITE_INDEX.get(sources[i].siteId)
    if (site && names.indexOf(site.name) < 0) names.push(site.name)
  }
  return names
}

function aggregateCards(cards) {
  const groups = []
  const byTitle = new Map()

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const titleKey = normalizedTitle(card.vod_name)
    const year = String(card.ext && card.ext.year || "").trim()
    const candidates = byTitle.get(titleKey) || []
    let group = null

    for (let j = 0; j < candidates.length; j++) {
      if (candidates[j].year && year) {
        if (candidates[j].year !== year) continue
      } else {
        // 年份未知时，只有相同站点的同一详情地址才能确认是同一作品。
        const existing = candidates[j].card.ext.sources.map(sourceKey)
        if (!(card.ext.sources || []).some(function (source) { return existing.indexOf(sourceKey(source)) >= 0 })) continue
      }
      group = candidates[j]
      break
    }

    if (!group) {
      const primary = Object.assign({}, card, { ext: { year: year, sources: [] } })
      appendSources(primary.ext.sources, card.ext.sources || [])
      group = { titleKey: titleKey, year: year, card: primary }
      groups.push(group)
      candidates.push(group)
      byTitle.set(titleKey, candidates)
    } else {
      appendSources(group.card.ext.sources, card.ext.sources || [])
      if (!group.year && year) {
        group.year = year
        group.card.ext.year = year
      }
    }
  }

  const result = []
  for (let k = 0; k < groups.length; k++) {
    const item = groups[k].card
    const names = sourceNames(item.ext.sources)
    item.vod_id = item.ext.sources.length > 1 ? "agg:" + groups[k].titleKey + ":" + groups[k].year : item.vod_id
    item.vod_remarks = names.join("/") + (groups[k].year ? " · " + groups[k].year : "") +
      (names.length > 1 ? " · " + names.length + "站" : "")
    result.push(item)
  }
  return result
}

function categoryFilter(site) {
  return [{
    key: "categoryId",
    name: "分类",
    init: site.categories.length ? site.categories[0][0] : "",
    value: site.categories.map(function (item) { return { n: item[1], v: item[0] } })
  }]
}

function recommendFilter(sites) {
  const values = [{ n: "全部", v: "all" }].concat(sites.map(function (site) { return { n: site.name, v: site.id } }))
  return [{ key: "site", name: "来源", init: "all", value: values }]
}

const PAN_PROVIDERS = [
  { name: "百度", host: /(^|\.)pan\.baidu\.com$/i },
  { name: "夸克", host: /(^|\.)quark\.cn$/i },
  { name: "115", host: /(^|\.)115\.com$/i },
  { name: "天翼", host: /(^|\.)189\.cn$/i },
  { name: "阿里", host: /(^|\.)(alipan\.com|aliyundrive\.com)$/i }
]

function panProvider(url) {
  const host = (String(url || "").match(/^https?:\/\/([^/?#:]+)/i) || [])[1] || ""
  for (let i = 0; i < PAN_PROVIDERS.length; i++) {
    if (PAN_PROVIDERS[i].host.test(host)) return { name: PAN_PROVIDERS[i].name, priority: i }
  }
  return { name: "网盘", priority: 99 }
}

function normalizePanUrl(value) {
  let url = String(value || "").trim().replace(/&amp;/ig, "&")
  if (!/^https?:\/\//i.test(url)) return ""
  url = url.replace(/[),.;，。；）]+$/g, "")
  return url.replace(
    /^(https?:\/\/)(?:www\.)?(?:115cdn\.com|anxia\.com)(?=[:/]|$)/i,
    function (_, protocol) { return protocol + "115.com" }
  )
}

function collectCandidateUrls(value, target) {
  const values = String(value || "").match(/https?:\/\/[^\s"'<>\\\u3000-\u303f\u3400-\u9fff\uff00-\uffef]+/ig) || []
  for (let i = 0; i < values.length; i++) {
    const url = normalizePanUrl(values[i])
    if (url) target.push(url)
  }
}

function parsePanUrls($) {
  const urls = []
  const rows = $(".module-row-one")

  function collectBox(box) {
    const start = urls.length
    function collectAttributes(node) {
      collectCandidateUrls(node.attr("href"), urls)
      collectCandidateUrls(node.attr("data-link"), urls)
      collectCandidateUrls(node.attr("data-clipboard-text"), urls)
    }
    collectAttributes(box)
    box.find("[data-link], [data-clipboard-text], a[href^='http']").each(function (_, el) {
      collectAttributes($(el))
    })
    // 正文只用于没有链接属性的旧页面，避免把相邻按钮文字拼入 URL。
    if (urls.length === start) collectCandidateUrls(box.text(), urls)
  }

  rows.each(function (_, el) { collectBox($(el)) })
  $(".module-row-info, [data-clipboard-text], [data-link], a.btn-down[href^='http']").each(function (_, el) {
    if (!$(el).closest(".module-row-one").length) collectBox($(el))
  })

  const unique = uniqueStrings(urls)
  unique.sort(function (a, b) { return panProvider(a).priority - panProvider(b).priority })
  return unique
}

async function fetchDetailSource(source) {
  const site = SITE_INDEX.get(source.siteId)
  if (!site || !source.path) return null
  try {
    const result = await requestSite(site, source.path, REQUEST_TIMEOUT, "detail")
    return { site: site, urls: parsePanUrls(result.$) }
  } catch (e) {
    print("详情失败 " + site.name + "：" + e.message)
    return null
  }
}

async function getLocalInfo() {
  return jsonify({ ver: 1, name: "玩偶聚合", api: "csp_wanou_aggregate_local" })
}

async function getConfig() {
  const sites = ACTIVE_SITES
  const tabs = [{ name: "推荐", ext: { id: "recommend" } }].concat(
    sites.map(function (site) { return { name: site.name, ext: { id: "site:" + site.id } } }))
  tabs.push({ name: "更新网址", ext: { id: "update-domains" } })
  return jsonify({
    ver: 1,
    title: "玩偶聚合",
    site: sites.length ? ($cache.get("wanou_aggregate_domain_" + sites[0].id) || sites[0].domains[0]) : "",
    tabs: tabs
  })
}

async function updateDomains(sites) {
  const snapshot = await refreshMonitor(true)
  const checked = await mapLimit(sites, 3, function (site) { return fetchHome(site, true) })
  const updated = sites.filter(function (site) { return snapshot.sites && snapshot.sites[site.id] }).length
  const available = checked.filter(function (list) { return list.length > 0 }).length
  const message = (snapshot.error ? "网址更新失败，沿用已保存地址" : "已拉取 " + updated + " 站网址") +
    "；已检测 " + sites.length + " 站，" + available + " 站有可用内容"
  print(message)
  try {
    if (snapshot.error) $utils.toastError(message)
    else $utils.toastInfo(message)
  } catch (e) {}
  const filters = ["all"].concat(SITES.map(function (site) { return site.id }))
  for (let i = 0; i < filters.length; i++) $cache.del(RECOMMEND_CACHE_PREFIX + "recommend:" + filters[i])
  $cache.del(RECOMMEND_CACHE_PREFIX + "update-domains:all")
  return checked
}

async function getCards(ext) {
  ext = argsify(ext)
  const page = Math.max(1, parseInt(ext.page, 10) || 1)
  const filters = ext.filters || {}
  const id = String(ext.id || "recommend")
  const sites = ACTIVE_SITES

  if (id === "recommend" || id === "update-domains") {
    const selectedId = id === "update-domains" ? "all" : String(filters.site || "all")
    const selectedSites = selectedId === "all" ? sites.slice(0, RECOMMEND_SITE_LIMIT) :
      sites.filter(function (site) { return site.id === selectedId })

    const cacheKey = RECOMMEND_CACHE_PREFIX + id + ":" + selectedId
    const cached = page > 1 && readCache(cacheKey)
    let cards
    if (cached && cached.signature === RECOMMEND_SIGNATURE &&
      Date.now() - cached.fetchedAt < RECOMMEND_CACHE_INTERVAL && Array.isArray(cached.list)) {
      cards = cached.list
    } else {
      const nested = id === "update-domains" && page === 1 ?
        (await updateDomains(sites)).slice(0, RECOMMEND_SITE_LIMIT) :
        await mapLimit(selectedSites, 3, function (site) { return fetchHome(site) })
      cards = aggregateCards([].concat.apply([], nested))
      $cache.set(cacheKey, JSON.stringify({ signature: RECOMMEND_SIGNATURE, fetchedAt: Date.now(), list: cards }))
    }
    const start = (page - 1) * RECOMMEND_PAGE_SIZE
    return jsonify({
      list: cards.slice(start, start + RECOMMEND_PAGE_SIZE),
      filter: id === "recommend" ? recommendFilter(sites) : [],
      page: page,
      pagecount: Math.max(1, Math.ceil(cards.length / RECOMMEND_PAGE_SIZE))
    })
  }

  if (id.indexOf("site:") === 0) {
    const site = SITE_INDEX.get(id.substring(5))
    if (!site) return jsonify({ list: [], filter: [] })
    let categoryId = String(filters.categoryId || (site.categories[0] ? site.categories[0][0] : ""))
    const validIds = site.categories.map(function (item) { return item[0] })
    if (validIds.indexOf(categoryId) < 0) categoryId = validIds.length ? validIds[0] : ""
    if (!categoryId) return jsonify({ list: [], filter: categoryFilter(site) })
    const result = await fetchCardPage(site, categoryPath(site, categoryId, page), page, "category")
    return jsonify({
      list: result.list,
      filter: categoryFilter(site),
      page: page,
      pagecount: result.pagecount
    })
  }

  return jsonify({ list: [] })
}

async function getTracks(ext) {
  ext = argsify(ext)
  const sources = []
  appendSources(sources, Array.isArray(ext.sources) ? ext.sources : [])
  if (!sources.length) appendSources(sources, [ext])
  if (!sources.length) return jsonify({ list: [] })

  const details = await mapLimit(sources, 3, fetchDetailSource)
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
      const provider = panProvider(url).name
      const linePrefix = detail.site.name + "-" + provider
      counts[linePrefix] = (counts[linePrefix] || 0) + 1
      tracks.push({
        name: linePrefix + (counts[linePrefix] > 1 ? " " + counts[linePrefix] : ""),
        pan: url
      })
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

  const sites = ACTIVE_SITES
  const nested = await mapLimit(sites, 3, function (site) {
    return fetchCardPage(site, searchPath(site, keyword, page), page, "search", keyword)
  })
  let cards = []
  let count = page
  for (let i = 0; i < nested.length; i++) {
    cards = cards.concat(nested[i].list)
    count = Math.max(count, nested[i].pagecount)
  }

  const aggregate = $config.aggregateSearch !== false && String($config.aggregateSearch || "true") !== "false"
  if (aggregate) cards = aggregateCards(cards)
  return jsonify({ list: cards, page: page, pagecount: count })
}

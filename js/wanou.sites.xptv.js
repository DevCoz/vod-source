const $config = argsify($config_str)
const cheerio = createCheerio()

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
const REQUEST_TIMEOUT = parseInt($config.timeout, 10) || 8000
const SEARCH_TIMEOUT = parseInt($config.searchTimeout, 10) || 7000
const RECOMMEND_TIMEOUT = parseInt($config.recommendTimeout, 10) || 2500
const RECOMMEND_DOMAIN_LIMIT = Math.max(1, parseInt($config.recommendDomainLimit, 10) || 2)
const RECOMMEND_PAGE_SIZE = 40
const RECOMMEND_SITE_LIMIT = Math.max(1, parseInt($config.recommendSiteLimit, 10) || 5)
const MAX_AGGREGATE_SITES = Math.max(1, parseInt($config.maxAggregateSites, 10) || 5)

// 顺序同时作为站点优先级。配置源自“玩偶聚合.js”的 DEFAULT_SITES/sitePriority。
const SITES = [
  {
    id: "muou",
    name: "木偶",
    domains: ["https://666.666291.xyz", "https://123.666291.xyz", "https://www.muou.site", "https://www.muou.asia"],
    listSelector: "#main .module-item",
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
    id: "labi",
    name: "蜡笔",
    domains: ["http://feimo.fun", "http://www.xiaocgege.shop", "http://xiaocgege.shop"],
    listSelector: "#main .module-item",
    categories: [["29", "臻彩"], ["1", "电影"], ["2", "电视剧"], ["3", "动漫"], ["4", "综艺"], ["5", "短剧"], ["24", "蜡笔4K"]]
  },
  {
    id: "zhizhen",
    name: "至臻",
    domains: ["http://www.miqk.cc", "https://www.mihdr.top", "https://mihdr.top", "https://zhizhen1.top"],
    listSelector: "#main .module-item",
    categories: [["26", "臻彩"], ["1", "电影"], ["2", "电视剧"], ["3", "动漫"], ["4", "综艺"], ["5", "短剧"], ["24", "老剧"]]
  },
  {
    id: "erxiao",
    name: "二小",
    domains: ["https://wexwp.cc", "https://www.wexwp.cc", "https://www.2xiaopan.top"],
    listSelector: "#main .module-item",
    categories: [["4", "臻彩"], ["1", "电影"], ["2", "电视剧"], ["3", "动漫"], ["21", "综艺"]]
  },
  {
    id: "huban",
    name: "虎斑",
    domains: ["http://121.205.88.174:16969"],
    listSelector: "#main .module-item",
    categories: [["6", "臻彩"], ["1", "电影"], ["2", "电视剧"], ["3", "综艺"], ["4", "动漫"], ["5", "短剧"], ["30", "115网盘"]]
  },
  {
    id: "kuaiying",
    name: "快映",
    domains: ["http://xsayang.fun:12512", "http://154.201.83.50:12512"],
    listSelector: "#main .module-item",
    categories: [["5", "臻彩"], ["1", "电影"], ["2", "电视剧"], ["3", "综艺"], ["4", "动漫"], ["6", "短剧"], ["30", "115"], ["35", "123"], ["36", "天移迅"]]
  },
  {
    id: "shandian",
    name: "闪电",
    domains: ["http://shandian.blog", "https://sd.sduc.site"],
    listSelector: "#main .module-item",
    categories: [["1", "电影"], ["2", "电视剧"], ["3", "综艺"], ["4", "动漫"], ["30", "短剧"]]
  },
  {
    id: "ouge",
    name: "欧哥",
    domains: ["https://woog.nxog.fun", "https://woog.nxog.eu.org", "https://woog.430520.xyz"],
    listSelector: "#main .module-item",
    categories: [["1", "电影"], ["2", "电视剧"], ["3", "动漫"], ["4", "综艺"], ["5", "短剧"], ["21", "综合"]]
  },
  {
    id: "duoduo",
    name: "多多",
    domains: ["https://tv.214521.xyz", "https://yydsys.de5.net", "https://tv.yydsys.cc", "https://tv.yydsys.top"],
    listSelector: "#main .module-item",
    categories: [["1", "电影"], ["2", "剧集"], ["4", "动漫"], ["5", "短剧"], ["3", "综艺"], ["20", "纪录"]]
  }
]

function print(message) {
  try { $print("[玩偶聚合] " + message) } catch (e) {}
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "")
}

function absUrl(baseUrl, value) {
  const url = String(value || "").trim()
  if (!url) return ""
  if (/^https?:\/\//i.test(url)) return url
  if (url.indexOf("//") === 0) return "https:" + url
  return trimSlash(baseUrl) + (url.charAt(0) === "/" ? url : "/" + url)
}

function uniqueStrings(values) {
  const result = []
  const used = {}
  for (let i = 0; i < values.length; i++) {
    const value = String(values[i] || "").trim()
    if (!value || used[value]) continue
    used[value] = true
    result.push(value)
  }
  return result
}

function siteById(id) {
  for (let i = 0; i < SITES.length; i++) {
    if (SITES[i].id === id) return SITES[i]
  }
  return null
}

function configuredSiteIds() {
  const raw = $config.enabledSites
  if (Array.isArray(raw)) return raw.map(function (item) { return String(item) })
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",").map(function (item) { return item.trim() }).filter(Boolean)
  }
  return []
}

function enabledSites() {
  const ids = configuredSiteIds()
  if (!ids.length) return SITES.slice()
  return SITES.filter(function (site) { return ids.indexOf(site.id) >= 0 })
}

function siteDomains(site) {
  let override = $config.domains && $config.domains[site.id]
  if (typeof override === "string") override = [override]
  if (!Array.isArray(override)) override = []
  const cached = $cache.get("wanou_aggregate_domain_" + site.id)
  return uniqueStrings((cached ? [cached] : []).concat(override, site.domains || []))
}

function isBlockedPage(html) {
  const lower = String(html || "").toLowerCase()
  return lower.indexOf("just a moment") >= 0 ||
    lower.indexOf("cf-browser-verification") >= 0 ||
    lower.indexOf("challenge-platform") >= 0 ||
    lower.indexOf("access denied") >= 0 ||
    lower.indexOf("安全验证") >= 0
}

async function requestSite(site, requestPath, timeout, domainLimit) {
  const rawPath = String(requestPath || "/").trim() || "/"
  const absoluteMatch = rawPath.match(/^(https?:\/\/[^/]+)(\/.*)?$/i)
  const relativePath = absoluteMatch ? (absoluteMatch[2] || "/") : (rawPath.charAt(0) === "/" ? rawPath : "/" + rawPath)
  let domains = siteDomains(site)
  if (absoluteMatch) domains = uniqueStrings([absoluteMatch[1]].concat(domains))
  if (domainLimit > 0) domains = domains.slice(0, domainLimit)
  let lastError = ""

  for (let i = 0; i < domains.length; i++) {
    const baseUrl = trimSlash(domains[i])
    const url = baseUrl + relativePath
    try {
      const response = await $fetch.get(url, {
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9"
        },
        timeout: timeout || REQUEST_TIMEOUT
      })
      const html = typeof response.data === "string" ? response.data : JSON.stringify(response.data || "")
      if (html.length < 80 || isBlockedPage(html)) {
        lastError = "空页面或验证页面"
        continue
      }
      $cache.set("wanou_aggregate_domain_" + site.id, baseUrl)
      return { html: html, baseUrl: baseUrl, url: url }
    } catch (e) {
      lastError = e && e.message ? e.message : String(e)
    }
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

function cardSource(site, path) {
  return { siteId: site.id, path: String(path || "") }
}

function parseCardList(site, html, baseUrl, selector, sourceLabel) {
  const $ = cheerio.load(String(html || ""))
  const list = []
  const itemSelector = selector || site.listSelector || ".module-item"

  $(itemSelector).each(function (_, el) {
    const item = $(el)
    const pictureLink = item.find(".module-item-pic a").first()
    const titleLink = item.find(".module-item-title").first()
    const serialLink = item.find(".video-serial").first()
    const image = item.find(".module-item-pic img, img.lazyload, img").first()
    const href = serialLink.attr("href") || pictureLink.attr("href") || titleLink.attr("href") || ""
    const name = serialLink.attr("title") || image.attr("alt") || titleLink.attr("title") || titleLink.text().trim()
    if (!href || !name) return

    const pic = absUrl(baseUrl,
      image.attr("data-src") || image.attr("data-original") || image.attr("data-lazy-src") || image.attr("src") || "")
    const remark = item.find(".module-item-text, .module-item-note").first().text().replace(/\s+/g, " ").trim()
    const year = item.find(".module-item-caption span").first().text().trim()
    const sourceRemark = sourceLabel ? site.name + (remark ? " · " + remark : "") : remark

    list.push({
      vod_id: site.id + ":" + href,
      vod_name: name.replace(/\s+/g, " ").trim(),
      vod_pic: pic,
      vod_remarks: sourceRemark,
      ext: {
        title: name.replace(/\s+/g, " ").trim(),
        year: year,
        sources: [cardSource(site, href)]
      }
    })
  })

  return list
}

async function fetchCategory(site, categoryId, page) {
  try {
    const result = await requestSite(site, categoryPath(site, categoryId, page), REQUEST_TIMEOUT)
    return parseCardList(site, result.html, result.baseUrl, site.listSelector, false)
  } catch (e) {
    print("分类失败 " + site.name + "：" + e.message)
    return []
  }
}

async function fetchHome(site) {
  try {
    const result = await requestSite(site, "/", RECOMMEND_TIMEOUT, RECOMMEND_DOMAIN_LIMIT)
    const $ = cheerio.load(result.html)
    let selector = ".module:first .module-item"
    if (!$(selector).length) selector = site.listSelector || ".module-item"
    return parseCardList(site, result.html, result.baseUrl, selector, true).slice(0, 30)
  } catch (e) {
    print("推荐失败 " + site.name + "：" + e.message)
    return []
  }
}

async function fetchSearch(site, keyword, page) {
  try {
    const result = await requestSite(site, searchPath(site, keyword, page), SEARCH_TIMEOUT)
    let list = parseCardList(site, result.html, result.baseUrl, site.searchListSelector || ".module-search-item", true)
    const normalizedKeyword = String(keyword || "").toLowerCase().trim()
    list = list.filter(function (card) {
      return String(card.vod_name || "").toLowerCase().indexOf(normalizedKeyword) >= 0
    })
    return list
  } catch (e) {
    print("搜索失败 " + site.name + "：" + e.message)
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
    const key = sourceKey(incoming[j])
    if (!key || used[key]) continue
    used[key] = true
    target.push(incoming[j])
  }
}

function sourceNames(sources) {
  const names = []
  for (let i = 0; i < sources.length; i++) {
    const site = siteById(sources[i].siteId)
    if (site && names.indexOf(site.name) < 0) names.push(site.name)
  }
  return names
}

function aggregateCards(cards) {
  const groups = []

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const titleKey = normalizedTitle(card.vod_name)
    const year = String(card.ext && card.ext.year || "").trim()
    let group = null

    for (let j = 0; j < groups.length; j++) {
      if (groups[j].titleKey !== titleKey) continue
      if (groups[j].year && year && groups[j].year !== year) continue
      group = groups[j]
      break
    }

    if (!group) {
      const primary = {
        vod_id: card.vod_id,
        vod_name: card.vod_name,
        vod_pic: card.vod_pic,
        vod_remarks: card.vod_remarks,
        ext: {
          title: card.ext.title,
          year: year,
          sources: []
        }
      }
      appendSources(primary.ext.sources, card.ext.sources || [])
      group = { titleKey: titleKey, year: year, card: primary }
      groups.push(group)
    } else {
      appendSources(group.card.ext.sources, card.ext.sources || [])
      if (!group.year && year) group.year = year
    }
  }

  const result = []
  for (let k = 0; k < groups.length; k++) {
    const item = groups[k].card
    const names = sourceNames(item.ext.sources)
    item.vod_id = item.ext.sources.length > 1 ? "agg:" + groups[k].titleKey + ":" + groups[k].year : item.vod_id
    item.vod_remarks = names.join("/") + (names.length > 1 ? " · " + names.length + "站" : "")
    result.push(item)
  }
  return result
}

function categoryFilter(site) {
  const values = []
  for (let i = 0; i < site.categories.length; i++) {
    values.push({ n: site.categories[i][1], v: site.categories[i][0] })
  }
  return [{
    key: "categoryId",
    name: "分类",
    init: site.categories.length ? site.categories[0][0] : "",
    value: values
  }]
}

function recommendFilter(sites) {
  const values = [{ n: "全部", v: "all" }]
  for (let i = 0; i < sites.length; i++) values.push({ n: sites[i].name, v: sites[i].id })
  return [{ key: "site", name: "来源", init: "all", value: values }]
}

function providerName(url) {
  const value = String(url || "").toLowerCase()
  if (value.indexOf("pan.baidu.com") >= 0) return "百度"
  if (value.indexOf("pan.quark.cn") >= 0 || value.indexOf("quark.cn") >= 0) return "夸克"
  if (value.indexOf("115.com") >= 0) return "115"
  if (value.indexOf("cloud.189.cn") >= 0 || value.indexOf("189.cn") >= 0) return "天翼"
  if (value.indexOf("alipan.com") >= 0 || value.indexOf("aliyundrive.com") >= 0) return "阿里"
  return "网盘"
}

function providerPriority(url) {
  const name = providerName(url)
  if (name === "百度") return 1
  if (name === "夸克") return 2
  if (name === "115") return 3
  if (name === "天翼") return 4
  if (name === "阿里") return 5
  return 99
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

function extractHttpUrls(value) {
  return String(value || "").match(/https?:\/\/[^\s"'<>（）【】]+/ig) || []
}

function collectCandidateUrls(value, target) {
  const values = extractHttpUrls(value)
  for (let i = 0; i < values.length; i++) {
    const url = normalizePanUrl(values[i])
    if (url) target.push(url)
  }
}

function parsePanUrls(html) {
  const $ = cheerio.load(String(html || ""))
  const urls = []
  const rows = $(".module-row-one")

  function collectBox(box) {
    const candidates = [
      box.attr("data-link"),
      box.attr("data-clipboard-text"),
      box.find("[data-link]").first().attr("data-link"),
      box.find("[data-clipboard-text]").first().attr("data-clipboard-text"),
      box.find("a.btn-down[href^='http']").first().attr("href"),
      box.find("a[href^='http']").first().attr("href"),
      box.find(".module-row-title p").first().text(),
      box.text()
    ]
    for (let i = 0; i < candidates.length; i++) collectCandidateUrls(candidates[i], urls)
  }

  if (rows.length) {
    rows.each(function (_, el) { collectBox($(el)) })
  } else {
    $(".module-row-info, [data-clipboard-text], [data-link], a.btn-down[href^='http']").each(function (_, el) {
      collectBox($(el))
    })
  }

  const unique = uniqueStrings(urls)
  unique.sort(function (a, b) { return providerPriority(a) - providerPriority(b) })
  return unique
}

async function fetchDetailSource(source) {
  const site = siteById(source.siteId)
  if (!site || !source.path) return null
  try {
    const result = await requestSite(site, source.path, REQUEST_TIMEOUT)
    return { site: site, urls: parsePanUrls(result.html) }
  } catch (e) {
    print("详情失败 " + site.name + "：" + e.message)
    return null
  }
}

async function getLocalInfo() {
  return jsonify({ ver: 1, name: "玩偶聚合", api: "csp_wanou_aggregate_local" })
}

async function getConfig() {
  const sites = enabledSites()
  const tabs = [{ name: "推荐", ext: { id: "recommend" } }]
  for (let i = 0; i < sites.length; i++) {
    tabs.push({ name: sites[i].name, ext: { id: "site:" + sites[i].id } })
  }
  return jsonify({
    ver: 1,
    title: "玩偶聚合",
    site: sites.length ? sites[0].domains[0] : "",
    tabs: tabs
  })
}

async function getCards(ext) {
  ext = argsify(ext)
  const page = Math.max(1, parseInt(ext.page, 10) || 1)
  const filters = ext.filters || {}
  const id = String(ext.id || "recommend")
  const sites = enabledSites()

  if (id === "recommend") {
    const selectedId = String(filters.site || "all")
    let selectedSites = []
    if (selectedId === "all") selectedSites = sites.slice(0, RECOMMEND_SITE_LIMIT)
    else {
      const selected = siteById(selectedId)
      if (selected && sites.indexOf(selected) >= 0) selectedSites = [selected]
    }

    const tasks = selectedSites.map(function (site) { return fetchHome(site) })
    const settled = await Promise.allSettled(tasks)
    const nested = settled.map(function (item) {
      return item.status === "fulfilled" && Array.isArray(item.value) ? item.value : []
    })
    let cards = []
    for (let i = 0; i < nested.length; i++) cards = cards.concat(nested[i])
    cards = aggregateCards(cards)
    const start = (page - 1) * RECOMMEND_PAGE_SIZE
    return jsonify({
      list: cards.slice(start, start + RECOMMEND_PAGE_SIZE),
      filter: recommendFilter(sites),
      page: page,
      pagecount: Math.max(1, Math.ceil(cards.length / RECOMMEND_PAGE_SIZE))
    })
  }

  if (id.indexOf("site:") === 0) {
    const site = siteById(id.substring(5))
    if (!site) return jsonify({ list: [], filter: [] })
    let categoryId = String(filters.categoryId || (site.categories[0] ? site.categories[0][0] : ""))
    const validIds = site.categories.map(function (item) { return item[0] })
    if (validIds.indexOf(categoryId) < 0) categoryId = validIds.length ? validIds[0] : ""
    if (!categoryId) return jsonify({ list: [], filter: categoryFilter(site) })
    const list = await fetchCategory(site, categoryId, page)
    return jsonify({
      list: list,
      filter: categoryFilter(site),
      page: page,
      pagecount: list.length >= 20 ? page + 1 : page
    })
  }

  return jsonify({ list: [] })
}

async function getTracks(ext) {
  ext = argsify(ext)
  let sources = Array.isArray(ext.sources) ? ext.sources.slice(0, MAX_AGGREGATE_SITES) : []
  if (!sources.length && ext.siteId && ext.path) sources = [{ siteId: ext.siteId, path: ext.path }]
  if (!sources.length) return jsonify({ list: [] })

  const tasks = sources.map(function (source) { return fetchDetailSource(source) })
  const details = await Promise.all(tasks)
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
      const provider = providerName(url)
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

  const sites = enabledSites()
  const tasks = sites.map(function (site) { return fetchSearch(site, keyword, page) })
  const nested = await Promise.all(tasks)
  let cards = []
  for (let i = 0; i < nested.length; i++) cards = cards.concat(nested[i])

  const aggregate = $config.aggregateSearch !== false && String($config.aggregateSearch || "true") !== "false"
  if (aggregate) cards = aggregateCards(cards)
  return jsonify({ list: cards, page: page, pagecount: 1 })
}

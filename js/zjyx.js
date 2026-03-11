/*
 * 📅【盘搜】追剧优选 - XPTV 版
 * 基于T4版本转换，适配XPTV协议
 * 功能：追剧日历、盘搜资源、网盘分组、线路解析、TMDB图片
 * 日期: 2026-03-11
 */

// ===================== ⚠️ 重要配置参数 =====================
const USE_TMDB_IMAGE = true;          // 是否优先使用TMDB图片
const MAX_LINES_PER_PAN = 3;          // 每个网盘最多显示3条线路
const CONCURRENCY_LIMIT = 20;         // 最大并发请求数
const PAN_ORDER = ['baidu','a189','quark'];  // 网盘优先级
const TMDB_API_KEY = "";               // TMDB API密钥（需自行填写）
const PANSOU_CONFIG = {
  baseURL: "https://so.252035.xyz",   // 盘搜接口地址（需填写）
  checkURL: ""   // 链接检查接口地址（需填写）
};

// ===================== 基础配置 =====================
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const DATA_SOURCES = {
  zjrl: "https://zjrl-1318856176.cos.accelerate.myqcloud.com",
  gist: "https://gist.githubusercontent.com/huangxd-/5ae61c105b417218b9e5bad7073d2f36/raw",
  tmdbImage: "https://image.tmdb.org/t/p/w500",
  tmdbApi: "https://api.themoviedb.org/3"
};

// ===================== 日志 =====================
const log = {
  info: (...args) => {
    const msg = args.join(' ');
    console.log(`[INFO] ${msg}`);
    if (typeof $print === 'function') $print(msg);
  }
};

// ===================== 缓存 =====================
const CACHE_TTL = {
  pansou: 30 * 60 * 1000,      // 网盘搜索结果 30分钟
  drive: 60 * 60 * 1000,       // 网盘驱动解析 1小时
  search: 5 * 60 * 1000        // 搜索页缓存 5分钟
};

// ===================== 网盘映射 =====================
const panTypes = {
  ali: "aliyun", quark: "quark", uc: "uc", pikpak: "pikpak",
  xunlei: "xunlei", a123: "123", a189: "tianyi", a139: "mobile",
  a115: "115", baidu: "baidu"
};
const reversePanTypes = {
  aliyun: "ali", quark: "quark", uc: "uc", pikpak: "pikpak",
  xunlei: "xunlei", '123': "a123", tianyi: "a189",
  mobile: "a139", '115': "a115", baidu: "baidu"
};
const panPic = {
  ali: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/ali.jpg",
  quark: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/quark.png",
  uc: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/uc.png",
  pikpak: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/pikpak.jpg",
  xunlei: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/thunder.png",
  '123': "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/123.png",
  tianyi: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/189.png",
  mobile: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/139.jpg",
  '115': "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/115.jpg",
  baidu: "https://xget.xi-xu.me/gh/power721/alist-tvbox/raw/refs/heads/master/web-ui/public/baidu.jpg",
};
const panNames = {
  ali: "阿里云盘", quark: "夸克网盘", uc: "UC网盘", pikpak: "PikPak",
  xunlei: "迅雷网盘", a123: "123云盘", a189: "天翼网盘",
  a139: "移动云盘", a115: "115网盘", baidu: "百度网盘"
};

// ===================== 工具函数 =====================
const fetchJSON = async (url) => {
  try {
    const res = await $fetch.get(url, { headers: { "User-Agent": UA }, timeout: 15000 });
    return res.data;
  } catch (e) {
    log.info(`请求失败: ${url}, ${e.message}`);
    return null;
  }
};

// 简单日期格式化
const formatDate = (date, fmt = 'MM-DD') => {
  if (!date) return '';
  const d = new Date(date);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  if (fmt === 'MM-DD') return `${month}-${day}`;
  return '';
};

// ===================== TMDB 图片缓存 =====================
const tmdbCache = new Map();

const fetchTMDBImage = async (tmdbId, mediaType = 'tv') => {
  if (!TMDB_API_KEY || !tmdbId) return null;
  const cacheKey = `${mediaType}_${tmdbId}`;
  if (tmdbCache.has(cacheKey)) return tmdbCache.get(cacheKey);
  try {
    const url = `${DATA_SOURCES.tmdbApi}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=zh-CN`;
    const res = await $fetch.get(url, { headers: { "User-Agent": UA }, timeout: 5000 });
    const posterPath = res.data?.poster_path;
    if (posterPath) {
      const imageUrl = `${DATA_SOURCES.tmdbImage}${posterPath}`;
      tmdbCache.set(cacheKey, imageUrl);
      return imageUrl;
    }
  } catch (e) {
    log.info(`[TMDB] 获取图片失败: ${tmdbId}`);
  }
  return null;
};

// 并发控制函数
async function runWithConcurrency(tasks, limit = CONCURRENCY_LIMIT) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    const e = p.then(() => executing.delete(e));
    executing.add(e);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// ===================== 追剧日历数据获取 =====================
const getRankData = async (rankType) => {
  log.info(`[getRankData] 开始获取: ${rankType}`);
  const areaTypes = ["国产剧", "日剧", "英美剧", "番剧", "韩剧", "港台剧"];
  if (areaTypes.includes(rankType)) {
    const url = `${DATA_SOURCES.zjrl}/home0.json`;
    const data = await fetchJSON(url);
    if (!data) return [];
    const category = data.find(item => item.type === "category");
    if (!category) return [];
    const area = category.content.find(item => item.title === rankType);
    if (!area) return [];
    const result = area.data || area;
    return result || [];
  }
  const specialRanks = ["华语热门", "本季新番", "今日推荐"];
  const isSpecial = specialRanks.includes(rankType);
  const url = isSpecial ? `${DATA_SOURCES.zjrl}/home0.json` : `${DATA_SOURCES.zjrl}/home1.json`;
  const data = await fetchJSON(url);
  if (!data) return [];
  if (rankType === "今日推荐") {
    const rec = data.find(item => item.type === "1s");
    return rec ? rec.content : [];
  }
  const item = data.find(i => i.title === rankType);
  return item ? item.content : [];
};

const getDayData = async (type, day) => {
  if (type === 'juji' || type === 'fanju') {
    const url = `${DATA_SOURCES.zjrl}/home1.json`;
    const data = await fetchJSON(url);
    if (!data) return [];
    const titleMap = {
      'juji_today': '今天播出的剧集',
      'juji_tomorrow': '明天播出的剧集',
      'fanju_today': '今天播出的番剧',
      'fanju_tomorrow': '明天播出的番剧'
    };
    const item = data.find(i => i.title === titleMap[`${type}_${day}`]);
    let items = item ? item.content : [];
    if (TMDB_API_KEY && items.length > 0) {
      items = await batchFetchTMDBImagesConcurrent(items, 'tv', 10);
    }
    return items;
  }
  const url = `${DATA_SOURCES.gist}/${type}_${day}.json`;
  let data = await fetchJSON(url);
  if (!data) return [];
  if (!Array.isArray(data)) return [];
  log.info(`[${type}_${day}] 获取到 ${data.length} 条`);
  if (TMDB_API_KEY && data.length > 0) {
    data = await batchFetchTMDBImagesConcurrent(data, 'tv', 10);
  }
  return data;
};

const getWeekData = async (type, weekday) => {
  const url = `${DATA_SOURCES.gist}/${type}.json`;
  const data = await fetchJSON(url);
  if (!data) return [];
  const targetDay = (!weekday || weekday === 'All') ? 'Monday' : weekday;
  let items = data[targetDay] || [];
  log.info(`[周历] ${targetDay}: ${items.length} 条`);
  if (TMDB_API_KEY && items.length > 0) {
    const mediaType = type.includes('movie') ? 'movie' : 'tv';
    items = await batchFetchTMDBImagesConcurrent(items, mediaType, 10);
  }
  return items;
};

// ===================== 批量TMDB图片（并发） =====================
const batchFetchTMDBImagesConcurrent = async (items, mediaType = 'tv', concurrency = 5) => {
  if (!USE_TMDB_IMAGE || !TMDB_API_KEY || items.length === 0) return items;
  const newItems = [...items];
  const needFetch = [];
  for (let i = 0; i < newItems.length; i++) {
    const item = newItems[i];
    if (item.tmdb_id && !item.poster_path && !item._fetched_poster) {
      needFetch.push({ index: i, tmdbId: item.tmdb_id, mediaType });
    }
  }
  if (needFetch.length === 0) return newItems;
  log.info(`[TMDB并发] 需要获取 ${needFetch.length} 条图片，并发数: ${concurrency}`);
  const tasks = needFetch.map(({ index, tmdbId, mediaType }) => async () => {
    try {
      const url = `${DATA_SOURCES.tmdbApi}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=zh-CN`;
      const res = await $fetch.get(url, { headers: { "User-Agent": UA }, timeout: 5000 });
      const posterPath = res.data?.poster_path;
      if (posterPath) {
        const imageUrl = `${DATA_SOURCES.tmdbImage}${posterPath}`;
        return { index, imageUrl, success: true };
      }
    } catch (e) {
      log.info(`[TMDB并发] 获取图片失败: ${tmdbId}`);
    }
    return { index, success: false };
  });
  const fetchResults = await runWithConcurrency(tasks, concurrency);
  for (const result of fetchResults) {
    if (result.success) {
      newItems[result.index] = {
        ...newItems[result.index],
        _fetched_poster: result.imageUrl
      };
      const item = newItems[result.index];
      tmdbCache.set(`${mediaType}_${item.tmdb_id}`, result.imageUrl);
    }
  }
  log.info(`[TMDB并发] 完成: ${fetchResults.filter(r => r.success).length}/${needFetch.length} 成功`);
  return newItems;
};

const fetchTMDBInfo = async (title) => {
  if (!USE_TMDB_IMAGE || !TMDB_API_KEY || !title) return null;
  try {
    const url = `${DATA_SOURCES.tmdbApi}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=zh-CN&page=1`;
    const res = await $fetch.get(url, { headers: { "User-Agent": UA }, timeout: 5000 });
    const results = res.data?.results;
    if (results && results.length > 0) {
      const first = results[0];
      return {
        vod_pic: first.poster_path ? `${DATA_SOURCES.tmdbImage}${first.poster_path}` : "",
        vod_content: first.overview || "",
        vod_year: first.first_air_date ? first.first_air_date.substring(0, 4) : "",
        vod_actor: "",
        vod_director: ""
      };
    }
  } catch (e) {
    log.info(`[TMDB] 搜索失败: ${title}`);
  }
  return null;
};

// ===================== 数据转换 =====================
const convertItem = (item, index = 0, sourceType = '') => {
  if (!item || typeof item !== 'object') return null;
  let title = item.title || item.name || item.cn_name || item.original_name;
  if (!title && item.t1) title = item.t1;
  if (!title) {
    const possibleFields = ['show_name', 'tv_name', 'series_name', 'program_name', 'zh_name'];
    for (const field of possibleFields) {
      if (item[field]) { title = item[field]; break; }
    }
  }
  if (!title) {
    log.info(`[转换] 无法找到标题，数据字段: ${Object.keys(item).join(',')}`);
    title = `未知_${index}`;
  }
  const year = item.year || item.release_year || (item.first_air_date ? item.first_air_date.substring(0, 4) : "") || "";
  const episode = item.episode || item.episode_number || item.latest_episode || "";
  let pic = "";
  if (USE_TMDB_IMAGE) {
    if (item.poster_path) pic = `${DATA_SOURCES.tmdbImage}${item.poster_path}`;
    else if (item._fetched_poster) pic = item._fetched_poster;
    else if (item.backdrop_path) pic = `${DATA_SOURCES.tmdbImage}${item.backdrop_path}`;
  }
  if (!pic) {
    if (item.pic) pic = item.pic;
    else if (item.cover) pic = item.cover;
    else if (item.image) pic = item.image;
    else if (item.img) pic = item.img;
    else if (item.poster) pic = item.poster;
    else if (item.thumb) pic = item.thumb;
    else if (item.thumbnail) pic = item.thumbnail;
  }
  const uniqueId = item.id || item.tmdb_id || item.douban_id || `${index}`;
  const encodedTitle = encodeURIComponent(title);
  const vod_id = `zjrl_${encodedTitle}_${uniqueId}`;
  let remarks = episode;
  if (!remarks && (item.vote_average || item.t3)) remarks = `${item.vote_average || item.t3}分`;
  if (!remarks && item.rating) remarks = `${item.rating}分`;
  if (!remarks) remarks = year || "追剧日历";
  return {
    vod_id,
    vod_name: title,
    vod_pic: pic,
    vod_remarks: remarks,
    vod_year: String(year),
    _raw: item
  };
};

// ===================== 盘搜核心 =====================
const checkLinksValidity = async (links) => {
  const uniqueLinks = [...new Set(links)];
  const VALID_STATUS = ["valid_links"];
  let validLinksSet = new Set();
  try {
    const checkRes = await $fetch.post(
      PANSOU_CONFIG.checkURL,
      { links: uniqueLinks, selected_platforms: ["quark", "uc", "baidu", "tianyi", "pan115", "cmcc"] },
      { timeout: 30000, headers: { "Content-Type": "application/json" } }
    );
    const checkData = checkRes.data;
    for (const status of VALID_STATUS) {
      (checkData[status] || []).forEach((link) => validLinksSet.add(link));
    }
  } catch (e) {
    log.info(`[盘搜校验链接失败] ${e.message}`);
    uniqueLinks.forEach((l) => validLinksSet.add(l));
  }
  return validLinksSet;
};

const getAllPanResults = async (wd) => {
  log.info(`[盘搜] 搜索所有网盘: ${wd}`);
  try {
    const cloudTypes = PAN_ORDER.map(key => panTypes[key]).filter(Boolean);
    if (cloudTypes.length === 0) return {};
    const res = await $fetch.post(PANSOU_CONFIG.baseURL + "/api/search", {
      kw: wd,
      cloud_types: cloudTypes,
    });
    if (res.data.code !== 0) {
      log.info(`[盘搜] 搜索失败: ${res.data.message}`);
      return {};
    }
    const data = res.data.data;
    const allLinks = [];
    for (const key in data.merged_by_type || {}) {
      for (const row of data.merged_by_type[key] || []) allLinks.push(row.url);
    }
    const validLinksSet = await checkLinksValidity(allLinks);
    const results = {};
    for (const key in data.merged_by_type || {}) {
      const panKey = reversePanTypes[key];
      if (!panKey || !PAN_ORDER.includes(panKey)) continue;
      const validItems = (data.merged_by_type[key] || [])
        .filter(item => validLinksSet.has(item.url))
        .map(item => ({
          url: item.url,
          name: item.note,
          datetime: item.datetime,
        }));
      if (validItems.length > 0) results[panKey] = validItems;
    }
    const counts = Object.entries(results).map(([k, v]) => `${k}:${v.length}`).join(', ');
    log.info(`[盘搜] 搜索结果: ${counts}`);
    return results;
  } catch (error) {
    log.info(`[盘搜] 搜索异常: ${error.message}`);
    return {};
  }
};

// 带缓存的盘搜获取
const getPansouWithCache = async (vodName) => {
  const cacheKey = `pansou_${vodName}`;
  const cached = $cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL.pansou) {
    log.info(`[盘搜缓存] 命中: ${vodName}, 网盘数: ${Object.keys(cached.data).length}`);
    return { data: cached.data, fromCache: true };
  }
  const start = Date.now();
  const data = await getAllPanResults(vodName);
  $cache.set(cacheKey, { data, time: Date.now() });
  log.info(`[盘搜] 完成，耗时: ${Date.now() - start}ms, 网盘数: ${Object.keys(data).length}`);
  return { data, fromCache: false };
};

// 网盘驱动解析（带缓存）
const getEpisodesFromDrive = async (url, driveKey, drives) => {
  log.info(`[网盘驱动] 获取剧集: ${driveKey}, URL: ${url.substring(0, 50)}...`);
  const drive = drives.find(d => d.key === driveKey);
  if (!drive) {
    log.info(`[网盘驱动] 未找到驱动: ${driveKey}`);
    return null;
  }
  try {
    if (!drive.matchShare || !drive.matchShare(url)) return null;
    const vod = await drive.getVod(url);
    if (!vod) return null;
    let isValid = true;
    if (vod.vod_play_url) {
      const parts = vod.vod_play_url.split('#');
      if (parts.length === 1) {
        const single = parts[0];
        const [name, link] = single.split('$');
        if (name === '播放' || name === '全集' || name === '点击播放' || name === '立即播放') {
          isValid = false;
        }
      }
    } else {
      isValid = false;
    }
    if (!isValid) return null;
    log.info(`[网盘驱动] 获取成功: ${driveKey}, 线路: ${vod.vod_play_from}, 集数: ${vod.vod_play_url?.split('#').length || 0}`);
    return {
      playFrom: vod.vod_play_from || driveKey,
      playUrl: vod.vod_play_url,
      vodPic: vod.vod_pic || "",
      vodContent: vod.vod_content || "",
      vodActor: vod.vod_actor || "",
      vodDirector: vod.vod_director || ""
    };
  } catch (error) {
    log.info(`[网盘驱动] 错误: ${error.message}`);
    return null;
  }
};

// 带缓存的驱动解析
const getDriveParseWithCache = async (url, driveKey, drives) => {
  const cacheKey = `drive_${driveKey}_${url}`;
  const cached = $cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL.drive) {
    log.info(`[驱动缓存] 命中: ${driveKey}`);
    return { data: cached.data, fromCache: true };
  }
  const start = Date.now();
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('驱动超时')), 10000)
  );
  try {
    const result = await Promise.race([
      getEpisodesFromDrive(url, driveKey, drives),
      timeoutPromise
    ]);
    $cache.set(cacheKey, { data: result, time: Date.now() });
    log.info(`[驱动解析] ${driveKey} 成功，耗时: ${Date.now() - start}ms`);
    return { data: result, fromCache: false };
  } catch (error) {
    log.info(`[驱动解析] ${driveKey} 超时或错误: ${error.message}`);
    return { data: null, fromCache: false, error: error.message };
  }
};

// ===================== 搜索（返回分组卡片） =====================
const _search = async (wd, page, drives) => {
  log.info(`[搜索] 关键词: ${wd}, 页码: ${page}`);
  const cacheKey = `search_${wd}_${page}`;
  const cached = $cache.get(cacheKey);
  if (cached && cached.expire > Date.now()) {
    log.info(`[搜索缓存] 命中: ${wd}`);
    return cached.data;
  }
  const result = { list: [], page, pagecount: 1, total: 0 };
  try {
    const cloudTypes = PAN_ORDER.map(key => panTypes[key]).filter(Boolean);
    if (cloudTypes.length === 0) return result;
    const res = await $fetch.post(PANSOU_CONFIG.baseURL + "/api/search", {
      kw: wd,
      cloud_types: cloudTypes,
    });
    const ret = res.data;
    if (ret.code !== 0) throw new Error(ret.message || "请求失败");
    const allLinks = [];
    for (const key in ret.data.merged_by_type || {}) {
      for (const row of ret.data.merged_by_type[key] || []) allLinks.push(row.url);
    }
    const validLinksSet = await checkLinksValidity(allLinks);
    const driveMap = new Map();
    for (const driveKey of PAN_ORDER) {
      const drive = drives.find(d => d.key === driveKey);
      if (drive && panNames[driveKey]) {
        driveMap.set(driveKey, {
          driveName: drive.name || panNames[driveKey],
          drivePic: panPic[driveKey] || "",
          resourceCount: 0,
          latestDate: null,
        });
      }
    }
    for (const key in ret.data.merged_by_type || {}) {
      const driveKey = reversePanTypes[key];
      if (!driveKey || !PAN_ORDER.includes(driveKey) || !driveMap.has(driveKey)) continue;
      const driveData = driveMap.get(driveKey);
      const resources = (ret.data.merged_by_type[key] || []).filter((row) => validLinksSet.has(row.url));
      driveData.resourceCount += resources.length;
      for (const row of resources) {
        const dt = new Date(row.datetime);
        if (!driveData.latestDate || dt > driveData.latestDate) driveData.latestDate = dt;
      }
      if (resources.length > 0) {
        const searchCacheKey = `${wd}_${driveKey}`;
        $cache.set(searchCacheKey, {
          items: resources.map(item => ({
            url: item.url,
            name: item.note,
            datetime: item.datetime,
          })),
          expire: Date.now() + CACHE_TTL.search
        });
      }
    }
    let tmdbPoster = null;
    if (USE_TMDB_IMAGE && TMDB_API_KEY) {
      try {
        const tmdbInfo = await fetchTMDBInfo(wd);
        if (tmdbInfo && tmdbInfo.vod_pic) tmdbPoster = tmdbInfo.vod_pic;
      } catch (e) {}
    }
    for (const [driveKey, driveData] of driveMap) {
      if (driveData.resourceCount > 0) {
        const displayName = USE_TMDB_IMAGE ? `${driveData.driveName}【${wd}】` : driveData.driveName;
        result.list.push({
          vod_id: `drive_${driveKey}_${encodeURIComponent(wd)}`,
          vod_name: displayName,
          vod_pic: (USE_TMDB_IMAGE && tmdbPoster) ? tmdbPoster : driveData.drivePic,
          vod_remarks: `${driveData.resourceCount}个资源 | ${formatDate(driveData.latestDate)}`,
          time: driveData.latestDate ? driveData.latestDate.getTime() : 0,
        });
      }
    }
    result.list.sort((a, b) => b.time - a.time);
    result.total = result.list.length;
    result.pagecount = Math.ceil(result.total / 20) || 1;
    $cache.set(cacheKey, { data: result, expire: Date.now() + CACHE_TTL.search });
    log.info(`[搜索] 返回 ${result.list.length}/${result.total} 个网盘分组`);
  } catch (error) {
    log.info(`[搜索] 失败: ${error.message}`);
  }
  return result;
};

// ===================== 详情（返回播放列表数据） =====================
const _detail = async (id, title, drives) => {
  log.info(`[详情] ID: ${id}, 标题: ${title || '未知'}`);
  if (id.startsWith('drive_')) {
    try {
      const [, driveKey, encodedWd] = id.split('_');
      const wd = decodeURIComponent(encodedWd);
      const cacheKey = `${wd}_${driveKey}`;
      const cached = $cache.get(cacheKey);
      let driveTypeData = [];
      if (cached && cached.expire > Date.now()) {
        driveTypeData = cached.items;
        log.info(`[详情] 使用缓存数据: ${cacheKey}, 共 ${driveTypeData.length} 条`);
      } else {
        log.info(`[详情] 缓存未命中，重新搜索: ${cacheKey}`);
        const panTypeMap = {
          ali: "aliyun", quark: "quark", uc: "uc", pikpak: "pikpak",
          xunlei: "xunlei", a123: "123", a189: "tianyi", a139: "mobile",
          a115: "115", baidu: "baidu"
        };
        const res = await $fetch.post(PANSOU_CONFIG.baseURL + "/api/search", { kw: wd, cloud_types: [panTypeMap[driveKey]] });
        const ret = res.data;
        if (ret.code !== 0) throw new Error(ret.message || "请求失败");
        let rawData = ret.data.merged_by_type[panTypeMap[driveKey]] || [];
        const allLinks = rawData.map(item => item.url);
        const validLinksSet = await checkLinksValidity(allLinks);
        driveTypeData = rawData.filter(item => validLinksSet.has(item.url)).map(item => ({
          url: item.url,
          name: item.note,
          datetime: item.datetime,
        }));
        $cache.set(cacheKey, { items: driveTypeData, expire: Date.now() + CACHE_TTL.search });
      }
      if (driveTypeData.length === 0) {
        return {
          vod_id: id,
          vod_name: wd,
          vod_pic: panPic[driveKey] || "",
          vod_remarks: "无有效资源",
          vod_content: "",
          vod_play_from: "",
          vod_play_url: "",
        };
      }
      const limitedData = driveTypeData.slice(0, MAX_LINES_PER_PAN);
      const tasks = limitedData.map((row, index) => async () => {
        const result = await getDriveParseWithCache(row.url, driveKey, drives);
        return { result, index, row };
      });
      const results = await runWithConcurrency(tasks, CONCURRENCY_LIMIT);
      const playFromList = [];
      const playUrlList = [];
      let mainVodInfo = null;
      for (const parseRes of results) {
        const episodeData = parseRes.result.data;
        if (episodeData && episodeData.playUrl) {
          const lineName = playFromList.length === 0 ? (panNames[driveKey] || driveKey) : `${panNames[driveKey] || driveKey}#${playFromList.length + 1}`;
          playFromList.push(lineName);
          playUrlList.push(episodeData.playUrl);
          if (!mainVodInfo) mainVodInfo = episodeData;
        }
      }
      if (playFromList.length === 0) {
        return {
          vod_id: id,
          vod_name: wd,
          vod_pic: panPic[driveKey] || "",
          vod_remarks: "无有效播放线路",
          vod_content: `搜索: ${wd}\n未找到有效播放资源`,
          vod_play_from: "温馨提示",
          vod_play_url: "未找到有效播放资源$https://www.douban.com",
        };
      }
      const tmdbInfo = await fetchTMDBInfo(wd);
      return {
        vod_id: id,
        vod_name: wd,
        vod_pic: (USE_TMDB_IMAGE && tmdbInfo?.vod_pic) ? tmdbInfo.vod_pic : (mainVodInfo?.vodPic || panPic[driveKey] || ""),
        vod_remarks: `${driveTypeData.length}个资源`,
        vod_content: tmdbInfo?.vod_content || mainVodInfo?.vodContent || `搜索: ${wd}`,
        vod_actor: tmdbInfo?.vod_actor || mainVodInfo?.vodActor || "",
        vod_director: tmdbInfo?.vod_director || mainVodInfo?.vodDirector || "",
        vod_year: tmdbInfo?.vod_year || "",
        vod_play_from: playFromList.join('$$$'),
        vod_play_url: playUrlList.join('$$$'),
      };
    } catch (error) {
      log.info(`[详情] 处理 drive_ 详情失败: ${error.message}`);
      return {
        vod_id: id,
        vod_name: title || "未知",
        vod_pic: "",
        vod_remarks: "获取详情失败",
        vod_content: "",
        vod_play_from: "",
        vod_play_url: "",
      };
    }
  }
  if (id.startsWith('http')) {
    let vodData = {
      vod_id: id,
      vod_name: "网盘资源",
      vod_pic: "",
      vod_remarks: "点击播放",
      vod_content: id,
      vod_play_from: "网盘",
      vod_play_url: `播放$${id}`,
    };
    for (const driveKey of PAN_ORDER) {
      const drive = drives.find(d => d.key === driveKey);
      if (!drive || !drive.matchShare) continue;
      try {
        if (drive.matchShare(id)) {
          const episodeData = await getEpisodesFromDrive(id, driveKey, drives);
          if (episodeData) {
            vodData = {
              ...vodData,
              vod_pic: episodeData.vodPic || vodData.vod_pic,
              vod_content: episodeData.vodContent || vodData.vod_content,
              vod_actor: episodeData.vodActor || vodData.vod_actor,
              vod_director: episodeData.vodDirector || vodData.vod_director,
              vod_play_from: episodeData.playFrom,
              vod_play_url: episodeData.playUrl,
            };
            break;
          }
        }
      } catch (error) {}
    }
    return vodData;
  }
  if (id.startsWith('zjrl_')) {
    let searchTitle = title;
    if (!searchTitle) {
      const parts = id.split('_');
      if (parts.length >= 2) {
        try { searchTitle = decodeURIComponent(parts[1]); } catch { searchTitle = parts[1]; }
      }
    }
    if (!searchTitle) searchTitle = id;
    log.info(`[详情] 搜索剧集: ${searchTitle}`);
    const pansouRes = await getPansouWithCache(searchTitle);
    const panResults = pansouRes.data || {};
    const tasks = [];
    for (const panKey of PAN_ORDER) {
      const items = panResults[panKey];
      if (!items || items.length === 0) continue;
      const limitedItems = items.slice(0, MAX_LINES_PER_PAN);
      for (let i = 0; i < limitedItems.length; i++) {
        const item = limitedItems[i];
        tasks.push(async () => {
          const result = await getDriveParseWithCache(item.url, panKey, drives);
          return { result, panKey, index: i, item };
        });
      }
    }
    const results = await runWithConcurrency(tasks, CONCURRENCY_LIMIT);
    const playFromList = [];
    const playUrlList = [];
    let mainVodInfo = {};
    for (const panKey of PAN_ORDER) {
      const panTasks = results.filter(r => r.panKey === panKey).sort((a, b) => a.index - b.index);
      for (let i = 0; i < panTasks.length; i++) {
        const parseRes = panTasks[i];
        const episodeData = parseRes.result.data;
        if (episodeData && episodeData.playUrl) {
          const lineName = playFromList.length === 0 ? (panNames[panKey] || panKey) : `${panNames[panKey] || panKey}#${i + 1}`;
          playFromList.push(lineName);
          playUrlList.push(episodeData.playUrl);
          if (!mainVodInfo.vodPic) mainVodInfo = episodeData;
        }
      }
    }
    const tmdbInfo = await fetchTMDBInfo(searchTitle);
    if (playFromList.length > 0) {
      return {
        vod_id: id,
        vod_name: searchTitle,
        vod_pic: (USE_TMDB_IMAGE && tmdbInfo?.vod_pic) ? tmdbInfo.vod_pic : (mainVodInfo.vodPic || ""),
        vod_remarks: `${playFromList.length}个线路`,
        vod_content: tmdbInfo?.vod_content || mainVodInfo.vodContent || `搜索: ${searchTitle}`,
        vod_actor: tmdbInfo?.vod_actor || mainVodInfo.vodActor || "",
        vod_director: tmdbInfo?.vod_director || mainVodInfo.vodDirector || "",
        vod_year: tmdbInfo?.vod_year || "",
        vod_play_from: playFromList.join('$$$'),
        vod_play_url: playUrlList.join('$$$'),
      };
    } else {
      return {
        vod_id: id,
        vod_name: searchTitle,
        vod_pic: tmdbInfo?.vod_pic || "",
        vod_remarks: "未找到有效播放线路",
        vod_content: tmdbInfo?.vod_content || `搜索: ${searchTitle}\n未找到有效播放资源`,
        vod_play_from: "温馨提示",
        vod_play_url: "未找到有效播放资源$https://www.douban.com",
      };
    }
  }
  return {
    vod_id: id,
    vod_name: title || "未知",
    vod_pic: "",
    vod_remarks: "",
    vod_content: "",
    vod_play_from: "",
    vod_play_url: "",
  };
};

// ===================== 播放（返回播放地址） =====================
const _play = async ({ flag, id, drives }) => {
  log.info(`[播放] 处理播放请求, flag: ${flag}, id: ${id?.substring(0, 50)}`);
  let driveKey = flag;
  if (flag && flag.includes('#')) driveKey = flag.split('#')[0];
  const nameToKey = {
    '夸克网盘': 'quark', 'UC网盘': 'uc', '百度网盘': 'baidu', '阿里云盘': 'ali',
    'PikPak': 'pikpak', '迅雷网盘': 'xunlei', '123云盘': 'a123',
    '天翼网盘': 'a189', '移动云盘': 'a139', '115网盘': 'a115'
  };
  if (nameToKey[driveKey]) driveKey = nameToKey[driveKey];
  const drive = drives.find((o) => o.key === driveKey);
  let result = null;
  if (drive) {
    try {
      result = await drive.play(id, flag);
      log.info(`[播放] 驱动返回结果: ${JSON.stringify(result).substring(0, 100)}`);
    } catch (error) {
      log.info(`[播放] 驱动播放失败: ${error.message}`);
      return { error: `播放失败: ${error.message}` };
    }
  } else {
    for (const key of PAN_ORDER) {
      const d = drives.find(o => o.key === key);
      if (!d || !d.matchShare) continue;
      try {
        if (d.matchShare(id)) {
          result = await d.play(id, flag);
          break;
        }
      } catch (error) {}
    }
  }
  if (result && Array.isArray(result.url)) {
    const renameMap = { RAW: '原画', '4k': '4K高清', '2k': '2K高清', super: '超清', high: '标清', low: '流畅' };
    const order = ['4K高清', '2K高清', '超清', '标清', '流畅', '原画'];
    const orderIndex = new Map(order.map((k, i) => [k, i]));
    const pairs = [];
    for (let i = 0; i < result.url.length; i += 2) {
      const q0 = result.url[i];
      const u0 = result.url[i + 1];
      if (typeof q0 !== 'string' || typeof u0 !== 'string') continue;
      const q = renameMap[q0] || q0;
      pairs.push({ q, u: u0 });
    }
    const sorted = pairs
      .map((p, idx) => ({ ...p, _idx: idx, _ord: orderIndex.has(p.q) ? orderIndex.get(p.q) : 999 }))
      .sort((a, b) => (a._ord - b._ord) || (a._idx - b._idx));
    result.url = sorted.flatMap(p => [p.q, p.u]);
  }
  if (!result) {
    return { error: "未找到对应的网盘驱动", flag, id };
  }
  return result;
};

// ===================== 分类（返回卡片列表） =====================
const _category = async ({ id, page, filters }) => {
  const pg = parseInt(page) || 1;
  log.info(`[分类] ${id}, 页码: ${pg}, 筛选: ${JSON.stringify(filters)}`);
  let items = [];
  switch (id) {
    case "today": items = await getDayData(filters.type || 'juji', 'today'); break;
    case "tomorrow": items = await getDayData(filters.type || 'juji', 'tomorrow'); break;
    case "week":
      const weekday = filters.weekday || 'Monday';
      items = await getWeekData(filters.type || 'juji_week', weekday);
      break;
    case "rank": items = await getRankData(filters.type || '华语热门'); break;
    case "area": items = await getRankData(filters.type || '国产剧'); break;
  }
  if (!Array.isArray(items)) items = [];
  const totalItems = items.length;
  const pageSize = 20;
  const start = (pg - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  const list = pageItems.map((item, idx) => convertItem(item, start + idx, id)).filter(Boolean);
  const pagecount = Math.ceil(totalItems / pageSize) || 1;
  log.info(`[分类] 返回 ${list.length}/${totalItems} 条，页码 ${pg}/${pagecount}`);
  return { list, page: pg, pagecount, total: totalItems };
};

// ===================== 筛选配置 =====================
const filterConfig = {
  "today": [
    { key: "type", name: "类型", value: [
      { n: "剧集", v: "juji" }, { n: "番剧", v: "fanju" },
      { n: "国漫", v: "guoman" }, { n: "综艺", v: "zongyi" }
    ] }
  ],
  "tomorrow": [
    { key: "type", name: "类型", value: [
      { n: "剧集", v: "juji" }, { n: "番剧", v: "fanju" },
      { n: "国漫", v: "guoman" }, { n: "综艺", v: "zongyi" }
    ] }
  ],
  "week": [
    { key: "type", name: "类型", value: [
      { n: "剧集", v: "juji_week" }, { n: "番剧", v: "fanju_week" },
      { n: "国漫", v: "guoman_week" }, { n: "综艺", v: "zongyi_week" }
    ] },
    { key: "weekday", name: "周几", value: [
      { n: "周一", v: "Monday" }, { n: "周二", v: "Tuesday" },
      { n: "周三", v: "Wednesday" }, { n: "周四", v: "Thursday" },
      { n: "周五", v: "Friday" }, { n: "周六", v: "Saturday" },
      { n: "周日", v: "Sunday" }
    ] }
  ],
  "rank": [
    { key: "type", name: "榜单", value: [
      { n: "华语热门", v: "华语热门" }, { n: "今日推荐", v: "今日推荐" },
      { n: "现正热播", v: "现正热播" }, { n: "新剧雷达", v: "新剧雷达" },
      { n: "已收官好剧", v: "已收官好剧" }, { n: "人气 Top 10", v: "人气 Top 10" },
      { n: "热门国漫", v: "热门国漫" }, { n: "本季新番", v: "本季新番" }
    ] }
  ],
  "area": [
    { key: "type", name: "地区", value: [
      { n: "国产剧", v: "国产剧" }, { n: "韩剧", v: "韩剧" },
      { n: "日剧", v: "日剧" }, { n: "番剧", v: "番剧" },
      { n: "英美剧", v: "英美剧" }
    ] }
  ]
};

// ===================== XPTV 接口函数 =====================
// 获取源基本信息
async function getLocalInfo() {
  return {
    ver: 1,
    name: "📅 追剧优选【盘搜】",
    api: "zjrl_pansou_xptv"
  };
}

// 获取配置（首页分类及筛选器）
async function getConfig() {
  const tabs = [
    { name: "🔥 热门榜单", ext: { id: "rank" } },
    { name: "📺 今日播出", ext: { id: "today" } },
    { name: "📅 明日播出", ext: { id: "tomorrow" } },
    { name: "📆 播出周历", ext: { id: "week" } },
    { name: "🌏 地区榜单", ext: { id: "area" } }
  ];
  // 返回整体筛选配置（可选，如果每个tab筛选不同，也可以在getCards中动态返回）
  // 这里返回一个全局的，实际XPTV会根据ext.id匹配
  return { tabs, filter: filterConfig };
}

// 获取卡片列表（分类、搜索共用）
async function getCards(ext) {
  ext = ext || {};
  const { id, page = 1, filters = {}, wd } = ext;
  if (wd) {
    // 搜索请求
    const drives = global.$drives || []; // 尝试从全局获取驱动
    const result = await _search(wd, page, drives);
    return { list: result.list, page: result.page, pagecount: result.pagecount, total: result.total };
  } else {
    // 分类请求
    const result = await _category({ id, page, filters });
    // 返回卡片列表，同时可附带该分类的筛选器（如果需要在当前分类展示筛选）
    // 这里根据id返回对应的filter
    const filter = filterConfig[id] || [];
    return { list: result.list, filter, page: result.page, pagecount: result.pagecount, total: result.total };
  }
}

// 获取播放列表（详情页）
async function getTracks(ext) {
  ext = ext || {};
  const { id, title } = ext;
  if (!id) return { list: [] };
  const drives = global.$drives || [];
  const detail = await _detail(id, title, drives);
  if (!detail || !detail.vod_play_from) {
    return { list: [] };
  }
  const playFromList = detail.vod_play_from.split('$$$');
  const playUrlList = detail.vod_play_url.split('$$$');
  const groups = [];
  for (let i = 0; i < playFromList.length; i++) {
    const from = playFromList[i];
    const urlStr = playUrlList[i];
    const episodes = urlStr.split('#').map(ep => {
      const [name, link] = ep.split('$');
      return { name, link };
    }).filter(ep => ep.link);
    const tracks = episodes.map((ep, idx) => ({
      name: ep.name || `第${idx+1}集`,
      pan: from.split('#')[0], // 提取网盘名称
      ext: { url: ep.link, flag: from } // 保留flag以便播放时使用
    }));
    groups.push({ title: from, tracks });
  }
  return { list: groups };
}

// 获取播放地址
async function getPlayinfo(ext) {
  ext = ext || {};
  const { url, flag } = ext;
  if (!url) return { urls: [] };
  const drives = global.$drives || [];
  const playResult = await _play({ flag, id: url, drives });
  if (playResult.error) {
    return { urls: [] };
  }
  // playResult 结构示例：{ url: ['4k', 'http://...', '高清', 'http://...'], headers: {} }
  return {
    urls: playResult.url || [],
    headers: playResult.headers || {}
  };
}

// 搜索入口（XPTV会调用getCards传入wd，所以这里可以简单调用getCards）
async function search(ext) {
  return getCards(ext);
}

// 导出函数（XPTV通过识别全局函数调用）
// 注意：XPTV要求这些函数在全局作用域定义，因此不需要module.exports

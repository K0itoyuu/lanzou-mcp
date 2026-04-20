import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const LOGIN_PAGE_URL = "https://pc.woozooo.com/account.php?action=login&ref=/mydisk.php";
const LOGIN_POST_URL = "https://pc.woozooo.com/account.php";
const LANZOU_ORIGIN = "https://pc.woozooo.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

const ACW_PERMUTATION = [
  0xf, 0x23, 0x1d, 0x18, 0x21, 0x10, 0x1, 0x26, 0xa, 0x9, 0x13, 0x1f, 0x28, 0x1b, 0x16, 0x17, 0x19, 0xd, 0x6, 0xb, 0x27,
  0x12, 0x14, 0x8, 0xe, 0x15, 0x20, 0x1a, 0x2, 0x1e, 0x7, 0x4, 0x11, 0x5, 0x3, 0x1c, 0x22, 0x25, 0xc, 0x24
];
const ACW_KEY = "3000176000856006061501533003690027800375";

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const setCookie = headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

function mergeSetCookiesToMap(setCookieHeaders, cookieMap) {
  for (const header of setCookieHeaders) {
    const firstPart = header.split(";")[0]?.trim();
    if (!firstPart) continue;

    const separatorIndex = firstPart.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = firstPart.slice(0, separatorIndex).trim();
    const value = firstPart.slice(separatorIndex + 1).trim();
    if (key) cookieMap.set(key, value);
  }
}

function buildCookieHeader(cookieMap) {
  return [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function parseCookieHeader(cookieHeader) {
  const cookieMap = new Map();
  if (!cookieHeader) return cookieMap;

  for (const cookieItem of cookieHeader.split(";")) {
    const trimmed = cookieItem.trim();
    if (!trimmed) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) cookieMap.set(key, value);
  }

  return cookieMap;
}

function extractFormhash(html) {
  const match = html.match(/name=["']formhash["']\s+value=["']([^"']+)["']/i);
  return match?.[1] ?? "";
}

function extractArg1(html) {
  const match = html.match(/var\s+arg1\s*=\s*['"]([0-9A-Fa-f]+)['"]/);
  return match?.[1] ?? "";
}

function computeAcwScV2(arg1) {
  if (!arg1 || arg1.length % 2 !== 0) return "";

  const reordered = [];
  for (let i = 0; i < arg1.length; i += 1) {
    for (let j = 0; j < ACW_PERMUTATION.length; j += 1) {
      if (ACW_PERMUTATION[j] === i + 1) {
        reordered[j] = arg1[i];
        break;
      }
    }
  }

  const permuted = reordered.join("");
  let result = "";

  for (let i = 0; i < permuted.length && i < ACW_KEY.length; i += 2) {
    const left = Number.parseInt(permuted.slice(i, i + 2), 16);
    const right = Number.parseInt(ACW_KEY.slice(i, i + 2), 16);
    const xorValue = left ^ right;
    result += xorValue.toString(16).padStart(2, "0");
  }

  return result;
}

async function prepareLoginContext() {
  const cookieMap = new Map();

  const firstResponse = await fetch(LOGIN_PAGE_URL, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!firstResponse.ok) {
    throw new Error(`加载登录页失败: HTTP ${firstResponse.status}`);
  }

  mergeSetCookiesToMap(getSetCookies(firstResponse.headers), cookieMap);
  const firstHtml = await firstResponse.text();
  let formhash = extractFormhash(firstHtml);
  const firstArg1 = extractArg1(firstHtml);

  if (firstArg1) {
    const acwScV2 = computeAcwScV2(firstArg1);
    if (acwScV2) {
      cookieMap.set("acw_sc__v2", acwScV2);
    }
  }

  if (!formhash) {
    const secondResponse = await fetch(LOGIN_PAGE_URL, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: buildCookieHeader(cookieMap)
      }
    });

    if (!secondResponse.ok) {
      throw new Error(`二次加载登录页失败: HTTP ${secondResponse.status}`);
    }

    mergeSetCookiesToMap(getSetCookies(secondResponse.headers), cookieMap);
    const secondHtml = await secondResponse.text();
    formhash = extractFormhash(secondHtml);
  }

  if (!formhash) {
    throw new Error("登录页未提取到 formhash，无法继续登录。");
  }

  return {
    cookieMap,
    formhash
  };
}

async function loginLanzou(username, password) {
  const { cookieMap, formhash } = await prepareLoginContext();

  const body = new URLSearchParams({
    action: "login",
    task: "login",
    ref: "/mydisk.php",
    setSessionId: "",
    setToken: "",
    setSig: "",
    setScene: "",
    formhash,
    username,
    password
  });

  const response = await fetch(LOGIN_POST_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Origin: LANZOU_ORIGIN,
      Referer: LOGIN_PAGE_URL,
      DNT: "1",
      "Upgrade-Insecure-Requests": "1",
      Cookie: buildCookieHeader(cookieMap)
    },
    body
  });

  const setCookies = getSetCookies(response.headers);
  mergeSetCookiesToMap(setCookies, cookieMap);
  const isLoginSuccess = setCookies.length > 0;
  const location = response.headers.get("location") ?? "";
  const mergedCookieHeader = buildCookieHeader(cookieMap);

  return {
    isLoginSuccess,
    status: response.status,
    location,
    setCookieCount: setCookies.length,
    setCookies,
    cookieHeader: mergedCookieHeader
  };
}

async function getMydiskContent(uid, cookieHeader, requestBody) {
  const encodedUid = encodeURIComponent(String(uid));
  const requestUrl = `${LANZOU_ORIGIN}/doupload.php?uid=${encodedUid}`;

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: LANZOU_ORIGIN,
      Referer: `${LANZOU_ORIGIN}/mydisk.php?item=files&action=index&u=${encodedUid}`,
      Cookie: buildCookieHeader(parseCookieHeader(cookieHeader))
    },
    body: requestBody
  });

  const responseText = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const setCookies = getSetCookies(response.headers);
  let responseJson = null;

  try {
    responseJson = JSON.parse(responseText);
  } catch {
    responseJson = null;
  }

  const rawFiles = Array.isArray(responseJson?.text) ? responseJson.text : [];
  const files = rawFiles.map((item) => {
    const onofRaw = String(item?.onof ?? "");
    const onof = onofRaw === "1" ? true : onofRaw === "0" ? false : null;
    const parsedDowns = Number.parseInt(String(item?.downs ?? "0"), 10);

    return {
      icon: String(item?.icon ?? ""),
      id: String(item?.id ?? ""),
      name: String(item?.name_all ?? item?.name ?? ""),
      time: String(item?.time ?? ""),
      onof,
      onofRaw,
      size: String(item?.size ?? ""),
      downs: Number.isFinite(parsedDowns) ? parsedDowns : 0
    };
  });

  const parsedZt = Number.parseInt(String(responseJson?.zt ?? ""), 10);
  const parsedInfo = Number.parseInt(String(responseJson?.info ?? ""), 10);
  const parseSuccess = responseJson !== null;

  return {
    status: response.status,
    ok: response.ok,
    contentType,
    requestUrl,
    requestBody,
    setCookieCount: setCookies.length,
    setCookies,
    parseSuccess,
    zt: Number.isFinite(parsedZt) ? parsedZt : null,
    info: Number.isFinite(parsedInfo) ? parsedInfo : null,
    totalFiles: files.length,
    files,
    rawResponseText: parseSuccess ? undefined : responseText
  };
}

function buildLanzouDownloadUrl(host, fileId) {
  const normalizedHost = String(host ?? "").trim().replace(/\/+$/g, "");
  const normalizedFileId = String(fileId ?? "").trim().replace(/^\/+/g, "");
  if (!normalizedHost || !normalizedFileId) return null;
  return `${normalizedHost}/${normalizedFileId}`;
}

function buildSharePageHeaders(referer, cookieHeader) {
  const headers = {
    "User-Agent": USER_AGENT,
    DNT: "1",
    "Upgrade-Insecure-Requests": "1",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6"
  };

  if (referer) {
    headers.Referer = referer;
  }

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  return headers;
}

function buildAjaxHeaders(origin, referer, cookieHeader) {
  const headers = {
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": USER_AGENT,
    DNT: "1",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Origin: origin,
    Referer: referer,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6"
  };

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  return headers;
}

async function fetchLanzouHtmlWithAcw(url, cookieMap, referer) {
  const requestUrl = String(url);

  const doGet = async () => {
    const cookieHeader = buildCookieHeader(cookieMap);
    return fetch(requestUrl, {
      method: "GET",
      headers: buildSharePageHeaders(referer, cookieHeader)
    });
  };

  let response = await doGet();
  mergeSetCookiesToMap(getSetCookies(response.headers), cookieMap);
  let html = await response.text();

  if (!response.ok) {
    throw new Error(`请求页面失败: ${requestUrl} HTTP ${response.status}`);
  }

  const arg1 = extractArg1(html);
  const currentAcwScV2 = cookieMap.get("acw_sc__v2") ?? "";
  const computedAcwScV2 = computeAcwScV2(arg1);

  if (computedAcwScV2 && computedAcwScV2 !== currentAcwScV2) {
    cookieMap.set("acw_sc__v2", computedAcwScV2);
    response = await doGet();
    mergeSetCookiesToMap(getSetCookies(response.headers), cookieMap);
    html = await response.text();

    if (!response.ok) {
      throw new Error(`二次请求页面失败: ${requestUrl} HTTP ${response.status}`);
    }
  }

  return {
    html,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    setCookies: getSetCookies(response.headers)
  };
}

function extractIframeFnPath(html) {
  const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']*\/fn\?[^"']+)["']/i);
  return iframeMatch?.[1] ? String(iframeMatch[1]).trim() : null;
}

function extractAjaxmPath(html) {
  const matches = [...html.matchAll(/url\s*:\s*['"]([^'"]*\/ajaxm\.php\?file=[^'"]+)['"]/gi)];
  if (matches.length === 0) return null;
  const lastMatch = matches[matches.length - 1]?.[1];
  return lastMatch ? String(lastMatch).trim() : null;
}

function stripBlockComments(text) {
  return String(text ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractSharePasswordAjaxConfig(html) {
  const scriptMatches = [...String(html ?? "").matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];

  for (const scriptMatch of scriptMatches) {
    const scriptContent = stripBlockComments(scriptMatch?.[1] ?? "");
    if (!scriptContent) continue;

    const ajaxMatches = [
      ...scriptContent.matchAll(
        /url\s*:\s*['"]([^'"]*\/ajaxm\.php\?file=[^'"]+)['"][\s\S]{0,1800}?data\s*:\s*\{([\s\S]{0,800}?)\}/gi
      )
    ];

    for (const ajaxMatch of ajaxMatches) {
      const ajaxmPath = ajaxMatch?.[1] ? String(ajaxMatch[1]).trim() : "";
      const dataBlock = ajaxMatch?.[2] ? String(ajaxMatch[2]) : "";
      const actionMatch = dataBlock.match(/['"]action['"]\s*:\s*['"]([^'"]+)['"]/i);
      const signMatch = dataBlock.match(/['"]sign['"]\s*:\s*['"]([^'"]+)['"]/i);

      const action = actionMatch?.[1] ? String(actionMatch[1]).trim().toLowerCase() : "";
      const sign = signMatch?.[1] ? String(signMatch[1]).trim() : "";
      if (action !== "downprocess" || !sign || !ajaxmPath) continue;

      const kdMatch = dataBlock.match(/['"]kd['"]\s*:\s*['"]?(\d+)['"]?/i);
      const kdLiteral = kdMatch?.[1] ? Number.parseInt(String(kdMatch[1]), 10) : null;
      const scriptKdns = extractJsNumberVar(scriptContent, "kdns");
      const kdns = Number.isFinite(kdLiteral) ? kdLiteral : scriptKdns ?? 1;

      return {
        ajaxmPath,
        sign,
        kdns: Number.isFinite(kdns) ? kdns : 1
      };
    }
  }

  return null;
}

function extractJsStringVar(html, varName) {
  const safeName = String(varName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexp = new RegExp(`var\\s+${safeName}\\s*=\\s*['"]([^'"]*)['"]`, "i");
  const match = html.match(regexp);
  return match?.[1] == null ? null : String(match[1]);
}

function extractJsNumberVar(html, varName) {
  const safeName = String(varName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexp = new RegExp(`var\\s+${safeName}\\s*=\\s*['"]?(\\d+)['"]?`, "i");
  const match = html.match(regexp);
  if (!match?.[1]) return null;
  const value = Number.parseInt(String(match[1]), 10);
  return Number.isFinite(value) ? value : null;
}

function buildAbsoluteUrl(baseUrl, pathOrUrl) {
  if (!pathOrUrl) return null;
  try {
    return new URL(String(pathOrUrl), String(baseUrl)).toString();
  } catch {
    return null;
  }
}

function buildDirectDownloadUrl(dom, filePath, suffix = "") {
  const normalizedDom = String(dom ?? "").trim().replace(/\/+$/g, "");
  const normalizedFilePath = String(filePath ?? "").trim().replace(/^\/+/g, "");
  if (!normalizedDom || !normalizedFilePath) return null;
  return `${normalizedDom}/file/${normalizedFilePath}${suffix}`;
}

async function getFileLink(fileId, cookieHeader, uid) {
  const requestUrl = `${LANZOU_ORIGIN}/doupload.php`;
  const encodedUid = uid ? encodeURIComponent(String(uid)) : "";
  const referer = encodedUid
    ? `${LANZOU_ORIGIN}/mydisk.php?item=files&action=index&u=${encodedUid}`
    : `${LANZOU_ORIGIN}/mydisk.php?item=files&action=index`;
  const bodyParams = new URLSearchParams({
    task: "22",
    file_id: String(fileId)
  });
  const requestBody = bodyParams.toString();

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: LANZOU_ORIGIN,
      Referer: referer,
      Cookie: buildCookieHeader(parseCookieHeader(cookieHeader))
    },
    body: requestBody
  });

  const responseText = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const setCookies = getSetCookies(response.headers);

  let responseJson = null;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    responseJson = null;
  }

  const parseSuccess = responseJson !== null;
  const parsedZt = Number.parseInt(String(responseJson?.zt ?? ""), 10);
  const infoValue = responseJson?.info;
  const infoObject =
    infoValue && typeof infoValue === "object" && !Array.isArray(infoValue) ? infoValue : null;
  const infoMessage = infoObject ? null : infoValue == null ? null : String(infoValue);

  const onofRaw = String(infoObject?.onof ?? "");
  const onof = onofRaw === "1" ? true : onofRaw === "0" ? false : null;
  const pwd = infoObject?.pwd == null ? null : String(infoObject.pwd);
  const fId = infoObject?.f_id == null ? null : String(infoObject.f_id);
  const isNewd = infoObject?.is_newd == null ? null : String(infoObject.is_newd);
  const taoc = infoObject?.taoc == null ? null : String(infoObject.taoc);
  const downloadUrl = buildLanzouDownloadUrl(isNewd, fId);

  return {
    status: response.status,
    ok: response.ok,
    contentType,
    requestUrl,
    requestBody,
    setCookieCount: setCookies.length,
    setCookies,
    parseSuccess,
    zt: Number.isFinite(parsedZt) ? parsedZt : null,
    pwd,
    onof,
    onofRaw,
    fId,
    isNewd,
    taoc,
    downloadUrl,
    infoMessage,
    rawResponseText: parseSuccess ? undefined : responseText
  };
}

async function getDirectLink(shareUrl, cookieHeader, password = "") {
  const normalizedShareUrl = String(shareUrl ?? "").trim();
  let shareUrlObject;

  try {
    shareUrlObject = new URL(normalizedShareUrl);
  } catch {
    throw new Error("shareUrl 不是合法 URL。");
  }

  const shareOrigin = shareUrlObject.origin;
  const cookieMap = parseCookieHeader(cookieHeader);

  const sharePageResult = await fetchLanzouHtmlWithAcw(normalizedShareUrl, cookieMap, normalizedShareUrl);
  const shareHtml = sharePageResult.html;
  const sharePageDown1 = extractJsStringVar(shareHtml, "down_1") ?? "";
  const sharePageDown2 = extractJsStringVar(shareHtml, "down_2") ?? "";
  const sharePageDown3 = extractJsStringVar(shareHtml, "down_3") ?? "";
  const passwordAjaxConfig = extractSharePasswordAjaxConfig(shareHtml);
  const fnPath = extractIframeFnPath(shareHtml);
  const fnUrl = buildAbsoluteUrl(normalizedShareUrl, fnPath);

  if (!fnPath || !fnUrl) {
    if (!passwordAjaxConfig) {
      throw new Error("分享页中未提取到 /fn?... 或可用的 ajaxm/sign。");
    }

    const sharePassword = String(password ?? "").trim();
    if (!sharePassword) {
      throw new Error("该分享页需要提取码，请传入 password。");
    }

    const ajaxmPath = passwordAjaxConfig.ajaxmPath;
    const ajaxmUrl = buildAbsoluteUrl(shareOrigin, ajaxmPath);
    const sign = passwordAjaxConfig.sign;
    const kdns = passwordAjaxConfig.kdns ?? 1;

    if (!ajaxmUrl) {
      throw new Error("分享页中提取到 ajaxmPath，但拼接 URL 失败。");
    }

    const requestBody = new URLSearchParams({
      action: "downprocess",
      sign,
      kd: String(kdns),
      p: sharePassword
    }).toString();

    const ajaxResponse = await fetch(ajaxmUrl, {
      method: "POST",
      headers: buildAjaxHeaders(shareOrigin, normalizedShareUrl, buildCookieHeader(cookieMap)),
      body: requestBody
    });

    mergeSetCookiesToMap(getSetCookies(ajaxResponse.headers), cookieMap);
    const ajaxResponseText = await ajaxResponse.text();
    const contentType = ajaxResponse.headers.get("content-type") ?? "";

    let ajaxJson = null;
    try {
      ajaxJson = JSON.parse(ajaxResponseText);
    } catch {
      ajaxJson = null;
    }

    const parseSuccess = ajaxJson !== null;
    const parsedZt = Number.parseInt(String(ajaxJson?.zt ?? ""), 10);
    const dom = ajaxJson?.dom == null ? null : String(ajaxJson.dom);
    const url = ajaxJson?.url == null ? null : String(ajaxJson.url);
    const info = ajaxJson?.inf == null ? null : String(ajaxJson.inf);
    const directUrl = buildDirectDownloadUrl(dom, url);
    const telecomDownloadUrl = buildDirectDownloadUrl(dom, url, sharePageDown1);
    const unicomDownloadUrl = buildDirectDownloadUrl(dom, url, sharePageDown2);
    const normalDownloadUrl = buildDirectDownloadUrl(dom, url, sharePageDown3);

    return {
      mode: "share_password",
      status: ajaxResponse.status,
      ok: ajaxResponse.ok,
      contentType,
      shareUrl: normalizedShareUrl,
      fnPath: "",
      fnUrl: "",
      ajaxmPath,
      ajaxmUrl,
      requestBody,
      cookieHeader: buildCookieHeader(cookieMap),
      parseSuccess,
      zt: Number.isFinite(parsedZt) ? parsedZt : null,
      info,
      wpSign: "",
      ajaxdata: "",
      downprocessSign: sign,
      kdns,
      dom,
      url,
      directUrl,
      telecomDownloadUrl,
      unicomDownloadUrl,
      normalDownloadUrl,
      rawResponseText: parseSuccess ? undefined : ajaxResponseText
    };
  }

  const fnPageResult = await fetchLanzouHtmlWithAcw(fnUrl, cookieMap, normalizedShareUrl);
  const fnHtml = fnPageResult.html;

  const ajaxmPath = extractAjaxmPath(fnHtml);
  const ajaxmUrl = buildAbsoluteUrl(shareOrigin, ajaxmPath);
  const wpSign = extractJsStringVar(fnHtml, "wp_sign");
  const ajaxdata = extractJsStringVar(fnHtml, "ajaxdata");
  const kdns = extractJsNumberVar(fnHtml, "kdns") ?? 1;
  const down1 = extractJsStringVar(fnHtml, "down_1") ?? "";
  const down2 = extractJsStringVar(fnHtml, "down_2") ?? "";
  const down3 = extractJsStringVar(fnHtml, "down_3") ?? "";

  if (!ajaxmPath || !ajaxmUrl) {
    throw new Error("fn 页面中未提取到 ajaxm.php?file=... 地址。");
  }

  if (!wpSign) {
    throw new Error("fn 页面中未提取到 wp_sign。");
  }

  if (!ajaxdata) {
    throw new Error("fn 页面中未提取到 ajaxdata。");
  }

  const requestBody = new URLSearchParams({
    action: "downprocess",
    websignkey: ajaxdata,
    signs: ajaxdata,
    sign: wpSign,
    websign: "",
    kd: String(kdns),
    ves: "1"
  }).toString();

  const ajaxResponse = await fetch(ajaxmUrl, {
    method: "POST",
    headers: buildAjaxHeaders(shareOrigin, fnUrl, buildCookieHeader(cookieMap)),
    body: requestBody
  });

  mergeSetCookiesToMap(getSetCookies(ajaxResponse.headers), cookieMap);
  const ajaxResponseText = await ajaxResponse.text();
  const contentType = ajaxResponse.headers.get("content-type") ?? "";
  let ajaxJson = null;

  try {
    ajaxJson = JSON.parse(ajaxResponseText);
  } catch {
    ajaxJson = null;
  }

  const parseSuccess = ajaxJson !== null;
  const parsedZt = Number.parseInt(String(ajaxJson?.zt ?? ""), 10);
  const dom = ajaxJson?.dom == null ? null : String(ajaxJson.dom);
  const url = ajaxJson?.url == null ? null : String(ajaxJson.url);
  const info = ajaxJson?.inf == null ? null : String(ajaxJson.inf);
  const directUrl = buildDirectDownloadUrl(dom, url);
  const telecomDownloadUrl = buildDirectDownloadUrl(dom, url, down1);
  const unicomDownloadUrl = buildDirectDownloadUrl(dom, url, down2);
  const normalDownloadUrl = buildDirectDownloadUrl(dom, url, down3);

  return {
    mode: "fn",
    status: ajaxResponse.status,
    ok: ajaxResponse.ok,
    contentType,
    shareUrl: normalizedShareUrl,
    fnPath,
    fnUrl,
    ajaxmPath,
    ajaxmUrl,
    requestBody,
    cookieHeader: buildCookieHeader(cookieMap),
    parseSuccess,
    zt: Number.isFinite(parsedZt) ? parsedZt : null,
    info,
    wpSign,
    ajaxdata,
    downprocessSign: wpSign,
    kdns,
    dom,
    url,
    directUrl,
    telecomDownloadUrl,
    unicomDownloadUrl,
    normalDownloadUrl,
    rawResponseText: parseSuccess ? undefined : ajaxResponseText
  };
}

const server = new McpServer({
  name: "lanzou-mcp",
  version: "0.1.0"
});

server.registerTool(
  "lanzou_login",
  {
    title: "蓝奏云登录",
    description: "调用蓝奏云登录接口，并按响应头中是否存在 Set-Cookie 判断登录成功。",
    inputSchema: {
      username: z.string().min(1, "username 不能为空"),
      password: z.string().min(1, "password 不能为空")
    }
  },
  async ({ username, password }) => {
    const result = await loginLanzou(username, password);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      structuredContent: result
    };
  }
);

server.registerTool(
  "lanzou_get_mydisk_content",
  {
    title: "蓝奏云网盘内容",
    description: "调用 doupload.php?uid=... 接口，默认以 task=5 获取网盘内容。",
    inputSchema: {
      uid: z.union([z.string().min(1, "uid 不能为空"), z.number()]),
      cookieHeader: z.string().min(1, "cookieHeader 不能为空"),
      requestBody: z.string().default("task=5")
    },
    outputSchema: {
      status: z.number().int(),
      ok: z.boolean(),
      contentType: z.string(),
      requestUrl: z.string(),
      requestBody: z.string(),
      setCookieCount: z.number().int().nonnegative(),
      setCookies: z.array(z.string()),
      parseSuccess: z.boolean(),
      zt: z.number().int().nullable(),
      info: z.number().int().nullable(),
      totalFiles: z.number().int().nonnegative(),
      files: z.array(
        z.object({
          icon: z.string().describe("文件类型"),
          id: z.string().describe("文件ID"),
          name: z.string().describe("文件名称"),
          time: z.string().describe("文件上传日期"),
          onof: z.boolean().nullable().describe("其他人获取该文件是否需要密码"),
          onofRaw: z.string().describe("原始 onof 值"),
          size: z.string().describe("文件大小"),
          downs: z.number().int().nonnegative().describe("下载数量")
        })
      ),
      rawResponseText: z.string().optional()
    }
  },
  async ({ uid, cookieHeader, requestBody }) => {
    const result = await getMydiskContent(uid, cookieHeader, requestBody);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      structuredContent: result
    };
  }
);

server.registerTool(
  "lanzou_get_file_link",
  {
    title: "蓝奏云文件链接",
    description: "调用 doupload.php task=22，按 file_id 获取文件下载信息与下载链接。",
    inputSchema: {
      fileId: z.union([z.string().min(1, "fileId 不能为空"), z.number()]),
      cookieHeader: z.string().min(1, "cookieHeader 不能为空"),
      uid: z.union([z.string().min(1), z.number()]).optional()
    },
    outputSchema: {
      status: z.number().int(),
      ok: z.boolean(),
      contentType: z.string(),
      requestUrl: z.string(),
      requestBody: z.string(),
      setCookieCount: z.number().int().nonnegative(),
      setCookies: z.array(z.string()),
      parseSuccess: z.boolean(),
      zt: z.number().int().nullable(),
      pwd: z.string().nullable().describe("提取码"),
      onof: z.boolean().nullable().describe("是否需要密码"),
      onofRaw: z.string().describe("原始 onof 值"),
      fId: z.string().nullable().describe("下载路径 ID"),
      isNewd: z.string().nullable().describe("下载域名"),
      taoc: z.string().nullable(),
      downloadUrl: z.string().nullable().describe("拼接后的下载链接"),
      infoMessage: z.string().nullable().describe("当响应 info 不是对象时的原始信息"),
      rawResponseText: z.string().optional()
    }
  },
  async ({ fileId, cookieHeader, uid }) => {
    const result = await getFileLink(fileId, cookieHeader, uid);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      structuredContent: result
    };
  }
);

server.registerTool(
  "lanzou_get_direct_link",
  {
    title: "蓝奏云直链获取",
    description:
      "支持无密码与带密码分享页；自动提取 /fn 或分享页脚本中的 ajaxm/sign，并请求 downprocess 获取直链。",
    inputSchema: {
      shareUrl: z.string().url("shareUrl 必须是合法 URL"),
      cookieHeader: z.string().optional().default(""),
      password: z.string().optional().default("")
    },
    outputSchema: {
      mode: z.enum(["fn", "share_password"]),
      status: z.number().int(),
      ok: z.boolean(),
      contentType: z.string(),
      shareUrl: z.string(),
      fnPath: z.string(),
      fnUrl: z.string(),
      ajaxmPath: z.string(),
      ajaxmUrl: z.string(),
      requestBody: z.string(),
      cookieHeader: z.string(),
      parseSuccess: z.boolean(),
      zt: z.number().int().nullable(),
      info: z.string().nullable(),
      wpSign: z.string(),
      ajaxdata: z.string(),
      downprocessSign: z.string(),
      kdns: z.number().int().nonnegative(),
      dom: z.string().nullable(),
      url: z.string().nullable(),
      directUrl: z.string().nullable().describe("dom + /file/ + url"),
      telecomDownloadUrl: z.string().nullable().describe("电信下载链接"),
      unicomDownloadUrl: z.string().nullable().describe("联通下载链接"),
      normalDownloadUrl: z.string().nullable().describe("普通下载链接（通常带 toolsdown）"),
      rawResponseText: z.string().optional()
    }
  },
  async ({ shareUrl, cookieHeader, password }) => {
    const result = await getDirectLink(shareUrl, cookieHeader, password);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      structuredContent: result
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

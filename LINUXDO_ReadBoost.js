// ==UserScript==
// @name         Discourse Read Boost
// @namespace    discourse-read-boost
// @version      1.4
// @author       Do
// @description  自动化刷取 Discourse 论坛已读帖量，温和、可配置，支持多个 Discourse 论坛
// @license      GPL-3.0
// @icon         https://www.google.com/s2/favicons?domain=linux.do
// @match        https://linux.do/t/*
// @match        https://nodeloc.com/t/*
// @match        https://idcflare.com/t/*
// @match        https://www.nodeloc.com/t/*
// @match        https://meta.discourse.org/t/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/VKKKV/discourse-read-boost/main/LINUXDO_ReadBoost.js
// @downloadURL  https://raw.githubusercontent.com/VKKKV/discourse-read-boost/main/LINUXDO_ReadBoost.js
// ==/UserScript==

(function () {
    'use strict'

    const SCRIPT_NAME = 'Discourse Read Boost'

    // ── 风险确认（仅首次） ──────────────────────────────────────────────
    const hasAgreed = GM_getValue('hasAgreed', false)
    if (!hasAgreed) {
        const msg = [
            `[ ${SCRIPT_NAME} ]`,
            '检测到这是你第一次使用，使用前你必须知晓：',
            '使用该第三方脚本可能会导致包括但不限于账号被限制、被封禁的潜在风险。',
            '脚本不对出现的任何风险负责，这是一个开源脚本，你可以自由审核其中的内容。',
            '如果你同意以上内容，请输入"明白"'
        ].join('\n')
        const userInput = prompt(msg)
        if (userInput !== '明白') {
            alert('您未同意风险提示，脚本已停止运行。')
            throw new Error('未同意风险提示')
        }
        GM_setValue('hasAgreed', true)
    }

    // ── DOM 就绪等待 ────────────────────────────────────────────────────
    const ready = (() => {
        if (document.readyState === 'loading') {
            return new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
        }
        return Promise.resolve()
    })()

    // ── 配置 ────────────────────────────────────────────────────────────
    const BASE_URL = window.location.origin

    const DEFAULT_CONFIG = Object.freeze({
        baseDelay: 2000,
        randomDelayRange: 300,
        minReqSize: 8,
        maxReqSize: 20,
        minReadTime: 800,
        maxReadTime: 3000,
        autoStart: false
    })

    const CONFIG_META = [
        { key: 'baseDelay', label: '基础延迟(ms)', min: 100, max: 30000 },
        { key: 'randomDelayRange', label: '随机延迟范围(ms)', min: 0, max: 10000 },
        { key: 'minReqSize', label: '最小每次请求阅读量', min: 1, max: 100 },
        { key: 'maxReqSize', label: '最大每次请求阅读量', min: 1, max: 200 },
        { key: 'minReadTime', label: '最小阅读时间(ms)', min: 100, max: 60000 },
        { key: 'maxReadTime', label: '最大阅读时间(ms)', min: 100, max: 60000 }
    ]

    let config = loadConfig()
    let isRunning = false
    let abortFlag = false
    let currentTopicId = null
    let currentTotalReplies = 0

    // ── 存储 ────────────────────────────────────────────────────────────
    function loadConfig() {
        const stored = {}
        CONFIG_META.forEach(({ key, min, max }) => {
            const val = GM_getValue(key, DEFAULT_CONFIG[key])
            stored[key] = clampInt(val, DEFAULT_CONFIG[key], min, max)
        })
        stored.autoStart = toBoolean(GM_getValue('autoStart', DEFAULT_CONFIG.autoStart), DEFAULT_CONFIG.autoStart)
        return normalizeConfig({ ...DEFAULT_CONFIG, ...stored })
    }

    function saveConfig(cfg) {
        const normalized = normalizeConfig(cfg)
        CONFIG_META.forEach(({ key }) => GM_setValue(key, normalized[key]))
        GM_setValue('autoStart', normalized.autoStart)
        return normalized
    }

    function resetConfig() {
        CONFIG_META.forEach(({ key }) => GM_setValue(key, DEFAULT_CONFIG[key]))
        GM_setValue('autoStart', DEFAULT_CONFIG.autoStart)
    }

    function clampInt(val, fallback, min, max) {
        const n = parseInt(val, 10)
        if (isNaN(n)) return fallback
        return Math.max(min, Math.min(max, n))
    }

    function normalizeConfig(cfg) {
        const normalized = { ...DEFAULT_CONFIG }
        CONFIG_META.forEach(({ key, min, max }) => {
            normalized[key] = clampInt(cfg[key], DEFAULT_CONFIG[key], min, max)
        })
        if (normalized.minReqSize > normalized.maxReqSize) {
            normalized.maxReqSize = normalized.minReqSize
        }
        if (normalized.minReadTime > normalized.maxReadTime) {
            normalized.maxReadTime = normalized.minReadTime
        }
        normalized.autoStart = toBoolean(cfg.autoStart, DEFAULT_CONFIG.autoStart)
        return normalized
    }

    function toBoolean(val, fallback = false) {
        if (typeof val === 'boolean') return val
        if (typeof val === 'number') return val !== 0
        if (typeof val === 'string') {
            const normalized = val.trim().toLowerCase()
            if (['true', '1', 'yes', 'on'].includes(normalized)) return true
            if (['false', '0', 'no', 'off', ''].includes(normalized)) return false
        }
        return Boolean(fallback)
    }

    // ── DOM 工具 ────────────────────────────────────────────────────────
    function getElem(sel) { return document.querySelector(sel) }
    function getElemSafe(sel, name) {
        const el = getElem(sel)
        if (!el) console.warn(`ReadBoost: 未找到元素 ${sel} (${name})`)
        return el
    }

    function parseTopicId() {
        const match = window.location.pathname.match(/^\/t\/(?:[^/]+\/)?(\d+)(?:\/|$)/)
        return match ? match[1] : null
    }

    function parseTotalReplies() {
        const timelineEl = getElem('div.timeline-replies')
        if (!timelineEl) return 0
        const text = timelineEl.textContent.trim()
        const parts = text.split('/').map(s => parseInt(s.replace(/,/g, '').trim(), 10))
        return parts.length >= 2 && !isNaN(parts[1]) ? parts[1] : 0
    }

    async function waitForElem(selector, timeout = 10000) {
        const existing = getElem(selector)
        if (existing) return existing

        return new Promise(resolve => {
            const timer = setTimeout(() => {
                observer.disconnect()
                resolve(null)
            }, timeout)
            const observer = new MutationObserver(() => {
                const el = getElem(selector)
                if (!el) return
                clearTimeout(timer)
                observer.disconnect()
                resolve(el)
            })
            observer.observe(document.body, { childList: true, subtree: true })
        })
    }

    // ── 注入暗色模式适配样式 ──────────────────────────────────────────────
    GM_addStyle(`
        .rb-modal {
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            padding: 24px 28px;
            border: 1px solid var(--primary-low, #ccc);
            border-radius: 12px;
            background: var(--secondary, #fff);
            color: var(--primary, #333);
            z-index: 1000;
            box-sizing: border-box;
            width: min(380px, calc(100vw - 32px));
            box-shadow: 0 8px 32px rgba(0,0,0,0.15);
            font-size: 14px;
            line-height: 1.6;
        }
        .rb-modal h3 { margin: 0 0 12px 0; font-size: 16px; }
        .rb-modal label { display: block; margin: 4px 0; }
        .rb-modal input[type="number"] {
            width: 100px; padding: 2px 6px;
            border: 1px solid var(--primary-low, #ccc);
            border-radius: 4px;
            background: var(--secondary, #fff);
            color: var(--primary, #333);
        }
        .rb-modal .btn-row { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .rb-modal .btn-row button { flex: 0 1 auto; }
        .rb-controls {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex: 0 0 auto;
            margin-left: 8px;
            white-space: nowrap;
        }
        .rb-button-wrap {
            display: inline-flex;
            align-items: center;
            flex: 0 0 auto;
        }
        .rb-button-wrap .btn { margin: 0; }
        .rb-status {
            display: inline-flex;
            align-items: center;
            margin: 0 2px;
            font-size: 13px; transition: color 0.3s;
        }
        @media (max-width: 700px) {
            .rb-controls { margin-left: 4px; gap: 4px; }
            .rb-status { display: none; }
        }
    `)

    // ── UI 构建 ─────────────────────────────────────────────────────────
    function createButton(label, id, extraClass = '') {
        const wrapper = document.createElement('span')
        wrapper.className = 'rb-button-wrap'
        const btn = document.createElement('button')
        btn.className = `btn btn-small ${extraClass}`
        btn.id = id
        const span = document.createElement('span')
        span.className = 'd-button-label'
        span.textContent = label
        btn.appendChild(span)
        wrapper.appendChild(btn)
        return wrapper
    }

    function createStatusLabel(text) {
        const el = document.createElement('span')
        el.className = 'rb-status'
        el.id = 'rbStatus'
        el.textContent = text
        return el
    }

    function updateStatus(text, color = '#555') {
        const el = document.getElementById('rbStatus')
        if (el) { el.textContent = text; el.style.color = color }
    }

    function removeStopButton() {
        const stopEl = document.getElementById('rbStopBtn')
        if (!stopEl) return
        const wrapper = stopEl.closest('.rb-button-wrap')
        if (wrapper) wrapper.remove()
    }

    // ── 设置弹窗 ─────────────────────────────────────────────────────────
    function showSettings() {
        if (isRunning) {
            alert('脚本正在运行，请先停止后再修改设置。')
            return
        }

        const existing = document.getElementById('rbSettings')
        if (existing) existing.remove()

        const div = document.createElement('div')
        div.className = 'rb-modal'
        div.id = 'rbSettings'

        const advancedChecked = config.autoStart ? 'checked' : ''
        const inputsHTML = CONFIG_META.map(({ key, label }) =>
            `<label>${label}: <input id="rb_${key}" type="number" value="${config[key]}"></label>`
        ).join('\n')

        div.innerHTML = `
            <h3>${SCRIPT_NAME} 设置</h3>
            ${inputsHTML}
            <label><input type="checkbox" id="rb_autoStart" ${advancedChecked}> 自动运行</label>
            <div class="btn-row">
                <button class="btn btn-small" id="rb_startBtn"><span class="d-button-label">手动开始</span></button>
                <button class="btn btn-small" id="rb_saveBtn"><span class="d-button-label">保存</span></button>
                <button class="btn btn-small" id="rb_resetBtn"><span class="d-button-label">恢复默认</span></button>
                <button class="btn btn-small" id="rb_closeBtn"><span class="d-button-label">关闭</span></button>
            </div>
        `

        document.body.appendChild(div)

        document.getElementById('rb_startBtn').addEventListener('click', () => {
            currentTopicId = currentTopicId || parseTopicId()
            currentTotalReplies = parseTotalReplies() || currentTotalReplies
            if (!currentTopicId || currentTotalReplies <= 0) {
                alert('未能识别当前帖子或回复数，无法开始。')
                return
            }
            div.remove()
            readTopic(currentTopicId, currentTotalReplies)
        })

        document.getElementById('rb_saveBtn').addEventListener('click', () => {
            CONFIG_META.forEach(({ key, min, max }) => {
                const el = document.getElementById('rb_' + key)
                config[key] = clampInt(el.value, DEFAULT_CONFIG[key], min, max)
                el.value = config[key]
            })
            config.autoStart = document.getElementById('rb_autoStart').checked
            config = saveConfig(config)
            alert('设置已保存！如需自动运行请刷新页面。')
            div.remove()
        })

        document.getElementById('rb_resetBtn').addEventListener('click', () => {
            if (!confirm('确认恢复所有设置为默认值？')) return
            resetConfig()
            config = loadConfig()
            CONFIG_META.forEach(({ key }) => {
                const el = document.getElementById('rb_' + key)
                if (el) el.value = config[key]
            })
            document.getElementById('rb_autoStart').checked = config.autoStart
            alert('已恢复默认设置！')
        })

        document.getElementById('rb_closeBtn').addEventListener('click', () => div.remove())
    }

    // ── 核心：刷已读 ──────────────────────────────────────────────────────
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    function createBatchParams(startId, endId, topicId) {
        const params = new URLSearchParams()
        const count = endId - startId + 1
        for (let i = startId; i <= endId; i++) {
            params.append(`timings[${i}]`, getRandomInt(config.minReadTime, config.maxReadTime))
        }
        params.append('topic_time', getRandomInt(config.minReadTime * count, config.maxReadTime * count))
        params.append('topic_id', topicId)
        return params
    }

    async function sendBatch(startId, endId, topicId, csrf, retries = 3) {
        const params = createBatchParams(startId, endId, topicId)
        for (let attempt = 0; attempt <= retries; attempt++) {
            if (abortFlag) return false
            try {
                const res = await fetch(`${BASE_URL}/topics/timings`, {
                    method: 'POST',
                    headers: {
                        'accept': '*/*',
                        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'discourse-background': 'true',
                        'discourse-logged-in': 'true',
                        'discourse-present': 'true',
                        'x-csrf-token': csrf,
                        'x-requested-with': 'XMLHttpRequest',
                        'x-silence-logger': 'true'
                    },
                    credentials: 'include',
                    referrer: BASE_URL + '/',
                    body: params.toString()
                })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                updateStatus(`已读 ${startId} - ${endId}`, 'green')
                console.log(`ReadBoost OK: ${startId}-${endId}`)
                return true
            } catch (e) {
                console.warn(`ReadBoost 重试 ${attempt}/${retries}: ${startId}-${endId}`, e)
                if (attempt < retries) {
                    updateStatus(`重试 ${startId}-${endId} (${attempt + 1}/${retries})`, 'orange')
                    await sleep(2000)
                } else {
                    updateStatus(`跳过 ${startId}-${endId}`, 'red')
                    console.error(`ReadBoost FAIL: ${startId}-${endId}`, e)
                }
            }
        }
        return false
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

    async function readTopic(topicId, totalReplies) {
        if (isRunning) return
        isRunning = true
        abortFlag = false

        // 注入停止按钮
        const stopBtn = createButton('停止', 'rbStopBtn', 'btn-danger')
        const statusEl = document.getElementById('rbStatus')
        if (statusEl) {
            const parent = statusEl.parentNode
            parent.insertBefore(stopBtn, statusEl.nextSibling)
        }
        const stopEl = document.getElementById('rbStopBtn')
        if (stopEl) stopEl.addEventListener('click', () => {
            abortFlag = true
            updateStatus('正在停止...', 'red')
        })

        try {
            const csrfEl = getElemSafe('meta[name=csrf-token]', 'CSRF meta')
            if (!csrfEl) {
                updateStatus('错误：未找到 CSRF token', 'red')
                return
            }
            const csrf = csrfEl.getAttribute('content')

            console.log(`ReadBoost 开始: topic=${topicId}, 回复数=${totalReplies}`)
            updateStatus(`开始阅读 (0/${totalReplies})`, '#555')

            let skippedCount = 0
            for (let i = 1; i <= totalReplies && !abortFlag;) {
                const batchSize = getRandomInt(config.minReqSize, config.maxReqSize)
                const endId = Math.min(i + batchSize - 1, totalReplies)
                const ok = await sendBatch(i, endId, topicId, csrf)
                if (abortFlag) break
                if (ok) {
                    updateStatus(`进度 ${Math.min(endId, totalReplies)}/${totalReplies}`, '#555')
                } else {
                    skippedCount += endId - i + 1
                }
                i = endId + 1

                // 最后一批之后不再延迟
                if (i <= totalReplies && !abortFlag) {
                    await sleep(config.baseDelay + getRandomInt(0, config.randomDelayRange))
                }
            }

            if (abortFlag) {
                updateStatus('已手动停止', 'red')
                console.log('ReadBoost 已手动停止')
            } else if (skippedCount > 0) {
                updateStatus(`完成，跳过 ${skippedCount} 条`, 'orange')
                console.warn(`ReadBoost 完成，但跳过 ${skippedCount} 条`)
            } else {
                updateStatus('全部完成 ✓', 'green')
                console.log('ReadBoost 全部完成')
            }
        } finally {
            isRunning = false
            removeStopButton()
        }
    }

    // ── 初始化 ────────────────────────────────────────────────────────────
    ready.then(async () => {
        const headerButtons = await waitForElem('.header-buttons')
        if (!headerButtons) {
            console.warn('ReadBoost: 未找到 .header-buttons，放弃加载')
            return
        }

        // 解析 topic ID 和回复数
        currentTopicId = parseTopicId()
        if (!currentTopicId) {
            console.warn('ReadBoost: 无法解析 topic ID', window.location.pathname)
            return
        }

        await waitForElem('div.timeline-replies', 5000)
        currentTotalReplies = parseTotalReplies()

        console.log('ReadBoost 已加载', { topicID: currentTopicId, totalReplies: currentTotalReplies })

        // 注入 UI
        const rbControls = document.createElement('span')
        rbControls.className = 'rb-controls'
        const statusLabel = createStatusLabel(currentTotalReplies > 0 ? 'ReadBoost 待命中' : 'ReadBoost (无回复)')
        const settingsBtn = createButton('设置', 'rbSettingsBtn', 'btn-icon-text')

        rbControls.appendChild(statusLabel)
        rbControls.appendChild(settingsBtn)
        headerButtons.appendChild(rbControls)
        settingsBtn.addEventListener('click', showSettings)

        // 自启动
        if (config.autoStart && currentTotalReplies > 0) {
            setTimeout(() => readTopic(currentTopicId, currentTotalReplies), 500)
        }
    })
})()

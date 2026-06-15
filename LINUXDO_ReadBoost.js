// ==UserScript==
// @name         LINUXDO ReadBoost
// @namespace    linux.do_ReadBoost
// @version      1.3
// @author       Do
// @description  自动化刷取Discourse论坛已读帖量，温和、可配置、理论支持所有Discourse论坛
// @license      GPL-3.0
// @icon         https://www.google.com/s2/favicons?domain=linux.do
// @match        https://linux.do/t/topic/*
// @match        https://nodeloc.com/t/topic/*
// @match        https://idcflare.com/t/topic/*
// @match        https://www.nodeloc.com/t/topic/*
// @match        https://meta.discourse.org/t/topic/*
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

    // ── 风险确认（仅首次） ──────────────────────────────────────────────
    const hasAgreed = GM_getValue('hasAgreed', false)
    if (!hasAgreed) {
        const msg = [
            '[ LINUXDO ReadBoost ]',
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

    // ── 存储 ────────────────────────────────────────────────────────────
    function loadConfig() {
        const stored = {}
        CONFIG_META.forEach(({ key }) => {
            const val = GM_getValue(key, DEFAULT_CONFIG[key])
            stored[key] = typeof val === 'number' ? val : DEFAULT_CONFIG[key]
        })
        stored.autoStart = GM_getValue('autoStart', DEFAULT_CONFIG.autoStart)
        return { ...DEFAULT_CONFIG, ...stored }
    }

    function saveConfig(cfg) {
        CONFIG_META.forEach(({ key }) => GM_setValue(key, clampInt(cfg[key], DEFAULT_CONFIG[key], 1, 99999)))
        GM_setValue('autoStart', Boolean(cfg.autoStart))
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

    // ── DOM 工具 ────────────────────────────────────────────────────────
    function getElem(sel) { return document.querySelector(sel) }
    function getElemSafe(sel, name) {
        const el = getElem(sel)
        if (!el) console.warn(`ReadBoost: 未找到元素 ${sel} (${name})`)
        return el
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
            min-width: 340px;
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
        .rb-modal .btn-row { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
        .rb-modal .btn-row button { flex: 0 1 auto; }
        .rb-status {
            margin-left: 10px; margin-right: 10px;
            font-size: 13px; transition: color 0.3s;
        }
    `)

    // ── UI 构建 ─────────────────────────────────────────────────────────
    function createButton(label, id, extraClass = '') {
        const wrapper = document.createElement('span')
        wrapper.className = 'auth-buttons'
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

    // ── 设置弹窗 ─────────────────────────────────────────────────────────
    function showSettings() {
        if (isRunning) {
            alert('脚本正在运行，请先停止后再修改设置。')
            return
        }

        const div = document.createElement('div')
        div.className = 'rb-modal'
        div.id = 'rbSettings'

        const advancedChecked = config.autoStart ? 'checked' : ''
        const inputsHTML = CONFIG_META.map(({ key, label }) =>
            `<label>${label}: <input id="rb_${key}" type="number" value="${config[key]}"></label>`
        ).join('\n')

        div.innerHTML = `
            <h3>LINUXDO ReadBoost 设置</h3>
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
            div.remove()
            readTopic(topicID, totalReplies)
        })

        document.getElementById('rb_saveBtn').addEventListener('click', () => {
            CONFIG_META.forEach(({ key, min, max }) => {
                const el = document.getElementById('rb_' + key)
                config[key] = clampInt(el.value, DEFAULT_CONFIG[key], min, max)
                el.value = config[key]
            })
            config.autoStart = document.getElementById('rb_autoStart').checked
            saveConfig(config)
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
        document.getElementById('rbStopBtn').addEventListener('click', () => {
            abortFlag = true
            updateStatus('正在停止...', 'red')
        })

        const csrfEl = getElemSafe('meta[name=csrf-token]', 'CSRF meta')
        if (!csrfEl) {
            updateStatus('错误：未找到 CSRF token', 'red')
            isRunning = false
            return
        }
        const csrf = csrfEl.getAttribute('content')

        console.log(`ReadBoost 开始: topic=${topicId}, 回复数=${totalReplies}`)
        updateStatus(`开始阅读 (0/${totalReplies})`, '#555')

        for (let i = 1; i <= totalReplies && !abortFlag;) {
            const batchSize = getRandomInt(config.minReqSize, config.maxReqSize)
            const endId = Math.min(i + batchSize - 1, totalReplies)
            await sendBatch(i, endId, topicId, csrf)
            updateStatus(`进度 ${Math.min(endId, totalReplies)}/${totalReplies}`, '#555')
            i = endId + 1

            // 最后一批之后不再延迟
            if (i <= totalReplies && !abortFlag) {
                await sleep(config.baseDelay + getRandomInt(0, config.randomDelayRange))
            }
        }

        isRunning = false
        if (abortFlag) {
            updateStatus('已手动停止', 'red')
            console.log('ReadBoost 已手动停止')
        } else {
            updateStatus('全部完成 ✓', 'green')
            console.log('ReadBoost 全部完成')
        }

        // 移除停止按钮
        const stopEl = document.getElementById('rbStopBtn')
        if (stopEl) {
            const wrapper = stopEl.closest('.auth-buttons')
            if (wrapper) wrapper.remove()
        }
    }

    // ── 初始化 ────────────────────────────────────────────────────────────
    ready.then(() => {
        const headerButtons = getElemSafe('.header-buttons', 'header-buttons')
        if (!headerButtons) {
            console.warn('ReadBoost: 未找到 .header-buttons，放弃加载')
            return
        }

        // 解析 topic ID 和回复数
        const pathParts = window.location.pathname.split('/')
        const topicID = pathParts[3]
        if (!topicID || !/^\d+$/.test(topicID)) {
            console.warn('ReadBoost: 无法解析 topic ID', pathParts)
            return
        }

        const timelineEl = getElemSafe('div.timeline-replies', 'timeline-replies')
        let totalReplies = 0
        if (timelineEl) {
            const text = timelineEl.textContent.trim()
            const parts = text.split('/').map(s => parseInt(s.trim(), 10))
            if (parts.length >= 2 && !isNaN(parts[1])) totalReplies = parts[1]
        }

        console.log('ReadBoost 已加载', { topicID, totalReplies })

        // 注入 UI
        const statusLabel = createStatusLabel(totalReplies > 0 ? 'ReadBoost 待命中' : 'ReadBoost (无回复)')
        const settingsBtn = createButton('设置', 'rbSettingsBtn', 'btn-icon-text')

        headerButtons.appendChild(statusLabel)
        headerButtons.appendChild(settingsBtn)
        settingsBtn.addEventListener('click', showSettings)

        // 自启动
        if (config.autoStart && totalReplies > 0) {
            setTimeout(() => readTopic(topicID, totalReplies), 500)
        }
    })
})()

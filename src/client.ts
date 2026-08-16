
/**
 * DSH Whale 客户端入口
 * 1. 为 /whale 命令注册 popupSelect 装饰
 * 2. 在每轮消息尾部注册 token 节省统计组件
 * 3. 会话头部鲸鱼图标按钮（DeepSeek 风格 SVG + 喷水动画）
 * 格式遵循 DSH ModuleLoader 规范
 */
declare const window: any;
declare const document: any;

window.__ModuleLoader__.load({
  id: '@1lyn-en/dsh-whale',
  factory: (require: any) => {
    const module = { exports: {} };
    const exports: any = module.exports;

    const React = require('react');
    const { useState, useEffect, useRef, useMemo } = React;

    /** 客户端服务依赖 */
    const inject = ['commandUi', 'sessions', 'slots', 'theme'];

    interface WhaleOption {
      id: string;
      label: string;
      detail: string;
    }

    /** 6 档模式 */
    const MODES: WhaleOption[] = [
      { id: 'off', label: '关闭', detail: '恢复正常说话' },
      { id: 'lite', label: '轻度', detail: '去客套话，保留完整句子' },
      { id: 'full', label: '标准', detail: '去冠词，碎片化表达（默认）' },
      { id: 'ultra', label: '极致', detail: '一个词能说清不用两个词' },
      { id: 'wenyan-lite', label: '文言·轻度', detail: '半文言，去废话' },
      { id: 'wenyan-full', label: '文言·极致', detail: '纯文言文' },
    ];

    /** 各模式的估算节省率（用于反推正常输出量） */
    const SAVE_RATIO: Record<string, number> = {
      off: 0,
      lite: 0.35,
      full: 0.55,
      ultra: 0.7,
      'wenyan-lite': 0.45,
      'wenyan-full': 0.6,
    };

    /** 当前模式（从 localStorage 恢复，popup 切换时更新） */
    const STORAGE_KEY = 'dsh-whale:mode';
    const MODE_CHANGE_EVENT = 'dsh-whale:mode-change';

    /** 通知所有组件模式已变化（替代 setInterval 轮询） */
    function notifyModeChange(mode: string) {
      try {
        window.dispatchEvent(new CustomEvent(MODE_CHANGE_EVENT, { detail: { mode } }));
      } catch {
        /* ignore */
      }
    }
    let currentMode = 'off';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && MODES.some((m) => m.id === saved)) {
        currentMode = saved;
      }
    } catch {
      /* localStorage 不可用时忽略 */
    }

    /** 从 assistant blocks 提取纯文本 */
    function extractText(blocks: any[]): string {
      if (!blocks) return '';
      return blocks
        .filter((b: any) => b.kind === 'text')
        .map((b: any) => b.text ?? '')
        .join('');
    }

    /** 估算文本 token 数（按字符类型加权，比简单 /2.5 更准确） */
    function estimateTokens(text: string): number {
      if (!text) return 0;
      let tokens = 0;
      for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0;
        if (code >= 0x4e00 && code <= 0x9fff) {
          // CJK 统一汉字：约 1 token/字
          tokens += 1;
        } else if (code >= 0x3000 && code <= 0x303f) {
          // CJK 标点：约 0.8 token
          tokens += 0.8;
        } else if (/[a-zA-Z0-9]/.test(ch)) {
          // 英文/数字：约 0.25 token/字符（~4 字符 1 token）
          tokens += 0.25;
        } else if (ch === ' ' || ch === '\n' || ch === '\t') {
          // 空白：约 0.1 token
          tokens += 0.1;
        } else {
          // 其他标点/符号：约 0.5 token
          tokens += 0.5;
        }
      }
      return Math.round(tokens);
    }

    // ============================================================
    // 赛博朋克风格鲸鱼图标（霓虹灯效果，内嵌 base64 PNG）
    // ============================================================

    const WHALE_ICON =
      'data:image/png;base64,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';

    /** 官方 DeepSeek 黑鲸 logo（SVG 矢量，纯黑填充） */
    const WHALE_ICON_BLACK =
      'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48c3ZnIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDYwIDQxLjM1OTUiPjxwYXRoIGZpbGw9IiMwMDAwMDAiIGQ9Ik01NS42MTI4LDMuNDcxMmMtLjU5NTMtLjI5MTctLjg1MTcuMjY0Mi0xLjE5OTguNTQ2Ni0uMTE5MS4wOTExLS4yMTk4LjIwOTUtLjMyMDYuMzE4OC0uODcwMS45MjkyLTEuODg2NywxLjUzOTgtMy4yMTQ4LDEuNDY2OC0xLjk0MTctLjEwOTQtMy41OTk1LjUwMTItNS4wNjUsMS45ODYzLS4zMTE0LTEuODMxMy0xLjM0NjMtMi45MjQ4LTIuOTIxNy0zLjYyNjItLjgyNDItLjM2NDUtMS42NTc3LS43MjktMi4yMzQ4LTEuNTIxNy0uNDAzLS41NjQ3LS41MTI5LTEuMTkzNC0uNzE0NC0xLjgxMy0uMTI4My0uMzczNS0uMjU2NS0uNzU2My0uNjg3LS44MjAxLS40NjcxLS4wNzI4LS42NTAzLjMxODgtLjgzMzUuNjQ3LS43MzI3LDEuMzM5NC0xLjAxNjYsMi44MTU0LS45ODkyLDQuMzA5Ni4wNjQxLDMuMzYyMSwxLjQ4MzgsNi4wNDA2LDQuMzA0Nyw3Ljk0NDkuMzIwNi4yMTg3LjQwMy40MzcyLjMwMjMuNzU2My0uMTkyNC42NTYtLjQyMTQsMS4yOTM3LS42MjI4LDEuOTQ5Ny0uMTI4My40MTkyLS4zMjA3LjUxMDMtLjc2OTQuMzI3OS0xLjU0NzktLjY0NjctMi44ODUyLTEuNjAzNS00LjA2NjctMi43NjA1LTIuMDA1OC0xLjk0MDctMy44MTkzLTQuMDgxOC02LjA4MTUtNS43NTgzLS41MzEyLS4zOTE4LTEuMDYyNS0uNzU2MS0xLjYxMjEtMS4xMDI1LTIuMzA4MS0yLjI0MTIuMzAyMy00LjA4MTguOTA2OC00LjMwMDMuNjMxOS0uMjI3OC4yMTk4LTEuMDExNS0xLjgyMjctMS4wMDIyLTIuMDQyNS4wMDktMy45MTA5LjY5MjQtNi4yOTIyLDEuNjAzNS0uMzQ4LjEzNjctLjcxNDUuMjM2OC0xLjA5LjMxODgtMi4xNjE1LS40MDk5LTQuNDA1NS0uNTAxMi02Ljc1MDItLjIzNjgtNC40MTQ3LjQ5MTktNy45NDA4LDIuNTc4NC0xMC41MzI4LDYuMTQwOUMuMTkxNCwxMy4xMjg5LS41NDEzLDE3Ljk5NDEuMzU2MywyMy4wNjkxYy45NDM0LDUuMzQ4MSwzLjY3MjcsOS43NzYxLDcuODY3NiwxMy4yMzg1LDQuMzUwNiwzLjU4OTYsOS4zNjA2LDUuMzQ4MSwxNS4wNzU4LDUuMDExLDMuNDcxMy0uMjAwNCw3LjMzNjQtLjY2NSwxMS42OTYxLTQuMzU1LDEuMDk5LjU0NjcsMi4yNTMxLjc2NTIsNC4xNjc0LjkyOTIsMS40NzQ2LjEzNjcsMi44OTQzLS4wNzI4LDMuOTkzMy0uMzAwNSwxLjcyMTktLjM2NDUsMS42MDI5LTEuOTU5Ljk4MDEtMi4yNTA1LTUuMDQ2Ni0yLjM1MDYtMy45Mzg1LTEuMzk0LTQuOTQ1OS0yLjE2ODUsMi41NjQ1LTMuMDMzOSw2LjQyOTctNi4xODY1LDcuOTQwOS0xNi40MDAxLjExOS0uODEwOC4wMTgzLTEuMzIxMSwwLTEuOTc3MS0uMDA5Mi0uNDAwOC4wODI0LS41NTU2LjU0MDQtLjYwMTMsMS4yNjM5LS4xNDU4LDIuNDkxMi0uNDkxOSwzLjYxNzgtMS4xMTE1LDMuMjY5OC0xLjc4NTcsNC41ODg2LTQuNzE5NSw0LjktOC4yMzY0LjA0NTktLjUzNzYtLjAwOTEtMS4wOTM1LS41NzctMS4zNzU3Wk0yNy4xMTksMzUuMTIzYy00Ljg5MDktMy44NDQ3LTcuMjYzLTUuMTExMy04LjI0MzEtNS4wNTY2LS45MTU5LjA1NDctLjc1MSwxLjEwMjUtLjU0OTYsMS43ODU5LjIxMDcuNjc0MS40ODU1LDEuMTM4OS44NzAxLDEuNzMxLjI2NTYuMzkxOC40NDg5Ljk3NDgtLjI2NTUsMS40MTIzLTEuNTc1NC45NzQ5LTQuMzE0LS4zMjgxLTQuNDQyMy0uMzkxOC0zLjE4NzItMS44NzctNS44NTI1LTQuMzU1My03LjczMDItNy43NDQ0LTEuODEzNS0zLjI2Mi0yLjg2NjctNi43NjA1LTMuMDQwOC0xMC40OTYxLS4wNDU4LS45MDE5LjIxOTgtMS4yMjEsMS4xMTc0LTEuMzg0OCwxLjE4MTUtLjIxODcsMi4zOTk3LS4yNjQ0LDMuNTgxMi0uMDkxMyw0Ljk5MTguNzI5LDkuMjQxNSwyLjk2MTIsMTIuODA0Myw2LjQ5NjMsMi4wMzMzLDIuMDEzNSwzLjU3Miw0LjQxOSw1LjE1NjYsNi43Njk2LDEuNjg1MiwyLjQ5NjMsMy40OTg3LDQuODc0NSw1LjgwNjgsNi44MjQyLjgxNTEuNjgzMywxLjQ2NTQsMS4yMDI2LDIuMDg4MiwxLjU4NTQtMS44Nzc1LjIwOTUtNS4wMS4yNTUyLTcuMTUzMi0xLjQzOTdaTTI5LjQ2MzcsMjAuMDQ0MmMwLS40MDA5LjMyMDYtLjcxOTcuNzIzNy0uNzE5Ny4wOTE2LDAsLjE3NC4wMTguMjQ3My4wNDUzLjEwMDguMDM2Ni4xOTI0LjA5MTMuMjY1Ni4xNzMxLjEyODMuMTI3Ny4yMDE1LjMwOTguMjAxNS41MDEyLDAsLjQwMDktLjMyMDUuNzE5Ny0uNzIzNC43MTk3cy0uNzE0NS0uMzE4OC0uNzE0NS0uNzE5N1pNMzYuNzQ1MiwyMy43Nzk4Yy0uNDY3MS4xOTE0LS45MzQyLjM1NTItMS4zODMuMzczNS0uNjk2MS4wMzY0LTEuNDU2My0uMjQ2MS0xLjg2ODQtLjU5MjMtLjY0MTEtLjUzNzYtMS4wOTkxLS44MzgxLTEuMjkxNC0xLjc3NjYtLjA4MjUtLjQwMDktLjAzNjctMS4wMjA1LjAzNjctMS4zNzU3LjE2NDgtLjc2NTQtLjAxODQtMS4yNTczLS41NTg3LTEuNzAzOS0uNDM5Ny0uMzY0NS0uOTk4NC0uNDY0Ni0xLjYxMjEtLjQ2NDYtLjIyOSwwLS40Mzk1LS4xMDAzLS41OTUzLS4xODIzLS4yNTY1LS4xMjc1LS40NjctLjQ0NjQtLjI2NTYtLjgzODIuMDY0MS0uMTI3NC4zNzU2LS40MzczLjQ0ODktLjQ5MTkuODMzNS0uNDczOSwxLjc5NTItLjMxODksMi42ODM2LjAzNjQuODI0NC4zMzcxLDEuNDQ3Mi45NTY3LDIuMzQ0NywxLjgzMTMuOTE1OSwxLjA1NjgsMS4wODA3LDEuMzQ4NiwxLjYwMjgsMi4xNDExLjQxMjMuNjE5Ni43ODc4LDEuMjU3MywxLjA0NDIsMS45ODYzLjE1NTcuNDU1Ni0uMDQ1OC44MjkxLS41ODYyLDEuMDU2OVoiLz48L3N2Zz4=';

    /**
     * 赛博朋克鲸鱼图标组件
     * @param size 图标尺寸（px）
     * @param className 额外 CSS 类名
     * @param active 是否激活（控制亮度）
     */
    function WhaleSvgIcon({ size = 38, className = '', active = true }: any) {
      return React.createElement(
        'span',
        { className: 'whale-icon-wrap ' + className, style: { width: size, height: size } },
        React.createElement('span', { className: 'whale-glow-bg', 'aria-hidden': 'true' }),
        React.createElement('span', { className: 'whale-ring', 'aria-hidden': 'true' }),
        React.createElement('img', {
          src: WHALE_ICON,
          className: 'whale-cyber',
          style: { width: size, height: size },
          alt: '鲸鱼模式',
          'aria-hidden': 'true',
        }),
      );
    }

    // ============================================================
    // Token 节省统计组件（用 SVG 小图标替代 emoji）
    // ============================================================

    /**
     * 全屏鲸鱼模式切换过渡动画（扫描线揭示：黑鲸 → 霓虹鲸）
     */
    function showWhaleTransition(onComplete?: () => void) {
      if (document.querySelector('.whale-transition-overlay')) { if (onComplete) onComplete(); return; }
      const overlay = document.createElement('div');
      overlay.className = 'whale-transition-overlay';
      const logoWrap = document.createElement('div');
      logoWrap.className = 'whale-transition-logo';
      const neon = document.createElement('img');
      neon.src = WHALE_ICON;
      neon.className = 'whale-transition-neon';
      const black = document.createElement('img');
      black.src = WHALE_ICON_BLACK;
      black.className = 'whale-transition-black';
      const scanLine = document.createElement('div');
      scanLine.className = 'whale-transition-scanline';
      logoWrap.appendChild(neon);
      logoWrap.appendChild(black);
      logoWrap.appendChild(scanLine);
      overlay.appendChild(logoWrap);
      document.body.appendChild(overlay);
      window.requestAnimationFrame(() => {
        overlay.classList.add('wt-enter');
        setTimeout(() => overlay.classList.add('wt-scan'), 320);
        setTimeout(() => overlay.classList.add('wt-flash'), 1870);
        setTimeout(() => overlay.classList.add('wt-exit'), 2120);
        setTimeout(() => { overlay.remove(); if (onComplete) onComplete(); }, 2600);
      });
    }
    function WhaleTokenStats({ matched }: any) {
      const { text, mode } = matched || {};
      if (!text || !mode || mode === 'off') return null;

      const actualTokens = estimateTokens(text);
      const ratio = SAVE_RATIO[mode] ?? 0;
      if (ratio <= 0 || actualTokens <= 0) return null;

      const normalTokens = Math.round(actualTokens / (1 - ratio));
      const savedTokens = normalTokens - actualTokens;
      if (savedTokens <= 0) return null;

      return React.createElement(
        'div',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            color: 'var(--dsh-color-text-muted, #888)',
            marginTop: '4px',
            userSelect: 'none',
          },
        },
        React.createElement(WhaleSvgIcon, { size: 20, active: true }),
        React.createElement('span', null, `本轮约省 ${savedTokens} token`),
      );
    }

    /**
     * turnTail chain slot 的 select 函数
     */
    function selectWhaleStats(owner: any) {
      if (currentMode === 'off') return null;
      const turnTail = owner?.turn?.data?.get?.('turn-tail');
      const closing = turnTail?.closing;
      if (!closing) return null;
      const text = extractText(closing.blocks);
      if (!text || text.length < 10) return null;
      return { text, mode: currentMode };
    }

    // ============================================================
    // 升级的 CSS 动画（水柱 + 水花 + 气泡 + 水波纹 + 鲸鱼身体动画）
    // ============================================================

    let whaleCssInjected = false;
    function injectWhaleCss() {
      if (whaleCssInjected) return;
      whaleCssInjected = true;
      const style = document.createElement('style');
      style.textContent = `        /* === 头部按钮容器 === */
        .whale-header-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 10px;
          transition: background 0.2s, transform 0.2s;
          padding: 0;
          overflow: visible;
        }
        .whale-header-btn:hover {
          background: var(--dsh-color-bg-hover, rgba(0,0,0,0.06));
        }
        .whale-header-btn.active {
          background: transparent;
        }
        .whale-header-btn:active {
          transform: scale(0.92);
        }
        .whale-icon-wrap {
          position: relative;
          display: inline-block;
        }
        .whale-glow-bg {
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,200,255,0.35) 0%, rgba(150,0,255,0.2) 40%, transparent 70%);
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        }
        .whale-header-btn.active .whale-glow-bg {
          opacity: 1;
          animation: glow-pulse 3s ease-in-out infinite;
        }
        .whale-header-btn.streaming .whale-glow-bg {
          animation: glow-pulse-fast 1.2s ease-in-out infinite;
        }
        @keyframes glow-pulse {
          0%, 100% { transform: scale(0.9); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes glow-pulse-fast {
          0%, 100% { transform: scale(0.95); opacity: 0.7; }
          50% { transform: scale(1.2); opacity: 1; }
        }
        .whale-ring {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          background: conic-gradient(from 0deg, transparent 0deg, rgba(0,200,255,0.8) 60deg, transparent 120deg, transparent 180deg, rgba(150,0,255,0.8) 240deg, transparent 300deg);
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
          -webkit-mask: radial-gradient(circle, transparent 55%, black 56%, black 100%);
          mask: radial-gradient(circle, transparent 55%, black 56%, black 100%);
        }
        .whale-header-btn.active .whale-ring {
          opacity: 0.7;
          animation: whale-ring-rotate 3s linear infinite;
        }
        .whale-header-btn.streaming .whale-ring {
          opacity: 1;
          animation: whale-ring-rotate-fast 1s linear infinite;
        }
        @keyframes whale-ring-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes whale-ring-rotate-fast {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .whale-cyber {
          position: relative;
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: contain;
          transition: filter 0.3s, opacity 0.3s, transform 0.3s;
          z-index: 1;
        }
        .whale-header-btn.active .whale-cyber {
          animation: cyber-float 3s ease-in-out infinite, neon-color-cycle 5s linear infinite, neon-breathe 2.5s ease-in-out infinite, neon-flicker 8s linear infinite;
        }
        .whale-header-btn.streaming .whale-cyber {
          animation: cyber-float-fast 1.2s ease-in-out infinite, neon-color-cycle 3s linear infinite, neon-breathe 1s ease-in-out infinite;
        }
        .whale-header-btn:hover .whale-cyber {
          transform: scale(1.15);
        }
        @keyframes cyber-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-3px) rotate(-2deg); }
        }
        @keyframes cyber-float-fast {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-4px) rotate(-3deg); }
        }
        @keyframes neon-color-cycle {
          0% { filter: hue-rotate(0deg) brightness(1.1); }
          33% { filter: hue-rotate(120deg) brightness(1.2); }
          66% { filter: hue-rotate(240deg) brightness(1.15); }
          100% { filter: hue-rotate(360deg) brightness(1.1); }
        }
        @keyframes neon-breathe {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(0,200,255,0.6)) drop-shadow(0 0 8px rgba(150,0,255,0.4)); }
          50% { filter: drop-shadow(0 0 8px rgba(0,200,255,0.9)) drop-shadow(0 0 16px rgba(150,0,255,0.7)); }
        }
        @keyframes neon-flicker {
          0%, 92%, 94%, 96%, 100% { opacity: 1; }
          93% { opacity: 0.4; }
          95% { opacity: 0.7; }
        }
        .whale-header-btn.active .whale-icon-wrap {
          animation: whale-pulse 3s ease-in-out infinite;
        }
        @keyframes whale-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        .whale-header-btn.burst .whale-cyber {
          animation: cyber-burst 0.6s ease-out !important;
        }
        @keyframes cyber-burst {
          0% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.2); filter: brightness(1.8) drop-shadow(0 0 20px rgba(0,200,255,1)); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        .whale-header-btn:not(.active) .whale-cyber {
          filter: grayscale(0.85) brightness(0.45);
          opacity: 0.5;
          transform: scale(0.78);
        }
        .whale-header-btn:not(.active):hover .whale-cyber {
          filter: grayscale(0.5) brightness(0.7);
          opacity: 0.8;
          transform: scale(0.9);
        }
        .whale-header-btn:not(.active) .whale-glow-bg,
        .whale-header-btn:not(.active) .whale-ring {
          opacity: 0;
          animation: none;
        }
        /* === 鲸鱼模式切换全屏过渡动画（扫描线揭示）=== */
        .whale-transition-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }
        .whale-transition-overlay.wt-enter { opacity: 1; }
        .whale-transition-overlay.wt-exit { opacity: 0; }
        .whale-transition-logo {
          position: relative;
          width: min(22vw, 22vh);
          height: min(22vw, 22vh);
          transform: scale(0.8);
          opacity: 0;
          transition: transform 0.3s ease, opacity 0.3s ease;
        }
        .wt-enter .whale-transition-logo { transform: scale(1); opacity: 1; }
        .wt-exit .whale-transition-logo {
          transform: scale(1.15);
          opacity: 0;
          transition: transform 0.4s ease, opacity 0.4s ease;
        }
        .whale-transition-neon, .whale-transition-black {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 50%;
        }
        .whale-transition-neon {
          z-index: 1;
          padding: 16px;
          background: radial-gradient(circle, #0a0a1a 0%, #050510 100%);
          filter: drop-shadow(0 0 20px rgba(0,200,255,0.6)) drop-shadow(0 0 40px rgba(150,0,255,0.4));
        }
        .whale-transition-black {
          z-index: 2;
          background: #ffffff;
          padding: 16px;
          border-radius: 50%;
          clip-path: inset(0 0 0 0);
          transition: clip-path 1.5s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 0 30px rgba(255,255,255,0.3);
        }
        .wt-scan .whale-transition-black { clip-path: inset(0 0 0 100%); }
        .whale-transition-scanline {
          position: absolute;
          top: -15%;
          bottom: -15%;
          width: 3px;
          left: 0;
          z-index: 3;
          background: linear-gradient(to right, transparent, rgba(0,220,255,0.95), rgba(180,0,255,0.7), transparent);
          box-shadow: 0 0 15px rgba(0,200,255,0.9), 0 0 30px rgba(150,0,255,0.6), 0 0 60px rgba(0,200,255,0.3);
          opacity: 0;
          transition: left 1.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s;
        }
        .wt-scan .whale-transition-scanline { left: 100%; opacity: 1; }
        .wt-flash .whale-transition-scanline { opacity: 0; }
        .whale-transition-overlay.wt-flash::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(0,220,255,0.4) 0%, rgba(150,0,255,0.2) 30%, transparent 60%);
          animation: wt-flash-pulse 0.25s ease-out;
        }
        @keyframes wt-flash-pulse {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }`;
      document.head.appendChild(style);
    }

    // ============================================================
    // 会话头部鲸鱼按钮组件
    // ============================================================

    function WhaleHeaderAction({ sessionId, useSessions }: any) {
      const [mode, setMode] = useState(currentMode);
      const [streaming, setStreaming] = useState(false);
      const [burst, setBurst] = useState(false);
      const burstTimer = useRef(null);

      // 监听会话状态，判断是否正在输出
      useEffect(() => {
        if (!useSessions || typeof useSessions.subscribe !== 'function') return;
        const unsubscribe = useSessions.subscribe((state: any) => {
          const session = state.sessions?.[sessionId];
          const isStreaming = session?.status === 'streaming' || session?.isStreaming;
          setStreaming(!!isStreaming);
        });
        return unsubscribe;
      }, [sessionId, useSessions]);

      // 监听模式变化（事件驱动，替代轮询）
      useEffect(() => {
        const handler = (e: any) => setMode(e.detail?.mode ?? currentMode);
        window.addEventListener(MODE_CHANGE_EVENT, handler);
        return () => window.removeEventListener(MODE_CHANGE_EVENT, handler);
      }, []);

      // 注入 CSS
      useEffect(() => {
        injectWhaleCss();
      }, []);

      // 清理 burst timer
      useEffect(() => {
        return () => {
          if (burstTimer.current) clearTimeout(burstTimer.current);
        };
      }, []);

      const isActive = mode !== 'off';

      const handleClick = async () => {
        // 点击爆发效果
        setBurst(true);
        if (burstTimer.current) clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(() => setBurst(false), 600);

        // 切换到上一次使用的模式或 full
        const nextMode = isActive ? 'off' : 'full';
        try {
          const sessionsApi = (window as any).__ModuleLoader__?.ctx?.sessions;
          const live = sessionsApi?.binding?.(sessionId)?.session;
          if (live) {
            await live.command(`/whale ${nextMode}`);
          }
        } catch {
          /* ignore */
        }
        if (nextMode !== 'off') {
          showWhaleTransition(() => activateCyberuiTheme());
        } else {
          deactivateCyberuiTheme();
        }
        currentMode = nextMode;
        setMode(nextMode);
        notifyModeChange(nextMode);
        try {
          localStorage.setItem(STORAGE_KEY, nextMode);
        } catch {
          /* ignore */
        }
      };

      // 键盘快捷键：Ctrl/Cmd+Shift+W 切换鲸鱼模式
      useEffect(() => {
        const handler = (e: any) => {
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'w') {
            e.preventDefault();
            handleClick();
          }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
      }, [mode]);

      const modeLabel = MODES.find((m) => m.id === mode)?.label ?? mode;
      const title = isActive ? `鲸鱼模式：${modeLabel}（点击关闭）` : '鲸鱼模式（点击开启）';

      const btnClass = [
        'whale-header-btn',
        isActive ? 'active' : '',
        streaming ? 'streaming' : '',
        burst ? 'burst' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return React.createElement(
        'button',
        {
          className: btnClass,
          onClick: handleClick,
          title,
          'aria-label': '鲸鱼模式',
        },
        // SVG 鲸鱼图标（内置喷水动画）
        React.createElement(WhaleSvgIcon, { size: 38, active: isActive }),
      );
    }

    // ============================================================
    // ============================================================
    // CyberUI 赛博朋克主题
    // ============================================================

const ROOT_CLASS = 'dsh-theme-cyberui-loaded'
    const OVERRIDE_SOURCE = 'cyberui-tokens'
    const STYLE_ID = 'dsh-theme-cyberui-styles'
    const PRODUCT_TITLE = 'DeepSeek Harness'
    const BACKGROUND_ART = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDQ4IiBoZWlnaHQ9IjIwNDgiIHZpZXdCb3g9IjAgMCAyMDQ4IDIwNDgiIHJvbGU9ImltZyIgYXJpYS1sYWJlbD0iRGVlcFNlZWsgY3liZXJwdW5rIGZsb2F0aW5nIGJhY2tncm91bmQiPjxkZWZzPjxpbWFnZSBpZD0iYXJ0IiB3aWR0aD0iMjA0OCIgaGVpZ2h0PSIyMDQ4IiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCBzbGljZSIgaHJlZj0iZGF0YTppbWFnZS93ZWJwO2Jhc2U2NCxVa2xHUnNyRkFBQlhSVUpRVmxBNElMN0ZBQUF3dkFLZEFTb0FBd0FEUG0weWxVZ2tJcWNycHZYSmFYQU5pV0p1Mk5YM2c0cWNTWHhjWC9MYzFmcXp4MitpL3V2K08vOGYrTTk1UDdRK0kzWC83UyttWjAxLzZmOC8rZFB6Sy80Zi93LzJYdXcvVjMvdy8xZjc3L1FQK3MvN0hlNlQvdmZ1Tjc0LzNRL01ENFEvdGQrM0h2VGY4VDl5UGVsL2hmK2grMi8vQStRWCtzLzd2LzgrdlQvLy9kRi9kNy8zZTRiKzJILy85bzMvdC91aC8xZmxRL3RmL0IvYi8vaC9KRCswWC8zL2NiNEFQL0QvLy8vZDhUdjhBLzZ2Ly8vOVh1QWVvZjRYKzN2cGgrTi9kanhGL0pQdVA5My9odjNkOW9UL2I4Ky9hdi9sOUQvNTUrbFA2M3JEL3pQQlA2Qi84bnFGL21IOVgvM1hxbVJnOVVmL0Y2aS92Tjk1LzZYK2Y5aFg4SC8wZWxIOG4vdXZZQi9ZYi9oZTAzL1Y4S2YwNzJBLzU1L2pQL0QvaVBaQy85Lzl2L3d2VTM5V2YvWC9SL0FsL1FQOEgvNVA4dDdiLy8vOTJuN28vLy8zaFAzRy8vNUxzWUJ2eXg3OWhEVFY1Z0cvTEh3TzRsTlhtQWI4c2UvUjVRNWxMWlQvRVFIclpZNy9rUjBKMnhyQnZBV1YwbWJESHBYL0lkTEhLY0RvRVpUb3o0cDhpeGMrZjFEZ1BEdW1vMnlOY0xmRi8vK1dqL1YvLzlzditLUCtvNHZQcENtbFpEOFB1QTVHYi8yOGpDc3B1T2Y4VkxIclJhWnZZVmNwT0cxSThDdURVVjFRMjRHRWhnbU9lOUhZK1U2OVZCV0xCdm1PMGh4dE4rd0RmbGtBaDFDY0ptQTZVdGUzdVowVU1yajdabkFRRUhzemhmYWFzMVBxRDlQWFNrY1V1bS9lZTJ2Z2dUOHNlL1IvckxIdjFMUEFsT2l3R05aazVzRFdLOTdPeVpZWHNDZjhtMW9rWUpHS1lwd0FmeGgxQjMyVkkyNFZqMzZRMUh0RmhWamEzTERzVTJLcWx1MWhtaC9aWVdsMGhqQVZmcVpvcitodUZaQ1BMUmtBaDNuTUtBVmVhaWZFVzcwV25CMTFIRDlzRUFsWTR2eVp1RjhxS0d4b0xuNktNd2lSYmVFK2tCNWVCTjl5ODgwaG9yVzdNNVNncnl2N1o3QU4rVXJiKytOdVJ4TlFNT0NQSW42NkQvQUNWOWRXR0ZVV2pFbUdBa2tPMndzL3k0dU5MQWl2RmRacUJaOTRhUE5aTyt2d2QxYUpaVzN5d3BUYlpGcURFTWRpRmhpanhDRlBDME9keEZ4L0NNOXZBL2o2Z3ExYzhxazVMNnZVV2lEMlVxZk8zN2RVWW45ODNEL1ZmTm02UEMxVERpSXVqM3YvWWUzMXhla2xraXIyRWpYK2xLcy9GMjZYU0xPRDBLWnRYSC9pbTBmY2FaODNkZjljRVZmVUxNai93VU5qaC81STV3Y0tjT3NlZkZKa3JBUE0wTWYyalhjeWpNTzBJSEgyc1NmOVhIbUxoTEFtV3lFWEtWZ3l5VkxCREw3WUpzaHZNUExhNXVBeUgyYWtTd2IzNlFYdWxDb1lmeVVDd3ZjdVNtTXcrUTRaVFMwV2Q2UVhiL1RpQUVTWHArVmJ0S2Q4eGwrODNIRi9TcjhCMUcwWC8vNVQ5NWUyNlllMXhybmVQRU1qRFNrRkpNLzdLeFk5bHhzZmROZlFjTEd4UHdOMG53NFNJaHA3V3ZOOXI3N1h5bkNkdnVBOXBydFkybFVuV3J5K2N0VEdYK0FkZnVhcVZJekREUmF1T04zM2d2MXlQUEZWLzNLTFhVLy9uOEdHVm5SLy9od1dMN1QxVWgyNFFqS21oVVd1M21vMXBiY0duZS92U2VocWZVbUVWUmFFckFRc1RqZ0VNSXoxcFNHYnQwODBwamt4YVhFSTA0cjBpQTdYeklJdGd3R01xNlVzSW84L2hCNjRJMzZQRTNjSFU3SHdVV0tHaXRpbHRaa1RUdUd0K0Y3dVNsV0ZIRllGNHJTa0pqd0xKNVpibVZyMisyalNxbWVPa1pZMVVVdzhMTWdocVVaYU5paEVoeWQ1MlA5VlBXME5OdCszdXdFK0xQMzhmNmREaW9XQVE1L2IyRWZDQjFSR2NaS1Zpb3cwbGdqaUkvTkNjZE1BTElkSklLSFZTS2RTanZweXlUSkRVR1ozaW1HOTYwUVY3NnEvd09waGRhSjA4L3ltWlBLcnc2UkR6M1VIN0NSR0hINCs3anYvNTZmbzNjWXdDN3NyZ1E5eUQyYW1QVzBXVHV2aHdudUxNcXFKMzJvRVRlT0xNZys3QU9reTdwTGhnVGEyK2FoUW1NMHFoczFQam8vdDlhZldFanloajdRSThkVGwyQjg5b1hhWlVuVThkei9MeUcrb3EwWFdHWitZdGVmNFNBam9FVURWc1I0cUpNTUtHZWxuaXNqMDZ1dlBTcFJYam5ZeU9EVnhHL1p5N2o1dGlQcHhBOEQwbk90bitmS0Y4a2RLMGtTdXdUSng0bEpESDVLenZYRGN4ZkdzK3VmczgvZHZsNGlNSGNlTlZkMlVMM2twY2p5dVMwa3dNL1pJWGoxamNlTmdIbWU2VTIycUVHZ2RHS3NUWHppMjk4amhBWncwdCtCK3lnMzJPenJtUk80R2ozODdjS2JRQldnaFZPU2p6c2FSNkU4RGVSakdEaVRxQmwyVlNnQW5CY0pLblc5bnJtZWFWd3dFRm9aSnZ1NXZESHVZUUVBYklGdG9PSlJJbVcxcmNxK1FTRG9tL09zNEExY0hUSWY0bDNQNm51VDR6WUdSNFNMOE9IUGNUeFZsOTJvUGhqeEJWMnJzRzVKbDBET0g3U2JGZ0J4TytDSXhTR3E0OTFaNmJyN0lPMTdqRVRWK1FxcldaRGVoOG10S2pTYjUxbmErSUlnOWVUVVl3ODRSdU84eitlK2NEUHpJMktialpJNHJQVEdiT2I4QU9YSWxtRnovb3UzSU5uYkRaMHRaSHVITWFVd2o2VVgwcFlTVGRyVkNWeWdLOHR6cnhpcEYzVXEySG5QK2NZR0hDRUs5RTR6T3Z2VHRicElyZDB1M3VLMm9iSFM4M3lseUMrTksrNmx6Sk5UVFRtK2NWWWZDRzRrOVV5Wi9hUFpUbi81WnlzeFZvUTdrM1lhVytsMll1MVlIMEU0OFlxRTRGVzA0WStZTEJsL0RCeW13aEtVdTNZZVdmZjkyN1FGbHBuL3NEYk5oK3liL3lWK2QrdEkxRDdWbEVFcThTc2ZPWUhjUkYrckF5MG9XS0ljditmSWtDMncvTGk1c2l6T2lZVHdQRWYvLzRaK3U0YlBzZEZhQjAyQWJMZUdoZDNFVkM2Zm5pWUlrYjZmMDRZT3BXSWNUNmw1bDFyd1lnMEpUNU5jVUdxWXgyRnowT044VGRsR0lWTXRNMTgrbEovZGx1SmtuMWVSTHlVbXpRYkFUMlJmQWhHOTlWTW13Z21oZjV1VTUwaVdQbW8yR2VBcjlGaHNnb3I5VERiSmcvYUFpa3pFWEVmWXIvSlZ6WmYxNldBLzRtN3pDdElqVUo1S3FzRG95SE1sWmpxeWVJS2Vxa2kzZ2xidFJERDNLOXFNTGdGQTc1NGxNbVptcVk5eFEwSWZmSXdhdk5JOERCeFNYbW5zSTB2RkE0N2xyeGxxUVI1bElldnhocFEyejhrcDl1TDlKZ1haa2Q3WXozSnVPUVY5YXVUOEcrR1hqSkVjWHJ4eGF0Um9rcy9kcnYvQ05rRFRqalkvOFJKcnplaVg1a1Q5RTZaUEs3VlB4RnE2U2NxSkt1bVFBcjhyRm8yclhwRXpXb2lxL0Rha1MzYTFmdmJDblN5TVVXNDlYRXpteW50R3VQNEtvM0gxNmxyYkFnU3orSnpFUllmQUZRR2dSYlllYWllSnFKd21tL2w2Vk9lVkNTVTlId1BORVVmeTNrakU4MU1NQVU1N2dBNFBnVlgycW5kMGJUeUM4UWRRNzhBWEYwdUZUYjUzTnl6R3BFRVBGOHFSM2RVdVBxUm9Td1grZ0k2Z3FxSzFjQnE2YThqNkRieCt0ZXVMUkFYbDdQMVBJVXk3b1pBNDROQzBTNlphTUpPNnJkeldJZGczcUIwOHd5eEJvdE5nYTBaVlZITk13Q0RLTjE0SWxRVlI4RmUvVzJkNUZhZDFRL29ERnRPbEx5aldOanpJVGFqV0NhOG4wd1pObnFrbm9PMkYxcGttS1BLanI5cm5hUjU1SVVCWjF3aCtGZDB1NC9mM1BTaTV2V1N3enJjU2JlcDFYc1Z0MFdrNWtydjN3aW1qMEF1S1RZM2hObWt3VWVIazdZNUtjSHd1bUw0ZXZBWGZ0V1Z0eTF0aUtwZUxXb2ZoNUduUUgvOVFEWEN4M3UxL3hBN0ZFYU43YVRScDduenpnYWNQdXNERWZTdllUMGFkTklod3NKUTZtRkdmT1N2SEIzaG85MWI2T3R4MGhnaEZTNVNnd2FET1RMTG5ic1ZCRFNGWmFwb3VlcXAwZnlqcFdGYW52U2ZkcWltZUt3RVVkOWw2bml6SWhYazdpRjJIeUVmOVZDenBPTFF3SEZZVVNEeDc0bTdJVng5V3M2VldCdUt4U2dNNmtKSmhJUFdkREIwbVNZalFtR2pCUkZ0YUJ0aWY3NXJITXEwYkJnN3M3aW1LWVhGVTVIT2J2Umd1bzRvMWNNbWUrYTYzcEV2U2t2NGhSL0VFaGwvVWI0aW1sWGZha1Q4bDNSNlNUcGFPQ3JXSUhpblBkcHlNMTZFK1ZJeXFwNlZlc0ZISnIyMjlERmJkNzVWS3BxeDlCbEozSEJETXQvc2pKVVFMSDhWVUlzQXVrZHNtQU1oeHFIZ1VVVVBEMzJRb1Nvb0Nid285TmRaL0RVelMvQndxOTBnWGFYM05tVURsR3ozcXVpL29rR1FjRXF0RGNGN2pQb0NmNFBwcTR4T0ZyL3JEaWZWSGNuclk0N0d6QVpOUXptS2xBbGUyUk5LdytIZ3Z1SysxaWtlOWdFcVBaQnc4TmFwV05PWWEyUGhSMHFvaEY5cGZRZHdxKzVGcktqSUNUT3ZuU2xJQzhpV01uKzBRbytIRW5hdVRqMUVPN043cUYwSE90YTAxcklTWDdQNHEzOWdqcCtLYmV2cGJLWE93NGZpMUdOQ2hrTndPcE1LOWJ1TmVHVGhuSXIxcWpJMUducjd0WU5Hd0E2RkxPTG9Sbm1vdFRmeXFSQ3lhNVQvcXNHQVozOElHMVlHMHdOcGRkbEdWYUpQNEVNbEszSFh3UHE3d0xIcndtMis4U3pZamZ4M1Q1Z09NRThwSDdBVjZ2OTVrdUd5TnhNTWF6alk0eURnS2g0NmdzZEN0NG9RRmtCYU11Tjduakk5amtiOE5MK2w3WEVpWk5Mby9PVHczQ3BvYUwyU3NkdlVRMGQycWRtSmlrbUFlK1Q3NGtsd3JqSFQvamJkZldNY3NvZ2xaaW9JeWIwQ0tnZXZRWVM0bHV0U1E2WnNGb0JmWjJUSmFQOERYOUZYTytJR0ZLeGhjSzVqQnhVdk9OWVdrcG40QWNuQ0FnYlFIb2N0WklPYUd5WXczVWNhVkc0NlJSK1pyV0VWYTVCNnhQdVkvSHdiYjJUSFZDYXdoVmtiZSs0K21IYmxJV0lGOFJ6ZG9YS0dtSXZtT0tuNzIvMzNFcE1ZMGhmbGdtQmNBWUlpMnlEdHVwbndGYzdtczlYRVdxMVFyUG1FOElkSDluWU9SUXN6Y3VlSldLNXBDR3U4Y1NRc3hFbDhlWTFsSzRJZlp5VGN0NjA2VkwrZUZRMkgwaldEZUN6aFY5ZzVyL21xYitrNWdxUkxzMTlJZEZOeXpmdmRuSkxTbWxEbGhDbUFPWnNLM0U2QWVZS3g0WFdlNFYzUE5ZNWZEMzZMdEczb3lHVTU1bjg1Q1k0VFZYaXZjTktGbXlPcThpNExrMzg3clowa0lpRVRKYVZuU2NaZTlhaUswenROWUxHYVlpMEZhdlhJc29wbWh5QzJPeDRYTWlkZWNFK04zcHZYdks3YjlQaFhIMjJ0TXFxcy9OdWJSSkx4Tms0S0RYY3o4QTB4dXN5UkREUU9wc2Q1TzE2U0FUNTNJU3NFQm5LVlZCakROWU8zdzNNOUFUN1M1dkpqOFY4RDE5UnlyTkpMOWpyYTJzWnphdjFvamo0NVYzZ09QVWNIc1hPY1FvS3VwQmFITzBpV2tGMmFTSmJQR2hQWHhZUm1Cd1BhNVpsb2pwTnFEUkRpYllaLzIva1V1cWZGbmwvaXFkdUlSeC9XS3liWEtVWmoxN0dvQ1kvVVNDS00xeW5PQzcyTFN5Yko0UzU0K1FMSStodU5qRCsydU9yRkRjOUtrWVNlanowa3U3UlptaURPalo1VzJRSkE0ZlhVS2NYTWtEcnNua1VKMzUxNS93RSt0WlJMNmFLZHlBNGV3LzFYMmYxUlpIT0U0Z1pEOEplS3VnZnVjajRSY2MxR3U3UGdwU0FkdUhYY2N1aWtQTHhsZk9vbFRvS0RUcDVkUXFpMml1V3FDUHVwenFoTjZVTlh2S05ZTUh1ekdPMnRJNmx5VEc1bW1JeGlTZDIwRXEycHV4SWRxQ1hkUEloQ2cxVG5hTXFTL2NCODNSOFNENDcwZ2RvKzJ4alJwbWkvRWFtdWJCdVRET25Bb0E5TE1tTGNITmxINEM5ektPMEkxTmQ3TlF2YkpLZXdxZlNWaE9rc1orS3dCZ2d2M2M1enE2OGhOWVN0MnZoNmFIYmxhZElwVGlVR2dTUHlJVDVkc2h6WmhQNFU3emh3a1ZnODdsMmhRcnh1MjNtZTZ0a3R5cmlCckZXNTVMMjB1S2VBVXA0NVlybkpERzBSZXV3R2xnalpmOFlEKzFGQ0lRTHNpUTc5UFUvZUNUdS8zNm9MMlJieWVvWkdjOXlpK2JVRUc3WHhkZ2JMNzlpdm1ydEYzMFZ3bmlWY3hwQ0h6cmJiZmtmQ2lhdnFWMzJ4ZXJJZTB0ZHpYS1oyNDE2S0xJZDZZNHM4L0ZmakNrTlNRUmdlem5lL0w5UUl6NW1SaTJyVlhzb3NBQkx5bDhkQjlTeFJkais2eFpVY0NNYkdIZUp3WDVMUTluby9BY2RqMU5rSzlLZ2NzeXhkdVRhYWFLYUR0ditic0NBSEwzUURiOXZLNTBSenZ4OFJETTNuUWd4L09SVHh6LzM2S1d4SlA3eGNnY0pSYWdLZ3c4UzVsSThPREVIdnVIbXhGNmpXcDl5cm1uUVlwWGRPNWIySVFHS01LTDU5THJsaEx5a014aEFVSXZzNjBGblJaOXFKV2dHS3RnbmdXVXhJVS84bkVNQnJHZ0xTRFZxOUlrWVEvZVJueGh5dE9yZVVWRWFPNnRiYjRxRFE3aW5ZR3F0ckl0MHhoeElrQ0dDeTdGb0ZGcDZOM3FaL1Z4Zi8vNGFSMWp0ckUrZVpXRnIvS3RZTXVrU243WTlHSG9nNnVsRzdiaWlPb090WnkxOVlGUndrOEtNS3FPK0hGV3VaUE51elloOXVnb1QvL0hOYk04eXFFZjVyRU1MUDZ3RzI3QXNmeWhZSm53UWorTW95YUgrdVJISG5icTNOMHNNQ0NPMHIvMnlBTzdINHhTdHdkY2JCRFNic3VrNDBSTWkrZnk5QjhLMmV3bnQyU1drYi9hNG9QTnBRTUFGZ0JlYVVhRmdSaHdObFI2bWJwS3lVZjcxaytOM1BuNGlySmViK2o5aVNXaFpuQTVYZlAwdWlkK1NZd2ZLdVREMSthcG10Z1lhM3AvNUVDVjh6SG5zcXE0ZzU5L0dMTi9ndmEydTQrRFM1OHYvd0lvNzZSZi8vOHNEcGlmeW5INTlTMlAvdkR0aHllTDlDdHNXU01tU3h5c29IWmg3Y0FQS1JjemMzOU1KN2ZGb2NHRjhZQU1SdkltV0VPZjZzOVNGYnk4RTVKMXV2OGU1dDltMzFTQ1AwVDI3RU8xWWlwS3l0TjY3bXV2MXRQUm1TNzRVaHprN2pNMWRFWWhjTDJkZHRoUG14YnlaMmd0TFpxWjUvMDRqQ3pNQitpMXloYTVMbEZOSXdZUlZ5TElUT3J1OUxqdElkb0lISDFiNSsyOXRZc3dvdkdhOE9SL1BCbjFrOXVUV2E1VFdBaW93TE5lY1ZZOC90R3ZTa1UvWFc2R0pHbWJRK1p4QktVMmhLejh2UWEwdTRyeXhkSUZmWDdEVnMxOVNBMUROTGFMMm5PM2R6SEwxamk1N2NtUGZqTWxQcS82cnF6SmxmV3p1T2tXSDZwZ1IrMndVa0FVVks4MzM4WW8xTWt6MjBrMFBkM2R6Z2xubHlsM1c3QVFDTlhhbHJuNnZxSUFDOUduZXd3bEF4VFE0MVQ2ZzNqVXdwZlJZM3pxa0s5NWw0Q0xZMVgrV1pMY3hHYW5oU1hWb05sNmxQSnBPWWF6Ni9VdjZ4OEpDOS9yTVJyTVFER1BNRGxtVEdlZEZiOXp2ZEpZa21FYkJYbnp2bXFsRVBTVmx1WndncW16V0VwcnBZSmdyaTlOWTNCdE83c1M4cytVNUorSjhic1VpMDEwc05HR29RM0hxaVVrVktNbm1RaU0zS0JuUytJeThRUlRsV01lenB2OTk5R0h6bnhBamJ2THUrVGRNWjBTWHM0bDU0Z29SZ0hOaHBqTWRGTmhxanB3c3NEVmR3US82WVlnbmtBcjBFeFoyUnFFSDBTUkMxMDBENkVweHFvSFdmdnZBT0c1L3FEbWpSU3hCeU1uRTVzM0ZkK09UbHE2bWJXZUkyWGloYTh2NkduWkxKRytJazN5T1JjOTJrN3dHSGQ2N2lJRTBGK2FyNmM5Y0R6SXp3eEJCc2k0eDdXSHZ1SVJaRUp2UmdQOVBSdDZFMHBiQzl4UEtpQ3hPeFFDRmxMOGtaOGJjTkI1emN1bFh1LzlGVndET1VKS3RjTjB2RXQvT1dzNi9JdyszQi9XMUlVMmtBSVRLVTlhRFBoN0xLbUdMUTJkVGNNU3AzejRSelV1RjlKN0M4c053aDlzZStlTDZHNVVaeWdqZDcrTEpZM3B4VTRETlJvVVBpckRlOURvY2YrS0hQTXpTUUhWSEl3TVhaYWlsaFhpa3dOTjJXSzdvUitPSzZ5QjFyUndjVVlDcHV4cXRWVnhVejRtcVIxamxBTXJpUGw2UWNaY2h4YkJvdlN3VTQzdFhhc29hK2I3TERQME84NUFaaVdrTjY5dmdQZS83ZEJzTWJqRUp6RVpqZklPaGhuZkVlVjRmMEtnWFF1ZzFiaUlVcGdKWlMyVlc0SEJSNFRLQUZ2cXpRY0xlNnFLaEt1STdZbEdOZEE5Z3dWTDZrdlBwelE2V2Zlc3p3QkJLbkFSZW02TDEzK3hOZWRxN3lxMWhnbDBxclM4SDMvaExscXdOTXpBZW1hc1RtZVRIbFc5MWMyZmVkUDlDZnV6blhvUkcycktORmFZaW80bElVYkFjQUw1dGhGVG9kZnhyTmdmNHU5SjMrYUJHZDk5OSszaHJVVDhrdGsrbWtZK1dEcjY1NUlSZldhNXJBeDVKTUZyR2xzaTdlQVp2WWVVMmVqNEFpQXlLYk10TGgwVjgvK0toeW9acEZYM1BRVkVKM1RTTjdzdDl3SzI1WGg2SlNHZWRkYVNEVFVZenExN0ZSazdzRjRlWjNSRjQrZXZuMUdFaGdPNHRnMGg0Y2Jld2EzbDQzd3A5bnJkaGJSRld4RkxZMm5ET2h0VEYvKzRnMFF1bzIvQ3RRRE40TjRkZkF0ZFkzbVhEOU4rYzhEZngvVUJYNlJmV2JNVHo3cVpWb2M2RWhwbDkxcHEwSHRFeTB5KzZmTER0SmZxcldHYU1lNzc1Zmh2blR3cEtpTmZOYXZMK3NXdGxmQUhucHVGTEFBQS92em1rMVowWU9CbzRTaXFBQUFwZ1BhRTJBQ0d1YVBtSHhzbGhLNms3Z0pKUVUxcjNNSTZ3dHBEYTJOcU1LQVF1Qmg3aVN6SE9kVENrZTA2bmxCTm1hanA2cW1BbkNVRFI1QWdOaG5mblcvc0ZqclJiZlY2bjVjZXkzbTJsNkNFVk5aZHB5V0h4WTFOWUcxZkxmVFZJQ1NmQVRSaHdDaUZxZzlzdC9UMVdwVWpBeWhidld6TklvMmVsNU0wZ0FCbTF3QVRsUTZrbFI5SkZ6UlBlZXY3eExCclUxVGlZVEp3TGllYThDcEF1N3JJQWpqSFN2QmlGaFVKd0U1Q0NXUFBBZHBrTWQxOVBSUUlPdy9kZWhUQlg2M1J1b0gzZ21FQXV2NmNWLzJsTytkWEJJSzk5L3p5SU9MMUdrZExtZktPU3RvU2ZZTnhtRHBFejlrMlZsSXB1ZnNqYjR0TXEzam9LMnhvWUFBQ2xteElrTXBvQlhQVHJ0S3AxaXRGd0FXSUlSMVVERTBFYkU5Tm5XMlRMTTdYaGZUNUdPYlJUOXdNWmdUUkJGZTVNTFFDbnFwQXRiYmNoUkhJQWF0REExeVVoYldQa0FSMVNQbzJsZUYrQWkrdWZkaU9BcUY5Uy9ZZnVId25ORm1iUFh4MjU5WkkySmlJaTVjTS9ITHAyWkJkYkhWd1Mrd2dQSDJnUlZKN0VHc0Y1c0FrSVVFb1Z4RnZMNG5BKzFpUjZBQUFCVW1PNEJkLzdLTEhuOFh5RTByS1BWakh5ZHRxQ0ZZZk1UWDE4a05sTnQ0dkRnRnBSTEhaeW9BL1JkcDVzdnZhMklEYm44S1MyZHlDdlNGR3FsQzVvUjNiU0t5Qm5Wd1pTeUUwY2o2MEhJYUtmcHc4bDlKZ2ZLclkrclNrSnE1VXFYSVhrTDBEZUNNVFkwdFpLU0RRSkRWdGR5YlJCWVliekJBbFNjaW1wSzE0TGVWWWRNVGZ4R2FJUFlJYmVpd3ZOMW5RNXgxTHZWMEs2c3pVZmFCMVdBYnM3QVNiZkM5Q3NFbjdXM0VYY3AvWVpiV3RWZ2dDWDV0Q3dncEkyNFBnM0MrTUV0VWdoZW1uRHErS1E0dmZrK3B4NmM0T3NKNEtBQTRLc2NyRENLYkE1TXUrSmM5RGVob2pBUnU4UE5xai95dWhyNWZnRVBvREYrNGFGckJhYko4SUVjVUhxQm96OTFpdXBXY1BCbjlRa1c4TktJYTh2NG1yTFNsTHA2dXFiTlNIZlpIWnowd21JT2JEWk5uTHVlVmxDVzhXdGJONlloU2o4eHNsNjZpSUI5My9EbS9WTW1CaEt4RlB0Z3dCYUI3Nm1SZnUwMFdyUk1TWTJuYUdKaTh2LzJkNGhpRWloelN3aTdpWEt1MVNYRjBJVUI0ZW5XN2RFSEdRaWdWdG4rcUhIUS9jQlJzMXhhTDE5U3RvZmFtSE1IU2JlQ0s1OGFGMHQ5SnVieXNIZU1JTlpQclNIRSt4Q0l6UzYvL1MwclJRVWtYb2xNdVNmSmdGZFNVVmVXbGFpUmpMQjRNaUtuak1iMVpRc0FCdW5rUG5ZS05FTXVSL3VDV0dJZUhaaWZoejNhRHRaQVpVd0YrZExQR0c4NS9OWDNZUDd5d1ZxUDVERTVjRkZmY2IzZUZVeXJsNWVJRTYxYklOQkxmTjVnODBnRGF4SjRpcWlsSEdUVzZhaCtSNnBla1VHaW9oRk43cERyd1o0SG5OSUEwdDVvdkVock5iY0NGaTdubjdQanpCdzdwMDdKYlpDeU40aVF6V2FSZ1BlanBnNlQrOFl0NGpGRG5jbUNxTktZT3VkcXhYRmlzbGYyS2JZSHFzVElJYjBsU3JZb0w5UFN2eGpWOHVBTHIvWGkyU0lRK295eXpkTldOQjVuVDZuTEhNdTRXK3E1YWdGREk3Y3l5L3RaV1E2ZmM3YUUxWTF0aVpmYXBsWHhqMWNjeUE0VktMcEl1WUcwaDZ5bkNLR1Q1MFNscDlyLzI2Vk41Y1ZVMkNDV2lELzdMeVhoNzdTVWJheEFxVDRFVSttRVFpak9PSXZzWDRIbm1OeWZnOHdFZUVmc09TUEhBejJudWRvR2lIRUpsMFNMNGpDcFRIaXgvWUNNbVBreE5ScS9XMFF3ajR1L0tjTXRQZlpQQWlmelVDd0lKc3Exc3p0bGVVV244WlRSSm45ZUhUQXZUNUs2K2xtS1Q5SDUzeko4aVJON21PMnk2T3JlMG4wUy93d1k3VmtYWmkrMzJ5OUdUbzRGdGphbGNWVVFFSkx0eDZ4bDZkck5WeDh4cmVxT2Z4LzNiVER2WTVHeGNuSm56NnF2UkFlaXVLalZWYlhWOUhMNW1GMEl1Y1F3ZHg3UzBZbDl2emZBQ0pQakY4UFhFVUp3T3VYSEdsMFBoQ2ZYNlpKcmVDdjc3d2dtNDMvZXFKWlhEWmY1Q2x6bVp6aEdqMjF1dWhidFpKa1J5L3RTYXhaQVZXbWdPU2g4dFBFTDY3MG9UQWUvdk1GYVRvUTB3bG8vSUFHKzUxUlVFQUJzcEJZSkFmbU9KSkVQWXU0ZDIxRmNZR0o3WlNnY2JQdlZ4U3U5d0Y3V05uSTJaeTgyMzVuNUpmYlJnaXhJOWJiV3pQVUlrMXBWUGVWQ2c3elovZ3NWV2dLdU9pNktKZzVXY3Z4d2x3REZDdDZNZXNDU1dLMC9mSUNNR0ZaUWNVaHhWZERBYWZKN3NLcFd4bnpNTFNBUVdHcVJPdXVWdDA0WnJZZWNrMmU0bS9meUNtWWYrd21DL2hnZElZQUpydWVaSFA5b0ZSM1VJUHd1NC95Q3NwMk5ORXE3aERVU1BqSktWSDZEanhXMzBGdlZkbUloUFRwSjlNL3I0WUhmNlQ1VURka21PL2VsdlVZVUJ2dWxpbEZrZCtPTzRuaXFwY0FqQ0dYa0NpaEd0SzNoV3dYbnJ1R1c1eExDaUFzZUF6Zi9SRkZuN3g4cldmVnZWRVA5ZWN2ODlTaDlTUkFvYitCa05hQXF6OXU2WG9jcjVPTmczOVFOWHVpNkUydHhablNVWXl3eFgvUVE4KzlBeUlkcUZNSGxjd3NCU2pWWmZicnlZcytLSkdvYmU3M204NDh5WXYvUUhSaVdoMXEyMjkyZUw3Zkp2NTdmYVJraEFwcDdQdmR4UDZrZk4vK0o2aDVOWFVSeHBjR0xZclJmc1BXbHphckJlbDBGOWlLZEswemlvOUUxaiswVkFkUHBQaWg3bVJVYmtIYjNPdVdNdWNLRzJpRGNOZzh6cnNxTVhhZ0I5UkI2QTlGaFRERTB5RFlEY3pScDJ4WDJXK2tCand1K0hqUTJlWVN6dlRHMVd6TXVuY01sUUs1UmVvNThPWVd3di9VRDY0VTFBR0VKREtjcmpRVXJXYUZPZEtyZERrOHgzNndEZ2JGbVFFN05ESFpjbVk3QlpvaWlnZnB3Q2I3bkNic3JLVm1UMk92OFIzaURicmVzUzRYUmc2U1FLMVp2RXNNeHNDcDRFWU9PRm5PMzZqK3E4aWNWVkFzT3dRdFlzMEE4QmJ3VFFMZ3NkKzY2MmFEcnNxT2t4VnFYRlM4S3hENDI3d0s5cDg5V1hZWHJXRFJzV0VaY0RxS2daTUtxWWlhN1N6U2lId2JxdnVmY0RBRkNLeFNmbER2dk5kSmFzVTVEZWdzL2pXUW0wNXQwQzFSeTlVTG9hNW5mS1RLS1hpeHdjY1JVeHdkUDEzMzZ5d01oUksvM01uRk1pNlFaVnpWdUdlTzFTTFczRzNiem1JVjFkalJmcGttM3F0VkJmeTVFUHIwWGY5Tk5Xc1RWTWU5c0NGNFU3UEhZbDF4YnM4L2xqOXpRSW1MbDNXajFDYXZQTTZyakg2Wm9RaTJNNG05TEdpSzVkTVJGZWkzcXV1dkhrTVRwT04yWTdSVkZVQzdPVHpuZG9NbllOdk41QW1oTHlWOUpXbFowOCt2b2lhc3c2N2YrTGpudG1PQTBSaml6VUp3SzBiZE9oQ3k4UUpqdmpsQTF1eVhpWk5RbWxjS29UbVI3eEVVWjM4UXAzSmhFNld1M3VFbTFSdHZZRG1MZ0EzUTBDOHcrS3dHdDI4TTVNMWxOZmhnMFJ3aDhDUW1GWjZYQSt6UzZuQUZiaDY3S3IwT0UyMHdtcWxTS1haUnBIdjFrQ0xsK0hTREdjODBJZ2o5eFU1allRSlhYODZMajc4TkY0RXZ0TXFhK1owUm1paHlmaWxKOVJTc25hYnMwNFJLdnkxdGsyekpOVS9UeUo0RUR3S0VjejdycjZ3YnhTb0lzOFlGcUowU0p5V0cySEgwQk9iVzBiTVhVLzc5TVNBaHRjaDJLTGVFb0NoWm9iVTlvRkkwVzhXU3Z0WHU3RFhUU2lQWFZ1Ukxkeis2eXJDY0Z3ajV4WUVWNnNNRi9OQlh4NEZiWG5mNmVOdHRsN2ltM0RyM25lTVJRUm9hSXVaVzJmTGc3Y0ZLYU1ZNytmRlgxekM1WjV6dXE2aytOT0E5VGpldEthU3ZHTHN1TXMrRDdlb1dyQVJ0STRWYmxuVzU1WkdmVVIzcXJYZ2s3N0FpUkIrbk1qRlJmZG4rc1B6S043UDhkc1RGTFpaZkhZSDBBYlVDMWFOTllyNXQzWWZKc0JjWUVNOWhzd042Ujd2THhITXRlT25CNjY5cSt0MmlpRGpacEIxeHdEODc3YzlINTArS3VubU82cEpqK0x3MkgyQ1NVZis3a2ErNDExU0RqRkJLWW5Gek9TUFd0SThsdUlkT3Z3M0dFMzZud3gvdVU1NVlhQnBLL2ZzajRSYThMcDREYnJKM1pmTlJRU2xTSE5BTmxzZ2VhSElrS1pIbGVrMnV2SEJlWWZldElnWTl3WHJKZit5NHQwS1VDRE55L1M0ZmJzUTlLTmNneXVLRUNaT1hEN0hhYUhmMm95K1FSNUpnQ3FGaDl0RTZDYXBmZldONTZ5eTBzbHMyMEZOeURWQVBIdUN5VVNTUUhLb0w1K1BmYXlNQUlDZVBobHpFTFhwanBhRWtpaEp5NFJkZTlKUnJUenVQai9sQzdhOUxTUHMreWlwSUpjWHp5VWpNT2U5U1ljSXBhNlN1bUtDbEFDbGQ3R3dzcFRSdkxaWnY0U05PMlpXa1ZlU1NSelVMc3FzM0NCRmFLVjUvanJxQlpuQlY4TlpxcU5GSERQbTRkbkNDMW9vT0pDSFBKSExLNmQ3TFBmQVdLeEFWaU0xblRRK2FmbVRjRWpxdVR1c2krUmRQOXpBZTNoZldRVnowcXNrQlE1VXEzMkYrQXVNSGZzU3YreEUxd0Z2Y005OFFORkhiYUJ0NU5Gd0ExYTZXNVl5dDlQNFhibXdWR3dkbXlTV05lSkd4THp6RE5lMFFkbTM1bC9uUVg1Q1lrUGJ6cXd2dXdSSmk2R2x0RU1MK2lEN0JGdGdvMml2UjdQb3E3aVYrbnp1WTdiR1lHM1d5YXNFdUp5bENXTG5SS0pmYzdHTElvWWxGbjc5c3p2K0VqdFcxUGQzRVcrMCtyT3BDRkVPMFBwdS9GL0d2bDdpdk0xcG5LVWlqY1VSK1FjQlpndWdWY0xSejQ3NDA3SElSZ0Nxb0xhM2dmbmdISFdydFJsYlcyVExTdldpZGFhUDVobGlMUFZEaWZPQnpQa3NQbS9QNURkZG13VjEyaml1a1dpOUdhS3p3SnN2bit2dmt2ZEtvaDFyMGZuckRmcWpxdGd1L2VNNVR4cTFhVmRMa1Jhb29nWDhtZUNXSUhaK2V6T2NrZEFVaXo4TG9YZWF5VXJYQS96elptYzFzZVl5R2YrdWRVbXZLRStNNy9BcFFwMHc5RDdMaXhlT0FIeVNXUlZteEFMSmxmSnFMMVJKUlA0dGFSSjdENU9zMEpuMDI2ekhYNml6TnMxb1hRSUliUlRRY1U5cTZuT3FQditCOVh5cUNLQWdsV0ZRS3FaSUpBbWpXU2hrL2tRMVgwVngvblNSNFI3Qjl2RU1Tc1I0VkxJL2ZSY2pvbmZEcTJMQWVuTExOMTJOck5rNllVUThqZ2lnV0FONjdqRXQ3cHFpcDFqTE9sNEwrWmVPT1QzZ1hnQVljVDJ5KzdUeVpQOTBBSDVGdWtYbFB2WC9hTCtCVHQ1ZmhBZS93MnlNUUJGb2o2ZGNPcERMTVFPdms3NzJHVWhlWXNWWjg2RHVRSWVGNmFhS2xBSTc1R0MvZ2hsWWw2RFZ6V2M1UVJIMXJIMHNvejB2RkZCKzR6bEllOEIwTll3R24yVHFpbDRqWjczNkNmeG5wcVM2MmdOQTI5ZStrTFJzVkhiRW9rTGNBQ1ZCS2RRZGhDTTFUbU9LZDZidW9tdWcrMUdUenphVzJUMTVzcXVjbDZaSzRGTzNSbVdLNklnT2c5M3A0dmZ3VDdaTFhhN2tQTjV0MkxyNTRqQW83Z2tBL0lsRUI4Z1krUitEekZsZFVOWGNjNWZ2SUozRHp3ZmxXTWUyaDNNcE0xTU4rdWd4Z1dTRitnNkRHMndGckhrZExsUnEybGk5L1dLd2haSXBoMVZQVkozZHEvdGlINzRYbG9za1l1emtPcktKc1grS2I1ZmpQYUNZR0dHUEtWZW52eDBzYko3MEVrMHVQTmw4NlNDQWh2NXREZkJIRjJFSFhXOHZTRlcxQS9KZUF5ZlVKU3JZbEtJKzBIL0k2WkJNbXlWUkl1ZkthKzRsU05ZNkNHSWZ1ME8wTEQ0clNHUlMzVUVxdlRQSnhWYWdTY1hhZkpvcndqNUZtOVpUKzlDck5sWS9PZjQvUFJvdTNMN0JPVmJUcFdGMTR1UFdwOHQ0ZHBLaGI4dkx0elVTd1hmeHI1TEFyQjRtbElDY1hlV002QVVwQ1FSUHVBQXhSRUE4MG5JTHFxRDBqVzIzeGJuMVUzMVBUZTFWOU1Vd2pFcStOcWloOTZLWmYyMWUxWjVOSXMwd2wyUElrZzFZTjlDR2RoeVdPSU42ak51elE0dGNBbU5RM1NJWWpNUSt1TFU1RVdrbmJiSjRmbE5jcU9PNTE3NS9LNVRPNXZjZ0FHUkZNRVdhMGUrT2g1LytJeTNEVk43bjFmcThZVmx2bEZTK2t4S0QxUzVGdVJIdjdxZFR4ejRPUTM5V2JTNXBBL1FkdzNvSVhBRFg2dlNOOVdEcjVyQUpHN1lMQmFBQy9MdTdXUmwzb0Y4emo5SGhMd1crOGpkVjRCUGQ4Z1F3R0M0TldvU09XOTMzVlR1WnkyTnJJQU1mNjlaVlpaR2VaM0FhRjA1ZllZZ3AxSmpKU2hxajlTYkpBLzZzR1JTK0RGV2lrMm5Rbzl2bDQrT3dMblZCcEJBTkFLWHVkWlpFeFU0ZlFraEpqZjZBSVpFaVpSRG0zVXA1d3pnQVB0RndEMTc1SHdlemJSNWozc21Ib2dQS2NkaWNocUxjMnBtV2tla3QyNzRpb2dseTF3RHJKcmMwVTNOUW43Uk80WE8vTm9MNWhpZGRRT1FNc0kzbFdiRVArcUxoT3IwY2hWU21NUThBQ3YzQzJQb0JoZWZjczdjTWRvbG5rNThDWXd6SFU2MEI0RDRraWI5WW5TWVJuRDZMZHpjUHFNYXJjeXFydldkZDJjeFA0NDFhaUhtMmFaUU0zTTFLVHVnN3p3ejZ1WUVHV1JKYlBNdHkvVldlTnd0SWw2TXNoYmE1b21waDB3L3BxeE5wS2pxMmg3anIzc1hnZmtyVGwzYTlRdkFhbnVOZVNIcFc5UWdyZStObkJ2czVkemhrYTBQc0Uwb2V6RE1Ud1FKVGUranRSYzRiNzUyT3kzYzdGb1FiV3o1REZnRlM4ZzVtbkF0UDZLRGk4bVRSNmYyZitqWjNSdFpObW9XQlNrZzFBcWZkSmVsYUt4YmRITlZPMWkwK2NNNTRpNklpcHI2TFF5UHp0dGJHTVRUeFNnbmRjMDhtb2RlQW5FMkpTbE9qN3FjYTBocEZtcWtpQmJrZzZWY0hhTVNlRHQvMTZUT1ZITFQ3c1pzWUZVWXFGZ2tYVGZtbjFWSXR1bm0vL0pMRTBHLzZ1MEVGa3pUTUtRSkRkUkxBaUFhRmwwM1FFV0RvT2ZZNmtCelQvTWJlUGE0by9YamxxNVhPaERKUzlSb0N6S3R1dTJ6YmNnR2QrWmpZc25qZFBPMDlObWR1WllLank1dE0vM2EzbDdQb1JaU2NsUi9ubElvRlczcHFnenZKZS9tTVhjSktMVVRFT21CVjNwekJRMHdpbEVEakplOG56K2t1OEQreU1NelFEVFdzUHFaWEF2eG1PL2VNTExuSXhQcTdKUEpZbnhBWFo4bldQRGpveWtLeGI2cVRNUGJzV0Z2azlPdnovVFNoM0Jac0FGYnBvcmYyeExaem4wM2xhVG93cDF1Sm1sNnVRWnZqTzBhMTM1ZTZpR1pnbkk2ZGFnZWxKQWxoeFNGMWgzODFISXFhZ3FMVjdzclNaOGlnNkw5Nnpad2RlVUNFaDJPVHlKYXFFcW52cEtWTlRhWmNsZWc0N3V6MENWZm9zZzRlKytiZmh3NEZ1UDRjNWQ4WHJERWJOZzhBb1QyRXppOGhqZGZLVVI5Y0VFSWJZRlRVV3VocDBQdC9KdWwrRlRuS2ZwRnJ2anB2TzRITVZMdEwwTkJ6WlA3Y25HME5BTHl6RUVCRkV2YVlNMVlRZ0hVWU9hWDRGdFJlRXVVVmJFM0xlYXkzaWpSVzZqWktEUHVmK2sxeW5DWHZ6Y2wxVUg5ZEVuZ0FneHFlN2FIeWlpSXZQVkc5YXhzOVphWXprTXZ4Wnh4eWhHOGVrQkFvdldjU3Y1MzNpZmU2L2VjenF6eDFkYk4zK29uS0t6eTNrUmwyTHVOUW1HWjlwc0Znai8wd0NQMTlVRk4yeDNtUHdsSENabXZtUEdsWXBBU1RQbTNqK3ppY051dVBDSFhhRmx5R2hYUkNob1lNelRGZVVTVFM0UElFVUtOMW9pRWRHZFdMZ2dTSWh3Q3F3S0lvVlNOYmRqQ0JFdEZOKzlMTEM0NVhLNDJyM01XYXNtTjVQY3B2WlpxdHJFK0pNemtBaDN2UFpYOUdtZmxzRit1UUYybkhEbmRuZnVtSDlHOExBMWgvRWU4azdvRjNtTjc0c3NNVmZUelBIRlpWekp2OWhMZVF6SzV0ejBncXVhWW5hQmRDbzNPWUJjcTNBM0twSnlJUkl4WFBmTDZFV0dqeVdTb2VBcExkQjJ2clYyV2xQNVgyc1ZvWU9DQVduSlF4Zk9ONW1CV25NNzNiRUdVMWZIREN0NituSFpxaHo1WnQvZ1lTZk1ZZDN4cUVGREk5RVhqYk1QcWlIWis4ZkU4K04rZ1JpQVAzZUI3NDhxV05DczFVNTVIQks2UzlrUjlDNmV2NE84UzQxVGw4TWVDSzFiOHloMEtQN0FKZXhiZUlSRUhpSDAxdHRZOW4wSWk2eHU4VnMyQjdWSWF5NjVvVzhsTGJYank4REo5Z2tmYkVkNHVReUJKUmtReWpHZjlsU3VOSkNmb1QwYkFlRlNGWElyWlN5YlBXYzhFVU1qQkJZYU0wNTJvR3p0a0pYMy9Gby9HblVvSnJ0Q3EzZFpXOGIxSHAxOEJaZkRzbEhmS2VUajBJRG1lZlBKajJPNWprUkJOQ3d3Q3MrQkl5V1lVczFtRlhsVDM0OW05dXVHRXlia244SDkxYXdYSGJKZ2lhcXhxOUF5VjFHSFlsTFJqdW4xZXloZjBFQmpxRlpKRk4wbmNUWWVXWlRrbVFFK05weTFqQk5XUnVaMHRpUU9SZ1pHZDFaVTFlWTNEYUcwbHVRdXA4SDU5TWs0V1p5WVJWNzZJdDJUQ01La1dtaTlQSDlVRG9mUUd0VHIzbFM2Zzc3MlZtbjFlekVBNHNtcjRaNTd4M25jTmFqSUFXWVhLWDZCOU5DR1RvbTFFeDJZSThRdWYyTHVrTEI5ZS9BRGhSV25hQUk2TUQ4eUVDeDU1YVl2blV4YndGWXNpaHpmSm9SMGd3eU93Vk5HbytzYUIzZWQycHArR3pNTEcvZldJaC9ZeWdhZFMyWlhLK3lxTzVOMUpoY3BOcWdmUXlQWDFaelZiaG9kL0NJUk1lVFNCdXVyMVp6Q3ozN1NGRm0vUVo1bytXYVRWY0o2eVZxUVcvTVYvdVM0OE02S3g1ZTcwOGljTXZtY0NUV0huRy9aZ1dDQmFQUDVreXZaanNvZDgrYUZxUUdXOHNidWVadkg5THlST2FKMEorekRBWTk1UVdNN3FFNjVjNHhaeFJiL242c1cvZG11NDUvM1RqeGE5a0htdlZXM0RkaDZMK0ZnWXdUSmpUQ09HaUNJc2FiVFozRVlKUjVrNWRsSVBNVGtyL1FKZWpGZ21QMXl4bGQxWnlJeGRUZ2VUNldvcWdVbTM3Z3BITkJQNnE3R1ZWeVp4RVg0cktleEIxSWg1c1BzZjlMa2o4U3NXVFVLZ1VIdkcrNnk5T2Z0NVJxZzh5cWdkbWRHbTZ0UmFWY2NXVXUyQjJ0V0gzS092VzJXUnRpTFgybkhZdEtQVEhEdSthVU9HaThIY0hDMTl6RzFxdG5GZ2drMzhRNTJXRGRWZWxuTjMyM3hYazAyNU9oKy9DaG1OeHBnUXhkSjJ4VDBwb3RCTytTQ05MODcxVVdaTmhVSFo4ZHFVQ3g3VGNNd3ozeDRzVXJ6K2d6eUVRYVBHbXhEU2MvZ0tBcTJWS0Z5enpqVkhqZXlsUzh0UFE4MFJVZm1JeEJ6cjRrYm1IaWxQdkE1ZmFLMkptY1JGeXZMR2p0ZEhKNkxXc1BVOFJIM3k2a1czdExwS2EwNENUbzFpZjdlT1NqeUZ1UFhhcG9iTXhhRHIyUDRpQm9lZGxNMUhvaVVMMmJ3Q3FwMXZEdXYyaTJZNmxnd3gycUVxUHNOSCtJd2lpUVdqTGxUQkpVcTBVU3ZVSi9BempIdjNYS2wxSVlaQUsveElhcnA5VnhDZUJKOHJnK0R4alhKVlRuOTRTMTJpUHYvSXV3elNLNXF2TnJqREl5WkJ0Rk5UWi9pRG9xZ3F6QnRRS0k5OENpYUhVNG81K1MwMlhPdzlGZnZYa3hsTW9aN1pESGxYQ3BiV0JXd3FsMzJTdFpVcUdRdkp4cU1qOXpFRktEQ0wwM1RDa1ZmSzhnT2E2MFl0amZ1bTd0VHFVK2NSZjNiZ09tSFA3bGxoTmx3aUlnUDZhZkRka3M1N0FVQ25sdzd6N09WdXJUcTQrT1RpWXVuQ3I0NEk4K2dITUJTWkJFRmZrdlo4ZVh2Q0svQThNQ0lZYUxpMlA2eUJlK0RzTnFVNnVHaTVHVURPWTYrdW9SbFpyU1BHMVJJTFRXR1FHZzh6MnBOV0N1ZkY1ejhZK01odTFFeStWRWRpMDhHdnRacG9ndVdEZis3NHdxNHFGWEJ6dDNtMm9yYmZEV3N5WlZuOUM0RW1GMTkzYUVPT01UMzFSa0R3YStLMDdBdnlxOFBqNjRWNGRKcFZ4aUo2MEZiZEY3MlNsWVBHb2RCMVRnRHVjY1l2M0M4a0d6KzFHSUQ2M2JKZWdJMGtSSWxpOWxPSFJMUkpFaE9YQ1psNjFoallMNjRML2pUaC9uaDJicGJrZFlmMkdnbnZ0TnNuczBSMnE4WUVUb0V1R09WN1JlbVdFRmlHZFVTL01qL3AyaWxGalJ4dkErYWpRMTI0WDVhWHZvYzVYeWxpSlpmMVRreUZpUC9BV0RwWis2WTJqUXcwTTIvU2FtdDBVVjZ5dTN6bVk5dVh3SlFxVXJGODQvbXNMdkM5VVVvMnRMWlJBQ1F2NkNxak1KOGRXM2VvVFZGVllZeng0aWd6SWV1bndmUEdES1NDMk5FcWZPV2s2aUcyNHc5bU04bUtWRmhJdTFlMjFpODFhaXBlUGJTQy9UNWxwMWw4OHNocS9NUGR0TFU5RWgzWFU5bG15Uk4yd3NvaVhoTG5pRlArY3lHbzZpVGU1SC9SSU1EQmhoVXNYbVRJUjNHV0hJSTBUUjh2ZzFrUm5JTjBPdGxCWW5mbUt2NGpCbHBLa2tScVMwSGxiN0IrLzk4anA1ZkQ4M0ZLTkhGcFR0ZzlaeDdlN0Jzc2NCOGkvaDg4cGhraUFIY3F6QzJzblI5TVdTUnBrTGI5emRNR29IajZNK1JYWGkrY2FTZ3BoWHhGWkxIZXZpNGVpV2MxYVV4aklkVHVoTTlyM1BrVmozbWljMHVWN0ErRDYveUFkcS93LzVBbmJrdFhBM1UzMEtOQWRWc25iSTZpcXdVbEV0ZTVZWENJcm1aYm5xT1U2Ni9hc3BBQlQ0Vk84cFZWWEJ2US8yVmo0OTlNcjZqS0MxVVZLUW4xdC9JeGUzbTNiZjdIdFMrbzRpTGp4aWNJeGJkcGY0NnJCL0cvMFFoWXE0L2xuMWxTbGtGM1A2Wi9TMmhpUXRrRVllTXYyT21kY2s3KzNMZ0pVMWdoTkpCVTRtRk56dDBycGFiUVU2UFF4VTNFYnBEelk1bjhvZmJvUmhOekxRUGJ1RjdYSUpxY085ZDNNSWhzRVg5OXFPY1krOXVDN3kzWEFPcWl5K1Fjdm82YUhzdFlDeW5JZkNyZjY0cThYdFR5ZG9FTkNiVngwY0VmRDBNYVZJYy9TbjZOSWRHOGxwOHErOWhLSlNzLzV3eXIra3dxOGdTRkpBOFY1dmJpbjR0MHZNLzZ3QS9QZnhHWFVIdit3cnozTFJSMHZNK0pvTWFtb3lzM1o2dEM5c3N0Z1RzNWU3SFBta2ozc3RQQ3BJN215aG52akxKMWZkeVZkYTJFWmdVR2RmM3VjTS9menhYaC9JeXVDaGwxQVpjZFRFRkhIaUp0eVpLb1NFTUg5MTFjckdIVTJSVVkzY0dSdnBCNEFWTEJFNkh2ZXVoSHJMNUpGeVkzcjFFejNxQ1dYTThPVVN2bjdySHFuaFU1U0c0WldSNG9NeFZuYlYvS3hwdER6RkRadzRiZVNPSkpYUnZaSWNabGh4LzBmUGhnOGg1YlJJZzVqcnZDSDBKTzhQaEdLY2M4aXp5US9EeVdiY3psVXFGNDR4OE9adGFmVEx4KzErUDVwcG04bG1SY3Y1d3JrQUtpTW81b2VkenJIV0JURzhJcXdYem9icW1mUDlGVlhFeTVYaFduMGJxUXhtdEhxRDlEUm55MFgralM4S0RsQkdzVFN1ckRXVllaWW5PMUZad0VuSmphaVlYUWZGRHRjUEI0ZW15T2sxOXg2Z0J0YkRFVmxnUW5pUCtWTDEzRitlMU5ReHJ1bUNmdWlycWpmaWdKS3RBSmZaS2ZsTk1lTDBvVlV0ZnRrWmdEdmpPZXBoNTBvTkJ2a0hXdWFkSVNjdDZoYi9TcFpwYnRxcEt3Z29sZWptUXpJNDlQYTh6eVY3Rk9WMEU0T0hjRFhBbzgzK3FpYWkxN1JLNjZjNTR2MGYxTDVWdWJDS2hXQWZ2T3dvV0huN0svYUwyUzJpOFFhSjM1ZkJnR1ZBZzUzam5wcnJsVVZuMHp2UklZeVErbDh5a1lWZUdjV2l6MFQ1NTdIckNxYzdvWUV3c25SVWhVdDd0QTMwSVVOTWliUnBUcllqdVBlZWZqZVVSdWZWdzZXdEplM0pqYVNmMkJmZ211cERRRjYzdFVoWHBYeHZ6UjBwSnVrbU9oNTRIeEZUQy8xekJjWmVlVDlTNVNaYzFLRHphTG9CV3NZcXp0OG1kV1dWTmxtOHkxaVZ6YUdPWUgrSFRKOW5CTnJ3dkpKamNabVYvQ05kTkY4eWIvUUl6c1o5bEJmUGN2cE81ekt3ZXpZNEEydXhDZTRKNldVcnBRbmZWOUY1L2Nod25SVEpEaXNhWjlmV1pxZ0plT1IrQ2tHekVnY2FKUzllMWY2SGxMY0czbXZhdWpFWFVtVS9vV0hMS2J6TVc4OVZ0Smg3Y2thSXNIMHpnVE5oc2FLSGo5bTIxUjRvQ2JIL0UvQTVaUTdRL0l5T0wrbkZLeHlJbEtkMlFPSWdGUmREVVVBeGliQzhKTzh5MC96TEU1cHY1M2R0TGR3SEk3azFXRVpKcGxCdkYxZVd3TnR5aHlNeldObTQxV0VMRFVDS3dleUd6TmlVQzhOcHVUazdITC9HYmtmTFQxK2c5aGdWRFZLRU85SVI0dVlPc2M3bjZsUGFjMVM5c3A3RkVCOHdncS9aUTYxbGx3ZXo2aTFaZHcxM0dUdU5ERGorVzVjS1VMdFoxMytibFNZWEh2aDk5bUF6akpwQVM5VDFiSmttQXNUaytuZzRxeDBrSmdJRWk0UHo5eEo1ZWlsWFc4R0xGckZmbytuaEJ3dWo1Sk5DN3Z0RlZYcFE5UTNBNFRHa3lVSkUwNExBM0lKSkh0b3hJSlVEcHlmZkQ2WVRMZ2dKWG9kblMyVnFmM2tXK3llZy9WVHl2dG51RFY1elNDWFk4NWNaUkV5d1AzTExRNDJVK1ZIaVpRQ0o1ODlLRVFyb3hoalliL2VHTWhqc09LSUtBSHVwSlJJZHNSUHVXNWF3aXZyaTM0NTNZc2ttenN2K3hDeEdzeEhMSWY5dzh5MllYUTFWNGdJYUdTdFVMU3FiTktvdm5LWXJoWEJsTHNSQXVwcWd4eDRpYnVwNkJaVnF5K0lDMGhxcHJYM2g5Tk5EZW5SV01rRmpHZlc1Nmt3N1RiWUMwWjZHQWUzTVZTQzFvQnRtUTA2bnhsVzhlWkk5T1J0MnNTOVVtaStsck1ZaEtrNzA4SFBPK3Z1N2lYN0ppR2U5bllxRjlXUzNrejJDU3F0QjlSUlM5NkdLUC9BMmZmYWt6bEFBa2I2ZzFmWXZNaVljY1gvYmQrTlJXdzFXVGIrU0hxa0I2ZEdBdTVqRVp3clQ5TEZaVGdTdDRJWlhkcWt0MVdWRXV6YXh6c0xmS1JteSt1b3cyMDZiMjNNY3FFZC8yak00Y1FuQTBJZzF1WVNoOVVPKysxQ0tJTDNXaHo0ZzJwRCs2ZDNRdTIzUTlYU0Q3OXNqSHVGRW9KNHdJclF5TGY3Y2pxYVc0K1UvYW9hVmtLQlEvcVpvSWtsRGZWSHRxOEdWYlJneDg2U0s1WnVMSC8xYzJCNjk0V2ozRDNHVnBWM0FsSXplaEFBTEdHYkdtVk05T2NXVjYzODI0L082a2pEeDU0SFdxNVdYa29sTldCV3ZCeVNFSkNaaTdnRGRvUW0vaGQvVXBVcGFETDBVQVZnWi93OW5KbTU2SCtpYVpQVGMwVnlSMHEwR0tTWUR4bkRUSjNIQnFJakVVVlQwYVM3VDluUHJYSHM1b3NqK00rUDMycTkzUE0wV3pIK0hHQ28yQkZyMUE2czVUUCtGOExGeThKSTJ2N1BFaENrWnFQM2l0bTQzNElJZmp6VGYwR0FPZDNqdUdlaS9XN1pnQzdQSnNPcWRYcUZuZGQreGU5cTB4aFFtV2NoVEtqM2FzQ28xbTNNUEh4NzAxU25XYlJPQXdkNjlhRFE3dm14Z09uZHQxeVJMeDlaWUFLQk1pOG1jRXlFbDlCY0FBWk1PL2R2OUdyMkk1NmVqdStRQ1ZGNXR3RU5mbjd0b3QrVjcwaTFuM0FITUJ2WjBkeUpWUGR1ZnV0ZTNMRzJuMU8yRzRZQm50SWxsSDA2cXM3MERmTGo0Y0QyTW1JWnp4c0ZhdHowYW5aNWVPUFk0Z0prWDR1czViWkVxYUdsT0JWTG1oMHFaRkhMeW5KakZCUk1BMkNvQlF5Kzkrckk0cnFhZkd4cXJEMyt2R1RKU0NJZEptdUMxSGVWNzFmZGFaVlZWRmxHQnpPU2RDRzRLekJVZU5oVHZZMFpYVkRmaVpDYy9INWg1eXpNWlp6UjdTT1pDNndQRmRMQy9FTWF3WHoxaVMxRDFPNUxHMUQvSFRzWDc2YWY2bWdoVUhJRml2cVl0Y3c4ZmZ5eC9TZnlXUDBCeFVYL0JVNFJpbEx5ZUNPeGwrVGtYdEZZRlF1S0huT3I1TGVYNFd3TDJKR1dxblk0eTVYcnYvazNpbjhzQ0luK1JSTTQ1ZVN1cjFLdk5aeWZpMEl5Wk9jZCtXVFJvWnVSZ0xueTRCOU5oSHJ1WUlvcDBkWmVoemxpV09pdFo3ZWh0MXlPYm1mUkk4MllCQzFROElWWlcrbjlRcGorbkZKS3kyTHZ0aDN1MmUwQ1VodDJPeVNTMEI0OHZXdUFtSnJZbjc0RnRSNzRDMWZOaEQzRWJ6MVQ5MDdRYmllVHVuaWduc0JRNFFTVVFlRk9pZE5Hck5LVWtjSmV1dHZBR2F0UXlGak13MEk5K1RyanNJTmdXQVBFM1NtMFQwWjdHdktaQW9DSGcxbXlSNndxNElLNUZaSGJKTDZaa1NRKzg5eDJMd3FTYVd3UEJNMHpRUFppa0szT0lqZ3ZBcm80R01lUDZ2TEU0S0hRSzcybmFBNEk1VHBFZEVBK2RvZmNleGpnWVhLWTdaUnNhK210dDZXUC9VbjZtSTRaUXExbUgwWHZyTVJmeEk2WmNaME4xemNjUlgvZ1kvUDBrSnZPMFVIOS9uTWVYMXJXOWl0Yjk5Rlh0VVlScmE3Z3BRUlZzYkl5c2hobkR1Q01YWERpU05pNzh6Rk1hMUNiSzAvV0dLTFFTVjFJc09RbkVweTY4ZFVFc1hpL05tb3E4bXlrWmlpWVJ1WTRSTjJnNTlqNnhvL0hPcVBYMEt5RFpzcTJrNVdYR0lEOVNZYnpyRTZheHduSmNuTitESVlYZDNhTHNJZk1SMnZob1hscXZrdzQxd1c0VVQ5aCtNWHB5ZGpoUTAvTStIWXpCZ0N4VUV2T3RlYkJmc2FsdWYzV3EvVk5wTVZXblNoQnRHTjNlREZzRGorM1Jiczk3RFBBVkJZN2RJV1ltOWk5bm0rMXBVMXE0SGM1cW9ISEZPV0xDNU1yclVjREx6S2t0L25waUxydnVyeU90ZlFZZ2U4bmJWL2xmOFErd0ZjNmpPb0x2bzdETFVRR2UyRGVqN21neEZEdUZmZlo4YyswYzVTRk1GaDlFU3g1bk5KQUR5RHZYdXBPS1NMOGVxT0d0eTUzL0UzMnZnTmdGWXJTRlNhOUorOUQ0bnV6bGdLeXdiUlVIOXNQdXQrTWVyUXZKdDkxd28vVUhuZEhUc0lJYW5jTVZsQ01TazVRK0xOaDRrTWhzZmhDN0ZrdU5WaitacTdHaWVuUGUweGFybzY4YlM3Wmt4MGVnb2lxd1dmK1V4NExoMnFCYUlidDdNTXVNcFFXWEllYisvMUZVTFFaZmJ3T2pBd3ZxQ0Erdnk3M0dNenhCaDZ5U3RmOHJzMnNVSm50K2Y0ODJwMFNRQmxobytmU3hjYXRpU2xTejdKTGdWT0tqSGEweVVoL3V3OXZNQlFTdEc3WnRBVmtZbTFpQlFtUUNTeTVtbWR5RFJDRldNcENDWDJyczRLTnpCa0VEOE1HVmpJSzJESndrUGFtRkxKakh6TS9mdnlnL2h2U0xYZXVVam1jTi95SXlWUUZQNEVYNlVyYXA0M1E0QkNBWEwxcXZFekpVbWErN0luaDZLM1JFNjNKS0x0NVNqcTVmYzIrNHVZL1cwZHNhZlU1Z2ZFOTNCVUoxTFZKWHZWQTJ3NExUanNiV29zNnBORWRvQzErdWJvZVRTY0NLeVFvckxIZHZNL0lwNnFNYWhpcUxCTHM0dGc0N1RRNDNua1NzYjhOSTNkVHlDclBCN0hjcE53OThOTXd3aUpsOHVpbnR1cW45V0t3blFRUUdDVFhneWxFS2g5Q2hmRUk2eUpxTndnQXdUOW5JenRicFJIbUZFREFqNS8vUnNLR0R3b2l2ZXRDYlRPQ1NSMXBxZHV2ZnEwUURRWmdscWtDVzNldkYxN3gwRUJxcmViVERCbWViNEwybUtWbU51M2pxcGpValhZUm52MTZKRGlhUWYwdGlMdHJsOHBydVB4N3haR0lCL2UvOVZYa0FpcXo4b0Z6N25rSXBZbmY2anJSU05VNlVzNWROc3pHWUZLWjA4dnYvSExmcDhGVkEwY1gxMjlEL3BVekc4MUlMcVFrbExtaCtmVUhpUHJHMEdSa0s5eC9XUmlyZ2VBbXJLQ08xNGdzQm9NQkk0UFZ4dTl6VnF6amxYSjQ0V2daQkhZWnVLdW9HWkdXUzhFTkNqUzdhUURhUjh3WWtEWFFWRHBZSWpTTU9ERm9DbHVNcVF4ZHVFY2JnSVdTV2xFVDdnUkplTWZqNnRLeStIN3BlY0pJRTViMGsxeTE0OWpGQ2FwSm9ERUd6Y1BwK3BpOWxhZnlaMHBVZ1YrY1Brc2E0b2F6Ym1nb1ZFODRhQUNvTDhRVG1VU0RrQzZHZW5DMXEvR1l1OWN4WFg3MmhBTmx1OEVlRHNpVHFsdHNNSzRTWVRIazdOaFNBanRCWnB3QkRBUDhvemZZaWswM1A2eHIvY0JtM3pPeHg1QUlKOXlKSERWNGVEYURCMGhpTWNua2tPUjVuVW1raUtxWFFRWFFnNmpKZ1NoL3o0RlZSYUNWcVVRY3ZVbUhVcFVTK3Q4c2QyY3JVMENLRGxQL09YNUdhTXZORHlVOFQ0QjZ1OEt0SEZmNUczcG4rRWhRR3BvaG0yMWJycHVIZXUyMFd2bk8vaXBjUU5iNnpDMDkrU3ZNOGgvZnNhU0MvUDhKWkcrS1Yza2J1U0kxajRURG9mSGdSWllUZzNrQ3dLa3AyZWhFK2hQSGdSWXZPTTRJNWkvQU81K0grMFBGM1FTR3pUTmZ2Q2wxSFBUKzRuQTFzT29OSCt2dmkyTytSeVFpMWx2Q0NmNXZ5OFNWNjVrZU9tMU5ZMnNaK3RpZU5YQjJicldvM055aCtjN29rMEZPTkxxZkRTcSsyVGd6dGRIOG1lOFRUMHBzSTV3aGpJWVFIbUxhYUZndlZoYU5nYkhKYnNDVEpVK1dUM1VqcXNXWUNIZHdkMTQ2cUZaaEhwQnhSNitabktQK2hBSlBUS0kyYk1qTjFEWW9BaGk0a0hOL3Y1VlN1S3Q1S3lHOWFuVmNKdjFhMFkySE5UTzRNODMrc0dTbmJKTFRYV2oxS0kwY3FkU1NFTDdqRzJESWgwSGRySGF6T2RvRGtYS2p4NjBjU3puMnpqanZqSDNmVVUvOEMyYU1YNS9sN0hNVUVvWkFpeVV5YlpEcjF1bEI3UFNzWFJ0ZzZ0bm5INVF3cTRCQTV5SkxkeCtBNFdLWHRFR2FYVVd5VU14QlRVZ0w4M00yZXZPYXJRSUxkSFZXRUFTWjFwNStBK3p0MkVyVk5KRjFZeU1FRk1sYWwwK3cxMUprMEhHaGRQdUtubjdobFFESHZieVlDVGFOWWJ2cHBHclA1S3FGUWpKaHdTQ01VbnpZZkdHVmJRV08vdlR2ZmVvRlRnc1dhWTZDUkFNTWp0MXR4cC90Rmd1ZU1HV1Z5ZitranppSGtCZ1gyelB0dDRzaU5CTUlBWWJFalVqUUxtUWt4UUZyNlp4MUtXbUNSVndhdzcvVzVBSHM2L0J2bjR5K2Z2bnFqUUE2WGtDYU9xWWEwM1VQeEV0TTZlTDUra01FZmZjRHBKbFF2S2RwUk5QQTMwWWRNQnI0NERZQnJLdlJrRjVmTEhrVTBZZThPYWVwRXJFeXBJSjFPSU1vVzlWOE15RUZiTndxb1kvbXB0TGx4MFZMQWRLa3N2SDBjSmxaOWpGbG4raWU4MmROa2ZoakxSZmNHSWJiN0ozWkhGWXRpdzFPajFlZ3FZc0tLQ3VDRHVna3VwNWpGVTRWK0tOMHhNeTN3VGJXMi9WcWdBT2Ribnpta1BnaDNOMWtNWW5aNGwralBLSnNvRXYzamZsdjFOOVUzbTlUVWIvR2RMd2F1MW1ZNFk0UTlsMUh3V0QvMks2aVByL1BobHEwM0lYdUd1Ly9MQkZBOVRJZGNwZFFwaTdhWkZjZ1Q0TWpibVMzbkIvdnZkOFdmWnFxd1JaMHk4OUlOMUNHa3dnbm95cnUvY1B3dW1aMVc1OG84TndXQTQxTGlHR1plLys4MzBMY21WcVUrSU9lemdLblhjSnpMTFVsREZjci83aXJXTklNeDR3SHFRTU9XNm9DQ3BSWG5NV2oySXozeUZjUnlaMitneTJkNy9iR0tUT1VzbmJjbmRZT3lBVGlFR1VRZEFiQXVadFlLNU1pNG9OeFZhTnphQllwWUJsVGJXUW5Qcnh1WVVETXc4d2RnTURYOS83NnZUMThDTXY1RHdvWUh2L28zVE1tODRQM0tIeDdjSmpCd1R3ak5Id2xZSTl6RHRXZUYwZkZ1UzczNVVpdVc1ZlZNMUdMd0pzTlkydTZDb1BhemFVY2QwMGtWRlZaRlhjMWdyTHp2RXJnanJlMnRTajBWUGlXLzBmdjVOdUVWVy9iQmltL1hsYXpoRnIxcWxXNmxhNjhTejltVVVKTU9VL3BzTW9OVlcwZE85OTZBRVQ5VWlqZitFZ0hzeXV2QVpJYVBvWWpMeWppc1pLZVNVbGgrK0NDa0IvcVE3QWVFWGpBeXA1MDhJV3hiUGJmNVdiamtsRGRhMDFBWW1oYnVYem5xUkloV3hOZmNMQVYxT3JXLzBNdnZjSVdoc2JzUUpTYStYV2RKZUdrNFF3YTdGSURTeERBSlhHcWlLYTk3WDN4RjZvVGw2NngzVGlDd25HNHpvaXo0MHFyMXZKTEpWNWJTUktZTDJSaFJDc0lib3lSTktOQ1F4OFVLTTF6WE9zcmQxaU5PWGRrWkp0T1M0ekoxOE55bjE0Um5yY2hpR2hldUhTUXFOdE5IeXdFVkxWV25WMTlRRU1SK0l6WmpQREFuNFJxdUZpV2tuODlxOGN1bnl1aXNBdm5CTk1tdHBHb3BEWU8ycFV5SXoyOEJNbUZoSEdtWklCdXo2R1hoYVJSYng1bzFYNUpld01CZDVRZnU4WjVDWjdsMHVMeDlDTzBiR0c0bUhRNkk5ZmxTc1BnSnVlbUFQNGpMMnpqVzEzVUhrZXJNS0o0L3FWc25CWDJOdFM1ZXFvU1F5a29kek1QYko1U3JtdG1meVNpNmR2WFlueWd6cnZOWERqMUh6Uis5aFBDTWJFYzhTNGlFN0lqUCtNUUtrcVRlekV2UzB4YWtldTNWZnAvQkRmQkIzc1hhL1kra1pmT2RvTTErT1BSN3llcUR1ZGRnRjF6Mm04eWRpc0pZN1FkS0FLaEEzNmtpY0x5ZU9jNVRycG55Y1g1RTZGa3B6SzJ0RUdCQUFsQ3hOVmhRNlNsNWdJczBNV0JwZzR3YUlXdFd5ankvTjMvNVIrYVRjeHkveCsvMk81OXNab2JnV0loZG9DOGVCRmxod1hzZER0ZVNHNlVsR3A0ZVBBaXl3dzRlSU01ejIzUjh2bUttVlRWcmhDSGJocng1VjRZUEZnRzg0bCt4cjdBTzRnNGN4VXZKWW5ZSUZ4cjZHeFVualBhMzZhcjM5R29HcUU0ckcwQ1hBeFhQQ3Z2TFpjWnoybVRiQVhMUzBtakI3TW5rT0ZlNWd0WWJSSzdiWDlnb01OSzBrUElrQ3dVTzRKMXZGZVRha0ZQbHdmR2l5REFvL1hDc1dEbDAvL1REcGdyTVg3ai8xUERpRGM0eU5maGNKVkhxeHdWQXNIUHplUmxMUURVR2pBekNBdkEyUm5ldjJnODlmbkxVOUdnY0l3NDBqWmp3LythcVJVdWtDQUZ2eTBOb0ZKRGNnWU5LZzVaQWNac3JROTlGWmRQQjlvOE4wclVTV0RUSFFCWDZkcnJSdS9LN1ZKZG04YjcwWDE4K2NBOXRIYmNGa2M0YjNONlJ4UWFBMk5ja3VCMTJDaUtGODE0c1I1bVB3bGN6ZjY0eGthY2V0VkVjTXNyeXpSd3JIOWtEbm1hWU85SEV0Ykx0aEtUZjNqYVpoNWFMcmt3UVlVVnByZjdyR0xPeUdRV2QyRG9Kbk9jV2dvTkZTS1BpV0VrdGJCWkhtVTExYlA4NTdpeWtjS0hMM1VxcitZL0R4Yno0dS94aGhoVTJQY2t3L01GVWdWTkY0YW4yMCs2VVZvNmZTTGlzaEJ1b1JqbmZQUTlidmoxR05RZDQxMGxhVEFJVGpDYlVZZWV3ZDhuRFZaNllFOWZ6R1ROelpVdkczZFMwTkU0V1ZINXBGZG1Gb0IzSDJvdWtjcldwaEdRZ1FCSkk4UXJDWjFJSVVuN3lyOUNLemx5Z1BMVi83d2s1aXN1aklvam9FTnlVRTU1eG12UnR4QjMrOHJPRlo1SjFxRmp2TTRiNHFHTmFWeEw5eXJIQ0E2SUc1TWd0YUR1by81STN0cnFidE9qMStTMjNHYngrWDZRYWx1bWN5L3pPdE1WN3F6bkI1WDFDN3pLc00wUlRnZkw2cXpMSzFRUlNBZFJKTVpvVE9mVk1TWUk5Y3NIYTZ1RVltSElJODF2bVFOTXJnUmI1bnA1Rm8reFh2ZTIwNVpLMEQ3OTUvSTFvaGxVQ2YyK3VlakhxUUJCN0N0MlI1cFNTT0FpTVVta256NEdqZURmQW0yMFQxRWVuL2c2RWVSU0ZUaDFuSkNqWEpsZEpNUE5wbjNwTWthdmJVeEg2UTVoSmpVUC8rNEhrQThtZFhhSEhVSjRmSFExTGtNcXRBTEtPOGdMYXJpZ21kVTg2Ym9OYkx4VG1TZmdwd0xCR2VwUFdIQXlHMDVMa2xGRGYrRWN6OEVlNlRNMzcwcnZXajNMQ2dHYkg2TkRpNm93NXFZcFpneWphSlpWM0JSQlN0bzhtbmpOczBkRmZjZzBiWVp4UEp6SXpmeXRSNThWaDRZdngrSXMyMlVId1c4cFpLUzBER0VOSno5MGp4Q0cybElVL1hVV1JHUjQyYmxDYWtObVZtZWM3d0QyMnJOYWFhNnZzSDE4UUZJRExoVW1DbTR3OW9IeHFjVjNGU1dMRWN2bUNRSUJaZmtRQTNTeUR6MVZhWlR5ckZIM3l1V2N2dW9mbnJnZHhxMjE2MURKSk80UXdCdXd4ZjhiMlpVbGsxaEVMcTU0RU9kdHZUTHNkSUQ1M2xBYmdveWxJaWdROWR5RUMydllydVY3bXdqblc2ZlRYOW9BTk1QWTNKY3J5ZVVnOG1NeEVBK25kYjEzVitZVnJPcFJUUW5ncWp5VnNFUjFubWUvSWJueUJ5UU4vUEI5TGw3bmVtVURicEJYeXU1eEJaUWYwNEhLN1k5TmIraGtWNTA0bDl1NHo1ZEgvMjBUWUVaYzZHSUFpekZNYkplY2poUGdUT3ZRNkdvbXdzdFhaeXFyVkNqbHQ1S0dJTkRqQTdQQ05BMWVaVDFOTWRveko1VmpRUDFoV1ZyZ2xlQ053RkRzMmQ5QnlNRXFveDZPZlBFWmovY3F1U0lIRVFTSUpEQVlKd3B6My9RQjl6bXBOWVA2dWZIdGNTbG5GSkY0Q3J5aCt3SXlwaWZFSUdxSThqS2d3KzVCeEI0T3hrVDZqczF4eGUxZGZnRXc0azZPNzF5Y3NtUUxvc0picXovK3QzOVkwdVRsTWpYTUVrRlpDcVo0cGtKem9DdVR2QkVsNEpYMXpwUy9KdXZsQ0JCWmtQcjZLQk5mWVZ6bXlEZ1ZKbTNZQko3M1FOSFA5SUVIMzcvSlgyQUxZdlE2MVBrQ0NQRGZXM0JlZmdkemxzTFBKeDVqbkVLby9NVS9hV2ZFTUNyTktja0QrK0dzL2NMdWFYd011OHlJaFFMUVFXamY4ZVczeDhaMXdVSWJIWCsxbGEyT2tnVE8vbWxtZDAveUZ5dnZKWnRzNDMyTHhkUUlKSFdyd2wvMUcweGhXL05Ba1kvSUdobGd2UGFxZUtqTDdTaUxkbXhsNmU3RS9JVnZzNC92aHZKNEJCV0hQc2JmYm56SkNnOCtkRHhnSWMvamhxenE3cGlSTzZXdjRDWkovNGg0RVUrVFgvY0MwZXF3MlI2Y2tGK29Qc0VtbnRXNzl6bUs5bzZGZTJZcHg3bU5aRHlzVEJCY016MCtZMVlmNVNJUS9nZE55MG5tS3VYWThCNWM3cGg5RXZDV1VoRFpiS3BGeUxZVTE2UzQ3SDlsNFlnY1EvTW1NaDl5VHEyYUVvUE04ODFHclFkZ0lFeGVnWWVqb3ljMXZMMXFFK2ZnejFCNjMzSzZFbTQwaFIvZnBjd3dqSmxSdVRlYUhZbHBGTVZGNk0zd2lYODJRL2lLOCtobEV0WDhKeng0ZDJwSGlmaW94NTdySk0vVHFEM0J3WGlSbjNBRk12ZHYxVEpBeVZNeG4rTmhWMWhJWmdOOWZQWG9BVzZvb3hLVUFrdm9MMVNYNHV4QmxESnR6QkhmYXdtUUkyaS9pS29iMThHOERNV0dsVUZ1ektHK0QyUTk4VTNTbFkrZmlrRjFudFF6Yi9xc0hOcE5WMWxKVFptY0pWbjdlQXlkNEREU1R6bmE1YlJWTXJpM0NVWTdGanQ0VkR3OGhvRkVDLzJ0ZDJibnMxc1Z2OWJqak9BaUhIRk51VWRsVk9xZUZTOHh4dWs3UVNnNElkZzQ2eVd0OVRuOGtGTHp3NmhaMHhrMy9HQmdxbC9xYkNEQi9YT2ZFb3g1Y1pGOG9CWmo5bTVwSTVpaHZnREg4ZUJGbGNPWUpqSktNUHQ4b29VSmNpYTJSeWw5NzlydjNSU3lkRFZJY0lHd3RINTk4dlZpY1Z2QUs1Wk5wY3gyQ1RsM3VmRWxnMms0bnhXT2twckJzdzFRZ0VaZ2VoOHphbCtSc1hPbGFMU1owZ1YwODRnTGdaWldmWUFwZUFVakJqQldaRGowenQrVzdUVmxqL0VhcUtHb0dZbHZabWVUcVl4VkVaNlNIckNudTloclRONXg0bUZOMnJXckdKSzMwWXBBVHIvKyt3Zjg3SGpic29oekEwVE5IWFU1SkxZYU5WZXRBOWV0Z1FmbkZPcnM0Zi83QnhUYlp0N0ZEVS9CUlhwUkpmN0h1RDlCUkc4SUc1WERKSzU1YlAxdWp4NXVDWUt4YzNIMVc4ODRNTUdrMjMwaWpZU1E5RWlQZEg0dXZFMWZ5NXFwWUVQWjExa0dyekRsSVhWeGpyVW4vc21DT2liTWlHY2xvNXFJVVBPMEVpaEZ3SmhFTTZFVnE5THJGY3RBQVBmZ0prVmhMME54LzdDeWQzVjhkelhFMVFzYVV1ZUE2MUVUYWdULzEvTnVKUzB1TWZuSGRxWDRpdUdhOFpmNXJXM0F5SDYzMXE4VGRBSHlXTm1xcDI5NXhZdEVMK3VQdlA3QVVMSkdCSkZoZ1B5bXVNUm5BeHExbjhXenp0OXVNM0dVUEYyb2FSK0RDUUNvQnpLcDdrTGVCcXA5cEFZK2JUQlFpTFRjMWptZisyT21vVFFnQXVCMFkrK0NlZXBzYTlwQ2NNeXR1QWZNaTFFQ1A5d3JPTlFXNWRSOEtnQTk2Q0xQdlhVT2VaeEFyV0F2L3lhM3hXSVNLcHUvdTI5cThmTktxOGVvYm5zQUdZVlNGZmllUUhxOUdrWnlYQ1RlOFBnTDBIWmpaRTEyd3EzYVZ5OGFJT1pxRTZYSDJIeWNzcTNlNVJtTU84eUJObzZHcWZRY2dOWkR5YUlyY2s0TUdKNDhEelBJUjhnWFBIVTNBaHlFK2l5TkExUzBTRFBOMHhWbUlXdGRQSmsvcC9RRHhkSExxTk91Y3NVZlN3NGtuRDJaT0k4Y2xPbktqSk11Ukd6SysyaGZNeHBtYVJ4ajRxT3dMWUR2NDd0S2psMmhEYyt5bklaek5UWFNWcWFxMFpXUmVPZU1ReVM2WFFIZ3U3Rlc1UUtzWTZXVHVCdVQzREszQ0VZU3VaSG9pOVkySDhDcWpTeHZ3YTczMG1PVWZmVHpzc2NiaVlzSDFqUC9uVlB1dmNKMldZb2xPT3BFRDk1S2poU2pGcVh2TzFaeEpLMFF4dEpXZE5ja1RkMHpjWStmS0NvWmloQXJpbkVhcmJQdlZSblZxL24yVkE0aWl3T3RqRDBpQURURnowZTlOanZsVUlFekM4c1ZldUswalBhTTRnTGVIeVhyNGlJdTlMNjFNOWVjZnRSRzFSakpKanBlUytLNzUxcWRjcHQ1ZHZTdThPWXdwTFBjRzYyYU5iSzlpbDJkSXdBUFZ2VWRJZSs2M2RFRkhlZVlsLythMzhRUDZLNzdjMDhoZjdSZ0FCVHhrWWMrZTYvR0JkRk1OVmJ0Wkp5bEl1U1RTcFlqUkE5YmxBQmJwdm1ZYXJKS25WME5BRjA2U1MrRkN1WGRCZG5JNnhoRlBDMWxLakdiOG82UW5XR1V4S0lMNUtVMms3dEljZ0lDVVFMVlcwRFlXeks1RGM4TnNGOEJpYkRPSnFjUVhlZUJBNHViWmJmNnlUc1F0QUo1bGhYQUFpU1JGMHpUNHBXK3BVQkx5OWtVNnNQMlJYN21XYy9UMlRsSFJXb2lSQm16TmN4Z2wxNTd6cEs1cjE3N3BiSjhCTGdpd21ON241dE5sN0lDZHFaRkoySTQzbDN6VzMzT0xMdy9OcnJMVnpCajRSVkhBcGxtWVRVSnNwd3JaeTNwZWk4UVRLYjlLY0xaNFg5MXlKcmk2bjhSR2RuZnhDY3pSWXhtNS9TWlVMdEUrempXeFRuOUZQZkhMQWZOZFFxOGJpSnRkck9UcmdEV3VSa2lBV2FSZ1ViaUhPdmNCRnFKRXBydGtvT09CU1Fzb3ovejNUYjZrSmRBaGgwbTFJamJUSkt5djkzYmZWYmZIWFhobU5FVTBBdmdnY01tZ1FJMFppdXBKSThtVGN2cXc3TVF0NUZIaFRDOFFPMTM5RUpPRFo1UklVMjJCbDJ1T0VlV0JIc1pIUWsxVVl6aFVjVmNBL2lBOG11eHVmc29yWVkrRTN5UUFpZ0lneE5FcGVjM3BrSmc3S2xJakhYclZZRkxqdTcrc1Q4Y2JpeHIvbG9IaUFVWTZkMnl0VExRWWlkMnB4Um1IWWlwN2lKTmozekFlSzRQa09zL0wwUS85bDdBUnpMS25XVkVpNnFFK2FpSm5vSXFrU3BpZ0toTW5jZHpZWUJkVzE2MFhKU3BqcEw1NzhsVkNDTWduSHNFRVFaR0lvbUI1U1MrUGd2OWxSNXpXMUxvUGpJV2pFTlJOZ2JNdHJkenVmNm5aYXZxQlpTOE9FSU1zdnBOMkhMMXdaOXdpeUwxWUdqVDliVFpGREhtcmgwVmQyKzc3VHF1T1ZxUzVZZHlBb2taMTlBV1lkTnlDOGMwbzlIR1U2UitPR1FkdVhiaHJaclNCRld5TlhiTmFtR0ZhUGJ0NzM1UCt3MU5wVUk2UkVFVGdUU01kRDBTSnBWUHJmTEZOZTRqbGRrZm96Uk1Ld3pXRzFhSDNXWjg2SDV2cDZyN3lHSmhvTWZRQ2FvREdzeElHd3MvRXhBc0xOZ3ZJWVkrT1FKcjl2NnJQd1BuTWJLSEczK2J3RlpPVnNhNW9XYkR3RytoNzdqNkJKQ3ZjVnJTTlRVUU4vZHJyVlhOazdQdzFQY2JkeEtFeXNpa1ArK3pDUE1JWnhEK0lyeFQ4bzhDUjlXaUJ6U3d2VzQvY05HcTgydUF3bGdKKzIvV3JiLzFBVXhKNU1BQ3VEaU1Pakg0T3lLNmNKamZROTRxWGJERzdiVTdKdTgvU0ZaK3VHcERvcCt1c01LQWlxRVBja0QwaHpBN1FwMEFSSU4vTlY5aHZMZDlpOTkremNUbHVLMVA3bitMeU5VU0ZaYlZmcytWaHJOZGt1MkZsR1VEZlVKdUwvc2JVUVd3ZTRmUWVLODViQUJ1eWNGR3N6NWVMSTVhZzV2VEt3bm9XaEsyalRpdVczeVl2eU1aRE9HWnlHUTYrTlJqVVQ5dlZOb1dZTGwvdnB4MWx2aGpPNWlaREVmbi9LL1hac3ZzRnNNTE9OenA0emFndVM2TGlxaXFmNGtodW5tU1kvRmR1YkRJNFBVVjVyZTJVbHJYSjFUQytOL3lRWVl0OW9oMjdodlpHbFY3WGJPeXU2bmo3L0w5QmlKZVdYMUxjUzM2Y1NSUk1JNEpBSWRlSzRDblZ2RlRKR1NrSTJRRndaR0xqYnM1UC9OK2lUZTcrYlZlZ1JoeXEwaGp3VFNEN0VNRTY1eEdjcEJOaWU4bWlHNjYrYmQ2djJrdkxSeUpsY0lSQ0dyYk9saUZpL1ROcXZMMHRYNjhyS2UzYTRNRXRtdVVwNndCVXBHT21pcWlXOFFzQlNuSURkZmZHNGxwZUZPKzdVVWoyUHl3RWFoc3pvVzFONUhhQnluVkhHM1ZmTWpyUEozZTVXU1pYM3hKREZsMkZsOXVGZXhWYzA1dURWam9DMVU0V0JEODM1Z3B3TGVvTVptZUNvOUFzdTJYUlRpMmNacFhLemhLeHJTeGZvRnBPUWVsaUdNZjJXOVNKeEdOWlQxeVREdnp6Y0VsQW5LNmI0ZnR4SWJqSU9SYjdVb2JPbFUwMk12ZEZEZmNYSEVJUi9KV093U2I1c0MrdG0zdTlKWmJyaFRzeEVBM0hUVXkyUVEzQnNyZWJ4NFZraU5QNUhhenZHdkw2UGI2b2JBOC83ZTVGVHozRm45QVp3NlcwL3BzTG1TQkVyVUcyUDh0c2lYVlZzYXZwVXZPNzJEK0xmU2VjZDk1bTF3bmxJSzlwMVBRdnEyUDZySjNZZVRISFV4eklOWDV6b29hY2czeTJUSTRpRHFiTjgrYzVOZFV5T1FOcGxqUFBWRFc1OWh0bjZWWm9yYkl0VEhsSUpCa1JUYXpJUmVVZVlFejFHTnpxWGJMTFpFbHlITFpXeFZhb1k0V0NJL0NZL1RQVWhHWVhVL0U4dS9abmJXMSt1akVJTG03UlFPRHp6ai9FNUxFWFJpM0g1aW5oNVB4OUZZcEd2WHM2UnhyOEt0ZDRGTHZxbHE1YXRrUk5YVE5BZERZS0VFY1hCRzhjTUg3OGVwaWpZVUtjRmE1R01yLzdHUmg5SDJadVBVRk5IYjQ1aXhCYlZ2UGR1bUpmUE54SFY5MkdvZjNLQ2E0bHVPQlFrL3RWSHVDSEc4aWNUTkRBeklDN3V5QnJKZmpJcllwV002RVZjWktJUG40WFYyRUE2eEtobUpiN2RmaTF3TmZLUm16SGNKbmVSWU1nMUlaUmJ2UEQwWkx2anRVZ2M5SEF1eUdpSGF4MDNsSy9mRS84YnRXOG90NW5iVEtrTVVlNHQxTmZKRG1GTDBXQ21oUnp5RkhqRjFpbExpRy94WjUvVkRSU0VKSDFjaUE4QVhLS3h4TGFmQUtERTQ5ZFpkY3h2VDZOU1Fyb1VPRFlEdFA1ZkdNZUFyTlB0K1FsKzZEazhoSXQ2dXkwMFhZRlpYUUNwNjNBd1dHYWk3NE5pdnp6a05yTEg1RnFlS01UcS9admlFZXFIVHZZay9tRlppeUpYRGZNY3F2Zm9pYUVxSm5BYnA4bktxYnRoWFM3cS93d0UwdTdSZzVUZDhGVy9xTjFVbkxrencvM2N1akZ5MXI2djlTQWpaSmRtd3U0clNlRk5tM09CYWVlTENUS0FqTDZaQVVJR254bHBmdlNZOTZhMWtHUEFMNW1mZlRTRmtsODBncVZhUFhhWlN5NE9YV2l3RWsrR1EyTVIvYWlSdDE5UVVmelQ5Rk9vUHl1NzEvNW9nYmFPWUJXbExNU3JJNnVxUlhQUXUwR1J5dTAyeHZQYlYrdFIyMmpEWThEZ3NDSVFnU3JyZVRmdC93RjFjY2ZWTUpScWFkL3ZKMFRwcjR5RHBOdlhYSThLeE9FUmZFSVlmSWtNMWRnU1BRZjZuUERjMHErRmg2eklHS09udWpKTVlPL0g1WXlBbXlHSWNtZWRDbldZTlRxaTN3Vm85S3o2SGJkSzk3Nmd6cWZlTUhqS2g5a0lvWVlIdGZvb0U4OGdDSGIrLzE4S2M3UUFJY1RQZkRMaGpyVmdYcW5UZFZmbXBYOVR5VXRrYmxpd09nTkdEYnpMY3NhZm5hWXpjcjRFNTlqdkZrUENqSDFqRVdRWHdSN24rbk9NbHZHa0RieFIydG5KcjAvRHJLOG5FdWJsWERKV2N5UkpwMjdqTkd1MDZTc2lZVXNwSDZ3cHhJK3Yyb1NXR2FUUTFmWHJ5Qm8zcG5INFJOazdGSjY3SkVLMjg4SThERDZMM25OZ2RRaTJUeFNYd3BUYUlROGNXQUxIeW5sQm82dFBzcDJ1QXhLU0hJZHBlajVQbm9ZL1drSmlNSExkNy8zSFdGYlQ4THpHekNKUkQwdHlBVmZkS2JEaWRTY2t0MGFTSVdsK1FrMUloc1VTbm5ieTA0TFBlVkMrZCs5MVM2bVowdlhVUW1GVEU3bWhjS2lDYnNLYU8vUzkwenduMVpjTjVDdXdGOHZpOUFBV0dHZFRrRC82eEM4eUFrUC84TE9mcks4d3BpNTRVV0Q1YVVuS1ZzMC96SHNrYXM0b1RCMHBwMlFVYm9BdmRTNlNPWnhvUFZRem13Q1haVXlzTU5Zd3p0MW9ZV0l4QjAzRGRFN3Q2Kzk1SitMaWlDYmNVN2ZsM2hkZTFmR3ZDZUxzM1N4K29Uc2dvY09mUmZZUlZralNpM2VKRTVqQ0xjNG55MlViakpOM1c0aEVmRVZLMllkRjBESC9XaTVQTmZKUDVSUnUxMkd1Mnd0cXk3b0hURC9BNWRBcDB4OXNyM2NqWUVjdlFXb3RUS2FKZ0JZM0xrQlQ3VXNWeXBIdm5Rekt2UjIwNndCZFRxWjVQV1YwRlRlVDNJdGRFTyt6YlMwZEVYYnZmNEovSzdRWWE3aDVwc3N1VVhXaFdrcVFkMTNEZWRYeXNxVEZPeGNkUCtUaEJZZXhTNkV3Qy9SZ3pkNWNGK0pIUjczMnFncXFXMWxVcUdncXFGOEtHVmZIL2FhWjBtQk1ZRDVtNnp2N1krWXJib2RJci9WU1EwczdXTk5yajNQUnFjbG9NT0g0M0R1NEFjdCtNQzRqcXVVQVJYUFRwRTRZS2t4MDRqUlFJTmwyV09RbnB6Q0ZVNnFmSkhUdFpXcjNTZU92d1dtV3F6RW5HRHJ5YVZyWUN4MHkvR3N2aHcyUGdwWC9xMTFCWmJmeEpQMTRCNTdKSkFqTVdMR0s1ZmlkMXJTQWxhZ2RvaG43S05MOHBsY3luVEUrOXNQT1UrcVVBSzgveWtjYWVmK3hOZHhicHdyODNXN0hGUk9CdlhvWU9Kbm1wMGtDbUR6VWhRY0luc3FUNGpZWCs4WEVHNzZsV3AxRjRLNmwyTmF5UGFWOHc3Z3hCVjhzclVLRlRwNEpibmdGbWx4UHRsSWd2U0xUYkZlczR2RkVqQWF2dFFKOVBrV2JDcVhFRnJoeVIwa3p0NkhacEdvRnV4WFVDeDFjalRqTTZxQS9DTG1RTDd5Vm9LZ00rSUhkVEZtWklCY002Y2c3Ukk4WTljeHFwS1d5eVF5djVIbDdlbnNqTkxjYzdta05SMDRhRm1HU3J4ZGVKRUN5Y1hZQ3BaU3g1MzlGWFRaR0VZTTJKVy9Qay9uMk1kNUtIYkJPYUpIU0hNL3FRYU50NEtkc3JWK2tBc1FpdjVGTHV2cXhDNHRiVVk0eHlLMElwRnBXaWNvN2pXRmlESzh3K3Z6ampJQkJxK2JtSnFxZlp0MnFKenZmL0IyU2xHQUc1ZzNMYllCL1dSR0JnSTBxYWg2UDJnRDVJTGxicWtyYXcwellDbmZtOXNKUHdDaHptL0Q3bUs4U2JEOXY4eEdJRDEySkxBbmYrV3Jwc0hHZnFvWW02ZWVZdUszeVVpZllRWGlFbEQ3VlEwWXdHK2Q1TVFna3Z0SDQvNTRYVTc5TWErKzcxOEo5UER0QkdsdkpiQXIyLzVpWmpPNlVWY3BwZHViemhoRzVPVnNRVlNIMWkvVXJqeXhUcXhBcEw4Vml6L0NKOE5ZQ0hORG8wRmR2ODlrSGkwUmgyRW11aHM3ZkJ0NWtxQ3lzbHA0dlVtYlhNT2VtNzJzeGZYcm1HQ0RmUW5NS1plTGVkc21WdXQ4Y1JyaVEwbWN4Vk5zQ1kwUUZpYmN3WVhuNWRJZTcweWFpZkluVEhPQ05YYmRsNTQ5a28relF5MGZCS0hETlMrelQ3OVlPTmpSc0N6STdlS20zdjFEcjczcmhsOERVWWdYNXpJLzV2bFhJZE50NGdseGY2ZE45T1NOekhVMGtaNkszMFdrdFRHWGd2T1IzNTJSOW9JNGNtRnIyWGpSSUk0R3NWazFpaWZtanAxNGJ1WDlCcE5vejZPbjRxM0orRjB1R29uaWNESysvVy9wbkFZNy9pZHo1TWxVNWl4emdUQlBvaVljU0lIWHpENGJsYXN1UWZtc1ZyL2I4WitLcHZCRCtkc3JMcmhMODIwdmI5cFgzcFUyY216aFFwbmNBbk45YTJ5MEI3RVRSbHJFQUFOVFpHUGpyb25QMDNYZXdYaktxMzdIUnh5Z0tGcVM1MklXRlZHcXVFNmtZT1Rqc2U1L1YwYU80THArRUlXd1c2VXRpTWFXeXhoVGNUWDhIUkVKeExXZ2taczNFVmhzMHBsWTIwZWhmZlk1TWxoNlhZcUdLbGt0YlZmYUdBSFZZTExhWUdYQU1VNm9WTWlrOHVmWTIzZFluS0Y1cVQ3OGVyNDlCbG5UeExnYWczSkhMUlJMWXErN0ZpdmpTMFcvdG9GZFhVWXVQV3RrQW1wbnFwVDlqczIyeUJNMVV1VmN2c0RhVVlJRDU4VllrVDgyQW1lMUdJSEVyUC9yK3JmRHU0NkdTdWRQMWIzdGdYb3h0VjNCK2hCenEySWRJeFFya1pDM0x4aU5sbVY3R21WUTltL09DTGw3VWtHYUw0VndzeXBBb3BaZjdvZmxQMUtSUWNnS1hqdGw3d1k5L0tRa3dGaGxMN2hFVFRiMDR5eU5YSDZ2UWcrRHFXT3h6TldYbkZ2dWhHSVlLNE03d1BycTJOMndvK3FKeVplazNyN1FkMXRHRFN1Y0FhTzB5NHdNM0g0ODkxYmZwUlBQdWNIZnd1TUhFd242REZQdjkxVHM3cjR2ZG9KYUxWcjFTcGx6S1N0RnZqWlI3U2JSemF2RDZrN0d1MXMremdMVys1Q2c0ZThYSFd2S3ZFRFdodDdkd2oya2ZOMWJkYWNHVDdpaTN1ZkkxSS9zU0ptbXZPd3RlbHZiS2Y0QXc5dmpSRm5CVnIwOVp6NU4wdnNvaTBMY3g0STZkQ25vS3JWa1hqbGVMM3FraWVLblppVVJNVUoycUxFS1VQdnQrakFkNWZDYW81WDFqOXlIb0ttUjZzZUVISVFRenFGa2xBRTRrMVhLMzZYSlUyenQwYWtyMVdWRkVETnJyZGoxTWRYM2k1dmR1M2FnVnBBN1FQR0haaldpekJiVzg2TE81RmcyVVNrS1ZzZzRIZURmUktTOXhkbTlJSUZqRURRVHBVa3dZSWorSXMydFg5elNHMU5Ddm50MytOWDJGMktySnpwa2srWC9GeFhXNVVOMTZvZS92eHVvc1hQN29zRXRudjA3NlAyaDdEMDVmejlDTVBJQkZ0anhzWXNsdjBHbnhjU0g3dFRxZU1Ea1lZakFqREkxN2dIbG5yU09MWHpBM2g5TjNDUS9MRVk2VnNQNk1HU0VRY1pkVXpoODlCYUJ1OTlzVzNLODM4U0dHVTVHMHB6aXNmNVBUblJzbytuR2txMGEzME5Pdkd2emNYZmJkTHB6N1REdGZkUWlKdkZHczBZeFdUWVBTMHdDZSszbkFmZlpGWVFyV3Q0Zis0Z1l6VUJod3BnMys1OG11b2FnTktMUEo3cFQ0Wm0vTnZRMEtXNDh3alBXaUdMYXRJNUQ4cnVWNGlPK1hFOUtaSk1pSitYdW9pRDBLeEwvdnA1cDhrU0pGTUM5MEJBaDBVTThKSXNpTmVRV0kydnhqOThUNlcwRU8xdit3SlVUa2dJUHQvZitJdld2WHloK1V1SU1LSzRuczh0UkRKMXExY3lpZWNKV1QyLzhHaVl3L1BISzRSWjc1YTh2TEhEWXRFYzdZekY5UGJtQm5FNmtJbnh2ZjNYbmZTRHFzZDJqMXZhRlFZVkpiUkFYNEMxV2pkUW05b0xWNmNiQnRTN0ozcEZ3NUhrUnZGZmRYM28yTEpzTVhOTStWQytQSXl5Z2RTdmlEQXJ1UE9LYUlLOXN2WXpWUVk0aFl4UmJvYzEzTjMzTzZ6ZGwvaldXTDhGd0crUEJNRWZHWVZHcE9pd0QyZE5NVElsNk9sOWhaWVBrT2dKRFp1dDRtRk1TcGVqb0xZc0k4U2ladUNZRjVTeWZTa2pwenFsejF0YzBaOE5WQ3c4ZVI0aE8xSG1UK25sQllaZUhWOTJPMThOQVUyWFJuVEtwencwRTZndjFob3p2OU5ubDB5QkpESzRPcEcrbFNwL1lYS25TaDM1ZWVxSnhzR2M2TDEvUTRyQmR5OE10eElRZTc1RkREWVhTN2tWdWFUdGF6SmRMSzVzZ2x3T3JUYWZ0aDZsVXhvNEN0MHdSNDhwQUZseEQ5T2l3SlJNYWZlTysxZ2N4NlB5Z3V0aTNUWVJpdERKZ1VlSG5HRkFhbUhwMXVkT0dkZkh6eGkwUy8vdEROdkh4Z1EwZlRMb01INmhIcURwRElEWWRhbE16dldrN0dmSXc3L3h5d1VLRC9PdFg5akxRV041VVNKREYxeEZwL0hGYUpqY015M2k5bGY3Qjd0bkRuZEVxaVBkejVaQTRZcGFRVXBQRCtLUmRXOWl5OTd1NjZCeU5QcHlOVGNFa25pdGNCdmRCYzErTHpjQUJoNkZsMm1ZM2l1V2d3RGlwYlhwbUprRklCRERiVWRtU3lXRk0zYzVDaWpwVXN1dzNBclprVUphWmtkSGw2cTZ4RWpxN1FOMEVQcWJGV1o4VmNzNG5MaXZybUs3UEVPdXh0VFV2b3h2L0FRaDJNU0JXUWNkVDBHd2pyZ3JrUVc4WXpub2R1cE1HTExmY3RlZFVMQnpwQVp5VXlrc3VUcGluUnZGaXNJSVhGTDdjQWh4ek1ma0VBN2JsbTkxTzFSbnpXV243WTRyRmgxZzRrdklZVElCSG5vR2RYcnovL3dIaWYzRWw1dEJydlNpS1V0TktnR1BLV2VCSmMvVjJiRjl2WFhrYTJnRjdnWUE2NmhuTWVxWlpRcGloWmdpd2dxUUlmZkNyRjZ6WlBQUWt5d2FOUkNjNXVKKzdoakhDT0tDRmx4OSt2cCt5Y2lxQk5NM1BXQVlCWEJ5OUNSWmQxY0RFaXlHSURKR0thckExQnRQbGJTMk5NajF2ZFdDSU5GN0NBTHRmdENUZWN1TXFYQm1YYUMybXFNNnYyVlNTVUdWcG8xUUx0VHlWQ0o5VnhXbjJqZ1RRNFBjNXIzWlJHZ1hUdG9aam1WSVlZcVRkMzR4NmdFdjJsODA5Rm5jU01pQVlzbFdmdmZ5REpvYTkzdEFVOE1oL0pjUHRnbnpMOWRpeGdaaXFud3RmanRVb2huU1pBc0dnOEY0TE05VXRxNThhaklmelFhSWFjZE9KMEc1VkJ2WGkxYUhGTlVoVjhWL255RG16NE5WbXpINnVERkdRN2V2UzhQb0cvQTR6V0JJOEt6cEcvVENWMWFYOTZ3RmVMbHJrUFVxTGxpTHpCaHFCUEE5TFZYYk90elRFRDBNU1IrMk9HMGQvK1QxUmt5REZxY2JLYzlnZEpPendDa2UrR1A3VDNHY01Hdm1DY2Nkc3JzeklEVlZFVi9GUlNMbVYwOVZsVFJrZlhJWkNVTUZYOU9SZk5zUG5BMTlZSVdTZmdSVWordzI1TUJYNlg5NVZTTEhFUnJhTTBsL3VWUHl5THBVeXdTZ3NSMmVNR2hqNmdId24zYnJValBzSmY4UURCN2FXay93YWZ0bWF4RzNOaWdxdjBrcWk1NDJ3d2VEU2pDdHVMMElZZFpXL0dtM1JsNDhjVGtFdGV4NE9zaEpQZkVqVjJ4TEVucGVKMFdFT0Vpak9ISUJSNTVMa3RtNUU4bHdlZjlQRDhEQUhLcGRTQjlrRVlhRkFuREduazljcVMrZDhQYVRGUHYyQmRmbW5ML0doZDlQRVpSY3U3K0kyYWlnMzBzd2h0M0p1emZBaFJRZ2FteVBtQkltbCtjSDNSMm9JQ2xzQXZrQmczREJ2Nkdjd2NFRExCS2hGUGcrQnhYM3RUV2IraHdBdlJNRk5tR2dNOU1lMDFiS0RNaDVJbzhtbU9LTnVFZlo0YTNJMllieTEyQlZpaHVQS0IySmEyZUcwdHd2amZmdHlkQnVmN1l5QzBSeXB1QkVvS3NTQ1ROZTdXSnk1eXBETEpFR3p5dDNpVVF1T2hWbGNFUHViU3NZUzhJRGxPdlNIMzM0TFpWMEQxU2J5S0tUQ2kxdUVzSWZDbHdtbHdwSzA4aWtlQURvczRVMXFqSWJCd0V1Y1BWaExTb0ltdWJ3ZjB3WVJtTURlSnYyWTgzOE1GeXpwY0Vtc1BpUnZZMVRWWmpseStJWFdqK1p4TEtYemtsWFRrOG5LdytvZzlyWjRNRXVwZXZub2g5TWJza3BONmN0eWdrZWVuemk0UzRYZ3l5ejVRbXRhWFZicUZxaWxCYklja2FmQ2x3ZmZWTGdFNUowZmhkdVZNNHF2bnNBQVdac1VTMWx0bnpvK1h2OWdIUWZoWCtkYjhmVWU1SnN6TGo3ZWlMZ3B5by83VHlHcVhodWZVNC9EaTE3TzJ2djlUWUhxeFdLOGo5M05POGxaSWpiQ3U2UnZpd01rOGNES3J6eVBhemdlbVlmOWlteVRtN0xSMU9OSHd3eTRhdlB5UUlDeFpGZDV5Qm9kMkVMTWZzdVdBcWYrNGM4VncrNjBraHQxMGlsb2pwekhwQzlzR1liZHA3NUc3TUlMeTladTFiMzNPRS9wOEl0TER5dm9xUWZoaDdNQ1daRDVxWXhkMFZMeGhZeERBQ3k4d3Z1cW9CWVRDcDRYMVlQVmI0VUkwNVB4U2xLTjBtY2J5L2ZkMisxY1IvajhEQThMSG9yVzF0Yk1MMFVPcHlIay82QjI4ZVRGWjNCVUd6YUZCVDBxK1FiMUlwZFppSTc5TytINStRTXppZVhLa1JwTXlQbDVTZUIvN3daQS9nRWNPcGw3WlBoWGFpelhXTys1ZGEvaVFiM1lqUUxWenRCY240ZzJuWFZFWk5QVDFuUm5WeWNLa3BrRS82SzdTbUFOaCtYTnF3QzRpOVkrdFFFbnFGVWFCRGgzc2dEZllxV3k0YkNld3BwUmpJYjRZQ3dzbEFpTmRiU1RtdUJsd1RiVTVrS1QzSUErRnU0WkI1TGEydkl1eGJtZWdpNWExU2hoK1p6N2RZNno3K1J6VE02QWs0aGxCbCtJV3p6S1ZQUUNrajJMbmxoeDllVElPTEdLTWtnRi8rVTREMkV2OHJ0ZmJmOGxLa3ZBbHhQbVdHMCtwbWl6WDZSSnAyL2owNTdpNXExVHlyUjV3VXBqMklxcHM1MVBKOS9yNFNjcWdXK2hWWnd2OU9vMjZuWHV0OU10VnE2aU85ZlpNaERZNExqL2JOdW9pd2JZaWlNTkxkMDdWYzBLOWZxRUNobHV1WkRqTlB6dmlZN1VvYXlWbkp0c29IUUgrU3M0MUZsKzhQaFlEeUl3bWRtOFZROFBkRlRLbS9TSDRwWU5KUHErNzlodGt6cjBQTCtaeFQvQkVqQUM5U2F0T1dHeEVNcHA5YjVBSDkwa0VjUHBtQy96TnlHcHpyVkQ4dDd5eWdEalpHN1lKcUorZS9JNlhCNDJTZDVVQ2k1eVhteUFYQjhyY2Y0NUZpNTQwS2E3ZFBqTGhKN0ppY0dVMENUZjJyQjczdlRtaXNlQmxMT3k0dU95VmdVZVhMYzdPNlJsWkNhUDgwME5vSmJiTlpXY2tVSFZQbUV2Rm9zSVVHeStPNXRCMVdqaVBBOTV0a0RZcytwbXcvUjJzajBla2NOSW5OWnlPemVUSXNCSUFlTEl4ei9PY200R0tPZjR5TXdCei9GZjZNUkFoSTlzS0lVUklla2IwVlpkNFdyQkwzV3BDUVpwRVNjTUdsZUttZ0JtaUphbEJDY0t4c2VaN2pjbHlNOVR2NitvWEwzbGhUcVM0cnNTVFkwMEdZMWNQcVg3TlppS0hxNVNHU0hXa042NGpBZVhHTkYvRHdRUU5BVkFtMU5CWDJUWXNjY3FscG53ZjBlQTJ0WFhOb1hsbDdVcXNxalJOa0tJdm5vaGsrcnU3Tk5nUkJTc2huL3NWMi9DVE1heE5waldhb3VoV1BDRG03ejZ3NEJBVEF0ZzhoUDhGTk01eUh5bnRuTjROQzBXa2YrcGpvemFwSnQzanlIeGxGSWQ1MlhXdnhiUEMwWkVGV0VWTHJGTVFKVlVuTXV2YzE1eDgrMlZtV2Fick52VnJCNjl0bUhxS21XT1Q5bDFCZWhSTktZa1RFY3hBQ2wrbU9uTm9wQVFFM3UzU3A0QkRZa3hXb2JXL2szemJRWWxBLzNKNlM3YXZUcDVkMjJKME1YQnorS2FZNXhtV1owTFdRTnZKcjBIMjd5SkUyVFd6ZDRNTTc0eWhmU05WL0EzamhFdUw5cVYyNURXOXhkbWdpeFdyRVQyUzdQNUJJQXZYL1NJUC9QZXcyTStMc3o0WjBVdHkzTlhYSFlRM3NGMFlKRGtRVHJtSUFycWNmS1o0M1JMczVsY01NUEN5c2lXWGw2YlFPdi90c2pqWjMzaE5hUWZHZWY2SUFGelJGOHdiNkplSDhGTXZpM05iTDhXZCtZZkVTZWtaVjM1d0NSZU1lOVdKejFUTU5KZXVHTFZDdWgrWTNQanYzYTA0ZW5zTlkvaW5kZzZzQUs3WHFXM1puU2V1MzYrN1g5VnZteFJROGgvaDRoWVJJZHJORy92SFRWOEphWEdmdFFOSU9HQ1p6dUFvV095K1VPeUhOUDFvdEozaWZES01OcnRBeXlKcklkZDJTd28vZCtyNkZHT3QxdWJIUEtwSktSRE5OaFFwblJVejlScmp0VmZKaXNEOXVJUGFQRSs3anVlUXZYY3ZCUC9jUTJnSDdUb2NUOTdLelBZaGdnQkZFYzBVdG0wOE9waXk5ZWM1b24rdUZIMWUzZmx4dWJvZVBma2pKd1d0RG52Tzc3am5TQVBhVEhNTXU5S0p0RGFtbGdWM0plSzlEQ1hZWk1vMnRUemtqQ0NSQXA4aCsrOXZoQ0w5YUJVTWRud0gvaTRaSk1lMkg3Z3BDZ3V4RXFFN1U3UWN3a3NhbjJEUHhQMjZ5dk83Rmc0ODBPNTVBYyswQWJhUjBrbHU5RzZac3hJOHhTRFo3RTkwNHBlTmZTVUJSdkhSdGlCVmxRUnRaamhQN1hCd0dYbit0eDBmSWtyM2NJeWo0N09oSGZQZU9BMGhSL0QrMkxTQ0VQbURHNVo5UVViUk1MNTl0a25HOXZWWTFHQlhGZHMreEVOMXV1aFlTUVdJSmpqUlVFZDZrclhwTzNDc2xOSW56UjlvYjZYKzBYZExseWFWT0IwNENJUzZvTm9kL0k1M1ZFdkIzL2lPbEUwY29mbkJwK0RHaHBCR1BlQUljeHlDVFF0NVdWT2Q4NS9aQXVhZ2EyZFVmc3dNRWloYlZ3OGZsclZNQnFIcWpRYktocGU0TDkxUG5HV2VaUjJDTmRuQWVKN0VnWXc0QnV1c1JmRW1MbGpxVTQ0Vzc0ckJGcmZvdzl4Q0tXS1M1UTg5WUk3dm11MDFSakZ3bWR0YndQVm56S0pOc3dYTnJwZFhqRG5kQktvQ1FrNzArK0NjZHhSZnpEL21qS1BLZXJlWHFlYWFLWGY5L2oyaXJDNEp1UFdvK0pveUJJaUcrR3F6ZENvQkxNMEVxc3o0YnhxL1U3V1FtOGwxUVV1NW5VV2VMU1F3Mlc1NnRZdVZ3bzZQRm1ZZE9kQ09pK2xsaFZ0VmQ0U2pySkxJUUtETWwvNHJHZkZ6YmhhUU1ibm11Uk5vWXpPNDM4R3lNc09HYUxXOXBxcFhRTjNuQmp3OStjY0JpK0M4cml4UExQQm9ZdUlHeVRKRElCaWZCZUc5S0hZY0xPbzRlNmttWHUvbFVzeVlsUUtRVXpJeU52ZFEzK3RlZ25xdWRZUGZIQmFNRm1IRHJJcldkNSt6dFc0bUFHTk1CdVR1b0pwbEFIRjZINWlyR3V6WFlTZVZDRVoxT3RVUFBPWWlPTkY1alljQUc3dzhBVXVWd2Q5RDNkTjJqOXE4U1BuVGVRVnYxVkpzVm9IM3dzQVY5K1NmSWJYc1NiZjBCY2k2TnZaWlZnQUNlZitVSmsyaS9MZFZ1SU1lN3F0cGczbkEvdHBnaTh0bDN5YTFXQkdtVVVnNDdCeC9wZmZUU3hnVDFQY0haeEFvK2FFYWY5TTVnMEJSLzd0Y3duQXE3L2pHelFxQXUrSkVoRWFBOXQ1WG9CNnRpNytLOUNZcVo3bXJqMWRRc2tCWWFtZ21jTkxFY1FxTEVlWlZqajBHOFh6T1hueWo3M2luUTF4cU9LSFZwbjVsNnBnTEdZRVZBT0dtblBKOG5USHppQm03YWk4UXNqOHJ2S3o1a21GclZhU0YvR2VVdldrOVo1RUR1bXZ0V055SGFiUThpdlREbkxEaEU4K0tkTld6MGNLTzZlZm9xY21XbEhQdUdialJnSFdNTWk3V05nSWtacmZpdUtHa2JEN1orWTlFMHZ3Wno3dzBxUFM0SXhLMmVaMGFQblBwNXpGRUl4b2NjREJ2RDh6UGpnT2t1WEtROGtIRXhxenozM1F5YU5QM2RNcDNnaUZMamJTUDd1dE5uZlV3amVaQ3kvQUp3VFpmaC9JeG5XR0wvVjAxT1BlWHZWTWRZcU9QUXlqS3F0bU9aRkJmaG9XYXFwM1VCVlNQNnVZTnpxZVRkekdRSGdaNFk3c2IzVE1qUUNoaG13MlVEaGZoczJqdE80YXlET3VwN25WRExJNGpnWXlybExqdkoyd1VjTEFCVmVjQWhYMXlzbU5IdHRTRFB0aWxsMHhOT21YdmVENzg1WnZlT0x3MGtOQlo4K2VIWHh0NWVFcjlYNnVvRXcvMDQrSy9zbldwVlgwczQ4UC95ZGt0Y1R0Q0prdUU1L1M0Y3A4WEdyck5kQi9GRVJpOU4rYUJia205R3d6YXJZYXp1RHYrZ1RzQWduSVRxczZSL3NySnhXZ1FDbldueVRYWFlsaTJ1dVRNT2U3Q0swdTljUkxyQlVpcGh2UXArZXVMT29ic2luNjQxMXpoVFp5L0hlMmpWcVVCTDdlWjBZN1FSNUlBcUY2ZjY5NmcvcHpwZnZHTDdoNGhpMDBMT01UUkdacW9nZGVDVTcyVkViK01nUG5SWURYbmRzQXFhQlZETWZtUEN6S2FDSTNTTXhKZ3V0eVd0UnY1OE5jSnppQUpiTUVlNWc3R0JBQUVWbURtbEhLUExReXJuVWJOOUZ0V1hCcTN4N3d5YzQvN1lmQUZUWDZJQmp4S1Z3YkpEcFd4R21rZFFNWnlKUjBGeGJ5YldabzQvMC8vd0JINlhzVXlEYWhIWGZ6OG1sQjlUdGZRSU54bVU0TFcvQzI1S3FWWm40aU9NM05NQ3UwYVk4Y2p6RG1zSjJtTTkySFFtRFlrdG12cWI3NEp0RGVrd3F5Ym5MWGhCNExJUjhKVVM4cEEyOGpObnpCaCtXRWZJZ1N4UTJnbndNS0htT0tGbU84YVBWYjFRRm9Sb0N4Q0kxNHQrSHVKWGNoTzVVYjZHZGsyckxPQ1NOSnJDOGtoSTZ2MDlEUU0rNW5oa2g4am9WcjhXcWJPMzZGMnFLSnh0Y0NKSnI3amY1WXlkZDlpYTNzUWFENVRIS3FsMlMwSmlzMFZvdjBMS3NaTStEMTNHK2syQzc1NmlMUTV0MldzQWx2V2lHREhJcEp4R1FWYitFOWJiaXFKczJyV28rd3A4YUNka3ZRUmEyUTE2OTdzUG9sNWtpcDh0K2x3Sm5XVTN6TTNOdXgycGZERGF4UlhkT0VjWG5oTmZzU1diaWlkUTZTMEs3QVZkQ1lWdWJlUXUwTkRwcmV0clhmek85N2YyWVVEUXNoTUUzS0pETUlHLy91YWtpQnNjK1dmeFhhNWhUMEdTZjZGeExaOUtibVRpZkFtL0FYSHFFVU1yRk9RRFlqOFFZZ0oxcTlWRTd3UUNtVG9aWk1Vbm1kSHZyNGNuODg0SXFvcW5WZkhJbzUxRVl2WDkwekVsWGpUU2tsRmczcUQ2SHplSDdYN2ZiNkdHeUdpYUVQaGVQaXBaU202SlB2WTNMcE1uVmdjeGZ2MEtIVngvOFZXUWd4Z0ZiYmVXc3ZReDRKR1ZiMmJyOVV5NFdpM05Tby9NYUM0ckZLUjVVbXlBMFhlSUtiZGFkK3ltODRBRXZJTW9rSW5rRW1YRWtOdWF2cWtRaGk1eEUvWERINW90dHdEejQ4ZGloMkRlc2V0eU9OMk5CeVpucXErQk1meC9EaE4wemRaY0prTFR0eXpicHBzMnBMWSt0TzlqMm9uMENZM1I0ejZTQTc1d2kzREw1cWdvY0d1YjgyMXhPcDFzKzkrQXhQeDBNUTFJSHp5WE44WkFIemJWL3pQUmFadkFQK25WYVlHMFNWVWkxcS9ESWl4VFI2VGNyZURJNU04VnBvTk9jVXJVNVE3ZVlXRnBPRHBNblNJeHR6VzBBNzJHaGhTUjB5SzYyejI0bHVlOUdMV2x6NG9XbnhXNlNuSnp4dDVOV0hnL3ZxZEkzQlJBTnpmajJSWDA3WVNiaGFyZ251RGdoSmJHY2E1WDRiejczWVUyVExiWDUwQThQOWNMMitCcnQrY2xNYVF5ZmdOc2lhWG01eUVJeUc5aythSUtub2MxSFo3VTVkb1RPbUpnbWRXSVg3K0ZWSmtmUmFxd3Fxc2ozT0FvQXZkNlV4TVhLZFo5Zk05RlNwMFJIaktpazlxanZVdHdCQkhad3kveG80ZlJnUFlhRmVNMWxNUDlYZldKSWhQQ3NJck8rS1U0dHgvS2Vya2RQZWxTdEQ2U3FYcjdUZXFLTWg4czluSW0zekhVenBreXplVHpxUGRDOUNKYTkrQWYwaEtETmFCZkszS3ZpSTlZemo1bDFJUmpkemo2S2ZNYmQvWjhzNkE1MVN2VFpEVndRaSt3K0ZOMmFPQk5IR0lRcWE3bXBEOWtIeXNJUkpJUFdjeFc2d0VLaFNjdFVXQ1V4WlY4MG96cGFjYzVDb0dHRkt2SE1jMHZnWVdvU2VtV3dCVW9hSk0weU5uMzR2YUtVOHlhQzVGTVBNZjJRNE9TNGJ1MVEzNEZyb25GajdPSTBKK0FQa0g3R0thZlhzKy83ZTZMUTBZZEJQcHVCZHJRQ21kaEtqR2xMbkh0RWZnZ3Q0eXY4S2ZSc1JzMmR1a0lFNDVZc1Jqam9YNEErYXhtYmdjWHdSSjNZaE03MXpPdWxVMlhJTHZQMzVxc09qa0xNWjJkb1lIZ040UlVlZmVDNzJsMzM3R0VaNFhhNU10UEt2dmdnbk52LzNZV2JSUnp3NUdmTEw0OGhxeFBwdnVJOG9UQnNNV1hrb3A5RkJFV2VUcit0VEdwK3k0R0pMMlRFLytILzBnSHE1YTlad1lPcmFnRG5NWlpHT1JZNitLZ3gvMW9nL2FjT2JOVGxjU1Zpd2lCK0VuUmpDc01yTnNWMUJNZVh0YjFpMUlqd01NMGxGNGsyS1RYSkJIaEpmVWE4N2FheG1JeDViZGdzWkk2Tno2ejZOL0ZYRjA1bklxK3JVWnhiQTZ1aVdOQnRMSk5DaW14TjUvS2JBSWliRGhMNXhyWXp6ZkJhemluWTJJUDZ0ZXcwRkM1MkFoempXeitzNHErWmwzMFROUW9NU2wyb1gwQm9pTGZqamVHRFZWd3R3K1d1ZkN0WnhTOHZXUzlla3BGRXdSUVkvSGhsaXlDVVdiWGIvaE9yNVVUNFh3YnVDaG5UaXF6OVZwMkw1UjNGdFdJeG0rZTFMYnFtNHBNS1hHbWFyVmdQTEh2dXJFR3NkNkVOL2lUYU5sZHVnRUdob0w1azUyc3RwdVptUjVGamhIYVRSd0VVd0JXTXF6OEUrbmtmUHdBUkR3N2J1bHV4VkNzMFFaVWNCdFdPeE1ma0NFT25hRHg3SmNORGl3WmhJU3BWZGx3TVBhRFhHaHo5L3pUMS92MDhmUUthTHJyTzBiV3U1WUtXbGhNYmtZNS8vc3M1alRnUDc0QTd5Q0VOWlc2Z09PQUN3M1lOTkVkd1NXbVU0b3JhRE1YWVd5YWR2OXc3T2hVNWpXL0hGd05sZzNMS0hna1R4Y2VTcmhtV2lCbTVFY0JLQ1F0Z3NTZmRkeDJtZDFQdzJCaG9ObmVrY2ZhSXUvYlpMalVneGN6dDJNelRocGlHRmRVcWJsTjFPaTNyazRTZUVUdU1CTlpyY1BjOXJjVGFJd3FaL3VWZDhoOFltK0FZV25ET0RqODU4d0tISGViOEF2V1RiM01sTHZvdW0zWkNuUmllK0wvcmliS1pnNFpibnhaMld3aFo1Snd0Y3h1TG1IcHc1akkybWNhZmpsNnFtd25LWVI4eGtSWjRZQ0xlemNhOTZuNjV2WmxONmFmanJteTJOM043YlFMTHJuM1k0T2c1VVN5bWxuZWdkWWpYRklyRWhsQTNDa0NOYTBrcjRlVWJYQ2NTWCs1QW5obGVvY3V6UDREY1kzUXN6dElwam1JeFVXSU50ZEIxKzhVQ3hPSzh6cUhvbEsyLy9rUVdIS3pRYUhqYVRXaStFREthbEovaUNFZHZhWWZ2cGhzWHdLQ3dNWXI2eVN0ajZWeE5wYjlyZ1diaGwxaWtnSmp3M2RXQW43LzlWdjVMdU5rV1dQZFdaS202dWV0elF3NEw2UjdRSzJob3R5SHJtYXJ6b3ZDbEk3ZHVGS2lRVkZCbUtlcHJ6TjBWOXAvUzJhK2p5aHU1L1pXd3RJQVJNdk9UdDRqT2xFRTFvTGNYU3p0UmxTRXh1cWx2b01WZHJOb2JZaGdLL2x4K0JTZkZLdjMwZWFKTFExallqaDZpUUF3SFBDNGtxSkI3RjlzaC9Mdi9oWnNFQm9zTE1kcCtjelpidzcxaENZU3JjU2tNWlZxOUV6eWVpekI2Y1FGcnZRSkVocWFGNy8zak9oMzBRcUdhRzhwbHhLTTI3cHZrNUZ2NFVIbUhPSHQ5WWJsRkdNeGNrMmw1ZXhrTDJXa05FZGUzZkp3QUV1akhlM1pKWTNaTnpYc2VwY3hEOW5yaVpVcmRPNkZKc3VCR0phblplQ2FmRmk1TnN6eHU2cG93ZU13dVZEL29BUW53NW5RSlJtQTRxQnpiaTFDVHVBbjE0c1NGb1pxVkdqd1FPTXJSOXlLRU04OUJJbmhZSUNBYmlCeVhlN0VYVEhPWWFOTE14M1Q2QWJNd0tmVnBSYklNbGVKUExnUXFLdUZCMWFsdFE3RThQMUJaNlMzU282SHpORFhrYmJrRnhrSzgyN1ZYaEthWHBwMzNOcjlHMi90MzNXS2ZRSUhmeWxBQUtlb0lhOFMrR1JWNXhlYkZpZm9vOGZTbzlMVVpEdUVsQnBRblJTcG94Q09WRllhVmRneVpzZ0k4TkpyUHc1ek8reTZDU0ZtdERsYVdmaUJleW9nak9IWnNiVTNSL0VaYmp4a21XMmJaMm04b2pnMTlyWnBKM2t0ang4MGZNOVh4LzNPOW1xQTFqa3FrYzd2ZkpKR2xZblpjZlNuSU11MithUytybFMwQ3pES3NpMzhDaDlvMkloOEREY1B1cmIzdlJVSllGQzVrOUtRdEZsT0dCdVBhS0NtN2hucXdsT3hQMnQ0eklOTkNHZ0gzbi91K0NnMllKWmJjTW5WOHpXWkc1bDNKSzIwT2VCTUs5R3o2VVYyb0JVT0g4RTVZOWZ5WTQweDJYZ00wZUZGNnI1UkNiTWI1SGxKSGNxa0FKWFZoT2dBSWQrWnlqSVdOMGRRazhKbjhIcXFzQmZPditJRzhvTE8vaTcreitJNnJqZ1grS3hiRExGSG1HbS95RVBCakphMFMxV3FXWEVveWkvTnRPbWhiK3UxZUZkUDBKRk9BRWI3VXM1ZXNxTEUreWxKY0lXcFJhSGgxR1NBbXFNekN1c1FrdDRRVm1TWkZvVitwbHVzVUlqRVlJZVBGZ3didkZaNnRLVDE4dnBLbWIyTC81WTVyL2hsSEk4TEZvUWZiVG1Ub3NJWVJOUHFBbWtUT1UwdkNtOTdPMU9OL2ZXY3lsYVIzNWZPd1JWOFVRejlGNWJBOWUyZFo2NUF1QjBjTVVYSDhEdjFsOEJCN1BuOTJtSTlyZUg1ek9IK1VRNEVRSkFzNGtlVnJReEFGUkgwVFpvdGRlMStxVVBzWjBqQ3JCNHNJdXY2NFhDdEJPNGNEMmdzWXQ1ZnAwQm5BY05IcXRvdWo2YndBWHF6TTQ3d0ZMYmpQV3BkWEdzdVdYMU1aUGxJM2VQTGt1RWJ3ekdJUlMveGpnQkVJWlljWUVJUzUvRXFlck1OSkRWZFpwcHYvdHhhT0ZieThzZ3dJTW1mVm1LWTRmT1czMEJra0xsKzQySTZQb0NmUnBmOHN4cWI3YUd6UHRnREYxbGR1bnlSUXlTKzJ1N2lNcnpSQyswR3NSaDdkbktVVWpCcDlUektzQW1uMkE0bTd6REJKQTRqS1lCVHVxdzNjNVo1UzdzM1J3NG5zSnlucytBRGFna2creit0bGRWd3ppVDhhTHFselprU3RBK2ZGWGVjeWJnVGpYNjhZanJBZ0ovcm5GYW82a29LZjFqQ0Fta20yVS9BbG1ST2svWjBxSlNKcTRnTW9RZDFKeUJYSDdZOUVBZ0JISjBoM0V4MUpXY2ZVYUQ3SUN0dDh6SUczQjNIZ3htSGFQMkpSNlRIdVczanhNemx5c2d3WGN5eWJYOHhMMG5LNEhZYVI5cXBWR2R5SzlJMERUcTJIbDQ2ZzQzcDFDazVRcFN6Rkg4R1dGWStQYnNpd0NhNkNQTHhHbnRhU3BCTEkrU1Fualp1OHRDc0F2TGpVM3pEOUVhZFBxZ2d4R3J0N3lhb0kySFRlaWE4OUdjMG1BcGUyQ0pwSnB4Lzd1eThXMXVBb2Q1eE1vNUpoYWZObkZ5US8rNTFsYlovVDFxN1hScHFDcHJsMERaaG9RdkpjZ2xZRDBrcUNPT3czQUl1R0Y0SGdEdytpcnlucDVhOWMreTB3Vmg2R29pT1BPK2tDYURGUTNVRlYzTE5ua00zOXkvRDIzdWZRMWV2YlcvM2VFWDhXd2dIQllna3k4U29kM0lkaVpsRkViNXBBMnVhREloR1BSdzZORWJZSEc2OVluTnQ4K3JDNEo5SEFnTk9SRXlkb0xQcXFyNmo4U2c4ajliSGU2OHdqL0YyZklNQUhQUmV6QllTY21RajFoMHppbC9MZE1hNm00b3g2ZTh5QldDTUlMckJwbStVY2hrOVJHMTZNazJZUFdlVVErcmc5MkZwK0RySWZhM3V0MlBWZlFvbHJ5bXRUa291aXltZloxU0JqQUVkQzR4RHlzVFd0WmlmMy9nMWtNQnhCdlNtbEUvckgySDBncmhzakFkbFlDM1lhNGQ0T3gwcENYUzhxcDVLbmN0aStKTjZIVk1XT29KTDBUWFhERlpTam1YM2lBNUxWRHBQY1I1Mm1vOEhHMFEvdDhSWGx4MElURmlpT0lmdDdTVmNLT25ab1owOFBNM3o3R09aNmxMcmh1OG5IOVZxakR4MnUrNEZxL0dOa2VLcS9JMmNPdFBWVVFUQjJUN2ZLOUpoMDBJZTgwaTVZQjRYMDdNTldjL2xJR0NGY3loNmxPaS9HcjJGQjgveWNMa2V0ZTBCUTFCSUVUOTZuQVZmR2hjQXpMeSthK0paNytwRWdHZnltdmhWcVdQQXI5elQyQVRSR2xtenN1ZnVmeHM5bnYySEFzR3pNTmtyTCtScWhoYnJCZFBvNjUzbExHbksxWkx1UWFiM1N3L1pFaDFST1RhL3F0Z3ZEaEtJL0ZudzFOZkJZWUhrWmVma2R0cUtxMTBIMFVudEsvNmhncVRUZmtjQ2Q1YlZXSVR3SWIrTVZCYkVJME1aKzN0L0tFOWE3L0FzWDVTYVFVaUdma2FqTTY1NnNORERkdjR4a0thUFd4a0lLc0M5N2hoSVVhdUhXZ1VXbzBaTUxRZHZ5TGVKQTRkNFh5UHZEdm5UMUlJbHV2WTFJZDdQVVh2S0FoSUlNZlVNZzJrbm9nYkdPNmNCRStwcGZ5UU1FS1Z1R1pTK2I1NjJkRHBOWjFyWk9rT2tnU0dhTTFmQ1ZCMWt2QzhLTzZ6VkI0WHViaUQvb3RFTHVCS3ZwNVJyYURuVDRSTzJuNGtWRmpFckVsZjNBdG83WHBnVE9rek5FT3JheGF6cmpLWnZiVmd3Z0l4S3hWYllsZ2tLNlpNOFgrS2JwSUFMb0YwOWplU1NlendEbFJMYlkwMFBUcGRTcCtMZno5OUxEWnc4WW5TMFFFMzVEeXVVRTV2cTNkYkpjeDBNdmhZdXFXU2R6U3ZKSDdGR2FkNCt4Qmp6Q3VpYm5iMDM4WDRUc1JJb25YS2hhSUlxeURZbUd3eW90WTBWTnptU09mS0w1a3BMRHp5UlJ2Y25ZN2k5cnVsa2hpRkxYVURxR2V1L0FmVkd3d0JFUms2U0JnbjEwWU1wK05ma05mazUrR2JpSUtGck52V3M5OW03N0Z0MEVMUVVESkhIT3BhTDNCbUNUR3J1UVY3TFFYSWhHdEtKR2dIYUx1djBxSFRFQ3VaOW1LVzF4WGJ2ZjBYYXZTekFuTEVHSXhMd1l6V0VMQ3JyeHkwZ1ZjL1V4emZSKzlIVFByL2cwQ1BGK3crdTdVZmprOGNZRWRqQ2d5ZFlyNFJUNXB0eS90SjJFUmlodkNNS0pnT0xyd3VJYUZxb3NjTDVkNCtmNVlaeUwrL0FOT0JYOW9jZmY3MWk3aXdlUGJSR0pvWG5lZ2hBaURyMURGZjI2aG1EVmV5SGMwOUN0ckVCTXMzcGVRM1JVS2lVVlRaOHpiNmpYZ1VKTHdqb2RoOW9VYWQ1bE8xQ0p2ZEQ1N2ROcEJ2RHVIa0F0Wi9IZnlXUU5BS2ZRSjZqd3R1WEI2MDRnNWhSZnBkdWgrVjRRTkM2ejhzdDVxRk5OYkthbkQ2NlBGUTczVEV3SVpDZXoyU1VNVkxqU3lNRUFhTVl3NXhGajVBVitsa2NIRmFHdzhmWDEzVkNPZHU4cmlIcCtNbnBxUUcwN1RKa2ZwOEsyemt0cDV5Q202bFNqWTNOTm96cUhLcGNZOWw4RWRWUTdReG9JeFVieStFMU5VMHF5cGphVVA1VVdWZ2s4M1c5QmtLK3R1NVc0SURLY2JwR0dEWWlsbHF1UTdPZGIvZDZyUCtDNnNQTW5mZTRhb21kR3lZV25TQktseVpTV2c1c2NkYWFvUVFyeGJWSC9YS0NXNVZhVFc1WXRWNm5FRVpEK2lXSHFpVTJGN3pGaU5GUlNHVlhSN0toN29zTWxwTlRyU0pETElQakszQndmUDZqNDN6VFF4ZFdmT0p0aG1RaFBPdk4rNDhUaWNpWHVNdUdmc3BwcjZPbU5Ya3dDMWNsdlZWRnRMc2w4a2xlVHF4NFA1TmRWR1YyNzBkQ2I1NC9sOXF1S3phZy9IWXBVMzNKMDF6dXZDbWg0SXVxaFB2ektDTjMxSTE2R0FIVlBzbTRjaHdCNFpuTUNENFhYcnN3UXFMWlhmNzR4NDI2WWhpd3JtSW9INnhwR1FMMHBNNUFyRTJ3MDRjTXVKWlpneWZPNWFwS0ZFcGdmRFNycDlKbW4ybU1vaWFUQzZZK0JSWEozVVBWdUsrS0U5N0RTLzhtMmpJOG4ySk15SVllbUh5c2pMQmY0OVlEbWxlbzk3RWcza2JNamdSVWF6dXYwbFNPazUwNzIrV1B1Rm9pcUttL3NERUZ2MlRyRnVxdG5MVXhSMi9ka0hUZHhtNFViS05UME9SOEt3QTUxaVc3cXdmRkdIWVYzdzZ2dldmWVdlM1d5VFk1NGkzaS8vVmtmODFOM0ZMeFNqUjFmNVU0c3JFbGgwK1JBSDROdDJONytMSlptRHZiTzFwQzY5NE1rcEt2RXJIQ0p2c3BzeGc3alNaNXlhZU5sY2ZxUmp4bVBRZ3Y0ZjNmL0tHMDlxSFpSOW15K2U0QTFQcUlWd3VRL0ZPMUlGSUNnaWxmVkxiWXFtQ0tEbGt0bHRQWGZDS3JHcXpYQnR6SzZMcEFWbEp3K1ZYUUZ5eW5TYkE3eW54VGFFMlZmamlBd21Xci9lZG1nZnB0Y2VkWXJPR3VEZ3drL3MyYklaYnM0dHplS3B5VG1YZzl1c0FZd1hxREllaElralBJbzdrdkVoMlZ3R1pCVi9WSWtLMzdaNDQxVTZvd0hMYzdqcDlZS0Y4S0lqSklYclpGSXdNY1pnYWY1bFl2a3hRZkxUaDV0cFBFS3d1cGZhZEdFRGlValIyZi83ZzZPOTNNZUxkeFpuaVpuemF0TkQ4NHNXWnpCYnYvYVFEajlDaHQydTV6YktoQ0VSRjZqUkcxLzNuS2o3SnNUS3hxa3pCR1hJaWdWbkhKeFdHYWxWeVh5K1BiaG1CVlpUS3ZQUVoxc09OdkhDUWNvMjJaczc1VUI2a3FsM0hFdm9HK210VXNFN2Q5MGRUOU1kNTM1dXB1ejRJWDVKaUg1dFV2eFMvRU40aG5OSmtmdEk1OVowL0ZjejFSTTVxOEZERFlsZVA3R2lKNjVSSFp3Qk1WT2U1SDhaLy92dExqQjRRZDN3WXZkRjBLd1RvOFdXRG1hYU5Iek5xeTVHMHRhQUovSzBkbzYzb0ROaXF6am9ud3hXand0ZWlaQjUzeU5jUlA5cHJvSERZN1cwZXNKLzhjbVQ3QjNhcDNZT0wxY2ltTndXTXNwLzk0SUlvK1ArbWJIYUY5RzlENytTenVvSytMbWhUTkd1UWtUU2pKZU5zaXZYOFVuQnpqTmZkS0JmRWNEVkJzUSt2VFhuSVdKK1NPUmF5R2dhNnIrOUl2REFDMXJPdHdZekk4ODRoTnpCaDZ2QjhVMGZHY2VsZUZwTU1YZGFtSk5IeDZ3M3FzYnpHQ096YXFZZks4QitBZHZTVHY3VFlLWEZCQVJGZ05rNHh4SlVtWFlpU20zcEZRWUkxSGNieklOS1VhNWxveTJQM3VkRSsxVEIvYkt3bHlPRVJ0UWVyV042UWYrK2ZxVm8rWXMvTWJoN3MwN04rREk5dWJXeU54b2cvZy9Wd2x5RzBRS2RJOUI4VDAyS3YvYUFjcFpncWNNQ3VDNjVta2JJNXEwTm5FcW1GMDQwWDJIRmdoY1ozZjljeThvTmdLNSswK21pSWRxeEEvZWFPN1Q4b0t6bUFlN3JxNk9SZUxVNTNIVVZBcW5aWkpsbWJ2YUUvTTFCVnpHWVV6cG9Gb1JnYllVaHF2K3U4SUJhTHA2eXFzdVJTcitaWFRkN0tGL2FmN3lKbU9UWjdZUWNPNWw4VVB4eTdlcWtuMG50d2dhcEpETlJuK1J1UW5yT252M3AwM0ptcXZTbHpGS3g0clRSMVRPSzBITXpiVUZKaG1WM21wK0xHYWsxUWV1bCt1bDVpWS8rTktkZTV3dEd0aTBEWHcxdmpGaVg4VFpmVHNVRHRCSEFVaGlod2dwUitTanRvd2h1S1RqMGpiSzRHVmExSU56VVZ4Tm5SMjk5SDFhOUxWdHA1ZWNabUtIYk9VOUNyajMyRjc0RUxYNUFLamU0L2NpOGpmUzZvMmp5WjhiOUN4ZGZ4QWRCdDZGRzlTZHhmekpGY0tUOEFNWmt0RHhoOFFnMnNhcFhiTzVTdzdVK1djZEU2ci9zOGVlNkVrb25ORWdwdHZjZUFkWERBUHZSM1p5ODdsZHhBYVFKWldmb2plTjVOdVhRcU5BZHNSUFlEQkFPL2hXNEJFZ0ZwRVZYMS9UeEFJUlBSS2ZWVHlSR3JWdElhcW95cjE3d1JMc3RZSXJEM2x4WjMxR2tvY0RyWWE1NWdRSGc3cXVGTUIwY2Y2SU1leVhBYndWelREeFJUdE4rbmZCdW93a25YbnRhOWd3WmxmajZmOXRwckEvaHlja2xvSTlkWUNvUENSaTVIYlM4T0dwRktyZG9JdWFWNm56cjN3eGtEemsyT09vL005cXFWcyt4YjlELzNEZEhMUW1RQ1hGVy8zQTA5d0JFa3dxM00xM2xta0VIbzR1d0JZZnZxZFpibGIrelkwb3lJN05QWmhEZzQwdFIyaS9xZWVPWkFiYzJ1bEtTOXg1TjkzeHpjS1RVRU5qakRTWjUzU1pJT1E1S2doZkpwTk0waVZZR0QwcFhmTGlZdmk3ZkkzU0RvazNCdUlrRDJjZ3hCS0cxb0dBcThLeDNSZ3hESWFlMlRmSG5aM3ZNbVdjcmJnMEYydWdlZHNDWEc3RGtEbmRmUVdwbjAxN1JhZkNHOGxPTklvMkE5OUJ0ZXJaeEtteThic2tzWVo1MGRheVF2dCtjczV2bHBDQ3phdy9la0FqMXU1SFhNam0wQVZxdzdmcVJUTkFJcTBzdTVFbjVtWUV6T2dZSm5IZitMRy9BMVdpdUt0VWZjRmVWTFRscjg1eE8waEVkbGNFNWcvRzREZlNOY0ZhaURZR3lHRkhWVnhoa0xDcG1KNTdySVZ1TDRhREVPS0g0NndhbkQvL09hUXUrQkIreHVoTHVKVnZTWUYxc1hteW9GTWJpNFhma3ZvWkJocHBxRzRDNFMxRVlPNEtGK1BDNFFKZGJjVE05UVc0RnNpMzYyZ2szTHFIMndzUlZYT2RWMFhkSmg4U3BSOG9DMDZOSWg0a0NzK3o1dmlPVGdsMlVObTJqWjFlU3FXVjJLVDU2bFd5Y2FJbG5VT2lmS0ZMSDhadFBxNkMyb2NTV0dEbnRrbXZmVTYwUXFsN2NmTW85L2NIT2RXTnYzQjZ5RGx3empEamRtR3dxKzkrZWRWRnMzK0tsUjdkMlNMRmplVThuSG96VWJZck1kbTRoV1BtbFVCTWgwa1BBN0FIREpXNXJhTnhHcnZiRmFKa1BkWmJRMVRySVkwOXNxSGg1ZU1US2VwenlNYmFBN29vTFNYM2JaMUlxOG9jSkFzRWtvbGlJWjB4MjZqZSszdFdyYTNidmV1MUFDSHFsSEMxSEF0MFIrZTlFTUhRWkR2Rk5PWEc5N0t4Y3hsK3lVRmJKaVQ3UHRidUUvUzhRNmd6STlPWUUxUitRMjR5SUEyM2o4Y2d6YnFScnk1YlltVFNXUWFNUHRhOUczQTlaSkFDc0JnOUh3WHhoaFFtT1d1dXpvR2k2TGRuWXNZNHJPeFNiMXl4L2JRbW1RcTVPRnZ6UUppZnFCVGIwMUp3QjY5SEpDRFM0Y0Y5ZnBoaFhNWDRsd3BsMEl2a2FTZURXcml5UmsxcysrSnBWa0xDN2lOK21WQ1hNUmZuSXVlS2ZOZGNlQVQvRWI0K0dEUGkwbkVNdkpIVTZPUDIwU2hxa3ZjSlQ2Z29zZmZ6bjVRSkkxdVRwd1gzMHNoUzNZUDU2TlhtUE9abzJVTWlzdFRaWEZ5ci9CT216NmVNQXJHbWpwYUVDUnU4d0NUakdqSTlwNVZqU3FveHpRK2ZodFRlK1hFdDAwQ2ZZTzRnOG0xVi9RZGx4YmJKMER3SktaREdJVnNKdXhWYUlJSHZoQUhGbDkzb2kyZXJ6M1ppci9meXlsVXFKZUtXRDkxZElqdXJtUzR5TEplKy9rSEpEMVFhOUxmZ0NEYTFWNytOK216NVJUWFlncVR3cXAxVklkelFVRzRRL2RjNFI1Vm8wanhGN1BZV1o5Q1hxdGdkRXZLM0ZXVlJyY1JySkllb2kwWms2TEE3bmZZYXZ3OGR4S0ZadnZhTWdkWmYvSG5ML25hYS9pSHM2ZVQ2b0ptTW40K1FsWFRCb3lWSHZRcElyeFdveTJ2a2VrNFcwRExNNmNyODlLOFA5UlJ5ZURHeFdJcVd4bUNsUnErYW1UK1NVZ1ViL2dDS2wrd2t2T2lYMlFzdjRuNkxhTGFxU2FXSlJNZ296Mms0bjFMa081dTU1S1dETVZMdFdBYUd4aHJ2enNMM25DRm53T25xaXQ5MXN5Y1NtbjkyNklIb0NkRm10RW5sTE0vQ04rYXMvT0w0anZZUG9QVkxCemtJM3ZYMXdDWHNtYVNFQUdEUmJHNjc1bU9STEUvMGxRcnJ4WURyb2xrUWRHcm11cStPZzVjWjZKVUMwZlpLYlBCV0NlWnUrclFBSnpXd2JjY3Q0L0VyVXJHTkxZMExiTWN2TGl2dERLWFArdnVFV1BzN3ZpRXBTenByOXMvOXhFRGNOMUxqYW1LTzd5cDZxcXhERld0Qm05ZUF3bHZjcjliMnNRZHlGZVVid0UxVDhSU3RXSXo5UndIWlFEbUR0V01ETkJsRUl6NjZoejE4Z2tXc0g2U1d0RFhIL3Q1TWpFRWJvcjN6YTBJQ3czb3VOQ0t6SUdZMGpiYk0xcGluMlpGdDVpcm9wZUYwa3hKYnlmQ0NWZWRXWUJ6K3FRbnVkbnU2SWd4Um9nQTRacHZVeHBGbnNTVXY0WTh4SUt0dTJOTUk1M2E4Nm5US1NpRG12QWhuTlVTOVBCTFBQUCtxbXl1SlJoeTNBelBRVS9vNEw5c3BQajBMZVZBWUQveUhjYzBPVW11dlo3ckJJRXQwMUk2L29WR3NnOXA1U2RaOHplRHlUZlQ4SFI5dk9tWlVVQk1GaGU4NGhPVDlFNnJBMzJBZkNBWlJsOVZjaEd4WEJ1aWt2YUF2eEFzSHhEcGlnQU80alBSUHpWUEVOTHZFaG05d0RhSGJDTEcxd2dEVWg5MXptUVJBWlJIUWRMaEJKNmZ4U00yMmZmVHdxS0xCNEx6NnMxUkptc1l1aEtCdjd6NUdVRmpyK0MrRjBuSTFxbFNlcTNlbzBHdlFjMkRWUGpGcDhvVUliVVNCYmJOaUVDdGJUMDY0TzJEbk5vUnBad3lvTU5aMzIxbEtOUnNOcXlsa0Z1WVI4dHJkeUYwTzQ0OUJLeS84Y0pGY2tFUExFRGU2UmVqcU1sU1hkNFVFbXUxRCtiMXE3YWYzUzBlTmd6eGxzTEptZTJ2RUhIdFcvRHEzeFFWV0pMbHhGaXdlbkxQQnNmbTZlM2V3TmVDQWswOXZhbklTZjNCWGxkQ0MzZmFyLzVRa0dXNzNGKzJydG4xN1ZIUnQ0NWROamJxaEI1WnJMNHFwN0ZjekQyazhidFhtdm1vUGRrY0J3RHNEVTdiWVZNSXMwckM0bDBKWDNGV2wzWVVHLzYzZFdBb2FKM2RNc3kzN1JoSUN1TDFyajZiV2xWanErdGh1ZDBBYWJLNGZFRWw5M0ZtNjE5OTIwWjg4QVZ6QXArZHlhNlpwOHVBemRwUUNYWnpLU0hYbXNPazI5WWJSbmtkOUc1U0FGa2tFMXJBdFdWNWlyV0JZSHR5eVo3M1VHSDdyeXY5MzduazJheGZQdXZHWFIwa24xbUhMdnRleHVqUFlHc01aekZTa28zR0RRVyttVnZ1d2Q5RFhaVmw2TXRTaGx4eXJpbDY4Ym44a3JmekhmRHpiS0VMNFFCOW5Rb1RjS2xJbTMxRXRXR2N2S3pBbk9xNW8zbTl2cGMvR2k2OGthUGw4RU5TYU85T3hNYjlOWFVKdUZTdjlvaTE0ajdwV2xaSmNOVFBGS29SVldVdGtIY2x0WjlVa0ZlWmVSaWdRejRYRENLeGhrWHBXbDBtVFhQWSsvT1hwaDhXZGdDcHNuNXQzNFFFVWIvLzNoVkdCNklNMG9Xa0NjSmdLTDQ3N3RaWDB2dFo3MW8vaTI5Q0dyS3A5L1h4V1dUUG5yZVJKWWRvSWJFaWJ6Q2YvcmwrbysvS085K1dpdGJ0MjM3VTk1NlRkNWlQTUt4QTdSNUkxUHpFT3BCSUZTRFlhS1p3SzkxNlFnOFAzWC9QbU5vS2pmaG1GWXF6U29JZ1pObXBqbnFEbUllQm5HZWoyNzJ0UDVVQXVMeHBERmlFUE9iRHdkajhId1JiKy9HS3ZzVWRpam9xM0FGZ2h1ZzVYOS8vSkR5QnFpZm5uL3dqNWoxNWo1dDZNNm5sR0JtMVUxaWhEUGdwMmY4bmJsc05uNWZ5OFZTVGlXMmgyV1RIVnJmL0h0aDlDNjI3Z3RJL1Znd0FrM09jcVp4ZFJiK2ZIOEJrK3hYS2pLRlZ3TEpTSi9EWUh0Y0pXTjA0T3VtWHpPVGs4elQydFhIbXdNcGVUczJDRklyTS9LakdPay9OcDUveEgwN1loOXM4VWwxU3BMUmJCUU1BQVh6SEEwUWhrdXA3SWJxMW5qOWRVcnRxZ29UN0Q5cDVQL3RtNzc1cXByLytFNDg0THZyYnIxY1A3V2NGY1pFNXJIcVcyV3V5c0NrRmw3THBWaUFkVkk5Zk1iWXF1bFpxTExNTXdoakZvcXBySjFhOG5NQUVQZTZpbzlTQ21RRmV1ZW1NZlBwc2ZFSTF2azYzSDQ0TWdwK2ZEejJkcENVU295aEFPSy9ONmhZc1o1S3dOc0V2ZFVCZm9GaEdGYi9KemlNYjRaQ253WkEwbzFvSGNaTTZKckE4MTBjLzhnMStPcTJ6OUlNZTBvaFMxem41TGdidFRXaEpIalB3QmNEa1Z3czAvc3R2NzhKUEZKUDB0c2JaU0U5TWVDSUg1M0pmaFJYV3hsb1hSWG1tbVlqbCthKzZHdTAvN0l0c25rYXRVcmtkRHk1cTdXREM5WFNnVURubVJJL2lMMFVyaElXUERjYUtmdEludHIxZDRQUzJ6VTRVZlBQV1htTHFkK2R6OVdQN0hnNUtwcDBUeTVrR0dTT3dLNktrWENzK3lFWW9tK01zR1lzcE0rZDFNKzNZdkNKcTFuK2JWb3ZzWk10U3QzOVlVUTFtSnE3ZnA0eVFrbU5CREpJOU5uWmpIdm11UU1NdVR4SjdjVHRISzVyVnFENTI3YWhFcjBDNjVOK0xhMFB6b21qdjc1YzViV01DUmdYemUvRC9vTS9SQ2gyMituNGpWTHdYWVpJM3Y0bG5HQVpERDJneDJOK1FtRDFOQ0c4MGZvVDFjK1AwWXRrVjBIdjcrY2ZYbm9CanRraTRKM3FNc2pKT0FGVHNJWXEzQ3RvZ1lzVEFic2tmWlhSQmVDRTNxcW80ajdWQng5SkFETXlMRVZtN1V4R3dkVkk3Q05Cd0Z2YzlGaG9Xa0RoS0d4Z3FlSHViV0xNbThjS09aWnJEVVFld24vTmI1WFQ4ZVBUd25sa00xNEhKdCtqV2tLNVozQVpTZFBDQWdNeEJrV3E5ZEtFWjNPNVZNZWd5Mi84dVlVZ0dsS213eHY3dzg5NXIxSWVNQjNiNWR3SmJvZlQvWitZdXNhd0h1Y3ZkdmJ3TjFZbmFYakgzbW96ZnNtMU9PaGZyOGFTQTR3cVlObTBJNHZkVVkzS3U0Vkp4VGlFdU9SRGNLMG44NzNxS3RIUUJFUFppQlFkVDVKRkszamtRODVTWjFZRmp6Z0NGS2h0QVRmS1V3dDVESjduL2xRamFZRm1WSnNWekFKa2hkdUFhZjU5MXF6d3ZKaEVSR1ROM3gzeUhNWlBaV2pFQmFvUGVReGd6SDJUejVHSnE4VXlLQXZxQkZtaWRscUwxWUxHV25PNTBpSlJYTTYwYVZPNXgxc1phRGhPMEJaM3hCQU82QXpiNTZTbzFmanNwSzlVQVpQaUJkcE4xemppa0d3VmxMN0Y1TlVoQm9JQ05qWjA0bXhzOW9sMVl1c2xodlg5YVBhYzBIM2ZJSlpCV0xIWTRoc1A5UnJmdW5sOG5HQVNrWnZlbyszdzZ5SmxBc21hYWY5Z2ZhenRKUm5kVjVqY3pGY282MnNHY0hrM2paQ0JhRngwWGswd0c1ZllMdTMrTTlISFJnZWlEd1pHWWhMS2pxMENGNGNnT3U3Wm53YmY4dkE0MkxUaWdDbm9GSlhUL2UwT254aVZwMVdGTHorY3VrWjh6a3ZEQ016bmcrTXhCQUQwM3R1YVJ3WlBLM3RKcmQ5dDRiV3B4UEdFYW9kMjh1bDVmRXErNXZLa2pld1phaGZpVHBvT0FDeWUzNjZjZWVkdVRrZ3daVGRkdzg4eVNkelVCZnlZWjhTY3d1Y0dmM0xJYTdJS2hVOGx4QzB6UERpS25TK2srb1REMGlRMGE1WnQ1QTZWYnBVd1U5ZGc0VVp6LzBtdW1yRlpwajdmNVhiYTFJS0c4bUpGb2RhN1F1TTZZeWppOUY0NE16V29LVXZiNXhlNStRK3RzWXcvYUltcG5uM1JyYVdoWFJtK2JVNkQrU09PUXdKb2VaWi92Uy9ZMG9yRllkM0NmdWFGS0luQ1I1a0s3T1JaeVArMFFaR1Z3bDdYSDluRE8wcEZLVERGUFhiNk5naEZsOFBCZUJRcFlESVlpc2VzaVZHMVE5SE9xS3ZnVkRIejVUWmo0QmxVL0RkSVgwRCtIUFVoMFJSMHdmVXkwR3RzQUcxOHMrdGxyNDg0aUQ5Y0hHeGZneTAyV2szWjBZYXVNaGhxMUwyOVBQSVBpdmQ4akdRYkt6Vzh1eERTR3NWL2pyOFBKN21yY055UUkxa3lIb2cxbTN5VUNhVkFPUnpaSkFGbTFiMWp0bi9ITFVPL09wN3lmampPbGFORGdoaStZRGJUZXNKMDU4SGpmUEJucVpVTkF3bDd4Uk9nSGdwTjV3aFp3T0hxNzRVUXZ2ZEh3UnkwMVA2aUEzTzNLdEVkRUlQbnFFeHNaZEtWelRJKzkyeUNmUGlOZjNXMS92c08zOGp2V0lJeFMxRnZjbkppWUd1MlpLSlJNMTZOK1F1aEpoc2g1QXRlN1ZNdmZ0TXlOaHJJL1Vad01weXB4ZU53VmV5TXQvS05MdHdKRFdQY3pQS3I5TDRFRnQvZGhZdGtlL2tkaUJvWDBkaXBYa0tScXlnZmV4QitsQzdrd0NwbGx5M250aVZjVU9oZXhHR0ZIMXFBd2F0ZW0xOXlmV2JBQVQ2dVA0ZGdKWU1IcVo1YnMwaUhxcDlHN3F2RGU4dFM2dnJ1YVRHb3RERW5aWkgxd3paMU1haFlBdHlEZGgyQjBjNEVkM2cvVHZMTks5bzFQY2wyWVV5RE51YkpNdm10M3NUWWp0bFAwNUxPYVdZZUYrVUd0RGhXcE1FUHd1Nk9mZ2Z2QXBLSVp4bUl1L3lnOVdxMlUzOHFNN1FRWnFsQlZtWExFdWRMa01XZEp2dG9xeUdmb055emVpS1FiMjFTWC9uSXNTMHh5eWtPaGoxL1RIa3doK2NrOW5rcytob2J4ZGdKQU5aNEpnY2pJbjhxSnRXUjhTRzRUSGIyeTFxR2FLdzB6Ulc3aHFjVWR4emhidWwzNzhETHBZelhsT2d6Y29wYzFMS25NNHl0S3dtRkJmZk9WT21rdVpMNTY3WUl2czdiUEUxenNUNm9XbGFwT3hvODV6dmwzWDVlSUpDN3dyWHlHaFhpYnlBa2QvN3F4WnlJd0Z4cGRqMHJoclNYZVFwQ05ORUdydDBQeFpBSjRjcWE2VHVIckIvY2FuK1hFWUdJME1uMWxYRmVZdm5ucFd2SlkxMGZQZ2xTRUxMRXRkUnlUL3hrOTRsbUR1azRGTXhMbGxkZHBMaTc0WlpyL0F1b3Bqa3N1WWJYQlMxWCtWR3NYU1dhMTFjZE9xZ29TdXlMVUltWXhqRnRHcEY1U1hINlExQVpXUXJXRlRXeEk3Y2JDL1VIU1ZqczRYS043a0x6WFFRN2EvL2o4ekNBdDdZVXRhY0wvc2pVa09OM2JFdFBFamZJdG4xRjlUOHZGbTE0cFZjMUE1aEE1N3kxKzlTaFFwdUNyM00xN3FGSTBDTmN5KzZlN3hseGtsbk5lSkp6ZS80UVRmdDluMU5CUmFLVy9POTUraUNndEYyd0ZGL0ZSbGNXdGlUQ2hnZmkzWm9RQmlpWE5pem0yL2tIZ1VRazNqckIxek4wcS9YU2dwQm1xVmR5TXhGaUt5SHh0ZjFHNTF0NzcxMHcrZWx1Sm1HK2tSUGF5cmp6SmhmZVFkdzlWNURGdVpQUWxGZEUvOU12WGxhYkxWclo5c28wbEVsN1F1bWZOQnh0WTNaZ3l4LytlRXgrbzd1MnpUYU9GSHFlRHFKcWxjVzFQckFTTEsvem84SGVDOUlEbmNHdG9OM0VrZy9YamoxZnBQazczM1JJQVREY3FkWFV1NVhTcFg1b0ordzRKRTA2aVBDck13ckRCdFpXckhKMlpwN28ybFp6UWxTMk96UEMwcDFqeThHYXB5NEQ5YVdPczJaV0U4TGdRNk43bGh1NjdodGtUdS9rRGcreG9INVZubzdSZ0tpQ2dsck5sOE9NNHVLK3Q3QTZzNi9rdHJ5K0dTZkJGVVlXWHRlaHJqYktlQWZaejdMVlhTODlPU0xjQWhGY3E1aEhMaTBMbVFWVVFoV0FGejhVcFRUYmtwd3BmZnlIVkhNTi92V0pXdUpZRmwxNERaczBEQjNjSElUTzNHaGFqV2NnaU5rWG1yUUdMN1NrK3l0dEVTb1JVdy85a2JQbE5lSk1EWW9QeHdFZDl1c244d2tQTzAxbjlLUW13UFY1UnNQMncwb09zWWNZcGxMSVFadnp1OTZuazNWTG5tY0NCRVhpMVA0bkFjMzhTcytWaU4zZzVocUlBbXdFQlZJMkNtY3NieVNkQXIyeDcrSU41akhXenRBbXdCajhaaS9GUXRCRHBrWWVpYTc2R0ZrSGpVSE5kM1VJT2RKSjNab2xCQkk5ajFGWlBJN3gwVzRueGw3NTVVNWNGaG02VWZ3QW4rL1JVM2hPWjhWSHRqc0tQVm9xRituSGt6T1V6V2JGTDE1RUdwS0lRWnlLNGo4ZzZ1aGwvRTN1TkxOSFJ6b3hNWmEvckllc1JSRk8reTJZQ3lFRGtUY041aEhjRlVtR1QxaFl2d1c4dDJXLzVwNlJibHp5bmN6bVI4cEZHVlJEVUZGM3ptejNhUTFpazIrV281cVFKVXQweEhpLzdUY1NkNWkwcW9aa3gwSUJHRzZzSGl2YkZJanN3Q0U0Zyt0ZnJQcld4RndObWdFbWpPa0srNzJXZ1FzMXJlWVM1OVRZZnk4WHNyUjRmUUE1Rm9kck55OERxZEtqbGlSK3BSdk5aMGZjZUJBZWdzWFBEdDZqQ0sxYWhKdzV1dFNmRk1xeXZiU2c0VW5MRmhzejFobnVsajIxbzdEOGx5bEdDb2x6Qkh4U2FlNGVsQ1h2QmIzS1FpaUJScHdrbFZ2dlh2OGdGUXpYTDR5cm8wcExXQWZoK2dyZWpvemZKVlloNmd6enVhSUdGOTlMTnpxZ29iVUs2bk9EeG1jNmliMEQxV1dTSUd1K1BlWkxVdGJFTXFsOVE0a3Jac0J0ME1QaU1YbGUxNnloYnRpN3h1RXJ4akF6M1pIdzVqK091VVpobG9LYnRWMkJJemdqRmU2MUVwWjBqM2FIQk14SjEvQXNYa0ZGR3R2bExtQlBhN2lDTzBpSkNlRjIvRVBOd1NKRTFqZ0lPaEhsdTJhZXdNT1NIR05MWlBjNFUrRlo1VXJkRXczM0ZCV2ducldDcGIzRmFzdERwOUpSbFRuYUNWNzRlZ3dleTkzVnpNUEhUd2V0QnRTUzdHMWU4Z3c4ME5aWXBLUUhwNjI5a3VrYzhBUDlHVEZJSFdPeExITzBId0dvY3NKdUdSMDNBOWhwWmVNbFR4ZmVtVTBFWjY4Vk05WU8wSEc0WDFLcXJlZDNCUkk3ejR3dzBvN3lheXA2L1E5Myt3UzdGUE9KTWM5TGJUMnJ2a3N6dGZUUmJTSEFwMGJLWFdYYitLeDhEY3hjRFU1OEZ1UXF0bFhsWGxqQ3NudnkwaXZGRTFxaS94VU5qSE14eTE2d3FjN2tqTmdHVXQ3RkpGTkJBbzVxTUl3N1RaLzFtU1FwY20wbjFWQ01NZzEvcWNGNE1hV0xKOU01dFFJck1FNFlUR00rdTZibFZuNEJGa212VnFObnVGR1Rna0JBM05DK3JWeDh3d1pmUjh3UzI1MUMwa3Q0enBsQUFlbUxTVzMxaGtpVE9tdy9TcFNVK25pWjNZYWl4TWs3TUhwNU41TTMvNlFOMGlNNXlXWkM5aHlvTkM3VWtXNitxTGl2WTVvR1dZNmxBZDYwcFE2OHJJQzFITStCS0NIR3pVMlpVb1FxNnVhNi9LNVhWVlAyUUdkYzNBTThHeGtpWndWODZHR1RmVWI5bGFCa2RGT2dnR1kxOXVSYUVpT0VUbmxaU2cwQ2RkTXVadllReXhMWG1iSlg1UnFpNjF1MFI4ZUlrbERQY0JGYTMxYWo1Y1RpNDZheVh0azlEV2FSREtUY3FTUFJZS0gxd3QrUmlhWllBcTBhYWZveUxRWExBOTBBOGNWVjZpaW5uVjFvMGRzUkJ2S3VqK09DN1NBZGRZUDE2cjNuNHFoUXZEMkU4ZUVCOEFUODJrRVZqeWJZMHpCUlFMeGN4WFI3enB6U3B6RnY0QUVwR3ZlNXFnMjJ1d09DL2F5UUtXMzV3QW5pRGwvbWxsVjRTZUpCOGVsRnQzWmg0UFUvZjJ1RTNNUTI5eklRelI4MWVIc3MybVNTYmFCWkZiV2NNaTM0NngzeFR2eG1NTEt3cjZmd3k4dDFCRlpHQklzdHlBVkY0ZGVTaHRnbkkyejErUVdWMDNmWUVzVjk2bTRlamRXVWljSFhFWGRReTRIcG44dk9NaWlIUklJdnJVRWZCRFk4K01McVZSWjVyM2V2VUVtSDNBTEZBUVNYZGlPNlVlaWxySWlNM0FBdUpFd2RwT0FOMmJSZ0M2UTNsb0Zsa0Y4WTBENjQyK2dFelNVZytQWEJvb3RWWVpCUmFQcHNyZUlmOWw5L0VVbEtPZ1JRYUZ6a0QxSUpydmNsRVpnaUtpc2FyRFlSU3g3T0IySm9VTVNLaDhEVHF6V1NoN1dMRjYwVkZTclp0RzFhQVAzbjUrRWJUMFcwMDh0SnkrY1RWRXVYMGc4LysxUDg3dEJJY2l3Q0NnaWFyK0J0Y3JwQlFXVmZHdm53bXZFWHE3VFlRUXlhQk1UMVJub2R3RUxXd1Ezd3lkR3BZMFZXY2hNSnVBdEI5WU5UZmNWSEZqSkFvbW90NlZZS1dCT0d2YmgvdG9FcEFoa0NjNnFJdG9kR3pKZnBTdmUwMytSa2R4aHlkUHlDMzFXUGtlYkY5azUvK3BRbC9PUTZXSG44aFBwZXlySWg0M1Vpd0ZOWloyaGlXSDEyeDQwaVpOYUtrTEFuZG5LWkNzOEk0RUh1SXBPK2EwVEdOSS9vdGFPU3FndThTTWFFN3ZiMDdFbVkrS3d0UEEvbks5YkdoZElJb0c0di9aSnF4UzR0bVBlSXpKNklkTTJBSGRxNjJCSjNRSEVLY3FVMTlHRlRtcDlFTzZ2QVlwT3YwdllNR2RscjVMdzFQNkt2OFBPZFRqVEFqb1ZnUlUxS2tHZWExY1AxUFFXZ2p0ckQyZEtpejJRcHI3dHRFU0N1cW9NKzRFUjBXU1p6ZFdCcHlRMkRkTjRsUFdKUjQrU25leEVoaSt3b0N5NGtpWTBSb3Y2MkNCZThqK0tUVllPU2ROa3RKWDBjd3R4cTJqbzlYL0JGVTB5TFI4RElkTE9pWWZtM3lKajNBNGZlcnNka295aGx4cmd6dElqYWd2TExaRlMxb2IvVjY2VitTZThFN0dWL0JRUENqSW1uUm91T3g4S2xRMGNNRzExMXJmVmU5QzdZblFBM3B5cUZsRE9wRnh2N3ZMODVHczdoYjQySFdGT250S3poWlE1a3RkTno2TnJYaXlsQXMzazNXWENjQk4xZEtERWtvaXdzRlVSSlM5ZHJSaGpaUU9lWDN5L08ya2Y3di9ZSXpSYzBFOE9HaU1rcVRCYVlXZC82UDlFMGdsS09pMGxSZ05wMmV1cDZsbkxsV2ErU0ZMS21IamhGUlJLai9WNU1GSzVxWi9yeU9nblJvL21EZlVsTFlqZlhabHVkT09obXFxNEFXRjRHd1hxMjg1MWZoeElGK2ZtT2hDeTZnbzIyVjdpYXRZaXh0bUN6b0ZKRnFXQTh1MUQ4QW9xMUU4ZWg2WnVqRU9DOW5iYmF6Z1pQMkdGaFc5Rnl4OFByVENZcnBydHB0NHJLRWc4RGsvWnM5WkdEUHJ1NlVUSTFQNVJhcmdReGtpdXlpbmI4WFVNTHRTazMvWFY3SlIzMDk0TTJiM0VicFFEV1ZqbHdsS1JJeE5BQno5MjJSZVUxUmxQZjNUUmFnd3NVNk12cDArUEdJNnZ0cG5tSzh1N01lVERjY3kzaktMN2Rsa3hVd0V5RWhRMHR0bmJIbnRrYlpIT2g1RHZKVWN1cm1TQ2FYOHZUYy8wS1lwTVRLZy9MSW9oazh4T2lqM2t3SklHMFgvMWZMYjhXN3dRWVdMbFc0bC82eFFTaHQwM3ZUM2pkWU1YMU5TTk1tWjVCT2RzdTg3VGx2RVZIT0dIVUZ1ZmN3NTZUMXFocGUzYVJRalppUWJQaFZnbGo1N290bUpyVUtNYXp1cTIzcFVUK0xyZU13eUZvSEdNRXBYOGVEVlJ1SUNoSUFXM1E0NTQ3YUZGa2FvVlFydTZsMTJ3cjIrT3VmT0ZodThYMFYxWUNoTDNnWE92dGc4Z3Btb0hob3R4SG5sdVBXeG9RRHdjalJiRzhWRXV4UFVINFEzQ2h3QW5zM0VLcjd4cmcwb1QwQW9LeC8yaWIraG9MRlFRVlZoYzJ0MXVzZjhEQTlMZm9qUERyWXZVOUhKZnNmRUlpYkdYQ1pzTTNSd0Z4N2xhMmZtQ2Z5U1ZlZ2I0TjluWW9qVTJuZXJkUnRibnVtamxGM1Y4ODVJTzlLZThza01OVFVTSnRvL0ZBQ0RtV2V2SUhnQVRxKzlhVWd3cXB0TGtNYU5vVC91QjBnVjk1RDNNbDF4ZzI1cGRvUms3a0V3T0J3OXNTdnIvTlQ2QnIzSUNiN2NaYWlSbWt2dDRYa1JLVkdpNXJnS3F0ZUNJMFk4OWM2anphbFd4NC9lS0plcm9RdXYxSk1qeno1UWpYNEo4N2lEV1Rrek5OOHlTeDQxU3VaRVZzR1RpbWtQSm11ak9lNjVSaVoybjJCVVJMTHNSQXZSUldKOVpFT3RjOVBHOHlOUWFldW1ybnpsS1kvU2ZxTk5raHpidDErcWZjR3VqQWVnVGZVcWlLU1dmNDhNOEtIRlVQb3RmWkdiMmpiV25SbE1MQ2ZrUk0zTWNSOVpuL3lxU1RDQkx3bnVWWUpaR21hRnU4NGk0bTlNSnlVbWw4ejlGODlzMlU0N0M4dzdMR1JMOUxtVkFkNWYrMnd6by9Bek1tV2l4MDZHd1k0dWhpbFpIYkJPT0ZuRnlqVjJhMXZUUUZ0V3k0ZHYrOXlNYi9jdVZYVEcyUW0vbTFHN0xnS0k5OElpUmpJWG9OKzJIVzh3U3J0WmJYalRDcCtPNmtvQWh3YWZwN1Nxd2tiTEtJaWtyZmhmNUM5UDJZMkZPK3VKZTR6a3BaSjdzV1NSdnB0NllxYzFQNU00Ky94Y1VhTjA4b2Nvd1RSVCtBSmg0Z2djR2VHcWYxQlhxY1VRK2ZNd2RzTjFFQTYrT3h4TlpkaWZoTnlyTUN0MHY0emhLQmJJYUlMQjV5ai9hMExCSm9hYTh1cmpxYWl1U0hEK2ZpVUJnNWlYWUhLNnpkNWYwOGJnSjhaaUJvbnQxc1NPWlFHOWl3M0hoUTJubmsvSzB2WmNQK21ISW5hMXNVQ2xLbjAwVGpKcFdHTENpb1lncUpFYVJkYUhzc3JlcExzRzdsREdtYVhDNllRdVpUSVpYMWg0V0dUSDZrSjA3Y3Y1RWpjemdzRHFFaFlyS21pdkhIb25DU0pLeFR6T1B1OUl2ak1FMm5vTUUzNDJ2ZytFWWc4MnkyYjJHaFlxTnZrR0hyVmxRL2oxc3grYXNRWUNnS2hhWUQvVHQ4TEd1bkd3TjVkS2hjLzJYQUNWcHV3R2Y5NlBIU1ptdmhoVWNENWZ3RWhZMDg1QWF1VmszWWpDNm44bktxcy85QzJkN2I4ajNaaTJVRWl4K3RIZmxjdXlTWllpSkNLSlVHMFY5WjltS3NvOWVxZkovMEh6OStZODFEV3F6QmVBdVdNc2s3VS92Ujc0ODRQTkIwdkVJSHJrMkE2ZEhKSTQ0M20rZWJXd0hoMW5BYkRLdEQyN05LVGlSWWxDblJnK3U3am1BeEFNbnV2dzFPWWdWYTl0SENpMHZZZWVXUGh6VGRHcVJsRTROTG5oY1I0L2VIc0s2M1lDbEtBN2pXSWVCMUkwYkl4S3pVa0FyTkdiWHgzNGRkMkVxZU1nNjhueXlDTjBEYVpWeUZQcFdjSytGSmFHb3pLQ3pOMXQyckc3NUtnQXkzeEZRWDVjQTh5cVN4R09xWkEyTTdFYk1YeDdYdmdybXFGa29EUVBKLzE2Z2hlUnFMUVcvZUk4djRON1gwUjVFK0c5bWJFcDhNTnA1cnc1Zk1iZEtNODhyOXJMNGRZSWJITFpkNXY5M0x3bWdOUHVPQmZJSGtVNnpDV1B3RGhKbEZCZXdyR2R1OXFTR29QQ3JIVmt6QmN5Tmw0RGtPUUpTQU1JMnRIMExERnVmT08wR2J1Y0lVTTgrVzBZV2hvYnFJYXB5emRQZitqbjQ4ZnBIQU1SekpIRGZzeTFmMzkzRlk2MWVBMTB4L2REZjVRZDhZWlZDeXFIcTZSU2twMDd4ZStFV2dwM3lIK1BFVmZadlBBcXp1VkhXV3RJbks2eU9tRXlDTVlFQ0dLNUpNRTNiMk5XbHM1WVNIR3FrVExaKy80YWltdndEMUFWSGNYRXM1eXFBWkI4anV0NDVNREZsV3drQnpiMllYVXJERFI3UURTWWNCWVlTVmRqamplMTVBWVNQWEhZQXg2YUYxeUV1RUQxamhyZWtXSWtmeWNnWXdCZ1RtVWZLN3NkTk5GdndLOHY1OTdGZkdwbWdpckFVeUNYT3pOeTQ5WjFpV2Z3enVNREw1bno2L3RPQ1gzcEpGbFlFRGEwNWpYWTBEZFR3YmpWSU94UlRmZi9sa2FUMHBxSGpRTFhKa3ErVm9mR0xKdmlBOVpOWkhiR1ZRV29YYWFLcGJqb3UwTkFWWXRUL0lGWG96VUpJMGpVamx1dXVYVzd2VndLbkF6clJGcXFqaGRuV2Z2Vzg0UU4vdkZXeDB5L0wvZ1FqQVhWLzIrYU53cEpabmt1eittSkVNUTV1Q3JxeDVDM1NzNkNSY01iQWtXUk5xR0xUOHFiWUJKcUR3TDdISWgrdEcyRjU4eGM5NTlQZ0RTWVl6bU5BTS9jSnhEd0lJajFVVzhUWjhXa3V6QkNsd3kvSit4TnF0c0ZTdHpYMGlpTWZicWk1MzN2WmNyV2hwaTBEMmdMR01BRlNHM1dtTitoYVUrcXlrSnZna3pDS3JqYVBtaElPV0VsU284RlRKRHh2QVBWeTg5RTQ2aWk1ZjI3UDJycWtzdkZUSlFxZjlyYU1mTjdsVklGSmdCL2FKTVZuUzZDaDM0bGdpeXJOZW9RanJjdCtac1A4a3lmOHNadE44aENMZmhFUlJCSWtoWVpiNVlObDJDbm1uV2dZM21RNDJaalVQTWlraitTUVBFYkt1d1FJMjdyUGF2eEYxZFF0dFUwa0R1YnQxNHBBVkhFdWYwbFlYaEtvZkVVd1JUdGRieFdWSkU5OGhRaUZOSDUwQ0JKNTVDSDNHMU5DUmZuQTg3SVpMeEpOTm1BOExOWTBhMjdHYk1FZFBpaEc3bFVUZjlvN1dlRDB5czZ6empvNTlDOUY2OXZINkNTL1pFa0w3NVpmYmRjWVdQclA3ZjhqLzNkK0pRVUM1SHZIdnNPUmo3b01xbnhKalo2ZWVCRkJxTEVxUndHeXJ3THZwTWxLalo1dlFkYkMrSG1HTlIzYzZkeUY3aDJ5R21WN3Fsb2o1NTN6NUZnb0RYMXdTTnJJY3A2bmcxVHJmSE91RjNwSVdKeXg5RXZZQVcweHZPWlY3MjFtbHJPaFpKT29mRnFXd0xRU2xnUU92ZXhnYmVmOFFoRFJHWEtsay9Ob2hKUi91MzJ2NVQ2bm1mYk9JYTE5djBraVN3ZEVtU0pVWFpXK2JXMXN4QzJYMHp1S1JLczVRTWxBNUJ1OVNxNlBNcGZyYWZjdTVWaWxWa0VENWExUktEZ2Y0R3V2dVJMQWdUMHh1ZFh5cEx2Q2ovRVpHeDRwV3l0TFJTd1QxODdlNFM5SURiNGdGZXlEOGQ5WTRCWmp0ZFd4L1N5OUpXZGhvYVhZL3Y4amhIanBXWjJMYXNSOENmcDViU3RBUVI3eGdINVZQTStOZytJdStOaWFmTXNjaUJqKzZFc1czNXlBWkQ1N1daa2dnRkVsazR4QThKR2I0OUVreG0yZi9YT1BTU2dFdTNqTkVmNUF3cDlBQU1kdWNnSnhIRjBXb1p5dHE5UFZnNkQ5djlkZThpL2xQZ1E1eXFWSHJRT3llQXk0MEtkRHNJaFpQSzMvNzJYMVFBUjNSS3hqMFJ5VzF3RWN3RGUxVWc3dHRWZnNERWNOcWRmMURESFRsK2MrTmJpUWE3b1hHbTBqaWNkNWJPdGIxT1FxYkhNdmxBN1N5REo3Tzd4WHhDeXNrSG9WdUFySUtRK2ZmdFFWWXQ5WlpEazJoWUw4UDMrMmh4eGpZN1BIUHJ3UktjRUx2bnpoZmtzTW96WEgwWmlIOElIeFRHNjZub0F3UDFDUnRjV05SRXczdTNzZGtpbFhtbVZ2SG03KzRUMG1vY1lzcEtzL0hrRHJrL3RRd1ZuNm8wK2FtaEh5UkY0V0FJQXJ2RHJvZFVPVktYbkF0VURLRTZ1VEh4RDFmRjN0L01tSnJqZFZNTG9yL2tRNGNraXNXUmJDV0RxSktHQUZwbUcvK3hqd29BODN4cUdSRENKbUYrNXNNTUhCYjN1YUZwdXNFSFhqNG5VVnBMMUZyc29SRXM3WFlJOUlycEpKZTlOVHNMYXRCanFDaWFnNVQ4R3Fqajc1ekVReUx0V0hxNkpXTUVDVllnSitkbEtwNGQyZkxGZDR2emlUWWU5Z21kWjN0bXRHbkxmK1Nlc0pOQ3lUamZFZHdLZW1uRkVFbzcxMkRqbTRqRVRnZHNnbTVhM2JvRG1aOWdMKzBZcEE1bEtRUGRDTjJ3bmQ4V09PbHY4Z3NKcDR6WU1Id1F4Qmh3LzhsdjZjSDdzemtLSmVzUDBUTkJaYm1MNldQbGMzRUlYdTh5VDU2Q2lUMXQ5QS9WYlVOYU9SZnMvSkdISDE5eHhMc1BFOXk0bzA3c2pFR1JxczZiRzRnOXlMc1hrajdmazNoaDZveGVaaUI1QVhHMmtxNEh2TXhCNFNRNFdLWW55YmpJMzZKVVNpOVBzb25ObWpoS2RxRTBPSUxTZGRDYjJwSlRlOFNoZDc5Rzc0UTVWOERzb25NR1pORmFqdVpKRWttT0UwWVExTWxRY2k2VmFzUENjSi8vN29pZjhMOGhoY01USzNNa3I4WmpJNDEwUjRwdC9JWnMzQndxdDZiNzBlN3lDSFgzYnpEc2QraHR0RmhDeXVubGRDVUNVSXRuVXZ5YTZaUkd4U3VTQWNaOUtuRWh1cDVHd3VYOW9XUFZtb0F2S0RsNVRUTFhiWFVLenh5eE5PR1lYQ3FmRDQ1aXJFZ1JkSHd4WHJNRzByakZ1aWo5Z1hhQmNxVjNRK2twck9RZHRNQWxiUU1nYUN1aHBCOW95anZzWmViVE1GTThvVEg0UEtOdUNVZDk4eUgxZ2E0U3lkRUhKUElMelorM0llVEdoVnJtQUxLcHdvc3ZWK1FOMGZMNWx1dmlMYUwxNzZiaWpLbjZ4WUNOa0VqUDllSHBxL0NkbEJ0QnpKZ0huSlpOeUhWbC84WHR4TlhMUWIrWW83bHJTWHd3anNsWE4vM0ZMZHNCWjlyRVJJcVpwQVcxTzZPSVZ5TUY1T1BMTmwzd0owd3dVb3NDZUFVMjBNU0dPa3BOM3NNVDNwSk9hMjl5Vi9zVElBTkJhby9KQ0Q4NG9RNUFwQ2RXT2ZCMmpyYWNjQnpkbmJrZTVDSm5Cc09JQVozQ1VpY2MvWVZPVXRGSFlWUGFwOGdHandOQmNxSDBJWWo0N3BLOHRhdkl6SXdTQ3RackJmNWdtdjYrbDUraFZNZlBNT2ljT1NnRDk3SURpOVpOcGpnTGo3RVIxVG1uam0veGhIdXpnMnpNNmVhaEx3aTNUYTJWMVhlNS9HbmF0bjZ5R2FNanUwRGswU2V5Rk1vR3cwOXl5Y2VvazQyLy9ZNzBpRVRkM0ZIQ2U4ekFqRzk2Si85UXJJTXNRelhMajJib1ZWbGlPV25ka0taR0xoK0tkd3IrVVl6TGZpVWx3REFjK2JOSlR5UGsvanJxaW43QnhzK0F2VTNUbXE4dmF2RytvRzQ2MS9vbk1Sb3U5YVk4b3Qzd0VoeXZDTDYvZVRXakxXa2gySUx6cVpudW1wb2wyWTlJbFJMMGNRSVpLZ2JYWitpaXZiWlBnalRaSTVsUlFLOVZMaVArWUJxMkdkSlYrM2svczJEcW5KNXVrZXVaUUpKWTlLbE1paDZHU0dVTmV3U0JGakpMS2w4c1lOaStVdTJpRFdMUElZeTlXVmkzRWd1OXQ0V3BnYzVmaTZyR0FtOENlL3NqY1VPRTRwdUtWbnVmTklPU1J1Nzk0dVdwS1BaWHFwdVNQVThWUHJyUm1XUmxEWDFYNG5WSnQzYjg0N00zU0lJZzh1TlBlWncyMld4UkQ2Y0g0UHR5eDNKWFBMekJFM1dVWW9qKzN1VGtYb3ZlM1I1VjUxOUZkSzc2RW1la3FmUTJjUXkwKytaei92ckYzOFR5eXRTSzFUUThHSTFxMkFDMm1aT3NUL1lqSGxEcWVrMUhFbmFVT2NpUGIrUkliNWVmZ25Gc2ljRjF2aHcwR2JMODJFVXhwbU5tcUlXU1dwd3RkOVUrandVVkxxTEZCKzBLbitTMTAxa1AwWXlPUXBhd2NVYTVTZkoyRzJkdUNFbm14eGRRRUxsdkVQalB3cWU4U1d1M0xibm1wUEd3OUZrVGdMVkRteTR3RkxzcWN4ZTN1WkZmR2dabTJNK2xCcTQ5ME1vcHNTbkFRdnBERWhoWHRyTFpHYVRjK255bnVpa2UrWkZJdVl2c3NzRkZjcDJ0dGw5Q1FnZmMzSGtEUTJWN1pkaHdnNTNOaUR6aElCT0tPUEVJVWVGL3JXUVhLRmxwNlVTSGh5UDFhd01xYVNlRDhTbHFiVUpjTC9vNGNhd2tweDg5RlpKU3RhY1Nab3ZaQk9kb1VNTEc4dVdkb28raXYwZE9Bem5rMnE3Z1BPR0ZaeFJPYkxVMTJDQ1FsQklvaHJobmtQTE5hdTN6bldzTjBldUtlbUZMQTdaL3krN01QUVIwTFJzOXNQR2lzS2doemkvRzF4T2ZvOXk2bGdoZE9kcnhMa2pWTVJyMUNJbWV2LzdOK3k1a0VQWktWblhlanVCWFZtOWpvRWl4TDZjVy9ZU3dPY0x2QWFXc1BRWHBIUGcxcTJ5c2ttSEEyNFFETEdMUGloTEswMmRqNE5obHRmNWZBMkhDbjNpYTZIaGRKR2dtRTZnUW4vbTUzanRzSXNxSTdBMCttMkZhaFNmNkZqemh3bWxXZG9FS2hyemNOQTZHVmZjMU8rUmJtckFlUFlkUUVvVzdTRGlmS005dE50cys2eUZOdGRBRHd6Tm9ESUk1UXRvVDJDbnUvM0E0S1JpQUNtNUZYOHNWdERXTjVodHh6d3U1YWI1VnNGYkc1Zk42eGdRMWVpUkcrQTYxOUhZUk41NklTWTU0N1FaODNTckJGRkYwcWFUNG1OY1lOcjlNTDVmdDFnVnIzcHhsVmsyQW92cy9zVHUrY3N1MXFQVHhsODVpbHMrdFV1c2EyRTZsYmpKKzFPNGZPOEx3dWZldFZtTmJDd054akZnTlA4QUxwOVJOTVIyUFdEQk5xUUdYcHVOMnVmT2xJWFhGUjZLL2dwWFIvSzN0S3F6SmVycWNGVGpUK3JKK1BhWTBpRGE2Z2lmTjZMSUd3aUVRdkkxSnZFaFhMMmNCUFM0bmUwV3dJOW1jT3Jra1BzM0JaRWtUNlhCTXk5aFR6RHBrYVZCOVp2NUZBRDhuUXhQQ20wQU1rTU9NYnRwYTJPMWwvenBIU1I2S3dXaUROMzNFaTJHMzhXN3JLcHpIWmhjR3JWZ0p0cTVneXhKSTdHYnNTREIrNE1SNDh3eUNheDF4d3Rxa0hUdTB1dUtzTjd2ek5aTEhRcmkrNldPeEFDMWJ1SVZpakJZQ21HSkgzME9hdWgwT09yYjU5eXkwWkVOcU0yWUNBZkJOVlprVFR1M25CdWRuRmZCeklZVVBaTTQyNmJTN01DSFZDekh1cE9hNGI0TGhlRmx2Ryt2T3I0RTF1aTU2OHV2cXFNakx2MmpTSHJLL055Vlo5L2pIUy9RUitZOXpaa1locjlUcFppNC92MDExU2wxWnlhSXBYSHNqd3VQQzVseVBjMTdkQm8wSTR3TWZDQkpkaGxPS2xxbHluSkpsd1hPWjg2OUN6b2l5Q1VsWHREWXBnd0UvWUo0a2dwQ0ZqQ1IrZFVTQWtQem9taU9BS20rbUVXaDl0S0VzeHpnaityZ1krM1JmYWVXMXE2QmVvN2NnVFFVUWMzcnNvWlFSMGkyMmsvK3J2bm9tbkdrZnFtbjV4eDUwZjRJOGNYTjQvNXFMMlF4THJveDRjTVJ5NEMwNUJRSFFnRnFaYWVuSFV4b0NRZTBiNVIrSHBKSU55M2xVaUljRmQrYzBzOXUvMEdndnF4Wm5vKytrMjBhS25zWFVyOWJCVGRoOGEyUkVwdkc4WjhnMDJIQ3NMNWxrWmdDb0FrQUV5RllLUDB3NjdNZlpCdUkzNEJSYStpSEovWmZYTnhYMmcyeEgyL3QwLzVqR2dtMlJ0RzRURC9GaW1sRkt1YkdXdTAwb0VTSFRXREc4ZXlYQWlseE4vVlBMU2tvOXREd1Q5ckVQREttRlU5SW5oakdnSVBsbXVGZ0R6ZGJ0YVorN2JjZXFrc3c5bkNKTlptWjRrOWFTNTBEazl1ektCcWtRN3IzWFdSRFBXazI4ODRNeXA0bEhIcHBzYi9SR3NQRDZFdTYrOHVOQWJDemI4cTNKZFhXb0tpbzNwWWZEZFBUR2ZDY1MvdU5qNG1Pck1XSzVwM2EvYzFTcjRyY3JhbW5aRmZyZVRlbi94bjhVYkE4ZkdTMFVZeGtaNHdodWRTdUNLZzhOYXFleXg2cGIrYWkwSjNMUU1QZ3djemx0SjFyNlM4QjVMT04vUG1rZFBWMUliS0RKUXprVXZiSnBCNzRzeWp6aHZxUHlMc3BVSXBVOGROWENueVJ4UlhBMklyNHFhNStXVTBUMDVzampZbytmd0kweEFpNXhzUktHUnEzekZ3TlFYK1hoYmVrVmpjbGtya0N5R3pOdVlWcXU2VndleFlCb1dZREYxa2N5QU1TYlp6S1pSN3ZVcG52RmxUOWgxeDQzMWNFa1loYUttWHdUeDhtazhXL21KQy9ieDdsTUtaZ0xERDFRQUlpTTF4ZUEzZ1htWUZCVFg5UmI5RVRsajlrbTlVdVdwNytNWnhJZ2FvUWpQQkpyS2lOVTczUUVvcXlEeHNXcURxUWZONDViT3dybHF3WFB3S1lqb2Iydmp2Wmt6T1JUai9WejFTalJmdjJ3VDgyeFp3WDQ4eTBhVmNqczVkSFdlMGNWQ3JwTGEwcDU3WS9FWHNOL0tZbmlpeGF0VC9NUTdwT3pYMDBVbFpEd2kyRzdxdloyQlpXVjUvR1dQR05UbTYyYzdIc2hzWm05NC9za2ZKaDIyRXpxekZxWk90R1VIR05LcDVmY0R6TUllWm5iZkhCMTh4VWptTmlXaE9tT0dYTDZpVm1jc0pDNk53emNaVzZUTTlFclFIY3ZRYWE2eFprMDk5YWRLR1YzRlpCMktjQTlzWnlBVXBjd1FGc0dnR2RqR1lQYnRONDREYWRnOHVJbTg0N2pJeG9YWHZKU25HazB5K1cxNGJ3Z1JRR2pnd1ZTbmsrMDJpTk1mWXB3U2lUcDBFU1l0ZmJJY24xUWJPKzRraTlkcU1LeTBpbjAwR2FVai9FOWJPRDA2VzdrZVNyVFE5UFhFb3hsQUFtWjRpY1hUTjdwdmtLR2g2NFhkWExXZE5zUkFabHBSWHhrSGNRcDZzMkJBMXFyWmxYNHNmRUV0SkRhczhpMm96Q3dpbFhIV2lHRnlTYTdJRTJkeGozRDVZTXpiMk55UHJSWitiQnhiMitOZHYrZ1lmenlyR25Lelpra0NjbjZoZFBHY2J5MVM1MjhEUjk3aGk0bzV4blAramlldnVmRUtBNGdpRDJhaDd5bWdpQU5XWmFKd1RhdUpNOE1KRFZHVEJTb1VBNTNMYW5hdGhoUUI5OWxUREdHbTZucXpDQjZjaGNBc3NuRC8yY05XSVRyV21qckIyK1FyN3dQU1NzTmE2andBaEwvNFpZbnViZ0NRV2NzbWN5dEVEQjFaeFNlQllNdmluQ2g0YzhiTmVQVVpmQWFwbGRMRzZmN2xaUkovc21qdy82RDN3cW5HemE1RmpSdGFoSTdwVUFZcXl0amR0MFh4eTBMaGlZZFZidHRtMnhXTVIrNHg2eVJKVlg1NFNwVnFNOFh5K0VWZElEdnpPOXFRYzlPRXI3Q2ZKODJkcnQ3VVRZaU90NXZtcncvbUl5VldtV2kxZWRIbVdBSFVaZy96b2pkRWNqMmVlaW1aUzJnVC9iNW5tajBoTEJRZmNHS2pBZHRkWktvekJtMjRxZjUyajFtTzlTdENwdUpqSEUyZ2EzMW5JRDR2MDdpQlNMNHZiM0dZeC9yMGtSanM3ZHptNTY4azhpM3F0N2s2TmhtMjBDbTNVcmdsLzJNWGRGeml3eHF1NUlzcE5ObzFMWmxUaE9memZEUnpkTjMzMTh6MzJkczdjZGZMNE1sbk9hL1pEZDlWeFhURkllc3lzUzdCMXpqSzNIS2QzQ3VFamk3WmEvWTdOWHJta2RDVVF4dkU5OUtDS2piWGFjWFpRcUg3ZjNMakdtZXV3elpkR1dUQUxhWkg1SStPM1cwa0ZvcjFCd0o0TDhadWprVkxsZ3VkSmhlbmdSbkFMVFU3Q2hNY0FvMnpmVnJMNXoyUk9ST09qTXFNWnlTWXl4THV4SHgzSmpOeHBnbXlLTzh6ZXZMeExYUDk4VWFZL0lON2REUlRsOGFBR1pvZFFXUmxKOU1SMEV0a0NqU2VFSFBrZW92RmJUalErUzJkQjZ3bXpPbXpLME05RVBiMUw3OFN3OWVnaVM2OXc0aGM3L1BwelBoMnVzQTgzc1RFZXEwSWs2cDhoNGdHc0RQeVpLN1FpbHVEcDRQUWVhU1JqVDBjc0lRaWlEazVUYjhndmtWOW9ZZ3dSdmJzY2FzMkViZU9iWjA2N2Z0T0VjOTJCVlRzdU85a1I1OW5SL1pKRjlGbzNBNHRZNnJUUDRqNU5aVERZcHJSc1plREcrVSt6c1ZoUnJWOXU5WHdkMFQrVldBZzNmRmZFc2h0SUI2ZFYxTXZ5dHBPa3RUc1FFenFiUDRBRXlrU3B1M3l5akJicEcrZ3h2aGZLU3h1NmcwQ2VibC9tZ2xDRDNPejV3eU1IaUFiN3JxZ3NjRWZMZ3RDZ0tXRjM0b3cwTjVHa0xSQ0RZaHhkSHdEL0hmbTgxZHFSTGw0M3dKQWlWK25NbWdveUMwdDBjYU5lWXVFWUhmNjNKLzhIY2dpa2tFZUxJT3pwOGZtRVhVNGlDQnY2QkNvd290YnA4NEJITEpqYXFkQ0NwR0dmcnFiaml5ejN5TG4vRlV0WG1XZmZGOUxnRXExYkt6bTZMcjhMV3BwcTRmOEtlMU1vL3RZd1pObU80bDAyOWVQODdZRnBseXpub1k3SURTdFRQc3N5OUk0NWwwQ3NDV3JET2NiTUFEREZTOC9pa3k3ZGxraE9iVFJYK21TSTNzY2pwOTVLeUZQaTF2TlJHa3lUM3poT3g3OTB1SFRGczlJdWY0SFlNNURzWDBjM0lXcFpuVmI3MHBxbWZ0R1NmYXk4MHlUU1VLNm0va1MzK3BCREova2FRUjdOQmRLTTI4VE4yQ3ZURkhoV3QxMmJsMjhiUkZhS3ZDVnFZaE9ZamdEd2s4MXRpSWV0ZlVrZlV1cjRrTWFOQVpFcU9sUVl6U1VLOUh1YXhxV1Z3VHVyN3FkeGd0d2J4cEVpMklvcUtqdmdCTkZZdmxkYWoxN0s2c0hTbW45aWdIWWNyL2hYY0s5cVVuR1Z1TnBCeVNENlFZbXRsZW4rdSt2SGZtZEc1Z05jSXRvL1BuYjJpUjRLRDQ0QTVDV2hFSnJyVm5PRTJBeXhVZGlaV1hqK1FlRWFYbkJqWVBwekRLSm81R1Jxb0FDNUNYajZrRUFLSVd1dUdCWGJiekdia2szcFVycVExNnpwWnVrcU40Y01jbnBBMllzTzBUajZRbVJjYmlmL2pFK1hvdWFCWFdOb2IyMGxvdnJtNnl0MmpJaVJYdjA4TzRXQUw0T1JUNDNnSFJzOXZWRlE4S2ZwbGFnM21xRWJnMXdVUG91a1diVlhCWC9Qa3dYemlNMVFvOXUySEV2aTFjR21KNW1rWFhzTVZhN2EyYzFPUGxZazUyV0VzT05EZTZDSFVaRXByYVo2Um1VOVNvTUJWUkYzaG1DU1B0UHBJODd3R2VJOE1GbHRobEFIbTB3RVFWQkdaWEd1Y2R3bnlzZXRvR2pCOXdoaWxhVkk1R09wc29kMEtNL1pvOE1NN0VFSG1ZUlJFWU5TL2dLTmQ2U2tqL3F6N1RtLy9ZZEFBRUx3S2FpNWR4b1ZjU01uSS9MY2FRZmkwckpXOXF1V0h3MUNsVmtsVFRXS1lzSnYraUdJOXVvV1dHbWhXOURRY3h2WGlLeHRkS282VHZySmJmV0V2UmczZ3drN0lTL1E4c2tpbStseCtSWnQzU29wZ1RpV3NDS2lId1NNZzR0VmpoQURnRGdRRml2ZE9NbCtMYkNHRjg0bEIwSlN1a1lzL05kOHZ1cS9aMEZiejliVWZTY01NNWd4TkpTQVZLTlhKR0lrcWlHMWJTRFpMLzhwRkREZjRmb1VSRklaeXBkTG1WN0F3NU9PUklRWGVYRlJHWisxMVliYk4rYkdMSm8rZ2FoZWFWd2VYNVdTTlJIdmR5MkEzanRydEhHM1FkazFSRVdhT0JiTDd6QlVjTG80aXZvTis2c1lDOFlGMkZKWTFra2YveEQ5dTcvdWlmZ09HbXFpWE44dU5UdnVydmc3U2JjOFlSd3J2SWJ4WlpOSmRLdUtWWmpRQ2J1OFUyU09QUG9yT0E3NWFzNDJlK0lWSGlERTN1MkR3a1ZNaGJUVEh6dkZFaXhveHpMVHNCYi96b1h6SWxGNDVPYnoxY3lBU1lWUFNMbHYrWHRtdHJXNFNEQW9la0FmQi9hUko1cWorOXI4dVBzOTRZSDhIM0JqMTU2SG1heDN1ZWlZSExVclBodGRoOFh1K0Q5VVl1Vm96anNkMEp3dThyd21hSzdKMm9zcnNRak4wRXFYaGR2SU12Wm5ERUpoblIrUDRGUWFQN1IrOXdRaE0vVWxEc3kwVHJTSXRzR01yczZzdkU3K1djblRhbUJxbE1VU2xuWmp6aHkybWd0VUVLdjNPL0drYlpDd1Y5M1dqTDQ2UVMrTDRWOUFNa3ZDV2RySFlJMUFXT0dWREpobUE5MmpOdFNZcE1HTFo3dWxVS2JtdnN4TkNDQ1JvS2VWSFVjZVdTWmtJUkI0Q1hXVWpvbmVEQjlwTUxZR1NxcW91R3ZCSlNZN2xZSkJ1WE5vNHNtZWNIYklZMGJ2QXBPYWNxQUNSQmFXUFJ3ek8zSjBvVy9za2RYeHJNSXQ3OElGOFlMUDNZLzNrcDcydnF0NWRucHFKQWRwbnhoUGpKSlJqdmVLazV4NWJMcFkwV0c5MDROYktrNEMyL0p0Y1FKaS9FeTdSbkJxaWU2TWlPZElHcWI3MnhEd3dxcC9WU0grb1Z0U1lKZFd6UGt0Rm5uZ3VrQ3FlL1NsaFhRZTZsUEl0bTBlb3hQKzh6RGtXZUxzY2JxZkd5cTRzOEdISnpKdjZsYmJTUzZiSThUNTlLUVArSitBLzJ6UWM5QUNkWkxsN2hCZ2V4UHV3c0dwbUt0MlBEWll5cW1KcVc3US9qc1VwWkwzdS9lZmlsd1d6SFBVeTY5M1RkK0I1ek9GR3VTaHl4MDc3L0FFQWJyNVdKRjF3RTV0TnFwMythdDFrOW5PODlzc2ZrS3hRTkpMWHc2cU5VKzU3RU5WQ3EyY2Rrcm0xN2NUV0ZYN3NjYWt2Y3JGaWpLOGd3Q3djTWJWczhNK05tUEN2UHhBNmh0aHQ0Tjh1WGpBaWdRK2xrRU9nZTR4TmpZVVFXNCtkYUZ5TDVGN0Q3THhpZXQ4Q0dhUVYwbkMyUjJ2dWZJT0x2YTBTUlMrRHNoNGhUcVlJRFpmWGFEL01NTDVvaDFxaGllb2U3akJJOXZxOURNZ1IzVWhGRFZ3cTUwYjIzVUFJNG9pNEk2NWI3azFWaHFyQm9zRlNOdmUxY0NHbHdYVHhibnFqWmJBQjJuTFNwL1hIbTRna2VVbU8zb1ZzZUtXaWRMamN5TnJvSnRVMVhHY0tnd01wZE1DbFhydzRDVm5DTWRqaXpOdWtIQUxHb2FxS09UUVZJb2lQUHBsUGxrZ0RTdUN4d05YcmdmRGRpaDJBdXZINEV4TnZCNFB5TThCQmsvMkxhd2lzNDVrai80bW9OUEd4S3dlSXUvMkNyZGIya1pRbGYrTkVoTE1aS3hPOGVzUk9BYkszT0NOQVREM0hzeThBTkVDU3ptTTM5djB2YktmSDFLWUp5Mm9OcGtXdkNEUS9aVFI2cCtwS1RXZk50dEVzTzZxbkszcDZ4UzA2akQyRmxUTUNRTFhscUdwMkNpMExyckJEdnMrVnQ3OXcvcHd6S2V2eG9sV2tEZnh2U09LNjh5emU2ZDc4TWJhaEtpaU9CTDVoRzh2YXg2QUl1RW40WlBUVk1hbWpXZ0d3NmdJYWs1djRWZlJFeUcwbEtIR1Q5aDl2YXRVcjFCVzVUZ1Z3TWtBdnZMNUZCNFZCdFBLMnlOK3VnNW1qVVlBZ1NFQk9GSWM3b013MTBrZVpWTjF1NEtUaVlOWnFDeXluZFNhUzk1MGh6dVYyNS9XcjVaVVdkS0VZaytOVkplWnJPdjZvNUhHRUtLZE84RldjZzI0ZTd4VDFmMG5rRitUeEpWN0VrbGRyYzlVYVdnaStIZitNb21TbEpQemhmZ2IvSEhwWmRFMEJoU09zNmRlWXFBcWJjSHZPZFVUR1NCU1hWWm9JaWJwQ3N3QUMyYW9vbyt3MHhUcmZzQzV5OHo2bEJzejZXZjBybEJPaHl4ZERVWUJVZXFIY2loeFN0a3k0SUlDSC80alhVU2x0MEdHVXRYZitpVVdScVZhN3ozOFBrMHdyaEs3VmJ2YVVOaTNuM3N5ZVlkeTI4YUZIVkpCVGR5d0FrNW5aYkpGdXZUY0xLcTdsSjM3ZERlU0RWSnFnbXdXTXFsN0NUOThWeDdlRTBIVlZ4RmxpQ3FYU1dHYnUrbDA5T2FNK0ZiUWVVR3BBNkNrVk51eUJCYkVGTnhTYlpaMkNsRUlqVnF5TXo1TkI1WUFnNlc5SDYvL1RmaDl5UXhNekdiRU5HTnhBcGFZd1h6b3F0Yy81OWNFa0RKRlZsdUlBZXFVR25DMmZBQk5LS2sxQ1N4QUNNaCtTUUF6TWJBQXlQUUFBQUFBRFhBQkhXcUduQUFHTzZQQUFBQUFBQT0iLz48ZmlsdGVyIGlkPSJnbG93IiB4PSItMjAlIiB5PSItMjAlIiB3aWR0aD0iMTQwJSIgaGVpZ2h0PSIxNDAlIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIxMCIgcmVzdWx0PSJibHVyIi8+PGZlQ29sb3JNYXRyaXggaW49ImJsdXIiIHR5cGU9Im1hdHJpeCIgdmFsdWVzPSIwIDAgMCAwIC4wNSAwIDAgMCAwIC42NSAwIDAgMCAwIDEgMCAwIDAgLjQyIDAiIHJlc3VsdD0iY3lhbiIvPjxmZU1lcmdlPjxmZU1lcmdlTm9kZSBpbj0iY3lhbiIvPjxmZU1lcmdlTm9kZSBpbj0iU291cmNlR3JhcGhpYyIvPjwvZmVNZXJnZT48L2ZpbHRlcj48cmFkaWFsR3JhZGllbnQgaWQ9ImFtYmllbnQiPjxzdG9wIHN0b3AtY29sb3I9IiMwODIxNGMiIHN0b3Atb3BhY2l0eT0iLjIiLz48c3RvcCBvZmZzZXQ9Ii42NSIgc3RvcC1jb2xvcj0iIzA1MGExYiIgc3RvcC1vcGFjaXR5PSIuMDgiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMwMTAzMGIiIHN0b3Atb3BhY2l0eT0iLjI2Ii8+PC9yYWRpYWxHcmFkaWVudD48L2RlZnM+PHVzZSBocmVmPSIjYXJ0Ii8+PHJlY3Qgd2lkdGg9IjIwNDgiIGhlaWdodD0iMjA0OCIgZmlsbD0idXJsKCNhbWJpZW50KSI+PGFuaW1hdGUgYXR0cmlidXRlTmFtZT0ib3BhY2l0eSIgdmFsdWVzPSIuNDU7LjcyOy40NSIgZHVyPSI2cyIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiLz48L3JlY3Q+PGcgb3BhY2l0eT0iLjE2IiBmaWx0ZXI9InVybCgjZ2xvdykiPjx1c2UgaHJlZj0iI2FydCI+PGFuaW1hdGVUcmFuc2Zvcm0gYXR0cmlidXRlTmFtZT0idHJhbnNmb3JtIiB0eXBlPSJ0cmFuc2xhdGUiIHZhbHVlcz0iMCA1OzAgLTc7MCA1IiBkdXI9IjUuNXMiIHJlcGVhdENvdW50PSJpbmRlZmluaXRlIi8+PGFuaW1hdGUgYXR0cmlidXRlTmFtZT0ib3BhY2l0eSIgdmFsdWVzPSIuMDg7LjE4Oy4wOCIgZHVyPSI1LjVzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIvPjwvdXNlPjwvZz48L3N2Zz4='
    const PALETTES = Object.freeze({
      light: Object.freeze({
        canvas: 'rgb(225 235 250 / 76%)',
        surface1: 'rgb(239 245 255 / 76%)',
        surface2: 'rgb(248 251 255 / 86%)',
        surface3: 'rgb(218 229 250 / 88%)',
        textPrimary: '#111C38',
        textSecondary: '#384A6B',
        textMuted: '#637497',
        signal: '#006F9E',
        marker: '#8147D9',
        success: '#167A62',
        danger: '#C23F66',
        hairline: 'rgb(20 119 185 / 25%)'
      }),
      dark: Object.freeze({
        canvas: 'rgb(2 5 16 / 70%)',
        surface1: 'rgb(6 13 34 / 74%)',
        surface2: 'rgb(10 21 48 / 82%)',
        surface3: 'rgb(17 31 65 / 88%)',
        textPrimary: '#ECF7FF',
        textSecondary: '#B7C9EA',
        textMuted: '#7E96C2',
        signal: '#24D8FF',
        marker: '#C963FF',
        success: '#48E0B0',
        danger: '#FF658D',
        hairline: 'rgb(36 216 255 / 24%)'
      })
    })

    const TOKEN_ROLES = Object.freeze({
      '--dsw-alias-bg-base': 'canvas',
      '--dsw-alias-bg-layer-1': 'surface1',
      '--dsw-alias-bg-layer-2': 'surface2',
      '--dsw-alias-bg-layer-3': 'surface3',
      '--dsw-alias-bg-module-platform': 'surface1',
      '--dsw-alias-bg-overlay': 'surface3',
      '--dsw-alias-markdown-code-block': 'surface2',
      '--dsw-alias-label-primary': 'textPrimary',
      '--dsw-alias-label-primary-bluish': 'textPrimary',
      '--dsw-alias-label-secondary': 'textSecondary',
      '--dsw-alias-label-tertiary': 'textMuted',
      '--dsw-alias-label-caption': 'textMuted',
      '--dsw-alias-label-dimmed': 'textMuted',
      '--dsw-alias-label-primary-dimmed': 'textMuted',
      '--dsw-alias-markdown-placeholder': 'textMuted',
      '--dsw-alias-brand-primary': 'signal',
      '--dsw-alias-brand-text': 'signal',
      '--dsw-alias-button-primary-fill': 'marker',
      '--dsw-alias-button-info-fill': 'signal',
      '--dsw-alias-state-business-primary': 'signal',
      '--dsw-alias-border-l1': 'hairline',
      '--dsw-alias-border-l2': 'hairline',
      '--dsw-alias-border-l2-darkmode-thin': 'hairline',
      '--dsw-alias-border-l3': 'hairline',
      '--dsw-alias-separator-primary': 'hairline',
      '--dsw-alias-state-success-primary': 'success',
      '--dsw-alias-state-success-secondary': 'success',
      '--dsw-alias-state-error-primary': 'danger',
      '--dsw-alias-state-error-secondary': 'danger',
      '--dsw-alias-interactive-bg-hover-danger': 'danger',
      '--dsw-alias-state-warn-primary': 'marker',
      '--dsw-alias-state-warn-secondary': 'marker',
      '--dsw-alias-scrollbar-bg-l2': 'hairline',
      '--dsw-alias-scrollbar-hover-l2': 'signal'
    })

    const DERIVED_TOKENS = Object.freeze({
      '--dsw-alias-label-primary-foreground': (palette: any) => palette === PALETTES.light ? '#FFFFFF' : '#061024',
      '--dsw-alias-state-warn-label': (palette: any) => palette.marker,
      '--dsw-alias-interactive-bg-hover': (palette: any) => palette.surface2,
      '--dsw-alias-interactive-bg-hover-solid': (palette: any) => palette.surface3,
      '--dsw-alias-interactive-bg-active': (palette: any) => palette.surface3,
      '--dsw-alias-button-primary-hover': (palette: any) => palette.marker,
      '--dsw-alias-button-info-hover': (palette: any) => palette.signal,
      '--dsw-alias-button-primary-dimmed': (palette: any) => palette.textMuted,
      '--dsw-alias-fill-tsp-secondary': (palette: any) => palette.surface3,
      '--dsw-alias-state-warn-tertiary': (palette: any) => `color-mix(in srgb, ${palette.marker} 18%, ${palette.surface1})`,
      '--dsw-alias-state-success-tertiary': (palette: any) => `color-mix(in srgb, ${palette.success} 18%, ${palette.surface1})`
    })

    const CYBERUI_STYLES = `
html.dsh-theme-cyberui-loaded {
  --cyberui-radius-sm: 8px;
  --cyberui-radius-md: 12px;
  --cyberui-radius-lg: 16px;
  --cyberui-bg-nested: rgb(226 236 252 / 88%);
  --cyberui-shadow-raised: 0 8px 24px rgb(35 48 92 / 12%);
  --cyberui-shadow-overlay: 0 18px 50px rgb(22 26 65 / 24%);
  --cyberui-focus-color: #8147D9;
  --cyberui-focus-ring: rgb(129 71 217 / 24%);
  --cyberui-scrim: linear-gradient(90deg, rgb(233 241 253 / 88%) 0%, rgb(233 241 253 / 63%) 48%, rgb(226 236 252 / 76%) 100%);
  --cyberui-grid: rgb(0 111 158 / 7%);
  --cyberui-track: rgb(0 111 158 / 30%);
  --cyberui-scrollbar-track: rgb(17 28 56 / 5%);
  --cyberui-sidebar: linear-gradient(155deg, rgb(5 12 34 / 94%) 0%, rgb(10 20 52 / 88%) 52%, rgb(20 10 52 / 90%) 100%);
  --cyberui-pane: linear-gradient(145deg, rgb(245 249 255 / 80%), rgb(225 236 253 / 68%));
  --cyberui-header: linear-gradient(90deg, rgb(240 247 255 / 88%), rgb(229 238 255 / 72%));
  --cyberui-active: linear-gradient(90deg, rgb(36 216 255 / 19%), rgb(201 99 255 / 14%));
  --cyberui-hover: rgb(92 157 255 / 12%); --cyberui-neon: #24D8FF; --cyberui-violet: #C963FF;
  --cyberui-glass: rgb(247 250 255 / 88%); --cyberui-glass-text: #15213D; --cyberui-glass-muted: #536483;
  --cyberui-art: url('${BACKGROUND_ART}');
}
html.dsh-theme-cyberui-loaded.dark,
html.dsh-theme-cyberui-loaded[data-theme='dark'],
html.dsh-theme-cyberui-loaded:has(body[data-ds-dark-theme]) {
  --cyberui-bg-nested: rgb(5 14 37 / 90%);
  --cyberui-shadow-raised: 0 0 0 1px rgb(36 216 255 / 8%), 0 10px 28px rgb(0 0 0 / 32%);
  --cyberui-shadow-overlay: 0 0 0 1px rgb(201 99 255 / 14%), 0 22px 60px rgb(0 0 0 / 52%);
  --cyberui-focus-color: #C963FF;
  --cyberui-focus-ring: rgb(201 99 255 / 30%);
  --cyberui-scrim: linear-gradient(90deg, rgb(2 5 16 / 90%) 0%, rgb(2 5 16 / 64%) 48%, rgb(4 8 25 / 76%) 100%);
  --cyberui-grid: rgb(36 216 255 / 7%);
  --cyberui-track: rgb(36 216 255 / 35%);
  --cyberui-scrollbar-track: rgb(236 247 255 / 4%);
  --cyberui-sidebar: linear-gradient(155deg, rgb(2 7 22 / 96%) 0%, rgb(7 16 43 / 92%) 52%, rgb(20 7 47 / 94%) 100%);
  --cyberui-pane: linear-gradient(145deg, rgb(4 11 29 / 78%), rgb(9 17 43 / 68%));
  --cyberui-header: linear-gradient(90deg, rgb(6 15 39 / 94%), rgb(15 20 52 / 78%));
  --cyberui-active: linear-gradient(90deg, rgb(36 216 255 / 18%), rgb(201 99 255 / 16%));
  --cyberui-hover: rgb(36 216 255 / 9%); --cyberui-glass: rgb(7 14 34 / 88%); --cyberui-glass-text: #ECF7FF; --cyberui-glass-muted: #AFC2E4;
}
html.dsh-theme-cyberui-loaded body {
  background-color: #020510;
  background-image: var(--cyberui-scrim), var(--cyberui-art);
  background-position: center;
  background-size: cover;
  background-attachment: fixed;
  background-repeat: no-repeat;
}
html.dsh-theme-cyberui-loaded [id='root'] { background: transparent; } html.dsh-theme-cyberui-loaded [role='tree'] { overflow-x: clip !important; scrollbar-width: none !important; } html.dsh-theme-cyberui-loaded [role='tree'] > div { width: calc(100% - 4px); max-width: calc(100% - 4px); } html.dsh-theme-cyberui-loaded [role='tree']::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
html.dsh-theme-cyberui-loaded :is(main, [role='main'], [data-role='canvas']) { background-color: transparent; }
html.dsh-theme-cyberui-loaded div:has(> [data-slot='sidebar']),
html.dsh-theme-cyberui-loaded [data-slot='sidebar'] > div {
  --dsw-alias-label-primary: #ECF7FF; --dsw-alias-label-secondary: #B7C9EA; --dsw-alias-label-tertiary: #7E96C2;
  --dsw-alias-interactive-bg-hover: rgb(36 216 255 / 10%);
  position: relative;
  color: #ECF7FF; background: var(--cyberui-sidebar);
  border-color: rgb(36 216 255 / 18%);
  box-shadow: inset -1px 0 rgb(36 216 255 / 12%), 12px 0 36px rgb(0 0 0 / 18%);
}
html.dsh-theme-cyberui-loaded [data-slot='sidebar'] > div::before {
  content: ''; position: absolute; inset: 0 0 auto;
  height: 2px; pointer-events: none;
  background: linear-gradient(90deg, transparent, var(--cyberui-neon) 34%, var(--cyberui-violet) 72%, transparent);
  box-shadow: 0 0 18px rgb(36 216 255 / 70%);
}
html.dsh-theme-cyberui-loaded [data-slot='sidebar'] :is(header, [data-role='topbar']) {
  background: linear-gradient(180deg, rgb(36 216 255 / 8%), transparent);
  border-color: rgb(36 216 255 / 14%);
}
html.dsh-theme-cyberui-loaded [data-slot='sidebar'] svg { color: var(--cyberui-neon); }
html.dsh-theme-cyberui-loaded [data-slot='sidebar'] :is(button, a, [role='button']) {
  border-color: transparent; color: inherit; background: transparent;
  transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}
html.dsh-theme-cyberui-loaded [data-slot='sidebar'] :is(button, a, [role='button']):hover {
  background: var(--cyberui-hover);
  border-color: rgb(36 216 255 / 20%);
  box-shadow: none;
}
html.dsh-theme-cyberui-loaded [data-slot='sidebar'] :is([aria-current='page'], [aria-current='true'], [data-state='active']) {
  background: var(--cyberui-active); border-color: rgb(36 216 255 / 24%); box-shadow: none;
}
html.dsh-theme-cyberui-loaded [data-slot='sidebar'] :is([aria-current='page'], [aria-current='true'], [data-state='active'])::before, html.dsh-theme-cyberui-loaded [data-slot='sidebar'] :is([aria-current='page'], [aria-current='true'], [data-state='active'])::after { display: none; }
html.dsh-theme-cyberui-loaded div:has(> [data-slot='sidebar.workspaces']) { position: relative; }
html.dsh-theme-cyberui-loaded div:has(> [data-slot='sidebar.workspaces'])::after { content: ''; position: absolute; inset: auto 0 0; height: 24px; pointer-events: none; background: linear-gradient(90deg, rgb(7 16 43 / 96%), rgb(16 10 48 / 96%)); }
html.dsh-theme-cyberui-loaded :is([data-pane='conversation'], [data-pane='details'], [data-slot='conversation'] > div, [data-slot='details'] > div) {
  background: var(--cyberui-pane);
  border-color: var(--dsw-alias-border-l1);
}
html.dsh-theme-cyberui-loaded [data-pane='conversation'] :is(header, [data-role='topbar']) {
  background: var(--cyberui-header); border-color: var(--dsw-alias-border-l1);
  box-shadow: 0 1px rgb(36 216 255 / 8%);
}
html.dsh-theme-cyberui-loaded :is(header, aside, nav, [data-role='sidebar'], [data-role='topbar']) { border-color: var(--dsw-alias-border-l1); }
html.dsh-theme-cyberui-loaded :is([data-message-role], [data-role='composer'], [data-role='input-area'], [data-composer-card='true']) {
  background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--cyberui-radius-md); box-shadow: var(--cyberui-shadow-raised);
}
html.dsh-theme-cyberui-loaded [data-composer-card='true']::before, html.dsh-theme-cyberui-loaded [data-composer-card='true']::after { display: none; }
html.dsh-theme-cyberui-loaded :is(pre, [data-role='code-block'], [data-role='thinking']) {
  background: var(--cyberui-bg-nested);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--cyberui-radius-md);
}
html.dsh-theme-cyberui-loaded :is(pre, [data-role='tool-output']) { overflow: auto; max-width: 100%; }
html.dsh-theme-cyberui-loaded :is(pre, code, [data-role='tool-output']) { overflow-wrap: normal; word-break: normal; min-width: 0; }
html.dsh-theme-cyberui-loaded :is(a, [data-role='message-content']) { overflow-wrap: anywhere; }
html.dsh-theme-cyberui-loaded :is(blockquote, table, [data-role='attachment']) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l1); }
html.dsh-theme-cyberui-loaded :is(button, input, textarea, select, [role='button'], [tabindex]):focus-visible {
  outline: none;
  box-shadow: none;
}
html.dsh-theme-cyberui-loaded :is(button, input, textarea, select, [role='button']) { border-radius: var(--cyberui-radius-sm); }
html.dsh-theme-cyberui-loaded :is([role='dialog'], [role='menu'], [role='listbox'], [role='tooltip'], [role='status'], [role='alert']) {
  background: var(--cyberui-glass); border: 1px solid rgb(255 255 255 / 42%); border-radius: var(--cyberui-radius-lg);
  box-shadow: var(--cyberui-shadow-overlay); color: var(--cyberui-glass-text); backdrop-filter: blur(28px) saturate(145%); -webkit-backdrop-filter: blur(28px) saturate(145%);
}
html.dsh-theme-cyberui-loaded [role='dialog'] * { color: inherit; }
html.dsh-theme-cyberui-loaded [role='dialog'] :is(p, small) { color: var(--cyberui-glass-muted); }
html.dsh-theme-cyberui-loaded [role='dialog'] button::before, html.dsh-theme-cyberui-loaded [role='dialog'] button::after { display: none; }
html.dsh-theme-cyberui-loaded :is([role='menuitem'], [role='option']) { border-radius: var(--cyberui-radius-sm); }
html.dsh-theme-cyberui-loaded :is(input, textarea, select)[aria-invalid='true'] { border-color: var(--dsw-alias-state-error-primary); }
html.dsh-theme-cyberui-loaded [data-role='tool-call'] {
  --cyberui-stage: var(--dsw-alias-label-tertiary);
  position: relative;
  margin-inline-start: 16px;
  padding: 10px 10px 10px 34px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--cyberui-radius-md);
  box-shadow: var(--cyberui-shadow-raised);
}
html.dsh-theme-cyberui-loaded [data-role='tool-call']::before {
  content: '';
  position: absolute;
  inset: 16px auto auto 13px;
  width: 8px;
  height: 8px;
  border: 2px solid var(--cyberui-stage);
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 0 10px var(--cyberui-stage);
}
html.dsh-theme-cyberui-loaded [data-role='tool-call']::after { content: ''; position: absolute; inset: 28px auto -10px 18px; border-inline-start: 1px solid var(--cyberui-track); }
html.dsh-theme-cyberui-loaded [data-role='tool-call']:last-child::after { display: none; }
html.dsh-theme-cyberui-loaded [data-role='tool-call'][data-state='error'] { --cyberui-stage: var(--dsw-alias-state-error-primary); }
html.dsh-theme-cyberui-loaded [data-role='tool-call'][data-state='warning'] { --cyberui-stage: var(--dsw-alias-state-warn-primary); }
html.dsh-theme-cyberui-loaded [data-role='tool-call'][data-state='success'] { --cyberui-stage: var(--dsw-alias-state-success-primary); }
html.dsh-theme-cyberui-loaded [data-role='tool-call'][data-state='running'] { --cyberui-stage: var(--dsw-alias-brand-primary); }
html.dsh-theme-cyberui-loaded :is([data-empty='true'], [data-role='empty-state']) { border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--cyberui-radius-md); color: var(--dsw-alias-label-secondary); }
html.dsh-theme-cyberui-loaded :is([data-scrollable], [role='tree'], pre, [role='dialog']) { scrollbar-color: var(--dsw-alias-scrollbar-bg-l2) var(--cyberui-scrollbar-track); scrollbar-width: thin; }
html.dsh-theme-cyberui-loaded :is([data-scrollable], [role='tree'], pre, [role='dialog'])::-webkit-scrollbar { width: 8px; height: 8px; background: var(--cyberui-scrollbar-track); }
html.dsh-theme-cyberui-loaded :is([data-scrollable], [role='tree'], pre, [role='dialog'])::-webkit-scrollbar-thumb { background: var(--dsw-alias-scrollbar-bg-l2); border: 2px solid transparent; border-radius: 999px; background-clip: padding-box; }
html.dsh-theme-cyberui-loaded :is([data-scrollable], [role='tree'], pre, [role='dialog'])::-webkit-scrollbar-thumb:hover { background-color: var(--dsw-alias-scrollbar-hover-l2); } html.dsh-theme-cyberui-loaded [data-slot='sidebar'] * { scrollbar-color: rgb(36 216 255 / 24%) transparent; } html.dsh-theme-cyberui-loaded [data-slot='sidebar'] *::-webkit-scrollbar { background: transparent; } html.dsh-theme-cyberui-loaded [role='tree'] { scrollbar-width: none !important; scrollbar-color: transparent transparent !important; } html.dsh-theme-cyberui-loaded [role='tree']::-webkit-scrollbar,
html.dsh-theme-cyberui-loaded [role='tree']::-webkit-scrollbar-track,
html.dsh-theme-cyberui-loaded [role='tree']::-webkit-scrollbar-thumb,
html.dsh-theme-cyberui-loaded [role='tree']::-webkit-scrollbar-corner { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; box-shadow: none !important; }
html.dsh-theme-cyberui-loaded :is(main, [role='main'], [data-role='canvas']) { min-width: 0; }
html.dsh-theme-cyberui-loaded :is(article, section, [data-message-role]):has(> table) { max-width: 100%; overflow-x: auto; }
html.dsh-theme-cyberui-loaded table { display: table; width: max-content; min-width: 100%; }
html.dsh-theme-cyberui-loaded :is(th, td, blockquote) { overflow-wrap: anywhere; }
html.dsh-theme-cyberui-loaded [data-role='tool-call'] + [data-role='tool-call'] { margin-block-start: 8px; }
html.dsh-theme-cyberui-loaded :is(aside, [data-role='sidebar']) :is([title], [data-role='title']) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 640px) {
  html.dsh-theme-cyberui-loaded body { background-position: 58% center; }
  html.dsh-theme-cyberui-loaded :is([data-message-role], [data-role='composer'], [data-role='input-area'], [data-composer-card='true']) { border-radius: var(--cyberui-radius-sm); }
}
@media (prefers-reduced-motion: reduce) {
  html.dsh-theme-cyberui-loaded :is(button, input, textarea, select, [role='button'], [tabindex]) { scroll-behavior: auto; transition: none; }
}
`

    function buildOverrides() {
      const tokens = {}
      for (const [token, role] of Object.entries(TOKEN_ROLES)) (tokens as any)[token] = { light: PALETTES.light[role], dark: PALETTES.dark[role] }
      for (const [token, resolve] of Object.entries(DERIVED_TOKENS)) (tokens as any)[token] = { light: resolve(PALETTES.light), dark: resolve(PALETTES.dark) }
      return tokens
    }

    function applyCyberuiTheme(ctx: any): () => void {
      const root = document.documentElement
      const originalTitle = document.title
      root.classList.add(ROOT_CLASS)
      const disposeTokens = ctx.theme.overrideTokens(OVERRIDE_SOURCE, buildOverrides())
      document.getElementById(STYLE_ID)?.remove()
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CYBERUI_STYLES
      document.head.append(style)
      document.title = PRODUCT_TITLE

      return () => {
        style.remove()
        disposeTokens()
        if (document.title === PRODUCT_TITLE) document.title = originalTitle
        root.classList.remove(ROOT_CLASS)
      }
    }

    // 主题状态管理
    let themeCtx: any = null
    let themeDispose: (() => void) | null = null

    function activateCyberuiTheme() {
      if (themeDispose || !themeCtx) return
      themeDispose = applyCyberuiTheme(themeCtx)
    }

    function deactivateCyberuiTheme() {
      if (themeDispose) {
        themeDispose()
        themeDispose = null
      }
    }

    
    // ============================================================
    // 客户端插件入口
    // ============================================================

    function apply(ctx: any) {
      // 0. 保存 ctx，初始化时检查是否已在鲸鱼模式
      themeCtx = ctx;
      ctx.effect(() => () => { deactivateCyberuiTheme(); }, 'dsh-whale: theme cleanup');
      if (currentMode !== 'off' && ctx.theme) activateCyberuiTheme();


      const command = ctx.get('commandUi');
      const sessions = ctx.sessions;
      const slots = ctx.slots;

      // 1. popupSelect 装饰
      ctx.effect(
        () =>
          command.decorate({
            name: 'whale',
            available: () => true,
            ui: {
              kind: 'popupSelect',
              options: async () => MODES,
              onSelect: async (option: WhaleOption, session: any) => {
                const live = sessions.binding(session.sessionId)?.session;
                if (!live) throw new Error('会话尚未就绪');
                const result = await live.command(`/whale ${option.id}`);
                if (!result.ok) {
                  throw new Error(`切换失败：${result.error?.message ?? '未知错误'}`);
                }
                if (option.id !== 'off') {
                  showWhaleTransition(() => activateCyberuiTheme());
                } else {
                  deactivateCyberuiTheme();
                }
                currentMode = option.id;
                notifyModeChange(option.id);
                try {
                  localStorage.setItem(STORAGE_KEY, option.id);
                } catch {
                  /* ignore */
                }
              },
            },
          }),
        'dsh-whale: /whale popup decoration',
      );

      // 2. turnTail token 节省统计
      if (slots && typeof slots.inject === 'function') {
        slots.inject('conversation.chat.turnTail', () =>
          slots.register(
            {
              name: 'conversation.chat.turnTail',
              select: selectWhaleStats,
            },
            WhaleTokenStats,
          ),
        );
      }

      // 3. 会话头部鲸鱼图标按钮（DeepSeek 风格 SVG + 喷水动画）
      if (slots && typeof slots.inject === 'function') {
        slots.inject('conversation.session.header.actions', () =>
          slots.register(
            {
              name: 'conversation.session.header.actions',
              id: 'whale-toggle',
              order: 15,
            },
            WhaleHeaderAction,
          ),
        );
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});



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
    const inject = ['commandUi', 'sessions', 'slots'];

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
    function showWhaleTransition() {
      if (document.querySelector('.whale-transition-overlay')) return;
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
        setTimeout(() => overlay.remove(), 2600);
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
        if (nextMode !== 'off') showWhaleTransition();
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
    // 客户端插件入口
    // ============================================================

    function apply(ctx: any) {
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
                if (option.id !== 'off') showWhaleTransition();
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


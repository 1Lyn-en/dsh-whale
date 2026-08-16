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
  id: "@1lyn-en/dsh-whale",
  factory: (require: any) => {
    const module = { exports: {} };
    const exports: any = module.exports;

    const React = require("react");
    const { useState, useEffect, useRef, useMemo } = React;

    /** 客户端服务依赖 */
    const inject = ["commandUi", "sessions", "slots"];

    interface WhaleOption {
      id: string;
      label: string;
      detail: string;
    }

    /** 6 档模式 */
    const MODES: WhaleOption[] = [
      { id: "off", label: "关闭", detail: "恢复正常说话" },
      { id: "lite", label: "轻度", detail: "去客套话，保留完整句子" },
      { id: "full", label: "标准", detail: "去冠词，碎片化表达（默认）" },
      { id: "ultra", label: "极致", detail: "一个词能说清不用两个词" },
      { id: "wenyan-lite", label: "文言·轻度", detail: "半文言，去废话" },
      { id: "wenyan-full", label: "文言·极致", detail: "纯文言文" },
    ];

    /** 各模式的估算节省率（用于反推正常输出量） */
    const SAVE_RATIO: Record<string, number> = {
      off: 0,
      lite: 0.35,
      full: 0.55,
      ultra: 0.70,
      "wenyan-lite": 0.45,
      "wenyan-full": 0.60,
    };

    /** 当前模式（从 localStorage 恢复，popup 切换时更新） */
    const STORAGE_KEY = "dsh-whale:mode";
    let currentMode = "off";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && MODES.some((m) => m.id === saved)) {
        currentMode = saved;
      }
    } catch { /* localStorage 不可用时忽略 */ }

    /** 从 assistant blocks 提取纯文本 */
    function extractText(blocks: any[]): string {
      if (!blocks) return "";
      return blocks
        .filter((b: any) => b.kind === "text")
        .map((b: any) => b.text ?? "")
        .join("");
    }

    /** 估算文本 token 数（混合中英文，字符数/2.5） */
    function estimateTokens(text: string): number {
      if (!text) return 0;
      return Math.round(text.length / 2.5);
    }

    // ============================================================
    // 官方 DeepSeek 风格 SVG 鲸鱼（精确重绘：蓝色身体、白色腹部、叉形尾）
    // ============================================================

    const WHALE_COLOR = "var(--dsh-color-brand, #5B6CFF)";

    /**
     * 官方风格 SVG 鲸鱼图标
     * 基于 DeepSeek 官方 logo 精确重绘
     * @param size 图标尺寸（px）
     * @param className 额外 CSS 类名
     * @param active 是否激活（控制灰度）
     */
    function WhaleSvgIcon({ size = 24, className = "", active = true }: any) {
      const filter = active ? "none" : "grayscale(0.6)";
      const opacity = active ? 1 : 0.5;

      return React.createElement(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 100 80",
          fill: "none",
          xmlns: "http://www.w3.org/2000/svg",
          className: `whale-svg ${className}`,
          style: { filter, opacity, overflow: "visible" },
          "aria-hidden": "true",
        },
        // === 喷水效果（SVG 动画层） ===
        active && React.createElement(
          "g",
          { className: "whale-spout-svg" },
          // 主水柱
          React.createElement("path", {
            className: "whale-water-col",
            d: "M 42 18 Q 42 8, 45 2",
            stroke: WHALE_COLOR,
            strokeWidth: "2.5",
            strokeLinecap: "round",
            fill: "none",
            opacity: "0.7",
          }),
          // 水花水滴
          React.createElement("circle", { className: "whale-drop d1", cx: "40", cy: "10", r: "1.5", fill: WHALE_COLOR }),
          React.createElement("circle", { className: "whale-drop d2", cx: "45", cy: "6", r: "1.2", fill: WHALE_COLOR }),
          React.createElement("circle", { className: "whale-drop d3", cx: "50", cy: "10", r: "1.5", fill: WHALE_COLOR }),
          React.createElement("circle", { className: "whale-drop d4", cx: "38", cy: "14", r: "1", fill: WHALE_COLOR }),
          React.createElement("circle", { className: "whale-drop d5", cx: "52", cy: "14", r: "1", fill: WHALE_COLOR }),
          React.createElement("circle", { className: "whale-drop d6", cx: "45", cy: "3", r: "0.8", fill: WHALE_COLOR }),
        ),

        // === 鲸鱼身体（蓝色主体） ===
        React.createElement("path", {
          className: "whale-body",
          d: "M 14 50 C 8 32, 18 12, 40 10 C 48 9, 52 13, 55 17 C 58 11, 66 7, 72 11 C 78 15, 76 23, 70 26 C 74 29, 80 27, 84 23 C 90 17, 96 21, 93 30 C 91 36, 83 38, 79 34 C 76 38, 73 42, 69 44 C 73 50, 69 57, 61 58 C 55 59, 51 55, 49 52 C 43 61, 30 65, 20 61 C 12 58, 10 53, 14 50 Z",
          fill: WHALE_COLOR,
        }),

        // === 腹部（白色） ===
        React.createElement("path", {
          d: "M 18 47 C 22 36, 36 34, 48 42 C 53 46, 50 52, 42 54 C 32 56, 20 53, 18 47 Z",
          fill: "white",
        }),

        // === 背鳍 ===
        React.createElement("path", {
          d: "M 46 12 L 50 4 L 55 13 Z",
          fill: WHALE_COLOR,
        }),

        // === 胸鳍 ===
        React.createElement("path", {
          className: "whale-fin",
          d: "M 38 54 L 32 66 L 44 60 Z",
          fill: WHALE_COLOR,
        }),

        // === 眼睛（大白圆 + 小白圆 + 黑瞳孔） ===
        React.createElement("circle", { cx: "28", cy: "36", r: "5", fill: "white" }),
        React.createElement("circle", { cx: "36", cy: "33", r: "3.5", fill: "white" }),
        React.createElement("circle", { cx: "29", cy: "35", r: "2.2", fill: "#333" }),
      );
    }

    // ============================================================
    // Token 节省统计组件（用 SVG 小图标替代 emoji）
    // ============================================================

    function WhaleTokenStats({ matched }: any) {
      const { text, mode } = matched || {};
      if (!text || !mode || mode === "off") return null;

      const actualTokens = estimateTokens(text);
      const ratio = SAVE_RATIO[mode] ?? 0;
      if (ratio <= 0 || actualTokens <= 0) return null;

      const normalTokens = Math.round(actualTokens / (1 - ratio));
      const savedTokens = normalTokens - actualTokens;
      if (savedTokens <= 0) return null;

      return React.createElement(
        "div",
        {
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "12px",
            color: "var(--dsh-color-text-muted, #888)",
            marginTop: "4px",
            userSelect: "none",
          },
        },
        React.createElement(WhaleSvgIcon, { size: 14, active: true }),
        React.createElement("span", null, `本轮约省 ${savedTokens} token`)
      );
    }

    /**
     * turnTail chain slot 的 select 函数
     */
    function selectWhaleStats(owner: any) {
      if (currentMode === "off") return null;
      const turnTail = owner?.turn?.data?.get?.("turn-tail");
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
      const style = document.createElement("style");
      style.textContent = `
        /* === 头部按钮容器 === */
        .whale-header-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 8px;
          transition: background 0.2s, transform 0.2s;
          padding: 0;
          overflow: visible;
        }
        .whale-header-btn:hover {
          background: var(--dsh-color-bg-hover, rgba(0,0,0,0.06));
        }
        .whale-header-btn.active {
          background: var(--dsh-color-brand-bg, rgba(77,107,254,0.1));
        }
        .whale-header-btn:active {
          transform: scale(0.92);
        }

        /* === SVG 鲸鱼动画 === */
        .whale-svg {
          transition: filter 0.3s, opacity 0.3s;
          display: block;
          overflow: visible;
        }
        .whale-header-btn.active .whale-svg {
          animation: whale-float 3s ease-in-out infinite;
        }
        .whale-header-btn.streaming .whale-svg {
          animation: whale-float-fast 1.2s ease-in-out infinite;
        }
        @keyframes whale-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-2px) rotate(-1deg); }
        }
        @keyframes whale-float-fast {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-3px) rotate(-2deg); }
        }

        /* 胸鳍摆动 */
        .whale-header-btn.active .whale-fin {
          transform-origin: 38px 54px;
          animation: fin-wave 2.5s ease-in-out infinite;
        }
        .whale-header-btn.streaming .whale-fin {
          animation: fin-wave-fast 0.8s ease-in-out infinite;
        }
        @keyframes fin-wave {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-8deg); }
        }
        @keyframes fin-wave-fast {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-15deg); }
        }

        /* === SVG 喷水动画 === */
        .whale-spout-svg {
          transform-origin: 45px 18px;
        }

        /* 主水柱 */
        .whale-water-col {
          stroke-dasharray: 20;
          stroke-dashoffset: 20;
          animation: water-col-flow 1.5s ease-out infinite;
        }
        .whale-header-btn.streaming .whale-water-col {
          animation-duration: 0.7s;
        }
        @keyframes water-col-flow {
          0% { stroke-dashoffset: 20; opacity: 0; }
          30% { opacity: 0.8; }
          100% { stroke-dashoffset: -20; opacity: 0; }
        }

        /* 水花水滴 */
        .whale-drop {
          animation: drop-splash 1.5s ease-out infinite;
        }
        .whale-header-btn.streaming .whale-drop {
          animation-duration: 0.7s;
        }
        .whale-drop.d1 { --dx: -5px; --dy: -12px; animation-delay: 0.1s; }
        .whale-drop.d2 { --dx: 0px; --dy: -16px; animation-delay: 0.15s; }
        .whale-drop.d3 { --dx: 5px; --dy: -12px; animation-delay: 0.2s; }
        .whale-drop.d4 { --dx: -8px; --dy: -8px; animation-delay: 0.25s; }
        .whale-drop.d5 { --dx: 8px; --dy: -8px; animation-delay: 0.3s; }
        .whale-drop.d6 { --dx: 0px; --dy: -20px; animation-delay: 0.05s; }
        @keyframes drop-splash {
          0% { transform: translate(0, 0) scale(1); opacity: 0; }
          25% { opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; }
        }

        /* 喷水时鲸鱼下沉（反作用力） */
        .whale-header-btn.spouting .whale-svg {
          animation: whale-spout-dip 1.5s ease-in-out;
        }
        @keyframes whale-spout-dip {
          0% { transform: translateY(0); }
          15% { transform: translateY(2px); }
          30% { transform: translateY(0); }
          100% { transform: translateY(0); }
        }

        /* === 喷水效果容器 === */
        .whale-spout-container {
          position: absolute;
          top: -2px;
          left: 50%;
          transform: translateX(-50%);
          pointer-events: none;
          width: 40px;
          height: 30px;
          overflow: visible;
        }

        /* 主水柱（弧形） */
        .whale-water-column {
          position: absolute;
          bottom: 4px;
          left: 50%;
          transform: translateX(-50%);
          width: 3px;
          height: 0;
          background: linear-gradient(to top,
            var(--dsh-color-brand, #4D6BFE),
            rgba(77,107,254,0.3)
          );
          border-radius: 2px;
          opacity: 0;
        }
        .whale-header-btn.active .whale-water-column {
          animation: water-column 1.5s ease-out infinite;
        }
        .whale-header-btn.streaming .whale-water-column {
          animation: water-column-fast 0.7s ease-out infinite;
        }
        @keyframes water-column {
          0% { height: 0; opacity: 0; }
          20% { height: 18px; opacity: 0.8; }
          60% { height: 22px; opacity: 0.5; }
          100% { height: 26px; opacity: 0; }
        }
        @keyframes water-column-fast {
          0% { height: 0; opacity: 0; }
          20% { height: 22px; opacity: 0.9; }
          60% { height: 28px; opacity: 0.6; }
          100% { height: 32px; opacity: 0; }
        }

        /* 水花 droplets */
        .whale-droplet {
          position: absolute;
          bottom: 8px;
          left: 50%;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--dsh-color-brand, #4D6BFE);
          opacity: 0;
          transform: translateX(-50%);
        }
        .whale-header-btn.active .whale-droplet {
          animation: droplet-splash 1.5s ease-out infinite;
        }
        .whale-header-btn.streaming .whale-droplet {
          animation: droplet-splash-fast 0.7s ease-out infinite;
        }
        .whale-droplet:nth-child(2) { --dx: -8px; --dy: -16px; animation-delay: 0.1s; }
        .whale-droplet:nth-child(3) { --dx: -4px; --dy: -22px; animation-delay: 0.15s; }
        .whale-droplet:nth-child(4) { --dx: 0px; --dy: -26px; animation-delay: 0.2s; }
        .whale-droplet:nth-child(5) { --dx: 4px; --dy: -22px; animation-delay: 0.25s; }
        .whale-droplet:nth-child(6) { --dx: 8px; --dy: -16px; animation-delay: 0.3s; }
        .whale-droplet:nth-child(7) { --dx: -12px; --dy: -10px; animation-delay: 0.35s; }
        .whale-droplet:nth-child(8) { --dx: 12px; --dy: -10px; animation-delay: 0.4s; }
        @keyframes droplet-splash {
          0% { transform: translateX(-50%) translateY(0) scale(1); opacity: 0; }
          25% { opacity: 1; }
          100% { transform: translateX(calc(-50% + var(--dx))) translateY(var(--dy)) scale(0.2); opacity: 0; }
        }
        @keyframes droplet-splash-fast {
          0% { transform: translateX(-50%) translateY(0) scale(1); opacity: 0; }
          25% { opacity: 1; }
          100% { transform: translateX(calc(-50% + var(--dx, 0))) translateY(calc(var(--dy, -20px) * 1.3)) scale(0.2); opacity: 0; }
        }

        /* 气泡 */
        .whale-bubble {
          position: absolute;
          bottom: 0;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: var(--dsh-color-brand, #4D6BFE);
          opacity: 0;
        }
        .whale-header-btn.active .whale-bubble {
          animation: bubble-rise 3s ease-in-out infinite;
        }
        .whale-bubble:nth-child(9) { left: 20%; animation-delay: 0s; --size: 2px; }
        .whale-bubble:nth-child(10) { left: 70%; animation-delay: 1s; --size: 3px; }
        .whale-bubble:nth-child(11) { left: 45%; animation-delay: 2s; --size: 2.5px; }
        @keyframes bubble-rise {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          20% { opacity: 0.6; }
          80% { opacity: 0.3; }
          100% { transform: translateY(-24px) scale(1); opacity: 0; }
        }

        /* 水波纹 */
        .whale-ripple {
          position: absolute;
          bottom: -2px;
          left: 50%;
          transform: translateX(-50%);
          width: 20px;
          height: 6px;
          border: 1.5px solid var(--dsh-color-brand, #4D6BFE);
          border-radius: 50%;
          opacity: 0;
        }
        .whale-header-btn.active .whale-ripple {
          animation: ripple-expand 2s ease-out infinite;
        }
        .whale-ripple:nth-child(12) { animation-delay: 0s; }
        .whale-ripple:nth-child(13) { animation-delay: 1s; }
        @keyframes ripple-expand {
          0% { width: 12px; height: 4px; opacity: 0.5; }
          100% { width: 32px; height: 8px; opacity: 0; }
        }

        /* 点击爆发效果 */
        .whale-header-btn.burst .whale-droplet {
          animation: burst-splash 0.6s ease-out forwards !important;
        }
        @keyframes burst-splash {
          0% { transform: translateX(-50%) translateY(0) scale(1.5); opacity: 1; }
          100% { transform: translateX(calc(-50% + var(--dx, 0) * 2)) translateY(calc(var(--dy, -20px) * 1.5)) scale(0); opacity: 0; }
        }

        /* 模式切换过渡 */
        .whale-header-btn .whale-spout-container {
          transition: opacity 0.3s;
        }
        .whale-header-btn:not(.active) .whale-spout-container {
          opacity: 0;
        }
      `;
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
        if (!useSessions || typeof useSessions.subscribe !== "function") return;
        const unsubscribe = useSessions.subscribe((state: any) => {
          const session = state.sessions?.[sessionId];
          const isStreaming = session?.status === "streaming" || session?.isStreaming;
          setStreaming(!!isStreaming);
        });
        return unsubscribe;
      }, [sessionId, useSessions]);

      // 监听模式变化（popup 切换时更新）
      useEffect(() => {
        const interval = setInterval(() => {
          if (mode !== currentMode) {
            setMode(currentMode);
          }
        }, 500);
        return () => clearInterval(interval);
      }, [mode]);

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

      const isActive = mode !== "off";

      const handleClick = async () => {
        // 点击爆发效果
        setBurst(true);
        if (burstTimer.current) clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(() => setBurst(false), 600);

        // 切换到上一次使用的模式或 full
        const nextMode = isActive ? "off" : "full";
        try {
          const sessionsApi = (window as any).__ModuleLoader__?.ctx?.sessions;
          const live = sessionsApi?.binding?.(sessionId)?.session;
          if (live) {
            await live.command(`/whale ${nextMode}`);
          }
        } catch { /* ignore */ }
        currentMode = nextMode;
        setMode(nextMode);
        try { localStorage.setItem(STORAGE_KEY, nextMode); } catch { /* ignore */ }
      };

      const modeLabel = MODES.find((m) => m.id === mode)?.label ?? mode;
      const title = isActive
        ? `鲸鱼模式：${modeLabel}（点击关闭）`
        : "鲸鱼模式（点击开启）";

      const btnClass = [
        "whale-header-btn",
        isActive ? "active" : "",
        streaming ? "streaming" : "",
        burst ? "burst" : "",
      ].filter(Boolean).join(" ");

      return React.createElement(
        "button",
        {
          className: btnClass,
          onClick: handleClick,
          title,
          "aria-label": "鲸鱼模式",
        },
        // SVG 鲸鱼图标（内置喷水动画）
        React.createElement(WhaleSvgIcon, { size: 30, active: isActive })
      );
    }

    // ============================================================
    // 客户端插件入口
    // ============================================================

    function apply(ctx: any) {
      const command = ctx.get("commandUi");
      const sessions = ctx.sessions;
      const slots = ctx.slots;

      // 1. popupSelect 装饰
      ctx.effect(() => command.decorate({
        name: "whale",
        available: () => true,
        ui: {
          kind: "popupSelect",
          options: async () => MODES,
          onSelect: async (option: WhaleOption, session: any) => {
            const live = sessions.binding(session.sessionId)?.session;
            if (!live) throw new Error("会话尚未就绪");
            const result = await live.command(`/whale ${option.id}`);
            if (!result.ok) {
              throw new Error(`切换失败：${result.error?.message ?? "未知错误"}`);
            }
            currentMode = option.id;
            try { localStorage.setItem(STORAGE_KEY, option.id); } catch { /* ignore */ }
          },
        },
      }), "dsh-whale: /whale popup decoration");

      // 2. turnTail token 节省统计
      if (slots && typeof slots.inject === "function") {
        slots.inject("conversation.chat.turnTail", () =>
          slots.register({
            name: "conversation.chat.turnTail",
            select: selectWhaleStats,
          }, WhaleTokenStats)
        );
      }

      // 3. 会话头部鲸鱼图标按钮（DeepSeek 风格 SVG + 喷水动画）
      if (slots && typeof slots.inject === "function") {
        slots.inject("conversation.session.header.actions", () =>
          slots.register({
            name: "conversation.session.header.actions",
            id: "whale-toggle",
            order: 15,
          }, WhaleHeaderAction)
        );
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});

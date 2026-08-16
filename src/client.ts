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
    // 官方 DeepSeek 鲸鱼图标（base64 嵌入）
    // ============================================================

    const WHALE_ICON = "data:image/jpeg;base64,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";

    /**
     * 官方 DeepSeek 鲸鱼图标组件
     * @param size 图标尺寸（px）
     * @param className 额外 CSS 类名
     * @param active 是否激活（控制灰度）
     */
    function WhaleSvgIcon({ size = 24, className = "", active = true }: any) {
      return React.createElement("img", {
        src: WHALE_ICON,
        width: size,
        height: size,
        className: `whale-img ${className}`,
        style: {
          filter: active ? "none" : "grayscale(0.6)",
          opacity: active ? 1 : 0.5,
          objectFit: "contain",
        },
        alt: "鲸鱼模式",
        "aria-hidden": "true",
      });
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

        /* === 鲸鱼图片动画 === */
        .whale-img {
          transition: filter 0.3s, opacity 0.3s;
          display: block;
        }
        .whale-header-btn.active .whale-img {
          animation: whale-float 3s ease-in-out infinite;
        }
        .whale-header-btn.streaming .whale-img {
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

        /* 喷水时鲸鱼下沉（反作用力） */
        .whale-header-btn.spouting .whale-img {
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
        // 喷水效果层（水柱 + 水花 + 气泡 + 水波纹）
        isActive && React.createElement(
          "div",
          { className: "whale-spout-container" },
          // 主水柱
          React.createElement("div", { className: "whale-water-column" }),
          // 水花 droplets (8个)
          React.createElement("div", { className: "whale-droplet" }),
          React.createElement("div", { className: "whale-droplet" }),
          React.createElement("div", { className: "whale-droplet" }),
          React.createElement("div", { className: "whale-droplet" }),
          React.createElement("div", { className: "whale-droplet" }),
          React.createElement("div", { className: "whale-droplet" }),
          React.createElement("div", { className: "whale-droplet" }),
          React.createElement("div", { className: "whale-droplet" }),
          // 气泡 (3个)
          React.createElement("div", { className: "whale-bubble" }),
          React.createElement("div", { className: "whale-bubble" }),
          React.createElement("div", { className: "whale-bubble" }),
          // 水波纹 (2个)
          React.createElement("div", { className: "whale-ripple" }),
          React.createElement("div", { className: "whale-ripple" }),
        ),
        // SVG 鲸鱼图标
        React.createElement(WhaleSvgIcon, { size: 26, active: isActive })
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

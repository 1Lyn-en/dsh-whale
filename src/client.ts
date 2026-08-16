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
    // SVG 鲸鱼图标（DeepSeek 风格：蓝色身体、白色腹部、面朝左、尾巴上翘）
    // ============================================================

    /**
     * DeepSeek 风格 SVG 鲸鱼图标
     * @param size 图标尺寸（px）
     * @param className 额外 CSS 类名
     * @param active 是否激活（控制颜色）
     */
    function WhaleSvgIcon({ size = 24, className = "", active = true }: any) {
      const color = active ? "var(--dsh-color-brand, #4D6BFE)" : "var(--dsh-color-text-muted, #999)";
      const bellyColor = active ? "#fff" : "var(--dsh-color-bg-secondary, #eee)";

      return React.createElement(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 48 48",
          fill: "none",
          xmlns: "http://www.w3.org/2000/svg",
          className: `whale-svg ${className}`,
          "aria-hidden": "true",
        },
        // 尾巴（上翘的叉形尾）
        React.createElement("path", {
          className: "whale-tail",
          d: "M38 20 L46 10 L44 22 L46 34 L38 26 Z",
          fill: color,
        }),
        // 身体主体
        React.createElement("ellipse", {
          className: "whale-body",
          cx: "24", cy: "26", rx: "18", ry: "11",
          fill: color,
        }),
        // 白色腹部
        React.createElement("ellipse", {
          cx: "24", cy: "29", rx: "13", ry: "6.5",
          fill: bellyColor,
          opacity: "0.9",
        }),
        // 背鳍
        React.createElement("path", {
          d: "M20 15 L24 8 L28 15 Z",
          fill: color,
        }),
        // 胸鳍
        React.createElement("path", {
          className: "whale-fin",
          d: "M18 30 Q14 36 10 34 Q14 30 18 30 Z",
          fill: color,
          opacity: "0.85",
        }),
        // 眼睛
        React.createElement("circle", {
          cx: "11", cy: "24", r: "1.8",
          fill: bellyColor,
        }),
        React.createElement("circle", {
          cx: "11.5", cy: "23.5", r: "0.8",
          fill: "#333",
        }),
        // 喷水孔（头顶）
        React.createElement("ellipse", {
          className: "whale-blowhole",
          cx: "19", cy: "15.5", rx: "2.5", ry: "1.2",
          fill: color,
          opacity: "0.6",
        }),
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
        }
        .whale-header-btn:not(.active) .whale-svg {
          filter: grayscale(0.5);
          opacity: 0.6;
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

        /* 尾巴摆动 */
        .whale-header-btn.active .whale-tail {
          transform-origin: 38px 22px;
          animation: tail-wag 2s ease-in-out infinite;
        }
        .whale-header-btn.streaming .whale-tail {
          animation: tail-wag-fast 0.6s ease-in-out infinite;
        }
        @keyframes tail-wag {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(8deg); }
        }
        @keyframes tail-wag-fast {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(15deg); }
        }

        /* 胸鳍摆动 */
        .whale-header-btn.active .whale-fin {
          transform-origin: 18px 30px;
          animation: fin-wave 2.5s ease-in-out infinite;
        }
        @keyframes fin-wave {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-5deg); }
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

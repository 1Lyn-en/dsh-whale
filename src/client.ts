/**
 * DSH Whale 客户端入口
 * 1. 为 /whale 命令注册 popupSelect 装饰
 * 2. 在每轮消息尾部注册 token 节省统计组件
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

    /**
     * Token 节省统计组件
     * 显示在每轮消息尾部，格式：🐳 本轮约省 XX token
     */
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
        React.createElement("span", null, "🐳"),
        React.createElement("span", null, `本轮约省 ${savedTokens} token`)
      );
    }

    /**
     * turnTail chain slot 的 select 函数
     * 从 owner.turn 的 closing assistant 提取文本，当前模式非 off 时返回匹配数据
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

    /** 注入鲸鱼喷水动画 CSS（只注入一次） */
    let whaleCssInjected = false;
    function injectWhaleCss() {
      if (whaleCssInjected) return;
      whaleCssInjected = true;
      const style = document.createElement("style");
      style.textContent = `
        .whale-header-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.15s;
          padding: 0;
        }
        .whale-header-btn:hover {
          background: var(--dsh-color-bg-hover, rgba(0,0,0,0.06));
        }
        .whale-header-btn.active {
          background: var(--dsh-color-brand-bg, rgba(59,130,246,0.1));
        }
        .whale-icon {
          font-size: 18px;
          line-height: 1;
          transition: transform 0.3s;
        }
        .whale-header-btn.active .whale-icon {
          animation: whale-bob 2s ease-in-out infinite;
        }
        @keyframes whale-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .whale-spout {
          position: absolute;
          top: -4px;
          left: 50%;
          transform: translateX(-50%);
          pointer-events: none;
          width: 20px;
          height: 16px;
        }
        .whale-drop {
          position: absolute;
          bottom: 0;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: var(--dsh-color-brand, #3b82f6);
          opacity: 0;
        }
        .whale-header-btn.active .whale-drop {
          animation: whale-spout 1.5s ease-out infinite;
        }
        .whale-drop:nth-child(1) { left: 30%; animation-delay: 0s; }
        .whale-drop:nth-child(2) { left: 50%; animation-delay: 0.3s; }
        .whale-drop:nth-child(3) { left: 70%; animation-delay: 0.6s; }
        .whale-drop:nth-child(4) { left: 40%; animation-delay: 0.9s; }
        .whale-drop:nth-child(5) { left: 60%; animation-delay: 1.2s; }
        @keyframes whale-spout {
          0% {
            opacity: 0;
            transform: translateY(0) scale(1);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(-14px) scale(0.3);
          }
        }
        .whale-header-btn.streaming .whale-drop {
          animation-duration: 0.6s;
        }
        .whale-header-btn.streaming .whale-icon {
          animation: whale-bob 0.8s ease-in-out infinite;
        }
      `;
      document.head.appendChild(style);
    }

    /**
     * 鲸鱼头部按钮组件
     * 显示在会话头部，点击切换鲸鱼模式，开启时显示喷水动画
     */
    function WhaleHeaderAction({ sessionId, useSessions }: any) {
      const [mode, setMode] = React.useState(currentMode);
      const [streaming, setStreaming] = React.useState(false);

      // 监听会话状态，判断是否正在输出
      React.useEffect(() => {
        if (!useSessions) return;
        const unsubscribe = useSessions.subscribe?.((state: any) => {
          const session = state.sessions?.[sessionId];
          const isStreaming = session?.status === "streaming" || session?.isStreaming;
          setStreaming(!!isStreaming);
        });
        return unsubscribe;
      }, [sessionId, useSessions]);

      // 监听模式变化（popup 切换时更新）
      React.useEffect(() => {
        const interval = setInterval(() => {
          if (mode !== currentMode) {
            setMode(currentMode);
          }
        }, 500);
        return () => clearInterval(interval);
      }, [mode]);

      // 注入 CSS
      React.useEffect(() => {
        injectWhaleCss();
      }, []);

      const isActive = mode !== "off";

      const handleClick = async () => {
        // 切换到上一次使用的模式或 full
        const nextMode = isActive ? "off" : "full";
        try {
          const live = (window as any).__ModuleLoader__?.ctx?.sessions?.binding?.(sessionId)?.session;
          if (live) {
            await live.command(`/whale ${nextMode}`);
          }
        } catch { /* ignore */ }
        currentMode = nextMode;
        setMode(nextMode);
        try { localStorage.setItem(STORAGE_KEY, nextMode); } catch { /* ignore */ }
      };

      return React.createElement(
        "button",
        {
          className: `whale-header-btn${isActive ? " active" : ""}${streaming ? " streaming" : ""}`,
          onClick: handleClick,
          title: isActive ? `鲸鱼模式：${mode}（点击关闭）` : "鲸鱼模式（点击开启）",
          "aria-label": "鲸鱼模式",
        },
        isActive && React.createElement(
          "div",
          { className: "whale-spout" },
          React.createElement("div", { className: "whale-drop" }),
          React.createElement("div", { className: "whale-drop" }),
          React.createElement("div", { className: "whale-drop" }),
          React.createElement("div", { className: "whale-drop" }),
          React.createElement("div", { className: "whale-drop" })
        ),
        React.createElement("span", { className: "whale-icon" }, "🐳")
      );
    }

    /**
     * 客户端插件入口
     */
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
            // 更新模块级当前模式，供 turnTail 组件使用，并持久化到 localStorage
            currentMode = option.id;
            try { localStorage.setItem(STORAGE_KEY, option.id); } catch { /* ignore */ }
          },
        },
      }), "dsh-whale: /whale popup decoration");

      // 2. turnTail token 节省统计（直接注册，不用 effect 包裹）
      if (slots && typeof slots.inject === "function") {
        slots.inject("conversation.chat.turnTail", () =>
          slots.register({
            name: "conversation.chat.turnTail",
            select: selectWhaleStats,
          }, WhaleTokenStats)
        );
      }

      // 3. 会话头部鲸鱼图标按钮（喷水动画）
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

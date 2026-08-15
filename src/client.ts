/**
 * DSH Whale 客户端入口
 * 为 /whale 命令注册 popupSelect 装饰，用户输入 /whale 后直接弹出模式选择菜单
 * 格式遵循 DSH ModuleLoader 规范
 */
declare const window: any;

window.__ModuleLoader__.load({
  id: "@1lyn-en/dsh-whale",
  factory: (_require: any) => {
    const module = { exports: {} };
    const exports: any = module.exports;

    /** 客户端依赖：commandUi 提供 decorate API，sessions 提供 command 执行 */
    const inject = ["commandUi", "sessions"];

    interface WhaleOption {
      id: string;
      label: string;
      detail: string;
    }

    /** 6 档模式，label 简洁，detail 补充说明，与 DSH 内置 popup 风格一致 */
    const MODES: WhaleOption[] = [
      { id: "off", label: "关闭", detail: "恢复正常说话" },
      { id: "lite", label: "轻度", detail: "去客套话，保留完整句子" },
      { id: "full", label: "标准", detail: "去冠词，碎片化表达（默认）" },
      { id: "ultra", label: "极致", detail: "一个词能说清不用两个词" },
      { id: "wenyan-lite", label: "文言·轻度", detail: "半文言，去废话" },
      { id: "wenyan-full", label: "文言·极致", detail: "纯文言文" },
    ];

    /**
     * 客户端插件入口：为 /whale host 命令挂上 popupSelect 装饰
     * 用户输入 /whale 后按空格或回车，弹出模式选择菜单
     */
    function apply(ctx: any) {
      const command = ctx.get("commandUi");
      const sessions = ctx.sessions;

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
          },
        },
      }), "dsh-whale: /whale popup decoration");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});

/**
 * dsh-whale — 鲸鱼极简语模式
 * Cordis 插件入口
 *
 * 功能：
 * - 注入极简语 system-prompt section（6 档强度）
 * - 注册 /whale 命令切换模式
 * - 注册 /whale-default 命令设置默认模式
 * - 设置持久化（优先 ctx.settings，降级内存）
 *
 * DSH API 参考：
 * - ctx.inject(['systemPrompt', 'commands', 'settings'], callback) — 声明依赖服务
 * - ctx.systemPrompt.section({ name, order, text }) — 注册系统提示词段落
 * - ctx.commands.register({ name, description, handler }) — 注册斜杠命令
 * - ctx.settings.namespace(name) — 获取设置命名空间
 */

import { getWhalePrompt } from './prompts/index.js';
import {
  handleWhaleCommand,
  handleWhaleDefaultCommand,
  type CommandResult,
} from './commands/whale-command.js';
import { handleWhaleCommitCommand } from './commands/whale-commit.js';
import { createSettingsManager } from './settings/whale-settings.js';
import type { WhaleSettings } from './types.js';

/** 注入服务后的 Context 类型 */
interface InjectedContext {
  systemPrompt: {
    section: (config: {
      name: string;
      order: number;
      text: string | ((context: unknown) => string);
      complete?: boolean;
    }) => () => void;
  };
  commands: {
    register: (config: {
      name: string;
      description: string;
      input?: { hint: string };
      recordInput?: boolean;
      handler: (invocation: {
        commandId: unknown;
        agent: unknown;
        rawInput: string;
        signal: AbortSignal;
      }) => CommandResult | Promise<CommandResult>;
    }) => () => void;
  };
  settings?: {
    namespace?: (name: string) => {
      get?: () => Partial<WhaleSettings> | undefined;
      set?: (s: WhaleSettings) => void;
    };
  };
}

/**
 * 插件应用函数
 * 通过 ctx.inject 声明依赖的服务，确保服务可用后再执行
 */
export function apply(ctx: {
  inject: (deps: string[], callback: (ctx: InjectedContext) => void | (() => void)) => unknown;
}): void {
  ctx.inject(['systemPrompt', 'commands', 'settings'], (injected: InjectedContext) => {
    // 1. 初始化设置管理器
    const settingsApi = injected.settings?.namespace?.('whale');
    const manager = createSettingsManager(settingsApi ?? null);

    // 2. 注入 system-prompt section
    // order=50：在 persona(0) 之后、tool guidance(100-199) 之前
    const disposeSection = injected.systemPrompt.section({
      name: 'whale-mode',
      order: 50,
      text: () => getWhalePrompt(manager.settings.mode, manager.settings.autoClarity),
    });

    // 3. 注册 /whale 命令
    const disposeWhaleCmd = injected.commands.register({
      name: 'whale',
      description:
        '🐳 鲸鱼模式：极简说话省 token。用法：/whale [lite|full|ultra|wenyan-lite|wenyan-full|off|status]',
      input: { hint: '模式名称，留空查看状态' },
      handler: (invocation) =>
        handleWhaleCommand(invocation.rawInput, {
          settings: manager.settings,
          saveSettings: (s) => {
            manager.settings = s;
            manager.save();
          },
        }),
    });

    // 4. 注册 /whale-default 命令
    const disposeDefaultCmd = injected.commands.register({
      name: 'whale-default',
      description: '设置鲸鱼模式默认值（重启后生效）。用法：/whale-default <模式>',
      input: { hint: '模式名称' },
      handler: (invocation) =>
        handleWhaleDefaultCommand(invocation.rawInput, {
          settings: manager.settings,
          saveSettings: (s) => {
            manager.settings = s;
            manager.save();
          },
        }),
    });

    // 5. 注册 /whale-commit 命令
    const disposeCommitCmd = injected.commands.register({
      name: 'whale-commit',
      description: '🐳 生成极简 commit message（≤50 字符）。用法：/whale-commit',
      handler: (invocation) => handleWhaleCommitCommand(invocation.rawInput, null),
    });

    // 6. 返回清理函数
    return () => {
      disposeSection?.();
      disposeWhaleCmd?.();
      disposeDefaultCmd?.();
      disposeCommitCmd?.();
    };
  });
}

export default apply;

/**
 * dsh-whale — 鲸鱼极简语模式
 * Cordis 插件入口
 *
 * 功能：
 * - 注入极简语 system-prompt（6 档强度）
 * - 注册 /whale 命令切换模式
 * - 注册 /whale-default 命令设置默认模式
 * - 设置持久化（优先 ctx.settings，降级内存）
 */

import { getWhalePrompt } from './prompts/index.js';
import { handleWhaleCommand, handleWhaleDefaultCommand } from './commands/whale-command.js';
import { createSettingsManager } from './settings/whale-settings.js';
import type { WhaleSettings } from './types.js';

/** 宽松的 Cordis Context 类型（兼容不同 DSH 版本） */
interface WhaleContext {
  systemPrompt?: {
    register?: (config: {
      id: string;
      weight?: number;
      content: () => string;
    }) => void;
  };
  commands?: {
    register?: (config: {
      name: string;
      description: string;
      execute: (args: string) => string | Promise<string>;
    }) => void;
  };
  settings?: {
    namespace?: (name: string) => {
      get?: () => Partial<WhaleSettings> | undefined;
      set?: (s: WhaleSettings) => void;
    };
  };
  effect?: (fn: () => void | (() => void)) => void;
}

/**
 * 插件应用函数
 * 在 DSH 中通过 cordis.patch.yml 加载时自动调用
 */
export function apply(ctx: WhaleContext): void {
  // 1. 初始化设置管理器
  const settingsApi = ctx.settings?.namespace?.('whale');
  const manager = createSettingsManager(settingsApi ?? null);

  // 2. 注入 system-prompt section
  ctx.systemPrompt?.register?.({
    id: 'whale-mode',
    weight: 100,
    content: () => getWhalePrompt(manager.settings.mode, manager.settings.autoClarity),
  });

  // 3. 注册 /whale 命令
  ctx.commands?.register?.({
    name: 'whale',
    description:
      '🐳 鲸鱼模式：极简说话省 token。用法：/whale [lite|full|ultra|wenyan-lite|wenyan-full|off|status]',
    execute: (args: string) =>
      handleWhaleCommand(args, {
        settings: manager.settings,
        saveSettings: (s) => {
          manager.settings = s;
          manager.save();
        },
      }),
  });

  // 4. 注册 /whale-default 命令
  ctx.commands?.register?.({
    name: 'whale-default',
    description: '设置鲸鱼模式默认值（重启后生效）。用法：/whale-default <模式>',
    execute: (args: string) =>
      handleWhaleDefaultCommand(args, {
        settings: manager.settings,
        saveSettings: (s) => {
          manager.settings = s;
          manager.save();
        },
      }),
  });
}

export default apply;

/**
 * /whale 命令处理
 */
import type { WhaleMode, WhaleSettings } from '../types.js';
import { VALID_MODES, MODE_DESCRIPTIONS, MODE_EMOJI } from '../types.js';

export interface WhaleCommandContext {
  settings: WhaleSettings;
  saveSettings: (s: WhaleSettings) => void;
}

/**
 * 处理 /whale 命令
 * @param args 命令参数（如 "full", "ultra", "status", ""）
 * @param ctx 命令上下文
 */
export function handleWhaleCommand(
  args: string,
  ctx: WhaleCommandContext
): string {
  const arg = args.trim().toLowerCase();

  // 无参数或 status — 显示当前状态
  if (arg === 'status' || arg === '') {
    const lines = VALID_MODES.map((m) => {
      const marker = m === ctx.settings.mode ? '🐳' : '  ';
      return `${marker} ${MODE_EMOJI[m]} ${m} — ${MODE_DESCRIPTIONS[m]}`;
    });
    return [
      `🐳 鲸鱼模式当前：**${ctx.settings.mode}**`,
      '',
      ...lines,
      '',
      '切换：`/whale <模式>`',
      '设默认：`/whale-default <模式>`',
    ].join('\n');
  }

  // 无效模式
  if (!VALID_MODES.includes(arg as WhaleMode)) {
    return `❌ 未知模式 "${arg}"。\n\n可选：${VALID_MODES.join(' | ')}`;
  }

  // 切换模式
  const newMode = arg as WhaleMode;
  ctx.settings.mode = newMode;
  ctx.saveSettings(ctx.settings);

  if (newMode === 'off') {
    return '🌊 鲸鱼已潜入深海，恢复正常说话。';
  }

  return `🐳 鲸鱼模式已切换为：**${newMode}**\n\n${MODE_EMOJI[newMode]} ${MODE_DESCRIPTIONS[newMode]}`;
}

/**
 * 处理 /whale-default 命令
 */
export function handleWhaleDefaultCommand(
  args: string,
  ctx: WhaleCommandContext
): string {
  const arg = args.trim().toLowerCase();

  if (!VALID_MODES.includes(arg as WhaleMode)) {
    return `❌ 可选：${VALID_MODES.join(' | ')}`;
  }

  const newMode = arg as WhaleMode;
  ctx.settings.defaultMode = newMode;
  ctx.settings.mode = newMode;
  ctx.saveSettings(ctx.settings);

  return `✅ 默认模式已设为：${newMode}（重启后生效，当前已切换）`;
}

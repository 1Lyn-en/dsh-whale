/**
 * 鲸鱼模式 prompt 统一导出
 */
export { whaleLitePrompt } from './whale-lite.js';
export { whaleFullPrompt } from './whale-full.js';
export { whaleUltraPrompt } from './whale-ultra.js';
export { wenyanLitePrompt } from './wenyan-lite.js';
export { wenyanFullPrompt } from './wenyan-full.js';
export { autoClarityPrompt } from './auto-clarity.js';

import type { WhaleMode } from '../types.js';
import { whaleLitePrompt } from './whale-lite.js';
import { whaleFullPrompt } from './whale-full.js';
import { whaleUltraPrompt } from './whale-ultra.js';
import { wenyanLitePrompt } from './wenyan-lite.js';
import { wenyanFullPrompt } from './wenyan-full.js';
import { autoClarityPrompt } from './auto-clarity.js';

/** 各模式对应的 prompt 内容（off 模式为空字符串） */
export const MODE_PROMPTS: Record<Exclude<WhaleMode, 'off'>, string> = {
  lite: whaleLitePrompt,
  full: whaleFullPrompt,
  ultra: whaleUltraPrompt,
  'wenyan-lite': wenyanLitePrompt,
  'wenyan-full': wenyanFullPrompt,
};

/**
 * 获取指定模式的 prompt 内容
 * @param mode 鲸鱼模式
 * @param includeAutoClarity 是否包含自动清晰度保护
 */
export function getWhalePrompt(
  mode: WhaleMode,
  includeAutoClarity: boolean = true
): string {
  if (mode === 'off') return '';
  const base = MODE_PROMPTS[mode];
  if (!includeAutoClarity) return base;
  return base + '\n\n' + autoClarityPrompt;
}

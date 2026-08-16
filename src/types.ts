/**
 * dsh-whale — 鲸鱼模式类型定义
 */

export type WhaleMode = 'off' | 'lite' | 'full' | 'ultra' | 'wenyan-lite' | 'wenyan-full';

export interface WhaleSettings {
  /** 当前激活的模式 */
  mode: WhaleMode;
  /** 默认模式（重启后生效） */
  defaultMode: WhaleMode;
  /** 是否启用自动清晰度保护 */
  autoClarity: boolean;
  /** 是否显示 token 节省统计（V1.1） */
  tokenStats: boolean;
}

export const DEFAULT_SETTINGS: WhaleSettings = {
  mode: 'full',
  defaultMode: 'full',
  autoClarity: true,
  tokenStats: false,
};

export const VALID_MODES: WhaleMode[] = [
  'off',
  'lite',
  'full',
  'ultra',
  'wenyan-lite',
  'wenyan-full',
];

export const MODE_DESCRIPTIONS: Record<WhaleMode, string> = {
  off: '关闭鲸鱼模式，恢复正常说话',
  lite: '轻度：去客套话，保留完整句子',
  full: '标准（默认）：去冠词，碎片化表达',
  ultra: '极致：一个词能说清不用两个词',
  'wenyan-lite': '文言轻度：半文言，去废话',
  'wenyan-full': '文言极致：纯文言文，80-90% 缩减',
};

export const MODE_EMOJI: Record<WhaleMode, string> = {
  off: '🌊',
  lite: '🐋',
  full: '🐳',
  ultra: '🦈',
  'wenyan-lite': '📜',
  'wenyan-full': '🏮',
};

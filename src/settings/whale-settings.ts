/**
 * 鲸鱼模式设置持久化
 * 优先使用 DSH ctx.settings，降级到内存存储
 */
import type { WhaleSettings } from '../types.js';
import { DEFAULT_SETTINGS } from '../types.js';

/** 宽松的 settings API 接口（兼容不同 DSH 版本） */
export interface WhaleSettingsApi {
  get?: () => Partial<WhaleSettings> | undefined;
  set?: (s: WhaleSettings) => void;
}

export interface WhaleSettingsManager {
  settings: WhaleSettings;
  save: () => void;
}

/**
 * 创建设置管理器
 * @param api DSH settings API（可能为 undefined）
 */
export function createSettingsManager(
  api?: WhaleSettingsApi | null
): WhaleSettingsManager {
  let settings: WhaleSettings = { ...DEFAULT_SETTINGS };

  // 尝试从持久化存储加载
  if (api?.get) {
    try {
      const saved = api.get();
      if (saved && typeof saved === 'object') {
        settings = { ...DEFAULT_SETTINGS, ...saved };
      }
    } catch {
      // 加载失败，使用默认值
    }
  }

  const save = () => {
    if (api?.set) {
      try {
        api.set(settings);
      } catch {
        // 保存失败，忽略（内存中仍有效）
      }
    }
  };

  return { settings, save };
}

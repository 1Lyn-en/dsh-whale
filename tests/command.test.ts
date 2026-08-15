/**
 * dsh-whale 命令处理单元测试
 * 覆盖 /whale 和 /whale-default 命令的所有分支
 */
import { describe, it, expect, vi } from 'vitest';
import {
  handleWhaleCommand,
  handleWhaleDefaultCommand,
  type CommandResult,
} from '../src/commands/whale-command.js';
import { createSettingsManager } from '../src/settings/whale-settings.js';
import { DEFAULT_SETTINGS, VALID_MODES } from '../src/types.js';
import type { WhaleSettings } from '../src/types.js';

function makeCtx(overrides: Partial<WhaleSettings> = {}) {
  const manager = createSettingsManager(null);
  manager.settings = { ...DEFAULT_SETTINGS, ...overrides };
  const saveSpy = vi.fn((s: WhaleSettings) => {
    manager.settings = s;
  });
  return {
    settings: manager.settings,
    saveSettings: saveSpy,
    saveSpy,
  };
}

describe('/whale 命令', () => {
  it('无参数时显示状态', () => {
    const ctx = makeCtx();
    const result = handleWhaleCommand('', ctx) as { kind: 'success'; text: string };
    expect(result.kind).toBe('success');
    expect(result.text).toContain('鲸鱼模式当前');
    expect(result.text).toContain('full');
    expect(result.text).toContain('/whale <模式>');
  });

  it('status 参数显示状态', () => {
    const ctx = makeCtx({ mode: 'ultra' });
    const result = handleWhaleCommand('status', ctx) as { kind: 'success'; text: string };
    expect(result.kind).toBe('success');
    expect(result.text).toContain('ultra');
  });

  it('切换到 lite 模式', () => {
    const ctx = makeCtx();
    const result = handleWhaleCommand('lite', ctx);
    expect(result.kind).toBe('success');
    expect(ctx.settings.mode).toBe('lite');
    expect(ctx.saveSpy).toHaveBeenCalledTimes(1);
  });

  it('切换到 ultra 模式', () => {
    const ctx = makeCtx();
    const result = handleWhaleCommand('ultra', ctx);
    expect(result.kind).toBe('success');
    expect(ctx.settings.mode).toBe('ultra');
  });

  it('切换到 wenyan-full 模式', () => {
    const ctx = makeCtx();
    const result = handleWhaleCommand('wenyan-full', ctx);
    expect(result.kind).toBe('success');
    expect(ctx.settings.mode).toBe('wenyan-full');
  });

  it('切换到 off 模式显示潜入深海消息', () => {
    const ctx = makeCtx();
    const result = handleWhaleCommand('off', ctx) as { kind: 'success'; text: string };
    expect(result.kind).toBe('success');
    expect(result.text).toContain('潜入深海');
    expect(ctx.settings.mode).toBe('off');
  });

  it('无效模式返回错误', () => {
    const ctx = makeCtx();
    const result = handleWhaleCommand('invalid-mode', ctx) as { kind: 'error'; text: string };
    expect(result.kind).toBe('error');
    expect(result.text).toContain('未知模式');
    expect(result.text).toContain('invalid-mode');
    expect(ctx.settings.mode).toBe('full'); // 未改变
    expect(ctx.saveSpy).not.toHaveBeenCalled();
  });

  it('参数带空白和大写能正确处理', () => {
    const ctx = makeCtx();
    const result = handleWhaleCommand('  FULL  ', ctx);
    expect(result.kind).toBe('success');
    expect(ctx.settings.mode).toBe('full');
  });

  it('所有有效模式都能切换成功', () => {
    for (const mode of VALID_MODES) {
      const ctx = makeCtx();
      const result = handleWhaleCommand(mode, ctx);
      expect(result.kind).toBe('success');
      expect(ctx.settings.mode).toBe(mode);
    }
  });
});

describe('/whale-default 命令', () => {
  it('设置默认模式为 ultra', () => {
    const ctx = makeCtx();
    const result = handleWhaleDefaultCommand('ultra', ctx);
    expect(result.kind).toBe('success');
    expect(ctx.settings.defaultMode).toBe('ultra');
    expect(ctx.settings.mode).toBe('ultra'); // 同时切换当前模式
    expect(ctx.saveSpy).toHaveBeenCalledTimes(1);
  });

  it('设置默认模式为 off', () => {
    const ctx = makeCtx();
    const result = handleWhaleDefaultCommand('off', ctx);
    expect(result.kind).toBe('success');
    expect(ctx.settings.defaultMode).toBe('off');
  });

  it('无效模式返回错误', () => {
    const ctx = makeCtx();
    const result = handleWhaleDefaultCommand('bad', ctx) as { kind: 'error'; text: string };
    expect(result.kind).toBe('error');
    expect(result.text).toContain('可选');
    expect(ctx.settings.defaultMode).toBe('full'); // 未改变
  });

  it('所有有效模式都能设为默认', () => {
    for (const mode of VALID_MODES) {
      const ctx = makeCtx();
      const result = handleWhaleDefaultCommand(mode, ctx);
      expect(result.kind).toBe('success');
      expect(ctx.settings.defaultMode).toBe(mode);
    }
  });
});

describe('设置管理器', () => {
  it('无 API 时使用默认设置', () => {
    const manager = createSettingsManager(null);
    expect(manager.settings.mode).toBe('full');
    expect(manager.settings.autoClarity).toBe(true);
  });

  it('从 API 加载已保存设置', () => {
    const api = {
      get: () => ({ mode: 'ultra', autoClarity: false }),
      set: vi.fn(),
    };
    const manager = createSettingsManager(api);
    expect(manager.settings.mode).toBe('ultra');
    expect(manager.settings.autoClarity).toBe(false);
  });

  it('保存时调用 API set', () => {
    const api = {
      get: () => undefined,
      set: vi.fn(),
    };
    const manager = createSettingsManager(api);
    manager.settings.mode = 'lite';
    manager.save();
    expect(api.set).toHaveBeenCalledTimes(1);
    expect(api.set).toHaveBeenCalledWith(expect.objectContaining({ mode: 'lite' }));
  });

  it('API get 抛异常时降级到默认', () => {
    const api = {
      get: () => { throw new Error('fail'); },
      set: vi.fn(),
    };
    const manager = createSettingsManager(api);
    expect(manager.settings.mode).toBe('full'); // 默认值
  });

  it('API set 抛异常时不崩溃', () => {
    const api = {
      get: () => undefined,
      set: () => { throw new Error('fail'); },
    };
    const manager = createSettingsManager(api);
    expect(() => manager.save()).not.toThrow();
  });

  it('部分保存设置与默认合并', () => {
    const api = {
      get: () => ({ mode: 'lite' }), // 只保存了 mode
      set: vi.fn(),
    };
    const manager = createSettingsManager(api);
    expect(manager.settings.mode).toBe('lite');
    expect(manager.settings.autoClarity).toBe(true); // 保留默认
    expect(manager.settings.tokenStats).toBe(false); // 保留默认
  });
});

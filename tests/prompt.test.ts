/**
 * dsh-whale prompt 效果测试
 *
 * 这些测试验证 prompt 内容的完整性和关键规则存在性，
 * 不测试模型实际输出（那需要真实 API 调用）。
 */
import { describe, it, expect } from 'vitest';
import {
  whaleLitePrompt,
  whaleFullPrompt,
  whaleUltraPrompt,
  wenyanLitePrompt,
  wenyanFullPrompt,
  autoClarityPrompt,
  getWhalePrompt,
  MODE_PROMPTS,
} from '../src/prompts/index.js';
import { DEFAULT_SETTINGS, VALID_MODES, MODE_DESCRIPTIONS } from '../src/types.js';

describe('Prompt 内容完整性', () => {
  it('lite 模式包含核心规则', () => {
    expect(whaleLitePrompt).toContain('客套话');
    expect(whaleLitePrompt).toContain('填充词');
    expect(whaleLitePrompt).toContain('完整句子');
  });

  it('full 模式包含核心规则和示例', () => {
    expect(whaleFullPrompt).toContain('冠词');
    expect(whaleFullPrompt).toContain('否定词');
    expect(whaleFullPrompt).toContain('useMemo');
    expect(whaleFullPrompt).toContain('每轮回复都生效');
  });

  it('ultra 模式包含极致压缩规则', () => {
    expect(whaleUltraPrompt).toContain('一词足');
    expect(whaleUltraPrompt).toContain('禁止自造缩写');
    expect(whaleUltraPrompt).toContain('禁止箭头符号');
  });

  it('文言模式包含文言规则', () => {
    expect(wenyanLitePrompt).toContain('半文言');
    expect(wenyanFullPrompt).toContain('纯文言');
    expect(wenyanFullPrompt).toContain('之/乃/为/其');
  });

  it('自动清晰度保护包含安全场景', () => {
    expect(autoClarityPrompt).toContain('安全警告');
    expect(autoClarityPrompt).toContain('不可逆操作');
    expect(autoClarityPrompt).toContain('命比 token 重要');
  });
});

describe('getWhalePrompt 函数', () => {
  it('off 模式返回空字符串', () => {
    expect(getWhalePrompt('off')).toBe('');
  });

  it('full 模式返回非空内容', () => {
    expect(getWhalePrompt('full').length).toBeGreaterThan(100);
  });

  it('includeAutoClarity=false 时不包含自动保护', () => {
    const without = getWhalePrompt('full', false);
    expect(without).not.toContain('自动清晰度保护');
  });

  it('includeAutoClarity=true 时包含自动保护', () => {
    const withClarity = getWhalePrompt('full', true);
    expect(withClarity).toContain('自动清晰度保护');
  });

  it('所有非 off 模式都有对应 prompt', () => {
    for (const mode of VALID_MODES) {
      if (mode === 'off') continue;
      expect(MODE_PROMPTS[mode]).toBeTruthy();
      expect(MODE_PROMPTS[mode].length).toBeGreaterThan(50);
    }
  });
});

describe('类型和常量', () => {
  it('DEFAULT_SETTINGS 模式为 full', () => {
    expect(DEFAULT_SETTINGS.mode).toBe('full');
    expect(DEFAULT_SETTINGS.autoClarity).toBe(true);
  });

  it('VALID_MODES 包含 6 个模式', () => {
    expect(VALID_MODES).toHaveLength(6);
    expect(VALID_MODES).toContain('off');
    expect(VALID_MODES).toContain('full');
    expect(VALID_MODES).toContain('ultra');
  });

  it('每个模式都有描述', () => {
    for (const mode of VALID_MODES) {
      expect(MODE_DESCRIPTIONS[mode]).toBeTruthy();
    }
  });
});

/**
 * dsh-whale /whale-commit 命令单元测试
 * 覆盖纯函数：inferCommitType、inferDescription、generateCommitMessage
 * git 相关函数（gitExec、getStagedFiles 等）依赖外部环境，不做单元测试。
 */
import { describe, it, expect } from 'vitest';
import {
  inferCommitType,
  inferDescription,
  generateCommitMessage,
} from '../src/commands/whale-commit.js';
import type { ChangedFile } from '../src/commands/whale-commit.js';

function file(status: string, path: string): ChangedFile {
  return { status, path };
}

describe('inferCommitType', () => {
  it('全文档文件返回 docs', () => {
    expect(inferCommitType([file('M', 'README.md'), file('A', 'docs/guide.txt')])).toBe('docs');
  });

  it('全测试文件返回 test', () => {
    expect(inferCommitType([file('M', 'src/foo.test.ts'), file('A', 'src/__test__/bar.ts')])).toBe(
      'test',
    );
  });

  it('全构建配置文件返回 chore', () => {
    expect(
      inferCommitType([
        file('M', 'package.json'),
        file('M', 'tsconfig.json'),
        file('M', 'eslint.config.js'),
      ]),
    ).toBe('chore');
  });

  it('全 CI 文件返回 ci', () => {
    expect(inferCommitType([file('M', '.github/workflows/ci.yml'), file('A', 'ci/build.sh')])).toBe(
      'ci',
    );
  });

  it('只有新增文件返回 feat', () => {
    expect(inferCommitType([file('A', 'src/new-feature.ts')])).toBe('feat');
  });

  it('只有删除文件返回 refactor', () => {
    expect(inferCommitType([file('D', 'src/old.ts')])).toBe('refactor');
  });

  it('混合新增和删除返回 fix（默认）', () => {
    expect(inferCommitType([file('A', 'src/new.ts'), file('D', 'src/old.ts')])).toBe('fix');
  });

  it('普通修改返回 fix（默认）', () => {
    expect(inferCommitType([file('M', 'src/app.ts')])).toBe('fix');
  });

  it('文档和代码混合时不返回 docs（因为不是 every）', () => {
    expect(inferCommitType([file('M', 'README.md'), file('M', 'src/app.ts')])).not.toBe('docs');
  });
});

describe('inferDescription', () => {
  it('单文件返回文件名（去扩展名）', () => {
    expect(inferDescription([file('M', 'src/components/Button.tsx')])).toBe('Button');
  });

  it('index 文件简化为入口', () => {
    expect(inferDescription([file('M', 'src/index.ts')])).toBe('入口');
  });

  it('readme 文件简化为文档', () => {
    expect(inferDescription([file('M', 'README.md')])).toBe('文档');
  });

  it('package 文件简化为依赖', () => {
    expect(inferDescription([file('M', 'package.json')])).toBe('依赖');
  });

  it('tsconfig 文件简化为配置', () => {
    expect(inferDescription([file('M', 'tsconfig.json')])).toBe('配置');
  });

  it('多文件返回第一个文件名 + 等 N 个文件', () => {
    const result = inferDescription([
      file('M', 'src/foo.ts'),
      file('M', 'src/bar.ts'),
      file('M', 'src/baz.ts'),
    ]);
    expect(result).toBe('foo 等 3 个文件');
  });

  it('空文件列表返回更新代码', () => {
    expect(inferDescription([])).toBe('更新代码');
  });
});

describe('generateCommitMessage', () => {
  it('格式为 type: description', () => {
    const msg = generateCommitMessage([file('M', 'src/app.ts')]);
    expect(msg).toBe('fix: app');
  });

  it('新增文件生成 feat 类型', () => {
    const msg = generateCommitMessage([file('A', 'src/utils.ts')]);
    expect(msg).toBe('feat: utils');
  });

  it('不超过 50 字符', () => {
    const longName = 'a'.repeat(60);
    const msg = generateCommitMessage([file('M', `src/${longName}.ts`)]);
    expect(msg.length).toBeLessThanOrEqual(50);
    expect(msg.endsWith('...')).toBe(true);
  });

  it('文档文件生成 docs 类型', () => {
    const msg = generateCommitMessage([file('M', 'README.md')]);
    expect(msg).toBe('docs: 文档');
  });
});

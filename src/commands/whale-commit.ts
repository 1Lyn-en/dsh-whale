/**
 * /whale-commit 命令处理
 * 执行 git diff --staged，生成极简 commit message
 */
import { execSync } from 'node:child_process';
import type { CommandResult } from './whale-command.js';

/** 变更文件信息 */
interface ChangedFile {
  status: string; // A=新增, M=修改, D=删除, R=重命名
  path: string;
}

/**
 * 执行 git 命令并返回输出
 */
function gitExec(args: string, cwd?: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
  } catch {
    return '';
  }
}

/**
 * 获取暂存区变更文件列表
 */
function getStagedFiles(cwd?: string): ChangedFile[] {
  const output = gitExec('diff --staged --name-status', cwd);
  if (!output) return [];
  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split('\t');
      return {
        status: parts[0]?.[0] ?? 'M',
        path: parts[1] ?? parts[0] ?? '',
      };
    })
    .filter((f) => f.path);
}

/**
 * 获取暂存区 diff（限制长度）
 */
function getStagedDiff(cwd?: string, maxChars = 3000): string {
  const output = gitExec('diff --staged', cwd);
  if (!output) return '';
  if (output.length > maxChars) {
    return output.slice(0, maxChars) + '\n... (diff 已截断)';
  }
  return output;
}

/**
 * 判断是否在 git 仓库中
 */
function isGitRepo(cwd?: string): boolean {
  return gitExec('rev-parse --is-inside-work-tree', cwd) === 'true';
}

/**
 * 根据文件路径判断提交类型
 */
function inferCommitType(files: ChangedFile[]): string {
  const paths = files.map((f) => f.path.toLowerCase());
  const hasNew = files.some((f) => f.status === 'A');
  const hasDelete = files.some((f) => f.status === 'D');

  // 文档
  if (paths.every((p) => /\.(md|txt|rst)$/.test(p) || p.includes('doc'))) {
    return 'docs';
  }
  // 测试
  if (paths.every((p) => /\.(test|spec)\./.test(p) || p.includes('__test__'))) {
    return 'test';
  }
  // 构建/配置
  if (paths.every((p) => /(package\.json|tsconfig|webpack|vite|eslint|prettier|\.config\.)/.test(p))) {
    return 'chore';
  }
  // CI
  if (paths.every((p) => p.includes('.github') || p.includes('ci/'))) {
    return 'ci';
  }
  // 新增文件
  if (hasNew && !hasDelete) {
    return 'feat';
  }
  // 删除文件
  if (hasDelete && !hasNew) {
    return 'refactor';
  }
  // 默认
  return 'fix';
}

/**
 * 从文件路径提取简短描述
 */
function inferDescription(files: ChangedFile[]): string {
  if (files.length === 0) return '更新代码';

  // 取第一个文件的 basename 或目录名
  const first = files[0].path;
  const basename = first.split('/').pop() ?? first;
  const nameWithoutExt = basename.replace(/\.[^.]+$/, '');

  // 简化常见文件名
  const simplified = nameWithoutExt
    .replace(/^index$/, '入口')
    .replace(/^readme$/i, '文档')
    .replace(/^package$/, '依赖')
    .replace(/^tsconfig$/, '配置');

  if (files.length > 1) {
    return `${simplified} 等 ${files.length} 个文件`;
  }
  return simplified;
}

/**
 * 生成极简 commit message（≤50 字符）
 */
function generateCommitMessage(files: ChangedFile[]): string {
  const type = inferCommitType(files);
  const desc = inferDescription(files);
  let msg = `${type}: ${desc}`;

  // 确保不超过 50 字符
  if (msg.length > 50) {
    msg = msg.slice(0, 47) + '...';
  }
  return msg;
}

/**
 * 处理 /whale-commit 命令
 */
export function handleWhaleCommitCommand(
  _rawInput: string,
  _ctx: unknown
): CommandResult {
  // 检查是否在 git 仓库中
  if (!isGitRepo()) {
    return {
      kind: 'error',
      text: '❌ 当前目录不是 git 仓库。',
    };
  }

  // 获取暂存区变更
  const files = getStagedFiles();
  if (files.length === 0) {
    return {
      kind: 'error',
      text: '❌ 暂存区为空。请先执行 `git add <文件>` 添加要提交的变更。',
    };
  }

  // 生成 commit message
  const message = generateCommitMessage(files);

  // 获取变更文件列表
  const fileList = files
    .map((f) => {
      const icon = f.status === 'A' ? '➕' : f.status === 'D' ? '🗑️' : '✏️';
      return `${icon} ${f.path}`;
    })
    .join('\n');

  // 获取 diff（截断）
  const diff = getStagedDiff();

  return {
    kind: 'success',
    text: [
      '🐳 **极简 commit message：**',
      '',
      `\`${message}\``,
      '',
      '**变更文件：**',
      fileList,
      '',
      diff ? '**完整 diff：**\n```diff\n' + diff + '\n```' : '',
      '',
      '---',
      '直接复制使用，或执行：',
      `\`git commit -m "${message}"\``,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

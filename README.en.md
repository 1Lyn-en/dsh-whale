# 🐳 dsh-whale

> Big whale, few words.
>
> Minimal speech mode plugin for DeepSeek Harness (DSH) — cut all AI fluff, save 60-75% output tokens

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-blue.svg)](https://github.com/deepseek-ai/deepseek-harness)

---

## 📊 Before / After

| Normal (69 tokens) | Whale (18 tokens) |
|---|---|
| "Sure! I'd be happy to help. The reason your React component re-renders is likely because you're creating a new object reference on each render. I recommend wrapping it in useMemo." | "New object ref each render. Inline object prop = new ref = re-render. Wrap in useMemo." |

**74% fewer tokens, zero information loss.**

---

## ⚡ Quick Install

```bash
# From GitHub (recommended)
dsh plugin --profile web add github:1Lyn-en/dsh-whale

# From npm
dsh plugin --profile web add @1lyn-en/dsh-whale
```

Then restart `dsh web` and type `/whale` in chat to activate.

---

## 🎚️ Six Intensity Levels

| Command | Mode | Effect | Savings |
|---------|------|--------|---------|
| `/whale lite` | 🐋 Lite | Cut pleasantries, keep full sentences | ~40% |
| `/whale` or `/whale full` | 🐳 Full (default) | Drop articles, fragment-style | ~60% |
| `/whale ultra` | 🦈 Ultra | One word when one word enough | ~75% |
| `/whale wenyan-lite` | 📜 Classical Lite | Semi-classical Chinese | ~60% |
| `/whale wenyan-full` | 🏮 Classical Full | Pure classical Chinese | ~85% (chars) |
| `/whale off` | 🌊 Off | Back to normal | — |
| `/whale status` | — | Show current mode | — |

---

## 🛡️ Auto-Clarity Protection

Automatically exits whale mode temporarily for:

- ⚠️ Security warnings / irreversible actions
- 📋 Multi-step sequences where fragment order could mislead
- ❓ When compression itself creates ambiguity
- 🔁 When user asks for clarification

> Safety > tokens.

---

## 🌐 Cross-Platform

Also available as a `SKILL.md` for Claude Code / Codex / Cursor:

```bash
/skill add https://raw.githubusercontent.com/1Lyn-en/dsh-whale/main/cross-platform/SKILL.md
```

---

## 🧪 Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run pack
```

---

## 📄 License

MIT © Ren Yilin

---

*🐳 Big whale, few words.*

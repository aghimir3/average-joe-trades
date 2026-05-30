# Agent Bootstrap Instructions

This repository uses [AGENT_OS.md](AGENT_OS.md) as its canonical operating guide for AI agents.

Before doing substantive work in this repo, every agent must read [AGENT_OS.md](AGENT_OS.md) and apply it as the project-level operating model, subject to any higher-priority system, platform, safety, legal, or direct user instructions.

## Required Startup

1. Read [AGENT_OS.md](AGENT_OS.md) before planning or editing.
2. Treat [AGENT_OS.md](AGENT_OS.md) as the shared protocol for autonomy, persistence, evidence, verification, recovery, agent coordination, and handoff.
3. If [AGENT_OS.md](AGENT_OS.md) conflicts with a higher-priority instruction from the current agent platform or the user, follow the higher-priority instruction and note the conflict in the response or relevant handoff state.
4. For Tier 2 or higher work, follow the Agent OS mission, evidence, verification, and recovery practices proportionally to the task.
5. For small Tier 0 or Tier 1 work, use the Agent OS fast path while still preserving evidence and respecting safety boundaries.

## Supported Agent Runtimes

These instructions apply to all AI agents working in this repository, including:

- GitHub Copilot agents and chat sessions.
- OpenAI / ChatGPT / Codex-style coding agents.
- Anthropic Claude agents.
- xAI Grok agents.
- Any other tool-based coding agent with access to this workspace.

## Runtime-Specific Notes

### GitHub Copilot

Use this [AGENTS.md](AGENTS.md) file as the repository entry point, then load [AGENT_OS.md](AGENT_OS.md) for the full operating protocol. Keep changes scoped, use available VS Code tools, and report validation results clearly.

### OpenAI / ChatGPT / Codex

Use [AGENTS.md](AGENTS.md) as the bootstrap instruction file. Read [AGENT_OS.md](AGENT_OS.md) before making repo changes, then follow its task-tier, evidence, verification, and persistence rules within the capabilities of the active environment.

### Claude

Use [AGENTS.md](AGENTS.md) as the shared repo instruction surface. Read [AGENT_OS.md](AGENT_OS.md) at startup and follow it instead of relying on a separate `CLAUDE.md` file unless one is explicitly added later by the user.

### Grok

Use [AGENTS.md](AGENTS.md) as the shared repo instruction surface. Read [AGENT_OS.md](AGENT_OS.md) at startup and apply its operating model within the active tool and safety constraints.

## Do Not Remove

Do not delete [AGENT_OS.md](AGENT_OS.md). It is an intentional project instruction file and should remain available for future agents.

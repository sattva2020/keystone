# Contributing to Keystone

Thanks for helping. Keystone is a small plugin: eight skills, three agents and one hook script.

## Before you start

Open an issue or a [Discussion](https://github.com/sattva2020/keystone/discussions) first, especially for new skills,
new gates or changes to levels. A short agreement up front saves rework.

## Skills are prompts

A change to a `SKILL.md` or an agent is a behavior change. In the issue or PR describe:

1. the **observed failure** (what the model did, in which skill, at which step); and
2. a **test or scenario** that shows it before the change and passes after (a unit test in `test/`, or a scenario for
   the headless harness, see `test/harness/README.md`).

"This reads better" is not enough without an observed failure.

## Development

```bash
npm test                  # skill texts, attribution, verbatim AI Factory blocks, every hook branch
claude plugin validate .  # manifests (needs a recent Claude Code CLI)
bash test/smoke-install.sh <an AI Factory project>   # adapter install and removal on a copy
```

Hooks are plain Node (ESM) with no dependencies; keep them that way. Files in this repository are written in English;
the Russian README is the only exception.

## Pull requests

- Keep the change small and focused; one concern per PR.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Update `CHANGELOG.md` for user-visible changes.
- Code derived from AI Factory must keep its `derived from ai-factory@2.19.0` comment (see `THIRD_PARTY_NOTICES.md`).

By contributing you agree that your contribution is licensed under the MIT License. Please follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

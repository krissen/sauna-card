# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.0.1] - 2026-06-04

Internal bootstrap milestone (tag only — the first GitHub release will be
`0.1.0-beta1`). No sauna functionality yet.

### Added
- Project scaffold: repository, MIT license, HACS manifest, and development roadmap.
- Build toolchain: TypeScript (strict) + Lit 3 + Vite, single-file bundle
  (`dist/sauna-card.js`) with git-tag version injection.
- Quality tooling: Vitest (jsdom), ESLint (typescript-eslint), Prettier.
- CI (`ci.yml`): typecheck, lint, test and build. Release workflow (`release.yml`)
  builds, attaches the bundle, and enforces HACS plugin validation at release time.
- Placeholder `<sauna-card>` element registered with Home Assistant's card picker.

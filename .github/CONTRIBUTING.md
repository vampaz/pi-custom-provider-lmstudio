# Contributing to pi-lmstudio-models

Thank you for your interest in contributing to pi-lmstudio-models! This document provides guidelines and instructions for contributing.

## Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/pi-lmstudio-models.git`
3. Install dependencies: `npm install`

## Development Workflow

Before creating a pull request:

1. Run tests: `npm test`
2. Run linting: `npm run lint`
3. Check formatting: `npm run format`

All checks must pass before submitting a PR.

## Making Changes

1. Create a branch from `master`: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Add tests if applicable
4. Run all checks: `npm run lint && npm run typecheck && npm test`
5. Commit your changes with a descriptive message
6. Push to your fork and open a PR

## Types of Contributions

### Bug Fixes

- Open an issue first to discuss the fix
- Include a test that reproduces the bug

### New Features

- Open an issue to discuss the feature before implementing
- Follow existing code patterns and conventions

### Documentation

- Improved README.md or other docs are always welcome
- Clarifications and examples help all users

## Code Style

- Use TypeScript for all code
- Follow existing patterns in the codebase
- Add JSDoc comments for public functions
- Write meaningful commit messages

## Testing

- All tests must pass before merging
- Tests are located in `src/`
- New features should include corresponding tests

## Questions?

Open an issue for any questions about contributing!

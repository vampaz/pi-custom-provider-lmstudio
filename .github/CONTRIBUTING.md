# Contributing

Thanks for your interest in contributing! This document describes how to contribute to this pi extension.

## Development Setup

1. Clone the repository
2. Run `npm install` in the project root (if needed)
3. Link or copy to pi's extensions directory:
   ```bash
   # Option 1: Copy (for testing)
   cp -r ~/works/pi-lmstudio-models ~/.pi/agent/extensions/lmstudio-models

   # Option 2: Symlink (for development)
   ln -sf ~/works/pi-lmstudio-models ~/.pi/agent/extensions/lmstudio-models
   ```

## Development Workflow

1. Make your changes in the `index.ts` file
2. Test with:
   ```bash
   pi -e ~/works/pi-lmstudio-models/index.ts
   ```
3. Run `npm run lint` to check for TypeScript errors
4. Commit your changes and open a PR

## Pull Request Process

1. Update the README.md if needed
2. The PR will be reviewed and merged by maintainers
3. Include a clear description of the changes

## Code Style

- Follow TypeScript best practices
- Use consistent indentation (2 spaces)
- Add comments for complex logic

## Questions?

Open an issue or reach out to the maintainers.

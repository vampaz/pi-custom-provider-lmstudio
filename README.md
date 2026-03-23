# pi Extension: LM Studio Models Sync

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![pi Package](https://img.shields.io/badge/pi-package-1.0.0-orange)](https://github.com/vampaz/pi-custom-provider-lmstudio)
[![Vitest](https://img.shields.io/badge/tested_with-vitest-00C248.svg)](https://vitest.dev/)
[![oxlint](https://img.shields.io/badge/lint-oxlint-orange.svg)](https://github.com/oxc-project/oxc)
[![oxfmt](https://img.shields.io/badge/format-oxfmt-orange.svg)](https://github.com/oxc-project/oxc)

An extension for the [pi coding agent](https://github.com/badlogic/pi-mono) that fetches models from LM Studio's Endpoint (`/v1/models`) and registers them as a pi provider.

## Features

- **Auto-sync**: Fetches models from LM Studio EP on pi session start
- **Dynamic Registration**: Models appear in the model selector immediately
- **Manual Refresh**: `/lmstudio-refresh` command to update models manually
- **Safer Defaults**: Uses explicit model-id hints for context windows and falls back conservatively
- **Smart Detection**: Detects reasoning and multimodal capabilities from explicit markers instead of broad family matches
- **Robust Refresh**: Filters blank and duplicate model IDs before registering models

## Requirements

- LM Studio must be running with the Endpoint server enabled
- Default EP URL: `http://localhost:1234`
- The `/v1/models` endpoint should be accessible

## Installation

### Install via pi CLI

```bash
pi install git:github.com/vampaz/pi-custom-provider-lmstudio@main
```

You can also try the local package without installing it globally:

```bash
pi -e .
```

### Manual Installation

The extension is auto-discovered from `~/.pi/agent/extensions/lmstudio-models/`:

```bash
# Copy the extension to your pi extensions directory
cp -r ~/works/pi-lmstudio-models ~/.pi/agent/extensions/lmstudio-models
```

## Usage

### Automatic (on startup)
When you start a new pi session, the extension will automatically:
1. Fetch models from `http://localhost:1234/v1/models`
2. Register them as the `lmstudio-ep` provider
3. Make models available in the model selector

### Manual refresh
Run `/lmstudio-refresh` to manually fetch and update models:

```
/lmstudio-refresh
```

### Select LM Studio models
Use the model selector to choose from your LM Studio models:

```
/model
# Select lmstudio-ep provider and pick a model
```

## Provider Configuration

- **Provider Name**: `lmstudio-ep`
- **Base URL**: `http://localhost:1234`
- **API Type**: OpenAI-compatible completions
- **API Key**: Optional Bearer token via `LMSTUDIO_API_KEY`
- **Default Context Window**: `8192` tokens when the model ID does not include an explicit `8k`, `32k`, `128k`, or `1m` style hint

## Development

```bash
cd ~/works/pi-lmstudio-models

# Install dependencies first
npm install

# Run linting
npm run lint

# Run type-checking
npm run typecheck

# Check formatting
npm run format

# Run tests with vitest
npm test

# Test in pi (hot-reload)
pi -e .
```

## Example LM Studio Models Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "model@123456",
      "object": "model",
      "created": 1712345678,
      "owned_by": "lmstudio",
      "roots": ["base_model"]
    }
  ]
}
```

## Troubleshooting

### Models not showing up
- Ensure LM Studio is running with the Endpoint server enabled
- Check that `http://localhost:1234/v1/models` is accessible in your browser
- Check the pi debug output for error messages

### Wrong context window or capabilities
- Add explicit hints to the LM Studio model ID when possible, such as `32k`, `128k`, `vision`, or `thinking`
- Use `/lmstudio-refresh` after renaming or reloading models in LM Studio

### Connection refused
If you see "Failed to fetch models from LM Studio EP: TypeError: Failed to fetch":
- Verify LM Studio's Endpoint is running on port 1234
- Change the default URL in `index.ts` if your LM Studio EP uses a different port

## License

MIT - See [LICENSE](LICENSE) for details.

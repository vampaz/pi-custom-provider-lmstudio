# pi Extension: LM Studio Models Sync

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![pi Package](https://img.shields.io/badge/pi-package-2.0.0-orange)](https://github.com/vampaz/pi-custom-provider-lmstudio)
[![Vitest](https://img.shields.io/badge/tested_with-vitest-00C248.svg)](https://vitest.dev/)
[![oxlint](https://img.shields.io/badge/lint-oxlint-orange.svg)](https://github.com/oxc-project/oxc)
[![oxfmt](https://img.shields.io/badge/format-oxfmt-orange.svg)](https://github.com/oxc-project/oxc)

An extension for the [pi coding agent](https://github.com/earendil-works/pi-mono) that fetches logical models from LM Studio's REST API (`/api/v1/models`) and registers them as a pi provider.

## Features

- **Auto-sync**: Fetches models from LM Studio EP during pi startup
- **Dynamic Registration**: Models appear in the model selector immediately
- **Manual Refresh**: `/lmstudio-refresh` command to update models manually
- **Accurate Context Windows**: Uses LM Studio's `max_context_length` and loaded-instance configuration when available
- **Smart Detection**: Uses LM Studio's vision and reasoning capabilities and falls back to explicit model-key markers when needed
- **Logical Model Inventory**: Registers grouped models once while LM Studio manages the selected downloaded variant
- **Exact Model Names**: Uses LM Studio's logical model key for both the provider ID and visible model name
- **Robust Refresh**: Filters blank and duplicate model keys and skips embedding-only models when registering chat/completions models

## Requirements

- LM Studio 0.4.0 or newer must be running with the Endpoint server enabled
- Default EP URL: `http://localhost:1234`
- The `/api/v1/models` endpoint should be accessible

## Installation

### Install via pi CLI

```bash
pi install git:github.com/vampaz/pi-custom-provider-lmstudio@v2.0.0
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

1. Fetch model metadata from `http://localhost:1234/api/v1/models`
2. Register chat and vision models as the `lmstudio-ep` provider
3. Make models available in the model selector with their reported context windows

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
- **Base URL**: Configurable via `LMSTUDIO_ENDPOINT_URL` env var, defaults to `http://localhost:1234`
- **Discovery API**: LM Studio REST API at `/api/v1/models`
- **Inference API**: OpenAI-compatible completions at `/v1`
- **API Key**: Optional Bearer token via `LMSTUDIO_API_KEY`
- **Context Window Source**: Loaded-instance `config.context_length` or `max_context_length` from LM Studio when available, otherwise explicit `8k`, `32k`, `128k`, or `1m` style hints from the model key

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

# Run integration tests (requires local LM Studio running on port 1234)
npm run test:integration

# Test in pi (hot-reload)
pi -e .
```

### Environment Variables

You can customize the extension behavior using environment variables:

| Variable                | Description                   | Default                 |
| ----------------------- | ----------------------------- | ----------------------- |
| `LMSTUDIO_ENDPOINT_URL` | Custom LM Studio endpoint URL | `http://localhost:1234` |

Example:

```bash
export LMSTUDIO_ENDPOINT_URL=http://localhost:1234
pi -e .
```

## Example LM Studio Models Response

```json
{
  "models": [
    {
      "type": "llm",
      "key": "qwen/qwen3.8-27b",
      "display_name": "Qwen3.8 27B",
      "max_context_length": 262144,
      "variants": ["qwen/qwen3.8-27b@6bit", "qwen/qwen3.8-27b@8bit"],
      "selected_variant": "qwen/qwen3.8-27b@6bit",
      "capabilities": {
        "vision": true,
        "trained_for_tool_use": true
      }
    }
  ]
}
```

## Troubleshooting

### Models not showing up

- Ensure LM Studio is running with the Endpoint server enabled
- Check that `http://localhost:1234/api/v1/models` is accessible in your browser
- Check the pi debug output for error messages

### Wrong context window or capabilities

- Make sure LM Studio's REST API is enabled and returning `max_context_length` and `capabilities`
- If metadata is unavailable, add explicit hints to the model key when possible, such as `32k`, `128k`, `vision`, or `thinking`
- Use `/lmstudio-refresh` after renaming or reloading models in LM Studio

### Connection refused

If you see "Failed to fetch models from LM Studio EP: TypeError: Failed to fetch":

- Verify LM Studio's Endpoint is running on port 1234 (or the custom URL set in `LMSTUDIO_ENDPOINT_URL`)
- To use a custom endpoint, set the environment variable: `export LMSTUDIO_ENDPOINT_URL=http://your-custom-url:port`

## License

MIT - See [LICENSE](LICENSE) for details.

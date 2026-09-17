# pi Extension: LM Studio Models Sync

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![pi Package](https://img.shields.io/badge/pi-package-3.0.0-orange)](https://github.com/vampaz/pi-custom-provider-lmstudio)
[![Vitest](https://img.shields.io/badge/tested_with-vitest-00C248.svg)](https://vitest.dev/)
[![oxlint](https://img.shields.io/badge/lint-oxlint-orange.svg)](https://github.com/oxc-project/oxc)
[![oxfmt](https://img.shields.io/badge/format-oxfmt-orange.svg)](https://github.com/oxc-project/oxc)

An extension for the [pi coding agent](https://github.com/earendil-works/pi-mono) that fetches logical models from one or more LM Studio REST APIs (`/api/v1/models`) and registers each endpoint as a pi provider.

## Features

- **Auto-sync**: Fetches models from every configured LM Studio endpoint during pi startup
- **Multiple Endpoints**: Use local and LAN-hosted LM Studio servers at the same time
- **Dynamic Registration**: Models appear in the model selector immediately, grouped by endpoint provider
- **Manual Refresh**: `/lmstudio-refresh` command to update models manually
- **Accurate Context Windows**: Uses LM Studio's `max_context_length` and loaded-instance configuration when available
- **Smart Detection**: Uses LM Studio's vision and reasoning capabilities and falls back to explicit model-key markers when needed
- **Logical Model Inventory**: Registers grouped models once while LM Studio manages the selected downloaded variant
- **Exact Model Names**: Uses LM Studio's logical model key for both the provider ID and visible model name
- **Robust Refresh**: Filters blank and duplicate model keys and skips embedding-only models when registering chat/completions models

## Requirements

- LM Studio 0.4.0 or newer must be running with the Endpoint server enabled
- Each server must expose `/api/v1/models` to the machine running pi
- The zero-config default is `http://localhost:1234`

## Installation

### Install via pi CLI

```bash
pi install git:github.com/vampaz/pi-custom-provider-lmstudio@v3.0.0
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

1. Read endpoints from `~/.pi/agent/lmstudio-models.json`, or use the local default when that file does not exist
2. Fetch model metadata from every endpoint
3. Register chat and vision models under each endpoint's provider name
4. Make models available in the model selector with their reported context windows

### Manual refresh

Run `/lmstudio-refresh` to manually fetch and update models:

```
/lmstudio-refresh
```

### Select LM Studio models

Use the model selector to choose from your LM Studio models:

```
/model
# Select a configured LM Studio provider and pick a model
```

## Provider Configuration

Create `~/.pi/agent/lmstudio-models.json` to configure multiple endpoints:

```json
[
  {
    "provider": "lmstudio-local",
    "baseUrl": "http://localhost:1234"
  },
  {
    "provider": "lmstudio-lan",
    "baseUrl": "http://192.168.1.50:1234",
    "apiKey": "optional-bearer-token"
  }
]
```

Provider names must be unique, start with a lowercase letter or number, and otherwise contain only lowercase letters, numbers, dots, underscores, or hyphens. Run `/reload` after editing the file.

If the file does not exist, the extension uses this default:

```json
[{ "provider": "lmstudio-ep", "baseUrl": "http://localhost:1234" }]
```

Each provider uses LM Studio's REST API at `/api/v1/models` for discovery and its OpenAI-compatible `/v1` API for inference. Context windows come from loaded-instance `config.context_length` or `max_context_length` when available, then explicit `8k`, `32k`, `128k`, or `1m` hints in the model key.

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

# Run integration tests against the configured endpoints (local port 1234 by default)
npm run test:integration

# Test in pi (hot-reload)
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

- Ensure each configured LM Studio server is running with the Endpoint server enabled
- Check that each configured `baseUrl` exposes `/api/v1/models`
- For LAN servers, enable network access in LM Studio and allow port `1234` through the host firewall
- Check the pi debug output for error messages

### Wrong context window or capabilities

- Make sure LM Studio's REST API is enabled and returning `max_context_length` and `capabilities`
- If metadata is unavailable, add explicit hints to the model key when possible, such as `32k`, `128k`, `vision`, or `thinking`
- Use `/lmstudio-refresh` after renaming or reloading models in LM Studio
- Use `/reload` after changing `lmstudio-models.json`

### Connection refused

If you see "Failed to fetch models from &lt;provider&gt;: TypeError: Failed to fetch":

- Verify that provider's configured `baseUrl` is reachable from the machine running pi
- Verify LM Studio is listening on the configured interface and port

## License

MIT - See [LICENSE](LICENSE) for details.

# Contributing to DataFactory

Thanks for your interest in contributing to DataFactory! This guide will help you get started.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Git

### Dev Environment Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/rohanashik/datafactory.git
   cd datafactory
   ```

2. **Backend**
   ```bash
   cd backend
   pip install -r requirements.txt
   playwright install chromium
   python manage.py migrate
   python manage.py runserver 0.0.0.0:50
   ```

3. **Frontend** (in a separate terminal)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Environment variables** — copy `.env.example` to `.env` and fill in your API keys. At minimum you need one LLM provider key (OpenAI, Anthropic, or Google).

The frontend runs on port 5173 and proxies `/api` requests to the backend on port 50.

For more details, see the [Setup section in the README](README.md#setup).

## How to Contribute

### Reporting Bugs

Open a [GitHub Issue](https://github.com/rohanashik/datafactory/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS/Python/Node versions
- Screenshots or logs if applicable

### Suggesting Features

Open a [GitHub Issue](https://github.com/rohanashik/datafactory/issues) with the **feature request** label, or start a thread in [GitHub Discussions](https://github.com/rohanashik/datafactory/discussions).

### Submitting Code

1. Fork the repo and create your branch from `main`
2. Make your changes (see conventions below)
3. Test your changes locally — make sure both backend and frontend still work
4. Push your branch and open a Pull Request

## Branch Naming

Use a prefix that describes the type of change:

| Prefix    | Use for                                |
|-----------|----------------------------------------|
| `feat/`   | New features                           |
| `fix/`    | Bug fixes                              |
| `docs/`   | Documentation changes                  |
| `refactor/` | Code restructuring (no behavior change) |
| `chore/`  | Tooling, CI, dependencies              |
| `test/`   | Adding or updating tests               |

Examples: `feat/bulk-export`, `fix/websocket-reconnect`, `docs/api-examples`

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/). Each commit message should be structured as:

```
<type>: <short summary>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`

Examples:
```
feat: add CSV export for sheets
fix: prevent duplicate WebSocket connections
docs: update setup instructions in README
refactor: extract file upload logic into separate component
```

Keep the summary line under 72 characters. Use the body for additional context when the "why" isn't obvious from the summary alone.

## Pull Request Process

1. **Keep PRs focused** — one logical change per PR. Smaller PRs get reviewed faster.
2. **Write a clear description** — explain what changed and why. Include screenshots for UI changes.
3. **Link related issues** — use `Closes #123` or `Fixes #123` in the PR description.
4. **Ensure it works** — test your changes locally before opening the PR.
5. **Respond to feedback** — maintainers may request changes. Push follow-up commits to the same branch.

A maintainer will review your PR and either merge it, request changes, or provide feedback. We aim to review PRs within a few days.

## Code Style

### Backend (Python)

- Follow [PEP 8](https://peps.python.org/pep-0008/) conventions
- Use 4-space indentation
- Keep lines under 120 characters
- Use meaningful variable and function names

### Frontend (JavaScript/JSX)

- Follow the existing ESLint configuration (`npm run lint` to check)
- Use functional components with hooks
- Use camelCase for variables/functions, PascalCase for components

### General

- Don't add unnecessary dependencies — check if existing tools cover the need
- Match the style of surrounding code when editing existing files
- Keep changes minimal — avoid reformatting or restructuring code unrelated to your change

## Project Structure

```
backend/
  core/
    views.py          # API endpoints
    models.py         # Django models
    handlers/
      ai.py           # AI tool definitions and conversation logic
      extraction.py   # File-to-markdown extraction
      knowledge.py    # ChromaDB indexing and RAG
      enrich.py       # Bulk enrichment
      mcp.py          # MCP server integration
  datafactory/
    settings.py       # Django settings
    consumers.py      # WebSocket consumer
frontend/
  src/
    components/       # React components
    utils/            # Shared utilities
```

## Questions?

- Open a thread in [GitHub Discussions](https://github.com/rohanashik/datafactory/discussions) for general questions
- Open a [GitHub Issue](https://github.com/rohanashik/datafactory/issues) for bugs or feature requests

## License

By contributing, you agree that your contributions will be licensed under the [AGPLv3 License](LICENSE).

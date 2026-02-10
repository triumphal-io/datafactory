# Roadmap

This is a high-level overview of where DataFactory is headed. Priorities may shift based on community feedback — if something here matters to you, open an issue or start a discussion.

## Near-Term

- **Authentication & multi-user support** — replace the current single-user dev mode with proper auth (OAuth / email login), per-user workbooks, and sharing permissions
- **Docker setup** — one-command local development with `docker compose up`
- **Test suite** — backend (pytest) and frontend (Vitest) test coverage for core functionality
- **PostgreSQL support** — production-ready database option alongside SQLite for dev

## Mid-Term

- **Formula support** — spreadsheet formulas alongside AI-powered cells
- **Table sorting** — sort rows by column values

## Long-Term

- **Plugin system** — community-built data connectors and AI tools
- **Self-hosted marketplace** — share and install MCP servers, enrichment templates, and workbook templates
- **Version history** — workbook snapshots with diff and rollback
- **Automation** — User triggered actions across workbooks

## Contributing

If any of these items interest you, check the [issues](https://github.com/rohanashik/datafactory/issues) for related tasks or open a new one to discuss your approach. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.
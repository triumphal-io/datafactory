# DataFactory AI Assistant Coding Guide

## Architecture Overview

**DataFactory** is a Django + React application that provides AI-powered spreadsheet manipulation with file processing, RAG-based querying, and real-time collaboration via WebSockets.

### Core Components
- **Backend**: Django 5.2 + Django REST Framework + Django Channels (WebSockets)
- **Frontend**: React 19 + Vite (dev server on :80, proxies `/api` to Django :50)
- **Database**: SQLite (main DB at `backend/db.sqlite3`, ChromaDB at `storage/chromadb/`)
- **AI Layer**: LiteLLM for model abstraction, ChromaDB for vector search/RAG
- **Real-time**: Django Channels with InMemoryChannelLayer (no Redis)
- **Embedding Models**: Supports OpenAI (`text-embedding-3-small`), default, and sentence-transformers

### Data Model Hierarchy
```
Workbook (uuid-based)
├── Sheets (spreadsheet tabs - editable grids with columns/rows stored as JSONField)
├── Resources (uploaded files - CSV/XLSX/PDF/DOCX/TXT/MD/PPTX with extracted markdown)
│   ├── Files (individual uploaded documents with file linking support)
│   └── Folders (for organizing files)
└── Conversations (chat history with AI assistant)
```

**CRITICAL TERMINOLOGY:**
- **Workbook** = Main container (backend model: `Workbook`, UI: "Workbook")
- **Sheets** = Spreadsheet tabs in the workbook (editable grids, like Excel sheets)
- **Resources** = Uploaded files section (CSV/XLSX/PDF/DOCX stored as files)
- **Sheet files** = CSV/XLSX files uploaded to Resources (NOT the same as Sheets)

**AI Tool Usage Guide:**
- Use `get_sheet_tools()` for manipulating **Sheets** (spreadsheet tabs in workbook)
- Use `get_file_tools()` for querying **Resources** (uploaded CSV/XLSX/PDF/DOCX/TXT/MD/PPTX files)
- Use `get_workbook_tools()` for getting workbook structure and reading other sheets
- Use `get_ai_tools()` for web search and scraping capabilities
- When user says "add data to sheet" → manipulate the Sheet (spreadsheet tab)
- When user says "query the CSV file" → search Resources (uploaded files)

## Critical Patterns & Conventions

### 1. Model References Use UUIDs, Not PKs
All model relationships use UUID fields for external references:
```python
workbook = Workbook.objects.get(uuid=workbook_id)  # ✅ Correct
workbook = Workbook.objects.get(id=workbook_id)    # ❌ Wrong
```
**Important**: Backend uses `workbook_id` for function parameters, `Workbook` model for database, and `/api/workbooks/` for API routes.
URLs and API responses use string UUIDs: `/api/workbooks/{uuid}/sheets/{uuid}`

### 2. WebSocket Communication Pattern
- **Group naming**: `g-{workbook_uuid}` (see [datafactory/consumers.py](backend/datafactory/consumers.py))
- **Message types**: Custom event types like `enrichment_update`, `new_message`
- **Frontend listens**: Via `window.dispatchEvent(new CustomEvent('websocket-message', { detail: data }))`
- **Singleton connections**: Frontend maintains one WebSocket per workbook in global `wsConnections` map (see [utils/websocket-context.jsx](frontend/src/utils/websocket-context.jsx))
- **WebSocket URL**: `ws://localhost:50/ws/workbook/{uuid}/` (frontend uses `/ws/workbook/`, backend consumer is `WorkbookConsumer`)

### 3. AI Tool Execution Flow
The assistant uses a **client-side tool execution** model (not server-side):

1. Backend returns tool calls from LLM via `/api/workbooks/{uuid}/assistant/chat`
2. Frontend ([assistant.jsx](frontend/src/components/assistant.jsx)) executes tools locally (spreadsheet ops, file queries)
3. Frontend sends tool results back to `/api/workbooks/{uuid}/assistant/respond`
4. Backend continues conversation with tool results

**Tool categories** (see [handlers/ai.py](backend/core/handlers/ai.py)):
- `get_ai_tools()`: Web search (`tool_search`), web scraping (`tool_web_scraper`)
- `get_workbook_tools()`: Get workbook structure (`tool_get_workbook_structure`), view sheet data (`tool_get_sheet_data`)
- `get_file_tools()`: Read file content (`tool_read_file`), RAG-based file querying (`tool_query_file_data`)
- `get_sheet_tools()`: Spreadsheet tab manipulation (`tool_add_rows`, `tool_delete_rows`, `tool_add_column`, `tool_delete_column`, `tool_populate_cells`)

**IMPORTANT DISTINCTION:**
- **Sheet Tools** (`tool_add_rows`, `tool_populate_cells`, etc.) → Operate on workbook Sheets (spreadsheet tabs)
- **File Tools** (`tool_query_file_data`, `tool_read_file`) → Query uploaded Resources (CSV/XLSX/PDF/DOCX/TXT/MD/PPTX files in Resources section)
- **Workbook Tools** (`tool_get_workbook_structure`, `tool_get_sheet_data`) → Get overview of workbook and view data from other sheets

**AI Conversation Limits** (see [handlers/ai.py](backend/core/handlers/ai.py)):
- `MAX_CONVERSATION_MESSAGES = 30`: Maximum messages to keep (excludes system message)
- `MAX_TOOL_ITERATIONS = 5`: Maximum tool calling cycles per request
- `MAX_TOOLS_PER_TURN = 10`: Maximum parallel tool calls per iteration
- `AI_MAX_TOKENS = 2048`: Maximum tokens for AI responses

### 4. File Processing Pipeline
Files go through async processing (see [handlers/extraction.py](backend/core/handlers/extraction.py)):

1. Upload → `File` model created with `is_processing=True`
2. Background thread extracts to markdown (CSV/XLSX → tables, PDF/DOCX/PPTX/TXT/MD → text)
3. Content indexed to ChromaDB via [handlers/knowledge.py](backend/core/handlers/knowledge.py)
4. `is_processing=False` → file ready for RAG queries

**Supported file types**: CSV, XLSX, PDF, DOCX, PPTX, TXT, MD

**Key**: Use `tool_query_file_data` with `search_type='identifier'` for exact ID lookups (SKUs, customer IDs, order numbers), `search_type='query'` for semantic search (natural language questions).

**File Linking**: Files can be linked via the `file` datatype in columns. This enables relationship mapping between spreadsheet data and uploaded documents.

### 5. Bulk Enrichment System
[handlers/enrich.py](backend/core/handlers/enrich.py) handles concurrent AI enrichment:
- Uses `threading.Queue` + worker threads (default: 4 concurrent)
- Creates `BackgroundJob` models for tracking
- Sends WebSocket updates: `queued` → `generating` → `completed`/`failed`
- Cleanup: Old jobs auto-deleted after 10 minutes

### 6. Frontend API Pattern
All API calls use [utils/api.js](frontend/src/utils/api.js)'s `apiFetch()`:
```javascript
apiFetch('/api/workbooks/list', { method: 'POST' })  // Auto-handles JSON, auth tokens
```
**Note**: Vite proxy rewrites `/api` → `http://localhost:50` in dev.

### 7. ASGI Configuration
Django Channels routes HTTP and WebSocket separately (see [datafactory/asgi.py](backend/datafactory/asgi.py)):
```python
ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(URLRouter(...))
})
```
Run with Daphne, not `runserver`.

## Development Workflows

### Running the App
```bash
# Backend (from backend/)
python manage.py runserver 0.0.0.0:50

# Frontend (from frontend/)
npm run dev  # Starts on :80 with proxy
```

### Database Operations
```bash
python manage.py makemigrations
python manage.py migrate
```

### Adding New AI Tools
1. Define tool in [handlers/ai.py](backend/core/handlers/ai.py) (e.g., `get_custom_tools()`)
2. Implement tool function: `def tool_your_name(params):`
3. Add to tool list in `api_assistant` view ([views.py](backend/core/views.py))
4. Frontend auto-receives tool calls via chat API

### Working with ChromaDB
Collections use OpenAI `text-embedding-3-small`. Key functions in [handlers/knowledge.py](backend/core/handlers/knowledge.py):
- `index_csv_file()`, `index_xlsx_file()` → Create row-level chunks with metadata
- `query_file_data()` → Semantic search with metadata filtering

## Common Gotchas

1. **WebSocket port mismatch**: Frontend connects to `:50` (backend port), not `:80` (Vite dev server)
2. **CORS**: Not used—Vite proxy handles dev, Nginx handles prod
3. **Authentication**: Currently disabled (`AllowAny` permission) with hardcoded user `rohanashik`
4. **Sheet data structure**: Stored as `{'columns': [...], 'rows': [...]}` in JSONField
5. **File paths**: Use `BASE_DIR / 'storage' / 'userdata'` pattern (see [settings.py](backend/datafactory/settings.py))
6. **Model selection**: Stored per-workbook in `Workbook.selected_model`, defaults to `DEFAULT_AI_MODEL='gpt-5-nano'` from settings

## File Organization

- **Handlers**: Business logic in [backend/core/handlers/](backend/core/handlers/)—AI, extraction, knowledge, enrichment
- **API Views**: All in [backend/core/views.py](backend/core/views.py) (single large file, ~900 lines)
- **Models**: Single file [backend/core/models.py](backend/core/models.py) (Workbook model for workbooks)
- **Frontend Components**: Feature-based in [frontend/src/components/](frontend/src/components/)—assistant, workbook-view, files-view, sheet-view
- **Frontend Pages**: [frontend/src/pages/](frontend/src/pages/)—workbook.jsx (main workbook page)

**Important**: Backend uses `Workbook` model, `workbook_id` for function parameters, and `/api/workbooks/` for API routes. UI uses "Workbook" terminology throughout. WebSocket routes use `/ws/workbook/` for clarity.

## Dependencies

**Backend** ([requirements.txt](backend/requirements.txt)):
- `litellm` - AI model abstraction (supports OpenAI, Anthropic, etc.)
- `chromadb` - Vector database for RAG
- `crawl4ai` - Web scraping for AI tools
- `openpyxl` - Excel file processing

**Frontend** ([package.json](frontend/package.json)):
- `react-router-dom` - Routing
- `exceljs` - Excel export
- `react-markdown`, `showdown` - Markdown rendering

## Settings & Configuration

- Stage-based config via `STAGE='local'` in [settings.py](backend/datafactory/settings.py)
- Environment variables loaded from root `.env` (see [handlers/ai.py](backend/core/handlers/ai.py) line 14)
- Default AI model: `DEFAULT_AI_MODEL='gpt-5-nano'`

## Planned Features (from NOTES.md)
- User authentication and profiles
- Access chat history and continue conversations
- Settings page for model/credential management

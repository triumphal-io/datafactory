# DataFactory AI Assistant Coding Guide

## Architecture Overview

**DataFactory** is a Django + React application that provides AI-powered spreadsheet manipulation with file processing, RAG-based querying, and real-time collaboration via WebSockets.

### Core Components
- **Backend**: Django 6.0 + Django REST Framework + Django Channels (WebSockets)
- **Frontend**: React 19 + Vite (dev server on :80, proxies `/api` to Django :50)
- **Database**: SQLite (main DB at `backend/db.sqlite3`, ChromaDB at `storage/chromadb/`)
- **AI Layer**: LiteLLM for model abstraction, ChromaDB for vector search/RAG
- **Real-time**: Django Channels with InMemoryChannelLayer (no Redis)

### Data Model Hierarchy
```
Document (uuid-based)
├── Sheets (spreadsheet data stored as JSONField)
├── Files (uploaded CSV/XLSX with extracted markdown content)
├── Folders (for organizing files)
└── Conversations (chat history with AI assistant)
```

## Critical Patterns & Conventions

### 1. Model References Use UUIDs, Not PKs
All model relationships use UUID fields for external references:
```python
document = Document.objects.get(uuid=document_id)  # ✅ Correct
document = Document.objects.get(id=document_id)    # ❌ Wrong
```
URLs and API responses use string UUIDs: `/api/documents/{uuid}/sheets/{uuid}`

### 2. WebSocket Communication Pattern
- **Group naming**: `g-{document_uuid}` (see [datafactory/consumers.py](backend/datafactory/consumers.py))
- **Message types**: Custom event types like `enrichment_update`, `new_message`
- **Frontend listens**: Via `window.dispatchEvent(new CustomEvent('websocket-message', { detail: data }))`
- **Singleton connections**: Frontend maintains one WebSocket per document in global `wsConnections` map (see [utils/websocket-context.jsx](frontend/src/utils/websocket-context.jsx))

### 3. AI Tool Execution Flow
The assistant uses a **client-side tool execution** model (not server-side):

1. Backend returns tool calls from LLM via `/api/documents/{uuid}/assistant/chat`
2. Frontend ([assistant.jsx](frontend/src/components/assistant.jsx)) executes tools locally (spreadsheet ops, file queries)
3. Frontend sends tool results back to `/api/documents/{uuid}/assistant/respond`
4. Backend continues conversation with tool results

**Tool categories** (see [handlers/ai.py](backend/core/handlers/ai.py)):
- `get_ai_tools()`: Web search, scraping
- `get_file_tools()`: RAG-based file querying (replaced old direct read)
- `get_sheet_tools()`: Spreadsheet manipulation (add/delete rows/columns, populate cells)

### 4. File Processing Pipeline
Files go through async processing (see [handlers/extraction.py](backend/core/handlers/extraction.py)):

1. Upload → `File` model created with `is_processing=True`
2. Background thread extracts to markdown (CSV/XLSX → tables)
3. Content indexed to ChromaDB via [handlers/knowledge.py](backend/core/handlers/knowledge.py)
4. `is_processing=False` → file ready for RAG queries

**Key**: Use `tool_query_file_data` with `search_type='identifier'` for exact ID lookups, `search_type='query'` for semantic search.

### 5. Bulk Enrichment System
[handlers/enrich.py](backend/core/handlers/enrich.py) handles concurrent AI enrichment:
- Uses `threading.Queue` + worker threads (default: 4 concurrent)
- Creates `BackgroundJob` models for tracking
- Sends WebSocket updates: `queued` → `generating` → `completed`/`failed`
- Cleanup: Old jobs auto-deleted after 10 minutes

### 6. Frontend API Pattern
All API calls use [utils/api.js](frontend/src/utils/api.js)'s `apiFetch()`:
```javascript
apiFetch('/api/documents/list', { method: 'POST' })  // Auto-handles JSON, auth tokens
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
6. **Model selection**: Stored per-document in `Document.selected_model`, defaults to `DEFAULT_AI_MODEL='gpt-5-nano'` from settings

## File Organization

- **Handlers**: Business logic in [backend/core/handlers/](backend/core/handlers/)—AI, extraction, knowledge, enrichment
- **API Views**: All in [backend/core/views.py](backend/core/views.py) (single large file, ~900 lines)
- **Models**: Single file [backend/core/models.py](backend/core/models.py)
- **Frontend Components**: Feature-based in [frontend/src/components/](frontend/src/components/)—assistant, document-view, files-view, sheet-view

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
- Folder view UI, file operations (move/rename/delete)
- PDF, DOCX, PPTX, TXT/MD support
- User authentication
- Chat history access
- Settings page for model/credential management

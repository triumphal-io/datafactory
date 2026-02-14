# Architecture

DataFactory is an AI-powered spreadsheet platform built with a Django backend and React frontend, connected via REST APIs and WebSockets for real-time updates.

## Data Model

All models use **UUID primary keys** (not auto-incrementing integers).

```mermaid
erDiagram
    Workbook ||--o{ Sheet : contains
    Workbook ||--o{ File : contains
    Workbook ||--o{ Folder : contains
    Workbook ||--o{ Conversation : has
    Workbook ||--o{ BackgroundJob : tracks
    Workbook ||--o{ MCPServer : configures
    Workbook ||--o{ ProviderCredential : stores

    Workbook {
        uuid uuid PK
        string name
        string ai_model
        string user
    }

    Sheet {
        uuid uuid PK
        string name
        json data "columns and rows"
        int position
    }

    File {
        uuid uuid PK
        string name
        string file_type
        string extracted_content
        bool is_processing
    }

    Folder {
        uuid uuid PK
        string name
        uuid parent_folder FK
    }

    Conversation {
        uuid uuid PK
        json messages "array of message objects"
    }

    BackgroundJob {
        uuid uuid PK
        string status "queued | generating | completed | failed"
        string job_type
        json metadata
    }

    MCPServer {
        uuid uuid PK
        string name
        string url
    }

    ProviderCredential {
        uuid uuid PK
        string provider
        string api_key
    }
```

### Sheet Data Structure

Sheet data is stored as a `JSONField` with this shape:

```json
{
  "columns": [
    { "id": "col-uuid", "name": "Company", "type": "text", "width": 200 },
    { "id": "col-uuid", "name": "Revenue", "type": "number", "width": 120 }
  ],
  "rows": [
    { "id": "row-uuid", "cells": { "col-uuid": { "value": "Acme Inc" }, ... } }
  ]
}
```

### Key Terminology

- **Sheets** = editable spreadsheet tabs in a workbook (grid data). Sheet tools manipulate grid columns, rows, and cells.
- **Resources/Files** = uploaded documents in the file library. File tools query document content via RAG.
- These are **not** the same thing and use different API endpoints and AI tools.

## Client-Side Tool Execution

The AI assistant uses a **round-trip pattern** where the frontend acts as the execution engine for tool calls. This design allows spreadsheet operations to happen client-side (where the grid state lives) while keeping the LLM conversation on the backend.

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant LLM as LLM Provider

    User->>Frontend: Sends message
    Frontend->>Backend: POST /api/workbooks/{id}/assistant/chat
    Backend->>LLM: Forward conversation + tools
    LLM-->>Backend: Response with tool_calls
    Backend-->>Frontend: Return tool_calls to execute

    loop For each tool call
        Frontend->>Frontend: Execute tool locally (e.g. add column, update cell)
    end

    Frontend->>Backend: POST /api/workbooks/{id}/assistant/respond (tool results)
    Backend->>LLM: Continue conversation with results
    LLM-->>Backend: Final text response (or more tool calls)
    Backend-->>Frontend: Return response to user

    Note over Frontend,Backend: This loop repeats up to 10 iterations
```

### Why Client-Side Execution?

1. **State locality**: The spreadsheet grid state lives in the React frontend. Executing tools client-side avoids syncing issues.
2. **Immediate UI feedback**: Users see changes as they happen, without waiting for a server round-trip for each operation.
3. **Reduced backend complexity**: The backend doesn't need to maintain a copy of the live grid state.

### Conversation Limits

| Limit | Value |
|-------|-------|
| Max messages per conversation | 30 |
| Max tool iterations per turn | 10 |
| Max tools per single LLM response | 15 |
| Max tokens per LLM response | 2048 |

## WebSocket Pattern

WebSockets provide real-time updates for long-running operations like bulk enrichment and file processing.

```mermaid
sequenceDiagram
    participant Frontend
    participant WS as WebSocket Server (Daphne)
    participant Backend as Backend Worker

    Frontend->>WS: Connect to ws://host/ws/workbook/{uuid}/
    WS->>WS: Add to group "g-{uuid}"

    Note over Backend: Enrichment job starts
    Backend->>WS: channel_layer.group_send("g-{uuid}", event)
    WS-->>Frontend: JSON message (progress update)
    Frontend->>Frontend: window.dispatchEvent(CustomEvent)

    Note over Backend: File processing completes
    Backend->>WS: channel_layer.group_send("g-{uuid}", event)
    WS-->>Frontend: JSON message (file ready)
```

### Connection Details

| Aspect | Detail |
|--------|--------|
| URL pattern | `ws://localhost:50/ws/workbook/{uuid}/` |
| Group naming | `g-{workbook_uuid}` |
| Server | Daphne (ASGI) via Django Channels |
| Frontend dispatch | `window.dispatchEvent(new CustomEvent('websocket-message', ...))` |
| Connection management | Singleton map prevents duplicate connections per workbook |

### Events Sent Over WebSocket

- **Enrichment progress**: Row-by-row status updates during bulk enrichment jobs
- **File processing**: Notifications when uploaded files finish extraction and indexing
- **Background job status**: Status transitions (queued, generating, completed, failed)

## File Processing Pipeline

```mermaid
flowchart LR
    Upload["File Upload"] --> Create["Create File record<br/>(is_processing=true)"]
    Create --> Extract["Background thread:<br/>Extract to Markdown"]
    Extract --> Index["Index chunks<br/>in ChromaDB"]
    Index --> Ready["Set is_processing=false"]
    Ready --> Query["Available for<br/>RAG queries"]
```

Supported formats: CSV, XLSX, PDF, DOCX, PPTX, TXT, MD.

## Bulk Enrichment

Bulk enrichment processes many cells in parallel using a thread pool:

```mermaid
flowchart TB
    Request["Enrichment Request<br/>(column + prompt)"] --> Job["Create BackgroundJob<br/>(status: queued)"]
    Job --> Queue["Add rows to<br/>threading.Queue"]
    Queue --> Pool["Thread Pool<br/>(4 workers)"]
    Pool --> Worker1["Worker 1"]
    Pool --> Worker2["Worker 2"]
    Pool --> Worker3["Worker 3"]
    Pool --> Worker4["Worker 4"]
    Worker1 --> LLM["LLM API Call"]
    Worker2 --> LLM
    Worker3 --> LLM
    Worker4 --> LLM
    LLM --> WS["Send progress<br/>via WebSocket"]
    WS --> Complete["Job complete"]
```

Each worker picks a row from the queue, calls the LLM with the enrichment prompt, writes the result to the cell, and sends a WebSocket update. The `BackgroundJob` status transitions: **queued** → **generating** → **completed** (or **failed**).

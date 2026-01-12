# DataFactory

DataFactory is a Django + React application that provides AI-powered spreadsheet manipulation with file processing, RAG-based querying, and real-time collaboration via WebSockets.

## Setup

### Backend Setup

1. Install Python dependencies:
```bash
cd backend
pip install -r requirements.txt
```

2. Install Playwright browsers (required for web scraping):
```bash
playwright install chromium
```

3. Run migrations:
```bash
python manage.py migrate
```

4. Start the backend server:
```bash
python manage.py runserver 0.0.0.0:50
```

### Frontend Setup

1. Install Node dependencies:
```bash
cd frontend
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will run on port 80 and proxy `/api` requests to the backend on port 50.

## Features

- **Spreadsheet Manipulation**: Create and edit sheets with AI assistance
- **File Processing**: Upload and extract content from CSV, XLSX, PDF, DOCX, PPTX, TXT, MD
- **RAG-based Querying**: Query uploaded documents using semantic search
- **Web Search & Scraping**: AI can search the web and scrape content
- **Real-time Collaboration**: WebSocket support for live updates

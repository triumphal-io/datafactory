# DataFactory

### Spreadsheet AI /  Agents in Every Cell


DataFactory is an AI-powered spreadsheet platform that combines the flexibility of traditional spreadsheets with advanced AI capabilities for data enrichment, analysis, and knowledge extraction. 


Built on Django and React, it enables users to work with tabular data alongside uploaded documents (CSV, XLSX, PDF, DOCX, PPTX, TXT, MD) in a unified workspace, leveraging large language models for intelligent automation.

The core idea is to create **workbooks** that contain:
- **Sheets**: Editable spreadsheet tabs for structured data manipulation
- **Resources**: A document library where you can upload and organize files for AI-powered querying
- **AI Assistant**: A conversational interface that can manipulate sheets, query documents, search the web, and enrich data using RAG (Retrieval-Augmented Generation)

Unlike traditional spreadsheets, DataFactory allows you to ask natural language questions about your uploaded documents, automatically populate spreadsheet cells using AI, link spreadsheet rows to relevant files, and perform bulk enrichment operations across thousands of rows—all while maintaining real-time collaboration through WebSockets.



## Features
- **Spreadsheet Manipulation**: Create and edit sheets with AI assistance
- **Enrich Data**: Bulk enrich thousands of cells individually using AI
- **File Processing**: Upload and extract content from CSV, XLSX, PDF, DOCX, PPTX, TXT, MD
- **RAG-based Querying**: Query uploaded documents using semantic search
- **Web Search & Scraping**: AI can search the web and scrape content
- **Real-time Collaboration**: WebSocket support for live updates


## Tech Stack
- **Backend**: [Django](https://github.com/django/django), Django REST Framework, Playwright (for web scraping), LangChain, FAISS
- **Frontend**: [React](https://github.com/facebook/react), Vite, Tailwind CSS, React Query, Socket.IO
- **Database**: SQLite (for development), PostgreSQL (recommended for production)
- **AI Models**: OpenAI, Anthropic, Gemini
- **Libraries**: 
    - [Litellm](https://github.com/BerriAI/litellm)
    - [ChromaDB](https://github.com/chroma-core/chroma)
    - [Pandas](https://github.com/pandas-dev/pandas)
    - [python-docx](https://github.com/python-openxml/python-docx)
    - [python-pptx](https://github.com/scanny/python-pptx)


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


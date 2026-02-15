"""
DataFactory API Views Package

This package contains all API endpoint handlers organized by functionality:
- workbooks: Workbook CRUD operations (list, create, update, mentions)
- sheets: Sheet management (spreadsheet tabs within workbooks)
- files: File upload and management (Resources section)
- folders: Folder organization for files
- assistant: AI assistant chat with tool support
- enrichment: Cell enrichment (single and bulk)
- cell_history: Enrichment history tracking
- mcp: MCP server configuration
- providers: LLM provider credential management
- testing: Test endpoints for admin/debug
"""

# Import all view functions
from .workbooks import api_workbooks, api_update_workbook
from .sheets import api_sheets
from .files import api_files
from .folders import api_folders
from .assistant import api_assistant
from .enrichment import api_enrich, api_bulk_enrich
from .cell_history import api_cell_history
from .mcp import api_mcp_servers
from .providers import api_provider_credentials
from .testing import api_test
from .auth import api_signup, api_login

# Export all views for easy importing
__all__ = [
    'api_workbooks',
    'api_update_workbook',
    'api_sheets',
    'api_files',
    'api_folders',
    'api_assistant',
    'api_enrich',
    'api_bulk_enrich',
    'api_cell_history',
    'api_mcp_servers',
    'api_provider_credentials',
    'api_test',
    'api_signup',
    'api_login',
]

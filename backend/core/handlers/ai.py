import asyncio
import time
import json
import os
from io import BytesIO
from pathlib import Path

from PIL import Image
from crawl4ai import AsyncWebCrawler, BM25ContentFilter, DefaultMarkdownGenerator, PruningContentFilter, CrawlerRunConfig
from crawl4ai.utils import configure_windows_event_loop
from ddgs import DDGS
# import litellm
from dotenv import load_dotenv
from django.apps import apps
from django.conf import settings
from .mcp import get_mcp_tools, execute_mcp_tool

# Load environment variables from root folder
env_path = Path(__file__).resolve().parents[3] / '.env'
load_dotenv(dotenv_path=env_path)

# os.environ['LITELLM_LOG'] = 'DEBUG'

# Conversation length limits to prevent token overflow and control costs
MAX_CONVERSATION_MESSAGES = 30  # Maximum messages to keep (excluding system message)
# This allows for ~10-15 conversation turns while staying within token limits
# and keeping API costs reasonable

# Tool calling limits to prevent runaway costs and infinite loops
MAX_TOOL_ITERATIONS =  10 # Maximum number of tool calling cycles per request
# Prevents AI from calling tools indefinitely (e.g., querying 1000 files in a loop)
MAX_TOOLS_PER_TURN = 15  # Maximum number of tools that can be called in one iteration
# Prevents excessive parallel tool calls that could cause rate limits or high costs

AI_MAX_TOKENS = 2048  # Max tokens for AI responses (adjust based on model capabilities)


def _get_provider_from_model(model: str | None) -> str | None:
    if not model:
        return None
    model_lower = model.lower().strip()
    if '/' in model_lower:
        return model_lower.split('/', 1)[0]
    if 'claude' in model_lower or 'anthropic' in model_lower:
        return 'anthropic'
    if 'gemini' in model_lower:
        return 'gemini'
    if model_lower.startswith('gpt') or 'openai' in model_lower:
        return 'openai'
    return None


def _get_provider_access(workbook_id: str | None, model: str | None):
    """Return (provider, api_key, error_reason).

    error_reason is one of: None | 'missing' | 'disabled'
    """
    provider = _get_provider_from_model(model)
    if provider not in {'openai', 'gemini', 'anthropic'}:
        return provider, None, None

    try:
        ProviderCredential = apps.get_model('core', 'ProviderCredential')
        Workbook = apps.get_model('core', 'Workbook')

        user = None
        if workbook_id:
            workbook = Workbook.objects.filter(uuid=workbook_id).select_related('user').first()
            user = workbook.user if workbook else None

        if user is None:
            # Fallback to default user in non-workbook contexts
            from django.contrib.auth.models import User
            user = User.objects.filter(username='rohanashik').first()

        if user is None:
            return provider, None, 'missing'

        cred = ProviderCredential.objects.filter(user=user, provider=provider).first()
        api_key = (cred.api_key or '').strip() if cred else ''
        if not api_key:
            return provider, None, 'missing'
        if not cred.enabled:
            return provider, None, 'disabled'
        return provider, api_key, None
    except Exception:
        # Credentials must come from DB.
        return provider, None, 'missing'

def trim_conversation(conversation, max_messages=MAX_CONVERSATION_MESSAGES):
    """
    Trim conversation history to stay within token limits and control costs.
    
    Keeps the most recent messages while always preserving the system message.
    This prevents context window overflow and excessive API costs.
    
    Args:
        conversation (list): List of message dicts with 'role' and 'content'
        max_messages (int): Maximum number of messages to keep (excluding system message)
    
    Returns:
        list: Trimmed conversation with system message + recent messages
    """
    if not conversation:
        return conversation
    
    # Find and preserve system message(s) at the start
    system_messages = []
    other_messages = []
    
    for msg in conversation:
        if msg.get('role') == 'system':
            system_messages.append(msg)
        else:
            other_messages.append(msg)
    
    # If total non-system messages exceed limit, keep only the most recent ones
    if len(other_messages) > max_messages:
        print(f"Trimming conversation: {len(other_messages)} messages -> {max_messages} messages")
        other_messages = other_messages[-max_messages:]
    
    # Return system messages + trimmed conversation
    return system_messages + other_messages


def ai_filter_result(raw_result, prompt, source_type="data", model=settings.DEFAULT_AI_MODEL, return_full_context=False, workbook_id=None):
    """
    Filter raw tool results using a secondary AI call based on the main AI's objective.
    
    This is a reusable function for all tools that need AI-based result filtering.
    It takes raw data and extracts only the information relevant to the prompt.
    
    Args:
        raw_result (str): Raw data from the tool (file results, webpage content, etc.)
        prompt (str): Main AI's objective - what specific information to extract
        source_type (str, optional): Description of data source (e.g., "file query results", "webpage content")
        model (str, optional): AI model to use for filtering. Defaults to settings.DEFAULT_AI_MODEL for speed/cost
        return_full_context (bool, optional): If True, returns explanation of page content when info not found. Defaults to False.
    
    Returns:
        str: AI-filtered summary (~25 words, focused on the prompt objective)
    """
    if return_full_context:
        # For web scraping, provide explanatory context about what the page contains
        filter_prompt = f"""You are a webpage analysis assistant. The main AI scraped a webpage and received:

{raw_result}

The main AI's objective was: {prompt}

Your task: 
1. FIRST, try to extract the specific information requested. If found, provide it clearly (max 25 words).
2. IF the information is NOT on this page, provide an EXPLANATORY response about what this page actually contains/discusses instead. Describe the page's main topics and content in 1-2 sentences.

Format your response as:
- If found: "[The answer]: [extracted value]"
- If not found: "Page does not contain this info. This page discusses: [what it actually covers]"

Your response:"""  
    else:
        # Original behavior for file queries
        filter_prompt = f"""You are a data extraction assistant. The main AI retrieved {source_type} and received:

{raw_result}

The main AI's objective was: {prompt}

Your task: Extract ONLY the specific information the main AI needs. Remove irrelevant data and present the answer in a clear, concise sentence (around 25 words max). If the data doesn't contain what was requested, say "Information not found."

Your response:"""
    
    # Call secondary AI (no conversation persistence, no recursive tools)
    filtered_result = assistant(
        message=filter_prompt,
        conversation_obj=None,
        include_sheet_tools=False,
        workbook_id=workbook_id,
        model=model
    )
    
    return filtered_result.strip()


def get_ai_tools():
    """
    Get standard AI tools for web search and scraping.
    
    Returns:
        list: List of tool definitions for searching and web scraping
    """
    search_tool = {
        "type": "function",
        "function": {
            "name": "tool_search",
            "description": (
                "Search the web for current information using keywords. "
                "Returns top search results with titles, URLs, and brief snippets. "
                "Use this FIRST to find relevant sources, then use tool_web_scraper to verify. "
                "Best for: current events, recent data, finding authoritative sources. "
                "Keep queries short: 1-5 keywords (e.g., 'Zendesk CEO' not full sentences)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "Concise search keywords (1-5 words). Examples: 'Tesla stock price', 'France president', 'Notion founder'"
                    },
                },
                "required": ["keyword"],
            },
        }
    }

    web_scraper_tool = {
        "type": "function",
        "function": {
            "name": "tool_web_scraper",
            "description": (
                "Fetch and extract complete content from a specific webpage URL. "
                "Use this AFTER tool_search to verify information from promising results. "
                "This tool returns the full page content, allowing you to confirm facts "
                "that appeared in search snippets. Always scrape at least one authoritative "
                "source before finalizing factual answers. "
                "Prioritize official websites, major news outlets, and reputable sources."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The exact URL to scrape (must be from search results or known source)"
                    },
                    "prompt": {
                        "type": "string",
                        "description": (
                            "Specific information to extract from the page. "
                            "Be precise about what you're looking for. "
                            "Examples: 'Find the CEO name', 'Extract the product price', "
                            "'Get the company founding date', 'Find contact email'"
                        )
                    }
                },
                "required": ["url", "prompt"],
            },
        }
    }

    return [search_tool, web_scraper_tool]


def get_workbook_tools():
    """
    Get tools for viewing sheet data.
    
    Note: Workbook structure (sheets + files tree) is now pre-loaded in the initial
    message instead of being a tool, which reduces latency.
    
    Returns:
        list: List of tool definitions for workbook operations
    """
    get_sheet_data_tool = {
        "type": "function",
        "function": {
            "name": "tool_get_sheet_data",
            "description": "View data from a specific sheet using its UUID. Returns the sheet's column structure and row data.\n\nIMPORTANT: You MUST use the sheet's UUID, NOT the sheet name. The workbook structure context lists all available sheets with their UUIDs. Always check the workbook structure and use the UUID value.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sheet_identifier": {
                        "type": "string",
                        "description": "The sheet UUID (NOT the sheet name). Example: 'a1b2c3d4-5678-90ab-cdef-1234567890ab'. Check the workbook structure context for the exact UUID of each sheet."
                    },
                    "max_rows": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Default: 50, max: 200. Use lower values for large sheets to avoid token overflow.",
                        "default": 50
                    }
                },
                "required": ["sheet_identifier"],
            },
        }
    }
    
    return [get_sheet_data_tool]


def get_file_tools(include_read_file_tool=True):
    """
    Get static tool definitions for accessing files from the database.
    
    This returns STATIC tool definitions only (no dynamic file lists)
    to enable prompt caching. File lists should be added to user messages instead.
    
    Args:
        include_read_file_tool (bool): If True, includes tool_read_file. Defaults to True. Set to False for enrichment mode.
    
    Returns:
        list: List of tool definitions for file operations
    """
    # Direct file reading tool - reads full extracted content by UUID
    # Note: For searching/querying files, use tool_query_file_data instead (more efficient)
    read_file_tool = {
        "type": "function",
        "function": {
            "name": "tool_read_file",
            "description": "Read the complete extracted markdown content of a specific uploaded file.\n\nIMPORTANT: Before using this tool, ALWAYS check the workbook structure context (provided at the start of the conversation) to verify the file exists and get its UUID.\n\nYou MUST pass the file's UUID (unique identifier), NOT the filename. The file UUID is shown in the workbook structure context. Example UUID: '3fa85f64-5717-4562-b3fc-2c963f66afa6'.\n\nThis tool is useful for accessing the entire contents of a file. For more efficient searches within files, use tool_query_file_data instead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {
                        "type": "string",
                        "description": "The UUID of the file to read. This is a unique identifier in format like '3fa85f64-5717-4562-b3fc-2c963f66afa6'. Do NOT use the filename - use the UUID from the workbook structure context."
                    },
                },
                "required": ["file_id"],
            },
        }
    }
    
    # NEW: RAG-based query tool for efficient file access
    query_file_tool = {
        "type": "function",
        "function": {
            "name": "tool_query_file_data",
            "description": "Query data from UPLOADED CSV/XLSX files using semantic search. This tool searches through file contents and returns relevant records.\n\n🚨 CRITICAL WARNING: This tool will FAIL if you provide a filename that doesn't exist. DO NOT GUESS FILENAMES.\n\nBEFORE calling this tool:\n1. Look at the 'WORKBOOK STRUCTURE' section in the conversation context\n2. Find the '## Files' section\n3. Use the EXACT filename shown there (e.g., 'customers.csv', not 'customer.csv' or 'companies.csv')\n4. If NO files are listed, DO NOT call this tool - there are no files to query\n\nThe filename parameter must EXACTLY match the filename shown in the workbook structure. If you cannot find a matching file, DO NOT make up a filename.\n\nThis tool is ONLY for uploaded files (CSV/XLSX). DO NOT use this for spreadsheet sheets - use tool_get_sheet_data instead to view sheet data.\n\nUse 'identifier' search type when:\n- Looking up specific IDs, codes, SKUs, product numbers, customer IDs, order numbers\n- Query is a short alphanumeric string (e.g., 'AB1234', 'CUST-001', 'SKU123')\n- Need exact match for a unique identifier\n- Examples: 'AB1234', 'ORDER-12345', 'CUST001', 'INV-2024-001'\n\nUse 'query' search type when:\n- Natural language questions (e.g., 'customers in New York')\n- Descriptive searches (e.g., 'products with high ratings')\n- Date-based queries (e.g., 'orders from January 2024')\n- Multi-criteria searches",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query. For identifiers (IDs, codes, SKUs), use search_type='identifier'. For natural language, use search_type='query'."
                    },
                    "filename": {
                        "type": "string",
                        "description": "The EXACT name of the file to query as shown in the workbook structure (e.g., 'customers.csv', 'ice-cream.xlsx'). Must match exactly - check the workbook structure context first to verify the file exists."
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return. Only used for 'query' search type. Default: 5, max: 20. Ignored for 'identifier' search (always returns 1)."
                    },
                    "search_type": {
                        "type": "string",
                        "enum": ["identifier", "query"],
                        "description": "CRITICAL: Use 'identifier' for IDs/codes/SKUs (returns 1 exact match). Use 'query' for natural language questions (returns multiple matches). When in doubt about an alphanumeric code, use 'identifier'."
                    },
                    "prompt": {
                        "type": "string",
                        "description": "Your objective: what specific information you want to extract from the query results. This helps filter out noise and return only relevant data. Example: 'I need the customer's email address' or 'I want to know the product price'."
                    }
                },
                "required": ["query", "filename", "prompt"],
            },
        }
    }
    
    # Only include read_file_tool if explicitly requested (True by default for chat, False for enrichment)
    if include_read_file_tool:
        return [query_file_tool, read_file_tool]
    else:
        return [query_file_tool]


def get_available_files_context(workbook_id):
    """
    Get dynamic file list context for a workbook.
    
    This returns the DYNAMIC file list that should be added to user messages,
    not to tool definitions, to preserve tool caching.
    
    Args:
        workbook_id (str): UUID of the workbook to get files for
    
    Returns:
        str or None: Formatted file list or None if no files available
    """
    if not workbook_id:
        return None
    
    try:
        File = apps.get_model('core', 'File')
        # Query only processed and enabled files for the workbook
        files = File.objects.filter(workbook__uuid=workbook_id, use=True, is_processing=False)
        
        if files.exists():
            # Build a human-readable list of available files
            file_list = []
            for f in files:
                file_list.append(f"- {f.filename} (ID: {f.uuid}, Size: {f.calculated_size} bytes)")
            
            file_info = "\n".join(file_list)
            return f"Available files in this workbook:\n{file_info}\n"
        
        return None
    except Exception as e:
        print(f"Error loading files for context: {e}")
        return None


def get_sheet_tools():
    """
    Get tools for manipulating spreadsheet data in the UI.
    
    These tools allow the AI to:
    - Add rows to spreadsheets
    - Delete rows from spreadsheets
    - Add columns with optional AI enrichment prompts
    - Delete columns from spreadsheets
    - Populate specific cells with values
    
    Returns:
        list: List of tool definitions for spreadsheet operations
    """
    add_rows_tool = {
        "type": "function",
        "function": {
            "name": "tool_add_rows",
            "description": "Add one or more empty rows to the currently open spreadsheet. Use this when user asks to add rows, insert rows, or create new rows.",
            "parameters": {
                "type": "object",
                "properties": {
                    "count": {
                        "type": "integer",
                        "description": "The number of rows to add. Must be a positive integer.",
                        "minimum": 1
                    },
                    "position": {
                        "type": "string",
                        "description": "Where to add the rows: 'end' adds at bottom, 'beginning' adds at top",
                        "enum": ["end", "beginning"],
                        "default": "end"
                    }
                },
                "required": ["count"],
            },
        }
    }
    
    add_column_tool = {
        "type": "function",
        "function": {
            "name": "tool_add_column",
            "description": "Add one or more columns to the currently open spreadsheet. Each column must have a title and can optionally have a prompt/description for AI enrichment, data type, format instructions, and selection options. Use this when user asks to add columns, insert columns, or create new columns.",
            "parameters": {
                "type": "object",
                "properties": {
                    "columns": {
                        "type": "array",
                        "description": "Array of column objects to add. Each column must have a title and can include data type, prompt, format, and options.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {
                                    "type": "string",
                                    "description": "The column header/title that will be displayed."
                                },
                                "prompt": {
                                    "type": "string",
                                    "description": "Optional description or prompt for AI-assisted data enrichment in this column.",
                                    "default": ""
                                },
                                "type": {
                                    "type": "string",
                                    "description": "Data type for the column. Determines validation and input format.",
                                    "enum": ["text", "number", "checkbox", "select", "multiselect", "url", "email", "file"],
                                    "default": "text"
                                },
                                "format": {
                                    "type": "string",
                                    "description": "Optional formatting instruction for text or number columns (e.g., 'Twitter handle starting with @', 'Currency with 2 decimals'). Only applicable for 'text' and 'number' types.",
                                    "default": ""
                                },
                                "options": {
                                    "type": "array",
                                    "description": "Array of selection options. Required for 'select' and 'multiselect' types. Example: ['Option 1', 'Option 2', 'Option 3']",
                                    "items": {
                                        "type": "string"
                                    },
                                    "default": []
                                }
                            },
                            "required": ["title"]
                        },
                        "minItems": 1
                    },
                    "position": {
                        "type": "string",
                        "description": "Where to add the columns: 'end' adds at right, 'beginning' adds at left",
                        "enum": ["end", "beginning"],
                        "default": "end"
                    }
                },
                "required": ["columns"],
            },
        }
    }
    
    delete_rows_tool = {
        "type": "function",
        "function": {
            "name": "tool_delete_rows",
            "description": "Delete one or more rows from the currently open spreadsheet. Use this when user asks to delete rows, remove rows, or clear rows. You can specify row numbers (1-based) to delete.",
            "parameters": {
                "type": "object",
                "properties": {
                    "row_numbers": {
                        "type": "array",
                        "description": "Array of row numbers to delete. Row numbers are 1-based (first data row is 1). Example: [1, 3, 5] would delete rows 1, 3, and 5.",
                        "items": {
                            "type": "integer",
                            "minimum": 1
                        },
                        "minItems": 1
                    }
                },
                "required": ["row_numbers"],
            },
        }
    }
    
    delete_column_tool = {
        "type": "function",
        "function": {
            "name": "tool_delete_column",
            "description": "Delete one or more columns from the currently open spreadsheet. Use this when user asks to delete columns, remove columns, or clear columns. You can specify column names or positions to delete.",
            "parameters": {
                "type": "object",
                "properties": {
                    "columns": {
                        "type": "array",
                        "description": "Array of column names or positions to delete. Can be column titles (e.g., 'Product Name') or column letters (e.g., 'A', 'B', 'C'). Example: ['A', 'Product Name', 'C'] would delete columns A, Product Name, and C.",
                        "items": {
                            "type": "string"
                        },
                        "minItems": 1
                    }
                },
                "required": ["columns"],
            },
        }
    }
    
    # Tool for populating cells with validation requirements
    # NOTE: This tool has strict validation to prevent empty calls
    populate_cells_tool = {
        "type": "function",
        "function": {
            "name": "tool_populate_cells",
            "description": """Populate spreadsheet cells with specific values. You MUST provide the 'cells' parameter with at least one cell position and value.

CRITICAL: NEVER call this function with empty arguments {} or empty cells object {"cells": {}}. This will cause an error.

Format: {"cells": {"A1": "value1", "B2": "value2"}}
- Keys MUST be cell positions using Excel notation: column letter + row number (A1, B15, C3, etc.)
- Values are the cell contents as strings
- Row numbers start at 1 (first data row, after header row if present)

Examples of CORRECT usage:
1. Fill 3 cells: {"cells": {"A1": "India", "A2": "USA", "A3": "Brazil"}}
2. Fill multiple columns: {"cells": {"A1": "John", "B1": "100", "A2": "Jane", "B2": "150"}}
3. Update B24-B26: {"cells": {"B24": "22.00", "B25": "40.00", "B26": "28.00"}}
4. Single cell: {"cells": {"C5": "Complete"}}

Examples of INCORRECT usage (DO NOT DO THIS):
- {} - Missing cells parameter entirely
- {"cells": {}} - Empty cells object
- No arguments at all

If you need to populate cells, you must specify which cells and what values. If you're not ready to populate cells yet, do not call this function.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "cells": {
                        "type": "object",
                        "description": "Dictionary mapping cell positions (like 'A1', 'B15') to their values. REQUIRED and MUST contain at least one cell-value pair.",
                        "minProperties": 1,
                        "additionalProperties": {
                            "type": "string"
                        }
                    }
                },
                "required": ["cells"]
            }
        }
    }
    
    return [add_rows_tool, delete_rows_tool, add_column_tool, delete_column_tool, populate_cells_tool]


def assistant(message, conversation_obj=None, include_sheet_tools=False, workbook_id=None, sheet_context=None, model=settings.DEFAULT_AI_MODEL, include_read_file_tool=True):
    """
    AI assistant with optional conversation persistence, sheet tool support, and file access.
    
    This is the main entry point for AI interactions. It supports:
    - Multi-turn conversations with persistence
    - Tool calling (web search, file reading, spreadsheet manipulation)
    - Context awareness for spreadsheets and workbooks
    
    Args:
        message (str or None): User message string. Can be None if continuing from tool results
        conversation_obj (Conversation, optional): Django model instance for conversation persistence
        include_sheet_tools (bool): If True, includes sheet tools and returns tool calls for frontend execution
        workbook_id (str, optional): Workbook UUID to enable file access tools
        sheet_context (dict, optional): Dict with 'data' (sheet structure) and 'selection' (selected cells info)
        model (str, optional): AI model to use (e.g., 'gpt-5-nano', 'gpt-5', 'gemini-3-flash'). Defaults to settings.DEFAULT_AI_MODEL
        include_read_file_tool (bool): If True, includes tool_read_file tool. Defaults to True. Set to False for enrichment to restrict access.
    
    Returns:
        str or dict:
            - If include_sheet_tools=False: String response (legacy mode)
            - If include_sheet_tools=True: Dict with 'type' ('message' or 'tool_call'), 'content', optional 'tools'
    """
    print(f">>>>>>>>>>>>>>>>>> AI model: {model} <<<<<<<<<<<<<<<<<<")
    
    # Initialize conversation history from database or create new
    if conversation_obj:
        conversation = conversation_obj.conversations if conversation_obj.conversations else []
        if message:
            conversation.append({"role": "user", "content": message})
    else:
        # No persistence - start fresh conversation
        conversation = [{"role": "user", "content": message}]
    
    # Build STATIC system message for prompt caching
    # Only static instructions - no dynamic data that changes between requests
    static_system_message = None

    
    if sheet_context and include_sheet_tools:
        # THIS IS ONLY WHEN USING CHAT ASSISTANT
        # Build STATIC system message (instructions and constraints only - cacheable)
        static_system_message = "You are a spreadsheet assistant with access to tools for manipulating spreadsheet data.\n\n"
        static_system_message += "IMPORTANT TERMINOLOGY:\n"
        static_system_message += "- WORKBOOK: The main container/project (shown at the top of the UI). This is NOT a file you can query.\n"
        static_system_message += "- FILES: Uploaded documents (CSV, XLSX, PDF, etc.) in the Resources section. These ARE queryable using tool_query_file_data.\n"
        static_system_message += "- SHEETS: Spreadsheet tabs within the workbook. These are NOT files - use tool_get_sheet_data to view sheets.\n\n"
        static_system_message += "IMPORTANT CONSTRAINTS when populating cells:\n"
        static_system_message += "- For 'number' type columns: Provide ONLY numeric values (no text, no units)\n"
        static_system_message += "- For 'select' type columns: Choose EXACTLY ONE value from the specified options\n"
        static_system_message += "- For 'multiselect' type columns: Choose one or more values from the specified options, separated by commas\n"
        static_system_message += "- For 'checkbox' type columns: Use ONLY 'true' or 'false'\n"
        static_system_message += "- For 'email' type columns: Provide valid email addresses only\n"
        static_system_message += "- For 'url' type columns: Provide valid URLs only (starting with http:// or https://)\n"
        static_system_message += "- Respect the format specification if provided\n\n"
    elif workbook_id:
        # Workbook assistant mode
        static_system_message = "You are a workbook assistant with access to uploaded files.\n\n"
        static_system_message += "CRITICAL - UNDERSTAND THE TERMINOLOGY:\n"
        static_system_message += "- WORKBOOK: The main container/project that holds sheets and files. The workbook name is shown at the top of the UI.\n"
        static_system_message += "  → The workbook name is NOT a file. You CANNOT query the workbook name using tool_query_file_data.\n"
        static_system_message += "  → Example: If the workbook is named 'Experiment Book', this is the project name, NOT a file.\n\n"
        static_system_message += "- FILES: Uploaded documents (CSV, XLSX, PDF, DOCX, etc.) stored in the Resources section.\n"
        static_system_message += "  → These are listed in the 'WORKBOOK STRUCTURE' context under the '## Files' section.\n"
        static_system_message += "  → ONLY these files can be queried using tool_query_file_data.\n"
        static_system_message += "  → Example file names: 'companies.csv', 'customers.xlsx', 'report.pdf'\n\n"
        static_system_message += "- SHEETS: Spreadsheet tabs within the workbook (like Excel sheets).\n"
        static_system_message += "  → Listed under '## Sheets' in the workbook structure.\n"
        static_system_message += "  → Use tool_get_sheet_data to view sheet data, NOT tool_query_file_data.\n\n"
        static_system_message += "BEFORE querying a file, ALWAYS check the 'WORKBOOK STRUCTURE' context to verify the file exists and get its exact name.\n\n"
    else:
        # General assistant mode
        static_system_message = "You are an AI assistant.\n\n"

    # Append research protocol to all modes
    # static_system_message += research_protocol
    
    # Add sheet context - split into STATIC and DYNAMIC parts for better prompt caching
    # DYNAMIC parts go in user message (not cached, changes frequently)
    dynamic_context_parts = []
    
    if sheet_context and include_sheet_tools:
        # THIS IS ONLY WHEN USING CHAT ASSISTANT
        # Build DYNAMIC spreadsheet context (metadata only - actual data fetched via tool)
        if sheet_context.get('data'):
            sheet_data = sheet_context['data']
            columns = sheet_data.get('columns', [])
            rows = sheet_data.get('rows', [])
            
            # Get sheet identifier (name and UUID) from sheet_context
            sheet_name = sheet_context.get('name', 'Unknown Sheet')
            sheet_uuid = sheet_context.get('uuid', 'Unknown UUID')
            
            sheet_context_msg = f"Currently active sheet: {sheet_name} (UUID: {sheet_uuid})\n\n"
            sheet_context_msg += "Sheet structure:\n\n"
            
            # Build column information summary with type and format constraints
            column_info = []
            for c in columns:
                col_title = c.get('title', '')
                col_type = c.get('type', 'text')
                col_format = c.get('format', '')
                col_options = c.get('options', [])
                
                col_desc = f"{col_title} (Type: {col_type}"
                if col_format:
                    col_desc += f", Format: {col_format}"
                if col_type in ['select', 'multiselect'] and col_options:
                    col_desc += f", Options: {', '.join(col_options)}"
                col_desc += ")"
                column_info.append(col_desc)
            
            sheet_context_msg += f"Columns ({len(columns)}): {' | '.join(column_info)}\n\n"
            
            # Count non-empty rows for metadata
            non_empty_rows = 0
            for row in rows:
                # Check if row has at least one non-empty, non-null value
                has_data = any(cell not in [None, '', ' '] and str(cell).strip() != '' for cell in row)
                if has_data:
                    non_empty_rows += 1
            
            sheet_context_msg += f"Total Rows: {len(rows)}\n"
            sheet_context_msg += f"Rows with data: {non_empty_rows}\n\n"
            
            sheet_context_msg += f"Note: To view the actual data in this sheet, use tool_get_sheet_data with sheet_identifier='{sheet_uuid}'.\n"
            
            dynamic_context_parts.append(sheet_context_msg)
    
    # Add workbook structure and file context if working with workbooks
    if workbook_id:
        # Pre-load workbook structure (sheets + files) to avoid tool call latency
        workbook_structure = tool_get_workbook_structure(workbook_id=workbook_id)
        if workbook_structure and not workbook_structure.startswith('Error:'):
            structure_context = "WORKBOOK STRUCTURE:\n" + workbook_structure + "\n"
            dynamic_context_parts.append(structure_context)
        
        # Add file context (legacy, but kept for compatibility)
        files_context = get_available_files_context(workbook_id)
        if files_context:
            dynamic_context_parts.append(files_context)
        
    # Insert STATIC system message at the beginning if not already present
    # This will be cached by the AI provider since it doesn't change
    if static_system_message and (len(conversation) == 0 or conversation[0].get('role') != 'system'):
        conversation.insert(0, {"role": "system", "content": static_system_message})
    
    # Combine all dynamic context parts
    if dynamic_context_parts:
        combined_dynamic_context = "\n\n".join(dynamic_context_parts)
        
        # Prepend DYNAMIC context to the first user message (or create a new user message)
        # This ensures the data is available but doesn't break caching of the system message
        # Find the first user message in the conversation
        first_user_idx = None
        for idx, msg in enumerate(conversation):
            if msg.get('role') == 'user':
                first_user_idx = idx
                break
        
        if first_user_idx is not None:
            # Prepend context to the first user message
            original_content = conversation[first_user_idx].get('content', '')
            conversation[first_user_idx]['content'] = f"{combined_dynamic_context}\n\nUser request: {original_content}"
        else:
            # No user message found, insert one after system message
            insert_position = 1 if conversation and conversation[0].get('role') == 'system' else 0
            conversation.insert(insert_position, {"role": "user", "content": combined_dynamic_context})
    

    # Dynamically select tools based on context and mode (STATIC - for caching)
    # Base tools (search, web scraping) are always available
    tools = get_ai_tools()
    
    # Add MCP tools (Model Context Protocol integrations)
    mcp_tools = get_mcp_tools()
    if mcp_tools:
        tools = mcp_tools + tools
        print(f"MCP: Loaded {len(mcp_tools)} MCP tool(s)")
    
    # Add sheet manipulation tools if working with spreadsheets
    if include_sheet_tools:
        tools = get_sheet_tools() + tools
    
    # Add workbook structure and sheet viewing tools if working with workbooks
    if workbook_id:
        tools = get_workbook_tools() + tools
    
    # Add file reading tools if working with workbooks (STATIC - no dynamic file list in tools)
    # Note: read_file_tool is only available in chat mode (include_read_file_tool=True)
    if workbook_id:
        file_tools = get_file_tools(include_read_file_tool=include_read_file_tool)
        tools = file_tools + tools
    
    # Define tool categories for routing execution
    # Sheet tools modify spreadsheet UI (handled by frontend)
    sheet_tool_names = {'tool_add_rows', 'tool_delete_rows', 'tool_add_column', 'tool_delete_column', 'tool_populate_cells'}
    # File and workbook tools read content (handled by backend)
    file_tool_names = {'tool_query_file_data', 'tool_get_sheet_data'}  # Workbook structure is pre-loaded, not a tool
    # Frontend tools require UI updates (sent back to client)
    frontend_tool_names = {'tool_add_rows', 'tool_delete_rows', 'tool_add_column', 'tool_delete_column', 'tool_populate_cells'}
    # MCP tools are handled by backend (async execution)
    mcp_tool_names = {tool['function']['name'] for tool in mcp_tools if tool['function']['name'].startswith('mcp_')}
    
    # Debug logging
    print(conversation)
    print(f"Using tools: {[tool['function']['name'] for tool in tools]}")
    
    # Enable prompt caching for better performance and cost reduction
    # Different providers handle caching differently:
    # - OpenAI: Automatic for 1024+ tokens (no parameter needed)
    # - Anthropic: Requires cache_control blocks on messages
    # - Gemini: Implicit caching enabled by default
    # - Deepseek: Works like OpenAI (automatic)
    
    # For Anthropic models, add cache_control to system messages
    # This is done by modifying the message content structure
    if 'anthropic' in model.lower() or 'claude' in model.lower():
        for msg in conversation:
            if msg.get('role') == 'system':
                # Anthropic requires cache_control on the last content block
                content = msg.get('content')
                if isinstance(content, str):
                    # Convert string content to list format with cache_control
                    msg['content'] = [
                        {
                            "type": "text",
                            "text": content,
                            "cache_control": {"type": "ephemeral"}
                        }
                    ]
                elif isinstance(content, list) and len(content) > 0:
                    # Add cache_control to the last content block
                    msg['content'][-1]['cache_control'] = {"type": "ephemeral"}
                break  # Only cache the first system message
    
    # Trim conversation to prevent token overflow and control costs
    # This keeps the most recent messages while preserving system messages
    conversation = trim_conversation(conversation, max_messages=MAX_CONVERSATION_MESSAGES)
    
    # Prepare completion parameters
    completion_params = {
        "model": model,
        "messages": conversation,
        "tools": tools,
        "tool_choice": "auto",  # Let model decide when to use tools
        # "max_tokens": AI_MAX_TOKENS,
    }

    # Inject per-user provider API key from DB (and enforce enabled/has_key)
    provider, api_key, access_error = _get_provider_access(workbook_id, model)
    if provider in {'openai', 'gemini', 'anthropic'} and access_error in {'missing', 'disabled'}:
        if access_error == 'disabled':
            error_message = (
                f"The '{provider}' provider is disabled. Enable it in Settings → Model Providers (and make sure an API key is set)."
            )
        else:
            error_message = (
                f"No API key found for '{provider}'. Add your API key in Settings → Model Providers to use this model."
            )

        if conversation_obj:
            conversation.append({"role": "assistant", "content": error_message})
            conversation_obj.conversations = conversation
            conversation_obj.save()

        if include_sheet_tools:
            return {
                'type': 'message',
                'content': error_message,
                'conversation_id': str(conversation_obj.uuid) if conversation_obj else None
            }
        return error_message

    if api_key:
        completion_params['api_key'] = api_key
    # For Gemini models, add reasoning_effort parameter
    if 'gemini' in model.lower():
        completion_params['reasoning_effort'] = 'low'  # low or 'medium', 'high
    # completion_params['temperature'] = 1.0  # REQUIRED for Gemini 3
    # Main conversation loop - continues until AI decides no more tool calls needed
    # Safety: Limit iterations to prevent infinite tool calling loops
    tool_iteration_count = 0
    
    while True:
        try:
            # Check if we've exceeded maximum tool iterations
            if tool_iteration_count >= MAX_TOOL_ITERATIONS:
                print(f"WARNING: Reached maximum tool iterations ({MAX_TOOL_ITERATIONS}). Stopping to prevent runaway costs.")
                # Force a final response from the AI
                error_message = f"I've reached the maximum number of tool calls ({MAX_TOOL_ITERATIONS} iterations) to prevent excessive processing. Please refine your request or break it into smaller tasks."
                
                conversation.append({
                    "role": "assistant",
                    "content": error_message
                })
                
                if conversation_obj:
                    conversation_obj.conversations = conversation
                    conversation_obj.save()
                
                if include_sheet_tools:
                    return {
                        'type': 'message',
                        'content': error_message,
                        'conversation_id': str(conversation_obj.uuid) if conversation_obj else None
                    }
                else:
                    return error_message
            
            print(f"Generating AI response... (iteration {tool_iteration_count + 1}/{MAX_TOOL_ITERATIONS})")
            # print("Current conversation:")
            # print(conversation)
            # Call LiteLLM with full conversation history and available tools
            # Model decides whether to respond directly or call tools
            import litellm
            response = litellm.completion(**completion_params)
            
            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls
            
            # Process tool calls if AI decided to use tools
            if tool_calls:
                # Safety check: Limit number of tools per turn
                if len(tool_calls) > MAX_TOOLS_PER_TURN:
                    print(f"WARNING: AI requested {len(tool_calls)} tools, limiting to {MAX_TOOLS_PER_TURN}")
                    tool_calls = tool_calls[:MAX_TOOLS_PER_TURN]
                
                # Increment iteration counter
                tool_iteration_count += 1
                # Add assistant's response to conversation history
                # This preserves the tool calling decision for context
               
                conversation.append(response_message.model_dump())
                
                # Separate tools by execution location
                # Frontend tools: UI manipulation (executed by React)
                # Backend tools: Data fetching, web scraping (executed here)
                frontend_tools = []
                backend_tools = []
                
                # Process each tool call requested by the AI
                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    # Debug output for tool call tracking
                    print(f">>>>>>>>>>>>>>>>>>>: Tool call - {function_name} arguments: {function_args}")
                    
                    # Validate tool arguments before processing
                    # This prevents errors from malformed AI responses
                    validation_error = None
                    
                    # Validate populate_cells tool (strict validation due to common AI errors)
                    if function_name == 'tool_populate_cells':
                        if 'cells' not in function_args:
                            validation_error = "Missing required parameter 'cells'. You must provide a cells object with at least one cell position and value. Example: {\"cells\": {\"A1\": \"value\", \"B2\": \"value2\"}}"
                        elif not function_args['cells'] or not isinstance(function_args['cells'], dict):
                            validation_error = "Parameter 'cells' must be a non-empty object/dictionary with cell positions as keys. Example: {\"cells\": {\"A1\": \"value\", \"B2\": \"value2\"}}"
                        elif len(function_args['cells']) == 0:
                            validation_error = "Parameter 'cells' is empty. You must provide at least one cell entry. Example: {\"cells\": {\"A1\": \"value\", \"B2\": \"value2\"}}"
                    
                    # Validate add_rows tool
                    elif function_name == 'tool_add_rows':
                        if 'count' not in function_args:
                            validation_error = "Missing required parameter 'count'"
                    
                    # Validate delete_rows tool
                    elif function_name == 'tool_delete_rows':
                        if 'row_numbers' not in function_args:
                            validation_error = "Missing required parameter 'row_numbers'"
                        elif not function_args['row_numbers'] or not isinstance(function_args['row_numbers'], list):
                            validation_error = "Parameter 'row_numbers' must be a non-empty array of row numbers. Example: {\"row_numbers\": [1, 2, 3]}"
                        elif len(function_args['row_numbers']) == 0:
                            validation_error = "Parameter 'row_numbers' is empty. You must provide at least one row number to delete. Example: {\"row_numbers\": [1, 2, 3]}"
                    
                    # Validate delete_column tool
                    elif function_name == 'tool_delete_column':
                        if 'columns' not in function_args:
                            validation_error = "Missing required parameter 'columns'"
                        elif not function_args['columns'] or not isinstance(function_args['columns'], list):
                            validation_error = "Parameter 'columns' must be a non-empty array of column identifiers. Example: {\"columns\": ['A', 'Product Name']}"
                        elif len(function_args['columns']) == 0:
                            validation_error = "Parameter 'columns' is empty. You must provide at least one column to delete. Example: {\"columns\": ['A', 'Product Name']}"
                    
                    # Validate add_column tool
                    elif function_name == 'tool_add_column':
                        if 'columns' not in function_args:
                            validation_error = "Missing required parameter 'columns'"
                        elif not function_args['columns'] or len(function_args['columns']) == 0:
                            validation_error = "Parameter 'columns' must contain at least one column"
                    
                    # If validation failed, add error to conversation immediately
                    # This allows the AI to see the error and potentially retry with correct args
                    if validation_error:
                        print(f"VALIDATION ERROR: {validation_error}")
                        conversation.append({
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": function_name,
                            "content": f"ERROR: {validation_error}"
                        })
                        continue  # Skip this tool call, move to next
                    
                    # Package tool information for execution
                    tool_info = {
                        "id": tool_call.id,
                        "name": function_name,
                        "arguments": function_args
                    }
                    
                    # Route tool to appropriate execution location
                    # Sheet tools: Only frontend-handled when in sheet mode
                    # File tools: Always backend-handled
                    # Other tools: Backend-handled (search, scraping)
                    if include_sheet_tools and function_name in sheet_tool_names:
                        frontend_tools.append(tool_info)
                    else:
                        backend_tools.append(tool_info)
                
                # Execute backend tools (file reading, web scraping, MCP tools, etc.)
                for tool_info in backend_tools:
                    # print(f"Executing backend tool: {tool_info['name']} with arguments: {tool_info['arguments']}")
                    
                    try:
                        # Inject workbook_id for file tools that need context
                        # This ensures file access is scoped to the current workbook
                        if tool_info['name'] in file_tool_names and workbook_id:
                            tool_info['arguments']['workbook_id'] = workbook_id
                        
                        # Execute MCP tools (async execution required)
                        if tool_info['name'] in mcp_tool_names:
                            print(f"Executing MCP tool: {tool_info['name']}")
                            tool_result = asyncio.run(execute_mcp_tool(tool_info['name'], tool_info['arguments']))
                        else:
                            # Execute standard tool function by name lookup
                            tool_result = globals()[tool_info['name']](**tool_info['arguments'])

                        # print(f"Tool result for {tool_info['name']}: {tool_result}")
                        
                        # Add tool result to conversation for AI to process
                        conversation.append({
                            "tool_call_id": tool_info['id'],
                            "role": "tool",
                            "name": tool_info['name'],
                            "content": str(tool_result)
                        })
                    except Exception as e:
                        # Add error to conversation so AI can handle gracefully
                        conversation.append({
                            "tool_call_id": tool_info['id'],
                            "role": "tool",
                            "name": tool_info['name'],
                            "content": f"Error: {str(e)}"
                        })
                
                # Persist conversation state to database if enabled
                # This allows resuming conversations across requests
                if conversation_obj:
                    conversation_obj.conversations = conversation
                    conversation_obj.save()
                
                # If there are frontend tools, return them for client-side execution
                # The frontend will execute these and send results back
                if frontend_tools:
                    return {
                        'type': 'tool_call',
                        'tools': frontend_tools,
                        'conversation_id': str(conversation_obj.uuid) if conversation_obj else None
                    }
                
                # Continue the loop to let AI process backend tool results
                # Loop will iterate and generate next response based on tool results
            else:
                # No tool calls - AI has generated final response
                print("No more function calls needed.")
                final_content = response_message.content
                print(final_content)
                
                # Add final assistant message to conversation history
                conversation.append({
                    "role": "assistant",
                    "content": final_content
                })
                
                # Persist final conversation state
                if conversation_obj:
                    conversation_obj.conversations = conversation
                    conversation_obj.save()
                
                # Return response in appropriate format based on mode
                if include_sheet_tools:
                    # Sheet mode: Return structured dict with metadata
                    return {
                        'type': 'message',
                        'content': final_content.strip() if final_content else "",
                        'conversation_id': str(conversation_obj.uuid) if conversation_obj else None
                    }
                else:
                    # Legacy mode: Return plain string
                    return final_content.strip() if final_content else ""

        except Exception as e:
            # Handle API errors with retry logic for rate limits
            exception_code = e.code if hasattr(e, 'code') else None
            if exception_code == 429:
                # Rate limit hit - wait and retry
                print(f"Rate limit exceeded: {e}")
                time.sleep(1)
            else:
                # Unknown error - propagate to caller
                print(f"An unexpected error occurred: {e}")
                raise
 
 





def enrichment(data, workbook_id=None, model=settings.DEFAULT_AI_MODEL, return_metadata=False):
    """
    Enrich a spreadsheet cell using AI based on context from other cells.
    
    Uses AI to infer missing data based on surrounding cell values and column descriptions.
    Can access uploaded workbooks for additional context.
    
    Args:
        data (dict): Enrichment request with keys:
            - 'context' (dict): Surrounding cell values (e.g., {'Product Name': 'Zendesk'})
            - 'position' (dict): Cell location (e.g., {'Row': '0', 'Column': '1'})
            - 'title' (str): Column title/name
            - 'description' (str): Column description or prompt
            - 'value' (str): Current cell value (usually empty)
            - 'type' (str, optional): Data type (text, number, select, multiselect, etc.)
            - 'format' (str, optional): Format specification
            - 'options' (list, optional): Available options for select/multiselect types
        workbook_id (str, optional): Workbook UUID for file access
        model (str, optional): AI model to use. Defaults to settings.DEFAULT_AI_MODEL
        return_metadata (bool, optional): If True, returns dict with value and metadata. Defaults to False.
    
    Returns:
        str or dict: 
            - If return_metadata=False: AI-generated enrichment value (max 5 words)
            - If return_metadata=True: Dict with 'value', 'tools_used', 'source_files'
    
    Example data format:
        {
            'context': {'Product Name': 'Zendesk'}, 
            'position': {'Row': '0', 'Column': '1'}, 
            'title': 'Product Category', 
            'description': 'Category of the Product', 
            'value': '',
            'type': 'select',
            'options': ['Software', 'Hardware', 'Services']
        }
    """
    from datetime import datetime
    
    print(f">>>>>>>>>>>>>>>>>> AI model: {model} <<<<<<<<<<<<<<<<<<")
    
    # Initialize metadata tracking
    tools_used = []
    source_files = []
    source_links = []
    
    # Build enrichment prompt with context
    prompt = f"Given the context: {data['context']}, what is the {data['title']}? The description is: {data['description']}."
    
    # Add data type and format constraints to the prompt
    data_type = data.get('type', 'text')
    data_format = data.get('format', '')
    options = data.get('options', [])
    
    # Add type-specific instructions
    if data_type == 'number':
        prompt += " Provide ONLY a numeric value (no text, no units, no explanation)."
        if data_format:
            prompt += f" Format: {data_format}."
    elif data_type in ['select', 'multiselect']:
        if options and len(options) > 0:
            options_str = ', '.join(options)
            if data_type == 'select':
                prompt += f" You MUST choose EXACTLY ONE option from this list: [{options_str}]. Respond with ONLY the option value, no explanation, no additional text."
            else:  # multiselect
                prompt += f" You MUST choose one or more options from this list: [{options_str}]. Separate multiple values with commas. Respond with ONLY the option values, no explanation, no additional text."
        else:
            prompt += f" Provide ONLY the {data_type} value, no explanation."
    elif data_type == 'checkbox':
        prompt += " Respond with ONLY 'true' or 'false' (no other text, no explanation)."
    elif data_type == 'email':
        prompt += " Provide ONLY a valid email address (no explanation)."
    elif data_type == 'url':
        prompt += " Provide ONLY a valid URL (starting with http:// or https://, no explanation)."
    else:  # text or other types
        prompt += " Provide ONLY a concise and very short answer. Max 5 words. No explanation or additional text."
        if data_format:
            prompt += f" Format: {data_format}."
    
    # Critical instruction to ensure only the value is returned
    prompt += "\n\nIMPORTANT: Your response must contain ONLY the value itself. Do not include any explanations, sentences, or additional context. Just the bare value."
    
    # Enable file access if workbook is available
    if workbook_id:
        prompt += " You have access to uploaded files that may contain relevant information. Use tool_query_file_data to search within files if needed."
        prompt += "\n\n🚨 CRITICAL: Before calling tool_query_file_data, you MUST check the 'WORKBOOK STRUCTURE' context to verify which files exist. Look for the '## Files' section. If no files are listed, DO NOT call the tool. If files exist, use the EXACT filename shown (e.g., 'customers.csv'). DO NOT guess or make up filenames like 'companies.csv' if they don't appear in the structure. Guessing will cause errors."

    # prompt += """
    # RESEARCH PROTOCOL - When to Use Tools:

    # QUERY FILES FIRST (tool_query_file_data) when:
    # - Files are available in the workbook (listed above)
    # - The context contains identifiers, codes, names, or keys that may be in the files
    # - You need additional details beyond what's in the row context
    # - The enrichment requires information that typically comes from documents
    # - Use search_type='identifier' for exact ID/code lookups, 'query' for semantic searches

    # WEB SEARCH (tool_search + tool_web_scraper) when:
    # - Information about current/recent events, prices, news, or people
    # - Verifying facts that change over time (positions, policies, status)
    # - Looking up entities or terms not in your training data
    # - No relevant files exist OR file search returned nothing useful

    # SKIP ALL SEARCHES when:
    # - The answer is explicitly stated in the row context
    # - Simple logic or calculation is sufficient
    # - You have reliable training knowledge (historical facts, definitions)

    # SEARCH GUIDELINES:
    # 1. Prioritize file queries over web searches when files are available
    # 2. For files: Search relevant file UUIDs if known, or omit file_ids to search all
    # 3. For web: Use 1-5 targeted keywords, scrape authoritative sources first
    # 4. Limits: Max 3-4 web searches and 3 scrapes per enrichment
    # 5. If nothing found after proper research, respond: "Not found"
    # """
    
    # Create a temporary conversation for enrichment tracking
    Conversation = apps.get_model('core', 'Conversation')
    Workbook = apps.get_model('core', 'Workbook')
    
    temp_conversation = None
    if workbook_id and return_metadata:
        try:
            workbook = Workbook.objects.get(uuid=workbook_id)
            # Create temporary conversation to capture tool usage
            temp_conversation = Conversation.objects.create(
                workbook=workbook,
                title=f"Enrichment - {data.get('title', 'Unknown')}",
                conversations=[]
            )
        except Exception as e:
            print(f"Warning: Could not create temp conversation: {e}")
    
    # Use AI assistant to generate enrichment value
    # include_read_file_tool=False restricts enrichment from accessing tool_read_file
    result = assistant(prompt, conversation_obj=temp_conversation, workbook_id=workbook_id, model=model, include_read_file_tool=False)
    print(f"Enrichment result: {result}")
    
    # Extract tool usage metadata from conversation if enabled
    if return_metadata and temp_conversation:
        try:
            temp_conversation.refresh_from_db()
            conversation_history = temp_conversation.conversations or []
            
            # Extract tool calls and their results from conversation
            tool_call_map = {}  # Map tool_call_id to tool info
            
            for msg in conversation_history:
                # Look for assistant messages with tool_calls
                if msg.get('role') == 'assistant' and msg.get('tool_calls'):
                    for tc in msg['tool_calls']:
                        tool_call_id = tc.get('id', '')
                        tool_name = tc.get('function', {}).get('name', '')
                        tool_args = tc.get('function', {}).get('arguments', '{}')

                        # Parse arguments
                        try:
                            import json
                            args_dict = json.loads(tool_args) if isinstance(tool_args, str) else tool_args
                        except:
                            args_dict = {}
                        
                        # Store tool call info
                        tool_call_map[tool_call_id] = {
                            'name': tool_name,
                            'args': args_dict,
                            'summary': None  # Will be filled from tool response
                        }
                
                # Look for tool messages with results
                elif msg.get('role') == 'tool':
                    tool_call_id = msg.get('tool_call_id', '')
                    tool_content = msg.get('content', '')
                    
                    # Map the result to the tool call
                    if tool_call_id in tool_call_map:
                        # For tool_query_file_data, the content IS the filtered summary
                        tool_call_map[tool_call_id]['summary'] = tool_content
            
            # Build tools_used list with summaries
            for tool_call_id, tool_info in tool_call_map.items():
                tool_name = tool_info['name']
                args_dict = tool_info['args']
                tool_summary = tool_info['summary'] or "No summary available"
                
                # Track source files and links
                if tool_name == 'tool_query_file_data':
                    filename = args_dict.get('filename', '')
                    # Add to source files list
                    if filename and filename not in source_files:
                        source_files.append(filename)

                elif tool_name == 'tool_web_scraper':
                    url = args_dict.get('url', '')
                    # Add to source links list
                    if url and url not in source_links:
                        source_links.append(url)

                # Add to tools_used list with summary from actual tool result
                tools_used.append({
                    "tool": tool_name,
                    "args": args_dict,
                    "summary": tool_summary
                })
            
            # Clean up temporary conversation
            temp_conversation.delete()
        except Exception as e:
            print(f"Warning: Could not extract tool metadata: {e}")
    
    # Post-process result to extract just the value if AI still includes explanation
    # This is a safety net in case the AI doesn't follow instructions perfectly
    if result and isinstance(result, str):
        # Remove common prefixes and clean up the response
        result = result.strip()
        
        # For select/multiselect types, try to extract the option from quotes or end of sentence
        if data_type in ['select', 'multiselect'] and options:
            # Check if any option appears in the result
            for option in options:
                if option.lower() in result.lower():
                    # Return the exact option (preserving case)
                    return option
        
        # Try to extract value from common patterns like "The answer is X" or "X is the answer"
        # Look for quoted values
        import re
        quoted_match = re.search(r'"([^"]+)"', result)
        if quoted_match:
            return quoted_match.group(1)
        
        # Look for patterns like "is X" at the end
        is_match = re.search(r'is\s+"?([^."]+)"?\.?$', result, re.IGNORECASE)
        if is_match:
            return is_match.group(1).strip()
    
    # Return result with metadata if requested
    if return_metadata:
        return {
            'value': result,
            'tools_used': tools_used,
            'source_files': source_files,
            'source_links': source_links
        }
    
    return result


def test_assistant():
    """
    Test function for image analysis capabilities.
    
    NOTE: This is a development/testing function.
    
    Returns:
        str: AI response describing the image
    """
    prompt = "What is in the image?"
    image_path = "R:\\Projects\\DataFactory\\core\\handlers\\image.jpg"
    img = Image.open(image_path)

    # Convert image to bytes for AI processing
    img_byte_arr = BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_bytes = img_byte_arr.getvalue()

    # Format data for multimodal AI input
    data = [
        {"inlineData": {"mimeType": "image/jpeg", "data": img_bytes}}, 
        "What is in this image?"
    ]
    response = assistant(data)

    print(f"Assistant response: {response}")
    return response


def tool_search(keyword):
    """
    Search Google for a keyword and return scraped results.
    
    Args:
        keyword (str): Search term
    
    Returns:
        str: JSON string containing list of search results with title, href, and body
    """
    results = DDGS().text(keyword, region='in-en', safesearch='off', backend="auto")
    
    # Filter results to only include title, href, and body (snippet)
    filtered_results = []
    for result in results:
        filtered_results.append({
            'title': result.get('title', ''),
            'href': result.get('href', ''),
            'body': result.get('body', '')
        })
    
    # Return as JSON string so frontend can parse and display as chips
    return json.dumps(filtered_results)


def tool_web_scraper(url, prompt):
    """
    Scrape a webpage with AI-filtered results.
    
    This tool performs a two-step process:
    1. Crawls the webpage and extracts markdown content
    2. Uses a secondary AI call to filter content based on the main AI's objective (prompt)
    
    When the target information is not found on the page, it returns an explanatory description
    of what the page actually discusses, helping the AI understand why this source wasn't useful.
    
    Args:
        url (str): Website URL to scrape
        prompt (str): Main AI's objective - what specific information to extract from webpage
    
    Returns:
        str: AI-filtered result with either:
          - The extracted answer if found, or
          - An explanation of what the page discusses if the target info is missing
    """
    try:
        # Get raw markdown content from crawler
        raw_content = crawler(url, prompt)
        
        # Use reusable AI filter with explanatory context enabled
        # This provides details about page content when target info isn't found
        return ai_filter_result(raw_content, prompt, source_type="webpage content", return_full_context=True)
        
    except Exception as e:
        return f"Error scraping webpage: {str(e)}"

async def _async_crawler(url, prompt):
    """
    Internal async function to crawl a webpage using crawl4ai.
    
    Args:
        url (str): URL to crawl
    
    Returns:
        CrawlResult: Result object with markdown content
    """
    async with AsyncWebCrawler() as crawler:
 
        if prompt is None or prompt.strip() == "":
            md_generator = DefaultMarkdownGenerator(
                content_filter=PruningContentFilter()
            )
        else:    
            md_generator = DefaultMarkdownGenerator(
                content_filter=BM25ContentFilter(
                    user_query=prompt,
                    bm25_threshold=1.2,
                    language="english"
                ),
                options={"ignore_links": True}
            )
        
        config = CrawlerRunConfig(markdown_generator=md_generator)

        return await crawler.arun(
            url=url,
            config=config
        )


def crawler(url, prompt):
    """
    Synchronous wrapper for async web crawler.

    Scrapes a webpage and converts content to markdown format.

    Args:
        url (str): URL to crawl

    Returns:
        str: Raw markdown content from the webpage
    """
    # Configure Windows event loop to support subprocess operations
    # This fixes NotImplementedError on Windows platforms
    configure_windows_event_loop()

    try:
        # Try to use existing event loop if one is running
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No running loop, create a new one
        loop = None

    try:
        if loop is not None:
            # If we're in an async context, we can't use asyncio.run()
            # This shouldn't normally happen since crawler() is called synchronously
            raise RuntimeError("Cannot use crawler in an async context")

        result = asyncio.run(_async_crawler(url, prompt))
        
        # Validate result structure
        if result is None:
            raise Exception("Crawler returned None - possibly due to network issues or invalid URL")
        
        if not hasattr(result, 'markdown') or result.markdown is None:
            raise Exception("Crawler result missing markdown content")
        
        if not hasattr(result.markdown, 'raw_markdown'):
            raise Exception("Crawler markdown result missing raw_markdown property")
        
        return result.markdown.fit_markdown
    except Exception as e:
        # Provide clear error message for debugging
        error_msg = str(e) if str(e) else f"{type(e).__name__}: Unable to crawl webpage"
        raise Exception(f"Web crawler failed: {error_msg}")


def tool_read_file(file_id, workbook_id=None):
    """
    Read the extracted markdown content of a specific file from the database.
    
    This tool is called by the AI to access uploaded workbook content.
    If the file is in processing state or has no extracted content, it will force extract immediately.
    
    Args:
        file_id (str): UUID of the file to read
        workbook_id (str, optional): Workbook UUID for access validation
    
    Returns:
        str: Extracted markdown content or error message
    """
    try:
        File = apps.get_model('core', 'File')
        
        # Fetch the file by UUID from database
        file_obj = File.objects.get(uuid=file_id)
        
        # Security check: Verify file belongs to the workbook (if workbook_id provided)
        if workbook_id and str(file_obj.workbook.uuid) != str(workbook_id):
            return "Error: File does not belong to the current workbook."
        
        if not file_obj.use:
            return "Error: This file is not available for use."
        
        # Force extract if file is processing or has no content
        if file_obj.is_processing or not file_obj.extracted_content:
            try:
                from core.handlers.extraction import extract_file_content
                
                print(f"Force extracting content for file: {file_obj.filename}")
                
                # Extract content immediately
                content = extract_file_content(file_obj)
                
                # Update database
                file_obj.extracted_content = content
                file_obj.is_processing = False
                file_obj.save()
                
                print(f"✓ Successfully extracted content for: {file_obj.filename}")
                
                return content
                
            except Exception as extraction_error:
                error_msg = f"Error during extraction: {str(extraction_error)}"
                print(f"✗ {error_msg}")
                
                # Mark as not processing and save error
                file_obj.is_processing = False
                file_obj.extracted_content = error_msg
                file_obj.save()
                
                return error_msg
        
        # Return the extracted content if available
        return file_obj.extracted_content
    
    except File.DoesNotExist:
        return f"Error: File with ID {file_id} not found."
    except Exception as e:
        return f"Error reading file: {str(e)}"


def tool_get_workbook_structure(workbook_id=None, format='md'):
    """
    Get complete workbook structure including all sheets and files.
    
    Returns a comprehensive overview of:
    - All available sheets (names and UUIDs)
    - All uploaded files organized in folder tree structure
    
    Args:
        workbook_id (str, optional): Workbook UUID for access
        format (str, optional): Output format - 'md' for markdown (default) or 'json' for JSON
    
    Returns:
        str: Workbook structure in requested format (markdown or JSON)
    """
    try:
        Workbook = apps.get_model('core', 'Workbook')
        Sheet = apps.get_model('core', 'Sheet')
        File = apps.get_model('core', 'File')
        Folder = apps.get_model('core', 'Folder')
        
        if not workbook_id:
            return "Error: Workbook ID is required."
        
        # Get the workbook
        workbook = Workbook.objects.get(uuid=workbook_id)
        
        # Get data
        sheets = Sheet.objects.filter(workbook=workbook).order_by('created_at')
        files = File.objects.filter(workbook=workbook, use=True)
        folders = Folder.objects.filter(workbook=workbook)
        
        if format.lower() == 'json':
            # Return JSON format
            structure = {
                "workbook_name": workbook.name,
                "sheets": [],
                "files": {
                    "root": [],
                    "folders": {}
                }
            }
            
            for sheet in sheets:
                row_count = len(sheet.data.get('rows', [])) if sheet.data else 0
                col_count = len(sheet.data.get('columns', [])) if sheet.data else 0
                
                structure["sheets"].append({
                    "name": sheet.name,
                    "uuid": str(sheet.uuid),
                    "rows": row_count,
                    "columns": col_count
                })
            
            for folder in folders:
                structure["files"]["folders"][folder.name] = {
                    "uuid": str(folder.uuid),
                    "files": []
                }
            
            for file in files:
                file_info = {
                    "name": file.filename,
                    "uuid": str(file.uuid),
                    "size": file.calculated_size,
                    "processing": file.is_processing
                }
                
                if file.folder:
                    folder_name = file.folder.name
                    if folder_name in structure["files"]["folders"]:
                        structure["files"]["folders"][folder_name]["files"].append(file_info)
                else:
                    structure["files"]["root"].append(file_info)
            
            return json.dumps(structure, indent=2)
        else:
            # Return markdown format (default)
            md = f"# {workbook.name}\n\n"
            
            # Add sheets section
            if sheets.exists():
                md += "## Sheets\n\n"
                for sheet in sheets:
                    row_count = len(sheet.data.get('rows', [])) if sheet.data else 0
                    col_count = len(sheet.data.get('columns', [])) if sheet.data else 0
                    md += f"- **{sheet.name}** ({col_count} columns × {row_count} rows)\n"
                md += "\n"
            
            # Add files section
            if files.exists() or folders.exists():
                md += "## Files\n\n"
                
                # Add folders
                for folder in folders.order_by('name'):
                    folder_files = files.filter(folder=folder)
                    if folder_files.exists():
                        md += f"### {folder.name}/\n\n"
                        for file in folder_files.order_by('filename'):
                            status = "⏳ processing" if file.is_processing else "✓"
                            md += f"- {file.filename} (UUID: `{file.uuid}`, {file.calculated_size} KB) {status}\n"
                        md += "\n"
                
                # Add root files
                root_files = files.filter(folder__isnull=True)
                if root_files.exists():
                    for file in root_files.order_by('filename'):
                        status = "⏳ processing" if file.is_processing else "✓"
                        md += f"- {file.filename} (UUID: `{file.uuid}`, {file.calculated_size} KB) {status}\n"
            
            return md.rstrip()
        
    except Workbook.DoesNotExist:
        return f"Error: Workbook with ID {workbook_id} not found."
    except Exception as e:
        import traceback
        traceback.print_exc()
        return f"Error getting workbook structure: {str(e)}"


def tool_get_sheet_data(sheet_identifier, max_rows=50, workbook_id=None):
    """
    View data from a specific sheet by name or UUID.
    
    Returns the sheet's column structure and row data.
    
    Args:
        sheet_identifier (str): Sheet name or UUID
        max_rows (int, optional): Maximum rows to return (default: 50, max: 200)
        workbook_id (str, optional): Workbook UUID for access validation
    
    Returns:
        str: Formatted sheet data or error message
    """
    try:
        Workbook = apps.get_model('core', 'Workbook')
        Sheet = apps.get_model('core', 'Sheet')
        
        if not workbook_id:
            return "Error: Workbook ID is required."
        
        # Validate max_rows
        max_rows = min(max(1, max_rows), 200)
        
        # Get the workbook
        workbook = Workbook.objects.get(uuid=workbook_id)
        
        # Try to find sheet by UUID first, then by name
        try:
            sheet = Sheet.objects.get(uuid=sheet_identifier, workbook=workbook)
        except Sheet.DoesNotExist:
            # Try by name
            sheet = Sheet.objects.filter(name=sheet_identifier, workbook=workbook).first()
            if not sheet:
                return f"Error: Sheet '{sheet_identifier}' not found in this workbook. Check the workbook structure context for available sheets."
        
        # Get sheet data
        sheet_data = sheet.data or {}
        columns = sheet_data.get('columns', [])
        rows = sheet_data.get('rows', [])
        
        # Build formatted response
        result = f"Sheet: {sheet.name}\n"
        result += f"UUID: {sheet.uuid}\n"
        result += f"Total Rows: {len(rows)}\n"
        result += f"Total Columns: {len(columns)}\n\n"
        
        # Show column structure
        if columns:
            result += "Columns:\n"
            for idx, col in enumerate(columns):
                col_info = f"  {idx + 1}. {col.get('title', 'Untitled')}"
                if col.get('type') and col['type'] != 'text':
                    col_info += f" (Type: {col['type']})"
                if col.get('prompt'):
                    col_info += f" - {col['prompt']}"
                result += col_info + "\n"
            result += "\n"
        
        # Show row data (limited)
        if rows:
            rows_to_show = min(len(rows), max_rows)
            result += f"Data (showing {rows_to_show} of {len(rows)} rows):\n\n"
            
            # Filter non-empty rows
            non_empty_rows = []
            for i, row in enumerate(rows):
                has_data = any(cell not in [None, '', ' '] and str(cell).strip() != '' for cell in row)
                if has_data:
                    non_empty_rows.append((i, row))
            
            # Show the data
            for idx, (row_num, row) in enumerate(non_empty_rows[:rows_to_show]):
                result += f"Row {row_num + 1}:\n"
                for col_idx, cell_value in enumerate(row):
                    if col_idx < len(columns) and cell_value not in [None, '', ' '] and str(cell_value).strip() != '':
                        col_name = columns[col_idx].get('title', f'Column {col_idx + 1}')
                        result += f"  {col_name}: {cell_value}\n"
                result += "\n"
            
            if len(non_empty_rows) > rows_to_show:
                result += f"... and {len(non_empty_rows) - rows_to_show} more rows with data\n"
        else:
            result += "No data in this sheet.\n"
        
        return result.strip()
        
    except Workbook.DoesNotExist:
        return f"Error: Workbook with ID {workbook_id} not found."
    except Exception as e:
        import traceback
        traceback.print_exc()
        return f"Error getting sheet data: {str(e)}"


def tool_query_file_data(query, filename, prompt, max_results=5, search_type='query', workbook_id=None):
    """
    Query data from uploaded files using RAG with AI-filtered results.
    
    This tool performs a two-step process:
    1. Retrieves raw results from ChromaDB vector search
    2. Uses a secondary AI call to filter results based on the main AI's objective (prompt)
    
    Args:
        query (str): Search query to find relevant data
        filename (str): Name of the file to query
        prompt (str): Main AI's objective - what specific information to extract from results
        max_results (int, optional): Maximum number of results (default: 5, max: 20)
        search_type (str): 'identifier' for exact matching, 'query' for semantic search (default: 'query')
        workbook_id (str, optional): Workbook UUID for access validation
    
    Returns:
        str: AI-filtered summary of search results (~25 words, focused on the prompt objective)
    """
    try:
        from core.handlers.knowledge import query_rag
        File = apps.get_model('core', 'File')
        import re
        
        # AUTO-DETECT IDENTIFIERS: Override to identifier search if query looks like an ID/code
        # This ensures maximum accuracy for lookups of specific records
        if search_type == 'query':  # Only auto-detect if not explicitly set to identifier
            query_trimmed = query.strip()
            
            # Patterns that suggest an identifier:
            # 1. Short alphanumeric strings (2-30 chars, contains letters AND numbers)
            # 2. Strings with common ID separators (-, _, .)
            # 3. Strings that are purely numeric IDs (4+ digits)
            # 4. Common ID prefixes (ID, SKU, CUST, ORD, INV, PROD, etc.)
            
            is_identifier = False
            
            # Check for common ID patterns
            id_patterns = [
                r'^[A-Z]{2,5}[_-]?\d+$',  # PREFIX123, ABC-456, SKU_789
                r'^\d{4,}$',  # Pure numeric IDs (4+ digits)
                r'^[A-Z0-9]{2,15}[_-][A-Z0-9]{1,15}$',  # CODE-123, AB_CD_12
                r'^[A-Z]+\d+[A-Z]*$',  # AB123, SKU456XL
                r'^\d+[A-Z]+\d*$',  # 123ABC, 456XL789
            ]
            
            for pattern in id_patterns:
                if re.match(pattern, query_trimmed, re.IGNORECASE):
                    is_identifier = True
                    break
            
            # Additional heuristic: short alphanumeric with mixed case/numbers
            if not is_identifier and 2 <= len(query_trimmed) <= 30:
                has_letter = bool(re.search(r'[a-zA-Z]', query_trimmed))
                has_number = bool(re.search(r'\d', query_trimmed))
                has_separator = bool(re.search(r'[-_.]', query_trimmed))
                has_space = ' ' in query_trimmed
                
                # If it has letters AND numbers, no spaces, and is relatively short, likely an ID
                if has_letter and has_number and not has_space:
                    is_identifier = True
                # Or if it has separators (common in IDs)
                elif has_separator and not has_space:
                    is_identifier = True
            
            # Override to identifier search if detected
            if is_identifier:
                search_type = 'identifier'
                max_results = 1  # Identifiers should return only best match
                print(f"Auto-detected identifier pattern in query '{query}' - switching to identifier search")
        
        # For identifier search, always limit to 1 result
        if search_type == 'identifier':
            max_results = 1
        else:
            # Validate max_results for query search
            max_results = min(max(1, max_results), 20)  # Clamp between 1 and 20
        
        # Validate that this is for uploaded files, not sheets
        Sheet = apps.get_model('core', 'Sheet')
        if workbook_id:
            sheet_exists = Sheet.objects.filter(name=filename, workbook__uuid=workbook_id).exists()
            if sheet_exists:
                return f"Error: '{filename}' is a spreadsheet sheet, not an uploaded file. Use tool_get_sheet_data to view sheet data instead."
        
        # Find the file to get user_id and validate access
        file_obj = File.objects.filter(filename=filename).first()
        
        if not file_obj:
            return f"Error: File '{filename}' not found. Please check the filename and try again. Check the workbook structure context for available files."
        
        # Security check: Verify file belongs to the workbook (if workbook_id provided)
        if workbook_id and str(file_obj.workbook.uuid) != str(workbook_id):
            return "Error: File does not belong to the current workbook."
        
        if not file_obj.use:
            return "Error: This file is not available for use."
        
        # Get user_id for data isolation
        user_id = file_obj.workbook.user.id
        
        # Query the RAG system
        results = query_rag(
            query=query,
            filename=filename,
            user_id=user_id,
            n_results=max_results,
            search_type=search_type
        )
        
        # Check for errors
        if 'error' in results:
            return f"Error querying file: {results['error']}"
        
        # Format raw results
        if not results['documents']:
            raw_result = f"No results found for query '{query}' in file '{filename}' (search type: {search_type})."
        else:
            search_type_label = "exact match" if search_type == 'identifier' else "semantic search"
            raw_result = f"Found {len(results['documents'])} relevant record(s) from '{filename}' using {search_type_label}:\n\n"
            
            for idx, (record, metadata) in enumerate(zip(results['documents'], results['metadatas']), 1):
                raw_result += f"Result {idx}:\n{record}\n"
                
                # Add metadata info if available
                if 'row_id' in metadata:
                    raw_result += f"(Row: {metadata['row_id'] + 1}"
                    if 'sheet_name' in metadata:
                        raw_result += f", Sheet: {metadata['sheet_name']}"
                    raw_result += ")\n"
                
                raw_result += "\n"
            
            raw_result = raw_result.strip()
        
        # Use reusable AI filter to extract relevant information
        return ai_filter_result(raw_result, prompt, source_type="file query results", workbook_id=workbook_id)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return f"Error querying file data: {str(e)}"




def test_ai():
    completion_params = {
        "model": "openai/gpt-5-nano",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Tell me a joke about programmers."}
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "joke_response",
                "schema": {
                    "type": "object",
                    "properties": {
                        "setup": {"type": "string"},
                        "punchline": {"type": "string"},
                        "category": {"type": "string"}
                    },
                    "required": ["setup", "punchline", "category"]
                }
            }
        }
    }
    import litellm
    provider, api_key, _ = _get_provider_access(None, completion_params.get('model'))
    if api_key:
        completion_params['api_key'] = api_key
    response = litellm.completion(**completion_params)
    return response.choices[0].message['content']
"""AI tool registry that collects and returns available tool definitions for the assistant."""
from django.apps import apps


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

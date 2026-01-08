import asyncio
import time
import json
from io import BytesIO
from pathlib import Path

from PIL import Image
from crawl4ai import AsyncWebCrawler
import litellm
from dotenv import load_dotenv
from django.apps import apps
from django.conf import settings

# Load environment variables from root folder
env_path = Path(__file__).resolve().parents[3] / '.env'
load_dotenv(dotenv_path=env_path)


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
            "description": "Searches for information related to a specific keyword. This tool can get you relevant web results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "The keyword to search for."
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
            "description": "Scrapes a webpage for deeper insights and information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL of the website to scrape."
                    },
                },
                "required": ["url"],
            },
        }
    }

    return [search_tool, web_scraper_tool]


def get_file_tools():
    """
    Get static tool definitions for accessing files from the database.
    
    This returns STATIC tool definitions only (no dynamic file lists)
    to enable prompt caching. File lists should be added to user messages instead.
    
    Returns:
        list: List of tool definitions for file operations
    """
    # Define STATIC tool for reading file content
    # Description is kept generic to allow caching
    read_file_tool = {
        "type": "function",
        "function": {
            "name": "tool_read_file",
            "description": "Read the extracted markdown content of a specific file by its UUID. Use this to access information from uploaded documents. The available files will be listed in the conversation context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {
                        "type": "string",
                        "description": "The UUID of the file to read."
                    },
                },
                "required": ["file_id"],
            },
        }
    }
    
    return [read_file_tool]


def get_available_files_context(document_id):
    """
    Get dynamic file list context for a document.
    
    This returns the DYNAMIC file list that should be added to user messages,
    not to tool definitions, to preserve tool caching.
    
    Args:
        document_id (str): UUID of the document to get files for
    
    Returns:
        str or None: Formatted file list or None if no files available
    """
    if not document_id:
        return None
    
    try:
        File = apps.get_model('core', 'File')
        # Query only processed and enabled files for the document
        files = File.objects.filter(document__uuid=document_id, use=True, is_processing=False)
        
        if files.exists():
            # Build a human-readable list of available files
            file_list = []
            for f in files:
                file_list.append(f"- {f.filename} (ID: {f.uuid}, Size: {f.calculated_size} bytes)")
            
            file_info = "\n".join(file_list)
            return f"Available files in this document:\n{file_info}\n"
        
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


def assistant(message, conversation_obj=None, include_sheet_tools=False, document_id=None, sheet_context=None, model=settings.DEFAULT_AI_MODEL):
    """
    AI assistant with optional conversation persistence, sheet tool support, and file access.
    
    This is the main entry point for AI interactions. It supports:
    - Multi-turn conversations with persistence
    - Tool calling (web search, file reading, spreadsheet manipulation)
    - Context awareness for spreadsheets and documents
    
    Args:
        message (str or None): User message string. Can be None if continuing from tool results
        conversation_obj (Conversation, optional): Django model instance for conversation persistence
        include_sheet_tools (bool): If True, includes sheet tools and returns tool calls for frontend execution
        document_id (str, optional): Document UUID to enable file access tools
        sheet_context (dict, optional): Dict with 'data' (sheet structure) and 'selection' (selected cells info)
        model (str, optional): AI model to use (e.g., 'gpt-5-nano', 'gpt-5', 'gemini-3-flash'). Defaults to settings.DEFAULT_AI_MODEL
    
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
        # Build STATIC system message (instructions and constraints only - cacheable)
        static_system_message = "You are a spreadsheet assistant with access to tools for manipulating spreadsheet data.\n\n"
        static_system_message += "IMPORTANT CONSTRAINTS when populating cells:\n"
        static_system_message += "- For 'number' type columns: Provide ONLY numeric values (no text, no units)\n"
        static_system_message += "- For 'select' type columns: Choose EXACTLY ONE value from the specified options\n"
        static_system_message += "- For 'multiselect' type columns: Choose one or more values from the specified options, separated by commas\n"
        static_system_message += "- For 'checkbox' type columns: Use ONLY 'true' or 'false'\n"
        static_system_message += "- For 'email' type columns: Provide valid email addresses only\n"
        static_system_message += "- For 'url' type columns: Provide valid URLs only (starting with http:// or https://)\n"
        static_system_message += "- Respect the format specification if provided\n"
    elif document_id:
        # Document assistant mode
        static_system_message = "You are a document assistant with access to uploaded files. Use the tool_read_file tool to access document content when needed to answer questions.\n"
    
    # Add sheet context - split into STATIC and DYNAMIC parts for better prompt caching
    # DYNAMIC parts go in user message (not cached, changes frequently)
    dynamic_context_parts = []
    
    if sheet_context and include_sheet_tools:
        # Build DYNAMIC spreadsheet context (actual data - changes frequently, should NOT be cached)
        if sheet_context.get('data'):
            sheet_data = sheet_context['data']
            columns = sheet_data.get('columns', [])
            rows = sheet_data.get('rows', [])
            
            sheet_context_msg = "Current spreadsheet structure and data:\n\n"
            
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
            
            # Filter and prepare row data for context
            # Limit rows to prevent token overflow in the AI prompt
            # Filter rows to exclude completely empty rows or rows with only empty values
            non_empty_rows = []
            for i, row in enumerate(rows):
                # Check if row has at least one non-empty, non-null value
                has_data = any(cell not in [None, '', ' '] and str(cell).strip() != '' for cell in row)
                if has_data:
                    non_empty_rows.append((i, row))
            
            sheet_context_msg += f"Total Rows: {len(rows)}\n"
            sheet_context_msg += f"Rows with data: {len(non_empty_rows)}\n"
            
            if non_empty_rows:
                sheet_context_msg += "\nExisting data:\n"
                # Show first 50 rows maximum to prevent token overflow
                max_rows_to_show = min(50, len(non_empty_rows))
                for idx, (i, row) in enumerate(non_empty_rows[:max_rows_to_show]):
                    row_values = []
                    for j, cell_value in enumerate(row):
                        if j < len(columns):
                            # Only include cells with actual values (skip empty/null cells)
                            if cell_value not in [None, '', ' '] and str(cell_value).strip() != '':
                                row_values.append(f"{columns[j].get('title', '')}: {cell_value}")
                    if row_values:  # Only add row if it has displayable values
                        sheet_context_msg += f"  Row {i+1}: {', '.join(row_values)}\n"
                
                # Indicate if there are more rows than shown
                if len(non_empty_rows) > max_rows_to_show:
                    sheet_context_msg += f"  ... and {len(non_empty_rows) - max_rows_to_show} more rows with data\n"
            
            dynamic_context_parts.append(sheet_context_msg)
    
    # Add file context if working with documents
    if document_id:
        files_context = get_available_files_context(document_id)
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
    
    # Add sheet manipulation tools if working with spreadsheets
    if include_sheet_tools:
        tools = get_sheet_tools() + tools
    
    # Add file reading tools if working with documents (STATIC - no dynamic file list in tools)
    if document_id:
        tools = get_file_tools() + tools
    
    # Define tool categories for routing execution
    # Sheet tools modify spreadsheet UI (handled by frontend)
    sheet_tool_names = {'tool_add_rows', 'tool_delete_rows', 'tool_add_column', 'tool_delete_column', 'tool_populate_cells'}
    # File tools read document content (handled by backend)
    file_tool_names = {'tool_read_file'}
    # Frontend tools require UI updates (sent back to client)
    frontend_tool_names = {'tool_add_rows', 'tool_delete_rows', 'tool_add_column', 'tool_delete_column', 'tool_populate_cells'}
    
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
    
    # Prepare completion parameters
    completion_params = {
        "model": model,
        "messages": conversation,
        "tools": tools,
        "tool_choice": "auto",  # Let model decide when to use tools
    }
    
    # Main conversation loop - continues until AI decides no more tool calls needed
    while True:
        try:
            print("Generating AI response...")
            print("Current conversation:")
            print(conversation)
            # Call LiteLLM with full conversation history and available tools
            # Model decides whether to respond directly or call tools
            response = litellm.completion(**completion_params)
            
            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls
            
            # Process tool calls if AI decided to use tools
            if tool_calls:
                # Add assistant's response to conversation history
                # This preserves the tool calling decision for context
                assistant_msg = {
                    "role": "assistant",
                    "content": response_message.content
                }
                
                # Serialize tool calls to conversation format
                # This is required for OpenAI-compatible message format
                if tool_calls:
                    assistant_msg["tool_calls"] = [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        } for tc in tool_calls
                    ]
                
                conversation.append(assistant_msg)
                
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
                    print(f"DEBUG: Tool call - {function_name} Raw arguments: {tool_call.function.arguments} Parsed arguments: {function_args}")
                    
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
                
                # Execute backend tools (file reading, web scraping, etc.)
                for tool_info in backend_tools:
                    print(f"Executing backend tool: {tool_info['name']} with arguments: {tool_info['arguments']}")
                    
                    try:
                        # Inject document_id for file tools that need context
                        # This ensures file access is scoped to the current document
                        if tool_info['name'] in file_tool_names and document_id:
                            tool_info['arguments']['document_id'] = document_id
                        
                        # Execute tool function by name lookup
                        tool_result = globals()[tool_info['name']](**tool_info['arguments'])
                        
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
 
 





def enrichment(data, document_id=None, model=settings.DEFAULT_AI_MODEL):
    """
    Enrich a spreadsheet cell using AI based on context from other cells.
    
    Uses AI to infer missing data based on surrounding cell values and column descriptions.
    Can access uploaded documents for additional context.
    
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
        document_id (str, optional): Document UUID for file access
        model (str, optional): AI model to use. Defaults to settings.DEFAULT_AI_MODEL
    
    Returns:
        str: AI-generated enrichment value (max 5 words)
    
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
    print(f">>>>>>>>>>>>>>>>>> AI model: {model} <<<<<<<<<<<<<<<<<<")
    
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
    
    # Enable file access if document is available
    if document_id:
        prompt += " You have access to uploaded files that may contain relevant information. Use tool_read_file if needed."
    
    # Use AI assistant to generate enrichment value
    result = assistant(prompt, document_id=document_id, model=model)
    print(f"Enrichment result: {result}")
    
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
        str: Markdown content from search results
    """
    search_url = f"https://www.google.com/search?q={keyword}"
    return crawler(search_url)


def tool_web_scraper(url):
    """
    Scrape a webpage and return its content as markdown.
    
    Args:
        url (str): Website URL to scrape
    
    Returns:
        str: Markdown content from the webpage
    """
    return crawler(url)

async def _async_crawler(url):
    """
    Internal async function to crawl a webpage using crawl4ai.
    
    Args:
        url (str): URL to crawl
    
    Returns:
        CrawlResult: Result object with markdown content
    """
    async with AsyncWebCrawler() as crawler:
        return await crawler.arun(
            url=url
            # Example URLs for reference:
            # url="https://www.bing.com/search?q=Rohan%20Ashik"
            # url="https://www.google.com/search?q=Rohan%20Ashik"
        )


def crawler(url):
    """
    Synchronous wrapper for async web crawler.
    
    Scrapes a webpage and converts content to markdown format.
    
    Args:
        url (str): URL to crawl
    
    Returns:
        str: Raw markdown content from the webpage
    """
    result = asyncio.run(_async_crawler(url))
    return result.markdown.raw_markdown


def tool_read_file(file_id, document_id=None):
    """
    Read the extracted markdown content of a specific file from the database.
    
    This tool is called by the AI to access uploaded document content.
    If the file is in processing state or has no extracted content, it will force extract immediately.
    
    Args:
        file_id (str): UUID of the file to read
        document_id (str, optional): Document UUID for access validation
    
    Returns:
        str: Extracted markdown content or error message
    """
    try:
        File = apps.get_model('core', 'File')
        
        # Fetch the file by UUID from database
        file_obj = File.objects.get(uuid=file_id)
        
        # Security check: Verify file belongs to the document (if document_id provided)
        if document_id and str(file_obj.document.uuid) != str(document_id):
            return "Error: File does not belong to the current document."
        
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
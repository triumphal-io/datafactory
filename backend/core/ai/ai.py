"""Core AI conversation handler managing LLM interactions, tool call orchestration, and chat streaming."""
import asyncio
import time
import json
import re
from io import BytesIO

from PIL import Image
from django.apps import apps
from django.conf import settings
from .mcp import get_mcp_tools, execute_mcp_tool

# Import constants and utilities from utils
from .utils import (
    MAX_CONVERSATION_MESSAGES,
    MAX_TOOL_ITERATIONS,
    MAX_TOOLS_PER_TURN,
    AI_MAX_TOKENS,
    _get_provider_from_model,
    _get_provider_access,
    trim_conversation,
    ai_filter_result,
)

# Import tool definitions from tools
from .tools import (
    get_ai_tools,
    get_workbook_tools,
    get_file_tools,
    get_sheet_tools,
    get_available_files_context,
)

# Import tool implementations from tool-definitions
# These are imported into this module's namespace so that globals()[function_name]
# can find them when executing backend tool calls dynamically.
from .tool_definitions import (
    tool_search,
    tool_web_scraper,
    crawler,
    tool_read_file,
    tool_get_workbook_structure,
    tool_get_sheet_data,
    tool_query_file_data,
)


def assistant(message, user=None, conversation_obj=None, include_sheet_tools=False, workbook_id=None, sheet_context=None, model=settings.DEFAULT_AI_MODEL, include_read_file_tool=True):
    """
    AI assistant with optional conversation persistence, sheet tool support, and file access.

    This is the main entry point for AI interactions. It supports:
    - Multi-turn conversations with persistence
    - Tool calling (web search, file reading, spreadsheet manipulation)
    - Context awareness for spreadsheets and workbooks

    Args:
        message (str or None): User message string. Can be None if continuing from tool results
        user: Django User object for user-specific MCP tools. Optional.
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

    # Add MCP tools (Model Context Protocol integrations) - user-specific
    mcp_tools = get_mcp_tools(user) if user else []
    if mcp_tools:
        tools = mcp_tools + tools
        print(f"MCP: Loaded {len(mcp_tools)} MCP tool(s) for user {user.username if user else 'None'}")

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
    import litellm
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
            response = litellm.completion(**completion_params)

            # Validate response has choices before accessing
            if not response.choices or len(response.choices) == 0:
                error_message = "The AI model returned an empty response. This may be due to content filtering, token limits, or a temporary API issue. Please try rephrasing your request or try again."
                print(f"ERROR: Empty response from LiteLLM. Response: {response}")

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
                            tool_result = asyncio.run(execute_mcp_tool(tool_info['name'], tool_info['arguments'], user))
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


def enrichment(data, user=None, workbook_id=None, model=settings.DEFAULT_AI_MODEL, return_metadata=False):
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
        user: Django User object for user-specific MCP tools. Optional.
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

    prompt += """

RESEARCH PROTOCOL - When to Use Tools:

1. QUERY FILES FIRST (tool_query_file_data) when:
   - Files are available in the workbook (listed in WORKBOOK STRUCTURE under '## Files')
   - The context contains identifiers, codes, names, or keys that may be in the files
   - Use search_type='identifier' for exact ID/code lookups, 'query' for semantic searches

2. WEB SEARCH (tool_search + tool_web_scraper) when:
   - No relevant files exist in the workbook OR file search returned nothing useful
   - Information about current/recent events, statistics, prices, news, or people
   - Verifying facts that change over time (populations, positions, policies, status)
   - Looking up entities or terms not found in uploaded files
   - Use tool_search FIRST to find relevant sources, then tool_web_scraper to get details

3. SKIP ALL SEARCHES when:
   - The answer is explicitly stated in the row context
   - Simple logic or calculation is sufficient
   - You have reliable training knowledge (well-known historical facts, definitions, stable data)

SEARCH GUIDELINES:
- Prioritize file queries over web searches when files are available
- For web: Use 1-5 targeted keywords, scrape authoritative sources first
- Max 3-4 web searches and 3 scrapes per enrichment
- If nothing found after proper research, respond: "Not found"
"""

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
    result = assistant(prompt, user=user, conversation_obj=temp_conversation, workbook_id=workbook_id, model=model, include_read_file_tool=False)
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
                    result = option
                    break

        # Try to extract value from common patterns like "The answer is X" or "X is the answer"
        # Look for quoted values
        quoted_match = re.search(r'"([^"]+)"', result)
        if quoted_match:
            result = quoted_match.group(1)
        else:
            # Look for patterns like "is X" at the end
            is_match = re.search(r'is\s+"?([^."]+)"?\.?$', result, re.IGNORECASE)
            if is_match:
                result = is_match.group(1).strip()

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


def test_ai():
    """Send a test completion request to verify AI provider connectivity."""
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

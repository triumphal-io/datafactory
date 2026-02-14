import asyncio
import json
import re
from io import BytesIO

from PIL import Image
from crawl4ai import AsyncWebCrawler, BM25ContentFilter, DefaultMarkdownGenerator, PruningContentFilter, CrawlerRunConfig
from crawl4ai.utils import configure_windows_event_loop
from django.apps import apps

from .utils import _ddgs_client, ai_filter_result


def tool_search(keyword):
    """
    Search Google for a keyword and return scraped results.

    Args:
        keyword (str): Search term

    Returns:
        str: JSON string containing list of search results with title, href, and body
    """
    results = _ddgs_client.text(keyword, region='in-en', safesearch='off', backend="auto")

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
    async with AsyncWebCrawler() as crawler_instance:

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

        return await crawler_instance.arun(
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
                from core.ai.extraction import extract_file_content

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
        from core.ai.knowledge import query_rag
        File = apps.get_model('core', 'File')

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

import asyncio
import time
import json
from io import BytesIO
from PIL import Image
from crawl4ai import AsyncWebCrawler
import litellm
import os
from pathlib import Path
from dotenv import load_dotenv
from django.apps import apps

# Load .env from root folder
env_path = Path(__file__).resolve().parents[3] / '.env'
load_dotenv(dotenv_path=env_path)


def get_ai_tools():
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


def get_file_tools(document_id=None):
    """Dynamically generate tools for accessing files from the database"""
    tools = []
    
    # Tool to read file content
    read_file_tool = {
        "type": "function",
        "function": {
            "name": "tool_read_file",
            "description": "Read the extracted markdown content of a specific file. Use this to access information from uploaded documents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {
                        "type": "string",
                        "description": "The UUID of the file to read. Use tool_list_files to see available files."
                    },
                },
                "required": ["file_id"],
            },
        }
    }
    tools.append(read_file_tool)
    
    # If document_id is provided, enhance the description with available files
    if document_id:
        try:
            File = apps.get_model('core', 'File')
            files = File.objects.filter(document__uuid=document_id, use=True, is_processing=False)
            
            if files.exists():
                file_list = []
                for f in files:
                    file_list.append(f"- {f.filename} (ID: {f.uuid}, Size: {f.calculated_size} bytes)")
                
                file_info = "\n".join(file_list)
                read_file_tool["function"]["description"] = (
                    f"Read the extracted markdown content of a specific file. "
                    f"Available files:\n{file_info}\n\n"
                    f"Use the file ID to access the content."
                )
        except Exception as e:
            print(f"Error loading files for tool description: {e}")
    
    return tools


def get_sheet_tools():
    """Tools for manipulating spreadsheet data in the UI"""
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
            "description": "Add one or more columns to the currently open spreadsheet. Each column must have a title and can optionally have a prompt/description for AI enrichment. Use this when user asks to add columns, insert columns, or create new columns.",
            "parameters": {
                "type": "object",
                "properties": {
                    "columns": {
                        "type": "array",
                        "description": "Array of column objects to add. Each column must have a title and optional prompt.",
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
    
    return [add_rows_tool, add_column_tool]


def assistant(message, conversation_obj=None, include_sheet_tools=False, document_id=None):
    """
    AI assistant with optional conversation persistence, sheet tool support, and file access.
    
    Args:
        message: User message string OR None if continuing from tool results
        conversation_obj: Optional Conversation model instance for persistence
        include_sheet_tools: If True, includes sheet tools and returns tool calls for frontend execution
        document_id: Optional document UUID to enable file access tools
    
    Returns:
        - If include_sheet_tools=False: String response (legacy mode)
        - If include_sheet_tools=True: Dict with 'type' ('message' or 'tool_call'), 'content', optional 'tools'
    """
    # Initialize or load conversation history
    if conversation_obj:
        conversation = conversation_obj.conversations if conversation_obj.conversations else []
        if message:
            conversation.append({"role": "user", "content": message})
    else:
        conversation = [{"role": "user", "content": message}]
    
    # Select tools based on mode
    tools = get_ai_tools()
    if include_sheet_tools:
        tools = get_sheet_tools() + tools
    if document_id:
        tools = get_file_tools(document_id) + tools
    
    sheet_tool_names = {'tool_add_rows', 'tool_delete_rows', 'tool_add_column'}
    file_tool_names = {'tool_read_file'}
    frontend_tool_names = {'tool_add_rows', 'tool_delete_rows', 'tool_add_column'}
    
    while True:
        try:
            # Generate response based on full conversation history
            response = litellm.completion(
                model="gpt-4o-mini",
                messages=conversation,
                tools=tools,
                tool_choice="auto"
            )
            
            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls
            
            # Check for function call
            if tool_calls:
                # Add assistant's response to conversation
                assistant_msg = {
                    "role": "assistant",
                    "content": response_message.content
                }
                
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
                
                # Separate frontend tools from backend tools
                frontend_tools = []
                backend_tools = []
                
                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    tool_info = {
                        "id": tool_call.id,
                        "name": function_name,
                        "arguments": function_args
                    }
                    
                    # Sheet tools are frontend-handled only when include_sheet_tools is True
                    # File tools are always backend-handled
                    if include_sheet_tools and function_name in sheet_tool_names:
                        frontend_tools.append(tool_info)
                    else:
                        backend_tools.append(tool_info)
                
                # Execute backend tools
                for tool_info in backend_tools:
                    print(f"Executing backend tool: {tool_info['name']}")
                    print(f"Arguments: {tool_info['arguments']}")
                    
                    try:
                        # Add document_id for file tools that need context
                        if tool_info['name'] in file_tool_names and document_id:
                            tool_info['arguments']['document_id'] = document_id
                        
                        tool_result = globals()[tool_info['name']](**tool_info['arguments'])
                        conversation.append({
                            "tool_call_id": tool_info['id'],
                            "role": "tool",
                            "name": tool_info['name'],
                            "content": str(tool_result)
                        })
                    except Exception as e:
                        conversation.append({
                            "tool_call_id": tool_info['id'],
                            "role": "tool",
                            "name": tool_info['name'],
                            "content": f"Error: {str(e)}"
                        })
                
                # Save conversation if persistence enabled
                if conversation_obj:
                    conversation_obj.conversations = conversation
                    conversation_obj.save()
                
                # If there are frontend tools, return them for frontend execution
                if frontend_tools:
                    return {
                        'type': 'tool_call',
                        'tools': frontend_tools,
                        'conversation_id': str(conversation_obj.uuid) if conversation_obj else None
                    }
                
                # Continue the loop to let AI process backend tool results
            else:
                # No more tool calls needed, return the final response
                print("No more function calls needed.")
                final_content = response_message.content
                print(final_content)
                
                # Add final message to conversation
                conversation.append({
                    "role": "assistant",
                    "content": final_content
                })
                
                # Save conversation if persistence enabled
                if conversation_obj:
                    conversation_obj.conversations = conversation
                    conversation_obj.save()
                
                # Return based on mode
                if include_sheet_tools:
                    return {
                        'type': 'message',
                        'content': final_content.strip() if final_content else "",
                        'conversation_id': str(conversation_obj.uuid) if conversation_obj else None
                    }
                else:
                    return final_content.strip() if final_content else ""

        except Exception as e:
            exception_code = e.code if hasattr(e, 'code') else None
            if exception_code == 429:
                print(f"Rate limit exceeded: {e}")
                time.sleep(1)
            else:
                print(f"An unexpected error occurred: {e}")
                raise
 
 





def enrichment(data, document_id=None):
    # exampledata = {
    #     'context': {'Product Name': 'Zendesk'}, 
    #     'position': {'Row': '0', 'Column': '1'}, 
    #     'title': 'Product Category', 
    #     'description': 'Category of the Product', 
    #     'value': ''
    # }
    prompt = f"Given the context: {data['context']}, what is the {data['title']}? The description is: {data['description']}. Provide a concise and very short answer. Max 5 words."
    if document_id:
        prompt += " You have access to uploaded files that may contain relevant information. Use tool_read_file if needed."
    
    # use ai to find the value
    result = assistant(prompt, document_id=document_id)
    print(f"Enrichment result: {result}")
    return result


def test_assistant():
    prompt = "What is in the image?"
    image_path = "R:\\Projects\\DataFactory\\core\\handlers\\image.jpg"
    img = Image.open(image_path)

    # Convert image to bytes
    img_byte_arr = BytesIO()
    img.save(img_byte_arr, format='JPEG') # Or 'JPEG' based on your image type
    img_bytes = img_byte_arr.getvalue()

    data = [
        {"inlineData": {"mimeType": "image/jpeg", "data": img_bytes}}, 
        "What is in this image?"
    ]
    response = assistant(data)

    print(f"Assistant response: {response}")
    return response


def tool_search(keyword):
    search_url = f"https://www.google.com/search?q={keyword}"
    return crawler(search_url)

def tool_web_scraper(url):
    return crawler(url)

async def _async_crawler(url):
    async with AsyncWebCrawler() as crawler:
        return await crawler.arun(
            # url="https://www.bing.com/search?q=Rohan%20Ashik",
            # url="https://www.google.com/search?q=Rohan%20Ashik",
            url=url
        )
    
def crawler(url):
    result = asyncio.run(_async_crawler(url))
    return result.markdown.raw_markdown


def tool_read_file(file_id, document_id=None):
    """Read the extracted markdown content of a specific file"""
    try:
        File = apps.get_model('core', 'File')
        
        # Fetch the file by UUID
        file_obj = File.objects.get(uuid=file_id)
        
        # Verify the file belongs to the document if document_id is provided
        if document_id and str(file_obj.document.uuid) != str(document_id):
            return "Error: File does not belong to the current document."
        
        # Check if file is ready
        if file_obj.is_processing:
            return "Error: File is still being processed. Please try again later."
        
        if not file_obj.use:
            return "Error: This file is not available for use."
        
        # Return the extracted content
        if file_obj.extracted_content:
            return file_obj.extracted_content
        else:
            return "No extracted content available for this file."
    
    except File.DoesNotExist:
        return f"Error: File with ID {file_id} not found."
    except Exception as e:
        return f"Error reading file: {str(e)}"
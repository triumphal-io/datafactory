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


def assistant(message):
    # Initialize conversation history with the original prompt
    conversation = [{"role": "user", "content": message}]
    
    while True:
        try:
            # Generate response based on full conversation history
            response = litellm.completion(
                model="gpt-5-mini",
                messages=conversation,
                tools=get_ai_tools(),
                tool_choice="auto"
            )
            
            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls
            
            # Check for function call
            if tool_calls:
                # Add assistant's response to conversation
                conversation.append(response_message)
                
                # Execute each tool call
                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    print(f"Function to call: {function_name}")
                    print(f"Arguments: {function_args}")
                    
                    # Execute the tool
                    tool_result = globals()[function_name](**function_args)
                    
                    # Add tool result to conversation
                    conversation.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": str(tool_result)
                    })
                
                # Continue the loop to let AI process the tool result
            else:
                # No more tool calls needed, return the final response
                print("No more function calls needed.")
                final_content = response_message.content
                print(final_content)
                return final_content.strip() if final_content else ""

        except Exception as e:
            exception_code = e.code if hasattr(e, 'code') else None
            if exception_code == 429:
                print(f"Rate limit exceeded: {e}")
                # Implement your retry logic here, like a time delay
                time.sleep(1)
            else:
                print(f"An unexpected error occurred: {e}")
                raise
 
 


def enrichment(data):
    # exampledata = {
    #     'context': {'Product Name': 'Zendesk'}, 
    #     'position': {'Row': '0', 'Column': '1'}, 
    #     'title': 'Product Category', 
    #     'description': 'Category of the Product', 
    #     'value': ''
    # }
    prompt = f"Given the context: {data['context']}, what is the {data['title']}? The description is: {data['description']}. Provide a concise and very short answer. Max 5 words."
    # use ai to find the value
    result = assistant(prompt)
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
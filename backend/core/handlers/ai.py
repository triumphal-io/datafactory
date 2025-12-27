import asyncio
import time
from io import BytesIO
from unittest import result
from google.genai import types
from google import genai
from datafactory import settings
from PIL import Image
from crawl4ai import *
from google.api_core.exceptions import ResourceExhausted



def get_ai_tools():
    search_tool = {
        "name": "tool_search",
        "description": "Searches for information related to a specific keyword. This tool can only gets urls matching the keyword.",
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
    web_scraper_tool = {
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

    tools = types.Tool(function_declarations=[search_tool, web_scraper_tool])
    return tools


def assistant(message):
    prompt = message
    GEMINI_API_KEY = "AIzaSyAXgeXuiNS1mo0VZXUXcEXK3LdK87dhR00"
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    # Initialize conversation history with the original prompt
    conversation = [prompt]
    
    while True:
        try:
            # Generate response based on full conversation history
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=conversation,
                config=types.GenerateContentConfig(
                    temperature=0,
                    tools=[get_ai_tools()]
                )
            )

                   # Check for function call
            if response.candidates[0].content.parts[0].function_call:
                function_call = response.candidates[0].content.parts[0].function_call
                print(f"Function to call: {function_call.name}")
                print(f"Arguments: {function_call.args}")
                
                # Execute the tool
                tool_result = globals()[function_call.name](**function_call.args)
                
                # Add tool result to conversation
                conversation.append(
                    types.Content(
                        parts=[types.Part(function_response=types.FunctionResponse(
                            name=function_call.name,
                            response={"result": tool_result}
                        ))]
                    )
                )
                # Continue the loop to let AI process the tool result
            else:
                # No more tool calls needed, return the final response
                print("No more function calls needed.")
                print(response.text)
                return response.text.strip()

        except Exception as e:
            exception_code = e.code if hasattr(e, 'code') else None
            if exception_code == 429:
                print(f"Rate limit exceeded: {e}")
                # Implement your retry logic here, like a time delay
                time.sleep(1)
            print(f"An unexpected error occurred: {e}")
        
 
 


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
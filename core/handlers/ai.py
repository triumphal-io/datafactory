from io import BytesIO
from unittest import result
from google import genai
from datafactory import settings
from PIL import Image



def assistant(message):
    prompt = message
    GEMINI_API_KEY = "AIzaSyAXgeXuiNS1mo0VZXUXcEXK3LdK87dhR00"
    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt
    )
    print(response.text)
    result = response.text.strip()

    print(f"Assistant response: {result}")
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

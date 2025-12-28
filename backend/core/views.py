import json
import os
from urllib import response
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from core.handlers import ai

# Create directory for storing sheet data
SHEET_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sheet_data')
if not os.path.exists(SHEET_DATA_DIR):
    os.makedirs(SHEET_DATA_DIR)

def get_sheet_file_path(sheet_id):
    """Get the file path for a sheet's JSON data"""
    # Sanitize sheet_id to prevent directory traversal
    safe_sheet_id = "".join(c for c in sheet_id if c.isalnum() or c in ('-', '_'))
    return os.path.join(SHEET_DATA_DIR, f"{safe_sheet_id}.json")

# Create your views here.

def home(request):
    return render(request, 'home.html')


def api_assistant(request, action):
    response = {'status': 'error'}
    message = request.POST.get('message', '')
    print(f"Received message for action '{action}': {message}")

    if action == "ask":
        response['message'] = ai.assistant(message)
        response['status'] = 'success'
    return JsonResponse(response)
       
@csrf_exempt
@require_http_methods(["POST"])
def api_enrich(request, action):
    response = {'status': 'error'}
    body = json.loads(request.body)
    data = body.get('data', {})
    print(data)
    response['result'] = ai.enrichment(data)
    response['status'] = 'success'
    return JsonResponse(response)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_sheets(request, sheet_id):
    """Handle sheet data GET (load) and POST (save) operations"""
    
    if request.method == 'GET':
        # Load sheet data
        file_path = get_sheet_file_path(sheet_id)
        
        if not os.path.exists(file_path):
            return JsonResponse(
                {'status': 'error', 'message': 'Sheet not found'},
                status=404
            )
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return JsonResponse({
                'status': 'success',
                'sheetData': data.get('sheetData', {'columns': [], 'rows': []}),
                'lastModified': data.get('lastModified', ''),
                'sheetId': sheet_id
            })
        except Exception as e:
            return JsonResponse(
                {'status': 'error', 'message': str(e)},
                status=500
            )
    
    elif request.method == 'POST':
        # Save sheet data
        try:
            # Parse JSON body
            body = json.loads(request.body)
            sheet_data = body.get('sheetData', {'columns': [], 'rows': []})
            last_modified = body.get('lastModified', '')
            
            # Prepare data to save
            data_to_save = {
                'sheetId': sheet_id,
                'sheetData': sheet_data,
                'lastModified': last_modified,
                'version': '1.0'
            }
            
            # Save to file
            file_path = get_sheet_file_path(sheet_id)
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data_to_save, f, indent=2, ensure_ascii=False)
            
            return JsonResponse({
                'status': 'success',
                'message': 'Sheet saved successfully',
                'sheetId': sheet_id,
                'lastModified': last_modified
            })
        except Exception as e:
            return JsonResponse(
                {'status': 'error', 'message': str(e)},
                status=500
            )
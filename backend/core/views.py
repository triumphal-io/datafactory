import json
import os
from urllib import response
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import IsAuthenticated, AllowAny

from core.models import Document, Sheet
from core.handlers import ai


@api_view(['GET', 'POST'])
def api_documents(request, action):
    response = {'status': 'error'}

    if action == "list":
        documents = Document.objects.all()
        response['documents'] = []
        for doc in documents:
            response['documents'].append({
                'id': str(doc.uuid),
                'name': doc.name,
                'uuid': str(doc.uuid),
                'created_at': doc.created_at.isoformat(),
                'last_modified': doc.last_modified.isoformat(),
                'user': doc.user.username if doc.user else 'Anonymous'
            })
        response['status'] = 'success'
    return Response(response)

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_assistant(request, action):
    response = {'status': 'error'}
    message = request.POST.get('message', '')
    print(f"Received message for action '{action}': {message}")

    if action == "ask":
        response['message'] = ai.assistant(message)
        response['status'] = 'success'
    return JsonResponse(response)
       

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_enrich(request, action):
    response = {'status': 'error'}
    body = json.loads(request.body)
    data = body.get('data', {})
    print(data)
    response['result'] = ai.enrichment(data)
    response['status'] = 'success'
    return JsonResponse(response)




@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_sheets(request, did, sheet_id):
    """Handle sheet data GET (load) and POST (save) operations"""
    
    if request.method == 'GET':
        if sheet_id == 'list':
            # Return list of sheets for the document
            sheets = Sheet.objects.filter(document__uuid=did)
            sheet_list = []
            for sheet in sheets:
                sheet_list.append({
                    'sheet_id': str(sheet.uuid),
                    'name': sheet.name,
                    'last_modified': sheet.last_modified.isoformat()
                })
            return JsonResponse({
                'status': 'success',
                'sheets': sheet_list
            })
        else:
        # Load sheet data from database
            if sheet_id == 'default-sheet':
                # Get the first sheet for the document
                sheet = Sheet.objects.filter(document__uuid=did).first()
            else:
                sheet = Sheet.objects.filter(document__uuid=did, uuid=sheet_id).first()
            if not sheet:
                return JsonResponse(
                    {'status': 'error', 'message': 'Sheet not found'},
                    status=404
                )
            data = sheet.data if sheet.data else {'columns': [], 'rows': []}
            
            return JsonResponse({
                'status': 'success',
                'sheet_data': data,
                'last_modified': sheet.last_modified.isoformat(),
                'sheet_id': str(sheet.uuid)
            })
    elif request.method == 'POST':
        
        if sheet_id == 'new':
            pass
        else:
            body = json.loads(request.body)
            sheet_data = body.get('sheet_data', {'columns': [], 'rows': []})

            if sheet_id == 'default-sheet':
                # Get the first sheet for the document
                sheet = Sheet.objects.filter(document__uuid=did).first()
            else:
                sheet = Sheet.objects.filter(document__uuid=did, uuid=sheet_id).first()
            if sheet:
                sheet.data = sheet_data
                sheet.save()
                return JsonResponse({
                    'status': 'success',
                    'message': 'Sheet saved successfully',
                    'sheet_id': str(sheet.uuid),
                    'last_modified': sheet.last_modified.isoformat()
                })
            else:
                # return error if sheet not found
                return JsonResponse(
                    {'status': 'error', 'message': 'Sheet not found'},
                    status=404
                )
    return JsonResponse({'status': 'error', 'message': 'Invalid request method'}, status=400)
    
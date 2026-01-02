import json
import os
import re
import uuid as uuid_lib
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
from django.core.files.base import ContentFile

from core.models import Document, Sheet, File, Conversation
from core.handlers import ai
from core.handlers.extraction import start_background_processing


@api_view(['GET', 'POST', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
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
    elif action == "create":
        # Create a new document with a default sheet
        from django.contrib.auth.models import User
        
        # Get or create a default user (you may want to use actual authenticated user)
        user = User.objects.get(username='rohanashik')
        
        # Create the document
        document = Document.objects.create(
            user=user,
            name='Untitled Document',
            data={}
        )
        
        # Create a default sheet for the document
        sheet = Sheet.objects.create(
            document=document,
            name='Sheet 1',
            data={'columns': [], 'rows': []}
        )
        
        response = {
            'status': 'success',
            'document_id': str(document.uuid),
            'sheet_id': str(sheet.uuid),
            'name': document.name
        }
        return Response(response)
    else:
        document = Document.objects.filter(uuid=action).first()
        if not document:
            return JsonResponse(
                {'status': 'error', 'message': 'Document not found'},
                status=404
            )
        
        # Handle PATCH request to update document
        if request.method == 'PATCH':
            try:
                body = json.loads(request.body)
                name = body.get('name')
                
                if name is not None:
                    document.name = name
                    document.save()
                
                return JsonResponse({
                    'status': 'success',
                    'message': 'Document updated successfully',
                    'last_modified': document.last_modified.isoformat()
                })
            except Exception as e:
                return JsonResponse(
                    {'status': 'error', 'message': str(e)},
                    status=500
                )
        
        # Handle GET request to retrieve document details
        response = {
            'status': 'success',
            'id': str(document.uuid),
            'name': document.name,
            'created_at': document.created_at.isoformat(),
            'last_modified': document.last_modified.isoformat()
        }
        
        sheets = Sheet.objects.filter(document=document)
        response['sheets'] = []
        for sheet in sheets:
            response['sheets'].append({
                'id': str(sheet.uuid),
                'name': sheet.name,
                'last_modified': sheet.last_modified.isoformat()
            })
        files = File.objects.filter(document=document)
        response['files'] = []
        for file in files:
            response['files'].append({
                'id': str(file.uuid),
                'file': str(file.file),
                'uploaded_at': file.uploaded_at.isoformat(),
                'use': file.use
            })
        conversations = Conversation.objects.filter(document=document)
        response['conversations'] = []
        for conv in conversations:
            response['conversations'].append({
                'id': str(conv.uuid),
                'title': conv.title,
                'started_at': conv.started_at.isoformat(),
                'last_interaction': conv.last_interaction.isoformat()
            })
    return Response(response)


@api_view(['PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_update_document(request, did):
    """Update document properties like name"""
    try:
        document = Document.objects.filter(uuid=did).first()
        if not document:
            return JsonResponse(
                {'status': 'error', 'message': 'Document not found'},
                status=404
            )
        
        body = json.loads(request.body)
        name = body.get('name')
        
        if name is not None:
            document.name = name
            document.save()
        
        return JsonResponse({
            'status': 'success',
            'message': 'Document updated successfully',
            'last_modified': document.last_modified.isoformat()
        })
    except Exception as e:
        return JsonResponse(
            {'status': 'error', 'message': str(e)},
            status=500
        )


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_files(request, did, action):
    response = {'status': 'error'}
    if action == "list":
        files = File.objects.filter(document__uuid=did)
        response['files'] = []
        for file in files:
            # if file.is_processing:
                # start_background_processing()
            response['files'].append({
                'id': str(file.uuid),
                'name': file.filename,
                'file': str(file.file),
                'content': file.extracted_content,
                'size': file.calculated_size,
                'uploaded_at': file.uploaded_at.isoformat(),
                'is_processing': file.is_processing,
                'use': file.use
            })
        response['status'] = 'success'
    elif action == "upload":
        uploaded_files = request.FILES.getlist('files')
        print( uploaded_files)
        if not uploaded_files:
            return JsonResponse({'status': 'error', 'message': 'No files uploaded'}, status=400)
        
        document = Document.objects.filter(uuid=did).first()
        if not document:
            return JsonResponse({'status': 'error', 'message': 'Document not found'}, status=404)
        
        # Validate file types (only CSV and XLSX allowed)
        allowed_extensions = ['.csv', '.xlsx', '.xls']
        for uploaded_file in uploaded_files:
            file_ext = os.path.splitext(uploaded_file.name)[1].lower()
            if file_ext not in allowed_extensions:
                return JsonResponse({
                    'status': 'error', 
                    'message': f'Invalid file type: {uploaded_file.name}. Only CSV and XLSX files are allowed.'
                }, status=400)
        
        uploaded_file_ids = []
        for uploaded_file in uploaded_files:
            # Get original filename and extension
            original_name = uploaded_file.name
            name_parts = os.path.splitext(original_name)
            base_name = name_parts[0]
            extension = name_parts[1]
            
            # Sanitize filename to only contain a-z, A-Z, 0-9, -, _
            sanitized_name = re.sub(r'[^a-zA-Z0-9\-_]', '', base_name)
            if not sanitized_name:
                sanitized_name = 'file'
            
            # Generate UUID and create new filename
            file_uuid = uuid_lib.uuid4()
            new_filename = f"{sanitized_name}-{file_uuid}{extension}"
            
            # Create file instance
            file_instance = File.objects.create(
                document=document,
                filename=original_name,
                calculated_size=uploaded_file.size,
                extracted_content="",  # Will be populated by background processing
                is_processing=True
            )
            
            # Save file with new name
            file_instance.file.save(new_filename, uploaded_file, save=True)
            
            uploaded_file_ids.append({
                'id': str(file_instance.uuid),
                'original_name': original_name,
                'stored_name': new_filename
            })
        
        response = {
            'status': 'success',
            'uploaded_files': uploaded_file_ids,
            'count': len(uploaded_file_ids)
        }
        
        # Start background processing of uploaded files
        print(f"Triggering background processing for {len(uploaded_file_ids)} uploaded file(s)...")
        start_background_processing()
        
    return JsonResponse(response)



@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_assistant(request, did, action):
    """
    Handle assistant messages with conversation persistence and sheet tool support.
    
    POST data:
        - message: User message text (for user_message type)
        - message_type: 'user_message' or 'tool_result'
        - conversation_id: UUID of existing conversation (optional for first message)
        - tool_results: Array of {id, name, result} for tool_result type
    """
    try:
        body = json.loads(request.body) if request.body else {}
        message = body.get('message', '')
        message_type = body.get('message_type', 'user_message')
        conversation_id = body.get('conversation_id')
        tool_results = body.get('tool_results', [])
        sheet_data = body.get('sheet_data')
        selected_range = body.get('selected_range')
        
        # Build sheet context if data provided
        sheet_context = None
        if sheet_data:
            sheet_context = {}
            sheet_context['data'] = sheet_data
        
        # Append selected cells to user message if provided
        if selected_range and message:
            message = f"{message}\n\n[Selected cells: {selected_range}]"
        
        print(f"Assistant {action}: type={message_type}, conv_id={conversation_id}")
        
        # Get or create conversation
        if conversation_id:
            conversation = Conversation.objects.filter(uuid=conversation_id).first()
            if not conversation:
                return JsonResponse({'status': 'error', 'message': 'Conversation not found'}, status=404)
        else:
            # Create new conversation for this document
            document = Document.objects.filter(uuid=did).first()
            if not document:
                return JsonResponse({'status': 'error', 'message': 'Document not found'}, status=404)
            
            conversation = Conversation.objects.create(
                document=document,
                title=message[:50] if message else 'New Conversation',
                conversations=[]
            )
        
        # Handle different message types
        if message_type == 'user_message':
            # User sent a new message
            result = ai.assistant(
                message=message,
                conversation_obj=conversation,
                include_sheet_tools=True,
                document_id=did,
                sheet_context=sheet_context
            )
        elif message_type == 'tool_result':
            # Frontend executed tools and is sending results back
            # Add tool results to conversation
            conversations = conversation.conversations
            for tool_result in tool_results:
                conversations.append({
                    "tool_call_id": tool_result['id'],
                    "role": "tool",
                    "name": tool_result['name'],
                    "content": tool_result['result']
                })
            conversation.conversations = conversations
            conversation.save()
            
            # Continue conversation to get AI's final response
            result = ai.assistant(
                message=None,
                conversation_obj=conversation,
                include_sheet_tools=True,
                document_id=did,
                sheet_context=sheet_context
            )
        else:
            return JsonResponse({'status': 'error', 'message': 'Invalid message_type'}, status=400)
        
        # Return the result from assistant
        return JsonResponse({
            'status': 'success',
            **result
        })
        
    except Exception as e:
        print(f"Error in api_assistant: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
       

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_enrich(request, action):
    response = {'status': 'error'}
    body = json.loads(request.body)
    data = body.get('data', {})
    document_id = body.get('documentId', None)
    print(data)
    response['result'] = ai.enrichment(data, document_id=document_id)
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
    
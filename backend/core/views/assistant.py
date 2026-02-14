"""API views for the AI assistant chat, tool response handling, and conversation management."""
import json
import os
import re
import uuid as uuid_lib
from django.http import JsonResponse
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from core.models import Workbook, File, Conversation
from core.ai import ai
from core.ai.extraction import start_background_processing


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_assistant(request, did, action):
    """
    Handle AI assistant messages with conversation persistence and tool support.
    
    Tools available:
    - Sheet tools: Manipulate spreadsheet tabs (add/delete rows/columns, populate cells)
    - File tools: Query uploaded Resources (RAG-based search in CSV/XLSX/PDF/DOCX files)
    - Web tools: Search and scrape web content
    
    POST data:
        - message: User message text (for user_message type)
        - message_type: 'user_message' or 'tool_result'
        - conversation_id: UUID of existing conversation (optional for first message)
        - tool_results: Array of {id, name, result} for tool_result type
        - attachment_*: File attachments (multiple files supported via FormData)
        - sheet_data: Current spreadsheet sheet data (JSON string when sent via FormData)
        - selected_range: Selected cell range
    """
    try:
        # Check if this is FormData (with attachments) or JSON request
        content_type = request.content_type
        is_form_data = 'multipart/form-data' in content_type if content_type else False
        
        # Parse request data based on content type
        if is_form_data:
            message = request.POST.get('message', '')
            message_type = request.POST.get('message_type', 'user_message')
            conversation_id = request.POST.get('conversation_id')
            tool_results = json.loads(request.POST.get('tool_results', '[]'))
            sheet_data = json.loads(request.POST.get('sheet_data', 'null'))
            sheet_name = request.POST.get('sheet_name', '')
            sheet_id = request.POST.get('sheet_id', '')
            selected_range = request.POST.get('selected_range')
            model = request.POST.get('model', settings.DEFAULT_AI_MODEL)
        else:
            body = json.loads(request.body) if request.body else {}
            message = body.get('message', '')
            message_type = body.get('message_type', 'user_message')
            conversation_id = body.get('conversation_id')
            tool_results = body.get('tool_results', [])
            sheet_data = body.get('sheet_data')
            sheet_name = body.get('sheet_name', '')
            sheet_id = body.get('sheet_id', '')
            selected_range = body.get('selected_range')
            model = body.get('model', settings.DEFAULT_AI_MODEL)
        
        # Handle file attachments if present
        uploaded_file_ids = []
        attachment_info = []
        if is_form_data and request.FILES:
            workbook = Workbook.objects.filter(uuid=did).first()
            if not workbook:
                return JsonResponse({'status': 'error', 'message': 'Workbook not found'}, status=404)
            
            # Process all attached files
            for field_name, uploaded_file in request.FILES.items():
                if field_name.startswith('attachment_'):
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
                        workbook=workbook,
                        filename=original_name,
                        calculated_size=uploaded_file.size,
                        extracted_content="",  # Will be populated by background processing
                        is_processing=True
                    )
                    
                    # Save file with new name
                    file_instance.file.save(new_filename, uploaded_file, save=True)
                    
                    uploaded_file_ids.append(str(file_instance.uuid))
                    attachment_info.append({
                        'id': str(file_instance.uuid),
                        'name': original_name,
                        'size': uploaded_file.size
                    })
            
            # Start background processing of uploaded files
            if uploaded_file_ids:
                print(f"Triggering background processing for {len(uploaded_file_ids)} attached file(s)...")
                start_background_processing()
        
        # Build sheet context if data provided
        sheet_context = None
        if sheet_data:
            sheet_context = {}
            sheet_context['data'] = sheet_data
            if sheet_name:
                sheet_context['name'] = sheet_name
            if sheet_id:
                sheet_context['uuid'] = sheet_id
        
        # Prepend metadata to user message (context before message)
        if message:
            metadata_parts = []
            
            # Add attachment info first if files were uploaded
            if attachment_info:
                attachment_text = "[User attached files: " + ", ".join([f"{att['name']} (ID: {att['id']})" for att in attachment_info]) + "]"
                metadata_parts.append(attachment_text)
            
            # Add active page/sheet info
            if sheet_name:
                metadata_parts.append(f"[Selected sheet: {sheet_name} (ID: {sheet_id})]")
            else:
                # When no sheet is selected, user is on Resource Files
                metadata_parts.append("[Active page: Resource Files]")
            
            # Add selected cells info
            if selected_range:
                metadata_parts.append(f"[Selected cells: {selected_range}]")
            
            # Combine metadata with message
            if metadata_parts:
                message = "\n".join(metadata_parts) + "\n\n" + message
        
        print(f"Assistant {action}: type={message_type}, conv_id={conversation_id}, attachments={len(uploaded_file_ids)}")
        
        # Get or create conversation
        if conversation_id:
            conversation = Conversation.objects.filter(uuid=conversation_id).first()
            if not conversation:
                return JsonResponse({'status': 'error', 'message': 'Conversation not found'}, status=404)
        else:
            # Create new conversation for this workbook
            workbook = Workbook.objects.filter(uuid=did).first()
            if not workbook:
                return JsonResponse({'status': 'error', 'message': 'Workbook not found'}, status=404)

            conversation = Conversation.objects.create(
                workbook=workbook,
                title=message[:50] if message else 'New Conversation',
                conversations=[]
            )
        
        # Handle different message types
        if message_type == 'user_message':
            # User sent a new message
            # Only include sheet tools if user is actually viewing a sheet
            include_sheet_tools = sheet_context is not None
            
            result = ai.assistant(
                message=message,
                conversation_obj=conversation,
                include_sheet_tools=include_sheet_tools,
                workbook_id=did,
                sheet_context=sheet_context,
                model=model
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
                workbook_id=did,
                sheet_context=sheet_context,
                model=model
            )
        else:
            return JsonResponse({'status': 'error', 'message': 'Invalid message_type'}, status=400)
        
        # Return the result from assistant
        # Handle both string (legacy) and dict (new tool-based) responses
        if isinstance(result, dict):
            return JsonResponse({
                'status': 'success',
                **result
            })
        else:
            # Legacy string response when sheet tools are disabled
            return JsonResponse({
                'status': 'success',
                'type': 'message',
                'content': result,
                'conversation_id': str(conversation.uuid)
            })
        
    except Exception as e:
        print(f"Error in api_assistant: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

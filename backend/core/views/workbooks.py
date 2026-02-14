import json
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from core.models import Workbook, Sheet, File, Conversation


@api_view(['GET', 'POST', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_workbooks(request, action):
    """
    Handle workbook operations (list, create, get details).
    A Workbook contains Sheets (spreadsheet tabs) and Resources (uploaded files/folders).
    """
    response = {'status': 'error'}

    if action == "list":
        workbooks = Workbook.objects.all()
        response['workbooks'] = []
        for workbook in workbooks:
            response['workbooks'].append({
                'id': str(workbook.uuid),
                'name': workbook.name,
                'uuid': str(workbook.uuid),
                'selected_model': workbook.selected_model,
                'created_at': workbook.created_at.isoformat(),
                'last_modified': workbook.last_modified.isoformat(),
                'user': workbook.user.username if workbook.user else 'Anonymous'
            })
        response['status'] = 'success'
    elif action == "create":
        # Create a new workbook with a default sheet (Sheet 1)
        from django.contrib.auth.models import User
        
        # Get or create a default user (you may want to use actual authenticated user)
        user = User.objects.get(username='rohanashik')

        # Create the workbook
        workbook = Workbook.objects.create(
            user=user,
            name='Untitled Workbook',
            data={}
        )

        # Create a default sheet for the workbook
        sheet = Sheet.objects.create(
            workbook=workbook,
            name='Sheet 1',
            data={'columns': [], 'rows': []}
        )

        response = {
            'status': 'success',
            'workbook_id': str(workbook.uuid),
            'sheet_id': str(sheet.uuid),
            'name': workbook.name
        }
        return Response(response)
    elif action == "mentions":
        # Get mention suggestions for a specific workbook
        try:
            workbook_id = request.GET.get('workbook_id')
            if not workbook_id:
                return JsonResponse(
                    {'status': 'error', 'message': 'workbook_id parameter required'},
                    status=400
                )
            
            workbook = Workbook.objects.filter(uuid=workbook_id).first()
            if not workbook:
                return JsonResponse(
                    {'status': 'error', 'message': 'Workbook not found'},
                    status=404
                )

            suggestions = []

            # Get files
            files = File.objects.filter(workbook=workbook)
            for file in files:
                suggestions.append({
                    'id': f'file:{file.uuid}',
                    'display': f'📄 {file.filename}',
                    'category': 'FILES',
                    'type': 'file',
                    'name': file.filename
                })
            
            # Get folders
            from core.models import Folder
            folders = Folder.objects.filter(workbook=workbook)
            for folder in folders:
                suggestions.append({
                    'id': f'folder:{folder.uuid}',
                    'display': f'📁 {folder.name}',
                    'category': 'FOLDERS',
                    'type': 'folder',
                    'name': folder.name
                })
            
            # Get sheets and columns
            sheets = Sheet.objects.filter(workbook=workbook)
            for sheet in sheets:
                suggestions.append({
                    'id': f'sheet:{sheet.uuid}',
                    'display': f'📊 {sheet.name}',
                    'category': 'SHEETS',
                    'type': 'sheet',
                    'name': sheet.name
                })
                
                # Add columns from sheet data
                if sheet.data and 'columns' in sheet.data:
                    for column in sheet.data['columns']:
                        # Normalize column definitions.
                        # Columns may be plain strings ("Name") or structured dicts
                        # (e.g. {"title": "Requirement No.", "prompt": ...}).
                        column_name = column

                        if isinstance(column, dict):
                            column_name = (
                                column.get('title')
                                or column.get('name')
                                or column.get('column')
                                or str(column)
                            )
                        elif isinstance(column, str) and column.strip().startswith('{'):
                            try:
                                import ast
                                column_dict = ast.literal_eval(column)
                                if isinstance(column_dict, dict):
                                    column_name = (
                                        column_dict.get('title')
                                        or column_dict.get('name')
                                        or column_dict.get('column')
                                        or column
                                    )
                            except (ValueError, SyntaxError):
                                # If parsing fails, use the original column
                                column_name = column
                        
                        suggestions.append({
                            'id': f'column:{sheet.uuid}:{column}',
                            'display': f'📋 {sheet.name}:{column_name}',
                            'category': 'COLUMNS',
                            'type': 'column',
                            'name': f'{sheet.name}:{column_name}',
                            'sheetName': sheet.name,
                            'columnName': column_name
                        })
            
            return JsonResponse({
                'status': 'success',
                'suggestions': suggestions
            })
        except Exception as e:
            return JsonResponse(
                {'status': 'error', 'message': str(e)},
                status=500
            )
    else:
        workbook = Workbook.objects.filter(uuid=action).first()
        if not workbook:
            return JsonResponse(
                {'status': 'error', 'message': 'Workbook not found'},
                status=404
            )

        # Handle PATCH request to update workbook
        if request.method == 'PATCH':
            try:
                body = json.loads(request.body)
                name = body.get('name')
                selected_model = body.get('selected_model')

                if name is not None:
                    workbook.name = name
                if selected_model is not None:
                    workbook.selected_model = selected_model
                workbook.save()

                return JsonResponse({
                    'status': 'success',
                    'message': 'Workbook updated successfully',
                    'last_modified': workbook.last_modified.isoformat()
                })
            except Exception as e:
                return JsonResponse(
                    {'status': 'error', 'message': str(e)},
                    status=500
                )

        # Handle GET request to retrieve workbook details
        response = {
            'status': 'success',
            'id': str(workbook.uuid),
            'name': workbook.name,
            'selected_model': workbook.selected_model,
            'created_at': workbook.created_at.isoformat(),
            'last_modified': workbook.last_modified.isoformat()
        }

        sheets = Sheet.objects.filter(workbook=workbook)
        response['sheets'] = []
        for sheet in sheets:
            response['sheets'].append({
                'id': str(sheet.uuid),
                'name': sheet.name,
                'last_modified': sheet.last_modified.isoformat()
            })
        files = File.objects.filter(workbook=workbook)
        response['files'] = []
        for file in files:
            response['files'].append({
                'id': str(file.uuid),
                'file': str(file.file),
                'uploaded_at': file.uploaded_at.isoformat(),
                'use': file.use
            })
        conversations = Conversation.objects.filter(workbook=workbook)
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
def api_update_workbook(request, did):
    """Update workbook properties like name"""
    try:
        workbook = Workbook.objects.filter(uuid=did).first()
        if not workbook:
            return JsonResponse(
                {'status': 'error', 'message': 'Workbook not found'},
                status=404
            )

        body = json.loads(request.body)
        name = body.get('name')

        if name is not None:
            workbook.name = name
            workbook.save()

        return JsonResponse({
            'status': 'success',
            'message': 'Workbook updated successfully',
            'last_modified': workbook.last_modified.isoformat()
        })
    except Exception as e:
        return JsonResponse(
            {'status': 'error', 'message': str(e)},
            status=500
        )

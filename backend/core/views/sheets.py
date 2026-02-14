"""API views for sheet CRUD operations and data manipulation within workbooks."""
import json
import re
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from core.models import Workbook, Sheet


@api_view(['GET', 'POST', 'DELETE', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_sheets(request, did, sheet_id):
    """
    Handle workbook Sheets (spreadsheet tabs) operations.
    Note: Sheets = spreadsheet tabs with columns/rows (like Excel sheets).
    These are different from uploaded sheet files (CSV/XLSX) in Resources.
    """
    
    if request.method == 'GET':
        if sheet_id == 'list':
            # Return list of sheets for the workbook
            sheets = Sheet.objects.filter(workbook__uuid=did)
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
                # Get the first sheet for the workbook
                sheet = Sheet.objects.filter(workbook__uuid=did).first()
            else:
                sheet = Sheet.objects.filter(workbook__uuid=did, uuid=sheet_id).first()
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
                'sheet_id': str(sheet.uuid),
                'name': sheet.name
            })
    elif request.method == 'POST':
        
        if sheet_id == 'new':
            # Create a new sheet
            workbook = Workbook.objects.filter(uuid=did).first()
            if not workbook:
                return JsonResponse(
                    {'status': 'error', 'message': 'Workbook not found'},
                    status=404
                )

            # Get existing sheets to determine the next sheet name
            existing_sheets = Sheet.objects.filter(workbook=workbook)
            sheet_numbers = []
            for s in existing_sheets:
                # Extract number from "Sheet X" format
                match = re.match(r'Sheet (\d+)', s.name)
                if match:
                    sheet_numbers.append(int(match.group(1)))
            
            # Find the next available number
            next_number = 1
            if sheet_numbers:
                next_number = max(sheet_numbers) + 1
            
            new_sheet_name = f'Sheet {next_number}'
            
            # Create the new sheet
            new_sheet = Sheet.objects.create(
                workbook=workbook,
                name=new_sheet_name,
                data={'columns': [], 'rows': []}
            )
            
            return JsonResponse({
                'status': 'success',
                'message': 'Sheet created successfully',
                'sheet': {
                    'id': str(new_sheet.uuid),
                    'name': new_sheet.name,
                    'last_modified': new_sheet.last_modified.isoformat()
                }
            })
        else:
            body = json.loads(request.body)
            sheet_data = body.get('sheet_data', {'columns': [], 'rows': []})

            if sheet_id == 'default-sheet':
                # Get the first sheet for the workbook
                sheet = Sheet.objects.filter(workbook__uuid=did).first()
            else:
                sheet = Sheet.objects.filter(workbook__uuid=did, uuid=sheet_id).first()
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
    elif request.method == 'DELETE':
        # Delete a sheet
        if sheet_id == 'default-sheet':
            return JsonResponse(
                {'status': 'error', 'message': 'Cannot delete default sheet'},
                status=400
            )
        
        sheet = Sheet.objects.filter(workbook__uuid=did, uuid=sheet_id).first()
        if not sheet:
            return JsonResponse(
                {'status': 'error', 'message': 'Sheet not found'},
                status=404
            )
        
        # Check if this is the last sheet in the workbook
        sheet_count = Sheet.objects.filter(workbook__uuid=did).count()
        if sheet_count <= 1:
            return JsonResponse(
                {'status': 'error', 'message': 'Cannot delete the last sheet in the workbook'},
                status=400
            )
        
        sheet.delete()
        return JsonResponse({
            'status': 'success',
            'message': 'Sheet deleted successfully'
        })
    elif request.method == 'PATCH':
        # Update sheet metadata (e.g., name)
        sheet = Sheet.objects.filter(workbook__uuid=did, uuid=sheet_id).first()
        if not sheet:
            return JsonResponse(
                {'status': 'error', 'message': 'Sheet not found'},
                status=404
            )
        
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse(
                {'status': 'error', 'message': 'Invalid JSON'},
                status=400
            )
        
        # Update sheet name if provided
        if 'name' in body:
            new_name = body['name'].strip()
            if not new_name:
                return JsonResponse(
                    {'status': 'error', 'message': 'Sheet name cannot be empty'},
                    status=400
                )
            sheet.name = new_name
            sheet.save()
        
        return JsonResponse({
            'status': 'success',
            'message': 'Sheet updated successfully',
            'sheet': {
                'id': str(sheet.uuid),
                'name': sheet.name,
                'last_modified': sheet.last_modified.isoformat()
            }
        })
    
    return JsonResponse({'status': 'error', 'message': 'Invalid request method'}, status=400)

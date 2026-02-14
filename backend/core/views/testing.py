from django.http import JsonResponse
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from core.ai import ai


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_test(request, action):
    """A simple test API endpoint for admin actions"""
    response = {'status': 'error'}
    if action == "ping":
        response['status'] = 'success'
        response['message'] = 'pong'
        
        channel_layer = get_channel_layer()
        group_id = f"g-6e87f113-82e4-4799-80af-114ba26ab8b7"
        
        async_to_sync(channel_layer.group_send)(
            group_id,
            {
                'type': 'new_message',
                'message': "pinggginggg"
            }
        )
    elif action == "test-ai":
        # Simple AI test
        result = ai.test_ai()
        print(result)
        response['status'] = 'success'
        # response['message'] = result
        
               
    else:
        response['message'] = 'Unknown action'
    return JsonResponse(response)

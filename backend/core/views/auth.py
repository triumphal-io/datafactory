"""API views for user authentication (signup and login)."""
import json
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.authtoken.models import Token


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_signup(request):
    """Create a new user account and return an auth token."""
    try:
        body = json.loads(request.body)
        name = body.get('name', '').strip()
        email = body.get('email', '').strip().lower()
        password = body.get('password', '')
        confirm_password = body.get('confirm_password', '')

        if not name or not email or not password:
            return Response({'status': 'error', 'message': 'All fields are required'}, status=400)

        if password != confirm_password:
            return Response({'status': 'error', 'message': 'Passwords do not match'}, status=400)

        if len(password) < 6:
            return Response({'status': 'error', 'message': 'Password must be at least 6 characters'}, status=400)

        if User.objects.filter(email=email).exists():
            return Response({'status': 'error', 'message': 'An account with this email already exists'}, status=400)

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=name,
        )

        token, _ = Token.objects.get_or_create(user=user)

        return Response({
            'status': 'success',
            'token': token.key,
            'user': {
                'name': user.first_name,
                'email': user.email,
            }
        })
    except Exception as e:
        return Response({'status': 'error', 'message': str(e)}, status=500)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def api_login(request):
    """Authenticate a user and return an auth token."""
    try:
        body = json.loads(request.body)
        email = body.get('email', '').strip().lower()
        password = body.get('password', '')

        if not email or not password:
            return Response({'status': 'error', 'message': 'Email and password are required'}, status=400)

        user = authenticate(username=email, password=password)

        if user is None:
            return Response({'status': 'error', 'message': 'Invalid email or password'}, status=401)

        token, _ = Token.objects.get_or_create(user=user)

        return Response({
            'status': 'success',
            'token': token.key,
            'user': {
                'name': user.first_name,
                'email': user.email,
            }
        })
    except Exception as e:
        return Response({'status': 'error', 'message': str(e)}, status=500)

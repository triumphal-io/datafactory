import json
from urllib import response
from django.http import JsonResponse
from django.shortcuts import render

from core.handlers import ai

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
       
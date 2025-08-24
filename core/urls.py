from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),

    path('api/assistant/<str:action>', views.api_assistant, name='api_assistant')
]
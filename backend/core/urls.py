from django.urls import include, path
from . import views
    

urlpatterns = [
    path('auth/', include('rest_framework.urls')),
    path('documents/<str:action>', views.api_documents, name='api_documents'),
    # path('documents/<str:did>/sheets', views.api_sheets, name='api_sheets'),
    path('documents/<str:did>/sheets/<str:sheet_id>', views.api_sheets, name='api_sheets'),
    path('assistant/<str:action>', views.api_assistant, name='api_assistant'),
    path('enrich/<str:action>', views.api_enrich, name='api_enrich'),
]
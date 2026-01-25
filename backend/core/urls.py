from django.urls import include, path
from . import views
    

urlpatterns = [
    path('auth/', include('rest_framework.urls')),
    path('workbooks/<str:action>', views.api_workbooks, name='api_workbooks'),
    # path('workbooks/<str:did>/sheets', views.api_sheets, name='api_sheets'),
    path('workbooks/<str:did>/sheets/<str:sheet_id>', views.api_sheets, name='api_sheets'),
    path('workbooks/<str:did>/sheets/<str:sheet_id>/cell-history', views.api_cell_history, name='api_cell_history'),
    path('workbooks/<str:did>/folders/<str:action>', views.api_folders, name='api_folders'),
    path('workbooks/<str:did>/files/<str:action>', views.api_files, name='api_files'),
    path('workbooks/<str:did>/assistant/<str:action>', views.api_assistant, name='api_assistant'),
    path('enrich/<str:action>', views.api_enrich, name='api_enrich'),
    path('enrich-bulk', views.api_bulk_enrich, name='api_bulk_enrich'),
    path('mcp-servers/<str:action>', views.api_mcp_servers, name='api_mcp_servers'),
    path('provider-credentials/<str:action>', views.api_provider_credentials, name='api_provider_credentials'),
    path('admin/<str:action>', views.api_test),
]
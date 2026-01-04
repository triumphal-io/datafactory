from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/document/(?P<group>[^/]+)/$', consumers.DocumentConsumer.as_asgi()),
]
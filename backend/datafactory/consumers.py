from channels.generic.websocket import AsyncWebsocketConsumer
import json

class DocumentConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Extract parameters from WebSocket URL and create a group ID
        # Group id is nothing but the document's uuid as string
        self.group_id = f"g-{self.scope['url_route']['kwargs']['group']}"
        
        await self.channel_layer.group_add(self.group_id, self.channel_name)
        await self.accept()
        print(f"WebSocket client connected to group {self.group_id}, channel: {self.channel_name}")

    async def disconnect(self, close_code):
        print(f"WebSocket client disconnected from group {self.group_id}, channel: {self.channel_name}")
        await self.channel_layer.group_discard(self.group_id, self.channel_name)
    async def receive(self, text_data):
        data = json.loads(text_data)
        message = data['message']
        
        print(f"WebSocket message received: {message}")
        
        # Broadcast to group
        await self.channel_layer.group_send(
            self.group_id,
            {
                'type': 'new_message',
                'message': message
            }
        )

    async def new_message(self, event):
        message = event['message']
        print(f"WebSocket broadcasting to group {self.group_id}: {message}")
        await self.send(text_data=json.dumps({
            'message': message
        }))
    
    async def enrichment_update(self, event):
        """Handle enrichment status updates"""
        message_type = event.get('message_type')
        data = event.get('data')
        print(f"WebSocket enrichment update: {message_type}, data: {data}")
              
              
        await self.send(text_data=json.dumps({
              'type': message_type,   
              'data': data 
        }))
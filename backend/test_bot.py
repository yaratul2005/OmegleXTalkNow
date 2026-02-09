import asyncio
import aiohttp
import websockets
import json
import sys

API_URL = "http://localhost:8000/api"
WS_URL_BASE = "ws://localhost:8000/ws"

async def run_bot(bot_name):
    print(f"[{bot_name}] Starting...")
    try:
        async with aiohttp.ClientSession() as session:
            # 1. Create anonymous session
            print(f"[{bot_name}] Requesting anonymous session...")
            try:
                async with session.post(f"{API_URL}/auth/anonymous") as resp:
                    if resp.status != 200:
                        print(f"[{bot_name}] Failed to create session. Status: {resp.status}")
                        print(await resp.text())
                        return
                    data = await resp.json()
                    token = data["token"]
                    user_id = data["session_id"]
                    print(f"[{bot_name}] Session created. User ID: {user_id}")
            except Exception as e:
                print(f"[{bot_name}] HTTP Error: {e}")
                return

            ws_url = f"{WS_URL_BASE}/{user_id}?token={token}"
            print(f"[{bot_name}] Connecting to WebSocket: {ws_url}")
            
            try:
                async with websockets.connect(ws_url) as websocket:
                    print(f"[{bot_name}] WebSocket Connected!")
                    
                    # 3. Join Matchmaking - STRICTLY TEXT to ensure matching
                    print(f"[{bot_name}] Sending 'find_match' command...")
                    search_msg = {
                        "type": "find_match",
                        "interests": ["test"],
                        "prefer_video": False, 
                        "use_trial": False
                    }
                    await websocket.send(json.dumps(search_msg))
                    
                    # 4. Listen loop
                    print(f"[{bot_name}] Listening for messages...")
                    while True:
                        msg = await websocket.recv()
                        data = json.loads(msg)
                        msg_type = data.get('type', 'unknown')
                        print(f"[{bot_name}] Received Event: {msg_type}")
                        
                        if msg_type == 'waiting':
                            q_size = data.get('queue_size', '?')
                            print(f"[{bot_name}] Status: Waiting in queue. Users in queue: {q_size}")
                        
                        elif msg_type == 'matched':
                            print(f"[{bot_name}] !!! MATCHED !!! Partner: {data.get('partner_id')}")
                            # Send a greeting
                            await websocket.send(json.dumps({
                                "type": "chat_message",
                                "session_id": data.get('session_id'),
                                "content": "Hello! I am a test bot 🤖",
                                "partner_id": data.get('partner_id')
                            }))
                        
                        elif msg_type == 'chat_message':
                            print(f"[{bot_name}] Chat: {data.get('content')}")
                        
                        elif msg_type == 'partner_disconnected':
                            print(f"[{bot_name}] Partner disconnected.")
                            break

            except websockets.exceptions.ConnectionClosed as e:
                print(f"[{bot_name}] WebSocket Connection Closed: {e}")
            except Exception as e:
                print(f"[{bot_name}] WebSocket Error: {e}")

    except Exception as e:
        print(f"[{bot_name}] General Error: {e}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    try:
        asyncio.run(run_bot("TestBot"))
    except KeyboardInterrupt:
        print("\nBot stopped by user.")

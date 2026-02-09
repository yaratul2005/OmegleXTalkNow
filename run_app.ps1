# Start Backend
Start-Process powershell -ArgumentList "cd backend; python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000"

# Start Frontend
Start-Process powershell -ArgumentList "cd frontend; npm start"

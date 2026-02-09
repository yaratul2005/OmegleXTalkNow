import requests
import sys

BASE_URL = "http://localhost:8000"

def test_admin_login():
    print(f"Testing Admin Login at {BASE_URL}...")
    try:
        # 1. Login
        login_data = {
            "username": "admin", # server.py uses username, but auth/login might expect email?
            # Let's check server.py: login expects OAuth2PasswordRequestForm which has username/password
            # BUT the endpoint in server.py might be custom. 
            # Let's check server.py login endpoint.
            # actually, standard OAuth2 form uses 'username' field for email or username.
            "email": "admin@talknow.com", 
            "password": "admin1234"
        }
        
        # Checking server.py for login endpoint signature
        # It seems I need to check how login is implemented.
        # usually it's POST /api/auth/login
        
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        
        if response.status_code == 200:
            print("✅ Login Successful")
            token = response.json().get("token")
            print(f"Token: {token[:20]}...")
            
            # 2. Verify Admin Access
            headers = {"Authorization": f"Bearer {token}"}
            admin_resp = requests.get(f"{BASE_URL}/api/admin/settings", headers=headers)
            
            if admin_resp.status_code == 200:
                print("✅ Admin Settings Access Verified")
                print("Default Admin Credentials are WORKING.")
            else:
                print(f"❌ Admin Access Failed: {admin_resp.status_code} - {admin_resp.text}")
                
        else:
            print(f"❌ Login Failed: {response.status_code} - {response.text}")
            # Try with username instead of email if that failed
            login_data["username"] = "admin"
            del login_data["email"]
            print("Retrying with username 'admin'...")
            response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
            if response.status_code == 200:
                print("✅ Login Successful with Username")
            else:
                print(f"❌ Login Failed with Username: {response.text}")

    except Exception as e:
        print(f"Connection Error: {e}")

if __name__ == "__main__":
    test_admin_login()

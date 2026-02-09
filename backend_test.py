import requests
import json
import sys
import time
from datetime import datetime

class TalkNowAPITester:
    def __init__(self, base_url="http://localhost:8000"):
        self.base_url = base_url
        self.token = None
        self.anonymous_token = None
        self.user_id = None
        self.session_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, use_anonymous=False):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        # Add auth token if available
        token_to_use = self.anonymous_token if use_anonymous else self.token
        if token_to_use:
            test_headers['Authorization'] = f'Bearer {token_to_use}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ {name} - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                self.log(f"❌ {name} - Expected {expected_status}, got {response.status_code}")
                self.log(f"   Response: {response.text[:200]}")
                self.failed_tests.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                return False, {}

        except Exception as e:
            self.log(f"❌ {name} - Error: {str(e)}")
            self.failed_tests.append(f"{name}: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test basic health endpoints"""
        self.log("\n=== HEALTH CHECK TESTS ===")
        
        # Test root endpoint
        self.run_test("Root endpoint", "GET", "", 200)
        
        # Test health endpoint
        self.run_test("Health check", "GET", "health", 200)

    def test_anonymous_auth(self):
        """Test anonymous session creation"""
        self.log("\n=== ANONYMOUS AUTH TESTS ===")
        
        success, response = self.run_test(
            "Create anonymous session",
            "POST",
            "auth/anonymous",
            200
        )
        
        if success and 'token' in response:
            self.anonymous_token = response['token']
            self.session_id = response.get('session_id')
            self.log(f"✅ Anonymous token obtained: {self.anonymous_token[:20]}...")
            return True
        return False

    def test_user_registration(self):
        """Test user registration"""
        self.log("\n=== USER REGISTRATION TESTS ===")
        
        test_email = f"test_{int(time.time())}@example.com"
        test_password = "TestPass123!"
        test_username = f"testuser_{int(time.time())}"
        
        success, response = self.run_test(
            "User registration",
            "POST",
            "auth/register",
            200,
            data={
                "email": test_email,
                "password": test_password,
                "username": test_username
            }
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response['user']['id']
            self.log(f"✅ User registered and token obtained: {self.token[:20]}...")
            return True
        return False

    def test_user_login(self):
        """Test user login with existing credentials"""
        self.log("\n=== USER LOGIN TESTS ===")
        
        # First register a user
        test_email = f"login_test_{int(time.time())}@example.com"
        test_password = "TestPass123!"
        
        # Register
        reg_success, reg_response = self.run_test(
            "Register for login test",
            "POST",
            "auth/register",
            200,
            data={
                "email": test_email,
                "password": test_password
            }
        )
        
        if not reg_success:
            return False
        
        # Now test login
        success, response = self.run_test(
            "User login",
            "POST",
            "auth/login",
            200,
            data={
                "email": test_email,
                "password": test_password
            }
        )
        
        return success and 'token' in response

    def test_auth_me(self):
        """Test /auth/me endpoint"""
        self.log("\n=== AUTH ME TESTS ===")
        
        # Test with regular user token
        if self.token:
            success, response = self.run_test(
                "Get user profile",
                "GET",
                "auth/me",
                200
            )
            if not success:
                return False
        
        # Test with anonymous token
        if self.anonymous_token:
            success, response = self.run_test(
                "Get anonymous profile",
                "GET",
                "auth/me",
                200,
                use_anonymous=True
            )
            if success and response.get('is_anonymous'):
                self.log("✅ Anonymous profile correctly identified")
            return success
        
        return False

    def test_chat_queue_endpoints(self):
        """Test chat queue management with gender preference (premium only)"""
        self.log("\n=== CHAT QUEUE TESTS ===")
        
        if not self.token:
            self.log("❌ No auth token available for queue tests")
            return False
        
        # Test join queue without gender preference (should work for non-premium)
        success, response = self.run_test(
            "Join chat queue (no gender preference)",
            "POST",
            "chat/join-queue?interests=gaming&interests=music&prefer_video=true",
            200
        )
        
        if not success:
            return False
        
        # Check if gender_filter_active is false for non-premium users
        if response.get('gender_filter_active') == False:
            self.log("✅ Non-premium user correctly has gender_filter_active=false")
        else:
            self.log(f"❌ Expected gender_filter_active=false, got {response.get('gender_filter_active')}")
        
        # Test join queue with gender preference (should be ignored for non-premium)
        success, response = self.run_test(
            "Join chat queue with gender preference (non-premium)",
            "POST",
            "chat/join-queue?interests=gaming&interests=music&prefer_video=true&gender_preference=female",
            200
        )
        
        if not success:
            return False
        
        # Should still be false for non-premium users
        if response.get('gender_filter_active') == False:
            self.log("✅ Non-premium user with gender preference correctly has gender_filter_active=false")
        else:
            self.log(f"❌ Expected gender_filter_active=false for non-premium, got {response.get('gender_filter_active')}")
        
        # Test queue status
        success, response = self.run_test(
            "Check queue status",
            "GET",
            "chat/queue-status",
            200
        )
        
        if not success:
            return False
        
        # Test leave queue
        success, response = self.run_test(
            "Leave chat queue",
            "POST",
            "chat/leave-queue",
            200
        )
        
        return success

    def test_premium_packages(self):
        """Test premium packages endpoint - verify gender_filter is first in all packages"""
        self.log("\n=== PREMIUM PACKAGES TESTS ===")
        
        success, response = self.run_test(
            "Get premium packages",
            "GET",
            "packages",
            200
        )
        
        if success and isinstance(response, dict):
            expected_packages = ['basic', 'pro', 'vip']
            for pkg in expected_packages:
                if pkg in response:
                    self.log(f"✅ Package '{pkg}' found with price: ${response[pkg]['price']}")
                    
                    # Check if gender_filter is the first feature
                    features = response[pkg].get('features', [])
                    if features and features[0] == 'gender_filter':
                        self.log(f"✅ Package '{pkg}' has gender_filter as first feature")
                    else:
                        self.log(f"❌ Package '{pkg}' does not have gender_filter as first feature: {features}")
                        return False
                else:
                    self.log(f"❌ Package '{pkg}' missing")
                    return False
            return True
        
        return False

    def test_payment_checkout(self):
        """Test payment checkout endpoint"""
        self.log("\n=== PAYMENT CHECKOUT TESTS ===")
        
        if not self.token:
            self.log("❌ No auth token available for payment tests")
            return False
        
        success, response = self.run_test(
            "Create payment checkout",
            "POST",
            "payments/checkout?package_id=basic",
            200,
            headers={'Origin': 'http://localhost:3000'}
        )
        
        if success and 'url' in response and 'session_id' in response:
            self.log(f"✅ Checkout session created: {response['session_id']}")
            return True
        
        return False

    def test_report_endpoint(self):
        """Test report submission"""
        self.log("\n=== REPORT TESTS ===")
        
        if not self.token:
            self.log("❌ No auth token available for report tests")
            return False
        
        success, response = self.run_test(
            "Submit report",
            "POST",
            "report",
            200,
            data={
                "session_id": "test-session-123",
                "reported_user_id": "test-user-456",
                "reason": "Inappropriate content",
                "description": "Test report submission"
            }
        )
        
        return success and response.get('success')

    def test_admin_endpoints(self):
        """Test admin endpoints"""
        self.log("\n=== ADMIN TESTS ===")
        
        if not self.token:
            self.log("❌ No auth token available for admin tests")
            return False
        
        # Test admin stats
        success, response = self.run_test(
            "Get admin stats",
            "GET",
            "admin/stats",
            200
        )
        
        if not success:
            return False
        
        # Test admin reports
        success, response = self.run_test(
            "Get admin reports",
            "GET",
            "admin/reports",
            200
        )
        
        return success

    def test_content_moderation(self):
        """Test content moderation endpoint"""
        self.log("\n=== CONTENT MODERATION TESTS ===")
        
        success, response = self.run_test(
            "Moderate content",
            "POST",
            "chat/moderate",
            200,
            data={
                "session_id": "test-session",
                "sender_id": "test-sender",
                "content": "Hello, this is a test message"
            }
        )
        
        if success and 'is_safe' in response:
            self.log(f"✅ Moderation result: Safe={response['is_safe']}, Confidence={response.get('confidence', 'N/A')}")
            return True
        
        return False

    def test_ice_servers(self):
        """Test ICE servers endpoint for WebRTC"""
        self.log("\n=== ICE SERVERS TESTS ===")
        
        if not self.token:
            self.log("❌ No auth token available for ICE servers test")
            return False
        
        success, response = self.run_test(
            "Get ICE servers",
            "GET",
            "chat/ice-servers",
            200
        )
        
        if success and 'ice_servers' in response:
            ice_servers = response['ice_servers']
            self.log(f"✅ ICE servers returned: {len(ice_servers)} servers")
            
            # Check for STUN servers
            stun_servers = [s for s in ice_servers if s['urls'].startswith('stun:')]
            self.log(f"✅ STUN servers found: {len(stun_servers)}")
            
            # Check for TURN servers
            turn_servers = [s for s in ice_servers if s['urls'].startswith('turn:')]
            self.log(f"✅ TURN servers found: {len(turn_servers)}")
            
            return len(stun_servers) > 0 and len(turn_servers) > 0
        
        return False

    def test_rate_limiting(self):
        """Test rate limiting middleware"""
        self.log("\n=== RATE LIMITING TESTS ===")
        
        # Make rapid requests to trigger rate limiting
        rapid_requests = 0
        rate_limited = False
        
        for i in range(25):  # Try 25 rapid requests
            try:
                response = requests.get(f"{self.base_url}/api/health", timeout=2)
                rapid_requests += 1
                if response.status_code == 429:
                    rate_limited = True
                    self.log(f"✅ Rate limiting triggered after {rapid_requests} requests")
                    break
                time.sleep(0.1)  # Small delay between requests
            except Exception as e:
                self.log(f"❌ Request failed: {e}")
                break
        
        if not rate_limited:
            self.log(f"⚠️ Rate limiting not triggered after {rapid_requests} requests")
        
        return rate_limited

    def test_email_verification_flow(self):
        """Test email verification endpoints"""
        self.log("\n=== EMAIL VERIFICATION TESTS ===")
        
        if not self.token:
            self.log("❌ No auth token available for email verification tests")
            return False
        
        # Test resend verification
        success, response = self.run_test(
            "Resend verification email",
            "POST",
            "auth/resend-verification",
            200
        )
        
        if not success:
            return False
        
        # Test verify email with invalid code (should fail)
        success, response = self.run_test(
            "Verify email with invalid code",
            "POST",
            "auth/verify-email?code=123456",
            400
        )
        
        # This should fail (400), so success means the endpoint is working correctly
        if success:
            self.log("✅ Email verification correctly rejects invalid codes")
            return True
        else:
            # If it returns 200, that's unexpected but let's check the response
            self.log("⚠️ Email verification endpoint behavior unexpected")
            return False

    def test_password_reset_flow(self):
        """Test password reset endpoints"""
        self.log("\n=== PASSWORD RESET TESTS ===")
        
        # Test forgot password request
        success, response = self.run_test(
            "Request password reset",
            "POST",
            "auth/forgot-password",
            200,
            data={"email": "test@example.com"}
        )
        
        if not success:
            return False
        
        # Test reset password with invalid token (should fail)
        success, response = self.run_test(
            "Reset password with invalid token",
            "POST",
            "auth/reset-password",
            400,
            data={
                "token": "invalid_token_12345",
                "new_password": "NewPassword123!"
            }
        )
        
        # This should fail (400), so success means the endpoint is working correctly
        if success:
            self.log("✅ Password reset correctly rejects invalid tokens")
            return True
        else:
            self.log("⚠️ Password reset endpoint behavior unexpected")
            return False

    def test_premium_trial_endpoints(self):
        """Test premium trial system"""
        self.log("\n=== PREMIUM TRIAL TESTS ===")
        
        if not self.token:
            self.log("❌ No auth token available for trial tests")
            return False
        
        # Test trial status
        success, response = self.run_test(
            "Check trial status",
            "GET",
            "trial/status",
            200
        )
        
        if not success:
            return False
        
        # Check if eligible for trial
        if response.get('eligible'):
            self.log("✅ User eligible for trial")
            
            # Test trial activation
            success, response = self.run_test(
                "Activate premium trial",
                "POST",
                "trial/activate",
                200
            )
            
            if success and response.get('success'):
                self.log("✅ Premium trial activated successfully")
                return True
        else:
            self.log(f"ℹ️ User not eligible for trial: {response.get('reason', 'Unknown')}")
            return True  # This is expected behavior
        
        return False

    def test_profile_gender_update(self):
        """Test profile gender update endpoint"""
        self.log("\n=== PROFILE GENDER UPDATE TESTS ===")
        
        if not self.token:
            self.log("❌ No auth token available for profile tests")
            return False
        
        # Test updating gender to valid values
        valid_genders = ["male", "female", "other", "prefer_not_to_say"]
        
        for gender in valid_genders:
            success, response = self.run_test(
                f"Update gender to {gender}",
                "PUT",
                f"profile/gender?gender={gender}",
                200
            )
            
            if not success:
                return False
            
            if response.get('success') and response.get('gender') == gender:
                self.log(f"✅ Gender successfully updated to {gender}")
            else:
                self.log(f"❌ Gender update failed for {gender}")
                return False
        
        # Test invalid gender
        success, response = self.run_test(
            "Update gender to invalid value",
            "PUT",
            "profile/gender?gender=invalid_gender",
            400
        )
        
        if success:
            self.log("✅ Invalid gender correctly rejected")
            return True
        else:
            self.log("❌ Invalid gender should have been rejected")
            return False

    def test_abuse_detection_stats(self):
        """Test abuse detection statistics endpoint"""
        self.log("\n=== ABUSE DETECTION TESTS ===")
        
        if not self.token:
            self.log("❌ No auth token available for abuse stats test")
            return False
        
        success, response = self.run_test(
            "Get abuse detection stats",
            "GET",
            "admin/abuse-stats",
            200
        )
        
        if success and isinstance(response, dict):
            expected_keys = ['blocked_ips', 'tracked_clients', 'high_risk_clients']
            for key in expected_keys:
                if key in response:
                    self.log(f"✅ Abuse stat '{key}': {response[key]}")
                else:
                    self.log(f"❌ Missing abuse stat: {key}")
                    return False
            return True
        
        return False

    def test_websocket_endpoint(self):
        """Test WebSocket endpoint availability (connection test only)"""
        self.log("\n=== WEBSOCKET TESTS ===")
        
        # We can't easily test WebSocket functionality in this simple test,
        # but we can check if the endpoint exists by trying to connect
        try:
            import websocket
            
            if self.user_id and self.token:
                ws_url = self.base_url.replace('https://', 'wss://').replace('http://', 'ws://')
                ws_url = f"{ws_url}/ws/{self.user_id}?token={self.token}"
                
                # Try to create connection (will fail but we can check the response)
                try:
                    ws = websocket.create_connection(ws_url, timeout=5)
                    ws.close()
                    self.log("✅ WebSocket endpoint accessible")
                    return True
                except Exception as e:
                    if "handshake" in str(e).lower() or "upgrade" in str(e).lower():
                        self.log("✅ WebSocket endpoint exists (handshake attempted)")
                        return True
                    else:
                        self.log(f"❌ WebSocket connection failed: {e}")
                        return False
        except ImportError:
            self.log("⚠️ WebSocket library not available, skipping WebSocket test")
            return True

    def run_all_tests(self):
        """Run all API tests"""
        self.log("🚀 Starting TalkNow API Tests")
        self.log(f"Testing against: {self.base_url}")
        
        # Run tests in order
        test_methods = [
            self.test_health_check,
            self.test_anonymous_auth,
            self.test_user_registration,
            self.test_user_login,
            self.test_auth_me,
            self.test_profile_gender_update,
            self.test_ice_servers,
            self.test_rate_limiting,
            self.test_email_verification_flow,
            self.test_password_reset_flow,
            self.test_premium_trial_endpoints,
            self.test_abuse_detection_stats,
            self.test_chat_queue_endpoints,
            self.test_premium_packages,
            self.test_payment_checkout,
            self.test_report_endpoint,
            self.test_admin_endpoints,
            self.test_content_moderation,
            self.test_websocket_endpoint
        ]
        
        for test_method in test_methods:
            try:
                test_method()
            except Exception as e:
                self.log(f"❌ Test {test_method.__name__} crashed: {e}")
                self.failed_tests.append(f"{test_method.__name__}: {e}")
        
        # Print summary
        self.log(f"\n📊 TEST SUMMARY")
        self.log(f"Tests run: {self.tests_run}")
        self.log(f"Tests passed: {self.tests_passed}")
        self.log(f"Tests failed: {self.tests_run - self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            self.log(f"\n❌ FAILED TESTS:")
            for failure in self.failed_tests:
                self.log(f"  - {failure}")
        
        return self.tests_passed, self.tests_run, self.failed_tests

def main():
    tester = TalkNowAPITester()
    passed, total, failures = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())
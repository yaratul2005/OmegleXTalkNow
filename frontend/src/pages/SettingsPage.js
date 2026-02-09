import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { 
  ArrowLeft, User, Bell, Shield, Video, 
  LogOut, Sparkles, Crown, Save, Mail, CheckCircle, AlertCircle
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, token, logout, isAnonymous } = useAuth();
  
  const [settings, setSettings] = useState({
    enableVideo: true,
    enableAudio: true,
    hdVideo: user?.is_premium || false,
    notifications: true,
    interests: user?.interests || []
  });
  
  const [interestInput, setInterestInput] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  const verifyEmail = async () => {
    if (!verificationCode.trim()) {
      toast.error('Please enter verification code');
      return;
    }
    
    setIsVerifying(true);
    try {
      const response = await fetch(`${API}/api/auth/verify-email?code=${verificationCode}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (response.ok) {
        toast.success('Email verified successfully!');
        window.location.reload(); // Refresh to update user state
      } else {
        toast.error(data.detail || 'Verification failed');
      }
    } catch (error) {
      toast.error('Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const resendVerification = async () => {
    setResendingVerification(true);
    try {
      const response = await fetch(`${API}/api/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      if (response.ok) {
        toast.success('Verification email sent!');
      } else {
        toast.error(data.detail || 'Failed to send email');
      }
    } catch (error) {
      toast.error('Failed to send email');
    } finally {
      setResendingVerification(false);
    }
  };

  const addInterest = () => {
    if (interestInput.trim() && settings.interests.length < 10) {
      setSettings(prev => ({
        ...prev,
        interests: [...prev.interests, interestInput.trim()]
      }));
      setInterestInput('');
    }
  };

  const removeInterest = (interest) => {
    setSettings(prev => ({
      ...prev,
      interests: prev.interests.filter(i => i !== interest)
    }));
  };

  const saveSettings = async () => {
    if (isAnonymous) {
      toast.info('Sign in to save your preferences');
      return;
    }

    try {
      await fetch(`${API}/api/profile/interests`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings.interests)
      });
      toast.success('Settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    toast.success('Logged out successfully');
  };

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Header */}
      <header className="glass px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button 
            onClick={() => navigate(-1)} 
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold font-['Syne']">TalkNow</span>
          </div>
          
          <div className="w-20" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-['Syne']">Settings</h1>
          <p className="text-slate-400 mt-2">Customize your TalkNow experience</p>
        </div>

        {/* Profile Section */}
        <section className="glass rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Profile</h2>
              <p className="text-sm text-slate-400">
                {isAnonymous ? 'Anonymous Session' : user?.email}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {!isAnonymous && user?.is_verified && (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              )}
              {user?.is_premium && (
                <div className="premium-badge">
                  <Crown className="w-3 h-3" />
                  {user?.premium_tier?.toUpperCase()}
                </div>
              )}
            </div>
          </div>
          
          {/* Email Verification Section */}
          {!isAnonymous && !user?.is_verified && (
            <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-500">Email not verified</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Verify your email to unlock all features and secure your account.
                  </p>
                  
                  <div className="flex gap-2 mt-4">
                    <Input
                      placeholder="Enter 6-digit code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="h-10 bg-white/5 border-white/10 focus:border-[#6366f1]/50 rounded-lg max-w-[180px]"
                      data-testid="verification-code-input"
                    />
                    <Button
                      onClick={verifyEmail}
                      disabled={isVerifying}
                      className="bg-[#6366f1] hover:bg-[#4f46e5] rounded-lg"
                      data-testid="verify-email-btn"
                    >
                      {isVerifying ? 'Verifying...' : 'Verify'}
                    </Button>
                  </div>
                  
                  <button
                    onClick={resendVerification}
                    disabled={resendingVerification}
                    className="text-sm text-[#6366f1] hover:underline mt-3"
                    data-testid="resend-verification-btn"
                  >
                    {resendingVerification ? 'Sending...' : 'Resend verification email'}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {isAnonymous && (
            <div className="bg-[#6366f1]/10 rounded-xl p-4 border border-[#6366f1]/20">
              <p className="text-sm text-slate-300">
                Create an account to save your preferences and unlock more features.
              </p>
              <Button
                onClick={() => navigate('/')}
                className="mt-3 bg-[#6366f1] hover:bg-[#4f46e5] rounded-full"
                data-testid="create-account-btn"
              >
                Create Account
              </Button>
            </div>
          )}
        </section>

        {/* Chat Preferences */}
        <section className="glass rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#22d3ee] to-[#0891b2] flex items-center justify-center">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Chat Preferences</h2>
              <p className="text-sm text-slate-400">Configure your chat settings</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
              <Label htmlFor="video-toggle" className="flex items-center gap-3">
                <Video className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="font-medium">Video Chat</p>
                  <p className="text-sm text-slate-500">Enable camera for video chats</p>
                </div>
              </Label>
              <Switch
                id="video-toggle"
                checked={settings.enableVideo}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enableVideo: checked }))}
                data-testid="video-toggle"
              />
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
              <Label htmlFor="hd-toggle" className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="font-medium">HD Video</p>
                  <p className="text-sm text-slate-500">
                    {user?.is_premium ? 'High-definition video quality' : 'Premium feature'}
                  </p>
                </div>
              </Label>
              <Switch
                id="hd-toggle"
                checked={settings.hdVideo}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, hdVideo: checked }))}
                disabled={!user?.is_premium}
                data-testid="hd-toggle"
              />
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
              <Label htmlFor="notifications-toggle" className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="font-medium">Notifications</p>
                  <p className="text-sm text-slate-500">Receive match notifications</p>
                </div>
              </Label>
              <Switch
                id="notifications-toggle"
                checked={settings.notifications}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, notifications: checked }))}
                data-testid="notifications-toggle"
              />
            </div>
          </div>
        </section>

        {/* Interests */}
        <section className="glass rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Your Interests</h2>
            <p className="text-sm text-slate-400">Add up to 10 interests for better matching</p>
          </div>
          
          <div className="flex gap-2">
            <Input
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addInterest()}
              placeholder="Add an interest..."
              className="h-12 bg-white/5 border-white/10 focus:border-[#6366f1]/50 rounded-lg"
              data-testid="interest-input"
            />
            <Button
              onClick={addInterest}
              className="h-12 px-6 bg-[#6366f1] hover:bg-[#4f46e5] rounded-lg"
              data-testid="add-interest-btn"
            >
              Add
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {settings.interests.map((interest, i) => (
              <button
                key={i}
                onClick={() => removeInterest(interest)}
                className="interest-tag selected group"
                data-testid={`interest-tag-${i}`}
              >
                {interest}
                <span className="ml-2 opacity-50 group-hover:opacity-100">×</span>
              </button>
            ))}
            {settings.interests.length === 0 && (
              <p className="text-sm text-slate-500">No interests added yet</p>
            )}
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            onClick={saveSettings}
            className="flex-1 h-12 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-full"
            data-testid="save-settings-btn"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
          
          {!isAnonymous && (
            <Button
              onClick={handleLogout}
              variant="outline"
              className="flex-1 h-12 border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-full"
              data-testid="logout-btn"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          )}
        </div>

        {/* Premium CTA */}
        {!user?.is_premium && (
          <section className="glass rounded-2xl p-6 glow-accent">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Crown className="w-5 h-5 text-[#d946ef]" />
                  Upgrade to Premium
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Get HD video, priority matching, and more
                </p>
              </div>
              <Button
                onClick={() => navigate('/premium')}
                className="bg-gradient-to-r from-[#d946ef] to-[#9333ea] hover:opacity-90 rounded-full"
                data-testid="upgrade-btn"
              >
                View Plans
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

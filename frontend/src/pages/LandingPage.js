import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Video, MessageSquare, Shield, Zap, Users, Crown, ArrowRight, Sparkles } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const { login, register, createAnonymousSession, isAuthenticated, user, isAnonymous } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // login, register, forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleStartAnonymous = async () => {
    setLoading(true);
    try {
      if (!isAuthenticated) {
        await createAnonymousSession();
      }
      navigate('/chat');
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || error.message || 'Failed to start session');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (authMode === 'forgot') {
        // Password reset request
        await axios.post(`${API}/auth/forgot-password`, { email });
        setResetSent(true);
        toast.success('If the email exists, a reset link has been sent');
      } else if (authMode === 'login') {
        await login(email, password);
        toast.success('Welcome back!');
        setShowAuthModal(false);
        navigate('/chat');
      } else {
        await register(email, password, username);
        toast.success('Account created! Check your email to verify.');
        setShowAuthModal(false);
        navigate('/chat');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Video, title: 'HD Video Chat', description: 'Crystal clear video with adaptive quality' },
    { icon: Shield, title: 'AI Moderation', description: 'Real-time content safety powered by AI' },
    { icon: Zap, title: 'Instant Matching', description: 'Connect with someone in seconds' },
    { icon: Users, title: 'Interest Matching', description: 'Find people who share your passions' },
  ];

  const premiumFeatures = [
    'Priority matching queue',
    'HD video quality',
    'Reconnect with past chats',
    'Interest-based filters',
    'Verified badge',
    'Ad-free experience',
  ];

  return (
    <div className="min-h-screen bg-hero-gradient overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold font-['Syne']">TalkNow</span>
          </div>

          <div className="flex items-center gap-4">
            {isAuthenticated && !isAnonymous ? (
              <>
                <span className="text-sm text-slate-400">Welcome, {user?.username}</span>
                <Button
                  onClick={() => navigate('/chat')}
                  className="bg-[#6366f1] hover:bg-[#4f46e5] rounded-full px-6"
                  data-testid="nav-start-chat-btn"
                >
                  Start Chat
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setShowAuthModal(true)}
                variant="ghost"
                className="text-slate-300 hover:text-white hover:bg-white/10 rounded-full"
                data-testid="nav-login-btn"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-light">
                <span className="status-indicator online" />
                <span className="text-sm text-[#22d3ee]">2,847 people online now</span>
              </div>

              <h1 className="text-5xl lg:text-7xl font-bold font-['Syne'] leading-tight">
                Meet Someone
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#6366f1] to-[#22d3ee]">
                  Extraordinary
                </span>
              </h1>

              <p className="text-lg text-slate-400 max-w-lg">
                Anonymous video and text chat with intelligent matching.
                Connect instantly with people who share your interests.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={handleStartAnonymous}
                  disabled={loading}
                  className="h-14 px-8 text-lg bg-gradient-to-r from-[#6366f1] to-[#4f46e5] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] rounded-full transition-shadow duration-300"
                  data-testid="start-anonymous-btn"
                >
                  <Video className="w-5 h-5 mr-2" />
                  Start Video Chat
                </Button>

                <Button
                  onClick={handleStartAnonymous}
                  disabled={loading}
                  variant="outline"
                  className="h-14 px-8 text-lg border-white/20 hover:bg-white/10 rounded-full"
                  data-testid="start-text-btn"
                >
                  <MessageSquare className="w-5 h-5 mr-2" />
                  Text Only
                </Button>
              </div>

              <p className="text-xs text-slate-500">
                By starting a chat, you agree to our Terms of Service and Privacy Policy.
                You must be 18+ to use this platform.
              </p>
            </div>

            {/* Right Visual */}
            <div className="relative hidden lg:block">
              <div className="relative w-full aspect-square">
                {/* Abstract connection visual */}
                <div className="absolute inset-0 rounded-3xl overflow-hidden">
                  <img
                    src="https://images.unsplash.com/photo-1737505599162-d9932323a889?crop=entropy&cs=srgb&fm=jpg&q=85"
                    alt="Abstract connections"
                    className="w-full h-full object-cover opacity-50"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
                </div>

                {/* Floating cards */}
                <div className="absolute top-12 left-8 glass rounded-2xl p-4 animate-float" style={{ animationDelay: '0s' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0891b2] flex items-center justify-center">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Active Users</p>
                      <p className="text-2xl font-bold text-[#22d3ee]">2.8K+</p>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-20 right-8 glass rounded-2xl p-4 animate-float" style={{ animationDelay: '1s' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#d946ef] to-[#9333ea] flex items-center justify-center">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">AI Protected</p>
                      <p className="text-xs text-slate-400">Real-time moderation</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6 bg-[#0A0A0A]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold font-['Syne'] mb-4">Why TalkNow?</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Built for the modern age with safety, speed, and meaningful connections at its core.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="glass rounded-2xl p-6 card-hover"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#6366f1]/20 to-[#22d3ee]/20 flex items-center justify-center mb-4">
                  <feature.icon className="w-7 h-7 text-[#6366f1]" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Premium Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#d946ef]/10 border border-[#d946ef]/20 mb-6">
                <Crown className="w-4 h-4 text-[#d946ef]" />
                <span className="text-sm text-[#d946ef]">Premium</span>
              </div>

              <h2 className="text-4xl font-bold font-['Syne'] mb-6">
                Unlock the Full
                <span className="block text-[#d946ef]">Experience</span>
              </h2>

              <p className="text-slate-400 mb-8">
                Get priority access, enhanced features, and the best matching experience.
              </p>

              <ul className="space-y-4 mb-8">
                {premiumFeatures.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#d946ef]/20 flex items-center justify-center">
                      <Zap className="w-3 h-3 text-[#d946ef]" />
                    </div>
                    <span className="text-slate-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => navigate('/premium')}
                className="h-12 px-8 bg-gradient-to-r from-[#d946ef] to-[#9333ea] hover:shadow-[0_0_30px_rgba(217,70,239,0.4)] rounded-full transition-shadow duration-300"
                data-testid="view-premium-btn"
              >
                View Plans
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="relative">
              <div className="glass rounded-3xl p-8 glow-accent">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <p className="text-sm text-slate-400">Starting at</p>
                    <p className="text-4xl font-bold font-['Syne']">$9.99<span className="text-lg text-slate-400">/mo</span></p>
                  </div>
                  <div className="premium-badge">
                    <Crown className="w-3 h-3" />
                    PREMIUM
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5">
                    <img
                      src="https://images.unsplash.com/photo-1551519559-e5a3d5a87069?crop=entropy&cs=srgb&fm=jpg&q=85"
                      alt="User"
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-medium">Priority Matching</p>
                      <p className="text-sm text-slate-400">Jump the queue instantly</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0891b2] flex items-center justify-center">
                      <Video className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-medium">HD Video</p>
                      <p className="text-sm text-slate-400">Crystal clear quality</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold font-['Syne']">TalkNow</span>
            </div>

            <div className="flex items-center gap-8 text-sm text-slate-400">
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Safety</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>

            <p className="text-sm text-slate-500">© 2025 TalkNow. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <Dialog open={showAuthModal} onOpenChange={(open) => { setShowAuthModal(open); setResetSent(false); setAuthMode('login'); }}>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-['Syne']">
              {authMode === 'login' ? 'Welcome Back' :
                authMode === 'register' ? 'Create Account' :
                  'Reset Password'}
            </DialogTitle>
          </DialogHeader>

          {authMode === 'forgot' && resetSent ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-green-500" />
              </div>
              <p className="text-slate-300">
                If an account exists with that email, you'll receive a password reset link.
              </p>
              <Button
                onClick={() => { setAuthMode('login'); setResetSent(false); }}
                className="mt-4 bg-[#6366f1] hover:bg-[#4f46e5] rounded-full"
              >
                Back to Login
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleAuth} className="space-y-4 mt-4">
                {authMode === 'register' && (
                  <Input
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-12 bg-white/5 border-white/10 focus:border-[#6366f1]/50 rounded-lg"
                    data-testid="register-username-input"
                  />
                )}

                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-white/5 border-white/10 focus:border-[#6366f1]/50 rounded-lg"
                  data-testid="auth-email-input"
                />

                {authMode !== 'forgot' && (
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 bg-white/5 border-white/10 focus:border-[#6366f1]/50 rounded-lg"
                    data-testid="auth-password-input"
                  />
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-full"
                  data-testid="auth-submit-btn"
                >
                  {loading ? 'Loading...' :
                    authMode === 'login' ? 'Sign In' :
                      authMode === 'register' ? 'Create Account' :
                        'Send Reset Link'}
                </Button>
              </form>

              <div className="text-center mt-4 space-y-2">
                {authMode === 'login' && (
                  <>
                    <button
                      onClick={() => setAuthMode('forgot')}
                      className="text-sm text-[#6366f1] hover:underline block w-full"
                      data-testid="forgot-password-link"
                    >
                      Forgot password?
                    </button>
                    <button
                      onClick={() => setAuthMode('register')}
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                      data-testid="auth-toggle-mode"
                    >
                      Don't have an account? Sign up
                    </button>
                  </>
                )}
                {authMode === 'register' && (
                  <button
                    onClick={() => setAuthMode('login')}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                    data-testid="auth-toggle-mode"
                  >
                    Already have an account? Sign in
                  </button>
                )}
                {authMode === 'forgot' && (
                  <button
                    onClick={() => setAuthMode('login')}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Back to login
                  </button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

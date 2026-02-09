import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { 
  Crown, Check, Zap, Video, Users, Shield, 
  ArrowLeft, Sparkles, Star, Clock, Heart
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function PremiumPage() {
  const navigate = useNavigate();
  const { token, user, isAnonymous } = useAuth();
  const [loading, setLoading] = useState(null);

  const packages = [
    {
      id: 'basic',
      name: 'Basic',
      price: 9.99,
      period: 'month',
      description: 'Perfect for casual users',
      features: [
        { text: 'Gender filter', icon: Heart, highlight: true },
        { text: 'Priority matching', icon: Zap },
        { text: 'Ad-free experience', icon: Shield },
      ],
      popular: false,
      color: 'from-[#6366f1] to-[#4f46e5]'
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 19.99,
      period: 'month',
      description: 'Most popular choice',
      features: [
        { text: 'Gender filter', icon: Heart, highlight: true },
        { text: 'Priority matching', icon: Zap },
        { text: 'Ad-free experience', icon: Shield },
        { text: 'HD video quality', icon: Video },
        { text: 'Reconnect history', icon: Clock },
      ],
      popular: true,
      color: 'from-[#d946ef] to-[#9333ea]'
    },
    {
      id: 'vip',
      name: 'VIP',
      price: 49.99,
      period: 'month',
      description: 'For power users',
      features: [
        { text: 'Everything in Pro', icon: Check },
        { text: 'Verified badge', icon: Crown },
        { text: 'Extended sessions', icon: Clock },
        { text: '24/7 VIP support', icon: Star },
        { text: 'Early access features', icon: Sparkles },
      ],
      popular: false,
      color: 'from-[#f59e0b] to-[#d97706]'
    }
  ];

  const handleSubscribe = async (packageId) => {
    if (!token) {
      toast.error('Please sign in first');
      navigate('/');
      return;
    }

    setLoading(packageId);
    try {
      const response = await fetch(`${API}/api/payments/checkout?package_id=${packageId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': window.location.origin
        }
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();
      
      // Redirect to Stripe
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Header */}
      <header className="glass px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button 
            onClick={() => navigate('/')} 
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
          
          <div className="w-20" /> {/* Spacer for centering */}
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <Badge className="bg-[#d946ef]/20 text-[#d946ef] border-[#d946ef]/30">
            <Crown className="w-3 h-3 mr-1" />
            Premium Plans
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-bold font-['Syne']">
            Upgrade Your
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#d946ef] to-[#9333ea]">
              Chat Experience
            </span>
          </h1>
          
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Get priority matching, HD video, reconnect history, and more. 
            Choose the plan that fits your needs.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className={`relative glass rounded-3xl p-8 transition-transform duration-300 hover:-translate-y-2 ${
                  pkg.popular ? 'glow-accent' : ''
                }`}
                data-testid={`package-${pkg.id}`}
              >
                {pkg.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-[#d946ef] to-[#9333ea] text-white px-4 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}
                
                <div className="space-y-6">
                  {/* Header */}
                  <div>
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r ${pkg.color} mb-4`}>
                      <Crown className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold font-['Syne']">{pkg.name}</h3>
                    <p className="text-sm text-slate-400">{pkg.description}</p>
                  </div>
                  
                  {/* Price */}
                  <div className="py-4 border-y border-white/10">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">${pkg.price}</span>
                      <span className="text-slate-400">/{pkg.period}</span>
                    </div>
                  </div>
                  
                  {/* Features */}
                  <ul className="space-y-4">
                    {pkg.features.map((feature, i) => (
                      <li key={i} className={`flex items-center gap-3 ${feature.highlight ? 'text-[#d946ef]' : ''}`}>
                        <div className={`w-6 h-6 rounded-full bg-gradient-to-r ${feature.highlight ? 'from-[#d946ef] to-[#9333ea]' : pkg.color} bg-opacity-20 flex items-center justify-center`}>
                          <feature.icon className="w-3 h-3 text-white" />
                        </div>
                        <span className={feature.highlight ? 'font-medium' : 'text-slate-300'}>{feature.text}</span>
                      </li>
                    ))}
                  </ul>
                  
                  {/* CTA */}
                  <Button
                    onClick={() => handleSubscribe(pkg.id)}
                    disabled={loading === pkg.id || (user?.premium_tier === pkg.id)}
                    className={`w-full h-12 rounded-full bg-gradient-to-r ${pkg.color} hover:opacity-90 transition-opacity`}
                    data-testid={`subscribe-${pkg.id}-btn`}
                  >
                    {loading === pkg.id ? 'Loading...' : 
                     user?.premium_tier === pkg.id ? 'Current Plan' : 
                     'Get Started'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-6 bg-[#0A0A0A]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold font-['Syne'] text-center mb-12">
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-4">
            {[
              {
                q: 'Can I cancel anytime?',
                a: 'Yes, you can cancel your subscription at any time. Your premium features will remain active until the end of your billing period.'
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept all major credit cards, debit cards, and various digital payment methods through our secure payment processor.'
              },
              {
                q: 'Is there a free trial?',
                a: 'Currently, we do not offer a free trial. However, you can use TalkNow for free with basic features before deciding to upgrade.'
              },
              {
                q: 'Can I upgrade or downgrade my plan?',
                a: 'Yes, you can change your plan at any time. When upgrading, you will be charged the prorated difference. When downgrading, the new rate applies at your next billing cycle.'
              }
            ].map((faq, i) => (
              <div key={i} className="glass rounded-xl p-6">
                <h4 className="font-semibold mb-2">{faq.q}</h4>
                <p className="text-sm text-slate-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm text-slate-500">
            Secure payments powered by Stripe. Your payment information is never stored on our servers.
          </p>
        </div>
      </footer>
    </div>
  );
}

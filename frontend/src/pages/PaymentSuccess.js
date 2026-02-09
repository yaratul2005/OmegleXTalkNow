import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle, XCircle, Loader2, ArrowRight, Sparkles } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  
  const [status, setStatus] = useState('checking'); // checking, success, failed
  const [paymentDetails, setPaymentDetails] = useState(null);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId) {
      setStatus('failed');
      return;
    }

    let attempts = 0;
    const maxAttempts = 10;
    const pollInterval = 2000;

    const pollStatus = async () => {
      try {
        const response = await fetch(`${API}/api/payments/status/${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) throw new Error('Failed to check status');

        const data = await response.json();
        setPaymentDetails(data);

        if (data.payment_status === 'paid') {
          setStatus('success');
          return;
        }

        if (data.status === 'expired' || attempts >= maxAttempts) {
          setStatus('failed');
          return;
        }

        attempts++;
        setTimeout(pollStatus, pollInterval);
      } catch (error) {
        console.error('Status check error:', error);
        if (attempts >= maxAttempts) {
          setStatus('failed');
        } else {
          attempts++;
          setTimeout(pollStatus, pollInterval);
        }
      }
    };

    pollStatus();
  }, [sessionId, token]);

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="glass rounded-3xl p-8 text-center space-y-6">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold font-['Syne']">TalkNow</span>
          </div>

          {status === 'checking' && (
            <>
              <div className="w-20 h-20 mx-auto rounded-full bg-[#6366f1]/20 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-[#6366f1] animate-spin" />
              </div>
              <div>
                <h2 className="text-2xl font-bold font-['Syne']">Processing Payment</h2>
                <p className="text-slate-400 mt-2">Please wait while we confirm your payment...</p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold font-['Syne']">Payment Successful!</h2>
                <p className="text-slate-400 mt-2">
                  Welcome to TalkNow Premium! Your account has been upgraded.
                </p>
              </div>
              
              {paymentDetails && (
                <div className="bg-white/5 rounded-xl p-4 text-left">
                  <p className="text-sm text-slate-400">Amount paid</p>
                  <p className="text-xl font-bold">
                    ${(paymentDetails.amount_total / 100).toFixed(2)} {paymentDetails.currency?.toUpperCase()}
                  </p>
                </div>
              )}
              
              <Button
                onClick={() => navigate('/chat')}
                className="w-full h-12 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-full"
                data-testid="start-premium-chat-btn"
              >
                Start Premium Chat
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </>
          )}

          {status === 'failed' && (
            <>
              <div className="w-20 h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-red-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold font-['Syne']">Payment Failed</h2>
                <p className="text-slate-400 mt-2">
                  Something went wrong with your payment. Please try again.
                </p>
              </div>
              
              <div className="flex gap-4">
                <Button
                  onClick={() => navigate('/premium')}
                  variant="outline"
                  className="flex-1 h-12 border-white/20 hover:bg-white/10 rounded-full"
                  data-testid="try-again-btn"
                >
                  Try Again
                </Button>
                <Button
                  onClick={() => navigate('/')}
                  className="flex-1 h-12 bg-white/10 hover:bg-white/20 rounded-full"
                  data-testid="go-home-btn"
                >
                  Go Home
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

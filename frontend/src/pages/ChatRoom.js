import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, SkipForward,
  Send, Flag, Settings, Sparkles, MessageSquare, Users,
  Loader2, Shield, Crown, Lock
} from 'lucide-react';

const getWSUrl = () => {
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  if (backendUrl) {
    return backendUrl.replace('https://', 'wss://').replace('http://', 'ws://');
  }
  // Fallback to current window location for proxy usage
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}`;
};

const WS_URL = getWSUrl();

export default function ChatRoom() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, createAnonymousSession, isAnonymous } = useAuth();

  // State
  const [status, setStatus] = useState('idle'); // idle, searching, connected
  const [chatType, setChatType] = useState('video'); // video, text
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [partnerId, setPartnerId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [queueSize, setQueueSize] = useState(0);
  const [interests, setInterests] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [genderPreference, setGenderPreference] = useState('any'); // any, male, female

  // Video state
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Refs
  const wsRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);

  // WebRTC Configuration - will be updated from server
  const [rtcConfig, setRtcConfig] = useState({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  });

  // Trial state
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [trialEligible, setTrialEligible] = useState(false);

  // Check if user is premium
  const isPremium = user?.is_premium || false;

  // Initialize auth and check trial eligibility
  useEffect(() => {
    const init = async () => {
      if (!isAuthenticated) {
        await createAnonymousSession();
      } else if (!isAnonymous) {
        // Check trial eligibility for logged-in users
        try {
          const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/trial/status`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await response.json();
          setTrialEligible(data.eligible);
        } catch (error) {
          console.error('Trial check error:', error);
        }
      }
    };
    init();
  }, [isAuthenticated, createAnonymousSession, isAnonymous, token]);

  // Initialize WebSocket
  useEffect(() => {
    if (!user || !token) return;

    const userId = isAnonymous ? user.session_id : user.id;
    const ws = new WebSocket(`${WS_URL}/ws/${userId}?token=${token}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'matched':
          setStatus('connected');
          setPartnerId(data.partner_id);
          setSessionId(data.session_id);
          setChatType(data.chat_type);
          toast.success('Connected! Say hello 👋');

          // Update ICE servers from server response
          if (data.ice_servers) {
            setRtcConfig({ iceServers: data.ice_servers });
          }

          // If video chat, create offer
          if (data.chat_type === 'video' && peerConnectionRef.current) {
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);
            ws.send(JSON.stringify({
              type: 'offer',
              data: offer,
              partner_id: data.partner_id
            }));
          }
          break;

        case 'waiting':
          setQueueSize(data.queue_size);
          break;

        case 'offer':
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.data));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            ws.send(JSON.stringify({
              type: 'answer',
              data: answer,
              partner_id: data.from
            }));
          }
          break;

        case 'answer':
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.data));
          }
          break;

        case 'ice-candidate':
          if (peerConnectionRef.current && data.data) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.data));
          }
          break;

        case 'chat_message':
          setMessages(prev => [...prev, {
            id: Date.now(),
            content: data.content,
            from: data.from,
            isOwn: false,
            isWarned: data.is_warned
          }]);
          break;

        case 'message_blocked':
          toast.error('Message blocked: ' + data.reason);
          break;

        case 'partner_disconnected':
          toast.info('Partner disconnected');
          handleDisconnect();
          break;

        case 'ready_to_match':
          setStatus('searching');
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast.error('Connection error');
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };

    wsRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [user, token, isAnonymous]);

  // Initialize media and WebRTC
  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: chatType === 'video',
        audio: true
      });

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Setup WebRTC
      const pc = new RTCPeerConnection(rtcConfig);

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN && partnerId) {
          wsRef.current.send(JSON.stringify({
            type: 'ice-candidate',
            data: event.candidate,
            partner_id: partnerId
          }));
        }
      };

      peerConnectionRef.current = pc;
    } catch (error) {
      console.error('Media error:', error);
      toast.error('Failed to access camera/microphone');
      setChatType('text');
    }
  }, [chatType, partnerId]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [localStream]);

  // Start searching
  const startSearching = async () => {
    if (chatType === 'video') {
      await initializeMedia();
    }

    setStatus('searching');
    setMessages([]);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'find_match',
        interests,
        prefer_video: chatType === 'video',
        use_trial: isTrialActive,
        gender_preference: isPremium && genderPreference !== 'any' ? genderPreference : null
      }));
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'disconnect',
        session_id: sessionId,
        partner_id: partnerId
      }));
    }

    setStatus('idle');
    setPartnerId(null);
    setSessionId(null);
    setMessages([]);

    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }
  };

  // Skip to next
  const handleSkip = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'skip',
        session_id: sessionId,
        partner_id: partnerId
      }));
    }

    setPartnerId(null);
    setSessionId(null);
    setMessages([]);

    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }

    // Re-search
    startSearching();
  };

  // Send message
  const sendMessage = () => {
    if (!inputMessage.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'chat_message',
      session_id: sessionId,
      content: inputMessage,
      partner_id: partnerId
    }));

    setMessages(prev => [...prev, {
      id: Date.now(),
      content: inputMessage,
      isOwn: true
    }]);

    setInputMessage('');
  };

  // Toggle video/audio
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // Report user
  const handleReport = async () => {
    if (!reportReason.trim()) {
      toast.error('Please select a reason');
      return;
    }

    try {
      await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          session_id: sessionId,
          reported_user_id: partnerId,
          reason: reportReason
        })
      });

      toast.success('Report submitted');
      setShowReportModal(false);
      setReportReason('');
      handleSkip();
    } catch (error) {
      toast.error('Failed to submit report');
    }
  };

  const availableInterests = [
    'Gaming', 'Music', 'Movies', 'Sports', 'Tech', 'Art',
    'Travel', 'Food', 'Fitness', 'Books', 'Anime', 'Crypto'
  ];

  const toggleInterest = (interest) => {
    setInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest].slice(0, 5)
    );
  };

  // Activate premium trial
  const activateTrial = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/trial/activate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setIsTrialActive(true);
        setTrialEligible(false);
        toast.success(data.message);
      } else {
        toast.error(data.detail || 'Failed to activate trial');
      }
    } catch (error) {
      toast.error('Failed to activate trial');
    }
  };

  return (
    <div className="fixed inset-0 bg-[#050505] flex flex-col overflow-hidden">
      {/* Header - Fixed Height */}
      <header className="glass px-4 py-3 md:px-6 md:py-4 flex items-center justify-between flex-none z-50 h-[60px] md:h-[72px]" data-testid="chat-header">
        <div className="flex items-center gap-3 md:gap-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold font-['Syne'] hidden md:block">TalkNow</span>
          </button>

          {status === 'connected' && (
            <Badge className="bg-[#22d3ee]/20 text-[#22d3ee] border-[#22d3ee]/30">
              <span className="w-2 h-2 rounded-full bg-[#22d3ee] mr-2 animate-pulse" />
              Connected
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-white/10 hidden sm:flex">
            <Users className="w-3 h-3 mr-1" />
            {queueSize} online
          </Badge>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/settings')}
            className="rounded-full hover:bg-white/10"
            data-testid="settings-btn"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Content - Takes Remaining Space */}
      <main className="flex-1 relative w-full overflow-hidden" data-testid="chat-main">

        {/* IDLE STATE - Centered Content */}
        {status === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center p-4 overflow-y-auto">
            <div className="max-w-lg w-full space-y-8 text-center my-auto">
              <div className="space-y-4">
                <h2 className="text-3xl font-bold font-['Syne']">Ready to Connect?</h2>
                <p className="text-slate-400">Choose your chat mode and start meeting new people</p>
              </div>

              {/* Chat Type Selection */}
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setChatType('video')}
                  className={`glass rounded-2xl p-6 flex-1 max-w-[200px] transition-all duration-300 ${chatType === 'video' ? 'glow-primary border-[#6366f1]/50' : 'hover:bg-white/5'
                    }`}
                  data-testid="video-mode-btn"
                >
                  <Video className={`w-8 h-8 mx-auto mb-3 ${chatType === 'video' ? 'text-[#6366f1]' : 'text-slate-400'}`} />
                  <p className="font-medium">Video Chat</p>
                  <p className="text-xs text-slate-500 mt-1">Face to face</p>
                </button>

                <button
                  onClick={() => setChatType('text')}
                  className={`glass rounded-2xl p-6 flex-1 max-w-[200px] transition-all duration-300 ${chatType === 'text' ? 'glow-primary border-[#6366f1]/50' : 'hover:bg-white/5'
                    }`}
                  data-testid="text-mode-btn"
                >
                  <MessageSquare className={`w-8 h-8 mx-auto mb-3 ${chatType === 'text' ? 'text-[#6366f1]' : 'text-slate-400'}`} />
                  <p className="font-medium">Text Chat</p>
                  <p className="text-xs text-slate-500 mt-1">Anonymous text</p>
                </button>
              </div>

              {/* Interests - FREE for everyone */}
              <div className="space-y-4">
                <p className="text-sm text-slate-400">Select up to 5 interests for better matching (free)</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {availableInterests.map(interest => (
                    <button
                      key={interest}
                      onClick={() => toggleInterest(interest)}
                      className={`interest-tag ${interests.includes(interest) ? 'selected' : ''}`}
                      data-testid={`interest-${interest.toLowerCase()}`}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gender Filter - PREMIUM ONLY */}
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <p className="text-sm text-slate-400">Gender preference</p>
                  {!isPremium && (
                    <Badge className="bg-[#d946ef]/20 text-[#d946ef] border-[#d946ef]/30 text-xs">
                      <Crown className="w-3 h-3 mr-1" />
                      Premium
                    </Badge>
                  )}
                </div>

                <div className="flex gap-3 justify-center">
                  {['any', 'male', 'female'].map((gender) => (
                    <button
                      key={gender}
                      onClick={() => isPremium ? setGenderPreference(gender) : toast.error('Gender filter is a premium feature')}
                      disabled={!isPremium && gender !== 'any'}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${genderPreference === gender
                        ? 'bg-[#6366f1] text-white'
                        : isPremium || gender === 'any'
                          ? 'bg-white/5 border border-white/10 hover:bg-white/10'
                          : 'bg-white/5 border border-white/10 opacity-50 cursor-not-allowed'
                        }`}
                      data-testid={`gender-${gender}`}
                    >
                      {!isPremium && gender !== 'any' && <Lock className="w-3 h-3 inline mr-1" />}
                      {gender.charAt(0).toUpperCase() + gender.slice(1)}
                    </button>
                  ))}
                </div>

                {!isPremium && (
                  <button
                    onClick={() => navigate('/premium')}
                    className="text-xs text-[#d946ef] hover:underline"
                  >
                    Upgrade to unlock gender filter →
                  </button>
                )}
              </div>

              <Button
                onClick={startSearching}
                className="h-14 px-12 text-lg bg-gradient-to-r from-[#6366f1] to-[#4f46e5] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] rounded-full transition-shadow duration-300 w-full md:w-auto"
                data-testid="start-chat-btn"
              >
                Start Chat
              </Button>

              {/* Premium Trial CTA */}
              {trialEligible && !isAnonymous && (
                <div className="glass rounded-2xl p-4 mt-6 glow-accent">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold flex items-center gap-2">
                        <Crown className="w-4 h-4 text-[#d946ef]" />
                        Free HD Video Trial
                      </p>
                      <p className="text-sm text-slate-400">Try premium features for one chat</p>
                    </div>
                    <Button
                      onClick={activateTrial}
                      className="bg-gradient-to-r from-[#d946ef] to-[#9333ea] hover:opacity-90 rounded-full"
                      data-testid="activate-trial-btn"
                    >
                      Activate
                    </Button>
                  </div>
                </div>
              )}

              {isTrialActive && (
                <Badge className="bg-[#d946ef]/20 text-[#d946ef] border-[#d946ef]/30 mt-4">
                  <Crown className="w-3 h-3 mr-1" />
                  Trial Active - HD Video Enabled
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* SEARCHING STATE */}
        {status === 'searching' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center space-y-6">
              <div className="w-24 h-24 mx-auto rounded-full bg-[#6366f1]/20 flex items-center justify-center matching-pulse">
                <Loader2 className="w-12 h-12 text-[#6366f1] animate-spin" />
              </div>
              <div>
                <h2 className="text-2xl font-bold font-['Syne'] mb-2">Finding someone...</h2>
                <p className="text-slate-400">This usually takes a few seconds</p>
              </div>
              <Button
                onClick={() => { setStatus('idle'); handleDisconnect(); }}
                variant="outline"
                className="border-white/20 hover:bg-white/10 rounded-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* CONNECTED STATE */}
        {status === 'connected' && (
          <div className="absolute inset-0 flex flex-col lg:p-6 lg:gap-4 lg:grid lg:grid-cols-2">

            {/* LEFT PANEL: Video/Placeholder + CONTROLS (Desktop) */}
            <div className={`flex flex-col gap-4 ${chatType === 'text' ? 'hidden lg:flex h-full' : 'h-[40vh] lg:h-auto relative flex-none lg:flex-1'}`}>
              {/* Content Area (Video or Text Placeholder) */}
              <div className="flex-1 relative min-h-0">
                {chatType === 'video' ? (
                  <div className="w-full h-full rounded-2xl overflow-hidden glass relative">
                    {/* Remote Video */}
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    {/* Local Video PiP */}
                    <div className="absolute bottom-4 right-4 w-32 h-48 rounded-xl overflow-hidden border border-white/20 shadow-2xl bg-black">
                      <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    </div>
                  </div>
                ) : (
                  /* Desktop Text Mode Placeholder */
                  <div className="w-full h-full glass rounded-2xl flex items-center justify-center">
                    <div className="text-center">
                      <MessageSquare className="w-16 h-16 text-white/20 mx-auto mb-4" />
                      <h3 className="text-xl font-bold">Text Chat Mode</h3>
                      <p className="text-white/40 text-sm mt-2">Controls are below</p>
                    </div>
                  </div>
                )}
              </div>

              {/* DESKTOP CONTROLS (Floating in Left Panel) */}
              <div className="hidden lg:flex items-center justify-center p-4 glass rounded-2xl">
                <div className="flex items-center gap-4">
                  <Button onClick={toggleVideo} variant={videoEnabled ? "ghost" : "destructive"} size="icon" className="rounded-full h-12 w-12 hover:bg-white/10">
                    {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                  </Button>
                  <Button onClick={toggleAudio} variant={audioEnabled ? "ghost" : "destructive"} size="icon" className="rounded-full h-12 w-12 hover:bg-white/10">
                    {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                  </Button>
                  <Button onClick={handleSkip} className="rounded-full h-12 px-8 bg-gradient-to-r from-[#d946ef] to-[#9333ea] hover:shadow-[0_0_20px_rgba(217,70,239,0.4)] transition-all">
                    <SkipForward className="w-5 h-5 mr-2" /> Next
                  </Button>
                  <Button onClick={handleDisconnect} variant="destructive" size="icon" className="rounded-full h-12 w-12">
                    <PhoneOff className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: Chat Area */}
            <div className={`flex flex-col flex-1 relative overflow-hidden ${chatType === 'text' ? 'lg:rounded-2xl lg:border lg:border-white/10 glass' : 'rounded-b-2xl glass'}`}>

              {/* Chat Header (Mobile Only) */}
              <div className="flex-none p-4 flex items-center justify-between border-b border-white/10 bg-black/40 backdrop-blur-md lg:hidden">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                  <span className="font-semibold">Stranger</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setShowReportModal(true)} className="h-8 w-8 text-slate-400 hover:text-red-500">
                    <Flag className="w-4 h-4" />
                  </Button>
                  <Button variant="destructive" size="icon" onClick={handleDisconnect} className="h-8 w-8 rounded-full">
                    <PhoneOff className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Desktop Chat Header */}
              <div className="hidden lg:flex flex-none p-4 items-center justify-between border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                  <div>
                    <h3 className="font-semibold font-['Syne']">Chat</h3>
                    <p className="text-xs text-slate-400">Connected with stranger</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowReportModal(true)} className="text-xs text-slate-400 hover:text-red-500">
                  <Flag className="w-3 h-3 mr-1" /> Report
                </Button>
              </div>

              {/* Messages - Scrollable Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 opacity-50">
                    <MessageSquare className="w-8 h-8" />
                    <p>Start chatting...</p>
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`message-bubble ${msg.isOwn ? 'sent' : 'received'}`}>
                    {msg.content}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="flex-none p-3 md:p-4 bg-black/60 border-t border-white/10 backdrop-blur-md">
                <div className="flex gap-2">
                  {/* Mobile Skip Button */}
                  <div className="lg:hidden">
                    {chatType === 'text' && (
                      <Button onClick={handleSkip} className="h-12 w-12 rounded-full bg-slate-800 flex-none"><SkipForward className="w-5 h-5" /></Button>
                    )}
                  </div>

                  <Input
                    value={inputMessage}
                    onChange={e => setInputMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    placeholder="Type message..."
                    className="h-12 rounded-full bg-white/5 border-white/10 px-4 focus:border-indigo-500"
                  />
                  <Button onClick={sendMessage} className="h-12 w-12 rounded-full bg-indigo-600 hover:bg-indigo-700 flex-none">
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* MOBILE CONTROLS (Floating Bottom - Hidden on Desktop) */}
      {status === 'connected' && (chatType === 'video') && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 lg:hidden">
          <div className="controls-bar">
            <Button onClick={toggleVideo} variant={videoEnabled ? "ghost" : "destructive"} size="icon" className="rounded-full h-12 w-12">
              {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </Button>
            <Button onClick={toggleAudio} variant={audioEnabled ? "ghost" : "destructive"} size="icon" className="rounded-full h-12 w-12">
              {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </Button>
            <Button onClick={handleSkip} className="rounded-full h-12 px-6 bg-gradient-to-r from-pink-500 to-purple-600">
              <SkipForward className="w-5 h-5 mr-2" /> Next
            </Button>
            <Button onClick={handleDisconnect} variant="destructive" size="icon" className="rounded-full h-12 w-12">
              <PhoneOff className="w-5 h-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

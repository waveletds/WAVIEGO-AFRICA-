/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Send, 
  User, 
  MessageCircle, 
  ArrowLeft, 
  MoreVertical, 
  Phone, 
  Video, 
  Paperclip,
  Check,
  CheckCheck,
  Wallet,
  ArrowRightLeft,
  Smartphone,
  History,
  Lock,
  X,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Download,
  Search,
  Mic,
  Camera,
  Plus,
  Image as ImageIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toPng } from "html-to-image";
import { getGeminiResponse } from "./services/geminiService";
import { Receipt } from "./components/Receipt";
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from './lib/firebase';

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: string;
  status: "sent" | "delivered" | "read";
  type?: "text" | "action";
  action?: any;
}

interface UserData {
  id: string;
  phone: string;
  wallet_balance: number;
  fullname: string;
  email?: string;
  dob?: string;
  bvn?: string;
  address?: string;
  state?: string;
  virtual_bank: string;
  virtual_account: string;
  virtual_account_name: string;
  kyc_completed: boolean;
  kyc_step: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Welcome to Waviego Africa! I am your AI banking assistant. How can I help you today?",
      sender: "ai",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: "read"
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [downloadingReceipt, setDownloadingReceipt] = useState<any>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [selectedTxDetail, setSelectedTxDetail] = useState<any | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const [showFundModal, setShowFundModal] = useState(false);
  
  // KYC State
  const [kycStep, setKycStep] = useState<string>("init");
  const [kycPhone, setKycPhone] = useState("");
  const [kycOtp, setKycOtp] = useState("");
  const [kycFullname, setKycFullname] = useState("");
  const [kycEmail, setKycEmail] = useState("");
  const [kycDob, setKycDob] = useState("");
  const [kycIdType, setKycIdType] = useState<string>("BVN");
  const [kycIdNumber, setKycIdNumber] = useState("");
  const [kycAddress, setKycAddress] = useState("");
  const [kycState, setKycState] = useState("");
  const [kycPin, setKycPin] = useState("");
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState("");
  const [kycDemoOtp, setKycDemoOtp] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState({ gemini: false, monnify: false, twilio: false });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    fetchUserData();
    fetchApiStatus();

    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firebase Connection Verified");
      } catch (error) {
        if (error instanceof Error && error.message.includes('permission-denied')) {
          // This is fine, just means we can't read the test collection
          console.log("Firebase Connected (Permission Restricted)");
        } else if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
    
    // Initialize Web Speech API
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput(transcript);
          setIsRecording(false);
        };

        recognitionRef.current.onerror = () => {
          setIsRecording(false);
        };

        recognitionRef.current.onend = () => {
          setIsRecording(false);
        };
      }
    }
  }, []);

  const startRecording = () => {
    if (recognitionRef.current) {
      setIsRecording(true);
      recognitionRef.current.start();
    } else {
      alert("Speech recognition is not supported in this browser.");
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const fetchUserData = async () => {
    try {
      const res = await fetch("/api/user");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new TypeError("Oops, we didn't get JSON!");
      }
      const data = await res.json();
      setUserData(data);
      if (!data.kyc_completed) {
        setKycStep(data.kyc_step || "phone_input");
      }
    } catch (err) {
      console.error("Failed to fetch user data", err);
    }
  };

  const fetchApiStatus = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setApiStatus(data);
    } catch (err) {
      console.error("Failed to fetch API status", err);
    }
  };

  const startKyc = async () => {
    setKycLoading(true);
    setKycError("");
    try {
      const res = await fetch("/api/kyc/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: kycPhone })
      });
      const data = await res.json();
      if (res.ok) {
        setKycStep(data.step);
        if (data.demo_otp) {
          setKycDemoOtp(data.demo_otp);
        } else {
          setKycDemoOtp(null);
        }
      } else {
        setKycError(data.error);
      }
    } catch (err) {
      setKycError("Failed to start KYC");
    } finally {
      setKycLoading(false);
    }
  };

  const verifyOtp = async () => {
    setKycLoading(true);
    setKycError("");
    try {
      const res = await fetch("/api/kyc/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: kycPhone, otp: kycOtp })
      });
      const data = await res.json();
      if (res.ok) {
        setKycStep(data.step);
      } else {
        setKycError(data.error);
      }
    } catch (err) {
      setKycError("Verification failed");
    } finally {
      setKycLoading(false);
    }
  };

  const savePersonalInfo = async () => {
    setKycLoading(true);
    setKycError("");
    try {
      const res = await fetch("/api/kyc/personal-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: kycPhone, fullname: kycFullname, email: kycEmail, dob: kycDob })
      });
      const data = await res.json();
      if (res.ok) {
        setKycStep(data.step);
      } else {
        setKycError(data.error);
      }
    } catch (err) {
      setKycError("Failed to save personal info");
    } finally {
      setKycLoading(false);
    }
  };

  const verifyIdentity = async () => {
    setKycLoading(true);
    setKycError("");
    try {
      const res = await fetch("/api/kyc/verify-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: kycPhone, idType: kycIdType, idNumber: kycIdNumber })
      });
      const data = await res.json();
      if (res.ok) {
        setKycStep(data.step);
      } else {
        setKycError(data.error);
      }
    } catch (err) {
      setKycError("Identity verification failed");
    } finally {
      setKycLoading(false);
    }
  };

  const saveAddress = async () => {
    setKycLoading(true);
    setKycError("");
    try {
      const res = await fetch("/api/kyc/address-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: kycPhone, address: kycAddress, state: kycState })
      });
      const data = await res.json();
      if (res.ok) {
        setKycStep(data.step);
      } else {
        setKycError(data.error);
      }
    } catch (err) {
      setKycError("Failed to save address");
    } finally {
      setKycLoading(false);
    }
  };

  const finalizeKyc = async () => {
    setKycLoading(true);
    setKycError("");
    try {
      const res = await fetch("/api/kyc/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: kycPhone, pin: kycPin })
      });
      const data = await res.json();
      if (res.ok) {
        setUserData(data.user);
        setKycStep("completed");
      } else {
        setKycError(data.error);
      }
    } catch (err) {
      setKycError("Failed to set PIN");
    } finally {
      setKycLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await fetch("/api/transactions");
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      console.error("Failed to fetch transactions", err);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() && !selectedImage) return;

    const currentInput = input;
    const currentImage = selectedImage;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: currentInput || (currentImage ? "Uploaded an image for processing..." : ""),
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: "sent"
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSelectedImage(null);
    setIsTyping(true);

    try {
      // Build history for Gemini
      const history = messages.map(m => ({
        role: m.sender === "user" ? "user" : "model",
        parts: [{ text: m.text }]
      }));
      history.push({ role: "user", parts: [{ text: currentInput || "Analyze this image for banking details." }] });

      // Get image base64 without prefix for Gemini API
      const imageBase64 = currentImage ? currentImage.split(',')[1] : undefined;

      const response = await getGeminiResponse(history, imageBase64);
      const aiText = response.text || "I'm processing that for you...";
      const functionCalls = response.functionCalls;

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: aiText,
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: "read"
      };

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        handleFunctionCall(call, aiMsg);
      } else {
        setMessages(prev => [...prev, aiMsg]);
        setIsTyping(false);
      }

    } catch (err) {
      console.error("Gemini Error:", err);
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Sorry, I'm having trouble connecting right now. Please try again.",
        sender: "ai",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: "read"
      }]);
    }
  };

  const handleFunctionCall = (call: any, aiMsg: Message) => {
    setIsTyping(false);
    
    if (call.name === "get_balance") {
      aiMsg.text = `Your current balance is ₦${userData?.wallet_balance.toLocaleString()}.`;
      setMessages(prev => [...prev, aiMsg]);
    } else if (call.name === "send_money") {
      aiMsg.text = `Understood. You want to send ₦${call.args.amount.toLocaleString()} to ${call.args.recipient}. Please enter your transaction PIN to authorize this transfer.`;
      setMessages(prev => [...prev, aiMsg]);
      setPendingAction({ type: "transfer", ...call.args });
      setTimeout(() => setShowPinModal(true), 1000);
    } else if (call.name === "buy_airtime") {
      aiMsg.text = `Confirmed. buying ₦${call.args.amount.toLocaleString()} ${call.args.type} for ${call.args.phone} (${call.args.network}). Please enter your PIN to complete this.`;
      setMessages(prev => [...prev, aiMsg]);
      setPendingAction({ type: "vtu", ...call.args });
      setTimeout(() => setShowPinModal(true), 1000);
    } else if (call.name === "get_recent_transactions") {
      fetchTransactions();
      setShowHistory(true);
      aiMsg.text = "Here are your recent transactions.";
      setMessages(prev => [...prev, aiMsg]);
    } else {
      setMessages(prev => [...prev, aiMsg]);
    }
  };

  const executeAction = async () => {
    if (!pin) {
      setError("Please enter your PIN");
      return;
    }

    try {
      const endpoint = pendingAction.type === "transfer" ? "/api/transfer" : "/api/vtu";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pendingAction, pin })
      });

      const result = await res.json();

      if (res.ok) {
        setShowPinModal(false);
        setPin("");
        const completedAction = { ...pendingAction, ...result.transaction };
        setPendingAction(null);
        setError("");
        fetchUserData();
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: `✅ ${result.message}! Your new balance is ₦${result.balance.toLocaleString()}.`,
          sender: "ai",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: "read",
          type: "action",
          action: completedAction
        }]);
      } else {
        setError(result.error || "Transaction failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
  };

  const handleDownloadReceipt = async (action: any) => {
    setDownloadingReceipt(action);
    
    // Wait for render
    setTimeout(async () => {
      if (receiptRef.current) {
        try {
          const dataUrl = await toPng(receiptRef.current, { cacheBust: true, pixelRatio: 2 });
          const link = document.createElement('a');
          link.download = `Waviego-Receipt-${action.id || Date.now()}.png`;
          link.href = dataUrl;
          link.click();
          setDownloadingReceipt(null);
        } catch (err) {
          console.error("Failed to generate receipt", err);
          setDownloadingReceipt(null);
        }
      }
    }, 100);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] font-sans overflow-hidden text-[#F5F5F5]">
      {/* Background Decorative Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#075E54]/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      {!userData?.kyc_completed && kycStep !== "completed" ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 z-10 relative perspective-[1000px]">
          <motion.div 
            initial={{ opacity: 0, y: 40, rotateX: 15 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            whileHover={{ rotateX: 2, rotateY: 2, scale: 1.01 }}
            className="w-full max-w-md glass-dark p-8 rounded-[2.5rem] border border-white/10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] bg-opacity-80 transition-shadow duration-500"
          >
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-[#075E54] to-emerald-800 flex items-center justify-center border border-white/20 shadow-3d">
                <ShieldCheck className="w-10 h-10 text-white" />
              </div>
            </div>

            <h2 className="text-3xl font-display font-bold text-center mb-2 tracking-tight text-white">Waviego Onboarding</h2>
            <p className="text-center text-white/40 text-xs mb-10 uppercase tracking-[0.2em] font-black">AI-Powered Banking Setup</p>

            {kycStep === "phone_input" && (
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-emerald-500 mb-2 block">Phone Number</label>
                  <input 
                    type="tel"
                    value={kycPhone}
                    onChange={(e) => setKycPhone(e.target.value)}
                    placeholder="e.g. +234 800 000 0000"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>
                <button 
                  onClick={startKyc}
                  disabled={kycLoading || !kycPhone}
                  className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                >
                  {kycLoading ? "Initializing..." : "Verify Number"}
                </button>
              </div>
            )}

            {kycStep === "otp_verification" && (
              <div className="space-y-6">
                 <div>
                  <label className="text-[10px] font-black uppercase text-emerald-500 mb-2 block">Enter 4-Digit OTP</label>
                  <input 
                    type="text"
                    value={kycOtp}
                    onChange={(e) => setKycOtp(e.target.value)}
                    placeholder="0000"
                    maxLength={4}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white text-center text-2xl font-mono tracking-widest outline-none focus:border-emerald-500/50 transition-all"
                  />
                  {kycDemoOtp ? (
                    <div className="mt-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-center">
                      <p className="text-[10px] font-black uppercase text-orange-500 tracking-widest mb-1">Demo Mode OTP</p>
                      <p className="text-xl font-mono font-bold text-white tracking-[0.5em]">{kycDemoOtp}</p>
                      <p className="text-[9px] text-white/40 mt-1">Configure Twilio keys for real WhatsApp SMS</p>
                    </div>
                  ) : (
                    <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                      <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest mb-1">OTP SENT</p>
                      <p className="text-[11px] text-white/60">Check your phone for the verification code.</p>
                    </div>
                  )}
                </div>
                <button 
                  onClick={verifyOtp}
                  disabled={kycLoading || kycOtp.length < 4}
                  className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                >
                  {kycLoading ? "Verifying..." : "Confirm OTP"}
                </button>
              </div>
            )}

            {kycStep === "personal_info" && (
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-emerald-500 mb-2 block">Full Legal Name</label>
                  <input 
                    type="text"
                    value={kycFullname}
                    onChange={(e) => setKycFullname(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-emerald-500/50 transition-all mb-4"
                  />
                  <label className="text-[10px] font-black uppercase text-emerald-500 mb-2 block">Email Address</label>
                  <input 
                    type="email"
                    value={kycEmail}
                    onChange={(e) => setKycEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-emerald-500/50 transition-all mb-4"
                  />
                  <label className="text-[10px] font-black uppercase text-emerald-500 mb-2 block">Date of Birth</label>
                  <input 
                    type="date"
                    value={kycDob}
                    onChange={(e) => setKycDob(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>
                <button 
                  onClick={savePersonalInfo}
                  disabled={kycLoading || !kycFullname || !kycEmail || !kycDob}
                  className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                >
                  {kycLoading ? "Saving..." : "Continue"}
                </button>
              </div>
            )}

            {kycStep === "identity_verification" && (
              <div className="space-y-6">
                <div>
                  <p className="text-[11px] text-white/50 mb-6 text-center">Verify your identity with your Bank Verification Number (BVN) or National Identity Number (NIN).</p>
                  
                  <label className="text-[10px] font-black uppercase text-emerald-500 mb-2 block">Select ID Type</label>
                  <div className="flex gap-2 mb-6">
                    {["BVN", "NIN"].map((type) => (
                      <button
                        key={type}
                        onClick={() => setKycIdType(type)}
                        className={`flex-1 py-3 rounded-xl border font-bold text-[10px] uppercase tracking-widest transition-all ${
                          kycIdType === type 
                            ? "bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]" 
                            : "bg-white/5 border-white/10 text-white/40 hover:border-white/20"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  <label className="text-[10px] font-black uppercase text-emerald-500 mb-2 block">{kycIdType} (11 Digits)</label>
                  <input 
                    type="text"
                    value={kycIdNumber}
                    onChange={(e) => setKycIdNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="00000000000"
                    maxLength={11}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white font-mono text-center text-xl tracking-widest outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>
                <button 
                  onClick={verifyIdentity}
                  disabled={kycLoading || kycIdNumber.length !== 11}
                  className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                >
                  {kycLoading ? "Verifying..." : `Verify ${kycIdType}`}
                </button>
              </div>
            )}

            {kycStep === "address_verification" && (
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-emerald-500 mb-2 block">Residential Address</label>
                  <textarea 
                    value={kycAddress}
                    onChange={(e) => setKycAddress(e.target.value)}
                    placeholder="123 Waviego Way, Lekki"
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-emerald-500/50 transition-all mb-4 resize-none"
                  />
                  <label className="text-[10px] font-black uppercase text-emerald-500 mb-2 block">State</label>
                  <select 
                    value={kycState}
                    onChange={(e) => setKycState(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-emerald-500/50 transition-all"
                  >
                    <option value="" className="bg-[#0A0A0A]">Select State</option>
                    <option value="Lagos" className="bg-[#0A0A0A]">Lagos</option>
                    <option value="Abuja" className="bg-[#0A0A0A]">Abuja</option>
                    <option value="Rivers" className="bg-[#0A0A0A]">Rivers</option>
                    <option value="Kano" className="bg-[#0A0A0A]">Kano</option>
                  </select>
                </div>
                <button 
                  onClick={saveAddress}
                  disabled={kycLoading || !kycAddress || !kycState}
                  className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                >
                  {kycLoading ? "Saving Address..." : "Continue"}
                </button>
              </div>
            )}

            {kycStep === "pin_creation" && (
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-emerald-500 mb-2 block">Set Transaction PIN</label>
                  <input 
                    type="password"
                    value={kycPin}
                    onChange={(e) => setKycPin(e.target.value)}
                    placeholder="****"
                    maxLength={4}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white text-center text-3xl tracking-[0.5em] outline-none focus:border-emerald-500/50 transition-all"
                  />
                  <p className="mt-2 text-[10px] text-white/40 text-center uppercase tracking-wider font-bold">This will be used for all transfers</p>
                </div>
                <button 
                  onClick={finalizeKyc}
                  disabled={kycLoading || kycPin.length < 4}
                  className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                >
                  {kycLoading ? "Finalizing..." : "Complete Setup"}
                </button>
              </div>
            )}

            {kycError && (
              <p className="mt-6 text-rose-500 text-[10px] font-bold text-center uppercase tracking-widest">{kycError}</p>
            )}

            <div className="mt-10 flex items-center justify-center gap-3 opacity-30">
               {[ "Phone", "OTP", "Info", "ID", "Addr", "PIN" ].map((step, idx) => {
                 const stepMapping = ["phone_input", "otp_verification", "personal_info", "identity_verification", "address_verification", "pin_creation"];
                 const currentIdx = stepMapping.indexOf(kycStep);
                 const isActive = idx <= currentIdx;
                 return (
                   <React.Fragment key={step}>
                     <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-white/20'}`} />
                     {idx < 5 && <div className={`w-6 h-[1px] ${idx < currentIdx ? 'bg-emerald-500' : 'bg-white/10'}`} />}
                   </React.Fragment>
                 )
               })}
            </div>
          </motion.div>
        </div>
      ) : (
        <>
          {/* Header - Glassmorphic */}
      <header className="glass-dark border-b border-white/5 p-4 flex items-center justify-between z-20 sticky top-0">
        <div className="flex items-center gap-3">
          <motion.div 
            whileHover={{ scale: 1.1, rotate: 5 }}
            animate={{ 
              y: [0, -4, 0],
              rotate: [0, 2, 0, -2, 0]
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#075E54] to-[#0D9488] flex items-center justify-center border border-white/20 shadow-3d"
          >
            <ShieldCheck className="w-7 h-7 text-white" />
          </motion.div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-white">Waviego</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">AI Active</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-8 text-[11px] font-bold uppercase tracking-widest opacity-40">
            <span className="hover:opacity-100 cursor-pointer transition-opacity">Security</span>
            <span className="hover:opacity-100 cursor-pointer transition-opacity">Insurance</span>
            <span className="hover:opacity-100 cursor-pointer transition-opacity">Insights</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="w-10 h-10 rounded-full glass-dark flex items-center justify-center hover:bg-white/10 transition-colors">
              <User className="w-5 h-5 opacity-70" />
            </button>
            <button className="lg:hidden w-10 h-10 rounded-full glass-dark flex items-center justify-center hover:bg-white/10 transition-colors">
              <MoreVertical className="w-5 h-5 opacity-70" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Sidebar - Bento Style */}
        <aside className="hidden lg:flex flex-col w-80 border-r border-white/5 p-6 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-1">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#075E54]">Dashboard</h2>
            <p className="text-2xl font-serif italic text-white/90">Your Assets</p>
          </div>
          
          <div className="space-y-4">
            {/* Balance Card 3D */}
            <motion.div 
              whileHover={{ y: -8, rotateX: 5, rotateY: -5, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="p-5 rounded-[2rem] bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_-4px_8px_rgba(255,255,255,0.05)] relative group/bal overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] uppercase font-black text-white/30 tracking-widest text-nowrap">Available Balance</p>
                  <button 
                    onClick={() => setShowFundModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all font-inter"
                  >
                    <Plus className="w-3 h-3 text-emerald-500" />
                    <span className="text-[9px] font-black text-emerald-500">FUND</span>
                  </button>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold opacity-40">₦</span>
                  <p className="text-3xl font-mono tracking-tighter text-white font-bold">{userData?.wallet_balance.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2 mt-4">
                   <div className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-500">
                     +12.5% EARNINGS
                   </div>
                </div>
              </div>
              <button 
                onClick={() => handleDownloadReceipt({ type: 'balance', amount: userData?.wallet_balance, id: 'BAL-' + Date.now() })}
                className="absolute bottom-4 right-4 opacity-0 group-hover/bal:opacity-100 transition-all p-2 glass rounded-xl text-black hover:scale-110"
              >
                <Download className="w-4 h-4" />
              </button>
            </motion.div>

            {/* Virtual Account Bento */}
            <motion.div 
              whileHover={{ y: -4, scale: 1.02 }}
              onClick={() => setShowFundModal(true)}
              className="p-5 rounded-[2rem] bg-[#1A1A1A]/40 border border-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.2)] cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] uppercase font-black text-white/30 tracking-tight">Deposit Account</p>
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                   <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                </div>
              </div>
              <p className="text-xl font-mono tracking-wider text-white/90 mb-1 leading-none group-hover:text-emerald-400 transition-colors">{userData?.virtual_account}</p>
              <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{userData?.virtual_bank || "Generating..."}</p>
              <p className="mt-4 text-[9px] font-bold text-white/20 uppercase tracking-widest leading-tight">{userData?.virtual_account_name}</p>
            </motion.div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Wallet, label: "Balance", cmd: "Check my balance" },
                { icon: ArrowRightLeft, label: "Transfer", cmd: "Send money" },
                { icon: Smartphone, label: "VTU", cmd: "Buy airtime or data" },
                { icon: History, label: "Ledger", action: () => { fetchTransactions(); setShowHistory(true); } }
              ].map((item, idx) => (
                <motion.button 
                  key={idx}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => item.action ? item.action() : setInput(item.cmd || "")}
                  className="flex flex-col items-center justify-center p-4 bg-[#1A1A1A]/60 border border-white/5 rounded-[1.5rem] hover:bg-emerald-600 hover:border-emerald-500 transition-all group"
                >
                  <item.icon className="w-6 h-6 mb-2 group-hover:text-white text-emerald-500 transition-colors" />
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-60 group-hover:opacity-100">{item.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
          
          <div className="mt-auto p-4 rounded-2xl border border-white/5 bg-white/5">
             <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                <p className="text-[10px] font-bold text-white/40">SECURITY STATUS</p>
             </div>
             <p className="text-[11px] text-white/60 leading-relaxed font-medium">Advanced Encryption Standard (AES-256) is active for all transactions.</p>
             
             <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Service Status</p>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${apiStatus.gemini ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
                    <span className="text-[9px] font-bold text-white/50">AI</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${apiStatus.monnify ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-orange-500'}`} />
                    <span className="text-[9px] font-bold text-white/50">MON</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${apiStatus.twilio ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-blue-500'}`} />
                    <span className="text-[9px] font-bold text-white/50">SMS</span>
                  </div>
                </div>
             </div>

             <button 
                onClick={async () => {
                  await fetch("/api/kyc/reset", { method: "POST" });
                  fetchUserData();
                }}
                className="mt-4 w-full py-2 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-emerald-500 hover:border-emerald-500 hover:bg-emerald-500/5 transition-all"
             >
                Reset Account (Demo Onboarding)
             </button>
          </div>
        </aside>

        {/* Chat Area - 3D Neumorphic Bumps */}
        <main className="flex-1 flex flex-col relative bg-transparent overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-32">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  key={m.id}
                  className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[80%] flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}>
                  <div 
                      className={`p-4 rounded-[1.5rem] shadow-[0_10px_30px_rgba(0,0,0,0.2)] relative transition-all ${
                        m.sender === "user" 
                          ? "bg-gradient-to-br from-emerald-600 to-[#075E54] text-white rounded-tr-none border border-white/10" 
                          : "glass-dark text-white rounded-tl-none border border-white/5"
                      }`}
                    >
                      <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{m.text}</p>
                      
                      {m.type === "action" && (
                        <motion.button 
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleDownloadReceipt(m.action)}
                          className="mt-4 w-full py-3 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Vault Receipt
                        </motion.button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 px-2">
                      <span className="text-[9px] font-bold opacity-30 tracking-tight">{m.timestamp}</span>
                      {m.sender === "user" && (
                        <div className="flex">
                           <CheckCheck className={`w-3.5 h-3.5 ${m.status === 'read' ? 'text-emerald-500' : 'text-white/20'}`} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="glass-dark p-4 rounded-[1.5rem] flex gap-1.5">
                  <motion.div animate={{ opacity: [0.4, 1, 0.4], y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4], y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4], y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }} className="w-2 h-2 bg-emerald-500 rounded-full" />
                </div>
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Floating Input Area */}
          <div className="absolute bottom-6 left-6 right-6 z-20">
            <AnimatePresence>
              {selectedImage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mb-4 ml-4"
                >
                  <div className="relative inline-block">
                    <img src={selectedImage} alt="Preview" className="w-20 h-20 object-cover rounded-xl border-2 border-emerald-500 shadow-lg" />
                    <button 
                      onClick={() => setSelectedImage(null)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-rose-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="max-w-3xl mx-auto glass-dark border border-white/10 rounded-[2rem] p-2 flex items-center gap-2 shadow-2xl">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />
              
              <div className="flex-1 flex items-center px-4">
                 <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder={isRecording ? "Listening..." : "Message or use voice..."}
                  disabled={isRecording}
                  className="flex-1 bg-transparent border-none outline-none text-sm py-3 text-white placeholder:text-white/30"
                />
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <motion.button 
                  animate={isRecording ? { scale: [1, 1.2, 1], backgroundColor: "rgba(225,29,72,0.2)" } : {}}
                  transition={isRecording ? { repeat: Infinity, duration: 1.5 } : {}}
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'text-rose-500' : 'text-white/40 hover:text-white'}`}
                >
                  <Mic className="w-5 h-5" />
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSendMessage}
                  className="bg-emerald-500 hover:bg-emerald-400 w-12 h-12 rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(16,185,129,0.4)] shrink-0"
                >
                  <Send className="w-5 h-5 ml-0.5" />
                </motion.button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* PIN Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 40, rotateX: 10 }}
              animate={{ scale: 1, y: 0, rotateX: 0 }}
              className="glass-dark w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10"
            >
              <div className="bg-gradient-to-br from-[#075E54] to-emerald-800 p-8 text-white text-center">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
                  <Lock className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-display font-bold mb-1">Verify Identity</h3>
                <p className="text-white/40 text-[10px] uppercase tracking-[0.3em] font-black">Biometric Vault Access</p>
              </div>
              
              <div className="p-8">
                <p className="text-center text-white/50 text-xs mb-8 font-medium">
                  Authorizing <span className="text-white font-bold">{pendingAction?.type}</span> for <span className="text-white font-bold">₦{pendingAction?.amount.toLocaleString()}</span>
                </p>
                
                <div className="flex justify-center gap-4 mb-10">
                  {[1,2,3,4].map((_, i) => (
                    <motion.div 
                      key={i} 
                      animate={pin.length > i ? { scale: [1, 1.2, 1], backgroundColor: "#10B981" } : {}}
                      className={`w-3.5 h-3.5 rounded-full border-2 border-white/20 ${pin.length > i ? 'bg-emerald-500 border-emerald-500' : 'bg-transparent'}`} 
                    />
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[1,2,3,4,5,6,7,8,9, 'C', 0, 'Del'].map((val) => (
                    <motion.button
                      key={val}
                      whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.1)" }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (val === 'C') setPin("");
                        else if (val === 'Del') setPin(prev => prev.slice(0, -1));
                        else if (pin.length < 4) setPin(prev => prev + val);
                      }}
                      className="h-16 glass-dark rounded-2xl flex items-center justify-center font-mono font-bold text-xl text-white border border-white/5 active:bg-white/20 transition-colors"
                    >
                      {val === 'Del' ? <X className="w-5 h-5 opacity-50" /> : val}
                    </motion.button>
                  ))}
                </div>

                {error && <p className="text-rose-500 text-[10px] font-bold text-center mb-6 uppercase tracking-wider">{error}</p>}

                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setShowPinModal(false);
                      setPin("");
                      setError("");
                    }}
                    className="flex-1 py-4 font-bold text-white/40 hover:text-white transition-colors text-xs uppercase tracking-widest"
                  >
                    Abort
                  </button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={executeAction}
                    className="flex-1 py-4 font-black uppercase tracking-widest text-[10px] text-black bg-emerald-500 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  >
                    Confirm
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Slide-over */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md glass-dark z-50 shadow-2xl flex flex-col border-l border-white/10"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <div>
                   <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#075E54] mb-1">Audit Log</h2>
                  <p className="text-3xl font-serif italic text-white/90">Transactions</p>
                </div>
                <button onClick={() => {
                  setShowHistory(false);
                  setHistorySearch("");
                }} className="w-12 h-12 glass rounded-full flex items-center justify-center text-black hover:scale-110 transition-transform">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="px-8 pb-6">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center opacity-30 group-focus-within:opacity-100 transition-opacity">
                    <Search className="w-4 h-4 text-white" />
                  </div>
                  <input 
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Filter records..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all"
                  />
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {transactions.filter(tx => {
                  const query = historySearch.toLowerCase();
                  return (
                    (tx.recipient?.toLowerCase() || "").includes(query) ||
                    (tx.phone?.toLowerCase() || "").includes(query) ||
                    (tx.amount.toString().includes(query)) ||
                    (new Date(tx.created_at).toLocaleString().toLowerCase().includes(query)) ||
                    (tx.itemType?.toLowerCase() || "").includes(query)
                  );
                }).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-white/20">
                    <History className="w-16 h-16 mb-4 opacity-10" />
                    <p className="text-xs uppercase font-black tracking-widest">No active records</p>
                  </div>
                ) : (
                  transactions.filter(tx => {
                    const query = historySearch.toLowerCase();
                    return (
                      (tx.recipient?.toLowerCase() || "").includes(query) ||
                      (tx.phone?.toLowerCase() || "").includes(query) ||
                      (tx.amount.toString().includes(query)) ||
                      (new Date(tx.created_at).toLocaleString().toLowerCase().includes(query)) ||
                      (tx.itemType?.toLowerCase() || "").includes(query)
                    );
                  }).map((tx) => (
                    <motion.div 
                      layout
                      key={tx.id} 
                      onClick={() => setSelectedTxDetail(tx)}
                      className="group p-5 glass-dark rounded-[2rem] border border-white/5 hover:border-emerald-500/30 cursor-pointer shadow-lg hover:shadow-emerald-500/5 transition-all relative overflow-hidden"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-white/5 ${
                          tx.type === 'transfer' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {tx.type === 'transfer' ? <ArrowUpRight className="w-6 h-6" /> : <Smartphone className="w-6 h-6" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-sm text-white/90 truncate pr-2 capitalize">{tx.type === 'vtu' ? `${tx.itemType}` : 'Transfer'}</h4>
                            <p className="font-mono text-sm font-bold text-white shrink-0">₦{tx.amount.toLocaleString()}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold text-white/30 truncate uppercase tracking-tight">
                              {tx.type === 'transfer' ? `To: ${tx.recipient}` : `${tx.network} - ${tx.phone}`}
                            </p>
                            <p className="text-[9px] font-mono text-white/20">{new Date(tx.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              <div className="p-8 bg-black/40 border-t border-white/5">
                <button 
                  onClick={() => {
                    setShowHistory(false);
                    setHistorySearch("");
                  }}
                  className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-emerald-500 transition-colors shadow-lg shadow-white/5"
                >
                  Exit Archive
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Funding Modal */}
      <AnimatePresence>
        {showFundModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-dark w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col border border-white/10"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">Fund Account</p>
                <button 
                  onClick={() => setShowFundModal(false)}
                  className="w-10 h-10 glass rounded-full flex items-center justify-center text-black hover:scale-110 transition-transform"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 pt-4">
                <div className="mb-8 flex flex-col items-center bg-emerald-500/5 border border-emerald-500/10 rounded-3xl p-6 relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/20 blur-[40px] -mr-10 -mt-10" />
                   <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/60 mb-6">Bank Transfer Details</p>
                   
                   <div className="w-full space-y-6">
                      <div className="flex flex-col items-center">
                         <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Bank Name</span>
                         <span className="text-sm font-bold text-white uppercase tracking-tight">{userData?.virtual_bank || "Bank Loading..."}</span>
                      </div>
                      
                      <div className="flex flex-col items-center relative py-4 group">
                         <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-2">Account Number</span>
                         <div className="flex items-center gap-3">
                           <span className="text-3xl font-mono font-bold text-white tracking-widest leading-none outline-none">
                             {userData?.virtual_account || ".........."}
                           </span>
                           <button 
                             onClick={() => {
                               if (userData?.virtual_account) {
                                 navigator.clipboard.writeText(userData.virtual_account);
                                 alert("Account number copied!");
                               }
                             }}
                             className="p-2 glass rounded-lg text-black hover:bg-emerald-500 transition-colors"
                           >
                              <Check className="w-4 h-4" />
                           </button>
                         </div>
                      </div>

                      <div className="flex flex-col items-center">
                         <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Account Holder</span>
                         <span className="text-xs font-bold text-white/60 tracking-wider uppercase">{userData?.virtual_account_name || userData?.fullname}</span>
                      </div>
                   </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5 shrink-0">
                       <CheckCheck className="w-3 h-3 text-emerald-500" />
                    </div>
                    <p className="text-[11px] text-white/60 leading-relaxed"><span className="text-white font-bold">Instant Credit:</span> Your wallet will be credited automatically upon bank settlement.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5 shrink-0">
                       <ShieldCheck className="w-3 h-3 text-blue-400" />
                    </div>
                    <p className="text-[11px] text-white/60 leading-relaxed"><span className="text-white font-bold">Secure:</span> Powered by Monnify regulated gateway.</p>
                  </div>
                </div>

                <button 
                  onClick={() => setShowFundModal(false)}
                  className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl hover:bg-emerald-500 transition-all"
                >
                  Confirm & Go Back
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {selectedTxDetail && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-dark w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col border border-white/10"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">Receipt Details</p>
                <button 
                  onClick={() => setSelectedTxDetail(null)}
                  className="w-10 h-10 glass rounded-full flex items-center justify-center text-black"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8">
                <div className="flex flex-col items-center mb-10">
                  <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mb-6 shadow-3d border border-white/20 ${
                    selectedTxDetail.type === 'transfer' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {selectedTxDetail.type === 'transfer' ? <ArrowUpRight className="w-10 h-10" /> : <Smartphone className="w-10 h-10" />}
                  </div>
                  <h2 className="text-4xl font-mono tracking-tighter text-white font-bold leading-none mb-2">₦{selectedTxDetail.amount.toLocaleString()}</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Total Value Settled</p>
                </div>

                <div className="space-y-6 mb-10">
                  {[
                    { label: "Operation", val: selectedTxDetail.type === 'vtu' ? `${selectedTxDetail.itemType} Purchase` : 'Fund Transfer', highlight: true },
                    { label: "Ref ID", val: selectedTxDetail.id, mono: true },
                    { label: "Timestamp", val: new Date(selectedTxDetail.created_at).toLocaleString() },
                    ...(selectedTxDetail.recipient ? [{ label: "Beneficiary", val: selectedTxDetail.recipient, highlight: true }] : []),
                    ...(selectedTxDetail.network ? [
                      { label: "Network", val: selectedTxDetail.network },
                      { label: "Target", val: selectedTxDetail.phone }
                    ] : [])
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/20">{item.label}</span>
                      <span className={`text-sm ${item.highlight ? 'text-white font-bold' : 'text-white/60'} ${item.mono ? 'font-mono text-xs' : ''}`}>
                        {item.val}
                      </span>
                    </div>
                  ))}
                </div>

                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleDownloadReceipt(selectedTxDetail)}
                  className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20"
                >
                  <Download className="w-4 h-4" />
                  Generate Proof of Settlement
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Receipt for Capturing */}
      <div className="fixed -left-[1000px] top-0 overflow-hidden pointer-events-none">
        {downloadingReceipt && (
          <Receipt 
            ref={receiptRef}
            type={downloadingReceipt.type}
            amount={downloadingReceipt.amount}
            recipient={downloadingReceipt.recipient}
            phone={downloadingReceipt.phone}
            network={downloadingReceipt.network}
            itemType={downloadingReceipt.itemType}
            balance={userData?.wallet_balance}
            timestamp={new Date(downloadingReceipt.created_at || Date.now()).toLocaleString()}
            reference={downloadingReceipt.id || 'REF-PENDING'}
            userName={userData?.fullname || 'Customer'}
          />
        )}
      </div>
    </>
  )}
    </div>
  );
}

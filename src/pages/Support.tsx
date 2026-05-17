import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Phone, Mail, MessageSquare, ChevronDown, Send, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const FAQS = [
  {
    q: "How do I book a parking slot?",
    a: "Select your vehicle type, enter your details on the home screen, and click 'Deploy AI Allocation'. Our AI system will automatically assign the best available spot for you."
  },
  {
    q: "How is the parking fee calculated?",
    a: "Fees are based on vehicle type and duration. Bikes start at ₹20/hr, 4-Wheelers at ₹40/hr, Tempos at ₹60/hr, and Trucks at ₹100/hr."
  },
  {
    q: "Can I extend my parking time?",
    a: "Yes, you can extend your session directly from the active log section in the History tab."
  },
  {
    q: "What if I lose my ticket?",
    a: "Don't worry! Your ticket is saved digitally in the 'History' tab. You can also use your vehicle number for retrieval at the exit."
  },
  {
    q: "How do I exit the parking?",
    a: "Simply present your digital ticket QR code or vehicle number at the exit terminal to finalize payment and open the gate."
  }
];

interface Message {
  id: string;
  text: string;
  timestamp: any;
  isAdmin: boolean;
  userId: string;
}

export default function Support() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !showChat) return;

    const q = query(
      collection(db, 'support_messages'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      // Sort client-side to avoid index requirements
      msgs.sort((a, b) => {
        const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp instanceof Date ? a.timestamp.getTime() : 0);
        const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp instanceof Date ? b.timestamp.getTime() : 0);
        return tA - tB;
      });
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'support_messages');
    });

    return () => unsubscribe();
  }, [user, showChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    try {
      await addDoc(collection(db, 'support_messages'), {
        userId: user.uid,
        userEmail: user.email,
        text: newMessage,
        isAdmin: false,
        timestamp: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'support_messages');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8 pb-10"
    >
      <header className="relative h-48 -mx-4 -mt-8 flex flex-col justify-end p-6 bg-brand-dark overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-brand-primary blur-3xl -mr-32 -mt-32" />
        </div>
        
        <button 
          onClick={() => navigate(-1)}
          className="absolute top-8 left-6 w-10 h-10 rounded-full glass-morphism border-white/10 flex items-center justify-center text-white"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="relative z-10">
          <h1 className="text-3xl font-display text-white font-black">Help & Support</h1>
          <p className="text-white/70 text-sm font-black uppercase tracking-widest">System Operator MIT Core</p>
        </div>
      </header>

      <div className="flex justify-center px-2">
        <ContactCard 
          icon={<MessageSquare size={20} />} 
          label="Inquiries / Support" 
          sub="Neural Link Active"
          onClick={() => setShowChat(true)}
        />
      </div>

      <section className="space-y-4 px-2">
        <h2 className="text-lg font-display font-black text-black dark:text-white transition-colors uppercase tracking-tight">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {FAQS.map((faq, idx) => (
            <div key={`faq-${idx}-${faq.q.slice(0, 10)}`} className="glass-morphism rounded-2xl overflow-hidden shadow-sm border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900">
              <button 
                onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                className="w-full flex items-center justify-between p-5 text-left transition-colors"
              >
                <span className="text-sm font-black text-black dark:text-slate-300 pr-4">{faq.q}</span>
                <ChevronDown 
                  size={18} 
                  className={`text-slate-400 transition-transform ${openIdx === idx ? 'rotate-180 text-brand-primary' : ''}`} 
                />
              </button>
              <AnimatePresence>
                {openIdx === idx && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-5 pt-0 text-xs leading-relaxed text-black dark:text-slate-400 font-black border-t border-slate-100 dark:border-white/5 mt-2 pt-4">
                      {faq.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      {/* Chat Modal */}
      {showChat && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm sm:items-center">
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            className="bg-white dark:bg-slate-900 w-full max-w-lg h-[80vh] rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-white/10"
          >
            <div className="p-6 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-primary/20 flex items-center justify-center text-brand-primary">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-slate-900 dark:text-white">Neural Support</h3>
                  <p className="text-[10px] text-brand-primary font-bold uppercase tracking-widest">Operator: mitadmin1</p>
                </div>
              </div>
              <button 
                onClick={() => setShowChat(false)}
                className="p-2 text-slate-400 hover:text-brand-primary"
              >
                <ArrowLeft className="rotate-270" size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                  <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                    <MessageSquare size={32} />
                  </div>
                  <p className="text-sm font-medium text-slate-500">Initiate link for assistance.</p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div 
                  key={`support-msg-${msg.id}-${idx}`}
                  className={`flex ${msg.isAdmin ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[80%] p-4 rounded-2xl text-sm font-medium ${
                    msg.isAdmin 
                      ? 'bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white rounded-tl-none' 
                      : 'bg-brand-primary text-white dark:text-background-deep rounded-tr-none'
                  }`}>
                    {msg.text}
                    {msg.timestamp && (
                      <p className={`text-[9px] mt-1 opacity-50 ${msg.isAdmin ? 'text-slate-500' : 'text-white'}`}>
                        {msg.timestamp instanceof Timestamp ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-6 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-200 dark:border-white/5">
              <div className="relative">
                <input 
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type message..."
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-2xl py-4 pl-6 pr-14 outline-none focus:border-brand-primary transition-all text-slate-900 dark:text-white font-medium"
                />
                <button 
                  type="submit"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-brand-primary text-white dark:text-background-deep rounded-xl flex items-center justify-center shadow-lg shadow-brand-primary/20 hover:scale-105 active:scale-95 transition-all"
                >
                  <Send size={18} />
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function ContactCard({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center gap-3 p-6 glass-morphism rounded-[2.5rem] group hover:bg-brand-primary/5 transition-all border-slate-200 dark:border-white/5 shadow-sm bg-white dark:bg-slate-900"
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-center text-black/40 group-hover:bg-brand-primary group-hover:text-black transition-all shadow-sm">
        {icon}
      </div>
      <div className="text-center">
        <span className="block text-[10px] font-black text-black dark:text-white group-hover:text-black dark:group-hover:text-white transition-colors uppercase tracking-widest leading-none mb-1">{label}</span>
        <span className="text-[9px] text-slate-800 dark:text-slate-400 font-black tracking-tight truncate max-w-full">{sub}</span>
      </div>
    </button>
  );
}

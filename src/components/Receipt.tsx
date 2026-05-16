
import React from 'react';
import { ShieldCheck, Download, CheckCircle2 } from 'lucide-react';

interface ReceiptProps {
  type: 'transfer' | 'vtu' | 'balance';
  amount?: number;
  recipient?: string;
  phone?: string;
  network?: string;
  itemType?: string;
  balance?: number;
  timestamp: string;
  reference: string;
  userName: string;
}

export const Receipt = React.forwardRef<HTMLDivElement, ReceiptProps>((props, ref) => {
  const { type, amount, recipient, phone, network, itemType, balance, timestamp, reference, userName } = props;

  return (
    <div 
      ref={ref}
      className="w-[450px] bg-[#F8FAFC] p-4 font-sans text-slate-900 flex flex-col items-center"
      style={{ minHeight: '800px' }}
    >
      <div className="w-full bg-white rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden relative flex flex-col">
        {/* Top Header */}
        <div className="p-8 pb-0 flex justify-between items-start w-full">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center p-0.5">
                <img src="/logo.svg" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-2xl font-black tracking-tighter text-black">Waviego.</span>
            </div>
          </div>
          <div className="px-5 py-2 bg-yellow rounded-full text-black text-[11px] font-black uppercase tracking-widest shadow-lg shadow-yellow/20">
            Completed
          </div>
        </div>

        {/* Amount Section */}
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="text-[52px] font-bold text-black tracking-tight leading-none mb-3">
             ₦{(amount || balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <p className="text-slate-400 text-[13px] font-medium tracking-tight">
            on {timestamp}
          </p>
        </div>

        {/* Details Section */}
        <div className="px-8 pb-12 space-y-7">
          <div className="flex justify-between items-end border-b border-dashed border-slate-200 pb-2">
            <span className="text-slate-400 text-[14px]">Sender:</span>
            <span className="text-slate-900 font-bold text-[14px] uppercase tracking-tight">{userName || 'VALUED CUSTOMER'}</span>
          </div>

          {type === 'transfer' && (
            <>
              <div className="flex justify-between items-end border-b border-dashed border-slate-200 pb-2">
                <span className="text-slate-400 text-[14px]">Recipient:</span>
                <span className="text-slate-900 font-bold text-[14px] uppercase tracking-tight">{recipient}</span>
              </div>
              <div className="flex justify-between items-end border-b border-dashed border-slate-200 pb-2">
                <span className="text-slate-400 text-[14px]">Recipient Bank:</span>
                <span className="text-slate-900 font-bold text-[14px] uppercase tracking-tight">WAVIEGO BANK</span>
              </div>
            </>
          )}

          {type === 'vtu' && (
            <>
              <div className="flex justify-between items-end border-b border-dashed border-slate-200 pb-2">
                <span className="text-slate-400 text-[14px]">Recipient:</span>
                <span className="text-slate-900 font-bold text-[14px] uppercase tracking-tight">{phone}</span>
              </div>
              <div className="flex justify-between items-end border-b border-dashed border-slate-200 pb-2">
                <span className="text-slate-400 text-[14px]">Network:</span>
                <span className="text-slate-900 font-bold text-[14px] uppercase tracking-tight">{network}</span>
              </div>
              <div className="flex justify-between items-end border-b border-dashed border-slate-200 pb-2">
                <span className="text-slate-400 text-[14px]">Type:</span>
                <span className="text-slate-900 font-bold text-[14px] uppercase tracking-tight">{itemType}</span>
              </div>
            </>
          )}

          <div className="flex justify-between items-end border-b border-dashed border-slate-200 pb-2">
            <span className="text-slate-400 text-[14px]">Reference:</span>
            <span className="text-slate-900 font-bold text-[12px] opacity-80 uppercase font-mono">{reference}</span>
          </div>

          <div className="flex justify-between items-end border-b border-dashed border-slate-200 pb-2">
            <span className="text-slate-400 text-[14px]">Status:</span>
            <span className="text-yellow-dark font-bold text-[14px] uppercase tracking-tight">SUCCESSFUL</span>
          </div>
        </div>

        {/* Perforated Bottom Edge */}
        <div className="w-full h-8 flex overflow-hidden -mb-4 bg-white relative">
          <div className="absolute inset-x-0 top-0 flex gap-1">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="w-6 h-6 rounded-full bg-[#F8FAFC] -mt-3 shrink-0" />
            ))}
          </div>
        </div>
      </div>

      {/* Promotional Banner */}
      <div className="w-full mt-10 rounded-2xl bg-black p-6 flex items-center justify-between overflow-hidden relative border border-white/5">
        <div className="relative z-10 flex flex-col">
          <h3 className="text-white font-bold text-[16px] leading-tight">
            Pay electricity bills, buy airtime,<br />
            and data on Waviego AI Chat.
          </h3>
          <p className="text-white/40 text-[10px] mt-2">Visit waviego.app to get started.</p>
        </div>
        <div className="flex items-center gap-1 opacity-80">
          <div className="w-10 h-10 rounded-full bg-yellow/10 flex items-center justify-center p-2 border border-yellow/20">
             <img src="/logo.svg" className="w-full h-full object-contain brightness-0 invert" alt="logo" />
          </div>
        </div>
      </div>

      {/* Modern Footer */}
      <div className="mt-8 text-center px-4 space-y-4">
        <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
          Waviego is powered by CBN-Licensed partners and protected by NDIC.<br />
          Send money, buy airtime, pay bills, handle everything money, the smart and<br />
          stress-free way with Waviego, all inside chat.
        </p>
        
        <p className="text-[12px] font-bold text-slate-500 tracking-tight">
          Start banking smarter today at <span className="text-black underline">www.waviego.africa</span>
        </p>

        <div className="flex items-center justify-center gap-4 pt-4 grayscale opacity-30">
          <div className="px-3 py-1 border border-slate-300 rounded text-[9px] font-black uppercase text-slate-500 tracking-tighter">CBN LICENSED</div>
          <div className="px-3 py-1 border border-slate-300 rounded text-[9px] font-black uppercase text-slate-500 tracking-tighter">NDIC INSURED</div>
        </div>
      </div>
    </div>
  );
});

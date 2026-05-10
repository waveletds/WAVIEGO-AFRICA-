
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
      className="w-[400px] bg-white p-8 font-sans text-[#141414] relative overflow-hidden"
      style={{ minHeight: '550px' }}
    >
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#075E54]/5 rounded-bl-full -mr-10 -mt-10" />
      
      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 bg-[#075E54] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-[#075E54]/20">
          <ShieldCheck className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tighter">Waviego Africa</h1>
        <p className="text-[10px] uppercase font-bold tracking-widest text-[#075E54]">Official Transaction Receipt</p>
      </div>

      <div className="border-t border-b border-dashed border-black/10 py-6 mb-6">
        <div className="flex flex-col items-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-500 mb-2" />
          <p className="text-sm font-bold uppercase opacity-60">Transaction Successful</p>
          <h2 className="text-4xl font-mono tracking-tighter mt-1">
             ₦{amount?.toLocaleString() || balance?.toLocaleString()}
          </h2>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold opacity-40">Transaction Type</span>
            <span className="text-sm font-bold capitalize">{type === 'vtu' ? `${itemType} Purchase` : type}</span>
          </div>
          
          {type === 'transfer' && (
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold opacity-40">Recipient</span>
              <span className="text-sm font-medium">{recipient}</span>
            </div>
          )}

          {type === 'vtu' && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold opacity-40">Network</span>
                <span className="text-sm font-medium">{network}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold opacity-40">Phone Number</span>
                <span className="text-sm font-medium">{phone}</span>
              </div>
            </>
          )}

          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold opacity-40">Customer Name</span>
            <span className="text-sm font-medium">{userName}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold opacity-40">Date & Time</span>
            <span className="text-sm font-medium">{timestamp}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold opacity-40">Reference</span>
            <span className="text-sm font-mono text-[11px] opacity-70">{reference}</span>
          </div>
        </div>
      </div>

      <div className="text-center">
        <p className="text-[9px] uppercase font-bold opacity-30 mb-4">
          Thank you for banking with Waviego Africa. <br />
          This is a system generated receipt and does not require a signature.
        </p>
        
        <div className="flex items-center justify-center gap-2 opacity-20 grayscale">
           <div className="w-8 h-8 rounded-full border border-black flex items-center justify-center">
             <ShieldCheck className="w-4 h-4" />
           </div>
           <span className="text-[8px] font-bold">Nigeria Interbank Settlement System</span>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#075E54]" />
    </div>
  );
});

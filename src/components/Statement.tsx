
import React from 'react';
import { ShieldCheck, Download, History } from 'lucide-react';

interface Transaction {
  id: string;
  type: 'transfer' | 'vtu' | 'funding';
  amount: number;
  recipient?: string;
  phone?: string;
  network?: string;
  itemType?: string;
  created_at: string;
  category?: 'credit' | 'debit';
  status: string;
}

interface StatementProps {
  transactions: Transaction[];
  userData: any;
  period?: string;
}

export const Statement = React.forwardRef<HTMLDivElement, StatementProps>((props, ref) => {
  const { transactions, userData, period = 'LAST 30 DAYS' } = props;

  // Group transactions by month for better readability if needed, 
  // but for a simple statement we'll just list them.

  return (
    <div 
      ref={ref}
      className="w-full max-w-4xl mx-auto bg-white p-12 font-sans text-slate-900 min-h-screen"
    >
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-black pb-8 mb-12">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center p-1">
              <img src="/logo.svg" alt="Waviego" className="w-full h-full object-contain brightness-0 invert" />
            </div>
            <h1 className="text-4xl font-black tracking-tighter">Waviego Africa.</h1>
          </div>
          <div className="text-xs font-black uppercase tracking-widest text-slate-400">
            Official Statement of Account
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Generated On</div>
          <div className="text-sm font-bold font-mono">{new Date().toLocaleString()}</div>
        </div>
      </div>

      {/* Account Info */}
      <div className="grid grid-cols-2 gap-12 mb-16">
        <div className="space-y-6">
          <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Account Holder</p>
            <p className="text-2xl font-bold uppercase">{userData?.fullname}</p>
            <p className="text-sm font-medium text-slate-500 mt-1">{userData?.email}</p>
            <p className="text-xs font-bold font-mono mt-0.5">{userData?.phone}</p>
          </div>
        </div>
        <div className="space-y-6">
           <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Account Details</p>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-black text-slate-400 uppercase tracking-tight">Virtual Account</span>
              <span className="text-sm font-bold font-mono tracking-widest">{userData?.virtual_account || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-black text-slate-400 uppercase tracking-tight">Bank Name</span>
              <span className="text-sm font-bold uppercase">{userData?.virtual_bank || 'Waviego Partner Bank'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-6 mb-12">
        <div className="p-6 border-2 border-black rounded-3xl">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Current Balance</p>
          <p className="text-2xl font-black">₦{userData?.wallet_balance?.toLocaleString()}</p>
        </div>
        <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
          <p className="text-[10px] font-black uppercase text-emerald-600/50 tracking-widest mb-1">Total Inflow</p>
          <p className="text-2xl font-black text-emerald-600">
            ₦{transactions.filter(t => t.category === 'credit').reduce((a, b) => a + b.amount, 0).toLocaleString()}
          </p>
        </div>
        <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100">
          <p className="text-[10px] font-black uppercase text-rose-600/50 tracking-widest mb-1">Total Outflow</p>
          <p className="text-2xl font-black text-rose-600">
            ₦{transactions.filter(t => t.category === 'debit').reduce((a, b) => a + b.amount, 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="mb-16">
        <div className="grid grid-cols-12 gap-4 border-b-2 border-black pb-4 mb-4 px-4">
          <div className="col-span-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Date</div>
          <div className="col-span-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Description</div>
          <div className="col-span-2 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Debit</div>
          <div className="col-span-2 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Credit</div>
        </div>
        
        <div className="space-y-0">
          {transactions.map((tx, idx) => (
            <div key={tx.id} className={`grid grid-cols-12 gap-4 py-5 px-4 border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
              <div className="col-span-2 text-xs font-mono font-bold text-slate-500">
                {new Date(tx.created_at).toLocaleDateString()}
                <br />
                <span className="text-[10px] opacity-50">{new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="col-span-6">
                <p className="text-sm font-bold text-slate-900 uppercase tracking-tight">
                  {tx.type === 'transfer' ? `TRF / ${tx.recipient}` : tx.type === 'vtu' ? `VTU / ${tx.itemType} / ${tx.phone}` : 'Account Funding'}
                </p>
                <p className="text-[10px] font-medium text-slate-400 font-mono mt-1">REF: {tx.id.slice(0, 12).toUpperCase()}</p>
              </div>
              <div className="col-span-2 text-right">
                {tx.category === 'debit' ? (
                   <span className="text-sm font-bold font-mono">₦{tx.amount.toLocaleString()}</span>
                ) : '-'}
              </div>
              <div className="col-span-2 text-right">
                {tx.category === 'credit' ? (
                   <span className="text-sm font-bold font-mono text-emerald-600">₦{tx.amount.toLocaleString()}</span>
                ) : '-'}
              </div>
            </div>
          ))}
          
          {transactions.length === 0 && (
            <div className="py-20 text-center">
              <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-300">No transaction records found</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer / Certification */}
      <div className="mt-auto pt-20 border-t-2 border-slate-100">
        <div className="flex justify-between items-end">
          <div className="max-w-md">
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              This is a computer-generated statement and requires no physical signature. 
              Waviego is powered by CBN-Licensed partners and protected by NDIC.
              For complaints or inquiries, please contact support@waviego.africa
            </p>
          </div>
          <div className="flex flex-col items-end gap-3 opacity-20 filter grayscale">
             <div className="flex gap-2">
                <div className="px-3 py-1 border border-slate-300 rounded text-[9px] font-black uppercase text-slate-500 tracking-tighter">CBN LICENSED</div>
                <div className="px-3 py-1 border border-slate-300 rounded text-[9px] font-black uppercase text-slate-500 tracking-tighter">NDIC INSURED</div>
             </div>
             <p className="text-[9px] font-black text-slate-400">© 2026 WAVIEGO AFRICA</p>
          </div>
        </div>
      </div>
    </div>
  );
});

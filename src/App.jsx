import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  setDoc
} from "firebase/firestore";
import { 
  Plus, Trash2, FileText, ChevronDown, ChevronUp, Save, 
  Paperclip, X, CheckCircle2, AlertCircle, Banknote, Receipt, 
  FolderOpen, DollarSign, Eye, Edit, Search, 
  ArrowUpDown, Lock, LogOut, UserCog, Download, FileSpreadsheet, File as FileIcon, FileType
} from 'lucide-react';

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAjnXQyLpPr9N959RJu-m33eJQiTVI6wA4",
  authDomain: "controle-de-notas-8d0ba.firebaseapp.com",
  projectId: "controle-de-notas-8d0ba",
  storageBucket: "controle-de-notas-8d0ba.firebasestorage.app",
  messagingSenderId: "832409792798",
  appId: "1:832409792798:web:3ae6f15a0bbbb07870d90f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "lma-finance"; 

const MASTER_USER = 'filipe.souza@shipstore.com.br';

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Bloqueia sessões anônimas residuais de testes
      if (currentUser && (!currentUser.email || currentUser.isAnonymous)) {
        signOut(auth);
        setUser(null);
      } else {
        setUser(currentUser);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  if (loadingAuth) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Iniciando LMA Finanças...</p>
      </div>
    </div>
  );

  if (!user) return <LoginScreen errorFromApp={authError} />;

  return <Dashboard user={user} onNoAccess={() => {
    signOut(auth);
    setAuthError("Sua conta aguarda liberação do administrador.");
  }} />;
}

// --- TELA DE LOGIN ---
const LoginScreen = ({ errorFromApp }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(errorFromApp ? { title: "Acesso Negado", message: errorFromApp } : null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError({ title: "Erro de Acesso", message: "E-mail ou senha incorretos." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-10">
          <div className="bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Receipt className="text-white" size={40} />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">LMA Finanças</h1>
          <p className="text-slate-400 text-sm mt-2 font-medium">Controle de Notas Fiscais</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl">
            <p className="font-black uppercase text-[10px] tracking-widest mb-1">{error.title}</p>
            <p>{error.message}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail Corporativo</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium" />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- PAINEL PRINCIPAL ---
const Dashboard = ({ user, onNoAccess }) => {
  const [currentModule, setCurrentModule] = useState('entry');
  const [userPermissions, setUserPermissions] = useState([]);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [modalPreview, setModalPreview] = useState(null);
  
  const userEmail = user.email;
  const isMaster = userEmail === MASTER_USER;

  const [fdas, setFdas] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [usersList, setUsersList] = useState([]); 

  useEffect(() => {
    if (!userEmail) return;

    const fetchPermissions = () => {
      if (isMaster) {
        setUserPermissions(['entry', 'launched', 'finance', 'users']);
        setLoadingPermissions(false);
        return;
      }

      const permRef = doc(db, 'artifacts', appId, 'public', 'data', 'permissions', userEmail);
      const unsubPerm = onSnapshot(permRef, (docSnap) => {
        if (docSnap.exists()) {
          const modules = docSnap.data().modules || [];
          setUserPermissions(modules);
          if (modules.length > 0) setCurrentModule(modules[0]);
          else onNoAccess();
        } else {
          onNoAccess();
        }
        setLoadingPermissions(false);
      }, () => setLoadingPermissions(false));
      return unsubPerm;
    };

    const unsubPerms = fetchPermissions();
    const unsubFdas = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'fdas'), (snapshot) => setFdas(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubItems = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'items'), (snapshot) => setRawItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));

    let unsubUsers = () => {};
    if (isMaster) {
       unsubUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'permissions'), (snapshot) => setUsersList(snapshot.docs.map(d => ({ id: d.id, email: d.id, ...d.data() }))));
    }

    return () => { if (unsubPerms) unsubPerms(); unsubFdas(); unsubItems(); unsubUsers(); };
  }, [userEmail, isMaster]);

  const fdasWithItems = useMemo(() => fdas.map(fda => ({ ...fda, items: rawItems.filter(item => item.fdaId === fda.id) })).sort((a, b) => (b.number || '').localeCompare(a.number || '')), [fdas, rawItems]);
  const allItems = useMemo(() => rawItems.map(item => ({ ...item, fdaNumber: fdas.find(f => f.id === item.fdaId)?.number || 'N/A' })), [rawItems, fdas]);

  const addFda = async () => { const number = `FDA-${new Date().getFullYear()}-${String(fdas.length + 1).padStart(3, '0')}`; await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'fdas'), { number, createdAt: new Date().toISOString(), isOpen: true }); };
  const toggleFda = async (id, status) => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fdas', id), { isOpen: !status });
  const updateFdaNumber = async (id, val) => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fdas', id), { number: val });
  const addItem = async (fdaId) => await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'items'), createEmptyItem(fdaId));
  const updateItem = async (id, data) => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'items', id), { data });
  const updateFiles = async (id, type, files) => { const field = type === 'NF' ? 'anexosNF' : 'anexosBoleto'; await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'items', id), { [field]: files }); };
  const deleteItem = async (id) => { if(window.confirm("Deseja excluir este item permanentemente?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'items', id)); };

  if (loadingPermissions) return <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400">AUTENTICANDO...</div>;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-10 print:hidden">
        <div className="p-8"><h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md"><Receipt size={18} className="text-white"/></div>LMA Finanças</h1></div>
        <nav className="flex-1 px-4 space-y-1">
          {userPermissions.includes('entry') && <NavButton active={currentModule === 'entry'} onClick={() => setCurrentModule('entry')} icon={<FolderOpen size={18}/>} label="Lançamento" />}
          {userPermissions.includes('launched') && <NavButton active={currentModule === 'launched'} onClick={() => setCurrentModule('launched')} icon={<FileText size={18}/>} label="Itens Lançados" />}
          {userPermissions.includes('finance') && <NavButton active={currentModule === 'finance'} onClick={() => setCurrentModule('finance')} icon={<DollarSign size={18}/>} label="Contas a Pagar" />}
          {isMaster && ( <> <div className="pt-6 pb-2 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Painel Admin</div> <NavButton active={currentModule === 'users'} onClick={() => setCurrentModule('users')} icon={<UserCog size={18}/>} label="Usuários" /> </> )}
        </nav>
        <div className="p-6 bg-slate-50 mt-auto border-t"><button onClick={() => signOut(auth)} className="w-full flex items-center justify-center gap-2 text-xs font-black uppercase text-slate-500 hover:text-red-600"><LogOut size={14} /> Sair do Sistema</button></div>
      </aside>
      <main className="flex-1 ml-64 p-10 overflow-y-auto print:m-0">
        {currentModule === 'entry' && <EntryModule fdas={fdasWithItems} addFda={addFda} toggleFda={toggleFda} updateFdaNumber={updateFdaNumber} addItem={addItem} updateItem={updateItem} updateFiles={updateFiles} deleteItem={deleteItem} />}
        {currentModule === 'launched' && <LaunchedModule allItems={allItems} onEdit={() => setCurrentModule('entry')} onDelete={deleteItem} onPreview={(files) => setModalPreview({ title: 'Visualização', files })} />}
        {currentModule === 'finance' && <FinanceModule allItems={allItems} isMaster={isMaster} updateItem={updateItem} onPreview={(files, title) => setModalPreview({ title, files })} onEdit={() => setCurrentModule('entry')} onDelete={deleteItem} />}
        {currentModule === 'users' && isMaster && <UserManagementModule usersList={usersList} />}
      </main>
      {modalPreview && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b flex justify-between items-center"><h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex gap-2"><Paperclip size={18} className="text-blue-600"/> {modalPreview.title}</h3><button onClick={() => setModalPreview(null)} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20}/></button></div>
            <div className="p-8 max-h-[60vh] overflow-y-auto bg-slate-50/50">
              {modalPreview.files?.length > 0 ? ( <ul className="space-y-4"> {modalPreview.files.map(file => ( <li key={file.id} className="flex items-center gap-4 p-4 bg-white border rounded-xl"><div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><FileText size={24}/></div><div className="flex-1 min-w-0 font-bold text-slate-700 truncate">{file.name}</div><button className="px-4 py-2 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 border border-blue-100 transition-all">Baixar</button></li> ))} </ul> ) : ( <div className="text-center py-10 text-slate-400 font-medium italic"><p>Sem anexos.</p></div> )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- COMPONENTES AUXILIARES ---
const NavButton = ({ active, onClick, icon, label }) => ( <button onClick={onClick} className={`w-full flex items-center gap-3 px-6 py-4 rounded-xl transition-all font-bold text-sm tracking-tight ${active ? 'bg-blue-600 text-white shadow-xl translate-x-1' : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'}`}>{icon}<span>{label}</span></button> );
const StatusBadge = ({ status }) => { const styles = { 'Pendente': 'bg-slate-100 text-slate-500', 'Provisionado': 'bg-yellow-50 text-yellow-600', 'Aprovado': 'bg-blue-50 text-blue-600', 'Pago': 'bg-green-50 text-green-600' }; return ( <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg tracking-widest ${styles[status] || styles['Pendente']}`}>{status}</span> ); };
const InputField = ({ label, type = "text", value, onChange, placeholder = "", highlight = false }) => ( <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label><input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-bold transition-all outline-none ${highlight ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 focus:border-blue-400 focus:bg-white text-slate-700'}`} /></div> );
const FileUploadButton = ({ label, icon, onUpload, color }) => { const inputId = `file-${label}-${Math.random()}`; const colors = { blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100', slate: 'bg-slate-50 text-slate-500 hover:bg-slate-100' }; return ( <div className="flex-1"><input type="file" id={inputId} className="hidden" onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0].name); }} /><label htmlFor={inputId} className={`flex items-center justify-center gap-2 p-3 border border-dashed rounded-xl cursor-pointer font-black text-[10px] uppercase tracking-wider ${colors[color]}`}>{icon} {label}</label></div> ); };
const createEmptyItem = (fdaId) => ({ fdaId, data: { status: 'Pendente', vencimento: '', servicos: '', documento: '', dataEmissao: '', valorBruto: 0, centroCusto: '', nfs: '', valorBase: 0, valorLiquido: 0, pis: 0, cofins: 0, csll: 0, guia5952: 0, irrf: 0, guia1708: 0, inss: 0, iss: 0, impostoRet: 0, multa: 0, juros: 0, total: 0, clienteFornecedor: '', cnpjCpf: '', banco: '', codigoBanco: '', agencia: '', contaCorrente: '', chavePix: '', dataPagamento: '', valorPago: 0, jurosPagos: 0, dataProvisionamento: null, dataAprovacao: null, dataPagamentoReal: null }, anexosNF: [], anexosBoleto: [] });

// --- MODULOS DE SUB-INTERFACE ---
const UserManagementModule = ({ usersList }) => {
  const [newUserEmail, setNewUserEmail] = useState('');
  const handleUpdate = async (email, mod, has) => { const user = usersList.find(u => u.email === email); let mods = user ? (user.modules || []) : []; if (has) { if (!mods.includes(mod)) mods.push(mod); } else { mods = mods.filter(m => m !== mod); } await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'permissions', email), { modules: mods }, { merge: true }); };
  const addUser = async () => { if (!newUserEmail) return; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'permissions', newUserEmail.toLowerCase().trim()), { modules: ['entry'] }); setNewUserEmail(''); };
  const modules = [{ k: 'entry', l: 'Lançamento' }, { k: 'finance', l: 'Financeiro' }, { k: 'launched', l: 'Lançados' }];
  return ( <div className="max-w-4xl mx-auto"><h2 className="text-3xl font-black mb-10 tracking-tight uppercase text-lg">Gerenciar Usuários</h2><div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 mb-8"><div className="flex gap-4"><input type="email" placeholder="nome@empresa.com" className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} /><button onClick={addUser} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs">Autorizar</button></div></div><div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"><table className="w-full text-sm text-left"><thead className="bg-slate-50 border-b"><tr><th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail</th>{modules.map(m => <th key={m.k} className="p-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.l}</th>)}</tr></thead><tbody>{usersList.map(u => (<tr key={u.email} className="hover:bg-slate-50"><td className="p-5 font-bold text-slate-700">{u.email}</td>{modules.map(m => (<td key={m.k} className="p-5 text-center"><input type="checkbox" className="w-5 h-5 rounded text-blue-600" checked={u.modules?.includes(m.k)} onChange={(e) => handleUpdate(u.email, m.k, e.target.checked)} /></td>))}</tr>))}</tbody></table></div></div> );
};

const EntryModule = ({ fdas, addFda, toggleFda, updateFdaNumber, addItem, updateItem, updateFiles, deleteItem }) => {
  const [activeItemId, setActiveItemId] = useState(null);
  const handleUpdate = (item, field, val) => {
    let newData = { ...item.data, [field]: val };
    if (field === 'valorBruto') {
      const v = parseFloat(val) || 0;
      newData.pis = Number((v * 0.0065).toFixed(2));
      newData.cofins = Number((v * 0.03).toFixed(2));
      newData.csll = Number((v * 0.01).toFixed(2));
      newData.guia5952 = Number((newData.pis + newData.cofins + newData.csll).toFixed(2));
      newData.irrf = Number((v * 0.015).toFixed(2));
      newData.guia1708 = newData.irrf;
      newData.valorBase = v;
      const totalRetained = newData.guia5952 + newData.irrf + newData.inss + newData.iss;
      newData.impostoRet = Number(totalRetained.toFixed(2));
      newData.valorLiquido = Number((val - totalRetained).toFixed(2));
      newData.total = Number((val + (parseFloat(newData.multa)||0) + (parseFloat(newData.juros)||0)).toFixed(2));
    }
    updateItem(item.id, newData);
  };
  const handleFileUpload = (item, type, fileName) => {
    const listName = type === 'NF' ? 'anexosNF' : 'anexosBoleto';
    const currentFiles = item[listName] || [];
    const newFiles = [...currentFiles, { id: crypto.randomUUID(), name: fileName, date: new Date().toLocaleString() }];
    updateFiles(item.id, type, newFiles);
  };
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg">Lançamento de Itens</h2>
        <button onClick={addFda} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center gap-2 hover:bg-slate-800 shadow-xl transition-all">
          <Plus size={18}/> Novo Atendimento
        </button>
      </div>
      <div className="space-y-8">
        {fdas.map(f => (
          <div key={f.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-6 flex justify-between items-center cursor-pointer" onClick={() => toggleFda(f.id, f.isOpen)}>
              <div className="flex items-center gap-5">
                <div className={`p-2 rounded-lg ${f.isOpen ? 'bg-blue-100 text-blue-600' : 'bg-slate-200'}`}>
                  {f.isOpen ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Ref. Lote</label>
                  <input type="text" value={f.number} onClick={e => e.stopPropagation()} onChange={e => updateFdaNumber(f.id, e.target.value)} className="bg-transparent font-mono text-xl font-black text-blue-600 focus:outline-none w-full" />
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); addItem(f.id); }} className="bg-white border-2 border-blue-600 text-blue-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest">Novo Serviço</button>
            </div>
            {f.isOpen && (
              <div className="p-6 space-y-4">
                {f.items.map((it, idx) => (
                  <div key={it.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-blue-300 shadow-sm">
                    <div className="p-5 flex justify-between items-center cursor-pointer" onClick={() => setActiveItemId(activeItemId === it.id ? null : it.id)}>
                      <div className="flex gap-5">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-400 text-[10px] tracking-tighter">{String(idx+1).padStart(2, '0')}</div>
                        <div>
                          <p className="font-black text-slate-700 uppercase text-sm">{it.data.servicos || 'Pendente de descrição'}</p>
                          <p className="text-[10px] text-slate-400 font-black uppercase">Venc: {it.data.vencimento || '--'} • R$ {it.data.total}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={it.data.status}/>
                        <button onClick={e => { e.stopPropagation(); setActiveItemId(it.id); }} className="p-2 text-slate-400 hover:text-blue-600"><Edit size={18}/></button>
                        <button onClick={e => { e.stopPropagation(); deleteItem(it.id); }} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={18}/></button>
                      </div>
                    </div>
                    {activeItemId === it.id && (
                      <div className="p-8 border-t grid grid-cols-1 md:grid-cols-3 gap-10">
                        <div className="space-y-5">
                          <InputField label="Descrição" value={it.data.servicos} onChange={v => handleUpdate(it, 'servicos', v)} />
                          <div className="grid grid-cols-2 gap-3">
                            <InputField label="Doc Nº" value={it.data.documento} onChange={v => handleUpdate(it, 'documento', v)} />
                            <InputField label="Vencimento" type="date" value={it.data.vencimento} onChange={v => handleUpdate(it, 'vencimento', v)} />
                          </div>
                          <InputField label="Valor Bruto (R$)" type="number" value={it.data.valorBruto} onChange={v => handleUpdate(it, 'valorBruto', v)} highlight />
                        </div>
                        <div className="space-y-5">
                          <div className="grid grid-cols-2 gap-3">
                            <InputField label="GUIA 5952" type="number" value={it.data.guia5952} onChange={v => handleUpdate(it, 'guia5952', v)} />
                            <InputField label="INSS" type="number" value={it.data.inss} onChange={v => handleUpdate(it, 'inss', v)} />
                          </div>
                          <InputField label="Fornecedor" value={it.data.clienteFornecedor} onChange={v => handleUpdate(it, 'clienteFornecedor', v)} />
                        </div>
                        <div className="space-y-5">
                          <div className="flex gap-3">
                            <FileUploadButton label="Nota" icon={<Receipt size={16}/>} onUpload={n => updateFiles(it.id, 'NF', [...(it.anexosNF||[]), {id: Date.now(), name: n, date: new Date().toLocaleString()}])} color="blue" />
                            <FileUploadButton label="Boleto" icon={<Banknote size={16}/>} onUpload={n => updateFiles(it.id, 'Boleto', [...(it.anexosBoleto||[]), {id: Date.now(), name: n, date: new Date().toLocaleString()}])} color="slate" />
                          </div>
                          <div className="text-[10px] bg-slate-50 p-4 rounded-xl border font-bold uppercase tracking-tight overflow-y-auto max-h-24">
                            {(it.anexosNF||[]).map(an => <div key={an.id} className="text-blue-600">📎 {an.name}</div>)}
                            {(it.anexosBoleto||[]).map(an => <div key={an.id} className="text-slate-500">📄 {an.name}</div>)}
                          </div>
                          <div className="bg-blue-600 p-4 rounded-xl text-white font-black">
                            <label className="text-[10px] uppercase opacity-80">Total</label>
                            <div className="text-2xl">R$ {parseFloat(it.data.total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const LaunchedModule = ({ allItems, onEdit, onDelete, onPreview }) => {
  const [f, setF] = useState('');
  const [sF, setSF] = useState('vencimento');
  const [sD, setSD] = useState('asc');
  const [eO, setEO] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => { const h = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setEO(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  const filtered = useMemo(() => allItems.filter(i => (i.data.servicos||'').toLowerCase().includes(f.toLowerCase()) || (i.fdaNumber||'').toLowerCase().includes(f.toLowerCase())).sort((a, b) => { let vA = a.data[sF]; let vB = b.data[sF]; if(sF === 'total') { vA = parseFloat(vA); vB = parseFloat(vB); } return sD === 'asc' ? ((vA < vB) ? -1 : 1) : ((vA > vB) ? -1 : 1); }), [allItems, f, sF, sD]);
  const exportXls = () => { const t = `<table><tr><th>Data</th><th>Item</th><th>FDA</th><th>Valor</th><th>Status</th></tr>${filtered.map(i => `<tr><td>${i.data.vencimento}</td><td>${i.data.servicos}</td><td>${i.fdaNumber}</td><td>${i.data.total}</td><td>${i.data.status}</td></tr>`).join('')}</table>`; const b = new Blob([t], {type: 'application/vnd.ms-excel'}); const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = 'Historico_LMA.xls'; l.click(); setEO(false); };
  const exportCSV = () => { const h = ["Vencimento","Servico","Fornecedor","FDA","Total","Status"]; const r = filtered.map(i => [i.data.vencimento || '-', `"${i.data.servicos || ''}"`, `"${i.data.clienteFornecedor || ''}"`, i.fdaNumber, i.data.total, i.data.status]); const c = "data:text/csv;charset=utf-8," + h.join(",") + "\n" + r.map(e => e.join(",")).join("\n"); const l = document.createElement("a"); l.setAttribute("href", encodeURI(c)); l.setAttribute("download", "LMA_Lancamentos.csv"); document.body.appendChild(l); l.click(); setEO(false); };

  return ( 
    <div className="max-w-7xl mx-auto">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div><h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg">Histórico Lançado</h2></div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/>
            <input type="text" placeholder="Filtrar..." className="pl-12 pr-6 py-3 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-600 outline-none w-full md:w-64 transition-all" value={f} onChange={e => setF(e.target.value)} />
          </div>
          <div className="relative" ref={exportRef}>
            <button onClick={() => setEO(!eO)} className="bg-white border-2 border-slate-200 text-slate-600 px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:border-blue-600 transition-all"><Download size={16}/> Baixar</button>
            {eO && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <button onClick={() => { window.print(); setEO(false); }} className="w-full text-left px-5 py-3 text-[10px] font-black uppercase text-slate-600 hover:bg-blue-50 flex items-center gap-3"><FileIcon size={14} className="text-red-500"/> PDF (Imprimir)</button>
                <button onClick={exportXls} className="w-full text-left px-5 py-3 text-[10px] font-black uppercase text-slate-600 hover:bg-blue-50 flex items-center gap-3"><FileSpreadsheet size={14} className="text-green-600"/> Excel (XLS)</button>
                <button onClick={exportCSV} className="w-full text-left px-5 py-3 text-[10px] font-black uppercase text-slate-600 hover:bg-blue-50 flex items-center gap-3"><FileType size={14} className="text-slate-400"/> CSV (Texto)</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer" onClick={() => { setSF('vencimento'); setSD(sD === 'asc' ? 'desc' : 'asc'); }}>Vencimento</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Serviço / FDA</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center print:hidden">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium">
            {filtered.map(i => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="p-5 font-bold text-slate-800">{i.data.vencimento}</td>
                <td className="p-5">
                  <div className="font-black text-slate-800 uppercase text-xs">{i.data.servicos}</div>
                  <div className="text-[10px] text-blue-600 font-black mt-1">{i.fdaNumber}</div>
                </td>
                <td className="p-5 text-right font-black text-slate-900">R$ {parseFloat(i.data.total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td className="p-5 text-center"><StatusBadge status={i.data.status} /></td>
                <td className="p-5 text-center print:hidden">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => onPreview([...(i.anexosNF||[]), ...(i.anexosBoleto||[])])} className="p-2 text-slate-400 hover:text-blue-600"><Eye size={18}/></button>
                    <button onClick={onEdit} className="p-2 text-slate-400 hover:text-green-600"><Edit size={18}/></button>
                    <button onClick={() => onDelete(i.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={18}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div> 
  );
};

const FinanceModule = ({ allItems, isMaster, updateItem, onPreview, onEdit, onDelete }) => {
  const [aT, setAT] = useState('pagar');
  const items = useMemo(() => {
    let its = [];
    if (aT === 'pagar') its = allItems.filter(i => i.data.status === 'Pendente');
    else if (aT === 'provisionado') its = allItems.filter(i => i.data.status === 'Provisionado');
    else if (aT === 'aprovado') its = allItems.filter(i => i.data.status === 'Aprovado');
    else if (aT === 'pagos') its = allItems.filter(i => i.data.status === 'Pago');
    return its.sort((a, b) => new Date(a.data.vencimento) - new Date(b.data.vencimento));
  }, [allItems, aT]);
  
  const handleStatus = async (id, cur, s) => { 
    const n = new Date().toISOString().split('T')[0]; 
    let ups = { status: s }; 
    if (s === 'Provisionado') ups.dataProvisionamento = n; 
    if (s === 'Aprovado') ups.dataAprovacao = n; 
    if (s === 'Pago') ups.dataPagamentoReal = n; 
    await updateItem(id, { ...cur, ...ups }); 
  };
  
  const tabs = [{ i: 'pagar', l: 'A Pagar' }, { i: 'provisionado', l: 'Provisionado' }, { i: 'aprovado', l: 'Aprovado' }, { i: 'pagos', l: 'Liquidados' }];
  
  return ( 
    <div className="max-w-full">
      <header className="mb-10"><h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg">Contas a Pagar</h2></header>
      <div className="flex gap-2 border-b mb-8 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.i} onClick={() => setAT(t.i)} className={`px-10 py-3 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${aT === t.i ? `border-blue-600 text-blue-600 bg-blue-50/50` : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{t.l}</button>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimento</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Serviço / FDA</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
              <th className="p-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium">
            {items.length === 0 ? 
              <tr><td colSpan="4" className="p-10 text-center text-slate-300 font-black uppercase text-xs italic">Vazio</td></tr> 
              : items.map(it => (
                <tr key={it.id} className="hover:bg-slate-50">
                  <td className="p-5 font-bold text-slate-800">{it.data.vencimento}</td>
                  <td className="p-5">
                    <div className="font-black text-slate-800 uppercase text-xs">{it.data.servicos}</div>
                    <div className="text-[10px] text-blue-600 font-black mt-1">{it.fdaNumber}</div>
                  </td>
                  <td className="p-5 text-right font-black text-slate-900">R$ {parseFloat(it.data.total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                  <td className="p-5 text-center">
                    <div className="flex items-center justify-center gap-3">
                      {aT === 'pagar' && <button onClick={() => handleStatus(it.id, it.data, 'Provisionado')} className="px-5 py-2 bg-yellow-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg">Provisionar</button>}
                      {aT === 'provisionado' && <button onClick={() => handleStatus(it.id, it.data, 'Aprovado')} disabled={!isMaster} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg ${isMaster ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{isMaster ? 'Aprovar' : 'Pendente'}</button>}
                      {aT === 'aprovado' && <button onClick={() => handleStatus(it.id, it.data, 'Pago')} className="px-5 py-2 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg">Liquidar</button>}
                      <button onClick={() => onPreview([...(it.anexosNF||[]), ...(it.anexosBoleto||[])], `Documentos`)} className="p-2 text-slate-400 hover:text-blue-600"><Paperclip size={18}/></button>
                      <button onClick={onEdit} className="p-2 text-slate-400 hover:text-blue-600 transition-all"><Edit size={18}/></button>
                      <button onClick={() => onDelete(it.id)} className="p-2 text-slate-400 hover:text-red-600 transition-all"><Trash2 size={18}/></button>
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div> 
  );
};

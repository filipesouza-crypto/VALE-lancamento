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
  setDoc,
  query,
  limit
} from "firebase/firestore";
import { 
  Plus, Trash2, FileText, ChevronDown, ChevronUp, Save, 
  Paperclip, X, CheckCircle2, AlertCircle, Banknote, Receipt, 
  FolderOpen, DollarSign, Eye, Edit, Search, 
  ArrowUpDown, Lock, LogOut, UserCog, History, ExternalLink,
  Download, FileSpreadsheet, File as FileIcon, FileType,
  Undo2, Filter, Calendar
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

// --- FUNÇÃO DE LOG ---
const logAction = async (userEmail, action, details) => {
  try {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), {
      user: userEmail,
      action: action.toUpperCase(),
      details: details,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("Erro ao gravar log", e);
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
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
    setAuthError("Erro de permissão. Contate o administrador.");
  }} />;
}

// --- TELA DE LOGIN ---
const LoginScreen = ({ errorFromApp }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(errorFromApp ? { title: "Aviso", message: errorFromApp } : null);
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

// --- DASHBOARD ---
const Dashboard = ({ user, onNoAccess }) => {
  const [currentModule, setCurrentModule] = useState('entry');
  const [userPermissions, setUserPermissions] = useState([]);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [modalPreview, setModalPreview] = useState(null);
  const [itemToEdit, setItemToEdit] = useState(null); 
  
  const userEmail = user.email;
  const isMaster = userEmail === MASTER_USER;

  const [fdas, setFdas] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [usersList, setUsersList] = useState([]); 
  const [logsList, setLogsList] = useState([]);

  useEffect(() => {
    if (!userEmail) return;

    const fetchPermissions = () => {
      if (isMaster) {
        setUserPermissions(['entry', 'launched', 'finance', 'users', 'logs']);
        setLoadingPermissions(false);
        return;
      }

      const permRef = doc(db, 'artifacts', appId, 'public', 'data', 'permissions', userEmail);
      const unsubPerm = onSnapshot(permRef, async (docSnap) => {
        if (docSnap.exists()) {
          const modules = docSnap.data().modules || [];
          if (!modules.includes('entry')) modules.push('entry');
          setUserPermissions(modules);
        } else {
          await setDoc(permRef, { modules: ['entry'] });
          setUserPermissions(['entry']);
        }
        setLoadingPermissions(false);
      });
      return unsubPerm;
    };

    const unsubPerms = fetchPermissions();
    const unsubFdas = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'fdas'), (snapshot) => setFdas(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubItems = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'items'), (snapshot) => setRawItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubLogs = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), limit(100)), (snapshot) => {
        setLogsList(snapshot.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)));
    });

    let unsubUsers = () => {};
    if (isMaster) {
       unsubUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'permissions'), (snapshot) => setUsersList(snapshot.docs.map(d => ({ id: d.id, email: d.id, ...d.data() }))));
    }

    return () => { if (unsubPerms) unsubPerms(); unsubFdas(); unsubItems(); unsubUsers(); unsubLogs(); };
  }, [userEmail, isMaster]);

  const fdasWithItems = useMemo(() => fdas.map(fda => ({ ...fda, items: rawItems.filter(item => item.fdaId === fda.id) })).sort((a, b) => (b.number || '').localeCompare(a.number || '')), [fdas, rawItems]);
  const allItems = useMemo(() => rawItems.map(item => ({ ...item, fdaNumber: fdas.find(f => f.id === item.fdaId)?.number || 'N/A' })), [rawItems, fdas]);

  // Actions
  const addFda = async () => { 
    const number = `FDA-${new Date().getFullYear()}-${String(fdas.length + 1).padStart(3, '0')}`; 
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'fdas'), { number, createdAt: new Date().toISOString(), isOpen: true });
    logAction(userEmail, 'CRIAR FDA', `FDA Criada: ${number}`);
  };
  const toggleFda = async (id, status) => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fdas', id), { isOpen: !status });
  const updateFdaNumber = async (id, val) => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'fdas', id), { number: val.toUpperCase() });
  
  const saveItem = async (fdaId, itemData, filesNF, filesBoleto) => {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'items'), {
          fdaId,
          data: itemData,
          anexosNF: filesNF,
          anexosBoleto: filesBoleto,
          createdAt: new Date().toISOString()
      });
      logAction(userEmail, 'GRAVAR ITEM', `Item gravado para FDA ID ${fdaId} - Serviço: ${itemData.servicos}`);
  };

  const updateItem = async (id, data, filesNF = null, filesBoleto = null) => {
      const updatePayload = { data };
      if (filesNF) updatePayload.anexosNF = filesNF;
      if (filesBoleto) updatePayload.anexosBoleto = filesBoleto;
      
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'items', id), updatePayload);
      logAction(userEmail, 'ATUALIZAR ITEM', `Item atualizado: ${data.servicos} - Status: ${data.status}`);
  };

  const deleteItem = async (id) => { 
      if(window.confirm("Deseja excluir este item permanentemente?")) {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'items', id)); 
          logAction(userEmail, 'EXCLUIR ITEM', `Item ID ${id} excluído`);
      }
  };

  const triggerEdit = (item) => {
    setItemToEdit(item);
    setCurrentModule('entry');
  };

  if (loadingPermissions) return <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400">AUTENTICANDO...</div>;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-10 print:hidden">
        <div className="p-8"><h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md"><Receipt size={18} className="text-white"/></div>LMA Finanças</h1></div>
        <nav className="flex-1 px-4 space-y-1">
          {userPermissions.includes('entry') && <NavButton active={currentModule === 'entry'} onClick={() => setCurrentModule('entry')} icon={<FolderOpen size={18}/>} label="Lançamento" />}
          {userPermissions.includes('launched') && <NavButton active={currentModule === 'launched'} onClick={() => setCurrentModule('launched')} icon={<FileText size={18}/>} label="Itens Lançados" />}
          {userPermissions.includes('finance') && <NavButton active={currentModule === 'finance'} onClick={() => setCurrentModule('finance')} icon={<DollarSign size={18}/>} label="Contas a Pagar" />}
          {userPermissions.includes('logs') && <NavButton active={currentModule === 'logs'} onClick={() => setCurrentModule('logs')} icon={<History size={18}/>} label="Logs do Sistema" />}
          {isMaster && ( <> <div className="pt-6 pb-2 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Painel Admin</div> <NavButton active={currentModule === 'users'} onClick={() => setCurrentModule('users')} icon={<UserCog size={18}/>} label="Usuários" /> </> )}
        </nav>
        <div className="p-6 bg-slate-50 mt-auto border-t"><button onClick={() => signOut(auth)} className="w-full flex items-center justify-center gap-2 text-xs font-black uppercase text-slate-500 hover:text-red-600"><LogOut size={14} /> Sair do Sistema</button></div>
      </aside>
      <main className="flex-1 ml-64 p-10 overflow-y-auto print:m-0">
        {currentModule === 'entry' && <EntryModule fdas={fdasWithItems} allHistory={rawItems} addFda={addFda} toggleFda={toggleFda} updateFdaNumber={updateFdaNumber} saveItem={saveItem} updateItem={updateItem} deleteItem={deleteItem} editTarget={itemToEdit} clearEditTarget={() => setItemToEdit(null)} />}
        {currentModule === 'launched' && <LaunchedModule allItems={allItems} onEdit={triggerEdit} onDelete={deleteItem} onPreview={(files) => setModalPreview({ title: 'Visualização', files })} />}
        {currentModule === 'finance' && <FinanceModule allItems={allItems} isMaster={isMaster} updateItem={updateItem} onPreview={(files, title) => setModalPreview({ title, files })} onDelete={deleteItem} />}
        {currentModule === 'users' && isMaster && <UserManagementModule usersList={usersList} />}
        {currentModule === 'logs' && <LogsModule logs={logsList} />}
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
const StatusBadge = ({ status }) => { 
  const styles = { 'PENDENTE': 'bg-red-100 text-red-600', 'PROVISIONADO': 'bg-yellow-100 text-yellow-700', 'APROVADO': 'bg-blue-100 text-blue-700', 'PAGO': 'bg-green-100 text-green-700' }; 
  return ( <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg tracking-widest ${styles[status] || styles['PENDENTE']}`}>{status}</span> ); 
};
const InputField = ({ label, type = "text", value, onChange, placeholder = "", highlight = false, list }) => ( <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label><input list={list} type={type} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder={placeholder} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-bold transition-all outline-none uppercase ${highlight ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 focus:border-blue-400 focus:bg-white text-slate-700'}`} /></div> );
const FileUploadButton = ({ label, icon, onUpload, color }) => { const inputId = `file-${label}-${Math.random()}`; const colors = { blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100', slate: 'bg-slate-50 text-slate-500 hover:bg-slate-100' }; return ( <div className="flex-1"><input type="file" id={inputId} className="hidden" onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0].name); }} /><label htmlFor={inputId} className={`flex items-center justify-center gap-2 p-3 border border-dashed rounded-xl cursor-pointer font-black text-[10px] uppercase tracking-wider ${colors[color]}`}>{icon} {label}</label></div> ); };

// --- MÓDULOS ---

const LogsModule = ({ logs }) => (
  <div className="max-w-7xl mx-auto">
    <header className="mb-10"><h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg">Logs do Sistema</h2><p className="text-slate-500 font-medium">Auditoria de ações dos usuários</p></header>
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50 border-b"><tr><th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400">Data/Hora</th><th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400">Usuário</th><th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400">Ação</th><th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400">Detalhes</th></tr></thead>
        <tbody className="divide-y divide-slate-50">{logs.map(log => (<tr key={log.id} className="hover:bg-slate-50"><td className="p-5 font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</td><td className="p-5 font-bold text-slate-700">{log.user}</td><td className="p-5 font-black text-[10px] uppercase bg-slate-100 rounded inline-block m-2 text-slate-600">{log.action}</td><td className="p-5 text-slate-600">{log.details}</td></tr>))}</tbody>
      </table>
    </div>
  </div>
);

const UserManagementModule = ({ usersList }) => {
  const [newUserEmail, setNewUserEmail] = useState('');
  const handleUpdate = async (email, mod, has) => { const user = usersList.find(u => u.email === email); let mods = user ? (user.modules || []) : []; if (has) { if (!mods.includes(mod)) mods.push(mod); } else { mods = mods.filter(m => m !== mod); } await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'permissions', email), { modules: mods }, { merge: true }); };
  const addUser = async () => { if (!newUserEmail) return; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'permissions', newUserEmail.toLowerCase().trim()), { modules: ['entry'] }); setNewUserEmail(''); };
  // Abas mapeadas corretamente para o Master
  const modules = [{ k: 'entry', l: 'Lançamento' }, { k: 'finance', l: 'Contas a Pagar' }, { k: 'launched', l: 'Itens Lançados' }, { k: 'logs', l: 'Logs' }];
  return ( <div className="max-w-4xl mx-auto"><h2 className="text-3xl font-black mb-10 tracking-tight uppercase text-lg">Gerenciar Usuários</h2><div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 mb-8"><div className="flex gap-4"><input type="email" placeholder="nome@empresa.com" className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} /><button onClick={addUser} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs">Autorizar</button></div></div><div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"><table className="w-full text-sm text-left"><thead className="bg-slate-50 border-b"><tr><th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail</th>{modules.map(m => <th key={m.k} className="p-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.l}</th>)}</tr></thead><tbody>{usersList.map(u => (<tr key={u.email} className="hover:bg-slate-50"><td className="p-5 font-bold text-slate-700">{u.email}</td>{modules.map(m => (<td key={m.k} className="p-5 text-center"><input type="checkbox" className="w-5 h-5 rounded text-blue-600" checked={u.modules?.includes(m.k)} onChange={(e) => handleUpdate(u.email, m.k, e.target.checked)} /></td>))}</tr>))}</tbody></table></div></div> );
};

const EntryModule = ({ fdas, addFda, toggleFda, updateFdaNumber, saveItem, updateItem, deleteItem, allHistory, editTarget, clearEditTarget }) => {
  const [activeFdaId, setActiveFdaId] = useState(null);
  const [formData, setFormData] = useState({
    status: 'PENDENTE', navio: '', vencimento: '', servicos: '', documento: '', dataEmissao: '',
    valorBruto: 0, centroCusto: '', nfs: '', valorBase: 0, valorLiquido: 0,
    pis: 0, cofins: 0, csll: 0, guia5952: 0, irrf: 0, guia1708: 0, inss: 0, iss: 0, impostoRet: 0, multa: 0, juros: 0, total: 0,
    clienteFornecedor: '', cnpjCpf: '',
    banco: '', codigoBanco: '', agencia: '', contaCorrente: '', chavePix: '', dataPagamento: '', valorPago: 0, jurosPagos: 0
  });
  const [anexosNF, setAnexosNF] = useState([]);
  const [anexosBoleto, setAnexosBoleto] = useState([]);

  // Auto-fill Suggestions
  const clients = useMemo(() => [...new Set(allHistory.map(i => i.data.clienteFornecedor).filter(Boolean))], [allHistory]);
  const vessels = useMemo(() => [...new Set(allHistory.map(i => i.data.navio).filter(Boolean))], [allHistory]);

  // Load Edit Target
  useEffect(() => {
    if (editTarget) {
      setFormData(editTarget.data);
      setAnexosNF(editTarget.anexosNF || []);
      setAnexosBoleto(editTarget.anexosBoleto || []);
      setActiveFdaId(editTarget.fdaId);
      // Ensure the FDA is open
      const fda = fdas.find(f => f.id === editTarget.fdaId);
      if (fda && !fda.isOpen) toggleFda(fda.id, false);
    }
  }, [editTarget]);

  const handleInputChange = (field, value) => {
    let newData = { ...formData, [field]: value };
    
    // Auto-fill Banking Info based on Client
    if (field === 'clienteFornecedor') {
        const lastEntry = allHistory.find(i => i.data.clienteFornecedor === value);
        if (lastEntry) {
            newData.banco = lastEntry.data.banco || '';
            newData.codigoBanco = lastEntry.data.codigoBanco || '';
            newData.agencia = lastEntry.data.agencia || '';
            newData.contaCorrente = lastEntry.data.contaCorrente || '';
            newData.chavePix = lastEntry.data.chavePix || '';
            newData.cnpjCpf = lastEntry.data.cnpjCpf || '';
        }
    }

    if (field === 'valorBruto') {
      const v = parseFloat(value) || 0;
      newData.pis = Number((v * 0.0065).toFixed(2));
      newData.cofins = Number((v * 0.03).toFixed(2));
      newData.csll = Number((v * 0.01).toFixed(2));
      newData.guia5952 = Number((newData.pis + newData.cofins + newData.csll).toFixed(2));
      newData.irrf = Number((v * 0.015).toFixed(2));
      newData.guia1708 = newData.irrf;
      newData.valorBase = v;
      
      const totalRet = newData.guia5952 + newData.irrf + parseFloat(newData.inss||0) + parseFloat(newData.iss||0);
      newData.impostoRet = totalRet;
      newData.valorLiquido = v - totalRet;
      newData.total = v + (parseFloat(newData.multa)||0) + (parseFloat(newData.juros)||0);
    }
    setFormData(newData);
  };

  const handleSave = async (fdaId) => {
      if (editTarget) {
        await updateItem(editTarget.id, formData, anexosNF, anexosBoleto);
        clearEditTarget();
      } else {
        await saveItem(fdaId, formData, anexosNF, anexosBoleto);
      }
      setFormData({ // Reset
        status: 'PENDENTE', navio: '', vencimento: '', servicos: '', documento: '', dataEmissao: '', valorBruto: 0, centroCusto: '', nfs: '', valorBase: 0, valorLiquido: 0, pis: 0, cofins: 0, csll: 0, guia5952: 0, irrf: 0, guia1708: 0, inss: 0, iss: 0, impostoRet: 0, multa: 0, juros: 0, total: 0, clienteFornecedor: '', cnpjCpf: '', banco: '', codigoBanco: '', agencia: '', contaCorrente: '', chavePix: '', dataPagamento: '', valorPago: 0, jurosPagos: 0
      });
      setAnexosNF([]); setAnexosBoleto([]); setActiveFdaId(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <datalist id="clients-list">{clients.map(c => <option key={c} value={c} />)}</datalist>
      <datalist id="vessels-list">{vessels.map(v => <option key={v} value={v} />)}</datalist>

      <div className="flex justify-between items-center mb-10"><h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg">Lançamento de Itens</h2><button onClick={addFda} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center gap-2 hover:bg-slate-800 shadow-xl transition-all"><Plus size={18}/> Novo Atendimento</button></div>
      <div className="space-y-8">{fdas.map(f => (
        <div key={f.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-6 flex justify-between items-center cursor-pointer" onClick={() => toggleFda(f.id, f.isOpen)}>
              <div className="flex items-center gap-5">
                <div className={`p-2 rounded-lg ${f.isOpen ? 'bg-blue-100 text-blue-600' : 'bg-slate-200'}`}>{f.isOpen ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}</div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Ref. Lote</label><input type="text" value={f.number} onClick={e => e.stopPropagation()} onChange={e => updateFdaNumber(f.id, e.target.value)} className="bg-transparent font-mono text-xl font-black text-blue-600 focus:outline-none w-full uppercase" /></div>
              </div>
              <button onClick={e => { e.stopPropagation(); setActiveFdaId(activeFdaId === f.id ? null : f.id); }} className="bg-white border-2 border-blue-600 text-blue-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest">{activeFdaId === f.id ? 'Fechar' : 'Novo Lançamento'}</button>
            </div>
            
            {/* FORMULÁRIO DE LANÇAMENTO */}
            {activeFdaId === f.id && (
                <div className="p-8 border-t border-blue-100 bg-blue-50/20">
                    <h4 className="font-black text-blue-600 uppercase tracking-widest mb-6 border-b pb-2 flex justify-between">
                      <span>{editTarget ? 'Editando Item' : 'Novo Item'}</span>
                      {editTarget && <button onClick={clearEditTarget} className="text-red-500 text-[10px] underline">Cancelar Edição</button>}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="space-y-4">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dados Principais</h5>
                            <InputField label="Navio (Vessel)" list="vessels-list" value={formData.navio} onChange={v => handleInputChange('navio', v)} />
                            <InputField label="Serviços" value={formData.servicos} onChange={v => handleInputChange('servicos', v)} />
                            <div className="grid grid-cols-2 gap-2">
                                <InputField label="Documento" value={formData.documento} onChange={v => handleInputChange('documento', v)} />
                                <InputField label="NF (Invoice)" value={formData.nfs} onChange={v => handleInputChange('nfs', v)} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <InputField label="Emissão" type="date" value={formData.dataEmissao} onChange={v => handleInputChange('dataEmissao', v)} />
                                <InputField label="Vencimento" type="date" value={formData.vencimento} onChange={v => handleInputChange('vencimento', v)} />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Financeiro & Impostos</h5>
                            <InputField label="Valor Bruto" type="number" value={formData.valorBruto} onChange={v => handleInputChange('valorBruto', v)} highlight />
                            <div className="grid grid-cols-2 gap-2">
                                <InputField label="PIS (0.65%)" type="number" value={formData.pis} onChange={v => handleInputChange('pis', v)} />
                                <InputField label="COFINS (3%)" type="number" value={formData.cofins} onChange={v => handleInputChange('cofins', v)} />
                                <InputField label="CSLL (1%)" type="number" value={formData.csll} onChange={v => handleInputChange('csll', v)} />
                                <InputField label="IRRF (1.5%)" type="number" value={formData.irrf} onChange={v => handleInputChange('irrf', v)} />
                                <InputField label="INSS" type="number" value={formData.inss} onChange={v => handleInputChange('inss', v)} />
                                <InputField label="ISS" type="number" value={formData.iss} onChange={v => handleInputChange('iss', v)} />
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-slate-200">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Total Líquido</p>
                                <p className="text-xl font-black text-slate-800">R$ {formData.total?.toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagamento & Anexos</h5>
                            <InputField label="Cliente / Fornecedor" list="clients-list" value={formData.clienteFornecedor} onChange={v => handleInputChange('clienteFornecedor', v)} />
                            <div className="grid grid-cols-2 gap-2">
                                <InputField label="Banco" value={formData.banco} onChange={v => handleInputChange('banco', v)} />
                                <InputField label="Agência" value={formData.agencia} onChange={v => handleInputChange('agencia', v)} />
                                <InputField label="Conta" value={formData.contaCorrente} onChange={v => handleInputChange('contaCorrente', v)} />
                                <InputField label="PIX" value={formData.chavePix} onChange={v => handleInputChange('chavePix', v)} />
                            </div>
                            <div className="flex gap-2 mt-4">
                                <FileUploadButton label="Nota" icon={<Receipt size={14}/>} onUpload={n => setAnexosNF([...anexosNF, {id: Date.now(), name: n, date: new Date().toLocaleString()}])} color="blue" />
                                <FileUploadButton label="Boleto" icon={<Banknote size={14}/>} onUpload={n => setAnexosBoleto([...anexosBoleto, {id: Date.now(), name: n, date: new Date().toLocaleString()}])} color="slate" />
                            </div>
                            <div className="space-y-1">
                                {[...anexosNF, ...anexosBoleto].map((file, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border text-xs">
                                        <span className="truncate w-32">{file.name}</span>
                                        <button onClick={() => {
                                            if(anexosNF.includes(file)) setAnexosNF(anexosNF.filter(f => f !== file));
                                            else setAnexosBoleto(anexosBoleto.filter(f => f !== file));
                                        }} className="text-red-500 hover:bg-red-50 rounded p-1"><X size={12}/></button>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => handleSave(f.id)} className="w-full py-3 bg-green-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-green-700 shadow-lg mt-4">{editTarget ? 'Atualizar Item' : 'Gravar Lançamento'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* LISTA DE ITENS SALVOS */}
            {f.isOpen && (
              <div className="p-6 space-y-4">
                {f.items.map((it, idx) => (
                  <div key={it.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-blue-300 shadow-sm transition-all">
                    <div className="p-5 flex justify-between items-center">
                        <div className="flex gap-5 items-center">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-black text-slate-400 text-[10px]">{idx+1}</div>
                            <div>
                                <p className="font-black text-slate-700 uppercase text-sm">{it.data.servicos}</p>
                                <p className="text-[10px] text-slate-400 font-black uppercase">DOC: {it.data.documento} • R$ {it.data.total}</p>
                            </div>
                        </div>
                        <div className="flex gap-2 items-center">
                            <StatusBadge status={it.data.status} />
                            {/* Botão de Edição que carrega o formulário */}
                            <button onClick={() => { setActiveFdaId(f.id); editTarget ? clearEditTarget() : (function(){ setFormData(it.data); setAnexosNF(it.anexosNF||[]); setAnexosBoleto(it.anexosBoleto||[]); })() }} className="p-2 text-slate-300 hover:text-blue-600"><Edit size={16}/></button>
                            <button onClick={() => deleteItem(it.id)} className="p-2 text-slate-300 hover:text-red-600"><Trash2 size={16}/></button>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      ))}</div>
    </div>
  );
};

const LaunchedModule = ({ allItems, onDelete, onEdit, onPreview }) => {
  const [f, setF] = useState('');
  const [tab, setTab] = useState('abertos'); // abertos vs liquidados
  const [eO, setEO] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => { const h = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setEO(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  const filtered = useMemo(() => allItems.filter(i => {
      const matchText = (i.data.servicos||'').toLowerCase().includes(f.toLowerCase()) || (i.fdaNumber||'').toLowerCase().includes(f.toLowerCase());
      const matchTab = tab === 'abertos' ? i.data.status !== 'PAGO' : i.data.status === 'PAGO';
      return matchText && matchTab;
  }).sort((a, b) => new Date(b.data.vencimento) - new Date(a.data.vencimento)), [allItems, f, tab]);

  const exportCSV = () => { /* ... mesma lógica ... */ };

  return ( 
    <div className="max-w-7xl mx-auto">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div><h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg">Itens Lançados</h2></div>
        
        {/* Barra de Pesquisa Global */}
        <div className="flex items-center gap-3 w-full md:w-auto bg-white p-1 rounded-xl border border-slate-200">
            <Search className="text-slate-400 ml-3" size={18}/>
            <input type="text" placeholder="Pesquisa global..." className="py-2 outline-none w-64 text-sm font-medium" value={f} onChange={e => setF(e.target.value)} />
        </div>
      </header>

      {/* Abas Superiores */}
      <div className="flex gap-4 mb-6">
          <button onClick={() => setTab('abertos')} className={`px-6 py-2 rounded-full font-black uppercase text-[10px] tracking-widest transition-all ${tab === 'abertos' ? 'bg-slate-800 text-white' : 'bg-white text-slate-400 border'}`}>Em Aberto</button>
          <button onClick={() => setTab('liquidados')} className={`px-6 py-2 rounded-full font-black uppercase text-[10px] tracking-widest transition-all ${tab === 'liquidados' ? 'bg-green-600 text-white' : 'bg-white text-slate-400 border'}`}>Liquidados</button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimento</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Serviço / FDA</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
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
                <td className="p-5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => onEdit(i)} className="p-2 text-slate-400 hover:text-blue-600"><Edit size={18}/></button>
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

const FinanceModule = ({ allItems, isMaster, updateItem, onDelete, onPreview }) => {
  const [aT, setAT] = useState('PENDENTE'); // Estado atual: PENDENTE, PROVISIONADO, APROVADO, PAGO
  const [search, setSearch] = useState('');

  // Agrupamento por Data
  const groupedItems = useMemo(() => {
    // 1. Filtrar pelo status da aba e pela busca
    let filtered = allItems.filter(i => i.data.status === aT && (
        i.data.servicos.toLowerCase().includes(search.toLowerCase()) ||
        i.data.clienteFornecedor.toLowerCase().includes(search.toLowerCase())
    ));

    // 2. Agrupar
    const groups = {};
    filtered.forEach(item => {
        const dateKey = item.data.vencimento || 'Sem Data';
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(item);
    });

    // 3. Ordenar chaves (datas)
    return Object.keys(groups).sort().map(date => ({
        date,
        items: groups[date]
    }));
  }, [allItems, aT, search]);
  
  const handleStatus = async (id, cur, s) => { 
    const n = new Date().toISOString().split('T')[0]; 
    let ups = { status: s }; 
    // Lógica de Datas
    if (s === 'PROVISIONADO') ups.dataProvisionamento = n; 
    if (s === 'APROVADO') ups.dataAprovacao = n; 
    if (s === 'PAGO') ups.dataPagamentoReal = n; 
    await updateItem(id, { ...cur, ...ups }); 
  };

  // Definição das Abas e Próximos Passos
  const steps = {
      'PENDENTE': { label: 'A Pagar', next: 'PROVISIONADO', btn: 'Provisionar', color: 'bg-yellow-500' },
      'PROVISIONADO': { label: 'Provisionado', next: 'APROVADO', prev: 'PENDENTE', btn: 'Aprovar', color: 'bg-blue-600' },
      'APROVADO': { label: 'Aprovado', next: 'PAGO', prev: 'PROVISIONADO', btn: 'Liquidar', color: 'bg-green-600' },
      'PAGO': { label: 'Liquidados', prev: 'APROVADO' } // Sem próximo passo
  };
  
  const openFile = (files, title) => {
      if (files && files.length > 0) {
          onPreview(files, title);
      } else {
          alert("Nenhum arquivo anexado.");
      }
  };
  
  return ( 
    <div className="max-w-7xl mx-auto">
      <header className="mb-8 flex justify-between items-center">
          <div><h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg">Contas a Pagar</h2></div>
          <div className="flex bg-white p-1 rounded-xl border border-slate-200">
              <Search className="text-slate-400 ml-3" size={18}/>
              <input type="text" placeholder="Pesquisar contas..." className="py-2 px-3 outline-none w-64 text-sm font-medium" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
      </header>

      {/* Navegação de Abas */}
      <div className="flex gap-2 border-b mb-8 overflow-x-auto">
        {Object.keys(steps).map(key => (
          <button key={key} onClick={() => setAT(key)} className={`px-10 py-3 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${aT === key ? `border-blue-600 text-blue-600 bg-blue-50/50` : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {steps[key].label}
          </button>
        ))}
      </div>

      {/* Lista Agrupada */}
      <div className="space-y-8">
        {groupedItems.length === 0 ? <div className="text-center py-20 text-slate-300 italic font-medium">Nenhum item nesta etapa.</div> : groupedItems.map(group => (
            <div key={group.date} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 p-4 border-b flex items-center gap-3">
                    <Calendar size={16} className="text-slate-400"/>
                    <span className="font-black text-slate-700 text-xs uppercase tracking-widest">Vencimento: {new Date(group.date).toLocaleDateString('pt-BR')}</span>
                </div>
                <table className="w-full text-sm text-left">
                    <tbody className="divide-y divide-slate-50">
                        {group.items.map(it => (
                            <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-5 w-1/3">
                                    <div className="font-black text-slate-800 uppercase text-xs">{it.data.servicos}</div>
                                    <div className="text-[10px] text-slate-400 font-bold mt-1">{it.data.clienteFornecedor}</div>
                                </td>
                                <td className="p-5 text-right font-black text-slate-900 w-1/6">
                                    R$ {parseFloat(it.data.total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                </td>
                                <td className="p-5 text-center w-1/4">
                                    <div className="flex gap-2 justify-center">
                                        <button onClick={() => openFile(it.anexosNF, "Nota Fiscal")} className="flex items-center gap-1 text-[9px] font-bold uppercase bg-blue-50 text-blue-600 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors"><ExternalLink size={10}/> Nota</button>
                                        <button onClick={() => openFile(it.anexosBoleto, "Boleto")} className="flex items-center gap-1 text-[9px] font-bold uppercase bg-slate-50 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors"><ExternalLink size={10}/> Boleto</button>
                                    </div>
                                </td>
                                <td className="p-5 text-center w-1/4">
                                    <div className="flex items-center justify-end gap-2">
                                        {steps[aT].prev && (
                                            <button onClick={() => handleStatus(it.id, it.data, steps[aT].prev)} className="p-2 text-slate-400 hover:text-orange-500 transition-colors" title="Retornar Status"><Undo2 size={18}/></button>
                                        )}
                                        {steps[aT].next && (
                                            <button onClick={() => handleStatus(it.id, it.data, steps[aT].next)} className={`px-4 py-2 ${steps[aT].color} text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md hover:opacity-90 transition-all`}>
                                                {steps[aT].btn}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ))}
      </div>
    </div> 
  );
};

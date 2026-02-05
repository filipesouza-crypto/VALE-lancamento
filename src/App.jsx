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
  limit,
  writeBatch
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
  storageBucket: "controle-de-notas-8d0ba.appspot.com",
  messagingSenderId: "832409792798",
  appId: "1:832409792798:web:3ae6f15a0bbbb07870d90f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const appId = "lma-finance";

// --- CONFIGURAÇÕES DE ARQUIVO ---
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx'];

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

// --- FUNÇÕES AUXILIARES DE VALIDAÇÃO ---
const validateFile = (file) => {
  if (!file) return { valid: false, error: 'Nenhum arquivo selecionado' };

  // Validar tamanho
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `Arquivo muito grande! Máximo: ${sizeMB}MB. Tamanho: ${(file.size / (1024 * 1024)).toFixed(2)}MB`
    };
  }

  // Validar tipo
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Tipo de arquivo não permitido. Aceitos: PDF, PNG, JPG, XLSX`
    };
  }

  return { valid: true, error: null };
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
};

// Função para salvar arquivo em chunks
const saveFileChunks = async (file) => {
  const base64 = await fileToBase64(file);
  const CHUNK_SIZE = 800 * 1024; // 800KB
  const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);

  // CORREÇÃO: Caminho com número ímpar de segmentos (adicionado 'data')
  const fileDocRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'files'), {
    name: file.name,
    size: file.size,
    type: file.type,
    totalChunks: totalChunks,
    createdAt: new Date().toISOString()
  });

  const batch = writeBatch(db);
  for (let i = 0; i < totalChunks; i++) {
    const chunkContent = base64.substr(i * CHUNK_SIZE, CHUNK_SIZE);
    // CORREÇÃO: Caminho dos chunks também deve seguir a estrutura
    const chunkRef = doc(db, 'artifacts', appId, 'public', 'data', 'files', fileDocRef.id, 'chunks', i.toString());
    batch.set(chunkRef, { content: chunkContent, index: i });
  }
  await batch.commit();

  return fileDocRef.id;
};

// Função para reconstruir arquivo a partir dos chunks
const getFileFromChunks = async (fileId) => {
  // CORREÇÃO: Caminho correto
  const chunksRef = collection(db, 'artifacts', appId, 'public', 'data', 'files', fileId, 'chunks');
  const snapshot = await getDocs(chunksRef);

  if (snapshot.empty) return null;

  const chunks = snapshot.docs
    .map(d => ({ index: parseInt(d.id), content: d.data().content }))
    .sort((a, b) => a.index - b.index);

  return chunks.map(c => c.content).join('');
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
        setUserPermissions(['entry', 'launched', 'finance', 'users', 'logs', 'all_tabs']);
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
    const unsubLogs = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), limit(500)), (snapshot) => {
      setLogsList(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    });

    let unsubUsers = () => { };
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
    try {
      const nfUrls = [];
      const boletoUrls = [];

      // Upload sequencial para evitar travamentos e erros no Firestore
      for (const file of filesNF) {
        if (file.file) {
          const fileId = await saveFileChunks(file.file);
          nfUrls.push({
            name: file.file.name,
            fileId: fileId,
            date: new Date().toLocaleString('pt-BR'),
            size: formatFileSize(file.file.size)
          });
        } else {
          nfUrls.push(file);
        }
      }

      for (const file of filesBoleto) {
        if (file.file) {
          const fileId = await saveFileChunks(file.file);
          boletoUrls.push({
            name: file.file.name,
            fileId: fileId,
            date: new Date().toLocaleString('pt-BR'),
            size: formatFileSize(file.file.size)
          });
        } else {
          boletoUrls.push(file);
        }
      }

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'items'), {
        fdaId,
        data: itemData,
        anexosNF: nfUrls,
        anexosBoleto: boletoUrls,
        historico_anexos: {
          nf: nfUrls.map(f => ({ ...f, uploadedAt: new Date().toISOString() })),
          boleto: boletoUrls.map(f => ({ ...f, uploadedAt: new Date().toISOString() }))
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Log enriquecido
      const fda = fdas.find(f => f.id === fdaId);
      logAction(userEmail, 'GRAVAR ITEM', `Item gravado. FDA: ${fda?.number || 'N/A'} - Navio: ${itemData.navio} - Serviço: ${itemData.servicos}`);
    } catch (error) {
      console.error('Erro ao salvar item:', error);
      throw new Error(`Falha ao salvar: ${error.message}`);
    }
  };

  const updateItem = async (id, data, filesNF = null, filesBoleto = null) => {
    try {
      const updatePayload = { data };

      // Upload sequencial
      if (filesNF) { // Permite deletar se array vier vazio
        const nfUrls = [];
        for (const file of filesNF) {
          if (file.file) {
            const fileId = await saveFileChunks(file.file);
            nfUrls.push({
              name: file.file.name,
              fileId: fileId,
              date: new Date().toLocaleString('pt-BR'),
              size: formatFileSize(file.file.size)
            });
          } else if (file.url || file.fileId) {
            nfUrls.push(file);
          }
        }
        updatePayload.anexosNF = nfUrls;
      }

      if (filesBoleto) { // Permite deletar se array vier vazio
        const boletoUrls = [];
        for (const file of filesBoleto) {
          if (file.file) {
            const fileId = await saveFileChunks(file.file);
            boletoUrls.push({
              name: file.file.name,
              fileId: fileId,
              date: new Date().toLocaleString('pt-BR'),
              size: formatFileSize(file.file.size)
            });
          } else if (file.url || file.fileId) {
            boletoUrls.push(file);
          }
        }
        updatePayload.anexosBoleto = boletoUrls;
      }

      updatePayload.updatedAt = new Date().toISOString();

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'items', id), updatePayload);

      // Log enriquecido
      const currentItem = allItems.find(i => i.id === id);
      const fdaNum = currentItem?.fdaNumber || 'N/A';
      logAction(userEmail, 'ATUALIZAR ITEM', `Item atualizado. FDA: ${fdaNum} - Navio: ${data.navio} - Serviço: ${data.servicos} - Status: ${data.status}`);
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      throw new Error(`Falha ao atualizar: ${error.message}`);
    }
  };

  const deleteItem = async (id) => {
    if (window.confirm("Deseja excluir este item permanentemente?")) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'items', id));
      logAction(userEmail, 'EXCLUIR ITEM', `Item ID ${id} excluído`);
    }
  };

  const triggerEdit = (item) => {
    setItemToEdit(item);
    setCurrentModule('entry');
  };

  // Função para abrir o arquivo do Firebase Storage
  const handleViewFile = async (file) => {
    try {
      let base64Url = file.url;

      // Se for arquivo em chunks, precisa reconstruir
      if (file.fileId) {
        // Feedback visual simples pode ser adicionado aqui (e.g. toast loading)
        const rebuiltBase64 = await getFileFromChunks(file.fileId);
        if (rebuiltBase64) {
          base64Url = rebuiltBase64;
        } else {
          alert('Erro: Arquivo não encontrado no servidor ou corrompido.');
          return;
        }
      }

      if (base64Url) {
        if (base64Url.startsWith('data:')) {
          // Base64 -> Blob -> URL para evitar bloqueio de "Not allowed to navigate top frame to data URL"
          const arr = base64Url.split(',');
          const mimeMatch = arr[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const blob = new Blob([u8arr], { type: mime });
          const blobUrl = URL.createObjectURL(blob);
          const newWindow = window.open(blobUrl, '_blank');

          // Opcional: revogar URL após uso esporádico, mas aqui mantemos simples
          // setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); 

          if (!newWindow) {
            alert("Pop-up bloqueado. Por favor, permita pop-ups para visualizar o arquivo.");
          } else {
            logAction(userEmail, 'VISUALIZAR ANEXO', `Arquivo visualizado: ${file.name}`);
          }
        } else {
          // URL antiga (Storage)
          window.open(base64Url, '_blank');
          logAction(userEmail, 'VISUALIZAR ANEXO', `Arquivo visualizado: ${file.name}`);
        }
      } else if (file.file) {
        // Se for um arquivo local novo (File object), cria um blob temporário para visualização
        const blobUrl = URL.createObjectURL(file.file);
        window.open(blobUrl, '_blank');
        logAction(userEmail, 'VISUALIZAR ANEXO', `Arquivo visualizado: ${file.name}`);
      } else {
        alert('Arquivo não disponível para visualização.');
      }
    } catch (e) {
      console.error("Erro ao abrir arquivo", e);
      alert("Erro ao tentar visualizar o arquivo.");
    }
  };

  if (loadingPermissions) return <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400">AUTENTICANDO...</div>;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-10 print:hidden">
        <div className="p-8"><h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md"><Receipt size={18} className="text-white" /></div>LMA Finanças</h1></div>
        <nav className="flex-1 px-4 space-y-1">
          {userPermissions.includes('entry') && <NavButton active={currentModule === 'entry'} onClick={() => setCurrentModule('entry')} icon={<FolderOpen size={18} />} label="Lançamento" />}
          {userPermissions.includes('launched') && <NavButton active={currentModule === 'launched'} onClick={() => setCurrentModule('launched')} icon={<FileText size={18} />} label="Itens Lançados" />}
          {userPermissions.includes('finance') && <NavButton active={currentModule === 'finance'} onClick={() => setCurrentModule('finance')} icon={<DollarSign size={18} />} label="Contas a Pagar" />}
          {userPermissions.includes('logs') && <NavButton active={currentModule === 'logs'} onClick={() => setCurrentModule('logs')} icon={<History size={18} />} label="Logs do Sistema" />}
          {isMaster && (<> <div className="pt-6 pb-2 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Painel Admin</div> <NavButton active={currentModule === 'users'} onClick={() => setCurrentModule('users')} icon={<UserCog size={18} />} label="Usuários" /> </>)}
        </nav>
        <div className="p-6 bg-slate-50 mt-auto border-t"><button onClick={() => signOut(auth)} className="w-full flex items-center justify-center gap-2 text-xs font-black uppercase text-slate-500 hover:text-red-600"><LogOut size={14} /> Sair do Sistema</button></div>
      </aside>
      <main className="flex-1 ml-64 p-10 overflow-y-auto print:m-0">
        {currentModule === 'entry' && <EntryModule userEmail={userEmail} fdas={fdasWithItems} allHistory={rawItems} addFda={addFda} toggleFda={toggleFda} updateFdaNumber={updateFdaNumber} saveItem={saveItem} updateItem={updateItem} deleteItem={deleteItem} editTarget={itemToEdit} clearEditTarget={() => setItemToEdit(null)} onEdit={triggerEdit} onPreview={(files, title) => setModalPreview({ title, files })} />}
        {currentModule === 'launched' && <LaunchedModule allItems={allItems} userPermissions={userPermissions} onEdit={triggerEdit} onDelete={deleteItem} onPreview={(files) => setModalPreview({ title: 'Visualização', files })} />}
        {currentModule === 'finance' && <FinanceModule allItems={allItems} isMaster={isMaster} userPermissions={userPermissions} updateItem={updateItem} onPreview={(files, title) => setModalPreview({ title, files })} onDelete={deleteItem} />}
        {currentModule === 'users' && isMaster && <UserManagementModule usersList={usersList} />}
        {currentModule === 'logs' && <LogsModule logs={logsList} />}
      </main>

      {/* Modal de Anexos */}
      {modalPreview && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b flex justify-between items-center"><h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex gap-2"><Paperclip size={18} className="text-blue-600" /> {modalPreview.title}</h3><button onClick={() => setModalPreview(null)} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20} /></button></div>
            <div className="p-8 max-h-[70vh] overflow-y-auto bg-slate-50/50">
              {modalPreview.files?.length > 0 ? (
                <ul className="space-y-4">
                  {modalPreview.files.map((file, idx) => (
                    <li key={idx} className="flex flex-col gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
                      <div className="flex items-center gap-4">
                        {/* Thumbnail para imagens */}
                        {file.url && file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          <img src={file.url} alt={file.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg flex-shrink-0"><FileText size={20} /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-700 truncate">{file.name}</p>
                          <p className="text-[10px] text-slate-400 font-black uppercase mt-0.5">{file.date || new Date().toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {/* Botão Download */}
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all flex items-center gap-1"
                            title="Download"
                          >
                            <Download size={12} /> Download
                          </button>
                          {/* Botão Visualizar */}
                          <button
                            onClick={() => handleViewFile(file)}
                            className="px-3 py-2 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-all flex items-center gap-1"
                          >
                            <Eye size={12} /> Visualizar
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-10 text-slate-400 font-medium italic"><AlertCircle className="mx-auto mb-2 text-slate-300" /> <p>Sem anexos.</p></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- COMPONENTES AUXILIARES ---
const FilterBar = ({ search, onSearchChange, sortBy, onSortChange, filterStatus, onFilterChange, showStatusFilter = false }) => {
  const sortOptions = [
    { value: 'vencimento-asc', label: 'Vencimento (Mais Antigo)' },
    { value: 'vencimento-desc', label: 'Vencimento (Mais Recente)' },
    { value: 'valor-asc', label: 'Valor (Menor)' },
    { value: 'valor-desc', label: 'Valor (Maior)' },
    { value: 'servico-asc', label: 'Serviço (A-Z)' },
    { value: 'servico-desc', label: 'Serviço (Z-A)' }
  ];

  const statusOptions = [
    { value: 'all', label: 'Todos os Status' },
    { value: 'PENDENTE', label: 'Pendente' },
    { value: 'PROVISIONADO', label: 'Provisionado' },
    { value: 'APROVADO', label: 'Aprovado' },
    { value: 'PAGO', label: 'Pago' }
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Campo de Pesquisa */}
        <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-2 border border-slate-200">
          <Search className="text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Pesquisar por serviço, fornecedor, FDA..."
            className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>

        {/* Ordenação */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="text-slate-400" size={18} />
          <select
            value={sortBy}
            onChange={e => onSortChange(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors outline-none cursor-pointer"
          >
            {sortOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Filtro de Status (opcional) */}
        {showStatusFilter && (
          <div className="flex items-center gap-2">
            <Filter className="text-slate-400" size={18} />
            <select
              value={filterStatus}
              onChange={e => onFilterChange(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors outline-none cursor-pointer"
            >
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }) => (<button onClick={onClick} className={`w-full flex items-center gap-3 px-6 py-4 rounded-xl transition-all font-bold text-sm tracking-tight ${active ? 'bg-blue-600 text-white shadow-xl translate-x-1' : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'}`}>{icon}<span>{label}</span></button>);
const StatusBadge = ({ status }) => {
  const styles = { 'PENDENTE': 'bg-red-100 text-red-600', 'PROVISIONADO': 'bg-yellow-100 text-yellow-700', 'APROVADO': 'bg-blue-100 text-blue-700', 'PAGO': 'bg-green-100 text-green-700' };
  return (<span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg tracking-widest ${styles[status] || styles['PENDENTE']}`}>{status}</span>);
};
const InputField = ({ label, type = "text", value, onChange, placeholder = "", highlight = false, list }) => (<div className="flex flex-col gap-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label><input list={list} type={type} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder={placeholder} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-bold transition-all outline-none uppercase ${highlight ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 focus:border-blue-400 focus:bg-white text-slate-700'}`} /></div>);
const FileUploadButton = ({ label, icon, onUpload, color, isUploading = false }) => {
  const inputId = `file-${label}-${Math.random()}`;
  const colors = { blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100', slate: 'bg-slate-50 text-slate-500 hover:bg-slate-100' };

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];

      // Validar arquivo
      const validation = validateFile(file);
      if (!validation.valid) {
        alert(validation.error);
        e.target.value = '';
        return;
      }

      // Passou na validação
      onUpload({
        file,
        name: file.name,
        size: formatFileSize(file.size),
        date: new Date().toLocaleString()
      });

      // Limpar input para permitir mesmo arquivo novamente
      e.target.value = '';
    }
  };

  return (
    <div className="flex-1">
      <input
        type="file"
        id={inputId}
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      <label
        htmlFor={inputId}
        className={`flex items-center justify-center gap-2 p-3 border border-dashed rounded-xl cursor-pointer font-black text-[10px] uppercase tracking-wider transition-all ${isUploading ? 'opacity-50 cursor-not-allowed' : colors[color]}`}
      >
        {isUploading ? (
          <>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            Enviando...
          </>
        ) : (
          <>
            {icon} {label}
          </>
        )}
      </label>
    </div>
  );
};

// --- MÓDULOS ---

const LogsModule = ({ logs }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('data-desc');
  const [filterAction, setFilterAction] = useState('all');

  // Extrair ações únicas para o filtro
  const uniqueActions = useMemo(() => {
    const actions = [...new Set(logs.map(log => log.action))];
    return ['all', ...actions.sort()];
  }, [logs]);

  // Função de ordenação
  const applySorting = (items) => {
    const sorted = [...items];
    switch (sortBy) {
      case 'data-asc':
        return sorted.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      case 'data-desc':
        return sorted.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      case 'usuario-asc':
        return sorted.sort((a, b) => a.user.localeCompare(b.user));
      case 'usuario-desc':
        return sorted.sort((a, b) => b.user.localeCompare(a.user));
      case 'acao-asc':
        return sorted.sort((a, b) => a.action.localeCompare(b.action));
      case 'acao-desc':
        return sorted.sort((a, b) => b.action.localeCompare(a.action));
      default:
        return sorted;
    }
  };

  // Filtragem de Logs
  const filteredLogs = useMemo(() => {
    let filtered = logs;

    // Filtro por texto
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(log =>
        log.user.toLowerCase().includes(s) ||
        log.action.toLowerCase().includes(s) ||
        log.details.toLowerCase().includes(s)
      );
    }

    // Filtro por ação
    if (filterAction !== 'all') {
      filtered = filtered.filter(log => log.action === filterAction);
    }

    // Aplicar ordenação
    return applySorting(filtered);
  }, [logs, search, sortBy, filterAction]);

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg mb-2">Logs do Sistema</h2>
        <p className="text-slate-500 font-medium mb-6">Auditoria de ações dos usuários</p>

        {/* Barra de Filtros Customizada para Logs */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Campo de Pesquisa */}
            <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-2 border border-slate-200">
              <Search className="text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Pesquisar usuário, ação ou detalhes..."
                className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Filtro por Ação */}
            <div className="flex items-center gap-2">
              <Filter className="text-slate-400" size={18} />
              <select
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors outline-none cursor-pointer"
              >
                <option value="all">Todas as Ações</option>
                {uniqueActions.filter(a => a !== 'all').map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>

            {/* Ordenação */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="text-slate-400" size={18} />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors outline-none cursor-pointer"
              >
                <option value="data-desc">Data (Mais Recente)</option>
                <option value="data-asc">Data (Mais Antigo)</option>
                <option value="usuario-asc">Usuário (A-Z)</option>
                <option value="usuario-desc">Usuário (Z-A)</option>
                <option value="acao-asc">Ação (A-Z)</option>
                <option value="acao-desc">Ação (Z-A)</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400 cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'data-asc' ? 'data-desc' : 'data-asc')}>
                Data/Hora {sortBy.includes('data') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400 cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'usuario-asc' ? 'usuario-desc' : 'usuario-asc')}>
                Usuário {sortBy.includes('usuario') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400 cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'acao-asc' ? 'acao-desc' : 'acao-asc')}>
                Ação {sortBy.includes('acao') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-10 text-center text-slate-400 italic">
                  {search || filterAction !== 'all' ? 'Nenhum registro encontrado com os filtros aplicados.' : 'Nenhum registro encontrado.'}
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="p-5 font-mono text-xs text-slate-600">{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                  <td className="p-5 font-bold text-slate-700">{log.user}</td>
                  <td className="p-5">
                    <span className="font-black text-[10px] uppercase bg-slate-100 rounded px-2 py-1 text-slate-600">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-5 text-slate-600 text-sm">{log.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Contador de Resultados */}
      <div className="mt-4 text-center text-sm text-slate-500 font-medium">
        Exibindo {filteredLogs.length} de {logs.length} registros
      </div>
    </div>
  );
};

const UserManagementModule = ({ usersList }) => {
  const [newUserEmail, setNewUserEmail] = useState('');
  const handleUpdate = async (email, mod, has) => { const user = usersList.find(u => u.email === email); let mods = user ? (user.modules || []) : []; if (has) { if (!mods.includes(mod)) mods.push(mod); } else { mods = mods.filter(m => m !== mod); } await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'permissions', email), { modules: mods }, { merge: true }); };
  const addUser = async () => { if (!newUserEmail) return; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'permissions', newUserEmail.toLowerCase().trim()), { modules: ['entry'] }); setNewUserEmail(''); };

  // Definição das permissões granulares (Abas)
  const permissions = [
    { id: 'entry', label: 'Módulo: Lançamento' },
    { id: 'launched', label: 'Módulo: Itens Lançados' },
    { id: 'launched_open', label: 'Aba: Em Aberto' },
    { id: 'launched_paid', label: 'Aba: Liquidados' },
    { id: 'finance', label: 'Módulo: Contas a Pagar' },
    { id: 'finance_pending', label: 'Aba: A Pagar' },
    { id: 'finance_provision', label: 'Aba: Provisionado' },
    { id: 'finance_approved', label: 'Aba: Aprovado' },
    { id: 'finance_paid', label: 'Aba: Liquidados' },
    { id: 'logs', label: 'Módulo: Logs' }
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-3xl font-black mb-10 tracking-tight uppercase text-lg">Gerenciar Usuários</h2>
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 mb-8"><div className="flex gap-4"><input type="email" placeholder="nome@empresa.com" className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} /><button onClick={addUser} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs">Autorizar</button></div></div>
      <div className="grid gap-6">
        {usersList.map(user => (
          <div key={user.email} className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><UserCog size={18} className="text-blue-600" /> {user.email}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {permissions.map(perm => (
                <label key={perm.id} className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-50 p-2 rounded">
                  <input type="checkbox" className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" checked={user.modules?.includes(perm.id)} onChange={(e) => handleUpdate(user.email, perm.id, e.target.checked)} />
                  {perm.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const EntryModule = ({ userEmail, fdas, addFda, toggleFda, updateFdaNumber, saveItem, updateItem, deleteItem, allHistory, editTarget, clearEditTarget, onEdit, onPreview }) => {
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
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [previewImage, setPreviewImage] = useState(null);

  // Auto-fill Suggestions
  const clients = useMemo(() => [...new Set(allHistory.map(i => i.data.clienteFornecedor).filter(Boolean))], [allHistory]);
  const vessels = useMemo(() => [...new Set(allHistory.map(i => i.data.navio).filter(Boolean))], [allHistory]);

  useEffect(() => {
    if (editTarget) {
      setFormData(editTarget.data);
      setAnexosNF(editTarget.anexosNF || []);
      setAnexosBoleto(editTarget.anexosBoleto || []);
      setActiveFdaId(editTarget.fdaId);
      const fda = fdas.find(f => f.id === editTarget.fdaId);
      if (fda && !fda.isOpen) toggleFda(fda.id, false);
    }
  }, [editTarget]);

  const handleInputChange = (field, value) => {
    let newData = { ...formData, [field]: value };
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
      const totalRet = newData.guia5952 + newData.irrf + parseFloat(newData.inss || 0) + parseFloat(newData.iss || 0);
      newData.impostoRet = totalRet;
      newData.valorLiquido = v - totalRet;
      newData.total = v + (parseFloat(newData.multa) || 0) + (parseFloat(newData.juros) || 0);
    }
    setFormData(newData);
  };

  // Função para gerar preview de imagem
  const generateImagePreview = (file) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImage({ name: file.name, url: e.target.result });
      };
      reader.readAsDataURL(file);
    }
  };

  // Função para deletar arquivo com confirmação
  const handleDeleteFile = (file, source) => {
    if (window.confirm(`Deseja deletar o arquivo "${file.name}"?`)) {
      if (source === 'nf') {
        setAnexosNF(anexosNF.filter(f => f !== file));
      } else {
        setAnexosBoleto(anexosBoleto.filter(f => f !== file));
      }
      logAction(userEmail, 'DELETAR ARQUIVO LOCAL', `Arquivo removido: ${file.name}`);
    }
  };

  // Função para download de arquivo
  const handleDownloadFile = async (file) => {
    try {
      let base64Url = file.url;

      // Se for chunked
      if (file.fileId) {
        // TODO: Adicionar feedback de loading pro usuário aqui seria bom
        const rebuiltBase64 = await getFileFromChunks(file.fileId);
        if (rebuiltBase64) {
          base64Url = rebuiltBase64;
        } else {
          alert("Não foi possível recuperar o conteúdo do arquivo.");
          return;
        }
      }

      if (base64Url) {
        // Arquivo já salvo (Base64 ou URL antiga)
        if (base64Url.startsWith('data:')) {
          // Base64
          const a = document.createElement('a');
          a.href = base64Url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          // URL antiga
          const response = await fetch(base64Url);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } else if (file.file) {
        // Arquivo local (antes de salvar)
        const url = URL.createObjectURL(file.file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      logAction(userEmail, 'DOWNLOAD ARQUIVO', `Arquivo baixado: ${file.name}`);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      alert('Erro ao baixar arquivo');
    }
  };

  const handleSave = async (fdaId) => {
    // Validação básica
    if (!formData.servicos || !formData.vencimento) {
      alert('Por favor, preencha os campos obrigatórios: Serviço e Vencimento');
      return;
    }

    // Previne múltiplos cliques
    if (isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      if (editTarget) {
        // Atualiza o item existente (não cria duplicado)
        // CORREÇÃO: updateItem espera (id, data, filesNF, filesBoleto)
        // Agora passamos os arrays mesmo se vazios, para permitir exclusão
        await updateItem(editTarget.id, formData, anexosNF, anexosBoleto);
        clearEditTarget();
      } else {
        // Cria novo item
        await saveItem(fdaId, formData, anexosNF, anexosBoleto);
      }

      // Limpa o formulário após sucesso
      setFormData({
        status: 'PENDENTE', navio: '', vencimento: '', servicos: '', documento: '', dataEmissao: '', valorBruto: 0, centroCusto: '', nfs: '', valorBase: 0, valorLiquido: 0, pis: 0, cofins: 0, csll: 0, guia5952: 0, irrf: 0, guia1708: 0, inss: 0, iss: 0, impostoRet: 0, multa: 0, juros: 0, total: 0, clienteFornecedor: '', cnpjCpf: '', banco: '', codigoBanco: '', agencia: '', contaCorrente: '', chavePix: '', dataPagamento: '', valorPago: 0, jurosPagos: 0
      });
      setAnexosNF([]);
      setAnexosBoleto([]);
      setActiveFdaId(null);

      // Feedback de sucesso
      alert(editTarget ? '✓ Item atualizado com sucesso!' : '✓ Item gravado com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('❌ Erro ao salvar o item. Verifique os anexos e tente novamente.\n\nDetalhes: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <datalist id="clients-list">{clients.map(c => <option key={c} value={c} />)}</datalist>
      <datalist id="vessels-list">{vessels.map(v => <option key={v} value={v} />)}</datalist>

      <div className="flex justify-between items-center mb-10"><h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg">Lançamento de Itens</h2><button onClick={addFda} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center gap-2 hover:bg-slate-800 shadow-xl transition-all"><Plus size={18} /> Novo Atendimento</button></div>
      <div className="space-y-8">{fdas.map(f => (
        <div key={f.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 p-6 flex justify-between items-center cursor-pointer" onClick={() => toggleFda(f.id, f.isOpen)}>
            <div className="flex items-center gap-5">
              <div className={`p-2 rounded-lg ${f.isOpen ? 'bg-blue-100 text-blue-600' : 'bg-slate-200'}`}>{f.isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
              <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Ref. Lote</label><input type="text" value={f.number} onClick={e => e.stopPropagation()} onChange={e => updateFdaNumber(f.id, e.target.value)} className="bg-transparent font-mono text-xl font-black text-blue-600 focus:outline-none w-full uppercase" /></div>
            </div>
            <button onClick={e => { e.stopPropagation(); setActiveFdaId(activeFdaId === f.id ? null : f.id); }} className="bg-white border-2 border-blue-600 text-blue-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest">{activeFdaId === f.id ? 'Fechar' : 'Novo Lançamento'}</button>
          </div>

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
                    <FileUploadButton label="Nota" icon={<Receipt size={14} />} onUpload={fileData => {
                      setAnexosNF([...anexosNF, fileData]);
                      generateImagePreview(fileData.file);
                    }} color="blue" isUploading={isUploading} />
                    <FileUploadButton label="Boleto" icon={<Banknote size={14} />} onUpload={fileData => {
                      setAnexosBoleto([...anexosBoleto, fileData]);
                      generateImagePreview(fileData.file);
                    }} color="slate" isUploading={isUploading} />
                  </div>

                  {/* Preview de Imagem */}
                  {previewImage && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Visualização</span>
                        <button onClick={() => setPreviewImage(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                      </div>
                      <img src={previewImage.url} alt={previewImage.name} className="max-h-48 rounded-lg object-contain mx-auto" />
                      <p className="text-[10px] text-slate-600 font-bold mt-2 truncate">{previewImage.name}</p>
                    </div>
                  )}

                  {/* Lista de Arquivos com Melhorias */}
                  <div className="space-y-2 mt-4">
                    {[...anexosNF, ...anexosBoleto].map((file, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 hover:border-blue-300 transition-all group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {file.file?.type.startsWith('image/') ? (
                              <img src={URL.createObjectURL(file.file)} alt={file.name} className="w-8 h-8 rounded object-cover" />
                            ) : (
                              <FileText size={16} className="text-slate-400 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-bold text-xs text-slate-800">{file.name}</p>
                              <p className="text-[9px] text-slate-400">Tamanho: {file.size || 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2 flex-shrink-0">
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Download"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteFile(file, anexosNF.includes(file) ? 'nf' : 'boleto')}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Deletar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Banner de Status de Salvamento */}
                  {isSaving && (
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mt-4 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <div>
                          <p className="font-black text-blue-800 text-sm uppercase tracking-wide">
                            {anexosNF.filter(f => f.file).length + anexosBoleto.filter(f => f.file).length > 0
                              ? '📤 Enviando arquivos para o servidor...'
                              : '💾 Salvando dados...'}
                          </p>
                          <p className="text-xs text-blue-600 mt-1">Por favor, aguarde. Não feche esta janela.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => handleSave(f.id)}
                    disabled={isSaving || isUploading}
                    className="w-full py-4 bg-green-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-green-700 shadow-lg mt-6 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                        {anexosNF.length > 0 || anexosBoleto.length > 0 ? 'Enviando Arquivos...' : 'Salvando...'}
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        {editTarget ? 'Atualizar Item' : 'Gravar Lançamento'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {f.isOpen && (
            <div className="p-6 space-y-4">
              {f.items.map((it, idx) => (
                <div key={it.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-blue-300 shadow-sm transition-all">
                  <div className="p-5 flex justify-between items-center">
                    <div className="flex gap-5 items-center">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-black text-slate-400 text-[10px]">{idx + 1}</div>
                      <div>
                        <p className="font-black text-slate-700 uppercase text-sm">{it.data.servicos}</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase">DOC: {it.data.documento} • R$ {it.data.total}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <StatusBadge status={it.data.status} />
                      <button onClick={() => {
                        if (it.anexosNF && it.anexosNF.length > 0) onPreview(it.anexosNF, "Nota Fiscal");
                        else alert("Sem Nota Fiscal anexada");
                      }} className="p-1 px-2 text-[10px] uppercase font-bold text-blue-600 hover:bg-blue-50 rounded bg-transparent border border-blue-100 mr-1">Nota</button>
                      <button onClick={() => {
                        if (it.anexosBoleto && it.anexosBoleto.length > 0) onPreview(it.anexosBoleto, "Boleto");
                        else alert("Sem Boleto anexado");
                      }} className="p-1 px-2 text-[10px] uppercase font-bold text-slate-500 hover:bg-slate-50 rounded bg-transparent border border-slate-200 mr-2">Boleto</button>
                      <button onClick={(e) => { e.stopPropagation(); onEdit(it); }} className="p-2 text-slate-300 hover:text-blue-600"><Edit size={16} /></button>
                      <button onClick={() => deleteItem(it.id)} className="p-2 text-slate-300 hover:text-red-600"><Trash2 size={16} /></button>
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

const LaunchedModule = ({ allItems, onDelete, onEdit, onPreview, userPermissions }) => {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('abertos');
  const [sortBy, setSortBy] = useState('vencimento-asc');
  const [filterStatus, setFilterStatus] = useState('all');
  const [eO, setEO] = useState(false);
  const exportRef = useRef(null);

  // Verificação de Permissão para Abas
  const canViewOpen = userPermissions.includes('all_tabs') || userPermissions.includes('launched_open');
  const canViewPaid = userPermissions.includes('all_tabs') || userPermissions.includes('launched_paid');

  // Ajusta a aba padrão se o usuário não tiver acesso à 'abertos'
  useEffect(() => {
    if (!canViewOpen && canViewPaid) setTab('liquidados');
  }, [canViewOpen, canViewPaid]);

  useEffect(() => { const h = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setEO(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  // Função de ordenação
  const applySorting = (items) => {
    const sorted = [...items];
    switch (sortBy) {
      case 'vencimento-asc':
        return sorted.sort((a, b) => new Date(a.data.vencimento) - new Date(b.data.vencimento));
      case 'vencimento-desc':
        return sorted.sort((a, b) => new Date(b.data.vencimento) - new Date(a.data.vencimento));
      case 'valor-asc':
        return sorted.sort((a, b) => parseFloat(a.data.total) - parseFloat(b.data.total));
      case 'valor-desc':
        return sorted.sort((a, b) => parseFloat(b.data.total) - parseFloat(a.data.total));
      case 'servico-asc':
        return sorted.sort((a, b) => (a.data.servicos || '').localeCompare(b.data.servicos || ''));
      case 'servico-desc':
        return sorted.sort((a, b) => (b.data.servicos || '').localeCompare(a.data.servicos || ''));
      default:
        return sorted;
    }
  };

  const filtered = useMemo(() => {
    let items = allItems.filter(i => {
      const matchText = (
        (i.data.servicos || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.fdaNumber || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.data.clienteFornecedor || '').toLowerCase().includes(search.toLowerCase())
      );
      const matchTab = tab === 'abertos' ? i.data.status !== 'PAGO' : i.data.status === 'PAGO';
      const matchStatus = filterStatus === 'all' ? true : i.data.status === filterStatus;
      return matchText && matchTab && matchStatus;
    });
    return applySorting(items);
  }, [allItems, search, tab, sortBy, filterStatus]);

  if (!canViewOpen && !canViewPaid) return <div className="text-center py-20 text-slate-400">Acesso restrito a este módulo.</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg mb-6">Itens Lançados</h2>

        {/* Barra de Filtros */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortChange={setSortBy}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          showStatusFilter={tab === 'abertos'}
        />
      </header>

      <div className="flex gap-4 mb-6">
        {canViewOpen && <button onClick={() => setTab('abertos')} className={`px-6 py-2 rounded-full font-black uppercase text-[10px] tracking-widest transition-all ${tab === 'abertos' ? 'bg-slate-800 text-white' : 'bg-white text-slate-400 border'}`}>Em Aberto</button>}
        {canViewPaid && <button onClick={() => setTab('liquidados')} className={`px-6 py-2 rounded-full font-black uppercase text-[10px] tracking-widest transition-all ${tab === 'liquidados' ? 'bg-green-600 text-white' : 'bg-white text-slate-400 border'}`}>Liquidados</button>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'vencimento-asc' ? 'vencimento-desc' : 'vencimento-asc')}>
                Vencimento {sortBy.includes('vencimento') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'servico-asc' ? 'servico-desc' : 'servico-asc')}>
                Serviço / FDA {sortBy.includes('servico') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'valor-asc' ? 'valor-desc' : 'valor-asc')}>
                Valor {sortBy.includes('valor') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-10 text-center text-slate-400 italic">Nenhum item encontrado com os filtros aplicados.</td>
              </tr>
            ) : (
              filtered.map(i => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="p-5 font-bold text-slate-800">{new Date(i.data.vencimento).toLocaleDateString('pt-BR')}</td>
                  <td className="p-5">
                    <div className="font-black text-slate-800 uppercase text-xs">{i.data.servicos}</div>
                    <div className="text-[10px] text-blue-600 font-black mt-1">{i.fdaNumber}</div>
                    <div className="text-[10px] text-slate-400 font-medium mt-1">{i.data.clienteFornecedor}</div>
                  </td>
                  <td className="p-5 text-right font-black text-slate-900">R$ {parseFloat(i.data.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-5 text-center"><StatusBadge status={i.data.status} /></td>
                  <td className="p-5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="flex gap-1 mr-2">
                        <button onClick={() => onPreview(i.anexosNF, "Nota Fiscal")} className={`p-1 px-2 text-[9px] uppercase font-bold rounded border ${i.anexosNF?.length > 0 ? 'text-blue-600 border-blue-200 hover:bg-blue-50' : 'text-slate-300 border-slate-100'}`} disabled={!i.anexosNF?.length}>Nota</button>
                        <button onClick={() => onPreview(i.anexosBoleto, "Boleto")} className={`p-1 px-2 text-[9px] uppercase font-bold rounded border ${i.anexosBoleto?.length > 0 ? 'text-slate-600 border-slate-200 hover:bg-slate-50' : 'text-slate-300 border-slate-100'}`} disabled={!i.anexosBoleto?.length}>Boleto</button>
                      </div>
                      <button onClick={() => onEdit(i)} className="p-2 text-slate-400 hover:text-blue-600" title="Editar"><Edit size={18} /></button>
                      <button onClick={() => onDelete(i.id)} className="p-2 text-slate-400 hover:text-red-600" title="Excluir"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Contador de Resultados */}
      <div className="mt-4 text-center text-sm text-slate-500 font-medium">
        Exibindo {filtered.length} de {allItems.filter(i => tab === 'abertos' ? i.data.status !== 'PAGO' : i.data.status === 'PAGO').length} itens
      </div>
    </div>
  );
};

const FinanceModule = ({ allItems, isMaster, updateItem, onDelete, onPreview, userPermissions }) => {
  const [aT, setAT] = useState('PENDENTE');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('vencimento-asc');

  // Definição das Abas com Permissões
  const steps = useMemo(() => {
    const allSteps = {
      'PENDENTE': { label: 'A Pagar', next: 'PROVISIONADO', btn: 'Provisionar', color: 'bg-yellow-500', perm: 'finance_pending' },
      'PROVISIONADO': { label: 'Provisionado', next: 'APROVADO', prev: 'PENDENTE', btn: 'Aprovar', color: 'bg-blue-600', perm: 'finance_provision' },
      'APROVADO': { label: 'Aprovado', next: 'PAGO', prev: 'PROVISIONADO', btn: 'Liquidar', color: 'bg-green-600', perm: 'finance_approved' },
      'PAGO': { label: 'Liquidados', prev: 'APROVADO', perm: 'finance_paid' }
    };
    // Filtra abas baseadas nas permissões do usuário
    if (userPermissions.includes('all_tabs')) return allSteps;
    return Object.fromEntries(Object.entries(allSteps).filter(([_, val]) => userPermissions.includes(val.perm)));
  }, [userPermissions]);

  // Ajusta a aba inicial se o usuário não tiver acesso à 'PENDENTE'
  useEffect(() => {
    const availableKeys = Object.keys(steps);
    if (availableKeys.length > 0 && !availableKeys.includes(aT)) {
      setAT(availableKeys[0]);
    }
  }, [steps]);

  // Função de ordenação
  const applySorting = (items) => {
    const sorted = [...items];
    switch (sortBy) {
      case 'vencimento-asc':
        return sorted.sort((a, b) => new Date(a.data.vencimento) - new Date(b.data.vencimento));
      case 'vencimento-desc':
        return sorted.sort((a, b) => new Date(b.data.vencimento) - new Date(a.data.vencimento));
      case 'valor-asc':
        return sorted.sort((a, b) => parseFloat(a.data.total) - parseFloat(b.data.total));
      case 'valor-desc':
        return sorted.sort((a, b) => parseFloat(b.data.total) - parseFloat(a.data.total));
      case 'servico-asc':
        return sorted.sort((a, b) => (a.data.servicos || '').localeCompare(b.data.servicos || ''));
      case 'servico-desc':
        return sorted.sort((a, b) => (b.data.servicos || '').localeCompare(a.data.servicos || ''));
      default:
        return sorted;
    }
  };

  const groupedItems = useMemo(() => {
    if (!Object.keys(steps).includes(aT)) return [];

    let filtered = allItems.filter(i => i.data.status === aT && (
      i.data.servicos.toLowerCase().includes(search.toLowerCase()) ||
      i.data.clienteFornecedor.toLowerCase().includes(search.toLowerCase()) ||
      (i.data.navio || '').toLowerCase().includes(search.toLowerCase())
    ));

    // Aplica ordenação
    filtered = applySorting(filtered);

    const groups = {};
    filtered.forEach(item => {
      const dateKey = item.data.vencimento || 'Sem Data';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });

    return Object.keys(groups).sort().map(date => ({
      date,
      items: groups[date],
      total: groups[date].reduce((sum, item) => sum + parseFloat(item.data.total || 0), 0)
    }));
  }, [allItems, aT, search, steps, sortBy]);

  const handleStatus = async (id, cur, s) => {
    const n = new Date().toISOString().split('T')[0];
    let ups = { status: s };
    if (s === 'PROVISIONADO') ups.dataProvisionamento = n;
    if (s === 'APROVADO') ups.dataAprovacao = n;
    if (s === 'PAGO') ups.dataPagamentoReal = n;
    await updateItem(id, { ...cur, ...ups });
  };

  const openFile = (files, title) => {
    if (files && files.length > 0) {
      onPreview(files, title);
    } else {
      alert("Nenhum arquivo anexado.");
    }
  };

  // Calcular total geral da aba
  const totalGeral = useMemo(() => {
    return groupedItems.reduce((sum, group) => sum + group.total, 0);
  }, [groupedItems]);

  const totalItens = useMemo(() => {
    return groupedItems.reduce((sum, group) => sum + group.items.length, 0);
  }, [groupedItems]);

  if (Object.keys(steps).length === 0) return <div className="text-center py-20 text-slate-400">Acesso restrito a este módulo.</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase text-lg mb-6">Contas a Pagar</h2>

        {/* Barra de Filtros */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortChange={setSortBy}
          showStatusFilter={false}
        />
      </header>

      <div className="flex gap-2 border-b mb-8 overflow-x-auto">
        {Object.keys(steps).map(key => (
          <button key={key} onClick={() => setAT(key)} className={`px-10 py-3 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${aT === key ? `border-blue-600 text-blue-600 bg-blue-50/50` : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {steps[key].label}
          </button>
        ))}
      </div>

      {/* Resumo da Aba */}
      {totalItens > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-slate-50 rounded-xl p-6 mb-6 border border-blue-100">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total na Aba</p>
              <p className="text-2xl font-black text-slate-800">R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantidade</p>
              <p className="text-2xl font-black text-slate-800">{totalItens} {totalItens === 1 ? 'item' : 'itens'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {groupedItems.length === 0 ? (
          <div className="text-center py-20 text-slate-300 italic font-medium">
            {search ? 'Nenhum item encontrado com os filtros aplicados.' : 'Nenhum item nesta etapa.'}
          </div>
        ) : (
          groupedItems.map(group => (
            <div key={group.date} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-slate-400" />
                  <span className="font-black text-slate-700 text-xs uppercase tracking-widest">
                    Vencimento: {new Date(group.date).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-500">{group.items.length} {group.items.length === 1 ? 'item' : 'itens'}</span>
                  <span className="text-sm font-black text-slate-700">R$ {group.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-slate-50">
                  {group.items.map(it => (
                    <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-5 w-1/3">
                        <div className="font-black text-slate-800 uppercase text-xs">{it.data.servicos}</div>
                        <div className="text-[10px] text-slate-400 font-bold mt-1">{it.data.clienteFornecedor}</div>
                        {it.data.navio && <div className="text-[10px] text-blue-600 font-bold mt-1">🚢 {it.data.navio}</div>}
                      </td>
                      <td className="p-5 text-right font-black text-slate-900 w-1/6">
                        R$ {parseFloat(it.data.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-5 text-center w-1/4">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => openFile(it.anexosNF, "Nota Fiscal")} className="flex items-center gap-1 text-[9px] font-bold uppercase bg-blue-50 text-blue-600 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors"><ExternalLink size={10} /> Nota</button>
                          <button onClick={() => openFile(it.anexosBoleto, "Boleto")} className="flex items-center gap-1 text-[9px] font-bold uppercase bg-slate-50 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors"><ExternalLink size={10} /> Boleto</button>
                        </div>
                      </td>
                      <td className="p-5 text-center w-1/4">
                        <div className="flex items-center justify-end gap-2">
                          {steps[aT].prev && (
                            <button onClick={() => handleStatus(it.id, it.data, steps[aT].prev)} className="p-2 text-slate-400 hover:text-orange-500 transition-colors" title="Retornar Status"><Undo2 size={18} /></button>
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
          ))
        )}
      </div>
    </div>
  );
};

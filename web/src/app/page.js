'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Music, Settings, Library, Play, Pause, Square, SkipForward, Volume2, VolumeX, Download } from 'lucide-react';
import StemPlayer from '@/components/StemPlayer';

// URLs parametrizadas via variáveis de ambiente com fallback local
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050/api';
const AUDIO_BASE_URL = process.env.NEXT_PUBLIC_AUDIO_ENGINE_URL || 'http://localhost:8000';

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, uploading, processing, done
  const [fileId, setFileId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [stemsData, setStemsData] = useState(null); // { folder, stems }
  const [isMounted, setIsMounted] = useState(false);
  const [view, setView] = useState('library'); // library, upload, player
  const [library, setLibrary] = useState([]);

  // Auth States
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // login, register
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');

  // Multi-track player states
  const wavesurfersRef = useRef({});
  const isMasterPlayingRef = useRef(false);
  const isSyncingRef = useRef(false);
  const [isMasterPlaying, setIsMasterPlaying] = useState(false);
  const [trackVolumes, setTrackVolumes] = useState({});
  const [trackMutes, setTrackMutes] = useState({});
  const [trackSolos, setTrackSolos] = useState({});
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Mantém isMasterPlayingRef sempre sincronizado
  useEffect(() => {
    isMasterPlayingRef.current = isMasterPlaying;
  }, [isMasterPlaying]);

  // Fetch library projects
  const fetchLibrary = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/projects`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        const mapped = data.projects.map(proj => ({
          id: proj.folder || proj.fileId,
          _id: proj._id,
          name: proj.name,
          stems: proj.stems || [],
          status: proj.status,
          bpm: proj.bpm,
          key: proj.key
        }));
        setLibrary(mapped);
      }
    } catch (err) {
      console.error('Erro ao carregar biblioteca:', err);
    }
  }, [token]);

  // Load auth state from LocalStorage on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    const savedToken = localStorage.getItem('e2n_token');
    const savedUser = localStorage.getItem('e2n_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Fetch library projects only when authenticated
  useEffect(() => {
    if (token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchLibrary();
    }
  }, [token, fetchLibrary]);

  // Reset player states when stemsData changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMasterPlaying(false);
    setTrackVolumes({});
    setTrackMutes({});
    setTrackSolos({});
    setCurrentTime(0);
    setDuration(0);
    wavesurfersRef.current = {};
  }, [stemsData]);

  // Polling automático da biblioteca se houver músicas em processamento
  useEffect(() => {
    const hasProcessing = library.some(item => item.status === 'processing' || item.status === 'queued');
    if (!hasProcessing || !token) return;

    const interval = setInterval(() => {
      fetchLibrary();
    }, 4000);

    return () => clearInterval(interval);
  }, [library, token, fetchLibrary]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'login' ? 'login' : 'register';
    try {
      const res = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: authForm.name,
          email: authForm.email,
          password: authForm.password
        })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('e2n_token', data.token);
        localStorage.setItem('e2n_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      } else {
        setAuthError(data.error || 'Erro na autenticação.');
      }
    } catch (err) {
      console.error(err);
      setAuthError('Erro ao conectar com o servidor.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('e2n_token');
    localStorage.removeItem('e2n_user');
    setToken(null);
    setUser(null);
    setLibrary([]);
    setStemsData(null);
    setAnalysis(null);
    setView('library');
  };

  const handleUpload = async () => {
    if (!file) {
      alert('Por favor, selecione ou arraste um arquivo primeiro.');
      return;
    }

    setStatus('uploading');
    console.log('Iniciando upload...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name.split('.').slice(0, -1).join('.'));

    try {
      const uploadRes = await fetch(`${API_BASE_URL}/projects/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      const data = await uploadRes.json();
      console.log('Resposta do upload:', data);

      if (!uploadRes.ok) {
        setStatus('error');
        alert(data.error || 'Erro ao processar áudio.');
        return;
      }

      if (data.success) {
        const proj = data.project;
        setFileId(proj.fileId);
        setAnalysis({
          bpm: proj.bpm,
          key: proj.key
        });

        // Se já concluiu imediatamente
        if (proj.status === 'completed') {
          setStemsData({
            folder: proj.folder,
            stems: proj.stems
          });
          setStatus('done');
          setView('player');
          fetchLibrary();
          return;
        }

        // Se entrou em processamento assíncrono (Demucs)
        setStatus('processing');
        fetchLibrary();

        // Polling para acompanhar a finalização da faixa
        const pollInterval = setInterval(async () => {
          try {
            const checkRes = await fetch(`${API_BASE_URL}/projects/${proj._id}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const checkData = await checkRes.json();
            if (checkData.success && checkData.project) {
              const currentProj = checkData.project;
              if (currentProj.status === 'completed') {
                clearInterval(pollInterval);
                setStemsData({
                  folder: currentProj.folder,
                  stems: currentProj.stems
                });
                setStatus('done');
                setView('player');
                fetchLibrary();
              } else if (currentProj.status === 'failed') {
                clearInterval(pollInterval);
                setStatus('error');
                alert('Ocorreu uma falha na separação dos instrumentos.');
                setView('library');
                fetchLibrary();
              }
            }
          } catch (pollErr) {
            console.error('Erro no polling do projeto:', pollErr);
          }
        }, 3000);
      } else {
        setStatus('error');
        alert('Erro ao processar áudio. Verifique os logs.');
      }
    } catch (error) {
      console.error('Error:', error);
      setStatus('error');
      alert(`Erro ao conectar à API (${API_BASE_URL}). Verifique se os serviços estão ativos.`);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setFile(files[0]);
    }
  };

  // Synchronized Multi-track Logic
  const handleRegisterWs = (name, ws) => {
    wavesurfersRef.current[name] = ws;

    // Initialize track volumes & controls locally if not set
    setTrackVolumes(prev => ({ ...prev, [name]: prev[name] ?? 0.8 }));
    setTrackMutes(prev => ({ ...prev, [name]: prev[name] ?? false }));
    setTrackSolos(prev => ({ ...prev, [name]: prev[name] ?? false }));

    ws.on('ready', () => {
      let maxDuration = 0;
      Object.values(wavesurfersRef.current).forEach(w => {
        maxDuration = Math.max(maxDuration, w.getDuration());
      });
      setDuration(maxDuration);
    });

    ws.on('timeupdate', (time) => {
      const firstStem = Object.keys(wavesurfersRef.current)[0];
      if (name === firstStem) {
        setCurrentTime(time);
      }
    });

    ws.on('finish', () => {
      const firstStem = Object.keys(wavesurfersRef.current)[0];
      if (name === firstStem) {
        setIsMasterPlaying(false);
        isMasterPlayingRef.current = false;
      }
    });

    ws.on('play', () => {
      setIsMasterPlaying(true);
      isMasterPlayingRef.current = true;
    });

    ws.on('pause', () => {
      const anyPlaying = Object.values(wavesurfersRef.current).some(w => {
        try { return w && typeof w.isPlaying === 'function' && w.isPlaying(); } catch (e) { return false; }
      });
      if (!anyPlaying) {
        setIsMasterPlaying(false);
        isMasterPlayingRef.current = false;
      }
    });

    ws.on('interaction', () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      const time = ws.getCurrentTime();
      setCurrentTime(time);
      const isCurrentlyPlaying = isMasterPlayingRef.current || (typeof ws.isPlaying === 'function' && ws.isPlaying());

      // Sincroniza todas as faixas sem loop
      Object.entries(wavesurfersRef.current).forEach(([k, w]) => {
        try {
          if (k !== name) {
            w.setTime(time);
          }
          if (isCurrentlyPlaying) {
            w.play().catch(() => {});
          } else {
            w.pause();
          }
        } catch (e) {}
      });

      setTimeout(() => {
        isSyncingRef.current = false;
      }, 50);
    });

    if (isMasterPlayingRef.current) {
      ws.play().catch(() => {});
    }
  };

  const handleDestroyWs = (name) => {
    delete wavesurfersRef.current[name];
  };

  const toggleMasterPlay = () => {
    const instances = Object.values(wavesurfersRef.current);
    if (!instances.length) return;

    // Pergunta diretamente ao nó de áudio se há som tocando agora
    const anyPlaying = instances.some(ws => {
      try {
        return ws && typeof ws.isPlaying === 'function' && ws.isPlaying();
      } catch (e) {
        return false;
      }
    });

    if (anyPlaying) {
      // Se estava tocando, PAUSA TODAS
      instances.forEach(ws => {
        try { ws.pause(); } catch (e) {}
      });
      setIsMasterPlaying(false);
      isMasterPlayingRef.current = false;
    } else {
      // Se estava pausado, TOCA TODAS
      instances.forEach(ws => {
        try { ws.play().catch(() => {}); } catch (e) {}
      });
      setIsMasterPlaying(true);
      isMasterPlayingRef.current = true;
    }
  };

  const stopMasterPlay = () => {
    Object.values(wavesurfersRef.current).forEach(ws => {
      try {
        ws.pause();
        ws.setTime(0);
      } catch (e) {}
    });
    setIsMasterPlaying(false);
    isMasterPlayingRef.current = false;
    setCurrentTime(0);
  };

  const handleMasterSeek = (time) => {
    setCurrentTime(time);
    const isCurrentlyPlaying = isMasterPlayingRef.current;
    Object.values(wavesurfersRef.current).forEach(ws => {
      try {
        ws.setTime(time);
        if (isCurrentlyPlaying) {
          ws.play().catch(() => {});
        } else {
          ws.pause();
        }
      } catch (e) {}
    });
  };

  // Alterna Solo (S) e desfaz Mute automaticamente
  const handleToggleSolo = (stem) => {
    setTrackSolos(prev => {
      const willBeSoloed = !prev[stem];
      if (willBeSoloed) {
        setTrackMutes(mutes => ({ ...mutes, [stem]: false }));
      }
      return { ...prev, [stem]: willBeSoloed };
    });
  };

  // Alterna Mute (M) e cancela Solo se estiver ativo
  const handleToggleMute = (stem) => {
    setTrackMutes(prev => {
      const willBeMuted = !prev[stem];
      if (willBeMuted) {
        setTrackSolos(solos => ({ ...solos, [stem]: false }));
      }
      return { ...prev, [stem]: willBeMuted };
    });
  };

  const handleMasterVolumeChange = (vol) => {
    setMasterVolume(vol);
  };

  const handleDownloadAll = () => {
    if (!stemsData || !stemsData.stems) return;
    stemsData.stems.forEach(stem => {
      const url = `${AUDIO_BASE_URL}/output/${encodeURIComponent(stemsData.folder)}/${encodeURIComponent(stem)}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = stem;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === null) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // If not authenticated, show premium auth card
  if (!token && isMounted) {
    return (
      <main className="container auth-layout">
        <header className="header glass">
          <div className="logo">
            <Music className="icon-primary" />
            <span>E2N <strong>Studio</strong></span>
          </div>
        </header>

        <div className="auth-grid">
          <div className="auth-hero">
            <h1>E2N Studio: Inteligência Sonora</h1>
            <p className="hero-subtitle">Separação profissional de faixas com IA, gestão de estúdio e ferramentas de mixagem integradas.</p>
            <div className="features-list">
              <div className="feature-item">
                <div className="feat-dot">✓</div>
                <span>Divisão em 4 Stems (Vocais, Bateria, Baixo e Outros)</span>
              </div>
              <div className="feature-item">
                <div className="feat-dot">✓</div>
                <span>Detecção Instantânea de Tom (Key) e BPM</span>
              </div>
              <div className="feature-item">
                <div className="feat-dot">✓</div>
                <span>Player Sincronizado com Controles de Solo & Mute</span>
              </div>
            </div>
          </div>

          <div className="auth-card-container">
            <div className="auth-card glass">
              <h2>{authMode === 'login' ? 'Bem-vindo de Volta' : 'Criar sua Conta'}</h2>
              <p className="auth-desc">{authMode === 'login' ? 'Acesse seu estúdio de mixagem pessoal' : 'Cadastre-se para começar a separar suas faixas'}</p>

              {authError && <div className="auth-error-alert">{authError}</div>}

              <form onSubmit={handleAuthSubmit} className="auth-form">
                {authMode === 'register' && (
                  <div className="input-group">
                    <label>Nome Completo</label>
                    <input 
                      type="text" 
                      placeholder="Seu nome"
                      required
                      value={authForm.name}
                      onChange={(e) => setAuthForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                )}
                <div className="input-group">
                  <label>E-mail</label>
                  <input 
                    type="email" 
                    placeholder="email@exemplo.com"
                    required
                    value={authForm.email}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="input-group">
                  <label>Senha</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    required
                    value={authForm.password}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                  />
                </div>
                
                <button type="submit" className="btn-primary auth-submit-btn">
                  {authMode === 'login' ? 'Entrar no Studio' : 'Cadastrar e Iniciar'}
                </button>
              </form>

              <div className="auth-toggle">
                {authMode === 'login' ? (
                  <p>Não tem uma conta? <span onClick={() => setAuthMode('register')}>Cadastre-se</span></p>
                ) : (
                  <p>Já possui uma conta? <span onClick={() => setAuthMode('login')}>Fazer Login</span></p>
                )}
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            gap: 40px;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 30px;
            margin-top: 20px;
          }

          .logo {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 1.2rem;
          }

          .icon-primary {
            color: var(--primary);
          }

          .auth-layout {
            justify-content: center;
            min-height: 100vh;
          }

          .auth-grid {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            gap: 60px;
            align-items: center;
            margin-top: 40px;
          }

          .auth-hero {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .hero-subtitle {
            font-size: 1.2rem;
            line-height: 1.7;
          }

          .features-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-top: 20px;
          }

          .feature-item {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .feat-dot {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: var(--primary-glow);
            color: var(--primary);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 0.85rem;
          }

          .auth-card {
            padding: 40px;
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .auth-desc {
            font-size: 0.9rem;
            color: #94a3b8;
          }

          .auth-error-alert {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid #ef4444;
            color: #f87171;
            padding: 12px;
            border-radius: 8px;
            font-size: 0.9rem;
          }

          .auth-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .input-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .input-group label {
            font-size: 0.85rem;
            font-weight: 500;
            color: #cbd5e1;
          }

          .input-group input {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--glass-border);
            border-radius: 10px;
            padding: 12px;
            color: white;
            outline: none;
            transition: all 0.3s;
          }

          .input-group input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 10px var(--primary-glow);
          }

          .auth-submit-btn {
            margin-top: 10px;
            padding: 14px;
          }

          .auth-toggle {
            text-align: center;
            font-size: 0.9rem;
          }

          .auth-toggle span {
            color: var(--primary);
            cursor: pointer;
            font-weight: 600;
            transition: opacity 0.2s;
          }

          .auth-toggle span:hover {
            opacity: 0.8;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="container">
      {/* Header */}
      <header className="header glass">
        <div className="logo">
          <Music className="icon-primary" />
          <span>E2N <strong>Studio</strong></span>
        </div>
        <nav className="nav">
          <button 
            className={`nav-item ${view === 'library' ? 'active' : ''}`}
            onClick={() => setView('library')}
          >
            <Library size={20} /> Library
          </button>
          <button 
            className={`nav-item ${view === 'upload' ? 'active' : ''}`}
            onClick={() => setView('upload')}
          >
            <Upload size={20} /> Upload
          </button>
          <div className="user-profile" style={{ cursor: 'pointer' }} onClick={handleLogout} title="Click to Logout">
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name || 'Felix'}`} alt="User" />
            <span>{user?.name || 'User'} (Sair)</span>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <div className="content">
        <section className="hero animate-fade-in">
          <h1>E2N Studio: Inteligência Sonora</h1>
          <p>Potencialize sua produção musical com separação de faixas em nível de estúdio.</p>
        </section>

        <div className="dashboard-grid">
          {/* Main Panel */}
          <div className="main-panel">
            {status === 'uploading' || status === 'processing' ? (
              <div className="loading-container glass animate-fade-in">
                <div className="loading-spinner-container">
                  <div className="loading-spinner"></div>
                  <Music className="loading-icon-center icon-primary" size={28} />
                </div>
                <h3>{status === 'uploading' ? 'Enviando Áudio...' : 'Separando Instrumentos...'}</h3>
                <p>
                  {status === 'uploading' 
                    ? 'Fazendo upload do arquivo de áudio para o servidor seguro.' 
                    : 'A inteligência artificial (Demucs) está isolando os vocais e instrumentos. Isso costuma levar cerca de 1 minuto.'}
                </p>
                <div className="loading-bar-bg">
                  <div className={`loading-bar-fill ${status}`} />
                </div>
              </div>
            ) : (
              <>
                {view === 'library' && (
              <div className="library-container animate-fade-in">
                <div className="stems-header">
                  <h2>Your Studio Library</h2>
                  <button className="btn-primary" onClick={() => setView('upload')}>
                    + New Project
                  </button>
                </div>
                <div className="library-grid">
                  {library.length > 0 ? library.map(item => {
                    const isProcessing = item.status === 'processing';
                    const isFailed = item.status === 'failed';
                    return (
                      <div 
                        key={item.id} 
                        className={`library-card glass-card ${isProcessing ? 'disabled' : ''} ${isFailed ? 'failed' : ''}`}
                        onClick={() => {
                          if (isProcessing || isFailed) return;
                          setStemsData({ folder: item.id, stems: item.stems });
                          setAnalysis({ bpm: item.bpm, key: item.key });
                          setView('player');
                        }}
                      >
                        <div className="card-icon"><Music size={24} /></div>
                        <div className="card-info">
                          <h3>{item.name}</h3>
                          {isProcessing && <p className="status-processing-text">Processing Stems...</p>}
                          {isFailed && <p className="status-failed-text">Processing Failed</p>}
                          {!isProcessing && !isFailed && <p>{item.stems.length} stems available</p>}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="empty-state">
                      <p>No songs processed yet.</p>
                      <button className="btn-secondary" onClick={() => setView('upload')}>
                        Upload your first song
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {view === 'upload' && (
              <div 
                className={`upload-zone glass ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="upload-content">
                  <div className="icon-circle">
                    <Upload size={32} />
                  </div>
                  <h3>Drag & Drop Audio File</h3>
                  <p>Supported formats: MP3, WAV, FLAC</p>
                  {file && <div className="file-chip">{file.name}</div>}
                  
                  <input 
                    type="file" 
                    id="fileInput" 
                    hidden 
                    accept="audio/*" 
                    onChange={(e) => setFile(e.target.files[0])}
                  />
                  
                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button 
                      className="btn-secondary"
                      onClick={() => document.getElementById('fileInput').click()}
                    >
                      Select File
                    </button>
                    <button 
                      className="btn-primary" 
                      onClick={handleUpload}
                      disabled={!isMounted || (status !== 'idle' && status !== 'done') || !file}
                    >
                      {status === 'idle' ? 'Process Audio' : status.toUpperCase()}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {view === 'player' && (
              <div className="stems-container animate-fade-in">
                <div className="stems-header">
                  <h2>{stemsData?.folder.split('_', 1)[-1] || 'Player'}</h2>
                  <button className="btn-secondary" onClick={() => setView('library')}>
                    Back to Library
                  </button>
                </div>

                {/* Master Studio Controls Dashboard */}
                <div className="master-controls glass">
                  <div className="master-left">
                    <button onClick={toggleMasterPlay} className="master-play-btn" title={isMasterPlaying ? "Pausar" : "Tocar"}>
                      {isMasterPlaying ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" style={{ marginLeft: 3 }} />}
                    </button>
                    <button onClick={stopMasterPlay} className="master-stop-btn" title="Parar e voltar ao início">
                      <Square size={16} fill="white" />
                    </button>
                    <div className="time-display">
                      <span className="current-time">{formatTime(currentTime)}</span>
                      <span className="divider">/</span>
                      <span className="total-time">{formatTime(duration)}</span>
                    </div>
                  </div>

                  <div className="master-timeline-container">
                    <input
                      type="range"
                      min="0"
                      max={duration || 100}
                      step="0.05"
                      value={currentTime}
                      onChange={(e) => handleMasterSeek(parseFloat(e.target.value))}
                      className="master-timeline"
                    />
                  </div>

                  <div className="master-right">
                    <div className="master-volume-container">
                      {masterVolume === 0 ? <VolumeX size={16} className="volume-icon" /> : <Volume2 size={16} className="volume-icon" />}
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={masterVolume}
                        onChange={(e) => handleMasterVolumeChange(parseFloat(e.target.value))}
                        className="master-volume-slider"
                      />
                    </div>
                    <button onClick={handleDownloadAll} className="btn-secondary btn-small" title="Download All Stems">
                      <Download size={15} /> All
                    </button>
                  </div>
                </div>

                <div className="stems-list">
                  {stemsData?.stems.map((stem, idx) => (
                    <StemPlayer 
                      key={stem}
                      name={stem}
                      url={`${AUDIO_BASE_URL}/output/${encodeURIComponent(stemsData.folder)}/${encodeURIComponent(stem)}`}
                      color={['#8b5cf6', '#06b6d4', '#ec4899', '#10b981'][idx % 4]}
                      volume={trackVolumes[stem] !== undefined ? trackVolumes[stem] * masterVolume : 0.8 * masterVolume}
                      isMuted={trackMutes[stem] || false}
                      isSoloed={trackSolos[stem] || false}
                      isAnySoloed={Object.values(trackSolos).some(v => v)}
                      onVolumeChange={(val) => setTrackVolumes(prev => ({ ...prev, [stem]: val }))}
                      onMuteToggle={() => handleToggleMute(stem)}
                      onSoloToggle={() => handleToggleSolo(stem)}
                      onDownload={() => {
                        const url = `${AUDIO_BASE_URL}/output/${encodeURIComponent(stemsData.folder)}/${encodeURIComponent(stem)}`;
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = stem;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }}
                      onReady={handleRegisterWs}
                      onDestroy={handleDestroyWs}
                    />
                  ))}
                </div>
              </div>
            )}
              </>
            )}
          </div>

          {/* Processing Card / Quick Actions */}
          <div className="side-panel glass">
            <h2>Audio Processing Hub</h2>
            <div className="stats-list">
              <div className="stat-item">
                <span className="label">Status</span>
                <span className={`value status-${status}`}>{status === 'idle' ? 'Ready to process' : status}</span>
              </div>
              {analysis && (
                <>
                  <div className="stat-item animate-fade-in">
                    <span className="label">BPM</span>
                    <span className="value" style={{ color: 'var(--primary)' }}>{analysis.bpm}</span>
                  </div>
                  <div className="stat-item animate-fade-in">
                    <span className="label">Key (Tom)</span>
                    <span className="value" style={{ color: 'var(--secondary)' }}>{analysis.key}</span>
                  </div>
                </>
              )}
              <div className="stat-item">
                <span className="label">Model</span>
                <span className="value">htdemucs (High Quality)</span>
              </div>
            </div>

            <div className="processing-steps">
              <div className={`step ${status === 'uploading' ? 'active' : ''}`}>1. Upload File</div>
              <div className={`step ${status === 'processing' ? 'active' : ''}`}>2. AI Separation</div>
              <div className={`step ${status === 'done' ? 'active' : ''}`}>3. Download Stems</div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 40px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 30px;
          margin-top: 20px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 1.2rem;
        }

        .icon-primary {
          color: var(--primary);
        }

        .nav {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .nav-item {
          background: none;
          border: none;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: color 0.3s;
        }

        .nav-item.active {
          color: white;
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 10px;
          border-left: 1px solid var(--glass-border);
          padding-left: 20px;
        }

        .user-profile img {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--glass);
        }

        .content {
          display: flex;
          flex-direction: column;
          gap: 40px;
        }

        .hero {
          text-align: center;
          max-width: 600px;
          margin: 0 auto;
        }

        .stems-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .stems-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .library-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 20px;
        }

        .library-card {
          padding: 20px;
          border-radius: 16px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 12px;
          text-align: center;
        }

        .library-card.disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .library-card.failed {
          cursor: default;
          border-color: rgba(239, 68, 68, 0.2);
        }

        .status-processing-text {
          color: var(--secondary);
          font-weight: 500;
          animation: pulse 1.5s infinite ease-in-out;
        }

        .status-failed-text {
          color: #ef4444;
          font-weight: 500;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        .card-icon {
          width: 50px;
          height: 50px;
          background: var(--primary-glow);
          color: var(--primary);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto;
        }

        .card-info h3 {
          font-size: 1rem;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-info p {
          font-size: 0.8rem;
        }

        .empty-state {
          grid-column: 1 / -1;
          padding: 60px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 350px;
          gap: 24px;
        }

        .upload-zone {
          height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px dashed var(--glass-border);
          transition: all 0.3s ease;
        }

        .upload-zone.dragging {
          border-color: var(--primary);
          background: var(--primary-glow);
          transform: scale(1.01);
        }

        .upload-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
        }

        .icon-circle {
          width: 80px;
          height: 80px;
          background: var(--glass);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
          margin-bottom: 10px;
        }

        .file-chip {
          background: var(--primary-glow);
          color: var(--primary);
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.9rem;
          margin-top: 10px;
          border: 1px solid var(--primary);
        }

        .side-panel {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .stats-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .stat-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--glass-border);
        }

        .label {
          color: #94a3b8;
          font-size: 0.9rem;
        }

        .value {
          font-weight: 500;
        }

        .status-idle {
          color: var(--secondary);
        }

        .processing-steps {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .step {
          padding: 12px;
          background: var(--glass);
          border-radius: 8px;
          color: #64748b;
          font-size: 0.9rem;
          border: 1px solid transparent;
        }

        .step.active {
          background: var(--primary-glow);
          color: white;
          border-color: var(--primary);
        }

        /* Studio Master Controls Styles */
        .master-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          margin-bottom: 24px;
          gap: 24px;
        }

        .master-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .master-play-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--primary), var(--secondary));
          border: none;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px var(--primary-glow);
        }

        .master-play-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 16px var(--primary-glow);
        }

        .master-stop-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--glass);
          border: 1px solid var(--glass-border);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .master-stop-btn:hover {
          transform: scale(1.05);
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
        }

        .time-display {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
          font-family: monospace;
          font-size: 0.95rem;
          min-width: 90px;
          user-select: none;
        }

        .divider {
          color: #475569;
        }

        .master-timeline-container {
          flex: 1;
          display: flex;
          align-items: center;
        }

        .master-timeline {
          width: 100%;
          height: 6px;
          -webkit-appearance: none;
          background: #1e293b;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
          border: 1px solid var(--glass-border);
        }

        .master-timeline::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
          cursor: pointer;
          transition: transform 0.1s;
        }

        .master-timeline::-webkit-slider-thumb:hover {
          transform: scale(1.25);
        }

        .master-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .master-volume-container {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--glass);
          border: 1px solid var(--glass-border);
          padding: 6px 12px;
          border-radius: 8px;
        }

        .volume-icon {
          color: #94a3b8;
        }

        .master-volume-slider {
          width: 80px;
          height: 4px;
          -webkit-appearance: none;
          background: #334155;
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }

        .master-volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px;
          height: 10px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
        }

        .btn-small {
          padding: 8px 12px;
          font-size: 0.8rem;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* Loading Screen Styles */
        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 40px;
          text-align: center;
          height: 400px;
          gap: 20px;
        }

        .loading-spinner-container {
          position: relative;
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
        }

        .loading-spinner {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 3px solid rgba(255, 255, 255, 0.05);
          border-top-color: var(--primary);
          border-bottom-color: var(--secondary);
          animation: spin 1.5s linear infinite;
        }

        .loading-icon-center {
          animation: pulse 1.5s infinite ease-in-out;
        }

        .loading-container h3 {
          font-size: 1.4rem;
          font-weight: 600;
          color: white;
        }

        .loading-container p {
          font-size: 0.95rem;
          color: #94a3b8;
          max-width: 400px;
        }

        .loading-bar-bg {
          width: 250px;
          height: 6px;
          background: #1e293b;
          border-radius: 3px;
          overflow: hidden;
          margin-top: 10px;
          border: 1px solid var(--glass-border);
        }

        .loading-bar-fill {
          height: 100%;
          background: linear-gradient(to right, var(--primary), var(--secondary));
          border-radius: 3px;
          transition: width 0.5s ease;
        }

        .loading-bar-fill.uploading {
          width: 30%;
          animation: uploadProgress 2s ease forwards;
        }

        .loading-bar-fill.processing {
          width: 85%;
          animation: processingProgress 30s cubic-bezier(0.1, 0.8, 0.1, 1) forwards;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes uploadProgress {
          to { width: 45%; }
        }

        @keyframes processingProgress {
          from { width: 45%; }
          to { width: 95%; }
        }
      `}</style>
    </main>
  );
}


'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { 
  Play, 
  Pause, 
  Square, 
  Volume2, 
  VolumeX, 
  Download, 
  Loader2, 
  AlertCircle,
  ArrowLeft
} from 'lucide-react';
import { 
  calculateEffectiveVolume, 
  toggleTrackSolo, 
  toggleTrackMute 
} from '../utils/audioMixer.js';

// DAW Colors for standard Demucs stems
const STEM_COLORS = {
  vocals: '#a855f7', // Purple
  drums: '#f59e0b',  // Amber
  bass: '#06b6d4',   // Cyan
  other: '#ec4899'   // Pink
};

const DEFAULT_COLOR = '#8b5cf6';

const getStemKey = (stem) => stem.replace('.wav', '').toLowerCase();
const getStemDisplayName = (stem) => stem.replace('.wav', '').toUpperCase();
const getStemColor = (stem) => STEM_COLORS[getStemKey(stem)] || DEFAULT_COLOR;

// Format seconds to mm:ss
const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds === null) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export default function MultiTrackPlayer({
  folder,
  stems = [],
  audioBaseUrl,
  onBack
}) {
  // Master Transport State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [masterVolume, setMasterVolume] = useState(1.0);

  // Mixer Matrix State initialized lazily from stems
  const [trackVolumes, setTrackVolumes] = useState(() => {
    const v = {};
    stems.forEach(stem => { v[stem] = 0.8; });
    return v;
  });
  const [trackMutes, setTrackMutes] = useState({});
  const [trackSolos, setTrackSolos] = useState({});
  const [trackStatuses, setTrackStatuses] = useState(() => {
    const s = {};
    stems.forEach(stem => { s[stem] = 'loading'; });
    return s;
  });

  // Container refs for WaveSurfer instances
  const waveformRefs = useRef({});
  // Holds WaveSurfer instances & metadata
  const tracksRef = useRef({});
  // Master Clock tracking
  const masterStemRef = useRef(null);
  const lastDriftCheckRef = useRef(0);
  const isInteractingRef = useRef(false);

  // Direct Hardware Volume Application
  const applyEffectiveVolumes = useCallback((volumes, solos, mutes, masterVol) => {
    const isAnySoloed = Object.values(solos).some(Boolean);

    Object.entries(tracksRef.current).forEach(([stem, track]) => {
      if (!track || !track.ws) return;
      const effVol = calculateEffectiveVolume({
        volume: volumes[stem] ?? 0.8,
        isMuted: mutes[stem] ?? false,
        isSoloed: solos[stem] ?? false,
        isAnySoloed,
        masterVolume: masterVol
      });
      try {
        track.ws.setVolume(effVol);
      } catch (err) {
        console.warn('Error setting volume for', stem, err);
      }
    });
  }, []);

  // Initialize WaveSurfer instances for each stem
  useEffect(() => {
    if (!folder || !stems.length) return;

    masterStemRef.current = stems[0];

    // Instantiate WaveSurfer for each track
    stems.forEach(stem => {
      const container = waveformRefs.current[stem];
      if (!container) return;

      // Clean old instance if exists
      if (tracksRef.current[stem]?.ws) {
        try {
          tracksRef.current[stem].ws.destroy();
        } catch (e) {}
      }

      const stemUrl = `${audioBaseUrl}/output/${encodeURIComponent(folder)}/${encodeURIComponent(stem)}`;
      const stemColor = getStemColor(stem);

      const ws = WaveSurfer.create({
        container,
        waveColor: '#334155',
        progressColor: stemColor,
        cursorColor: '#ffffff',
        cursorWidth: 2,
        barWidth: 2,
        barRadius: 3,
        responsive: true,
        height: 48,
        normalize: true,
        interact: true,
        dragToSeek: true
      });

      tracksRef.current[stem] = {
        ws,
        isReady: false,
        duration: 0
      };

      // Ready Handler
      ws.on('ready', () => {
        const d = ws.getDuration();
        if (tracksRef.current[stem]) {
          tracksRef.current[stem].isReady = true;
          tracksRef.current[stem].duration = d;
        }

        setTrackStatuses(prev => ({ ...prev, [stem]: 'ready' }));

        // Update overall duration to max among all stems
        let maxDuration = 0;
        Object.values(tracksRef.current).forEach(t => {
          maxDuration = Math.max(maxDuration, t.duration || 0);
        });
        if (maxDuration > 0) {
          setDuration(maxDuration);
        }

        // Apply initial volume
        const effVol = calculateEffectiveVolume({
          volume: 0.8,
          isMuted: false,
          isSoloed: false,
          isAnySoloed: false,
          masterVolume: 1.0
        });
        ws.setVolume(effVol);
      });

      // Master Clock Handler
      ws.on('timeupdate', (time) => {
        if (stem === masterStemRef.current) {
          setCurrentTime(time);

          // Drift synchronization check every 300ms
          const now = Date.now();
          if (now - lastDriftCheckRef.current > 300) {
            lastDriftCheckRef.current = now;
            Object.entries(tracksRef.current).forEach(([otherStem, track]) => {
              if (otherStem !== masterStemRef.current && track.isReady && track.ws) {
                const diff = Math.abs(track.ws.getCurrentTime() - time);
                if (diff > 0.05) {
                  try {
                    track.ws.setTime(time);
                  } catch (e) {}
                }
              }
            });
          }
        }
      });

      // End of song handler
      ws.on('finish', () => {
        if (stem === masterStemRef.current) {
          setIsPlaying(false);
          setCurrentTime(0);
          Object.values(tracksRef.current).forEach(t => {
            try {
              t.ws.pause();
              t.ws.setTime(0);
            } catch (e) {}
          });
        }
      });

      // Seek / Waveform Interaction Handler
      ws.on('interaction', (newTime) => {
        if (isInteractingRef.current) return;
        isInteractingRef.current = true;

        setCurrentTime(newTime);

        // Sync all other stems to the exact clicked timestamp
        Object.entries(tracksRef.current).forEach(([otherStem, track]) => {
          if (otherStem !== stem && track.ws) {
            try {
              track.ws.setTime(newTime);
            } catch (e) {}
          }
        });

        setTimeout(() => {
          isInteractingRef.current = false;
        }, 50);
      });

      // Error Handler
      const isAbortError = (err) => {
        const msg = typeof err === 'string' ? err : (err?.message || err?.name || '');
        return msg.includes('AbortError') || msg.includes('aborted');
      };

      ws.on('error', (err) => {
        if (isAbortError(err)) return;
        console.error(`WaveSurfer error on ${stem}:`, err);
        setTrackStatuses(prev => ({ ...prev, [stem]: 'error' }));
      });

      ws.load(stemUrl).catch(err => {
        if (!isAbortError(err)) {
          console.error(`WaveSurfer load error on ${stem}:`, err);
          setTrackStatuses(prev => ({ ...prev, [stem]: 'error' }));
        }
      });
    });

    // Component Cleanup
    return () => {
      Object.values(tracksRef.current).forEach(track => {
        if (track.ws) {
          try {
            track.ws.pause();
            track.ws.destroy();
          } catch (e) {}
        }
      });
      tracksRef.current = {};
    };
  }, [folder, stems, audioBaseUrl]);

  // Master Play / Pause Toggle
  const togglePlayPause = () => {
    const tracks = Object.values(tracksRef.current);
    if (!tracks.length) return;

    if (isPlaying) {
      // Pause all tracks immediately
      tracks.forEach(t => {
        if (t.ws) {
          try { t.ws.pause(); } catch (e) {}
        }
      });
      setIsPlaying(false);
    } else {
      // Resume / Play all tracks immediately
      setIsPlaying(true);
      tracks.forEach(t => {
        if (t.ws && t.isReady) {
          try {
            t.ws.play().catch(err => {
              console.warn('Play interrupted or failed:', err);
            });
          } catch (e) {}
        }
      });
    }
  };

  // Master Stop (Pause & Rewind to 0)
  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    Object.values(tracksRef.current).forEach(t => {
      if (t.ws) {
        try {
          t.ws.pause();
          t.ws.setTime(0);
        } catch (e) {}
      }
    });
  };

  // Master Seek Scrubbing
  const handleMasterSeek = (targetTime) => {
    setCurrentTime(targetTime);
    Object.values(tracksRef.current).forEach(t => {
      if (t.ws) {
        try {
          t.ws.setTime(targetTime);
        } catch (e) {}
      }
    });
  };

  // Solo Toggle with Automatic Un-Mute
  const handleToggleSolo = (stem) => {
    const result = toggleTrackSolo(trackSolos, trackMutes, stem);
    setTrackSolos(result.solos);
    setTrackMutes(result.mutes);
    applyEffectiveVolumes(trackVolumes, result.solos, result.mutes, masterVolume);
  };

  // Mute Toggle with Automatic Cancel-Solo
  const handleToggleMute = (stem) => {
    const result = toggleTrackMute(trackSolos, trackMutes, stem);
    setTrackSolos(result.solos);
    setTrackMutes(result.mutes);
    applyEffectiveVolumes(trackVolumes, result.solos, result.mutes, masterVolume);
  };

  // Track Volume Change
  const handleTrackVolumeChange = (stem, newVol) => {
    const newVolumes = { ...trackVolumes, [stem]: newVol };
    setTrackVolumes(newVolumes);
    applyEffectiveVolumes(newVolumes, trackSolos, trackMutes, masterVolume);
  };

  // Master Volume Change
  const handleMasterVolumeChange = (newMasterVol) => {
    setMasterVolume(newMasterVol);
    applyEffectiveVolumes(trackVolumes, trackSolos, trackMutes, newMasterVol);
  };

  // Download Individual Stem
  const handleDownloadStem = (stem) => {
    const url = `${audioBaseUrl}/output/${encodeURIComponent(folder)}/${encodeURIComponent(stem)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = stem;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download All Stems
  const handleDownloadAll = () => {
    stems.forEach(stem => {
      handleDownloadStem(stem);
    });
  };

  const isAnySoloed = Object.values(trackSolos).some(Boolean);

  return (
    <div className="multitrack-studio animate-fade-in">
      {/* Studio Header */}
      <div className="studio-header">
        <div className="title-area">
          <button onClick={onBack} className="btn-secondary btn-back" title="Voltar à biblioteca">
            <ArrowLeft size={16} /> Voltar
          </button>
          <h2>{folder.includes('_') ? folder.split('_').slice(1).join('_') : folder}</h2>
        </div>
        <div className="badge-area">
          <span className="studio-badge">4-STEM DAW ENGINE</span>
        </div>
      </div>

      {/* Master Studio Transport Bar */}
      <div className="master-controls glass">
        <div className="master-left">
          <button 
            onClick={togglePlayPause} 
            className="master-play-btn" 
            title={isPlaying ? "Pausar todas as faixas" : "Tocar todas as faixas"}
          >
            {isPlaying ? (
              <Pause size={22} fill="white" />
            ) : (
              <Play size={22} fill="white" style={{ marginLeft: 3 }} />
            )}
          </button>
          <button 
            onClick={handleStop} 
            className="master-stop-btn" 
            title="Parar e voltar ao início"
          >
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
            {masterVolume === 0 ? (
              <VolumeX size={16} className="volume-icon" />
            ) : (
              <Volume2 size={16} className="volume-icon" />
            )}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={masterVolume}
              onChange={(e) => handleMasterVolumeChange(parseFloat(e.target.value))}
              className="master-volume-slider"
              title="Master Volume"
            />
          </div>
          <button 
            onClick={handleDownloadAll} 
            className="btn-secondary btn-small" 
            title="Baixar todas as faixas separadas"
          >
            <Download size={15} /> All
          </button>
        </div>
      </div>

      {/* Individual Stem Tracks */}
      <div className="stems-list">
        {stems.map((stem) => {
          const isSolo = trackSolos[stem] || false;
          const isMute = trackMutes[stem] || false;
          const vol = trackVolumes[stem] !== undefined ? trackVolumes[stem] : 0.8;
          const status = trackStatuses[stem] || 'loading';
          const stemColor = getStemColor(stem);
          const isSilenced = isMute || (isAnySoloed && !isSolo) || vol === 0;

          return (
            <div key={stem} className="stem-item glass-card">
              <div className="stem-info">
                <div className="stem-title-wrap">
                  <div 
                    className="stem-color-dot" 
                    style={{ backgroundColor: stemColor, boxShadow: `0 0 8px ${stemColor}` }} 
                  />
                  <span className="stem-name">{getStemDisplayName(stem)}</span>
                  {status === 'loading' && (
                    <span className="stem-status-loading">
                      <Loader2 size={13} className="animate-spin" /> Carregando...
                    </span>
                  )}
                  {status === 'error' && (
                    <span className="stem-status-error">
                      <AlertCircle size={13} /> Arquivo não encontrado
                    </span>
                  )}
                </div>

                <div className="stem-controls">
                  {/* Solo Button */}
                  <button 
                    onClick={() => handleToggleSolo(stem)} 
                    className={`control-btn solo-btn ${isSolo ? 'active' : ''}`}
                    title={isSolo ? "Desativar Solo" : "Ativar Solo (S)"}
                  >
                    S
                  </button>
                  
                  {/* Mute Button */}
                  <button 
                    onClick={() => handleToggleMute(stem)} 
                    className={`control-btn mute-btn ${isMute ? 'active' : ''}`}
                    title={isMute ? "Desativar Mudo" : "Silenciar Faixa (M)"}
                  >
                    M
                  </button>

                  {/* Volume Slider */}
                  <div className="volume-container">
                    {isSilenced ? (
                      <VolumeX size={16} className="volume-icon muted" />
                    ) : (
                      <Volume2 size={16} className="volume-icon" />
                    )}
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={vol} 
                      onChange={(e) => handleTrackVolumeChange(stem, parseFloat(e.target.value))}
                      className="volume-slider"
                      title={`Volume ${getStemDisplayName(stem)}`}
                    />
                  </div>

                  {/* Download Stem */}
                  <button 
                    onClick={() => handleDownloadStem(stem)} 
                    className="control-btn download-btn" 
                    title={`Download ${getStemDisplayName(stem)}`}
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>

              {/* Waveform Canvas */}
              <div 
                ref={(el) => { waveformRefs.current[stem] = el; }} 
                className="waveform-container" 
              />
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .multitrack-studio {
          width: 100%;
        }

        .studio-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .title-area {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .btn-back {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          font-size: 0.85rem;
          border-radius: 8px;
        }

        .studio-badge {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(139, 92, 246, 0.15);
          color: #c084fc;
          border: 1px solid rgba(139, 92, 246, 0.3);
        }

        .master-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          margin-bottom: 24px;
          gap: 24px;
          border-radius: 16px;
        }

        .master-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .master-play-btn {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          background: linear-gradient(135deg, #8b5cf6, #3b82f6);
          border: none;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);
        }

        .master-play-btn:hover {
          transform: scale(1.06);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.6);
        }

        .master-stop-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
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
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
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
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--glass-border);
          padding: 6px 12px;
          border-radius: 8px;
        }

        .volume-icon {
          color: #94a3b8;
        }

        .volume-icon.muted {
          color: #ef4444;
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

        /* Stem Cards */
        .stems-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stem-item {
          padding: 16px 20px;
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stem-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stem-title-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .stem-color-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .stem-name {
          font-weight: 700;
          font-size: 0.85rem;
          color: #f1f5f9;
          letter-spacing: 0.06em;
        }

        .stem-status-loading {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          color: #94a3b8;
        }

        .stem-status-error {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          color: #ef4444;
        }

        .stem-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .control-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--glass-border);
          color: #94a3b8;
          cursor: pointer;
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.85rem;
          transition: all 0.2s ease;
        }

        .control-btn:hover {
          transform: scale(1.05);
          color: white;
          border-color: rgba(255, 255, 255, 0.25);
        }

        .solo-btn.active {
          background: rgba(6, 182, 212, 0.25);
          border-color: #06b6d4;
          color: #22d3ee;
          box-shadow: 0 0 12px rgba(6, 182, 212, 0.3);
        }

        .mute-btn.active {
          background: rgba(239, 68, 68, 0.25);
          border-color: #ef4444;
          color: #f87171;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.3);
        }

        .volume-container {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--glass-border);
          padding: 4px 10px;
          border-radius: 8px;
        }

        .volume-slider {
          width: 80px;
          height: 4px;
          -webkit-appearance: none;
          background: #334155;
          border-radius: 2px;
          outline: none;
        }

        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.1s;
        }

        .volume-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }

        .waveform-container {
          width: 100%;
          opacity: 0.9;
          transition: opacity 0.2s;
        }

        .waveform-container:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}

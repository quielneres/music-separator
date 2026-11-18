'use client';

import { useState, useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Volume2, VolumeX, Download, AlertCircle, Loader2 } from 'lucide-react';

export default function StemPlayer({ 
  url, 
  name, 
  color, 
  volume, 
  isMuted, 
  isSoloed, 
  isAnySoloed,
  onVolumeChange,
  onMuteToggle,
  onSoloToggle,
  onDownload,
  onReady,
  onDestroy
}) {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    setIsLoading(true);
    setHasError(false);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#475569',
      progressColor: color || '#8b5cf6',
      cursorColor: '#fff',
      barWidth: 2,
      barRadius: 3,
      responsive: true,
      height: 48,
      normalize: true,
      partialRender: true
    });

    ws.on('ready', () => {
      setIsLoading(false);
      setHasError(false);
    });

    ws.on('error', (err) => {
      console.error('WaveSurfer load error for', url, err);
      setIsLoading(false);
      setHasError(true);
    });

    ws.load(url).catch(err => {
      if (err.name !== 'AbortError') {
        console.error('WaveSurfer catch error:', err);
        setIsLoading(false);
        setHasError(true);
      }
    });
    
    wavesurferRef.current = ws;

    if (onReady) {
      onReady(name, ws);
    }

    return () => {
      if (onDestroy) {
        onDestroy(name);
      }
      if (ws) {
        ws.destroy();
      }
    };
  }, [url, name, color]);

  // Reactive audio volume management including Solo / Mute rules
  useEffect(() => {
    if (wavesurferRef.current) {
      let targetVolume = volume;
      if (isMuted) {
        targetVolume = 0;
      } else if (isAnySoloed && !isSoloed) {
        targetVolume = 0;
      }
      wavesurferRef.current.setVolume(targetVolume);
    }
  }, [volume, isMuted, isSoloed, isAnySoloed]);

  return (
    <div className="stem-item glass-card animate-fade-in">
      <div className="stem-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="stem-name">{name.replace('.wav', '').toUpperCase()}</span>
          {isLoading && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#94a3b8' }}>
              <Loader2 size={12} className="animate-spin" /> Carregando...
            </span>
          )}
          {hasError && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#ef4444' }} title={url}>
              <AlertCircle size={12} /> Áudio não encontrado (404)
            </span>
          )}
        </div>
        <div className="stem-controls">
          {/* Solo Button */}
          <button 
            onClick={onSoloToggle} 
            className={`control-btn solo-btn ${isSoloed ? 'active' : ''}`}
            title="Solo"
          >
            S
          </button>
          
          {/* Mute Button */}
          <button 
            onClick={onMuteToggle} 
            className={`control-btn mute-btn ${isMuted ? 'active' : ''}`}
            title="Mute"
          >
            M
          </button>

          {/* Volume Slider */}
          <div className="volume-container">
            {isMuted || (isAnySoloed && !isSoloed) || volume === 0 ? (
              <VolumeX size={16} className="volume-icon muted" />
            ) : (
              <Volume2 size={16} className="volume-icon" />
            )}
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={volume} 
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="volume-slider"
            />
          </div>

          {/* Download Button */}
          <button onClick={onDownload} className="control-btn download-btn" title="Download Stem">
            <Download size={16} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="waveform-container" />

      <style jsx>{`
        .stem-item {
          padding: 16px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 12px;
        }

        .stem-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stem-name {
          font-weight: 700;
          font-size: 0.8rem;
          color: #94a3b8;
          letter-spacing: 0.05em;
        }

        .stem-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .control-btn {
          background: var(--glass);
          border: 1px solid var(--glass-border);
          color: #94a3b8;
          cursor: pointer;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.85rem;
          transition: all 0.2s ease;
        }

        .control-btn:hover {
          transform: scale(1.05);
          color: white;
          border-color: rgba(255, 255, 255, 0.25);
        }

        .solo-btn.active {
          background: rgba(6, 182, 212, 0.2);
          border-color: var(--secondary);
          color: var(--secondary);
          box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
        }

        .mute-btn.active {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          color: #ef4444;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.2);
        }

        .volume-container {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--glass);
          border: 1px solid var(--glass-border);
          padding: 4px 8px;
          border-radius: 8px;
        }

        .volume-icon {
          color: #94a3b8;
        }

        .volume-icon.muted {
          color: #ef4444;
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
          opacity: 0.85;
          transition: opacity 0.2s;
        }

        .waveform-container:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}


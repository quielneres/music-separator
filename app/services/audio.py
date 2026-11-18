import sys
import subprocess
from pathlib import Path
import shutil
import librosa
import numpy as np

BASE_DIR = Path.cwd()
WORK_DIR = BASE_DIR / "work"
OUTPUT_DIR = BASE_DIR / "output"

WORK_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# Resolve demucs executable from the active virtual environment
python_bin = Path(sys.executable).parent
demucs_path = python_bin / "demucs"
if not demucs_path.exists():
    demucs_path = "demucs"
else:
    demucs_path = str(demucs_path)


def run_command(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise Exception(result.stderr)


def process_audio(input_path: Path):
    track_name = input_path.stem
    wav_path = WORK_DIR / f"{track_name}.wav"

    # 1. Converter
    run_command([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-ar", "44100",
        "-ac", "2",
        str(wav_path)
    ])

    # 2. Demucs
    run_command([
        demucs_path,
        "-n", "htdemucs",
        str(wav_path)
    ])


    # 3. Organizar
    demucs_output = BASE_DIR / "separated" / "htdemucs" / track_name
    final_output = OUTPUT_DIR / track_name
    final_output.mkdir(parents=True, exist_ok=True)

    for file in demucs_output.glob("*.wav"):
        shutil.move(str(file), final_output / file.name)

    # 4. Limpar
    if wav_path.exists():
        wav_path.unlink()

    return final_output


def analyze_audio(input_path: Path):
    # Carrega apenas os primeiros 30 segundos para ser rápido
    y, sr = librosa.load(str(input_path), duration=30)
    
    # 1. Detectar BPM
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    
    # 2. Estimar Tom (Key)
    # Usando chromagram para ver a intensidade das notas
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    mean_chroma = np.mean(chroma, axis=1)
    
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    key_idx = np.argmax(mean_chroma)
    estimated_key = notes[key_idx]
    
    return {
        "bpm": round(float(tempo[0])) if isinstance(tempo, np.ndarray) else round(float(tempo)),
        "key": estimated_key
    }
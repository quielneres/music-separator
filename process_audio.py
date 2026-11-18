import os
import subprocess
from pathlib import Path
import shutil

# CONFIG
INPUT_FILE = "a eleita.mp3"
BASE_DIR = Path.cwd()
INPUT_PATH = BASE_DIR / INPUT_FILE

WORK_DIR = BASE_DIR / "work"
OUTPUT_DIR = BASE_DIR / "output"

WORK_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

def run_command(cmd):
    print(f"\n🚀 Executando: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print("❌ Erro:")
        print(result.stderr)
        raise Exception("Falha no comando")

    print(result.stdout)


def convert_to_wav(input_path, output_path):
    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(input_path),
        "-ar", "44100",
        "-ac", "2",
        str(output_path)
    ]
    run_command(cmd)


def run_demucs(wav_path):
    cmd = [
        "demucs",
        "-n", "htdemucs",
        str(wav_path)
    ]
    run_command(cmd)


def organize_output(track_name):
    demucs_output = BASE_DIR / "separated" / "htdemucs" / track_name
    final_output = OUTPUT_DIR / track_name

    final_output.mkdir(parents=True, exist_ok=True)

    for file in demucs_output.glob("*.wav"):
        target = final_output / file.name
        shutil.move(str(file), str(target))

    print(f"\n📦 Arquivos organizados em: {final_output}")


def clean_temp(wav_path):
    if wav_path.exists():
        wav_path.unlink()
        print("🧹 WAV temporário removido")

def main():
    track_name = INPUT_PATH.stem
    wav_path = WORK_DIR / f"{track_name}.wav"

    print(f"\n🎵 Processando: {INPUT_FILE}")

    # 1. Converter
    convert_to_wav(INPUT_PATH, wav_path)

    # 2. Separar
    run_demucs(wav_path)

    # 3. Organizar
    organize_output(track_name)

    # 4. Limpar
    clean_temp(wav_path)

    print("\n✅ Processo finalizado com sucesso!")


if __name__ == "__main__":
    main()
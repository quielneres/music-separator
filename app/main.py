from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import shutil
import uuid
import logging

from app.services.audio import process_audio, analyze_audio
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("audio_engine")

app = FastAPI(title="E2N Studio Audio Engine")

app.mount("/output", StaticFiles(directory="output"), name="output")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

INPUT_DIR = Path("input")
OUTPUT_DIR = Path("output")
INPUT_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# Armazenamento em memória do status das tarefas assíncronas
jobs_status = {}


def run_background_process(file_id: str, input_file: Path):
    try:
        jobs_status[file_id] = {"status": "processing"}
        logger.info(f"Iniciando separação Demucs para {file_id}...")
        
        output_path = process_audio(input_file)
        stems = [f.name for f in output_path.glob("*.wav")]
        
        jobs_status[file_id] = {
            "status": "completed",
            "folder": output_path.name,
            "stems": stems
        }
        logger.info(f"Processamento concluído com sucesso para {file_id}: {stems}")
    except Exception as e:
        logger.error(f"Erro ao processar áudio {file_id}: {str(e)}")
        jobs_status[file_id] = {
            "status": "failed",
            "error": str(e)
        }


@app.get("/health")
def health():
    return {"status": "ok", "service": "E2N Audio Engine"}


@app.post("/upload")
async def upload_audio(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    file_path = INPUT_DIR / f"{file_id}_{file.filename}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Analisar BPM e Tom imediatamente
    analysis = analyze_audio(file_path)

    return {
        "file_id": file_id,
        "filename": file.filename,
        "analysis": analysis
    }


@app.get("/library")
def get_library():
    if not OUTPUT_DIR.exists():
        return []
    
    songs = []
    for song_dir in OUTPUT_DIR.iterdir():
        if song_dir.is_dir():
            stems = [f.name for f in song_dir.glob("*.wav")]
            songs.append({
                "id": song_dir.name,
                "name": song_dir.name.split('_', 1)[-1] if '_' in song_dir.name else song_dir.name,
                "stems": stems
            })
    
    return songs


@app.post("/process-async/{file_id}")
def process_async(file_id: str, background_tasks: BackgroundTasks):
    files = list(INPUT_DIR.glob(f"{file_id}_*"))

    if not files:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    input_file = files[0]
    jobs_status[file_id] = {"status": "queued"}
    background_tasks.add_task(run_background_process, file_id, input_file)

    return {
        "status": "queued",
        "file_id": file_id
    }


@app.get("/status/{file_id}")
def get_status(file_id: str):
    # 1. Verifica se está no mapa de jobs recentes
    if file_id in jobs_status:
        return jobs_status[file_id]

    # 2. Verifica se a pasta correspondente já existe em output
    files = list(INPUT_DIR.glob(f"{file_id}_*"))
    if files:
        track_name = files[0].stem
        final_output = OUTPUT_DIR / track_name
        if final_output.exists() and list(final_output.glob("*.wav")):
            stems = [f.name for f in final_output.glob("*.wav")]
            return {
                "status": "completed",
                "folder": final_output.name,
                "stems": stems
            }

    return {"status": "pending"}


@app.post("/process/{file_id}")
def process(file_id: str):
    files = list(INPUT_DIR.glob(f"{file_id}_*"))

    if not files:
        return {"error": "arquivo não encontrado"}

    input_file = files[0]
    output_path = process_audio(input_file)
    stems = [f.name for f in output_path.glob("*.wav")]

    return {
        "status": "processed",
        "folder": output_path.name,
        "stems": stems
    }
FROM python:3.11-slim

# Instalar dependências de sistema (compiladores C/Rust, CMake, FFmpeg e libsndfile)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    cargo \
    rustc \
    cmake \
    pkg-config \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Atualizar pip para versões com suporte a wheels modernos
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Instalar dependências do Python
COPY app/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código do serviço
COPY app app

# Criar diretórios de trabalho e dados
RUN mkdir -p input output work separated

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

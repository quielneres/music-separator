# Guia de Deploy em Produção (Google Cloud Platform & Docker)

Este guia orienta o processo de deploy do **E2N Studio** na **Google Cloud Platform (GCP)** com custo mínimo inicial (usando os limites gratuitos do Cloud Run e Cloud Storage) e como executar o ambiente completo localmente com Docker Compose.

---

## 1. Execução Local com Docker Compose

Para testar todos os serviços integrados localmente de forma idêntica à nuvem:

```bash
# 1. Certifique-se de configurar o arquivo api/.env (use api/.env.example como modelo)
cp api/.env.example api/.env

# 2. Iniciar todos os containers (Frontend Next.js, API Express, Audio Engine FastAPI e Redis)
docker compose up --build
```

- **Frontend Web**: http://localhost:3000
- **API Gateway**: http://localhost:5050
- **Audio Engine (FastAPI)**: http://localhost:8000
- **Documentação da API de Áudio**: http://localhost:8000/docs

---

## 2. Deploy no Google Cloud Platform (GCP) com Custo Mínimo

A arquitetura no GCP utiliza **Google Cloud Run** para escalar até zero quando não houver requisições, garantindo custo fixo de **R$ 0,00**.

### Pré-requisitos
1. [Google Cloud SDK (gcloud CLI)](https://cloud.google.com/sdk/docs/install) instalado.
2. Projeto criado no Google Cloud Console com cobrança ativada (para aproveitar o Free Tier de $300 para novos usuários ou cotas gratuitas mensais).

```bash
# Login no GCP
gcloud auth login

# Configurar o ID do seu projeto no GCP
gcloud config set project SEU_PROJECT_ID
```

### Passo 1: Habilitar as APIs Necessárias (Executar uma única vez)
```bash
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    storage.googleapis.com
```

### Passo 2: Criar Repositório no Artifact Registry para suas Imagens Docker
```bash
gcloud artifacts repositories create e2n-studio-repo \
    --repository-format=docker \
    --location=southamerica-east1 \
    --description="Imagens Docker do E2N Studio"
```

### Passo 3: Deploy do Motor de Áudio (FastAPI / Demucs)
```bash
# Build e Deploy no Cloud Run (com 4 CPUs e 4GB de RAM para o Demucs rodar rápido)
gcloud run deploy audio-engine \
    --source=. \
    --region=southamerica-east1 \
    --platform=managed \
    --allow-unauthenticated \
    --cpu=4 \
    --memory=4Gi \
    --timeout=300 \
    --min-instances=0 \
    --max-instances=2
```
*Guarde a URL gerada pelo Cloud Run (ex: `https://audio-engine-xyz-rj.a.run.app`).*

### Passo 4: Deploy da API Gateway (Express / Node.js)
```bash
cd api

gcloud run deploy api-gateway \
    --source=. \
    --region=southamerica-east1 \
    --platform=managed \
    --allow-unauthenticated \
    --memory=512Mi \
    --min-instances=0 \
    --max-instances=3 \
    --set-env-vars="NODE_ENV=production,PORT=5050,FASTAPI_ENGINE_URL=https://audio-engine-xyz-rj.a.run.app,MONGO_URI=SEU_MONGO_URI,JWT_SECRET=SEU_JWT_SECRET"

cd ..
```
*Guarde a URL gerada da API Gateway (ex: `https://api-gateway-xyz-rj.a.run.app`).*

### Passo 5: Deploy do Frontend (Next.js Standalone)
```bash
cd web

gcloud run deploy web-app \
    --source=. \
    --region=southamerica-east1 \
    --platform=managed \
    --allow-unauthenticated \
    --memory=512Mi \
    --min-instances=0 \
    --max-instances=3 \
    --set-env-vars="NEXT_PUBLIC_API_URL=https://api-gateway-xyz-rj.a.run.app/api,NEXT_PUBLIC_AUDIO_ENGINE_URL=https://audio-engine-xyz-rj.a.run.app"

cd ..
```

---

## 3. Dicas para Garantir Custo Zero no GCP

1. **Min Instances = 0**: Ao configurar `--min-instances=0`, os containers são desligados após alguns minutos sem uso. Você não paga nada enquanto ninguém estiver usando o site.
2. **Free Tier do Cloud Run**: O Google Cloud oferece **2 milhões de requisições gratuitas por mês** e 360.000 GiB-segundos de memória grátis.
3. **Cota e Alerta de Orçamento**: No Google Cloud Console, acesse **Faturamento > Orçamentos e Alertas** e crie um alerta de **R$ 10,00 ou R$ 20,00** para receber notificações automáticas por e-mail e evitar surpresas.

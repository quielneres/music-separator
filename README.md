# 🎵 Music Separator (E2N Studio)

Plataforma completa de processamento de áudio com inteligência artificial para separação de faixas (*stems*: Vocais, Bateria, Baixo e Outros), estimativa de tom (*musical key*) e detecção de BPM em tempo real com player multi-pistas sincronizado.

---

## 🚀 Arquitetura e Tecnologias

- **Frontend**: [Next.js 16](https://nextjs.org/) (React 19) com suporte a container *standalone*, Tailwind CSS e [WaveSurfer.js](https://wavesurfer.xyz/) para reprodução com controles de Solo, Mute e Volume individual por stem.
- **API Gateway**: [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/) com autenticação JWT, controle de saldo de créditos, headers de segurança (Helmet), limite de payload e integração com MongoDB.
- **Audio Engine (IA)**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11), [Demucs v4](https://github.com/facebookresearch/demucs) (Meta AI) para separação de faixas, [Librosa](https://librosa.org/) para análise de BPM/tom e [FFmpeg](https://ffmpeg.org/).
- **Fila & Cache**: [Redis](https://redis.io/) com suporte a processamento assíncrono em segundo plano (evitando timeouts HTTP).
- **Containerização**: 100% dockerizado com suporte a [Docker Compose](https://docs.docker.com/compose/) e [Google Cloud Run](https://cloud.google.com/run).

---

## 🛠️ Como Executar Localmente

### Pré-requisitos
- [Docker](https://www.docker.com/) e Docker Compose instalados.

### 1. Clonar e Configurar Variáveis de Ambiente
```bash
git clone https://github.com/quielneres/music-separator.git
cd music-separator

# Copiar modelo de variáveis da API
cp api/.env.example api/.env
```
> Edite o arquivo `api/.env` com a sua string de conexão do MongoDB Atlas ou local.

### 2. Iniciar com Docker Compose
```bash
docker compose up --build
```

Os serviços estarão disponíveis em:
- **Aplicação Web**: [http://localhost:3000](http://localhost:3000)
- **API Gateway**: [http://localhost:5050](http://localhost:5050)
- **Audio Engine (FastAPI)**: [http://localhost:8000](http://localhost:8000)
- **Documentação Swagger (FastAPI)**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## ☁️ Deploy em Produção (Google Cloud Platform)

A aplicação foi preparada para deploy no **Google Cloud Run** com política `--min-instances=0` (escala até zero quando ocioso, garantindo custo fixo de **R$ 0,00** no tráfego inicial).

Consulte o passo a passo completo no guia:
👉 **[DEPLOY_GCP.md](DEPLOY_GCP.md)**

---

## 📄 Licença
Distribuído sob a licença MIT.

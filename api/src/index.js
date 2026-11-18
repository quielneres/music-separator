const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Validação de segurança de inicialização
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('supersecuresecretkeyfore2nstudiojwt123')) {
    console.warn('⚠️ AVISO DE SEGURANÇA: Configure uma chave JWT_SECRET segura e exclusiva em produção!');
  }
}

// Connect to MongoDB
connectDB();

const app = express();

// Security Headers (Helmet com fallback)
try {
  const helmet = require('helmet');
  app.use(helmet());
} catch (e) {
  // Caso o pacote ainda não tenha sido instalado no ambiente local
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
}

// CORS flexível para dev e restrito via env em prod
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5050'];

app.use(cors({
  origin: (origin, callback) => {
    // Permite requisições sem origin (mobile apps, curl ou postman) ou se listado
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado pela política de CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));

// Healthcheck detalhado para Cloud Run / Kubernetes / Docker
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'E2N Studio API Gateway'
  });
});

// Middleware Global de Tratamento de Erros
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `O arquivo enviado excede o limite máximo permitido de ${process.env.MAX_FILE_SIZE_MB || 250}MB.`
      });
    }
    return res.status(400).json({
      success: false,
      error: `Erro no upload do arquivo: ${err.message}`
    });
  }

  console.error('Erro na API:', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Ocorreu um erro interno no servidor.' : err.message
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor Express rodando na porta ${PORT}`);
});

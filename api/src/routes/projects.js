const express = require('express');
const router = express.Router();
const multer = require('multer');
const Project = require('../models/Project');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Configuração de limite de upload flexível (padrão 250MB para suportar áudios WAV e FLAC longos)
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 250;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isAudioMime = file.mimetype.startsWith('audio/');
    const isAudioExt = file.originalname.match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i);
    if (isAudioMime || isAudioExt) {
      cb(null, true);
    } else {
      cb(new Error('Formato inválido. Por favor envie um arquivo de áudio (MP3, WAV, FLAC, OGG ou M4A).'));
    }
  }
});

// Middleware com tratamento gracioso de erros do Multer (ex: LIMIT_FILE_SIZE)
const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: `O arquivo enviado excede o limite máximo de ${MAX_FILE_SIZE_MB}MB.`
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message || 'Erro no upload do arquivo.'
      });
    }
    next();
  });
};

const FASTAPI_URL = process.env.FASTAPI_ENGINE_URL || 'http://127.0.0.1:8000';

// Função auxiliar para sincronizar status de projetos pendentes
async function syncProjectStatus(project) {
  if (project.status === 'completed' || project.status === 'failed') {
    return project;
  }

  try {
    const statusRes = await fetch(`${FASTAPI_URL}/status/${project.fileId}`, { timeout: 3000 });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      if (statusData.status === 'completed') {
        project.status = 'completed';
        project.folder = statusData.folder;
        project.stems = statusData.stems;
        await project.save();

        // Deduzir 1 crédito de forma segura
        await User.findByIdAndUpdate(project.userId, { $inc: { credits: -1 } });
      } else if (statusData.status === 'failed') {
        project.status = 'failed';
        await project.save();
      }
    }
  } catch (err) {
    // Ignora erro momentâneo de conexão
  }

  return project;
}

// @route   GET /api/projects
// @desc    Get all projects for logged-in user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let projects = await Project.find({ userId: req.user._id }).sort({ createdAt: -1 });

    // Sincroniza qualquer projeto que ainda esteja com status pendente/processando
    const updatedProjects = await Promise.all(
      projects.map(proj => (proj.status === 'processing' || proj.status === 'queued') ? syncProjectStatus(proj) : proj)
    );

    res.json({ success: true, projects: updatedProjects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   GET /api/projects/:id
// @desc    Get single project and sync latest status
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    let project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    if (!project) {
      return res.status(404).json({ success: false, error: 'Projeto não encontrado.' });
    }

    if (project.status === 'processing' || project.status === 'queued') {
      project = await syncProjectStatus(project);
    }

    res.json({ success: true, project });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   POST /api/projects/upload
// @desc    Upload file, analyze and trigger async stems processing
// @access  Private
router.post('/upload', protect, handleUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Por favor, envie um arquivo de áudio.' });
    }

    // Validação de créditos do usuário
    const currentUser = await User.findById(req.user._id);
    if (!currentUser || currentUser.credits <= 0) {
      return res.status(402).json({
        success: false,
        error: 'Você não possui créditos suficientes para realizar a separação de áudio. Adquira mais créditos para continuar.'
      });
    }

    // 1. Enviar para o FastAPI /upload (BPM e Key são calculados imediatamente nos primeiros 30s)
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/mpeg' });
    formData.append('file', blob, req.file.originalname);

    const uploadRes = await fetch(`${FASTAPI_URL}/upload`, {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
      throw new Error('Falha no upload para o motor de áudio.');
    }

    const uploadData = await uploadRes.json();
    const { file_id, analysis } = uploadData;

    // 2. Criar Projeto no MongoDB com status 'processing'
    const project = await Project.create({
      userId: req.user._id,
      name: req.body.name || req.file.originalname.split('.').slice(0, -1).join('.'),
      originalFilename: req.file.originalname,
      fileId: file_id,
      status: 'processing',
      bpm: analysis?.bpm || 120,
      key: analysis?.key || 'C'
    });

    // 3. Disparar processamento assíncrono (Demucs) sem travar a requisição HTTP!
    fetch(`${FASTAPI_URL}/process-async/${file_id}`, { method: 'POST' })
      .catch(err => console.error('Aviso: Falha ao disparar processamento assíncrono:', err.message));

    // Retorna resposta imediata com status 202 Accepted
    res.status(202).json({
      success: true,
      project,
      message: 'Áudio recebido com sucesso. A separação das faixas está em andamento.'
    });

  } catch (error) {
    console.error('Erro no upload de projeto:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

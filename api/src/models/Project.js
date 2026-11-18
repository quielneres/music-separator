const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Por favor, informe o nome do projeto']
  },
  originalFilename: {
    type: String,
    required: true
  },
  fileId: {
    type: String,
    required: true
  },
  folder: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  bpm: {
    type: Number
  },
  key: {
    type: String
  },
  stems: [String],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Project', ProjectSchema);

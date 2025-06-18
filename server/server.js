require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const { OpenAI } = require('openai');
const mammoth = require('mammoth');

const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// In-memory storage for uploaded files (we immediately push to Azure)
// File upload config: 2 MB max, accept PDF, DOC, DOCX, TXT
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX or TXT allowed.'));
    }
  }
});

// OpenAI initialisation
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

// Azure Blob Storage initialisation
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
let containerClient;
if (AZURE_STORAGE_CONNECTION_STRING) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
  );
  containerClient = blobServiceClient.getContainerClient('resumes');
}

app.get('/', (_, res) => {
  res.send({ status: 'AI Career Coach backend is running' });
});

app.post('/api/analyze', upload.single('resume'), async (req, res) => {
  try {
    const { jobTitle } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No resume file uploaded.' });
    }

    // Upload to Azure Blob Storage (optional)
    const file = req.file;
    if (containerClient) {
      const blobName = `resume-${Date.now()}-${file.originalname}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(file.buffer, file.buffer.length);
    }

        // Extract text (simple read). For production, parse PDF/DOCX properly.
    let resumeText = file.buffer.toString('utf-8');
        // If DOCX, extract using mammoth
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const { value } = await mammoth.extractRawText({ buffer: file.buffer });
        resumeText = value;
      } catch (e) {
        console.error('DOCX parse error', e);
        resumeText = file.buffer.toString('utf-8');
      }
    }
    // Trim to reduce token cost
    if (resumeText.length > 3000) {
      resumeText = resumeText.slice(0, 3000);
    }

    // Build prompt
    const prompt = `You are a career coach. A user has this resume:\n${resumeText}\nThey are applying for the position: ${jobTitle}.\n\n1. Suggest improvements to the resume.\n2. Generate 5 tailored interview questions.\n3. Give actionable interview tips.\n4. Estimate a salary range based on U.S. market rates.`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      max_tokens: 500,
      top_p: 0.9,
      messages: [
        { role: 'system', content: 'You are a helpful career coach assistant. Be concise and focus on key improvements.' },
        { role: 'user', content: prompt },
      ],
    });

    const answer = completion.choices[0].message.content;
    res.json({ success: true, analysis: answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

app.listen(port, () => console.log(`Server listening on port ${port}`));

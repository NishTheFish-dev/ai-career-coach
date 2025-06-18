import React, { useState } from 'react';
import axios from 'axios';
import { Container, TextField, Button, Paper, Typography, CircularProgress, Box } from '@mui/material';

function App() {
  const [file, setFile] = useState(null);
  const [jobTitle, setJobTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !jobTitle) return;

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobTitle', jobTitle);

    setLoading(true);
    try {
      const { data } = await axios.post('http://localhost:5000/api/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data.analysis);
    } catch (err) {
      console.error(err);
      alert('Error analyzing resume');
    } finally {
      setLoading(false);
    }
  }
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>AI Career Coach</Typography>
        <form onSubmit={handleSubmit}>
          <Box mb={3}>
            <TextField fullWidth label="Desired Job Title" variant="outlined" value={jobTitle} onChange={(e)=>setJobTitle(e.target.value)} required />
          </Box>
          <Box mb={3}>
            <input type="file" accept=".pdf,.doc,.docx" onChange={(e)=>setFile(e.target.files[0])} required />
          </Box>
          <Button variant="contained" type="submit" disabled={loading}>{loading ? <CircularProgress size={24} /> : 'Analyze Resume'}</Button>
        </form>
        {result && (
          <Box mt={4}>
            <Typography variant="h5" gutterBottom>Analysis Results</Typography>
            <Paper variant="outlined" sx={{ p: 2, whiteSpace: 'pre-wrap' }}>{result}</Paper>
          </Box>
        )}
      </Paper>
    </Container>
  );
}

export default App;

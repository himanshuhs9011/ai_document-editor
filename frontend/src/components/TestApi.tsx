import React, { useState } from 'react';
import { API_BASE_URL } from '../config/api';

interface TestApiProps {}

const TestApi: React.FC<TestApiProps> = () => {
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [chatResult, setChatResult] = useState<any>(null);

  const testHealthCheck = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      const data = await response.json();
      setStatus(`Health Check: ${data.status} - ${data.message}`);
    } catch (error) {
      setStatus(`Error: ${error}`);
    }
    setLoading(false);
  };

  const testUpload = async () => {
    setLoading(true);
    try {
      // Create a simple test file
      const testContent = "This is a test document content";
      const blob = new Blob([testContent], { type: 'text/plain' });
      const file = new File([blob], 'test.pdf', { type: 'application/pdf' });
      
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      setUploadResult(data);
    } catch (error) {
      setUploadResult({ error: String(error) });
    }
    setLoading(false);
  };

  const testChat = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: "Hello, can you help me edit this document?",
          document_id: uploadResult?.document_id
        }),
      });
      
      const data = await response.json();
      setChatResult(data);
    } catch (error) {
      setChatResult({ error: String(error) });
    }
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">API Test Panel</h2>
      
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Health Check</h3>
          <button
            onClick={testHealthCheck}
            disabled={loading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Health Check'}
          </button>
          {status && (
            <div className="mt-2 p-2 bg-gray-100 rounded">
              <pre className="text-sm">{status}</pre>
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Upload Test</h3>
          <button
            onClick={testUpload}
            disabled={loading}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? 'Uploading...' : 'Test Upload'}
          </button>
          {uploadResult && (
            <div className="mt-2 p-2 bg-gray-100 rounded">
              <pre className="text-sm">{JSON.stringify(uploadResult, null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Chat Test</h3>
          <button
            onClick={testChat}
            disabled={loading || !uploadResult}
            className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
          >
            {loading ? 'Chatting...' : 'Test Chat'}
          </button>
          <p className="text-sm text-gray-600 mt-1">
            {!uploadResult ? 'Upload a document first' : 'Send a test message'}
          </p>
          {chatResult && (
            <div className="mt-2 p-2 bg-gray-100 rounded">
              <pre className="text-sm">{JSON.stringify(chatResult, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestApi;

import { ProcessingProgress } from './pdf-service';

// Use relative path for deployed app - this fixes the JSON parsing error
const API_URL = '';

export class APIService {
  static async mergePDFs(
    files: File[],
    onProgress?: (progress: ProcessingProgress) => void
  ): Promise<Response> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    // Add client metadata
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    
    const headers = new Headers({
      'X-Device-Type': 'desktop',
      'X-Client-Memory': '8192',
      'X-Total-Size': totalSize.toString(),
      'X-Priority': 'normal'
    });

    return fetch(`${API_URL}/api/merge`, {
      method: 'POST',
      body: formData,
      headers
    });
  }
} 
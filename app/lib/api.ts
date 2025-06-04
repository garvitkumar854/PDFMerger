// Add type definition for Chrome's Performance interface
interface ExtendedPerformance extends Performance {
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function mergePDFs(files: File[]) {
  try {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    // Safely access performance.memory
    const performance = window.performance as ExtendedPerformance;
    const memoryLimit = performance?.memory?.jsHeapSizeLimit;

    const response = await fetch(`${API_URL}/api/merge`, {
      method: 'POST',
      body: formData,
      headers: {
        'X-Device-Type': 'web',
        'X-Client-Memory': String(memoryLimit || 0),
        'X-Total-Size': String(files.reduce((acc, file) => acc + file.size, 0)),
      },
    });

    if (!response.ok) {
      throw new Error('Failed to merge PDFs');
    }

    return response.blob();
  } catch (error) {
    console.error('Error merging PDFs:', error);
    throw error;
  }
}

export async function checkHealth() {
  try {
    const response = await fetch(`${API_URL}/api/healthcheck`);
    return response.ok;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
} 
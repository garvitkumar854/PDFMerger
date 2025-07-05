# PDF Merger - Optimized PDF Processing Application

A high-performance, secure PDF merger application built with Next.js 14, featuring advanced optimizations, comprehensive error handling, and modern security practices.

## 🚀 Features

- **High Performance**: Optimized PDF processing with streaming and memory management
- **Security**: Comprehensive security headers, rate limiting, and input validation
- **Error Handling**: Advanced error tracking and user-friendly error messages
- **Authentication**: Clerk-based authentication system
- **Responsive Design**: Modern UI with Tailwind CSS and Radix UI
- **Real-time Progress**: Live progress tracking for PDF operations
- **File Validation**: Comprehensive PDF validation and size limits
- **Performance Monitoring**: Built-in performance tracking and optimization

## 🏗️ Architecture

### Frontend (Vercel)
- **Framework**: Next.js 14 with App Router
- **UI**: Tailwind CSS + Radix UI components
- **Authentication**: Clerk
- **State Management**: React hooks with optimizations
- **File Handling**: React Dropzone + DnD Kit for sorting
- **PDF Processing**: pdf-lib for client-side operations

### Backend (Render)
- **Framework**: Express.js (Node.js)
- **File Upload**: Multer with validation
- **PDF Processing**: pdf-lib with optimizations
- **Security**: Helmet, CORS, Rate limiting
- **Compression**: Gzip compression for responses

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 18.17.0 or higher
- npm or yarn
- Vercel account (for frontend deployment)
- Render account (for backend deployment)

### Frontend Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PDFMerger
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_key
   CLERK_SECRET_KEY=sk_test_your_clerk_secret
   RESEND_API_KEY=re_your_resend_key
   CONTACT_EMAIL=your-email@example.com
   ```

4. **Development**
   ```bash
   npm run dev
   ```

5. **Build for Production**
   ```bash
   npm run build
   npm start
   ```

### Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file in the backend directory:
   ```env
   NODE_ENV=production
   PORT=3001
   FRONTEND_URL=https://your-app.vercel.app
   ```

4. **Development**
   ```bash
   npm run dev
   ```

5. **Production**
   ```bash
   npm start
   ```

## 🚀 Deployment

### Frontend (Vercel)

1. **Connect to Vercel**
   - Push your code to GitHub
   - Connect your repository to Vercel
   - Set environment variables in Vercel dashboard

2. **Deploy**
   ```bash
   vercel --prod
   ```

### Backend (Render)

1. **Connect to Render**
   - Push your code to GitHub
   - Create a new Web Service in Render
   - Connect your repository
   - Set environment variables

2. **Deploy**
   - Render will automatically deploy on push to main branch

## 🔧 Configuration

### Environment Variables

#### Frontend (.env.local)
```env
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
RESEND_API_KEY=re_...
CONTACT_EMAIL=your-email@example.com
```

#### Backend (.env)
```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-app.vercel.app
```

### Performance Configuration

The application includes several performance optimizations:

- **Memory Management**: Automatic cleanup and garbage collection
- **Streaming**: Large file processing with streaming
- **Caching**: Intelligent caching for PDF validation
- **Rate Limiting**: Per-endpoint rate limiting
- **Compression**: Gzip compression for responses

### Security Features

- **Security Headers**: Comprehensive security headers
- **Input Validation**: Zod-based validation schemas
- **Rate Limiting**: IP-based rate limiting
- **CORS**: Configured CORS policies
- **File Validation**: PDF file type and size validation

## 📊 Performance Optimizations

### Frontend Optimizations
- **Bundle Splitting**: Optimized webpack configuration
- **Code Splitting**: Dynamic imports for better loading
- **Image Optimization**: Next.js image optimization
- **Caching**: Intelligent caching strategies
- **Memory Management**: Efficient memory usage

### Backend Optimizations
- **Streaming**: Large file processing with streams
- **Memory Monitoring**: Real-time memory usage tracking
- **Compression**: Response compression
- **Connection Pooling**: Optimized database connections
- **Error Handling**: Comprehensive error management

## 🔍 Monitoring & Analytics

### Performance Monitoring
The application includes built-in performance monitoring:

```typescript
import { performanceMonitor } from '@/lib/utils/performance';

// Monitor an operation
await performanceMonitor.measure('pdf-merge', async () => {
  // Your PDF processing code
});
```

### Error Tracking
Comprehensive error handling with context:

```typescript
import { ErrorHandler } from '@/lib/utils/error-handler';

ErrorHandler.handle(error, {
  component: 'PDFMerger',
  action: 'merge',
  userId: 'user123'
});
```

## 🧪 Testing

### Frontend Testing
```bash
npm run test
```

### Backend Testing
```bash
cd backend
npm test
```

## 📈 Performance Metrics

The application tracks various performance metrics:

- **Processing Time**: PDF merge duration
- **Memory Usage**: Peak memory consumption
- **Error Rates**: 4xx, 5xx error percentages
- **Throughput**: Requests per second
- **Compression Ratio**: File size reduction

## 🔒 Security Considerations

### File Upload Security
- File type validation (PDF only)
- File size limits (200MB per file, 200MB total)
- File count limits (20 files maximum)
- Malware scanning (optional)

### API Security
- Rate limiting per IP
- Input sanitization
- CORS configuration
- Security headers

### Authentication Security
- Clerk-based authentication
- Session management
- CSRF protection

## 🚨 Error Handling

The application implements comprehensive error handling:

1. **Client-side Validation**: Real-time file validation
2. **Server-side Validation**: Comprehensive request validation
3. **Error Tracking**: Detailed error logging with context
4. **User Feedback**: User-friendly error messages
5. **Recovery**: Automatic retry mechanisms

## 📝 API Documentation

### Merge PDF Endpoint
```
POST /api/merge
Content-Type: multipart/form-data

Files: PDF files (2-20 files, 200MB total limit)
```

### Contact Form Endpoint
```
POST /api/contact
Content-Type: application/json

{
  "name": "string",
  "email": "string",
  "subject": "string",
  "message": "string"
}
```

### Health Check Endpoint
```
GET /api/healthcheck
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, please contact:
- Email: support@pdfmerger.com
- Issues: GitHub Issues
- Documentation: [Wiki](link-to-wiki)

## 🔄 Changelog

### v1.0.0 (Latest)
- Initial release with comprehensive optimizations
- Advanced error handling and monitoring
- Security enhancements
- Performance improvements
- Modern UI/UX design 
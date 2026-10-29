import { apiApp } from '../src/server/apiApp.ts';

// Export Express app directly for Vercel Serverless Functions
// Vercel's Node runtime natively attaches to Express request listener
export default apiApp;

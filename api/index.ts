import { apiApp } from '../src/server/apiApp.ts';

// Vercel Serverless Function entry point for Express
export default function handler(req: any, res: any) {
  return apiApp(req, res);
}

// Disable Vercel's built-in 1MB body parser so Express parses the body up to 60MB
export const config = {
  api: {
    bodyParser: false,
  },
};


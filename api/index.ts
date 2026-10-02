import { apiApp } from '../src/server/apiApp.ts';

// Vercel Serverless Function entry point for Express
export default function handler(req: any, res: any) {
  return apiApp(req, res);
}
